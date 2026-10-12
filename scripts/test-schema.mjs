/**
 * Every migration, against a real Postgres, with no credentials.
 *
 *   npm run test:schema
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Every other suite in this repo needs the production database: test:rls needs
 * real JWTs, test:parity and the loops need SUPABASE_ACCESS_TOKEN. That is the
 * right shape for testing POLICIES, which only exist in Supabase — but it left
 * a gap underneath them. A migration could be syntactically wrong, reference a
 * column that does not exist, or fail on its own constraint, and the first
 * place anyone would find out was `npm run db:apply` against the real thing.
 *
 * `supabase db reset` closes that gap and needs Docker. This closes it with a
 * WASM build of Postgres 18 from npm, which needs nothing at all — so it runs
 * on any machine and in CI on every push, next to check:launch.
 *
 * It builds the schema from zero, in order, each file in its own transaction,
 * exactly the way scripts/apply-migrations.mjs does it. Then it drives the
 * parts that are pure database — the item-code encoding, the delivery rule, the
 * renumber, the whole order loop — and checks the SQL against its TypeScript
 * twin in packages/core.
 *
 * ── What it does NOT prove ────────────────────────────────────────────────
 *
 * Nothing about RLS as a real signed-in user experiences it. This runs as the
 * owner, which bypasses row-level security; policies are proven by
 * packages/db/tests/rls.test.mjs through actual JWTs. This suite proves the
 * schema is buildable and the rules inside it are right. The two are different
 * questions and deliberately have different suites.
 *
 * The one substitution is `create extension unaccent`, which PGlite cannot do
 * and the shim provides as a function. Nothing else in any migration is changed.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planBalance,
  paymentAmount,
  checkInvoiceTotals,
  deliveryFeeCents,
  formatItemCode,
  hireFeeCents,
  normaliseItemCode,
  itemSegments,
  validSegments,
} from "@takemore/core";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "..", "supabase", "migrations");
const SHIM = join(here, "..", "supabase", "tests", "supabase-shim.sql");

let passed = 0;
const failures = [];
const ok = (n, d) => { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${n}${d ? `  (${d})` : ""}`); };
const fail = (n, d) => { failures.push(n); console.log(`  \x1b[31mFAIL\x1b[0m  ${n}\n        ${d}`); };
const check = (n, cond, d) => (cond ? ok(n, d) : fail(n, d));
const num = (v) => Number(v ?? 0);

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

const read = (file) =>
  readFileSync(join(MIGRATIONS, file), "utf8").replace(
    /create extension if not exists unaccent with schema extensions;/,
    "-- [test:schema] unaccent is provided by supabase/tests/supabase-shim.sql"
  );

/** Build the schema from nothing, pausing at `before` to seed. */
async function build({ before, seed } = {}) {
  const db = await PGlite.create();
  await db.exec(readFileSync(SHIM, "utf8"));
  for (const file of files) {
    if (before && file === before && seed) await seed(db);
    try {
      await db.exec(`begin;\n${read(file)}\n;commit;`);
    } catch (error) {
      await db.exec("rollback").catch(() => {});
      throw new Error(`${file}\n        ${String(error.message).split("\n")[0]}`);
    }
  }
  return db;
}

const one = async (db, sql) => (await db.query(sql)).rows[0];
const all = async (db, sql) => (await db.query(sql)).rows;
const refuses = async (db, sql) => {
  try { await db.exec(sql); return false; } catch { return true; }
};

/**
 * Become a signed-in staff member.
 *
 * app.staff_role() reads staff_profiles by auth.uid(), and the shim's auth.uid()
 * reads `request.jwt.claim.sub` — so setting that GUC is what a JWT looks like
 * from inside a policy. `approved_at` is not optional: 20260808130000 added
 * `and approved_at is not null`, so an unapproved account has no role at all
 * and every RPC built on it refuses.
 */
async function signIn(db, role = "owner") {
  const { id } = await one(db, "insert into auth.users (email) values ('harness@test') returning id");
  await db.exec(
    `insert into public.staff_profiles (user_id, full_name, role, active, approved_at)
     values ('${id}', 'Harness', '${role}', true, now())`
  );
  await db.exec(`set request.jwt.claim.sub = '${id}'`);
  return id;
}

// ---------------------------------------------------------------------------
// 1. Does the schema build at all?
// ---------------------------------------------------------------------------
console.log(`\nBUILDING THE SCHEMA FROM ZERO  (${files.length} migrations)`);
let db;
try {
  db = await build();
  ok(`all ${files.length} migrations applied, each in its own transaction`);
} catch (error) {
  fail("the schema builds from zero", error.message);
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. The rules, against their TypeScript twins
// ---------------------------------------------------------------------------
console.log("\nITEM CODES  (SQL vs packages/core)");
for (const n of [1, 22, 998, 999, 1000, 1001, 1998, 1999, 21977, 21978, 21979]) {
  const { c } = await one(db, `select app.encode_item_code(${n}) as c`);
  check(`encode(${n}) = ${c ?? "null"}`, c === formatItemCode(n), `sql=${c} ts=${formatItemCode(n)}`);
}

console.log("\nA CODE TYPED BY HAND  (SQL vs packages/core)");
for (const raw of ["A042", "a042", "a42", "A 042", " a4 2 ", "A1", "Z999",
                   "I042", "O042", "042", "A0421", "RG-4TX", "TME-2608-0417", ""]) {
  const { c } = await one(db, `select app.normalise_item_code('${raw}') as c`);
  check(`"${raw}" -> ${c ?? "not a code"}`, c === normaliseItemCode(raw), `sql=${c} ts=${normaliseItemCode(raw)}`);
}

console.log("\nDELIVERY FEE  (SQL vs packages/core)");
for (const km of [0, 5, 9.9, 10, 10.1, 11, 20.1, 23.4, 25, 99.9, 100, 250]) {
  const { f } = await one(db, `select public.delivery_fee_cents(${km}::numeric) as f`);
  check(`${km} km = R${num(f) / 100}`, num(f) === deliveryFeeCents(km), `sql=${f} ts=${deliveryFeeCents(km)}`);
}
// Asserted as itself and not only as a match: two implementations can agree and
// both be wrong. This is the number the owner specified.
check("100 km is R1 150, as specified", deliveryFeeCents(100) === 115_000);

// ---------------------------------------------------------------------------
// 3. The renumber, on a database that already had the old codes
// ---------------------------------------------------------------------------
console.log("\nRENUMBERING  (machines created under the old scheme)");
const renumbered = await build({
  before: "20260819090000_short_item_codes.sql",
  seed: async (d) => {
    const { id: cat } = await one(d, "select id from public.categories limit 1");
    for (let i = 1; i <= 5; i++) {
      await d.exec(`insert into public.items (title, category_id, condition_grade, list_price_cents, created_at)
                    values ('Legacy ${i}', '${cat}', 'B', ${i * 100000}, now() - interval '${10 - i} days')`);
    }
    // One soft-deleted. It still holds a code against the unique index, and
    // leaving it behind would fail items_sku_shape — and would free a dead
    // machine's code to be reissued to a live one.
    await d.exec("update public.items set deleted_at = now() where title = 'Legacy 3'");
    const rows = await all(d, "select sku from public.items");
    check("the fixtures got old-format codes", rows.every((r) => /^TME-\d{4}-\d{4,}$/.test(r.sku)));
  },
});

let rows = await all(renumbered, "select title, sku from public.items order by created_at, id");
check("every machine was renumbered, oldest first",
      rows.map((r) => r.sku).join(" ") === "A001 A002 A003 A004 A005",
      rows.map((r) => `${r.title}=${r.sku}`).join(" "));
check("the soft-deleted one was renumbered too", rows.find((r) => r.title === "Legacy 3")?.sku === "A003");

rows = await all(renumbered, "select old_sku, new_sku from app.sku_renumber_2026 order by new_sku");
check("the old-to-new map was kept", rows.length === 5 && /^TME-/.test(rows[0].old_sku),
      `${rows.length} rows, ${rows[0]?.old_sku} -> ${rows[0]?.new_sku}`);

const { id: cat } = await one(renumbered, "select id from public.categories limit 1");
let r = await one(renumbered, `insert into public.items (title, category_id) values ('Next', '${cat}') returning sku`);
check("the next intake continues the sequence rather than colliding", r.sku === "A006", r.sku);

await renumbered.exec("update public.items set sku = 'B123' where title = 'Next'");
r = await one(renumbered, "select sku from public.items where title = 'Next'");
check("a code cannot be edited after it is issued", r.sku === "A006", r.sku);

check("items_sku_shape refuses anything that is not a code",
      await refuses(renumbered, "insert into public.items (title, sku) values ('Bad', 'tme-1')"));
check("and refuses a letter that is not in the alphabet",
      await refuses(renumbered, "insert into public.items (title, sku) values ('Bad', 'I042')"));

// ---------------------------------------------------------------------------
// 4. The order loop
// ---------------------------------------------------------------------------
console.log("\nA SALE, END TO END");
await signIn(db, "owner");

const { id: category } = await one(db, "select id from public.categories limit 1");
const make = async (title, list, auction, workshop) => {
  const row = await one(db, `
    insert into public.items (title, category_id, condition_grade, list_price_cents,
                              retail_price_cents, description, status)
    values ('${title}', '${category}', 'B', ${list}, ${list * 2},
            'A machine that exists only for this suite, described at some length.', 'listed')
    returning id, sku`);
  await db.exec(`insert into public.item_costs (item_id, kind, amount_cents)
                 values ('${row.id}','auction',${auction}),('${row.id}','workshop',${workshop})`);
  await db.exec(`insert into public.item_media (item_id, kind, storage_path, position, is_placeholder)
                 values ('${row.id}','photo','t/${row.id}.jpg',0,false)`);
  // Published on purpose: "adding it takes it off the website" is only an
  // assertion if it was on it.
  await db.exec(`update public.items set published_at = now() where id = '${row.id}'`);
  return row;
};

const big = await make("Big", 3_000_000, 1_000_000, 200_000);
const small = await make("Small", 2_000_000, 500_000, 100_000);
const lead = await one(db, `insert into public.leads (full_name, email, source)
                            values ('Buyer', 'b@schema.test', 'walk_in') returning id, status`);
check("the buyer starts as a lead, not a customer", lead.status === "new", lead.status);

const revenueBefore = num((await one(db, `select coalesce(sum(revenue_cents),0) r from public.money_by_month
                                          where month = date_trunc('month', now())::date`)).r);

const order = await one(db, "insert into public.orders (status,sale_plan) values ('draft','immediate') returning id, code");
check("an order gets a readable number", /^ORD-\d{4}$/.test(order.code), order.code);

// Typed the way somebody at a counter types it: lower case, unpadded.
const typed = big.sku[0].toLowerCase() + Number(big.sku.slice(1));
await db.exec(`select public.add_order_line('${order.id}', '${typed}')`);
await db.exec(`select public.add_order_line('${order.id}', '${small.sku}')`);

r = await one(db, `select count(*) c, sum(list_price_cents) t from public.order_lines where order_id='${order.id}'`);
check(`both machines went on, one of them typed as "${typed}"`,
      num(r.c) === 2 && num(r.t) === 5_000_000, `${r.c} lines, R${num(r.t) / 100}`);

rows = await all(db, `select status, published_at, website_availability from public.items where id in ('${big.id}','${small.id}')`);
check("adding a published machine holds it and shows Reserved on the website",
      rows.every((x) => x.status === "reserved" && x.published_at && x.website_availability === "reserved"));

check("the same machine cannot go on twice",
      await refuses(db, `select public.add_order_line('${order.id}', '${big.sku}')`));
check("an order cannot be paid before somebody is on it",
      await refuses(db, `select public.confirm_order_paid('${order.id}', 4500000, 'card_machine', null)`));

await db.exec(`update public.orders set lead_id='${lead.id}' where id='${order.id}'`);
await db.exec(`update public.orders set delivery=true, delivery_address='1 Test Rd',
               delivery_km=100, delivery_km_source='manual' where id='${order.id}'`);
r = await one(db, `select delivery_fee_cents f from public.orders where id='${order.id}'`);
check("100 km is R1 150, computed by the trigger and not by the caller", num(r.f) === 115_000, `R${num(r.f) / 100}`);

await db.exec(`update public.orders set delivery_fee_cents = 1 where id='${order.id}'`);
r = await one(db, `select delivery_fee_cents f from public.orders where id='${order.id}'`);
check("a fee typed in by hand is overwritten by the rule", num(r.f) === 115_000, `R${num(r.f) / 100}`);
check("delivery without an address is refused",
      await refuses(db, `update public.orders set delivery_address='' where id='${order.id}'`));

// Asking R50 000, agreed R45 000.
await db.exec(`select public.confirm_order_paid('${order.id}', 4500000, 'card_machine', 'SLIP-1')`);

rows = await all(db, `select i.status, i.sale_price_cents s, i.sold_at, i.published_at, i.website_availability, l.sold_price_cents ls
                      from public.order_lines l join public.items i on i.id=l.item_id
                      where l.order_id='${order.id}' order by l.position`);
check("the discount is split pro-rata by asking price",
      num(rows[0].s) === 2_700_000 && num(rows[1].s) === 1_800_000,
      `R${num(rows[0].s) / 100} + R${num(rows[1].s) / 100}`);
check("and the parts sum to the whole, exactly", num(rows[0].s) + num(rows[1].s) === 4_500_000);
check("the line remembers the same figure the machine does", rows.every((x) => num(x.s) === num(x.ls)));
check("both machines are sold, dated, and off the website",
      rows.every((x) => x.status === "sold" && x.sold_at && x.published_at === null));

r = await one(db, `select status, charged_total_cents c from public.orders where id='${order.id}'`);
check("the customer pays the goods plus the delivery",
      r.status === "paid" && num(r.c) === 4_615_000, `R${num(r.c) / 100}`);

/**
 * The assertion this whole feature exists for.
 *
 * Nothing in the ops app ever wrote items.sale_price_cents, and every money
 * view computes revenue as coalesce(sale_price_cents, list_price_cents) — so
 * the dashboard reported ASKING prices and called them revenue. If this moves
 * by R50 000 rather than R45 000, the discount is still invisible.
 */
const revenueAfter = num((await one(db, `select coalesce(sum(revenue_cents),0) r from public.money_by_month
                                         where month = date_trunc('month', now())::date`)).r);
check("the reports moved by what was TAKEN, not by what was asked",
      revenueAfter - revenueBefore === 4_500_000,
      revenueAfter - revenueBefore === 5_000_000
        ? "moved by R50 000 — the asking price. sale_price_cents is not reaching the views."
        : `R${(revenueAfter - revenueBefore) / 100}`);

r = await one(db, `select cost_total_cents c, margin_cents m from public.order_economics where order_id='${order.id}'`);
check("the cost floor is the two ledgers, read live", num(r.c) === 1_800_000, `R${num(r.c) / 100}`);
check("margin is on the machines and excludes the delivery", num(r.m) === 2_700_000, `R${num(r.m) / 100}`);

r = await one(db, `select status from public.leads where id='${lead.id}'`);
check("the buyer became a customer", r.status === "customer", r.status);
r = await one(db, `select count(*) c from public.lead_events where lead_id='${lead.id}' and kind='purchased'`);
check("one 'purchased' entry for the order, not one per machine", num(r.c) === 1);
r = await one(db, "select summary from public.activity_log where entity='order' and action='status_changed'");
check("the activity log records the sale without a cost in it",
      /paid/.test(r.summary) && !/1800000|18 000/.test(r.summary), r.summary);

// ---------------------------------------------------------------------------
// 5. The document the customer walks out with
// ---------------------------------------------------------------------------
console.log("\nA DOCUMENT TO HAND THE CUSTOMER");

/**
 * The issuing business, as the ops app assembles it from its environment.
 *
 * Not read from a table on purpose — this repository is public and a bank
 * account number does not go in it. The registration number here is a
 * well-formed CIPC one so the shape check passes; whether it is the real one is
 * a question only the certificate can answer, which is why the ops app checks
 * the environment and this checks the schema.
 */
const issuer = (over = {}) =>
  JSON.stringify({
    legal_name: "Harness Equipment (Pty) Ltd",
    registration_number: "2026/328785/07",
    address: "1 Test Road, Cape Town",
    phone: "021 555 0134",
    email: "harness@test",
    bank: { name: "Test Bank", account_name: "Harness", type: "Current", number: "0000000000" },
    ...over,
  }).replace(/'/g, "''");

const issue = (kind, over) =>
  `select public.issue_invoice('${order.id}', '${kind}', '${issuer(over)}'::jsonb)`;

check("an invoice will not issue with the business details unconfigured",
      await refuses(db, issue("invoice", { registration_number: "" })));
/**
 * The one that would actually have shipped. apps/web/src/data/launch.ts carries
 * 0000/000000/00 as the frozen placeholder for the registration number, and an
 * invoice going out with it is a Companies Act s32 problem rather than a typo.
 */
check("nor with launch.ts's placeholder registration number",
      await refuses(db, issue("invoice", { registration_number: "0000/000000/00" })));
check("nor with a half-typed one",
      await refuses(db, issue("invoice", { registration_number: "2026/3287/07" })));
/**
 * The tripwire. Take More is not a registered VAT vendor, and heading a
 * document "tax invoice" without being one is an offence under the VAT Act
 * rather than a formatting choice. The day somebody sets a VAT number this must
 * stop them and make VAT a piece of work.
 */
check("and never with a VAT number, because this cannot issue a tax invoice",
      await refuses(db, issue("invoice", { vat_number: "4700324959" })));
check("a proforma cannot be issued for money already taken",
      await refuses(db, issue("proforma")));

r = await one(db, issue("invoice"));
let doc = r.issue_invoice;
check("the invoice run continues the spreadsheet rather than restarting it",
      doc.number === "INV-0015", doc.number);

let stored = await one(db, `select document d, total_cents t from public.order_invoices
                            where number = '${doc.number}'`);
check("the invoice asks for exactly what the order says the customer pays",
      num(stored.t) === 4_615_000 && num(stored.t) === num(
        (await one(db, `select charged_total_cents c from public.orders where id='${order.id}'`)).c
      ), `R${num(stored.t) / 100}`);

/**
 * The decision that shapes the whole document: the customer sees the ASKING
 * price of each machine and one discount line, not each machine's pro-rata
 * share of the discounted total. They negotiated "R45 000 for the pair"; they
 * never agreed to R27 000 and R18 000, and printing those makes the saving they
 * argued for vanish into two numbers they have not seen.
 */
check("each machine is billed at what it was asked for, not at its share of the discount",
      stored.d.lines.map((l) => l.total_cents).join() === "3000000,2000000",
      stored.d.lines.map((l) => l.total_cents).join());
check("and the machine's own code is on the line, so it can be identified later",
      stored.d.lines.every((l) => /^A\d{3}$/.test(l.code)),
      stored.d.lines.map((l) => l.code).join());
check("subtotal, discount and delivery add up to the total, to the cent",
      stored.d.subtotal_cents + stored.d.adjustment_cents + stored.d.delivery.fee_cents
        === stored.d.total_cents,
      `${stored.d.subtotal_cents} ${stored.d.adjustment_cents} ${stored.d.delivery.fee_cents}`);
check("the discount is shown as one line, and it is the one that was given",
      stored.d.adjustment_cents === -500_000, `${stored.d.adjustment_cents}`);
check("a paid invoice records how the money arrived",
      stored.d.payment?.method === "card_machine" && stored.d.payment?.reference === "SLIP-1");
check("and carries the issuing business's own registration number",
      stored.d.issuer.registration_number === "2026/328785/07");

/**
 * The renderer's own guard, run against what SQL actually produced.
 *
 * checkInvoiceTotals() is what stands between a document that does not add up
 * and a PDF — renderInvoicePdf() refuses rather than draws when it complains.
 * Pointing it at a real issued document is what pins the TypeScript guard to
 * the SQL that builds the thing it guards, in the one suite that needs no
 * credentials. Same idea as the delivery-fee and item-code twins above.
 */
check("the renderer's own arithmetic guard passes the document SQL built",
      checkInvoiceTotals(stored.d) === null, checkInvoiceTotals(stored.d) ?? "");
check("and it catches a document that does not add up",
      checkInvoiceTotals({ ...stored.d, total_cents: stored.d.total_cents + 1 }) !== null);

/**
 * Two taps on "Make the invoice" — a double-tap on a phone, a slow connection —
 * used to mint INV-0015 AND INV-0016 for the same sale, identical to the cent.
 * Nothing on the order has changed, so the second call must hand back the
 * first document and spend no number.
 */
r = await one(db, issue("invoice"));
check("issuing the same invoice again returns the document already issued, and mints no number",
      r.issue_invoice.number === doc.number && r.issue_invoice.reused === true && r.issue_invoice.supersedes === null,
      JSON.stringify(r.issue_invoice));
r = await one(db, `select count(*) c from public.order_invoices where order_id='${order.id}'`);
check("so there is still exactly one document on the record", num(r.c) === 1, `${r.c}`);
r = await one(db, "select last_value v, is_called c from app.invoice_number_seq");
check("and the invoice sequence did not move", num(r.v) === 15, `${r.v}`);

/**
 * The audit's critical one. removeLine() used to delete through RLS, match no
 * rows on a paid order, and then un-sell the machine anyway. The RPC refuses
 * in words and touches nothing.
 */
check("a machine cannot be taken off a PAID order",
      await refuses(db, `select public.remove_order_line('${order.id}', '${big.id}')`));
r = await one(db, `select i.status, (select count(*) from public.order_lines where order_id='${order.id}') c
                   from public.items i where i.id='${big.id}'`);
check("and it is still sold, still on the order", r.status === "sold" && num(r.c) === 2, `${r.status}, ${r.c} lines`);

/**
 * The reason this is a stored document and not a view over `orders`.
 *
 * Rename the machine after the customer has walked out with the paper. A
 * re-rendered invoice would now describe a machine by a name that was never on
 * their copy — silently, and visibly only to them.
 */
await db.exec(`update public.items set title = 'Renamed After The Fact' where id = '${big.id}'`);
stored = await one(db, `select document d from public.order_invoices where number = '${doc.number}'`);
check("renaming the machine afterwards does not rewrite the invoice already handed over",
      !JSON.stringify(stored.d).includes("Renamed After The Fact"),
      stored.d.lines.map((l) => l.description).join(" | "));

console.log("\nCORRECTING IT, AND CANCELLING IT");
check("a paid order cannot be edited back into a draft",
      await refuses(db, `update public.orders set status='draft' where id='${order.id}'`));

await db.exec(`select public.reopen_order('${order.id}')`);
rows = await all(db, `select i.status, i.sale_price_cents s from public.order_lines l
                      join public.items i on i.id=l.item_id where l.order_id='${order.id}'`);
check("reopening un-sells the machines and the achieved price goes with the sale",
      rows.every((x) => x.status === "reserved" && x.s === null));
r = await one(db, `select status, paid_at, sold_total_cents t from public.orders where id='${order.id}'`);
check("and the order is open again carrying no payment", r.status === "draft" && !r.paid_at && r.t === null);

/**
 * The proforma, on an order that is open again and carrying no agreed figure.
 *
 * This is the shape somebody paying by EFT actually needs — a document with the
 * banking details on it to pay AGAINST — and it is the branch where
 * sold_total_cents is null, so the asking price is what gets asked for. Its own
 * number series, so a gap in the invoice run is never explained as "that one
 * was a quote".
 */
r = await one(db, issue("invoice"));
const correctedBeforePayment = await one(db, `select document d from public.order_invoices where id='${r.issue_invoice.id}'`);
check("a correction retains the actual payment and shows the revised balance",
  correctedBeforePayment.d.received_cents === 4_615_000 && correctedBeforePayment.d.balance_cents === 500_000);
r = await one(db, issue("proforma"));
check("a proforma gets its own series, not a number out of the invoice run",
      r.issue_invoice.number === "PRO-0001", r.issue_invoice.number);
check("and with nothing agreed yet it asks for the asking price plus the delivery",
      num(r.issue_invoice.total_cents) === 5_115_000, `R${num(r.issue_invoice.total_cents) / 100}`);

await db.exec(`select public.confirm_order_paid('${order.id}', 4500000, 'bank_transfer', 'EFT-9')`);

/**
 * Correcting a document that has left the building is a second document that
 * says so, never an edit to the first. Same posture as the note reopen_order()
 * writes onto the customer's timeline.
 */
r = await one(db, issue("invoice"));
check("a corrected sale has already issued a fresh invoice automatically",
      r.issue_invoice.number !== doc.number && r.issue_invoice.reused === true, r.issue_invoice.number);
const revisedRow = await one(db, `select supersedes,document from public.order_invoices where id='${r.issue_invoice.id}'`);
check("and the new one records which document it replaces", revisedRow.supersedes !== null);
r = await one(db, `select count(*) c from public.order_invoices where order_id='${order.id}'`);
const documentsBeforeCancellation = num(r.c);
check("original, corrected and proforma documents are all still on the record", documentsBeforeCancellation === 4, `${r.c}`);

await db.exec(`select public.void_order('${order.id}', 'Finance fell through')`);

check("a cancelled sale has nothing left to invoice", await refuses(db, issue("invoice")));
r = await one(db, `select count(*) c from public.order_invoices where order_id='${order.id}'`);
check("but the documents already issued survive the cancellation", num(r.c) === documentsBeforeCancellation, `${r.c}`);

rows = await all(db, `select i.status, i.sale_price_cents s, i.sold_at from public.order_lines l
                      join public.items i on i.id=l.item_id where l.order_id='${order.id}'`);
check("cancelling puts the machines back and clears what they sold for",
      rows.every((x) => x.status === "listed" && x.s === null && x.sold_at === null));

const revenueEnd = num((await one(db, `select coalesce(sum(revenue_cents),0) r from public.money_by_month
                                       where month = date_trunc('month', now())::date`)).r);
check("and the reports are back where they started", revenueEnd === revenueBefore,
      `R${revenueEnd / 100} vs R${revenueBefore / 100}`);

r = await one(db, `select count(*) c from public.lead_events where lead_id='${lead.id}' and kind='purchased'`);
check("both 'purchased' entries survive — a timeline is what happened", num(r.c) === 2, `${r.c}`);
rows = await all(db, `select body from public.lead_events where lead_id='${lead.id}' and kind='note'`);
check("reopening explained itself, so two purchases do not read as two sales",
      rows.some((x) => /reopened to correct/.test(x.body)), rows.map((x) => x.body).join(" | "));
check("and the cancellation gave its reason",
      rows.some((x) => /Finance fell through/.test(x.body)));

console.log("\nA MACHINE FROM THE WORKSHOP");
/**
 * The one that was quietly wrong until 20260819110100.
 *
 * A machine still in pieces on the bench can be sold — somebody sees it and
 * wants it, and refusing that would be the software disagreeing with the
 * business. What must not happen is the machine coming back marked "For sale"
 * when the sale falls through, because then the board is telling the workshop
 * something the workshop knows to be untrue.
 */
const bench = await one(db, `
  insert into public.items (title, category_id, condition_grade, list_price_cents,
                            retail_price_cents, description, status)
  values ('Half stripped', '${category}', 'C', 800000, 1600000,
          'A machine that is in the workshop, described at some length here.', 'refurbishing')
  returning id, sku`);

const bench_order = await one(db, "insert into public.orders (status,sale_plan) values ('draft','immediate') returning id, code");
await db.exec(`select public.add_order_line('${bench_order.id}', '${bench.sku}')`);

r = await one(db, `select status from public.items where id='${bench.id}'`);
check("a machine in the workshop can still be put on an order", r.status === "reserved", r.status);
r = await one(db, `select held_from_status h from public.order_lines where item_id='${bench.id}'`);
check("and the line writes down where it came from", r.h === "refurbishing", r.h);

await db.exec(`select public.void_order('${bench_order.id}', 'They went away to think about it')`);
r = await one(db, `select status from public.items where id='${bench.id}'`);
check("cancelling puts it back IN THE WORKSHOP, not on sale", r.status === "refurbishing", r.status);

/** A line written before the column existed still has to be safe to cancel. */
const legacy = await make("Legacy", 500000, 100000, 0);
const legacy_order = await one(db, "insert into public.orders (status,sale_plan) values ('draft','immediate') returning id");
await db.exec(`select public.add_order_line('${legacy_order.id}', '${legacy.sku}')`);
await db.exec(`update public.order_lines set held_from_status = null where item_id='${legacy.id}'`);
await db.exec(`select public.void_order('${legacy_order.id}', 'Nobody remembers')`);
r = await one(db, `select status from public.items where id='${legacy.id}'`);
check("a line that remembers nothing falls back to For sale, as it always did",
      r.status === "listed", r.status);

console.log("\nTAKING A MACHINE OFF");
{
  const off = await make("Comes off again", 700_000, 200_000, 0);
  const draft = await one(db, "insert into public.orders (status,sale_plan) values ('draft','immediate') returning id");
  await db.exec(`select public.add_order_line('${draft.id}', '${off.sku}')`);
  r = await one(db, `select public.remove_order_line('${draft.id}', '${off.id}') x`);
  check("taking a machine off an open order says where it went", r.x.status === "listed" && r.x.sku === off.sku, JSON.stringify(r.x));
  r = await one(db, `select i.status, (select count(*) from public.order_lines where order_id='${draft.id}') c
                     from public.items i where i.id='${off.id}'`);
  check("the line is gone and the machine is back on the shelf", r.status === "listed" && num(r.c) === 0, `${r.status}, ${r.c} lines`);
  check("taking it off twice is refused rather than ignored",
        await refuses(db, `select public.remove_order_line('${draft.id}', '${off.id}')`));

  /**
   * Sold by hand while it sat on the order. Not on any other order, so the
   * clash check never saw it; confirm_order_paid() would have re-sold it.
   */
  await db.exec(`select public.add_order_line('${draft.id}', '${off.sku}')`);
  await db.exec(`update public.orders set lead_id='${lead.id}' where id='${draft.id}'`);
  await db.exec(`update public.items set status='sold' where id='${off.id}'`);
  let refusal = "";
  try { await db.exec(`select public.confirm_order_paid('${draft.id}', 600000, 'card_machine', null)`); }
  catch (error) { refusal = String(error.message); }
  check("a sale refuses a machine that was sold by hand while it sat on the order, and names it",
        refusal.includes(off.sku) && /sold/.test(refusal), refusal);
  r = await one(db, `select status from public.orders where id='${draft.id}'`);
  check("and the order stays open", r.status === "draft", r.status);
  r = await one(db, `select public.remove_order_line('${draft.id}', '${off.id}') x`);
  check("taking the sold machine off leaves it sold rather than un-selling it", r.x.status === "sold", JSON.stringify(r.x));
}

console.log("\nMONEY IN WORDS");
for (const [cents, text] of [[40000, "R400"], [120240, "R1202.40"], [4938, "R49.38"], [5, "R0.05"], [0, "R0"]]) {
  r = await one(db, `select app.rands_text(${cents}) t`);
  check(`${cents} cents reads ${text}`, r.t === text, r.t);
}

console.log("\nTHE WORKSHOP IS NOT A SHOPFRONT");
/**
 * 20260820100000. A machine on the bench has no settled price — the repair is
 * not costed until it is finished — so it does not go on the website, and one
 * that goes BACK to the bench comes off it.
 */
const bench2 = await make("Back to the bench", 900_000, 300_000, 0);
r = await one(db, `select published_at p from public.items where id='${bench2.id}'`);
check("a machine for sale is on the website", r.p !== null);

await db.exec(`update public.items set status = 'refurbishing' where id='${bench2.id}'`);
r = await one(db, `select status, published_at p from public.items where id='${bench2.id}'`);
check("sending it back to the workshop takes it off the website",
      r.status === "refurbishing" && r.p === null, `${r.status}, published_at=${r.p}`);

check("and it cannot be put back up while it is in there",
      await refuses(db, `update public.items set published_at = now() where id='${bench2.id}'`));

await db.exec(`update public.items set status = 'listed' where id='${bench2.id}'`);
await db.exec(`update public.items set published_at = now() where id='${bench2.id}'`);
r = await one(db, `select published_at p from public.items where id='${bench2.id}'`);
check("tapping For sale once it is priced puts it back on the same page", r.p !== null);

// ---------------------------------------------------------------------------
// A hire, end to end
// ---------------------------------------------------------------------------
console.log("\nA HIRE, END TO END");

/**
 * The rule, pinned to its TypeScript twin over the cases that matter: the
 * worked example from the brief, the boundary either side of day 7, a price
 * that does not divide cleanly, and a machine with no price at all.
 */
for (const [list, days] of [
  [1_000_000, 1], [1_000_000, 3], [1_000_000, 7], [1_000_000, 8], [1_000_000, 10],
  [1_000_000, 30], [1_234_500, 10], [1_234_567, 9], [0, 10], [99, 8],
]) {
  r = await one(db, `select public.hire_fee_cents(${list}, ${days}) f`);
  check(`hire fee for R${list / 100} × ${days} days matches hireFeeCents()`,
        num(r.f) === hireFeeCents(list, days), `${r.f} vs ${hireFeeCents(list, days)}`);
}
r = await one(db, "select public.hire_fee_cents(1000000, 10) f");
check("R10 000 for 10 days is R3 820, as specified", num(r.f) === 382_000, `R${num(r.f) / 100}`);
r = await one(db, "select app.hire_days('2026-09-01', '2026-09-01') one, app.hire_days('2026-09-01', '2026-09-10') ten");
check("out and back on the same day is one day, not zero", num(r.one) === 1 && num(r.ten) === 10);

const tenK = await make("Ten thousand", 1_000_000, 400_000, 50_000);
const odd = await make("Odd price", 1_234_500, 400_000, 50_000);
const hirer = await one(db, `insert into public.leads (full_name, email, source)
                             values ('Hirer', 'h@schema.test', 'walk_in') returning id`);

const hire = await one(db, "insert into public.orders (status, kind) values ('draft', 'hire') returning id, code");
await db.exec(`select public.add_order_line('${hire.id}', '${tenK.sku}')`);
await db.exec(`select public.add_order_line('${hire.id}', '${odd.sku}')`);
check("purchase option requires the customer before switching", await refuses(db, `select public.choose_purchase_option('${hire.id}','immediate')`));
await db.exec(`update public.orders set lead_id='${hirer.id}' where id='${hire.id}'`);
await db.exec(`select public.choose_purchase_option('${hire.id}','payjustnow')`);
r = await one(db, `select kind,sale_plan,purchase_option,payment_method,(select count(*) from public.order_lines where order_id='${hire.id}') n from public.orders where id='${hire.id}'`);
check("PayJustNow persists the sale option and keeps both stock holds",r.kind==='sale' && r.sale_plan==='immediate' && r.purchase_option==='payjustnow' && r.payment_method===null && num(r.n)===2);
await db.exec(`select public.choose_purchase_option('${hire.id}','layby')`);
r = await one(db, `select sale_plan,payment_method,plan_confirmed_at from public.orders where id='${hire.id}'`);
check("choosing lay-by clears PayJustNow without confirming an agreement",r.sale_plan==='layby' && r.payment_method===null && r.plan_confirmed_at===null);
await db.exec(`select public.choose_purchase_option('${hire.id}','hire')`);
r = await one(db, `select kind,sale_plan from public.orders where id='${hire.id}'`);
check("hire can be chosen after products without stale sale terms",r.kind==='hire' && r.sale_plan===null);
check("unknown purchase options are rejected",await refuses(db, `select public.choose_purchase_option('${hire.id}','unknown')`));


check("a hire cannot be paid without its dates",
      await refuses(db, `select public.confirm_hire_paid('${hire.id}', 'card_machine', null)`));
check("the dates cannot be the wrong way round",
      await refuses(db, `update public.orders set hire_start='2026-09-10', hire_end='2026-09-01' where id='${hire.id}'`));
await db.exec(`update public.orders set hire_start='2026-09-01', hire_end='2026-09-10', sold_total_cents = 1
               where id='${hire.id}'`);
r = await one(db, `select sold_total_cents t from public.orders where id='${hire.id}'`);
check("a draft hire recomputes the total instead of accepting a typed amount", num(r.t) === 382_000 + hireFeeCents(1_234_500,10), String(r.t));

check("the sale RPC refuses a hire",
      await refuses(db, `select public.confirm_order_paid('${hire.id}', 382000, 'card_machine', null)`));
check("the hire RPC refuses a sale",
      await refuses(db, `select public.confirm_hire_paid('${order.id}', 'card_machine', null)`));

/**
 * A machine sold by hand while the hire was open used to be skipped by the
 * "leave it where they put it" branch and go out on a paid hire anyway.
 */
{
  const byHand = await make("Sold by hand", 500_000, 100_000, 0);
  await db.exec(`select public.add_order_line('${hire.id}', '${byHand.sku}')`);
  await db.exec(`update public.items set status='sold' where id='${byHand.id}'`);
  let refusal = "";
  try { await db.exec(`select public.confirm_hire_paid('${hire.id}', 'card_machine', null)`); }
  catch (error) { refusal = String(error.message); }
  check("a hire refuses a machine that was sold by hand while it sat on the order, and names it",
        refusal.includes(byHand.sku) && /sold/.test(refusal), refusal);
  r = await one(db, `select status from public.orders where id='${hire.id}'`);
  check("and the hire stays open", r.status === "draft", r.status);
  await db.exec(`select public.remove_order_line('${hire.id}', '${byHand.id}')`);
}

const hireRevenueBefore = num((await one(db, `select coalesce(sum(revenue_cents),0) r from public.money_by_month`)).r);
await db.exec(`select public.confirm_hire_paid('${hire.id}', 'card_machine', 'SLIP-H1')`);

const expectedOdd = hireFeeCents(1_234_500, 10);
r = await one(db, `select status, sold_total_cents t, charged_total_cents c from public.orders where id='${hire.id}'`);
check("the hire total is computed from the dates and the asking prices",
      r.status === "paid" && num(r.t) === 382_000 + expectedOdd, `R${num(r.t) / 100}`);
rows = await all(db, `select i.status, i.sale_price_cents s, i.sold_at, i.published_at, i.website_availability, l.sold_price_cents ls
                      from public.order_lines l join public.items i on i.id=l.item_id
                      where l.order_id='${hire.id}' order by l.position`);
check("each line records what that machine earned", num(rows[0].ls) === 382_000 && num(rows[1].ls) === expectedOdd);
check("the hired machines remain visible as Coming back soon and are NOT sold",
      rows.every((x) => x.status === "reserved" && x.s === null && x.sold_at === null && x.published_at && x.website_availability === "on_hire"),
      rows.map((x) => x.status).join(","));
const hireRevenueAfter = num((await one(db, `select coalesce(sum(revenue_cents),0) r from public.money_by_month`)).r);
check("the per-machine money views did not count a hire as a sale", hireRevenueAfter === hireRevenueBefore);
r = await one(db, `select status from public.leads where id='${hirer.id}'`);
check("the hirer became a customer — money changed hands", r.status === "customer", r.status);
r = await one(db, "select summary from public.activity_log where entity='order' and action='status_changed' order by created_at desc limit 1");
check("the activity log says it was a hire", /hire 10 days/.test(r.summary), r.summary);

const other = await one(db, "insert into public.orders (status,sale_plan) values ('draft','immediate') returning id");
check("a machine out on hire cannot go on another order",
      await refuses(db, `select public.add_order_line('${other.id}', '${tenK.sku}')`));
rows = await all(db, `select on_order from public.search_sellable_items('${tenK.sku}', 5, null)`);
check("and the picker says which order it is out on", rows[0]?.on_order === hire.code, String(rows[0]?.on_order));

// The invoice for a hire: one line per machine at its fee, no discount line.
await db.exec(`select public.issue_invoice('${hire.id}', 'invoice', '${issuer()}'::jsonb)`);
stored = await one(db, `select document d, total_cents t from public.order_invoices
                        where order_id='${hire.id}' order by issued_at desc limit 1`);
{
  const doc = typeof stored.d === "string" ? JSON.parse(stored.d) : stored.d;
  check("the hire invoice adds up", checkInvoiceTotals(doc) === null, checkInvoiceTotals(doc) ?? "");
  check("it carries the period", doc.hire?.days === 10 && doc.hire?.start === "2026-09-01", JSON.stringify(doc.hire));
  check("there is no discount line on a hire", doc.adjustment_cents === 0 && doc.lines.length === 2);
  // R12 345 asks R493.80 a day. Rounded to whole rands, the words on the line
  // disagreed with the figures beside them.
  check("a daily rate with cents in it is printed with the cents",
        doc.lines.some((l) => l.description.includes("7 x R493.80 + 3 x R419.73")),
        doc.lines.map((l) => l.description).join(" | "));
  check("and whole-rand daily rates are also printed to two decimals",
        doc.lines.some((l) => l.description.includes("7 x R400.00 + 3 x R340.00")),
        doc.lines.map((l) => l.description).join(" | "));
  check("and it asks for exactly what the order says the customer pays",
        num(stored.t) === num((await one(db, `select charged_total_cents c from public.orders where id='${hire.id}'`)).c));
}

check("a sale cannot be 'returned'",
      await refuses(db, `select public.return_hire('${order.id}')`));
await db.exec(`select public.return_hire('${hire.id}')`);
rows = await all(db, `select i.status from public.order_lines l join public.items i on i.id=l.item_id where l.order_id='${hire.id}'`);
check("returning puts the machines back where they came from", rows.every((x) => x.status === "listed"), rows.map((x) => x.status).join(","));
r = await one(db, `select hire_returned_at ret, status, sold_total_cents t from public.orders where id='${hire.id}'`);
check("the hire is stamped returned and still paid", r.ret !== null && r.status === "paid" && num(r.t) === 382_000 + expectedOdd);
check("it cannot be returned twice", await refuses(db, `select public.return_hire('${hire.id}')`));
let reopenRefusal = "";
try { await db.exec(`select public.reopen_order('${hire.id}')`); } catch (error) { reopenRefusal = String(error.message); }
check("a returned hire cannot be reopened, and says so in words rather than a constraint name",
      /returned hire cannot be reopened/.test(reopenRefusal) && !/orders_returned_means_paid/.test(reopenRefusal), reopenRefusal);
await db.exec(`select public.add_order_line('${other.id}', '${tenK.sku}')`);
r = await one(db, `select count(*) c from public.order_lines where order_id='${other.id}'`);
check("a returned machine can go out again on another order", num(r.c) === 1);
rows = await all(db, `select on_order from public.search_sellable_items('${odd.sku}', 5, null)`);
check("and the picker no longer names the finished hire", rows[0]?.on_order === null, String(rows[0]?.on_order));

console.log("\nTHE PICKER");
rows = await all(db, `select sku, rank from public.search_sellable_items('${typed}', 10, null)`);
check("a typed code finds the machine and outranks everything else",
      rows[0]?.sku === big.sku && rows[0]?.rank === 0, rows.map((x) => `${x.sku}#${x.rank}`).join(" "));
rows = await all(db, `select id from public.search_everything('${typed}', 10)`);
check("and the command palette finds it too", rows.some((x) => x.id === big.id), `${rows.length} hits`);

console.log("\nPRODUCT SEGMENTS");
check("new products require a segment", !validSegments([]));
check("unknown and repeated segments are rejected", !validSegments(["unknown"]) && !validSegments(["homestaging", "homestaging"]));
check("both segments can be selected", validSegments(["homestaging", "industrial-kitchen"]));
check("legacy products retain their category segment", itemSegments({}, "homestaging").join() === "homestaging");
check("explicit selection takes precedence over category", itemSegments({ segments: ["industrial-kitchen"] }, "homestaging").join() === "industrial-kitchen");
check("malformed selection cannot leak into a segment", itemSegments({ segments: [] }, "industrial-kitchen").length === 0);
check("shared products belong to both catalogues", itemSegments({ segments: ["homestaging", "industrial-kitchen"] }).length === 2);

console.log("\nINTERNAL STOCK QUANTITY");
r = await one(db, `select stock_quantity from public.items where id='${big.id}'`);
check("existing stock has no invented quantity", r.stock_quantity === null);
await db.exec(`update public.items set stock_quantity=12 where id='${big.id}'`);
r = await one(db, `select stock_quantity from public.items where id='${big.id}'`);
check("manual quantity persists", r.stock_quantity === 12);
check("negative quantities are rejected", await refuses(db, `update public.items set stock_quantity=-1 where id='${big.id}'`));
await db.exec(`update public.items set stock_quantity=0 where id='${big.id}'`);
r = await one(db, `select stock_quantity from public.items where id='${big.id}'`);
check("zero quantity is allowed", r.stock_quantity === 0);
r = await one(db, `select has_column_privilege('anon', 'public.items', 'stock_quantity', 'select') allowed`);
check("anonymous readers cannot read internal quantities", r.allowed === false);
r = await one(db, `select count(*) n from information_schema.columns where table_schema='public' and table_name='public_items' and column_name='stock_quantity'`);
check("public catalogue excludes quantity", num(r.n) === 0);

console.log("\nSALE PLANS AND RECEIPTS");
const plannedItem = await make('Plan item', 100000, 10000, 0);
const planned = await one(db, `insert into public.orders(status,lead_id) values ('draft','${hirer.id}') returning id`);
await db.exec(`select public.add_order_line('${planned.id}','${plannedItem.sku}')`);
check('a new sale requires an explicit choice of terms', await refuses(db, `select public.confirm_order_paid('${planned.id}',100000,'bank_transfer','REF')`));
await db.exec(`select public.save_sale_plan('${planned.id}','layby',100000,'2026-01-31',3,31,10000,null)`);
r=await one(db, `select plan_final_due::text, status from public.orders where id='${planned.id}'`);
check('month-end lay-by ends on the last real day of the month', String(r.plan_final_due).startsWith('2026-04-30'));
check('confirming terms does not claim payment', r.status==='draft');
check('plan cannot bypass actual receipts via old full-payment RPC', await refuses(db, `select public.confirm_order_paid('${planned.id}',100000,'bank_transfer','REF')`));
check('confirmed agreements cannot switch purchase option',await refuses(db, `select public.choose_purchase_option('${planned.id}','hire')`));
check('confirmed terms cannot be silently repriced', await refuses(db, `update public.orders set sold_total_cents=90000 where id='${planned.id}'`));
check('confirmed plan items cannot be removed', await refuses(db, `select public.remove_order_line('${planned.id}','${plannedItem.id}')`));
const receiptId = (await one(db, 'select gen_random_uuid() id')).id;
const receiptSql = `select public.record_order_receipt('${planned.id}',12000,'bank_transfer','PLAN-1','2026-02-28','${receiptId}',false)`;
await db.exec(receiptSql); await db.exec(receiptSql);
r=await one(db, `select count(*) n,sum(amount_cents) total from public.order_receipts where order_id='${planned.id}'`);
check('retrying the same receipt records money once', num(r.n)===1 && num(r.total)===12000);
check('idempotency key cannot be reused for another amount', await refuses(db, `select public.record_order_receipt('${planned.id}',20000,'bank_transfer','PLAN-1','2026-02-28','${receiptId}',false)`));
check('overpayment is refused', await refuses(db, `select public.record_order_receipt('${planned.id}',99000,'bank_transfer','PLAN-2','2026-03-01',gen_random_uuid(),false)`));
check('future payment is refused', await refuses(db, `select public.record_order_receipt('${planned.id}',100,'bank_transfer','PLAN-2','2099-01-01',gen_random_uuid(),false)`));
const terms = {sale_plan:'layby',plan_start:'2026-01-31',plan_months:3,plan_payment_day:31,plan_deposit_cents:10000,plan_final_due:'2026-04-30',plan_confirmed_at:'2026-01-31'};
check('receipt amounts keep cents visible', paymentAmount(33334).includes('333,34'));
const roundedSchedule = planBalance({...terms,plan_deposit_cents:0},100000,[]).schedule;
check('rounding is absorbed by the final instalment', roundedSchedule[1].target===33334 && roundedSchedule[2].target===66668 && roundedSchedule[3].target===100000);
const balancePreview = planBalance(terms,100000,[{amount_cents:12000,entry_kind:'payment'}],'2026-02-28');
check('a small partial payment leaves overdue money visible', balancePreview.due===28000 && balancePreview.balance===88000 && balancePreview.next.date==='2026-02-28');
await db.exec(`select public.record_order_receipt('${planned.id}',88000,'payjustnow','PLAN-3','2026-03-01',gen_random_uuid(),false)`);
r=await one(db, `select status from public.orders where id='${planned.id}'`);
check('exact final payment completes the sale',r.status==='paid');
r=await one(db, `select status from public.items where id='${plannedItem.id}'`);
check('only full payment marks the item sold',r.status==='sold');
check('paid plans cannot reopen and lose ledger alignment',await refuses(db, `select public.reopen_order('${planned.id}')`));

const reservedItem=await make('Reserved item',100000,10000,0);
const reserved=await one(db, `insert into public.orders(status,lead_id) values ('draft','${hirer.id}') returning id`);
await db.exec(`select public.add_order_line('${reserved.id}','${reservedItem.sku}')`);
check('reservation requires the agreed 50 percent deposit',await refuses(db, `select public.save_sale_plan('${reserved.id}','reservation',100000,'2026-01-31',null,null,20000,null)`));
await db.exec(`select public.save_sale_plan('${reserved.id}','reservation',100000,'2026-01-31',null,null,50000,null)`);
r=await one(db,`select plan_final_due::text from public.orders where id='${reserved.id}'`);
check('reservation due date is exactly seven days later',String(r.plan_final_due).startsWith('2026-02-07'));
await db.exec(`select public.record_order_receipt('${reserved.id}',50000,'bank_transfer','RES-1','2026-01-31',gen_random_uuid(),false)`);
check('an agreement with receipts cannot be deleted',await refuses(db,`delete from public.orders where id='${reserved.id}'`));
await db.exec(`select public.void_order('${reserved.id}','Customer cancelled')`);
r=await one(db,`select status from public.items where id='${reservedItem.id}'`);
check('cancellation releases reserved stock',r.status==='listed');
r=await one(db,`select count(*) n from public.order_receipts where order_id='${reserved.id}'`);
check('cancellation preserves received money',num(r.n)===1);
check('cannot record more refunds than receipts',await refuses(db,`select public.record_order_receipt('${reserved.id}',60000,'bank_transfer','REFUND','2026-02-01',gen_random_uuid(),true)`));
await db.exec(`select public.record_order_receipt('${reserved.id}',50000,'bank_transfer','REFUND','2026-02-01',gen_random_uuid(),true)`);
r=await one(db,`select sum(case when entry_kind='payment' then amount_cents else -amount_cents end) net from public.order_receipts where order_id='${reserved.id}'`);
check('actual refund clears amount owed without deleting history',num(r.net)===0);
check('anonymous cannot read receipts',!(await one(db,`select has_table_privilege('anon','public.order_receipts','select') allowed`)).allowed);
check('staff cannot insert receipts outside the validating RPC',!(await one(db,`select has_table_privilege('authenticated','public.order_receipts','insert') allowed`)).allowed);
check('staff cannot change purchase option outside RPC',!(await one(db,`select has_column_privilege('authenticated','public.orders','purchase_option','update') allowed`)).allowed);
check('staff cannot change terms outside the validating RPC',!(await one(db,`select has_column_privilege('authenticated','public.orders','sale_plan','update') allowed`)).allowed);
check('new condition sorts above like new for matching', (await one(db, `select 'N'::public.condition_grade < 'A'::public.condition_grade ok`)).ok);
await db.exec(`set role authenticated`);
const staffDraft = await one(db, "insert into public.orders(status) values('draft') returning id");
await db.exec(`select public.save_sale_plan('${staffDraft.id}','immediate')`);
check('approved staff can open and choose terms through the real grants', (await one(db, `select sale_plan from public.orders where id='${staffDraft.id}'`)).sale_plan==='immediate');
check('direct API cannot bypass plan validation',await refuses(db,`update public.orders set plan_confirmed_at=now() where id='${staffDraft.id}'`));
r=await one(db,`select count(*) n from public.order_receipts where order_id='${reserved.id}'`);
check('approved staff can read receipts through RLS',num(r.n)===2);
await db.exec(`reset role`);
await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000000'; set role authenticated`);
r=await one(db,`select count(*) n from public.order_receipts`);
check('unapproved authenticated user cannot read receipts',num(r.n)===0);
check('unapproved user cannot choose purchase option',await refuses(db,`select public.choose_purchase_option('${staffDraft.id}','immediate')`));
check('unapproved user cannot call payment RPC',await refuses(db,`select public.record_order_receipt('${reserved.id}',100,'bank_transfer','X','2026-02-01',gen_random_uuid(),true)`));
await db.exec(`reset role`);

console.log('\nCHARGES, SETTLEMENT AND AVAILABILITY');
await signIn(db);
const dateSA = (await one(db,"select (now() at time zone 'Africa/Johannesburg')::date::text d")).d;
const testBuyer = await one(db,"insert into public.leads(full_name,email,source) values('Test Customer','charge-check@example.test','marketplace') returning id");
const newAgreement = async (name, price, option) => {
  const item = await make(name,price,0,0);
  const o = await one(db,`insert into public.orders(lead_id) values('${testBuyer.id}') returning id`);
  await db.exec(`select public.add_order_line('${o.id}',null,'${item.id}'); select public.choose_purchase_option('${o.id}','${option}')`);
  return { item, id:o.id };
};
const latestDocument = async id => (await one(db,`select document d,id from public.order_invoices where order_id='${id}' order by issued_at desc,number desc limit 1`));
const installation = async (id,quote=null,accepted=false) => {
  await db.exec(`select public.set_order_installation('${id}',${quote ?? 'null'},${accepted})`);
};
const receipt = async (id,amount,refund=false,method='bank_transfer',date=dateSA,request=null) => {
  const key = request ?? (await one(db,'select gen_random_uuid() id')).id;
  await db.exec(`select public.record_order_receipt('${id}',${amount},'${method}','Test Customer','${date}','${key}',${refund})`);
  return key;
};
const balanceFor = async id => {
  const o=await one(db,`select *,plan_start::text as plan_start,plan_final_due::text as plan_final_due from public.orders where id='${id}'`);
  const payments=await all(db,`select * from public.order_receipts where order_id='${id}'`);
  return { order:o, payments, ...planBalance(o,num(o.charged_total_cents),payments) };
};

const reservation=await newAgreement('Reservation payment example',20_000,'reservation');
await db.exec(`select public.save_sale_plan('${reservation.id}','reservation',20000,'${dateSA}',null,null,10000,null); select public.issue_invoice('${reservation.id}','proforma','${issuer()}'::jsonb)`);
const originalProforma=await latestDocument(reservation.id);
await receipt(reservation.id,10_000);
let settled=await balanceFor(reservation.id);
let currentDoc=await latestDocument(reservation.id);
check('a recorded deposit automatically revises invoice payments and outstanding balance',currentDoc.d.total_cents===20_000 && currentDoc.d.received_cents===10_000 && currentDoc.d.balance_cents===10_000 && checkInvoiceTotals(currentDoc.d)===null);
check('the originally issued proforma stays unchanged',(await one(db,`select document d from public.order_invoices where id='${originalProforma.id}'`)).d.received_cents===0);
check('the reservation stays visible but unavailable',(await one(db,`select availability from public.public_items where id='${reservation.item.id}'`)).availability==='reserved');
const dueDate=settled.order.plan_final_due;
const dayAfterDue=new Date(`${dueDate}T12:00:00Z`); dayAfterDue.setUTCDate(dayAfterDue.getUTCDate()+1);
check('a deadline today is due but not yet overdue',planBalance(settled.order,20_000,settled.payments,dueDate).overdue===0);
const past=planBalance(settled.order,20_000,settled.payments,dayAfterDue.toISOString().slice(0,10));
check('after the reservation deadline the unpaid balance is overdue with its date',past.overdue===10_000 && past.overdueDate===dueDate);
const retryKey=await receipt(reservation.id,5_000);
await receipt(reservation.id,5_000,false,'bank_transfer',dateSA,retryKey);
settled=await balanceFor(reservation.id);
check('a retried payment is counted once and reduces the overdue amount',settled.received===15_000 && planBalance(settled.order,20_000,settled.payments,dayAfterDue.toISOString().slice(0,10)).overdue===5_000);
await receipt(reservation.id,5_000);
currentDoc=await latestDocument(reservation.id);
check('final payment automatically updates the invoice to fully paid',currentDoc.d.balance_cents===0 && currentDoc.d.received_cents===20_000 && checkInvoiceTotals(currentDoc.d)===null);
check('PayJustNow is refused as a refund method',await refuses(db,`select public.record_order_receipt('${reservation.id}',100,'payjustnow','X','${dateSA}',gen_random_uuid(),true)`));

const lay=await newAgreement('Lay-by reminder',100_000,'layby');
await db.exec(`select public.save_sale_plan('${lay.id}','layby',100000,'2026-01-31',2,31,10000,null)`);
await receipt(lay.id,10_000,false,'bank_transfer','2026-01-31');
settled=await balanceFor(lay.id);
const layDue=planBalance(settled.order,100_000,settled.payments,'2026-03-01');
check('lay-by uses the last day of short months and only the unpaid instalment is overdue',layDue.overdue===45_000 && layDue.overdueDate==='2026-02-28');
check('lay-by stock is hidden from the storefront',!(await one(db,`select count(*) n from public.public_items where id='${lay.item.id}'`)).n);
await db.exec('set role anon');
check('hidden stock and its media cannot be read through the anonymous base API',num((await one(db,`select count(*) n from public.items where id='${lay.item.id}'`)).n)===0 && num((await one(db,`select count(*) n from public.public_item_media where item_id='${lay.item.id}'`)).n)===0);
check('anonymous callers cannot change installation quotes',await refuses(db,`select public.set_order_installation('${lay.id}',100,true)`));
await db.exec('reset role');
await db.exec(`select public.void_order('${lay.id}','Test cancellation')`);
check('cancelling lay-by returns complete stock to the website as available',(await one(db,`select availability from public.public_items where id='${lay.item.id}'`)).availability==='available');
await receipt(lay.id,10_000,true,'bank_transfer');
check('a cancelled lay-by refund retains its history and settles the amount to return',(await balanceFor(lay.id)).received===0);

const rental=await newAgreement('18-day hire example',20_000,'hire');
await db.exec(`update public.orders set hire_start='2026-09-01',hire_end='2026-09-18' where id='${rental.id}'`);
await db.exec(`select public.issue_invoice('${rental.id}','proforma','${issuer()}'::jsonb)`);
currentDoc=await latestDocument(rental.id);
check('18-day hire is 7 x R8.00 + 11 x R6.80 = R130.80',currentDoc.d.subtotal_cents===13_080 && currentDoc.d.lines[0].description.includes('7 x R8.00 + 11 x R6.80'));
check('hire invoice and payment ledger match the unchanged hire calculation',currentDoc.d.total_cents===13_080 && checkInvoiceTotals(currentDoc.d)===null);
await db.exec(`select public.confirm_hire_paid('${rental.id}','card_machine','Hire test')`);
check('a paid hire is visible as Coming back soon',(await one(db,`select availability from public.public_items where id='${rental.item.id}'`)).availability==='on_hire');
await db.exec(`select public.return_hire('${rental.id}')`);
check('returning the hire makes the item available again without losing its payment history',(await one(db,`select availability from public.public_items where id='${rental.item.id}'`)).availability==='available' && (await balanceFor(rental.id)).received===13_080);

const financed=await newAgreement('Installation example',100_000,'asset_finance');
await installation(financed.id,20_000);
await db.exec(`select public.save_sale_plan('${financed.id}','asset_finance',100000,'${dateSA}',null,null,20000,'${dateSA}'); select public.issue_invoice('${financed.id}','proforma','${issuer()}'::jsonb)`);
check('an optional installation quote is not charged until accepted',(await latestDocument(financed.id)).d.total_cents===100_000);
await receipt(financed.id,20_000);
await installation(financed.id,20_000,true);
currentDoc=await latestDocument(financed.id);
check('accepted installation updates total, outstanding balance and invoice after payment',currentDoc.d.total_cents===120_000 && currentDoc.d.balance_cents===100_000 && currentDoc.d.charges.installation_cents===20_000 && checkInvoiceTotals(currentDoc.d)===null);
check('Rental Finance stock is hidden',num((await one(db,`select count(*) n from public.public_items where id='${financed.item.id}'`)).n)===0);
check('installation quotes cannot be attached to other purchase options',await refuses(db,`select public.set_order_installation('${reservation.id}',100,true)`));
check('accepted installation requires a non-negative quote',await refuses(db,`select public.set_order_installation('${financed.id}',null,true)`));
await receipt(financed.id,100_000);
await installation(financed.id,30_000,true);
settled=await balanceFor(financed.id);
check('installation added after full payment preserves recorded payments and reopens only the extra balance',settled.order.status==='paid' && settled.received===120_000 && settled.balance===10_000);
await receipt(financed.id,10_000);
await installation(financed.id,20_000,true);
settled=await balanceFor(financed.id);
check('a lower accepted installation quote preserves receipts and shows the refund due',settled.balance===0 && settled.refundDue===10_000);
await receipt(financed.id,10_000,true,'cash');
currentDoc=await latestDocument(financed.id);
check('Cash refunds reconcile the invoice without cancelling the completed sale',currentDoc.d.received_cents===120_000 && currentDoc.d.refund_due_cents===0 && currentDoc.d.payments.at(-1).method==='cash' && checkInvoiceTotals(currentDoc.d)===null);
await db.exec(`select public.void_order('${financed.id}','Test cancellation')`);
// Paid stock is republished by the server action through the normal publish gate.
await db.exec(`update public.items set published_at=now() where id='${financed.item.id}' and status='listed'`);
check('cancelling Rental Finance makes the item available again',(await one(db,`select availability from public.public_items where id='${financed.item.id}'`)).availability==='available');

const tag=(await one(db,'select id from public.tags limit 1')).id;
await db.exec(`set role authenticated; insert into public.item_tags(item_id,tag_id) values('${financed.item.id}','${tag}'); delete from public.item_tags where item_id='${financed.item.id}' and tag_id='${tag}'`);
check('approved staff can remove the last product tag',num((await one(db,`select count(*) n from public.item_tags where item_id='${financed.item.id}'`)).n)===0);
check('new charge columns cannot be written outside the validating RPC',!(await one(db,"select has_column_privilege('authenticated','public.orders','installation_quote_cents','update') allowed")).allowed);
await db.exec('reset role');

console.log('\nUPGRADING EXISTING PAYMENT HISTORY');
let historicalVoid, historicalHire;
const upgraded = await build({ before: '20261012154553_order_charges_payments_and_availability.sql', seed: async oldDb => {
  await signIn(oldDb);
  const cat=(await one(oldDb,"select id from public.categories limit 1")).id;
  const buyer=(await one(oldDb,"insert into public.leads(full_name,email,source) values('Historical Test','historical@example.test','walk_in') returning id")).id;
  const olderItem=async name => {
    const i=await one(oldDb,`insert into public.items(title,category_id,condition_grade,list_price_cents,description,status)
      values('${name}','${cat}','B',20000,'A complete test item for verifying the migration of existing records.','listed') returning id`);
    await oldDb.exec(`insert into public.item_media(item_id,kind,storage_path,is_placeholder) values('${i.id}','photo','${i.id}/test.jpg',false); update public.items set published_at=now() where id='${i.id}'`);
    return i.id;
  };
  const soldItem=await olderItem('Historical sold item');
  historicalVoid=(await one(oldDb,`insert into public.orders(lead_id) values('${buyer}') returning id`)).id;
  await oldDb.exec(`select public.add_order_line('${historicalVoid}',null,'${soldItem}'); select public.choose_purchase_option('${historicalVoid}','immediate');
    select public.confirm_order_paid('${historicalVoid}',20000,'card_machine','Historical slip'); select public.void_order('${historicalVoid}','Test cancellation')`);
  const hiredItem=await olderItem('Historical hired item');
  historicalHire={ id:(await one(oldDb,`insert into public.orders(lead_id) values('${buyer}') returning id`)).id,item:hiredItem };
  await oldDb.exec(`select public.add_order_line('${historicalHire.id}',null,'${hiredItem}'); select public.choose_purchase_option('${historicalHire.id}','hire');
    update public.orders set hire_start='2026-09-01',hire_end='2026-09-18' where id='${historicalHire.id}'; select public.confirm_hire_paid('${historicalHire.id}','bank_transfer','Historical hire')`);
} });
r=await one(upgraded,`select amount_cents,reference,entry_kind from public.order_receipts where order_id='${historicalVoid}'`);
check('a previously cancelled paid order retains its recorded full payment for refund reconciliation',num(r.amount_cents)===20_000 && r.entry_kind==='payment' && r.reference==='Historical slip');
r=await one(upgraded,`select amount_cents from public.order_receipts where order_id='${historicalHire.id}'`);
check('an existing paid hire is converted to the payment ledger exactly once',num(r.amount_cents)===13_080 && num((await one(upgraded,`select count(*) n from public.order_receipts where order_id='${historicalHire.id}'`)).n)===1);
check('an existing complete hire is republished as Coming back soon',(await one(upgraded,`select availability from public.public_items where id='${historicalHire.item}'`)).availability==='on_hire');
check('retired workshop reports are not publicly readable',!(await one(upgraded,"select has_column_privilege('anon','public.items','workshop_notes','select') allowed")).allowed);
await upgraded.close();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}

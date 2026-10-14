/**
 * Open every ops page as a real signed-in staff member and assert it renders.
 *
 *   npm run test:pages                 # against http://localhost:3001
 *   OPS_URL=https://takemore-ops.vercel.app npm run test:pages
 *
 * WHY THIS EXISTS
 * ---------------
 * The CRM shipped with two queries that typechecked, built cleanly, and 500'd
 * the moment somebody opened /leads. Both were PostgREST embed failures —
 * `lead_interests` points at `items` twice so the join was ambiguous, and
 * `lead_events.actor_id` pointed at auth.users which has no route to
 * staff_profiles. Neither is visible to `tsc`, because the relationship is
 * resolved at runtime from foreign keys.
 *
 * packages/db/tests/rls.test.mjs now asserts those specific embeds, but that
 * only covers the joins somebody remembered to add. This covers the pages: if a
 * route throws for any reason at all, this fails.
 *
 * It signs in as a throwaway staff account created through the admin API, drives
 * the app over HTTP with the same cookie @supabase/ssr writes, and deletes the
 * account afterwards.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const base = (process.env.OPS_URL ?? "http://localhost:3001").replace(/\/$/, "");

if (!url || !publishable || !secret) {
  console.error("Missing env. Run with: node --env-file=.env.local scripts/test-ops-pages.mjs");
  process.exit(1);
}

let passed = 0;
const failures = [];
const ok = (n, d) => { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${n}${d ? `  (${d})` : ""}`); };
const fail = (n, d) => { failures.push({ name: n, detail: d }); console.log(`  \x1b[31mFAIL\x1b[0m  ${n}\n        ${d}`); };

const admin = createClient(url, secret, { auth: { persistSession: false } });
const projectRef = new URL(url).hostname.split(".")[0];

/**
 * The cookie @supabase/ssr reads.
 *
 * It stores the whole session as base64url JSON behind a `base64-` marker, and
 * splits anything over ~3180 characters across numbered cookies. A session with
 * a real JWT in it always exceeds that, so the chunking is not an edge case.
 */
function sessionCookies(session) {
  const name = `sb-${projectRef}-auth-token`;
  const encoded =
    "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");

  if (encoded.length <= 3180) return [`${name}=${encoded}`];

  const parts = [];
  for (let i = 0; i < encoded.length; i += 3180) {
    parts.push(`${name}.${parts.length}=${encoded.slice(i, i + 3180)}`);
  }
  return parts;
}

const stamp = Date.now();
const email = `ops-pages-${stamp}@takemore.test`;
const password = randomBytes(32).toString("base64url");
let userId;
let leadId;
let orderId;
let staffClient;

async function setup() {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = data.user.id;

  // `owner`, so every role-gated route is reachable — /outreach/campaigns
  // redirects a plain staff account away and a redirect would read as a pass.
  const { error: profileError } = await admin.from("staff_profiles").insert({
    user_id: userId,
    full_name: "Ops Page Smoke Test",
    role: "owner",
    approved_at: new Date().toISOString(),
  });
  if (profileError) throw new Error(`staff_profiles: ${profileError.message}`);

  const anon = createClient(url, publishable, { auth: { persistSession: false } });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  staffClient = anon;

  return sessionCookies(signIn.session).join("; ");
}

/** A Next.js server exception renders this, with a 500. Both are checked. */
const BROKEN = /Application error: a server-side exception|Internal Server Error/i;

async function visit(cookie, path, expect = {}) {
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { cookie, "user-agent": "takemore-page-smoke" },
      redirect: "manual",
    });
  } catch (error) {
    return fail(`GET ${path}`, `could not reach ${base} — is the ops app running? (${error.message})`);
  }

  // A redirect means requireStaff() bounced us, which for an owner means the
  // session cookie was not read — worth failing loudly rather than skipping.
  if (res.status >= 300 && res.status < 400) {
    return fail(`GET ${path}`, `redirected to ${res.headers.get("location")} — not signed in`);
  }

  const body = await res.text();

  if (res.status !== 200) return fail(`GET ${path}`, `http ${res.status}`);
  if (BROKEN.test(body)) {
    const digest = body.match(/Digest: (\d+)/)?.[1];
    return fail(`GET ${path}`, `server exception${digest ? ` (digest ${digest})` : ""}`);
  }
  const wanted = expect.contains ? [expect.contains].flat() : [];
  if (wanted.length && !wanted.some((needle) => body.includes(needle))) {
    return fail(`GET ${path}`, `rendered, but "${wanted.join('" / "')}" is missing`);
  }

  ok(`GET ${path}`, expect.contains ? `found "${expect.contains}"` : `${body.length} bytes`);
  return body;
}

/**
 * A retired URL that has to keep landing somewhere sensible.
 *
 * /money was folded into the Dashboard, and the redirect lives in
 * next.config.mjs where nothing else would notice it going missing. People have
 * it in pinned tabs; a 404 there reads as the numbers having been deleted.
 */
async function redirects(cookie, path, to) {
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { cookie, "user-agent": "takemore-page-smoke" },
      redirect: "manual",
    });
  } catch (error) {
    return fail(`GET ${path}`, `could not reach ${base} (${error.message})`);
  }
  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400) return fail(`GET ${path}`, `http ${res.status}, expected a redirect`);
  if (new URL(location, base).pathname !== to) return fail(`GET ${path}`, `redirected to ${location}, expected ${to}`);
  ok(`GET ${path}`, `redirects to ${to}`);
}

/**
 * No <img> on a list may point at a clip.
 *
 * The stock list used to take `media[0]` out of an embed that selected neither
 * `kind` nor `position` — so "first" was whatever PostgREST happened to return,
 * and when that was an mp4 the URL still went to Storage's IMAGE transformer,
 * which answers `400 InvalidRequest`. The result was a broken-image glyph on
 * the one item in the database with photographs on it.
 *
 * Nothing else catches this. It typechecks, it builds, and the page returns
 * 200 — the failure is a second request the browser makes afterwards. So the
 * assertion is made here, on the HTML, where it is cheap.
 */
const VIDEO_SRC = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;

function thumbnailsAreStills(path, body) {
  if (!body) return;
  const sources = [...body.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/gi)].map((m) => m[1]);
  const clips = sources.filter((src) => VIDEO_SRC.test(src));
  if (clips.length > 0) {
    return fail(`${path} thumbnails`, `${clips.length} <img> pointing at a clip: ${clips[0]}`);
  }
  ok(`${path} thumbnails`, `${sources.length} <img>, none of them a clip`);
}

async function run(cookie) {
  console.log(`\nOPS PAGES  (${base})`);

  // Signed in as an owner, so / is the Dashboard rather than the worker's page.
  // "Tied up now" is a tile only the Dashboard renders, and only once
  // item_analytics has come back with rows; on an empty database the page
  // deliberately says "No stock yet" instead. Either proves the role branch,
  // the view, the RLS guard and the render in a single request.
  await visit(cookie, "/", { contains: ["Tied up now", "No stock yet"] });
  thumbnailsAreStills("/items", await visit(cookie, "/items"));
  await visit(cookie, "/items/new", { contains: "Which collection is this item for?" });
  thumbnailsAreStills("/board", await visit(cookie, "/board"));
  await redirects(cookie, "/money", "/");
  // Team is now the roster and the log on one page. The heading below only
  // renders if the second half came back — it reads activity_log and matches
  // every actor against staff_profiles, which typechecks and could still fail
  // at runtime, which is why this suite exists.
  await visit(cookie, "/team", { contains: "Activity" });
  await visit(cookie, "/account");
  await redirects(cookie, "/activity", "/team");
  // The iframe's title, which only exists if the storefront frame rendered.
  await visit(cookie, "/website", { contains: "Take More website" });

  console.log("\nTHE CRM");
  await visit(cookie, "/leads", { contains: "Add someone" });
  await visit(cookie, "/outreach");
  await visit(cookie, "/outreach/campaigns", { contains: "What came in" });

  // A lead's own page, on a row created for the purpose — the detail route has
  // the most embeds of anything in the app and is exactly what broke.
  const { data: lead } = await admin
    .from("leads")
    .insert({
      full_name: "Page Smoke Person",
      email: `page-smoke-${stamp}@takemore.test`,
      phone: "082 000 7777",
      source: "walk_in",
    })
    .select("id")
    .single();

  if (lead) {
    leadId = lead.id;
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .eq("slug", "refrigeration")
      .single();

    await admin.from("lead_interests").insert({
      lead_id: lead.id,
      category_id: category?.id ?? null,
      description: "under counter fridge",
      budget_max_cents: 2000000,
    });
    await admin.from("lead_events").insert({
      lead_id: lead.id,
      kind: "note",
      body: "Created by the page smoke test.",
      actor_id: userId,
    });

    await visit(cookie, `/leads/${lead.id}`, { contains: "Page Smoke Person" });
  } else {
    fail("create a lead to open", "insert returned nothing");
  }

  // An item's page, which now carries the "who wants this" panel.
  const { data: item } = await admin
    .from("items")
    .select("id")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (item) await visit(cookie, `/items/${item.id}`, { contains: "Total tracked units" });

  // The printable label. Its own route group with its own layout, so a broken
  // auth check there would not show up anywhere else in this file.
  if (item) await visit(cookie, `/items/${item.id}/label`, { contains: "Print" });

  console.log("\nTHE TILL");
  await visit(cookie, "/orders", { contains: "New order" });

  // An order's own page is the heaviest embed in the app — order_lines to
  // items to item_media, plus two security_invoker views over item_costs. It
  // typechecks whatever PostgREST decides to do with that, which is the exact
  // shape of the two failures this suite was written for.
  const { data: order } = await admin
    .from("orders")
    .insert({ status: "draft" })
    .select("id, code")
    .single();

  if (order) {
    orderId = order.id;
    const { data: free } = await staffClient.from("items").select("id")
      .is("deleted_at", null).gt("available_quantity", 0).limit(1).maybeSingle();
    if (free) {
      const { error } = await staffClient.rpc("add_order_line", {
        p_order_id: order.id, p_item_id: free.id, p_quantity: 1,
      });
      if (error) throw new Error(`add unit: ${error.message}`);
      const { data: line, error: lineError } = await staffClient.from("order_lines")
        .select("unit_code").eq("order_id", order.id).single();
      if (lineError) throw new Error(`read unit: ${lineError.message}`);
      await visit(cookie, `/orders/${order.id}`, { contains: line.unit_code });
      await visit(cookie, `/orders/${order.id}/labels`, { contains: line.unit_code });
    } else {
      await visit(cookie, `/orders/${order.id}`, { contains: order.code });
    }
  } else {
    fail("create an order to open", "insert returned nothing");
  }
}

async function cleanup() {
  if (orderId) {
    const { error } = await admin.from("orders").delete().eq("id", orderId);
    if (error) fail("clean up test order", error.message);
  }
  if (leadId) {
    const { error } = await admin.from("leads").delete().eq("id", leadId);
    if (error) fail("clean up test customer", error.message);
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) fail("clean up test account", error.message);
  }
}

let cookie;
try {
  cookie = await setup();
  await run(cookie);
} catch (error) {
  fail("suite", error.message);
} finally {
  await cleanup();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  process.exit(1);
}

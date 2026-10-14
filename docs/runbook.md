# Runbook

What to do when something needs doing. Written for whoever is holding the phone,
not for whoever wrote the code.

For what the system *is*, see [`architecture.md`](architecture.md). For what still
has to be filled in before the domain is pointed here, see
[`launch-checklist.md`](launch-checklist.md).

---

## Quantities, lay-by and physical unit labels

Apply `20261014131244_unit_inventory_and_quantity_orders.sql` before running
the matching Ops and storefront release. It preserves order amounts, payments
and issued documents. Existing order lines attach to unit `.1`; existing manual
counts create the remaining numbered units. A blank legacy count keeps its
original single unit. Conflicting live orders or a zero count on a live order
stop the migration for reconciliation rather than creating stock.
Follow it with `20261014141218_preserve_legacy_unit_hold_payments.sql` so older
drafts whose held item was manually moved back to For sale or the workshop
retain their payment eligibility. Ownership checks still reject sold, deleted,
retired or reassigned units; no historical order or stage is rewritten.

In **Orders → Products**, search for the listing, choose **Quantity**, and add.
Two units of A020 receive A020.1 and A020.2, each with its price and label.
Both are held immediately; confirming lay-by fixes those exact identities.
Cancellation releases only those units and retains the agreement and payments.
In a draft, remove a single unit with its own remove button. Discarding a draft
also releases its units atomically.

**Stock → item → Physical units** shows every number, state and linked order.
Use **Print unit labels**, or print only the assigned labels from the order,
then attach each number to that physical item. Numbers are never reused.
**Total tracked units** includes available, held and sold units; increasing it
adds new identities. Reducing it retires only free units, retaining their labels
in history. Sold and held units cannot be removed by changing the count.

Prices are per unit. Existing costs stay recorded as listing totals; order and
dashboard figures allocate that ledger across the tracked units to the cent.
The storefront shows one listing and its remaining available quantity. A
partially held listing stays available; the final held unit determines the
Reserved / Coming back soon / hidden behavior when no free units remain.
Physical identities, order links and the total count remain staff-only.

`npm run test:schema` verifies stock allocation, overselling refusals, partial
payments, cancellation, returned hires, numbering and simulated staff/anonymous
permissions against isolated Postgres. It does not verify a deployed Supabase
API or the attachment of labels in the warehouse.

## Releasing sale terms and condition labels

Apply `20260929154117_sale_plans_and_condition_labels.sql` and
`20260929162521_order_purchase_options.sql` before enabling the new
Ops release. It adds sale terms, an append-only receipt ledger, staff-only RPCs,
and the New condition value. Existing A/B/C data keeps its meaning and displays
as Like New / Good / Fair. Existing sales retain Pay in full terms.

Until the migration is present, existing orders remain readable and the new
sale controls show a migration notice. Do not treat this fallback as a completed
release. Verify a lay-by partial payment, cancellation/refund and final payment
against an isolated database before production. `npm run test:schema` covers
these rules and simulated authenticated RLS; it does not prove a live Supabase
session or PostgREST deployment.

## Getting a new staff member working

**You create the account. They never create their own.** The request-access form is gone
from the login screen and the action behind it refuses — August 2026, on the owner's
decision. Approval into this app is the only thing between somebody and every cost and
margin in the business, so it goes through one person.

1. **Ops → Team → Add someone.** Their name, their email, and optionally their WhatsApp
   number. Press *Create the account*.
2. **Send them the password.** It is shown once, and there is no way to see it again. If
   the WhatsApp number was filled in there is a button that opens WhatsApp with the whole
   message typed out — the address, their email and the password. Otherwise copy it.
3. **They sign in and change it.** Their name in the corner → *Change password*. It asks
   for the current one, so only the person holding it can change it.

**If the password is lost**, there is no reset email in this system. On Team, the row has a
*New password* button: it makes a fresh one, shows it once, and offers the same WhatsApp
handover. The old password stops working immediately. The account, its name and its log
entries are untouched.

**Signing out.** *Sign out* in the corner signs out that device only. *Account → Sign out
everywhere* revokes every phone and laptop the account is signed in on — that is the one to
press when a phone is lost, after changing the password.

**Nobody has a rank.** Everybody who is signed in can do everything: take stock in, see what
a machine cost, negotiate, sell, cancel a sale and correct one. The single exception is this
screen — adding and removing people is the owner's, and that is a door rather than a rank.
See `20260819110000_one_team_no_ranks.sql`, which is also where to put ranks back: one
function body, and ten policies follow it.

**If somebody leaves**, Deactivate them. Their session stops working on their next request
and their name stays on every log entry from when they worked here. Reject deletes an
account outright and only applies to somebody who never got in.

---

## When the nightly match goes quiet

The stock-match job runs at **04:00 SAST** and queues an outreach suggestion for
every customer whose recorded want a newly-listed machine matches. It is declared
in `apps/ops/vercel.json`.

**How you find out it stopped:**

| Signal | Where |
|---|---|
| A red strip on the ops dashboard | Only appears when the last run failed, never finished, or is over 26 hours old |
| `GET /api/health` returns 503 | Wire a free pinger at it — this is the only check that survives the app being down. It also says 503 with "never run" on a fresh deployment until the first 04:00 |
| A Sentry cron alert | If Sentry is configured. The only one that fires on the job never starting |

**What to do, in order:**

1. **Look at the ledger.** Ops → the dashboard strip says which of the three it
   is: failed, never finished, or stale. The full history is in the `cron_runs`
   table.
2. **Run it by hand.** Ops → Outreach → *Run match now*. If that
   works, the job is fine and the *scheduler* did not fire — check the Vercel
   cron log.
3. **If the manual run fails too**, the failure is in `run_stock_match()` and the
   detail is in Sentry and in `cron_runs.error`. The endpoint deliberately does
   not return it: `/api/match` is reachable by anyone who guesses a secret, and
   raw Postgres errors name tables.
4. **Nothing is lost while it is down.** The matcher is idempotent — the
   `outreach_once` index absorbs repeats — so a sweep that missed three nights
   catches up completely on the next successful run. Customers are not being told
   about new stock automatically in the meantime; the WhatsApp queue in Outreach
   still works by hand.

**Curl it directly:**

```bash
curl -s -H "x-revalidate-secret: $REVALIDATE_SECRET" https://<ops-host>/api/match
# {"queued":3,"at":"2026-08-09T04:00:12.000Z"}
```

---

## Telling one person about one machine

Everything below is per **want**, not per person. Somebody who asked for a fryer
in March and a cold room in June has two wants on their record, and the system
treats them as two separate conversations.

**Where the button is:**

| You are looking at | Where |
|---|---|
| A customer | Ops → Everyone → their page. Each want lists the stock that answers it, with *Email them about it* |
| A machine you are pricing | Ops → Stock → the item → *who wants one of these*, with *Email them about this one* |
| The queue the matcher built | Ops → Outreach. Same email, drafted for you, editable before it goes |

All three send the identical email through the identical code path, so the
deliberate route is never the lenient one. It carries the machine's photographs
inline, a link to each of its clips, and a link to its page on the website.

**One email is about one machine, always.** Two matching machines for two
different wants produce two emails, each quoting the sentence it answers. That
is deliberate: "we also have this other thing" is a catalogue.

**How often somebody can be written to:**

| Rule | Number |
|---|---|
| Messages about the same want | One every 7 days |
| Messages of any kind, per person | 3 in a rolling 7 days |
| Drafts waiting in the queue, per want | 1 |

The newsletter counts against all three, so a customer who got the monthly list
on Monday will not also get a match email on Tuesday. The numbers live in
`match_item_to_leads()` and in `packages/core/src/leads.ts`; changing one without
the other means the queue and the send button disagree.

When somebody is blocked, the app says so and tells you to phone them instead —
which is not marketing and has no cap on it.

---

## When a page comes out as plain black-and-white HTML

Times New Roman, blue underlined links, default grey buttons — the content is
all there and none of the styling is. It looks like the CSS was deleted.

It was not. The stylesheet 404s because the build output was overwritten while
the dev server was still using it, and the terminal will show it as something
that sounds unrelated:

```
⨯ Error: Cannot find module './3765.js'
Require stack: apps/ops/.next/server/webpack-runtime.js
```

**This should no longer be possible.** `next.config.mjs` in both apps sends the
dev server to `.next-dev` and the production build to `.next`, so
`npm run build` while `npm run dev` is running is now harmless — that split
exists for exactly this reason. If it happens anyway, something else has
corrupted the cache, and the fix is the same:

```bash
# stop the dev server first, then
rm -rf apps/ops/.next-dev        # or apps/web/.next-dev
npm run dev --workspace=@takemore/ops
```

Nothing is lost. Those directories are build output and are rebuilt from source
on the next start.

---

## When the website looks wrong

**Stock is stale.** The storefront caches for 300 seconds and ops pings
`/api/revalidate` on every change. If a change has not appeared after five
minutes, the webhook is failing — it is fire-and-forget by design and logs a
warning rather than blocking the save. Check `REVALIDATE_SECRET` matches on both
Vercel projects.

**A photo is broken.** Run `npm run check:launch:db`. It HEADs every published
photograph and names any that do not resolve — usually a Storage object deleted
while its row survived.

**A section has vanished** (testimonials, the Journal, the stats row). That is the
launch manifest working: nothing unverified renders. Run `npm run check:launch`
to see what is being withheld and why.

**A production deploy failed with "PRODUCTION BUILD REFUSED".** Also working —
the contact details in `apps/web/src/data/launch.ts` are still the mockup ones.
See the launch checklist.

---

## When a form stops accepting submissions

The storefront enquiry form is behind Cloudflare Turnstile, and **in production
it steps aside — showing the WhatsApp number and phone instead of a form — when
Turnstile is not configured**. That is deliberate: a form that silently loses
its bot protection is the failure this system is built to prevent, and a form
that accepts a visitor's typing and then refuses it is worse than no form.

If the form is missing on the live site, set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
and `TURNSTILE_SECRET_KEY` on the **storefront** Vercel project (both, or
neither — `npm run check:launch` warns on one without the other) and redeploy.
The ops app has no public form and needs neither key.

Local development, preview deployments and CI all pass without the keys.

---

## Sending the newsletter

1. Ops → Outreach → **What came in**. Machines currently listed are shown, with
   everything published since the last send ticked.
2. Write a subject and an intro. Save it as a draft.
3. **Preview & send.** This renders the actual email — the same template that
   sends, not a mock-up — with the sender line, the subject, the recipient count
   and both the HTML and plain-text versions. It warns about machines that have
   sold since you picked them.
4. Send from inside the preview.

**It cannot be undone, and it cannot be sent twice.** The duplicate protection is
a conditional `draft → sending` claim in SQL, so two people tapping at once
results in one send. The preview is the guard against the other failure: sending
the wrong thing once.

**Nobody receives it who has not agreed.** The audience is resolved at send time
from consent timestamps, never stored as a list — so somebody who unsubscribes
between drafting and sending is excluded automatically.

---

## Running the tests

```bash
npm run typecheck        # every workspace
npm run check:launch     # no credentials needed. Runs in CI on every push
npm run check:secrets    # no credential-shaped strings in tracked files
npm run test:schema      # no credentials either — see below

npm test                 # schema + RLS + parity + lead + order loops + email. Needs .env.local
npm run check:launch:db  # placeholder media and dead photos on live stock

# These need the ops app running (npm run dev --workspace=@takemore/ops)
npm run test:pages
npm run test:match
```

**The live suites write to the production database.** They create throwaway
accounts under `@takemore.test`, publish and delete items, and clean up in a
`finally`. Since the database became the one staff work in every day, they run
**by hand only** — from the Actions tab or a terminal, out of hours — never on
push and never on a schedule. See `.github/workflows/live.yml`. They also
consume item codes and order numbers from the live sequences, so do not run
them on the day before real stock goes in without expecting a gap in the codes.

**`npm run test:schema` is the exception, and the one to reach for first.** It
builds the whole schema from zero against a WASM Postgres from npm — no Docker,
no project, no credentials — then drives the parts that are pure database: the
item-code encoding, the delivery rule, the renumber, and a whole sale from
opening an order to cancelling it. It is the only suite that can tell you a
migration is broken *before* it touches anything real, and it is fast enough to
run on every change.

What it cannot tell you is anything about RLS as a signed-in person experiences
it: it runs as the owner, who bypasses row-level security. That is what
`npm run test:rls` is for, and the two are deliberately separate suites for
deliberately separate questions.

---

## Filling the site with demo stock (and emptying it again)

For showing the platform to somebody before there is real stock in it. Fifteen
invented machines with photographs and walkaround clips, fifteen invented
customers with wants and timelines, costs behind every unit so the Dashboard and
Money pages have numbers, and a live outreach queue.

```bash
npm run demo:seed        # ~2 minutes the first time: it downloads stills and
                         # builds the clips with ffmpeg, then caches both
npm run demo:seed -- --skip-video   # photos only, no ffmpeg needed
npm run demo:clear       # removes every trace of it
```

Seeding is idempotent — it clears any previous demo rows before writing, so
running it twice leaves one catalogue rather than two.

**It writes to the production database.** Everything it creates carries a marker
(`items.specs.demo_seed`, `leads.extra.demo_seed`) that neither app renders, and
`demo:clear` deletes on that marker and nothing else — Storage objects and
activity-log rows included, neither of which cascades on its own. Real stock
entered alongside it is invisible to the teardown.

**The honest caveat.** The publish gate requires a photograph of the actual
machine, and there is no way to put demo stock on the public site without
satisfying it. These photographs are real Storage objects of catering equipment
that is not ours. The constraint holds; its intent is suspended for as long as
the seed is loaded. `npm run demo:clear` ends it. Do not leave it loaded on a
domain the public can find — see the note under point 1 below.

---

## Applying a database change

```bash
npm run db:apply -- --dry-run   # what would run
npm run db:apply                # run it
npm run db:types                # regenerate packages/db/src/types.generated.ts
npm run typecheck               # the types just changed under the apps
```

Migrations are hand-written SQL in `supabase/migrations/`, applied in filename
order via the Management API rather than `supabase db push` — see
`supabase/README.md` for why. **Filenames must sort after the last applied one.**

Never edit a migration that has been applied. Write another one.

---

## Undoing a sale

A sale is one transaction and there are exactly two ways back out of it, both on the order's
own page. Neither deletes anything: the order stays, the customer's timeline keeps the
`purchased` entry, and the activity log records who undid what.

**"Correct the amount"** — the price was typed wrong, but the sale is real. Anybody, since
ranks were removed: it rewrites revenue that has already been reported, which is why it was
held back, and what settles it is that every reopen is stamped with an actor and explains
itself on the customer's timeline. The machines go back to
`reserved`, the order goes back to open, and you re-record the payment with the right figure.

**"Cancel this sale"** — the deal collapsed. Anyone can, deliberately: a wrong number nobody
can correct is worse than a correction anybody can audit. The machines go back to WHERE THEY
CAME FROM — the workshop, if that is where they were when they went on the order — and go
back on the website only if they come back to `For sale`; one that returns to the workshop
stays off it, because its repair is still not costed. The money comes off the reports on its
own — the status trigger
clears `sold_at` and `sale_price_cents` together, because the date it went and the price it
went for are one fact.

If the notice afterwards says a machine is "back in stock but not back on the website yet",
that machine no longer satisfies the publish gate — almost always a photograph that was
deleted while it was sold. Open it and look; the gate says which piece is missing.

---

## When the delivery distance will not look itself up

The order screen quotes delivery from the driving distance, and every failure lands in the
same place: type the kilometres in. That is a supported path, not a broken one, and the
order records which of the two answered (`delivery_km_source`).

| What it says | What it means |
|---|---|
| "Distance lookup is not set up" | `GOOGLE_MAPS_API_KEY` or `BUSINESS_ORIGIN_ADDRESS` is missing on the ops project |
| "Couldn't find that address" | Google answered, and there is no route to what was typed. A farm road, usually |
| "The distance lookup is down" | A timeout, a quota, or a bad key. Sentry has it |

The fee itself never depends on the lookup: `app.orders_before_write()` recomputes it from
whatever distance is stored, every time, so a hand-typed 100 km and a measured 100 km cost
the same R1 150.

---

## Rotating a key

| Key | Where | Then |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API Keys | Ops Vercel project only (the storefront never reads it), `.env.local`, GitHub secrets |
| `RESEND_API_KEY` | Resend dashboard | Ops Vercel project only |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile | Storefront only. The ops app has had no unauthenticated form since the access request was removed |
| `REVALIDATE_SECRET` | Any long random string | **Both projects, together** — they must match |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Tokens | `.env.local` and GitHub secrets. Not needed at runtime |
| `GOOGLE_MAPS_API_KEY` | Google Cloud → APIs & Services → Credentials | Ops only. Restrict it to the Routes API. While it is missing or wrong, the order screen simply asks for the kilometres — nothing breaks |

If a key has been committed, **rotate it — do not just delete the commit.**
`npm run check:secrets` scans tracked files, and the pre-commit hook runs it
against staged changes.

---

## The three things this system will not let you do

Worth knowing so they read as design rather than as bugs:

1. **Publish an item without a photograph of the actual machine.** A stock image
   will not satisfy the publish gate, and one cannot be attached to something
   already live. The demo seed above is the one thing that gets around the
   *intent* of this — it uploads its stock photography as real objects, because
   the gate leaves it no other way in. That is why it is a command you run and a
   command you undo, and not a fixture that lives in the database.
2. **Deploy to production with placeholder contact details.** The build fails,
   with a message naming what is missing.
3. **Ship a stock photo URL anywhere in the storefront source.** CI fails. The
   one exception is `apps/web/src/data/launch.ts`, where they are quarantined
   and never rendered.

The optional server setting `ASSET_FINANCE_INITIAL_PERCENT` pre-fills the initial
finance payment. Configure the agreed rate privately in each environment. Staff
review the amount and enter the expected final payment date before confirmation.


## Order charges and payment balances

Apply `20261012154553_order_charges_payments_and_availability.sql` with the normal
migration process before releasing these controls. It extends the generated total,
converts previously recorded full payments into the receipt ledger, and preserves
existing orders, receipts and issued documents.

Rental Finance offers an optional **Installation quote**. Select “Installation
accepted — charge through Take More” to include it. Save the quote before confirming
an agreement or recording a payment. Installation can change after payment; increases
leave the recorded money intact and show a new outstanding balance, while reductions
can leave a refund due. Delivery retains the existing distance tariff and controls.

Invoices show the order total, initial payment received, all payments and refunds,
and the outstanding balance. Balance zero shows **Fully paid**. A payment or amount
change issues an updated version when an invoice already exists; the application
also issues the first document when the configured business details permit it.
Earlier documents remain downloadable. A changed invoice must be sent to the customer
by staff; updating a document does not send it.

Staff see due payments in the Dashboard, Orders and the order detail. Lay-by and
seven-day reservations become **Overdue** after the calendar due date, using
Africa/Johannesburg, and show the unpaid amount and due date. Recording payment or
cancelling the order updates the indicators. “Copy customer payment reminder” prepares
a message telling the customer to use their name and surname as the reference.
Customer reminders are sent by staff. There is no automatic payment email/WhatsApp job;
the existing `/api/match` cron matches stock to interests.

Refund methods are Cash, Card machine and EFT. A refund records money already sent,
for a cancelled order or an overpayment. It does not transfer money. Hire uses 4% of
the asking price per day, with 15% off the daily rate from day 8; departure and return
days both count. Rates and order totals display two decimal places.

The website uses **Finance**, OPS uses **Rental Finance**, and condition code B displays
**Used**. Workshop reports are no longer shown or edited; historical notes remain
stored. The Facebook button links to the public page configured in `apps/web/src/data/site.ts`.
The condition guide remains at `/conditions`;
`/before-you-buy` is linked from product pages, Delivery & Collection and the footer.

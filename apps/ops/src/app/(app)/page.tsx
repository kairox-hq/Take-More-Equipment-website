import Link from "next/link";
import { listOrders } from "@/lib/orders";
import { planBalance, randsExact } from "@takemore/core";
import { Suspense } from "react";
import { getLastCronRun, listItems } from "@/lib/queries";
import { listLeads } from "@/lib/leads";
import { reportError } from "@takemore/observability";
import NewItemButton from "@/components/NewItemButton";
import CounterLookup from "@/components/CounterLookup";
import { requireStaff, supabase } from "@/lib/supabase";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  birthdayThisMonth,
  isOnHand,
  canSeeCosts,
  type ItemStatus,
} from "@takemore/core";
import { STATUS_CLASSES } from "@takemore/ui";
import dynamicImport from "next/dynamic";
import { normaliseItem, normaliseLead } from "./dashboard/metrics";

// Lazy so the staff variant of this page never references the Dashboard chunk
// at all — staff pay for the page they actually see, not for the manager's.
const Dashboard = dynamicImport(() => import("./dashboard/Dashboard"));

export const dynamic = "force-dynamic";

/**
 * The one place the business is looked at.
 *
 * Today, Board and Money used to be three nav entries. Between them they
 * answered "how many machines are there", "which bench is one on" and "what did
 * we make last month" — and none of them answered the question the people
 * scaling this business actually ask, which is some version of "is
 * refrigeration worth buying more of". That needs rotation, margin and cost in
 * the same view, sliced by category and subcategory, and it needed a dashboard
 * rather than a third table.
 *
 * ── Two different pages behind one URL ────────────────────────────────────
 *
 * A `staff` account cannot read the cost ledger — that is the point of the
 * item_costs design, not an oversight — so every money view returns nothing to
 * them. Rendering the manager's dashboard anyway would show a floor worth R0
 * with 100% margin, which is the worst class of bug this app has: a confidently
 * wrong number nobody flags.
 *
 * So staff get the operational page they always had, with the counter lookup
 * they use with a customer standing in front of them. Managers and the owner
 * get the dashboard. The role check here is a courtesy; RLS is the control.
 */
export default async function DashboardPage() {
  // In parallel: the sweep status needs no session to read, and RLS decides
  // what comes back regardless — awaiting it after the auth check was a full
  // extra round trip on the page everybody lands on.
  const [staff, lastSweep] = await Promise.all([requireStaff(), getLastCronRun()]);
  const firstName = staff.fullName.split(" ")[0];

  // The Suspense boundary is what lets the page start streaming as soon as
  // the auth check is answered: the skeleton paints while the dashboard's own
  // queries — the heaviest reads in the app — are still on the way.
  if (canSeeCosts(staff.role)) {
    return (
      <Suspense fallback={<HomeSkeleton />}>
        <PaymentAttention />
        <ManagerDashboard greeting={`${timeOfDay()}, ${firstName}`} sweep={lastSweep} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <PaymentAttention />
      <StaffToday greeting={`${timeOfDay()}, ${firstName}`} sweep={lastSweep} />
    </Suspense>
  );
}

/** The shape of either landing page while its data is on the way. */
function HomeSkeleton() {
  return (
    <div className="max-w-6xl animate-pulse" aria-busy="true" aria-label="Loading">
      <header className="mb-6">
        <div className="h-7 w-44 rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-64 rounded bg-white/[0.04] mt-2" />
      </header>
      <div className="flex flex-col gap-3">
        <div className="h-24 rounded-2xl bg-card border border-border" />
        <div className="h-24 rounded-2xl bg-card border border-border" />
        <div className="h-56 rounded-2xl bg-card border border-border" />
      </div>
    </div>
  );
}

/**
 * Cape Town, not wherever Vercel happens to run this.
 *
 * The server is in Europe and the reader is in the Western Cape, so an
 * unqualified `new Date().getHours()` greets somebody with "Evening" over lunch
 * for half the year. Computed on the server and passed down as a string, which
 * also keeps it out of the hydration diff.
 */
function timeOfDay(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

type Sweep = Awaited<ReturnType<typeof getLastCronRun>>;

// ---------------------------------------------------------------------------
// Managers and the owner
// ---------------------------------------------------------------------------

async function ManagerDashboard({ greeting, sweep }: { greeting: string; sweep: Sweep }) {
  const client = await supabase();

  const [items, leads, categories, subcategories] = await Promise.all([
    client.from("item_analytics").select("*"),
    client.from("lead_demand").select("*"),
    client
      .from("categories")
      .select("id, name, division:divisions(name, position)")
      .eq("active", true)
      .order("position"),
    client
      .from("subcategories")
      .select("id, name, category_id")
      .eq("active", true)
      .order("position"),
  ]);

  // Said out loud rather than swallowed. The alternative is a dashboard of
  // zeros that looks exactly like an answer — see the Money page header this
  // inherited the habit from.
  const failures = (
    [
      ["item_analytics", items.error],
      ["lead_demand", leads.error],
      ["categories", categories.error],
      ["subcategories", subcategories.error],
    ] as [string, { message: string } | null][]
  ).filter(([, error]) => error);

  for (const [view, error] of failures) {
    reportError(error!, { where: "ops/dashboard", view });
  }

  // Divisions first, then each division's own order — the picker groups the
  // options into <optgroup>s by consecutive run, so an interleaved list would
  // come out as alternating headings. PostgREST cannot sort a parent by an
  // embedded column; the sort below is stable, so `position` survives it.
  const categoryRows = (categories.data ?? [])
    .slice()
    .sort((a: any, b: any) => (a.division?.position ?? 0) - (b.division?.position ?? 0));

  const itemRows = (items.data ?? []).map((row) =>
    normaliseItem(row as Record<string, unknown>)
  );
  const leadRows = (leads.data ?? []).map((row) =>
    normaliseLead(row as Record<string, unknown>)
  );

  if (itemRows.length === 0 && failures.length === 0) {
    return (
      <div className="max-w-5xl">
        <header className="mb-6">
          <h1 className="text-xl md:text-2xl font-medium tracking-tight">{greeting}</h1>
          <p className="text-sm font-light text-muted mt-1">No stock yet.</p>
        </header>
        <SweepStatus run={sweep} />
        <FirstItemPrompt />
      </div>
    );
  }

  return (
    <>
      {failures.length > 0 && (
        <p className="max-w-6xl mb-4 text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
          Some of these numbers could not be loaded ({failures.map(([v]) => v).join(", ")}),
          so what is shown below is incomplete. This has been reported. Refresh
          in a moment, and tell Carlo if it keeps happening.
        </p>
      )}
      <div className="max-w-6xl">
        <SweepStatus run={sweep} />
      </div>
      <Dashboard
        greeting={greeting}
        items={itemRows}
        leads={leadRows}
        categories={categoryRows}
        subcategories={subcategories.data ?? []}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Everyone else
// ---------------------------------------------------------------------------

/**
 * Deliberately small, and unchanged in spirit from the Today page it replaces.
 *
 * A worker's landing page answers "who is this in front of me" and "what needs
 * doing", and nothing here needs a chart. The counter lookup stays at the top
 * because it is used with a customer standing there.
 */
async function StaffToday({ greeting, sweep }: { greeting: string; sweep: Sweep }) {
  const [items, leads] = await Promise.all([listItems(), listLeads()]);

  const onHand = items.filter((item) => isOnHand(item.status));
  const live = items.filter((item) => item.published_at).length;
  const birthdays = leads.filter((lead) => birthdayThisMonth(lead.birthday));

  const counts = new Map<ItemStatus, number>();
  for (const item of items) {
    if (item.status === "sold") continue;
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }

  // The one quietly costing shelf space.
  const oldest = [...onHand]
    .filter((item) => item.status !== "sold")
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))[0];

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">{greeting}</h1>
        <p className="text-sm font-light text-muted mt-1">
          {items.length === 0
            ? "No stock yet. Take in the first machine."
            : `${onHand.length} on hand · ${live} live on the site`}
        </p>
      </header>

      <CounterLookup leads={leads} />
      <SweepStatus run={sweep} />

      {birthdays.length > 0 && (
        <Link
          href="/leads"
          className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4 mb-4
                     hover:border-white/15 transition-colors"
        >
          <span className="w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center text-accent shrink-0">
            {/* gift-linear, not cake: the Solar set has no cake, and the name
                that looked right here rendered as an empty box for as long as
                nobody had a birthday to notice it on. */}
            <iconify-icon icon="solar:gift-linear" width="16" height="16" noobserver="" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-light text-white/85 truncate">
              {birthdays.length === 1
                ? `${birthdays[0].full_name ?? "Someone"} has a birthday this month`
                : `${birthdays.length} customers have birthdays this month`}
            </p>
            <p className="text-[11px] font-light text-muted">A message costs nothing.</p>
          </div>
        </Link>
      )}

      {items.length === 0 ? (
        <FirstItemPrompt />
      ) : (
        <>
          <Link
            href="/board"
            className="block bg-card border border-border rounded-2xl p-5 mb-3 hover:border-white/15 transition-colors"
          >
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-sm font-medium tracking-tight">Where everything is</h2>
              <iconify-icon
                icon="solar:arrow-right-linear"
                width="18"
                height="18"
                noobserver=""
                className="text-muted shrink-0"
              />
            </div>
            <ul className="space-y-2">
              {STATUS_ORDER.map((status) => (
                <li key={status} className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${STATUS_CLASSES[status].dot}`}
                  />
                  <span className="text-sm font-light text-white/80">
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="flex-1 h-px bg-white/5" />
                  <span className="text-sm font-light tabular-nums">
                    {counts.get(status) ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </Link>

          {oldest && (
            <Link
              href={`/items/${oldest.id}`}
              className="flex items-center justify-between gap-4 bg-card border border-border rounded-2xl p-5 hover:border-white/15 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                  Longest on the shelf
                </p>
                <p className="text-sm font-medium tracking-tight truncate">{oldest.title}</p>
                <p className="text-[11px] font-light text-muted mt-0.5">
                  {Math.round((Date.now() - +new Date(oldest.created_at)) / 86_400_000)} days ·{" "}
                  {STATUS_LABELS[oldest.status]}
                </p>
              </div>
              <iconify-icon
                icon="solar:arrow-right-linear"
                width="18"
                height="18"
                noobserver=""
                className="text-muted shrink-0"
              />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function FirstItemPrompt() {
  return (
    <NewItemButton className="block w-full bg-card border border-border rounded-2xl p-10 text-center hover:border-white/15 transition-colors">
      <div className="w-12 h-12 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mx-auto mb-4">
        <iconify-icon icon="solar:add-circle-linear" width="22" height="22" noobserver="" />
      </div>
      <p className="text-base font-medium tracking-tight mb-1">Take in your first item</p>
      <p className="text-sm font-light text-muted">Photograph it, price it, publish it.</p>
    </NewItemButton>
  );
}

/**
 * Did the nightly sweep run, and what did it do?
 *
 * The stock-match job fires at 04:00 and queues an outreach message for every
 * customer whose recorded want a new machine matches. Before cron_runs existed
 * it failed into a void — one console.error, a 500 returned to a scheduler that
 * reads 500s to nobody. It could have been broken for a month and the first
 * symptom would have been a customer asking why nobody told them.
 *
 * Shown only when there is something to say. A sweep that ran last night and
 * queued nothing is the normal case and does not need a row on the dashboard.
 */
function SweepStatus({ run }: { run: Sweep }) {
  // Never run at all is normal on a fresh deployment. It still gets a line —
  // a quiet one — because "nothing to show" and "the cron was never wired up"
  // look identical otherwise, and the second went unnoticed for three days once.
  if (!run) {
    return (
      <p className="text-[11px] font-light text-muted mb-4">
        The nightly stock match has not run yet. It runs at 04:00; until then, Outreach
        still works by hand.
      </p>
    );
  }

  const ageMs = Date.now() - new Date(run.started_at).getTime();
  const ageHours = ageMs / 3_600_000;
  // 26, not 24: a daily job jitters, and clocks change twice a year. A warning
  // that cries wolf monthly is one nobody reads.
  const stale = ageHours > 26;
  const failed = run.ok === false;
  // A run with no verdict is only "never finished" once it has had time to. A
  // sweep started ninety seconds ago is in flight, and calling that a failure
  // on the page somebody lands on right after pressing "Run match now" is
  // crying wolf on purpose.
  const inFlight = run.ok === null && !run.finished_at && ageMs < 2 * 60_000;
  const unfinished = run.ok === null && !inFlight;

  if (!stale && !failed && !unfinished) return null;

  const queued =
    run.result && typeof run.result === "object" && "queued" in run.result
      ? Number((run.result as { queued: unknown }).queued)
      : null;

  const message = failed
    ? "The nightly stock match failed."
    : unfinished
      ? "The nightly stock match started and never finished."
      : `The nightly stock match has not run for ${Math.floor(ageHours)} hours.`;

  return (
    <div className="flex items-start gap-3 bg-card border border-status-sold/30 rounded-2xl p-4 mb-4">
      <span className="w-9 h-9 rounded-xl bg-status-sold/10 border border-status-sold/30 flex items-center justify-center text-status-sold shrink-0">
        <iconify-icon icon="solar:danger-triangle-linear" width="16" height="16" noobserver="" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-light text-white/85">{message}</p>
        <p className="text-[11px] font-light text-muted mt-0.5">
          Customers are not being told about matching stock automatically. You
          can still send from Outreach by hand.
          {queued !== null && ` Last run queued ${queued}.`}
        </p>
      </div>
    </div>
  );
}

async function PaymentAttention() {
  try {
    const orders = await listOrders();
    let due = 0, refunds = 0;
    const overdue: { id: string; code: string; amount: number; date: string | null }[] = [];
    for (const order of orders) {
      const balance = planBalance(order, order.charged_total_cents ?? 0, order.receipts);
      if (order.status !== "void" && (balance.due > 0 || order.status === "paid" && order.charges_ready && balance.balance > 0)) due++;
      if (order.status === "void" ? balance.received > 0 : balance.refundDue > 0) refunds++;
      if (order.status !== "void" && order.plan_confirmed_at && ["layby","reservation"].includes(order.sale_plan ?? "") && balance.overdue > 0)
        overdue.push({ id: order.id, code: order.code, amount: balance.overdue, date: balance.overdueDate });
    }
    if (!due && !refunds && !overdue.length) return null;
    return <section className="mb-5 rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <h2 className="text-sm font-medium">Payment reminders</h2>
      <Link href="/orders" className="block text-sm text-accent">{due} payment{due === 1 ? "" : "s"} due · {refunds} refund{refunds === 1 ? "" : "s"} pending. Review orders →</Link>
      {overdue.length > 0 && <ul className="space-y-2 text-sm text-status-sold">{overdue.map(order => <li key={order.id}>
        <Link href={`/orders/${order.id}`}>{order.code} · Overdue {randsExact(order.amount)} · due {order.date} →</Link>
      </li>)}</ul>}
    </section>;
  } catch (error) {
    reportError(error, { where: "dashboard/payment-attention" });
    return <Link href="/orders" className="block mb-4 text-sm text-muted">Payment checks could not load. Open orders to review →</Link>;
  }
}

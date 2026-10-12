import { requireStaff } from "@/lib/supabase";
import { isOutOnHire, planBalance, randsExact as rands } from "@takemore/core";
import NewOrderButton from "@/components/NewOrderButton";
import { listOrders } from "@/lib/orders";
import OrdersBrowser from "./OrdersBrowser";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [, orders] = await Promise.all([requireStaff(), listOrders()]);

  const open = orders.filter((o) => o.status === "draft");
  const paid = orders.filter((o) => o.status === "paid" && (!o.charges_ready || planBalance(o, o.charged_total_cents ?? 0, o.receipts).balance === 0));
  const out = orders.filter(isOutOnHire);
  // What has actually been taken, ever. Charged rather than goods, because this
  // is the till's number and delivery is money that came in too.
  const taken = orders.reduce((sum, o) => sum + (o.charges_ready || o.plan_confirmed_at
    ? planBalance(o, o.charged_total_cents ?? 0, o.receipts).received
    : o.status === "paid" ? (o.charged_total_cents ?? 0) : 0), 0);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-5 h-1 rounded-full bg-accent" />
        <span className="text-accent uppercase text-[11px] tracking-wider">Orders</span>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-medium tracking-tight">
            {orders.length === 0
              ? "No sales yet"
              : `${paid.length} fully paid order${paid.length === 1 ? "" : "s"} · ${rands(taken)} received`}
          </h1>
          <p className="text-sm font-light text-muted mt-1">
            {[
              open.length > 0
                ? `${open.length} still open on the counter.`
                : "Nothing open on the counter.",
              out.length > 0
                ? `${out.length} rental${out.length === 1 ? "" : "s"} out.`
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>

        <NewOrderButton className="flex items-center gap-2 bg-accent text-background rounded-xl px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
          <iconify-icon icon="solar:cart-large-2-linear" width="16" height="16" noobserver="" />
          New order
        </NewOrderButton>
      </header>

      <OrdersBrowser orders={orders} />
    </div>
  );
}

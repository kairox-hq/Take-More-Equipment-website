import Link from "next/link";
import { STATUS_LABELS } from "@takemore/core";
import { Panel } from "@takemore/ui";
import type { ItemUnit } from "@/lib/queries";

export default function UnitInventory({ itemId, units }: { itemId: string; units: ItemUnit[] }) {
  const available = units.filter(u => !u.retired_at && !u.line && !["sold", "handed_over", "reserved"].includes(u.status)).length;
  return <Panel title="Physical units" subtitle={`${available} available · Each number stays with the same physical item.`}>
    <div className="flex justify-end mb-3"><a href={`/items/${itemId}/label`} target="_blank" rel="noreferrer" className="text-xs text-accent">Print unit labels</a></div>
    {units.length === 0 ? <p className="text-sm text-muted">No units recorded. Increase the total quantity to add stock.</p> :
      <ul className="divide-y divide-border">{units.map(unit => {
        const order = unit.line?.order;
        const status = unit.retired_at ? "Removed from stock" : unit.status === "sold" || unit.status === "handed_over" ? "Sold"
          : order && unit.status !== "reserved" ? `${STATUS_LABELS[unit.status]} · held`
          : order ? order.kind === "hire" && order.status === "paid" ? "On hire" : order.purchase_option === "layby" ? "On lay-by" : order.purchase_option === "asset_finance" ? "Rental Finance" : "Held"
          : unit.status === "listed" ? "Available" : STATUS_LABELS[unit.status];
        return <li key={unit.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
          <span className="font-mono">{unit.code}</span><span className="text-muted">{status}</span>
          {order && <Link href={`/orders/${order.id}`} className="text-accent">{order.code}</Link>}
          {!unit.retired_at && <a href={`/items/${itemId}/label?unit=${unit.id}`} target="_blank" rel="noreferrer" aria-label={`Print label ${unit.code}`} className="ml-auto text-xs text-muted hover:text-accent">Label</a>}
        </li>;
      })}</ul>}
  </Panel>;
}

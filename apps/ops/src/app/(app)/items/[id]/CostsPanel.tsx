"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COST_KIND_LABELS,
  LEDGER_COST_KINDS,
  marginCents,
  marginPercent,
  rands,
  type CostKind,
} from "@takemore/core";
import { Button, Field, Panel, RandInput, Select } from "@takemore/ui";
import { deleteCost, recordCost, setItemCost } from "../actions";

/**
 * What the machine cost us.
 *
 * Two of these are fixed boxes rather than dropdown options, because every unit
 * has both: something was paid for it at auction, and something was spent
 * putting it right. They write through set_item_cost(), which keeps one row per
 * kind — so correcting a typo corrects the number instead of appending a second
 * auction price underneath the first.
 *
 * Everything else stays a ledger a manager itemises later. Asking a worker
 * holding a phone in a warehouse to split a repair into parts and labour is how
 * you lose the ninety-second intake.
 *
 * Margin is recomputed here as the price is typed, before anything is saved, so
 * a manager can find a price rather than guess one and check afterwards. The
 * same arithmetic exists in SQL for the dashboards; a test asserts they agree.
 */
export default function CostsPanel({
  itemId,
  costs,
  auctionCents,
  workshopCents,
  onFixedCostChange,
  listPriceCents,
  unitCount = 1,
}: {
  itemId: string;
  costs: { id: string; kind: CostKind; amount_cents: number; note: string | null }[];
  auctionCents: number | null;
  workshopCents: number | null;
  onFixedCostChange: (kind: "auction" | "workshop", cents: number | null) => void;
  listPriceCents: number | null;
  unitCount?: number;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<CostKind>(LEDGER_COST_KINDS[0]);
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The fixed boxes hold their own state in the parent, so the checklist above
  // can react to them; the ledger rows are whatever the server last sent.
  const ledger = costs.filter((c) => c.kind !== "auction" && c.kind !== "workshop");
  const total =
    (auctionCents ?? 0) +
    (workshopCents ?? 0) +
    ledger.reduce((sum, c) => sum + c.amount_cents, 0);

  const askingTotal = listPriceCents === null ? null : listPriceCents * unitCount;
  const margin = marginCents(askingTotal, null, total);
  const percent = marginPercent(askingTotal, null, total);

  /**
   * What each fixed box last wrote. Blurring a box that has not changed used
   * to rewrite its row anyway — new id, incurred_on stamped today, created_by
   * set to whoever tabbed through the form — so the record said the auction
   * price was entered this morning by someone who only glanced at it.
   */
  const committed = useRef<{ auction: number | null; workshop: number | null }>({
    auction: auctionCents,
    workshop: workshopCents,
  });

  async function commitFixed(k: "auction" | "workshop", cents: number | null) {
    if ((cents ?? null) === committed.current[k]) return;
    setError(null);
    const result = await setItemCost(itemId, k, cents);
    if (!result.ok) return setError(result.error);
    committed.current[k] = cents ?? null;
    router.refresh();
  }

  async function remove(costId: string) {
    setError(null);
    const result = await deleteCost(itemId, costId);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function add() {
    if (!amount) return;
    setBusy(true);
    setError(null);
    const result = await recordCost(itemId, kind, amount);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setAmount(null);
    router.refresh();
  }

  return (
    <Panel
      title="What it cost us"
      subtitle={unitCount > 1 ? `Total costs for all ${unitCount} units. Orders receive their units’ share of this cost.` : "What was paid for it and what putting it right cost. Everyone on the team can see this."}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Auction price" required hint="what we paid for it">
            <RandInput
              valueCents={auctionCents}
              onChangeCents={(cents) => onFixedCostChange("auction", cents)}
              onBlur={() => commitFixed("auction", auctionCents)}
            />
          </Field>
          <Field label="Workshop cost" required hint="what putting it right cost">
            <RandInput
              valueCents={workshopCents}
              onChangeCents={(cents) => onFixedCostChange("workshop", cents)}
              onBlur={() => commitFixed("workshop", workshopCents)}
            />
          </Field>
        </div>

        {ledger.length > 0 && (
          <ul className="divide-y divide-white/5">
            {ledger.map((cost) => (
              <li key={cost.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-light">{COST_KIND_LABELS[cost.kind]}</p>
                  {cost.note && (
                    <p className="text-[11px] font-light text-muted truncate">{cost.note}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-light tabular-nums">
                    {rands(cost.amount_cents)}
                  </span>
                  <button
                    onClick={() => remove(cost.id)}
                    aria-label="Remove"
                    className="text-muted hover:text-status-sold transition-colors"
                  >
                    <iconify-icon icon="solar:trash-bin-trash-linear" width="14" height="14" noobserver="" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* The economics strip. Reads as a sentence: cost, price, what's left. */}
        <div className="grid grid-cols-3 gap-2 bg-background border border-border rounded-xl p-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Cost</p>
            <p className="text-sm font-light tabular-nums">{rands(total)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Asking{unitCount > 1 ? " · all units" : ""}</p>
            <p className="text-sm font-light tabular-nums">
              {askingTotal ? rands(askingTotal) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Margin</p>
            <p
              className={`text-sm font-medium tabular-nums ${
                margin === null ? "text-muted" : margin >= 0 ? "text-accent" : "text-status-sold"
              }`}
            >
              {margin === null ? "—" : rands(margin)}
              {percent !== null && (
                <span className="text-[11px] font-light text-muted ml-1">{percent}%</span>
              )}
            </p>
          </div>
        </div>

        {/* Anything beyond the two fixed boxes — transport, a part bought late. */}
        <details className="group">
          <summary className="text-xs font-light text-muted cursor-pointer hover:text-white transition-colors list-none flex items-center gap-1.5">
            <iconify-icon
              icon="solar:alt-arrow-right-linear"
              width="12"
              height="12"
              noobserver=""
              className="group-open:rotate-90 transition-transform"
            />
            Add another cost
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Kind">
                <Select value={kind} onChange={(e) => setKind(e.target.value as CostKind)}>
                  {LEDGER_COST_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {COST_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount">
                <RandInput valueCents={amount} onChangeCents={setAmount} />
              </Field>
            </div>
            <Button variant="secondary" onClick={add} loading={busy} disabled={!amount}>
              Add cost
            </Button>
          </div>
        </details>

        {error && <p className="text-xs text-status-sold">{error}</p>}
      </div>
    </Panel>
  );
}

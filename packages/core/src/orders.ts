/**
 * Orders — the words, and the one calculation the screen has to do twice.
 */

import type { Cents } from "./money.ts";

export const ORDER_STATUSES = ["draft", "paid", "void"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Open",
  paid: "Paid",
  void: "Cancelled",
};

/**
 * What the order is for. A sale sells the machines; a hire sends them out for
 * a period at a rate derived from the asking price (see hire.ts) and takes
 * them back. Chosen when the order is opened; the database freezes it once a
 * machine is on the order.
 */
export const ORDER_KINDS = ["sale", "hire"] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  sale: "Sale",
  hire: "Rental",
};

/**
 * A rental whose machines are still out: paid, and not yet stamped returned.
 * Shared by the orders list, its filter and the page header, so "out" means
 * one thing on every screen.
 */
export const isOutOnHire = (order: {
  kind: OrderKind;
  status: OrderStatus;
  hire_returned_at: string | null;
}): boolean => order.kind === "hire" && order.status === "paid" && !order.hire_returned_at;

export const PAYMENT_METHODS = ["card_machine", "bank_transfer", "payjustnow"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const REFUND_METHODS = ["cash", "card_machine", "bank_transfer"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];
export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  cash: "Cash", card_machine: "Card machine", bank_transfer: "EFT",
};

/**
 * What the salesperson ticks. Neither one moves money — the card machine and
 * the bank do that, and this records which of them it was so the day's takings
 * can be reconciled.
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod | RefundMethod, string> = {
  cash: "Cash",
  card_machine: "Card machine",
  bank_transfer: "Bank transfer",
  payjustnow: "PayJustNow",
};

export type OrderCharges = {
  delivery_fee_cents: number;
  installation_quote_cents?: number | null;
  installation_accepted?: boolean;
};
export const orderChargesCents = (order: OrderCharges): number =>
  order.delivery_fee_cents
  + (order.installation_accepted ? order.installation_quote_cents ?? 0 : 0);

/**
 * Split a discounted total across the machines it was agreed for.
 *
 * The discount is given on the order — "R45 000 for the pair" — but revenue is
 * reported per machine, so the total has to be divided. Pro-rata by asking
 * price: a machine that was 60% of the ask carries 60% of the discount, which
 * is the only split that leaves each unit's margin percentage recognisable
 * afterwards.
 *
 * Every line but the last is floored and the last absorbs the remainder — at
 * most (lines − 1) cents — so the parts sum to the whole EXACTLY. A scheme that
 * can be a cent out is a dashboard that disagrees with a bank statement, and
 * finding out which of them is wrong costs more than the cent.
 *
 * The twin is the allocation loop inside `public.confirm_order_paid()`, which
 * is the one that counts; this exists so the screen can show a per-machine
 * figure before anything is written. `listPriceCents` must arrive in the same
 * order the database will iterate — by `position`, then `id`.
 */
export const allocateSoldTotal = (
  soldTotalCents: Cents,
  listPriceCents: readonly Cents[]
): Cents[] => {
  const n = listPriceCents.length;
  if (n === 0) return [];

  const listSum = listPriceCents.reduce((sum, c) => sum + c, 0);
  const out: Cents[] = [];
  let running = 0;

  for (let i = 0; i < n; i++) {
    let alloc: number;
    if (i === n - 1) {
      // Also the whole answer in the common case of one machine: no division,
      // so no rounding to be wrong about.
      alloc = soldTotalCents - running;
    } else if (listSum > 0) {
      alloc = Math.floor((soldTotalCents * listPriceCents[i]) / listSum);
    } else {
      // Nothing on the order had a price yet. Splitting evenly beats refusing:
      // it is a legitimate state, and the salesperson has already agreed a
      // number with the customer standing in front of them.
      alloc = Math.floor(soldTotalCents / n);
    }
    running += alloc;
    out.push(alloc);
  }

  return out;
};

/**
 * How far the agreed price is under the asking price.
 *
 * Null rather than zero when there is nothing to compare against, so a screen
 * can tell "no discount" from "no prices yet" — the second one should say
 * nothing at all rather than claim a saving of zero.
 */
export const discountCents = (
  listTotalCents: Cents,
  soldTotalCents: Cents | null
): Cents | null => {
  if (soldTotalCents === null || listTotalCents <= 0) return null;
  return listTotalCents - soldTotalCents;
};

/** The same discount as a percentage of the ask, to one decimal. */
export const discountPercent = (
  listTotalCents: Cents,
  soldTotalCents: Cents | null
): number | null => {
  const off = discountCents(listTotalCents, soldTotalCents);
  if (off === null) return null;
  return Math.round((off / listTotalCents) * 1000) / 10;
};

/**
 * The whole order's economics: everything that came in, everything that went
 * out, and what is left as a share of the takings.
 *
 * ── Why the delivery fee is on BOTH sides ─────────────────────────────────
 *
 * The customer hands over the machines plus the delivery, so the delivery is
 * income. We then pay a driver, so it is also an expense. Counting it once and
 * not the other way round is the mistake this is shaped to avoid: put it only
 * in the income and every delivered order reports a profit nobody earned; put
 * it only in the costs and every delivered order reports a loss nobody took.
 *
 * Because it appears on both sides it CANCELS out of `marginCents`, which is
 * why this agrees to the cent with `order_economics.margin_cents` in the
 * database — that view reaches the same figure by leaving delivery out
 * entirely. What delivery changes is the PERCENTAGE, and it should: money that
 * passes straight through us is takings we keep nothing of, so a delivered
 * order really does keep a smaller share of a larger total.
 *
 * ── The assumption, stated out loud ───────────────────────────────────────
 *
 * `deliveryFeeCents` is what we CHARGE. What the driver actually costs is not
 * recorded anywhere in this system, so using the fee for both sides assumes
 * delivery breaks even. If a real driver cost is ever recorded, it belongs
 * here in place of the fee — and only then will the percentage be exact.
 */
export type OrderEconomics = {
  /** Everything the customer hands over: the machines plus the delivery. */
  revenueCents: Cents;
  /** What the machines cost us — the live total from the cost ledger. */
  goodsCostCents: Cents;
  /** The delivery we pass on to a driver. See the assumption above. */
  deliveryCostCents: Cents;
  costCents: Cents;
  /** Revenue minus costs. Equal to goods − goods cost; the delivery cancels. */
  marginCents: Cents;
  /**
   * Margin as a share of the takings, to one decimal. Signed, so a sale below
   * cost reads negative rather than quietly losing its minus.
   *
   * Null until a price has been agreed for the machines. Not merely tidy: on an
   * order that is being typed, the delivery fee is already set while the goods
   * total is still zero, so the arithmetic is perfectly willing to answer
   * −570% — a true statement about a sale that has not happened, and a
   * frightening thing to put in front of a salesperson mid-negotiation. The
   * rand figure is shown throughout; only the ratio waits for a real number.
   */
  percent: number | null;
};

export const orderEconomics = (
  /** The price agreed for the machines, before delivery. */
  goodsCents: Cents,
  deliveryFeeCents: Cents,
  goodsCostCents: Cents
): OrderEconomics => {
  const revenueCents = goodsCents + deliveryFeeCents;
  const costCents = goodsCostCents + deliveryFeeCents;
  const marginCents = revenueCents - costCents;
  return {
    revenueCents,
    goodsCostCents,
    deliveryCostCents: deliveryFeeCents,
    costCents,
    marginCents,
    percent:
      goodsCents > 0 && revenueCents > 0
        ? Math.round((marginCents / revenueCents) * 1000) / 10
        : null,
  };
};

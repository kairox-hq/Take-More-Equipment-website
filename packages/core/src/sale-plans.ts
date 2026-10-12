export const SALE_PLANS = ['immediate', 'layby', 'reservation', 'asset_finance'] as const;
export type SalePlan = typeof SALE_PLANS[number];
export const SALE_PLAN_LABELS: Record<SalePlan, string> = {
  immediate: 'Pay in full', layby: 'Lay-by', reservation: '7-day reservation', asset_finance: 'Rental Finance',
};
export type SaleTerms = {
  sale_plan: SalePlan | null; plan_start: string | null; plan_months: number | null;
  plan_payment_day: number | null; plan_deposit_cents: number | null;
  plan_final_due: string | null; plan_confirmed_at: string | null;
};
export type OrderReceipt = {
  id: string; amount_cents: number; entry_kind: 'payment' | 'refund'; method: string;
  reference: string; received_on: string; recorded_at: string;
};
export function todaySA() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date()); }
export function planDate(start: string, months: number, day: number) {
  const d = new Date(`${start}T12:00:00Z`);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months;
  return new Date(Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()), 12)).toISOString().slice(0, 10);
}
export function reservationDue(start: string) {
  const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10);
}
export function planBalance(terms: SaleTerms, total: number, receipts: OrderReceipt[], today = todaySA()) {
  const received = receipts.reduce((sum, r) => sum + (r.entry_kind === 'refund' ? -r.amount_cents : r.amount_cents), 0);
  const deposit = Math.min(total, terms.plan_deposit_cents ?? 0);
  const schedule = terms.plan_start && terms.plan_final_due ? [
    { date: terms.plan_start, target: deposit, label: 'Initial payment' },
    ...(terms.sale_plan === 'layby' && terms.plan_months && terms.plan_payment_day
      ? Array.from({ length: terms.plan_months }, (_, i) => ({
        date: planDate(terms.plan_start!, i + 1, terms.plan_payment_day!),
        target: Math.min(total, deposit + Math.ceil((total - deposit) / terms.plan_months!) * (i + 1)), label: `Instalment ${i + 1} of ${terms.plan_months}`,
      })) : [{ date: terms.plan_final_due, target: total, label: 'Final payment' }]),
  ] : [];
  const next = schedule.find(s => s.target > received);
  const dueTarget = schedule.filter(s => s.date <= today).at(-1)?.target ?? 0;
  const pastDue = schedule.filter(s => s.date < today && s.target > received);
  const overdue = Math.max(0, (pastDue.at(-1)?.target ?? 0) - received);
  return { received, balance: Math.max(0, total - received), refundDue: Math.max(0, received - total),
    due: Math.max(0, dueTarget - received), overdue, overdueDate: pastDue[0]?.date ?? null, next,
    monthly: terms.plan_months ? Math.ceil((total - deposit) / terms.plan_months) : null, schedule };
}

export const PURCHASE_OPTIONS = ['immediate', 'layby', 'reservation', 'hire', 'payjustnow', 'asset_finance'] as const;
export type PurchaseOption = typeof PURCHASE_OPTIONS[number];
export const PURCHASE_OPTION_LABELS: Record<PurchaseOption, string> = {
  immediate: 'Normal sale', layby: 'Lay-by', reservation: 'Deposit / 7-day reservation',
  hire: 'Hire', payjustnow: 'PayJustNow', asset_finance: 'Rental Finance',
};
export function purchaseOption(order: {purchase_option?: PurchaseOption | null; kind: string; sale_plan: SalePlan | null; payment_method: string | null}): PurchaseOption | null {
  if (order.purchase_option) return order.purchase_option;
  if (order.kind === 'hire') return 'hire';
  if (order.sale_plan === 'immediate' && order.payment_method === 'payjustnow') return 'payjustnow';
  return order.sale_plan;
}

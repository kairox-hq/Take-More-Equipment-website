import { supabase } from "./supabase";
import { reportError } from "@takemore/observability";
import type {
  PurchaseOption,
  SaleTerms,
  OrderReceipt,
  OrderCharges,
  InvoiceDocument,
  InvoiceKind,
  ItemStatus,
  OrderKind,
  OrderStatus,
  PaymentMethod,
} from "@takemore/core";
import type { MediaRef } from "./media";

/**
 * Reads for the order screen.
 *
 * Same posture as lib/queries.ts: the staff client, RLS decides, and a failed
 * read is reported rather than quietly becoming an empty list that reads as a
 * fact. The cost half is separated from the sale half for the reason
 * items/[id]/page.tsx separates them — the caller checks the role and skips the
 * fetch, so an account that may not see costs gets no panel rather than a panel
 * of zeroes.
 */

const orEmpty = <T>(
  where: string,
  result: { data: T[] | null; error: { message: string } | null }
): T[] => {
  if (result.error) reportError(result.error, { where });
  return result.data ?? [];
};

export type OrderRow = SaleTerms & OrderCharges & {
  charges_ready: boolean;
  purchase_option: PurchaseOption | null;
  sale_plans_ready: boolean;
  receipts: OrderReceipt[];
  id: string;
  code: string;
  status: OrderStatus;
  kind: OrderKind;
  hire_start: string | null;
  hire_end: string | null;
  hire_returned_at: string | null;
  sold_total_cents: number | null;
  delivery: boolean;
  delivery_fee_cents: number;
  charged_total_cents: number | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  created_at: string;
  voided_at: string | null;
  lead: { id: string; full_name: string | null; business_name: string | null; phone: string | null } | null;
  lines: { item_id: string }[];
};

const ORDER_LIST_SELECT = `
  id, code, status, kind, hire_start, hire_end, hire_returned_at,
  purchase_option, sale_plan, plan_start, plan_months, plan_payment_day, plan_deposit_cents, plan_final_due, plan_confirmed_at,
  receipts:order_receipts(id,amount_cents,entry_kind,method,reference,received_on,recorded_at),
  sold_total_cents, delivery, delivery_fee_cents, installation_quote_cents, installation_accepted,
  charged_total_cents, payment_method, paid_at, created_at, voided_at,
  lead:leads(id, full_name, business_name, phone),
  lines:order_lines(item_id)
`;

/**
 * Every order, newest first, filtered in the browser.
 *
 * Same call as listLeads() and for the same reason: at a few hundred sales a
 * year the whole table is smaller than the JavaScript that would page it, and
 * instant filtering is the difference between a list somebody uses and a list
 * somebody avoids.
 */
const planSchemaMissing = (error: { message: string } | null) => Boolean(error && /purchase_option|sale_plan|plan_start|order_receipts/.test(error.message) && /does not exist|schema cache|relationship/.test(error.message));
const chargeSchemaMissing = (error: { message: string } | null) => Boolean(error && /installation_quote_cents|installation_accepted/.test(error.message));
const withoutCharges = (select: string) => select.replace(/(?:installation_quote_cents|installation_accepted), ?/g, "");
const pendingCharges = { charges_ready: false, installation_quote_cents: null, installation_accepted: false };
const legacySelect = (select: string) => select
  .replace(/purchase_option, /g, "")
  .replace(/sale_plan, plan_start, plan_months, plan_payment_day, plan_deposit_cents, plan_final_due, plan_confirmed_at,/g, "")
  .replace(/receipts:order_receipts\([^)]*\),/g, "");
const pendingPlan = { purchase_option: null, sale_plans_ready: false, sale_plan: null, plan_start: null, plan_months: null, plan_payment_day: null, plan_deposit_cents: null, plan_final_due: null, plan_confirmed_at: null, receipts: [] };
export async function listOrders(): Promise<OrderRow[]> {
  const client = await supabase();
  let result = await client.from("orders").select(String(ORDER_LIST_SELECT)).order("created_at", { ascending: false });
  const chargesReady = !chargeSchemaMissing(result.error);
  if (!chargesReady) result = await client.from("orders").select(withoutCharges(ORDER_LIST_SELECT)).order("created_at", { ascending: false });
  if (planSchemaMissing(result.error)) {
    const legacy = await client.from("orders").select(legacySelect(withoutCharges(ORDER_LIST_SELECT))).order("created_at", { ascending: false });
    if (legacy.error) throw new Error(legacy.error.message);
    return ((legacy.data ?? []) as unknown as Record<string, unknown>[]).map(row => ({ ...pendingCharges, ...pendingPlan, ...row })) as unknown as OrderRow[];
  }
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as unknown as Record<string, unknown>[]).map(row => ({ ...pendingCharges, ...row, sale_plans_ready: true, charges_ready: chargesReady })) as unknown as OrderRow[];
}

export type OrderDetail = SaleTerms & OrderCharges & {
  charges_ready: boolean;
  purchase_option: PurchaseOption | null;
  sale_plans_ready: boolean;
  receipts: OrderReceipt[];
  id: string;
  code: string;
  status: OrderStatus;
  /** Sale or hire. Frozen once an agreement or payment has been confirmed. */
  kind: OrderKind;
  /** `2026-09-01`. Both null on a sale; both required before a hire is paid. */
  hire_start: string | null;
  hire_end: string | null;
  /** Stamped by return_hire(). Null on a sale, and on a hire still out. */
  hire_returned_at: string | null;
  lead_id: string | null;
  sold_total_cents: number | null;
  delivery: boolean;
  delivery_address: string | null;
  delivery_km: number | null;
  delivery_km_source: string | null;
  delivery_fee_cents: number;
  charged_total_cents: number | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  paid_at: string | null;
  /**
   * Who took the money — and, incidentally, the only memory this row keeps of
   * ever having been paid. reopen_order() clears the payment fields but leaves
   * this one alone, so a draft with a `sold_by` is a corrected sale rather than
   * an order nobody finished. discardOrder() is the caller that cares.
   */
  sold_by: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  lead: {
    id: string;
    full_name: string | null;
    business_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const client = await supabase();
  const select = `id, code, status, kind, hire_start, hire_end, hire_returned_at,
       purchase_option, sale_plan, plan_start, plan_months, plan_payment_day, plan_deposit_cents, plan_final_due, plan_confirmed_at,
       receipts:order_receipts(id,amount_cents,entry_kind,method,reference,received_on,recorded_at),
       lead_id, sold_total_cents, delivery, delivery_address,
       delivery_km, delivery_km_source, delivery_fee_cents, installation_quote_cents, installation_accepted, charged_total_cents,
       payment_method, payment_reference, paid_at, sold_by, notes, voided_at, void_reason,
       created_at,
       lead:leads(id, full_name, business_name, email, phone)`;
  let result = await client.from("orders").select(select).eq("id", id).maybeSingle();
  const chargesReady = !chargeSchemaMissing(result.error);
  if (!chargesReady) result = await client.from("orders").select(withoutCharges(select)).eq("id", id).maybeSingle();
  if (planSchemaMissing(result.error)) {
    const legacy = await client.from("orders").select(legacySelect(withoutCharges(select))).eq("id", id).maybeSingle();
    if (legacy.error) throw new Error(legacy.error.message);
    return legacy.data ? { ...pendingCharges, ...pendingPlan, ...(legacy.data as unknown as Record<string, unknown>) } as unknown as OrderDetail : null;
  }
  if (result.error) throw new Error(result.error.message);
  return result.data ? { ...pendingCharges, ...result.data, sale_plans_ready: true, charges_ready: chargesReady } as unknown as OrderDetail : null;
}

export type OrderLineRow = {
  id: string;
  item_id: string;
  item_unit_id: string;
  unit_code: string;
  position: number;
  list_price_cents: number;
  retail_price_cents: number | null;
  sold_price_cents: number | null;
  item: {
    id: string;
    sku: string;
    title: string;
    brand: string | null;
    status: ItemStatus;
    media: MediaRef[];
  } | null;
};

/**
 * Ordered by `position` and then `id` — the same order confirm_order_paid()
 * iterates in. It has to be: the last line absorbs the rounding remainder, so a
 * screen that previewed the split in a different order would show one machine a
 * few cents different from what the database is about to write.
 */
export async function getOrderLines(orderId: string): Promise<OrderLineRow[]> {
  const client = await supabase();
  const { data, error } = await client
    .from("order_lines")
    .select(
      `id, item_id, item_unit_id, unit_code, position, list_price_cents, retail_price_cents, sold_price_cents,
         item:items(id, sku, title, brand, status,
                    media:item_media(id, kind, storage_path, external_url, position, alt_text))`
    )
    .eq("order_id", orderId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderLineRow[];
}

export type OrderLineCost = {
  line_id: string;
  item_id: string;
  cost_purchase_cents: number;
  cost_refurb_cents: number;
  cost_other_cents: number;
  cost_total_cents: number;
};

export type OrderEconomics = {
  list_total_cents: number;
  retail_total_cents: number;
  cost_purchase_cents: number;
  cost_refurb_cents: number;
  cost_other_cents: number;
  cost_total_cents: number;
  margin_cents: number;
};

/**
 * The cost floor, read live from item_costs through the two guarded views.
 *
 * Nothing is snapshotted onto the order: item_costs rows persist for a sold
 * machine, so reading them live is both truthful and automatically equal to
 * what item_analytics says about the same unit. A stored copy could disagree
 * with its own ledger, which is the failure item_economics exists to avoid.
 *
 * Returns nulls rather than zeroes when the reader may not see costs, so the
 * caller can render nothing at all instead of a floor of R0.
 */
export async function getOrderEconomics(
  orderId: string
): Promise<{ order: OrderEconomics | null; lines: OrderLineCost[] }> {
  const client = await supabase();

  const [orderResult, lineResult] = await Promise.all([
    client
      .from("order_economics")
      .select(
        `list_total_cents, retail_total_cents, cost_purchase_cents,
         cost_refurb_cents, cost_other_cents, cost_total_cents, margin_cents`
      )
      .eq("order_id", orderId)
      .maybeSingle(),
    client
      .from("order_line_economics")
      .select(
        `line_id, item_id, cost_purchase_cents, cost_refurb_cents,
         cost_other_cents, cost_total_cents`
      )
      .eq("order_id", orderId),
  ]);

  if (orderResult.error) reportError(orderResult.error, { where: "orders/getOrderEconomics" });

  return {
    order: (orderResult.data as unknown as OrderEconomics | null) ?? null,
    lines: orEmpty("orders/getOrderLineCosts", lineResult) as unknown as OrderLineCost[],
  };
}

/**
 * One issued document, as the order screen lists it.
 *
 * `document` is deliberately NOT here. Everything the screen shows — the
 * number, the total, when it went out — is a column beside it, and the PDF
 * route reads the jsonb on its own. Selecting it here would ship every
 * invoice's full contents to the browser on every order page load, to read one
 * string off the newest one.
 */
export type OrderInvoiceRow = {
  id: string;
  kind: InvoiceKind;
  number: string;
  total_cents: number;
  received_cents: number;
  balance_cents: number;
  issued_at: string;
  supersedes: string | null;
};

/**
 * Every document ever issued for this order, newest first.
 *
 * All of them, never just the current one. A reopened and re-confirmed sale
 * issues a second invoice rather than editing the first, so "what did we
 * actually hand this person" is a question with more than one answer and the
 * screen has to be able to show the older one — which is the entire reason
 * order_invoices has a `supersedes` column instead of an UPDATE policy.
 */
export async function getOrderInvoices(orderId: string): Promise<OrderInvoiceRow[]> {
  const client = await supabase();
  let result = await client.from("order_invoices")
    .select("id, kind, number, total_cents, received_cents, balance_cents, issued_at, supersedes")
    .eq("order_id", orderId).order("issued_at", { ascending: false }).order("number", { ascending: false });
  if (result.error && /received_cents|balance_cents/.test(result.error.message)) {
    const legacy = await client.from("order_invoices").select("id, kind, number, total_cents, issued_at, supersedes")
      .eq("order_id", orderId).order("issued_at", { ascending: false }).order("number", { ascending: false });
    return orEmpty("orders/getOrderInvoices", legacy).map(row => ({ ...row,
      received_cents: row.kind === "invoice" ? row.total_cents : 0,
      balance_cents: row.kind === "invoice" ? 0 : row.total_cents,
    })) as unknown as OrderInvoiceRow[];
  }
  return orEmpty("orders/getOrderInvoices", result) as unknown as OrderInvoiceRow[];
}

/** One document, for the PDF route. Null when RLS or the id says no. */
export async function getInvoiceDocument(
  invoiceId: string
): Promise<InvoiceDocument | null> {
  const client = await supabase();
  const { data, error } = await client
    .from("order_invoices")
    .select("document")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    reportError(error, { where: "orders/getInvoiceDocument" });
    throw new Error(error.message);
  }
  return (data?.document as InvoiceDocument | undefined) ?? null;
}

/** For the orders badge and the dashboard: sales still open on the counter. */
export async function countOpenOrders(): Promise<number> {
  const client = await supabase();
  const { count, error } = await client
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft");

  if (error) {
    reportError(error, { where: "orders/countOpenOrders" });
    return 0;
  }
  return count ?? 0;
}

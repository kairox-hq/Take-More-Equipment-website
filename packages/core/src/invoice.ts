/**
 * The document the customer walks out with.
 *
 * This file is the SHAPE and the CHECK. It deliberately does not compute an
 * invoice — `public.issue_invoice()` does that, once, inside the transaction
 * that freezes it, and a second implementation here would be a second answer
 * that can disagree with the one on the customer's paper.
 *
 * That makes it different from delivery.ts and phone.ts, which really are twins
 * of their SQL counterparts and are pinned to them by the parity suite. Here
 * there is nothing to pin: the renderer reads `document` and prints it.
 * `checkInvoiceTotals()` below is the one piece of arithmetic, and it exists to
 * REFUSE a document rather than to produce one.
 */

import type { Cents } from "./money.ts";
import type { OrderReceipt } from "./sale-plans.ts";
import type { PaymentMethod } from "./orders.ts";

export const INVOICE_KINDS = ["proforma", "invoice"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

/**
 * What goes at the top of the page — and the reason this is a lookup rather
 * than a string at the call site.
 *
 * "Tax invoice" is not one of the options and must never become one. Only a
 * registered VAT vendor may head a document with those words (VAT Act 89 of
 * 1991, s20) and Take More is not registered; issuing one anyway is an offence,
 * not a wording preference. `issue_invoice()` refuses an issuer carrying a VAT
 * number for the same reason, so the rule is enforced at both ends rather than
 * remembered at either.
 */
export const INVOICE_HEADINGS: Record<InvoiceKind, string> = {
  proforma: "Proforma Invoice",
  invoice: "Invoice",
};

/** The line under the heading that says what the reader is holding. */
export const INVOICE_STANDFIRST: Record<InvoiceKind, string> = {
  proforma: "This is a request for payment, not a receipt. Nothing has been paid yet.",
  invoice: "Paid in full. Thank you.",
};

export type InvoiceIssuer = {
  legal_name: string;
  registration_number: string;
  address: string;
  phone?: string | null;
  email?: string | null;
  bank?: {
    name: string;
    account_name: string;
    type: string;
    number: string;
  } | null;
  terms_days?: number | null;
  /**
   * Present in the type only so that adding one is a compile error somewhere
   * rather than a silent extra field. There is no VAT on any document this
   * system issues; see INVOICE_HEADINGS.
   */
  vat_number?: never;
};

export type InvoiceCustomer = {
  name: string | null;
  business: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type InvoiceLine = {
  /** The machine's short code — A042 — so the line is identifiable a year later. */
  code: string;
  description: string;
  qty: number;
  unit_cents: Cents;
  total_cents: Cents;
};

export type InvoiceDelivery = {
  address: string | null;
  km: number | null;
  fee_cents: Cents;
};

/** Present on a hire only: the period the lines were priced for. */
export type InvoiceHire = {
  /** `2026-09-01`, a calendar day. */
  start: string;
  end: string;
  days: number;
};

export type InvoicePayment = {
  method: PaymentMethod | null;
  reference: string | null;
  paid_at: string | null;
};

/**
 * One issued document, exactly as `order_invoices.document` stores it.
 *
 * Every field is a copy taken at the moment of issue. Nothing here is a
 * reference to a row that could since have changed — which is the whole point,
 * and is why the renderer takes this and no database client.
 */
export type InvoiceDocument = {
  kind: InvoiceKind;
  number: string;
  issued_at: string;
  due_at: string;
  order_code: string;
  issuer: InvoiceIssuer;
  customer: InvoiceCustomer;
  lines: InvoiceLine[];
  /**
   * The hire period, when the document is for one. Absent or null on a sale,
   * and on documents issued before hires existed.
   */
  hire?: InvoiceHire | null;
  /** Whatever was written on the order: a hire period, a collection arrangement. */
  note: string | null;
  subtotal_cents: Cents;
  /** Negative is a discount; positive means it sold above the asking price. */
  adjustment_cents: Cents;
  delivery: InvoiceDelivery | null;
  total_cents: Cents;
  charges?: { installation_cents: Cents };
  payments?: OrderReceipt[];
  deposit_cents?: Cents | null;
  received_cents?: Cents;
  balance_cents?: Cents;
  refund_due_cents?: Cents;
  payment: InvoicePayment | null;
};

/**
 * Does this document add up?
 *
 * Called by the renderer before it draws anything. A PDF whose lines do not sum
 * to its own total is worse than no PDF: it is handed over, filed, and argued
 * about later by two people who both believe their copy.
 *
 * It re-derives rather than trusting `subtotal_cents`, so a document assembled
 * by anything other than `issue_invoice()` — a hand-written backfill, a future
 * import from the old spreadsheet — is caught here rather than printed.
 *
 * Returns the fault as a sentence, or null when it is sound.
 */
export const checkInvoiceTotals = (doc: InvoiceDocument): string | null => {
  const lines = doc.lines ?? [];
  if (lines.length === 0) return "There are no machines on this document.";

  for (const line of lines) {
    if (line.unit_cents * line.qty !== line.total_cents) {
      return `${line.code}: ${line.qty} × ${line.unit_cents} does not make ${line.total_cents}.`;
    }
  }

  const subtotal = lines.reduce((sum, line) => sum + line.total_cents, 0);
  if (subtotal !== doc.subtotal_cents) {
    return `The lines come to ${subtotal} but the subtotal says ${doc.subtotal_cents}.`;
  }

  const total = subtotal + doc.adjustment_cents + (doc.delivery?.fee_cents ?? 0)
    + (doc.charges?.installation_cents ?? 0);
  if (total !== doc.total_cents) {
    return `Subtotal, adjustment and charges come to ${total} but the total says ${doc.total_cents}.`;
  }

  if (doc.received_cents !== undefined && doc.payments) {
    const received = doc.payments.reduce((sum, r) => sum + (r.entry_kind === "refund" ? -r.amount_cents : r.amount_cents), 0);
    if (received !== doc.received_cents) return "Payment history does not match the amount received.";
    if (doc.balance_cents !== Math.max(0, total - received)) return "Outstanding balance does not match the total and payments.";
    if (doc.refund_due_cents !== Math.max(0, received - total)) return "Refund due does not match the total and payments.";
  }

  return null;
};

/**
 * Who this is addressed to, in one line.
 *
 * The business wins over the person, because an invoice is a document a
 * business files — and the contact person is shown underneath it, which is
 * exactly the split Take More's own spreadsheet already used.
 */
export const invoiceAddressee = (customer: InvoiceCustomer): string =>
  customer.business?.trim() || customer.name?.trim() || "Customer";

/**
 * `INV-0015 Take More.pdf`.
 *
 * The number leads, because a folder of these sorts into issue order on its
 * own, and somebody looking for one is looking for its number. Spaces rather
 * than dashes: this lands in a WhatsApp attachment list on a phone, where it is
 * read rather than typed.
 *
 * Takes only the number, not the whole document, so the order screen can name
 * the file from the row it already has. It used to take an InvoiceDocument, and
 * the cost of that was every invoice's full JSON being fetched and shipped to
 * the browser on every order page load — to read one string off it.
 */
export const invoiceFilename = (doc: { number: string }): string =>
  `${doc.number} Take More.pdf`;

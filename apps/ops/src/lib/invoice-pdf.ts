import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  INVOICE_HEADINGS,
  PAYMENT_METHOD_LABELS,
  REFUND_METHOD_LABELS,
  checkInvoiceTotals,
  formatPhone,
  invoiceAddressee,
  randsExact,
  type InvoiceDocument,
  type InvoiceLine,
} from "@takemore/core";

/**
 * The invoice, drawn.
 *
 * ── Why a PDF and not a print stylesheet ──────────────────────────────────
 *
 * The label page in (print) proves an HTML page comes out of a printer
 * perfectly well, and printing was the easy third of this. The other two thirds
 * are not: a customer needs a FILE — to be sent to them, to be filed, to be
 * opened in six months when the machine breaks — and "press Ctrl+P and choose
 * Save as PDF" is not a file, it is an instruction that produces a different
 * document depending on who followed it and in which browser.
 *
 * So the PDF is the artefact and printing means printing the PDF. One layout,
 * three destinations. An HTML twin for the printer would be a second layout
 * that starts identical and stays identical for about a month.
 *
 * ── Why pdf-lib, and why NOT @react-pdf/renderer ──────────────────────────
 *
 * @react-pdf/renderer was the first choice and had to be abandoned, for a
 * reason worth writing down so nobody tries it again:
 *
 *   Next 15 does not use the React in node_modules for server code. It vendors
 *   its own — 19.2.0-canary here — so JSX compiled inside this app produces
 *   `Symbol(react.transitional.element)` elements. @react-pdf/renderer picks
 *   its internal reconciler by reading `React.version` from node_modules, sees
 *   18.3.1, loads the React 18 reconciler, and that reconciler does not
 *   recognise a React 19 element. Every render dies on "Minified React error
 *   #31" from inside a PDF library, which is a spectacularly unhelpful place
 *   for a React version mismatch to surface.
 *
 *   Pinning around that means pinning two React copies to each other across a
 *   boundary neither app controls. The next Next upgrade breaks it again.
 *
 * pdf-lib has no React in it at all, so the coupling does not exist. It is pure
 * JavaScript with no WASM and no font files on disk — Helvetica and Courier are
 * in every PDF reader by specification — so it also rules out the other way
 * this fails on Vercel, which is a bundler rewriting a path to a .ttf.
 *
 * The price is that there is no flexbox: every position below is computed.
 * For one page of A4 whose shape never changes that is a fair trade, and it
 * buys exact control over where a rule sits.
 *
 * ── The document is the input, and the only input ─────────────────────────
 *
 * This takes an InvoiceDocument and no database client, deliberately. It cannot
 * accidentally read a machine's current name or the customer's current phone
 * number because it has no way to reach them. Everything it prints was frozen
 * by issue_invoice() at the moment the customer was standing at the counter.
 */

// ── Page geometry, in points. A4 is 595.28 × 841.89. ───────────────────────
const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const RIGHT = PAGE[0] - MARGIN;
const WIDTH = PAGE[0] - MARGIN * 2;
/** Below this the page is full: enough room for one more row and the footer. */
const FLOOR = 96;

const TEAL = rgb(0.071, 0.247, 0.259); // #123f42, the mark's own colour
const INK = rgb(0.102, 0.102, 0.09);
const SOFT = rgb(0.42, 0.42, 0.385);
const RULE = rgb(0.847, 0.847, 0.816);
const TINT = rgb(0.953, 0.937, 0.902); // brand cream
const WHITE = rgb(1, 1, 1);

/**
 * The mark, as three SVG paths against its own 832 × 623.37 viewBox.
 *
 * Transcribed from assets/brand/takemore-logomark.svg — the two `polygon`
 * elements rewritten as closed paths, the `path` verbatim. pdf-lib draws SVG
 * path data directly, so the alternative was a PNG produced by a build step:
 * one more generated artefact to keep in step with a logo that changes never.
 */
const LOGO = [
  "M766.33,225.29 L766.33,62.97 L416,62.97 L578.56,225.29 Z",
  "M578.56,225.29H253.43L63.1,415.63l114.77,114.77,117.7-117.7c14.49-14.49,39.27-4.23,39.27,16.27v131.42h162.32v-131.42c0-20.5,24.78-30.76,39.27-16.27l117.7,117.7,114.77-114.77-190.34-190.34Z",
  "M65.66,62.97 L65.66,225.29 L253.43,225.29 L416,62.97 Z",
];

/**
 * Anything a customer's name might contain, reduced to what Helvetica can
 * actually put on a page.
 *
 * The standard fonts are WinAnsi-encoded — Latin-1 plus a strip of typography —
 * and pdf-lib THROWS on a character outside it rather than dropping it. Left
 * alone, that means a customer called Łukasz, a machine described with a "×",
 * or a note someone pasted out of Word with curly quotes in it, does not
 * produce a slightly wrong invoice. It produces no invoice, at the till, with
 * the customer standing there.
 *
 * So the typography is folded to its ASCII equivalent and anything still
 * outside Latin-1 is dropped. Afrikaans and every accent this business
 * realistically meets — ë ê ï ô û é á — are inside Latin-1 and survive
 * untouched. Embedding a Unicode TTF would be the complete fix and costs a font
 * file in the repo and a bundler that has to be told about it; that trade can
 * be made the day somebody is actually turned away by it.
 */
const safe = (value: string | null | undefined): string =>
  (value ?? "")
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    // rands() groups with a non-breaking space on purpose — it stops "R42 500"
    // wrapping across two lines in HTML. Nothing wraps inside a table cell
    // here, and a plain space is the character every reader renders alike.
    .replace(/\u00a0/g, " ")
    // Control ranges. U+0080–U+009F are printable in WinAnsi but control
    // characters in Unicode, so a string carrying one got it from a paste
    // rather than from a person.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    // Everything still outside Latin-1, dropped rather than thrown on.
    .replace(/[^\u0020-\u00ff]/g, "");

/** Two decimal places throughout, matching the exact amounts charged. */
type Money = (cents: number) => string;

const moneyFor = (_doc: InvoiceDocument): Money => cents => safe(randsExact(cents));

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };

/**
 * A drawing surface that remembers how far down the page it has got.
 *
 * pdf-lib measures from the bottom-left and an invoice is written from the top,
 * so `y` here counts DOWN from the top edge and is converted on the way out.
 * Everything below thinks in "how far down the page", which is how the layout
 * is actually reasoned about.
 */
class Sheet {
  page: PDFPage;
  y = MARGIN;

  constructor(
    private pdf: PDFDocument,
    private fonts: Fonts
  ) {
    this.page = pdf.addPage(PAGE);
  }

  /** A fresh page, for an order with more machines than fit on one. */
  break() {
    this.page = this.pdf.addPage(PAGE);
    this.y = MARGIN;
  }

  /**
   * Start a new page unless this much more will fit on this one.
   *
   * The table breaks itself row by row, but everything drawn after it — the
   * hire period, the note, the totals block, the banking panel — used to be
   * placed wherever the last row left off, which on a long order was below the
   * bottom edge. Called with the height of the block about to be drawn, so a
   * block is never split and never off the page.
   */
  ensure(needed: number) {
    if (this.y + needed > PAGE[1] - FLOOR) this.break();
  }

  private at = (down: number) => PAGE[1] - down;

  width(text: string, size: number, bold = false) {
    return (bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(safe(text), size);
  }

  /**
   * The largest size at which this fits the space, down to a floor.
   *
   * For the company name in the masthead. `legalName` is whatever CIPC has on
   * record — "Take More Equipment (Pty) Ltd" sits comfortably beside the
   * reference box at 14pt, and a business that registers a longer name should
   * get a slightly smaller masthead rather than a name running underneath its
   * own invoice number.
   */
  fit(text: string, max: number, from: number, floor = 9) {
    let size = from;
    while (size > floor && this.width(text, size, true) > max) size -= 0.5;
    return size;
  }

  text(
    value: string,
    x: number,
    down: number,
    {
      size = 9,
      font = "regular" as keyof Fonts,
      color = INK,
      align = "left" as "left" | "right",
    } = {}
  ) {
    const drawn = safe(value);
    const face = this.fonts[font];
    const left = align === "right" ? x - face.widthOfTextAtSize(drawn, size) : x;
    // The baseline sits below the top of the line box, so `down` can mean "the
    // top of this text" everywhere it is used.
    this.page.drawText(drawn, { x: left, y: this.at(down) - size, size, font: face, color });
  }

  box(x: number, down: number, w: number, h: number, fill?: ReturnType<typeof rgb>) {
    this.page.drawRectangle({
      x,
      y: this.at(down) - h,
      width: w,
      height: h,
      color: fill,
      borderColor: RULE,
      borderWidth: 0.75,
    });
  }

  fill(x: number, down: number, w: number, h: number, colour: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x, y: this.at(down) - h, width: w, height: h, color: colour });
  }

  rule(x: number, down: number, w: number) {
    this.page.drawLine({
      start: { x, y: this.at(down) },
      end: { x: x + w, y: this.at(down) },
      thickness: 0.75,
      color: RULE,
    });
  }

  logo(x: number, down: number, w: number) {
    const scale = w / 832;
    for (const d of LOGO) {
      this.page.drawSvgPath(d, { x, y: this.at(down), scale, color: TEAL });
    }
  }

  /**
   * Break a description over as many lines as it needs.
   *
   * Word by word, measured in the real font, because "Blue Seal Evolution
   * Series 900mm Six Burner Gas Range with Static Oven" is a perfectly ordinary
   * thing for this business to sell and a single clipped line would lose the
   * half that says which one it is. A word longer than the column — a part
   * number with no spaces — is broken mid-word rather than allowed to run over
   * the rule.
   */
  wrap(value: string, max: number, size: number): string[] {
    const words = safe(value).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const lines: string[] = [];
    let line = "";

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.width(candidate, size) <= max) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);

      let rest = word;
      while (this.width(rest, size) > max) {
        let cut = rest.length - 1;
        while (cut > 1 && this.width(rest.slice(0, cut), size) > max) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }

    if (line) lines.push(line);
    return lines;
  }
}

// ── The table's columns, left edge and width, adding up to WIDTH ───────────
const COL = {
  description: { x: MARGIN, w: WIDTH - (60 + 34 + 76 + 84) },
  code: { x: MARGIN + (WIDTH - (60 + 34 + 76 + 84)), w: 60 },
  qty: { x: MARGIN + (WIDTH - (34 + 76 + 84)), w: 34 },
  unit: { x: MARGIN + (WIDTH - (76 + 84)), w: 76 },
  total: { x: MARGIN + (WIDTH - 84), w: 84 },
};

const PAD = 6;
const ROW_LEAD = 11;

/**
 * A boxed block of label/value rows — the FROM, BILL TO and BANKING panels.
 *
 * The value column WRAPS, which is not a nicety. "Unit 4, 19 Sixth Street,
 * Montague Gardens, Cape Town, 7441" is the real trading address and it is
 * wider than half a page; drawn on one line it ran straight through the panel
 * border and into the customer's details next to it. A postal address is
 * exactly the field on an invoice most likely to be long, so the panel is sized
 * from its content rather than from a row count.
 *
 * Returns its own height, so the caller can put the two side-by-side panels
 * back on a common baseline whichever of them turned out taller.
 */
const LABEL_W = 66;

function panel(
  sheet: Sheet,
  x: number,
  down: number,
  w: number,
  title: string,
  rows: [string, string | null | undefined][]
): number {
  const valueX = x + PAD + LABEL_W;
  const valueW = x + w - PAD - valueX;

  const present = rows
    .filter(([, value]) => (value ?? "").toString().trim() !== "")
    .map(([label, value]) => ({ label, lines: sheet.wrap(String(value), valueW, 8) }));

  const headH = 15;
  const bodyH =
    present.reduce((sum, row) => sum + Math.max(row.lines.length, 1) * ROW_LEAD, 0) + 8;

  sheet.box(x, down, w, headH + bodyH);
  sheet.fill(x + 0.4, down + 0.4, w - 0.8, headH - 0.8, TINT);
  sheet.rule(x, down + headH, w);
  sheet.text(title, x + PAD, down + 4.5, { size: 7, font: "bold", color: TEAL });

  let row = down + headH + 4;
  for (const { label, lines } of present) {
    sheet.text(label, x + PAD, row, { size: 7.5, color: SOFT });
    lines.forEach((line, i) => sheet.text(line, valueX, row + i * ROW_LEAD, { size: 8 }));
    row += Math.max(lines.length, 1) * ROW_LEAD;
  }

  return headH + bodyH;
}

/** The table's heading strip. Redrawn at the top of every page it continues on. */
function tableHead(sheet: Sheet): number {
  const h = 16;
  sheet.fill(MARGIN, sheet.y, WIDTH, h, TINT);
  sheet.rule(MARGIN, sheet.y, WIDTH);
  sheet.rule(MARGIN, sheet.y + h, WIDTH);

  const label = { size: 7, font: "bold" as const, color: TEAL };
  sheet.text("DESCRIPTION", COL.description.x + PAD, sheet.y + 5, label);
  sheet.text("CODE", COL.code.x + PAD, sheet.y + 5, label);
  sheet.text("QTY", COL.qty.x + COL.qty.w - PAD, sheet.y + 5, { ...label, align: "right" });
  sheet.text("UNIT", COL.unit.x + COL.unit.w - PAD, sheet.y + 5, { ...label, align: "right" });
  sheet.text("TOTAL", COL.total.x + COL.total.w - PAD, sheet.y + 5, { ...label, align: "right" });

  return h;
}

function drawRow(
  sheet: Sheet,
  money: Money,
  row: { description: string; code: string; qty: number | null; unit: number; total: number }
) {
  const lines = sheet.wrap(row.description, COL.description.w - PAD * 2, 8.5);
  const h = Math.max(lines.length * ROW_LEAD + 8, 22);

  if (sheet.y + h > PAGE[1] - FLOOR) {
    sheet.break();
    sheet.y += tableHead(sheet);
  }

  const top = sheet.y + 5;
  lines.forEach((line, i) => {
    sheet.text(line, COL.description.x + PAD, top + i * ROW_LEAD, { size: 8.5 });
  });

  if (row.code) sheet.text(row.code, COL.code.x + PAD, top, { size: 8.5, font: "mono" });
  if (row.qty !== null) {
    sheet.text(String(row.qty), COL.qty.x + COL.qty.w - PAD, top, { size: 8.5, align: "right" });
  }
  sheet.text(money(row.unit), COL.unit.x + COL.unit.w - PAD, top, { size: 8.5, align: "right" });
  sheet.text(money(row.total), COL.total.x + COL.total.w - PAD, top, { size: 8.5, align: "right" });

  sheet.y += h;
  sheet.rule(MARGIN, sheet.y, WIDTH);
}

/**
 * The document, as bytes.
 *
 * Refuses rather than renders when the arithmetic does not tie.
 * `issue_invoice()` has already checked the total against the order's own
 * generated column; this checks the document against itself, which also covers
 * anything that reaches here without having been written by issue_invoice() —
 * a backfill, or an import from the old spreadsheet.
 *
 * A PDF that disagrees with itself is worse than an error, because an error
 * stops at the till and a bad PDF gets handed over, filed, and argued about six
 * months later by two people who each believe their own copy.
 */
export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  const fault = checkInvoiceTotals(doc);
  if (fault) {
    throw new Error(`${doc.number} does not add up and will not be printed. ${fault}`);
  }

  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const { issuer, customer, delivery, payment } = doc;
  const money = moneyFor(doc);
  const received = doc.received_cents ?? (doc.kind === "invoice" ? doc.total_cents : 0);
  const balance = doc.balance_cents ?? Math.max(0, doc.total_cents - received);
  const refundDue = doc.refund_due_cents ?? Math.max(0, received - doc.total_cents);

  pdf.setTitle(`${doc.number} — ${invoiceAddressee(customer)}`);
  pdf.setAuthor(safe(issuer.legal_name));
  pdf.setSubject(`${INVOICE_HEADINGS[doc.kind]} ${doc.number} for ${doc.order_code}`);
  pdf.setProducer("Take More");
  pdf.setCreator("Take More");

  const sheet = new Sheet(pdf, fonts);

  // The reference block, right. Four facts somebody quotes on the phone.
  const metaW = 200;
  const metaX = RIGHT - metaW;

  // ── Masthead ────────────────────────────────────────────────────────────
  sheet.logo(MARGIN, sheet.y, 30);
  sheet.text(issuer.legal_name, MARGIN, sheet.y + 26, {
    size: sheet.fit(issuer.legal_name, metaX - MARGIN - 14, 14),
    font: "bold",
    color: TEAL,
  });
  sheet.text(INVOICE_HEADINGS[doc.kind].toUpperCase(), MARGIN, sheet.y + 44, {
    size: 9,
    color: SOFT,
  });
  const meta: [string, string][] = [
    ["Number", doc.number],
    ["Date", day(doc.issued_at, "Africa/Johannesburg")],
    [balance === 0 ? "Paid" : "Due", day(doc.due_at, "Africa/Johannesburg")],
    ["Order", doc.order_code],
  ];

  sheet.box(metaX, sheet.y, metaW, meta.length * 15);
  meta.forEach(([label, value], i) => {
    const rowTop = sheet.y + i * 15;
    sheet.fill(metaX + 0.4, rowTop + 0.4, 74, 14.2, TINT);
    if (i > 0) sheet.rule(metaX, rowTop, metaW);
    sheet.text(label, metaX + PAD, rowTop + 4, { size: 7.5, font: "bold" });
    sheet.text(value, metaX + metaW - PAD, rowTop + 4, { size: 8.5, align: "right" });
  });

  sheet.y += 66;
  sheet.text(balance === 0 ? "Fully paid. Thank you." : received > 0 ? "Part payment received. The outstanding balance is shown below." : "This is a request for payment. No payment has been recorded.", MARGIN, sheet.y, { size: 8, color: SOFT });
  sheet.y += 18;

  // ── Who, and to whom ────────────────────────────────────────────────────
  const half = (WIDTH - 14) / 2;
  const fromH = panel(sheet, MARGIN, sheet.y, half, "FROM", [
    ["Address", issuer.address],
    ["Phone", issuer.phone ? formatPhone(issuer.phone) : null],
    ["Email", issuer.email],
    // Companies Act s32: the registered name and number belong on every
    // business document this company issues.
    ["Registration", issuer.registration_number],
  ]);
  const toH = panel(sheet, MARGIN + half + 14, sheet.y, half, "BILL TO", [
    ["Name", invoiceAddressee(customer)],
    // Only when it says something the line above did not.
    ["Contact", customer.business?.trim() && customer.name?.trim() ? customer.name : null],
    ["Phone", customer.phone ? formatPhone(customer.phone) : null],
    ["Email", customer.email],
    ["Address", customer.address],
  ]);

  sheet.y += Math.max(fromH, toH) + 20;

  // ── The machines ────────────────────────────────────────────────────────
  sheet.y += tableHead(sheet);

  for (const line of doc.lines as InvoiceLine[]) {
    drawRow(sheet, money, {
      description: line.description,
      code: line.code,
      qty: line.qty,
      unit: line.unit_cents,
      total: line.total_cents,
    });
  }

  if (delivery) {
    drawRow(sheet, money, {
      description: [
        "Delivery",
        delivery.address ? `to ${delivery.address}` : null,
        delivery.km ? `(${delivery.km} km)` : null,
      ]
        .filter(Boolean)
        .join(" "),
      code: "",
      qty: 1,
      unit: delivery.fee_cents,
      total: delivery.fee_cents,
    });
  }

  for (const [description, fee] of [["Installation (accepted)", doc.charges?.installation_cents ?? 0]] as const) {
    if (fee > 0) drawRow(sheet, money, { description, code: "", qty: 1, unit: fee, total: fee });
  }

  /**
   * The hire period, on a rental. Under the machines and above the note,
   * because it is the one fact the lines were priced on — and a customer
   * reading "10 days at R400/day" wants to see which ten days.
   */
  if (doc.hire) {
    const days = doc.hire.days;
    sheet.ensure(ROW_LEAD + 6);
    // UTC: these are calendar days ("2026-09-01"), not moments, and reading
    // one in Johannesburg time would print the day before.
    sheet.text(
      `Hire period: ${day(doc.hire.start, "UTC")} to ${day(doc.hire.end, "UTC")} (${days} day${days === 1 ? "" : "s"}, both days included)`,
      MARGIN + PAD,
      sheet.y + 5,
      { size: 8, color: SOFT }
    );
    sheet.y += ROW_LEAD + 6;
    sheet.rule(MARGIN, sheet.y, WIDTH);
  }

  /**
   * Whatever was written on the order — a hire period, a collection
   * arrangement, "includes the stand". Take More's own spreadsheet carried
   * exactly this as an unpriced line, and it is the half of an invoice that a
   * table of machines cannot say.
   */
  if (doc.note) {
    const lines = sheet.wrap(doc.note, WIDTH - PAD * 2, 8);
    sheet.ensure(lines.length * ROW_LEAD + 6);
    for (const line of lines) {
      sheet.text(line, MARGIN + PAD, sheet.y + 5, { size: 8, color: SOFT });
      sheet.y += ROW_LEAD;
    }
    sheet.y += 6;
    sheet.rule(MARGIN, sheet.y, WIDTH);
  }

  // ── The figures ─────────────────────────────────────────────────────────
  // Up to three figure rows (14 each), the total band (26 + 44 below it) and
  // the gap above: about 130 points. Asked for more so the banking panel that
  // follows usually lands on the same page as the total it explains.
  sheet.ensure(260);
  sheet.y += 12;

  const totalsW = 240;
  const totalsX = RIGHT - totalsW;
  const figure = (label: string, value: string) => {
    sheet.text(label, totalsX, sheet.y, { size: 8.5, color: SOFT });
    sheet.text(value, RIGHT, sheet.y, { size: 8.5, align: "right" });
    sheet.y += 14;
  };

  figure("Subtotal", money(doc.subtotal_cents));

  /**
   * The line the whole layout is arranged around.
   *
   * Every machine is billed at its asking price and the saving is stated once,
   * here, rather than folded silently into the per-machine figures. The
   * customer argued for this number; it belongs on the paper they take away.
   *
   * Positive means it sold ABOVE the asking price, which happens and is not an
   * error — PaymentPanel already labels that case "Above asking".
   */
  if (doc.adjustment_cents !== 0) {
    const down = doc.adjustment_cents < 0;
    figure(
      down ? "Discount" : "Adjustment",
      `${down ? "-" : "+"}${money(Math.abs(doc.adjustment_cents))}`
    );
  }

  if (delivery) figure("Delivery", money(delivery.fee_cents));
  if (doc.charges?.installation_cents) figure("Installation", money(doc.charges.installation_cents));
  figure("Total order amount", money(doc.total_cents));
  if (doc.deposit_cents) figure("Initial payment received", money(Math.min(doc.deposit_cents, received)));
  figure("Payments received, less refunds", money(received));

  sheet.y += 2;
  sheet.fill(totalsX, sheet.y, totalsW, 26, TEAL);
  sheet.text(balance === 0 ? "FULLY PAID" : "OUTSTANDING BALANCE", totalsX + 10, sheet.y + 9, {
    size: 9,
    font: "bold",
    color: WHITE,
  });
  sheet.text(money(balance), RIGHT - 10, sheet.y + 7.5, {
    size: 12,
    font: "bold",
    color: WHITE,
    align: "right",
  });
  sheet.y += 44;
  if (refundDue > 0) figure("Refund due", money(refundDue));

  // ── Banking, and what has already been paid ─────────────────────────────
  /**
   * Banking appears on the document that asks for money and on the one that
   * confirms it arrived — the second because whoever files a paid invoice is
   * usually the person who will pay the next one.
   *
   * Absent entirely unless all four parts are configured. A bank name with no
   * account number is worse than no block at all: somebody reads it, believes
   * they have what they need, and pays into nothing. issuerFromEnv() enforces
   * the same all-or-nothing rule at the other end.
   */
  // Four label rows plus the heading: about 75 points for the taller panel.
  sheet.ensure(90);
  let blockH = 0;
  if (issuer.bank) {
    blockH = panel(sheet, MARGIN, sheet.y, half, "BANKING DETAILS", [
      ["Bank", issuer.bank.name],
      ["Account name", issuer.bank.account_name],
      ["Account type", issuer.bank.type],
      ["Account number", issuer.bank.number],
    ]);
  }
  if (payment) {
    blockH = Math.max(
      blockH,
      panel(sheet, MARGIN + half + 14, sheet.y, half, "PAYMENT RECEIVED", [
        ["Method", payment.method ? PAYMENT_METHOD_LABELS[payment.method] : null],
        ["Reference", payment.reference],
        ["Date", day(payment.paid_at, "Africa/Johannesburg")],
      ])
    );
  }
  sheet.y += blockH;

  if (doc.payments?.length) {
    sheet.y += 18; sheet.ensure(32);
    sheet.text("PAYMENT HISTORY", MARGIN, sheet.y, { size: 8, font: "bold", color: SOFT }); sheet.y += 16;
    for (const entry of doc.payments) {
      const labels = entry.entry_kind === "refund" ? REFUND_METHOD_LABELS : PAYMENT_METHOD_LABELS;
      const methodLabel = labels[entry.method as keyof typeof labels] ?? entry.method;
      const text = `${day(entry.received_on, "UTC")} · ${entry.entry_kind === "refund" ? "Refund" : "Payment"} ${money(entry.amount_cents)} · ${methodLabel} · ${entry.reference}`;
      const lines = sheet.wrap(text, WIDTH, 8);
      sheet.ensure(lines.length * 12 + 4);
      for (const line of lines) { sheet.text(line, MARGIN, sheet.y, { size: 8, color: SOFT }); sheet.y += 12; }
    }
  }

  /**
   * The footer, on every page.
   *
   * Saying "not a VAT vendor" out loud is what stops a customer's bookkeeper
   * ringing to ask for the VAT breakdown that is not there — and it is the
   * visible half of the rule INVOICE_HEADINGS and issue_invoice() enforce
   * between them: this system cannot issue a tax invoice.
   */
  const footer = `${safe(issuer.legal_name)} · Registration ${safe(issuer.registration_number)} · Not a VAT vendor, so no VAT is charged and this is not a tax invoice.`;
  for (const page of pdf.getPages()) {
    page.drawText(footer, {
      x: MARGIN,
      y: 30,
      size: 7,
      font: fonts.regular,
      color: SOFT,
      maxWidth: WIDTH,
    });
  }

  return Buffer.from(await pdf.save());
}

/**
 * `4 August 2026`.
 *
 * Spelled out rather than 8/4/2026, which is the single most expensive
 * ambiguity in international paperwork — Take More's own spreadsheet invoice
 * reads "8/4/2026" for the fourth of August, and anybody outside this country
 * reads that as the eighth of April. A month in words cannot be misread.
 *
 * The zone is required, not defaulted. This runs on a server whose clock is
 * UTC, so a payment taken at 01:30 on the 5th in Cape Town is "the 4th" without
 * it. A timestamp is read in Johannesburg time; a hire's calendar day
 * ("2026-09-01", parsed as UTC midnight) is read in UTC so it stays the 1st.
 */
function day(iso: string | null, timeZone: "Africa/Johannesburg" | "UTC"): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
}

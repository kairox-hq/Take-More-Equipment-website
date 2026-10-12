"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Panel } from "@takemore/ui";
import { INVOICE_HEADINGS, invoiceFilename, planBalance, randsExact as rands, whatsappDigits } from "@takemore/core";
import type { OrderDetail, OrderInvoiceRow } from "@/lib/orders";
import { draftInvoiceMessage } from "@/lib/message";
import { issueInvoice } from "../actions";

/**
 * What the customer takes away.
 *
 * ── The WhatsApp problem, and why this is not one button ──────────────────
 *
 * `wa.me?text=` is the mechanism every other send in this app uses, and it
 * CANNOT carry a file. There is no parameter for one and there never has been;
 * click-to-chat pre-fills a message and stops. So "send them the invoice on
 * WhatsApp" has exactly three implementations and this uses two of them:
 *
 *   1. THE SHARE SHEET. navigator.share() with a File hands the operating
 *      system's own share menu the actual PDF, and WhatsApp is one of the
 *      destinations in it. It is the only route on which the document travels
 *      as a document.
 *
 *   2. wa.me PLUS A DOWNLOAD. The PDF is saved and WhatsApp opens ON THAT
 *      CUSTOMER'S CHAT with the message already typed, and the person attaches
 *      the file.
 *
 *   3. The Meta Cloud API, which would attach it with no tap at all, and needs
 *      business verification, an approved template per wording, and a cost per
 *      message. OutreachQueue already made this call for match messages —
 *      "worth it when the tapping gets tedious, not before" — and an invoice is
 *      sent far less often than those are.
 *
 * ── Which one, and why the device decides ─────────────────────────────────
 *
 * This used to offer the share sheet to anything whose browser SAID it could
 * share files, and that was wrong on a desktop. Chrome on a laptop answers yes
 * to canShare({files}) and then opens an OS share panel — a slow, unfamiliar
 * menu that does not know who the customer is, when wa.me would have gone
 * straight to their chat with the words already in the box, which is exactly
 * what the outreach queue does and what people here expect.
 *
 * So: a touch device gets the share sheet, because the file itself travelling
 * is worth picking the chat by hand. Everything else goes straight to the chat.
 * The trade is real and it is stated on screen rather than hidden — on a phone
 * the share sheet cannot be told which chat to open, and on a desktop the file
 * cannot be attached for you. Neither limit is ours to remove; WhatsApp exposes
 * no way to do both at once outside the Cloud API.
 *
 * ── Why the PDF is fetched before anybody clicks ──────────────────────────
 *
 * navigator.share() has to be called during the gesture that triggered it.
 * Awaiting a fetch() first spends that activation, and Safari refuses the share
 * with NotAllowedError — on iPhones, which is most of the phones this will run
 * on. So on a touch device the file is fetched as soon as the document exists
 * and the handler only ever hands over something it already has. It is about
 * four kilobytes. A desktop never needs it and never fetches it.
 */
export default function InvoicePanel({
  order,
  invoices,
  chargedTotalCents,
  configured,
  busy: screenBusy = false,
  onDone,
}: {
  order: OrderDetail;
  invoices: OrderInvoiceRow[];
  /** What the order says the customer pays. Used to spot a document gone stale. */
  chargedTotalCents: number;
  /**
   * Whether this deployment has the business details to put on a document,
   * and whether the document will carry banking details.
   */
  configured: { ok: boolean; error?: string; bank: boolean };
  /** The screen is between an action and its refresh; nothing may be tapped. */
  busy?: boolean;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [touch, setTouch] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);

  const paid = order.status === "paid";
  const cancelled = order.status === "void";
  const balance = planBalance(order, chargedTotalCents, order.receipts);
  const wantKind = paid || balance.received > 0 ? "invoice" : "proforma";

  // Newest first, so the first match is the one in force.
  const current = cancelled ? invoices[0] ?? null : invoices.find((i) => i.kind === wantKind) ?? null;

  /**
   * A document that no longer describes the sale.
   *
   * Only checkable for an invoice: a paid order always has an agreed total, so
   * the document's figure and the order's generated `charged_total_cents` must
   * be the same number. They come apart when a sale is reopened, corrected and
   * confirmed again — at which point the invoice in the customer's hand is
   * wrong and somebody has to be told, rather than the screen quietly showing a
   * green tick.
   *
   * A proforma is deliberately not checked: it is issued against an order that
   * is still being negotiated, so its total is expected to move.
   */
  const stale = !cancelled && current !== null && (!order.lead_id || current.total_cents !== chargedTotalCents || (order.charges_ready && current.received_cents !== balance.received));

  const url = current ? `/api/invoices/${current.id}` : null;
  const filename = current ? invoiceFilename(current) : null;

  /**
   * Everything else ever issued for this order, newest first — the proforma
   * that came before the invoice, the invoice a correction replaced. They are
   * still on the record and still what the customer may be holding, so they
   * are reachable here rather than only in the database.
   */
  const history = invoices.filter((i) => i.id !== current?.id);
  const replacedBy = (id: string) => invoices.find((i) => i.supersedes === id) ?? null;

  const disabled = screenBusy || busy;

  /**
   * Is this a phone, rather than a browser that merely claims it could share?
   *
   * A coarse pointer AND a touch screen. Either on its own is wrong: a laptop
   * with a touchscreen reports touch points, and some desktop browsers report a
   * coarse pointer when a tablet mode is on. Both together is a phone or a
   * tablet, which is where picking the chat by hand is a fair price for the
   * file arriving as a file.
   *
   * Read in an effect rather than during render because the server has no
   * pointer and would disagree with the browser about the first paint.
   */
  useEffect(() => {
    // Chromium says so outright, which covers Android. Safari does not, so an
    // iPhone and an iPad are recognised by the pair below — and a Windows
    // laptop with a touchscreen is not, because with a mouse attached its
    // primary pointer is fine rather than coarse.
    const declared = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
    setTouch(
      declared ??
        (window.matchMedia?.("(pointer: coarse)").matches === true &&
          navigator.maxTouchPoints > 0)
    );
  }, []);

  // Fetched up front so the share handler never has to await inside a gesture.
  // Only where it will be used: a desktop goes straight to the chat and would
  // be paying for this on every order page it opened.
  useEffect(() => {
    if (!touch || !url || !filename) {
      setFile(null);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const blob = await response.blob();
        if (alive) setFile(new File([blob], filename, { type: "application/pdf" }));
      } catch {
        // Nothing to do and nothing to say: every button below still works
        // without this, they just take the longer route.
      }
    })();
    return () => {
      alive = false;
    };
  }, [touch, url, filename]);

  const issue = async () => {
    setBusy(true);
    setHint(null);
    const result = await issueInvoice(order.id);
    setBusy(false);
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  /**
   * Print.
   *
   * The PDF is loaded into an off-screen iframe and that iframe is told to
   * print, so the paper is byte-for-byte the file the customer gets — there is
   * no second HTML layout that could drift from it.
   *
   * Browsers disagree about whether a script may drive their PDF viewer, and
   * the ones that refuse do so silently. So the fallback is unconditional: if
   * nothing has happened, the document is also opened in a tab where the
   * viewer's own print button is one press away.
   */
  const print = useCallback(() => {
    if (!url) return;
    const node = frame.current;
    if (!node) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setHint(null);
    node.src = url;
    node.onload = () => {
      try {
        node.contentWindow?.focus();
        node.contentWindow?.print();
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    };
    // Said before it might be needed rather than after it has failed, because
    // "nothing happened" is not an event this can detect.
    setHint("If no print dialog appears, the invoice also opens in a new tab — print it from there.");
  }, [url]);

  /**
   * Straight to that customer's chat, with the words already in the box.
   *
   * Identical to what OutreachQueue does, deliberately — it is the movement
   * everybody here already knows. The PDF is saved alongside it, because wa.me
   * cannot carry one.
   *
   * WhatsApp is opened FIRST and the download second, which is the opposite of
   * what it looks like it should be. Browsers allow one popup per gesture, and
   * the popup has to be spent on the thing the person is waiting for; a
   * synthetic <a download> click is not a popup and does not compete for it.
   */
  const openChat = useCallback(
    (digits: string, message: string) => {
      window.open(
        `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer"
      );
      if (url && filename) {
        const save = document.createElement("a");
        save.href = `${url}?download=1`;
        save.download = filename;
        save.rel = "noopener";
        document.body.appendChild(save);
        save.click();
        save.remove();
      }
      setHint("Their chat is open with the message ready. The invoice has been saved — attach it and send.");
    },
    [url, filename]
  );

  const send = async () => {
    if (!url || !filename) return;
    setHint(null);

    const digits = whatsappDigits(order.lead?.phone);
    const message = messageFor(current, order, configured.bank);

    /**
     * On a phone: the share sheet, which is the only route the file itself
     * travels on. The chat has to be picked by hand there — WhatsApp offers no
     * way to be handed both a file and a recipient — and the button underneath
     * this one is for when going straight to the chat matters more.
     *
     * Nothing is awaited before this call: navigator.share() has to run inside
     * the gesture that triggered it, which is why `file` was fetched on mount.
     */
    if (touch && file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: message });
        return;
      } catch (error) {
        // AbortError is the person tapping Cancel — they meant it, so stop.
        // Anything else falls through rather than leaving them with nothing.
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    if (!digits) {
      setHint("There is no usable phone number on this customer. Download it and send it another way.");
      return;
    }

    openChat(digits, message);
  };

  if (cancelled && !current) return null;

  return (
    <Panel
      title="Invoice"
      subtitle={
        cancelled
          ? "This sale was cancelled. The documents already issued are kept."
          : balance.received > 0
            ? balance.balance > 0 ? "Part payment received. The invoice shows the outstanding balance." : "Fully paid."
            : configured.bank
              ? "A proforma, with the banking details, for somebody paying by transfer."
              : "A proforma, for somebody paying by transfer."
      }
    >
      <div className="space-y-3">
        {!configured.ok && (
          <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
            {configured.error}
          </p>
        )}
        {configured.ok && !configured.bank && !cancelled && (
          <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
            No banking details are configured on this deployment — a proforma will not carry
            them. Somebody paying by transfer will have to be sent them another way.
          </p>
        )}

        {current ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium tracking-tight font-mono tracking-widest">
                  {current.number}
                </p>
                <p className="text-[11px] font-light text-muted">
                  {INVOICE_HEADINGS[current.kind]} ·{" "}
                  {new Date(current.issued_at).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums shrink-0">
                {rands(current.total_cents)}
              </span>
            </div>

            {stale && (
              <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
                This sale has been corrected since {current.number} went out — it says{" "}
                {rands(current.total_cents)} and the order now says {rands(chargedTotalCents)}. Update
                the invoice before sending the customer this balance.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={disabled || stale} onClick={send} className="text-xs px-4 py-2">
                Send on WhatsApp
              </Button>
              <Button variant="secondary" disabled={disabled || stale} onClick={print} className="text-xs px-4 py-2">
                Print
              </Button>
              <a
                href={`${url}?download=1`}
                download={filename ?? undefined}
                className="inline-flex items-center rounded-lg border border-border px-4 py-2
                           text-xs font-light text-white/70 hover:border-white/25 hover:text-white
                           transition-colors"
              >
                Download
              </a>
              <a
                href={url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-1 py-2 text-[11px] font-light text-muted
                           hover:text-white transition-colors"
              >
                Look at it
              </a>

              {/*
                Phones only, and only as a second choice.

                The button above hands the share sheet the real file and makes
                you pick the chat; this one goes straight to their chat with the
                message ready and leaves you to attach the download. Which is
                better depends on whether the file or the recipient is the
                fiddly part that day, and that is not a judgement this screen
                can make for somebody standing at a counter.

                Not shown on a desktop because there the main button already
                does exactly this.
              */}
              {touch && (
                <button
                  type="button"
                  onClick={() => {
                    const digits = whatsappDigits(order.lead?.phone);
                    if (!digits) {
                      setHint("There is no usable phone number on this customer.");
                      return;
                    }
                    setHint(null);
                    openChat(digits, messageFor(current, order, configured.bank));
                  }}
                  className="inline-flex items-center px-1 py-2 text-[11px] font-light text-muted
                             hover:text-white transition-colors"
                >
                  Open their chat instead
                </button>
              )}
            </div>

            {hint && <p className="text-[11px] font-light text-muted leading-relaxed">{hint}</p>}

            {/*
              Only when there is something to issue. A paid order whose invoice
              still matches has nothing new to say, and the old "Issue another"
              button was how two identical numbers ended up on one sale. A
              proforma is different: the order under it is still moving, so
              re-issuing is a real action — and if nothing has moved, Postgres
              hands the same document back rather than minting a twin.
            */}
            {!cancelled && (stale || !paid) && (
              <div className="border-t border-white/5 pt-3">
                <Button
                  variant="ghost"
                  loading={busy}
                  disabled={disabled || !configured.ok}
                  onClick={issue}
                  className="text-xs px-3 py-2"
                >
                  {stale ? "Issue a corrected invoice" : wantKind === "invoice" ? "Issue an updated invoice" : "Issue an updated proforma"}
                </Button>
                <p className="text-[11px] font-light text-muted mt-2 leading-relaxed">
                  {/* Stated plainly because it is the property the whole design
                      rests on, and because a salesperson who thinks this button
                      edits the old document will press it to fix a typo. */}
                  A document that has been handed over is never changed. Issuing another one leaves
                  the first exactly as it was and records which replaced it.
                </p>
              </div>
            )}

            {history.length > 0 && (
              <div className="border-t border-white/5 pt-3">
                <p className="text-[11px] font-medium tracking-wide text-white/80 mb-1.5">
                  Also issued for this order
                </p>
                <ul className="space-y-1">
                  {history.map((past) => {
                    const successor = replacedBy(past.id);
                    return (
                      <li
                        key={past.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px] font-light text-muted"
                      >
                        <span className="min-w-0">
                          <span className="font-mono tracking-widest text-white/70">{past.number}</span>
                          {" · "}
                          {INVOICE_HEADINGS[past.kind]} · {rands(past.total_cents)} ·{" "}
                          {new Date(past.issued_at).toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {successor ? ` · replaced by ${successor.number}` : ""}
                        </span>
                        <a
                          href={`/api/invoices/${past.id}?download=1`}
                          download={invoiceFilename(past)}
                          className="shrink-0 hover:text-white transition-colors underline-offset-2 hover:underline"
                        >
                          Download
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-light text-muted">
              {paid
                ? "Nothing has been issued for this sale yet."
                : "Nothing issued yet. A proforma can go out before the money does."}
            </p>
            <Button
              variant={paid ? "primary" : "secondary"}
              loading={busy}
              disabled={disabled || !configured.ok || !order.lead_id}
              onClick={issue}
              className="text-xs px-4 py-2"
            >
              {!order.lead_id
                ? "Add a customer first"
                : paid
                  ? "Make the invoice"
                  : "Make a proforma"}
            </Button>
          </>
        )}

        {/* Off-screen rather than display:none — a hidden iframe is not laid out
            and several browsers refuse to print one that never was. */}
        <iframe
          ref={frame}
          title="Invoice, for printing"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute w-px h-px opacity-0 pointer-events-none -z-10"
        />
      </div>
    </Panel>
  );
}

/**
 * The words that travel with the document.
 *
 * Drafted in lib/message.ts with every other thing this business says to a
 * customer, for the reason that module's own header gives: the rules live in
 * Postgres, the WORDING is a decision about how this business talks, and both
 * belong somewhere they can be found and changed in one place.
 */
const messageFor = (
  invoice: OrderInvoiceRow | null,
  order: OrderDetail,
  bankOnDocument: boolean
): string =>
  draftInvoiceMessage({
    kind: invoice?.kind ?? "invoice",
    number: invoice?.number ?? "",
    leadName: order.lead?.full_name ?? null,
    totalCents: invoice?.total_cents ?? 0,
    receivedCents: invoice?.received_cents,
    balanceCents: invoice?.balance_cents,
    delivering: order.delivery,
    bankOnDocument,
  });

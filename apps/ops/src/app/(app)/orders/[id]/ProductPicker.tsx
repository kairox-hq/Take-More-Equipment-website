"use client";

import { useCallback, useRef, useState } from "react";
import { createBrowserClient } from "@takemore/db";
import { normaliseItemCode, randsExact as rands } from "@takemore/core";
import { useLiveSearch } from "@/lib/useLiveSearch";
import { addLine } from "../actions";

type Sellable = {
  id: string;
  sku: string;
  title: string;
  list_price_cents: number | null;
  available_quantity: number;
  on_order: string | null;
};

export default function ProductPicker({ orderId, disabled, onBusy, onDone }: {
  orderId: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const fetcher = useCallback(async (term: string): Promise<Sellable[]> => {
    const { data, error } = await createBrowserClient().rpc("search_sellable_items", {
      p_query: term, p_limit: 8, p_order_id: orderId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as Sellable[];
  }, [orderId]);
  const { hits, loading, tooShort, failed } = useLiveSearch<Sellable>(query, fetcher);
  const unitMatch = query.trim().match(/^(.+)\.([1-9]\d*)$/);
  const listingCode = normaliseItemCode(unitMatch?.[1] ?? query);
  const typedCode = listingCode ? unitMatch ? `${listingCode}.${unitMatch[2]}` : listingCode : null;
  const specificUnit = Boolean(unitMatch && listingCode);
  const count = specificUnit ? 1 : Number(quantity);
  const validQuantity = Number.isInteger(count) && count > 0 && count <= 10000;

  const add = async (ref: { code?: string; itemId?: string }) => {
    if (submitting.current || !validQuantity) return;
    submitting.current = true; setBusy(true); onBusy(true);
    try {
      const result = await addLine(orderId, { ...ref, quantity: count });
      if (result.ok) { setQuery(""); setQuantity("1"); }
      onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
    } catch {
      onDone({ ok: false, message: "Could not confirm the stock change. Refresh the order before trying again." });
    } finally {
      submitting.current = false; setBusy(false); onBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-muted space-y-1.5">
          <span>Product or unit code</span>
          <input value={query} onChange={e => setQuery(e.target.value)} disabled={disabled || busy}
            onKeyDown={e => { if (e.key === "Enter" && typedCode && !disabled && !busy && validQuantity) { e.preventDefault(); void add({ code: typedCode }); } }}
            placeholder="A042, A042.1, or a name" autoComplete="off"
            className="block w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50" />
        </label>
        <label className="w-20 shrink-0 text-xs text-muted space-y-1.5">
          <span>Quantity</span>
          <input type="number" min={1} max={specificUnit ? 1 : 10000} step={1} inputMode="numeric" value={specificUnit ? "1" : quantity}
            onChange={e => setQuantity(e.target.value)} disabled={disabled || busy || specificUnit}
            className="block w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50" />
        </label>
      </div>
      {!validQuantity ? <p role="alert" className="text-xs text-status-sold">Enter a whole quantity, 1 or more.</p>
        : typedCode ? <p className="text-[11px] text-muted">Press Enter to hold {count} unit{count === 1 ? "" : "s"} of {typedCode}.</p> : null}
      {failed ? <p role="alert" className="text-xs text-status-sold">Stock could not load. Check your connection and search again.</p>
        : tooShort ? <p className="text-[11px] text-muted">Search for a listing, choose the quantity, then add it. Each unit gets its own number.</p>
        : loading ? <p className="text-[11px] text-muted" role="status">Checking stock…</p>
        : hits.length === 0 ? <p className="text-[11px] text-muted">Nothing available matches that.</p>
        : <ul className="space-y-1.5">{hits.map(hit => {
          const available = hit.available_quantity;
          const enough = validQuantity && count <= available;
          return <li key={hit.id}>
            <button type="button" disabled={disabled || busy || !enough} onClick={() => void add({ itemId: hit.id })}
              className="w-full text-left bg-background border border-border rounded-xl px-3 py-2.5 hover:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3">
              <span className="font-mono text-[11px] text-white/60 shrink-0">{hit.sku}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-white/90 truncate">{hit.title}</span>
                <span className="block text-[11px] text-muted">{available} available{!available && hit.on_order ? ` · Held on ${hit.on_order}` : ""}{hit.list_price_cents ? ` · ${rands(hit.list_price_cents)} each` : " · No price"}</span>
              </span>
              <span className="text-xs text-accent shrink-0">{enough ? `Add ${count}` : "Unavailable"}</span>
            </button>
          </li>;
        })}</ul>}
    </div>
  );
}

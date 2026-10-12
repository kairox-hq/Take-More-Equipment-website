"use client";

import { AVAILABILITY_LABELS, gradeLabel } from "@takemore/core";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useScrollLock from "@/hooks/useScrollLock";
import { priceLabel } from "@/data/equipment";
import useCatalogueIndex from "@/hooks/useCatalogueIndex";

/**
 * Type-ahead over the catalogue. Matches title, brand, category and tags so
 * "gas", "fridge" and "Aquastar" all find something.
 */
export default function SearchOverlay({
  onClose,
  initialQuery = "",
}: {
  onClose: () => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const index = useCatalogueIndex();

  useScrollLock();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return (index?.items ?? [])
      .filter((item) =>
        [item.title, item.brand, item.category, ...item.tags]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 6);
  }, [query, index]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-16 sm:pt-24 md:pt-32 overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label="Search stock"
    >
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative w-full max-w-2xl">
        <div className="glass-panel bg-card/90 rounded-[2rem] overflow-hidden">
          <div className="flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-4 sm:py-5">
            <iconify-icon
              icon="solar:minimalistic-magnifer-linear"
              width="20"
              height="20"
              className="text-accent shrink-0"
            ></iconify-icon>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search stock…"
              className="flex-1 min-w-0 bg-transparent text-base sm:text-lg font-light text-white placeholder:text-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center text-muted hover:text-white hover:border-white/30 transition-colors shrink-0"
            >
              <iconify-icon icon="solar:close-circle-linear" width="16" height="16"></iconify-icon>
            </button>
          </div>

          {query.trim() && (
            <div className="border-t border-white/10 max-h-[60vh] overflow-y-auto hide-scrollbar">
              {results.length > 0 ? (
                results.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/stock/${item.slug}`}
                    onClick={onClose}
                    className="flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-3.5 sm:py-4 hover:bg-white/[0.04] transition-colors group"
                  >
                    <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-border shrink-0 flex items-center justify-center text-muted">
                      {item.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        /* No photograph yet: a quiet placeholder rather than a
                           broken-image icon from `src=""`. */
                        <iconify-icon
                          icon="solar:gallery-linear"
                          width="18"
                          height="18"
                          aria-hidden="true"
                        ></iconify-icon>
                      )}
                    </span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium tracking-tight truncate group-hover:text-accent transition-colors">
                        {item.title}
                      </span>
                      <span className="text-xs font-light text-muted truncate">
                        {[item.brand, item.category, gradeLabel(item.grade)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex flex-col items-end shrink-0">
                      <span className="text-sm font-medium tracking-tight">
                        {priceLabel(item.price)}
                      </span>
                      {item.availability && item.availability !== "available" && <span className="text-xs text-accent">{AVAILABILITY_LABELS[item.availability]}</span>}
                      {item.sold && (
                        <span className="text-[11px] font-light text-accent">Sold</span>
                      )}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="px-6 py-8 text-sm font-light text-muted text-center">
                  Nothing on the floor matches “{query.trim()}”. Tell us what you need and
                  we will find it and rebuild it for you.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs font-light text-muted">
          Press <span className="text-white/70">Esc</span> to close
        </p>
      </div>
    </div>
  );
}

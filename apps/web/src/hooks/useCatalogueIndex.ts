"use client";

import { useEffect, useMemo, useState } from "react";

import { useSegment } from "@/components/SegmentProvider";
import type { Segment } from "@takemore/core";

export type IndexItem = {
  segments: Segment[];
  slug: string;
  title: string;
  brand: string;
  category: string;
  grade: string;
  price: number;
  image: string | null;
  sold: boolean;
  availability?: "available" | "reserved" | "on_hire";
  tags: string[];
};

export type CatalogueIndex = {
  /** Lines of business, in the order the shop offers them. */
  divisions: { slug: string; name: string; blurb: string; count: number }[];
  categories: {
    name: string;
    icon: string;
    blurb: string;
    count: number;
    divisionSlug: string;
    division: string;
  }[];
  items: IndexItem[];
};

/**
 * The catalogue index, fetched once per page load and shared.
 *
 * The promise is memoised at module scope rather than in state, so opening
 * search, closing it and opening the menu does not fetch three times — and two
 * overlays mounted at once share one request.
 */
let cached: Promise<CatalogueIndex> | null = null;

const load = () => {
  cached ??= fetch("/api/catalogue")
    .then((r) => (r.ok ? r.json() : { divisions: [], categories: [], items: [] }))
    // A failed index should degrade to an empty overlay, never a broken page.
    .catch(() => ({ divisions: [], categories: [], items: [] }));
  return cached;
};

export default function useCatalogueIndex(): CatalogueIndex | null {
  const { segment } = useSegment();
  const [index, setIndex] = useState<CatalogueIndex | null>(null);

  useEffect(() => {
    let alive = true;
    load().then((data) => {
      if (alive) setIndex(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    if (!index) return null;
    const items = index.items.filter((item) => item.segments?.includes(segment));
    return {
      items,
      divisions: index.divisions.filter((d) => d.slug === segment).map((d) => ({ ...d, count: items.length })),
      categories: index.categories.filter((c) => c.divisionSlug === segment || items.some((i) => i.category === c.name))
        .map((c) => ({ ...c, divisionSlug: segment, count: items.filter((i) => i.category === c.name).length })),
    };
  }, [index, segment]);
}

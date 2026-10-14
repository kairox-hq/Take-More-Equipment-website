"use client";

import { gradeLabel } from "@takemore/core";

import { GRADES, PRICE_BANDS, tagLabel, type Filters } from "@/data/filters";
import { stockedDivisions, type CategoryMeta, type Vocabulary } from "@/data/equipment";

/** Small accent label — same treatment as Subheading, without the dash rule. */
function GroupLabel({ text }: { text: string }) {
  return (
    <span className="text-accent uppercase text-xs tracking-wider font-normal">
      {text}
    </span>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-6 mt-6 first:border-t-0 first:pt-0 first:mt-0">
      <GroupLabel text={label} />
      <div className="mt-4 flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  count,
  active,
  round,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  /** Round marker reads as single-select, square as multi-select. */
  round?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group flex items-center justify-between gap-3 -mx-2 px-2 py-1.5 rounded-xl hover:bg-white/[0.03] transition-colors text-left"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className={`w-[18px] h-[18px] shrink-0 flex items-center justify-center border transition-colors ${
            round ? "rounded-full" : "rounded-md"
          } ${
            active
              ? "bg-accent border-accent text-background"
              : "border-border group-hover:border-white/25"
          }`}
        >
          {active &&
            (round ? (
              <span className="w-1.5 h-1.5 rounded-full bg-background"></span>
            ) : (
              <iconify-icon icon="solar:check-read-linear" width="11" height="11"></iconify-icon>
            ))}
        </span>
        <span
          className={`text-sm font-light truncate transition-colors ${
            active ? "text-white" : "text-muted group-hover:text-white/80"
          }`}
        >
          {label}
        </span>
      </span>
      {count !== undefined && (
        <span className="text-xs font-light text-muted/70 shrink-0">{count}</span>
      )}
    </button>
  );
}

export default function FilterPanel({
  vocabulary,
  filters,
  setFilters,
  resultCount,
  activeCount,
  onClear,
  open,
  setOpen,
}: {
  /** Categories and tags come from the database, not a hardcoded list. */
  vocabulary: Vocabulary;
  filters: Filters;
  setFilters: (next: Filters) => void;
  resultCount: number;
  activeCount: number;
  onClear: () => void;
  /** Mobile only — the panel is always visible from `lg` up. */
  open: boolean;
  setOpen: (next: boolean) => void;
}) {
  // Toggle a value in one of the array-valued filter groups.
  const toggle = <K extends "categories" | "grades" | "tags">(
    key: K,
    value: Filters[K][number]
  ) => {
    const current = filters[key] as readonly string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ ...filters, [key]: next } as Filters);
  };

  /**
   * The category list, scoped to the line of business in play.
   *
   * Three shapes, one rule — never offer a tick that cannot return anything:
   *   · a line is chosen  → only its categories, under the plain heading;
   *   · both lines shown  → one block per line, each under the line's name;
   *   · one line stocked  → exactly what this panel always was.
   *
   * Lines with nothing published are dropped in all three, which is what keeps
   * this panel and the switcher above the grid telling the same story.
   */
  const categoryGroups: { label: string; categories: CategoryMeta[] }[] = (() => {
    const lines = stockedDivisions(vocabulary);
    const inStock = (category: CategoryMeta) =>
      lines.some((line) => line.slug === category.divisionSlug);

    if (filters.division) {
      return [
        {
          label: "Category",
          categories: vocabulary.categories.filter(
            (c) => c.divisionSlug === filters.division
          ),
        },
      ];
    }
    if (lines.length > 1) {
      return lines.map((line) => ({
        label: line.name,
        categories: vocabulary.categories.filter((c) => c.divisionSlug === line.slug),
      }));
    }
    return [{ label: "Category", categories: vocabulary.categories.filter(inStock) }];
  })();

  return (
    <aside className="lg:w-72 shrink-0">
      <div className="bg-card rounded-[2rem] border border-border p-5 sm:p-6 md:p-8 lg:sticky lg:top-6">
        {/* On mobile this whole header is the toggle; from lg it is a static label. */}
        <div
          className={`flex items-center justify-between gap-3 ${
            open ? "pb-5 border-b border-border" : ""
          } lg:pb-6 lg:border-b lg:border-border`}
        >
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex items-center gap-3 flex-1 min-w-0 text-left lg:pointer-events-none"
          >
            <span className="w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center text-accent shrink-0">
              <iconify-icon icon="solar:filter-linear" width="16" height="16"></iconify-icon>
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-medium tracking-tight">
                Filters
                {activeCount > 0 && (
                  <span className="text-accent"> · {activeCount}</span>
                )}
              </span>
              <span className="text-xs font-light text-muted">
                {resultCount} {resultCount === 1 ? "listing" : "listings"}
              </span>
            </span>
            <span className="ml-auto lg:hidden text-muted">
              <iconify-icon
                icon="solar:alt-arrow-down-linear"
                width="18"
                height="18"
                className={open ? "rotate-180 inline-block" : "inline-block"}
              ></iconify-icon>
            </span>
          </button>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="hidden lg:flex items-center gap-1.5 text-xs font-light text-muted hover:text-accent transition-colors shrink-0"
            >
              <iconify-icon icon="solar:restart-linear" width="13" height="13"></iconify-icon>
              Clear
            </button>
          )}
        </div>

        <div className={`${open ? "block pt-5" : "hidden"} lg:block lg:pt-6`}>
          {/* A heading over nothing reads as "your filters are wrong" — on an
              empty catalogue, or a line with no categories, the group is not
              drawn at all. */}
          {categoryGroups.filter((group) => group.categories.length > 0).map((group) => (
            <Group key={group.label} label={group.label}>
              {group.categories.map((category) => (
                <Row
                  key={category.name}
                  label={category.name}
                  count={category.count}
                  active={filters.categories.includes(category.name)}
                  onClick={() => toggle("categories", category.name)}
                />
              ))}
            </Group>
          ))}

          <Group label="Price">
            {PRICE_BANDS.map((band) => (
              <Row
                key={band.id}
                label={band.label}
                round
                active={filters.price === band.id}
                onClick={() =>
                  setFilters({
                    ...filters,
                    price: filters.price === band.id ? null : band.id,
                  })
                }
              />
            ))}
          </Group>

          <Group label="Condition">
            {GRADES.map((grade) => (
              <Row
                key={grade}
                label={gradeLabel(grade)}
                active={filters.grades.includes(grade)}
                onClick={() => toggle("grades", grade)}
              />
            ))}
          </Group>

          {vocabulary.tags.length > 0 && (
          <Group label="Specification">
            {vocabulary.tags.map((tag) => (
              <Row
                key={tag}
                label={tagLabel(tag)}
                active={filters.tags.includes(tag)}
                onClick={() => toggle("tags", tag)}
              />
            ))}
          </Group>
          )}

          <Group label="Availability">
            <Row
              label="Hide sold listings"
              active={filters.hideSold}
              onClick={() => setFilters({ ...filters, hideSold: !filters.hideSold })}
            />
          </Group>

          {/* Mobile close/clear — the sidebar equivalents live in the header. */}
          <div className="flex items-center gap-3 mt-6 pt-6 border-t border-border lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 bg-accent text-background rounded-2xl px-5 py-3 text-sm font-medium"
            >
              Show {resultCount} {resultCount === 1 ? "listing" : "listings"}
            </button>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear filters"
                className="w-12 h-12 rounded-2xl border border-border flex items-center justify-center text-muted shrink-0"
              >
                <iconify-icon icon="solar:restart-linear" width="16" height="16"></iconify-icon>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

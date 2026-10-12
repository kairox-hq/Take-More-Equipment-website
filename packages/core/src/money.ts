/**
 * Money is integer cents everywhere it is stored or passed around, and becomes
 * a string exactly once, here.
 *
 * The mock data used plain rands. Cents is the change: it removes every
 * float-rounding argument from margin arithmetic, and there is precisely one
 * multiplication by 100 in the codebase (the seed script) and one division
 * (this file). A third occurrence of either is a bug.
 */

export type Cents = number;

export const randsToCents = (rands: number): Cents => Math.round(rands * 100);
export const centsToRands = (cents: Cents): number => cents / 100;

/**
 * `R42 500`.
 *
 * Worth knowing, because it looks like a bug and isn't: `toLocaleString("en-ZA")`
 * groups with a NON-BREAKING space (U+00A0), not a comma. The storefront's
 * original helper piped the result through `.replace(/,/g, " ")`, which
 * therefore never matched anything — the nbsp was always what shipped. That is
 * the better character anyway (it stops "R42 500" wrapping across two lines),
 * so it is kept deliberately rather than normalised away.
 *
 * Fractions are dropped: stock is priced in whole rands, and a stray "R42
 * 500,50" on a card would read as a mistake.
 */
export const rands = (cents: Cents): string =>
  `R${centsToRands(cents).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

/** `1 800 mm`. Same grouping, same nbsp. */
export const mm = (value: number): string =>
  `${value.toLocaleString("en-ZA")} mm`;

/**
 * The saving anchor on every card — "Save 56%".
 *
 * Returns null rather than 0 when there is nothing to claim, so a missing
 * retail comparison renders as absence instead of as "Save 0%".
 */
export const savingPercent = (
  listCents: Cents,
  retailCents: Cents | null | undefined
): number | null => {
  if (!retailCents || retailCents <= listCents) return null;
  return Math.round(((retailCents - listCents) / retailCents) * 100);
};

/** Payment records retain cents; catalogue display may still use whole rands. */
export const paymentAmount = (cents: Cents): string =>
  `R${centsToRands(cents).toLocaleString("en-ZA", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Rates and order totals must display the same cents that are charged. */
const exactRands = new Intl.NumberFormat("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const randsExact = (cents: Cents): string =>
  `R${exactRands.formatToParts(centsToRands(cents)).map(part => part.type === "decimal" ? "." : part.value).join("")}`;

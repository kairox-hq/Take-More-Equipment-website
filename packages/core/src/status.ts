/**
 * The item lifecycle.
 *
 * This table is mirrored exactly by `public.item_status_transitions` in the
 * database, and a CI test asserts the two agree row for row. The trigger on
 * `items` is what makes an illegal move impossible; this copy exists so the
 * ops UI can offer the legal moves as buttons instead of letting a worker
 * discover them by getting an error.
 *
 * Keep the two in sync or the test fails — which is the point.
 */

import { atLeast, type AppRole } from "./roles.ts";

export const ITEM_STATUSES = [
  "intake",
  "refurbishing",
  "ready",
  "listed",
  "reserved",
  "sold",
  "handed_over",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type Transition = {
  from: ItemStatus;
  to: ItemStatus;
  /** The lowest role allowed to make this move. */
  minRole: AppRole;
  /** Verb for the button. Written from the worker's point of view. */
  label: string;
};

/**
 * The four stages a machine can actually be in, and what each one means for the
 * website.
 *
 * This list is the whole vocabulary now. It answers the only two questions the
 * business asks about a unit — can somebody buy this today, and is it on the
 * site — and it deliberately does not describe a process. The seven-state
 * lifecycle that came before drew a lovely board and became an obstacle: a
 * worker had to walk a machine through intermediate states nobody was acting on.
 *
 * `live` is the important column. Publication used to be a separate switch that
 * a human had to remember to flip, which meant sold machines sat on the site and
 * repaired ones sat off it. Now the stage decides, and there is one control
 * instead of two that could disagree.
 *
 * ONLY `listed` IS LIVE. A machine on the bench used to be advertised while the
 * work was going on, and that was a pricing mistake rather than a display one:
 * until the repair is finished nobody knows what it cost, so the asking price on
 * the card is a guess, and a guess published to the internet is one somebody
 * will hold us to. The workshop is where a price is decided, not where it is
 * advertised — the machine goes up when it is tapped "For sale", which is the
 * same tap that says the figure is now real.
 */
export const STAGES = [
  {
    status: "listed",
    label: "For sale",
    live: true,
    hint: "On the website, ready to buy",
  },
  {
    status: "refurbishing",
    label: "In the workshop",
    live: false,
    hint: "Off the website until the repair is priced",
  },
  {
    status: "reserved",
    label: "Reserved",
    live: true,
    hint: "Visible as Reserved; lay-by and finance are hidden",
  },
  {
    status: "sold",
    label: "Sold",
    live: false,
    hint: "Gone — off the website",
  },
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Retired: `intake`, `ready` and `handed_over`.
 *
 * They remain in the Postgres enum because a value cannot be dropped without
 * rebuilding the type and every column using it, and because the activity log
 * still names them in old entries. Nothing reaches them — they appear in no
 * transition and the column default no longer produces one — so this lookup
 * exists only so an ancient row renders as something rather than crashing.
 */
export const stageFor = (status: ItemStatus): Stage | undefined =>
  STAGES.find((s) => s.status === status);

/** Whether a machine at this stage belongs on the public site. */
export const isLiveStage = (status: ItemStatus) => stageFor(status)?.live ?? false;

/**
 * Every stage reaches every other stage directly, and every move costs `staff`.
 *
 * A complete graph at a single role makes reversibility structural rather than
 * something a test has to police pair by pair: whatever you can do, you can
 * undo, in one tap, from wherever you ended up. The labels are the destination
 * stage's own name because the UI draws them as a set of stage buttons rather
 * than as a list of verbs.
 *
 * A test asserts these rows match the database exactly.
 */
export const TRANSITIONS: readonly Transition[] = STAGES.flatMap((from) =>
  STAGES.filter((to) => to.status !== from.status).map((to) => ({
    from: from.status,
    to: to.status,
    minRole: "staff" as const,
    label: to.label,
  }))
);

export const canTransition = (from: ItemStatus, to: ItemStatus, role: AppRole) => {
  const move = TRANSITIONS.find((t) => t.from === from && t.to === to);
  return !!move && atLeast(role, move.minRole);
};

/** What this worker can do with this item right now — renders the card's buttons. */
export const nextStatuses = (from: ItemStatus, role: AppRole) =>
  TRANSITIONS.filter((t) => t.from === from && atLeast(role, t.minRole));

export const STATUS_LABELS: Record<ItemStatus, string> = {
  refurbishing: "In the workshop",
  listed: "For sale",
  reserved: "Reserved",
  sold: "Sold",
  // Retired — kept so an old activity-log entry still renders a name.
  intake: "Intake",
  ready: "Ready",
  handed_over: "Handed over",
};

/**
 * Board order, and the order the dashboard counts in — one definition so the
 * two cannot drift apart visually. Reads left to right the way stock moves:
 * being worked on, for sale, spoken for, gone.
 */
export const STATUS_ORDER: readonly ItemStatus[] = [
  "refurbishing",
  "listed",
  "reserved",
  "sold",
];

/**
 * Whether an item in this status is still ours to sell. Drives the dashboard's
 * "stock on hand" figures.
 *
 * `sold` used to count as on-hand, because it meant "paid for but not yet
 * collected" and the machine was still taking up floor space — `handed_over` was
 * the state that meant gone. With handover retired there is nothing between the
 * two, so `sold` now carries that meaning itself.
 */
export const isOnHand = (status: ItemStatus) =>
  status !== "sold" && status !== "handed_over";

/** Statuses a buyer can still act on. `reserved` is held for someone else. */
export const isAvailable = (status: ItemStatus) => status === "listed";

export type PublicAvailability = "available" | "reserved" | "on_hire";
export const AVAILABILITY_LABELS: Record<PublicAvailability, string> = {
  available: "Available", reserved: "Reserved", on_hire: "Coming back soon",
};

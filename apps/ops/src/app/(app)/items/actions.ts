"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase, requireStaff } from "@/lib/supabase";
import { createAdminClient } from "@takemore/db/admin";
import { revalidateStorefront } from "@/lib/storefront";
import { STAGES, UNTITLED, validSegments, type Segment, type CostKind, type ItemStatus } from "@takemore/core";

/**
 * Every mutation the ops app makes.
 *
 * These are thin on purpose. The rules — legal status moves, the publish gate,
 * SKU and slug generation, who may read a cost — all live in the database, so
 * an action's job is to pass the intent along and report what happened. Nothing
 * here re-implements a rule, because a second copy of a rule is a rule that can
 * disagree with itself.
 */

export type ActionResult =
  | { ok: true; notice?: string }
  | { ok: false; error: string };

/** Postgres error text is written for developers; these are for a warehouse. */
const humanise = (message: string): string => {
  if (message.includes("Cannot move an item")) return message;
  if (message.includes("before it can be published")) return message;
  if (message.includes("duplicate key") && message.includes("slug"))
    return "Another item already uses that name.";
  if (message.includes("permission denied") || message.includes("row-level security"))
    return "You don't have permission to do that.";
  // A cleared required box. Postgres says which column; a worker only needs to
  // know the box they just emptied cannot be empty.
  if (message.includes("null value in column") || message.includes("violates not-null"))
    return "This field cannot be empty.";
  // The positive-number checks on weight and dimensions.
  if (
    message.includes("check constraint") &&
    /weight|width|depth|height|_mm|_kg/i.test(message)
  )
    return "Must be more than 0.";
  if (message.includes("invalid input syntax")) return "That is not a number.";
  return message;
};

/**
 * Whether a machine is on the website right now — the one question every
 * write below asks before pinging the storefront. Revalidating a draft's cache
 * is a four-second round trip for nothing, on a phone that is waiting for it.
 */
async function isLive(
  client: Awaited<ReturnType<typeof supabase>>,
  id: string
): Promise<boolean> {
  const { data } = await client.from("items").select("published_at,website_availability").eq("id", id).maybeSingle();
  return !!data?.published_at && data.website_availability !== "hidden";
}

export async function createDraft(_previous: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  await requireStaff();
  const segments = formData.getAll("segments");
  if (!validSegments(segments)) return { error: "Choose Homestaging, Industrial Kitchen, or both." };
  const client = await supabase();

  // Create only after the collection question is answered. The row then
  // supports photo uploads and autosave in the product editor.
  const { data, error } = await client
    .from("items")
    .insert({ title: UNTITLED, specs: { segments } })
    .select("id")
    .single();

  if (error) return { error: humanise(error.message) };

  revalidatePath("/items");
  redirect(`/items/${data.id}`);
}

export type ItemPatch = {
  stock_quantity?: number | null;
  segments?: Segment[];
  title?: string;
  brand?: string | null;
  model?: string | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  condition_grade?: "N" | "A" | "B" | "C" | null;
  description?: string | null;
  workshop_notes?: string[];
  capacity?: string | null;
  power?: string | null;
  width_mm?: number | null;
  depth_mm?: number | null;
  height_mm?: number | null;
  weight_kg?: number | null;
  list_price_cents?: number | null;
  retail_price_cents?: number | null;
  featured?: boolean;
};

export async function updateItem(id: string, patch: ItemPatch): Promise<ActionResult> {
  await requireStaff();
  if (patch.stock_quantity !== undefined && patch.stock_quantity !== null &&
      (!Number.isInteger(patch.stock_quantity) || patch.stock_quantity < 0 || patch.stock_quantity > 2147483647)) {
    return { ok: false, error: "Enter a whole number of units, 0 or more." };
  }
  const client = await supabase();

  const { segments, ...fields } = patch;
  let specs;
  if (segments !== undefined) {
    if (!validSegments(segments)) return { ok: false, error: "Choose at least one product segment." };
    const { data: item, error: readError } = await client.from("items").select("specs").eq("id", id).single();
    if (readError) return { ok: false, error: humanise(readError.message) };
    const existing = item.specs && typeof item.specs === "object" && !Array.isArray(item.specs) ? item.specs : {};
    specs = { ...existing, segments };
  }

  const { data, error } = await client
    .from("items")
    .update({ ...fields, ...(specs ? { specs } : {}) })
    .eq("id", id)
    .select("published_at,website_availability")
    .single();
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  // A published item that changes is a storefront change. A draft's is not,
  // and the write comes back with published_at so nobody has to ask twice.
  if (data?.published_at && Object.keys(patch).some((key) => key !== "stock_quantity")) await revalidateStorefront(id);
  return { ok: true };
}

/**
 * Set the stage — which also decides whether the machine is on the website.
 *
 * One control instead of two. Publication used to be a separate switch a human
 * had to remember to flip, so sold units sat on the site and repaired ones sat
 * off it; the stage now carries that decision with it. Only `listed` is live:
 * a machine on the bench has no settled price yet, and 20260820100000 explains
 * at length why advertising one is a promise we may not be able to keep.
 *
 * The publish write is SEPARATE from the status write, deliberately, and the
 * order is load-bearing. The publish gate lives in
 * items_enforce_publish_requirements, which Postgres fires BEFORE
 * items_enforce_status_transition — so a published_at set from inside the status
 * trigger would sail straight past the check meant to validate it, and a machine
 * with no photo could reach the website by way of a stage button.
 *
 * Doing it as its own write means the gate runs properly, and means an item too
 * incomplete to publish still CHANGES STAGE: the status has already committed,
 * and the caller is told what stopped the rest rather than losing the whole
 * action. Re-tapping the stage it is already on retries the publish, which is
 * the path back once the missing photo or price has been added.
 */
export async function setStage(id: string, status: ItemStatus): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const stage = STAGES.find((s) => s.status === status);
  if (!stage) return { ok: false, error: "That is not a stage an item can be in." };

  // Read BEFORE the move, not only after. Sending a machine back to the bench
  // now unpublishes it inside the status trigger, so the row that comes back
  // from the write below has already forgotten that it was ever up — and the
  // worker would be told nothing about a machine that just vanished from the
  // site. This is what the notice is written from.
  const { data: before } = await client
    .from("items")
    .select("published_at,website_availability")
    .eq("id", id)
    .maybeSingle();
  const wasLive = !!before?.published_at && before.website_availability !== "hidden";

  // The write returns the row it wrote, so the state AFTER the status trigger
  // has run comes back in the same round trip rather than a second one.
  const { data: after, error } = await client
    .from("items")
    .update({ status })
    .eq("id", id)
    .select("published_at,website_availability")
    .maybeSingle();
  if (error) return { ok: false, error: humanise(error.message) };
  const isLive = !!after?.published_at && after.website_availability !== "hidden";

  let notice: string | undefined;

  if (stage.live && !isLive && after?.website_availability !== "hidden") {
    const { error: publishError } = await client
      .from("items")
      .update({ published_at: new Date().toISOString() })
      .eq("id", id);

    notice = publishError
      ? `Moved to ${stage.label}, but it is not on the website yet — ${humanise(publishError.message).toLowerCase()}`
      : `${stage.label} — now on the website.`;
  } else if (!stage.live && (isLive || wasLive)) {
    // Usually already done by the time we get here — the status trigger takes a
    // machine off the site on its way to the bench, and reserving one through an
    // order clears it too. The write stays because `reserved` and `sold` still
    // rely on it, and because a rule that lives in one place should not be the
    // only thing standing between a sold machine and a live listing.
    const { error: hideError } = isLive
      ? await client.from("items").update({ published_at: null }).eq("id", id)
      : { error: null };

    notice = hideError
      ? `Moved to ${stage.label}, but it could not be taken off the website: ${humanise(hideError.message)}`
      : `${stage.label} — taken off the website.`;
  }

  if (after?.website_availability === "hidden" && status === "reserved") notice = "Held on lay-by or Rental Finance — hidden from the website.";
  else if (status === "reserved" && isLive) notice = after?.website_availability === "on_hire" ? "Coming back soon — visible, unavailable to buy." : "Reserved — visible, unavailable to buy.";

  // A machine that has just gone on sale is the moment to check who has been
  // waiting for one. Best effort and after the fact: matching is a suggestion,
  // and a failure here must not make the stage change look like it failed.
  // Nothing is lost if it does — run_stock_match() sweeps nightly, and the
  // unique index means the two paths cannot double up.
  if (status === "listed") {
    const { data: matched, error: matchError } = await client.rpc("match_item_to_leads", {
      p_item_id: id,
    });
    if (matchError) {
      console.warn("match_item_to_leads failed (the nightly sweep will catch it):", matchError.message);
    } else if (matched && matched > 0) {
      notice = `${notice ? `${notice} ` : ""}${matched} ${matched === 1 ? "person was" : "people were"} looking for one — see Outreach.`;
      revalidatePath("/outreach");
    }
  }

  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  revalidatePath("/board");
  // The Dashboard reads every stage count and, once a machine reaches `sold`,
  // every margin and rotation number on the page. It used to be a small "Today"
  // that a stale render cost nothing; it is now the page this change is most
  // visible on.
  revalidatePath("/");
  await revalidateStorefront(id);
  return { ok: true, notice };
}

export async function setTags(id: string, tagIds: string[]): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  // A diff, not a delete-and-rewrite. Clearing every tag and inserting the
  // list again meant a dropped connection between the two statements left the
  // machine with no tags at all — and on a live listing, that is what the
  // storefront's filters would read while the worker saw a tick.
  const { data: current, error: readError } = await client
    .from("item_tags")
    .select("tag_id")
    .eq("item_id", id);
  if (readError) return { ok: false, error: humanise(readError.message) };

  const have = new Set((current ?? []).map((row) => row.tag_id));
  const want = new Set(tagIds);
  const removed = [...have].filter((tagId) => !want.has(tagId));
  const added = [...want].filter((tagId) => !have.has(tagId));

  if (removed.length) {
    const { error } = await client
      .from("item_tags")
      .delete()
      .eq("item_id", id)
      .in("tag_id", removed);
    if (error) return { ok: false, error: humanise(error.message) };
  }

  if (added.length) {
    const { error } = await client
      .from("item_tags")
      .insert(added.map((tag_id) => ({ item_id: id, tag_id })));
    if (error) return { ok: false, error: humanise(error.message) };
  }

  revalidatePath(`/items/${id}`);
  if (await isLive(client, id)) await revalidateStorefront(id);
  return { ok: true };
}

/**
 * Costs go in through the RPC, never a plain insert.
 *
 * PostgREST defaults to `Prefer: return=representation`, which makes an insert
 * also a select — and a staff account may write costs but not read them, so a
 * direct insert comes back as a 403 that looks exactly like a broken policy.
 * The RPC returns void and sidesteps it.
 */
export async function recordCost(
  itemId: string,
  kind: CostKind,
  amountCents: number,
  note?: string
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.rpc("record_item_cost", {
    p_item_id: itemId,
    p_kind: kind,
    p_amount_cents: amountCents,
    // Omitted rather than nulled — the RPC's optional arguments are typed as
    // `string | undefined`, and the SQL default already coalesces.
    p_note: note,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

/**
 * The two fixed cost boxes — auction and workshop.
 *
 * Separate from recordCost() because these are a VALUE, not a ledger entry: the
 * field is re-blurred every time a manager corrects a typo, and appending a row
 * each time would turn one auction price into six. The RPC keeps exactly one row
 * per kind, and clearing the box deletes it rather than storing a zero — a
 * stored R0 reads as a machine that was free.
 *
 * Returns void like record_item_cost() and for the same reason: a staff account
 * may write costs and may not read them, so anything that returns the row would
 * come back as a 403 that looks exactly like a broken policy.
 */
export async function setItemCost(
  itemId: string,
  kind: CostKind,
  amountCents: number | null
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.rpc("set_item_cost", {
    p_item_id: itemId,
    p_kind: kind,
    // An empty box and a zero mean the same thing to the RPC — "there is no
    // such cost" — and it deletes the row rather than storing a zero either way.
    p_amount_cents: amountCents ?? 0,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

export async function deleteCost(itemId: string, costId: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.from("item_costs").delete().eq("id", costId);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

/** Called after the browser has put the file in Storage. */
export async function recordMedia(
  itemId: string,
  storagePath: string,
  kind: "photo" | "video",
  dimensions?: { width?: number; height?: number; duration?: number }
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { data: last } = await client
    .from("item_media")
    .select("position")
    .eq("item_id", itemId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await client.from("item_media").insert({
    item_id: itemId,
    kind,
    storage_path: storagePath,
    position: (last?.position ?? -1) + 1,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    duration_seconds: dimensions?.duration ?? null,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${itemId}`);
  if (await isLive(client, itemId)) await revalidateStorefront(itemId);
  return { ok: true };
}

export async function deleteMedia(itemId: string, mediaId: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const [{ data: media }, { data: item }, { count: photoCount }] = await Promise.all([
    client
      .from("item_media")
      .select("storage_path, kind")
      .eq("id", mediaId)
      .eq("item_id", itemId)
      .maybeSingle(),
    client.from("items").select("published_at,website_availability").eq("id", itemId).maybeSingle(),
    client
      .from("item_media")
      .select("id", { count: "exact", head: true })
      .eq("item_id", itemId)
      .eq("kind", "photo"),
  ]);

  // A live listing keeps its last photograph. The publish gate checks for one
  // at the moment of publishing and never again, so without this a worker
  // replacing a bad shot — delete, then add — would leave a card on the
  // website with no image for as long as the upload took, or for good if the
  // upload then failed on the warehouse wifi.
  const live = !!item?.published_at;
  if (live && media?.kind === "photo" && (photoCount ?? 0) <= 1) {
    return {
      ok: false,
      error: "Add the new photo first — this is the only one on a live listing.",
    };
  }

  const { error } = await client
    .from("item_media")
    .delete()
    .eq("id", mediaId)
    .eq("item_id", itemId);
  if (error) return { ok: false, error: humanise(error.message) };

  // Best effort. An orphaned object costs a few cents of storage; a failed
  // delete that blocks the UI costs a worker's afternoon.
  if (media?.storage_path) {
    await client.storage.from("item-media").remove([media.storage_path]);
  }

  revalidatePath(`/items/${itemId}`);
  if (live) await revalidateStorefront(itemId);
  return { ok: true };
}

/** Reorder by rewriting positions. The lowest-positioned photo is the card image. */
export async function reorderMedia(
  itemId: string,
  orderedIds: string[]
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  // Sequential on purpose — an upsert would need every column of every row.
  // Each write is scoped to this item as well as the row id, so a stale or
  // wrong id from another machine's gallery cannot renumber that one; and the
  // first failure stops the loop rather than leaving a half-renumbered order
  // that reports success.
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await client
      .from("item_media")
      .update({ position: index })
      .eq("id", id)
      .eq("item_id", itemId);
    if (error) return { ok: false, error: humanise(error.message) };
  }

  revalidatePath(`/items/${itemId}`);
  if (await isLive(client, itemId)) await revalidateStorefront(itemId);
  return { ok: true };
}

/**
 * Delete an item: off the website, out of the stock list, in one action.
 *
 * Soft, always. Not as a hedge — as the only version of this that is safe to
 * offer. A hard DELETE would take the item's costs and its activity log with it
 * (both cascade), orphan any outreach that named the machine, and free the slug
 * for the next item to claim — so a URL a customer has in a WhatsApp thread
 * would one day answer with a different fryer. `deleted_at` costs a row and
 * avoids all four.
 *
 * What a worker sees is a real delete regardless, because every read filters it:
 * the stock list and getItem() exclude it, the public views require
 * `deleted_at is null`, and the storefront loses it twice over since
 * `published_at` is cleared in the same statement. Nothing in the app can reach
 * it afterwards — the row is a record, not a hiding place.
 *
 * `.is("deleted_at", null)` makes it idempotent: a double tap on a slow
 * connection matches nothing the second time rather than re-stamping the
 * timestamp and writing a second 'deleted' line into the history.
 */
/**
 * A machine draft nobody ever filled in does not stay on the books.
 *
 * The same rule the till uses for an order nobody finished, applied here:
 *
 *   nothing was ever recorded  →  discarded, and no trace is kept
 *   anything was recorded      →  soft-deleted, and the record stays for ever
 *
 * Pressing "New item" creates the row immediately — that is what makes the
 * autosave-as-you-photograph flow possible, and it is right. The cost of it is
 * that a mis-tap, a customer interrupting, or a phone going to sleep leaves an
 * "Untitled item" in the stock list, and soft-deleting those was preserving a
 * record of nothing while still counting against the eye of whoever scrolls the
 * deleted list later.
 *
 * ── What counts as "nothing was recorded" ─────────────────────────────────
 *
 * All five, and they are checked HERE rather than trusted from the browser:
 *
 *   never published        no customer ever saw it
 *   no photograph          nobody walked over and photographed it
 *   no cost line           no money was ever attached to it
 *   not on an order        nobody has quoted or sold it
 *   in the workshop or
 *   for sale               not reserved, not sold — those are order states,
 *                          and this is the belt to the order check's braces
 *
 * A row that fails any of them is soft-deleted exactly as before: what it cost
 * and what was done to it stay in the record, which is the whole argument of
 * 20260811090000_soft_delete_is_a_delete.sql.
 *
 * The admin key is here for the same reason it is in discardOrder(): the only
 * DELETE policy on items is owner-only, and the person who needs to undo a
 * mis-tap is whoever made it. The five conditions above are what stands in for
 * that policy, and they are stricter than it.
 */
export async function deleteItem(
  id: string
): Promise<ActionResult & { discarded?: boolean }> {
  await requireStaff();
  const client = await supabase();

  const { data: item, error: readError } = await client
    .from("items")
    .select("id, sku, title, status, published_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError) return { ok: false, error: humanise(readError.message) };
  if (!item) return { ok: false, error: "That machine is not there any more." };

  // A machine on an order is the order's, not ours to delete. Soft-deleting it
  // would hide the row from every stock query while the order still named it,
  // and the invoice would then point at a machine the app says does not exist.
  if (item.status === "reserved" || item.status === "sold") {
    return { ok: false, error: "It is on an order — cancel or finish that order first." };
  }

  const [media, costs, lines] = await Promise.all([
    client.from("item_media").select("id", { count: "exact", head: true }).eq("item_id", id),
    client.from("item_costs").select("id", { count: "exact", head: true }).eq("item_id", id),
    client.from("order_lines").select("id", { count: "exact", head: true }).eq("item_id", id),
  ]);

  const untouched =
    !item.published_at &&
    (media.count ?? 0) === 0 &&
    (costs.count ?? 0) === 0 &&
    (lines.count ?? 0) === 0 &&
    (item.status === "refurbishing" || item.status === "listed");

  if (untouched) {
    const admin = createAdminClient();

    // The status guard is repeated on the statement itself. The read above was
    // a moment ago, and in that moment somebody else could have put this very
    // machine on an order from another phone — in which case this matches
    // nothing and the fall-through below soft-deletes it instead.
    const { data: gone, error } = await admin
      .from("items")
      .delete()
      .eq("id", id)
      .in("status", ["refurbishing", "listed"])
      .is("published_at", null)
      .select("id");

    if (error) return { ok: false, error: humanise(error.message) };

    if (gone?.length) {
      // Its own lines on the timeline go with it, for the reason discardOrder()
      // gives: this row recorded nothing, and a code on the team's timeline
      // that resolves to no machine reads as a bug rather than as history.
      await admin.from("activity_log").delete().eq("entity", "item").eq("entity_id", id);

      revalidatePath("/items");
      revalidatePath("/board");
      revalidatePath("/");
      revalidatePath("/team");
      return { ok: true, discarded: true, notice: `${item.sku} is gone.` };
    }
  }

  return softDeleteItem(id);
}

export async function softDeleteItem(id: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("items")
    .update({ deleted_at: new Date().toISOString(), published_at: null })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: humanise(error.message) };

  // Every surface that counts stock. The dashboard and the board both read from
  // the same undeleted set, and a machine that lingers on either after being
  // deleted is the bug this is most likely to grow.
  revalidatePath("/items");
  revalidatePath("/board");
  revalidatePath("/");
  revalidatePath("/team");
  await revalidateStorefront(id);
  return { ok: true };
}

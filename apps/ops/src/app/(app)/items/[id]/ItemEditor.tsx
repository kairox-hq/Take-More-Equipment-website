"use client";

import { gradeLabel } from "@takemore/core";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SEGMENTS, SEGMENT_LABELS, itemSegments, type Segment,
  CONDITION_GRADES,
  GRADE_GUIDANCE,
  canSeeCosts,
  publishChecklist,
  isLiveStage,
  MAX_FEATURED,
  STAGES,
  UNTITLED,
  rands,
  type AppRole,
  type ItemStatus,
} from "@takemore/core";
import {
  Button,
  Field,
  Input,
  Panel,
  RandInput,
  Select,
  Textarea,
  ChipGroup,
  PUBLIC_FIELD_HALO,
} from "@takemore/ui";
import { StatusPill, PublishPill } from "@takemore/ui";
import { setStage, setTags, updateItem, type ItemPatch } from "../actions";
import MediaManager from "./MediaManager";
import CostsPanel from "./CostsPanel";
import DeleteItem from "./DeleteItem";
import ItemCode from "@/components/ItemCode";

/**
 * The item editor.
 *
 * Autosaves. A warehouse phone loses signal mid-form and a worker who has just
 * typed twelve fields will not type them again, so every field commits on blur
 * rather than waiting for a Save button that may never be reached.
 *
 * Save state is shown, never blocking: the form stays usable while a write is
 * in flight. The one thing that does interrupt is an error, because a silently
 * dropped edit is worse than an interruption.
 */

type Item = Record<string, any>;

export default function ItemEditor({
  item,
  unitInventory,
  divisions,
  categories,
  subcategories,
  tags,
  costs,
  economics,
  activity,
  role,
  featuredCount,
  storefrontUrl,
}: {
  item: Item;
  unitInventory: ReactNode;
  divisions: { id: string; name: string; slug: string }[];
  categories: { id: string; name: string; slug: string; division_id: string }[];
  subcategories: { id: string; name: string; slug: string; category_id: string }[];
  tags: { id: string; name: string; slug: string }[];
  costs: any[];
  economics: any;
  activity: any[];
  role: AppRole;
  /** Highlight slots already taken, this item included if it holds one. */
  featuredCount: number;
  /** Where the public site is, resolved on the server — see page.tsx. */
  storefrontUrl: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Dimensions are stored in millimetres and typed in centimetres — the same
  // arrangement money has here, where the database holds cents and every screen
  // shows rands. A tape measure in a warehouse reads centimetres; millimetres
  // keep the column an integer and let the form take a half-centimetre.
  const toCm = (mm: number | null | undefined) =>
    mm === null || mm === undefined ? "" : String(mm / 10);
  const toMm = (cm: string) => (cm === "" ? null : Math.round(Number(cm) * 10));

  const [form, setForm] = useState({
    stock_quantity: item.stock_quantity ?? "",
    title: item.title ?? "",
    brand: item.brand ?? "",
    model: item.model ?? "",
    // Not a column on `items` — the division of a machine IS the division of
    // its category. Seeded from whatever category the item already carries so
    // reopening a saved item lands on the right branch of the tree, and held in
    // form state only to decide which categories the next dropdown offers.
    division_id:
      categories.find((c) => c.id === item.category_id)?.division_id ?? "",
    category_id: item.category_id ?? "",
    subcategory_id: item.subcategory_id ?? "",
    condition_grade: item.condition_grade ?? "",
    description: item.description ?? "",
    capacity: item.capacity ?? "",
    power: item.power ?? "",
    width_cm: toCm(item.width_mm),
    depth_cm: toCm(item.depth_mm),
    height_cm: toCm(item.height_mm),
    weight_kg: item.weight_kg ?? "",
  });

  const [segments, setSegments] = useState<Segment[]>(() => itemSegments(item.specs,
    divisions.find((d) => d.id === categories.find((c) => c.id === item.category_id)?.division_id)?.slug));
  const [savingSegments, setSavingSegments] = useState(false);

  /** Only the categories belonging to the line of business currently chosen. */
  const categoryOptions = categories.filter(
    (c) => c.division_id === form.division_id
  );

  /** Only the subcategories belonging to the category currently chosen. */
  const subcategoryOptions = subcategories.filter(
    (s) => s.category_id === form.category_id
  );

  const [listPrice, setListPrice] = useState<number | null>(item.list_price_cents ?? null);
  const [retailPrice, setRetailPrice] = useState<number | null>(item.retail_price_cents ?? null);
  const publiclyVisible = Boolean(item.published_at && item.website_availability !== "hidden");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    (item.tags ?? []).map((t: any) => t.tag_id)
  );
  const tagSaveInFlight = useRef(false);
  const [savingTags, setSavingTags] = useState(false);
  const [mediaCount, setMediaCount] = useState((item.media ?? []).length);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  /**
   * What the database holds right now, field by field — kept up to date after
   * every successful save. Every blur compares against THIS, not the `item`
   * prop the page rendered with. The prop never changes between saves, so
   * comparing against it meant typing a value, saving it, then putting the
   * original back was "no change" and never written: the box showed the old
   * figure while the database kept the wrong one.
   */
  const lastSaved = useRef<Record<string, unknown>>({
    stock_quantity: item.stock_quantity ?? "",
    title: item.title ?? "",
    brand: item.brand ?? "",
    model: item.model ?? "",
    category_id: item.category_id ?? "",
    subcategory_id: item.subcategory_id ?? "",
    condition_grade: item.condition_grade ?? "",
    description: item.description ?? "",
    capacity: item.capacity ?? "",
    power: item.power ?? "",
    width_mm: item.width_mm ?? null,
    depth_mm: item.depth_mm ?? null,
    height_mm: item.height_mm ?? null,
    weight_kg: item.weight_kg ?? "",
    list_price_cents: item.list_price_cents ?? null,
    retail_price_cents: item.retail_price_cents ?? null,
  });

  const save = useCallback(
    async (patch: ItemPatch) => {
      setSaveState("saving");
      setError(null);
      const result = await updateItem(item.id, patch);
      if (result.ok) {
        // Nulls are stored as the form's own idea of empty (see the initial
        // values above) so a later comparison of "" against null does not
        // count as a change.
        for (const [key, value] of Object.entries(patch)) {
          lastSaved.current[key] = value === null && key in form ? "" : value;
        }
        setSaveState("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState("idle"), 1800);
      } else {
        setSaveState("error");
        setError(result.error);
      }
      // Returned as well as reported, for the one caller that has to undo its
      // own optimistic change when the database says no.
      return result;
    },
    // `form` is read only for its keys, which never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id]
  );

  /** Commit a text field on blur, but only if it actually changed. */
  const commit = (key: keyof typeof form, transform?: (v: string) => any) => ({
    value: (form as any)[key],
    onChange: (e: any) => setForm((f) => ({ ...f, [key]: e.target.value })),
    onBlur: () => {
      const raw = (form as any)[key];
      const original = lastSaved.current[key] ?? "";
      if (String(raw) === String(original)) return;
      if (key === "stock_quantity" && raw !== "" &&
          (!Number.isInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > 2147483647)) {
        setSaveState("error");
        setError("Enter a whole number of units, 0 or more.");
        return;
      }
      // The one field the database will not take empty. Refusing it here says
      // so in plain words and puts the last saved title back, instead of
      // sending null and showing "null value in column" to a warehouse.
      if (key === "title" && String(raw).trim() === "") {
        setForm((f) => ({ ...f, title: String(lastSaved.current.title ?? "") }));
        setSaveState("error");
        setError("The title cannot be empty.");
        return;
      }
      const value = transform ? transform(raw) : raw === "" ? null : raw;
      save({ [key]: value } as ItemPatch);
    },
  });

  const toNumber = (v: string) => (v === "" ? null : Number(v));

  /**
   * Centimetres in the box, millimetres in the column.
   *
   * Needs its own committer rather than commit()'s transform hook because the
   * two sides are in different units: the comparison that decides whether
   * anything actually changed has to happen after the conversion, or every blur
   * writes.
   */
  const commitCm = (key: "width_cm" | "depth_cm" | "height_cm") => {
    const column = key.replace("_cm", "_mm") as "width_mm" | "depth_mm" | "height_mm";
    return {
      value: form[key],
      onChange: (e: any) => setForm((f) => ({ ...f, [key]: e.target.value })),
      onBlur: () => {
        const mm = toMm(form[key]);
        if (mm === (lastSaved.current[column] ?? null)) return;
        save({ [column]: mm } as ItemPatch);
      },
    };
  };

  // The two fixed cost boxes. Held here rather than in CostsPanel so the publish
  // checklist below can react to them as they are typed.
  const costOf = (kind: string) =>
    costs.find((c: any) => c.kind === kind)?.amount_cents ?? null;
  const [auctionCents, setAuctionCents] = useState<number | null>(costOf("auction"));
  const [workshopCents, setWorkshopCents] = useState<number | null>(costOf("workshop"));

  const candidate = useMemo(
    () => ({
      title: form.title,
      description: form.description,
      categoryId: form.category_id || null,
      grade: form.condition_grade || null,
      listPriceCents: listPrice,
      photoCount: mediaCount,
    }),
    [form, listPrice, mediaCount]
  );

  // Drawn only as an explanation of why a live-stage machine is not live yet.
  // Nothing gates on it in the UI any more — the stage button attempts the
  // publish and the database's own gate decides.
  const checklist = useMemo(() => publishChecklist(candidate), [candidate]);

  // Whether this stage wants the machine on the site at all — which is what
  // decides between "not live yet, here is what is missing" and "off the site,
  // and that is correct".
  const liveStage = isLiveStage(item.status as ItemStatus);

  /**
   * The homepage highlights, which are a fixed number of slots rather than a
   * flag each item carries on its own.
   *
   * Tracked locally because the count arrives from the server render and this
   * page never refreshes after an autosave — without it, ticking the box would
   * leave "7 of 8" on screen while the eighth was already taken. The database
   * is still the authority: it refuses the ninth, and a refusal rolls both of
   * these back to what it says.
   */
  const [featured, setFeatured] = useState<boolean>(!!item.featured);
  const [slotsTaken, setSlotsTaken] = useState(featuredCount);
  const slotsFull = !featured && slotsTaken >= MAX_FEATURED;

  async function onFeatured(next: boolean) {
    setFeatured(next);
    setSlotsTaken((n) => n + (next ? 1 : -1));
    const result = await save({ featured: next });
    if (!result.ok) {
      setFeatured(!next);
      setSlotsTaken((n) => n - (next ? 1 : -1));
    }
  }

  /** The stage being moved to, while the move is in flight. */
  const [changing, setChanging] = useState<ItemStatus | null>(null);

  async function onStatus(next: ItemStatus) {
    if (changing) return;
    setChanging(next);
    setError(null);
    setNotice(null);
    try {
      const result = await setStage(item.id, next);
      if (!result.ok) return setError(result.error);
      // The stage change also puts the machine on or off the website, which is a
      // thing that happened without anyone asking — so it is said out loud.
      if (result.notice) setNotice(result.notice);
      startTransition(() => router.refresh());
    } finally {
      setChanging(null);
    }
  }

  /**
   * Tags are shown as changed the moment they are tapped, and put back if the
   * database says no. Before this the tap fired and forgot, and a dropped
   * connection left a chip lit for a tag that was never saved.
   */
  async function onToggleTag(id: string) {
    if (tagSaveInFlight.current) return;
    tagSaveInFlight.current = true;
    setSavingTags(true);
    const previous = selectedTags;
    const next = previous.includes(id) ? previous.filter((t) => t !== id) : [...previous, id];
    setSelectedTags(next);
    setError(null);
    try {
      const result = await setTags(item.id, next);
      if (!result.ok) { setSelectedTags(previous); setError(result.error); }
    } catch {
      setSelectedTags(previous); setError("Could not save the tags. Please try again.");
    } finally { tagSaveInFlight.current = false; setSavingTags(false); }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The code leads, above the title rather than beside a date. This is
              the screen somebody stands in front of with a marker in their
              hand, and the four characters are what they came for. */}
          <div className="flex items-center gap-2 mb-2">
            <ItemCode code={item.sku} size="chip" />
            <Link
              href={`/items/${item.id}/label`}
              target="_blank"
              title="Open a printable label"
              className="w-9 h-9 rounded-xl border border-border text-muted hover:text-white
                         hover:border-white/25 transition-colors flex items-center justify-center shrink-0"
            >
              <iconify-icon icon="solar:printer-linear" width="16" height="16" noobserver="" />
            </Link>
          </div>
          <h1 className="text-xl md:text-2xl font-medium tracking-tight truncate">
            {form.title || UNTITLED}
          </h1>
          <p className="text-xs font-light text-muted mt-1">
            created{" "}
            {new Date(item.created_at).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={item.status} />
          <PublishPill publishedAt={publiclyVisible ? item.published_at : null} />
          <span
            className={`text-[11px] font-light transition-opacity ${
              saveState === "idle" ? "opacity-0" : "opacity-100"
            } ${saveState === "error" ? "text-status-sold" : "text-muted"}`}
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
        </div>
      </div>

      {error && (
        <div className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}

      {notice && (
        <div className="text-xs text-accent bg-accent/10 border border-accent/30 rounded-xl px-3 py-2.5">
          {notice}
        </div>
      )}

      <Panel title="Product collections" subtitle="Required. Choose one or both website collections.">
        <div className="flex flex-wrap gap-3">
          {SEGMENTS.map((segment) => <label key={segment} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${segments.includes(segment) ? "border-accent bg-accent/10" : "border-border"}`}>
            <input type="checkbox" checked={segments.includes(segment)} disabled={savingSegments}
              onChange={async (event) => {
                const next = event.target.checked ? [...segments, segment] : segments.filter((s) => s !== segment);
                if (!next.length) { setError("Keep at least one product collection selected."); return; }
                setSavingSegments(true);
                setError(null);
                try {
                  const result = await save({ segments: next });
                  if (result.ok) setSegments(next);
                } catch {
                  setError("Could not save the collections. Please try again.");
                  setSaveState("error");
                } finally {
                  setSavingSegments(false);
                }
              }} className="w-4 h-4 accent-accent" />
            <span className="text-sm">{SEGMENT_LABELS[segment]}</span>
          </label>)}
        </div>
      </Panel>

      <MediaManager
        itemId={item.id}
        media={item.media ?? []}
        onCountChange={setMediaCount}
      />

      <Panel title="Stock quantity" subtitle="The website shows the number available. Held and sold units keep their own history.">
        <Field label="Total tracked units" hint="Include available, held and sold units. Increasing this adds new numbers; reducing it removes only free units. Blank keeps the original single unit.">
          <Input {...commit("stock_quantity", (value) => value === "" ? null : Number(value))}
            type="number" min="0" max="10000" step="1" inputMode="numeric" placeholder="1 (original unit)" />
        </Field>
      </Panel>

      {unitInventory}

      <Panel title="The machine" subtitle="What it is, and what a buyer is looking at.">
        <div className="space-y-4">
          <Field
            label="Title"
            required
            hint={item.published_at ? "URL is locked — this item is live" : "Sets the web address"}
          >
            <Input {...commit("title")} placeholder="6-Grid Combi Steamer" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand">
              <Input {...commit("brand")} placeholder="Thermex" />
            </Field>
            <Field label="Model">
              <Input {...commit("model")} placeholder="CS-61" />
            </Field>
          </div>

          {/* Three narrowing choices, coarsest first. The shop sells two
              unrelated things through one warehouse, and a worker cataloguing a
              wardrobe should never have to scroll past Wash-Up to find Storage.
              Picking a line of business here is what makes the other line's
              categories disappear from the next dropdown. */}
          <Field label="Category group" required hint="Organises categories. Website collections are selected above.">
            <Select
              value={form.division_id}
              onChange={(e) => {
                const division_id = e.target.value;
                setForm((f) => ({
                  ...f,
                  division_id,
                  category_id: "",
                  subcategory_id: "",
                }));
                // The division is not stored on the item, so the only thing to
                // write is what it invalidates. Both columns go in one patch:
                // a category from the division we just left would fail the
                // composite foreign key on the way past.
                save({ category_id: null, subcategory_id: null });
              }}
            >
              <option value="">Choose…</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Category"
              required
              hint={form.division_id ? undefined : "pick a line first"}
            >
              <Select
                value={form.category_id}
                disabled={!form.division_id}
                onChange={(e) => {
                  const category_id = e.target.value;
                  setForm((f) => ({ ...f, category_id, subcategory_id: "" }));
                  // Both columns in one patch. Clearing the subcategory is not
                  // tidiness — the composite foreign key refuses a subcategory
                  // belonging to the category we just moved away from, so this
                  // is what makes the write legal at all.
                  save({ category_id: category_id || null, subcategory_id: null });
                }}
              >
                <option value="">Choose…</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Subcategory"
              hint={form.category_id ? undefined : "pick a category first"}
            >
              <Select
                value={form.subcategory_id}
                disabled={!form.category_id}
                onChange={(e) => {
                  setForm((f) => ({ ...f, subcategory_id: e.target.value }));
                  save({ subcategory_id: e.target.value || null });
                }}
              >
                <option value="">Choose…</option>
                {subcategoryOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Condition grade" required>
            <Select
              value={form.condition_grade}
              onChange={(e) => {
                setForm((f) => ({ ...f, condition_grade: e.target.value }));
                save({ condition_grade: (e.target.value || null) as any });
              }}
            >
              <option value="">Choose…</option>
              {CONDITION_GRADES.map((g) => (
                <option key={g} value={g}>
                  {gradeLabel(g)}
                </option>
              ))}
            </Select>
          </Field>

          {/* The grading standard, inline. Two workers on two days should grade
              the same fryer the same way. */}
          {form.condition_grade && (
            <p className="text-[11px] font-light text-muted leading-relaxed bg-background border border-border rounded-xl px-3 py-2.5">
              <span className="text-accent">{gradeLabel(form.condition_grade)}</span> —{" "}
              {GRADE_GUIDANCE[form.condition_grade as "N" | "A" | "B" | "C"]}
            </p>
          )}

          <Field
            label="Description"
            required
            hint={`${form.description.length} characters — aim for ~400`}
          >
            <Textarea
              {...commit("description")}
              placeholder="What it does, what condition it is in, and who it suits."
            />
          </Field>

          <Field label="Tags" hint="Tap a selected tag to remove it.">
            <ChipGroup
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
              selected={selectedTags}
              disabled={savingTags}
              onToggle={onToggleTag}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Specification" subtitle="Capacity and power show on every card.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacity">
              <Input {...commit("capacity")} placeholder="6 × GN 1/1" />
            </Field>
            <Field label="Power">
              <Input {...commit("power")} placeholder="10.2 kW" />
            </Field>
          </div>

          <Field label="Dimensions" hint="width × depth × height, centimetres">
            <div className="grid grid-cols-3 gap-2">
              <Input {...commitCm("width_cm")} inputMode="decimal" placeholder="W" />
              <Input {...commitCm("depth_cm")} inputMode="decimal" placeholder="D" />
              <Input {...commitCm("height_cm")} inputMode="decimal" placeholder="H" />
            </div>
          </Field>

          {/* Half-width rather than full, though it is alone on its row now
              that the shelf code is gone: a weight is four characters, and a
              box sized for a paragraph invites one. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight" hint="kg — decides delivery">
              <Input {...commit("weight_kg", toNumber)} inputMode="decimal" placeholder="118" />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Price">
        <div className="grid grid-cols-2 gap-3">
          {/* The only figure on this form a buyer will ever read, so it carries a
              faint accent halo — enough that the eye finds it among eight
              identical boxes, not so much that it reads as an error. */}
          <Field label="Asking price" required hint="shows on the website">
            <RandInput
              className={PUBLIC_FIELD_HALO}
              valueCents={listPrice}
              onChangeCents={setListPrice}
              onBlur={() => {
                if (listPrice !== (lastSaved.current.list_price_cents ?? null))
                  save({ list_price_cents: listPrice });
              }}
            />
          </Field>
          <Field label="New price" hint="powers the saving badge">
            <RandInput
              valueCents={retailPrice}
              onChangeCents={setRetailPrice}
              onBlur={() => {
                if (retailPrice !== (lastSaved.current.retail_price_cents ?? null))
                  save({ retail_price_cents: retailPrice });
              }}
            />
          </Field>
        </div>
      </Panel>

      {/* Costs and margin exist only for managers and owners. A staff account
          gets no panel at all rather than an empty one, which would read as
          "this machine cost nothing". */}
      {canSeeCosts(role) && (
        <CostsPanel
          itemId={item.id}
          costs={costs}
          auctionCents={auctionCents}
          workshopCents={workshopCents}
          onFixedCostChange={(kind, cents) =>
            (kind === "auction" ? setAuctionCents : setWorkshopCents)(cents)
          }
          listPriceCents={listPrice}
          unitCount={item.stock_quantity ?? 1}
        />
      )}

      {/* All four stages, always on screen, current one lit. Nothing is hidden
          behind "what can I do from here" — the answer is always "any of them",
          so the buttons are a picker rather than a list of moves. Tapping the
          stage it is already on is allowed on purpose: that is what retries
          publishing once a missing photo or price has been added. */}
      <Panel
        title="Stage"
        subtitle="Tap any one. The stage decides whether it is on the website."
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {STAGES.map((stage) => {
            const current = item.status === stage.status;
            const tapped = changing === stage.status;
            return (
              <button
                key={stage.status}
                onClick={() => onStatus(stage.status)}
                aria-pressed={current}
                aria-busy={tapped}
                // All four lock while one is in flight: a second tap on a slow
                // connection used to race the first, and the machine could end
                // up published by one and unpublished by the other.
                disabled={changing !== null}
                className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                  current
                    ? "border-accent/70 bg-accent/10"
                    : "border-border hover:border-white/25"
                } ${changing !== null && !tapped ? "opacity-50" : ""} disabled:cursor-wait`}
              >
                <span className="flex items-center gap-1.5">
                  {tapped ? (
                    <span className="w-3 h-3 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  ) : (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        stage.live ? "bg-accent" : "bg-muted"
                      }`}
                    />
                  )}
                  <span
                    className={`text-sm font-medium tracking-tight ${
                      current ? "text-accent" : "text-white/90"
                    }`}
                  >
                    {stage.label}
                  </span>
                </span>
                <span className="block text-[11px] font-light text-muted mt-1 leading-snug">
                  {stage.hint}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* No publish button here on purpose. The stage above is the one control,
          and a second switch that could disagree with it is exactly how sold
          machines used to end up still listed. This panel reports what happened
          and, when something is live-stage but not live, says what is missing. */}
      <Panel
        title="The website"
        subtitle={
          publiclyVisible
            ? item.website_availability === "on_hire" ? "Visible as Coming back soon. Unavailable to buy until it returns." : item.status === "reserved" ? "Visible as Reserved. Unavailable to buy." : "Live now. Move it to the workshop or Sold to take it down."
            : item.website_availability === "hidden" && item.status === "reserved" ? "Held on lay-by or Rental Finance — hidden from the website."
            : liveStage
              ? "Not live yet — it needs the rest of this list, then tap its stage again."
              : "Off the site, because of the stage it is in."
        }
      >
        <div className="space-y-4">
          {!item.published_at && liveStage && item.website_availability !== "hidden" && (
            <ul className="space-y-1.5">
              {checklist.map((req) => (
                <li key={req.id} className="flex items-center gap-2 text-sm font-light">
                  <span
                    className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                      req.met ? "bg-accent text-background" : "border border-border text-muted"
                    }`}
                  >
                    {req.met && (
                      <iconify-icon icon="solar:check-read-linear" width="11" height="11" noobserver="" />
                    )}
                  </span>
                  <span className={req.met ? "text-muted line-through" : "text-white/80"}>
                    {req.label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {publiclyVisible && (
              <a
                href={`${storefrontUrl}/stock/${item.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-light text-muted hover:text-accent transition-colors"
              >
                View on site
                <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" noobserver="" />
              </a>
            )}

            {/* A slot, not a flag: the homepage row holds eight machines and no
                more, so this says which of the eight are spoken for rather than
                letting a worker tick a ninth and find out from an error. */}
            <label
              className={`flex items-center gap-2 ml-auto text-sm font-light ${
                slotsFull ? "text-muted cursor-not-allowed" : "text-white/80 cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={featured}
                disabled={slotsFull}
                onChange={(e) => onFeatured(e.target.checked)}
                className="w-4 h-4 rounded accent-accent disabled:opacity-40"
              />
              Feature on the homepage
              <span className="text-[11px] text-muted tabular-nums">
                {slotsFull
                  ? `all ${MAX_FEATURED} taken`
                  : `${slotsTaken} of ${MAX_FEATURED}`}
              </span>
            </label>
          </div>
        </div>
      </Panel>

      {activity.length > 0 && (
        <Panel title="History">
          <ol className="space-y-2.5">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 text-xs font-light">
                <span className="text-muted whitespace-nowrap tabular-nums">
                  {new Date(entry.created_at).toLocaleDateString("en-ZA", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="text-white/80">{entry.summary ?? entry.action}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {/* Last on the page on purpose. Nothing routine lives below it, so the
          scroll that reaches it is one somebody meant to make. */}
      <DeleteItem
        id={item.id}
        title={form.title}
        live={publiclyVisible}
        onOrder={item.status === "reserved" || item.status === "sold"}
        /* Whether this is a draft nobody ever filled in — which decides
           whether deleting keeps a record or keeps nothing at all. The action
           decides it again on the server from the same five conditions; this
           copy exists so the warning says what is about to happen rather than
           what usually happens. mediaCount is the live one, so a photograph
           taken a second ago counts. */
        blank={
          !item.published_at &&
          mediaCount === 0 &&
          costs.length === 0 &&
          (item.status === "refurbishing" || item.status === "listed")
        }
      />
    </div>
  );
}

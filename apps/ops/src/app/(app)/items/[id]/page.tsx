import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getActivity,
  getCategories,
  getCosts,
  getDivisions,
  getEconomics,
  getFeaturedCount,
  getItem,
  getItemUnits,
  getSubcategories,
  getTags,
} from "@/lib/queries";
import { getLeadsWantingItem } from "@/lib/leads";
import { requireStaff } from "@/lib/supabase";
import { storefrontOrigin } from "@/lib/storefront";
import { canSeeCosts } from "@takemore/core";
import ItemEditor from "./ItemEditor";
import WhoWantsThis from "./WhoWantsThis";
import UnitInventory from "./UnitInventory";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Everything rides alongside the auth check in one round — every query here
  // needs only the id from the URL, RLS answers each on its own, and waiting
  // for the item before asking for the reference data was a full extra round
  // trip to a database a continent away.
  //
  // Costs and margin are not merely hidden from staff in the UI — the queries
  // return nothing for them by policy. Skipping the fetch entirely keeps the
  // intent obvious at the call site; the gate chains off the (per-request
  // cached) auth check so staff still never issue them.
  const staffPromise = requireStaff();
  const [
    staff,
    item,
    units,
    divisions,
    categories,
    subcategories,
    tags,
    costs,
    economics,
    activity,
    wanting,
    featuredCount,
  ] = await Promise.all([
    staffPromise,
    getItem(id),
    getItemUnits(id),
    getDivisions(),
    getCategories(),
    getSubcategories(),
    getTags(),
    staffPromise.then((s) => (canSeeCosts(s.role) ? getCosts(id) : [])),
    staffPromise.then((s) => (canSeeCosts(s.role) ? getEconomics(id) : null)),
    getActivity(id),
    getLeadsWantingItem(id),
    getFeaturedCount(),
  ]);
  if (!item) notFound();

  const showCosts = canSeeCosts(staff.role);

  return (
    <div className="max-w-5xl">
      <Link
        href="/items"
        className="inline-flex items-center gap-1.5 text-xs font-light text-muted hover:text-white transition-colors mb-4"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="14" height="14" noobserver="" />
        Stock
      </Link>

      <ItemEditor
        item={item}
        unitInventory={<UnitInventory itemId={id} units={units} />}
        divisions={divisions}
        categories={categories}
        subcategories={subcategories}
        tags={tags}
        costs={costs}
        economics={economics}
        activity={activity}
        role={staff.role}
        featuredCount={featuredCount}
        // Resolved here, on the server, where every variable is readable. In
        // the browser only NEXT_PUBLIC_* exists, and "View on site" used to
        // fall back to "" and open /stock/<slug> on the ops app itself.
        storefrontUrl={storefrontOrigin()}
      />

      {/* Below the editor rather than beside it: this is context for a decision
          already being made, not a control. It renders nothing when nobody is
          waiting, which is most of the time. */}
      <div className="mt-4">
        <WhoWantsThis
          itemId={id}
          // The same three conditions match_item_to_leads() checks before it
          // will queue anything about a machine, and deliverEmail() re-checks
          // at the moment of sending. Withholding the button is the courtesy;
          // those two are the rule.
          sellable={
            item.status === "listed" &&
            item.available_quantity > 0 &&
            item.published_at !== null &&
            (item.list_price_cents ?? 0) > 0
          }
          leads={wanting}
        />
      </div>
    </div>
  );
}

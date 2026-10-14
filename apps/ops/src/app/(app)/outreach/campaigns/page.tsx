import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff, supabase } from "@/lib/supabase";
import { countReachableByEmail, listCampaigns } from "@/lib/leads";
import { emailIsConfigured } from "@/lib/email";
import { atLeast } from "@takemore/core";
import CampaignComposer from "./CampaignComposer";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const client = await supabase();

  // One round of queries, auth included — RLS guards every read on its own,
  // and the role redirect below still fires before anything renders.
  const [staff, campaigns, itemsResult, audienceCount] = await Promise.all([
    requireStaff(),
    listCampaigns(),
    client
      .from("items")
      .select("id, title, brand, list_price_cents, published_at")
      .eq("status", "listed")
      .gt("available_quantity", 0)
      .not("published_at", "is", null)
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .limit(60),
    countReachableByEmail(),
  ]);

  // The RLS policy on outreach_campaigns is what actually stops a staff account
  // from sending one; this is here so they get a page they can read rather than
  // a form that 403s on submit.
  if (!atLeast(staff.role, "manager")) redirect("/outreach");

  const items = (itemsResult.data ?? []) as unknown as {
    id: string;
    title: string;
    brand: string | null;
    list_price_cents: number | null;
    published_at: string;
  }[];

  // Everything published since the last one went out — which is exactly what a
  // "what came in this month" newsletter is, so it is ticked by default.
  const lastSent = campaigns.find((c) => c.state === "sent")?.sent_at;
  const since = lastSent ? new Date(lastSent).getTime() : Date.now() - 30 * 86_400_000;
  const fresh = items.filter((i) => new Date(i.published_at).getTime() > since);

  return (
    <div className="max-w-4xl">
      <Link
        href="/outreach"
        className="inline-flex items-center gap-1.5 text-xs font-light text-muted hover:text-white transition-colors mb-4"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="14" height="14" noobserver="" />
        Outreach
      </Link>

      <header className="mb-5">
        <h1 className="text-xl font-medium tracking-tight">What came in</h1>
        <p className="text-sm font-light text-muted mt-1">
          One email to everyone who asked to hear about new stock. {audienceCount}{" "}
          {audienceCount === 1 ? "person has" : "people have"} agreed.
        </p>
      </header>

      {!emailIsConfigured() && (
        <div className="text-xs font-light text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5 mb-4">
          Email is not connected. Add <span className="font-medium">RESEND_API_KEY</span> and a
          verified sending domain before this can send anything.
        </div>
      )}

      <CampaignComposer
        items={items}
        preselected={fresh.map((i) => i.id)}
        audienceCount={audienceCount}
        canSend={emailIsConfigured()}
        campaigns={campaigns}
      />
    </div>
  );
}

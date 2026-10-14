import { notFound } from "next/navigation";
import { getItem, getItemUnits } from "@/lib/queries";
import UnitLabels from "@/components/UnitLabels";

export const dynamic = "force-dynamic";

export default async function LabelPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const [{ id }, { unit }] = await Promise.all([params, searchParams]);
  const [item, units] = await Promise.all([getItem(id), getItemUnits(id)]);
  if (!item) notFound();
  const selected = units.filter(u => !u.retired_at && (!unit || u.id === unit));
  if (unit && !selected.length) notFound();
  return <UnitLabels backHref={`/items/${item.id}`} backLabel="Back to the listing"
    labels={selected.map(u => ({ code: u.code, title: item.title, descriptor: [item.brand, item.model].filter(Boolean).join(" ") }))} />;
}

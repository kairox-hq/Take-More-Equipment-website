import { notFound } from "next/navigation";
import { getOrder, getOrderLines } from "@/lib/orders";
import UnitLabels from "@/components/UnitLabels";

export const dynamic = "force-dynamic";

export default async function OrderLabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, lines] = await Promise.all([getOrder(id), getOrderLines(id)]);
  if (!order) notFound();
  return <UnitLabels backHref={`/orders/${id}`} backLabel={`Back to ${order.code}`}
    labels={lines.map(l => ({ code: l.unit_code, title: l.item?.title ?? "Item", descriptor: l.item?.brand ?? undefined }))} />;
}

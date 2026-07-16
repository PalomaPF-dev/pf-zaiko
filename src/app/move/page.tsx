import IoPageBody from "@/components/IoPageBody";

export const dynamic = "force-dynamic";

export default async function MovePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; location?: string }>;
}) {
  const sp = await searchParams;
  return (
    <IoPageBody
      variant="stock-ops"
      title="移動・調整"
      description="ロケ間の在庫移動と、実在庫に合わせた在庫調整を記録します。"
      defaultProductId={sp.product}
      defaultLocationId={sp.location}
    />
  );
}

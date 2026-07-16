import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listProducts, listLocations, listPartners, listStock } from "@/lib/db";
import { resolveCurrentWorkplace } from "@/lib/workplace";
import { recordMovementAction, moveStockAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import IoForm, { type IoProduct, type IoLocation, type IoStockCell, type IoVariant } from "@/components/IoForm";
import DbErrorState from "@/components/DbErrorState";
import NoWorkplaceState from "@/components/NoWorkplaceState";

/** 入荷/出荷/在庫操作ページの共通ボディ（データ取得＋IoForm）。variant で用途を切り替える。 */
export default async function IoPageBody({
  variant,
  title,
  description,
  defaultProductId,
  defaultLocationId,
}: {
  variant: IoVariant;
  title: string;
  description: string;
  defaultProductId?: string;
  defaultLocationId?: string;
}) {
  const session = await requireEntitledSession();
  const workplace = await resolveCurrentWorkplace(session.companyId);
  if (!workplace) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title={title} />
        <NoWorkplaceState />
      </div>
    );
  }

  let products, locations, suppliers, internals, stockRows;
  try {
    [products, locations, suppliers, internals, stockRows] = await Promise.all([
      listProducts(session.companyId, { activeOnly: true }),
      listLocations(session.companyId, { workplaceId: workplace.id }),
      listPartners(session.companyId, { kind: "supplier", activeOnly: true }),
      listPartners(session.companyId, { kind: "internal", activeOnly: true }),
      listStock(session.companyId, { workplaceId: workplace.id, nonZeroOnly: true }),
    ]);
  } catch (e) {
    console.error("[io]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title={title} />
        <DbErrorState />
      </div>
    );
  }

  const ioProducts: IoProduct[] = products.map((p) => ({ id: p.id, drawingNo: p.drawingNo, name: p.name, unit: p.unit }));
  const ioLocations: IoLocation[] = locations.map((l) => ({ id: l.id, code: l.code }));
  // 商品ごとの在庫（ロケ・数量、在庫最多順）＝移動元ロケの自動選択に使う
  const stockByProduct: Record<string, IoStockCell[]> = {};
  for (const s of stockRows) {
    (stockByProduct[s.productId] ??= []).push({ locationId: s.locationId, code: s.locationCode, qty: s.qty });
  }
  for (const k in stockByProduct) stockByProduct[k].sort((a, b) => b.qty - a.qty);
  const noData = products.length === 0 || locations.length === 0;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader title={title} description={description} />

      {noData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-500" />
          <p className="text-sm text-amber-700">商品とロケーションの登録が必要です。</p>
          <div className="mt-3 flex justify-center gap-3 text-sm font-medium">
            {products.length === 0 && (
              <Link href="/products/new" className="text-fuchsia-600 hover:underline">
                商品を登録
              </Link>
            )}
            {locations.length === 0 && (
              <Link href="/locations/new" className="text-fuchsia-600 hover:underline">
                ロケーションを作成
              </Link>
            )}
          </div>
        </div>
      ) : (
        <IoForm
          variant={variant}
          products={ioProducts}
          locations={ioLocations}
          suppliers={suppliers.map((p) => p.name)}
          internals={internals.map((p) => p.name)}
          stockByProduct={stockByProduct}
          defaultProductId={defaultProductId}
          defaultLocationId={defaultLocationId}
          recordAction={recordMovementAction}
          moveAction={moveStockAction}
        />
      )}
    </div>
  );
}

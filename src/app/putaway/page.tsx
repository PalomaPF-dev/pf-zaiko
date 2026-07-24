import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listPendingPutaway, listLocations } from "@/lib/db";
import { resolveCurrentWorkplace } from "@/lib/workplace";
import { currentScope } from "@/lib/scope";
import { putawayAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import NoWorkplaceState from "@/components/NoWorkplaceState";
import PutawayForm, { type PutawayProduct, type PutawayLocation } from "@/components/PutawayForm";

export const dynamic = "force-dynamic";

export default async function PutawayPage() {
  const session = await requireEntitledSession();

  let workplace, pending, locations;
  try {
    workplace = await resolveCurrentWorkplace(session.companyId);
    if (!workplace) {
      return (
        <div className="p-4 sm:p-6">
          <PageHeader title="入庫（棚入れ）" />
          <NoWorkplaceState />
        </div>
      );
    }
    // 棚入れ候補は自工場で受け入れた入荷分だけ
    const { siteId } = await currentScope();
    [pending, locations] = await Promise.all([
      listPendingPutaway(session.companyId, { siteId }),
      listLocations(session.companyId, { workplaceId: workplace.id }),
    ]);
  } catch (e) {
    console.error("[putaway]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="入庫（棚入れ）" />
        <DbErrorState />
      </div>
    );
  }

  const products: PutawayProduct[] = pending.map((p) => ({
    productId: p.productId,
    drawingNo: p.drawingNo,
    productCode: p.productCode,
    stockKey: p.stockKey,
    productName: p.productName,
    unit: p.unit,
    pendingQty: p.pendingQty,
    supplier: p.supplier,
    deliverTo: p.deliverTo,
  }));
  const locs: PutawayLocation[] = locations.map((l) => ({ id: l.id, code: l.code }));

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader
        title="入庫（棚入れ）"
        description="①入荷で貼った商品ラベルをスキャン（または一覧から選択）し、ロケーションを付与して棚入れします。商品ごとに完結します。"
      />

      {locs.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-500" />
          <p className="text-sm text-amber-700">棚入れ先のロケーションが必要です。</p>
          <Link href="/locations/new" className="mt-3 inline-block text-sm font-medium text-fuchsia-600 hover:underline">
            ロケーションを作成
          </Link>
        </div>
      ) : (
        <PutawayForm products={products} locations={locs} action={putawayAction} />
      )}
    </div>
  );
}

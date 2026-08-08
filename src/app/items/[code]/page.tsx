import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { getItemMasterByCode } from "@/lib/db";
import { ensureItemMasterSeeded } from "@/lib/itemMasterSeed";
import { formatItemCode, itemUnitLabel, normalizeItemCode } from "@/lib/itemCode";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";

export const dynamic = "force-dynamic";

/** YYYYMMDD → 2026/08/07（有効期間の表示用）。 */
function ymd(value: string | null): string {
  if (!value || !/^\d{8}$/.test(value)) return value || "—";
  return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
      <dt className="w-28 shrink-0 text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-slate-700">{children}</dd>
    </div>
  );
}

export default async function ItemDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const session = await requireAdminPage();
  const { code: rawCode } = await params;
  const code = normalizeItemCode(decodeURIComponent(rawCode));
  if (!code) notFound();

  let item;
  try {
    await ensureItemMasterSeeded(session.companyId);
    item = await getItemMasterByCode(session.companyId, code);
  } catch (e) {
    console.error("[item detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="品目詳細" />
        <DbErrorState />
      </div>
    );
  }
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <MasterTabs />
      <Link href="/items" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        資材W/F 品目カタログ
      </Link>
      <PageHeader
        title={item.name}
        description={`品目コード ${formatItemCode(item.code)}${item.active ? "" : "（廃止品目）"}`}
        action={
          item.productId ? (
            <Link
              href={`/products/${item.productId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              品目マスタを開く
            </Link>
          ) : (
            <Link
              href={`/products/new?item=${item.code}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
            >
              <PackagePlus className="h-4 w-4" />
              品目マスタに登録
            </Link>
          )
        }
      />

      <dl className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Row label="品目コード">
          <span className="font-mono">{formatItemCode(item.code)}</span>
          <span className="ml-2 text-xs text-slate-400">（{item.code}）</span>
        </Row>
        <Row label="品名">{item.name}</Row>
        <Row label="仕入先">
          {item.supplierName ?? "—"}
          {item.supplierCode && <span className="ml-2 text-xs text-slate-400">外注CD {item.supplierCode}</span>}
        </Row>
        {item.altSuppliers && <Row label="併用仕入先">{item.altSuppliers}</Row>}
        <Row label="納入単価">{item.unitPrice != null ? `${item.unitPrice.toLocaleString()} 円` : "—"}</Row>
        <Row label="入数">
          {item.packQty != null ? `${item.packQty.toLocaleString()} ${itemUnitLabel(item.packUnitCode)}` : "—"}
        </Row>
        <Row label="ロット数">{item.lotQty != null ? item.lotQty.toLocaleString() : "—"}</Row>
        <Row label="まるめ">{item.roundQty != null ? item.roundQty.toLocaleString() : "—"}</Row>
        <Row label="容器">{item.container ?? "—"}</Row>
        <Row label="単位コード">
          {item.unitCode ? itemUnitLabel(item.unitCode) : "—"}
          {item.unitCode && itemUnitLabel(item.unitCode) === item.unitCode && (
            <span className="ml-2 text-xs text-slate-400">資材W/F の単位コード</span>
          )}
        </Row>
        <Row label="受入科目">{item.accountCode ?? "—"}</Row>
        <Row label="有効期間">
          {ymd(item.validFrom)} 〜 {ymd(item.validTo)}
        </Row>
      </dl>

      <p className="mt-4 text-xs text-slate-400">
        資材W/F 品目カタログは W/F から取り込んだ参照用の一覧です。在庫は持ちません。
        入出庫の対象にするには「品目マスタに登録」から登録してください（品目コードがそのまま図番になり、
        スキャン・手入力で呼び出せます）。
      </p>
    </div>
  );
}

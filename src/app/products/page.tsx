import Link from "next/link";
import { BookMarked, CheckCircle2, Package, Plus, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listProducts } from "@/lib/db";
import { bulkDeleteProductsAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import { BelowSafetyBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";
import ProductBulkDeleteForm from "@/components/ProductBulkDeleteForm";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; below?: string; deleted?: string; selected?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const search = sp.q?.trim() || null;
  const belowOnly = sp.below === "1";
  // 一括削除直後のリダイレクトで結果を受け取る（deleted=削除数 / selected=選択数）
  const deleted = sp.deleted != null ? parseInt(sp.deleted, 10) : null;
  const selectedCount = sp.selected != null ? parseInt(sp.selected, 10) : null;

  let products;
  try {
    products = await listProducts(session.companyId, { search, belowSafetyOnly: belowOnly });
  } catch (e) {
    console.error("[products]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="品目マスタ" />
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <MasterTabs />
      <PageHeader
        title="品目マスタ"
        description="在庫を管理する品目を登録します（図番・品名・単位・ロットサイズは現品票にも印字されます）。資材W/F に登録済みの品目は、品目コードで呼び出して登録できます。"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/items"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <BookMarked className="h-4 w-4" />
              資材W/Fから探す
            </Link>
            <Link
              href="/products/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
            >
              <Plus className="h-4 w-4" />
              新規登録
            </Link>
          </div>
        }
      />

      {deleted != null && Number.isFinite(deleted) && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {deleted.toLocaleString()} 品目を削除しました。
            {selectedCount != null && selectedCount > deleted && (
              <span className="ml-1 text-emerald-700/80">
                （{(selectedCount - deleted).toLocaleString()} 品目は受払履歴があるためスキップ。履歴のある品目は編集画面で無効化してください）
              </span>
            )}
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={search ?? ""}
              placeholder="図番・品名・規格・分類・メーカーで検索"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          {belowOnly && <input type="hidden" name="below" value="1" />}
          <button className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            検索
          </button>
        </form>
        <Link
          href={
            belowOnly
              ? `/products${search ? `?q=${encodeURIComponent(search)}` : ""}`
              : `/products?below=1${search ? `&q=${encodeURIComponent(search)}` : ""}`
          }
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            belowOnly ? "border-red-500 bg-red-50 text-red-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          安全在庫割れのみ
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            {search || belowOnly ? "該当する品目がありません。" : "品目がまだ登録されていません。"}
          </p>
          {!search && !belowOnly && (
            <Link href="/products/new" className="mt-3 inline-block text-sm font-medium text-fuchsia-600 hover:underline">
              最初の品目を登録する
            </Link>
          )}
        </div>
      ) : (
        <ProductBulkDeleteForm action={bulkDeleteProductsAction} rowCount={products.length}>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="w-10 px-3 py-2.5"><span className="sr-only">選択</span></th>
                <th className="px-4 py-2.5">図番</th>
                <th className="px-4 py-2.5">品名</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">分類</th>
                <th className="px-4 py-2.5 text-right">現在庫</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${!p.active ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      name="ids"
                      value={p.id}
                      title="一括削除の対象（受払履歴のある品目はスキップされます）"
                      className="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/products/${p.id}`} className="font-mono font-medium text-slate-800 hover:text-fuchsia-600">
                      {p.drawingNo}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/products/${p.id}`} className="text-slate-700 hover:text-fuchsia-600">
                      {p.name}
                    </Link>
                    {p.belowSafety && (
                      <span className="ml-2 align-middle">
                        <BelowSafetyBadge />
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">{p.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-bold tabular-nums ${p.belowSafety ? "text-red-600" : "text-slate-800"}`}>
                      {p.totalQty.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400"> {p.unit}</span>
                    {p.locationCount > 1 && <span className="ml-1 text-xs text-slate-400">({p.locationCount}ロケ)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </ProductBulkDeleteForm>
      )}
    </div>
  );
}

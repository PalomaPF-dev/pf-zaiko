import Link from "next/link";
import { BookMarked, CheckCircle2, Package, Plus, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listProducts, listCategories } from "@/lib/db";
import { bulkDeleteProductsAction, bulkSetCategoryAction } from "@/lib/actions";
import type { ProductWithStock } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import { BelowSafetyBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";
import ProductBulkDeleteForm from "@/components/ProductBulkDeleteForm";

export const dynamic = "force-dynamic";

/** 分類フィルタの「未分類」を表す予約値（分類名とは衝突しない記号にしてある） */
const UNCATEGORIZED = "-";

/** 並び替えできる列と比較関数。既定（sort 未指定）は SQL の 有効品目→品名順 のまま。 */
const SORTERS: Record<string, (a: ProductWithStock, b: ProductWithStock) => number> = {
  drawing: (a, b) => (a.drawingNo ?? "").localeCompare(b.drawingNo ?? "", "ja"),
  name: (a, b) => a.name.localeCompare(b.name, "ja"),
  category: (a, b) => (a.category ?? "").localeCompare(b.category ?? "", "ja"),
  qty: (a, b) => a.totalQty - b.totalQty,
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    below?: string;
    cat?: string;
    sort?: string;
    dir?: string;
    deleted?: string;
    selected?: string;
    categorized?: string;
  }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const search = sp.q?.trim() || null;
  const belowOnly = sp.below === "1";
  const cat = sp.cat?.trim() || null;
  const sortKey = sp.sort && sp.sort in SORTERS ? sp.sort : null;
  const desc = sp.dir === "desc";
  // 一括操作直後のリダイレクトで結果を受け取る（deleted=削除数 / selected=選択数 / categorized=分類設定数）
  const deleted = sp.deleted != null ? parseInt(sp.deleted, 10) : null;
  const selectedCount = sp.selected != null ? parseInt(sp.selected, 10) : null;
  const categorized = sp.categorized != null ? parseInt(sp.categorized, 10) : null;

  let products, categories;
  try {
    [products, categories] = await Promise.all([
      listProducts(session.companyId, {
        search,
        belowSafetyOnly: belowOnly,
        category: cat && cat !== UNCATEGORIZED ? cat : null,
        uncategorizedOnly: cat === UNCATEGORIZED,
      }),
      listCategories(session.companyId),
    ]);
  } catch (e) {
    console.error("[products]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="品目マスタ" />
        <DbErrorState />
      </div>
    );
  }

  // 並び替えは列ヘッダのリンクで指定（同じ列をもう一度押すと昇順⇔降順）
  if (sortKey) {
    products = [...products].sort((a, b) => {
      const d = SORTERS[sortKey](a, b) || a.name.localeCompare(b.name, "ja");
      return desc ? -d : d;
    });
  }

  /** 現在のフィルタを維持したまま一部のクエリだけ差し替えた URL。 */
  const query = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (belowOnly) p.set("below", "1");
    if (cat) p.set("cat", cat);
    if (sortKey) p.set("sort", sortKey);
    if (sortKey && desc) p.set("dir", "desc");
    for (const [k, v] of Object.entries(over)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `/products?${s}` : "/products";
  };

  /** 並び替え用の列ヘッダ（押すたびに 昇順→降順 をトグル）。 */
  const SortHeader = ({ id, label, align = "left" }: { id: string; label: string; align?: "left" | "right" }) => {
    const active = sortKey === id;
    return (
      <Link
        href={query({ sort: id, dir: active && !desc ? "desc" : undefined })}
        className={`inline-flex items-center gap-0.5 hover:text-slate-700 ${align === "right" ? "justify-end" : ""} ${
          active ? "text-fuchsia-700" : ""
        }`}
        title="クリックで並び替え"
      >
        {label}
        <span className="text-[10px]">{active ? (desc ? "▼" : "▲") : ""}</span>
      </Link>
    );
  };

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
      {categorized != null && Number.isFinite(categorized) && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {categorized.toLocaleString()} 品目の分類を{cat ? `「${cat}」に` : "未分類に"}設定しました。
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={search ?? ""}
              placeholder="図番・品名・規格・分類・メーカーで検索"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          {/* 分類での絞り込み（「未分類」は分類がまだ付いていない品目） */}
          <select
            name="cat"
            defaultValue={cat ?? ""}
            className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-700 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          >
            <option value="">分類: すべて</option>
            <option value={UNCATEGORIZED}>未分類</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {belowOnly && <input type="hidden" name="below" value="1" />}
          <button className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            検索
          </button>
        </form>
        <Link
          href={belowOnly ? query({ below: undefined }) : query({ below: "1" })}
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
            {search || belowOnly || cat ? "該当する品目がありません。" : "品目がまだ登録されていません。"}
          </p>
          {!search && !belowOnly && !cat && (
            <Link href="/products/new" className="mt-3 inline-block text-sm font-medium text-fuchsia-600 hover:underline">
              最初の品目を登録する
            </Link>
          )}
        </div>
      ) : (
        <>
        <p className="mb-2 text-xs text-slate-400">
          {products.length.toLocaleString()}件{cat ? `（分類: ${cat === UNCATEGORIZED ? "未分類" : cat}）` : ""}
          ・列名をクリックすると並び替えできます
        </p>
        <ProductBulkDeleteForm
          deleteAction={bulkDeleteProductsAction}
          categoryAction={bulkSetCategoryAction}
          categorySuggestions={categories}
          rowCount={products.length}
        >
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="w-10 px-3 py-2.5"><span className="sr-only">選択</span></th>
                <th className="px-4 py-2.5"><SortHeader id="drawing" label="図番" /></th>
                <th className="px-4 py-2.5"><SortHeader id="name" label="品名" /></th>
                <th className="hidden px-4 py-2.5 sm:table-cell"><SortHeader id="category" label="分類" /></th>
                <th className="px-4 py-2.5 text-right"><SortHeader id="qty" label="現在庫" align="right" /></th>
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
                      title="一括操作（分類の設定・削除）の対象"
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
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    {p.category ? (
                      <Link
                        href={query({ cat: p.category, sort: undefined, dir: undefined })}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700"
                        title={`分類「${p.category}」で絞り込む`}
                      >
                        {p.category}
                      </Link>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
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
        </>
      )}
    </div>
  );
}

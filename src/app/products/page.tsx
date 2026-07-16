import Link from "next/link";
import { Package, Plus, Search } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listProducts } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import { BelowSafetyBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; below?: string }>;
}) {
  const session = await requireEntitledSession();
  const sp = await searchParams;
  const search = sp.q?.trim() || null;
  const belowOnly = sp.below === "1";

  let products;
  try {
    products = await listProducts(session.companyId, { search, belowSafetyOnly: belowOnly });
  } catch (e) {
    console.error("[products]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="商品マスタ" />
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <MasterTabs />
      <PageHeader
        title="商品マスタ"
        description="図番・品名・単位・ロットサイズを登録します。入庫・移動の現品票に印字されます。"
        action={
          <Link
            href="/products/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
          >
            <Plus className="h-4 w-4" />
            新規登録
          </Link>
        }
      />

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
            {search || belowOnly ? "該当する商品がありません。" : "商品がまだ登録されていません。"}
          </p>
          {!search && !belowOnly && (
            <Link href="/products/new" className="mt-3 inline-block text-sm font-medium text-fuchsia-600 hover:underline">
              最初の商品を登録する
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">図番</th>
                <th className="px-4 py-2.5">品名</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">分類</th>
                <th className="px-4 py-2.5 text-right">現在庫</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${!p.active ? "opacity-50" : ""}`}>
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
      )}
    </div>
  );
}

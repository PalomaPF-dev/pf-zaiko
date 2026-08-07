import Link from "next/link";
import { BookMarked, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listItemMaster, getItemMasterImport } from "@/lib/db";
import { ensureItemMasterSeeded, ITEM_MASTER_COUNT, ITEM_MASTER_VERSION } from "@/lib/itemMasterSeed";
import { formatItemCode, itemUnitLabel } from "@/lib/itemCode";
import { reimportItemMasterAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 取込データの版（YYYYMMDD）を「2026/08/07 時点」の形で見せる。 */
function versionLabel(v: string): string {
  return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}/${v.slice(4, 6)}/${v.slice(6)} 時点` : v;
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; only?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const search = sp.q?.trim() || null;
  const unregisteredOnly = sp.only === "new";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  let items, total, imported;
  try {
    // 初回アクセス時に同梱データ（資材W/F の品目マスタ）をこの会社へ取り込む
    await ensureItemMasterSeeded(session.companyId);
    [{ items, total }, imported] = await Promise.all([
      listItemMaster(session.companyId, {
        search,
        unregisteredOnly,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      getItemMasterImport(session.companyId),
    ]);
  } catch (e) {
    console.error("[items]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="品目マスタ" />
        <DbErrorState />
      </div>
    );
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (unregisteredOnly) p.set("only", "new");
    for (const [k, v] of Object.entries(over)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `/items?${s}` : "/items";
  };

  return (
    <div className="p-4 sm:p-6">
      <MasterTabs />
      <PageHeader
        title="品目マスタ"
        description="資材W/F に登録されている品目の一覧です。品目コードで呼び出して、そのまま商品マスタに登録できます。"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="text-slate-600">
          <span className="font-semibold text-slate-800">{(imported?.itemCount ?? 0).toLocaleString()}</span> 品目を取込済み
          {imported && <span className="ml-2 text-xs text-slate-400">（資材W/F {versionLabel(imported.version)}）</span>}
        </div>
        {imported?.version !== ITEM_MASTER_VERSION && (
          <ConfirmForm
            action={reimportItemMasterAction}
            message={`資材W/F の品目マスタ（${versionLabel(ITEM_MASTER_VERSION)}・${ITEM_MASTER_COUNT.toLocaleString()}品目）を取り込みます。よろしいですか？`}
            className="inline"
          >
            <button className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-700">
              最新データを取り込む
            </button>
          </ConfirmForm>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={search ?? ""}
              placeholder="品目コード（06-26105-00）・品名・仕入先で検索"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          {unregisteredOnly && <input type="hidden" name="only" value="new" />}
          <button className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            検索
          </button>
        </form>
        <Link
          href={unregisteredOnly ? query({ only: undefined, page: undefined }) : query({ only: "new", page: undefined })}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            unregisteredOnly
              ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700"
              : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          商品未登録のみ
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BookMarked className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            {search || unregisteredOnly ? "該当する品目がありません。" : "品目マスタがまだ取り込まれていません。"}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-400">
            {total.toLocaleString()}件中 {((page - 1) * PAGE_SIZE + 1).toLocaleString()}〜
            {Math.min(page * PAGE_SIZE, total).toLocaleString()}件
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="whitespace-nowrap px-4 py-2.5">品目コード</th>
                  <th className="px-4 py-2.5">品名</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 md:table-cell">仕入先</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 text-right sm:table-cell">入数</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 text-right sm:table-cell">ロット数</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">商品</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.code} className={`hover:bg-slate-50 ${it.active ? "" : "opacity-50"}`}>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Link href={`/items/${it.code}`} className="font-mono font-medium text-slate-800 hover:text-fuchsia-600">
                        {formatItemCode(it.code)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/items/${it.code}`} className="text-slate-700 hover:text-fuchsia-600">
                        {it.name}
                      </Link>
                      {!it.active && <span className="ml-2 text-xs text-slate-400">（廃止）</span>}
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-500 md:table-cell">{it.supplierName ?? "—"}</td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                      {it.packQty != null ? `${it.packQty.toLocaleString()} ${itemUnitLabel(it.packUnitCode)}` : "—"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                      {it.lotQty != null ? it.lotQty.toLocaleString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {it.productId ? (
                        <Link href={`/products/${it.productId}`} className="text-xs font-semibold text-emerald-700 hover:underline">
                          登録済み
                        </Link>
                      ) : (
                        <Link
                          href={`/products/new?item=${it.code}`}
                          className="text-xs font-semibold text-fuchsia-600 hover:underline"
                        >
                          商品に登録
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lastPage > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              {page > 1 && (
                <Link href={query({ page: String(page - 1) })} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50">
                  前へ
                </Link>
              )}
              <span className="text-slate-500">
                {page} / {lastPage}
              </span>
              {page < lastPage && (
                <Link href={query({ page: String(page + 1) })} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50">
                  次へ
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

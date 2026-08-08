import Link from "next/link";
import { ArrowLeft, BookMarked, CheckCircle2, PackagePlus, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listItemMaster, getItemMasterImport } from "@/lib/db";
import { ensureItemMasterSeeded, ITEM_MASTER_COUNT, ITEM_MASTER_VERSION } from "@/lib/itemMasterSeed";
import { formatItemCode, itemUnitLabel } from "@/lib/itemCode";
import {
  bulkDeleteItemsAction,
  bulkRegisterAllItemsAction,
  bulkRegisterItemsAction,
  bulkRestoreItemsAction,
  reimportItemMasterAction,
} from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";
import ConfirmForm from "@/components/ConfirmForm";
import ItemBulkRegisterForm from "@/components/ItemBulkRegisterForm";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 取込データの版（YYYYMMDD）を「2026/08/07 時点」の形で見せる。 */
function versionLabel(v: string): string {
  return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}/${v.slice(4, 6)}/${v.slice(6)} 時点` : v;
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    only?: string;
    registered?: string;
    selected?: string;
    removed?: string;
    restored?: string;
  }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const search = sp.q?.trim() || null;
  const unregisteredOnly = sp.only === "new";
  const deletedView = sp.only === "deleted";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  // 一括操作直後のリダイレクトで結果を受け取る（registered=登録数 / selected=選択数 / removed=削除数 / restored=復元数）
  const registered = sp.registered != null ? parseInt(sp.registered, 10) : null;
  const selectedCount = sp.selected != null ? parseInt(sp.selected, 10) : null;
  const removed = sp.removed != null ? parseInt(sp.removed, 10) : null;
  const restored = sp.restored != null ? parseInt(sp.restored, 10) : null;

  let items, total, imported, unregisteredTotal;
  try {
    // 初回アクセス時に同梱データ（資材W/F の品目カタログ）をこの会社へ取り込む
    await ensureItemMasterSeeded(session.companyId);
    [{ items, total }, imported, { total: unregisteredTotal }] = await Promise.all([
      listItemMaster(session.companyId, {
        search,
        unregisteredOnly,
        deletedOnly: deletedView,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      getItemMasterImport(session.companyId),
      // 「残りすべてを登録」の対象件数（未登録・削除済みを除く全件）
      listItemMaster(session.companyId, { unregisteredOnly: true, limit: 1 }),
    ]);
  } catch (e) {
    console.error("[items]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="資材W/F 品目カタログ" />
        <DbErrorState />
      </div>
    );
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (unregisteredOnly) p.set("only", "new");
    if (deletedView) p.set("only", "deleted");
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
      <Link href="/products" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        品目マスタ
      </Link>
      <PageHeader
        title="資材W/F 品目カタログ"
        description="資材W/F に登録されている品目の一覧です。現物在庫として管理する品目だけをチェックして、品目マスタへ一括登録してください（保守・処理・運賃などの役務・費用系は登録不要です）。"
      />

      {removed != null && Number.isFinite(removed) && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {removed.toLocaleString()} 品目をカタログから削除しました。
            <Link href="/items?only=deleted" className="ml-2 font-semibold underline">
              削除済みを確認 →
            </Link>
          </span>
        </div>
      )}
      {restored != null && Number.isFinite(restored) && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {restored.toLocaleString()} 品目をカタログに戻しました。
            <Link href="/items" className="ml-2 font-semibold underline">
              カタログへ →
            </Link>
          </span>
        </div>
      )}
      {registered != null && Number.isFinite(registered) && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {registered.toLocaleString()} 品目を品目マスタに登録しました。
            {selectedCount != null && selectedCount > registered && (
              <span className="ml-1 text-emerald-700/80">（{(selectedCount - registered).toLocaleString()} 品目は登録済みのためスキップ）</span>
            )}
            <Link href="/products" className="ml-2 font-semibold underline">
              品目マスタを確認 →
            </Link>
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="text-slate-600">
          <span className="font-semibold text-slate-800">{(imported?.itemCount ?? 0).toLocaleString()}</span> 品目を取込済み
          {imported && <span className="ml-2 text-xs text-slate-400">（資材W/F {versionLabel(imported.version)}）</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {imported?.version !== ITEM_MASTER_VERSION && (
            <ConfirmForm
              action={reimportItemMasterAction}
              message={`資材W/F の品目カタログ（${versionLabel(ITEM_MASTER_VERSION)}・${ITEM_MASTER_COUNT.toLocaleString()}品目）を取り込みます。よろしいですか？`}
              className="inline"
            >
              <button className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-700">
                最新データを取り込む
              </button>
            </ConfirmForm>
          )}
          {/* 不要品目を削除し終えたら、残り（未登録・削除済みを除く）を全件まとめて品目マスタへ */}
          {!deletedView && unregisteredTotal > 0 && (
            <ConfirmForm
              action={bulkRegisterAllItemsAction}
              message={`カタログの未登録 ${unregisteredTotal.toLocaleString()} 品目を、すべて品目マスタに登録します。
（削除済みの品目は対象外・登録済みはスキップ）よろしいですか？`}
              className="inline"
            >
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                <PackagePlus className="h-3.5 w-3.5" />
                未登録の {unregisteredTotal.toLocaleString()} 品目をすべて登録
              </button>
            </ConfirmForm>
          )}
        </div>
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
          未登録のみ
        </Link>
        <Link
          href={deletedView ? query({ only: undefined, page: undefined }) : query({ only: "deleted", page: undefined })}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            deletedView
              ? "border-red-400 bg-red-50 text-red-700"
              : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          削除済み
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BookMarked className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            {deletedView
              ? "削除済みの品目はありません。"
              : search || unregisteredOnly
                ? "該当する品目がありません。"
                : "品目カタログがまだ取り込まれていません。"}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-400">
            {total.toLocaleString()}件中 {((page - 1) * PAGE_SIZE + 1).toLocaleString()}〜
            {Math.min(page * PAGE_SIZE, total).toLocaleString()}件
          </p>
          <ItemBulkRegisterForm
            mode={deletedView ? "deleted" : "active"}
            registerAction={bulkRegisterItemsAction}
            deleteAction={bulkDeleteItemsAction}
            restoreAction={bulkRestoreItemsAction}
            selectableCount={deletedView ? items.length : items.filter((it) => !it.productId).length}
          >
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="w-10 px-3 py-2.5"><span className="sr-only">選択</span></th>
                  <th className="whitespace-nowrap px-4 py-2.5">品目コード</th>
                  <th className="px-4 py-2.5">品名</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 md:table-cell">仕入先</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 text-right sm:table-cell">入数</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 text-right sm:table-cell">ロット数</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">品目マスタ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.code} className={`hover:bg-slate-50 ${it.active ? "" : "opacity-50"}`}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        name="codes"
                        value={it.code}
                        disabled={!deletedView && it.productId != null}
                        title={
                          deletedView
                            ? "元に戻す対象"
                            : it.productId
                              ? "登録済み（削除は品目マスタ側から）"
                              : "一括登録・削除の対象"
                        }
                        className="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500 disabled:opacity-30"
                      />
                    </td>
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
                      ) : deletedView ? (
                        <span className="text-xs text-slate-400">削除済み</span>
                      ) : (
                        <Link
                          href={`/products/new?item=${it.code}`}
                          className="text-xs font-semibold text-fuchsia-600 hover:underline"
                        >
                          登録する
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </ItemBulkRegisterForm>

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

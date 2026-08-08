import Link from "next/link";
import { Download, Search, Boxes, Factory } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listStock } from "@/lib/db";
import { currentWorkplaceOperation } from "@/lib/workplace";
import PageHeader from "@/components/PageHeader";
import { BelowSafetyBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import NoWorkplaceState from "@/components/NoWorkplaceState";
import StockRowActions from "@/components/StockRowActions";
import ViewOnlySiteNotice from "@/components/ViewOnlySiteNotice";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; below?: string }>;
}) {
  const session = await requireEntitledSession();
  const sp = await searchParams;
  const search = sp.q?.trim() || null;
  const belowOnly = sp.below === "1";

  let workplace, operable, rows;
  try {
    ({ workplace, operable } = await currentWorkplaceOperation(session.companyId));
    if (!workplace) {
      return (
        <div className="p-4 sm:p-6">
          <PageHeader title="在庫台帳" />
          <NoWorkplaceState />
        </div>
      );
    }
    rows = await listStock(session.companyId, {
      workplaceId: workplace.id,
      search,
      nonZeroOnly: !belowOnly,
    });
  } catch (e) {
    console.error("[stock]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="在庫台帳" />
        <DbErrorState />
      </div>
    );
  }

  const belowRows = rows.filter((r) => r.safetyStock != null && r.qty < r.safetyStock);
  const shown = belowOnly ? belowRows : rows;

  const exportQs = new URLSearchParams({ workplace: workplace.id });
  if (search) exportQs.set("q", search);
  const exportHref = `/api/stock/export?${exportQs.toString()}`;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="在庫台帳"
        description="現在の職場にある副資材の在庫を一覧します。職場はヘッダで切り替えられます。"
        action={
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            CSV出力
          </a>
        }
      />

      <ViewOnlySiteNotice companyId={session.companyId} />

      {/* 現在の職場 */}
      <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-sm font-semibold text-fuchsia-800">
        <Factory className="h-4 w-4" />
        {workplace.siteName}／{workplace.name}
      </div>
      <p className="mb-4 text-xs text-slate-400">
        入出庫は受払の履歴を残すため、各行の「入庫・出庫」から手続き（入荷（受入）→入庫（棚入れ）・出庫指示）へ進んで行ってください。実在庫合わせは「棚卸」で反映します（差異は受払履歴に記録されます）。
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/stock"
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${!belowOnly ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
        >
          在庫一覧
        </Link>
        <Link
          href="/stock?below=1"
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${belowOnly ? "border-red-500 bg-red-50 text-red-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
        >
          安全在庫割れ{belowRows.length > 0 && !belowOnly ? `（${belowRows.length}）` : ""}
        </Link>
        <form className="flex flex-1 items-center gap-2">
          <div className="relative min-w-[8rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={search ?? ""}
              placeholder="品名・メーカー品番で検索"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          {belowOnly && <input type="hidden" name="below" value="1" />}
          <button className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">検索</button>
        </form>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Boxes className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            {belowOnly
              ? "安全在庫を下回る副資材はありません。"
              : search
                ? "該当する在庫がありません。"
                : "この職場の在庫はまだありません。入庫で登録してください。"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">品名</th>
                <th className="px-4 py-2.5">メーカー品番</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">規格</th>
                <th className="px-4 py-2.5">ロケ</th>
                <th className="px-4 py-2.5 text-right">在庫数</th>
                <th className="px-4 py-2.5 text-right">安全在庫</th>
                <th className="px-4 py-2.5 text-right">入出庫</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => {
                const below = r.safetyStock != null && r.qty < r.safetyStock;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${r.productId}`} className="font-medium text-slate-800 hover:text-fuchsia-600">
                        {r.productName}
                      </Link>
                      {below && (
                        <span className="ml-2 align-middle">
                          <BelowSafetyBadge />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{r.makerCode ?? r.drawingNo ?? "—"}</td>
                    <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">{r.spec ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.locationCode}</td>
                    <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${below ? "text-red-600" : "text-slate-800"}`}>
                      {r.qty.toLocaleString()} <span className="text-xs font-normal text-slate-400">{r.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{r.safetyStock ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {operable && <StockRowActions />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { MapPin, Plus, Search, Tag, Trash2, Factory } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listLocations, listUsedAreas } from "@/lib/db";
import { resolveCurrentWorkplace } from "@/lib/workplace";
import { deleteLocationAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import ConfirmForm from "@/components/ConfirmForm";
import DbErrorState from "@/components/DbErrorState";
import NoWorkplaceState from "@/components/NoWorkplaceState";
import MasterTabs from "@/components/MasterTabs";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; q?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const area = sp.area?.trim() || null;
  const search = sp.q?.trim() || null;

  const workplace = await resolveCurrentWorkplace(session.companyId);
  if (!workplace) {
    return (
      <div className="p-4 sm:p-6">
        <MasterTabs />
        <PageHeader title="ロケーション設定" />
        <NoWorkplaceState />
      </div>
    );
  }

  let locations, areas;
  try {
    [locations, areas] = await Promise.all([
      listLocations(session.companyId, { area, search, workplaceId: workplace.id }),
      listUsedAreas(session.companyId),
    ]);
  } catch (e) {
    console.error("[locations]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="ロケーション" />
        <DbErrorState />
      </div>
    );
  }

  const wpLabel = `${workplace.siteName}／${workplace.name}`;

  return (
    <div className="p-4 sm:p-6">
      <MasterTabs />
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-sm font-semibold text-fuchsia-800">
        <Factory className="h-4 w-4" />
        {wpLabel} のロケーション
      </div>
      <PageHeader
        title="ロケーション設定"
        description="エリア-棚-段-間口（例 A-01-3-2）で棚位置を採番。設定・変更時にロケラベルを発行して棚に貼ります。"
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/locations/map"
              className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-300 bg-white px-3 py-2 text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-50"
            >
              <MapPin className="h-4 w-4" />
              エリアマップ
            </Link>
            <Link
              href="/locations/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
            >
              <Plus className="h-4 w-4" />
              採番・作成
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={search ?? ""}
              placeholder="ロケ番号・呼称で検索"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          {area && <input type="hidden" name="area" value={area} />}
          <button className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">検索</button>
        </form>
      </div>

      {areas.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link
            href={`/locations${search ? `?q=${encodeURIComponent(search)}` : ""}`}
            className={`rounded-full px-3 py-1 text-sm ${!area ? "bg-fuchsia-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            すべて
          </Link>
          {areas.map((a) => (
            <Link
              key={a}
              href={`/locations?area=${encodeURIComponent(a)}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
              className={`rounded-full px-3 py-1 text-sm font-mono ${area === a ? "bg-fuchsia-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {a}
            </Link>
          ))}
        </div>
      )}

      {locations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            {search || area ? "該当するロケーションがありません。" : "ロケーションがまだ登録されていません。"}
          </p>
          {!search && !area && (
            <Link href="/locations/new" className="mt-3 inline-block text-sm font-medium text-fuchsia-600 hover:underline">
              最初のロケーションを作成する
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">ロケ番号</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">呼称</th>
                <th className="px-4 py-2.5 text-right">在庫品目</th>
                <th className="px-4 py-2.5 text-right">在庫合計</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locations.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/locations/${encodeURIComponent(l.code)}`} className="font-mono font-medium text-slate-800 hover:text-fuchsia-600">
                      {l.code}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">{l.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{l.productCount}</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-800">{l.totalQty.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/locations/${encodeURIComponent(l.code)}/label`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-fuchsia-600"
                      >
                        <Tag className="h-3.5 w-3.5" />
                        ラベル
                      </Link>
                      <ConfirmForm
                        action={deleteLocationAction.bind(null, l.id)}
                        message={`ロケーション「${l.code}」を削除します。${l.totalQty !== 0 ? "在庫が残っています。" : ""}よろしいですか？`}
                      >
                        <button className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" title="削除">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </ConfirmForm>
                    </div>
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

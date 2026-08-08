import { Factory, Building2, Link2 } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listSites, listWorkplaces } from "@/lib/db";
import type { WorkplaceWithSite } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const { companyId } = await requireAdminPage();

  let sites, workplaces;
  try {
    [sites, workplaces] = await Promise.all([listSites(companyId), listWorkplaces(companyId)]);
  } catch (e) {
    console.error("[sites]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="工場・職場" />
        <DbErrorState />
      </div>
    );
  }

  const wpBySite = new Map<string, WorkplaceWithSite[]>();
  for (const w of workplaces) {
    const arr = wpBySite.get(w.siteId) ?? [];
    arr.push(w);
    wpBySite.set(w.siteId, arr);
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <MasterTabs />
      <PageHeader
        title="工場・職場"
        description="副資材の在庫は工場＞職場ごとに独立して管理します。工場・職場の構成はポータルの部署設定と連動しています。"
      />

      {/* ポータル連動の案内。追加・変更はポータルで行う */}
      <div className="mb-5 flex items-start gap-2 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm text-fuchsia-900">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-relaxed">
          工場・職場は<strong>ポータルの部署設定が正</strong>です。追加・名称変更・削除は
          <strong>ポータルの管理画面</strong>で行ってください。ここでの一覧は連動された内容の確認用です
          （職場を追加すると既定の置き場が自動で用意されます）。
        </p>
      </div>

      {sites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Factory className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            工場がまだ連動されていません。ポータルで工場（部署種別「工場」）と職場を設定してください。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sites.map((s) => {
            const wps = wpBySite.get(s.id) ?? [];
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Factory className="h-5 w-5 text-fuchsia-600" />
                  <span className="flex-1 text-sm font-semibold text-slate-800">{s.name}</span>
                </div>

                {/* 職場一覧（読み取り専用） */}
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {wps.length === 0 ? (
                    <li className="py-3 text-center text-xs text-slate-400">職場がまだありません。</li>
                  ) : (
                    wps.map((w) => (
                      <li key={w.id} className="flex items-center gap-2 py-2">
                        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="flex-1 text-xs text-slate-700">{w.name}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

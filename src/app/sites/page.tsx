import { Factory, Plus, Trash2, Save, Building2 } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listSites, listWorkplaces } from "@/lib/db";
import {
  createSiteAction,
  updateSiteAction,
  deleteSiteAction,
  createWorkplaceAction,
  updateWorkplaceAction,
  deleteWorkplaceAction,
} from "@/lib/actions";
import type { WorkplaceWithSite } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";

export const dynamic = "force-dynamic";

const input =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

export default async function SitesPage() {
  const { companyId } = await requireEntitledSession();

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
        description="副資材の在庫は工場＞職場ごとに独立して管理します。工場を作り、その中に職場を登録してください。職場ごとに既定の置き場が自動で用意されます。"
      />

      {/* 工場を追加 */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <Plus className="h-4 w-4" />
          工場を追加
        </h2>
        <form action={createSiteAction} className="flex gap-2">
          <input name="name" required placeholder="工場名（例 本社工場）" className={`${input} flex-1`} />
          <SubmitButton pendingText="追加中…">追加</SubmitButton>
        </form>
      </div>

      {sites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Factory className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">工場がまだ登録されていません。まず工場を追加してください。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sites.map((s) => {
            const wps = wpBySite.get(s.id) ?? [];
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Factory className="h-5 w-5 text-fuchsia-600" />
                  <form action={updateSiteAction.bind(null, s.id)} className="flex flex-1 items-center gap-2">
                    <input name="name" defaultValue={s.name} required className={`${input} flex-1 font-semibold`} />
                    <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                      <Save className="h-3.5 w-3.5" />
                      保存
                    </button>
                  </form>
                  <ConfirmForm
                    action={deleteSiteAction.bind(null, s.id)}
                    message={`工場「${s.name}」を削除します。配下の職場・置き場・在庫もすべて削除されます。よろしいですか？`}
                  >
                    <button className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600" title="削除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </ConfirmForm>
                </div>

                {/* 職場一覧 */}
                <ul className="mb-3 divide-y divide-slate-100 border-t border-slate-100">
                  {wps.length === 0 ? (
                    <li className="py-3 text-center text-xs text-slate-400">職場がまだありません。</li>
                  ) : (
                    wps.map((w) => (
                      <li key={w.id} className="flex items-center gap-2 py-2">
                        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                        <form action={updateWorkplaceAction.bind(null, w.id)} className="flex flex-1 items-center gap-2">
                          <input name="name" defaultValue={w.name} required className={`${input} flex-1 py-1.5 text-xs`} />
                          <button className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                            保存
                          </button>
                        </form>
                        <ConfirmForm
                          action={deleteWorkplaceAction.bind(null, w.id)}
                          message={`職場「${w.name}」を削除します。この職場の置き場・在庫も削除されます。よろしいですか？`}
                        >
                          <button className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" title="削除">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </ConfirmForm>
                      </li>
                    ))
                  )}
                </ul>

                {/* 職場を追加 */}
                <form action={createWorkplaceAction} className="flex gap-2">
                  <input type="hidden" name="siteId" value={s.id} />
                  <input name="name" required placeholder="職場名（例 組立ライン1）" className={`${input} flex-1 py-1.5 text-xs`} />
                  <SubmitButton pendingText="追加中…">職場を追加</SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { Contact, Trash2, Save, Plus } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listPartners } from "@/lib/db";
import { createPartnerAction, updatePartnerAction, deletePartnerAction } from "@/lib/actions";
import { PARTNER_KIND_LABEL, type PartnerKind } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import DbErrorState from "@/components/DbErrorState";
import MasterTabs from "@/components/MasterTabs";

export const dynamic = "force-dynamic";

const input =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

const KINDS: PartnerKind[] = ["supplier", "customer", "internal"];

const KIND_STYLE: Record<PartnerKind, string> = {
  supplier: "bg-sky-50 text-sky-700 ring-sky-600/20",
  customer: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20",
  internal: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

export default async function PartnersPage() {
  const { companyId } = await requireEntitledSession();

  let partners;
  try {
    partners = await listPartners(companyId);
  } catch (e) {
    console.error("[partners]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="取引先設定" />
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <MasterTabs />
      <PageHeader
        title="取引先設定"
        description="向け先（仕入先／出荷先／移動先）を選んでリストに登録します。管理番号は向け先ごとに付けられます。"
      />

      {/* 追加 */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <Plus className="h-4 w-4" />
          取引先を追加
        </h2>
        <form action={createPartnerAction} className="grid gap-2 sm:grid-cols-[130px_120px_1fr_1fr_auto]">
          <select name="kind" defaultValue="supplier" className={input}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {PARTNER_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input name="code" placeholder="管理番号" className={`${input} font-mono`} />
          <input name="name" required placeholder="名称" className={input} />
          <input name="contact" placeholder="担当・連絡先（任意）" className={input} />
          <SubmitButton pendingText="追加中…">追加</SubmitButton>
        </form>
      </div>

      {/* 一覧 */}
      {partners.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Contact className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">取引先がまだ登録されていません。</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-2">
          <ul className="divide-y divide-slate-100">
            {partners.map((p) => (
              <li key={p.id} className="p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[p.kind]}`}>
                    {PARTNER_KIND_LABEL[p.kind]}
                  </span>
                  {p.code && <span className="font-mono text-xs text-slate-400">{p.code}</span>}
                  <span className="ml-1 truncate text-sm font-medium text-slate-800">{p.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updatePartnerAction.bind(null, p.id)} className="flex flex-1 flex-wrap items-center gap-2">
                    <select name="kind" defaultValue={p.kind} className={`${input} py-1.5 text-xs`}>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {PARTNER_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <input name="code" defaultValue={p.code ?? ""} placeholder="管理番号" className={`${input} w-28 py-1.5 font-mono text-xs`} />
                    <input name="name" defaultValue={p.name} required className={`${input} min-w-[8rem] flex-1 py-1.5 text-xs`} />
                    <input name="contact" defaultValue={p.contact ?? ""} placeholder="担当・連絡先" className={`${input} min-w-[8rem] flex-1 py-1.5 text-xs`} />
                    <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                      <Save className="h-3.5 w-3.5" />
                      保存
                    </button>
                  </form>
                  <ConfirmForm action={deletePartnerAction.bind(null, p.id)} message={`「${p.name}」を削除します。よろしいですか？`}>
                    <button className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600" title="削除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </ConfirmForm>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

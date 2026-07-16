import Link from "next/link";
import { ArrowLeft, Factory } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { resolveCurrentWorkplace } from "@/lib/workplace";
import { createStocktakeAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import NoWorkplaceState from "@/components/NoWorkplaceState";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

export default async function NewStocktakePage() {
  const { companyId } = await requireEntitledSession();
  const workplace = await resolveCurrentWorkplace(companyId);

  if (!workplace) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <PageHeader title="棚卸を開始" />
        <NoWorkplaceState />
      </div>
    );
  }
  const label = `${workplace.siteName}／${workplace.name}`;

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <Link href="/stocktakes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        棚卸一覧に戻る
      </Link>
      <PageHeader title="棚卸を開始" description="現在の職場の在庫を帳簿数として明細に取り込みます。" />

      <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-sm font-semibold text-fuchsia-800">
        <Factory className="h-4 w-4" />
        {label}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <form action={createStocktakeAction} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              棚卸の名称 <span className="text-red-500">*</span>
            </label>
            <input name="title" required placeholder={`2026年7月度 ${workplace.name} 棚卸`} className={input} />
          </div>
          <p className="text-xs text-slate-400">
            <b>{label}</b> にある現在庫（0 でない品目）を帳簿数として取り込みます。別の職場を棚卸するときは、ヘッダの職場セレクタで切り替えてから開始してください。
          </p>
          <div>
            <SubmitButton pendingText="作成中…">棚卸を作成して開始</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

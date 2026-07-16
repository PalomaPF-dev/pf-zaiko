import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listPartners } from "@/lib/db";
import { createIssueOrderAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

export default async function NewIssueOrderPage() {
  const { companyId } = await requireEntitledSession();
  const customers = await listPartners(companyId, { kind: "customer", activeOnly: true });

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <Link href="/issue-orders" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        出庫一覧に戻る
      </Link>
      <PageHeader title="出庫を作成" description="得意先などは任意です。作成後に出庫する部材（商品・数量）を追加します。" />

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <form action={createIssueOrderAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">出庫No / 伝票No</label>
              <input name="orderNo" placeholder="空欄で自動採番（SY0000001…）" className={`${input} font-mono`} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">出荷グループ</label>
              <input name="shipGroup" placeholder="電気部品組立（手挿入）" className={input} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">得意先（出荷先）</label>
              <input name="customer" list="customer-list" placeholder="出荷先を選択 / 入力" className={input} />
              <datalist id="customer-list">
                {customers.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">納入先</label>
              <input name="deliverTo" placeholder="納入先" className={input} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">出荷予定日</label>
              <input name="shipDate" type="date" className={input} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">荷揃え日</label>
              <input name="pickDate" type="date" className={input} />
            </div>
          </div>
          <div>
            <SubmitButton pendingText="作成中…">作成して部材を追加</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

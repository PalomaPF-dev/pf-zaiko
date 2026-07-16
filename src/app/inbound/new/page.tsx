import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { createReceiptAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

export default async function NewReceiptPage() {
  await requireEntitledSession();

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <Link href="/inbound" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        入荷一覧に戻る
      </Link>
      <PageHeader
        title="入荷を登録"
        description="受入担当者が納入場所を指定します。作成後に、商品マスタから検索して入荷した商品を次々に登録します。"
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <form action={createReceiptAction} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">納入場所</label>
            <input name="deliverTo" placeholder="例）第1倉庫 受入 / 34211" className={input} autoFocus />
            <p className="mt-1 text-xs text-slate-400">現品票にも印字されます（任意）。</p>
          </div>
          <div>
            <SubmitButton pendingText="作成中…">作成して商品を登録</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

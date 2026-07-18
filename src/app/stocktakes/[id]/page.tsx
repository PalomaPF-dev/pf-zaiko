import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, Download, Save, CheckCircle2, Undo2, XCircle } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getStocktake, listStocktakeLines } from "@/lib/db";
import {
  saveStocktakeCountsAction,
  reviewStocktakeAction,
  backToCountingAction,
  applyStocktakeAction,
  cancelStocktakeAction,
} from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import { StocktakeStatusBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import OperatorSelect from "@/components/OperatorSelect";

export const dynamic = "force-dynamic";

export default async function StocktakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requireEntitledSession();
  const { id } = await params;

  let take, lines;
  try {
    take = await getStocktake(companyId, id);
    if (!take) notFound();
    lines = await listStocktakeLines(companyId, id);
  } catch (e) {
    console.error("[stocktake detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="棚卸" />
        <DbErrorState />
      </div>
    );
  }

  const editable = take.status === "counting" || take.status === "review";
  const countedCount = lines.filter((l) => l.countedQty != null).length;
  const diffLines = lines.filter((l) => l.diff != null && l.diff !== 0);
  const saveCounts = saveStocktakeCountsAction.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link href="/stocktakes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        棚卸一覧に戻る
      </Link>
      <PageHeader
        title={take.title}
        description={`${take.scopeArea ?? "—"} ・ ${take.createdBy} ・ ${formatDateTime(take.createdAt)}`}
        action={<StocktakeStatusBadge status={take.status} />}
      />

      {/* 進捗＋操作 */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-xs text-slate-400">進捗</span>
            <div className="font-bold tabular-nums text-slate-700">
              {countedCount}/{lines.length}
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-400">差異</span>
            <div className={`font-bold tabular-nums ${diffLines.length > 0 ? "text-amber-600" : "text-slate-400"}`}>{diffLines.length}</div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href={`/stocktakes/${id}/print`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            記入リスト
          </Link>
          <a
            href={`/api/stocktakes/${id}/export`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
          {take.status === "counting" && (
            <form action={reviewStocktakeAction.bind(null, id)}>
              <SubmitButton pendingText="…">差異確認へ</SubmitButton>
            </form>
          )}
          {take.status === "review" && (
            <>
              <form action={backToCountingAction.bind(null, id)}>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  <Undo2 className="h-4 w-4" />
                  入力に戻る
                </button>
              </form>
              <ConfirmForm
                action={applyStocktakeAction.bind(null, id)}
                message={`差異 ${diffLines.length} 件を在庫に反映します。実棚数で在庫を上書きします。よろしいですか？`}
              >
                <button className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700">
                  <CheckCircle2 className="h-4 w-4" />
                  在庫に反映
                </button>
              </ConfirmForm>
            </>
          )}
          {editable && (
            <ConfirmForm action={cancelStocktakeAction.bind(null, id)} message="この棚卸を中止します。よろしいですか？">
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                <XCircle className="h-4 w-4" />
                中止
              </button>
            </ConfirmForm>
          )}
        </div>
      </div>

      {take.status === "applied" && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-700">
          <CheckCircle2 className="h-4 w-4" />
          {formatDateTime(take.appliedAt)} に在庫へ反映済みです。
        </div>
      )}

      {/* 明細 */}
      <form action={saveCounts}>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">ロケ</th>
                <th className="px-4 py-2.5">図番 / 品名</th>
                <th className="px-4 py-2.5 text-right">帳簿</th>
                <th className="px-4 py-2.5 text-right">実棚</th>
                <th className="px-4 py-2.5 text-right">差異</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{l.locationCode}</td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs text-slate-500">{l.drawingNo}</div>
                    <div className="text-slate-700">{l.productName}</div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{l.bookQty.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    {editable ? (
                      <input
                        name={`count_${l.id}`}
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={l.countedQty ?? ""}
                        placeholder="—"
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                      />
                    ) : (
                      <span className="tabular-nums text-slate-700">{l.countedQty ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {l.diff == null ? (
                      <span className="text-slate-300">—</span>
                    ) : l.diff === 0 ? (
                      <span className="tabular-nums text-slate-400">0</span>
                    ) : (
                      <span className={`font-bold tabular-nums ${l.diff > 0 ? "text-fuchsia-600" : "text-red-600"}`}>
                        {l.diff > 0 ? "+" : ""}
                        {l.diff}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    対象在庫がありません（棚卸作成時に在庫のあるロケがなかった可能性があります）。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {editable && lines.length > 0 && (
          <div className="mt-4">
            {/* 作業者（名簿があれば選択。未登録ならアカウント名で記録） */}
            <div className="mb-3 max-w-xs">
              <OperatorSelect />
            </div>
            <SubmitButton className="inline-flex items-center gap-1.5" pendingText="保存中…">
              <Save className="h-4 w-4" />
              実棚数を保存
            </SubmitButton>
            <p className="mt-2 text-xs text-slate-400">空欄の行は未カウントのまま保存されません。</p>
          </div>
        )}
      </form>
    </div>
  );
}

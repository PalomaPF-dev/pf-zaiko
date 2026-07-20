import Link from "next/link";
import { ArrowLeft, MapPin, LayoutGrid } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listAreas } from "@/lib/db";
import { createLocationAction, bulkCreateLocationsAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

export default async function NewLocationPage() {
  const { companyId } = await requireAdminPage();
  const areas = await listAreas(companyId);
  const areaOptions = areas.map((a) => a.code);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Link href="/locations" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        ロケーション一覧に戻る
      </Link>
      <PageHeader title="ロケーションを採番・作成" description="エリア-棚-段-間口 の4階層で棚位置を登録します。" />

      {/* 1件ずつ作成 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <MapPin className="h-4 w-4" />
          1件ずつ作成
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          間口を空欄にすると、同じ段の次番号を自動採番します。例: A-01-3-2
        </p>
        <form action={createLocationAction} className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">エリア</label>
            <input name="area" required maxLength={2} placeholder="A" list="area-list" className={`${input} font-mono uppercase`} />
            <datalist id="area-list">
              {areaOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">棚</label>
            <input name="rack" required type="number" min={1} max={99} placeholder="1" className={`${input} tabular-nums`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">段</label>
            <input name="level" required type="number" min={1} max={99} placeholder="3" className={`${input} tabular-nums`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">間口（空欄=自動）</label>
            <input name="bay" type="number" min={1} max={99} placeholder="自動" className={`${input} tabular-nums`} />
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-500">呼称（任意）</label>
            <input name="name" placeholder="第1倉庫 通路側" className={input} />
          </div>
          <div className="flex items-end">
            <SubmitButton className="w-full" pendingText="作成中…">
              作成
            </SubmitButton>
          </div>
        </form>
      </div>

      {/* まとめて生成 */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <LayoutGrid className="h-4 w-4" />
          範囲でまとめて生成
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          棚・段・間口の範囲を指定して一括作成します（例: 棚1〜10 × 段1〜4 × 間口1〜2）。既存は自動スキップ。
        </p>
        <form action={bulkCreateLocationsAction} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">エリア</label>
            <input name="area" required maxLength={2} placeholder="A" list="area-list" className={`${input} max-w-[120px] font-mono uppercase`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <RangeField label="棚" from="rackFrom" to="rackTo" />
            <RangeField label="段" from="levelFrom" to="levelTo" />
            <RangeField label="間口" from="bayFrom" to="bayTo" />
          </div>
          <div>
            <SubmitButton pendingText="生成中…">まとめて生成</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function RangeField({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <div className="flex items-center gap-1">
        <input name={from} type="number" min={1} max={99} defaultValue={1} className={`${input} tabular-nums`} />
        <span className="text-slate-400">〜</span>
        <input name={to} type="number" min={1} max={99} defaultValue={1} className={`${input} tabular-nums`} />
      </div>
    </div>
  );
}

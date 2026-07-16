"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DEFAULT_UNIT, type Product } from "@/lib/types";
import type { ActionResult } from "@/lib/actions";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

/**
 * 商品（マスタ）の登録/編集フォーム（Server Action を受け取る）。
 * 図番・商品CD・在庫管理キーの重複などの失敗は、全画面エラーにせず
 * フォーム上に日本語でインライン表示し、入力値をそのまま保持する。
 */
export default function ProductForm({
  action,
  product,
  submitLabel,
  categorySuggestions = [],
  supplierSuggestions = [],
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  product?: Product;
  submitLabel: string;
  categorySuggestions?: string[];
  supplierSuggestions?: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await action(fd);
      if (!res.ok) {
        setError(res.message);
        setBusy(false);
        return;
      }
      // 成功したら商品詳細へ（クライアント遷移。フォームはリセットしない）
      if (res.id) {
        router.push(`/products/${res.id}`);
        router.refresh();
      } else {
        router.push("/products");
        router.refresh();
      }
    } catch {
      setError("保存に失敗しました。時間をおいて再度お試しください。");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* 主要項目：図番・品名・単位・ロットサイズ */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">
          品名 <span className="text-red-500">*</span>
        </label>
        <input name="name" required defaultValue={product?.name ?? ""} placeholder="ニトリル手袋 Mサイズ" className={input} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            メーカー品番 <span className="text-red-500">*</span>
          </label>
          <input
            name="makerCode"
            defaultValue={product?.makerCode ?? ""}
            placeholder="例 A-100-3 / 4901234567890"
            className={`${input} font-mono`}
          />
          <p className="mt-1 text-xs text-slate-400">副資材の主キー（QR・検索）。会社内で一意。</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">単位</label>
          <input name="unit" defaultValue={product?.unit ?? DEFAULT_UNIT} placeholder="個" list="unit-options" className={input} />
          <datalist id="unit-options">
            {["個", "本", "枚", "台", "セット", "箱", "kg", "m", "缶", "袋"].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">ロットサイズ（荷姿）</label>
          <input
            name="lotSize"
            type="number"
            min={1}
            defaultValue={product?.lotSize ?? ""}
            placeholder="100"
            className={`${input} tabular-nums`}
          />
          <p className="mt-1 text-xs text-slate-400">1荷姿あたりの数量。空欄可。</p>
        </div>
      </div>

      {/* 在庫管理キー・安全在庫 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">在庫管理キー</label>
          <input
            value={product?.stockKey ?? "登録時に自動採番されます"}
            readOnly
            className={`${input} cursor-not-allowed bg-slate-100 font-mono text-slate-500`}
          />
          <p className="mt-1 text-xs text-slate-400">QR・3点照合の追跡キー。<b>登録時に自動採番</b>（ZK＋連番・変更不可）。</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">安全在庫（下限）</label>
          <input
            name="safetyStock"
            type="number"
            min={0}
            defaultValue={product?.safetyStock ?? ""}
            placeholder="50"
            className={`${input} tabular-nums`}
          />
          <p className="mt-1 text-xs text-slate-400">下回るとアラート対象。空欄なら対象外。</p>
        </div>
      </div>

      {/* 任意項目 */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-500">任意項目</p>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">図番</label>
              <input name="drawingNo" defaultValue={product?.drawingNo ?? ""} placeholder="ZU-A102-03" className={`${input} font-mono`} />
              <p className="mt-1 text-xs text-slate-400">直材のみ。空欄可。</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">商品CD</label>
              <input name="productCode" defaultValue={product?.productCode ?? ""} placeholder="12345678" className={`${input} font-mono`} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">規格・型式</label>
              <input name="spec" defaultValue={product?.spec ?? ""} placeholder="A5052 t5" className={input} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">分類</label>
              <input name="category" defaultValue={product?.category ?? ""} placeholder="消耗品" list="category-options" className={input} />
              <datalist id="category-options">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">メーカー</label>
              <input name="maker" defaultValue={product?.maker ?? ""} placeholder="山田製作所" className={input} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">購入先（既定の仕入先）</label>
            <input
              name="supplier"
              defaultValue={product?.supplier ?? ""}
              placeholder="購入先名（入荷現品票に印字）"
              list="supplier-suggest"
              className={input}
            />
            <datalist id="supplier-suggest">
              {supplierSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">備考</label>
            <textarea name="notes" defaultValue={product?.notes ?? ""} rows={2} placeholder="発注ロット・保管上の注意など" className={input} />
          </div>
        </div>
      </div>

      {product && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="hidden" name="active" value="false" />
          <input
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={product.active}
            className="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
          />
          この商品を有効にする（外すと一覧の既定表示から除外）
        </label>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-60"
        >
          {busy ? "保存中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

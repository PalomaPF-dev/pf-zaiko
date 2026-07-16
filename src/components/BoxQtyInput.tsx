"use client";

import { useState } from "react";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 tabular-nums";

/**
 * 箱単位の数量入力：箱数 × 入り数 = 合計 を自動計算。
 * 入り数は商品マスタのロットサイズ（perBoxDefault）を既定にし編集可。合計は直接入力も可。
 * フォーム送信フィールド：perBox / boxCount / <qtyName>（既定 "qty"）。
 */
export default function BoxQtyInput({
  perBoxDefault,
  unit = "個",
  qtyName = "qty",
}: {
  perBoxDefault?: number | null;
  unit?: string;
  qtyName?: string;
}) {
  const [perBox, setPerBox] = useState(perBoxDefault && perBoxDefault > 0 ? String(perBoxDefault) : "");
  const [boxCount, setBoxCount] = useState("");
  const [qty, setQty] = useState("");
  const [manual, setManual] = useState(false);

  const pb = parseInt(perBox, 10);
  const bc = parseInt(boxCount, 10);
  const computed = pb > 0 && bc > 0 ? pb * bc : null;
  const effectiveQty = manual ? qty : computed != null ? String(computed) : qty;

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1.2fr] items-end gap-1.5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">入り数</span>
          <input
            name="perBox"
            type="number"
            min={1}
            inputMode="numeric"
            value={perBox}
            onChange={(e) => setPerBox(e.target.value)}
            placeholder="50"
            className={input}
          />
        </label>
        <span className="pb-2 text-slate-400">×</span>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">箱数</span>
          <input
            name="boxCount"
            type="number"
            min={1}
            inputMode="numeric"
            value={boxCount}
            onChange={(e) => setBoxCount(e.target.value)}
            placeholder="3"
            className={input}
          />
        </label>
        <span className="pb-2 text-slate-400">=</span>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            合計 <span className="text-slate-400">（{unit}）</span>
          </span>
          <input
            name={qtyName}
            type="number"
            min={1}
            required
            inputMode="numeric"
            value={effectiveQty}
            onChange={(e) => {
              setManual(true);
              setQty(e.target.value);
            }}
            placeholder="150"
            className={`${input} font-bold`}
          />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        箱単位は「入り数 × 箱数」で合計を自動計算します。バラは合計を直接入力してください。
      </p>
    </div>
  );
}

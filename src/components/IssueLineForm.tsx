"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import BoxQtyInput from "@/components/BoxQtyInput";

export interface IssueLineProduct {
  id: string;
  drawingNo: string;
  name: string;
  unit: string;
  lotSize: number | null;
}
export interface IssueLineLocation {
  id: string;
  code: string;
}

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

/** 出庫の明細追加フォーム。商品選択で入り数（ロットサイズ）を既定にし、箱数×入り数=合計で出荷予定数を指定。 */
export default function IssueLineForm({
  products,
  locations,
  action,
}: {
  products: IssueLineProduct[];
  locations: IssueLineLocation[];
  action: (fd: FormData) => Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [pending, setPending] = useState(false);
  const selected = products.find((p) => p.id === productId) ?? null;

  async function onSubmit(fd: FormData) {
    if (!productId) return;
    setPending(true);
    try {
      await action(fd);
      setProductId("");
      setFormKey((k) => k + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-2 sm:grid-cols-[2fr_1.3fr_1fr]">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} required className={input}>
          <option value="">商品を選択</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.drawingNo} {p.name}
            </option>
          ))}
        </select>
        <select key={`loc-${formKey}`} name="locationId" className={input}>
          <option value="">ロケ自動引当</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code}
            </option>
          ))}
        </select>
        <input key={`lot-${formKey}`} name="lotNo" placeholder="ロットNo" className={input} />
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <BoxQtyInput
          key={`${productId}-${formKey}`}
          perBoxDefault={selected?.lotSize ?? null}
          unit={selected?.unit ?? "個"}
          qtyName="qtyPlanned"
        />
        <button
          type="submit"
          disabled={!productId || pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {pending ? "追加中…" : "追加"}
        </button>
      </div>
      <p className="text-xs text-slate-400">
        ロケを「自動引当」にすると、その商品の在庫が最も多い（棚入れ済み）ロケを引き当てます。未入庫分は引当対象外です。
      </p>
    </form>
  );
}

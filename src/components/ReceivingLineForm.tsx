"use client";

import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import BoxQtyInput from "@/components/BoxQtyInput";

export interface ReceivingProduct {
  id: string;
  drawingNo: string;
  productCode: string | null;
  name: string;
  unit: string;
  supplier: string | null;
  lotSize: number | null;
}

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

/**
 * ①入荷（受入）の明細追加フォーム。
 * 商品マスタを検索して選択（ラベルは未発行なのでスキャンは使わない）→ 仕入先を自動表示・入り数はロットサイズ既定
 * → 箱数×入り数=合計 → 追加。追加のたびにリセットして次々に登録できる。
 */
export default function ReceivingLineForm({
  products,
  action,
}: {
  products: ReceivingProduct[];
  action: (fd: FormData) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [pending, setPending] = useState(false);

  const selected = products.find((p) => p.id === productId) ?? null;

  const q = query.trim().toLowerCase();
  const matches =
    q === ""
      ? []
      : products
          .filter(
            (p) =>
              p.drawingNo.toLowerCase().includes(q) ||
              (p.productCode ?? "").toLowerCase().includes(q) ||
              p.name.toLowerCase().includes(q)
          )
          .slice(0, 8);

  function pick(p: ReceivingProduct) {
    setProductId(p.id);
    setQuery("");
    setOpen(false);
  }
  function clearProduct() {
    setProductId("");
    setQuery("");
  }

  async function onSubmit(fd: FormData) {
    if (!productId) return;
    setPending(true);
    try {
      await action(fd);
      // リセットして次の入力へ
      setProductId("");
      setQuery("");
      setFormKey((k) => k + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />

      {/* 商品検索 / 選択 */}
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-fuchsia-200 bg-fuchsia-50/50 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-800">
              <span className="font-mono text-xs text-slate-500">{selected.drawingNo}</span> {selected.name}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              仕入先：{selected.supplier ?? "（マスタ未設定）"}
              {selected.lotSize ? ` ・ 入り数 ${selected.lotSize}/箱` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={clearProduct}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600"
            title="選び直す"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-fuchsia-500 focus-within:ring-1 focus-within:ring-fuchsia-500">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="商品を検索（図番・商品CD・品名）"
              className="w-full text-sm focus:outline-none"
            />
          </div>
          {open && matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-fuchsia-50"
                  >
                    <span className="text-sm text-slate-800">
                      <span className="font-mono text-xs text-slate-500">{p.drawingNo}</span> {p.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {p.supplier ?? "仕入先未設定"}
                      {p.productCode ? ` ・ CD ${p.productCode}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && q !== "" && matches.length === 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-lg">
              該当する商品がありません
            </div>
          )}
        </div>
      )}

      {/* 数量（箱数×入り数=合計） */}
      <BoxQtyInput key={`${productId}-${formKey}`} perBoxDefault={selected?.lotSize ?? null} unit={selected?.unit ?? "個"} />

      {/* 納品No */}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">納品No（任意）</span>
          <input key={formKey} name="refNo" placeholder="F1234567" className={input} />
        </label>
        <button
          type="submit"
          disabled={!productId || pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {pending ? "追加中…" : "明細に追加"}
        </button>
      </div>
    </form>
  );
}

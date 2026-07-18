"use client";

import { useActionState, useState } from "react";
import { ScanLine, PackageCheck, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { productLabelCode } from "@/lib/types";
import InventoryQrScanner from "@/components/InventoryQrScanner";
import OperatorSelect from "@/components/OperatorSelect";

export interface PutawayProduct {
  productId: string;
  drawingNo: string;
  productCode: string | null;
  stockKey: string | null;
  productName: string;
  unit: string;
  pendingQty: number;
  supplier: string | null;
  deliverTo: string | null;
}
export interface PutawayLocation {
  id: string;
  code: string;
}

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

/**
 * ②入庫（棚入れ）。①で貼った商品ラベル（QR=在庫管理キー）をスキャン（または一覧から選択）し、
 * ロケーションを付与して棚入れする。商品ごとに完結・部分入庫や複数ロケ分割にも対応。
 */
export default function PutawayForm({
  products,
  locations,
  action,
}: {
  products: PutawayProduct[];
  locations: PutawayLocation[];
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [scanTarget, setScanTarget] = useState<"product" | "location" | null>(null);
  const [scanMsg, setScanMsg] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(async (_prev, fd) => {
    const r = await action(fd);
    if (r.ok) {
      setProductId("");
      setLocationId("");
    }
    return r;
  }, null);

  const selected = products.find((p) => p.productId === productId) ?? null;

  const banner = state ? (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        state.ok ? "bg-fuchsia-50 text-fuchsia-700" : "bg-red-50 text-red-700"
      }`}
    >
      {state.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {state.message}
    </div>
  ) : null;

  function handleScan(r: { kind: "product" | "location"; code: string }) {
    const code = r.code.toUpperCase();
    if (scanTarget === "product") {
      const p = products.find((x) =>
        [x.stockKey, x.productCode, x.drawingNo].filter(Boolean).some((c) => (c as string).toUpperCase() === code)
      );
      if (p) {
        setProductId(p.productId);
        setScanMsg("");
      } else setScanMsg(`「${r.code}」に該当する未入庫の商品が見つかりません`);
    } else if (scanTarget === "location") {
      const l = locations.find((x) => x.code.toUpperCase() === code);
      if (l) {
        setLocationId(l.id);
        setScanMsg("");
      } else setScanMsg(`ロケ「${r.code}」が見つかりません`);
    }
    setScanTarget(null);
  }

  // 商品未選択：スキャン or 未入庫一覧から選ぶ
  if (!selected) {
    return (
      <div className="flex flex-col gap-4">
        {banner}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <ScanLine className="h-4 w-4" />
            商品ラベルをスキャン
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            ①入荷で現品に貼った商品ラベル（QR=在庫管理キー）を読み取ると、その商品の未入庫分を棚入れできます。
          </p>
          <button
            type="button"
            onClick={() => setScanTarget(scanTarget === "product" ? null : "product")}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
              scanTarget === "product"
                ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ScanLine className="h-4 w-4" />
            {scanTarget === "product" ? "スキャンを閉じる" : "スキャンを開始"}
          </button>
          {scanTarget === "product" && (
            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <InventoryQrScanner onResult={handleScan} />
            </div>
          )}
          {scanMsg && <p className="mt-2 text-xs text-red-600">{scanMsg}</p>}
        </div>

        <div>
          <div className="mb-2 text-sm font-bold text-slate-700">未入庫の商品（棚入れ待ち）</div>
          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
              棚入れ待ちの商品はありません。
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {products.map((p) => (
                <li key={p.productId}>
                  <button
                    type="button"
                    onClick={() => setProductId(p.productId)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-fuchsia-300 hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">
                        <span className="font-mono text-xs text-slate-500">{p.drawingNo}</span> {p.productName}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {p.deliverTo ? `納入場所 ${p.deliverTo}` : p.supplier ?? ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">未入庫</div>
                      <div className="font-bold tabular-nums text-amber-600">
                        {p.pendingQty.toLocaleString()}
                        <span className="ml-0.5 text-xs font-normal text-slate-400">{p.unit}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // 商品選択済み：ロケ付与＋数量で棚入れ
  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="locationId" value={locationId} />

      <button
        type="button"
        onClick={() => {
          setProductId("");
          setLocationId("");
          setScanTarget(null);
        }}
        className="inline-flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        商品を選び直す
      </button>

      <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/50 p-3">
        <div className="text-sm font-semibold text-slate-800">
          <span className="font-mono text-xs text-slate-500">{selected.drawingNo}</span> {selected.productName}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          未入庫 <b className="text-amber-600">{selected.pendingQty.toLocaleString()}</b> {selected.unit}
          {selected.deliverTo ? ` ・ 納入場所 ${selected.deliverTo}` : ""}
        </div>
      </div>

      {/* ロケーション */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">棚入れ先ロケーション</label>
        <div className="flex gap-2">
          <select
            name="locationSelect"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className={input}
          >
            <option value="">選択してください</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setScanTarget(scanTarget === "location" ? null : "location")}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-medium ${
              scanTarget === "location"
                ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700"
                : "border-slate-300 text-slate-500 hover:bg-slate-50"
            }`}
          >
            <ScanLine className="h-4 w-4" />
            スキャン
          </button>
        </div>
      </div>

      {scanTarget === "location" && (
        <div className="rounded-xl border border-slate-200 p-3">
          <InventoryQrScanner onResult={handleScan} />
        </div>
      )}
      {scanMsg && <p className="text-xs text-red-600">{scanMsg}</p>}

      {/* 数量（既定＝未入庫全量） */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">
          入庫数量 <span className="text-xs text-slate-400">（未入庫 {selected.pendingQty.toLocaleString()} まで）</span>
        </label>
        <input
          key={productId}
          name="qty"
          type="number"
          min={1}
          max={selected.pendingQty}
          required
          defaultValue={selected.pendingQty}
          className={`${input} tabular-nums`}
        />
        <p className="mt-1 text-xs text-slate-400">一部だけ棚入れする場合は数量を減らせます（残りは別ロケにも棚入れ可）。</p>
      </div>

      {/* 作業者（名簿があれば選択。未登録ならアカウント名で記録） */}
      <OperatorSelect />

      <button
        type="submit"
        disabled={pending || !locationId}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-60"
      >
        <PackageCheck className="h-4 w-4" />
        {pending ? "入庫中…" : "このロケに入庫する"}
      </button>

      {banner}
    </form>
  );
}

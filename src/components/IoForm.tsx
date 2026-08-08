"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ScanLine, ArrowLeftRight, CheckCircle2, XCircle, Printer } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import type { TxType } from "@/lib/types";
import InventoryQrScanner from "@/components/InventoryQrScanner";
import OperatorSelect from "@/components/OperatorSelect";

export interface IoProduct {
  id: string;
  drawingNo: string;
  name: string;
  unit: string;
}
export interface IoLocation {
  id: string;
  code: string;
}
export interface IoStockCell {
  locationId: string;
  code: string;
  qty: number;
}

/** フォームの用途。入荷=入庫、出荷=出庫、stock-ops=ロケ間移動＋在庫調整。 */
export type IoVariant = "inbound" | "outbound" | "stock-ops";

type ScanTarget = "product" | "fromLocation" | "toLocation" | null;

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

export default function IoForm({
  variant,
  products,
  locations,
  suppliers = [],
  internals = [],
  stockByProduct = {},
  defaultProductId,
  defaultLocationId,
  recordAction,
  moveAction,
}: {
  variant: IoVariant;
  products: IoProduct[];
  locations: IoLocation[];
  suppliers?: string[];
  internals?: string[];
  stockByProduct?: Record<string, IoStockCell[]>;
  defaultProductId?: string;
  defaultLocationId?: string;
  recordAction: (fd: FormData) => Promise<ActionResult>;
  moveAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const [tab, setTab] = useState<"move" | "adjust">("move");

  if (variant === "inbound") {
    return (
      <IoPanel
        lockedTxType="receipt"
        products={products}
        locations={locations}
        suppliers={suppliers}
        defaultProductId={defaultProductId}
        defaultLocationId={defaultLocationId}
        action={recordAction}
      />
    );
  }

  if (variant === "outbound") {
    return (
      <IoPanel
        lockedTxType="issue"
        products={products}
        locations={locations}
        suppliers={suppliers}
        defaultProductId={defaultProductId}
        defaultLocationId={defaultLocationId}
        action={recordAction}
      />
    );
  }

  // stock-ops: ロケ間移動 / 在庫調整
  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab("move")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${tab === "move" ? "bg-white text-fuchsia-700 shadow-sm" : "text-slate-500"}`}
        >
          ロケ間移動
        </button>
        <button
          type="button"
          onClick={() => setTab("adjust")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${tab === "adjust" ? "bg-white text-fuchsia-700 shadow-sm" : "text-slate-500"}`}
        >
          在庫調整
        </button>
      </div>
      {tab === "move" ? (
        <MovePanel
          products={products}
          locations={locations}
          internals={internals}
          stockByProduct={stockByProduct}
          defaultProductId={defaultProductId}
          action={moveAction}
        />
      ) : (
        <IoPanel
          lockedTxType="adjust"
          products={products}
          locations={locations}
          suppliers={suppliers}
          defaultProductId={defaultProductId}
          defaultLocationId={defaultLocationId}
          action={recordAction}
        />
      )}
    </div>
  );
}

function ResultBanner({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        result.ok ? "bg-fuchsia-50 text-fuchsia-700" : "bg-red-50 text-red-700"
      }`}
    >
      {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {result.message}
      {result.receiptTxId && (
        <Link
          href={`/labels/receipt/${result.receiptTxId}`}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-fuchsia-700 ring-1 ring-fuchsia-200 hover:bg-fuchsia-50"
        >
          <Printer className="h-3.5 w-3.5" />
          現品票を印刷
        </Link>
      )}
    </div>
  );
}

function ScanButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-medium ${
        active ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"
      }`}
    >
      <ScanLine className="h-4 w-4" />
      スキャン
    </button>
  );
}

const SUBMIT_LABEL: Record<TxType, string> = {
  receipt: "入荷を記録する",
  putaway: "入庫を記録する",
  issue: "出庫を記録する",
  adjust: "調整を記録する",
  stocktake: "記録する",
  move_in: "記録する",
  move_out: "記録する",
};

function IoPanel({
  lockedTxType,
  products,
  locations,
  suppliers,
  defaultProductId,
  defaultLocationId,
  action,
}: {
  lockedTxType: TxType;
  products: IoProduct[];
  locations: IoLocation[];
  suppliers: string[];
  defaultProductId?: string;
  defaultLocationId?: string;
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const [productId, setProductId] = useState(defaultProductId ?? "");
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [scanTarget, setScanTarget] = useState<ScanTarget>(null);
  const [scanMsg, setScanMsg] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, fd) => action(fd),
    null
  );

  const txType = lockedTxType;
  const product = products.find((p) => p.id === productId);

  function handleScan(r: { kind: "product" | "location"; code: string }) {
    if (scanTarget === "product") {
      const p = products.find((x) => x.drawingNo.toUpperCase() === r.code.toUpperCase());
      if (p) {
        setProductId(p.id);
        setScanMsg("");
      } else setScanMsg(`図番「${r.code}」の品目が見つかりません`);
    } else if (scanTarget === "fromLocation") {
      const l = locations.find((x) => x.code.toUpperCase() === r.code.toUpperCase());
      if (l) {
        setLocationId(l.id);
        setScanMsg("");
      } else setScanMsg(`ロケ「${r.code}」が見つかりません`);
    }
    setScanTarget(null);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <input type="hidden" name="txType" value={txType} />

      {/* 品目 */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">品目（図番）</label>
        <div className="flex gap-2">
          <select name="productId" required value={productId} onChange={(e) => setProductId(e.target.value)} className={input}>
            <option value="">選択してください</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.drawingNo} {p.name}
              </option>
            ))}
          </select>
          <ScanButton onClick={() => setScanTarget(scanTarget === "product" ? null : "product")} active={scanTarget === "product"} />
        </div>
      </div>

      {/* ロケーション */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">ロケーション</label>
        <div className="flex gap-2">
          <select name="locationId" required value={locationId} onChange={(e) => setLocationId(e.target.value)} className={input}>
            <option value="">選択してください</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
          <ScanButton
            onClick={() => setScanTarget(scanTarget === "fromLocation" ? null : "fromLocation")}
            active={scanTarget === "fromLocation"}
          />
        </div>
      </div>

      {scanTarget && (
        <div className="rounded-xl border border-slate-200 p-3">
          <InventoryQrScanner onResult={handleScan} />
        </div>
      )}
      {scanMsg && <p className="text-xs text-red-600">{scanMsg}</p>}

      {/* 数量・伝票 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            数量{txType === "adjust" ? "（±で補正）" : ""} {product && <span className="text-xs text-slate-400">（{product.unit}）</span>}
          </label>
          <input name="qty" type="number" required step={1} placeholder={txType === "adjust" ? "-5" : "10"} className={`${input} tabular-nums`} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            {txType === "receipt" ? "納品No（任意）" : "伝票No / ロットNo（任意）"}
          </label>
          <input name="refNo" placeholder={txType === "receipt" ? "F1234567" : "LOT-2607-01"} className={input} />
        </div>
      </div>
      {txType === "receipt" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">仕入先（任意・現品票に印字）</label>
            <input name="partnerName" list="supplier-list" placeholder="仕入先を選択 / 入力" className={input} />
            <datalist id="supplier-list">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">納入場所（任意・現品票に印字）</label>
            <input name="deliverTo" placeholder="34211" className={input} />
          </div>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">備考（任意）</label>
        <input name="note" placeholder="メモ" className={input} />
      </div>

      {/* 作業者（名簿があれば選択。未登録ならアカウント名で記録） */}
      <OperatorSelect />

      <div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-60"
        >
          {pending ? "記録中…" : SUBMIT_LABEL[txType]}
        </button>
      </div>
      {txType === "receipt" && (
        <p className="text-xs text-slate-400">入荷を記録すると、その入荷ロットの現品票（数量・納品No・仕入先・納入場所入り）を印刷できます。</p>
      )}
      {txType === "adjust" && (
        <p className="text-xs text-slate-400">実在庫に合わせて増減補正します（例: −5 で 5 減、10 で 10 増）。棚卸での一括補正は「棚卸」をご利用ください。</p>
      )}
      <ResultBanner result={state} />
    </form>
  );
}

function MovePanel({
  products,
  locations,
  internals,
  stockByProduct,
  defaultProductId,
  action,
}: {
  products: IoProduct[];
  locations: IoLocation[];
  internals: string[];
  stockByProduct: Record<string, IoStockCell[]>;
  defaultProductId?: string;
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const [productId, setProductId] = useState(defaultProductId ?? "");
  // 移動元ロケ：品目を選ぶと在庫のあるロケ（在庫最多を既定）を自動選択
  const stockCells = productId ? stockByProduct[productId] ?? [] : [];
  const [fromLocationId, setFromLocationId] = useState(stockCells[0]?.locationId ?? "");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, fd) => action(fd),
    null
  );
  const product = products.find((p) => p.id === productId);

  function handleProduct(pid: string) {
    setProductId(pid);
    // その品目の在庫最多ロケを移動元に自動セット
    setFromLocationId((stockByProduct[pid] ?? [])[0]?.locationId ?? "");
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">品目（図番）</label>
        <select name="productId" required value={productId} onChange={(e) => handleProduct(e.target.value)} className={input}>
          <option value="">選択してください</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.drawingNo} {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">移動元ロケ（在庫のあるロケ）</label>
          <select
            name="fromLocationId"
            required
            value={fromLocationId}
            onChange={(e) => setFromLocationId(e.target.value)}
            className={input}
            disabled={!productId}
          >
            {!productId ? (
              <option value="">先に品目を選択</option>
            ) : stockCells.length === 0 ? (
              <option value="">在庫のあるロケがありません</option>
            ) : (
              stockCells.map((c) => (
                <option key={c.locationId} value={c.locationId}>
                  {c.code}（在庫 {c.qty}）
                </option>
              ))
            )}
          </select>
          {product && stockCells.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">品目を選ぶと在庫最多のロケを自動で選びます（変更可）。</p>
          )}
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-600">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            移動先ロケ
          </label>
          <select name="toLocationId" required className={input}>
            <option value="">選択してください</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            数量 {product && <span className="text-xs text-slate-400">（{product.unit}）</span>}
          </label>
          <input name="qty" type="number" required min={1} step={1} placeholder="10" className={`${input} tabular-nums`} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">移動先（社内・任意）</label>
          <input name="partnerName" list="internal-list" placeholder="移動先を選択 / 入力" className={input} />
          <datalist id="internal-list">
            {internals.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">伝票No / ロットNo（任意）</label>
        <input name="refNo" placeholder="移動伝票 M-001" className={input} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">備考（任意）</label>
        <input name="note" placeholder="メモ" className={input} />
      </div>

      {/* 作業者（名簿があれば選択。未登録ならアカウント名で記録） */}
      <OperatorSelect />

      <div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-60"
        >
          {pending ? "記録中…" : "移動を記録する"}
        </button>
      </div>
      <p className="text-xs text-slate-400">移動を記録すると、移動先ラベル（現品票）を印刷できます。</p>
      <ResultBanner result={state} />
    </form>
  );
}

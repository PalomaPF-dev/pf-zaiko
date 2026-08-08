"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Search } from "lucide-react";
import { DEFAULT_UNIT, type ItemMasterLookup, type Product } from "@/lib/types";
import { formatItemCode, itemUnitForProduct } from "@/lib/itemCode";
import type { ActionResult } from "@/lib/actions";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

/** 資材W/F 品目カタログから引き継げる品目マスタの初期値。値が無い項目は undefined（既定値を潰さない）。 */
interface ProductDefaults {
  name?: string;
  drawingNo?: string;
  supplier?: string;
  unit?: string;
  lotSize?: string;
}

/** 品目カタログ → 品目マスタの初期値（ロットサイズは整数のときだけ引き継ぐ）。 */
function itemDefaults(item: ItemMasterLookup | null): ProductDefaults {
  if (!item) return {};
  return {
    name: item.name,
    drawingNo: item.code,
    supplier: item.supplierName ?? undefined,
    // 単位は W/F の単位コード表が判明している場合のみ（不明なコードは既定の「個」のままにする）
    unit: itemUnitForProduct(item.unitCode) ?? undefined,
    lotSize: item.lotQty != null && Number.isInteger(item.lotQty) ? String(item.lotQty) : undefined,
  };
}

/** 呼び出した品目の内容を、フォームの各入力欄へ流し込む（入力済みでも上書きする）。 */
function fillForm(form: HTMLFormElement, item: ItemMasterLookup) {
  for (const [name, value] of Object.entries(itemDefaults(item))) {
    const el = form.elements.namedItem(name);
    if (value && el instanceof HTMLInputElement) el.value = value;
  }
}

/**
 * 品目（マスタ）の登録/編集フォーム（Server Action を受け取る）。
 * 図番・品目CD・在庫管理キーの重複などの失敗は、全画面エラーにせず
 * フォーム上に日本語でインライン表示し、入力値をそのまま保持する。
 *
 * 新規登録では冒頭に「品目コードから呼び出す」欄を出し、資材W/F 由来の品目カタログから
 * 品名・図番（＝品目コード）・購入先・ロットサイズを引き当てて初期値にできる。
 */
export default function ProductForm({
  action,
  product,
  submitLabel,
  categorySuggestions = [],
  supplierSuggestions = [],
  itemLookup = false,
  initialItem = null,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  product?: Product;
  submitLabel: string;
  categorySuggestions?: string[];
  supplierSuggestions?: string[];
  /** 品目コードでの呼び出し欄を表示するか（新規登録のみ） */
  itemLookup?: boolean;
  /** /products/new?item=... で呼び出し済みの品目（初期値に反映する） */
  initialItem?: ItemMasterLookup | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState<ItemMasterLookup | null>(initialItem);
  const [itemError, setItemError] = useState("");
  const [looking, setLooking] = useState(false);
  const defaults = itemDefaults(initialItem);

  /** 品目コードで資材W/F 品目カタログを引き、見つかればフォームへ流し込む。 */
  async function onLookup() {
    const form = formRef.current;
    const codeInput = form?.elements.namedItem("itemCode");
    const code = codeInput instanceof HTMLInputElement ? codeInput.value.trim() : "";
    if (!code || looking) return;
    setItemError("");
    setLooking(true);
    try {
      const res = await fetch(`/api/items/lookup?code=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!json.ok) {
        setItem(null);
        setItemError(json.message ?? "呼び出しに失敗しました");
        return;
      }
      setItem(json.item as ItemMasterLookup);
      if (form) fillForm(form, json.item as ItemMasterLookup);
    } catch {
      setItem(null);
      setItemError("呼び出しに失敗しました。通信状況をご確認ください。");
    } finally {
      setLooking(false);
    }
  }

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
      // 成功したら品目詳細へ（クライアント遷移。フォームはリセットしない）
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
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* 品目コードから呼び出す（資材W/F 品目カタログ） */}
      {itemLookup && (
        <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/50 p-4">
          <label className="mb-1 block text-sm font-semibold text-slate-700">品目コードから呼び出す</label>
          <p className="mb-2 text-xs text-slate-500">
            資材W/F に登録済みの品目なら、品目コード（例 06-26105-00）で品名・購入先・ロットサイズを引き当てます。
          </p>
          <div className="flex items-center gap-2">
            <input
              name="itemCode"
              defaultValue={initialItem?.code ?? ""}
              placeholder="06-26105-00"
              inputMode="numeric"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Enter でフォーム全体が送信されないようにする（呼び出しだけ実行）
                  e.preventDefault();
                  void onLookup();
                }
              }}
              className={`${input} bg-white font-mono`}
            />
            <button
              type="button"
              onClick={onLookup}
              disabled={looking}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {looking ? "呼び出し中…" : "呼び出す"}
            </button>
          </div>
          {itemError && <p className="mt-2 text-sm text-red-600">{itemError}</p>}
          {item && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
              <p className="mb-1 text-sm font-semibold text-slate-800">
                {item.name}
                {!item.active && <span className="ml-2 text-xs font-normal text-amber-600">（W/F上は廃止品目）</span>}
              </p>
              <dl className="flex flex-wrap gap-x-4 gap-y-1">
                <Fact label="品目コード" value={formatItemCode(item.code)} />
                <Fact label="仕入先" value={item.supplierName} />
                <Fact label="入数" value={item.packQty != null ? `${item.packQty} ${item.packUnitLabel}` : null} />
                <Fact label="ロット数" value={item.lotQty} />
                <Fact label="まるめ" value={item.roundQty} />
                <Fact label="容器" value={item.container} />
                <Fact label="単位コード" value={item.unitLabel} />
                <Fact label="納入単価" value={item.unitPrice != null ? `${item.unitPrice.toLocaleString()}円` : null} />
              </dl>
              {item.altSuppliers && <p className="mt-1 text-slate-400">併用仕入先: {item.altSuppliers}</p>}
              {item.productId && (
                <p className="mt-2 text-amber-700">
                  この品目は既に品目マスタに登録されています。重複登録にご注意ください。
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 主要項目：図番・品名・単位・ロットサイズ */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">
          品名 <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          required
          defaultValue={product?.name ?? defaults.name ?? ""}
          placeholder="ニトリル手袋 Mサイズ"
          className={input}
        />
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
          <p className="mt-1 text-xs text-slate-400">
            副資材の主キー（QR・検索）。会社内で一意。図番・品目コードを入れる場合は空欄可。
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">単位</label>
          <input
            name="unit"
            defaultValue={product?.unit ?? defaults.unit ?? DEFAULT_UNIT}
            placeholder="個"
            list="unit-options"
            className={input}
          />
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
            defaultValue={product?.lotSize ?? defaults.lotSize ?? ""}
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
              <label className="mb-1 block text-sm font-medium text-slate-600">図番（資材W/F 品目コード）</label>
              <input
                name="drawingNo"
                defaultValue={product?.drawingNo ?? defaults.drawingNo ?? ""}
                placeholder="ZU-A102-03"
                className={`${input} font-mono`}
              />
              <p className="mt-1 text-xs text-slate-400">
                資材W/F の品目コードはここに入ります。スキャン・手入力の呼び出しキーになります。
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">品目CD</label>
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
              defaultValue={product?.supplier ?? defaults.supplier ?? ""}
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
          この品目を有効にする（外すと一覧の既定表示から除外）
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

/** 呼び出した品目の1項目（値が無い項目は出さない）。 */
function Fact({ label, value }: { label: string; value: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}

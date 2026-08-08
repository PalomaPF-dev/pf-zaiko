"use client";

import { useActionState, useState } from "react";
import { ScanLine, CheckCircle2, XCircle, Truck, ShieldCheck, X } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { resolveScan } from "@/lib/qr";
import InventoryQrScanner from "@/components/InventoryQrScanner";

/**
 * 3点照合出庫（誤出荷防止）。
 * 3つのQRを読み取って照合する：
 *  ① 指示リストのQR（＝在庫管理キー。印刷した出庫指示リスト）
 *  ② 品目ラベルのQR（＝在庫管理キー。現物のラベル）
 *  ③ ロケーションラベルのQR（＝ロケ番号。指定の棚）
 * ①②が明細の在庫管理キーと一致し、③が引当ロケと一致したときだけ出荷（出庫確定）できる。
 */
export default function PickVerify({
  orderId,
  lineId,
  expectedLocationCode,
  productCodes,
  productName,
  qtyInstructed,
  unit,
  done,
  action,
}: {
  orderId: string;
  lineId: string;
  expectedLocationCode: string | null;
  productCodes: string[]; // 在庫管理キー/品目CD/図番 のいずれか一致でOK（主は在庫管理キー）
  productName: string;
  qtyInstructed: number;
  unit: string;
  done: boolean;
  action: (orderId: string, lineId: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [instrOk, setInstrOk] = useState(false);
  const [locOk, setLocOk] = useState(false);
  const [prodOk, setProdOk] = useState(false);
  const [scanOn, setScanOn] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [instrInput, setInstrInput] = useState("");
  const [locInput, setLocInput] = useState("");
  const [prodInput, setProdInput] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async () => action(orderId, lineId),
    null
  );

  const expLoc = (expectedLocationCode ?? "").toUpperCase();
  const codes = productCodes.filter(Boolean).map((c) => c.toUpperCase());

  // 指示リストQR（在庫管理キー）
  function checkInstr(raw: string): boolean {
    const code = raw.trim().toUpperCase();
    if (!code) return false;
    if (codes.includes(code)) {
      setInstrOk(true);
      setMsg({ kind: "ok", text: `指示リスト照合OK（在庫管理キー）` });
      return true;
    }
    setMsg({ kind: "err", text: `⚠ 誤出荷防止：指示リストの在庫管理キーが一致しません（読取 ${code}）` });
    return false;
  }

  function checkLocation(raw: string): boolean {
    const code = raw.trim().toUpperCase();
    if (!code) return false;
    if (!expLoc) {
      setMsg({ kind: "err", text: "この明細はロケ未引当です。先にロケを引き当ててください" });
      return false;
    }
    if (code === expLoc) {
      setLocOk(true);
      setMsg({ kind: "ok", text: `ロケ照合OK：${expectedLocationCode}` });
      return true;
    }
    setMsg({ kind: "err", text: `⚠ 誤出荷防止：ロケが一致しません（指示 ${expectedLocationCode} / 読取 ${code}）` });
    return false;
  }

  // 品目ラベルQR（現物・在庫管理キー）
  function checkProduct(raw: string): boolean {
    const code = raw.trim().toUpperCase();
    if (!code) return false;
    if (codes.includes(code)) {
      setProdOk(true);
      setMsg({ kind: "ok", text: `品目ラベル照合OK：${productName}` });
      return true;
    }
    setMsg({ kind: "err", text: `⚠ 誤出荷防止：品目が一致しません（読取 ${code}）` });
    return false;
  }

  // 単一スキャナ：ロケ→（在庫管理キーは 指示→品目 の順で自動充填）
  function route(raw: string) {
    const t = raw.trim();
    if (!t) return;
    const r = resolveScan(t);
    if (r.kind === "location") {
      checkLocation(r.code);
      return;
    }
    // 在庫管理キー：まだの指示、次に品目へ順に充填
    if (!instrOk) checkInstr(t);
    else checkProduct(t);
  }

  const allOk = instrOk && locOk && prodOk;

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-fuchsia-600">
        <CheckCircle2 className="h-4 w-4" />
        出庫済
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-700"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        照合出庫
      </button>
    );
  }

  return (
    <div className="w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-bold text-slate-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          3点照合出庫
        </span>
        <button onClick={() => setOpen(false)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
        ロケ <b className="font-mono">{expectedLocationCode ?? "未引当"}</b> ／ {productName} を {qtyInstructed}
        {unit}
        <div className="mt-0.5 text-slate-400">① 指示リスト ② 品目ラベル（現物） ③ ロケ（棚）の3QRを読み取り</div>
      </div>

      {/* 照合状態（指示・品目・ロケ） */}
      <div className="mb-2 flex gap-1.5">
        <StatusPill label="① 指示" ok={instrOk} />
        <StatusPill label="② 品目" ok={prodOk} />
        <StatusPill label="③ ロケ" ok={locOk} />
      </div>

      {/* スキャン */}
      {scanOn ? (
        <div className="mb-2">
          <InventoryQrScanner onResult={(r) => route(r.code)} />
          <button onClick={() => setScanOn(false)} className="mt-1 text-[11px] text-slate-500 hover:underline">
            スキャンを閉じる
          </button>
        </div>
      ) : (
        <button
          onClick={() => setScanOn(true)}
          className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <ScanLine className="h-4 w-4" />
          カメラで3点をスキャン
        </button>
      )}

      {/* 手入力（QRが読めない時） */}
      <ManualRow value={instrInput} onChange={setInstrInput} onCheck={() => checkInstr(instrInput)} placeholder="① 指示リスト（在庫管理キー）" />
      <ManualRow value={prodInput} onChange={setProdInput} onCheck={() => checkProduct(prodInput)} placeholder="② 品目ラベル（在庫管理キー）" />
      <ManualRow value={locInput} onChange={setLocInput} onCheck={() => checkLocation(locInput)} placeholder="③ ロケ番号" />

      {msg && (
        <div className={`mb-2 mt-1 flex items-start gap-1 rounded-lg px-2 py-1 text-[11px] ${msg.kind === "ok" ? "bg-fuchsia-50 text-fuchsia-700" : "bg-red-50 text-red-700"}`}>
          {msg.kind === "ok" ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />}
          {msg.text}
        </div>
      )}

      <form action={formAction}>
        <button
          type="submit"
          disabled={!allOk || pending}
          className="flex w-full items-center justify-center gap-1 rounded-lg bg-fuchsia-600 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Truck className="h-3.5 w-3.5" />
          {pending ? "出庫中…" : allOk ? "出荷可能・出庫を確定" : "指示・品目・ロケを照合してください"}
        </button>
      </form>
      {state && !state.ok && <p className="mt-1 text-[11px] text-red-600">{state.message}</p>}
    </div>
  );
}

function ManualRow({
  value,
  onChange,
  onCheck,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onCheck: () => void;
  placeholder: string;
}) {
  return (
    <div className="mb-1 flex gap-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs focus:border-fuchsia-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={onCheck}
        className="shrink-0 rounded-lg bg-slate-700 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
      >
        照合
      </button>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold ${
        ok ? "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200" : "bg-slate-100 text-slate-400"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

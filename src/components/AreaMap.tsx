"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  Upload,
  Trash2,
  Check,
  X,
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Pencil,
  ImageOff,
} from "lucide-react";
import { compressImageFile } from "@/lib/imageCompress";
import { setWorkplaceMapImageAction, setAreaPinAction, deleteAreaPinAction } from "@/lib/actions";
import type { AreaPin } from "@/lib/types";

interface AreaInfo {
  area: string;
  locationCount: number;
}

const STEP = 0.5; // 微調整（画像に対する %）
const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v * 10) / 10));

/** 職場の見取り図（エリアマップ）。表示＋（管理者は）画像アップロード・エリアピンの配置。 */
export default function AreaMap({
  workplaceId,
  workplaceLabel,
  mapUrl,
  areas,
  pins,
  canEdit,
}: {
  workplaceId: string;
  workplaceLabel: string;
  mapUrl: string | null;
  areas: AreaInfo[];
  pins: AreaPin[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [edit, setEdit] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ area: string; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const pinByArea = new Map(pins.map((p) => [p.area, p]));

  async function onUpload(file: File) {
    setErr("");
    setUploading(true);
    try {
      const compressed = await compressImageFile(file, 2400, 0.85);
      const { upload } = await import("@vercel/blob/client");
      const res = await upload(`workplace-map/${workplaceId}/${Date.now()}.jpg`, compressed, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
        multipart: compressed.size > 8 * 1024 * 1024,
      });
      await setWorkplaceMapImageAction(workplaceId, res.url);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  function onMapClick(e: React.MouseEvent) {
    if (!edit || !selectedArea) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDraft({
      area: selectedArea,
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    });
  }

  async function savePin() {
    if (!draft) return;
    setBusy(true);
    try {
      await setAreaPinAction(workplaceId, draft.area, draft.x, draft.y);
      setDraft(null);
      setSelectedArea(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removePin(area: string) {
    await deleteAreaPinAction(workplaceId, area);
    setSelectedArea(null);
    setDraft(null);
    router.refresh();
  }

  const nudgeBtn = "flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-sm font-semibold text-fuchsia-800">
          <MapPin className="h-4 w-4" />
          {workplaceLabel} のエリアマップ
        </div>
        {canEdit && mapUrl && (
          <button
            onClick={() => {
              setEdit((v) => !v);
              setSelectedArea(null);
              setDraft(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              edit ? "border-fuchsia-600 bg-fuchsia-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Pencil className="h-4 w-4" />
            {edit ? "編集を終了" : "ピンを編集"}
          </button>
        )}
      </div>

      {err && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      {!mapUrl ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
          <ImageOff className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="mb-1 text-sm font-medium text-slate-600">見取り図がまだ登録されていません</p>
          <p className="mb-4 text-xs text-slate-400">職場の見取り図（フロア図）をアップロードし、エリアの位置ピンを置けます。</p>
          {canEdit ? (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              見取り図をアップロード
            </button>
          ) : (
            <p className="text-xs text-slate-400">管理者が見取り図を登録すると表示されます。</p>
          )}
        </div>
      ) : (
        <>
          {/* マップ本体 */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div
              ref={wrapRef}
              onClick={onMapClick}
              className={`relative select-none ${edit && selectedArea ? "cursor-crosshair" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mapUrl} alt="エリアマップ" className="pointer-events-none block h-auto w-full" draggable={false} />

              {/* 確定済みピン */}
              {areas.map(({ area }) => {
                const p = pinByArea.get(area);
                if (!p || (draft && draft.area === area)) return null;
                const marker = (
                  <span className="flex flex-col items-center">
                    <span className="rounded-md bg-fuchsia-600 px-1.5 py-0.5 font-mono text-xs font-bold text-white shadow ring-2 ring-white">
                      {area}
                    </span>
                    <MapPin className="-mt-0.5 h-4 w-4 fill-fuchsia-600 text-white" />
                  </span>
                );
                return (
                  <div
                    key={area}
                    className="absolute -translate-x-1/2 -translate-y-full"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  >
                    {edit ? (
                      <button onClick={(e) => { e.stopPropagation(); setSelectedArea(area); setDraft({ area, x: p.x, y: p.y }); }}>
                        {marker}
                      </button>
                    ) : (
                      <Link href={`/locations?area=${encodeURIComponent(area)}`} title={`エリア ${area} のロケーションへ`}>
                        {marker}
                      </Link>
                    )}
                  </div>
                );
              })}

              {/* 配置中のドラフトピン */}
              {draft && (
                <div className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${draft.x}%`, top: `${draft.y}%` }}>
                  <span className="flex flex-col items-center">
                    <span className="animate-pulse rounded-md bg-rose-600 px-1.5 py-0.5 font-mono text-xs font-bold text-white shadow ring-2 ring-white">
                      {draft.area}
                    </span>
                    <MapPin className="-mt-0.5 h-5 w-5 fill-rose-600 text-white" />
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 編集パネル */}
          {edit && (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">
                {selectedArea ? `エリア「${selectedArea}」の位置を、地図をタップして指定` : "配置するエリアを選んでください"}
              </p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {areas.map(({ area, locationCount }) => {
                  const placed = pinByArea.has(area);
                  const active = selectedArea === area;
                  return (
                    <button
                      key={area}
                      onClick={() => {
                        setSelectedArea(area);
                        const ex = pinByArea.get(area);
                        setDraft(ex ? { area, x: ex.x, y: ex.y } : null);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        active
                          ? "border-fuchsia-600 bg-fuchsia-600 text-white"
                          : placed
                            ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                            : "border-slate-300 bg-white text-slate-500"
                      }`}
                    >
                      <span className="font-mono">{area}</span>
                      <span className="opacity-70">({locationCount})</span>
                      {placed && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
                {areas.length === 0 && <span className="text-xs text-slate-400">この職場にロケーションがありません。</span>}
              </div>

              {draft && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">微調整</span>
                  <div className="grid grid-cols-3 gap-1">
                    <span />
                    <button type="button" onClick={() => setDraft((d) => d && { ...d, y: clamp(d.y - STEP) })} className={nudgeBtn}><ArrowUp className="h-4 w-4" /></button>
                    <span />
                    <button type="button" onClick={() => setDraft((d) => d && { ...d, x: clamp(d.x - STEP) })} className={nudgeBtn}><ArrowLeft className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setDraft((d) => d && { ...d, y: clamp(d.y + STEP) })} className={nudgeBtn}><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setDraft((d) => d && { ...d, x: clamp(d.x + STEP) })} className={nudgeBtn}><ArrowRight className="h-4 w-4" /></button>
                  </div>
                  <button onClick={savePin} disabled={busy} className="inline-flex h-9 items-center gap-1 rounded-lg bg-fuchsia-600 px-3 text-sm font-bold text-white hover:bg-fuchsia-700 disabled:opacity-60">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    この位置で保存
                  </button>
                  <button onClick={() => { setDraft(null); setSelectedArea(null); }} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">
                    <X className="h-4 w-4" />キャンセル
                  </button>
                  {pinByArea.has(draft.area) && (
                    <button onClick={() => removePin(draft.area)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 px-3 text-sm text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />ピンを削除
                    </button>
                  )}
                </div>
              )}

              {/* 画像の差し替え・削除 */}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  見取り図を差し替え
                </button>
                <button onClick={async () => { if (confirm("見取り図を削除します。配置したピンも消えます。よろしいですか？")) { await setWorkplaceMapImageAction(workplaceId, null); router.refresh(); } }} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />見取り図を削除
                </button>
              </div>
            </div>
          )}

          {/* 表示モードの凡例 */}
          {!edit && (
            <p className="mt-2 text-xs text-slate-400">
              ピンをタップすると、そのエリアのロケーション一覧が開きます。
              {canEdit && "　配置を変えるには「ピンを編集」を押してください。"}
            </p>
          )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onUpload(f);
        }}
      />
    </div>
  );
}

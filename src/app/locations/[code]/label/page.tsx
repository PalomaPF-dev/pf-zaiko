import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getLocationByCode } from "@/lib/db";
import { parseLocCode } from "@/lib/location";
import { locationQrPayload } from "@/lib/qr";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export default async function LocationLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ w?: string; h?: string }>;
}) {
  const session = await requireEntitledSession();
  const { code } = await params;
  const { w, h } = await searchParams;
  const decoded = decodeURIComponent(code);

  let location;
  try {
    location = await getLocationByCode(session.companyId, decoded);
  } catch (e) {
    console.error("[location label]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }
  if (!location) notFound();

  const parts = parseLocCode(location.code);
  const pw = parseInt(w ?? "", 10);
  const ph = parseInt(h ?? "", 10);
  const labelW = clamp(Number.isFinite(pw) ? pw : 54, 28, 100);
  const labelH = clamp(Number.isFinite(ph) ? ph : 24, 12, 60);
  const qrMm = Math.max(8, labelH - 3);

  const head = await headers();
  const proto = head.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${head.get("host")}`;
  const qrDataUrl = await QRCode.toDataURL(locationQrPayload(origin, location.code), { width: 240, margin: 1 });

  const printCss = `
    @media print {
      @page { size: ${labelW}mm ${labelH}mm; margin: 0; }
      .label-print-root { padding: 0 !important; margin: 0 !important; max-width: none !important; }
      .label-frame { padding: 0 !important; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; background: transparent !important; }
      .llabel { box-shadow: none !important; }
    }
    .llabel {
      width: ${labelW}mm; height: ${labelH}mm; display: flex; align-items: stretch; gap: 1.5mm;
      padding: 1.2mm 1.6mm; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
    }
    .llabel .qr { width: ${qrMm}mm; height: ${qrMm}mm; flex: 0 0 auto; align-self: center; }
    .llabel .info { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; font-family: -apple-system, 'Hiragino Sans', sans-serif; }
    .llabel .toprow { display: flex; align-items: center; justify-content: flex-end; gap: 1mm; }
    .llabel .toprow .arealbl { font-size: 2.0mm; color: #333; }
    .llabel .toprow .area { font-size: 5.0mm; font-weight: 800; line-height: 1; }
    .llabel .code { font-size: 5.0mm; font-weight: 800; font-family: ui-monospace, monospace; letter-spacing: -0.03em; white-space: nowrap; margin-top: auto; text-align: right; }
  `;

  return (
    <div className="label-print-root mx-auto max-w-md p-4 sm:p-6">
      <style>{printCss}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/locations/${encodeURIComponent(location.code)}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          ロケーション照会に戻る
        </Link>
        <PrintButton />
      </div>

      <h1 className="no-print mb-1 text-xl font-bold text-slate-800">ロケーションラベル印刷</h1>
      <p className="no-print mb-4 text-sm text-slate-500">
        QR・ロケ番号を印刷します。QRを読むとこのロケの在庫照会が開きます。
      </p>

      <div className="label-frame inline-block rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="llabel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QRコード" className="qr" />
          <div className="info">
            <div className="toprow">
              <span className="arealbl">エリア</span>
              <span className="area">{location.area}</span>
            </div>
            <div className="code">{parts ? `${parts.rack}-${parts.level}-${parts.bay}` : location.code}</div>
          </div>
        </div>
      </div>

      <div className="no-print mt-5 space-y-3 text-xs text-slate-500">
        <div>
          実寸プレビュー：<strong className="text-slate-700">{labelW} × {labelH} mm</strong>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[
              { label: "12mm幅", w: 40, h: 12 },
              { label: "18mm幅", w: 48, h: 18 },
              { label: "24mm幅", w: 54, h: 24 },
              { label: "36mm幅", w: 70, h: 36 },
            ].map((p) => {
              const active = p.w === labelW && p.h === labelH;
              return (
                <Link
                  key={p.label}
                  href={`/locations/${encodeURIComponent(location.code)}/label?w=${p.w}&h=${p.h}`}
                  className={`rounded-md border px-2.5 py-1 ${
                    active ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 leading-relaxed">
          SATO のラベルプリンターで印刷する場合は、印刷ダイアログで SATO プリンターと用紙サイズを選び、
          <b>倍率100%（実寸）・余白なし</b>で印刷してください。
        </p>
      </div>
    </div>
  );
}

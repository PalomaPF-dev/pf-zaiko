"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraOff, RefreshCw } from "lucide-react";
import { resolveScan } from "@/lib/qr";

const REGION_ID = "qr-reader-region";

/**
 * QRカメラ（在庫用）。商品QR→商品詳細、ロケQR→ロケ照会 へ遷移する。
 * onResult を渡すと遷移せずコード（{kind, code}）をコールバック（入出庫フォームのスキャン充填用）。
 */
export default function InventoryQrScanner({
  onResult,
}: {
  onResult?: (r: { kind: "product" | "location"; code: string }) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [message, setMessage] = useState("");
  const [scanKey, setScanKey] = useState(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let active = true;
    let instance: { start: (...a: unknown[]) => Promise<void>; stop: () => Promise<void>; clear: () => void } | null = null;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!active) return;
        // @ts-expect-error html5-qrcode の型は緩いのでそのまま渡す
        const inst = new Html5Qrcode(REGION_ID) as {
          start: (...a: unknown[]) => Promise<void>;
          stop: () => Promise<void>;
          clear: () => void;
        };
        instance = inst;
        setStatus("scanning");
        await inst.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => handleDecoded(decodedText),
          () => {
            /* 読み取り途中のフレームは無視 */
          }
        );
      } catch (e) {
        console.error("[scan] camera error", e);
        if (active) {
          setStatus("error");
          setMessage("カメラを起動できませんでした。");
        }
      }
    })();

    async function stop() {
      try {
        await instance?.stop();
        instance?.clear();
      } catch {
        /* noop */
      }
    }

    function handleDecoded(text: string) {
      const r = resolveScan(text);
      stop().then(() => {
        if (onResultRef.current) {
          onResultRef.current(r);
        } else {
          const target =
            r.kind === "location"
              ? `/locations/${encodeURIComponent(r.code)}`
              : `/products/${encodeURIComponent(r.code)}`;
          router.push(target);
        }
      });
    }

    return () => {
      active = false;
      stop();
    };
  }, [router, scanKey]);

  return (
    <div>
      {/* カメラが起動できないときは黒枠を畳み、案内カードだけを表示する */}
      <div
        className={
          status === "error"
            ? "hidden"
            : "overflow-hidden rounded-2xl border border-slate-200 bg-black"
        }
      >
        <div id={REGION_ID} className="aspect-square w-full" />
      </div>

      {status === "idle" && (
        <p className="mt-3 text-center text-sm text-slate-500">カメラを起動しています…</p>
      )}
      {status === "scanning" && (
        <p className="mt-3 text-center text-sm text-slate-500">カメラにQRコードをかざしてください…</p>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <CameraOff className="mx-auto mb-2 h-6 w-6 text-amber-500" />
          <p className="text-center text-sm font-medium text-amber-800">{message}</p>
          <ol className="mx-auto mt-2 max-w-xs list-decimal space-y-1 pl-5 text-left text-xs text-amber-700">
            <li>カメラの使用を確認する表示が出たら「許可」を選ぶ</li>
            <li>表示が出ないときは、スマホの「設定」やブラウザのサイト設定で、このアプリのカメラを許可する</li>
            <li>下の「もう一度試す」を押す</li>
          </ol>
          <div className="mt-3 text-center">
            <button
              onClick={() => {
                setStatus("idle");
                setMessage("");
                setScanKey((k) => k + 1);
              }}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700"
            >
              <RefreshCw className="h-4 w-4" />
              もう一度試す
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-amber-700">
            カメラが使えないときは、下の「手入力で開く」から図番・ロケ番号で開けます。
          </p>
        </div>
      )}
    </div>
  );
}

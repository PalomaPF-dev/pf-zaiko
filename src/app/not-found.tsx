import Link from "next/link";
import { Warehouse } from "lucide-react";

/** 404（日本語）。英語の既定ページを出さず、ダッシュボードへの戻り導線を用意する。 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-600 text-white">
          <Warehouse className="h-7 w-7" />
        </div>
        <p className="text-sm font-bold text-fuchsia-600">404</p>
        <h1 className="mt-1 text-lg font-bold text-slate-800">ページが見つかりません</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          お探しのページは移動または削除されたか、アドレスが間違っている可能性があります。
        </p>
        <Link
          href="/"
          className="mt-5 inline-block w-full rounded-lg bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-700"
        >
          ダッシュボードへ戻る
        </Link>
        <p className="mt-3 text-xs text-slate-400">
          <Link href="/login" className="hover:underline">ログイン画面へ</Link>
        </p>
      </div>
    </div>
  );
}

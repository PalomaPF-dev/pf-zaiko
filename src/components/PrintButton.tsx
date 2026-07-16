"use client";

import { Printer } from "lucide-react";

/** window.print() を呼ぶボタン。ブラウザの印刷ダイアログから PDF 保存できる。 */
export default function PrintButton({ label = "印刷 / PDF保存" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}

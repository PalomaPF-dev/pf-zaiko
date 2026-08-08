"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Factory, MapPin, Contact, SlidersHorizontal } from "lucide-react";

const TABS = [
  // 資材W/F 品目カタログ（/items）は品目マスタの呼び出し元なので、タブは分けず /products 側に含める
  { href: "/products", label: "品目マスタ", icon: Package, also: ["/items"] },
  { href: "/sites", label: "工場・職場", icon: Factory },
  { href: "/locations", label: "ロケーション", icon: MapPin },
  { href: "/partners", label: "取引先", icon: Contact },
  { href: "/settings", label: "設定", icon: SlidersHorizontal },
];

/** マスタ設定のヘッダータブ（品目／工場職場／ロケーション／取引先／設定を横断切替）。 */
export default function MasterTabs() {
  const pathname = usePathname();
  const isUnder = (href: string) => pathname === href || pathname.startsWith(href + "/");
  return (
    // モバイルでは2行に折り返して全タブを見せる（横スクロールで「設定」が隠れるのを防ぐ）
    <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = isUnder(t.href) || (t.also ?? []).some(isUnder);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-t-lg border-b-2 px-2.5 py-2.5 text-[13px] font-semibold transition-colors sm:gap-1.5 sm:px-4 sm:text-sm ${
              active
                ? "border-fuchsia-600 text-fuchsia-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

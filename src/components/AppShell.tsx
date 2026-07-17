"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import WorkplaceSwitcher from "./WorkplaceSwitcher";
import {
  LayoutDashboard,
  ScanLine,
  ArrowDownToLine,
  PackageCheck,
  Truck,
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  ClipboardCheck,
  Menu,
  X,
  LogOut,
  Settings,
  BookOpen,
  LayoutGrid,
} from "lucide-react";

// 業務カテゴリごとにグループ化したナビ（現場作業 / 在庫管理 / マスタ管理）
const NAV_GROUPS: Array<{ title?: string; items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }> }> = [
  {
    items: [
      { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
      { href: "/scan", label: "スキャン", icon: ScanLine },
    ],
  },
  {
    title: "入荷業務",
    items: [
      { href: "/inbound", label: "入荷（受入）", icon: ArrowDownToLine },
      { href: "/putaway", label: "入庫（棚入れ）", icon: PackageCheck },
    ],
  },
  {
    title: "出荷業務",
    items: [{ href: "/issue-orders", label: "出庫", icon: Truck }],
  },
  {
    title: "在庫管理",
    items: [
      { href: "/stock", label: "在庫台帳", icon: Boxes },
      { href: "/records", label: "受払履歴", icon: ClipboardList },
      { href: "/move", label: "移動・調整", icon: ArrowLeftRight },
      { href: "/stocktakes", label: "棚卸", icon: ClipboardCheck },
    ],
  },
  {
    title: "マスタ管理",
    items: [{ href: "/settings", label: "マスタ設定", icon: Settings }],
  },
  {
    items: [{ href: "/guide", label: "使い方", icon: BookOpen }],
  },
];

const BARE_ROUTES = [
  "/login",
  "/register",
  "/password-reset",
  "/password-reset/confirm",
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col px-3">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-4" : ""}>
          {group.title && (
            <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-[#707070]">{group.title}</div>
          )}
          <div className="flex flex-col gap-1">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active ? "bg-[#d44fe6]/5 text-[#d44fe6]" : "text-[#555555] hover:bg-[#f7f7f5]"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[#d44fe6]"
                    />
                  )}
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      {/* PFアプリポータルへ（外部リンクなので通常の a タグ） */}
      <div className="mt-4 border-t border-[#eeeeee] pt-2">
        <a
          href="https://portal.paloma-pf.com"
          onClick={onNavigate}
          className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#555555] transition-colors hover:bg-[#f7f7f5]"
        >
          <LayoutGrid className="h-5 w-5 shrink-0" />
          ポータル
        </a>
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <img src="/icon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-[9px]" />
      <div className="leading-tight">
        <div className="text-[10px] tracking-[0.08em] text-[#707070]">株式会社パロマ</div>
        <div className="whitespace-nowrap text-sm font-bold text-[#333333]">PF在庫管理</div>
      </div>
    </div>
  );
}

function UserFooter() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  return (
    <div className="mt-auto border-t border-slate-100 px-4 py-3">
      <div className="mb-2 truncate text-xs text-slate-500">
        {session.user.companyName}
        <span className="mx-1 text-slate-300">/</span>
        {session.user.name}
        <span
          className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold ${
            session.user.role === "admin" ? "bg-[#d44fe6]/5 text-[#d44fe6]" : "bg-slate-100 text-slate-500"
          }`}
        >
          {session.user.role === "admin" ? "管理者" : "一般"}
        </span>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <LogOut className="h-4 w-4" />
        ログアウト
      </button>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (BARE_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="print-root flex h-screen flex-col overflow-hidden bg-[#f7f7f5]">
      <div className="no-print h-1 shrink-0 bg-[#d44fe6]" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* PC サイドバー */}
        <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-[#e5e5e5] bg-white wide:flex">
          <Brand />
          <div className="border-b border-[#e5e5e5] px-4 pb-3">
            <WorkplaceSwitcher />
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <NavLinks />
          </div>
          <UserFooter />
        </aside>

        {/* モバイルドロワー */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 wide:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
            <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between pr-2">
                <Brand />
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="rounded p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="メニューを閉じる"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="border-b border-slate-100 px-4 pb-3">
                <WorkplaceSwitcher />
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <NavLinks onNavigate={() => setDrawerOpen(false)} />
              </div>
              <UserFooter />
            </aside>
          </div>
        )}

        {/* メイン */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-[#e5e5e5] bg-white px-3 wide:hidden no-print">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded p-2 text-[#555555] hover:bg-[#f7f7f5]"
              aria-label="メニューを開く"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2">
              <img src="/icon-192.png" alt="" className="h-7 w-7 rounded-[7px]" />
              <span className="whitespace-nowrap text-sm font-bold text-[#333333]">PF在庫管理</span>
            </div>
            <div className="ml-auto min-w-0 max-w-[55%]">
              <WorkplaceSwitcher compact />
            </div>
          </header>
          <main className="print-main flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}

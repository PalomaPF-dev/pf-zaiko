"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Factory, ChevronDown } from "lucide-react";
import { setCurrentWorkplaceAction } from "@/lib/actions";
import type { WorkplaceWithSite } from "@/lib/types";

interface SiteOption {
  id: string;
  name: string;
}

/**
 * ヘッダの職場セレクタ。副資材の在庫は職場ごとに独立するため、
 * 「今どの職場で作業しているか」をここで選ぶと、在庫表示・スキャン・
 * 消費・入庫すべてがその職場を対象にする。選択は Cookie に保存。
 *
 * 選択肢は工場ごとにグループ表示し、職場が未登録の工場も「（職場未登録）」として見せる。
 * 「全工場から選べます」なのに1工場しか出ないとき、他工場の職場が未登録なことが
 * セレクタだけで分かるようにするため（登録はマスタ設定 → 工場・職場）。
 */
export default function WorkplaceSwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [wps, setWps] = useState<WorkplaceWithSite[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [scoped, setScoped] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    fetch("/api/workplaces")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setWps(d.workplaces ?? []);
        setSites(d.sites ?? []);
        setCurrent(d.currentId ?? "");
        // 工場スコープの有無（null＝管理者・工場未設定＝全工場から選べる）
        setScoped(Boolean(d.scope));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  // 職場が未登録なら何も出さない（工場・職場を登録するまで副資材運用は始まらない）
  if (!loaded || wps.length === 0) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setCurrent(id);
    startTransition(async () => {
      await setCurrentWorkplaceAction(id);
      router.refresh();
    });
  }

  // 工場ごとにグループ化。職場一覧に出てこない工場（＝職場未登録）も空グループとして並べる。
  const bySite = new Map<string, { name: string; wps: WorkplaceWithSite[] }>();
  for (const s of sites) bySite.set(s.id, { name: s.name, wps: [] });
  for (const w of wps) {
    const g = bySite.get(w.siteId) ?? { name: w.siteName, wps: [] };
    g.wps.push(w);
    bySite.set(w.siteId, g);
  }
  const groups = Array.from(bySite.entries()).map(([id, g]) => ({ id, ...g }));
  const emptySites = groups.filter((g) => g.wps.length === 0);

  return (
    <>
    {/* サイドバーでは見出しを出す。工場スコープが無い人（管理者・工場未設定）は
        全工場から選べるため、所属工場の指定と誤解されないよう明記する。 */}
    {!compact && (
      <div className="mb-1 px-0.5 text-[10px] leading-snug text-[#909090]">
        作業する職場{scoped ? "（所属工場内）" : "（全工場から選べます）"}
      </div>
    )}
    <div
      className={`flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 px-2 py-1.5 ${
        compact ? "" : "w-full"
      }`}
      title={scoped ? "現在の職場（在庫・消費・入庫の対象）" : "現在の職場（在庫・消費・入庫の対象）。全工場から選べます"}
    >
      <Factory className="h-4 w-4 shrink-0 text-fuchsia-600" />
      <div className="relative flex-1">
        <select
          value={current}
          onChange={onChange}
          disabled={pending}
          className="w-full cursor-pointer appearance-none bg-transparent pr-5 text-xs font-semibold text-fuchsia-800 focus:outline-none disabled:opacity-50"
        >
          {groups.map((g) =>
            g.wps.length > 0 ? (
              <optgroup key={g.id} label={g.name}>
                {g.wps.map((w) => (
                  <option key={w.id} value={w.id}>
                    {g.name}／{w.name}
                  </option>
                ))}
              </optgroup>
            ) : (
              <optgroup key={g.id} label={g.name}>
                <option disabled value="">
                  {g.name}（職場未登録）
                </option>
              </optgroup>
            )
          )}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fuchsia-500" />
      </div>
    </div>
    {/* 職場未登録の工場があるときの案内（サイドバーのみ）。登録すればセレクタに現れる。 */}
    {!compact && emptySites.length > 0 && (
      <p className="mt-1 px-0.5 text-[10px] leading-snug text-[#909090]">
        {emptySites.map((s) => s.name).join("・")}は職場が未登録のため選べません。
        <Link href="/sites" className="ml-0.5 font-medium text-fuchsia-600 hover:underline">
          工場・職場で登録 →
        </Link>
      </p>
    )}
    </>
  );
}

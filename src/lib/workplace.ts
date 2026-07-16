import { cookies } from "next/headers";
import { listWorkplaces, ensureDefaultLocation } from "./db";
import type { WorkplaceWithSite } from "./types";

/**
 * 現在の職場（副資材在庫の対象）を Cookie で保持する。
 * 直材の倉庫ロケと違い、副資材は「今どの職場で作業しているか」を1度選べば
 * スキャン・消費・入庫・在庫表示すべてその職場が対象になる（POS端末の店舗設定に近い）。
 */
export const CURRENT_WP_COOKIE = "pf_workplace";

/** Cookie に保存された現在の職場ID（未設定なら null）。 */
export async function getCurrentWorkplaceId(): Promise<string | null> {
  const c = await cookies();
  return c.get(CURRENT_WP_COOKIE)?.value ?? null;
}

/**
 * 現在の職場を解決する。Cookie の職場が会社に属していれば採用し、
 * 無ければ先頭の職場にフォールバックする（職場未登録なら null）。
 */
export async function resolveCurrentWorkplace(companyId: string): Promise<WorkplaceWithSite | null> {
  const all = await listWorkplaces(companyId);
  if (all.length === 0) return null;
  const wanted = await getCurrentWorkplaceId();
  return all.find((w) => w.id === wanted) ?? all[0];
}

/** 現在の職場の既定の置き場ID（副資材の入出庫先）。職場未登録なら null。 */
export async function currentWorkplaceLocationId(companyId: string): Promise<string | null> {
  const wp = await resolveCurrentWorkplace(companyId);
  if (!wp) return null;
  return ensureDefaultLocation(companyId, wp.siteId, wp.id);
}

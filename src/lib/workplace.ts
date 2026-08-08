import { cache } from "react";
import { cookies } from "next/headers";
import { listWorkplaces, ensureDefaultLocation } from "./db";
import { currentOpSiteScope, currentSiteScope, outOfOperationScopeMessage } from "./scope";
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
 * 工場スコープを適用した職場一覧。
 * 一般・作業者は所属工場の職場だけ、管理者・工場未設定は全職場。
 * 所属工場名に一致する工場(sites)が無いときは空を返す（安全側）。
 * 職場の切替候補・現在の職場の解決はすべてここを通す（＝スコープの適用漏れを防ぐ）。
 */
export async function listScopedWorkplaces(companyId: string): Promise<WorkplaceWithSite[]> {
  const scope = await currentSiteScope();
  if (scope && !scope.siteId) return [];
  return listWorkplaces(companyId, { siteId: scope?.siteId ?? null });
}

/**
 * 現在の職場を解決する。Cookie の職場がスコープ内にあれば採用し、
 * 無ければ先頭の職場にフォールバックする（スコープ内に職場が無ければ null）。
 * Cookie にスコープ外の職場IDが残っていても採用しない（サーバー側の検証）。
 */
export async function resolveCurrentWorkplace(companyId: string): Promise<WorkplaceWithSite | null> {
  const all = await listScopedWorkplaces(companyId);
  if (all.length === 0) return null;
  const wanted = await getCurrentWorkplaceId();
  return all.find((w) => w.id === wanted) ?? all[0];
}

/** 現在の職場の既定の置き場ID（副資材の入出庫先）。職場未登録・スコープ内に職場が無ければ null。 */
export async function currentWorkplaceLocationId(companyId: string): Promise<string | null> {
  const wp = await resolveCurrentWorkplace(companyId);
  if (!wp) return null;
  return ensureDefaultLocation(companyId, wp.siteId, wp.id);
}

/**
 * 現在の職場の「入出庫できるか」判定。
 * 管理者は他工場の職場も選べる（閲覧のため）が、入出庫は所属工場に限る。
 * 画面のボタン出し分けと注意バナーはこれを見る（サーバー側の実施は scope.ts の assert* が行う）。
 */
export interface WorkplaceOperation {
  workplace: WorkplaceWithSite | null;
  /** 現在の職場で入出庫できるか */
  operable: boolean;
  /** 入出庫できる工場名（null＝制限なし） */
  operableFactory: string | null;
}

export const currentWorkplaceOperation = cache(
  async (companyId: string): Promise<WorkplaceOperation> => {
    const [workplace, opScope] = await Promise.all([
      resolveCurrentWorkplace(companyId),
      currentOpSiteScope(),
    ]);
    if (!opScope) return { workplace, operable: true, operableFactory: null };
    return {
      workplace,
      operable: workplace != null && workplace.siteId === opScope.siteId,
      operableFactory: opScope.factory,
    };
  }
);

/** 現在の職場で入出庫できなければ例外。現在の職場に書き込む Server Action の入口で使う。 */
export async function assertCurrentWorkplaceOperable(companyId: string): Promise<void> {
  const { operable, operableFactory } = await currentWorkplaceOperation(companyId);
  if (!operable && operableFactory) throw new Error(outOfOperationScopeMessage(operableFactory));
}

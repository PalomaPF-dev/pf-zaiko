import { cache } from "react";
import { getScopedSession } from "./session";
import {
  findSiteIdByName,
  getIssueOrder,
  getLocationSiteId,
  getReceipt,
  getStocktake,
  getWorkplace,
} from "./db";

/**
 * 部署（工場）スコープ。ポータルの部署が「工場」種別のとき users.factory に工場名が入り、
 * 一般（member）・作業者（worker）はその工場のデータだけを閲覧できる。
 * 管理者（admin）と工場未設定（factory=NULL）は制限なし（＝スコープは null）。
 *
 * このアプリの拠点マスタは 工場 sites → 職場 workplaces → 置き場 locations → 在庫 という階層なので、
 * ポータルの工場名を sites.name と突合して site_id を解決し、その配下だけを見せる。
 */
export interface SiteScope {
  /** ポータル由来の所属工場名 */
  factory: string;
  /** 名前が一致した工場(sites)のID。一致する工場が無ければ null（＝閲覧できるデータ無し） */
  siteId: string | null;
}

/** スコープ外の対象を操作しようとしたときのメッセージ（Server Action / API 共通）。 */
export const OUT_OF_SCOPE_MESSAGE = "所属工場の範囲外のデータです。";

/**
 * 工場名が拠点マスタに無いときに使う、決して一致しない工場ID。
 * 「制限なし（null）」と区別するため、SQL には必ず非 NULL の値を渡して空表示にする（安全側）。
 */
const NO_SITE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * ログイン中ユーザーの工場スコープ。null＝制限なし（管理者・工場未設定・未ログイン）。
 * role/factory は DB から都度取得するため、ポータルでの変更が既存セッションにも即時反映される。
 * 同一リクエスト内では React cache で1回だけ解決する。
 */
export const currentSiteScope = cache(async (): Promise<SiteScope | null> => {
  const s = await getScopedSession();
  if (!s?.factoryScope) return null;
  const siteId = await findSiteIdByName(s.companyId, s.factoryScope);
  return { factory: s.factoryScope, siteId };
});

/**
 * db.ts の各読み取り関数へ渡す siteId フィルタ値。
 * null＝制限なし／工場ID＝その工場だけ／一致する工場が無ければ NO_SITE_ID（常に空）。
 */
export function scopeSiteId(scope: SiteScope | null): string | null {
  if (!scope) return null;
  return scope.siteId ?? NO_SITE_ID;
}

/** ページ・API 用のショートカット。スコープと SQL 用 siteId をまとめて返す。 */
export async function currentScope(): Promise<{ scope: SiteScope | null; siteId: string | null }> {
  const scope = await currentSiteScope();
  return { scope, siteId: scopeSiteId(scope) };
}

/** 指定の工場IDがスコープ内か（null＝工場未設定のデータはスコープ有効時は範囲外）。 */
export async function isSiteInScope(siteId: string | null): Promise<boolean> {
  const scope = await currentSiteScope();
  if (!scope) return true;
  return siteId != null && siteId === scope.siteId;
}

/** スコープ外なら例外。置き場（ロケーション）への書き込み前に必ず通す。 */
export async function assertLocationInScope(companyId: string, locationId: string): Promise<void> {
  const scope = await currentSiteScope();
  if (!scope) return;
  const siteId = await getLocationSiteId(companyId, locationId);
  if (siteId == null || siteId !== scope.siteId) throw new Error(OUT_OF_SCOPE_MESSAGE);
}

/** スコープ外なら例外。職場の切り替え・職場間移動の前に必ず通す。 */
export async function assertWorkplaceInScope(companyId: string, workplaceId: string): Promise<void> {
  const scope = await currentSiteScope();
  if (!scope) return;
  const wp = await getWorkplace(companyId, workplaceId);
  if (!wp || wp.siteId !== scope.siteId) throw new Error(OUT_OF_SCOPE_MESSAGE);
}

/** スコープ外の棚卸なら例外（ID を直接叩かれても更新させない）。 */
export async function assertStocktakeInScope(companyId: string, stocktakeId: string): Promise<void> {
  const scope = await currentSiteScope();
  if (!scope) return;
  if (!(await getStocktake(companyId, stocktakeId, scopeSiteId(scope)))) {
    throw new Error(OUT_OF_SCOPE_MESSAGE);
  }
}

/** スコープ外の出庫指示なら例外。 */
export async function assertIssueOrderInScope(companyId: string, orderId: string): Promise<void> {
  const scope = await currentSiteScope();
  if (!scope) return;
  if (!(await getIssueOrder(companyId, orderId, scopeSiteId(scope)))) {
    throw new Error(OUT_OF_SCOPE_MESSAGE);
  }
}

/** スコープ外の入荷（受入伝票）なら例外。 */
export async function assertReceiptInScope(companyId: string, receiptId: string): Promise<void> {
  const scope = await currentSiteScope();
  if (!scope) return;
  if (!(await getReceipt(companyId, receiptId, scopeSiteId(scope)))) {
    throw new Error(OUT_OF_SCOPE_MESSAGE);
  }
}

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
 * 部署（工場）スコープ。ポータルの部署が「工場」種別のとき users.factory に工場名が入る。
 * スコープは**閲覧用**と**入出庫用**の2本立てになっている。
 *
 * - 閲覧スコープ（currentSiteScope）… 一般（member）・作業者（worker）は所属工場のデータだけ。
 *   管理者（admin）と工場未設定は制限なし（＝全工場を閲覧できる）。
 * - 入出庫スコープ（currentOpSiteScope）… 役割では緩まない。工場に所属している人は
 *   **管理者であっても自分の工場でしか入出庫できない**。工場に所属していない人
 *   （ポータル管理者など部署が工場でない）だけが全工場で入出庫できる。
 *
 * このアプリの拠点マスタは 工場 sites → 職場 workplaces → 置き場 locations → 在庫 という階層なので、
 * ポータルの工場名を sites.name と突合して site_id を解決し、その配下だけを見せる／書かせる。
 */
export interface SiteScope {
  /** ポータル由来の所属工場名 */
  factory: string;
  /** 名前が一致した工場(sites)のID。一致する工場が無ければ null（＝閲覧できるデータ無し） */
  siteId: string | null;
}

/** 閲覧スコープ外の対象を開こうとしたときのメッセージ。 */
export const OUT_OF_SCOPE_MESSAGE = "所属工場の範囲外のデータです。";

/** 入出庫スコープ外へ書き込もうとしたときのメッセージ（Server Action / API 共通）。 */
export function outOfOperationScopeMessage(factory: string): string {
  return `入出庫できるのは所属工場（${factory}）だけです。他の工場のデータは閲覧のみになります。`;
}

/**
 * 工場名が拠点マスタに無いときに使う、決して一致しない工場ID。
 * 「制限なし（null）」と区別するため、SQL には必ず非 NULL の値を渡して空表示にする（安全側）。
 */
const NO_SITE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * ログイン中ユーザーの**閲覧**工場スコープ。null＝制限なし（管理者・工場未設定・未ログイン）。
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
 * ログイン中ユーザーの**入出庫**工場スコープ。null＝全工場で入出庫可（工場未所属のみ）。
 * 管理者でも所属工場があれば非 null になる点が閲覧スコープとの違い。
 */
export const currentOpSiteScope = cache(async (): Promise<SiteScope | null> => {
  const s = await getScopedSession();
  if (!s?.operationScope) return null;
  const siteId = await findSiteIdByName(s.companyId, s.operationScope);
  return { factory: s.operationScope, siteId };
});

/**
 * db.ts の各読み取り関数へ渡す siteId フィルタ値。
 * null＝制限なし／工場ID＝その工場だけ／一致する工場が無ければ NO_SITE_ID（常に空）。
 */
export function scopeSiteId(scope: SiteScope | null): string | null {
  if (!scope) return null;
  return scope.siteId ?? NO_SITE_ID;
}

/** ページ・API 用のショートカット。閲覧スコープと SQL 用 siteId をまとめて返す。 */
export async function currentScope(): Promise<{ scope: SiteScope | null; siteId: string | null }> {
  const scope = await currentSiteScope();
  return { scope, siteId: scopeSiteId(scope) };
}

/** 入出庫スコープ版のショートカット。 */
export async function currentOpScope(): Promise<{ scope: SiteScope | null; siteId: string | null }> {
  const scope = await currentOpSiteScope();
  return { scope, siteId: scopeSiteId(scope) };
}

/** 指定の工場IDが閲覧スコープ内か（null＝工場未設定のデータはスコープ有効時は範囲外）。 */
export async function isSiteInScope(siteId: string | null): Promise<boolean> {
  const scope = await currentSiteScope();
  if (!scope) return true;
  return siteId != null && siteId === scope.siteId;
}

/** 指定の工場で入出庫できるか（UI の出し分け用。サーバー側の実施は assert* で行う）。 */
export async function canOperateSite(siteId: string | null): Promise<boolean> {
  const scope = await currentOpSiteScope();
  if (!scope) return true;
  return siteId != null && siteId === scope.siteId;
}

/** 入出庫スコープ外なら例外。工場IDが分かっている書き込みの入口で使う。 */
export async function assertSiteOperable(siteId: string | null): Promise<void> {
  const scope = await currentOpSiteScope();
  if (!scope) return;
  if (siteId == null || siteId !== scope.siteId) {
    throw new Error(outOfOperationScopeMessage(scope.factory));
  }
}

/** 入出庫スコープ外なら例外。置き場（ロケーション）への書き込み前に必ず通す。 */
export async function assertLocationOperable(companyId: string, locationId: string): Promise<void> {
  const scope = await currentOpSiteScope();
  if (!scope) return;
  await assertSiteOperable(await getLocationSiteId(companyId, locationId));
}

/** 入出庫スコープ外なら例外。職場を対象にした入出庫（職場間移動の移動先など）の前に通す。 */
export async function assertWorkplaceOperable(companyId: string, workplaceId: string): Promise<void> {
  const scope = await currentOpSiteScope();
  if (!scope) return;
  const wp = await getWorkplace(companyId, workplaceId);
  await assertSiteOperable(wp?.siteId ?? null);
}

/** 閲覧スコープ外の職場なら例外。職場セレクタの切り替え（表示対象の変更）で使う。 */
export async function assertWorkplaceVisible(companyId: string, workplaceId: string): Promise<void> {
  const scope = await currentSiteScope();
  if (!scope) return;
  const wp = await getWorkplace(companyId, workplaceId);
  if (!wp || wp.siteId !== scope.siteId) throw new Error(OUT_OF_SCOPE_MESSAGE);
}

/**
 * 伝票（棚卸・出庫指示・入荷）を入出庫スコープで操作できるか。
 * 詳細画面でボタンを出すかどうかの判定に使う（実施は下の assert* が行う）。
 * 閲覧スコープでは既に読めている前提なので、ここでは入出庫スコープだけを見る。
 */
async function canOperateDocument(
  load: (siteId: string | null) => Promise<unknown | null>
): Promise<boolean> {
  const scope = await currentOpSiteScope();
  if (!scope) return true;
  return Boolean(await load(scopeSiteId(scope)));
}

/** この棚卸で実棚入力・反映ができるか。 */
export function canOperateStocktake(companyId: string, stocktakeId: string): Promise<boolean> {
  return canOperateDocument((siteId) => getStocktake(companyId, stocktakeId, siteId));
}

/** この出庫指示で明細追加・出庫ができるか。 */
export function canOperateIssueOrder(companyId: string, orderId: string): Promise<boolean> {
  return canOperateDocument((siteId) => getIssueOrder(companyId, orderId, siteId));
}

/** この入荷（受入伝票）で明細追加・削除ができるか。 */
export function canOperateReceipt(companyId: string, receiptId: string): Promise<boolean> {
  return canOperateDocument((siteId) => getReceipt(companyId, receiptId, siteId));
}

/** 入出庫スコープ外の棚卸なら例外（ID を直接叩かれても更新させない）。 */
export async function assertStocktakeOperable(companyId: string, stocktakeId: string): Promise<void> {
  const scope = await currentOpSiteScope();
  if (!scope) return;
  if (!(await getStocktake(companyId, stocktakeId, scopeSiteId(scope)))) {
    throw new Error(outOfOperationScopeMessage(scope.factory));
  }
}

/** 入出庫スコープ外の出庫指示なら例外。 */
export async function assertIssueOrderOperable(companyId: string, orderId: string): Promise<void> {
  const scope = await currentOpSiteScope();
  if (!scope) return;
  if (!(await getIssueOrder(companyId, orderId, scopeSiteId(scope)))) {
    throw new Error(outOfOperationScopeMessage(scope.factory));
  }
}

/** 入出庫スコープ外の入荷（受入伝票）なら例外。 */
export async function assertReceiptOperable(companyId: string, receiptId: string): Promise<void> {
  const scope = await currentOpSiteScope();
  if (!scope) return;
  if (!(await getReceipt(companyId, receiptId, scopeSiteId(scope)))) {
    throw new Error(outOfOperationScopeMessage(scope.factory));
  }
}

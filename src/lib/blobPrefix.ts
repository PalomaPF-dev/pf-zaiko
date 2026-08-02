/**
 * 社内共通の統一 Vercel Blob Store（pf-project）を他アプリ
 * （kanagata/hinshitsu/setsubi/keisoku 等）と共有するための区画分けプレフィックス。
 * クライアント側アップロード（AreaMap など）と
 * サーバー側ホワイトリスト（api/media/upload/route.ts の ALLOWED_PREFIXES）の
 * 両方で必ずこの値を使うこと。
 */
export const BLOB_APP_PREFIX = "zaiko";

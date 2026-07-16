import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

/** アップロード先プレフィックスのホワイトリスト */
const ALLOWED_PREFIXES = ["item-media/", "record-media/", "drawings/", "workplace-map/"];

/**
 * クライアント直接アップロード（@vercel/blob/client）用のトークン発行。
 * 動画など大きいファイルはサーバー(4.5MB制限)を経由せず Blob へ直接上げる。
 * ログイン必須。パスは用途別プレフィックスのみ許可。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) {
          throw new Error("不正なアップロード先です");
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
            "image/gif",
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "application/pdf",
          ],
          maximumSizeInBytes: 200 * 1024 * 1024, // 200MB（動画対応）
          addRandomSuffix: true,
        };
      },
      // 公開URLからのコールバックは localhost では届かないため、ここでは何もしない
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "アップロードに失敗しました" },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { listScopedWorkplaces, resolveCurrentWorkplace } from "@/lib/workplace";
import { currentSiteScope, scopeSiteId } from "@/lib/scope";
import { listSites } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * ヘッダの職場セレクタ用: 選べる職場の一覧＋現在選択中の職場ID。
 * 工場スコープが効いている場合は自工場の職場だけを返し、scope に表示用の情報を添える
 * （matched=false は「所属工場に一致する工場マスタが無い＝表示できるデータが無い」）。
 *
 * sites にはスコープ内の全工場を返す（職場が未登録の工場も含む）。セレクタはこれで
 * 工場ごとにグループ表示し、職場未登録の工場を「選べない理由つき」で見せる。
 * 「全工場から選べます」なのに1工場しか出ない＝他工場の職場が未登録、を画面から分かるようにする。
 */
export async function GET() {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ workplaces: [], sites: [], currentId: null, scope: null });
  try {
    const scope = await currentSiteScope();
    const [workplaces, current, sites] = await Promise.all([
      listScopedWorkplaces(session.companyId),
      resolveCurrentWorkplace(session.companyId),
      listSites(session.companyId, { siteId: scopeSiteId(scope) }),
    ]);
    return NextResponse.json({
      workplaces,
      sites: sites.map((s) => ({ id: s.id, name: s.name })),
      currentId: current?.id ?? null,
      scope: scope ? { factory: scope.factory, matched: scope.siteId != null } : null,
    });
  } catch {
    return NextResponse.json({ workplaces: [], sites: [], currentId: null, scope: null });
  }
}

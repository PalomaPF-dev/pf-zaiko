import Link from "next/link";
import {
  ShieldCheck,
  Package,
  Factory,
  MapPin,
  Contact,
  ArrowDownToLine,
  PackageCheck,
  Truck,
  ScanLine,
  ArrowLeftRight,
  ClipboardCheck,
  Bell,
  BookOpen,
  BookMarked,
  Info,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-static";

/** 使い方ガイド（工場・職場＋ロケ登録〜受入/棚入れ〜出庫指示/3点照合〜移動・棚卸・アラート） */
export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader title="使い方" description="工場・職場とロケーションの登録から、入荷（受入）→入庫（棚入れ）／出庫指示→3点照合出庫までの流れ" />

      {/* 全体の流れ */}
      <div className="mb-8 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/50 p-4 sm:p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-fuchsia-800">
          <BookOpen className="h-4 w-4" />
          全体の流れ
        </h2>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-fuchsia-900">
          <li className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-fuchsia-200">① 工場・職場・ロケを登録</li>
          <li aria-hidden>→</li>
          <li className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-fuchsia-200">② 副資材を登録</li>
          <li aria-hidden>→</li>
          <li className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-fuchsia-200">③ 入荷（受入）→ 入庫（棚入れ）</li>
          <li aria-hidden>→</li>
          <li className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-fuchsia-200">④ 出庫指示 → 3点照合出庫</li>
        </ol>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-fuchsia-700/80">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          在庫は<b className="mx-0.5">工場＞職場＞ロケーション</b>で管理します。ヘッダの<b className="mx-0.5">職場セレクタ</b>で選んだ職場が、在庫・入出庫の対象になります。
        </p>
      </div>

      {/* ===== セットアップ ===== */}
      <h2 className="mb-4 border-l-4 border-fuchsia-600 pl-3 text-lg font-bold text-slate-800">初期セットアップ（管理者）</h2>
      <div className="flex flex-col gap-4">
        <GuideStep no={1} icon={ShieldCheck} title="作業者を登録する" href="/settings" linkLabel="設定を開く">
          ログインアカウントの発行は<b>ポータル</b>で行います。アプリでは「マスタ設定」の<b>作業者管理</b>に
          現場の担当者の名前を登録すると、入出庫・棚卸の記録時に<b>作業者を選択</b>できます。
          在庫アラートの通知先やマイナス在庫の許容もここで設定できます。
        </GuideStep>

        <GuideStep no={2} icon={Factory} title="工場・職場を登録する" href="/sites" linkLabel="工場・職場">
          工場を作り、その中に<b>職場</b>（組立ライン・塗装ブース・検査室 など）を登録します。<b>在庫は職場ごとに独立</b>して管理されます。
        </GuideStep>

        <GuideStep no={3} icon={MapPin} title="ロケーション（棚）を採番する" href="/locations/new" linkLabel="ロケを作成">
          <b>現在の職場</b>の中に、<b>エリア-棚-段-間口</b>（例 <span className="font-mono">A-01-3-2</span>）で棚位置を登録します。範囲指定で<b>まとめて生成</b>もでき、
          作成したロケは<b>ロケラベル</b>を発行して棚に貼ります。別の職場のロケを作るときは、ヘッダの職場セレクタで切り替えてから作成してください。
        </GuideStep>

        <GuideStep no={4} icon={Package} title="副資材を登録する" href="/products/new" linkLabel="副資材を登録">
          <b>品名</b>と<b>メーカー品番</b>（QR・検索の主キー）を登録します。単位・<b>安全在庫（下限）</b>・規格・メーカーも設定でき、安全在庫を下回るとアラート対象になります。
          <br />
          <b>資材W/F に登録済みの品目</b>なら、フォーム冒頭の「<b>品目コードから呼び出す</b>」に品目コード（例{" "}
          <span className="font-mono">06-26105-00</span>）を入れると、品名・購入先・ロットサイズが自動で入ります。
        </GuideStep>

        <GuideStep no={5} icon={BookMarked} title="品目マスタから探す（資材W/F）" href="/items" linkLabel="品目マスタ">
          資材W/F の品目マスタを取り込んであります。<b>品目コード・品名・仕入先</b>で検索し、
          「<b>この品目で商品を登録</b>」を押すとそのまま副資材として登録できます。品目コードは<b>図番</b>として登録され、
          以降は<b>スキャン・手入力でその品目コードから呼び出せます</b>。
        </GuideStep>

        <GuideStep no={6} icon={Contact} title="取引先を登録する（任意）" href="/partners" linkLabel="取引先">
          <b>仕入先</b>（入荷で選択）・<b>出荷先</b>（出庫指示で選択）・<b>移動先</b>（社内）を登録しておくと、各画面で選べます。
        </GuideStep>
      </div>

      {/* ===== 日常運用 ===== */}
      <h2 className="mb-4 mt-10 border-l-4 border-fuchsia-600 pl-3 text-lg font-bold text-slate-800">日常運用（入荷業務・出荷業務・在庫管理）</h2>
      <div className="flex flex-col gap-4">
        <GuideStep no={1} icon={ScanLine} title="いまの職場を選ぶ／スキャンして開く" href="/scan" linkLabel="スキャン">
          ヘッダの<b>職場セレクタ</b>で作業中の工場・職場を選びます。<b>スキャン</b>では、商品QR→在庫画面、ロケQR→在庫照会が開きます（手入力でも可）。
        </GuideStep>

        <GuideStep no={2} icon={ArrowDownToLine} title="入荷業務：入荷（受入）→ 入庫（棚入れ）" href="/inbound" linkLabel="入荷">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <b>入荷（受入）</b>：<b>納入場所</b>を指定し、<b>商品を検索</b>して<b>箱数×入り数＝合計</b>で数量を入れ、入荷を登録します。
              登録後、<b>商品ラベル</b>（QR＝メーカー品番）を発行して現品に貼ります。<b>この段階ではロケは未定（未入庫）</b>です。
            </li>
            <li>
              <b>入庫（棚入れ）</b>：貼った<b>商品ラベルをスキャン</b>（または未入庫一覧から選択）→<b>現在の職場のロケ</b>を付与して棚入れします。
              棚入れした在庫だけが出庫の対象になります。
            </li>
          </ol>
        </GuideStep>

        <GuideStep no={3} icon={Truck} title="出荷業務：出庫指示 → ピッキング → 3点照合" href="/issue-orders" linkLabel="出庫">
          <ol className="list-decimal space-y-1 pl-5">
            <li>出庫する<b>部材を選択</b>して<b>出庫指示リストを作成</b>（在庫最多の<b>現在の職場のロケ</b>を自動引当）。</li>
            <li>指示リストを<b>印刷</b>し、<b>ロケが近い順</b>に効率よくピッキング。</li>
            <li>各行の「<b>照合出庫</b>」で3つのQR（<b>指示リスト／商品ラベル／ロケラベル</b>）を読み、<b>3点が一致すれば出庫確定</b>。誤出荷を防止します。急ぎは「<b>一括確定</b>」も可能。</li>
          </ol>
        </GuideStep>

        <GuideStep no={4} icon={ArrowLeftRight} title="在庫管理：移動・調整・照会" href="/move" linkLabel="移動・調整">
          <b>ロケ間移動</b>と<b>在庫調整</b>（実在庫合わせ）を行います。現在庫は「<b>在庫台帳</b>」、入荷・出庫・移動・棚卸差異の時系列は「<b>受払履歴</b>」で照会・CSV出力できます（現在の職場に絞って表示）。
        </GuideStep>

        <GuideStep no={5} icon={ClipboardCheck} title="棚卸をする" href="/stocktakes" linkLabel="棚卸">
          <b>現在の職場</b>の在庫を帳簿数として取り込み、記入リストを印刷→実棚数を入力→差異を確認→在庫に反映します。
        </GuideStep>

        <GuideStep no={6} icon={Bell} title="在庫アラートを受け取る">
          <b>安全在庫を下回った副資材</b>は毎日の定期チェックで検出し、設定した通知先へメール通知します。ダッシュボードや在庫台帳の「安全在庫割れ」でも確認できます。
        </GuideStep>
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/inbound"
          className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-700"
        >
          <ArrowDownToLine className="h-4 w-4" />
          入荷（受入）を始める
        </Link>
      </div>
    </div>
  );
}

function GuideStep({
  no,
  icon: Icon,
  title,
  children,
  href,
  linkLabel,
}: {
  no: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fuchsia-600 font-mono text-xs font-bold text-white">
          {no}
        </span>
        <Icon className="h-4 w-4 shrink-0 text-fuchsia-600" />
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {href && linkLabel && (
          <Link href={href} className="ml-auto shrink-0 text-xs font-medium text-fuchsia-600 hover:underline">
            {linkLabel} →
          </Link>
        )}
      </div>
      <div className="pl-9 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

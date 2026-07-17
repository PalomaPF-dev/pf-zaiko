# Paloma品質 — App Store 申請手順・メタデータ

シリーズ共通の Capacitor リモート読込方式（WebView で https://sumakouba-hinshitsu.vercel.app を表示）。
アンチステアリング対応（WebOnly: ネイティブでは価格/新規登録/外部課金リンク非表示）は実装済み。

---

## 1. Xcode でのビルド・Archive 手順

```bash
# Xcode CLT ではなく Xcode 本体を指す（初回のみ）
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# プロジェクトを開く
cd "/Users/tetsuya/Code Try/sumakouba-hinshitsu"
npx cap open ios     # または open ios/App/App.xcodeproj
```

Xcode での設定（初回のみ）:
1. TARGETS → App → **Signing & Capabilities** → Team に Apple Developer アカウントを選択
2. Bundle Identifier: `jp.sumakouba.hinshitsu`（設定済み）
3. General → Identity → Version `1.0` / Build `1`

Archive → 提出:
1. デバイス選択を **Any iOS Device (arm64)** に
2. メニュー **Product → Archive**
3. Organizer → **Distribute App → App Store Connect → Upload**

## 2. App Store Connect — アプリ作成

| 項目 | 値 |
| --- | --- |
| プラットフォーム | iOS |
| 名前 | **Paloma品質** |
| プライマリ言語 | 日本語 |
| バンドルID | `jp.sumakouba.hinshitsu`（Identifiers に未登録なら App IDs で先に作成） |
| SKU | `sumakouba-hinshitsu` |
| カテゴリ | ビジネス（サブ: 仕事効率化） |
| 価格 | 無料（App内課金なし。Web側のプランは表示しない＝アンチステアリング対応済み） |

### サブタイトル（30文字以内）
```
QC工程表で品質チェックを記録・承認
```

### プロモーションテキスト（170文字以内）
```
QC工程表・検査基準書どおりの品質チェックをスマホで。測定値の自動判定、写真・動画の証跡、管理者の承認ワークフローまで、紙のチェックシートをまるごと置き換えます。
```

### 説明文
```
Paloma品質は、製造現場の品質チェックを「QC工程表のとおりに、確実に」記録するためのアプリです。

■ QC工程表・検査手順書をそのままアプリに
・工程フロー（JIS工程記号）→ 管理項目 → 管理基準の3階層で登録
・測定箇所の写真を項目ごとに登録し、検査時に拡大表示で部位を確認
・QC工程表・検査手順書はPDF帳票として印刷可能

■ 検査は入力するだけで自動判定
・管理基準（上下限）を外れると自動でNG判定
・正常時もNG時も写真・動画で状態を記録
・作業者は選ぶだけ。新しい名前はその場で自動登録

■ 承認ワークフロー
・検査を送付（申請）すると管理者へ結果一覧つきのメールを自動送信
・管理者が承認すると「検査完了」として確定。差し戻しにも対応
・役割（管理者／一般）でできる操作を制限

■ 見逃しを防ぐ通知
・NG発生を通知先へ即時メール
・頻度（毎日・毎週など）を超えて未実施の検査を毎日自動チェック

■ その他
・工場・職場ごとのダッシュボード
・検査記録の検索・CSV出力
・図面番号・図面ファイルの添付（Paloma図面と図番で連携）

※ 本アプリの利用にはアカウントが必要です。「ログインせずにデモを見る」からサンプルデータで全機能をお試しいただけます。
```

### キーワード（100文字以内）
```
品質管理,QC工程表,検査,品質チェック,製造業,工場,検査記録,トレーサビリティ,承認,QC
```

| 項目 | 値 |
| --- | --- |
| サポートURL | https://www.sumakouba.com |
| プライバシーポリシーURL | https://sumakouba-hinshitsu.vercel.app/privacy |
| Copyright | Paloma |

## 3. App プライバシー（データ収集）

| データ | 用途 | 紐付け | トラッキング |
| --- | --- | --- | --- |
| メールアドレス | アカウント（App の機能） | あり | なし |
| 氏名（ユーザー名・作業者名） | App の機能 | あり | なし |
| 写真・動画（ユーザーコンテンツ） | App の機能（検査の証跡） | あり | なし |
| その他のユーザーコンテンツ（検査記録） | App の機能 | あり | なし |

トラッキングなし・広告なし。

## 4. 審査メモ（App Review 情報）

- サインイン必須のため、**デモアカウント欄には記入不要**。ログイン画面の
  「**✨ ログインせずにデモを見る**」ボタンからワンタップで全機能を体験できます（サンプルデータ入り・登録不要）。
  その旨を「メモ」欄に記載:
  ```
  Tap "ログインせずにデモを見る" (View Demo) on the login screen to explore
  all features with sample data. No account registration is required for review.
  ```
- カメラ/マイク: 検査時の不具合写真・動画撮影に使用（Info.plist に利用目的記載済み）
- 外部課金・価格表示はネイティブアプリ内に存在しません（Guideline 3.1 対応）

## 5. スクリーンショット（シミュレータで撮影）

必要サイズ: iPhone 6.9インチ（iPhone 16 Pro Max など）。iPad 対応にする場合は 13インチも。

おすすめ撮影ページ（デモログイン後）:
1. ダッシュボード（工場フィルタ表示）
2. 検査実行（自動判定 OK/NG が見える状態）
3. 検査部位ビューア（部位を表示）
4. 送付前の確認画面
5. 承認画面（承認待ち一覧 or 詳細）
6. QC工程表の帳票ビュー

```bash
# シミュレータ起動例
open -a Simulator
xcrun simctl boot "iPhone 16 Pro Max"
# Safari ではなくアプリ本体を Run してから Cmd+S でスクリーンショット保存
```

## 6. 提出前チェックリスト

- [ ] Xcode: Team 設定・Bundle ID `jp.sumakouba.hinshitsu`
- [ ] Version/Build 番号
- [ ] Archive → Upload 成功
- [ ] App Store Connect: メタデータ・スクリーンショット・プライバシー入力
- [ ] 審査メモにデモボタンの案内を記載
- [ ] 「審査へ提出」

## 既知の制限（メモ）

- iOS の WebView は Web Bluetooth 非対応のため、BLE 測定器の自動取込は iOS では使えません（手入力は可）。
  アプリ内でもその旨を案内済み。ネイティブBLE対応は将来 Capacitor プラグインで実装予定。

# wedding-admin

結婚式の管理画面（https://wedding-admin.forest-mm.com/）。Cloudflare Workers（Static Assets + Worker）で配信し、
`main` への push で自動デプロイされる。データは Supabase（ゲスト向けサイト wedding-invitation と同じプロジェクト）。

```
public/          管理画面（index.html・app.js・style.css）と受付（reception/）など
  modes.js       公開設定・Movies・ギフト＆感想のタブ（00_spec/06_modes_admin.md）
  modes-logic.js 上のタブの画面に依存しない計算（公開モードの判定はゲスト側 Worker と同じ規則）
  contents.js    コンテンツタブ（ゲスト向けサイトの文章・写真。00_spec/07_cms_admin.md）
  contents-logic.js  上のタブの画面に依存しない処理（JSON からの取り込み・既定文・保存前の検証）
  content-source/    「JSON から取り込む」の取り込み元（wedding-invitation の guide.ja.json・guide.zh.json のコピー）
  marche-items.json  Gift Marché の品名（wedding-invitation の guide.ja.json の marche のコピー）
src/worker.js    Worker。/r/*（受付の短縮URL）、/api/reception/*、/api/media/*（ムービー・コンテンツ画像の R2）、/api/admin/config
supabase/migrations/  本番に適用する SQL（適用済みのものは docs/archive/migrations/ へ移す）
tests/           npm test
00_spec/         仕様書
```

## ローカル開発

```
npm test                        # Worker と計算ロジックのテスト
npx wrangler dev --local        # http://localhost:8787（R2 はローカルのエミュレーション）
```

## マイグレーションの適用

1. Supabase ダッシュボード → SQL Editor → New query
2. `supabase/migrations/` の SQL の中身を貼り付けて Run（どれも何度実行しても同じ結果になるように書く）
3. Table Editor で結果を確認する
4. 適用したら SQL ファイルを `docs/archive/migrations/` へ移す

適用済み：`2026-10-07_1_modes_movies_feedback.sql`（06 公開モード・Movies・ギフト＆感想）、
`2026-10-07_2_guide_content.sql`（07 コンテンツの `guide_content`）

## タブ

グループごとに並べている（PC は左サイドバー、1024px 未満は上部のセグメント＋横スクロールのタブ）。
現在のタブは URL のハッシュ（例 `#contents`）に入るので、再読み込みやブックマークでも同じタブが開く。

| グループ | タブ |
|---|---|
| ゲスト | ダッシュボード・ゲスト一覧・投稿写真・配席・受付トークン |
| ギフト | ご祝儀・ギフト＆感想・予算 |
| 公開サイト | 公開設定・コンテンツ・Movies（スマホではこの末尾に PHOTO TOSS 管理） |
| 設定 | 友人圏・シェア |

サイドバー最下部の「PHOTO TOSS 管理 ↗」は wrangler.toml の `PHOTOS_ADMIN_URL`
（PHOTO TOSS の管理入口 **https://wedding-photos.forest-mm.com/admin/** 。招待状サイトの管理画面と同じ ID とパスワードで入る）。
URL にトークンは含めない。

## コンテンツ（ゲスト向けサイトの文章・写真）

コンテンツタブで、Guide の ごあいさつ・Story・Marché・Menu・Movies の文言・ひとこと（Thanks）の文言・ヘルプ（初回ポップアップ）を
日本語・中文それぞれ編集する。保存先は Supabase の `guide_content`（section × lang の JSON。構造はゲスト側
`public/guide/content/guide.<lang>.json` の対応キーと同じ）。ゲスト側には最大 60 秒（キャッシュ）で反映される。
DB にまだ無い section は、ゲスト側が guide.<lang>.json の内容で表示する。

- 写真はアップロードすると R2 `wedding-media` の `guide/<section>/<file>` に置かれ、データには `media/guide/<section>/<file>` と入る。
  長辺 1600px を超える画像はブラウザで縮小してから送る（JPEG・PNG・WebP、10MB まで）。従来の `photos/…`（ゲスト側リポジトリ内）もそのまま使える
- Marché の ID（g01〜・s01〜）はギフト＆ひとことの集計と対応しているので変えられない。行を追加すると次の番号が付く。削除・保存のときに確認が出る
- 別の画面で先に保存されていたら、上書きしてよいか確認が出る

### 「JSON から取り込む」（最初の 1 回）

1. 管理画面 → 公開サイト → コンテンツ → 「JSON から取り込む」
2. 取り込み元は「管理画面に同梱のコピー」（`public/content-source/`）のままでよい。
   ゲスト側の JSON を後から直した場合は「ファイルを選ぶ」で `wedding-invitation/public/guide/content/guide.ja.json`・`guide.zh.json` を選ぶ
3. 一覧で「未登録 → 投入」にチェックが入っていることを確認して「取り込む」
   （内容がすでにある項目は、チェックを入れたものだけ上書き。ヘルプとひとことの文言は JSON に無ければ仕様の既定文が入る）
4. 左の一覧で各項目の ja・zh が緑になれば完了。Table Editor の `guide_content` は 14 行（7 項目 × 2 言語）になる

## ムービー（R2）

- バケット `wedding-media`（公開ドメインなし）。管理画面の Worker は `MEDIA` として読み書きし、
  ゲスト向けは wedding-invitation の Worker が `/media/<key>` で配信する
- `/api/media/*` はすべて管理者（Supabase Auth のトークン＋`ADMIN_EMAILS`／`ADMIN_EMAIL_DOMAIN`）だけ。
  受付トークンの Cookie では使えない。動画・ポスターのプレビューは `/api/media/sign` が出す 6 時間有効の署名付き URL
- アップロードは 50MB ずつのマルチパート。1 ファイル 2GB まで、`video/mp4` のみ。キーは `movies/<slug>/<ラベル>.mp4`、
  ポスターは `movies/<slug>/poster.jpg`（幅 1280 の JPEG に変換して保存）

### ムービーの変換

アップロード前に手元で H.264/AAC・faststart の MP4 にする（ffmpeg の例）。

```
# 720p（約 4Mbps）
ffmpeg -i input.mov -vf "scale=-2:720" -c:v libx264 -preset slow -b:v 4M -maxrate 5M -bufsize 8M \
  -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart opening-720p.mp4

# 1080p（約 8Mbps）
ffmpeg -i input.mov -vf "scale=-2:1080" -c:v libx264 -preset slow -b:v 8M -maxrate 10M -bufsize 16M \
  -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart opening-1080p.mp4
```

プロフィールムービーは 720p だけで可。`-movflags +faststart` を付けないと、再生開始やシークが遅くなる。

### 本番の R2 バインディングを確認する手順

1. push 後、Cloudflare ダッシュボード → Workers & Pages → `wedding-admin` → Deployments で最新のデプロイが成功していること
2. Settings → Bindings に **R2 bucket `MEDIA` → `wedding-media`** があること
3. R2 → `wedding-media` が存在し、Settings → Public access が無効（公開ドメインなし）であること
4. 管理画面 → Movies で小さい MP4 をアップロードし、R2 → `wedding-media` → Objects に `movies/<slug>/720p.mp4` ができること

# wedding-admin

結婚式の管理画面（https://wedding-admin.forest-mm.com/）。Cloudflare Workers（Static Assets + Worker）で配信し、
`main` への push で自動デプロイされる。データは Supabase（ゲスト向けサイト wedding-invitation と同じプロジェクト）。

```
public/          管理画面（index.html・app.js・style.css）と受付（reception/）など
  modes.js       公開設定・Movies・ギフト＆感想のタブ（00_spec/06_modes_admin.md）
  modes-logic.js 上のタブの画面に依存しない計算（公開モードの判定はゲスト側 Worker と同じ規則）
  marche-items.json  Gift Marché の品名（wedding-invitation の guide.ja.json の marche のコピー）
src/worker.js    Worker。/r/*（受付の短縮URL）、/api/reception/*、/api/media/*（ムービーの R2）
supabase/migrations/  本番に適用する SQL（適用済みのものは docs/archive/migrations/ へ移す）
tests/           npm test
00_spec/         仕様書
```

## ローカル開発

```
npm test                        # Worker と計算ロジックのテスト
npx wrangler dev --local        # http://localhost:8787（R2 はローカルのエミュレーション）
```

## マイグレーションの適用（06 公開モード・Movies・ギフト＆感想）

1. Supabase ダッシュボード → SQL Editor → New query
2. `supabase/migrations/20261007_modes_movies_feedback.sql` の中身を貼り付けて Run
   （管理画面とゲスト側の両方に必要な変更をまとめてある。何度実行しても同じ結果になる）
3. Table Editor で `site_modes`（3 行）・`movies`（3 行）・`gift_feedback`（0 行）ができていること、
   `app_settings` に `site_mode_override` の行があることを確認
4. 適用したら SQL ファイルを `docs/archive/migrations/` へ移す

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

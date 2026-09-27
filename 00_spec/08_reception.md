# 受付機能（/reception）仕様 — wedding-admin

## 概要
管理画面（wedding-admin.forest-mm.com、Cloudflare Workers + Static Assets）に当日受付用の `/reception/` を追加する。
`/reception/` 配下は「管理者ログイン（既存の Supabase Auth + ADMIN_EMAILS）」または「受付トークン」のどちらでもアクセスできる。
受付トークンでアクセスした端末が他の管理ページを開いた場合は「権限不足」画面を表示する。

## 前提
- Supabase の SQL（guests.reception_id / checked_in_at / checked_in_by、reception_tokens、reception_items）は適用済み（schema.sql 参照）
- Worker Secret（`wrangler secret put` で登録）
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RECEPTION_COOKIE_SECRET`（HMAC 署名用、32 バイト以上のランダム値）
- Worker Vars（wrangler.toml）
  - `SUPABASE_URL`、`SUPABASE_ANON_KEY`
  - `ADMIN_EMAILS`（カンマ区切り）。空のときは `ADMIN_EMAIL_DOMAIN`（forest-mm.com）のメールを管理者とみなす
- wrangler.toml の assets に `run_worker_first = ["/r/*", "/api/*"]`。それ以外のパスは静的ファイル

## 実装ファイル
| 役割 | ファイル |
|---|---|
| Worker（短縮URL・API） | `src/worker.js` |
| 受付画面 | `public/reception/index.html`、`reception.js`、`reception.css` |
| 管理画面（トークン発行・ゲスト一覧・ダッシュボード・権限不足画面） | `public/app.js`、`public/index.html`、`public/style.css` |

## 1. 短縮URLとトークン
- 形式：`https://wedding-admin.forest-mm.com/r/<code>`
- code は 8 文字。紛らわしい文字（0 O 1 l I）を除いた英数字から `crypto.getRandomValues` で生成し、管理画面の「受付トークン」タブで発行する（reception_tokens に insert）
- `GET /r/:code`
  1. reception_tokens を code で検索し、`is_active = true` かつ（`expires_at` が null または未来）であることを確認
  2. 有効なら Cookie `rcpt` を発行して `/reception/` へ 302
     - 値：`<token_id>.<exp(unix秒)>.<HMAC-SHA256署名(base64url)>`
     - 属性：HttpOnly, Secure, SameSite=Lax, Path=/
     - Max-Age：expires_at まで。expires_at が null の場合は 7 日
  3. 無効なら「このリンクは現在ご利用いただけません」ページ（404）
- トークンは使い捨てにしない（LINE のリンクプレビューで消費されるのを防ぐ）

## 2. API 認証（/api/reception/*）
次のどちらかを満たせば許可する。
- A. Cookie `rcpt` の署名と exp が正しく、DB を再照会して `is_active = true` かつ期限内である（無効化を即時反映するため毎リクエストで確認）。`last_used_at` は最長 1 分に 1 回だけ更新する
- B. `Authorization: Bearer <Supabase access token>` を Supabase Auth（`/auth/v1/user`）で検証し、メールが ADMIN_EMAILS（または ADMIN_EMAIL_DOMAIN）に含まれる

操作者名（checked_in_by / handed_by）は、A ではトークンの label、B では `admin:<メール>`。
DB アクセスはすべてサービスロールキー。全レスポンスに `Cache-Control: no-store`、`X-Robots-Tag: noindex`。

## 3. API
| メソッド・パス | 内容 |
|---|---|
| `GET /api/reception/me` | `{ ok: true, via: "token" \| "admin", label }`。認証がなければ 401 |
| `GET /api/reception/guests` | 全ゲスト（削除済みを除く）。項目：id、reception_id、氏名（漢字・ローマ字）、卓・席（配席があれば）、checked_in_at / checked_in_by、items: [{ id, label, note, handed_at, handed_by, sort }]。メール・連絡先・メッセージ・アレルギーなどは含めない（列を指定して取得） |
| `POST /api/reception/checkin` | `{ guest_id, undo? }`。checked_in_at / checked_in_by を設定。undo で null に戻す |
| `POST /api/reception/items/:id/hand` | `{ undo? }`。handed_at / handed_by を設定。undo で null に戻す |

卓・席は、招待者に紐付いた有効な回答の本人（reply_people idx=0）の seating_assignments、無ければ未回答の仮配席（person_type='guest'）から引く。

## 4. 受付画面 /reception/
- 既存の管理画面のテーマ（色・書体）に合わせる。スマホ・タブレット縦持ちを優先
- 静的 HTML にはゲストデータを含めない。表示するデータはすべて API から取得
- 起動時：Supabase セッションがあれば Bearer 付きで、なければ Cookie で `/api/reception/me` を呼ぶ。401 なら「受付用リンクから開いてください」
- 上部：検索欄（大きめ。5 桁の数字なら受付 ID の完全一致、それ以外は氏名（漢字・ローマ字）の部分一致）、カウンター「受付済 x / y」、操作者ラベル
- ゲストカード：受付 ID（大きく）、氏名、卓・席、お渡し物（各項目に「お渡し済」トグル。未渡しは黄色で強調）、「受付」ボタン（押すと緑になり受付時刻と操作者を表示。取り消しは確認ダイアログ）
- お渡し物が未渡しのまま受付済にしようとしたら「お渡し物があります」と確認
- 10 秒ごとに再取得して複数端末を同期（未送信の操作がある人はサーバー値で上書きしない）
- 通信失敗時はカードに「未送信」を表示し、5 秒ごとに自動で再送。401 になったら受付用リンクの案内に戻る
- フィルタ：すべて / 未受付 / お渡し物あり。並びは未受付が先、受付 ID 順

## 5. 権限不足画面
既存の管理ページ（/reception 以外）の起動時の判定：
- Supabase セッションがある → 従来どおり表示（データは RLS の authenticated ポリシーで保護）
- セッションがなく、`/api/reception/me` が via: "token" を返す → 「このページを表示する権限がありません」と受付画面へのリンクのみ（ログインフォームは出さない）
- どちらでもない → 従来どおりログイン画面

## 6. 管理画面への追加
- タブ「受付トークン」：ラベルと期限（既定 2026-09-26 23:59、無期限も可）で発行。一覧にラベル・短縮URL（コピー）・QR・有効/無効トグル・期限・最終利用・発行日・削除
- ゲスト一覧：「受付」列（受付 ID・受付済/未受付・お渡し物の残数）。検索欄で受付 ID も検索可
- ゲスト編集：「受付でお渡しする物」欄。プリセット（お車代／お礼／その他）＋自由入力の label、note、並び順。追加・削除可。保存時に reception_items を upsert / delete
- ダッシュボード：「当日の受付 x / y 名 受付済」「未渡しのお渡し物 n 件」

## 完了条件
- 無効化したトークンの Cookie では、次の API 呼び出しから 401 になる（毎リクエストで DB を再照会）
- トークン端末で /reception 以外を開くと権限不足画面になる
- 管理者ログインでも /reception を使える（Bearer で via: "admin"）
- `/api/reception/guests` のレスポンスにメールや連絡先が含まれない（Worker が列を限定して取得）

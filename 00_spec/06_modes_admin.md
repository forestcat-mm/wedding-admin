# 06 公開モード・Movies・ギフト＆感想 — 管理画面側（wedding-admin）

ゲスト側（wedding-invitation）の対になる仕様は `06_modes_guest.md`。**こちらを先に実装**し、マイグレーションを本番に適用してからゲスト側に進む。
このファイルは `00_spec/06_modes_admin.md`。

## 目的
1. ゲスト向けサイトの「公開モード」（期間＋機能の ON/OFF）を管理画面から設定できるようにする
2. 当日上映したムービーを管理画面でアップロード・管理し、ゲスト側で配信できるようにする
3. ゲストからの「受け取ったギフト」と「ひとこと」を一覧・集計できるようにする

---

## 1. DB マイグレーション（`supabase/migrations/2026xxxx_modes_movies_feedback.sql` として作成し、内容を報告してから本番に適用）

```sql
-- 1-1 公開モード
create table if not exists public.site_modes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,            -- invitation / wedding / after（自由追加可、英小文字・ハイフン）
  name        text not null,                   -- 表示名（例：招待状）
  starts_at   timestamptz not null,
  ends_at     timestamptz,                     -- null = 次のモード開始まで／最後なら無期限
  features    jsonb not null default '{}'::jsonb,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- features のキー（真偽値）：rsvp, guide, story, seating, menu, marche, movies, thanks, photo

-- 1-2 手動固定（既存 app_settings があればそこに key='site_mode_override' で保存。無ければ以下）
create table if not exists public.site_mode_override (
  id          integer primary key default 1 check (id = 1),
  mode_id     uuid references public.site_modes(id) on delete set null,  -- null = 自動判定
  note        text,
  updated_at  timestamptz not null default now()
);
insert into public.site_mode_override (id) values (1) on conflict do nothing;

-- 1-3 ムービー
create table if not exists public.movies (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,           -- opening / profile / endroll …
  title_ja     text not null,
  title_zh     text,
  note_ja      text,
  note_zh      text,
  sort         integer not null default 0,
  visible      boolean not null default true,
  poster_key   text,                           -- R2 キー（movies/<slug>/poster.jpg）
  duration_sec integer,
  variants     jsonb not null default '[]'::jsonb,  -- [{label:'720p', key, bytes, width, height, content_type}]
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
insert into public.movies (slug, title_ja, title_zh, note_ja, note_zh, sort) values
 ('opening','オープニングムービー','开场影片','披露宴の幕開けに流したムービー。楽曲もふたりの自作です。','婚宴开场播放的影片，音乐也是我们自己创作的。',1),
 ('profile','プロフィールムービー','成长影片','ふたりの生い立ちと、出会ってからの歩み。','我们的成长经历，以及相遇之后的点滴。',2),
 ('endroll','エンドロール','片尾影片','本日の感謝を込めて。※Web公開用に音楽を差し替えています','满怀今日的感谢。※网络版已更换背景音乐',3)
on conflict (slug) do nothing;

-- 1-4 ギフト受取＆感想
create table if not exists public.gift_feedback (
  id               uuid primary key default gen_random_uuid(),
  reply_person_id  uuid references public.reply_people(id) on delete set null,
  guest_name       text not null,               -- 表示名（候補から選んだ場合は reply_people の名前）
  email            text,                        -- 自由入力時のみ
  table_label      text,
  hikidemono_id    text,                        -- g01〜g21（guide.ja.json の marche と同じID）
  hikigashi_id     text,                        -- s01〜s10
  message          text check (char_length(message) <= 250),
  lang             text not null default 'ja',
  ip_hash          text,
  user_agent       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists gift_feedback_person_uq on public.gift_feedback(reply_person_id) where reply_person_id is not null;
create index if not exists gift_feedback_created_idx on public.gift_feedback(created_at desc);

-- 1-5 RLS：管理画面（authenticated）は全操作可、anon は不可。Worker は service_role で読み書き
alter table public.site_modes enable row level security;
alter table public.site_mode_override enable row level security;
alter table public.movies enable row level security;
alter table public.gift_feedback enable row level security;
create policy "admin all" on public.site_modes for all to authenticated using (true) with check (true);
create policy "admin all" on public.site_mode_override for all to authenticated using (true) with check (true);
create policy "admin all" on public.movies for all to authenticated using (true) with check (true);
create policy "admin all" on public.gift_feedback for all to authenticated using (true) with check (true);

-- 1-6 updated_at トリガー（既存の関数があれば流用）
```

既定のモード3件も投入（時刻は Asia/Tokyo）：
| slug | name | starts_at | ends_at | features |
|---|---|---|---|---|
| invitation | 招待状 | 2026-06-01 00:00 | 2026-09-26 00:00 | rsvp のみ true |
| wedding | 結婚式 | 2026-09-26 00:00 | 2026-09-27 00:00 | guide, story, seating, menu, marche, photo = true |
| after | 結婚式後 | 2026-09-27 00:00 | 2026-12-31 23:59 | guide, story, movies, thanks, photo = true（menu, seating, marche, rsvp = false） |

---

## 2. R2 バインディング
- バケット `wedding-media`（無ければ wrangler で作成：`npx wrangler r2 bucket create wedding-media`）
- `wrangler.toml` に `[[r2_buckets]] binding = "MEDIA" bucket_name = "wedding-media"`
- 公開ドメインは設定しない（配信はゲスト側 Worker 経由）

---

## 3. 管理画面：新タブ「公開設定」
- 現在の状態を最上部に表示：「現在のモード：結婚式後（自動判定）」または「結婚式後（手動固定）」。公開期間外なら「公開期間外（ゲスト向けは 404）」
- **モード一覧**（並び順 = sort）：各行に 表示名／slug／開始日時／終了日時／機能のチェックボックス9個／削除。行の追加・ドラッグ並べ替え。開始・終了は `datetime-local`、保存時に Asia/Tokyo として解釈
- バリデーション：期間の重なりを警告（保存は可、判定は sort が小さい方を優先）／slug は英小文字・数字・ハイフン／最後のモードの ends_at が null なら「無期限」と表示
- **手動固定**：セレクトで「自動」またはモード名。固定中は赤いバッジ
- **プレビュー**：モードを選ぶと、ゲスト側で表示される入口カード・ナビの一覧をテキストで表示（どのページが開くか一目で分かる）
- 保存のたびに `/api/config` の反映に最大60秒かかる旨を注記

## 4. 管理画面：新タブ「Movies」
- 一覧（sort 順）：ポスター／タイトル（ja・zh）／説明（ja・zh）／表示 ON/OFF／長さ／バリアント一覧／並べ替え／削除（確認ダイアログ。R2 のファイルも削除）
- **追加**：slug・タイトル入力で空の行を作る
- **アップロード**（バリアントごと、ラベルは 720p／1080p の選択か自由入力）：
  - ブラウザ → 管理画面 Worker の `POST /api/media/init`（key, content_type）→ `PUT /api/media/part?uploadId&partNumber`（本文 = 50MB ずつ）→ `POST /api/media/complete`。R2 のマルチパート API（`MEDIA.createMultipartUpload` / `uploadPart` / `complete`）を使う。全エンドポイントは管理者認証必須
  - キーは `movies/<slug>/<label>.mp4`。完了後、ブラウザ側で `<video>` に読み込んで `duration`・`videoWidth/Height` を取得し、variants と duration_sec を更新
  - 進捗バー、中断時の `abortMultipartUpload`、同じラベルを再アップロードしたら上書き
  - 受け付ける形式は `video/mp4` のみ。1ファイル 2GB まで
- **ポスター**：①画像をアップロード、または②アップロード済み動画をブラウザで再生し「この場面をポスターに」で canvas から JPEG（幅1280）を生成してアップロード。キーは `movies/<slug>/poster.jpg`
- 注記（画面上部）：「動画は事前に手元で変換してください（H.264/AAC、720p 約4Mbps・1080p 約8Mbps、faststart）。プロフィールムービーは 720p のみで可」。README に ffmpeg の例を記載

## 5. 管理画面：新タブ「ギフト＆感想」
- 一覧：日時／お名前／卓／引出物／引菓子／ひとこと／言語。名前・卓・商品で絞り込み、CSV 出力（UTF-8 BOM）
- 集計：引出物・引菓子ごとの件数（商品名は `../wedding-invite/public/guide/content/guide.ja.json` の marche から取得できなければ、同内容の静的 JSON を admin 側にコピーして参照）
- 行をクリックすると、既存の内祝い記録（gifts テーブル）の同じ名前の行へリンク（名前一致で検索、無ければ「未登録」）
- 削除（確認ダイアログ）

## 6. 確認と報告
- マイグレーションの SQL を先に報告 → 承認後に本番適用（Supabase SQL Editor で実行する手順を提示）
- `npx wrangler dev` で：モードの追加・編集・手動固定／Movies の追加・50MB超のファイルのマルチパートアップロード（ローカルは `--local` で R2 エミュレーション）・ポスター生成／ギフト＆感想の一覧と CSV
- 変更ファイル一覧、追加した API 一覧（すべて認証必須であることの確認）を報告。コミットして main に push
- 本番の `wedding-admin` Worker に R2 バインディングが反映されたことをダッシュボードで確認する手順を README に追記

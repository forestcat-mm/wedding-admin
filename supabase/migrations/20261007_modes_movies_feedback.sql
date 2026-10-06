-- ========== 06 公開モード・Movies・ギフト＆感想 ==========
-- 仕様：00_spec/06_modes_admin.md（管理画面）・wedding-invitation 00_spec/06_modes_guest.md（ゲスト側）
-- 管理画面（authenticated）とゲスト側 Worker（service_role）の両方に必要な変更をこの1本にまとめている。
-- Supabase の SQL Editor でそのまま1回実行する。何度実行しても同じ結果になる（既存の行は上書きしない）。

-- 1-1 公開モード
create table if not exists public.site_modes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,            -- invitation / wedding / after（自由追加可、英小文字・数字・ハイフン）
  name        text not null,                   -- 表示名（例：招待状）
  starts_at   timestamptz not null,
  ends_at     timestamptz,                     -- null = 無期限
  features    jsonb not null default '{}'::jsonb,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint site_modes_slug_chk check (slug ~ '^[a-z0-9-]+$'),
  constraint site_modes_features_chk check (jsonb_typeof(features) = 'object')
);
-- features のキー（真偽値）：rsvp, guide, story, seating, menu, marche, movies, thanks, photo。キーが無ければ false

-- 1-2 手動固定：app_settings があるので key='site_mode_override' に保存する（site_mode_override 表は作らない）
--     value = {"mode_id": "<site_modes.id>" | null, "note": "..."}。mode_id が null／存在しない id なら自動判定
insert into public.app_settings (key, value)
values ('site_mode_override', '{"mode_id": null}'::jsonb)
on conflict (key) do nothing;

-- 1-3 ムービー（ファイルは R2 バケット wedding-media の movies/<slug>/ 配下）
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
  updated_at   timestamptz not null default now(),
  constraint movies_slug_chk check (slug ~ '^[a-z0-9-]+$'),
  constraint movies_variants_chk check (jsonb_typeof(variants) = 'array')
);
insert into public.movies (slug, title_ja, title_zh, note_ja, note_zh, sort) values
 ('opening','オープニングムービー','开场影片','披露宴の幕開けに流したムービー。楽曲もふたりの自作です。','婚宴开场播放的影片，音乐也是我们自己创作的。',1),
 ('profile','プロフィールムービー','成长影片','ふたりの生い立ちと、出会ってからの歩み。','我们的成长经历，以及相遇之后的点滴。',2),
 ('endroll','エンドロール','片尾影片','本日の感謝を込めて。※Web公開用に音楽を差し替えています','满怀今日的感谢。※网络版已更换背景音乐',3)
on conflict (slug) do nothing;

-- 1-4 ギフト受取＆感想（ゲスト側 POST /api/thanks が service_role で書き込む）
create table if not exists public.gift_feedback (
  id               uuid primary key default gen_random_uuid(),
  reply_person_id  uuid references public.reply_people(id) on delete set null,
  guest_name       text not null check (char_length(guest_name) between 1 and 60),
  email            text,                        -- 自由入力時のみ
  table_label      text,
  hikidemono_id    text check (hikidemono_id ~ '^g[0-9]{2}$'),   -- guide.ja.json の marche と同じID
  hikigashi_id     text check (hikigashi_id ~ '^s[0-9]{2}$'),
  message          text check (char_length(message) <= 250),
  lang             text not null default 'ja' check (lang in ('ja','zh')),
  ip_hash          text,
  user_agent       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- 1人1行（候補から選んだ人は上書き）。null は何行でも入る。
-- 部分インデックスにすると PostgREST の upsert（on_conflict=reply_person_id）が使えないので、条件なしの unique にする
create unique index if not exists gift_feedback_person_uq on public.gift_feedback(reply_person_id);
create index if not exists gift_feedback_created_idx on public.gift_feedback(created_at desc);

-- 1-5 RLS：管理画面（authenticated）は全操作可、anon は不可。ゲスト側 Worker は service_role（RLS を通らない）
alter table public.site_modes    enable row level security;
alter table public.movies        enable row level security;
alter table public.gift_feedback enable row level security;
drop policy if exists "admin all" on public.site_modes;
drop policy if exists "admin all" on public.movies;
drop policy if exists "admin all" on public.gift_feedback;
create policy "admin all" on public.site_modes    for all to authenticated using (true) with check (true);
create policy "admin all" on public.movies        for all to authenticated using (true) with check (true);
create policy "admin all" on public.gift_feedback for all to authenticated using (true) with check (true);

-- 1-6 updated_at トリガー（既存の touch_updated_at を流用）
drop trigger if exists trg_touch_site_modes on public.site_modes;
drop trigger if exists trg_touch_movies on public.movies;
drop trigger if exists trg_touch_gift_feedback on public.gift_feedback;
create trigger trg_touch_site_modes    before update on public.site_modes    for each row execute function public.touch_updated_at();
create trigger trg_touch_movies        before update on public.movies        for each row execute function public.touch_updated_at();
create trigger trg_touch_gift_feedback before update on public.gift_feedback for each row execute function public.touch_updated_at();

-- 既定のモード3件（時刻は Asia/Tokyo）。同じ slug があれば触らない
insert into public.site_modes (slug, name, starts_at, ends_at, features, sort) values
 ('invitation', '招待状',   '2026-06-01 00:00+09', '2026-09-26 00:00+09',
  '{"rsvp":true,"guide":false,"story":false,"seating":false,"menu":false,"marche":false,"movies":false,"thanks":false,"photo":false}', 1),
 ('wedding',    '結婚式',   '2026-09-26 00:00+09', '2026-09-27 00:00+09',
  '{"rsvp":false,"guide":true,"story":true,"seating":true,"menu":true,"marche":true,"movies":false,"thanks":false,"photo":true}', 2),
 ('after',      '結婚式後', '2026-09-27 00:00+09', '2026-12-31 23:59+09',
  '{"rsvp":false,"guide":true,"story":true,"seating":false,"menu":false,"marche":false,"movies":true,"thanks":true,"photo":true}', 3)
on conflict (slug) do nothing;

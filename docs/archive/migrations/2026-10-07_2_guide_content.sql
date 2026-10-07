-- ========== 07 コンテンツ管理（ゲスト向けサイトの文章・写真） ==========
-- 仕様：00_spec/07_cms_admin.md（管理画面）・wedding-invite 00_spec/07_guest_updates.md（ゲスト側）
-- 管理画面（authenticated）が編集し、ゲスト側 Worker（service_role）が読む。
-- Supabase の SQL Editor でそのまま1回実行する。何度実行しても同じ結果になる（既存の行は触らない）。

create table if not exists public.guide_content (
  id          uuid primary key default gen_random_uuid(),
  section     text not null,        -- greeting / story / marche / menu / movies_text / thanks_text / help / ui
  lang        text not null,        -- ja / zh
  data        jsonb not null default '{}'::jsonb,   -- ゲスト側 guide.<lang>.json の対応キーと同じ構造
  updated_at  timestamptz not null default now(),
  updated_by  text,                 -- 保存した管理者のログインメール
  constraint guide_content_section_lang_uq unique (section, lang),
  constraint guide_content_section_chk check (section ~ '^[a-z0-9_]+$'),
  constraint guide_content_lang_chk check (lang in ('ja','zh')),
  constraint guide_content_data_chk check (jsonb_typeof(data) = 'object')
);

-- RLS：管理画面（authenticated）は全操作可、anon は不可。ゲスト側 Worker は service_role（RLS を通らない）
alter table public.guide_content enable row level security;
drop policy if exists "admin all" on public.guide_content;
create policy "admin all" on public.guide_content for all to authenticated using (true) with check (true);

-- updated_at トリガー（既存の touch_updated_at を流用）
drop trigger if exists trg_touch_guide_content on public.guide_content;
create trigger trg_touch_guide_content before update on public.guide_content for each row execute function public.touch_updated_at();

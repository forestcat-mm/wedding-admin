-- ============================================================
-- wedding-admin スキーマ（実DBに合わせて 2026-09-25 に全面更新）
-- Supabase から出力した実スキーマ（work/db_schema_actual.json）を元に生成。
-- 同じ DB には Photo Toss（wedding-photos）の表（photos / votes / awards / award_photos /
-- live_settings / couple_messages）もあるが、それらはこのファイルの対象外。
--
-- 適用済みのマイグレーション（参考）：
--   docs/archive/migrations/2026-09-25_1_share_lookup_page_title.sql  share_lookup に page_title を追加（2026-09-25 実行済み）
--   docs/archive/migrations/2026-09-25_2_seating_save.sql              seating_save を作成（実行済み）
--   docs/archive/migrations/2026-09-25_4_drop_groom_name.sql           event_settings.groom_name / bride_name を削除（実行済み）
--   sync_rsvp_row / trg_sync_rsvp / mark_superseded / touch_parent_reply の本体は
--   docs/archive/migrations/2026-09-25_3_get_function_defs.sql の結果で差し替える（「要差し替え」と記した箇所）
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 表
-- ============================================================

-- ---------- rsvp ----------
-- 招待状サイト（wedding-invite）が anon で insert する原本。管理画面は読み取りのみ（原本は replies_admin.original に写す）
create table rsvp (
  id                 uuid not null default gen_random_uuid(),
  created_at         timestamptz default now(),
  lang               text not null,
  attending          boolean not null,
  family_name        text not null,
  given_name         text not null,
  family_name_latin  text not null,
  given_name_latin   text not null,
  side               text,
  email              text not null,
  country            text,
  region             text,
  allergy            text,
  dietary            text,
  companions         jsonb not null default '[]'::jsonb,
  message            text,
  needs              text,
  honeypot           text,
  messenger          text,
  photos             jsonb not null default '[]'::jsonb,
  primary key (id),
  constraint rsvp_companions_check CHECK ((jsonb_typeof(companions) = 'array'::text)),
  constraint rsvp_honeypot_check CHECK (((honeypot IS NULL) OR (honeypot = ''::text))),
  constraint rsvp_lang_check CHECK ((lang = ANY (ARRAY['ja'::text, 'zh'::text]))),
  constraint rsvp_photos_check CHECK ((jsonb_typeof(photos) = 'array'::text)),
  constraint rsvp_side_check CHECK ((side = ANY (ARRAY['groom'::text, 'bride'::text])))
);

-- ---------- guests ----------
-- 招待リスト（打診済み）。line_joined / wechat_joined は公式登録、auto_created / source_reply_id は回答から自動作成した招待者
create table guests (
  id                 uuid not null default gen_random_uuid(),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  family_name        text not null,
  given_name         text not null,
  family_name_latin  text,
  given_name_latin   text,
  side               text,
  contact_tool       text,
  messenger_id       text,
  email              text,
  note               text,
  deleted_at         timestamptz,
  delete_reason      text,
  line_joined        boolean not null default false,
  wechat_joined      boolean not null default false,
  auto_created       boolean not null default false,
  source_reply_id    uuid,
  transport_fee      integer not null default 0,
  transport_note     text,
  gift_note          text,
  title              text,
  primary key (id),
  constraint guests_contact_tool_check CHECK ((contact_tool = ANY (ARRAY['line'::text, 'wechat'::text, 'email'::text, 'phone'::text, 'facebook'::text, 'instagram'::text, 'other'::text]))),
  constraint guests_side_check CHECK ((side = ANY (ARRAY['groom'::text, 'bride'::text])))
);

-- ---------- circles ----------
-- 友人圏タグ
create table circles (
  id                 uuid not null default gen_random_uuid(),
  name               text not null,
  created_at         timestamptz default now(),
  primary key (id),
  constraint circles_name_key UNIQUE (name)
);

-- ---------- guest_circles ----------
-- 招待者と友人圏タグの対応
create table guest_circles (
  guest_id           uuid not null,
  circle_id          uuid not null,
  primary key (guest_id, circle_id),
  constraint guest_circles_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
  constraint guest_circles_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE
);

-- ---------- replies_admin ----------
-- 回答の管理用コピー（1送信1行）。姓名列は同期時に rsvp から写す。superseded_by / duplicate_reason は重複回答の判定、source は guest（招待状）／admin（代理入力）
create table replies_admin (
  id                 uuid not null,
  received_at        timestamptz not null,
  lang               text,
  attending          boolean,
  side               text,
  email              text,
  messenger          text,
  country            text,
  region             text,
  message            text,
  needs              text,
  photos             jsonb default '[]'::jsonb,
  original           jsonb not null,
  matched_guest_id   uuid,
  match_type         text,
  admin_note         text,
  deleted_at         timestamptz,
  delete_reason      text,
  updated_at         timestamptz default now(),
  family_name        text,
  given_name         text,
  family_name_latin  text,
  given_name_latin   text,
  superseded_by      uuid,
  duplicate_reason   text,
  source             text not null default 'guest'::text,
  primary key (id),
  constraint replies_admin_match_type_check CHECK ((match_type = ANY (ARRAY['auto'::text, 'manual'::text, 'unlisted'::text]))),
  constraint replies_admin_matched_guest_id_fkey FOREIGN KEY (matched_guest_id) REFERENCES guests(id),
  constraint replies_admin_source_check CHECK ((source = ANY (ARRAY['guest'::text, 'admin'::text]))),
  constraint replies_admin_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES replies_admin(id)
);

-- ---------- reply_people ----------
-- 1人1行（本人 idx=0 ＋同行者）。title は同行者の肩書き（本人は guests.title）
create table reply_people (
  id                 uuid not null default gen_random_uuid(),
  reply_id           uuid,
  idx                integer not null,
  is_companion       boolean not null,
  family_name        text,
  given_name         text,
  family_name_latin  text,
  given_name_latin   text,
  attending          boolean,
  is_child           boolean default false,
  birthdate          date,
  age                integer,
  allergy            text,
  dietary            text,
  deleted_at         timestamptz,
  delete_reason      text,
  updated_at         timestamptz default now(),
  title              text,
  kids_chair         boolean not null default false,
  kid_meal           text,
  primary key (id),
  constraint reply_people_kid_meal_check CHECK (((kid_meal IS NULL) OR (kid_meal = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))),
  constraint reply_people_reply_id_fkey FOREIGN KEY (reply_id) REFERENCES replies_admin(id) ON DELETE CASCADE,
  constraint reply_people_reply_id_idx_key UNIQUE (reply_id, idx),
  constraint reply_people_title_check CHECK (((title IS NULL) OR (title = ANY (ARRAY['御令息'::text, '御令嬢'::text, '令夫人'::text, '令夫君'::text]))))
);

-- ---------- change_log ----------
-- 変更履歴
create table change_log (
  id                 bigserial,
  at                 timestamptz default now(),
  actor              text,
  target_table       text not null,
  target_id          uuid not null,
  action             text not null,
  reason             text not null,
  diff               jsonb,
  primary key (id)
);

-- ---------- share_links ----------
-- 友人圏ごとのシェアページ
create table share_links (
  id                 uuid not null default gen_random_uuid(),
  circle_id          uuid,
  token              text not null,
  password_hash      text not null,
  headline           text,
  show_latin         boolean default true,
  expires_at         date,
  enabled            boolean default true,
  created_at         timestamptz default now(),
  page_title         text,
  primary key (id),
  constraint share_links_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
  constraint share_links_circle_id_key UNIQUE (circle_id),
  constraint share_links_token_key UNIQUE (token)
);

-- ---------- title_options ----------
-- 招待者の肩書きの選択肢（自己定義可）
create table title_options (
  id                 uuid not null default gen_random_uuid(),
  name               text not null,
  sort_order         integer not null default 100,
  primary key (id),
  constraint title_options_name_key UNIQUE (name)
);

-- ---------- budget_settings ----------
-- 予算の前提（1行）
create table budget_settings (
  id                 integer not null default 1,
  adult_mode         text not null default 'auto'::text,
  adult_manual       integer not null default 0,
  child_mode         text not null default 'auto'::text,
  child_manual       integer not null default 0,
  tables_mode        text not null default 'auto'::text,
  tables_manual      integer not null default 0,
  seats_per_table    integer not null default 8,
  hh_mode            text not null default 'auto'::text,
  hh_manual          integer not null default 0,
  gift_per_adult     integer not null default 30000,
  updated_at         timestamptz default now(),
  primary key (id),
  constraint budget_settings_adult_mode_check CHECK ((adult_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
  constraint budget_settings_child_mode_check CHECK ((child_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
  constraint budget_settings_hh_mode_check CHECK ((hh_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
  constraint budget_settings_id_check CHECK ((id = 1)),
  constraint budget_settings_tables_mode_check CHECK ((tables_mode = ANY (ARRAY['auto'::text, 'manual'::text])))
);

-- ---------- budget_items ----------
-- ホテル見積の項目
create table budget_items (
  id                 uuid not null default gen_random_uuid(),
  sort_order         integer not null,
  category           text not null,
  name               text not null,
  kind               text not null,
  unit_price         numeric,
  qty                integer,
  base_qty           integer default 0,
  split              text,
  manual_qty         integer,
  allowance          numeric default 0,
  tax_label          text,
  gift_type          text,
  grp                text,
  note               text,
  paid               boolean not null default false,
  deleted_at         timestamptz,
  updated_at         timestamptz default now(),
  primary key (id),
  constraint budget_items_gift_type_check CHECK ((gift_type = ANY (ARRAY['hikidemono'::text, 'hikigashi'::text]))),
  constraint budget_items_kind_check CHECK ((kind = ANY (ARRAY['fix'::text, 'pp'::text, 'pt'::text, 'man'::text, 'kid'::text, 'cloth'::text, 'cloth0'::text]))),
  constraint budget_items_split_check CHECK ((split = ANY (ARRAY['high'::text, 'low'::text])))
);

-- ---------- budget_external ----------
-- 個別手配分
create table budget_external (
  id                 uuid not null default gen_random_uuid(),
  category           text not null,
  name               text not null,
  vendor             text,
  unit_price         numeric not null default 0,
  qty                integer not null default 0,
  pay_status         text not null default '検討中'::text,
  storage_status     text not null default '—'::text,
  receive_date       date,
  gift_type          text,
  note               text,
  deleted_at         timestamptz,
  updated_at         timestamptz default now(),
  primary key (id),
  constraint budget_external_gift_type_check CHECK ((gift_type = ANY (ARRAY['hikidemono'::text, 'hikigashi'::text]))),
  constraint budget_external_pay_status_check CHECK ((pay_status = ANY (ARRAY['検討中'::text, '予約済（未払）'::text, '支払済'::text]))),
  constraint budget_external_storage_status_check CHECK ((storage_status = ANY (ARRAY['—'::text, '注文済'::text, '自宅保管'::text, 'ホテル預け'::text])))
);

-- ---------- event_settings ----------
-- 基本情報（1行）：両家の姓名・座席表タイトル・卓のグリッド・全体の申し送り
create table event_settings (
  id                 integer not null default 1,
  groom_name_latin   text default 'Takayuki MORI'::text,
  bride_name_latin   text default 'Momoe YOSHINAGA'::text,
  seating_note       text,
  updated_at         timestamptz default now(),
  groom_family       text default '森'::text,
  groom_given        text default '喬由樹'::text,
  bride_family       text default '吉永'::text,
  bride_given        text default '百慧'::text,
  chart_title        text default '両家結婚披露宴御座席表'::text,
  layout_rows        integer default 3,
  layout_cols        integer default 4,
  row_counts         integer[] default '{4,4,2}'::integer[],
  short_row_align    text not null default 'center'::text,
  primary key (id),
  constraint event_settings_id_check CHECK ((id = 1)),
  constraint event_settings_short_row_align_check CHECK ((short_row_align = ANY (ARRAY['left'::text, 'right'::text, 'center'::text, 'ends'::text])))
);

-- ---------- seating_tables ----------
-- 卓。grid_row / grid_col は並び順（sort_order）からアプリが計算して保存時に書く。高砂は卓ではない
create table seating_tables (
  id                 uuid not null default gen_random_uuid(),
  label              text not null,
  capacity           integer not null default 8,
  shape              text not null default 'round'::text,
  x                  numeric not null default 0,
  y                  numeric not null default 0,
  w                  numeric,
  h                  numeric,
  rotation           integer not null default 0,
  memo               text,
  sort_order         integer not null default 0,
  updated_at         timestamptz default now(),
  grid_row           integer,
  grid_col           integer,
  primary key (id),
  constraint seating_tables_capacity_check CHECK (((capacity >= 0) AND (capacity <= 10))),
  constraint seating_tables_shape_check CHECK ((shape = ANY (ARRAY['round'::text, 'rect'::text])))
);
create unique index if not exists seating_grid_unique ON seating_tables (grid_row, grid_col) WHERE (grid_row IS NOT NULL);

-- ---------- seating_assignments ----------
-- 席の割当。1人は1席（person_type, person_id）、卓内の席番号は一意（table_id, seat_index）
create table seating_assignments (
  id                 uuid not null default gen_random_uuid(),
  table_id           uuid not null,
  seat_index         integer,
  person_type        text not null,
  person_id          uuid not null,
  provisional        boolean not null default false,
  updated_at         timestamptz default now(),
  primary key (id),
  constraint seating_assignments_person_type_check CHECK ((person_type = ANY (ARRAY['reply_person'::text, 'guest'::text]))),
  constraint seating_assignments_person_type_person_id_key UNIQUE (person_type, person_id),
  constraint seating_assignments_table_id_fkey FOREIGN KEY (table_id) REFERENCES seating_tables(id) ON DELETE CASCADE
);
create unique index if not exists seating_seat_unique ON seating_assignments (table_id, seat_index) WHERE (seat_index IS NOT NULL);

-- 初期データ
insert into title_options (name, sort_order) values
  ('御尊父様', 10), ('御母堂様', 20), ('令夫人', 30), ('令夫君', 40), ('御令息', 50), ('御令嬢', 60)
on conflict (name) do nothing;
insert into budget_settings (id) values (1) on conflict (id) do nothing;
insert into event_settings (id) values (1) on conflict (id) do nothing;
-- budget_items / budget_external は初期データ投入済み。seating_tables は配席タブを初めて開いたときにアプリが作る。

-- ============================================================
-- 関数
-- ============================================================

-- 名前の正規化（空白を除いて小文字に）
create or replace function norm_name(t text) returns text
language sql immutable as $$
  select lower(regexp_replace(translate(coalesce(t,''), '　 ', ''), '\s', '', 'g'))
$$;

-- updated_at を更新する共通トリガー関数
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- reply_people が変わったら親 replies_admin.updated_at も更新する
-- ※ 要差し替え：実DBの本体は docs/archive/migrations/2026-09-25_3_get_function_defs.sql の結果を貼る
create or replace function touch_parent_reply() returns trigger
language plpgsql as $$
begin
  update replies_admin set updated_at = now() where id = new.reply_id;
  return new;
end $$;

-- 同じ人の以前の回答を superseded_by で古い方に印を付ける（重複回答の判定）
-- ※ 要差し替え：実DBの本体は docs/archive/migrations/2026-09-25_3_get_function_defs.sql の結果を貼る。
--    引数：p_id uuid, p_received timestamptz, p_email text, p_fam text, p_giv text, p_fam_l text, p_giv_l text
-- create or replace function mark_superseded(p_id uuid, p_received timestamptz, p_email text,
--   p_fam text, p_giv text, p_fam_l text, p_giv_l text) returns void
-- language plpgsql security definer as $$ ... $$;

-- rsvp 1行を管理用へ展開（トリガーと取り込みで共用）
-- ※ 要差し替え：以下は旧版。実DBは replies_admin の姓名列も写し、mark_superseded を呼ぶはず
create or replace function sync_rsvp_row(r rsvp) returns void
language plpgsql security definer as $$
declare
  g uuid; n int;
begin
  select count(*), (array_agg(id))[1] into n, g from guests
   where deleted_at is null
     and norm_name(family_name)       = norm_name(r.family_name)
     and norm_name(given_name)        = norm_name(r.given_name)
     and norm_name(family_name_latin) = norm_name(r.family_name_latin)
     and norm_name(given_name_latin)  = norm_name(r.given_name_latin);
  if n <> 1 then g := null; end if;

  insert into replies_admin (id, received_at, lang, attending, side, email, messenger, country, region,
                             message, needs, photos, original, matched_guest_id, match_type)
  values (r.id, r.created_at, r.lang, r.attending, r.side, r.email, r.messenger, r.country, r.region,
          r.message, r.needs, coalesce(r.photos,'[]'), to_jsonb(r),
          g, case when g is null then null else 'auto' end)
  on conflict (id) do nothing;

  insert into reply_people (reply_id, idx, is_companion, family_name, given_name, family_name_latin, given_name_latin,
                            attending, is_child, allergy, dietary)
  values (r.id, 0, false, r.family_name, r.given_name, r.family_name_latin, r.given_name_latin,
          r.attending, false, r.allergy, r.dietary)
  on conflict do nothing;

  insert into reply_people (reply_id, idx, is_companion, family_name, given_name, family_name_latin, given_name_latin,
                            attending, is_child, birthdate, age, allergy, dietary)
  select r.id, ord, true, c->>'family_name', c->>'given_name', c->>'family_name_latin', c->>'given_name_latin',
         r.attending, coalesce((c->>'is_child')::boolean, false),
         nullif(c->>'birthdate','')::date, nullif(c->>'age','')::int, c->>'allergy', c->>'dietary'
  from jsonb_array_elements(coalesce(r.companions,'[]')) with ordinality as t(c, ord)
  on conflict do nothing;
end $$;

-- 新着回答を自動同期
-- ※ 要差し替え：実DBの本体を貼る
create or replace function trg_sync_rsvp() returns trigger
language plpgsql security definer as $$
begin
  perform sync_rsvp_row(new);
  return new;
end $$;

-- シェアページ：パスワードの設定（管理画面から）
create or replace function share_set_password(p_link uuid, p_password text) returns void
language sql security definer as $$
  update share_links set password_hash = crypt(p_password, gen_salt('bf')) where id = p_link
$$;

-- シェアページ：トークンとパスワードで友人圏の回答者一覧を返す（anon から呼ぶ）
-- 内容は docs/archive/migrations/2026-09-25_1_share_lookup_page_title.sql と同じ
create or replace function share_lookup(p_token text, p_password text)
returns table (family_name text, given_name text, family_name_latin text, given_name_latin text,
               attending boolean, circle_name text, headline text, show_latin boolean,
               page_title text)
language plpgsql security definer as $$
declare l share_links; c circles;
begin
  select * into l from share_links
   where token = p_token and enabled and (expires_at is null or expires_at >= current_date);
  if l.id is null or l.password_hash <> crypt(p_password, l.password_hash) then
    raise exception 'invalid' using errcode = '28000';
  end if;
  select * into c from circles where id = l.circle_id;
  return query
    select p.family_name, p.given_name, p.family_name_latin, p.given_name_latin, p.attending,
           c.name, l.headline, l.show_latin, l.page_title
    from replies_admin ra
    join reply_people p on p.reply_id = ra.id and p.idx = 0 and p.deleted_at is null
    join guest_circles gc on gc.guest_id = ra.matched_guest_id and gc.circle_id = l.circle_id
    where ra.deleted_at is null
      and ra.superseded_by is null
      and ra.attending is not null
    order by p.attending desc, p.family_name_latin, p.given_name_latin;
end $$;

-- 配席の編集モードの「保存」（1トランザクション・同時編集の検知）
-- 内容は docs/archive/migrations/2026-09-25_2_seating_save.sql と同じ


create or replace function seating_save(
  p_since_tables timestamptz, p_since_asg timestamptz, p_since_ev timestamptz,
  p_del_tables uuid[], p_tables jsonb, p_moved_tables uuid[],
  p_del_asg uuid[], p_asg jsonb, p_moved_asg uuid[],
  p_ev jsonb,
  p_since_asg_count int default null
) returns void language plpgsql security definer as $$
begin
  if (select coalesce(max(updated_at), '-infinity'::timestamptz) from seating_tables) > coalesce(p_since_tables, '-infinity'::timestamptz)
     or (select coalesce(max(updated_at), '-infinity'::timestamptz) from seating_assignments) > coalesce(p_since_asg, '-infinity'::timestamptz)
     or (select coalesce(updated_at, '-infinity'::timestamptz) from event_settings where id = 1) > coalesce(p_since_ev, '-infinity'::timestamptz)
     or (p_since_asg_count is not null and (select count(*) from seating_assignments) <> p_since_asg_count) then
    raise exception 'seating_conflict' using errcode = '40001';
  end if;

  delete from seating_assignments where id = any(coalesce(p_del_asg, '{}'));
  delete from seating_tables where id = any(coalesce(p_del_tables, '{}'));

  update seating_tables set grid_row = null, grid_col = null where id = any(coalesce(p_moved_tables, '{}'));
  insert into seating_tables (id, label, capacity, shape, x, y, w, h, rotation, memo, sort_order, grid_row, grid_col)
  select r.id, r.label, r.capacity, r.shape, coalesce(r.x, 0), coalesce(r.y, 0), r.w, r.h, coalesce(r.rotation, 0), r.memo,
         coalesce(r.sort_order, 0), r.grid_row, r.grid_col
  from jsonb_to_recordset(coalesce(p_tables, '[]')) as r(id uuid, label text, capacity int, shape text, x numeric, y numeric,
         w numeric, h numeric, rotation int, memo text, sort_order int, grid_row int, grid_col int)
  on conflict (id) do update set
    label = excluded.label, capacity = excluded.capacity, shape = excluded.shape, x = excluded.x, y = excluded.y,
    w = excluded.w, h = excluded.h, rotation = excluded.rotation, memo = excluded.memo, sort_order = excluded.sort_order,
    grid_row = excluded.grid_row, grid_col = excluded.grid_col, updated_at = now();

  update seating_assignments set seat_index = null where id = any(coalesce(p_moved_asg, '{}'));
  insert into seating_assignments (id, table_id, seat_index, person_type, person_id, provisional)
  select r.id, r.table_id, r.seat_index, r.person_type, r.person_id, coalesce(r.provisional, false)
  from jsonb_to_recordset(coalesce(p_asg, '[]')) as r(id uuid, table_id uuid, seat_index int, person_type text, person_id uuid, provisional boolean)
  on conflict (id) do update set
    table_id = excluded.table_id, seat_index = excluded.seat_index, person_type = excluded.person_type,
    person_id = excluded.person_id, provisional = excluded.provisional, updated_at = now();

  if p_ev is not null then
    update event_settings set
      seating_note = case when p_ev ? 'seating_note' then p_ev->>'seating_note' else seating_note end,
      layout_rows  = case when p_ev ? 'layout_rows'  then (p_ev->>'layout_rows')::int else layout_rows end,
      layout_cols  = case when p_ev ? 'layout_cols'  then (p_ev->>'layout_cols')::int else layout_cols end,
      row_counts   = case when p_ev ? 'row_counts'   then (select array_agg(v::int) from jsonb_array_elements_text(p_ev->'row_counts') v) else row_counts end,
      short_row_align = case when p_ev ? 'short_row_align' then p_ev->>'short_row_align' else short_row_align end,
      updated_at   = now()
    where id = 1;
  end if;
end $$;


-- rls_auto_enable()：新しい表に自動で RLS を有効にするイベントトリガー用の関数（Supabase 側で作成済み。本体は未確認）

-- ============================================================
-- トリガー
-- ============================================================

create trigger trg_touch_be before update on budget_external for each row execute function touch_updated_at();
create trigger trg_touch_bi before update on budget_items for each row execute function touch_updated_at();
create trigger trg_touch_bs before update on budget_settings for each row execute function touch_updated_at();
create trigger trg_touch_es before update on event_settings for each row execute function touch_updated_at();
create trigger trg_touch_guests before update on guests for each row execute function touch_updated_at();
create trigger trg_touch_replies before update on replies_admin for each row execute function touch_updated_at();
create trigger trg_touch_parent after insert on reply_people for each row execute function touch_parent_reply();
create trigger trg_touch_parent after update on reply_people for each row execute function touch_parent_reply();
create trigger trg_touch_people before update on reply_people for each row execute function touch_updated_at();
create trigger trg_sync_rsvp after insert on rsvp for each row execute function trg_sync_rsvp();
create trigger trg_touch_sa before update on seating_assignments for each row execute function touch_updated_at();
create trigger trg_touch_st before update on seating_tables for each row execute function touch_updated_at();

-- 既存の回答を取り込み（初回のみ）
do $$
declare r rsvp;
begin
  for r in select * from rsvp where id not in (select id from replies_admin) loop
    perform sync_rsvp_row(r);
  end loop;
end $$;

-- ============================================================
-- RLS
-- ============================================================

alter table rsvp                 enable row level security;
alter table guests               enable row level security;
alter table circles              enable row level security;
alter table guest_circles        enable row level security;
alter table replies_admin        enable row level security;
alter table reply_people         enable row level security;
alter table change_log           enable row level security;
alter table share_links          enable row level security;
alter table title_options        enable row level security;
alter table budget_settings      enable row level security;
alter table budget_items         enable row level security;
alter table budget_external      enable row level security;
alter table event_settings       enable row level security;
alter table seating_tables       enable row level security;
alter table seating_assignments  enable row level security;

create policy "admin all" on budget_external for all to authenticated using (true) with check (true);
create policy "admin all" on budget_items for all to authenticated using (true) with check (true);
create policy "admin all" on budget_settings for all to authenticated using (true) with check (true);
create policy "admin all" on change_log for all to authenticated using (true) with check (true);
create policy "admin all" on circles for all to authenticated using (true) with check (true);
create policy "admin all" on event_settings for all to authenticated using (true) with check (true);
create policy "admin all" on guest_circles for all to authenticated using (true) with check (true);
create policy "admin all" on guests for all to authenticated using (true) with check (true);
create policy "admin all" on replies_admin for all to authenticated using (true) with check (true);
create policy "admin all" on reply_people for all to authenticated using (true) with check (true);
create policy "admin read" on rsvp for select to authenticated using (true);
create policy "insert only" on rsvp for insert to anon with check (true);
create policy "admin all" on seating_assignments for all to authenticated using (true) with check (true);
create policy "admin all" on seating_tables for all to authenticated using (true) with check (true);
create policy "admin all" on share_links for all to authenticated using (true) with check (true);
create policy "admin all" on title_options for all to authenticated using (true) with check (true);
create policy "admin read photos" on storage.objects for select to authenticated using ((bucket_id = 'rsvp-photos'::text));
create policy "anon upload photos" on storage.objects for insert to anon with check ((bucket_id = 'rsvp-photos'::text));

-- ============================================================
-- 関数の実行権限（2026-09-25 締め直し済み）
-- 内部関数（トリガー用・同期用）は anon / authenticated から実行できない。
-- anon から呼べるのは share_lookup と norm_name だけ。
-- ============================================================
revoke all on function norm_name(text) from public;
grant execute on function norm_name(text) to anon, authenticated;

revoke all on function touch_updated_at() from public, anon, authenticated;
revoke all on function touch_parent_reply() from public, anon, authenticated;
revoke all on function sync_rsvp_row(rsvp) from public, anon, authenticated;
revoke all on function trg_sync_rsvp() from public, anon, authenticated;
revoke all on function mark_superseded(uuid, timestamptz, text, text, text, text, text) from public, anon, authenticated;
revoke all on function rls_auto_enable() from public, anon, authenticated;

revoke all on function share_set_password(uuid, text) from public, anon;
grant execute on function share_set_password(uuid, text) to authenticated;

revoke all on function share_lookup(text, text) from public;
grant execute on function share_lookup(text, text) to anon, authenticated;

revoke all on function seating_save(timestamptz, timestamptz, timestamptz, uuid[], jsonb, uuid[], uuid[], jsonb, uuid[], jsonb, int) from public, anon;
grant execute on function seating_save(timestamptz, timestamptz, timestamptz, uuid[], jsonb, uuid[], uuid[], jsonb, uuid[], jsonb, int) to authenticated;

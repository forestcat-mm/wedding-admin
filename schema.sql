-- ========== 拡張 ==========
create extension if not exists pgcrypto;

-- ========== 招待リスト ==========
create table guests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  family_name text not null,
  given_name text not null,
  family_name_latin text,
  given_name_latin text,
  side text check (side in ('groom','bride')),
  contact_tool text check (contact_tool in ('line','wechat','email','phone')),
  messenger_id text,
  email text,
  note text,
  deleted_at timestamptz,
  delete_reason text
);

-- ========== 友人圏タグ ==========
create table circles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);
create table guest_circles (
  guest_id uuid references guests(id) on delete cascade,
  circle_id uuid references circles(id) on delete cascade,
  primary key (guest_id, circle_id)
);

-- ========== 回答の管理用コピー（1送信1行） ==========
create table replies_admin (
  id uuid primary key,
  received_at timestamptz not null,
  lang text,
  attending boolean,
  side text,
  email text,
  messenger text,
  country text,
  region text,
  message text,
  needs text,
  photos jsonb default '[]',
  original jsonb not null,
  matched_guest_id uuid references guests(id),
  match_type text check (match_type in ('auto','manual','unlisted')),
  admin_note text,
  deleted_at timestamptz,
  delete_reason text,
  updated_at timestamptz default now()
);

-- ========== 1人1行（本人＋同行者） ==========
create table reply_people (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid references replies_admin(id) on delete cascade,
  idx int not null,
  is_companion boolean not null,
  family_name text, given_name text,
  family_name_latin text, given_name_latin text,
  attending boolean,
  is_child boolean default false,
  birthdate date,
  age int,
  allergy text,
  dietary text,
  deleted_at timestamptz,
  delete_reason text,
  updated_at timestamptz default now(),
  unique (reply_id, idx)
);

-- ========== 変更履歴 ==========
create table change_log (
  id bigserial primary key,
  at timestamptz default now(),
  actor text,
  target_table text not null,
  target_id uuid not null,
  action text not null,
  reason text not null,
  diff jsonb
);

-- ========== シェアページ ==========
create table share_links (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references circles(id) on delete cascade unique,
  token text not null unique,
  password_hash text not null,
  headline text,
  show_latin boolean default true,
  expires_at date,
  enabled boolean default true,
  created_at timestamptz default now()
);

-- ========== 名前の正規化 ==========
create or replace function norm_name(t text) returns text
language sql immutable as $$
  select lower(regexp_replace(translate(coalesce(t,''), '　 ', ''), '\s', '', 'g'))
$$;

-- ========== rsvp 1行を管理用へ展開（トリガーと取り込みで共用） ==========
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
create or replace function trg_sync_rsvp() returns trigger
language plpgsql security definer as $$
begin
  perform sync_rsvp_row(new);
  return new;
end $$;
drop trigger if exists trg_sync_rsvp on rsvp;
create trigger trg_sync_rsvp after insert on rsvp
for each row execute function trg_sync_rsvp();

-- 既存の回答を取り込み
do $$
declare r rsvp;
begin
  for r in select * from rsvp where id not in (select id from replies_admin) loop
    perform sync_rsvp_row(r);
  end loop;
end $$;

-- ========== RLS ==========
alter table guests        enable row level security;
alter table circles       enable row level security;
alter table guest_circles enable row level security;
alter table replies_admin enable row level security;
alter table reply_people  enable row level security;
alter table change_log    enable row level security;
alter table share_links   enable row level security;

create policy "admin all" on guests        for all to authenticated using (true) with check (true);
create policy "admin all" on circles       for all to authenticated using (true) with check (true);
create policy "admin all" on guest_circles for all to authenticated using (true) with check (true);
create policy "admin all" on replies_admin for all to authenticated using (true) with check (true);
create policy "admin all" on reply_people  for all to authenticated using (true) with check (true);
create policy "admin all" on change_log    for all to authenticated using (true) with check (true);
create policy "admin all" on share_links   for all to authenticated using (true) with check (true);

-- 招待状の原本は読み取りのみ
create policy "admin read" on rsvp for select to authenticated using (true);

-- ゲスト写真はログイン済みのみ閲覧可
create policy "admin read photos" on storage.objects for select to authenticated
  using (bucket_id = 'rsvp-photos');

-- ========== シェアページ用関数 ==========
create or replace function share_set_password(p_link uuid, p_password text) returns void
language sql security definer as $$
  update share_links set password_hash = crypt(p_password, gen_salt('bf')) where id = p_link
$$;
revoke all on function share_set_password(uuid,text) from public;
grant execute on function share_set_password(uuid,text) to authenticated;

create or replace function share_lookup(p_token text, p_password text)
returns table (family_name text, given_name text, family_name_latin text, given_name_latin text,
               attending boolean, circle_name text, headline text, show_latin boolean)
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
           c.name, l.headline, l.show_latin
    from replies_admin ra
    join reply_people p on p.reply_id = ra.id and p.idx = 0 and p.deleted_at is null
    join guest_circles gc on gc.guest_id = ra.matched_guest_id and gc.circle_id = l.circle_id
    where ra.deleted_at is null and ra.attending is not null
    order by p.attending desc, p.family_name_latin, p.given_name_latin;
end $$;
revoke all on function share_lookup(text,text) from public;
grant execute on function share_lookup(text,text) to anon, authenticated;

-- ========== 予算（2026-09-11 追加） ==========
alter table guests
  add column if not exists transport_fee integer not null default 0,
  add column if not exists transport_note text,
  add column if not exists gift_note text;

create table budget_settings (
  id int primary key default 1 check (id = 1),
  adult_mode text not null default 'auto' check (adult_mode in ('auto','manual')),
  adult_manual int not null default 0,
  child_mode text not null default 'auto' check (child_mode in ('auto','manual')),
  child_manual int not null default 0,
  tables_mode text not null default 'auto' check (tables_mode in ('auto','manual')),
  tables_manual int not null default 0,
  seats_per_table int not null default 8,
  hh_mode text not null default 'auto' check (hh_mode in ('auto','manual')),
  hh_manual int not null default 0,
  gift_per_adult int not null default 30000,
  updated_at timestamptz default now()
);

create table budget_items (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null,
  category text not null,
  name text not null,
  kind text not null check (kind in ('fix','pp','pt','man','kid','cloth','cloth0')),
  unit_price numeric,
  qty int,
  base_qty int default 0,
  split text check (split in ('high','low')),
  manual_qty int,
  allowance numeric default 0,
  tax_label text,
  gift_type text check (gift_type in ('hikidemono','hikigashi')),
  grp text,
  note text,
  paid boolean not null default false,
  deleted_at timestamptz,
  updated_at timestamptz default now()
);

create table budget_external (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  vendor text,
  unit_price numeric not null default 0,
  qty int not null default 0,
  pay_status text not null default '検討中' check (pay_status in ('検討中','購入済（未払）','支払済')),
  storage_status text not null default '—' check (storage_status in ('—','注文済','自宅保管','ホテル預け')),
  receive_date date,
  gift_type text check (gift_type in ('hikidemono','hikigashi')),
  note text,
  deleted_at timestamptz,
  updated_at timestamptz default now()
);
-- RLS: 3テーブルとも authenticated に全操作を許可（policy "admin all"）
-- budget_settings は id=1 の1行のみ（投入済み）。budget_items / budget_external は初期データ投入済み。
-- ========== 肩書き・お子様椅子・お子様メニュー（2026-09-18 追加） ==========
-- 肩書きの選択肢（招待者用。ゲスト一覧の「招待者情報」タブから自己定義を追加できる）
create table if not exists title_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 100,
  created_at timestamptz default now()
);
insert into title_options (name, sort_order) values
  ('御尊父様', 10), ('御母堂様', 20), ('令夫人', 30), ('令夫君', 40),
  ('御令息', 50), ('御令嬢', 60)
on conflict (name) do nothing;

alter table title_options enable row level security;
drop policy if exists "admin all" on title_options;
create policy "admin all" on title_options for all to authenticated using (true) with check (true);

-- 招待者の肩書き（空＝なし）
alter table guests
  add column if not exists title text;

-- 同行者の肩書き・お子様椅子・お子様メニュー
alter table reply_people
  add column if not exists title text,
  add column if not exists kids_chair boolean not null default false,
  add column if not exists kid_meal text;

alter table reply_people drop constraint if exists reply_people_kid_meal_check;
alter table reply_people
  add constraint reply_people_kid_meal_check check (kid_meal is null or kid_meal in ('A','B','C'));

-- 配席：卓ごとの席番号は一意（卓の入れ替え・定員変更はこの前提で書かれている）
create unique index if not exists seating_assignments_seat_uniq
  on seating_assignments (table_id, seat_index) where seat_index is not null;

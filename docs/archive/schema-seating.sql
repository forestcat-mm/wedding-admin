-- 卓
create table seating_tables (
  id uuid primary key default gen_random_uuid(),
  label text not null,                 -- 卓名（例：A, B, 1, 2, 高砂）
  capacity int not null default 8,
  shape text not null default 'round' check (shape in ('round','rect','head')),
  x numeric not null default 0,        -- レイアウト座標（%）
  y numeric not null default 0,
  w numeric, h numeric,                -- rect のサイズ（%）。round は capacity から自動
  rotation int not null default 0,
  memo text,                           -- 配席メモ
  sort_order int not null default 0,
  updated_at timestamptz default now()
);

-- 席（人の割当）
create table seating_assignments (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references seating_tables(id) on delete cascade,
  seat_index int,                      -- 卓内の位置（null=順不同）
  person_type text not null check (person_type in ('reply_person','guest')),
  person_id uuid not null,             -- reply_people.id（回答あり）または guests.id（未回答の仮配席）
  provisional boolean not null default false,  -- 未回答の仮配席
  updated_at timestamptz default now(),
  unique (person_type, person_id)      -- 1人は1席
);

create trigger trg_touch_st before update on seating_tables      for each row execute function touch_updated_at();
create trigger trg_touch_sa before update on seating_assignments for each row execute function touch_updated_at();

alter table seating_tables      enable row level security;
alter table seating_assignments enable row level security;
create policy "admin all" on seating_tables      for all to authenticated using (true) with check (true);
create policy "admin all" on seating_assignments for all to authenticated using (true) with check (true);
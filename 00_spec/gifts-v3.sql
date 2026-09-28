-- ========== ご祝儀 v3：出欠表示・内祝い不要（引出物お渡し済）・引出物記録・品物の相当額 ==========
-- 前提：gifts-v2.sql 適用済み

-- 1. 披露宴の出欠（attended＝出席／absent＝欠席の招待客／uninvited＝招待なし）
alter table public.gifts
  add column if not exists attendance      text,
  add column if not exists return_policy   text,      -- needed＝内祝い必要／hikidemono＝不要（引出物お渡し済）／not_needed＝不要（その他）
  add column if not exists goods_value_jpy integer;   -- 品物の相当額（ご祝儀の合計・予算には入れない）

update public.gifts g set attendance = case
    when g.source = 'attendee' then 'attended'
    when exists (select 1 from public.gift_givers gg where gg.gift_id = g.id and gg.guest_id is not null) then 'absent'
    else 'uninvited' end
where attendance is null;

update public.gifts set return_policy = case
    when attendance = 'attended' then 'hikidemono'
    when return_needed = false then 'not_needed'
    else 'needed' end
where return_policy is null;

alter table public.gifts
  alter column attendance    set not null,
  alter column attendance    set default 'uninvited',
  alter column return_policy set not null,
  alter column return_policy set default 'needed';

alter table public.gifts drop constraint if exists gifts_attendance_chk;
alter table public.gifts drop constraint if exists gifts_return_policy_chk;
alter table public.gifts
  add constraint gifts_attendance_chk    check (attendance in ('attended','absent','uninvited')),
  add constraint gifts_return_policy_chk check (return_policy in ('needed','hikidemono','not_needed'));

-- return_needed は return_policy に置き換え
alter table public.gifts drop column if exists return_needed;

-- 2. お渡しした引出物・引菓子（1つのご祝儀に複数行）
create table if not exists public.gift_hikidemono (
  id                 uuid primary key default gen_random_uuid(),
  gift_id            uuid not null references public.gifts(id) on delete cascade,
  gift_check_item_id uuid,                               -- 引出物・引菓子リスト（gift_check_items）から選んだ場合
  category           text not null check (category in ('引出物','引菓子','その他')),
  name               text not null,                      -- 品名（リストから選んだら自動入力、手入力も可）
  price_jpy          integer not null default 0,         -- 税込単価
  qty                integer not null default 1,
  memo               text,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists gift_hikidemono_gift_idx on public.gift_hikidemono(gift_id);

-- gift_check_items があれば外部キーを張る
do $$
begin
  if to_regclass('public.gift_check_items') is not null
     and not exists (select 1 from pg_constraint where conname = 'gift_hikidemono_item_fk') then
    alter table public.gift_hikidemono
      add constraint gift_hikidemono_item_fk
      foreign key (gift_check_item_id) references public.gift_check_items(id) on delete set null;
  end if;
end $$;

alter table public.gift_hikidemono enable row level security;
drop policy if exists "admin all" on public.gift_hikidemono;
create policy "admin all" on public.gift_hikidemono
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';

-- a1: 配席の編集モードの「保存」を 1 トランザクションで行う関数。
-- 編集開始時の各表の updated_at 最大値より DB が新しければ 'seating_conflict'（40001）で止める（同時編集の検知）。
-- h3: 割当の削除は updated_at を動かさないので、割当の行数（p_since_asg_count）も比較する。
-- 一意制約 (grid_row, grid_col) / (table_id, seat_index) に当たらないよう、動かす行の位置をいったん外してから upsert する。
-- 実行後の権限は authenticated のみ。

drop function if exists seating_save(timestamptz, timestamptz, timestamptz, uuid[], jsonb, uuid[], uuid[], jsonb, uuid[], jsonb);

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

revoke all on function seating_save(timestamptz, timestamptz, timestamptz, uuid[], jsonb, uuid[], uuid[], jsonb, uuid[], jsonb, int) from public, anon;
grant execute on function seating_save(timestamptz, timestamptz, timestamptz, uuid[], jsonb, uuid[], uuid[], jsonb, uuid[], jsonb, int) to authenticated;

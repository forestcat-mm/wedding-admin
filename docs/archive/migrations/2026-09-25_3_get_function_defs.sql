-- 実DBにある関数の本体を取り出す（schema.sql を実DBに合わせるための確認用。何も変更しない）。
-- 結果の 4 行をそのまま貼り付けてください。

select pg_get_functiondef('sync_rsvp_row(rsvp)'::regprocedure)          as sync_rsvp_row
union all
select pg_get_functiondef('trg_sync_rsvp()'::regprocedure)
union all
select pg_get_functiondef('mark_superseded(uuid, timestamptz, text, text, text, text, text)'::regprocedure)
union all
select pg_get_functiondef('touch_parent_reply()'::regprocedure);

-- 参考：touch_updated_at と rls_auto_enable も見たい場合
-- select pg_get_functiondef('touch_updated_at()'::regprocedure);
-- select pg_get_functiondef('rls_auto_enable()'::regprocedure);
-- select evtname, evtevent, evtfoid::regproc from pg_event_trigger;   -- rls_auto_enable を呼ぶイベントトリガー

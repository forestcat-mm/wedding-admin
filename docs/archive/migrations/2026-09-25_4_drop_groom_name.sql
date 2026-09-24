-- b1: 旧仕様の event_settings.groom_name / bride_name を削除する。
-- コード（public/app.js、index.html、s/index.html）にこの 2 列への参照は残っていない（2026-09-25 確認）。
-- 名前は groom_family / groom_given / bride_family / bride_given を使う。

alter table event_settings
  drop column if exists groom_name,
  drop column if exists bride_name;

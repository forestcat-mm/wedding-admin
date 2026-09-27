-- ご祝儀 v2（00_spec/10_gifts-v2.md 7. 設定）
-- 仮の金額（expected_jpy）を手で変えた行の印。既定値（app_settings.gift_default_jpy）を変えたとき、
-- 「仮・出席者・本人・expected_edited = false」の行だけを新しい既定値に更新するために使う。
alter table public.gifts add column if not exists expected_edited boolean not null default false;

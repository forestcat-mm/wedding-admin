-- 個別手配分の支払い状況の表記変更：「購入済（未払）」→「予約済（未払）」
-- CHECK 制約があるため、既存値を書き換えてから制約を張り直します。

alter table budget_external drop constraint if exists budget_external_pay_status_check;

update budget_external
   set pay_status = '予約済（未払）'
 where pay_status = '購入済（未払）';

alter table budget_external
  add constraint budget_external_pay_status_check
  check (pay_status in ('検討中','予約済（未払）','支払済'));

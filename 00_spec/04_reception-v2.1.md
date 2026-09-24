# 受付 v2.1：同行者の表示

受付画面の各ゲスト行（本人）に、出席する同行者を表示する。v1（`reception.md`）・v2（`03_reception-v2.md`）の仕様とセキュリティ要件（メール等を API に含めない）は維持する。

## データ
- `GET /api/reception/guests` の各ゲストに `companions` を追加する
  - 対象：そのゲストの有効な回答（replies_admin.deleted_at is null かつ superseded_by is null）の reply_people のうち、idx > 0、deleted_at is null、attending = true の行
  - 並び順：idx 順
  - 返す項目：氏名（漢字・ローマ字。管理画面で修正済みの reply_people の値を使う）、is_child、age、卓・席（seating_assignments にあれば）
- 氏名での検索対象に同行者の名前も含める。同行者の名前で一致した場合は、その本人の行を表示し、該当する同行者名をハイライトする

## 表示
- 本人の氏名の下に、同行者を小さめの文字で並べる
  - 例：同行：森 花子 ／ 森 太郎（子・8歳） ／ 森 さくら（子・年齢未記入）
  - 子どもは is_child = true。age があれば「子・n歳」、なければ「子・年齢未記入」と表示する
  - 同行者の卓・席が本人と違う場合だけ、名前の後ろに「（C卓）」のように卓を添える
- 行に人数バッジ「計n名」（本人＋同行者）を表示する
- PC（表形式）：氏名セルの中に同行者を表示する（列は増やさない）
- タブレット・スマホ（カード）：氏名の下に同じ形で表示する
- 同行者がいない行は、同行者の表示部分ごと非表示にする（空欄を出さない）

## 受付操作
- 受付済ボタンは今までどおり1行（1組）単位とする。同行者ごとの受付は設けない

## 完了条件
- 管理画面で同行者の名前や年齢を修正すると、次回の同期（10秒）で受付画面に反映される
- 欠席・削除済みの同行者、上書きされた古い回答の同行者は表示されない
- 同行者の名前で検索して、本人の行が見つかる
- `companions` にメールや連絡先が含まれない
- テストを追加し、npm test がすべて通る

---

## 実装メモ（2026-09-25）

- API（`src/worker.js` guestList）：`reply_people` を `deleted_at is null` で本人・同行者まとめて取得（列は氏名・idx・attending・is_child・age・birthdate のみ）。同行者は有効な回答（v2 と同じ replies_admin の絞り込み）に紐づく idx>0・attending=true の行を idx 順に並べ、`companions: [{ family_name, given_name, family_name_latin, given_name_latin, is_child, age, table, seat }]` を付ける。id・reply_id・連絡先・アレルギーは含めない
- 年齢：`age` 列があればそれ、無ければ `birthdate` から挙式日（2026-09-26）時点で計算（管理画面 `public/app.js` の `ageAt` と同じ規則）
- 受付画面（`public/reception/reception.js` / `reception.css`）：氏名の下に `同行：…` を表示。子どもは「（子・n歳）」「（子・年齢未記入）」、本人と卓が違うときだけ「（C卓）」。人数バッジ「計n名」は同行者がいる行にだけ表示（1名の行には出さない）。検索は本人に加えて同行者の漢字・ローマ字にも部分一致し、一致した同行者名を淡青でハイライト。10 秒ごとの再取得は従来どおりなので、管理画面の修正は次の同期で反映される
- テスト（`tests/worker.test.mjs`）：同行者の並び順・項目・年齢計算・卓席、欠席／削除済み／上書きされた古い回答の同行者の除外、連絡先が含まれないことを追加（計 26 件）

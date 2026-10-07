# 07 コンテンツ管理・タブ整理 — 管理画面側（wedding-admin）

対になるゲスト側は `07_guest_updates.md`。**こちらを先に実装**し、マイグレーション適用と「JSON から取り込む」を済ませてからゲスト側へ。
このファイルは `00_spec/07_cms_admin.md`。

## 目的
1. ゲスト向けサイト（wedding.forest-mm.com）の文章・写真を管理画面から編集できるようにする（ごあいさつ、Story、Marché、Menu、Movies の文言、ひとこと（Thanks）の文言、ヘルプ）
2. タブを階層化して整理する
3. PHOTO TOSS の管理画面へのリンクを置く

---

## 1. DB マイグレーション（SQL を先に提示 → 承認後に適用）

```sql
create table if not exists public.guide_content (
  id          uuid primary key default gen_random_uuid(),
  section     text not null,        -- greeting / story / marche / menu / movies_text / thanks_text / help / ui
  lang        text not null,        -- ja / zh
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  unique (section, lang)
);
alter table public.guide_content enable row level security;
create policy "admin all" on public.guide_content for all to authenticated using (true) with check (true);
```
- `data` の構造は、ゲスト側 `public/guide/content/guide.<lang>.json` の対応キーと同じにする（story は `03_story_v2.md` の構造、marche は `{intro, hint, hikidemono:[{id, brand, name, note, photo}], hikigashi:[...]}`）
- 新しい section：
  - `thanks_text`：`{title_en, title, intro, name_label, name_help, gift_label, hikidemono_label, hikigashi_label, none_option, message_label, submit, done_title, done_text, resend}`
  - `help`：`{title, intro, items:[{key:'story'|'seating'|'menu'|'marche'|'movies'|'thanks'|'photo', title, text}], skip, close}`
  - `ui`：ナビのラベルなど（既存 guide.js 内の文言を移す。任意、後回し可）
- 写真のパスは `media/guide/<section>/<file>`（R2 キー `guide/<section>/<file>`）または従来の `photos/...`（リポジトリ内）のどちらも許容

## 2. R2
- 既存バインディング `MEDIA`（`wedding-media`）を使う。キー接頭辞 `guide/`
- 画像アップロード API（管理者認証必須）：`POST /api/media/image`（multipart、≤10MB、jpeg/png/webp）。サーバー側で長辺1600px・品質85 に縮小できなければ、ブラウザ側で canvas 縮小してから送る。返り値はキー

## 3. 新タブ「コンテンツ」（公開サイトグループ）
左に section 一覧、右に編集フォーム。ja / zh を切り替えて編集（同じ画面構成、2言語を並べる表示も可）。

| section | 編集 UI |
|---|---|
| ごあいさつ | 見出し・本文（複数行） |
| Story | 章ごとに項目の表（年／タイトル／本文／写真）。行の追加・削除・並べ替え。新婚旅行は4都市＋写真3枚。写真はアップロードまたは既存パス入力。丸写真は招待状画像の参照のまま |
| Marché | 冒頭文・案内文、引出物／引菓子の表（ID／ブランド／商品名／内訳／写真）。ID は g01〜・s01〜で固定（ギフト＆ひとこと集計と対応するため削除時は警告） |
| Menu | 料理6品（番号・名前・副題）、お酒・ソフトドリンクの行、スペシャルドリンク2件と注記 |
| Movies 文言 | 見出し・冒頭文・ボタン文言（ムービー自体は Movies タブ） |
| ひとこと（Thanks）文言 | 上記 thanks_text の各項目。**既定文（ja）**：見出し「ご参加ありがとうございました」／導入「こだわって選んだ品々、お気に召したものはありましたか。よかったら、どれをお持ち帰りいただいたか教えてください。ひとこともお待ちしています。」／お礼「ありがとうございました。ふたりで大切に読ませていただきます。」（zh は同じ意味で） |
| ヘルプ（ポップアップ） | 見出し・導入・タブごとの説明（title／text）・ボタン文言。**既定文（ja）**例：Story「ふたりの生い立ちと、出会ってからの歩み」／Seating「お席の場所と、お名前で席を探せます」／Menu「本日のお料理とお飲み物」／Marché「引出物・引菓子のカタログ。♡ で気になる品をメモできます」／Movies「当日上映したムービー」／ひとこと「お持ち帰りいただいた品とメッセージをお寄せください」／Photo「撮った写真をふたりに届けられます」 |

- 共通：「保存」「プレビュー（ゲスト側を新規タブで開く）」「JSON から取り込む」（`../wedding-invite/public/guide/content/guide.<lang>.json` を読み、空の section にだけ投入。既に内容があれば確認して上書き）
- 保存時に JSON として妥当か検証。更新者（ログインメール）を updated_by に
- 反映はゲスト側のキャッシュ（60秒）後と注記

## 4. タブの階層化
- グループ：**ゲスト**（招待者リスト・回答一覧・あいまいマッチング・ホテル提出・席次・当日受付）／**ギフト**（内祝い記録・ギフト＆ひとこと）／**公開サイト**（公開設定・コンテンツ・Movies）／**設定**（既存の設定類）。既存タブの正確な名前は実装時に確認し、上の分類に近いグループへ
- PC（≥1024px）：左サイドバーにグループ見出し＋項目。選択中をハイライト。折りたたみ可
- スマホ：上部にグループのセグメント → その下に項目タブ（横スクロール）
- URL ハッシュまたはクエリで現在のタブを保持（既存の仕組みがあれば踏襲）

## 5. PHOTO TOSS へのリンク
- サイドバー最下部（スマホはグループ「公開サイト」の末尾）に「PHOTO TOSS 管理 ↗」。リンク先は環境変数 `PHOTOS_ADMIN_URL`（wrangler.toml の vars。トークンは含めない。PHOTO TOSS 側の管理入口 URL を README に記載）

## 6. 確認と報告
- マイグレーション SQL の提示 → 承認後に適用
- `npx wrangler dev`：コンテンツの編集・保存・取り込み、画像アップロード、タブ階層の PC／スマホ表示、PHOTO TOSS リンク
- 変更ファイル一覧、追加 API 一覧（認証必須の確認）。コミットして main に push

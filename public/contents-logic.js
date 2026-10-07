/* 07 コンテンツ管理 — 画面に依存しない処理（00_spec/07_cms_admin.md）
   guide_content の 1 行 = (section, lang) の data。data の構造はゲスト側
   wedding-invitation public/guide/content/guide.<lang>.json の対応キーと同じ。
   ゲスト側の /api/content も同じ対応（movies_text ← movies など）で JSON を補完する。変えるときは両方を直すこと。 */

export const LANGS = ['ja', 'zh'];
export const LANG_LABEL = { ja: '日本語', zh: '中文' };

/* page はゲスト向けサイトの /guide/ からの相対パス（プレビュー用） */
export const SECTIONS = [
  { id: 'greeting', label: 'ごあいさつ', page: '' },
  { id: 'story', label: 'Story', page: 'story/' },
  { id: 'marche', label: 'Marché', page: 'marche/' },
  { id: 'menu', label: 'Menu', page: 'menu/' },
  { id: 'movies_text', label: 'Movies 文言', page: 'movies/' },
  { id: 'thanks_text', label: 'ひとこと（Thanks）文言', page: 'thanks/' },
  { id: 'help', label: 'ヘルプ（ポップアップ）', page: '' },
];
export const SECTION_IDS = SECTIONS.map(s => s.id);

/* guide.<lang>.json で section と名前が違うキー */
export const SOURCE_KEY = { movies_text: 'movies', thanks_text: 'thanks' };

export const HELP_KEYS = ['story', 'seating', 'menu', 'marche', 'movies', 'thanks', 'photo'];

/* ヘルプ（初回ポップアップ）の既定文。JSON に help が無いときに取り込む */
export const DEFAULT_HELP = {
  ja: {
    title: 'ご案内',
    intro: '本日のご案内サイトです。下のタブから各ページをご覧いただけます。',
    items: [
      { key: 'story', title: 'Story', text: 'ふたりの生い立ちと、出会ってからの歩み' },
      { key: 'seating', title: 'Seating', text: 'お席の場所と、お名前で席を探せます' },
      { key: 'menu', title: 'Menu', text: '本日のお料理とお飲み物' },
      { key: 'marche', title: 'Marché', text: '引出物・引菓子のカタログ。♡ で気になる品をメモできます' },
      { key: 'movies', title: 'Movies', text: '当日上映したムービー' },
      { key: 'thanks', title: 'ひとこと', text: 'お持ち帰りいただいた品とメッセージをお寄せください' },
      { key: 'photo', title: 'Photo', text: '撮った写真をふたりに届けられます' },
    ],
    skip: '次回から表示しない',
    close: 'はじめる',
  },
  zh: {
    title: '使用说明',
    intro: '这是今天的婚礼指南。可以通过下方的标签浏览各个页面。',
    items: [
      { key: 'story', title: 'Story', text: '两人的成长经历，以及相识以来的点点滴滴' },
      { key: 'seating', title: 'Seating', text: '查看座位位置，也可以按姓名查找座位' },
      { key: 'menu', title: 'Menu', text: '今天的菜品与饮品' },
      { key: 'marche', title: 'Marché', text: '回礼与回礼点心的目录。点 ♡ 可以收藏感兴趣的礼品' },
      { key: 'movies', title: 'Movies', text: '当天播放的影片' },
      { key: 'thanks', title: '留言', text: '请告诉我们您带回的礼品，并给我们留言' },
      { key: 'photo', title: 'Photo', text: '把您拍的照片分享给我们' },
    ],
    skip: '下次不再显示',
    close: '开始浏览',
  },
};

/* ひとこと（Thanks）の文言。仕様の項目（この順で表示） */
export const THANKS_KEYS = ['title_en', 'title', 'intro', 'name_label', 'name_help', 'gift_label', 'hikidemono_label', 'hikigashi_label',
  'none_option', 'message_label', 'submit', 'done_title', 'done_text', 'resend'];
export const DEFAULT_THANKS = {
  ja: {
    title_en: 'THANK YOU',
    title: 'ご参加ありがとうございました',
    intro: 'こだわって選んだ品々、お気に召したものはありましたか。よかったら、どれをお持ち帰りいただいたか教えてください。ひとこともお待ちしています。',
    name_label: 'お名前',
    name_help: '2文字以上で候補が出ます。ご自身のお名前を選んでください。',
    gift_label: 'お持ち帰りいただいた品',
    hikidemono_label: '引出物',
    hikigashi_label: '引菓子',
    none_option: '選ばなかった／覚えていない',
    message_label: 'ひとこと',
    submit: '送信する',
    done_title: '送信しました',
    done_text: 'ありがとうございました。ふたりで大切に読ませていただきます。',
    resend: '内容を変更する',
    name_ph: 'お名前（漢字・ローマ字）',
  },
  zh: {
    title_en: 'THANK YOU',
    title: '感谢您的光临',
    intro: '这些都是我们用心挑选的礼品，有您喜欢的吗？欢迎告诉我们您带回了哪一件，也期待您的留言。',
    name_label: '姓名',
    name_help: '输入两个字以上会显示候选，请选择您的姓名。',
    gift_label: '您带回的礼品',
    hikidemono_label: '回礼',
    hikigashi_label: '回礼点心',
    none_option: '没有选／不记得了',
    message_label: '留言',
    submit: '提交',
    done_title: '已提交',
    done_text: '谢谢！我们会认真阅读每一条留言。',
    resend: '修改内容',
    name_ph: '姓名（汉字・拼音／罗马字）',
  },
};
/* 旧 guide.<lang>.json の thanks のキー → thanks_text のキー。intro と name_ph は新しい既定文を使う */
const THANKS_FROM_OLD = { kicker: 'title_en', title: 'title', name_title: 'name_label', name_hint: 'name_help', items_title: 'gift_label',
  none: 'none_option', message_title: 'message_label', submit: 'submit', done: 'done_text', edit: 'resend' };
const THANKS_DROP = new Set(['intro', 'name_label', 'name_ph']);

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/* 旧 thanks（guide.json）→ thanks_text。仕様の項目を先頭に、残りの文言（エラー文など）はそのまま後ろに残す */
export function thanksFromOld(old, lang) {
  const out = clone(DEFAULT_THANKS[lang] || DEFAULT_THANKS.ja);
  if (!isObj(old)) return out;
  for (const [from, to] of Object.entries(THANKS_FROM_OLD)) if (typeof old[from] === 'string' && old[from]) out[to] = old[from];
  for (const [k, v] of Object.entries(old)) if (!(k in THANKS_FROM_OLD) && !THANKS_DROP.has(k) && !(k in out)) out[k] = clone(v);
  return out;
}

/* guide.<lang>.json から section の data を作る。JSON に無ければ既定文（help・thanks_text）、それも無ければ null */
export function fromGuideJson(json, section, lang) {
  if (!isObj(json)) return null;
  if (isObj(json[section])) return clone(json[section]);
  if (section === 'thanks_text') return thanksFromOld(json.thanks, lang);
  if (section === 'help') return clone(DEFAULT_HELP[lang] || DEFAULT_HELP.ja);
  const alt = SOURCE_KEY[section];
  return alt && isObj(json[alt]) ? clone(json[alt]) : null;
}

export const isEmpty = data => !isObj(data) || Object.keys(data).length === 0;

/* キーの順に関係なく同じ内容か */
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])]));
  return v;
}
export const sameData = (a, b) => JSON.stringify(stable(a ?? {})) === JSON.stringify(stable(b ?? {}));

/* ---------- パス（['story','chapter2','items',0,'title'] のような配列）で読み書き ---------- */
export function getAt(obj, path) {
  let o = obj;
  for (const k of path) { if (o == null) return undefined; o = o[k]; }
  return o;
}
export function setAt(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = typeof path[i + 1] === 'number' ? [] : {};
    o = o[k];
  }
  o[path[path.length - 1]] = value;
}

/* ---------- 写真のパス ---------- */
/* media/guide/<section>/<file> は R2（キー guide/…）、photos/… と ../images/… はゲスト側リポジトリ内 */
const MEDIA_PATH = /^media\/(guide\/[a-z0-9_]+\/[a-z0-9][a-z0-9_-]*\.(jpg|png|webp))$/;
const REPO_PATH = /^(photos\/|\.\.\/images\/)[A-Za-z0-9_./-]+\.(jpe?g|png|webp|gif|svg)$/i;
export const PHOTO_KEYS = new Set(['photo', 'hero', 'portrait', 'photos']);
export function mediaKey(path) {
  const m = MEDIA_PATH.exec(String(path || ''));
  return m ? m[1] : null;
}
export const isPhotoPath = p => p === '' || MEDIA_PATH.test(p) || (REPO_PATH.test(p) && !p.includes('/../') && !p.startsWith('photos/..'));
/* リポジトリ内の写真をゲスト向けサイトの URL に（パスは /guide/ からの相対） */
export function repoPhotoUrl(path, guestSite) {
  if (!path || mediaKey(path) || !guestSite) return '';
  try { return new URL(path, guestSite.replace(/\/+$/, '') + '/guide/').href; } catch { return ''; }
}

/* ---------- Marché ---------- */
export function marcheItems(data) {
  const out = [];
  for (const s of Array.isArray(data?.sections) ? data.sections : [])
    for (const it of Array.isArray(s?.items) ? s.items : []) out.push({ section: s.id, ...it });
  return out;
}
/* 保存すると消える ID（ギフト＆ひとこと集計の対応が切れるので警告する） */
export function removedMarcheIds(before, after) {
  const now = new Set(marcheItems(after).map(i => i.id));
  return marcheItems(before).map(i => i.id).filter(id => id && !now.has(id));
}
/* 次の ID（g21、s13 …）。prefix は既存の ID から取る */
export function nextMarcheId(sectionData, allData, fallbackPrefix) {
  const ids = (sectionData?.items || []).map(i => String(i?.id || ''));
  const prefix = (ids.find(id => /^[a-z]+\d+$/.test(id)) || fallbackPrefix).replace(/\d+$/, '');
  const used = new Set(marcheItems(allData).map(i => i.id));
  let n = Math.max(0, ...ids.filter(id => id.startsWith(prefix)).map(id => Number(id.slice(prefix.length)) || 0));
  let id;
  do { n++; id = prefix + String(n).padStart(2, '0'); } while (used.has(id));
  return id;
}

/* ---------- 保存前の検証 ---------- */
const MAX_BYTES = 200 * 1024;
const str = v => typeof v === 'string';
function walkPhotos(v, path, errs) {
  if (Array.isArray(v)) { v.forEach((x, i) => walkPhotos(x, path.concat(i), errs)); return; }
  if (!isObj(v)) return;
  for (const [k, x] of Object.entries(v)) {
    if (PHOTO_KEYS.has(k)) {
      for (const p of k === 'photos' ? (Array.isArray(x) ? x : [x]) : [x])
        if (!str(p) || !isPhotoPath(p)) errs.push(`${path.concat(k).join('.')}：写真のパスは media/guide/… か photos/… にしてください（${String(p)}）`);
    } else walkPhotos(x, path.concat(k), errs);
  }
}
function needList(data, path, errs, label) {
  const v = getAt(data, path);
  if (!Array.isArray(v)) { errs.push(`${label}の一覧がありません`); return []; }
  return v;
}
/* エラーの文言の配列（空なら保存できる） */
export function validate(section, data) {
  const errs = [];
  if (!isObj(data)) return ['データがオブジェクトではありません'];
  let text;
  try { text = JSON.stringify(data); } catch { return ['JSON にできない値が含まれています']; }
  if (!sameData(JSON.parse(text), data)) errs.push('JSON にできない値が含まれています');
  if (new TextEncoder().encode(text).length > MAX_BYTES) errs.push('データが大きすぎます（200KB まで）');
  walkPhotos(data, [], errs);

  if (section === 'story') {
    const lists = [[['chapter1', 'bride', 'items'], '生い立ち（新婦）'], [['chapter1', 'groom', 'items'], '生い立ち（新郎）'],
      [['chapter2', 'items'], '出会い'], [['chapter3', 'items'], '交際から']];
    for (const [p, label] of lists)
      needList(data, p, errs, label).forEach((it, i) => {
        if (!isObj(it) || !str(it.year) || !str(it.title) || !str(it.text)) errs.push(`${label} ${i + 1} 行目：年・タイトル・本文は文字列にしてください`);
      });
    needList(data, ['honeymoon'], errs, '新婚旅行').forEach((c, i) => {
      if (!isObj(c) || !Array.isArray(c.photos)) errs.push(`新婚旅行 ${i + 1} 件目：写真の一覧がありません`);
    });
  }
  if (section === 'marche') {
    const seen = new Set();
    needList(data, ['sections'], errs, '引出物・引菓子').forEach((s, si) => {
      if (!isObj(s) || !Array.isArray(s.items)) { errs.push(`${si + 1} つ目の区分に品物の一覧がありません`); return; }
      s.items.forEach((it, i) => {
        const id = String(it?.id || '');
        if (!/^[a-z]+\d+$/.test(id)) errs.push(`${s.title || s.id} ${i + 1} 行目：ID が不正です（${id || '空'}）`);
        else if (seen.has(id)) errs.push(`ID ${id} が重複しています`);
        seen.add(id);
        if (!str(it?.name) || !it.name.trim()) errs.push(`${s.title || s.id} ${id || i + 1}：商品名が空です`);
      });
    });
  }
  if (section === 'menu') {
    needList(data, ['courses'], errs, 'お料理');
    needList(data, ['drinks'], errs, 'お飲み物').forEach((d, i) => { if (!Array.isArray(d?.items)) errs.push(`お飲み物 ${i + 1} つ目の区分に行の一覧がありません`); });
    if (data.special !== undefined) needList(data, ['special', 'items'], errs, 'スペシャルドリンク');
  }
  if (section === 'help') {
    const seen = new Set();
    needList(data, ['items'], errs, 'タブごとの説明').forEach((it, i) => {
      if (!HELP_KEYS.includes(it?.key)) errs.push(`タブごとの説明 ${i + 1} 行目：タブの種類が不正です（${it?.key}）`);
      else if (seen.has(it.key)) errs.push(`タブ ${it.key} の説明が重複しています`);
      seen.add(it?.key);
    });
  }
  /* 文字列であるべき値（その他の項目を含む最上位の文字列）が文字列以外になっていないか */
  for (const [k, v] of Object.entries(data)) if (v === null || v === undefined) errs.push(`${k} が空（null）です`);
  return errs;
}

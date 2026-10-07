/* ============================================================
   07 コンテンツ（00_spec/07_cms_admin.md §3）
   ゲスト向けサイトの Guide の文章・写真を guide_content（section × lang の JSON）で編集する。
   DB はログインユーザーの supabase-js（RLS: authenticated）、画像は管理画面 Worker の
   POST /api/media/image（R2 の guide/<section>/…）。app.js から setupContents(ctx) で呼ぶ。
   ============================================================ */
import * as CL from './contents-logic.js';

const IMAGE_MAX = 10 * 1024 * 1024;
const IMAGE_EDGE = 1600;
const IMAGE_QUALITY = 0.85;
const SOURCE_DATE = '2026-10-07';   /* content-source/ に wedding-invitation の guide.*.json をコピーした日 */

let C;   /* app.js から受け取る道具（sb, $, $$, esc, toast, openModal, closeModal, me, guestSite） */
const CT = {
  loaded: false, loading: null,
  rows: {},          /* rows[section][lang] = { data, updated_at, updated_by }（DB の内容） */
  draft: {},         /* draft[section][lang] = 編集中の data */
  section: 'greeting', lang: 'ja',
  thumbs: new Map(), /* R2 のキー → 署名付き URL */
  plan: [],          /* 取り込みの候補（importPlan） */
};

export function setupContents(ctx) {
  C = ctx;
  C.$('#ct-save').addEventListener('click', save);
  C.$('#ct-discard').addEventListener('click', () => {
    if (!dirtyPairs().length || !confirm('保存していない変更をすべて破棄しますか？')) return;
    discardAll(); render();
  });
  C.$('#ct-preview').addEventListener('click', preview);
  C.$('#ct-import').addEventListener('click', openImport);
  const form = C.$('#ct-form');
  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('click', onAction);
  window.addEventListener('beforeunload', e => { if (dirtyPairs().length) { e.preventDefault(); e.returnValue = ''; } });
}
export function openTab() { if (!CT.loaded) load(); }
/* 未保存の変更があるときにタブ移動を確認する */
export function leaveGuard(next) {
  if (next === 'contents' || !C.$('#v-contents').classList.contains('on') || !dirtyPairs().length) return false;
  if (!confirm('コンテンツに保存していない変更があります。破棄して移動しますか？')) return true;
  discardAll();
  return false;
}

/* ---------------- 共通 ---------------- */
const esc = s => C.esc(s);
const P = path => esc(JSON.stringify(path));
async function token() {
  const { data } = await C.sb.auth.getSession();
  return data.session?.access_token || '';
}
async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}`, ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }) },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
function confirmBox(title, html, okLabel) {
  return new Promise(resolve => {
    const box = C.$('#m-confirm-box');
    box.innerHTML = `<h3>${esc(title)}</h3><div class="note" style="margin:6px 0 14px">${html}</div>
      <div class="row" style="margin:0"><span class="sp"></span>
        <button class="btn o" data-close>キャンセル</button><button class="btn enji" id="cf-go">${esc(okLabel)}</button></div>`;
    const modal = C.$('#m-confirm');
    const onBackdrop = e => { if (e.target === modal) finish(false); };
    let done = false;
    function finish(v) {
      if (done) return;
      done = true; modal.removeEventListener('click', onBackdrop); C.closeModal('m-confirm'); resolve(v);
    }
    C.$$('[data-close]', box).forEach(b => b.addEventListener('click', () => finish(false)));
    C.$('#cf-go', box).addEventListener('click', () => finish(true));
    modal.addEventListener('click', onBackdrop);
    C.openModal('m-confirm');
  });
}
const fmtTime = iso => iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const secLabel = id => CL.SECTIONS.find(s => s.id === id)?.label || id;
const row = (s, l) => CT.rows[s]?.[l];
const draft = (s = CT.section, l = CT.lang) => CT.draft[s][l];
const isDirty = (s, l) => !CL.sameData(CT.draft[s][l], row(s, l)?.data ?? {});
function dirtyPairs() {
  if (!CT.loaded) return [];
  const out = [];
  for (const s of CL.SECTION_IDS) for (const l of CL.LANGS) if (isDirty(s, l)) out.push([s, l]);
  return out;
}
function discardAll() {
  for (const s of CL.SECTION_IDS) for (const l of CL.LANGS) CT.draft[s][l] = CL.clone(row(s, l)?.data ?? {});
}

/* ---------------- 読み込み ---------------- */
async function load() {
  if (CT.loading) return CT.loading;
  CT.loading = (async () => {
    const { data, error } = await C.sb.from('guide_content').select('section,lang,data,updated_at,updated_by');
    if (error) {
      C.$('#ct-form').innerHTML = `<div class="alert">読み込めませんでした：${esc(error.message)}<br>guide_content テーブルが無い場合は、supabase/migrations のマイグレーションを適用してください。</div>`;
      return;
    }
    CT.rows = {};
    for (const s of CL.SECTION_IDS) CT.rows[s] = {};
    for (const r of data) { (CT.rows[r.section] ||= {})[r.lang] = r; }
    CT.draft = {};
    for (const s of CL.SECTION_IDS) CT.draft[s] = {};
    discardAll();
    CT.loaded = true;
    render();
  })();
  try { await CT.loading; } finally { CT.loading = null; }
}

/* ---------------- 画面 ---------------- */
function render() {
  if (!CT.loaded) return;
  renderSide(); renderBar(); renderForm();
}
function renderSide() {
  C.$('#ct-side').innerHTML = CL.SECTIONS.map(s => {
    const st = CL.LANGS.map(l => {
      const has = !CL.isEmpty(row(s.id, l)?.data), d = isDirty(s.id, l);
      return `<span class="ctst ${has ? 'has' : 'none'}${d ? ' dirty' : ''}" title="${esc(CL.LANG_LABEL[l])}：${has ? '保存済み' : '未登録'}${d ? '（未保存の変更あり）' : ''}">${l}${d ? '●' : ''}</span>`;
    }).join('');
    return `<button type="button" class="ctsec${s.id === CT.section ? ' on' : ''}" data-sec="${s.id}"><span>${esc(s.label)}</span><span class="ctsts">${st}</span></button>`;
  }).join('');
  C.$$('#ct-side [data-sec]').forEach(b => b.addEventListener('click', () => { CT.section = b.dataset.sec; render(); }));
}
function renderBar() {
  C.$('#ct-lang').innerHTML = CL.LANGS.map(l => `<button type="button" data-lang="${l}" class="${l === CT.lang ? 'on' : ''}">${esc(CL.LANG_LABEL[l])}${isDirty(CT.section, l) ? ' ●' : ''}</button>`).join('');
  C.$$('#ct-lang [data-lang]').forEach(b => b.addEventListener('click', () => { CT.lang = b.dataset.lang; render(); }));
  const r = row(CT.section, CT.lang);
  C.$('#ct-meta').textContent = r ? `最終保存 ${fmtTime(r.updated_at)}${r.updated_by ? '・' + r.updated_by.replace(/@.*/, '') : ''}` : '未登録';
  const n = dirtyPairs().length;
  C.$('#ct-dirty').hidden = !n;
  C.$('#ct-dirty').textContent = n > 1 ? `未保存の変更あり（${n} 件）` : '未保存の変更あり';
  C.$('#ct-err').innerHTML = '';
}
function markDirty() {
  renderSide();
  const n = dirtyPairs().length;
  C.$('#ct-dirty').hidden = !n;
  C.$('#ct-dirty').textContent = n > 1 ? `未保存の変更あり（${n} 件）` : '未保存の変更あり';
  C.$$('#ct-lang [data-lang]').forEach(b => { b.textContent = CL.LANG_LABEL[b.dataset.lang] + (isDirty(CT.section, b.dataset.lang) ? ' ●' : ''); });
}

/* ---------------- 編集フォームの定義 ----------------
   t: text（1 行）／area（複数行）／photo（写真）／photos（写真 n 枚）／select／ro（表示だけ）
      group（入れ子のオブジェクト）／list（行の表）／blocks（オブジェクトの並び。中に list を持てる）
   list・blocks：add（行の追加）、del（削除）、move（並べ替え）、fixed（行数を変えない） */
const F = (k, label, t = 'text', o = {}) => ({ k, label, t, ...o });
const STORY_ITEMS = { t: 'list', add: true, del: true, move: true,
  cols: [F('year', '年', 'text', { w: 90 }), F('title', 'タイトル', 'text', { w: 180 }), F('text', '本文', 'area'), F('photo', '写真', 'photo', { w: 230 })],
  newItem: () => ({ year: '', title: '', text: '', photo: '' }) };
const PERSON = [F('role', '英字（BRIDE／GROOM）'), F('name', '名前'), F('latin', 'ローマ字'),
  F('portrait', '丸写真', 'ro', { note: '招待状の画像を参照（ここでは変えません）' }), { ...STORY_ITEMS, k: 'items', label: '年表' }];
const PAGE_HEAD = [F('kicker', '英字の小見出し'), F('hero', 'ヘッダー写真', 'photo')];

const SCHEMA = {
  greeting: [
    F('title', '見出し'), F('body', '本文', 'area', { rows: 4 }),
    F('names', 'お名前（英字）'), F('date', '日付・会場'), ...PAGE_HEAD,
    F('cards', 'ページへのカード', 'list', { move: true, note: '並び順はトップページの表示順。どのカードを出すかは公開設定のモードで決まります',
      cols: [F('key', 'ページ', 'ro', { w: 80 }), F('en', '英字', 'text', { w: 140 }), F('text', '説明'), F('photo', '写真', 'photo', { w: 230 })] }),
  ],
  story: [
    F('title', '見出し'), F('hint', '案内文'), F('open_all', '「すべて開く」'), F('close_all', '「すべて閉じる」'), ...PAGE_HEAD,
    F('chapter1', '第1章', 'group', { fields: [F('en', '英字'), F('title', 'タイトル'),
      F('bride', '新婦', 'group', { fields: PERSON }), F('groom', '新郎', 'group', { fields: PERSON })] }),
    F('chapter2', '第2章', 'group', { fields: [F('en', '英字'), F('title', 'タイトル'), F('hero', '章の写真', 'photo'), { ...STORY_ITEMS, k: 'items', label: '年表' }] }),
    F('chapter3', '第3章', 'group', { fields: [F('en', '英字'), F('title', 'タイトル'), { ...STORY_ITEMS, k: 'items', label: '年表' }] }),
    F('honeymoon_en', '新婚旅行：英字'), F('honeymoon_title', '新婚旅行：タイトル'),
    F('honeymoon', '新婚旅行（4都市）', 'list', { move: true,
      cols: [F('en', '都市（英字）', 'text', { w: 110 }), F('ja', '都市名', 'text', { w: 110 }), F('text', '本文', 'area'), F('photos', '写真（3枚）', 'photos', { n: 3, w: 230 })] }),
    F('closing', '結び', 'group', { fields: [F('year', '日付'), F('text', '本文')] }),
  ],
  marche: [
    F('title', '見出し'), F('intro', '冒頭文', 'area'), F('hint', '案内文', 'area'), F('box_note', 'Considering Box の注記', 'area'), ...PAGE_HEAD,
    F('sections', '引出物・引菓子', 'blocks', { title: s => `${s?.title || s?.id || ''}（${s?.id || ''}）`,
      fields: [F('en', '英字'), F('title', '区分名'), F('note', '注記'),
        F('items', '品物', 'list', { add: 'marche', del: 'marche', move: true,
          note: 'ID はギフト＆ひとことの集計と対応しているので変えられません。追加すると次の番号が付きます',
          cols: [F('id', 'ID', 'ro', { w: 50 }), F('brand', 'ブランド', 'text', { w: 150 }), F('name', '商品名'), F('detail', '内訳（色・種類など）'), F('photo', '写真', 'photo', { w: 230 })],
          newItem: () => ({ id: '', brand: '', name: '', detail: '', photo: '' }) })] }),
  ],
  menu: [
    F('title', '見出し'), ...PAGE_HEAD,
    F('courses_title', 'お料理：見出し'),
    F('courses', 'お料理（6品）', 'list', { cols: [F('no', '番号', 'text', { w: 60 }), F('name', '名前'), F('sub', '副題')] }),
    F('drinks_title', 'お飲み物：見出し'),
    F('drinks', 'お飲み物', 'blocks', { title: d => d?.title || '',
      fields: [F('en', '英字'), F('title', '区分名'),
        F('items', '行', 'list', { add: true, del: true, move: true, cols: [F('k', '種類', 'text', { w: 140 }), F('v', '内容')], newItem: () => ({ k: '', v: '' }) })] }),
    F('special', 'スペシャルドリンク', 'group', { fields: [F('en', '英字'), F('title', 'タイトル'),
      F('items', '2件', 'list', { cols: [F('name', '名前', 'text', { w: 200 }), F('body', '説明', 'area'), F('photo', '写真', 'photo', { w: 230 }),
        F('side', '写真の位置', 'select', { w: 90, options: [['left', '左'], ['right', '右']] })] }),
      F('note', '注記', 'area')] }),
  ],
  movies_text: [
    F('title', '見出し'), F('intro', '冒頭文', 'area'),
    F('play', 'ボタン：再生'), F('close', 'ボタン：閉じる'), F('quality', 'ボタン：画質'), F('save', 'ボタン：保存'),
    F('empty', 'ムービーが無いときの文', 'area'), F('story_link', 'Story からのリンク'), ...PAGE_HEAD,
  ],
  thanks_text: [
    F('title_en', '英字の見出し'), F('title', '見出し'), F('intro', '導入', 'area', { rows: 3 }),
    F('name_label', 'お名前：ラベル'), F('name_help', 'お名前：補足（入力欄の下）', 'area'), F('name_ph', 'お名前：入力欄の中の文字'),
    F('gift_label', 'お持ち帰りの品：見出し'), F('hikidemono_label', '引出物：ラベル'), F('hikigashi_label', '引菓子：ラベル'), F('none_option', '「選ばなかった」の選択肢'),
    F('message_label', 'ひとこと：見出し'), F('submit', '送信ボタン'),
    F('done_title', '送信後：見出し'), F('done_text', '送信後：お礼', 'area'), F('resend', '送信後：変更ボタン'),
    F('hero', 'ヘッダー写真', 'photo'),
  ],
  help: [
    F('title', '見出し'), F('intro', '導入', 'area'),
    F('items', 'タブごとの説明', 'list', { move: true, note: 'ゲスト側では、そのときのモードで出ているタブの説明だけを表示します',
      cols: [F('key', 'タブ', 'ro', { w: 80 }), F('title', 'タイトル', 'text', { w: 160 }), F('text', '説明', 'area')] }),
    F('close', 'ボタン（閉じる）'), F('skip', 'リンク（次回から表示しない）'),
  ],
};
const EXTRA_LABEL = { hero: 'ヘッダー写真', kicker: '英字の小見出し', name_change: 'お名前：選び直す', not_found: 'お名前：見つからないとき',
  back_to_search: 'お名前：検索に戻る', free_name: '手入力：お名前', free_email: '手入力：メール', required: '「必須」', items_hint: 'お持ち帰りの品：補足',
  message_ph: 'ひとこと：入力欄の中の文字', left: '残り文字数（{n} が数字）', sending: '送信中', sent: '送信済み',
  err_name: 'エラー：お名前', err_email: 'エラー：メール', err_send: 'エラー：送信失敗', err_busy: 'エラー：送信が続いた', err_long: 'エラー：長すぎる' };

/* ---------------- フォームの組み立て ---------------- */
function renderForm() {
  const box = C.$('#ct-form');
  const data = draft();
  const sec = CT.section;
  const empty = CL.isEmpty(data);
  let h = '';
  if (empty) h += `<div class="alert">${esc(secLabel(sec))}（${esc(CL.LANG_LABEL[CT.lang])}）はまだ登録されていません。「JSON から取り込む」で、ゲスト側の guide.${CT.lang}.json の内容を初期値として入れられます。
    登録されていない間、ゲスト側は guide.${CT.lang}.json の内容を表示します。</div>`;
  h += `<div class="panel ctform">${fields(SCHEMA[sec], data, [])}${extras(SCHEMA[sec], data)}</div>`;
  box.innerHTML = h;
  loadThumbs();
}
function fields(list, obj, path) {
  return list.map(f => field(f, obj?.[f.k], path.concat(f.k), obj)).join('');
}
function field(f, v, path) {
  const note = f.note ? `<div class="note">${esc(f.note)}</div>` : '';
  if (f.t === 'group') return `<fieldset class="ctgrp"><legend>${esc(f.label)}</legend>${fields(f.fields, v || {}, path)}</fieldset>`;
  if (f.t === 'list') return `<div class="ctf ctlist"><label>${esc(f.label)}</label>${note}${table(f, Array.isArray(v) ? v : [], path)}</div>`;
  if (f.t === 'blocks') {
    const arr = Array.isArray(v) ? v : [];
    return `<div class="ctf"><label>${esc(f.label)}</label>${note}` + arr.map((b, i) =>
      `<fieldset class="ctgrp"><legend>${esc(f.title ? f.title(b) : String(i + 1))}</legend>${fields(f.fields, b, path.concat(i))}</fieldset>`).join('') + `</div>`;
  }
  return `<div class="ctf"><label>${esc(f.label)}</label>${input(f, v, path)}${note}</div>`;
}
function input(f, v, path) {
  const val = v ?? '';
  if (f.t === 'ro') return `<div class="ctro">${esc(val) || '<span class="note">—</span>'}</div>`;
  if (f.t === 'area') return `<textarea data-p="${P(path)}" rows="${f.rows || Math.min(8, Math.max(2, Math.ceil(String(val).length / 46)))}">${esc(val)}</textarea>`;
  if (f.t === 'photo') return photo(val, path);
  if (f.t === 'photos') return Array.from({ length: f.n || 1 }, (_, i) => photo((Array.isArray(v) ? v[i] : '') ?? '', path.concat(i))).join('');
  if (f.t === 'select') return `<select data-p="${P(path)}">${f.options.map(([k, l]) => `<option value="${esc(k)}"${k === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<input data-p="${P(path)}" value="${esc(val)}">`;
}
function photo(val, path) {
  const key = CL.mediaKey(val);
  const src = key ? '' : CL.repoPhotoUrl(val, C.guestSite());
  return `<div class="ctph">
    <span class="ctth">${val ? `<img alt="" loading="lazy" ${key ? `data-key="${esc(key)}"` : `src="${esc(src)}"`} onerror="this.replaceWith(Object.assign(document.createElement('i'),{textContent:'表示できません'}))">` : '<i>なし</i>'}</span>
    <span class="ctphin"><input data-p="${P(path)}" value="${esc(val)}" placeholder="photos/… または media/guide/…" spellcheck="false" autocapitalize="off">
      <span class="row" style="margin:0;gap:6px"><label class="btn o s ctup">アップロード<input type="file" accept="image/jpeg,image/png,image/webp" data-up="${P(path)}" hidden></label>
      ${val ? `<button type="button" class="btn link" data-act="clear" data-p="${P(path)}">外す</button>` : ''}</span></span></div>`;
}
function table(f, arr, path) {
  const ops = f.move || f.del;
  const body = arr.map((it, i) => `<tr>${f.cols.map(c => `<td${c.w ? ` style="width:${c.w}px"` : ''}>${input(c, it?.[c.k], path.concat(i, c.k))}</td>`).join('')}
    ${ops ? `<td class="ctops">${f.move ? `<button type="button" class="btn link" data-act="up" data-p="${P(path)}" data-i="${i}" title="上へ"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn link" data-act="down" data-p="${P(path)}" data-i="${i}" title="下へ"${i < arr.length - 1 ? '' : ' disabled'}>↓</button>` : ''}
      ${f.del ? `<button type="button" class="btn link" data-act="del" data-p="${P(path)}" data-i="${i}" data-kind="${f.del === 'marche' ? 'marche' : ''}" title="削除">✕</button>` : ''}</td>` : ''}</tr>`).join('');
  return `<div class="tblwrap"><table class="cttbl"><thead><tr>${f.cols.map(c => `<th>${esc(c.label)}</th>`).join('')}${ops ? '<th></th>' : ''}</tr></thead>
    <tbody>${body || `<tr><td colspan="${f.cols.length + (ops ? 1 : 0)}" class="note">（なし）</td></tr>`}</tbody></table></div>
    ${f.add ? `<button type="button" class="btn o s" data-act="add" data-p="${P(path)}" data-kind="${f.add === 'marche' ? 'marche' : ''}">＋ 行を追加</button>` : ''}`;
}
/* 定義に無い最上位の項目（文言など）。文字列はそのまま編集でき、それ以外は保存時もそのまま残す */
function extras(list, data) {
  const known = new Set(list.map(f => f.k));
  const keys = Object.keys(data || {}).filter(k => !known.has(k));
  if (!keys.length) return '';
  return `<details class="ctextra"><summary>その他の項目（${keys.length}）</summary>` + keys.map(k => {
    const v = data[k];
    const label = `${EXTRA_LABEL[k] || k}<code>${esc(k)}</code>`;
    if (typeof v === 'string') return `<div class="ctf"><label>${label}</label>${CL.PHOTO_KEYS.has(k) ? photo(v, [k]) : input({ t: v.length > 40 ? 'area' : 'text' }, v, [k])}</div>`;
    return `<div class="ctf"><label>${label}</label><pre class="ctjson">${esc(JSON.stringify(v, null, 1))}</pre><div class="note">文字列以外の項目は、ここでは編集できません（そのまま保存されます）</div></div>`;
  }).join('') + `</details>`;
}

/* ---------------- 入力・行の操作 ---------------- */
function onInput(e) {
  const el = e.target;
  if (el.dataset.up) { if (e.type === 'change') upload(el); return; }
  if (!el.dataset.p) return;
  const path = JSON.parse(el.dataset.p);
  const data = draft();
  const same = CL.getAt(data, path) === el.value;
  if (!same) CL.setAt(data, path, el.value);
  if (e.type === 'change' && el.closest('.ctph')) renderForm();   /* 写真のパスを手で直したらサムネを更新 */
  if (!same) markDirty();
}
async function onAction(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const data = draft(), path = JSON.parse(b.dataset.p), i = Number(b.dataset.i), act = b.dataset.act;
  if (act === 'clear') { CL.setAt(data, path, ''); renderForm(); markDirty(); return; }
  let arr = CL.getAt(data, path);
  if (!Array.isArray(arr)) { arr = []; CL.setAt(data, path, arr); }
  if (act === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
  if (act === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
  if (act === 'del') {
    const it = arr[i] || {};
    const what = b.dataset.kind === 'marche' ? `${it.id} ${it.name || ''}` : (it.title || it.k || it.name || `${i + 1} 行目`);
    const warn = b.dataset.kind === 'marche'
      ? `<b>${esc(what)}</b> を削除します。<br>ID はギフト＆ひとことの集計・ご祝儀の引出物と対応しています。すでに選んだ方がいると、その方の回答が商品名なしになります。保存するまで確定しません。`
      : `<b>${esc(what)}</b> を削除します。保存するまで確定しません。`;
    if (!(await confirmBox('行を削除', warn, '削除する'))) return;
    arr.splice(i, 1);
  }
  if (act === 'add') {
    const f = findField(SCHEMA[CT.section], path);
    const item = f?.newItem ? f.newItem() : {};
    if (b.dataset.kind === 'marche') {
      const secObj = CL.getAt(data, path.slice(0, -1));
      item.id = CL.nextMarcheId(secObj, data, secObj?.id === 'hikigashi' ? 's' : 'g');
    }
    arr.push(item);
  }
  renderForm(); markDirty();
}
/* パス（数字は blocks・list の添字）に当たる定義 */
function findField(list, path) {
  let fs = list, f = null;
  for (const k of path) {
    if (typeof k === 'number') continue;
    f = fs.find(x => x.k === k);
    if (!f) return null;
    fs = f.fields || [];
  }
  return f;
}

/* ---------------- 写真 ---------------- */
async function loadThumbs() {
  const imgs = C.$$('#ct-form img[data-key]');
  const need = [...new Set(imgs.map(i => i.dataset.key))].filter(k => !CT.thumbs.has(k));
  for (let i = 0; i < need.length; i += 50) {
    try {
      const j = await api('/api/media/sign', { keys: need.slice(i, i + 50) });
      for (const [k, u] of Object.entries(j.urls)) CT.thumbs.set(k, u);
    } catch { /* 表示できないサムネは「表示できません」になる */ }
  }
  for (const img of C.$$('#ct-form img[data-key]')) img.src = CT.thumbs.get(img.dataset.key) || 'data:,';
}
/* 長辺 1600px を超える・JPEG/PNG/WebP 以外の画像はブラウザで縮小・変換してから送る */
async function shrink(file) {
  const okType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  let bmp;
  try { bmp = await createImageBitmap(file); } catch {
    if (okType && file.size <= IMAGE_MAX) return file;   /* 読めなくてもサーバー側で種類を確かめる */
    throw new Error('画像を読み込めませんでした（JPEG・PNG・WebP にしてください）');
  }
  const edge = Math.max(bmp.width, bmp.height);
  if (okType && edge <= IMAGE_EDGE && file.size <= IMAGE_MAX) { bmp.close?.(); return file; }
  const r = Math.min(1, IMAGE_EDGE / edge);
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * r); cv.height = Math.round(bmp.height * r);
  const type = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
  const g = cv.getContext('2d');
  if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); }
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  const blob = await new Promise(res => cv.toBlob(res, type, IMAGE_QUALITY));
  if (!blob) throw new Error('画像を変換できませんでした');
  if (blob.size > IMAGE_MAX) throw new Error('10MB を超えています');
  return new File([blob], file.name.replace(/\.[^.]*$/, '') + ({ 'image/png': '.png', 'image/webp': '.webp' }[type] || '.jpg'), { type });
}
async function upload(el) {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  const path = JSON.parse(el.dataset.up);
  const section = CT.section, lang = CT.lang;
  const lbl = el.closest('label');
  lbl.classList.add('disabled'); lbl.firstChild.textContent = '送信中…';
  try {
    const f = await shrink(file);
    const fd = new FormData();
    fd.set('section', section); fd.set('file', f, f.name);
    const j = await api('/api/media/image', fd);
    CL.setAt(CT.draft[section][lang], path, j.path);
    C.toast('アップロードしました（保存すると反映されます）', 'ok');
  } catch (e) {
    C.toast('アップロードできませんでした：' + e.message, 'err');
  }
  if (CT.section === section && CT.lang === lang) renderForm();
  markDirty();
}

/* ---------------- 保存 ---------------- */
async function save() {
  const pairs = dirtyPairs();
  if (!pairs.length) { C.toast('変更はありません'); return; }
  /* 検証 */
  const errs = [];
  for (const [s, l] of pairs) for (const m of CL.validate(s, CT.draft[s][l])) errs.push(`${secLabel(s)}（${l}）：${m}`);
  if (errs.length) {
    C.$('#ct-err').innerHTML = `<div class="alert"><b>保存できません</b><ul>${errs.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
    return;
  }
  /* Marché の ID が消えるときは確認 */
  const gone = pairs.filter(([s]) => s === 'marche').flatMap(([s, l]) => CL.removedMarcheIds(row(s, l)?.data, CT.draft[s][l]).map(id => `${id}（${l}）`));
  if (gone.length && !(await confirmBox('Marché の品物を削除して保存',
    `${esc(gone.join('、'))} が無くなります。ギフト＆ひとことの集計で、この ID を選んだ回答は商品名なしになります。`, '保存する'))) return;
  /* ほかの人が先に保存していないか */
  const { data: cur, error: e1 } = await C.sb.from('guide_content').select('section,lang,updated_at,updated_by');
  if (e1) { C.toast('保存できませんでした：' + e1.message, 'err'); return; }
  const changed = pairs.filter(([s, l]) => {
    const now = cur.find(r => r.section === s && r.lang === l);
    return (now?.updated_at || null) !== (row(s, l)?.updated_at || null);
  });
  if (changed.length && !(await confirmBox('ほかの画面で更新されています',
    `${esc(changed.map(([s, l]) => `${secLabel(s)}（${l}）`).join('、'))} は、この画面を開いたあとに別の場所で保存されています。上書きしますか？`, '上書きする'))) return;
  const email = C.me()?.email || null;
  const rows = pairs.map(([s, l]) => ({ section: s, lang: l, data: CT.draft[s][l], updated_by: email }));
  const btn = C.$('#ct-save'); btn.disabled = true;
  const { data, error } = await C.sb.from('guide_content').upsert(rows, { onConflict: 'section,lang' }).select('section,lang,data,updated_at,updated_by');
  btn.disabled = false;
  if (error) { C.toast('保存できませんでした：' + error.message, 'err'); return; }
  for (const r of data) { CT.rows[r.section][r.lang] = r; CT.draft[r.section][r.lang] = CL.clone(r.data); }
  render();
  C.toast(`保存しました（${pairs.length} 件）。ゲスト側には 60 秒ほどで反映されます`, 'ok');
}

/* ---------------- プレビュー ---------------- */
function preview() {
  const page = CL.SECTIONS.find(s => s.id === CT.section)?.page || '';
  const url = `${C.guestSite().replace(/\/+$/, '')}${CT.lang === 'zh' ? '/zh' : ''}/guide/${page}`;
  if (dirtyPairs().length) C.toast('未保存の変更はプレビューに出ません（保存後 60 秒ほどで反映）');
  window.open(url, '_blank', 'noopener');
}

/* ---------------- JSON から取り込む ---------------- */
async function openImport() {
  if (!CT.loaded) await load();
  const box = C.$('#m-ct-box');
  const dirty = dirtyPairs().length;
  box.innerHTML = `<h3>JSON から取り込む</h3>
    <p class="note" style="margin:4px 0 12px">ゲスト側の <code>public/guide/content/guide.&lt;lang&gt;.json</code> を読み、まだ登録されていない項目に入れます。
      すでに内容がある項目は、チェックを入れたものだけ上書きします。ヘルプとひとこと（Thanks）の文言は、JSON に無ければ仕様の既定文を入れます。</p>
    ${dirty ? `<div class="alert">保存していない変更があります。先に保存するか「変更を破棄」してから取り込んでください。</div>` : ''}
    <div class="row">
      <label class="chk1"><input type="radio" name="ct-src" value="bundled" checked><span>管理画面に同梱のコピー（${SOURCE_DATE} 時点）</span></label>
      <label class="chk1"><input type="radio" name="ct-src" value="file"><span>ファイルを選ぶ</span></label>
      <input type="file" id="ct-files" accept="application/json,.json" multiple hidden>
    </div>
    <p class="note" id="ct-srcnote" style="margin:-4px 0 8px">wedding-invitation の guide.ja.json・guide.zh.json を ${SOURCE_DATE} にコピーしたもの（content-source/）。</p>
    <div id="ct-imp"><p class="note">読み込み中…</p></div>
    <div class="row" style="margin:14px 0 0"><span class="sp"></span>
      <button class="btn o" data-close>閉じる</button><button class="btn" id="ct-impgo" disabled>取り込む</button></div>`;
  C.$$('[data-close]', box).forEach(b => b.addEventListener('click', () => C.closeModal('m-ct')));
  let src = {};
  const show = () => renderImport(src, dirty);
  C.$$('input[name=ct-src]', box).forEach(r => r.addEventListener('change', async () => {
    if (r.value === 'bundled') { C.$('#ct-srcnote').hidden = false; src = await bundled(); show(); }
    else { C.$('#ct-srcnote').hidden = true; C.$('#ct-files').click(); }
  }));
  C.$('#ct-files').addEventListener('change', async e => {
    try { src = await fromFiles([...e.target.files]); show(); } catch (err) { C.toast(err.message, 'err'); }
    e.target.value = '';
  });
  C.$('#ct-impgo').addEventListener('click', runImport);
  C.openModal('m-ct');
  try { src = await bundled(); } catch (e) { C.$('#ct-imp').innerHTML = `<p class="note">同梱のコピーを読めませんでした：${esc(e.message)}</p>`; return; }
  show();
}
async function bundled() {
  const out = {};
  for (const l of CL.LANGS) {
    const res = await fetch(`content-source/guide.${l}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`guide.${l}.json: HTTP ${res.status}`);
    out[l] = await res.json();
  }
  return out;
}
async function fromFiles(files) {
  const out = {};
  for (const f of files) {
    const m = /(?:^|[._-])(ja|zh)(?:[._-]|\.json$)/i.exec(f.name);
    if (!m) throw new Error(`${f.name}：ファイル名から言語（ja／zh）が分かりません（guide.ja.json のような名前にしてください）`);
    try { out[m[1].toLowerCase()] = JSON.parse(await f.text()); } catch { throw new Error(`${f.name}：JSON として読めません`); }
  }
  if (!Object.keys(out).length) throw new Error('ファイルが選ばれていません');
  return out;
}
/* 取り込みの候補：DB が空なら投入（既定で ON）、内容が違えば上書き（既定で OFF）、同じなら対象外 */
function importPlan(src) {
  const plan = [];
  for (const s of CL.SECTION_IDS) for (const l of CL.LANGS) {
    const data = src[l] ? CL.fromGuideJson(src[l], s, l) : null;
    const cur = row(s, l)?.data;
    const st = !data ? 'nosrc' : CL.isEmpty(cur) ? 'new' : CL.sameData(cur, data) ? 'same' : 'diff';
    plan.push({ s, l, data, st });
  }
  return plan;
}
function renderImport(src, dirty) {
  const plan = importPlan(src);
  const LBL = { nosrc: '<span class="note">取り込み元なし</span>', new: '<span class="tag ok">未登録 → 投入</span>', same: '<span class="note">同じ内容</span>', diff: '<span class="tag wait">内容あり（違う）</span>' };
  C.$('#ct-imp').innerHTML = `<div class="tblwrap"><table class="cttbl" style="min-width:0"><thead><tr><th></th><th>項目</th><th>言語</th><th>状態</th></tr></thead><tbody>` +
    plan.map((p, i) => `<tr><td><input type="checkbox" data-i="${i}"${p.st === 'new' ? ' checked' : ''}${p.st === 'new' || p.st === 'diff' ? '' : ' disabled'}${dirty ? ' disabled' : ''}></td>
      <td>${esc(secLabel(p.s))}</td><td>${p.l}</td><td>${LBL[p.st]}${p.st === 'diff' ? ' <span class="note">チェックで上書き</span>' : ''}</td></tr>`).join('') + `</tbody></table></div>`;
  const go = C.$('#ct-impgo');
  const upd = () => { go.disabled = !!dirty || !C.$$('#ct-imp input:checked').length; };
  C.$$('#ct-imp input').forEach(c => c.addEventListener('change', upd));
  upd();
  CT.plan = plan;
}
async function runImport() {
  const go = C.$('#ct-impgo');
  const pick = C.$$('#ct-imp input:checked').map(c => CT.plan[Number(c.dataset.i)]);
  if (!pick.length || dirtyPairs().length) return;
  const over = pick.filter(p => p.st === 'diff');
  if (over.length && !(await confirmBox('上書きして取り込む',
    `${esc(over.map(p => `${secLabel(p.s)}（${p.l}）`).join('、'))} は今の内容が JSON の内容で置き換わります。`, '上書きする'))) return;
  const email = C.me()?.email || null;
  go.disabled = true;
  const { data, error } = await C.sb.from('guide_content')
    .upsert(pick.map(p => ({ section: p.s, lang: p.l, data: p.data, updated_by: email })), { onConflict: 'section,lang' })
    .select('section,lang,data,updated_at,updated_by');
  if (error) { go.disabled = false; C.toast('取り込めませんでした：' + error.message, 'err'); return; }
  for (const r of data) { CT.rows[r.section][r.lang] = r; CT.draft[r.section][r.lang] = CL.clone(r.data); }
  C.closeModal('m-ct');
  render();
  C.toast(`${data.length} 件を取り込みました`, 'ok');
}

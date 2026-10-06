/* ============================================================
   06 公開モード・Movies・ギフト＆感想（00_spec/06_modes_admin.md）
   タブ「公開設定」「Movies」「ギフト＆感想」。app.js から setupModes(ctx) で呼ぶ。
   DB（site_modes / movies / gift_feedback / app_settings.site_mode_override）はログインユーザーの supabase-js、
   ファイル（R2 wedding-media）は管理画面 Worker の /api/media/*（Bearer 必須）で読み書きする。
   ============================================================ */
import * as ML from './modes-logic.js';

const PART_SIZE = 50 * 1024 * 1024;
const FILE_MAX = 2 * 1024 * 1024 * 1024;
const POSTER_W = 1280;
const OVERRIDE_KEY = 'site_mode_override';

let C;                    /* app.js から受け取る道具（sb, $, $$, esc, toast, openModal, closeModal, wireClose, giftsFor, openGift） */
const SM = { loaded: false, modes: [], draft: [], removed: [], override: { mode_id: null, note: '' }, dirty: false };
const MV = { loaded: false, list: [], urls: {}, busy: new Map() };
const FB = { loaded: false, rows: [], items: null, view: [] };

export function setupModes(ctx) {
  C = ctx;
  wireSite(); wireMovies(); wireFeedback();
}
/* タブを開いたとき（app.js の go から） */
export function openTab(v) {
  if (v === 'site') loadSite();
  if (v === 'movies') loadMovies();
  if (v === 'feedback') loadFeedback();
}
/* 公開設定の未保存の変更があるときにタブ移動を確認する */
export function leaveGuard(next) {
  if (next === 'site' || !SM.dirty || !C.$('#v-site').classList.contains('on')) return false;
  if (!confirm('公開設定に保存していない変更があります。破棄して移動しますか？')) return true;
  discardSite();
  return false;
}

/* ---------------- 共通 ---------------- */
const esc = s => C.esc(s);
async function token() {
  const { data } = await C.sb.auth.getSession();
  return data.session?.access_token || '';
}
async function api(path, body, init = {}) {
  const res = await fetch(path, {
    method: init.method || 'POST',
    headers: { authorization: `Bearer ${await token()}`, ...(body !== undefined && !(body instanceof Blob) ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
function confirmBox(title, html, okLabel = '削除する') {
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
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const csvCell = v => { const t = String(v ?? ''); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const csvLine = a => a.map(csvCell).join(',');
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

/* ======================= 公開設定 ======================= */
function wireSite() {
  const $ = C.$;
  $('#site-add').addEventListener('click', () => {
    const last = SM.draft[SM.draft.length - 1];
    SM.draft.push({ id: null, slug: '', name: '', starts_at: last?.ends_at || null, ends_at: null, features: ML.normFeatures({}),
                    sort: SM.draft.length + 1, _key: 'n' + Date.now() });
    SM.dirty = true; renderSite();
  });
  $('#site-save').addEventListener('click', saveModes);
  $('#site-discard').addEventListener('click', () => { discardSite(); toast('変更を破棄しました'); });
  $('#site-ovr-save').addEventListener('click', saveOverride);
  $('#site-pv').addEventListener('change', renderPreview);

  const body = $('#site-body');
  body.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr) return;
    const m = SM.draft.find(x => keyOf(x) === tr.dataset.k); if (!m) return;
    const f = e.target.dataset.f;
    if (f === 'name' || f === 'slug') m[f] = e.target.value;
    if (f === 'starts_at' || f === 'ends_at') m[f] = ML.fromJstInput(e.target.value);
    if (f === 'feat') m.features = { ...m.features, [e.target.dataset.feat]: e.target.checked };
    SM.dirty = true;
    renderSiteMeta();
    if (f === 'feat' && C.$('#site-pv').value === keyOf(m)) renderPreview();
  });
  body.addEventListener('click', async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const m = SM.draft.find(x => keyOf(x) === b.dataset.del); if (!m) return;
    const ok = await confirmBox('モードを削除', `「${esc(m.name || m.slug || '（名前なし）')}」を一覧から外します。<br>「保存」を押すまで DB には反映されません。`, '外す');
    if (!ok) return;
    if (m.id) SM.removed.push(m.id);
    SM.draft = SM.draft.filter(x => x !== m);
    SM.draft.forEach((x, i) => { x.sort = i + 1; });
    SM.dirty = true; renderSite();
  });
  /* ドラッグで並べ替え（つまみ ⠿ を掴む） */
  let dragKey = null;
  body.addEventListener('dragstart', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr) return;
    dragKey = tr.dataset.k; tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey);
  });
  body.addEventListener('dragend', e => { e.target.closest('tr')?.classList.remove('dragging'); dragKey = null; C.$$('tr.dropto', body).forEach(t => t.classList.remove('dropto')); });
  body.addEventListener('dragover', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr || !dragKey) return;
    e.preventDefault();
    C.$$('tr.dropto', body).forEach(t => t.classList.remove('dropto')); tr.classList.add('dropto');
  });
  body.addEventListener('drop', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr || !dragKey) return;
    e.preventDefault();
    const from = SM.draft.findIndex(x => keyOf(x) === dragKey), to = SM.draft.findIndex(x => keyOf(x) === tr.dataset.k);
    if (from < 0 || to < 0 || from === to) return;
    const [m] = SM.draft.splice(from, 1); SM.draft.splice(to, 0, m);
    SM.draft.forEach((x, i) => { x.sort = i + 1; });
    SM.dirty = true; renderSite();
  });
}
const keyOf = m => m.id || m._key;
const toast = (m, k) => C.toast(m, k);
const clone = m => ({ ...m, features: ML.normFeatures(m.features) });

async function loadSite() {
  const [m, o] = await Promise.all([
    C.sb.from('site_modes').select('*').order('sort').order('starts_at'),
    C.sb.from('app_settings').select('key,value').eq('key', OVERRIDE_KEY),
  ]);
  if (m.error) { C.$('#site-now').innerHTML = `<p class="warn">読み込めませんでした：${esc(m.error.message)}（マイグレーション未適用の可能性があります）</p>`; return; }
  SM.modes = m.data || [];
  const v = o.data?.[0]?.value || {};
  SM.override = { mode_id: v.mode_id || null, note: v.note || '' };
  SM.loaded = true;
  if (!SM.dirty) discardSite(); else renderSite();
}
function discardSite() {
  SM.draft = SM.modes.map(clone); SM.removed = []; SM.dirty = false;
  renderSite();
}
function renderSite() {
  const rows = SM.draft;
  C.$('#site-head').innerHTML = `<tr><th></th><th>表示名</th><th>slug</th><th>開始（日本時間）</th><th>終了（日本時間）</th>${
    ML.FEATURES.map(([, l]) => `<th class="ctr fcol">${esc(l)}</th>`).join('')}<th></th></tr>`;
  C.$('#site-body').innerHTML = rows.map(m => {
    const endPh = m.ends_at ? '' : (isLatest(m) ? '無期限' : '次のモード開始まで');
    return `<tr data-k="${esc(keyOf(m))}" draggable="true">
      <td class="drag" title="ドラッグで並べ替え">⠿</td>
      <td><input data-f="name" value="${esc(m.name)}" placeholder="例：結婚式後" style="width:110px"></td>
      <td><input data-f="slug" value="${esc(m.slug)}" placeholder="after" style="width:100px" autocapitalize="off" spellcheck="false"></td>
      <td><input data-f="starts_at" type="datetime-local" value="${esc(ML.toJstInput(m.starts_at))}"></td>
      <td><input data-f="ends_at" type="datetime-local" value="${esc(ML.toJstInput(m.ends_at))}">${endPh ? `<div class="note">${endPh}</div>` : ''}</td>
      ${ML.FEATURE_KEYS.map(k => `<td class="ctr"><input type="checkbox" data-f="feat" data-feat="${k}"${m.features[k] ? ' checked' : ''}></td>`).join('')}
      <td><button class="btn link" data-del="${esc(keyOf(m))}">削除</button></td></tr>`;
  }).join('') || `<tr><td colspan="${6 + ML.FEATURE_KEYS.length}" class="note">モードがありません。「＋ モードを追加」から作成してください。</td></tr>`;
  renderSiteMeta();
  fillOverride(); fillPreviewSelect(); renderPreview();
}
/* 終了が空のとき「無期限」か「次のモード開始まで」か（自分より後に始まるモードがあるか） */
const isLatest = m => !SM.draft.some(x => x !== m && x.starts_at && m.starts_at && new Date(x.starts_at) > new Date(m.starts_at));

function renderSiteMeta() {
  /* 現在の状態は保存済みの値で判定する（ゲスト側に出ているのはそれ） */
  const r = ML.resolveMode(SM.modes, SM.override.mode_id);
  const fixed = r.via === 'override';
  const label = r.closed
    ? `<b class="closedtxt">公開期間外（ゲスト向けは 404）</b>`
    : `<b>${esc(r.mode.name || r.mode.slug)}</b>${r.via === 'before' ? '（最初のモードの開始前）' : ''}`;
  C.$('#site-now').innerHTML = `<div class="row" style="margin:0"><span>現在のモード：</span>${label}
    ${fixed ? '<span class="badge-red">手動固定</span>' : '<span class="tag">自動判定</span>'}
    <span class="sp"></span><span class="note">保存してからゲスト側（/api/config）に反映されるまで最大 60 秒かかります</span></div>`;
  C.$('#site-dirty').hidden = !SM.dirty;
  const warn = [];
  const slugs = new Map();
  SM.draft.forEach(m => {
    if (m.slug && !ML.SLUG_RE.test(m.slug)) warn.push(`slug「${m.slug}」は英小文字・数字・ハイフンだけにしてください`);
    if (m.slug) { if (slugs.has(m.slug)) warn.push(`slug「${m.slug}」が重複しています`); slugs.set(m.slug, 1); }
    if (!m.starts_at) warn.push(`「${m.name || m.slug || '新しいモード'}」の開始日時を入れてください`);
  });
  for (const w of ML.periodWarnings(SM.draft.filter(m => m.starts_at))) warn.push(w.text);
  C.$('#site-warn').innerHTML = warn.map(w => `<div class="warnline">⚠ ${esc(w)}</div>`).join('');
}
function fillOverride() {
  const sel = C.$('#site-ovr');
  sel.innerHTML = `<option value="">自動（期間で判定）</option>` +
    SM.modes.map(m => `<option value="${esc(m.id)}">${esc(m.name || m.slug)}（${esc(m.slug)}）</option>`).join('') +
    `<option value="${ML.OVERRIDE_CLOSED}">公開期間外（ゲスト向けはすべて 404）</option>`;
  sel.value = SM.override.mode_id && (SM.override.mode_id === ML.OVERRIDE_CLOSED || SM.modes.some(m => m.id === SM.override.mode_id)) ? SM.override.mode_id : '';
  C.$('#site-ovr-note').value = SM.override.note || '';
  C.$('#site-ovr-badge').innerHTML = SM.override.mode_id ? '<span class="badge-red">固定中</span>' : '';
}
function fillPreviewSelect() {
  const sel = C.$('#site-pv'), cur = sel.value;
  sel.innerHTML = `<option value="__now">現在（保存済みの設定で判定）</option>` +
    SM.draft.map(m => `<option value="${esc(keyOf(m))}">${esc(m.name || m.slug || '新しいモード')}</option>`).join('') +
    `<option value="__closed">公開期間外</option>`;
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : '__now';
}
function renderPreview() {
  const v = C.$('#site-pv').value;
  let p;
  if (v === '__closed') p = ML.preview({}, true);
  else if (v === '__now') { const r = ML.resolveMode(SM.modes, SM.override.mode_id); p = ML.preview(r.mode?.features, r.closed); }
  else p = ML.preview(SM.draft.find(m => keyOf(m) === v)?.features);
  const li = a => a.length ? a.map(x => `<li>${esc(x)}</li>`).join('') : '<li class="note">なし</li>';
  C.$('#site-pv-out').innerHTML = p.closed
    ? '<p><b class="closedtxt">すべて 404</b>（/、/zh/、/guide/*、/api/*、/media/*）</p>'
    : `<div class="pvgrid">
        <div><b>招待状ページ（/、/zh/）</b><ul>${li(p.invitation)}</ul></div>
        ${p.guide ? `<div><b>Guide トップの入口カード</b><ul>${li(p.cards)}</ul></div>
        <div><b>下ナビ（最大5つ）</b><ul>${li(p.nav)}</ul></div>
        <div><b>開くページ</b><ul>${li(p.open)}</ul><b>「現在ご覧いただけません」と出るページ</b><ul>${li(p.off)}</ul></div>`
        : '<div><b>Wedding Guide（/guide/*）</b><ul><li>404</li></ul></div>'}
      </div>`;
}
async function saveModes() {
  const errs = [];
  const slugs = new Set();
  for (const m of SM.draft) {
    const nm = m.name || m.slug || '新しいモード';
    if (!String(m.name || '').trim()) errs.push(`表示名が空のモードがあります`);
    if (!ML.SLUG_RE.test(m.slug || '')) errs.push(`「${nm}」の slug は英小文字・数字・ハイフンで入れてください`);
    if (slugs.has(m.slug)) errs.push(`slug「${m.slug}」が重複しています`);
    slugs.add(m.slug);
    if (!m.starts_at) errs.push(`「${nm}」の開始日時を入れてください`);
  }
  if (errs.length) { toast(errs[0], 'err'); return; }
  const btn = C.$('#site-save'); btn.disabled = true;
  try {
    const row = m => ({ slug: m.slug.trim(), name: m.name.trim(), starts_at: m.starts_at, ends_at: m.ends_at || null,
                        features: ML.normFeatures(m.features), sort: m.sort });
    if (SM.removed.length) {
      const { error } = await C.sb.from('site_modes').delete().in('id', SM.removed);
      if (error) throw error;
      if (SM.removed.includes(SM.override.mode_id)) await writeOverride({ mode_id: null, note: SM.override.note });
    }
    for (const m of SM.draft.filter(x => x.id)) {
      const { error } = await C.sb.from('site_modes').update(row(m)).eq('id', m.id);
      if (error) throw error;
    }
    const fresh = SM.draft.filter(x => !x.id).map(row);
    if (fresh.length) { const { error } = await C.sb.from('site_modes').insert(fresh); if (error) throw error; }
    SM.dirty = false;
    toast('公開モードを保存しました（ゲスト側への反映は最大 60 秒後）', 'ok');
    await loadSite();
  } catch (e) {
    toast('保存に失敗しました：' + (e.message || e), 'err');
  } finally { btn.disabled = false; }
}
async function writeOverride(v) {
  const { error } = await C.sb.from('app_settings').upsert({ key: OVERRIDE_KEY, value: v }, { onConflict: 'key' });
  if (error) throw error;
  SM.override = v;
}
async function saveOverride() {
  const v = { mode_id: C.$('#site-ovr').value || null, note: C.$('#site-ovr-note').value.trim() };
  try {
    await writeOverride(v);
    toast(v.mode_id ? '手動固定を保存しました（反映は最大 60 秒後）' : '自動判定に戻しました（反映は最大 60 秒後）', 'ok');
    renderSite();
  } catch (e) { toast('保存に失敗しました：' + (e.message || e), 'err'); }
}

/* ======================= Movies ======================= */
function wireMovies() {
  const $ = C.$;
  $('#mv-add').addEventListener('click', addMovie);
  const list = $('#mv-list');
  list.addEventListener('change', async e => {
    const card = e.target.closest('[data-mv]'); if (!card) return;
    const m = MV.list.find(x => x.id === card.dataset.mv); if (!m) return;
    const f = e.target.dataset.f;
    if (['title_ja', 'title_zh', 'note_ja', 'note_zh'].includes(f)) {
      const v = e.target.value.trim();
      if (f === 'title_ja' && !v) { toast('タイトル（日本語）は必須です', 'err'); e.target.value = m.title_ja; return; }
      await patchMovie(m, { [f]: v || null });
    }
    if (f === 'visible') await patchMovie(m, { visible: e.target.checked });
    if (f === 'label') C.$('.mv-label-free', card).hidden = e.target.value !== '__free';
    if (f === 'file' && e.target.files[0]) startUpload(m, card, e.target.files[0]).finally(() => { e.target.value = ''; });
    if (f === 'poster' && e.target.files[0]) posterFromImage(m, e.target.files[0]).finally(() => { e.target.value = ''; });
  });
  list.addEventListener('click', async e => {
    const card = e.target.closest('[data-mv]'); if (!card) return;
    const m = MV.list.find(x => x.id === card.dataset.mv); if (!m) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'up' || b.dataset.act === 'down') moveMovie(m, b.dataset.act === 'up' ? -1 : 1);
    if (b.dataset.act === 'del') deleteMovie(m);
    if (b.dataset.act === 'delvar') deleteVariant(m, b.dataset.label);
    if (b.dataset.act === 'cancel') MV.busy.get(m.id)?.cancel();
    if (b.dataset.act === 'frame') posterFromVideo(m);
  });
}
async function loadMovies() {
  const { data, error } = await C.sb.from('movies').select('*').order('sort').order('created_at');
  if (error) { C.$('#mv-list').innerHTML = `<p class="warn">読み込めませんでした：${esc(error.message)}（マイグレーション未適用の可能性があります）</p>`; return; }
  MV.list = data || []; MV.loaded = true;
  await signMovieUrls();
  renderMovies();
}
async function signMovieUrls() {
  const keys = [...new Set(MV.list.flatMap(m => [m.poster_key, ...(m.variants || []).map(v => v.key)]).filter(Boolean))];
  if (!keys.length) { MV.urls = {}; return; }
  try { MV.urls = (await api('/api/media/sign', { keys })).urls || {}; }
  catch (e) { MV.urls = {}; toast('ファイルの URL を取得できませんでした：' + e.message, 'err'); }
}
const ver = m => `&v=${new Date(m.updated_at || 0).getTime()}`;
function renderMovies() {
  const host = C.$('#mv-list');
  if (!MV.list.length) { host.innerHTML = '<p class="note">ムービーがありません。上の「追加」から作成してください。</p>'; return; }
  host.innerHTML = MV.list.map((m, i) => {
    const busy = MV.busy.get(m.id);
    const posterUrl = m.poster_key && MV.urls[m.poster_key] ? MV.urls[m.poster_key] + ver(m) : '';
    const vars = (m.variants || []);
    return `<div class="panel mvcard" data-mv="${esc(m.id)}">
      <div class="mvgrid">
        <div class="mvposter">${posterUrl ? `<img src="${esc(posterUrl)}" alt="">` : '<div class="mvnone">ポスターなし</div>'}
          <label class="btn o s mvfile">画像からポスター<input type="file" accept="image/*" data-f="poster" hidden></label>
          <button class="btn o s" data-act="frame"${vars.length ? '' : ' disabled title="動画をアップロードすると使えます"'}>動画の場面から</button></div>
        <div class="mvmain">
          <div class="row" style="margin:0 0 6px"><code>${esc(m.slug)}</code>
            <label class="chk1"><input type="checkbox" data-f="visible"${m.visible ? ' checked' : ''}><span>ゲストに表示</span></label>
            <span class="note">長さ ${esc(ML.fmtDuration(m.duration_sec) || '—')}</span><span class="sp"></span>
            <button class="btn o s" data-act="up"${i === 0 ? ' disabled' : ''} title="上へ">↑</button>
            <button class="btn o s" data-act="down"${i === MV.list.length - 1 ? ' disabled' : ''} title="下へ">↓</button>
            <button class="btn link" data-act="del">削除</button></div>
          <div class="two">
            <div class="f"><label>タイトル（日本語）</label><input data-f="title_ja" value="${esc(m.title_ja)}"></div>
            <div class="f"><label>タイトル（中文）</label><input data-f="title_zh" value="${esc(m.title_zh || '')}"></div>
            <div class="f"><label>説明（日本語）</label><textarea data-f="note_ja" rows="2">${esc(m.note_ja || '')}</textarea></div>
            <div class="f"><label>説明（中文）</label><textarea data-f="note_zh" rows="2">${esc(m.note_zh || '')}</textarea></div>
          </div>
          <div class="mvvars"><b>バリアント</b>${vars.length ? `<table><thead><tr><th>ラベル</th><th>解像度</th><th class="num">サイズ</th><th>キー</th><th></th></tr></thead><tbody>${
            vars.map(v => `<tr><td>${MV.urls[v.key] ? `<a href="${esc(MV.urls[v.key] + ver(m))}" target="_blank" rel="noopener">${esc(v.label)}</a>` : esc(v.label)}</td>
              <td>${v.width && v.height ? `${v.width}×${v.height}` : ''}</td><td class="num">${esc(ML.fmtBytes(v.bytes))}</td>
              <td class="note">${esc(v.key)}</td><td><button class="btn link" data-act="delvar" data-label="${esc(v.label)}">削除</button></td></tr>`).join('')}</tbody></table>`
            : '<span class="note">　まだありません</span>'}</div>
          <div class="row mvup" style="margin:8px 0 0">
            <select data-f="label"><option value="720p">720p</option><option value="1080p">1080p</option><option value="__free">自由入力</option></select>
            <input class="mv-label-free" data-f="label_free" placeholder="ラベル（英数字）" style="width:120px" hidden>
            <label class="btn s mvfile${busy ? ' disabled' : ''}">MP4 を選んでアップロード<input type="file" accept="video/mp4,.mp4" data-f="file" hidden${busy ? ' disabled' : ''}></label>
            <span class="note">同じラベルは上書き。H.264/AAC・faststart の MP4、1 ファイル 2GB まで</span>
          </div>
          <div class="mvprog"${busy ? '' : ' hidden'}><div class="bar"><i style="width:${busy ? busy.pct : 0}%"></i></div>
            <span class="note mvprogtx">${busy ? esc(busy.text) : ''}</span> <button class="btn link" data-act="cancel">中断</button></div>
        </div>
      </div></div>`;
  }).join('');
}
async function patchMovie(m, patch) {
  const { data, error } = await C.sb.from('movies').update(patch).eq('id', m.id).select().single();
  if (error) { toast('保存に失敗しました：' + error.message, 'err'); return false; }
  Object.assign(m, data);
  toast('保存しました', 'ok');
  return true;
}
async function addMovie() {
  const slug = C.$('#mv-slug').value.trim(), title = C.$('#mv-title').value.trim();
  if (!ML.SLUG_RE.test(slug)) { toast('slug は英小文字・数字・ハイフンで入れてください', 'err'); return; }
  if (!title) { toast('タイトル（日本語）を入れてください', 'err'); return; }
  const sort = Math.max(0, ...MV.list.map(m => m.sort || 0)) + 1;
  const { error } = await C.sb.from('movies').insert({ slug, title_ja: title, sort });
  if (error) { toast('追加に失敗しました：' + error.message, 'err'); return; }
  C.$('#mv-slug').value = ''; C.$('#mv-title').value = '';
  toast(`「${title}」を追加しました`, 'ok');
  loadMovies();
}
async function moveMovie(m, dir) {
  const i = MV.list.indexOf(m), j = i + dir, o = MV.list[j];
  if (!o) return;
  MV.list.splice(i, 1); MV.list.splice(j, 0, m);
  const updates = MV.list.map((x, k) => ({ x, sort: k + 1 })).filter(u => u.x.sort !== u.sort);
  for (const u of updates) {
    const { error } = await C.sb.from('movies').update({ sort: u.sort }).eq('id', u.x.id);
    if (error) { toast('並べ替えに失敗しました：' + error.message, 'err'); break; }
    u.x.sort = u.sort;
  }
  renderMovies();
}
async function deleteMovie(m) {
  if (MV.busy.has(m.id)) { toast('アップロード中は削除できません', 'err'); return; }
  const ok = await confirmBox('ムービーを削除', `「${esc(m.title_ja)}」の行と、R2 のファイル（<code>movies/${esc(m.slug)}/</code> 配下の動画・ポスター）をすべて削除します。元に戻せません。`);
  if (!ok) return;
  try {
    await api('/api/media/delete', { prefix: `movies/${m.slug}/` });
    const { error } = await C.sb.from('movies').delete().eq('id', m.id);
    if (error) throw error;
    toast('削除しました', 'ok');
    loadMovies();
  } catch (e) { toast('削除に失敗しました：' + (e.message || e), 'err'); }
}
async function deleteVariant(m, label) {
  const v = (m.variants || []).find(x => x.label === label); if (!v) return;
  const ok = await confirmBox('バリアントを削除', `「${esc(m.title_ja)}」の ${esc(label)}（${esc(v.key)}）を削除します。`);
  if (!ok) return;
  try {
    await api('/api/media/delete', { key: v.key });
    const variants = m.variants.filter(x => x.label !== label);
    await patchMovie(m, { variants, ...(variants.length ? {} : { duration_sec: null }) });
    await signMovieUrls(); renderMovies();
  } catch (e) { toast('削除に失敗しました：' + (e.message || e), 'err'); }
}

/* ---- アップロード（R2 マルチパート：init → part × n → complete） ---- */
function putPart(url, blob, onProgress, xhrRef) {
  return new Promise(async (resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.xhr = xhr;
    xhr.open('PUT', url);
    xhr.setRequestHeader('authorization', `Bearer ${await token()}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      let j = {}; try { j = JSON.parse(xhr.responseText); } catch {}
      xhr.status >= 200 && xhr.status < 300 ? resolve(j) : reject(new Error(j.error || `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(blob);
  });
}
async function startUpload(m, card, file) {
  if (MV.busy.has(m.id)) return;
  const sel = C.$('[data-f="label"]', card).value;
  const label = sel === '__free' ? C.$('[data-f="label_free"]', card).value.trim() : sel;
  if (!ML.LABEL_RE.test(label)) { toast('ラベルは英数字・ハイフン・アンダーバー（20字まで）にしてください', 'err'); return; }
  if (file.type !== 'video/mp4' && !/\.mp4$/i.test(file.name)) { toast('MP4（video/mp4）だけを受け付けます', 'err'); return; }
  if (file.size > FILE_MAX) { toast('1 ファイル 2GB までです', 'err'); return; }
  if ((m.variants || []).some(v => v.label === label)
      && !(await confirmBox('上書きの確認', `「${esc(m.title_ja)}」の ${esc(label)} はアップロード済みです。新しいファイルで上書きしますか？`, '上書きする'))) return;

  const key = ML.movieKey(m.slug, label);
  const st = { pct: 0, text: '準備中…', cancelled: false, xhr: null, uploadId: null,
               cancel() { this.cancelled = true; this.xhr?.abort(); } };
  MV.busy.set(m.id, st);
  const show = () => {
    const c = C.$(`[data-mv="${m.id}"]`); if (!c) return;
    const pg = C.$('.mvprog', c); pg.hidden = false;
    C.$('.bar i', pg).style.width = st.pct + '%';
    C.$('.mvprogtx', pg).textContent = st.text;
  };
  renderMovies(); show();
  const t0 = Date.now();
  try {
    const meta = videoMeta(file);
    const init = await api('/api/media/init', { key, content_type: 'video/mp4' });
    st.uploadId = init.uploadId;
    const size = init.partSize || PART_SIZE, n = Math.ceil(file.size / size), parts = [];
    for (let i = 0; i < n; i++) {
      if (st.cancelled) throw new Error('aborted');
      const blob = file.slice(i * size, Math.min(file.size, (i + 1) * size));
      const url = `/api/media/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(init.uploadId)}&partNumber=${i + 1}`;
      let res, tries = 0;
      for (;;) {
        try {
          res = await putPart(url, blob, loaded => {
            const done = i * size + loaded;
            st.pct = Math.min(99, Math.round(done / file.size * 100));
            const sec = (Date.now() - t0) / 1000, mbps = done / 1024 / 1024 / Math.max(sec, 0.1);
            st.text = `${ML.fmtBytes(done)} / ${ML.fmtBytes(file.size)}（${st.pct}%・${mbps.toFixed(1)} MB/秒・パート ${i + 1}/${n}）`;
            show();
          }, st);
          break;
        } catch (e) {
          if (st.cancelled || e.message === 'aborted' || ++tries >= 3) throw e;
          st.text = `パート ${i + 1} を再送中…（${tries}/2）`; show();
          await new Promise(r => setTimeout(r, 1500 * tries));
        }
      }
      parts.push({ partNumber: res.partNumber, etag: res.etag });
    }
    st.text = '仕上げ中…'; show();
    const done = await api('/api/media/complete', { key, uploadId: init.uploadId, parts });
    const info = await meta;
    const variants = ML.upsertVariant(m.variants, { label, key, bytes: done.size || file.size, width: info.width || null,
                                                    height: info.height || null, content_type: 'video/mp4' });
    const patch = { variants };
    if (info.duration) patch.duration_sec = Math.round(info.duration);
    MV.busy.delete(m.id);
    await patchMovie(m, patch);
    toast(`${label} をアップロードしました（${ML.fmtBytes(file.size)}）`, 'ok');
  } catch (e) {
    MV.busy.delete(m.id);
    if (st.uploadId) api('/api/media/abort', { key, uploadId: st.uploadId }).catch(() => {});
    toast(st.cancelled || e.message === 'aborted' ? 'アップロードを中断しました' : 'アップロードに失敗しました：' + e.message, st.cancelled ? '' : 'err');
  }
  await signMovieUrls(); renderMovies();
}
/* 長さ・縦横はブラウザで手元のファイルを読んで取る */
function videoMeta(file) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const end = r => { URL.revokeObjectURL(url); resolve(r); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => end({ duration: Number.isFinite(v.duration) ? v.duration : null, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => end({});
    setTimeout(() => end({}), 20000);
    v.src = url;
  });
}

/* ---- ポスター（幅 1280 の JPEG、movies/<slug>/poster.jpg） ---- */
function toJpeg(source, w, h) {
  const scale = Math.min(1, POSTER_W / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('jpeg')), 'image/jpeg', 0.86));
}
async function putPoster(m, blob) {
  await api(`/api/media/object?key=${encodeURIComponent(ML.posterKey(m.slug))}`, blob, { method: 'PUT', headers: { 'content-type': 'image/jpeg' } });
  await patchMovie(m, { poster_key: ML.posterKey(m.slug) });
  await signMovieUrls(); renderMovies();
  toast('ポスターを保存しました', 'ok');
}
async function posterFromImage(m, file) {
  if (!file.type.startsWith('image/')) { toast('画像ファイルを選んでください', 'err'); return; }
  try {
    const bmp = await createImageBitmap(file);
    await putPoster(m, await toJpeg(bmp, bmp.width, bmp.height));
  } catch (e) { toast('ポスターの保存に失敗しました：' + (e.message || e), 'err'); }
}
function posterFromVideo(m) {
  const vars = m.variants || [];
  if (!vars.length) return;
  const v0 = vars.find(v => v.label === '720p') || vars[0];   /* 軽い 720p があればそれで選ぶ */
  const box = C.$('#m-mv-box');
  box.innerHTML = `<h3>${esc(m.title_ja)}：ポスターにする場面を選ぶ</h3>
    <div class="row" style="margin:6px 0"><select id="mvf-var">${vars.map(v => `<option value="${esc(v.key)}"${v === v0 ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
      <span class="note">再生・シークして、ポスターにしたい場面で一時停止してください</span></div>
    <video id="mvf-video" controls playsinline preload="metadata" style="width:100%;background:#000;max-height:60vh"></video>
    <div class="row" style="margin:10px 0 0"><span class="sp"></span><button class="btn o" data-close>閉じる</button>
      <button class="btn" id="mvf-go">この場面をポスターに</button></div>`;
  C.wireClose(box);
  const video = C.$('#mvf-video', box);
  const load = k => { video.src = MV.urls[k] || ''; };
  load(v0.key);
  C.$('#mvf-var', box).addEventListener('change', e => load(e.target.value));
  C.$('#mvf-go', box).addEventListener('click', async e => {
    if (!video.videoWidth) { toast('動画を読み込んでから押してください', 'err'); return; }
    e.target.disabled = true;
    try { await putPoster(m, await toJpeg(video, video.videoWidth, video.videoHeight)); video.pause(); C.closeModal('m-mv'); }
    catch (err) { toast('ポスターの保存に失敗しました：' + (err.message || err), 'err'); }
    finally { e.target.disabled = false; }
  });
  /* 閉じたら再生を止めて読み込みも切る（モーダルの外側クリック・Esc・閉じるボタンのどれでも） */
  const modal = C.$('#m-mv');
  const watch = new MutationObserver(() => {
    if (modal.classList.contains('on')) return;
    watch.disconnect(); video.pause(); video.removeAttribute('src'); video.load();
  });
  watch.observe(modal, { attributes: true, attributeFilter: ['class'] });
  C.openModal('m-mv');
}

/* ======================= ギフト＆感想 ======================= */
function wireFeedback() {
  const $ = C.$;
  for (const id of ['#fb-q', '#fb-table', '#fb-item']) $(id).addEventListener('input', renderFeedbackList);
  $('#fb-csv').addEventListener('click', () => {
    if (!FB.view.length) { toast('書き出す行がありません', 'err'); return; }
    const items = FB.items?.items || {};
    download(`gift_feedback_${stamp()}.csv`, '﻿' + [csvLine(ML.FEEDBACK_CSV_COLS), ...FB.view.map(r => csvLine(ML.feedbackCsvRow(r, items)))].join('\r\n'));
    toast(`${FB.view.length} 件を書き出しました`, 'ok');
  });
  $('#fb-body').addEventListener('click', async e => {
    const del = e.target.closest('[data-fbdel]');
    if (del) { e.stopPropagation(); deleteFeedback(del.dataset.fbdel); return; }
    const tr = e.target.closest('tr[data-fb]'); if (!tr) return;
    openFeedbackGift(FB.rows.find(r => r.id === tr.dataset.fb));
  });
}
async function loadFeedback() {
  if (!FB.items) {
    try { FB.items = await (await fetch('./marche-items.json', { cache: 'no-cache' })).json(); }
    catch { FB.items = { items: {}, photoBase: '' }; }
  }
  const { data, error } = await C.sb.from('gift_feedback').select('*').order('created_at', { ascending: false });
  if (error) { C.$('#fb-body').innerHTML = `<tr><td colspan="9" class="warn">読み込めませんでした：${esc(error.message)}（マイグレーション未適用の可能性があります）</td></tr>`; return; }
  FB.rows = data || []; FB.loaded = true;
  fillFeedbackFilters(); renderFeedbackSummary(); renderFeedbackList();
}
const itemName = id => { const it = FB.items?.items?.[id]; return it ? [it.brand, it.name].filter(Boolean).join(' ') : (id || ''); };
function fillFeedbackFilters() {
  const tSel = C.$('#fb-table'), tCur = tSel.value;
  const tables = [...new Set(FB.rows.map(r => r.table_label).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
  tSel.innerHTML = `<option value="">卓：すべて</option>${tables.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}<option value="__none">卓なし（自由入力）</option>`;
  tSel.value = tCur;
  const iSel = C.$('#fb-item'), iCur = iSel.value, items = Object.values(FB.items?.items || {});
  const group = (sec, label) => `<optgroup label="${label}">${items.filter(i => i.section === sec).map(i => `<option value="${esc(i.id)}">${esc(i.id)} ${esc(itemName(i.id))}</option>`).join('')}</optgroup>`;
  iSel.innerHTML = `<option value="">商品：すべて</option>${group('hikidemono', '引出物')}${group('hikigashi', '引菓子')}`;
  iSel.value = iCur;
}
function renderFeedbackSummary() {
  const items = FB.items?.items || {}, base = FB.items?.photoBase || '';
  const block = (field, sec, title) => {
    const c = ML.countItems(FB.rows, field, items, sec);
    const max = Math.max(1, ...c.list.map(x => x.n));
    return `<div class="panel"><b>${title}</b> <span class="note">回答 ${c.total} 件</span>
      <table class="fbsum"><tbody>${c.list.map(x => `<tr>
        <td class="fbthumb">${x.item?.photo ? `<img src="${esc(base + x.item.photo)}" alt="" loading="lazy">` : ''}</td>
        <td><span class="note">${esc(x.id)}</span> ${esc(itemName(x.id))}</td>
        <td class="fbbar"><div class="bar"><i style="width:${x.n / max * 100}%"></i></div></td><td class="num"><b>${x.n}</b></td></tr>`).join('')}
        <tr><td></td><td class="note">選ばなかった／覚えていない</td><td></td><td class="num">${c.none}</td></tr></tbody></table></div>`;
  };
  C.$('#fb-sum').innerHTML = block('hikidemono_id', 'hikidemono', '引出物') + block('hikigashi_id', 'hikigashi', '引菓子');
  C.$('#fb-cards').innerHTML = `<div class="card"><div class="k">回答</div><div class="v">${FB.rows.length}</div></div>
    <div class="card"><div class="k">ひとこと付き</div><div class="v">${FB.rows.filter(r => r.message).length}</div></div>
    <div class="card"><div class="k">自由入力（候補外）</div><div class="v">${FB.rows.filter(r => !r.reply_person_id).length}</div></div>`;
}
function renderFeedbackList() {
  FB.view = ML.filterFeedback(FB.rows, { q: C.$('#fb-q').value, table: C.$('#fb-table').value, item: C.$('#fb-item').value });
  C.$('#fb-body').innerHTML = FB.view.map(r => `<tr data-fb="${esc(r.id)}" class="clickrow" title="クリックで内祝い記録（ご祝儀）を探す">
    <td class="nowrap">${esc(ML.fmtJst(r.created_at))}</td>
    <td>${esc(r.guest_name)}${r.reply_person_id ? '' : ' <span class="tag wait" title="候補から選ばずに入力">自由入力</span>'}${r.email ? `<div class="note">${esc(r.email)}</div>` : ''}</td>
    <td>${esc(r.table_label || '')}</td>
    <td>${r.hikidemono_id ? `<span class="note">${esc(r.hikidemono_id)}</span> ${esc(itemName(r.hikidemono_id))}` : '<span class="note">—</span>'}</td>
    <td>${r.hikigashi_id ? `<span class="note">${esc(r.hikigashi_id)}</span> ${esc(itemName(r.hikigashi_id))}` : '<span class="note">—</span>'}</td>
    <td class="fbmsg">${esc(r.message || '')}</td>
    <td>${r.lang === 'zh' ? '中文' : '日本語'}</td>
    <td>${giftTag(r)}</td>
    <td><button class="btn link" data-fbdel="${esc(r.id)}">削除</button></td></tr>`).join('')
    || '<tr><td colspan="9" class="note">該当する回答はありません</td></tr>';
  C.$('#fb-count').textContent = `${FB.view.length} 件を表示（全 ${FB.rows.length} 件）`;
}
const giftTag = r => (C.giftsFor(r).length ? '<span class="tag ok">記録あり</span>' : '<span class="tag">未登録</span>');
function openFeedbackGift(r) {
  if (!r) return;
  const rows = C.giftsFor(r);
  const box = C.$('#m-fb-box');
  box.innerHTML = `<h3>${esc(r.guest_name)}</h3>
    <p class="note">${esc(ML.fmtJst(r.created_at))}${r.table_label ? ` ・ 卓 ${esc(r.table_label)}` : ''} ・ ${r.lang === 'zh' ? '中文' : '日本語'}</p>
    <div class="f"><label>お持ち帰りいただいた品</label>
      <div>引出物：${r.hikidemono_id ? esc(itemName(r.hikidemono_id)) : '選ばなかった／覚えていない'}</div>
      <div>引菓子：${r.hikigashi_id ? esc(itemName(r.hikigashi_id)) : '選ばなかった／覚えていない'}</div></div>
    ${r.message ? `<div class="f"><label>ひとこと</label><div class="fbmsgbox">${esc(r.message)}</div></div>` : ''}
    <div class="f"><label>内祝い記録（ご祝儀タブ）</label>${rows.length
      ? rows.map(g => `<div class="row" style="margin:4px 0"><span>${esc(g.label)}</span><span class="sp"></span><button class="btn s" data-gift="${esc(g.id)}">ご祝儀を開く</button></div>`).join('')
      : '<div>未登録（同じ名前のご祝儀の記録はありません）</div>'}</div>
    <div class="row" style="margin:12px 0 0"><span class="sp"></span><button class="btn o" data-close>閉じる</button></div>`;
  C.wireClose(box);
  C.$$('[data-gift]', box).forEach(b => b.addEventListener('click', () => { C.closeModal('m-fb'); C.openGift(b.dataset.gift); }));
  C.openModal('m-fb');
}
async function deleteFeedback(id) {
  const r = FB.rows.find(x => x.id === id); if (!r) return;
  const ok = await confirmBox('回答を削除', `${esc(r.guest_name)} さんの回答（${esc(ML.fmtJst(r.created_at))}）を削除します。元に戻せません。`);
  if (!ok) return;
  const { error } = await C.sb.from('gift_feedback').delete().eq('id', id);
  if (error) { toast('削除に失敗しました：' + error.message, 'err'); return; }
  toast('削除しました', 'ok');
  loadFeedback();
}

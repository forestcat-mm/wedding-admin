import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CATEGORIES, sortItems, summarize, groupItems, diffOf, hasDiff, fmtDiff, parseQty, matches, mergeRemote }
  from './gift-logic.js';

/* ============================================================
   臨時ページ：引出物・引菓子 確認リスト（gift_check_items）
   読み書きは管理画面と同じくログインユーザーの supabase-js で行う（RLS は authenticated のみ）
   仕様：00_spec/07_gift-check.md
   ============================================================ */
const SUPA_URL = 'https://cvnqnvnppvfhwmrehagt.supabase.co';
const SUPA_KEY = 'sb_publishable_ZYwTP155dx57wEopKpezNA_LR1IOjID';
const MAIL_DOMAIN = '@forest-mm.com';
const TABLE = 'gift_check_items';
const REFRESH_MS = 10 * 1000;
const TYPE_DELAY_MS = 700;      /* 実数・メモは入力が止まってから保存 */

const sb = createClient(SUPA_URL, SUPA_KEY);

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const yen = n => '¥' + Number(n || 0).toLocaleString('ja-JP');
const hm = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const fmtDT = iso => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const shortMail = m => String(m || '').replace(MAIL_DOMAIN, '');

function toast(msg, kind = '') {
  const d = document.createElement('div');
  if (kind) d.className = kind;
  d.textContent = msg;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), kind === 'err' ? 6000 : 3200);
}

/* ============================== 状態 ============================== */
const S = {
  me: null,
  rows: [],                 /* 表示中の値（ローカルの編集を含む） */
  filter: { mode: 'all', cat: 'all' },
  keep: new Set(),          /* 絞り込みを変えるまで残す行（操作した直後に消えないように） */
  pending: new Map(),       /* id → 未送信の patch */
  timers: new Map(),        /* id → 保存待ちのタイマー */
  saving: new Set(),
  failed: new Set(),
  lastWriteAt: new Map(),   /* id → 最後に保存を送った時刻（再取得の上書き防止） */
};
const byId = id => S.rows.find(r => r.id === id);
const rowEl = id => $(`.gc-row[data-id="${CSS.escape(id)}"]`);
/* 入力中・保存待ち・保存中・保存失敗の行はサーバー値で上書きしない */
function busyIds() {
  const s = new Set([...S.timers.keys(), ...S.saving, ...S.failed, ...S.pending.keys()]);
  const f = document.activeElement?.closest?.('.gc-row');
  if (f) s.add(f.dataset.id);
  return s;
}

/* ============================== 認証 ============================== */
/* 管理ページと同じガード：Supabase Auth のセッション＋管理者判定（Worker の /api/reception/me が via=admin を返すこと）。
   セッションがなく受付トークンの Cookie で開いた端末は、ログインフォームではなく権限不足を出す */
async function boot() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    if (await isAdmin(data.session)) { await enter(data.session.user); return; }
    showNoPerm('admin');
    return;
  }
  let via = null;
  try {
    const res = await fetch('/api/reception/me', { credentials: 'same-origin', cache: 'no-store' });
    if (res.ok) via = (await res.json()).via;
  } catch {}
  if (via === 'token') { showNoPerm('token'); return; }
  $('#lg-box').hidden = false;
  $('#lg-id').focus();
}
async function isAdmin(session) {
  try {
    const res = await fetch('/api/reception/me', {
      headers: { authorization: `Bearer ${session.access_token}` }, credentials: 'omit', cache: 'no-store' });
    if (res.ok) return (await res.json()).via === 'admin';
    if (res.status === 401) return false;
  } catch {}
  /* Worker に届かないとき（静的サーバーでの確認など）はログインのドメインで判定する */
  return String(session.user?.email || '').toLowerCase().endsWith(MAIL_DOMAIN);
}
function showNoPerm(kind) {
  $('#login').classList.remove('off');
  $('#lg-box').hidden = true;
  $('#noperm').hidden = false;
  $('#noperm-rcpt').hidden = kind !== 'token';
  $('#noperm-out').hidden = kind !== 'admin';
}
async function enter(user) {
  S.me = user;
  $('#me-mail').textContent = shortMail(user.email);
  $('#login').classList.add('off');
  $('#app').hidden = false;
  await load();
  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
$('#lg-go').addEventListener('click', doLogin);
$('#lg-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('#lg-id').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lg-pw').focus(); });
async function doLogin() {
  const msg = $('#loginmsg'); msg.textContent = '';
  let id = $('#lg-id').value.trim();
  if (!id) { msg.textContent = 'IDまたはパスワードが違います'; return; }
  if (!id.includes('@')) id += MAIL_DOMAIN;
  const { data, error } = await sb.auth.signInWithPassword({ email: id, password: $('#lg-pw').value });
  if (error) { msg.textContent = 'IDまたはパスワードが違います'; return; }
  $('#lg-pw').value = '';
  if (!(await isAdmin(data.session))) { showNoPerm('admin'); return; }
  await enter(data.user);
}
const logout = async () => { await sb.auth.signOut(); location.reload(); };
$('#logout').addEventListener('click', logout);
$('#noperm-out').addEventListener('click', logout);

/* ============================== 読み込み・再取得 ============================== */
const fetchRows = () => sb.from(TABLE).select('*')
  .order('category').order('type_no').order('sort');

async function load() {
  const { data, error } = await fetchRows();
  if (error) { toast('読み込みに失敗しました：' + error.message, 'err'); setSync(false); return; }
  S.rows = sortItems(data);
  build();
  setSync(true);
}
let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  [...S.failed].forEach(flush);   /* 保存に失敗した行は再取得のたびに送り直す */
  const fetchStartedAt = Date.now();
  try {
    const { data, error } = await fetchRows();
    if (error) throw error;
    const m = mergeRemote(S.rows, sortItems(data), { busy: busyIds(), lastWriteAt: S.lastWriteAt, fetchStartedAt });
    S.rows = m.rows;
    /* 行の増減は、入力中の行がないときに作り直す（それまでは次の再取得で再判定） */
    if ((m.structural || domOutOfSync()) && !busyIds().size) build();
    else { m.changed.forEach(paint); paintSummary(); applyFilter(); }
    setSync(true);
  } catch { setSync(false); }
  finally { refreshing = false; }
}
function domOutOfSync() {
  const dom = $$('.gc-row').map(el => el.dataset.id);
  return dom.length !== S.rows.length || S.rows.some(r => !dom.includes(r.id));
}
function setSync(ok) {
  const el = $('#sync');
  el.textContent = ok ? `最終同期 ${hm(new Date())}` : '同期に失敗（10秒後に再試行）';
  el.classList.toggle('err', !ok);
}

/* ============================== 描画 ============================== */
function build() {
  const html = groupItems(S.rows).map(sec => {
    const groups = sec.groups.map(g => {
      if (g.rows.length === 1) return `<div class="gc-grp one" data-g="${esc(g.key)}">${rowHtml(g.rows[0], false)}</div>`;
      const qty = g.rows.reduce((n, r) => n + Number(r.qty || 0), 0);
      return `<div class="gc-grp" data-g="${esc(g.key)}">
        <div class="gc-ghead"><span class="gc-no">No.${esc(g.type_no)}</span>
          ${g.brand ? `<span class="gc-brand">${esc(g.brand)}</span>` : ''}<b class="gc-gname">${esc(g.name)}</b>
          <span class="gc-gcount">${g.rows.length}行・計${qty}個</span></div>
        ${g.rows.map(r => rowHtml(r, true)).join('')}</div>`;
    }).join('');
    return `<section class="gc-sec" data-cat="${esc(sec.category)}">
      <h3 class="gc-sechead">${esc(sec.category)}</h3>
      <div class="gc-thead" aria-hidden="true"><span>確認</span><span>品目</span><span class="r">数量</span><span>実数</span><span>メモ</span><span class="r">単価・小計</span><span></span></div>
      ${groups}</section>`;
  }).join('');
  $('#list').innerHTML = html;
  S.rows.forEach(r => paint(r.id));
  paintSummary();
  applyFilter();
}
function rowHtml(r, sub) {
  const head = sub ? '' : `<div class="gc-bn"><span class="gc-no">No.${esc(r.type_no)}</span>${r.brand ? `<span class="gc-brand">${esc(r.brand)}</span>` : ''}</div>
    <div class="gc-name">${esc(r.name)}</div>`;
  const ex = r.unit_price_ex_tax != null ? `<span>税抜 ${yen(r.unit_price_ex_tax)}</span>` : '';
  return `<div class="gc-row${sub ? ' sub' : ''}" data-id="${esc(r.id)}">
    <label class="gc-chk"><input type="checkbox" data-f="check" aria-label="確認"><span class="box"></span><span class="lbl">確認</span></label>
    <div class="gc-item">${head}
      ${r.variant ? `<div class="gc-var">${esc(r.variant)}</div>` : ''}
      ${r.note ? `<div class="gc-note">${esc(r.note)}</div>` : ''}</div>
    <div class="gc-qty"><b>${esc(r.qty)}</b><small>個</small></div>
    <div class="gc-real"><label><span>実数</span><input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-f="qty" aria-label="実数"></label>
      <span class="gc-diff"></span></div>
    <div class="gc-memo"><input type="text" data-f="memo" placeholder="メモ" autocomplete="off" aria-label="メモ"></div>
    <div class="gc-price">${ex}<span>単価 ${yen(r.unit_price)}</span><span>小計 ${yen(r.subtotal)}</span></div>
    <div class="gc-st"><button type="button" class="st" data-f="retry" tabindex="-1"></button><small class="who"></small></div>
  </div>`;
}
/* 1 行の表示を値に合わせる（フォーカス中の入力欄は書き換えない） */
function paint(id) {
  const r = byId(id), el = rowEl(id);
  if (!r || !el) return;
  const d = diffOf(r);
  el.classList.toggle('done', !!r.checked_at);
  el.classList.toggle('diff', hasDiff(r));
  $('[data-f="check"]', el).checked = !!r.checked_at;
  const q = $('[data-f="qty"]', el), m = $('[data-f="memo"]', el);
  if (document.activeElement !== q) { q.value = r.checked_qty ?? ''; q.classList.remove('bad'); }
  if (document.activeElement !== m) m.value = r.memo ?? '';
  const df = $('.gc-diff', el);
  df.textContent = d === null ? '' : d === 0 ? '一致' : `差異 ${fmtDiff(d)}`;
  df.className = 'gc-diff' + (d === null ? '' : d === 0 ? ' same' : ' ng');
  $('.who', el).textContent = r.checked_at ? `✓ ${fmtDT(r.checked_at)} ${shortMail(r.checked_by)}` : '';
  paintStatus(id);
}
function paintStatus(id) {
  const el = rowEl(id);
  if (!el) return;
  const st = $('.st', el);
  const [cls, txt] = S.failed.has(id) ? ['err', '保存に失敗・再試行']
    : S.saving.has(id) || S.timers.has(id) ? ['ing', '保存中…']
    : el.dataset.saved ? ['ok', '保存済'] : ['', ''];
  st.className = 'st ' + cls;
  st.textContent = txt;
  st.disabled = cls !== 'err';
}
function paintSummary() {
  const s = summarize(S.rows);
  $('#s-done').textContent = s.checked;
  $('#s-all').textContent = s.total;
  $('#s-bar').style.width = s.total ? `${(s.checked / s.total) * 100}%` : '0';
  $('#s-diff').textContent = s.diffs ? `差異あり ${s.diffs}行` : '';
  $('#s-cats').innerHTML = CATEGORIES.map(c => {
    const x = s.byCat[c];
    return `<div class="gc-cat"><b>${esc(c)}</b>
      <span class="n">${x.rows}<small>行</small></span><span class="n">${x.qty}<small>個</small></span>
      <span class="n yen">${yen(x.amount)}<small>税込・実払</small></span>
      <span class="c">確認 ${x.checked}/${x.rows}${x.diffs ? ` ・<em>差異 ${x.diffs}</em>` : ''}</span></div>`;
  }).join('');
}
function applyFilter() {
  let shown = 0;
  $$('.gc-row').forEach(el => {
    const r = byId(el.dataset.id);
    const on = !!r && matches(r, S.filter, S.keep);
    el.hidden = !on;
    if (on) shown++;
  });
  $$('.gc-grp').forEach(g => { g.hidden = !$('.gc-row:not([hidden])', g); });
  $$('.gc-sec').forEach(s => { s.hidden = !$('.gc-row:not([hidden])', s); });
  $('#empty').hidden = shown > 0;
}

/* ============================== 絞り込み ============================== */
function bindSeg(sel, key) {
  $(sel).addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    $$('button', $(sel)).forEach(x => x.classList.toggle('on', x === b));
    S.filter[key] = b.dataset.v;
    S.keep.clear();
    applyFilter();
  });
}
bindSeg('#f-mode', 'mode');
bindSeg('#f-cat', 'cat');
$('#print').addEventListener('click', () => window.print());

/* ============================== 入力と自動保存 ============================== */
const list = $('#list');
list.addEventListener('change', e => {
  const f = e.target.dataset.f, el = e.target.closest('.gc-row');
  if (!el) return;
  const id = el.dataset.id;
  if (f === 'check') {
    const on = e.target.checked;
    edit(id, on ? { checked_at: new Date().toISOString(), checked_by: S.me.email } : { checked_at: null, checked_by: null }, 0);
  } else if (f === 'qty' || f === 'memo') {
    if (S.timers.has(id)) flush(id);   /* 確定（blur・Enter）したらすぐ送る */
  }
});
list.addEventListener('input', e => {
  const f = e.target.dataset.f, el = e.target.closest('.gc-row');
  if (!el) return;
  const id = el.dataset.id;
  if (f === 'qty') {
    const v = parseQty(e.target.value);
    e.target.classList.toggle('bad', v === undefined);
    if (v === undefined) return;
    edit(id, { checked_qty: v }, TYPE_DELAY_MS);
  } else if (f === 'memo') {
    edit(id, { memo: e.target.value.trim() ? e.target.value : null }, TYPE_DELAY_MS);
  }
});
list.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input[type="text"]')) e.target.blur();
});
list.addEventListener('focusout', e => {
  /* 入力欄を離れたら、不正な実数は保存済みの値に戻す */
  if (e.target.dataset?.f === 'qty' && e.target.classList.contains('bad')) {
    const id = e.target.closest('.gc-row').dataset.id;
    setTimeout(() => paint(id));
  }
});
list.addEventListener('click', e => {
  const b = e.target.closest('button[data-f="retry"]');
  if (b) flush(b.closest('.gc-row').dataset.id);
});

/* ローカルの値をすぐ反映し、patch を溜めて delay 後に保存する */
function edit(id, patch, delay) {
  const r = byId(id);
  if (!r) return;
  Object.assign(r, patch);
  S.pending.set(id, { ...(S.pending.get(id) || {}), ...patch });
  S.keep.add(id);
  clearTimeout(S.timers.get(id));
  S.timers.set(id, setTimeout(() => flush(id), delay));
  paint(id);
  paintSummary();
}
async function flush(id) {
  clearTimeout(S.timers.get(id));
  S.timers.delete(id);
  if (S.saving.has(id)) { S.timers.set(id, setTimeout(() => flush(id), 300)); paintStatus(id); return; }
  const patch = S.pending.get(id);
  if (!patch) return;
  S.pending.delete(id);
  S.failed.delete(id);
  S.saving.add(id);
  S.lastWriteAt.set(id, Date.now());
  paintStatus(id);
  const { data, error } = await sb.from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  S.saving.delete(id);
  S.lastWriteAt.set(id, Date.now());
  const el = rowEl(id);
  if (error || !data) {
    /* 失敗した patch は、その後の入力の下に戻して再試行を待つ */
    S.pending.set(id, { ...patch, ...(S.pending.get(id) || {}) });
    S.failed.add(id);
    if (el) delete el.dataset.saved;
    toast('保存に失敗しました：' + (error?.message || '更新できませんでした'), 'err');
    paintStatus(id);
    return;
  }
  /* サーバーの値を採り、まだ送っていない入力があればその値を残す */
  const r = byId(id);
  if (r) Object.assign(r, data, S.pending.get(id) || {});
  if (el) {
    el.dataset.saved = '1';
    clearTimeout(el._savedTimer);
    el._savedTimer = setTimeout(() => { delete el.dataset.saved; paintStatus(id); }, 2500);
  }
  paint(id);
  paintSummary();
  applyFilter();
}
window.addEventListener('beforeunload', e => {
  if (S.pending.size || S.saving.size) { e.preventDefault(); e.returnValue = ''; }
});

boot();

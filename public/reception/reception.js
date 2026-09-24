/* 受付画面（/reception/）
   データはすべて /api/reception/* から取る（この HTML にはゲスト情報を含めない）。
   認証：Supabase のセッションがあれば Bearer、なければ受付トークンの Cookie。仕様：00_spec/reception.md */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPA_URL = 'https://cvnqnvnppvfhwmrehagt.supabase.co';
const SUPA_KEY = 'sb_publishable_ZYwTP155dx57wEopKpezNA_LR1IOjID';
const sb = createClient(SUPA_URL, SUPA_KEY);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const norm = s => String(s ?? '').replace(/[\s　]/g, '').toLowerCase();
const REFRESH_MS = 10000, RETRY_MS = 5000;

const R = { guests: [], q: '', filter: 'all', me: null, queue: [], pendingIds: new Set(), timer: null, retry: null };

/* ---------------- API ---------------- */
async function authHeaders() {
  const { data } = await sb.auth.getSession().catch(() => ({ data: {} }));
  const tok = data?.session?.access_token;
  return tok ? { authorization: `Bearer ${tok}` } : {};
}
async function api(path, opts = {}) {
  const res = await fetch('/api/reception/' + path, {
    method: opts.method || 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(body.error || res.statusText); e.status = res.status; throw e; }
  return body;
}

/* ---------------- 起動 ---------------- */
async function boot() {
  try {
    R.me = await api('me');
  } catch (e) {
    $('#gate').hidden = false;
    $('#gate-msg').textContent = e.status === 401 ? '受付用リンクから開いてください' : '接続できませんでした。電波の良い場所でもう一度開いてください';
    return;
  }
  $('#app').hidden = false;
  $('#who').textContent = `操作者：${R.me.label}${R.me.via === 'admin' ? '（管理者）' : ''}`;
  await load();
  R.timer = setInterval(load, REFRESH_MS);           /* 複数端末の状態を同期 */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}
async function load() {
  try {
    const { guests } = await api('guests');
    /* 未送信の操作がある人は、サーバーの値で上書きしない */
    R.guests = guests.map(g => R.pendingIds.has(g.id) ? (R.guests.find(x => x.id === g.id) || g) : g);
    render();
  } catch (e) {
    if (e.status === 401) { clearInterval(R.timer); $('#app').hidden = true; $('#gate').hidden = false; $('#gate-msg').textContent = '受付用リンクが無効になりました。新しいリンクから開いてください'; return; }
    $('#foot').textContent = '再取得に失敗しました（自動で再試行します）';
  }
}

/* ---------------- 表示 ---------------- */
const fmtT = iso => iso ? new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
const fullName = g => `${g.family_name ?? ''} ${g.given_name ?? ''}`.trim();
const latin = g => `${g.family_name_latin ?? ''} ${g.given_name_latin ?? ''}`.trim().toUpperCase();

function matches(g) {
  const q = R.q.trim();
  if (q) {
    if (/^\d{5}$/.test(q)) { if (g.reception_id !== q) return false; }        /* 5桁＝受付IDの完全一致 */
    else if (!norm(fullName(g) + ' ' + latin(g)).includes(norm(q))) return false;
  }
  if (R.filter === 'todo' && g.checked_in_at) return false;
  if (R.filter === 'items' && !g.items.length) return false;
  return true;
}
function render() {
  const all = R.guests, done = all.filter(g => g.checked_in_at).length;
  $('#c-done').textContent = done; $('#c-all').textContent = all.length;
  const list = all.filter(matches);
  const unhandedFirst = (a, b) => (a.checked_in_at ? 1 : 0) - (b.checked_in_at ? 1 : 0)
    || (a.reception_id || '99999').localeCompare(b.reception_id || '99999');
  $('#list').innerHTML = list.length ? list.sort(unhandedFirst).map(card).join('')
    : '<p class="empty">該当するゲストがいません</p>';
  $('#foot').textContent = `${list.length} 名を表示 ／ 10秒ごとに自動更新`;
  const n = R.queue.length;
  $('#netbar').hidden = !n; $('#net-n').textContent = n;
}
function card(g) {
  const pending = R.pendingIds.has(g.id);
  const items = g.items.map(it => `
    <div class="item${it.handed_at ? ' handed' : ''}">
      <div class="lb"><b>${esc(it.label)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}
        ${it.handed_at ? `<span class="at">お渡し済 ${fmtT(it.handed_at)}${it.handed_by ? '・' + esc(it.handed_by) : ''}</span>` : ''}</div>
      <button data-hand="${esc(it.id)}" data-g="${esc(g.id)}" data-undo="${it.handed_at ? '1' : ''}">${it.handed_at ? 'お渡し済' : '未渡し → お渡し済'}</button>
    </div>`).join('');
  return `<article class="card${g.checked_in_at ? ' done' : ''}${pending ? ' pending' : ''}" data-id="${esc(g.id)}">
    <div class="info">
      <div class="rid${g.reception_id ? '' : ' none'}">${g.reception_id ? esc(g.reception_id) : '受付ID未発番'}</div>
      <div class="nm">${esc(fullName(g)) || '（名前なし）'}<small>${esc(latin(g))}</small></div>
      <div class="tb">${g.table ? `卓 <b>${esc(g.table)}</b>${g.seat ? `　席 ${g.seat}` : ''}` : '卓：未定'}</div>
    </div>
    <div class="chk">
      <button data-checkin="${esc(g.id)}" data-undo="${g.checked_in_at ? '1' : ''}">${g.checked_in_at ? '受付済' : '受付'}</button>
      ${g.checked_in_at ? `<small>${fmtT(g.checked_in_at)}</small><small class="by">${esc(g.checked_in_by || '')}</small>` : ''}
    </div>
    ${items ? `<div class="items">${items}</div>` : ''}
    ${pending ? '<div class="pend">未送信（自動で再送します）</div>' : ''}
  </article>`;
}

/* ---------------- 操作（失敗しても手元の表示を先に変え、キューで再送する） ---------------- */
function confirmBox(msg) {
  return new Promise(res => {
    $('#confirm-msg').textContent = msg; $('#confirm').hidden = false;
    const done = v => { $('#confirm').hidden = true; $('#confirm-yes').onclick = $('#confirm-no').onclick = null; res(v); };
    $('#confirm-yes').onclick = () => done(true); $('#confirm-no').onclick = () => done(false);
  });
}
function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast on ' + kind;
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200);
}
function enqueue(op) {
  R.queue.push(op); R.pendingIds.add(op.guestId);
  render(); flush();
}
let flushing = false;
async function flush() {
  if (flushing) return; flushing = true;
  while (R.queue.length) {
    const op = R.queue[0];
    try {
      const res = await api(op.path, { method: 'POST', body: op.body });
      R.queue.shift();
      const g = R.guests.find(x => x.id === op.guestId);
      if (g && res.guest) Object.assign(g, res.guest);
      if (g && res.item) { const it = g.items.find(i => i.id === res.item.id); if (it) Object.assign(it, res.item); }
      if (!R.queue.some(o => o.guestId === op.guestId)) R.pendingIds.delete(op.guestId);
      render();
    } catch (e) {
      if (e.status === 401) { R.queue.length = 0; R.pendingIds.clear(); await load(); break; }
      if (e.status === 404 || e.status === 400) { R.queue.shift(); R.pendingIds.delete(op.guestId); toast('この操作は反映できませんでした', 'err'); await load(); continue; }
      render();
      clearTimeout(R.retry); R.retry = setTimeout(() => { flushing = false; flush(); }, RETRY_MS);
      return;
    }
  }
  flushing = false;
}

document.addEventListener('click', async e => {
  const c = e.target.closest('[data-checkin]');
  if (c) {
    const g = R.guests.find(x => x.id === c.dataset.checkin); if (!g) return;
    if (c.dataset.undo) {
      if (!await confirmBox(`${fullName(g)} さんの受付を取り消しますか。`)) return;
      g.checked_in_at = null; g.checked_in_by = null;
      enqueue({ guestId: g.id, path: 'checkin', body: { guest_id: g.id, undo: true } });
      return;
    }
    const left = g.items.filter(i => !i.handed_at);
    if (left.length && !await confirmBox(`お渡し物があります（${left.map(i => i.label).join('・')}）。お渡し前ですが受付済にしますか。`)) return;
    g.checked_in_at = new Date().toISOString(); g.checked_in_by = R.me.label;
    enqueue({ guestId: g.id, path: 'checkin', body: { guest_id: g.id } });
    return;
  }
  const h = e.target.closest('[data-hand]');
  if (h) {
    const g = R.guests.find(x => x.id === h.dataset.g); const it = g?.items.find(i => i.id === h.dataset.hand); if (!it) return;
    if (h.dataset.undo) {
      if (!await confirmBox(`「${it.label}」のお渡し済を取り消しますか。`)) return;
      it.handed_at = null; it.handed_by = null;
      enqueue({ guestId: g.id, path: `items/${it.id}/hand`, body: { undo: true } });
      return;
    }
    it.handed_at = new Date().toISOString(); it.handed_by = R.me.label;
    enqueue({ guestId: g.id, path: `items/${it.id}/hand`, body: {} });
  }
});
$('#q').addEventListener('input', e => { R.q = e.target.value; render(); });
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  R.filter = b.dataset.f;
  document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x === b));
  render();
});
window.addEventListener('online', flush);
boot();

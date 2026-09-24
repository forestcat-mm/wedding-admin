/* 受付画面（/reception/）
   データはすべて /api/reception/* から取る（この HTML にはゲスト情報を含めない）。
   認証：Supabase のセッションがあれば Bearer、なければ受付トークンの Cookie。
   仕様：00_spec/reception.md（v1）、00_spec/03_reception-v2.md（v2：対象の限定・サイド切替・PC レイアウト）、
         00_spec/04_reception-v2.1.md（v2.1：同行者の表示） */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPA_URL = 'https://cvnqnvnppvfhwmrehagt.supabase.co';
const SUPA_KEY = 'sb_publishable_ZYwTP155dx57wEopKpezNA_LR1IOjID';
const sb = createClient(SUPA_URL, SUPA_KEY);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const norm = s => String(s ?? '').replace(/[\s　]/g, '').toLowerCase();
const REFRESH_MS = 10000, RETRY_MS = 5000;
const SIDES = ['groom', 'bride', 'all'];
const SIDE_LABEL = { groom: '新郎側', bride: '新婦側' };
const SIDE_KEY = 'rcpt_side';

const R = { guests: [], q: '', filter: 'all', side: 'all', me: null, queue: [], pendingIds: new Set(), timer: null, retry: null, hit: null, ridOn: true };

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
  setRidOn(R.me.reception_id_enabled !== false);
  /* v2: サイドの初期値。端末で切り替えた値 → トークンの既定 → all */
  let saved = null;
  try { saved = localStorage.getItem(SIDE_KEY); } catch {}
  R.side = SIDES.includes(saved) ? saved : (SIDES.includes(R.me.default_side) ? R.me.default_side : 'all');
  paintSide();
  await load();
  R.timer = setInterval(load, REFRESH_MS);           /* 複数端末の状態を同期 */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  $('#q').focus();
}
async function load() {
  try {
    const { guests, reception_id_enabled } = await api('guests');
    if (reception_id_enabled !== undefined) setRidOn(reception_id_enabled !== false);   /* v2.2: 10 秒ごとの同期で ON/OFF を反映 */
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
const inSide = g => R.side === 'all' || g.side === R.side;
/* v2.2: 受付IDの ON/OFF。OFF では番号を出さず、5桁の完全一致と Enter での受付も無効 */
function setRidOn(on) {
  if (R.ridOn === on) return;
  R.ridOn = on;
  $('#q').placeholder = on ? '受付ID（5桁）または お名前' : 'お名前で検索';
}
const ridQuery = q => R.ridOn && /^\d{5}$/.test(q);
const isPC = () => window.matchMedia('(min-width: 1024px)').matches;

function paintSide() {
  $$('#side button').forEach(b => b.classList.toggle('on', b.dataset.s === R.side));
}
/* v2.1: 同行者の名前（漢字・ローマ字）でも一致させる。一致した同行者は表示でハイライト */
const compMatch = (c, q) => !!q && !/^\d{5}$/.test(q) && norm(fullName(c) + ' ' + latin(c)).includes(norm(q));
function matchesQuery(g) {
  const q = R.q.trim();
  if (!q) return true;
  if (ridQuery(q)) return g.reception_id === q;                    /* 5桁＝受付IDの完全一致（ON のときだけ） */
  return norm(fullName(g) + ' ' + latin(g)).includes(norm(q)) || (g.companions || []).some(c => compMatch(c, q));
}
function matchesFilter(g) {
  if (R.filter === 'todo' && g.checked_in_at) return false;
  if (R.filter === 'items' && !g.items.length) return false;
  return true;
}
const order = (a, b) => (a.checked_in_at ? 1 : 0) - (b.checked_in_at ? 1 : 0)
  || (R.ridOn ? (a.reception_id || '99999').localeCompare(b.reception_id || '99999') : 0)
  || latin(a).localeCompare(latin(b), 'en');

function render() {
  /* v2: 母数は選択中のサイド */
  const pool = R.guests.filter(inSide);
  const done = pool.filter(g => g.checked_in_at).length;
  $('#c-done').textContent = done; $('#c-all').textContent = pool.length;
  const main = pool.filter(g => matchesQuery(g) && matchesFilter(g)).sort(order);
  /* v2: 検索中は、もう一方のサイドの該当者も下に薄く出す（別サイドのゲストが来ても受付できるように） */
  const q = R.q.trim();
  const other = q && R.side !== 'all'
    ? R.guests.filter(g => !inSide(g) && matchesQuery(g) && matchesFilter(g)).sort(order) : [];
  /* 5桁で1件だけ一致したらその行を強調する（Enter で受付） */
  R.hit = ridQuery(q) && main.length + other.length === 1 ? (main[0] || other[0]) : null;

  const pc = isPC();
  const rowsHTML = list => pc ? list.map(rowHTML).join('') : list.map(card).join('');
  let html = '';
  if (!main.length && !other.length) html = '<p class="empty">該当するゲストがいません</p>';
  else {
    html = pc ? tableHTML(rowsHTML(main), other.length ? rowsHTML(other) : '') : rowsHTML(main);
    if (!pc && other.length) html += `<p class="othersep">${SIDE_LABEL[R.side === 'groom' ? 'bride' : 'groom']}の該当者</p>` + rowsHTML(other);
  }
  $('#list').innerHTML = html;
  $('#list').classList.toggle('pc', pc);
  /* PC：表の見出しはヘッダーの直下に固定する（ヘッダーの高さは内容で変わる） */
  document.documentElement.style.setProperty('--topH', $('#top').offsetHeight + 'px');
  $('#foot').textContent = `${main.length} 名を表示${other.length ? `（別サイド ${other.length} 名）` : ''} ／ 10秒ごとに自動更新`;
  const n = R.queue.length;
  $('#netbar').hidden = !n; $('#net-n').textContent = n;
  if (R.hit) document.querySelector(`[data-id="${R.hit.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
const sideBadge = g => g.side ? `<span class="sb ${g.side}">${SIDE_LABEL[g.side]}</span>` : '';
/* v2.1: 人数バッジ「計n名」（本人＋同行者）と同行者の一覧。同行者がいなければ空文字（表示部分ごと出さない） */
const comps = g => g.companions || [];
const countBadge = g => comps(g).length ? `<span class="nb">計${comps(g).length + 1}名</span>` : '';
function compLabel(g, c) {
  let t = fullName(c) || latin(c) || '（名前なし）';
  if (c.is_child) t += c.age != null ? `（子・${c.age}歳）` : '（子・年齢未記入）';
  if (c.table && c.table !== g.table) t += `（${c.table}卓）`;
  return t;
}
function compsHTML(g) {
  if (!comps(g).length) return '';
  const q = R.q.trim();
  return `<div class="comps">同行：${comps(g).map(c =>
    `<span class="cp${compMatch(c, q) ? ' hl' : ''}">${esc(compLabel(g, c))}</span>`).join('<i class="sl"> ／ </i>')}</div>`;
}
const itemsHTML = g => g.items.map(it => `
    <div class="item${it.handed_at ? ' handed' : ''}">
      <div class="lb"><b>${esc(it.label)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}
        ${it.handed_at ? `<span class="at">お渡し済 ${fmtT(it.handed_at)}${it.handed_by ? '・' + esc(it.handed_by) : ''}</span>` : ''}</div>
      <button data-hand="${esc(it.id)}" data-g="${esc(g.id)}" data-undo="${it.handed_at ? '1' : ''}">${it.handed_at ? 'お渡し済' : '未渡し → お渡し済'}</button>
    </div>`).join('');
const checkHTML = g => `<button class="ckbtn" data-checkin="${esc(g.id)}" data-undo="${g.checked_in_at ? '1' : ''}">${g.checked_in_at ? '受付済' : '受付'}</button>
      ${g.checked_in_at ? `<small>${fmtT(g.checked_in_at)}</small><small class="by">${esc(g.checked_in_by || '')}</small>` : ''}`;
const cls = g => [g.checked_in_at ? 'done' : '', R.pendingIds.has(g.id) ? 'pending' : '', inSide(g) ? '' : 'other',
  g.items.some(i => !i.handed_at) ? 'unhanded' : '', R.hit?.id === g.id ? 'hit' : ''].filter(Boolean).join(' ');

/* スマホ・タブレット：カード */
function card(g) {
  const items = itemsHTML(g);
  return `<article class="card ${cls(g)}" data-id="${esc(g.id)}">
    <div class="info">
      ${R.ridOn ? `<div class="rid${g.reception_id ? '' : ' none'}">${g.reception_id ? esc(g.reception_id) : '受付ID未発番'}</div>` : ''}
      <div class="nm">${esc(fullName(g)) || '（名前なし）'} ${sideBadge(g)}${countBadge(g)}<small>${esc(latin(g))}</small></div>
      ${compsHTML(g)}
      <div class="tb">${g.table ? `卓 <b>${esc(g.table)}</b>${g.seat ? `　席 ${g.seat}` : ''}` : '卓：未定'}</div>
    </div>
    <div class="chk">${checkHTML(g)}</div>
    ${items ? `<div class="items">${items}</div>` : ''}
    ${R.pendingIds.has(g.id) ? '<div class="pend">未送信（自動で再送します）</div>' : ''}
  </article>`;
}
/* PC：表 */
function tableHTML(mainRows, otherRows) {
  const cols = R.ridOn ? 6 : 5;
  return `<table class="gt"><thead><tr>${R.ridOn ? '<th class="c-rid">受付ID</th>' : ''}<th>氏名</th><th class="c-side">サイド</th><th class="c-tb">卓・席</th><th>お渡し物</th><th class="c-chk">受付状態</th></tr></thead>
    <tbody>${mainRows}</tbody>
    ${otherRows ? `<tbody class="others"><tr class="sep"><td colspan="${cols}">${SIDE_LABEL[R.side === 'groom' ? 'bride' : 'groom']}の該当者</td></tr>${otherRows}</tbody>` : ''}
  </table>`;
}
function rowHTML(g) {
  const items = itemsHTML(g);
  return `<tr class="${cls(g)}" data-id="${esc(g.id)}">
    ${R.ridOn ? `<td class="c-rid"><span class="rid${g.reception_id ? '' : ' none'}">${g.reception_id ? esc(g.reception_id) : '未発番'}</span></td>` : ''}
    <td class="c-nm"><b>${esc(fullName(g)) || '（名前なし）'}</b>${countBadge(g)}<small>${esc(latin(g))}</small>${compsHTML(g)}</td>
    <td class="c-side">${sideBadge(g)}</td>
    <td class="c-tb">${g.table ? `<b>${esc(g.table)}</b>${g.seat ? ` <small>席 ${g.seat}</small>` : ''}` : '<small>未定</small>'}</td>
    <td class="c-items">${items ? `<div class="items">${items}</div>` : '<small class="none">—</small>'}</td>
    <td class="c-chk"><div class="chk">${checkHTML(g)}</div>${R.pendingIds.has(g.id) ? '<div class="pend">未送信</div>' : ''}</td>
  </tr>`;
}

/* ---------------- 操作（失敗しても手元の表示を先に変え、キューで再送する） ---------------- */
function confirmBox(msg) {
  return new Promise(res => {
    $('#confirm-msg').textContent = msg; $('#confirm').hidden = false;
    const done = v => { $('#confirm').hidden = true; $('#confirm-yes').onclick = $('#confirm-no').onclick = null; document.removeEventListener('keydown', onKey); res(v); if (isPC()) $('#q').focus(); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    $('#confirm-yes').onclick = () => done(true); $('#confirm-no').onclick = () => done(false);
    /* ダイアログを開いた Enter 自身で確定しないよう、キー監視は次のティックから */
    setTimeout(() => document.addEventListener('keydown', onKey), 0);
    $('#confirm-yes').focus();
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
async function checkIn(g) {
  if (g.checked_in_at) {
    if (!await confirmBox(`${fullName(g)} さんの受付を取り消しますか。`)) return;
    g.checked_in_at = null; g.checked_in_by = null;
    enqueue({ guestId: g.id, path: 'checkin', body: { guest_id: g.id, undo: true } });
    return;
  }
  const left = g.items.filter(i => !i.handed_at);
  if (left.length && !await confirmBox(`お渡し物があります（${left.map(i => i.label).join('・')}）。お渡し前ですが受付済にしますか。`)) return;
  g.checked_in_at = new Date().toISOString(); g.checked_in_by = R.me.label;
  enqueue({ guestId: g.id, path: 'checkin', body: { guest_id: g.id } });
}
async function hand(g, it) {
  if (it.handed_at) {
    if (!await confirmBox(`「${it.label}」のお渡し済を取り消しますか。`)) return;
    it.handed_at = null; it.handed_by = null;
    enqueue({ guestId: g.id, path: `items/${it.id}/hand`, body: { undo: true } });
    return;
  }
  it.handed_at = new Date().toISOString(); it.handed_by = R.me.label;
  enqueue({ guestId: g.id, path: `items/${it.id}/hand`, body: {} });
}

document.addEventListener('click', e => {
  const c = e.target.closest('[data-checkin]');
  if (c) { const g = R.guests.find(x => x.id === c.dataset.checkin); if (g) checkIn(g); return; }
  const h = e.target.closest('[data-hand]');
  if (h) { const g = R.guests.find(x => x.id === h.dataset.g); const it = g?.items.find(i => i.id === h.dataset.hand); if (it) hand(g, it); }
});
$('#q').addEventListener('input', e => { R.q = e.target.value; render(); });
/* v2: キーボード操作。Esc で検索をクリア、5桁で1件だけ一致していれば Enter で受付 */
$('#q').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); $('#q').value = ''; R.q = ''; render(); }
  else if (e.key === 'Enter' && R.hit) { e.preventDefault(); checkIn(R.hit); }
});
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  R.filter = b.dataset.f;
  $$('#filters button').forEach(x => x.classList.toggle('on', x === b));
  render();
});
$('#side').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  R.side = b.dataset.s;
  try { localStorage.setItem(SIDE_KEY, R.side); } catch {}
  paintSide(); render();
});
window.addEventListener('online', flush);
window.matchMedia('(min-width: 1024px)').addEventListener('change', render);
window.matchMedia('(min-width: 768px)').addEventListener('change', render);
boot();

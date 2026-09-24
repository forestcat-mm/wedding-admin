/* ============================================================
   wedding-admin Worker
   静的ファイル（public/）は Static Assets が配信する。この Worker が受けるのは
   wrangler.toml の run_worker_first に挙げた /r/* と /api/* だけ。
     GET  /r/:code                    受付トークンの短縮URL → Cookie を発行して /reception/ へ
     GET  /api/reception/me           認証の確認（token / admin）
     GET  /api/reception/guests       受付用のゲスト一覧（連絡先などは含めない。v2.1: 出席する同行者 companions 付き）
     POST /api/reception/checkin      受付済 / 取り消し
     POST /api/reception/items/:id/hand  お渡し済 / 取り消し
   DB アクセスはすべてサービスロールキー（Secret: SUPABASE_SERVICE_ROLE_KEY）。
   Cookie の署名は Secret: RECEPTION_COOKIE_SECRET（HMAC-SHA256）。
   仕様：00_spec/reception.md（v1）、03_reception-v2.md（v2）、04_reception-v2.1.md（同行者）
   ============================================================ */

const COOKIE = 'rcpt';
const SIDES = ['groom', 'bride', 'all'];
const COOKIE_DEFAULT_DAYS = 7;
const LAST_USED_MIN_INTERVAL_MS = 60 * 1000;   /* last_used_at は最長1分に1回 */
const SETTINGS_CACHE_MS = 10 * 1000;           /* app_settings の読み込みは最大 10 秒キャッシュ */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/r/')) return await shortLink(request, env, url);
      if (url.pathname.startsWith('/api/reception/')) return await receptionApi(request, env, url, ctx);
      if (url.pathname.startsWith('/api/')) return noStore(json({ error: 'not_found' }, 404));
    } catch (e) {
      return noStore(json({ error: 'server_error', message: String(e?.message || e) }, 500));
    }
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- 共通 ---------------- */
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
function noStore(res) {
  const h = new Headers(res.headers);
  h.set('cache-control', 'no-store');
  h.set('x-robots-tag', 'noindex');
  return new Response(res.body, { status: res.status, headers: h });
}
const html = (body, status = 200) => noStore(new Response(body, {
  status, headers: { 'content-type': 'text/html; charset=utf-8' },
}));

/* ---------------- Supabase REST（サービスロール） ---------------- */
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...extra,
  };
}
async function sbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env) });
  if (!res.ok) throw new Error(`supabase ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
async function sbPatch(env, path, body, returnRows = true) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: sbHeaders(env, { prefer: returnRows ? 'return=representation' : 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase ${path}: ${res.status} ${await res.text()}`);
  return returnRows ? res.json() : null;
}

/* ---------------- Cookie の署名 ---------------- */
const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmacKey(env) {
  return crypto.subtle.importKey('raw', enc.encode(env.RECEPTION_COOKIE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(env, payload) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload));
  return b64url(sig);
}
/* 値：<token_id>.<exp(unix秒)>.<署名> */
async function makeCookieValue(env, tokenId, exp) {
  const payload = `${tokenId}.${exp}`;
  return `${payload}.${await sign(env, payload)}`;
}
async function parseCookieValue(env, value) {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [tokenId, expS, sig] = parts;
  const expect = await sign(env, `${tokenId}.${expS}`);
  if (!timingSafeEqual(sig, expect)) return null;
  const exp = Number(expS);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  return { tokenId, exp };
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
function cookieHeader(value, maxAgeSec) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

/* ---------------- 受付トークン ---------------- */
const tokenAlive = t => !!t && t.is_active === true && (!t.expires_at || new Date(t.expires_at).getTime() > Date.now());

async function tokenByCode(env, code) {
  const rows = await sbGet(env, `reception_tokens?code=eq.${encodeURIComponent(code)}&select=id,code,label,is_active,expires_at,last_used_at,default_side&limit=1`);
  return rows[0] || null;
}
async function tokenById(env, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await sbGet(env, `reception_tokens?id=eq.${id}&select=id,code,label,is_active,expires_at,last_used_at,default_side&limit=1`);
  return rows[0] || null;
}

/* ---------------- 設定（app_settings） ---------------- */
let settingsCache = { at: 0, values: {} };
async function appSettings(env) {
  if (Date.now() - settingsCache.at < SETTINGS_CACHE_MS) return settingsCache.values;
  const rows = await sbGet(env, 'app_settings?select=key,value');
  const values = {};
  for (const r of rows) values[r.key] = r.value;
  settingsCache = { at: Date.now(), values };
  return values;
}
/* 受付IDを使うか（既定 true） */
async function receptionIdEnabled(env) {
  const v = (await appSettings(env)).reception_id_enabled;
  return v === undefined || v === null ? true : v === true;
}
export const _resetSettingsCache = () => { settingsCache = { at: 0, values: {} }; };

/* GET /r/:code */
async function shortLink(request, env, url) {
  const code = url.pathname.slice(3).replace(/\/+$/, '');
  if (request.method !== 'GET' && request.method !== 'HEAD') return html(page('このリンクは現在ご利用いただけません'), 405);
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return html(page('このリンクは現在ご利用いただけません'), 404);
  const t = await tokenByCode(env, code);
  if (!tokenAlive(t)) return html(page('このリンクは現在ご利用いただけません'), 404);
  /* Max-Age は expires_at まで。無期限なら 7 日 */
  const expMs = t.expires_at ? new Date(t.expires_at).getTime() : Date.now() + COOKIE_DEFAULT_DAYS * 86400000;
  const exp = Math.floor(expMs / 1000);
  const maxAge = Math.max(60, exp - Math.floor(Date.now() / 1000));
  const value = await makeCookieValue(env, t.id, exp);
  /* トークンは使い捨てにしない（LINE のリンクプレビューで消費されないように） */
  return noStore(new Response(null, {
    status: 302,
    headers: { location: '/reception/', 'set-cookie': cookieHeader(value, maxAge) },
  }));
}

/* ---------------- 認証（/api/reception/*） ---------------- */
/* A: Cookie（署名・期限を確認し、DB を再照会して is_active と期限を毎回確認）
   B: Authorization: Bearer <Supabase access token>（Auth で検証し、ADMIN_EMAILS に含まれること） */
async function authenticate(request, env, ctx) {
  const auth = request.headers.get('authorization') || '';
  if (/^bearer\s+/i.test(auth)) {
    const email = await verifySupabaseUser(env, auth.replace(/^bearer\s+/i, '').trim());
    if (email && isAdminEmail(env, email)) return { via: 'admin', label: `admin:${email}`, email, defaultSide: 'all' };
    return null;
  }
  const parsed = await parseCookieValue(env, readCookie(request, COOKIE));
  if (!parsed) return null;
  const t = await tokenById(env, parsed.tokenId);
  if (!tokenAlive(t)) return null;
  const last = t.last_used_at ? new Date(t.last_used_at).getTime() : 0;
  if (Date.now() - last > LAST_USED_MIN_INTERVAL_MS) {
    const upd = sbPatch(env, `reception_tokens?id=eq.${t.id}`, { last_used_at: new Date().toISOString() }, false).catch(() => {});
    ctx?.waitUntil ? ctx.waitUntil(upd) : await upd;
  }
  return { via: 'token', label: t.label || '受付', tokenId: t.id, defaultSide: SIDES.includes(t.default_side) ? t.default_side : 'all' };
}
async function verifySupabaseUser(env, accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return (u?.email || '').toLowerCase() || null;
}
function isAdminEmail(env, email) {
  const list = String(env.ADMIN_EMAILS || '').split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list.includes(email);
  /* ADMIN_EMAILS が空のときは、管理画面のログインに使うドメインで判定する */
  const domain = String(env.ADMIN_EMAIL_DOMAIN || '').toLowerCase();
  return !!domain && email.endsWith('@' + domain);
}

/* ---------------- API ---------------- */
async function receptionApi(request, env, url, ctx) {
  const rest = url.pathname.replace(/^\/api\/reception\/?/, '').replace(/\/$/, '');
  const who = await authenticate(request, env, ctx);
  if (!who) return noStore(json({ error: 'unauthorized' }, 401));

  if (rest === 'me') {
    if (request.method !== 'GET') return noStore(json({ error: 'method' }, 405));
    return noStore(json({ ok: true, via: who.via, label: who.label, default_side: who.defaultSide || 'all',
                          reception_id_enabled: await receptionIdEnabled(env) }));
  }
  if (rest === 'guests') {
    if (request.method !== 'GET') return noStore(json({ error: 'method' }, 405));
    /* v2.2: 受付IDが OFF のときはレスポンスに含めない（画面を開いたままでも 10 秒ごとの同期で反映される） */
    const ridOn = await receptionIdEnabled(env);
    const guests = await guestList(env);
    if (!ridOn) for (const g of guests) delete g.reception_id;
    return noStore(json({ ok: true, guests, reception_id_enabled: ridOn, now: new Date().toISOString() }));
  }
  if (rest === 'checkin') {
    if (request.method !== 'POST') return noStore(json({ error: 'method' }, 405));
    const body = await readJson(request);
    if (!body || !/^[0-9a-f-]{36}$/i.test(body.guest_id || '')) return noStore(json({ error: 'bad_request' }, 400));
    const patch = body.undo ? { checked_in_at: null, checked_in_by: null }
                            : { checked_in_at: new Date().toISOString(), checked_in_by: who.label };
    const rows = await sbPatch(env, `guests?id=eq.${body.guest_id}&deleted_at=is.null&select=id,checked_in_at,checked_in_by`, patch);
    if (!rows.length) return noStore(json({ error: 'not_found' }, 404));
    return noStore(json({ ok: true, guest: rows[0] }));
  }
  const m = rest.match(/^items\/([0-9a-f-]{36})\/hand$/i);
  if (m) {
    if (request.method !== 'POST') return noStore(json({ error: 'method' }, 405));
    const body = (await readJson(request)) || {};
    const patch = body.undo ? { handed_at: null, handed_by: null }
                            : { handed_at: new Date().toISOString(), handed_by: who.label };
    const rows = await sbPatch(env, `reception_items?id=eq.${m[1]}&select=id,guest_id,label,note,handed_at,handed_by,sort`, patch);
    if (!rows.length) return noStore(json({ error: 'not_found' }, 404));
    return noStore(json({ ok: true, item: rows[0] }));
  }
  return noStore(json({ error: 'not_found' }, 404));
}
async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

/* 受付用のゲスト一覧。連絡先・メッセージ・アレルギーなどは列を指定して取らない。
   v2: 対象は「出席予定 かつ 配席済み」だけ（サーバー側で絞る）。
     出席予定＝guests.deleted_at が null で、招待者に紐付いた有効な回答（replies_admin.deleted_at が null、
              superseded_by が null）の attending が true
     配席済み＝その回答の本人（reply_people idx=0）または未回答の仮配席（person_type='guest'）に seating_assignments がある
     side   ＝guests.side、無ければ回答の side */
async function guestList(env) {
  const [guests, items, seats, tables, replies, people] = await Promise.all([
    sbGet(env, 'guests?deleted_at=is.null&select=id,reception_id,family_name,given_name,family_name_latin,given_name_latin,side,checked_in_at,checked_in_by&order=family_name_latin.nullslast,family_name'),
    sbGet(env, 'reception_items?select=id,guest_id,label,note,handed_at,handed_by,sort&order=sort,created_at'),
    sbGet(env, 'seating_assignments?select=table_id,seat_index,person_type,person_id'),
    sbGet(env, 'seating_tables?select=id,label'),
    sbGet(env, 'replies_admin?deleted_at=is.null&superseded_by=is.null&matched_guest_id=not.is.null&attending=eq.true&select=id,matched_guest_id,side'),
    /* v2.1: 本人（idx=0）と同行者（idx>0）をまとめて取る。氏名は管理画面で修正済みの値。連絡先の列は無い */
    sbGet(env, 'reply_people?deleted_at=is.null&select=id,reply_id,idx,attending,family_name,given_name,family_name_latin,given_name_latin,is_child,age,birthdate&order=idx'),
  ]);
  const tableById = new Map(tables.map(t => [t.id, t.label]));
  const seatByPerson = new Map(seats.map(a => [`${a.person_type}:${a.person_id}`, a]));
  const replyOfGuest = new Map(replies.map(r => [r.matched_guest_id, r]));
  const person0OfReply = new Map(people.filter(p => p.idx === 0).map(p => [p.reply_id, p.id]));
  /* v2.1: 出席する同行者（idx>0、attending=true）を回答ごとに idx 順で */
  const companionsOfReply = new Map();
  for (const p of people.filter(p => p.idx > 0 && p.attending === true).sort((a, b) => a.idx - b.idx)) {
    if (!companionsOfReply.has(p.reply_id)) companionsOfReply.set(p.reply_id, []);
    const a = seatByPerson.get(`reply_person:${p.id}`) || null;
    companionsOfReply.get(p.reply_id).push({
      family_name: p.family_name, given_name: p.given_name,
      family_name_latin: p.family_name_latin, given_name_latin: p.given_name_latin,
      is_child: p.is_child === true, age: ageAt(p.birthdate, p.age),
      table: a ? (tableById.get(a.table_id) || null) : null,
      seat: a && a.seat_index != null ? a.seat_index + 1 : null,
    });
  }
  const itemsOf = new Map();
  for (const it of items) {
    if (!itemsOf.has(it.guest_id)) itemsOf.set(it.guest_id, []);
    itemsOf.get(it.guest_id).push({ id: it.id, label: it.label, note: it.note, handed_at: it.handed_at, handed_by: it.handed_by, sort: it.sort });
  }
  const out = [];
  for (const g of guests) {
    const r = replyOfGuest.get(g.id);
    if (!r) continue;                                            /* 出席予定でない（未回答・欠席） */
    const pid = person0OfReply.get(r.id);
    const a = (pid && seatByPerson.get(`reply_person:${pid}`)) || seatByPerson.get(`guest:${g.id}`) || null;
    if (!a) continue;                                            /* 未配席 */
    const side = g.side === 'groom' || g.side === 'bride' ? g.side : (r.side === 'groom' || r.side === 'bride' ? r.side : null);
    out.push({
      id: g.id, reception_id: g.reception_id,
      family_name: g.family_name, given_name: g.given_name,
      family_name_latin: g.family_name_latin, given_name_latin: g.given_name_latin,
      side,
      table: tableById.get(a.table_id) || null,
      seat: a.seat_index != null ? a.seat_index + 1 : null,
      checked_in_at: g.checked_in_at, checked_in_by: g.checked_in_by,
      items: itemsOf.get(g.id) || [],
      companions: companionsOfReply.get(r.id) || [],
    });
  }
  return out;
}

/* 年齢：age 列があればそれ、無ければ生年月日から挙式日（2026-09-26）時点で計算（public/app.js の ageAt と同じ） */
const EVENT_DATE = new Date(2026, 8, 26);
function ageAt(birthdate, age) {
  if (age !== null && age !== undefined && age !== '') return Number(age);
  if (!birthdate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate);
  if (!m) return null;
  let a = EVENT_DATE.getFullYear() - +m[1];
  const mm = (EVENT_DATE.getMonth() + 1) - +m[2];
  if (mm < 0 || (mm === 0 && EVENT_DATE.getDate() - +m[3] < 0)) a--;
  return a >= 0 ? a : null;
}

/* ---------------- 案内ページ ---------------- */
function page(message) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>受付</title>
<style>body{margin:0;background:#F4F0EA;color:#2B2B2B;font-family:-apple-system,"Hiragino Sans","Yu Gothic",Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#fff;border:1px solid #E2DAD0;padding:34px 30px;width:340px;max-width:90vw;text-align:center}
.t{font-family:Didot,"Bodoni 72",Georgia,serif;letter-spacing:.3em;font-size:12px;color:#6F665E;margin:0 0 10px}
p{margin:0;font-size:14px;line-height:1.8}</style></head>
<body><div class="box"><p class="t">RECEPTION</p><p>${message}</p></div></body></html>`;
}

/* Worker の単体テスト：Supabase と Auth を fetch のモックで置き換える */
import worker, { _resetSettingsCache } from '../src/worker.js';

const G1 = '22222222-2222-4222-8222-222222222222', G_ABSENT = '22222222-2222-4222-8222-000000000002',
      G_NOSEAT = '22222222-2222-4222-8222-000000000003', G_DELETED = '22222222-2222-4222-8222-000000000004',
      G_UNANSWERED = '22222222-2222-4222-8222-000000000005', G_PROV = '22222222-2222-4222-8222-000000000006';
const guest = (id, over) => ({ id, reception_id: '12345', family_name: '田中', given_name: '太郎', family_name_latin: 'TANAKA', given_name_latin: 'TARO', side: 'groom', checked_in_at: null, checked_in_by: null, deleted_at: null, email: 'secret@example.com', messenger_id: 'SECRET', ...over });
const db = {
  tokens: [{ id: '11111111-1111-4111-8111-111111111111', code: 'AbCdEfGh', label: '受付A', is_active: true, expires_at: null, last_used_at: null, default_side: 'bride' }],
  guests: [
    guest(G1),
    guest(G_ABSENT, { reception_id: '20002', family_name: '欠席' }),
    guest(G_NOSEAT, { reception_id: '20003', family_name: '未配席' }),
    guest(G_DELETED, { reception_id: '20004', family_name: '削除済', deleted_at: '2026-09-01T00:00:00Z' }),
    guest(G_UNANSWERED, { reception_id: '20005', family_name: '未回答' }),
    guest(G_PROV, { reception_id: '20006', family_name: '仮配席', side: null }),
  ],
  items: [{ id: '33333333-3333-4333-8333-333333333333', guest_id: G1, label: 'お車代', note: null, handed_at: null, handed_by: null, sort: 0 }],
  replies: [
    { id: 'r1', matched_guest_id: G1, attending: true, side: 'groom', deleted_at: null, superseded_by: null },
    { id: 'r2', matched_guest_id: G_ABSENT, attending: false, side: 'groom', deleted_at: null, superseded_by: null },
    { id: 'r3', matched_guest_id: G_NOSEAT, attending: true, side: 'bride', deleted_at: null, superseded_by: null },
    { id: 'r4', matched_guest_id: G_DELETED, attending: true, side: 'bride', deleted_at: null, superseded_by: null },
    { id: 'r1old', matched_guest_id: G1, attending: true, side: 'groom', deleted_at: null, superseded_by: 'r1' },   /* 上書きされた古い回答 */
  ],
  people: [{ id: 'p1', reply_id: 'r1', idx: 0, deleted_at: null }, { id: 'p2', reply_id: 'r2', idx: 0, deleted_at: null }, { id: 'p3', reply_id: 'r3', idx: 0, deleted_at: null }, { id: 'p4', reply_id: 'r4', idx: 0, deleted_at: null },
    /* v2.1: 同行者。idx 順で、出席かつ未削除の行だけが companions に入る */
    { id: 'c3', reply_id: 'r1', idx: 3, attending: true, deleted_at: null, family_name: '田中', given_name: 'さくら', family_name_latin: 'TANAKA', given_name_latin: 'SAKURA', is_child: true, age: null, birthdate: null },
    { id: 'c1', reply_id: 'r1', idx: 1, attending: true, deleted_at: null, family_name: '田中', given_name: '花子', family_name_latin: 'TANAKA', given_name_latin: 'HANAKO', is_child: false, age: null, birthdate: null },
    { id: 'c2', reply_id: 'r1', idx: 2, attending: true, deleted_at: null, family_name: '田中', given_name: '一郎', family_name_latin: 'TANAKA', given_name_latin: 'ICHIRO', is_child: true, age: null, birthdate: '2018-05-01' },
    { id: 'c4', reply_id: 'r1', idx: 4, attending: false, deleted_at: null, family_name: '田中', given_name: '欠席子', is_child: false },
    { id: 'c5', reply_id: 'r1', idx: 5, attending: true, deleted_at: '2026-09-01T00:00:00Z', family_name: '田中', given_name: '削除子', is_child: false },
    { id: 'c6', reply_id: 'r1old', idx: 1, attending: true, deleted_at: null, family_name: '田中', given_name: '旧回答子', is_child: false },
    { id: 'c7', reply_id: 'r2', idx: 1, attending: true, deleted_at: null, family_name: '欠席', given_name: '同行', is_child: false }],
  seats: [{ table_id: 'tA', seat_index: 2, person_type: 'reply_person', person_id: 'p1' }, { table_id: 'tA', seat_index: 3, person_type: 'reply_person', person_id: 'p2' },
          { table_id: 'tA', seat_index: 4, person_type: 'reply_person', person_id: 'p4' }, { table_id: 'tB', seat_index: 0, person_type: 'guest', person_id: G_PROV },
          { table_id: 'tA', seat_index: 3, person_type: 'reply_person', person_id: 'c1' }, { table_id: 'tB', seat_index: 1, person_type: 'reply_person', person_id: 'c2' }],
  tables: [{ id: 'tA', label: 'A' }, { id: 'tB', label: 'B' }],
  settings: [{ key: 'reception_id_enabled', value: true }],
  circles: [{ id: 'c1', name: '大学' }, { id: 'c2', name: '会社' }],
  guestCircles: [{ guest_id: G1, circle_id: 'c1' }, { guest_id: G1, circle_id: 'c2' }, { guest_id: G_ABSENT, circle_id: 'c1' }],
  /* ご祝儀（09_gifts / 10_gifts-v2）。受付 API からは一切読まれず、返らないこと */
  gifts: [{ id: 'gift1', source: 'attendee', status: 'received', envelope_name: 'ENVELOPE_SECRET', side: 'groom', kind: 'cash', currency: 'JPY', amount: 987654, amount_jpy: 987654, expected_jpy: 30000, received_by: 'RECEIVER_SECRET', deleted_at: null },
          { id: 'gift2', source: 'attendee', status: 'expected', expected_jpy: 876543, deleted_at: null }],
  giftGivers: [{ id: 'gv1', gift_id: 'gift1', reply_person_id: 'p1', guest_id: null, name: null }, { id: 'gv2', gift_id: 'gift2', reply_person_id: 'c1', guest_id: null, name: null }],
  giftReturns: [{ id: 'ret1', gift_id: 'gift1', item_name: 'RETURN_SECRET', price_jpy: 43210, shipping_jpy: 0, status: 'ordered', deleted_at: null }],
  /* v3：お渡しした引出物・引菓子 */
  giftHiki: [{ id: 'hk1', gift_id: 'gift1', gift_check_item_id: null, category: '引出物', name: 'HIKI_SECRET', price_jpy: 54321, qty: 1, deleted_at: null }],
};
const log = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); log.push(init.method || 'GET', u.pathname + u.search);
  if (u.pathname === '/auth/v1/user') {
    const tok = (init.headers.authorization || '').replace('Bearer ', '');
    if (tok === 'good') return new Response(JSON.stringify({ email: 'momo@forest-mm.com' }));
    if (tok === 'outsider') return new Response(JSON.stringify({ email: 'x@example.com' }));
    return new Response('{}', { status: 401 });
  }
  if (!u.pathname.startsWith('/rest/v1/')) return new Response('nf', { status: 404 });
  if (init.headers.apikey !== 'SERVICE') return new Response('bad key', { status: 401 });
  const table = u.pathname.slice(9);
  const sel = (u.searchParams.get('select') || '*').split(',');
  const pick = r => sel[0] === '*' ? r : Object.fromEntries(sel.map(k => [k, r[k]]));
  const filt = rows => rows.filter(r => [...u.searchParams].every(([k, v]) => {
    if (['select', 'order', 'limit'].includes(k)) return true;
    if (v === 'is.null') return r[k] == null; if (v === 'not.is.null') return r[k] != null;
    if (v.startsWith('eq.')) return String(r[k]) === decodeURIComponent(v.slice(3)); return true;
  }));
  const src = { reception_tokens: db.tokens, guests: db.guests, reception_items: db.items, seating_assignments: db.seats, seating_tables: db.tables, replies_admin: db.replies, reply_people: db.people, app_settings: db.settings, circles: db.circles, guest_circles: db.guestCircles,
    gifts: db.gifts, gift_givers: db.giftGivers, gift_returns: db.giftReturns, gift_hikidemono: db.giftHiki }[table] || [];
  if (init.method === 'PATCH') { const rows = filt(src); rows.forEach(r => Object.assign(r, JSON.parse(init.body))); return new Response(JSON.stringify(rows.map(pick))); }
  return new Response(JSON.stringify(filt(src).map(pick)));
};
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'ANON', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE',
  RECEPTION_COOKIE_SECRET: 'sekret-sekret-sekret-sekret-sekret-32', ADMIN_EMAILS: '', ADMIN_EMAIL_DOMAIN: 'forest-mm.com',
  ASSETS: { fetch: async () => new Response('asset') } };
const ctx = { waitUntil: p => p };
const req = (path, init = {}) => worker.fetch(new Request('https://admin.example' + path, init), env, ctx);
const ok = (name, cond) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) process.exitCode = 1; };

// 1. 短縮URL → Cookie
let r = await req('/r/AbCdEfGh');
const setc = r.headers.get('set-cookie') || '';
ok('/r/:code → 302 to /reception/', r.status === 302 && r.headers.get('location') === '/reception/');
ok('cookie attrs', /HttpOnly/.test(setc) && /Secure/.test(setc) && /SameSite=Lax/.test(setc) && /Path=\//.test(setc) && /Max-Age=6048\d\d/.test(setc));
const cookie = setc.split(';')[0];
r = await req('/r/ZZZZZZZZ'); ok('unknown code → 404 page', r.status === 404 && (await r.text()).includes('ご利用いただけません'));
// 2. me
r = await req('/api/reception/me'); ok('me without auth → 401', r.status === 401);
r = await req('/api/reception/me', { headers: { cookie } }); let b = await r.json();
ok('me with cookie → token', r.status === 200 && b.via === 'token' && b.label === '受付A' && r.headers.get('cache-control') === 'no-store' && r.headers.get('x-robots-tag') === 'noindex');
ok('v2: me returns token default_side', b.default_side === 'bride');
r = await req('/api/reception/me', { headers: { authorization: 'Bearer good' } }); b = await r.json();
ok('me with admin bearer → admin', b.via === 'admin' && b.label === 'admin:momo@forest-mm.com');
ok('v2: admin default_side is all', b.default_side === 'all');
r = await req('/api/reception/me', { headers: { authorization: 'Bearer outsider' } }); ok('bearer outside ADMIN domain → 401', r.status === 401);
// tampered cookie
r = await req('/api/reception/me', { headers: { cookie: cookie.slice(0, -2) + 'xx' } }); ok('tampered cookie → 401', r.status === 401);
// 3. guests: no secrets
r = await req('/api/reception/guests', { headers: { cookie } }); b = await r.json();
const txt = JSON.stringify(b);
ok('guests list', b.guests.length === 1 && b.guests[0].reception_id === '12345' && b.guests[0].items.length === 1);
ok('v2.4: guest has circles [{id,name}]', JSON.stringify(b.guests[0].circles) === JSON.stringify([{ id: 'c1', name: '大学' }, { id: 'c2', name: '会社' }]));
ok('v2: guest has side and table/seat', b.guests[0].side === 'groom' && b.guests[0].table === 'A' && b.guests[0].seat === 3);
ok('v2: absent / unseated / deleted / unanswered / provisional guests are excluded',
   !txt.includes('20002') && !txt.includes('20003') && !txt.includes('20004') && !txt.includes('20005') && !txt.includes('20006'));
ok('guests has no email/messenger', !txt.includes('secret@example.com') && !txt.includes('SECRET') && !('email' in b.guests[0]));
// v2.1: 同行者
const cs = b.guests[0].companions;
ok('v2.1: companions in idx order, attending & not deleted only', Array.isArray(cs) && cs.map(c => c.given_name).join(',') === '花子,一郎,さくら');
ok('v2.1: companion fields (name, is_child, age from birthdate, table/seat)',
   cs[0].family_name === '田中' && cs[0].family_name_latin === 'TANAKA' && cs[0].is_child === false && cs[0].age === null && cs[0].table === 'A' && cs[0].seat === 4
   && cs[1].is_child === true && cs[1].age === 8 && cs[1].table === 'B' && cs[1].seat === 2
   && cs[2].is_child === true && cs[2].age === null && cs[2].table === null && cs[2].seat === null);
ok('v2.1: absent / deleted / superseded-reply companions are excluded', !txt.includes('欠席子') && !txt.includes('削除子') && !txt.includes('旧回答子') && !txt.includes('同行'));
ok('v2.1: companions carry no contact fields', cs.every(c => !('email' in c) && !('messenger_id' in c) && !('allergy' in c) && !('reply_id' in c) && !('id' in c)));
// 4. checkin / undo
r = await req('/api/reception/checkin', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ guest_id: db.guests[0].id }) }); b = await r.json();
ok('checkin sets by=label', b.ok && b.guest.checked_in_by === '受付A' && !!db.guests[0].checked_in_at);
r = await req('/api/reception/checkin', { method: 'POST', headers: { cookie }, body: JSON.stringify({ guest_id: db.guests[0].id, undo: true }) }); b = await r.json();
ok('checkin undo', b.guest.checked_in_at === null && b.guest.checked_in_by === null);
r = await req('/api/reception/items/' + db.items[0].id + '/hand', { method: 'POST', headers: { authorization: 'Bearer good' }, body: '{}' }); b = await r.json();
ok('hand by admin', b.ok && b.item.handed_by === 'admin:momo@forest-mm.com');
// 5. 無効化したトークン → 次のリクエストから 401
db.tokens[0].is_active = false;
r = await req('/api/reception/me', { headers: { cookie } }); ok('deactivated token cookie → 401', r.status === 401);
db.tokens[0].is_active = true; db.tokens[0].expires_at = new Date(Date.now() - 1000).toISOString();
r = await req('/api/reception/me', { headers: { cookie } }); ok('expired token → 401', r.status === 401);
r = await req('/r/AbCdEfGh'); ok('expired code → 404', r.status === 404);
// 6. other paths → assets
r = await req('/index.html'); ok('other paths → assets', await r.text() === 'asset');
ok('last_used_at written once', log.filter(x => x.startsWith('/rest/v1/reception_tokens') && log[log.indexOf(x) - 1] === 'PATCH').length >= 1);

// v2.2: 受付IDの ON/OFF
db.tokens[0].is_active = true; db.tokens[0].expires_at = null;
r = await req('/api/reception/me', { headers: { cookie } }); b = await r.json();
ok('v2.2: me has reception_id_enabled=true', b.reception_id_enabled === true);
db.settings[0].value = false;
r = await req('/api/reception/guests', { headers: { cookie } }); b = await r.json();
ok('v2.2: settings are cached (still ON within 10s)', b.reception_id_enabled === true && 'reception_id' in b.guests[0]);
_resetSettingsCache();
r = await req('/api/reception/me', { headers: { cookie } }); b = await r.json();
ok('v2.2: me reflects OFF after cache expiry', b.reception_id_enabled === false);
r = await req('/api/reception/guests', { headers: { cookie } }); b = await r.json();
ok('v2.2: guests omit reception_id when OFF', b.reception_id_enabled === false && !JSON.stringify(b).includes('12345') && !('reception_id' in b.guests[0]));
db.settings[0].value = true; _resetSettingsCache();
r = await req('/api/reception/guests', { headers: { cookie } }); b = await r.json();
ok('v2.2: same reception_id returns when ON again', b.guests[0].reception_id === '12345');
db.settings.length = 0; _resetSettingsCache();
r = await req('/api/reception/me', { headers: { cookie } }); b = await r.json();
ok('v2.2: missing setting defaults to ON', b.reception_id_enabled === true);

// 09_gifts: 受付 API はご祝儀の表を読まず、ご祝儀の情報を返さない（トークンの端末・管理者のどちらでも）
db.tokens[0].is_active = true; db.tokens[0].expires_at = null;
const logFrom = log.length;
const bodies = [];
for (const h of [{ cookie }, { authorization: 'Bearer good' }]) {
  for (const path of ['/api/reception/me', '/api/reception/guests']) {
    r = await req(path, { headers: h }); bodies.push(await r.text());
  }
}
const giftTxt = bodies.join('\n');
ok('09_gifts: reception API never queries gifts / gift_givers / gift_returns / gift_hikidemono',
   !log.slice(logFrom).some(x => /\/rest\/v1\/gift(s|_givers|_returns|_hikidemono)\b/.test(x)));
ok('09_gifts: reception API responses carry no gift info',
   !giftTxt.includes('987654') && !giftTxt.includes('876543') && !giftTxt.includes('ENVELOPE_SECRET') && !giftTxt.includes('RETURN_SECRET')
   && !giftTxt.includes('RECEIVER_SECRET') && !giftTxt.includes('43210') && !giftTxt.includes('HIKI_SECRET') && !giftTxt.includes('54321')
   && !/"(gift|gifts|amount|amount_jpy|expected_jpy|goods_value_jpy|gift_id|envelope_name|return_policy|attendance|thank_you_sent|received_by|status)"\s*:/.test(giftTxt));
for (const path of ['/api/reception/gifts', '/api/gifts']) {
  r = await req(path, { headers: { cookie } });
  ok(`09_gifts: ${path} → 404`, r.status === 404);
}

// 06_modes: /api/media/*（R2）。管理者の Bearer だけ。受付トークンの Cookie・部外者は 401
const store = new Map(), uploads = new Map();
const bytes = s => new TextEncoder().encode(s);
const readAll = async b => b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(await new Response(b).arrayBuffer());
const objOf = (key, data, meta) => ({ key, size: data.length, httpEtag: '"e"', httpMetadata: meta || {},
  writeHttpMetadata: h => { if (meta?.contentType) h.set('content-type', meta.contentType); } });
env.MEDIA = {
  async createMultipartUpload(key, o) { const id = 'up' + uploads.size; uploads.set(id, { key, parts: new Map(), meta: o?.httpMetadata }); return { key, uploadId: id }; },
  resumeMultipartUpload(key, id) {
    const u = uploads.get(id);
    return {
      async uploadPart(n, body) { u.parts.set(n, await readAll(body)); return { partNumber: n, etag: 'et' + n }; },
      async complete(parts) {
        const data = new Uint8Array(parts.reduce((s, p) => s + u.parts.get(p.partNumber).length, 0)); let o = 0;
        for (const p of parts) { data.set(u.parts.get(p.partNumber), o); o += u.parts.get(p.partNumber).length; }
        store.set(key, { data, meta: u.meta }); uploads.delete(id); return objOf(key, data, u.meta);
      },
      async abort() { uploads.delete(id); },
    };
  },
  async put(key, buf, o) { store.set(key, { data: await readAll(buf), meta: o?.httpMetadata }); return objOf(key, store.get(key).data); },
  async head(key) { const s = store.get(key); return s ? objOf(key, s.data, s.meta) : null; },
  async get(key, o) {
    const s = store.get(key); if (!s) return null;
    const m = /bytes=(\d+)-(\d*)/.exec(o?.range?.get?.('range') || '');
    const ob = objOf(key, s.data, s.meta);
    if (m) {
      const off = +m[1]; if (off >= s.data.length) throw new Error('range');
      const end = m[2] ? Math.min(+m[2], s.data.length - 1) : s.data.length - 1;
      return { ...ob, range: { offset: off, length: end - off + 1, suffix: undefined }, body: s.data.slice(off, end + 1) };
    }
    return { ...ob, body: s.data };
  },
  async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
  async list({ prefix }) { return { objects: [...store.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
};
const adm = { authorization: 'Bearer good', 'content-type': 'application/json' };
const post = (path, body, h = adm) => req(path, { method: 'POST', headers: h, body: JSON.stringify(body) });
r = await post('/api/media/init', { key: 'movies/opening/720p.mp4', content_type: 'video/mp4' }, { cookie, 'content-type': 'application/json' });
ok('06 media: reception cookie → 401', r.status === 401);
r = await post('/api/media/init', { key: 'movies/opening/720p.mp4', content_type: 'video/mp4' }, { authorization: 'Bearer outsider' });
ok('06 media: non-admin bearer → 401', r.status === 401);
for (const [path, method] of [['/api/media/part?key=movies/a/720p.mp4&uploadId=x&partNumber=1', 'PUT'], ['/api/media/complete', 'POST'], ['/api/media/abort', 'POST'],
                              ['/api/media/object?key=movies/a/poster.jpg', 'PUT'], ['/api/media/sign', 'POST'], ['/api/media/delete', 'POST']]) {
  r = await req(path, { method, body: '{}' });
  ok(`06 media: ${method} ${path.split('?')[0]} without auth → 401`, r.status === 401);
}
r = await post('/api/media/init', { key: '../secret.mp4', content_type: 'video/mp4' });
ok('06 media: key outside movies/ → 400', r.status === 400);
r = await post('/api/media/init', { key: 'movies/opening/720p.mp4', content_type: 'video/quicktime' });
ok('06 media: non-mp4 → 400', r.status === 400);
r = await post('/api/media/init', { key: 'movies/opening/720p.mp4', content_type: 'video/mp4' }); b = await r.json();
const up = b.uploadId;
for (const [n, s] of [[1, 'hello '], [2, 'world']]) {
  r = await req(`/api/media/part?key=movies/opening/720p.mp4&uploadId=${up}&partNumber=${n}`, { method: 'PUT', headers: { authorization: 'Bearer good', 'content-length': String(s.length) }, body: bytes(s) });
}
r = await post('/api/media/complete', { key: 'movies/opening/720p.mp4', uploadId: up, parts: [{ partNumber: 1, etag: 'et1' }, { partNumber: 2, etag: 'et2' }] }); b = await r.json();
ok('06 media: multipart → one object', b.ok && b.size === 11 && store.has('movies/opening/720p.mp4'));
r = await req('/api/media/object?key=movies/opening/720p.mp4');
ok('06 media: GET without sig → 403', r.status === 403);
r = await post('/api/media/sign', { key: 'movies/opening/720p.mp4' }); b = await r.json();
r = await req(b.url, { headers: { range: 'bytes=6-10' } });
ok('06 media: signed GET with Range → 206', r.status === 206 && r.headers.get('content-range') === 'bytes 6-10/11' && await r.text() === 'world'
   && r.headers.get('accept-ranges') === 'bytes' && r.headers.get('content-type') === 'video/mp4');
r = await req(b.url.replace(/sig=[^&]+/, 'sig=AAAA'));
ok('06 media: tampered sig → 403', r.status === 403);
r = await req(b.url, { headers: { range: 'bytes=99-' } });
ok('06 media: unsatisfiable range → 416', r.status === 416 && r.headers.get('content-range') === 'bytes */11');
r = await req('/api/media/object?key=movies/opening/poster.jpg', { method: 'PUT', headers: { authorization: 'Bearer good', 'content-type': 'image/png' }, body: bytes('x') });
ok('06 media: poster must be jpeg', r.status === 400);
r = await req('/api/media/object?key=movies/opening/poster.jpg', { method: 'PUT', headers: { authorization: 'Bearer good', 'content-type': 'image/jpeg' }, body: bytes('jpg') });
ok('06 media: poster saved', r.status === 200 && store.has('movies/opening/poster.jpg'));
store.set('movies/profile/720p.mp4', { data: bytes('p') });
r = await post('/api/media/delete', { prefix: 'movies/opening/' }); b = await r.json();
ok('06 media: delete prefix removes only that movie', b.deleted === 2 && !store.has('movies/opening/720p.mp4') && store.has('movies/profile/720p.mp4'));
r = await post('/api/media/delete', { prefix: 'movies/' });
ok('06 media: delete prefix must be one movie', r.status === 400);

// 07_cms: POST /api/media/image（コンテンツの画像）と GET /api/admin/config。どちらも管理者の Bearer だけ
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const imgForm = (data, section = 'story', name = 'Meet 01.PNG', type = 'image/png') => {
  const f = new FormData(); f.set('section', section); f.set('file', new Blob([data], { type }), name); return f;
};
r = await req('/api/media/image', { method: 'POST', body: imgForm(png) });
ok('07 image: without auth → 401', r.status === 401);
r = await req('/api/media/image', { method: 'POST', headers: { cookie }, body: imgForm(png) });
ok('07 image: reception cookie → 401', r.status === 401);
r = await req('/api/media/image', { method: 'POST', headers: { authorization: 'Bearer good' }, body: imgForm(png) }); b = await r.json();
ok('07 image: png saved under guide/<section>/', r.status === 200 && /^guide\/story\/meet-01-[0-9a-f]{6}\.png$/.test(b.key)
   && b.path === 'media/' + b.key && store.get(b.key)?.meta?.contentType === 'image/png');
const guideKey = b.key;
r = await req('/api/media/image', { method: 'POST', headers: { authorization: 'Bearer good' }, body: imgForm(bytes('<svg/>'), 'story', 'x.png') });
ok('07 image: content that is not jpeg/png/webp → 400', r.status === 400);
r = await req('/api/media/image', { method: 'POST', headers: { authorization: 'Bearer good' }, body: imgForm(png, '../x') });
ok('07 image: bad section → 400', r.status === 400);
r = await req('/api/media/image', { method: 'POST', headers: { authorization: 'Bearer good' }, body: imgForm(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'marche', '写真.jpeg', 'image/jpeg') }); b = await r.json();
ok('07 image: japanese file name → img-xxxxxx.jpg', /^guide\/marche\/img-[0-9a-f]{6}\.jpg$/.test(b.key));
r = await req('/api/media/image', { method: 'POST', headers: { authorization: 'Bearer good' }, body: imgForm(new Uint8Array(10 * 1024 * 1024 + 1).fill(0xff)) });
ok('07 image: over 10MB → 413', r.status === 413);
r = await post('/api/media/sign', { keys: [guideKey] }); b = await r.json();
r = await req(b.urls[guideKey]);
ok('07 image: signed GET of a guide key', r.status === 200 && r.headers.get('content-type') === 'image/png');
r = await post('/api/media/sign', { key: 'guide/../secret.jpg' });
ok('07 image: sign rejects keys outside movies/ and guide/', r.status === 400);
r = await req('/api/admin/config');
ok('07 config: without auth → 401', r.status === 401);
env.PHOTOS_ADMIN_URL = 'https://photos.example/admin/'; env.GUEST_SITE_URL = 'https://guest.example';
r = await req('/api/admin/config', { headers: { authorization: 'Bearer good' } }); b = await r.json();
ok('07 config: urls for admins', b.photos_admin_url === 'https://photos.example/admin/' && b.guest_site_url === 'https://guest.example');

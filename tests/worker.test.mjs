/* Worker の単体テスト：Supabase と Auth を fetch のモックで置き換える */
import worker from '../src/worker.js';

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
  const src = { reception_tokens: db.tokens, guests: db.guests, reception_items: db.items, seating_assignments: db.seats, seating_tables: db.tables, replies_admin: db.replies, reply_people: db.people }[table] || [];
  if (init.method === 'PATCH') { const rows = filt(src); rows.forEach(r => Object.assign(r, JSON.parse(init.body))); return new Response(JSON.stringify(rows.map(pick))); }
  return new Response(JSON.stringify(filt(src).map(pick)));
};
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'ANON', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE',
  RECEPTION_COOKIE_SECRET: 'sekret-sekret-sekret-sekret-sekret-32', ADMIN_EMAILS: '', ADMIN_EMAIL_DOMAIN: 'forest-mm.com',
  ASSETS: { fetch: async () => new Response('asset') } };
const ctx = { waitUntil: p => p };
const req = (path, init = {}) => worker.fetch(new Request('https://admin.example' + path, init), env, ctx);
const ok = (name, cond) => console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name);

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

/* 06 公開モード：modes-logic.js の単体テスト（ゲスト側 Worker の resolveMode と同じ規則） */
import * as ML from '../public/modes-logic.js';

const ok = (name, cond) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) process.exitCode = 1; };
const T = s => new Date(s).getTime();

const modes = [
  { id: 'inv', slug: 'invitation', name: '招待状', starts_at: '2026-06-01T00:00:00+09:00', ends_at: '2026-09-26T00:00:00+09:00', features: { rsvp: true }, sort: 1 },
  { id: 'wed', slug: 'wedding', name: '結婚式', starts_at: '2026-09-26T00:00:00+09:00', ends_at: '2026-09-27T00:00:00+09:00', features: { guide: true, seating: true }, sort: 2 },
  { id: 'aft', slug: 'after', name: '結婚式後', starts_at: '2026-09-27T00:00:00+09:00', ends_at: '2026-12-31T23:59:00+09:00', features: { guide: true, movies: true, thanks: true }, sort: 3 },
];

let r = ML.resolveMode(modes, null, T('2026-05-01T00:00:00+09:00'));
ok('before first mode → first mode', r.mode?.slug === 'invitation' && r.via === 'before' && !r.closed);
r = ML.resolveMode(modes, null, T('2026-09-25T23:59:59+09:00'));
ok('invitation until 9/26 00:00 JST', r.mode?.slug === 'invitation');
r = ML.resolveMode(modes, null, T('2026-09-26T00:00:00+09:00'));
ok('starts_at is inclusive', r.mode?.slug === 'wedding' && r.via === 'auto');
r = ML.resolveMode(modes, null, T('2026-10-07T12:00:00+09:00'));
ok('after mode on 10/7', r.mode?.slug === 'after');
r = ML.resolveMode(modes, null, T('2026-12-31T23:59:00+09:00'));
ok('ends_at is exclusive → closed after last', r.closed && r.mode === null);
r = ML.resolveMode(modes, 'wed', T('2026-10-07T12:00:00+09:00'));
ok('override wins regardless of dates', r.mode?.slug === 'wedding' && r.via === 'override');
r = ML.resolveMode(modes, ML.OVERRIDE_CLOSED, T('2026-10-07T12:00:00+09:00'));
ok('override "closed" → closed', r.closed && r.via === 'override');
r = ML.resolveMode(modes, 'deleted-id', T('2026-10-07T12:00:00+09:00'));
ok('override to unknown id → auto', r.mode?.slug === 'after' && r.via === 'auto');
r = ML.resolveMode([], null, Date.now());
ok('no modes → closed', r.closed);

/* 重なり：sort 最小が優先 */
const ov = [{ ...modes[2], sort: 1 }, { id: 'x', slug: 'x', name: 'X', starts_at: '2026-10-01T00:00:00+09:00', ends_at: null, features: {}, sort: 0 }];
r = ML.resolveMode(ov, null, T('2026-10-07T00:00:00+09:00'));
ok('overlap: smaller sort wins', r.mode?.slug === 'x');
/* ends_at null：後に始まるモードがあればその開始まで、無ければ無期限 */
const open = [{ id: 'a', slug: 'a', starts_at: '2026-01-01T00:00:00Z', ends_at: null, sort: 1 }, { id: 'b', slug: 'b', starts_at: '2026-03-01T00:00:00Z', ends_at: '2026-04-01T00:00:00Z', sort: 2 }];
ok('null end → until next start', ML.resolveMode(open, null, T('2026-03-15T00:00:00Z')).mode?.slug === 'b');
ok('null end last → unlimited', ML.resolveMode([{ id: 'a', slug: 'a', starts_at: '2026-01-01T00:00:00Z', ends_at: null, sort: 1 }], null, T('2099-01-01T00:00:00Z')).mode?.slug === 'a');
ok('gap between modes → closed', ML.resolveMode([modes[0], modes[2]], null, T('2026-09-26T12:00:00+09:00')).closed);

/* 警告 */
const w = ML.periodWarnings([modes[0], { ...modes[1], ends_at: '2026-09-28T00:00:00+09:00' }, modes[2]]);
ok('warn overlap', w.some(x => x.kind === 'overlap' && x.b.slug === 'after'));
ok('warn gap', ML.periodWarnings([modes[0], modes[2]]).some(x => x.kind === 'gap'));
ok('no warning for default modes', ML.periodWarnings(modes).length === 0);

/* JST */
ok('toJstInput', ML.toJstInput('2026-09-26T15:00:00Z') === '2026-09-27T00:00');
ok('fromJstInput', ML.fromJstInput('2026-09-27T00:00') === '2026-09-26T15:00:00.000Z');
ok('fromJstInput empty', ML.fromJstInput('') === null);

/* プレビュー */
let p = ML.preview(modes[2].features);
ok('preview after: nav', JSON.stringify(p.nav) === JSON.stringify(['Movies', 'Thanks']));
p = ML.preview({ guide: true, story: true, movies: true, thanks: true, photo: true });
ok('preview after default: 4 nav items', JSON.stringify(p.nav) === JSON.stringify(['Story', 'Movies', 'Thanks', 'Photo']));
p = ML.preview(Object.fromEntries(ML.FEATURE_KEYS.map(k => [k, true])));
ok('preview: nav max 5 from the left', JSON.stringify(p.nav) === JSON.stringify(['Story', 'Seating', 'Menu', 'Marché', 'Movies']));
ok('preview: movies card after story', p.cards[0].startsWith('Our Story') && p.cards[1].startsWith('Movies'));
p = ML.preview({ rsvp: true });
ok('preview invitation: guide 404, rsvp form', !p.guide && p.invitation[0] === 'RSVP フォーム');
ok('preview closed', ML.preview({}, true).closed);

/* Movies */
let v = ML.upsertVariant([], { label: '1080p', key: 'k1', height: 1080 });
v = ML.upsertVariant(v, { label: '720p', key: 'k2', height: 720 });
v = ML.upsertVariant(v, { label: '720p', key: 'k3', height: 720 });
ok('variants: same label overwrites, sorted by height', v.length === 2 && v[0].key === 'k3' && v[1].label === '1080p');
ok('fmtDuration', ML.fmtDuration(185) === '3:05' && ML.fmtDuration(null) === '');
ok('movieKey', ML.movieKey('opening', '720p') === 'movies/opening/720p.mp4');

/* ギフト＆感想 */
const items = { g01: { id: 'g01', section: 'hikidemono', brand: 'B', name: 'ワイン' }, g02: { id: 'g02', section: 'hikidemono', brand: '', name: 'タオル' }, s01: { id: 's01', section: 'hikigashi', brand: '', name: 'ショコラ' } };
const rows = [
  { id: '1', guest_name: '吉永 百慧', table_label: 'A', hikidemono_id: 'g01', hikigashi_id: 's01', message: 'おめでとう, "最高"', lang: 'ja', created_at: '2026-09-27T01:00:00Z', reply_person_id: 'p' },
  { id: '2', guest_name: 'Taro', table_label: null, hikidemono_id: 'g01', hikigashi_id: null, message: null, lang: 'zh', created_at: '2026-09-28T01:00:00Z' },
];
const c = ML.countItems(rows, 'hikidemono_id', items, 'hikidemono');
ok('count: per item incl. zero', c.list[0].id === 'g01' && c.list[0].n === 2 && c.list.find(x => x.id === 'g02').n === 0 && c.none === 0);
ok('count: none', ML.countItems(rows, 'hikigashi_id', items, 'hikigashi').none === 1);
ok('filter: name ignores spaces', ML.filterFeedback(rows, { q: '吉永百慧' }).length === 1);
ok('filter: table none', ML.filterFeedback(rows, { table: '__none' })[0].id === '2');
ok('filter: item', ML.filterFeedback(rows, { item: 's01' }).length === 1);
const csv = ML.feedbackCsvRow(rows[0], items);
ok('csv row', csv.length === ML.FEEDBACK_CSV_COLS.length && csv[0] === '2026/09/27 10:00' && csv[4] === 'B ワイン' && csv[8] === '日本語' && csv[10] === 'はい');

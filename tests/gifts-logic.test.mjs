/* ご祝儀・内祝いの計算のテスト（00_spec/10_gifts-v2.md、内祝いは 09_gifts.md） */
import {
  attendees, planSync, syncIsEmpty, returnState, giverLabel, giverNames, isStale, giftValue, toJpy, parseYen, returnGuide,
  validateManual, summarize, budgetLink, mergePlan, unmergePlan, companionTargets, defaultTargets, matchRow, sortRows,
  csvRow, CSV_COLS, splitNames,
} from '../public/gifts-logic.js';

const ok = (name, cond) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) process.exitCode = 1; };

/* ================= 1. 出席者の同期 ================= */
const guests = [
  { id: 'G1', side: 'groom' }, { id: 'G2', side: null }, { id: 'G3', side: 'bride' },
];
const replies = [
  { id: 'R1', matched_guest_id: 'G1', side: 'bride', deleted_at: null, superseded_by: null },   // guest の side が優先
  { id: 'R2', matched_guest_id: 'G2', side: 'bride', deleted_at: null, superseded_by: null },   // guest に side が無い → 回答の side
  { id: 'R3', matched_guest_id: 'G3', side: 'bride', deleted_at: null, superseded_by: null },   // 欠席
  { id: 'R1old', matched_guest_id: 'G1', side: 'groom', deleted_at: null, superseded_by: 'R1' },
  { id: 'Rdel', matched_guest_id: null, side: 'groom', deleted_at: '2026-09-01T00:00:00Z', superseded_by: null },
];
const people = [
  { id: 'P1', reply_id: 'R1', idx: 0, attending: true, deleted_at: null },
  { id: 'P1c', reply_id: 'R1', idx: 1, attending: true, deleted_at: null },
  { id: 'P1x', reply_id: 'R1', idx: 2, attending: false, deleted_at: null },                 // 同行者だが欠席
  { id: 'P1d', reply_id: 'R1', idx: 3, attending: true, deleted_at: '2026-09-02T00:00:00Z' },  // 削除された同行者
  { id: 'P2', reply_id: 'R2', idx: 0, attending: true, deleted_at: null },
  { id: 'P3', reply_id: 'R3', idx: 0, attending: false, deleted_at: null },
  { id: 'Pold', reply_id: 'R1old', idx: 0, attending: true, deleted_at: null },              // 置き換えられた回答
  { id: 'Pdel', reply_id: 'Rdel', idx: 0, attending: true, deleted_at: null },               // 削除された回答
];
ok('attendees: live replies, attending, not deleted only', attendees(replies, people).map(a => a.person.id).join() === 'P1,P1c,P2');

/* 計画を DB（メモリ）に反映する。app.js の syncAttendees と同じ操作 */
let seq = 0;
function apply(db, plan) {
  for (const id of plan.restore) Object.assign(db.gifts.find(g => g.id === id), { deleted_at: null });
  for (const id of plan.remove) Object.assign(db.gifts.find(g => g.id === id), { deleted_at: 'now' });
  db.givers = db.givers.filter(x => !plan.dropGivers.includes(x.id));
  for (const c of plan.create) {
    const id = 'gift' + (++seq);
    db.gifts.push({ id, source: 'attendee', status: 'expected', expected_jpy: c.expected, side: c.side, deleted_at: null });
    if (db.givers.some(x => x.reply_person_id === c.personId)) throw new Error('unique violation');
    db.givers.push({ id: 'gv' + seq, gift_id: id, reply_person_id: c.personId, guest_id: null, name: null });
  }
}
const plan = db => planSync({ replies: db.replies, people: db.people, guests, gifts: db.gifts, givers: db.givers, defaultJpy: 30000 });
const db = { replies, people: people.map(p => ({ ...p })), gifts: [], givers: [] };
let p1 = plan(db);
ok('sync: creates 1 gift per attendee', p1.create.length === 3 && p1.restore.length === 0 && p1.remove.length === 0);
const byPerson = id => p1.create.find(c => c.personId === id);
ok('sync: 本人 = default 30000, 同行者 = 0', byPerson('P1').expected === 30000 && byPerson('P1c').expected === 0 && byPerson('P2').expected === 30000);
ok('sync: side from matched guest, else reply side', byPerson('P1').side === 'groom' && byPerson('P1c').side === 'groom' && byPerson('P2').side === 'bride');
apply(db, p1);
ok('sync: idempotent (2nd run plans nothing)', syncIsEmpty(plan(db)));
apply(db, plan(db));
ok('sync: idempotent (3rd run, still 3 gifts / 3 givers)', syncIsEmpty(plan(db)) && db.gifts.length === 3 && db.givers.length === 3);

/* 受領済みは触らない。仮は論理削除 */
const giftOf = pid => db.gifts.find(g => g.id === db.givers.find(x => x.reply_person_id === pid).gift_id);
giftOf('P2').status = 'received'; giftOf('P2').amount_jpy = 30000;
db.people.find(p => p.id === 'P2').attending = false;       // 受領済みの人が欠席に
db.people.find(p => p.id === 'P1c').attending = false;      // 仮の同行者が欠席に
let p2 = plan(db);
ok('sync: absent expected → remove; received untouched', p2.remove.length === 1 && p2.remove[0] === giftOf('P1c').id && p2.create.length === 0);
apply(db, p2);
ok('sync: idempotent after removal', syncIsEmpty(plan(db)));
ok('sync: received gift of absent person stays live', !giftOf('P2').deleted_at);

/* 出席に戻ったら、削除した仮を復元（gift_givers.reply_person_id は一意なので作り直さない） */
db.people.find(p => p.id === 'P1c').attending = true;
let p3 = plan(db);
ok('sync: back to attending → restore (no new gift)', p3.restore.length === 1 && p3.restore[0] === giftOf('P1c').id && p3.create.length === 0);
apply(db, p3);
ok('sync: idempotent after restore', syncIsEmpty(plan(db)) && !giftOf('P1c').deleted_at);

/* 仮の連名：欠席になった人だけ外す／全員いなくなったら削除 */
const gP1 = giftOf('P1'), gP1c = giftOf('P1c');
db.givers.find(x => x.reply_person_id === 'P1c').gift_id = gP1.id;        // 本人と同行者を連名に
gP1c.deleted_at = 'merged';
ok('sync: merged group is stable', syncIsEmpty(plan(db)));
db.people.find(p => p.id === 'P1c').attending = false;
let p4 = plan(db);
ok('sync: absent member is dropped from expected group (gift stays)', p4.dropGivers.length === 1 && p4.remove.length === 0 && p4.restore.length === 0);
apply(db, p4);
ok('sync: idempotent after drop', syncIsEmpty(plan(db)));
db.people.find(p => p.id === 'P1c').attending = true;
let p5 = plan(db);
ok('sync: dropped member returns → new own gift (merged-away gift is not restored)', p5.create.length === 1 && p5.create[0].personId === 'P1c' && p5.restore.length === 0);
apply(db, p5);
ok('sync: idempotent after re-create', syncIsEmpty(plan(db)));

/* 回答の置き換え：古い回答の人は出席者ではなくなり、新しい回答の人が入る */
const db2 = { replies: replies.map(r => ({ ...r })), people: people.map(p => ({ ...p })), gifts: [], givers: [] };
apply(db2, plan(db2));
db2.replies.find(r => r.id === 'R2').superseded_by = 'R2new';
db2.replies.push({ id: 'R2new', matched_guest_id: 'G2', side: 'groom', deleted_at: null, superseded_by: null });
db2.people.push({ id: 'P2new', reply_id: 'R2new', idx: 0, attending: true, deleted_at: null });
const p6 = plan(db2);
ok('sync: superseded reply → old removed, new created', p6.remove.length === 1 && p6.create.length === 1 && p6.create[0].personId === 'P2new');
apply(db2, p6);
ok('sync: idempotent after supersede', syncIsEmpty(plan(db2)));
/* 追加（manual）のご祝儀は同期の対象外 */
db2.gifts.push({ id: 'm1', source: 'manual', status: 'expected', expected_jpy: 0, deleted_at: null });
db2.givers.push({ id: 'gm1', gift_id: 'm1', reply_person_id: null, guest_id: 'G3', name: null });
ok('sync: manual gifts are never touched', syncIsEmpty(plan(db2)));

/* ================= 表示・状態 ================= */
const person = (id, name, idx, over = {}) => ({ id, kind: 'person', name, latin: '', idx, replyId: 'R', guestId: 'G', attending: true, side: 'groom', ...over });
const gift = over => ({ id: 'x', source: 'attendee', status: 'expected', expected_jpy: 30000, amount_jpy: null, side: 'groom', kind: 'cash', currency: 'JPY',
  return_needed: true, thank_you_sent: false, expected_edited: false, deleted_at: null, received_at: null, ...over });
const ret = over => ({ id: 'r', gift_id: 'x', item_name: 'カタログ', price_jpy: 10000, shipping_jpy: 500, status: 'ordered', deleted_at: null, ...over });
const row = (g, givers = [], returns = []) => ({ gift: g, givers, returns });

ok('value: expected → expected_jpy, received → amount_jpy', giftValue(gift()) === 30000 && giftValue(gift({ status: 'received', amount_jpy: 50000 })) === 50000);
ok('label: 連名 A・B・C', giverLabel(row(gift(), [person('a', 'A', 0), person('b', 'B', 1), { id: 'c', kind: 'name', name: 'C' }])) === 'A・B・C');
ok('label: none', giverLabel(row(gift())) === '（贈り主未設定）' && giverNames(row(gift(), [person('a', 'A', 0)])).join() === 'A');
ok('stale: attendee gift whose person no longer attends', isStale(row(gift({ status: 'received' }), [person('a', 'A', 0, { attending: false })]))
   && !isStale(row(gift(), [person('a', 'A', 0)])) && isStale(row(gift(), [{ id: 'o', kind: 'orphan', name: '' }]))
   && !isStale(row(gift({ source: 'manual' }), [{ id: 'g', kind: 'guest', name: 'G' }])));

ok('return state: expected without returns → pending', returnState(row(gift())) === 'pending');
ok('return state: received, no returns → 未手配', returnState(row(gift({ status: 'received' }))) === 'todo');
ok('return state: 不要', returnState(row(gift({ status: 'received', return_needed: false }))) === 'none');
ok('return state: 予定 only → 未手配', returnState(row(gift({ status: 'received' }), [], [ret({ status: 'planned' })])) === 'todo');
ok('return state: partial / shipped / delivered',
   returnState(row(gift({ status: 'received' }), [], [ret({ status: 'ordered' })])) === 'partial'
   && returnState(row(gift({ status: 'received' }), [], [ret({ status: 'shipped' }), ret({ status: 'delivered' })])) === 'shipped'
   && returnState(row(gift({ status: 'received' }), [], [ret({ status: 'delivered' })])) === 'delivered');
ok('return state: deleted returns ignored', returnState(row(gift({ status: 'received' }), [], [ret({ status: 'delivered', deleted_at: 'x' })])) === 'todo');

/* ================= 金額 ================= */
ok('parseYen: plain / full-width / commas / ¥ / blank / invalid',
   parseYen('30000') === 30000 && parseYen('３００００') === 30000 && parseYen('30,000円') === 30000 && parseYen('¥5000') === 5000
   && parseYen('') === null && parseYen('-1') === undefined && parseYen('1.5') === undefined && parseYen('abc') === undefined);
ok('toJpy: JPY copies amount, foreign uses 円換算額', toJpy('JPY', '30000', '') === 30000 && toJpy('USD', '200', '29800') === 29800 && toJpy('USD', '200', '') === null);
ok('guide: 1/3〜1/2 of value', JSON.stringify(returnGuide(gift({ status: 'received', amount_jpy: 30000 }))) === JSON.stringify({ low: 10000, high: 15000 })
   && returnGuide(gift({ expected_jpy: 0 })) === null);
ok('manual: giver required', validateManual({ guestIds: [], names: '', amount: '10000' }) !== null);
ok('manual: guest or name is enough', validateManual({ guestIds: ['G3'], names: '', amount: '10000' }) === null
   && validateManual({ guestIds: [], names: '山田 一郎・山田 花子', amount: '10000' }) === null);
ok('manual: amount required (goods optional)', validateManual({ guestIds: ['G3'], names: '', amount: '' }) !== null
   && validateManual({ guestIds: ['G3'], names: '', amount: '', kind: 'goods' }) === null
   && validateManual({ guestIds: ['G3'], names: '', amount: 'x' }) !== null);
ok('split names', splitNames(' 山田 一郎・山田 花子、佐藤 ').join('|') === '山田 一郎|山田 花子|佐藤');

/* ================= 集計・予算連動 ================= */
const gifts = [
  gift({ id: 'g1', status: 'received', amount_jpy: 50000, side: 'groom' }),
  gift({ id: 'g2', status: 'expected', expected_jpy: 30000, side: 'bride' }),
  gift({ id: 'g3', status: 'expected', expected_jpy: 0, side: 'bride' }),
  gift({ id: 'g4', status: 'received', amount_jpy: 10000, side: null, source: 'manual' }),
  gift({ id: 'g5', status: 'received', amount_jpy: 99999, deleted_at: 'x' }),
];
const returns = [
  ret({ id: 'r1', gift_id: 'g1', price_jpy: 15000, shipping_jpy: 800, status: 'ordered' }),
  ret({ id: 'r2', gift_id: 'g1', price_jpy: 3000, shipping_jpy: 0, status: 'planned' }),
  ret({ id: 'r3', gift_id: 'g4', price_jpy: 4000, shipping_jpy: 500, status: 'delivered' }),
  ret({ id: 'r4', gift_id: 'g4', price_jpy: 9999, status: 'shipped', deleted_at: 'x' }),
  ret({ id: 'r5', gift_id: 'g5', price_jpy: 40000, status: 'ordered' }),
];
const link = budgetLink(gifts, returns);
ok('budget: income = received amount_jpy + expected expected_jpy (deleted excluded)', link.giftTotal === 50000 + 30000 + 0 + 10000 && link.giftCount === 4);
ok('budget: breakdown 受領済み / 仮', link.receivedCount === 2 && link.receivedTotal === 60000 && link.expectedCount === 2 && link.expectedTotal === 30000);
ok('budget: 内祝い excludes 予定 / deleted / deleted gift', link.returnTotal === 15800 + 4500 && link.returnCount === 2);
/* 受領のたびに内訳が変わる（合計は受領額が仮と同じなら変わらない） */
const after = gifts.map(g => g.id === 'g2' ? { ...g, status: 'received', amount_jpy: 30000 } : g);
const l2 = budgetLink(after, returns);
ok('budget: receiving 30000 moves it from 仮 to 受領済み', l2.giftTotal === link.giftTotal && l2.receivedTotal === 90000 && l2.expectedTotal === 0);
const l3 = budgetLink(gifts.map(g => g.id === 'g2' ? { ...g, status: 'received', amount_jpy: 50000 } : g), returns);
ok('budget: receiving a different amount changes the total', l3.giftTotal === link.giftTotal + 20000);
ok('budget: empty', budgetLink([], []).giftTotal === 0);

const rows = gifts.map(g => row(g, [person('p' + g.id, 'N' + g.id, 0)], returns.filter(r => r.gift_id === g.id)));
const sm = summarize(rows);
ok('summary: total and 受領済み / 仮', sm.count === 4 && sm.total === 90000 && sm.received.count === 2 && sm.received.total === 60000 && sm.expected.count === 2 && sm.expected.total === 30000);
ok('summary: groom / bride / none', sm.groom.total === 50000 && sm.bride.total === 30000 && sm.bride.count === 2 && sm.none.count === 1);
ok('summary: return cost (予定 separate), todo counts received only', sm.returnCost === 20300 && sm.returnPlanned === 3000 && sm.todo === 0);
ok('summary: expected rows are not 未手配', summarize([row(gift()), row(gift({ status: 'received' }))]).todo === 1);

/* ================= 3. 連名 ================= */
const rA = row(gift({ id: 'A', expected_jpy: 30000 }), [person('pa', '本人', 0, { replyId: 'R1' })]);
const rB = row(gift({ id: 'B', expected_jpy: 0 }), [person('pb', '同行1', 1, { replyId: 'R1' })]);
const rC = row(gift({ id: 'C', expected_jpy: 20000 }), [person('pc', '同行2', 2, { replyId: 'R1' })]);
const rD = row(gift({ id: 'D', expected_jpy: 30000, status: 'received', amount_jpy: 30000 }), [person('pd', '別', 0, { replyId: 'R9' })]);
const mp = mergePlan([rA, rB, rC]);
ok('merge: keeps the first row, sums expected', mp.keep === rA && mp.others.length === 2 && mp.expected === 50000);
ok('merge: received rows cannot be merged', !!mergePlan([rA, rD]).error);
ok('merge: needs 2+ rows', !!mergePlan([rA]).error);
const grp = row(gift({ id: 'A', expected_jpy: 50000, expected_edited: true }), [person('pa', '本人', 0), person('pb', '同行1', 1), { id: 'n', kind: 'name', name: '名前' }]);
const up = unmergePlan(grp, 30000);
ok('unmerge: 本人 → default, others → 0, first stays', up.parts.length === 3 && up.parts[0].keep && up.parts[0].expected === 30000
   && up.parts[1].expected === 0 && !up.parts[1].keep && up.parts[1].source === 'attendee' && up.parts[2].source === 'manual');
ok('unmerge: not for received / single', !!unmergePlan({ ...grp, gift: { ...grp.gift, status: 'received' } }, 30000).error && !!unmergePlan(rA, 30000).error);
const all = [rA, rB, rC, rD];
ok('companions: same reply, single companion, expected', companionTargets(rA, all).map(r => r.gift.id).join() === 'B,C');
ok('companions: none for companion rows / received / other reply', companionTargets(rB, all).length === 0 && companionTargets(rD, all).length === 0);
ok('companions: received companion is excluded', companionTargets(rA, [rA, rB, row(gift({ id: 'E', status: 'received' }), [person('pe', 'e', 3, { replyId: 'R1' })])]).map(r => r.gift.id).join() === 'B');

/* ================= 7. 既定値の変更 ================= */
const dRows = [
  rA,                                                                                    // 対象
  row(gift({ id: 'E', expected_edited: true }), [person('pe', 'e', 0)]),                  // 手で変えた
  rB,                                                                                    // 同行者
  rD,                                                                                    // 受領済み
  row(gift({ id: 'F', source: 'manual' }), [{ id: 'g', kind: 'guest', name: 'g' }]),      // 追加
  grp,                                                                                   // 連名
  row(gift({ id: 'H', expected_jpy: 20000 }), [person('ph', 'h', 0)]),                    // 既に新しい値
];
ok('default change: only 仮・出席者・本人・not edited', defaultTargets(dRows, 20000).map(r => r.gift.id).join() === 'A');

/* ================= 絞り込み・並び替え ================= */
const circles = { G1: ['univ'], G2: [] };
const fr = [
  row(gift({ id: '1', status: 'received', amount_jpy: 10000, side: 'bride', received_at: '2026-09-26T10:00:00Z' }), [person('p1', '鈴木 一郎', 0, { latin: 'SUZUKI ICHIRO', guestId: 'G1' })]),
  row(gift({ id: '2', expected_jpy: 30000, side: 'groom' }), [person('p2', '田中 太郎', 0, { latin: 'TANAKA TARO', guestId: 'G2' })]),
  row(gift({ id: '3', status: 'received', amount_jpy: 50000, side: null, source: 'manual', envelope_name: '寿 青木家', received_at: '2026-09-27T09:00:00Z' }), [{ id: 'n', kind: 'name', name: '青木 翔', latin: '' }]),
];
const pick = f => fr.filter(r => matchRow(r, f, id => circles[id] || [])).map(r => r.gift.id).join();
ok('filter: status', pick({ status: 'expected' }) === '2' && pick({ status: 'received' }) === '1,3');
ok('filter: side', pick({ side: 'bride' }) === '1' && pick({ side: 'none' }) === '3');
ok('filter: source', pick({ source: 'manual' }) === '3' && pick({ source: 'attendee' }) === '1,2');
ok('filter: circle', pick({ circle: 'univ' }) === '1' && pick({ circle: '__none' }) === '2,3');
ok('filter: 内祝い状況', pick({ state: 'pending' }) === '2' && pick({ state: 'todo' }) === '1,3');
ok('filter: search name / latin / envelope', pick({ q: '田中太郎' }) === '2' && pick({ q: 'suzuki' }) === '1' && pick({ q: '青木家' }) === '3');
const ord = k => sortRows(fr, k).map(r => r.gift.id).join('');
ok('sort: name (latin first)', ord('name') === '123');
ok('sort: side (groom, bride, none)', ord('side') === '213');
ok('sort: amount desc (value)', ord('amount') === '321');
ok('sort: received desc, expected last', ord('received') === '312');

/* ================= CSV ================= */
const line = csvRow(row(gift({ id: 'c', status: 'received', amount_jpy: 30000, currency: 'JPY', received_at: '2026-09-26T01:02:00Z' }),
  [person('a', '田中 太郎', 0, { latin: 'Tanaka Taro' }), person('b', '田中 花子', 1, { latin: 'Tanaka Hanako' })], [ret({ status: 'planned' })]));
const col = k => line[CSV_COLS.indexOf(k)];
ok('csv: column count', line.length === CSV_COLS.length);
ok('csv: givers / latin / count', col('贈り主') === '田中 太郎・田中 花子' && col('贈り主（ローマ字）') === 'TANAKA TARO・TANAKA HANAKO' && col('人数') === 2);
ok('csv: status and amount', col('状態') === '受領済み' && col('区分') === '出席者' && col('金額（円）') === 30000 && col('受領日時').startsWith('2026/09/26'));
ok('csv: returns', col('内祝い 品名') === 'カタログ' && col('内祝い 金額（商品代＋送料）') === 10500 && col('内祝い 明細').includes('予定'));
const l4 = csvRow(row(gift(), [person('a', 'A', 0)]));
ok('csv: expected row → 仮 and expected value', l4[CSV_COLS.indexOf('状態')] === '仮' && l4[CSV_COLS.indexOf('金額（円）')] === 30000 && l4[CSV_COLS.indexOf('受領日時')] === '');

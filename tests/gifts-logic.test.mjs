/* ご祝儀・内祝いの計算のテスト（00_spec/09_gifts.md） */
import {
  returnState, giverNames, giverLabel, splitNames, joinNames, toJpy, returnGuide, validateGift,
  summarize, budgetLink, giftIncome, matchRow, sortRows, csvRow, CSV_COLS, DEFAULT_RECEIVED_ON,
} from '../public/gifts-logic.js';

const ok = (name, cond) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) process.exitCode = 1; };

const guest = (id, fn, gn, fl, gl, side) => ({ id, family_name: fn, given_name: gn, family_name_latin: fl, given_name_latin: gl, side });
const A = guest('a', '田中', '太郎', 'TANAKA', 'TARO', 'groom');
const B = guest('b', '田中', '花子', 'TANAKA', 'HANAKO', 'groom');
const C = guest('c', '鈴木', '一郎', 'SUZUKI', 'ICHIRO', 'bride');
const gift = over => ({ id: 'x', giver_name: null, envelope_name: null, side: null, kind: 'cash', currency: 'JPY', amount: 30000, amount_jpy: 30000,
  received_on: '2026-09-26', route: 'reception', return_needed: true, thank_you_sent: false, memo: null, deleted_at: null, created_at: '2026-09-27T00:00:00Z', ...over });
const ret = over => ({ id: 'r', gift_id: 'x', item_name: 'カタログ', shop: null, price_jpy: 10000, shipping_jpy: 500, status: 'ordered', deleted_at: null, ...over });
const row = (g, givers = [], returns = []) => ({ gift: g, givers, returns });

/* ---- 内祝い状況 ---- */
ok('state: 不要 when return_needed=false (even with returns)', returnState(row(gift({ return_needed: false }), [], [ret()])) === 'none');
ok('state: 未手配 when no returns', returnState(row(gift())) === 'todo');
ok('state: 未手配 when all returns are 予定', returnState(row(gift(), [], [ret({ status: 'planned' }), ret({ status: 'planned' })])) === 'todo');
ok('state: deleted returns are ignored', returnState(row(gift(), [], [ret({ status: 'delivered', deleted_at: '2026-09-27T00:00:00Z' })])) === 'todo');
ok('state: 手配中（一部） when some ordered', returnState(row(gift(), [], [ret({ status: 'ordered' })])) === 'partial');
ok('state: 手配中（一部） when shipped + planned', returnState(row(gift(), [], [ret({ status: 'shipped' }), ret({ status: 'planned' })])) === 'partial');
ok('state: 発送済 when all shipped/delivered', returnState(row(gift(), [], [ret({ status: 'shipped' }), ret({ status: 'delivered' })])) === 'shipped');
ok('state: 到着済 when all delivered', returnState(row(gift(), [], [ret({ status: 'delivered' }), ret({ status: 'delivered' })])) === 'delivered');

/* ---- 贈り主（連名・ゲスト外） ---- */
ok('split names: ・ 、 , and blanks', JSON.stringify(splitNames(' 山田 一郎・山田 花子、 佐藤,, ')) === JSON.stringify(['山田 一郎', '山田 花子', '佐藤']));
ok('join names', joinNames(['a', ' ', 'b ']) === 'a・b');
ok('label: single guest', giverLabel(row(gift(), [A])) === '田中 太郎');
ok('label: two givers', giverLabel(row(gift(), [A, B])) === '田中 太郎・田中 花子');
ok('label: 3+ givers → 「A・B ほか」', giverLabel(row(gift({ giver_name: '山田 一郎' }), [A, B])) === '田中 太郎・田中 花子 ほか');
ok('label: outside-list giver only', giverLabel(row(gift({ giver_name: '山田 一郎・山田 花子' }))) === '山田 一郎・山田 花子');
ok('names: guests first, then outside-list', giverNames(row(gift({ giver_name: '山田 一郎' }), [C])).join('|') === '鈴木 一郎|山田 一郎');
ok('label: no giver', giverLabel(row(gift())) === '（贈り主未設定）');

/* ---- 金額・外貨 ---- */
ok('jpy: JPY copies amount (rounded)', toJpy('JPY', '30000.4', '999') === 30000);
ok('jpy: foreign uses entered 円換算額', toJpy('USD', '200', '29800') === 29800);
ok('jpy: foreign without 円換算額 → null', toJpy('USD', '200', '') === null);
ok('jpy: empty amount → null', toJpy('JPY', '', '') === null);
ok('guide: 1/3〜1/2', JSON.stringify(returnGuide({ amount_jpy: 30000 })) === JSON.stringify({ low: 10000, high: 15000 }));
ok('guide: no amount → null', returnGuide({ amount_jpy: null }) === null);

const form = over => ({ guestIds: ['a'], giver_name: '', kind: 'cash', route: 'reception', received_on: DEFAULT_RECEIVED_ON, currency: 'JPY', amount: '30000', amount_jpy: '', ...over });
ok('validate: default received_on is 2026-09-26', DEFAULT_RECEIVED_ON === '2026-09-26');
ok('validate: ok', validateGift(form()) === null);
ok('validate: giver required', validateGift(form({ guestIds: [] })) !== null);
ok('validate: outside-list giver alone is fine', validateGift(form({ guestIds: [], giver_name: '山田 一郎' })) === null);
ok('validate: cash needs amount', validateGift(form({ amount: '' })) !== null);
ok('validate: goods amount optional', validateGift(form({ kind: 'goods', amount: '' })) === null);
ok('validate: foreign needs 円換算額', validateGift(form({ currency: 'USD', amount: '200' })) !== null
   && validateGift(form({ currency: 'USD', amount: '200', amount_jpy: '29800' })) === null);
ok('validate: goods in foreign currency needs nothing', validateGift(form({ kind: 'goods', currency: 'USD', amount: '', amount_jpy: '' })) === null);
ok('validate: negative amount rejected', validateGift(form({ amount: '-1' })) !== null);

/* ---- 集計・予算連動 ---- */
const gifts = [
  gift({ id: 'g1', side: 'groom', amount_jpy: 30000 }),
  gift({ id: 'g2', side: 'bride', amount_jpy: 50000, currency: 'USD', amount: 350 }),
  gift({ id: 'g3', side: null, kind: 'goods', amount: null, amount_jpy: null, return_needed: false }),
  gift({ id: 'g4', side: 'bride', amount_jpy: 100000, deleted_at: '2026-09-27T00:00:00Z' }),
];
const returns = [
  ret({ id: 'r1', gift_id: 'g1', price_jpy: 10000, shipping_jpy: 800, status: 'ordered' }),
  ret({ id: 'r2', gift_id: 'g1', price_jpy: 3000, shipping_jpy: 0, status: 'planned' }),
  ret({ id: 'r3', gift_id: 'g2', price_jpy: 20000, shipping_jpy: 1000, status: 'delivered' }),
  ret({ id: 'r4', gift_id: 'g2', price_jpy: 99999, shipping_jpy: 0, status: 'shipped', deleted_at: '2026-09-27T00:00:00Z' }),
  ret({ id: 'r5', gift_id: 'g4', price_jpy: 40000, shipping_jpy: 0, status: 'ordered' }),   // 削除済みのご祝儀の分
];
const link = budgetLink(gifts, returns);
ok('budget: ご祝儀 = live amount_jpy sum (deleted excluded, null = 0)', link.giftCount === 3 && link.giftTotal === 80000);
ok('budget: 内祝い = price+shipping excluding 予定 / deleted / deleted gift', link.returnTotal === 10800 + 21000 && link.returnCount === 2);
ok('budget: income uses actual when there is at least 1 gift', JSON.stringify(giftIncome(link, 2700000)) === JSON.stringify({ value: 80000, actual: true }));
ok('budget: income falls back to estimate with 0 gifts', JSON.stringify(giftIncome(budgetLink([], []), 2700000)) === JSON.stringify({ value: 2700000, actual: false }));
ok('budget: income falls back to estimate when gifts could not be loaded', giftIncome(null, 123).value === 123 && giftIncome(null, 123).actual === false);
ok('budget: only deleted gifts → estimate', giftIncome(budgetLink([gifts[3]], []), 5).actual === false);

const byGift = id => returns.filter(r => r.gift_id === id);
const rows = gifts.map(g => row(g, g.id === 'g1' ? [A, B] : g.id === 'g2' ? [C] : [], byGift(g.id)));
const sm = summarize(rows);
ok('summary: total & count (deleted excluded)', sm.count === 3 && sm.total === 80000);
ok('summary: groom / bride / none', sm.groom.total === 30000 && sm.groom.count === 1 && sm.bride.total === 50000 && sm.bride.count === 1 && sm.none.count === 1);
ok('summary: return cost excludes 予定 (shown separately)', sm.returnCost === 31800 && sm.returnPlanned === 3000);
ok('summary: 未手配 count', sm.todo === 0 && summarize([row(gift()), row(gift({ return_needed: false }))]).todo === 1);

/* ---- 絞り込み・並び替え ---- */
const circles = { a: ['univ'], b: [], c: ['work'] };
const cOf = id => circles[id] || [];
const live = rows.filter(r => !r.gift.deleted_at);
const pick = f => live.filter(r => matchRow(r, f, cOf)).map(r => r.gift.id).join(',');
ok('filter: side', pick({ side: 'bride' }) === 'g2' && pick({ side: 'none' }) === 'g3');
ok('filter: kind', pick({ kind: 'goods' }) === 'g3');
ok('filter: state', pick({ state: 'partial' }) === 'g1' && pick({ state: 'delivered' }) === 'g2' && pick({ state: 'none' }) === 'g3');
ok('filter: circle via givers', pick({ circle: 'univ' }) === 'g1' && pick({ circle: '__none' }) === 'g3');
ok('filter: thanks', pick({ thanks: 'unsent' }) === 'g1,g2,g3' && pick({ thanks: 'sent' }) === '');
ok('filter: name search (kanji / latin / companion in 連名, spaces ignored)', pick({ q: '花子' }) === 'g1' && pick({ q: 'suzuki' }) === 'g2' && pick({ q: '田中 太郎' }) === 'g1');
ok('filter: search hits envelope name', matchRow(row(gift({ envelope_name: '寿 山田家' })), { q: '山田家' }));

const s2 = [row(gift({ id: 'p', received_on: '2026-09-26', amount_jpy: 10000 }), [C]),
            row(gift({ id: 'q', received_on: '2026-10-02', amount_jpy: 50000 }), [A]),
            row(gift({ id: 'r', received_on: '2026-09-30', amount_jpy: null, giver_name: '青木 翔' }))];
ok('sort: received (newest first)', sortRows(s2, 'received').map(r => r.gift.id).join('') === 'qrp');
ok('sort: amount (largest first, null last)', sortRows(s2, 'amount').map(r => r.gift.id).join('') === 'qpr');
ok('sort: name (latin for guests)', sortRows(s2, 'name').map(r => r.gift.id).join('') === 'pqr');

/* ---- CSV ---- */
const line = csvRow(rows[0]);
ok('csv: column count matches header', line.length === CSV_COLS.length);
const col = k => line[CSV_COLS.indexOf(k)];
ok('csv: givers & latin', col('贈り主') === '田中 太郎・田中 花子' && col('贈り主（ローマ字）') === 'TANAKA TARO・TANAKA HANAKO');
ok('csv: amounts', col('金額') === 30000 && col('円換算額') === 30000 && col('受け取り日') === '2026/09/26');
ok('csv: returns (all live, incl. 予定)', col('内祝い 品名') === 'カタログ / カタログ' && col('内祝い 金額（商品代＋送料）') === 13800
   && col('内祝い 明細').includes('商品代10000円 送料800円 注文済') && col('内祝い 明細').includes('予定'));
ok('csv: state & thanks', col('内祝い状況') === '手配中（一部）' && col('お礼状') === '未送付');
const goodsLine = csvRow(rows[2]);
ok('csv: goods without amount → empty cells', goodsLine[CSV_COLS.indexOf('金額')] === '' && goodsLine[CSV_COLS.indexOf('円換算額')] === ''
   && goodsLine[CSV_COLS.indexOf('内祝い要否')] === '不要');

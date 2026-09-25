/* 引出物・引菓子 確認リストの計算のテスト（00_spec/07_gift-check.md） */
import { readFileSync } from 'node:fs';
import { sortItems, summarize, groupItems, diffOf, hasDiff, fmtDiff, parseQty, matches, mergeRemote }
  from '../public/gift-check/gift-logic.js';

const ok = (name, cond) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) process.exitCode = 1; };

/* 元データの CSV を DB の行と同じ形にする（gift_check_items に投入した 39 行） */
function parseCsv(text) {
  const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); out.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}
const csv = parseCsv(readFileSync(new URL('../01_source/最新_引出物_引菓子一覧_2026-09-25.csv', import.meta.url), 'utf8').replace(/^﻿/, ''));
const num = s => (s === '' ? null : Number(s));
const rows = csv.slice(1).filter(r => r.length > 1).map((r, i) => ({
  id: `r${String(i).padStart(2, '0')}`, category: r[0], type_no: num(r[1]), sort: i + 1, brand: r[2] || null, name: r[3],
  variant: r[4] || null, qty: num(r[5]), unit_price_ex_tax: num(r[6]), unit_price: num(r[7]), subtotal: num(r[8]), note: r[9] || null,
  checked_at: null, checked_by: null, checked_qty: null, memo: null,
}));

ok('csv: 39 rows', rows.length === 39);
const s = summarize(rows);
ok('summary: 引出物 26行・84個・¥342,181', s.byCat['引出物'].rows === 26 && s.byCat['引出物'].qty === 84 && s.byCat['引出物'].amount === 342181);
ok('summary: 引菓子 13行・83個・¥121,618', s.byCat['引菓子'].rows === 13 && s.byCat['引菓子'].qty === 83 && s.byCat['引菓子'].amount === 121618);
ok('summary: nothing checked yet', s.total === 39 && s.checked === 0 && s.diffs === 0);

const shuffled = [...rows].reverse();
const sorted = sortItems(shuffled);
ok('sort: 引出物 before 引菓子, then type_no', sorted[0].category === '引出物' && sorted[25].category === '引出物' && sorted[26].category === '引菓子'
  && sorted.every((r, i) => i === 0 || r.category !== sorted[i - 1].category || r.type_no >= sorted[i - 1].type_no));
ok('sort: same type_no keeps sort order', sorted.filter(r => r.category === '引出物' && r.type_no === 8).map(r => r.sort).join() === '8,9,10,11,12');

const sec = groupItems(shuffled);
ok('group: two sections in order', sec.map(x => x.category).join() === '引出物,引菓子');
ok('group: 引出物 21 types / 引菓子 10 types', sec[0].groups.length === 21 && sec[1].groups.length === 10);
const tea = sec[0].groups.find(g => g.type_no === 8);
ok('group: お茶2缶ギフト has 5 rows', tea.rows.length === 5 && tea.name === 'お茶2缶ギフト' && tea.brand === '煎茶堂東京');
ok('group: サブレ has 4 rows, プティボワ 2', sec[1].groups.find(g => g.type_no === 10).rows.length === 4 && sec[0].groups.find(g => g.type_no === 9).rows.length === 2);

ok('diff: empty → null', diffOf({ qty: 5, checked_qty: null }) === null && !hasDiff({ qty: 5, checked_qty: null }));
ok('diff: equal → 0 (no diff)', diffOf({ qty: 5, checked_qty: 5 }) === 0 && !hasDiff({ qty: 5, checked_qty: 5 }));
ok('diff: +n / −n', fmtDiff(diffOf({ qty: 5, checked_qty: 7 })) === '+2' && fmtDiff(diffOf({ qty: 5, checked_qty: 4 })) === '−1');
ok('diff: 0 counted is a diff', hasDiff({ qty: 3, checked_qty: 0 }) && fmtDiff(-3) === '−3');

ok('parseQty: empty → null', parseQty('') === null && parseQty('  ') === null);
ok('parseQty: digits, full-width digits', parseQty('12') === 12 && parseQty('０') === 0 && parseQty('１２') === 12);
ok('parseQty: invalid → undefined', parseQty('-1') === undefined && parseQty('1.5') === undefined && parseQty('abc') === undefined);

const a = { ...rows[0], checked_at: '2026-09-25T10:00:00Z' };
const b = { ...rows[1], checked_qty: 4 };
const c = { ...rows[30] };
ok('filter: todo hides checked', !matches(a, { mode: 'todo' }) && matches(b, { mode: 'todo' }));
ok('filter: diff shows only diff rows', !matches(a, { mode: 'diff' }) && matches(b, { mode: 'diff' }));
ok('filter: category', !matches(c, { cat: '引出物' }) && matches(c, { cat: '引菓子' }));
ok('filter: keep set holds a just-checked row in todo', matches(a, { mode: 'todo' }, new Set([a.id])) && !matches(c, { mode: 'todo', cat: '引出物' }, new Set([c.id])));
const s2 = summarize([a, b, c]);
ok('summary: checked / diffs counted', s2.checked === 1 && s2.diffs === 1 && s2.byCat['引出物'].checked === 1);

const local = [rows[0], rows[1], rows[2]];
const remote = [{ ...rows[0], memo: 'server' }, { ...rows[1], memo: 'server' }, { ...rows[2], memo: 'server' }];
let m = mergeRemote(local, remote, { busy: new Set([rows[1].id]), lastWriteAt: new Map([[rows[2].id, 2000]]), fetchStartedAt: 1000 });
ok('merge: idle row takes server value', m.rows[0].memo === 'server' && m.changed.join() === rows[0].id);
ok('merge: busy row keeps local value', m.rows[1] === rows[1]);
ok('merge: row written after fetch started keeps local value', m.rows[2] === rows[2]);
ok('merge: same set of ids is not structural', m.structural === false);
m = mergeRemote(local, remote, { lastWriteAt: new Map([[rows[2].id, 500]]), fetchStartedAt: 1000 });
ok('merge: write before fetch started → server value', m.rows[2].memo === 'server');
m = mergeRemote(local, [...remote, rows[3]]);
ok('merge: added row is structural', m.structural === true && m.rows.length === 4);
m = mergeRemote(local, local.map(r => ({ ...r })));
ok('merge: unchanged rows → no changed ids', m.changed.length === 0);

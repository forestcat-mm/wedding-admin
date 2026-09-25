/* 受付ポップアップの判定のテスト（v2.3） */
import { planCheckin, enterAllowed, ENTER_GUARD_MS } from '../public/reception/checkin-logic.js';

const ok = (name, cond) => console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name);
const g = { id: 'g1', items: [
  { id: 'i1', label: 'お車代', handed_at: null },
  { id: 'i2', label: 'お礼', handed_at: '2026-09-26T01:00:00Z' },
  { id: 'i3', label: 'その他', handed_at: null },
] };

let r = planCheckin(g, new Set());
ok('v2.3: unchecked items block check-in', r.ok === false && r.ops.length === 0);
ok('v2.3: missing lists only unhanded & unchecked labels', r.missing.join(',') === 'お車代,その他' && r.missingIds.join(',') === 'i1,i3');
r = planCheckin(g, new Set(['i1']));
ok('v2.3: one still unchecked → still blocked', r.ok === false && r.missing.join(',') === 'その他');
r = planCheckin(g, new Set(['i1', 'i3']));
ok('v2.3: all checked → hand ops then checkin', r.ok && r.ops.map(o => o.path).join(' ') === 'items/i1/hand items/i3/hand checkin');
ok('v2.3: already handed item is not sent again', !r.ops.some(o => o.itemId === 'i2'));
ok('v2.3: checkin op carries guest_id', r.ops.at(-1).body.guest_id === 'g1' && r.ops.every(o => o.guestId === 'g1'));
r = planCheckin({ id: 'g2', items: [] }, new Set());
ok('v2.3: no items → checkin only', r.ok && r.ops.length === 1 && r.ops[0].path === 'checkin');
r = planCheckin({ id: 'g3', items: [{ id: 'i9', label: 'お礼', handed_at: '2026-09-26T01:00:00Z' }] }, new Set());
ok('v2.3: all already handed → checkin only', r.ok && r.ops.length === 1);
ok('v2.3: array of ids is accepted', planCheckin(g, ['i1', 'i3']).ok === true);
const t0 = 1000000;
ok('v2.3: Enter ignored within 0.5s of opening', !enterAllowed(t0, t0 + ENTER_GUARD_MS - 1) && enterAllowed(t0, t0 + ENTER_GUARD_MS));

// v2.4: 強制受付・⚠・受付済タブの並び
import { isWarn, unhandedAfterCheckin, doneOrder } from '../public/reception/checkin-logic.js';
r = planCheckin(g, new Set(['i1']), { force: true });
ok('v2.4: force with unchecked → still ok', r.ok === true && r.missing.length === 0);
ok('v2.4: force sends only checked items then checkin', r.ops.map(o => o.path).join(' ') === 'items/i1/hand checkin');
ok('v2.4: force leaves unchecked item unhanded (no op for i3)', !r.ops.some(o => o.itemId === 'i3'));
const done1 = { id: 'a', checked_in_at: '2026-09-26T01:00:00Z', items: [{ id: 'x', label: 'お車代', handed_at: null }] };
const done2 = { id: 'b', checked_in_at: '2026-09-26T02:00:00Z', items: [] };
const done3 = { id: 'c', checked_in_at: '2026-09-26T00:30:00Z', items: [{ id: 'y', label: 'お礼', handed_at: '2026-09-26T00:31:00Z' }] };
const todo = { id: 'd', checked_in_at: null, items: [{ id: 'z', label: 'お車代', handed_at: null }] };
ok('v2.4: isWarn = checked in with unhanded item', isWarn(done1) && !isWarn(done2) && !isWarn(done3) && !isWarn(todo));
ok('v2.4: unhandedAfterCheckin lists labels', unhandedAfterCheckin(done1).map(i => i.label).join() === 'お車代' && unhandedAfterCheckin(todo).length === 0);
ok('v2.4: doneOrder puts ⚠ first, then newest check-in', [done3, done2, done1].sort(doneOrder).map(x => x.id).join('') === 'abc');
done1.items[0].handed_at = '2026-09-26T03:00:00Z';
ok('v2.4: ⚠ clears once the item is handed', !isWarn(done1) && [done3, done2, done1].sort(doneOrder).map(x => x.id).join('') === 'bac');

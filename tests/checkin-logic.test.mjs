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

/* 受付ポップアップの判定（DOM に依存しない純粋な関数。tests/checkin-logic.test.mjs で検証）
   仕様：00_spec/05_reception-v2.3.md */

/** 受付ボタンを押したときの判定。
 *  g: ゲスト（items: [{ id, label, handed_at }]）、checkedIds: ポップアップでチェックされている項目の id
 *  返り値：ok=false なら missing（未チェックの項目名）と missingIds。ok=true なら送る操作 ops（お渡し済 → 受付済の順） */
export function planCheckin(g, checkedIds) {
  const checked = checkedIds instanceof Set ? checkedIds : new Set(checkedIds || []);
  const items = g.items || [];
  const missing = items.filter(it => !it.handed_at && !checked.has(it.id));
  if (missing.length) {
    return { ok: false, missing: missing.map(it => it.label), missingIds: missing.map(it => it.id), ops: [] };
  }
  const ops = items.filter(it => !it.handed_at && checked.has(it.id))
    .map(it => ({ guestId: g.id, path: `items/${it.id}/hand`, body: {}, itemId: it.id }));
  ops.push({ guestId: g.id, path: 'checkin', body: { guest_id: g.id } });
  return { ok: true, missing: [], missingIds: [], ops };
}

/** ポップアップを開いた直後の Enter を無視する猶予（ミリ秒） */
export const ENTER_GUARD_MS = 500;
export const enterAllowed = (openedAt, now = Date.now()) => now - openedAt >= ENTER_GUARD_MS;

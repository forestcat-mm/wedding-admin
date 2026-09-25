/* 引出物・引菓子 確認リストの計算（DOM に依存しない純粋な関数。tests/gift-check-logic.test.mjs で検証）
   仕様：00_spec/07_gift-check.md */

export const CATEGORIES = ['引出物', '引菓子'];
const catRank = c => { const i = CATEGORIES.indexOf(c); return i < 0 ? CATEGORIES.length : i; };

/** 区分 → 種類No. → sort の順 */
export function compareItems(a, b) {
  return catRank(a.category) - catRank(b.category)
    || (a.type_no ?? 0) - (b.type_no ?? 0)
    || (a.sort ?? 0) - (b.sort ?? 0)
    || String(a.id).localeCompare(String(b.id));
}
export const sortItems = rows => [...rows].sort(compareItems);

/** 実数 − 数量。実数が未入力なら null（差異なし扱い） */
export function diffOf(r) {
  if (r.checked_qty === null || r.checked_qty === undefined) return null;
  return Number(r.checked_qty) - Number(r.qty || 0);
}
export const hasDiff = r => { const d = diffOf(r); return d !== null && d !== 0; };
/** 差異の表示（+2 / −1。マイナスは U+2212） */
export const fmtDiff = d => (d > 0 ? '+' : '−') + Math.abs(d);

/** 実数欄の入力を解釈する。空 → null、0 以上の整数 → 数値、それ以外 → undefined（不正） */
export function parseQty(s) {
  const t = String(s ?? '').trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  if (t === '') return null;
  return /^\d{1,5}$/.test(t) ? Number(t) : undefined;
}

/** サマリー：全体の確認済件数と、区分ごとの行数・数量・合計金額（税込・実払）・確認済件数・差異件数 */
export function summarize(rows) {
  const byCat = {};
  for (const c of CATEGORIES) byCat[c] = { rows: 0, qty: 0, amount: 0, checked: 0, diffs: 0 };
  let checked = 0, diffs = 0;
  for (const r of rows) {
    const s = byCat[r.category] ??= { rows: 0, qty: 0, amount: 0, checked: 0, diffs: 0 };
    s.rows++; s.qty += Number(r.qty || 0); s.amount += Number(r.subtotal || 0);
    if (r.checked_at) { s.checked++; checked++; }
    if (hasDiff(r)) { s.diffs++; diffs++; }
  }
  return { total: rows.length, checked, diffs, byCat };
}

/** 絞り込み。mode: all / todo（未確認のみ）/ diff（差異あり）、cat: all / 区分名。
 *  keep の id は条件に合わなくても残す（操作した直後の行が消えないように） */
export function matches(r, { mode = 'all', cat = 'all' } = {}, keep = null) {
  if (cat !== 'all' && r.category !== cat) return false;
  if (keep && keep.has(r.id)) return true;
  if (mode === 'todo') return !r.checked_at;
  if (mode === 'diff') return hasDiff(r);
  return true;
}

/** 区分 → 種類No. ごとにまとめる。返り値 [{ category, groups: [{ key, type_no, brand, name, rows }] }] */
export function groupItems(rows) {
  const out = [];
  for (const r of sortItems(rows)) {
    let sec = out.at(-1);
    if (!sec || sec.category !== r.category) out.push(sec = { category: r.category, groups: [] });
    let g = sec.groups.at(-1);
    if (!g || g.type_no !== r.type_no) {
      sec.groups.push(g = { key: `${r.category}:${r.type_no}`, type_no: r.type_no, brand: r.brand, name: r.name, rows: [] });
    }
    g.rows.push(r);
  }
  return out;
}

/** 10 秒ごとの再取得をローカルの状態に合わせる。
 *  busy（入力中・保存待ち・保存中・保存失敗）の行と、取得開始より後に書き込んだ行はローカルの値を残す。
 *  返り値：{ rows（新しい一覧）, changed（サーバー値で置き換えた id）, structural（行の増減があったか） } */
export function mergeRemote(local, remote, { busy = new Set(), lastWriteAt = new Map(), fetchStartedAt = 0 } = {}) {
  const byId = new Map(local.map(r => [r.id, r]));
  const changed = [];
  const rows = remote.map(s => {
    const l = byId.get(s.id);
    if (!l) return s;
    if (busy.has(s.id) || (lastWriteAt.get(s.id) ?? -Infinity) >= fetchStartedAt) return l;
    if (!sameRow(l, s)) changed.push(s.id);
    return s;
  });
  const structural = remote.length !== local.length || remote.some(s => !byId.has(s.id));
  return { rows, changed, structural };
}
const FIELDS = ['category', 'type_no', 'sort', 'brand', 'name', 'variant', 'qty', 'unit_price_ex_tax', 'unit_price',
  'subtotal', 'note', 'checked_at', 'checked_by', 'checked_qty', 'memo'];
export const sameRow = (a, b) => FIELDS.every(k => (a[k] ?? null) === (b[k] ?? null));

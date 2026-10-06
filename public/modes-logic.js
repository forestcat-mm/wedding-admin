/* 06 公開モード・Movies・ギフト＆感想 — 画面に依存しない計算（00_spec/06_modes_admin.md）
   モードの判定はゲスト側 Worker（wedding-invitation src/index.ts の resolveMode）と同じ規則にしている。
   変えるときは両方を直すこと。 */

export const FEATURES = [
  ['rsvp', 'RSVP'], ['guide', 'Guide'], ['story', 'Story'], ['seating', '席次'], ['menu', 'Menu'],
  ['marche', 'Marché'], ['movies', 'Movies'], ['thanks', 'ひとこと'], ['photo', 'Photo'],
];
export const FEATURE_KEYS = FEATURES.map(f => f[0]);
export const SLUG_RE = /^[a-z0-9-]+$/;

/* features の既定値はすべて false（キーが無ければ非表示） */
export function normFeatures(f) {
  const out = {};
  for (const k of FEATURE_KEYS) out[k] = f?.[k] === true;
  return out;
}

const ms = iso => (iso ? new Date(iso).getTime() : NaN);

/* 実際の終了時刻：ends_at、無ければ「自分より後に始まるモードのうち最も早い開始」、それも無ければ無期限（Infinity） */
export function effectiveEnd(mode, modes) {
  if (mode.ends_at) return ms(mode.ends_at);
  const start = ms(mode.starts_at);
  const next = modes.map(m => ms(m.starts_at)).filter(t => t > start).sort((a, b) => a - b)[0];
  return next ?? Infinity;
}

/* 手動固定の特別な値：公開期間外（ゲスト向けはすべて 404）に固定する */
export const OVERRIDE_CLOSED = 'closed';

/* 判定：override があればそのモード（期間は見ない）。'closed' なら公開期間外。
   無ければ starts_at <= now < 終了 のうち sort 最小。
   該当なし：最初のモードの開始前 → 最初のモード（starts_at 最小）／それ以外（最後の終了後・期間の隙間）→ closed */
export function resolveMode(modes, overrideId, now = Date.now()) {
  const list = [...(modes || [])].sort((a, b) => (a.sort - b.sort) || (ms(a.starts_at) - ms(b.starts_at)));
  if (overrideId === OVERRIDE_CLOSED) return { mode: null, via: 'override', closed: true };
  if (overrideId) {
    const m = list.find(x => x.id === overrideId);
    if (m) return { mode: m, via: 'override', closed: false };
  }
  const hit = list.find(m => ms(m.starts_at) <= now && now < effectiveEnd(m, list));
  if (hit) return { mode: hit, via: 'auto', closed: false };
  const first = [...list].sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0];
  if (first && now < ms(first.starts_at)) return { mode: first, via: 'before', closed: false };
  return { mode: null, via: list.length ? 'closed' : 'none', closed: true };
}

/* 期間の重なり（保存は可。判定は sort が小さい方が優先）と隙間（その間は公開期間外） */
export function periodWarnings(modes) {
  const out = [];
  const list = [...modes].filter(m => m.starts_at).sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
  for (let i = 0; i < list.length; i++) {
    const a = list[i], endA = effectiveEnd(a, list);
    if (endA <= ms(a.starts_at)) out.push({ kind: 'order', a, text: `「${a.name || a.slug}」の終了が開始より前です` });
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (ms(b.starts_at) < endA) {
        const win = (a.sort ?? 0) <= (b.sort ?? 0) ? a : b;
        out.push({ kind: 'overlap', a, b, text: `「${a.name || a.slug}」と「${b.name || b.slug}」の期間が重なっています（重なる間は「${win.name || win.slug}」を優先）` });
      }
    }
    const next = list[i + 1];
    if (next && endA < ms(next.starts_at))
      out.push({ kind: 'gap', a, b: next, text: `「${a.name || a.slug}」の終了から「${next.name || next.slug}」の開始までは公開期間外（ゲスト向けは 404）です` });
  }
  return out;
}

/* datetime-local（Asia/Tokyo）⇄ ISO */
export function toJstInput(iso) {
  if (!iso) return '';
  const d = new Date(ms(iso) + 9 * 3600e3);
  return d.toISOString().slice(0, 16);
}
export function fromJstInput(v) {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return new Date(v + ':00+09:00').toISOString();
}
export function fmtJst(iso) {
  if (!iso) return '';
  return toJstInput(iso).replace('T', ' ').replace(/-/g, '/');
}

/* プレビュー：ゲスト側で見える入口カード・下ナビ・ページ（wedding-invitation public/guide/assets/guide.js と同じ並び） */
const PAGES = [
  ['story', 'Our Story（/guide/story/）'], ['movies', 'Movies（/guide/movies/）'], ['seating', 'Seating（/guide/seating/）'],
  ['menu', 'Menu（/guide/menu/）'], ['marche', 'Gift Marché（/guide/marche/）'], ['thanks', 'ひとこと（/guide/thanks/）'],
];
const NAV = [['story', 'Story'], ['seating', 'Seating'], ['menu', 'Menu'], ['marche', 'Marché'], ['movies', 'Movies'], ['thanks', 'Thanks'], ['photo', 'Photo']];
export function preview(features, closed = false) {
  if (closed) return { closed: true };
  const f = normFeatures(features);
  const invitation = [f.rsvp ? 'RSVP フォーム' : 'RSVP お礼カード（フォームは非表示）', f.guide ? 'Wedding Guide 入口カード' : 'Wedding Guide 入口カード：非表示'];
  if (!f.guide) return { closed: false, invitation, guide: false, cards: [], nav: [], open: [], off: [] };
  const cards = PAGES.filter(([k]) => f[k]).map(([, l]) => l.replace(/（.*$/, ''));
  if (f.photo) cards.push('PHOTO SHOWER（外部）');
  return {
    closed: false, invitation, guide: true, cards,
    nav: NAV.filter(([k]) => f[k]).slice(0, 5).map(([, l]) => l),
    open: PAGES.filter(([k]) => f[k]).map(([, l]) => l),
    off: PAGES.filter(([k]) => !f[k]).map(([, l]) => l),
  };
}

/* ---------- Movies ---------- */
export const movieKey = (slug, label) => `movies/${slug}/${label}.mp4`;
export const posterKey = slug => `movies/${slug}/poster.jpg`;
export const LABEL_RE = /^[A-Za-z0-9_-]{1,20}$/;
/* 同じラベルは上書き。並びは高さ（低い順）→ラベル */
export function upsertVariant(variants, v) {
  const out = (variants || []).filter(x => x.label !== v.label).concat([v]);
  return out.sort((a, b) => ((a.height || 0) - (b.height || 0)) || String(a.label).localeCompare(String(b.label)));
}
export function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(+sec)) return '';
  const s = Math.round(+sec), m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtBytes(n) {
  if (!n) return '';
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/* ---------- ギフト＆感想 ---------- */
export const FEEDBACK_CSV_COLS = ['日時', 'お名前', '卓', '引出物ID', '引出物', '引菓子ID', '引菓子', 'ひとこと', '言語', 'メール', '候補から選択'];
export function feedbackCsvRow(r, items) {
  const nm = id => (id && items[id] ? [items[id].brand, items[id].name].filter(Boolean).join(' ') : '');
  return [fmtJst(r.created_at), r.guest_name, r.table_label || '', r.hikidemono_id || '', nm(r.hikidemono_id),
          r.hikigashi_id || '', nm(r.hikigashi_id), r.message || '', r.lang === 'zh' ? '中文' : '日本語', r.email || '',
          r.reply_person_id ? 'はい' : ''];
}
/* 商品ごとの件数（未選択は「選ばなかった／覚えていない」） */
export function countItems(rows, field, items, section) {
  const counts = new Map();
  for (const it of Object.values(items)) if (it.section === section) counts.set(it.id, 0);
  let none = 0;
  for (const r of rows) {
    const id = r[field];
    if (!id) { none++; continue; }
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const list = [...counts].map(([id, n]) => ({ id, n, item: items[id] || null })).sort((a, b) => (b.n - a.n) || a.id.localeCompare(b.id));
  return { list, none, total: rows.length };
}
/* 絞り込み：名前（漢字・ローマ字の部分一致、空白無視）／卓／商品 */
const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s　]+/g, '');
export function filterFeedback(rows, { q = '', table = '', item = '' } = {}) {
  const nq = norm(q);
  return rows.filter(r => (!nq || norm(r.guest_name).includes(nq))
    && (!table || (table === '__none' ? !r.table_label : r.table_label === table))
    && (!item || r.hikidemono_id === item || r.hikigashi_id === item));
}

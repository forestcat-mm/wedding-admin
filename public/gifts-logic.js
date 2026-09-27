/* ご祝儀・内祝いの計算（DOM に依存しない純粋な関数。tests/gifts-logic.test.mjs で検証）
   仕様：00_spec/09_gifts.md
   一覧の1行は { gift, givers, returns } の形で扱う。
     gift    = gifts の1行
     givers  = gift_givers で紐付いたゲスト（guests の行）。ゲスト一覧にいない贈り主は gift.giver_name（「・」区切り）
     returns = その gift の gift_returns（削除済みを含んでよい。ここで除く） */

export const KINDS = [['cash', '現金'], ['goods', '品物'], ['transfer', '振込'], ['e_money', '電子送金'], ['other', 'その他']];
export const ROUTES = [['reception', '受付'], ['hand', '当日手渡し'], ['mail', '郵送'], ['later', '後日'], ['other', 'その他']];
export const RET_STATUSES = [['planned', '予定'], ['ordered', '注文済'], ['shipped', '発送済'], ['delivered', '到着済']];
export const CURRENCIES = ['JPY', 'USD', 'EUR', 'CNY', 'TWD', 'HKD', 'KRW', 'GBP', 'AUD', 'SGD'];
export const KIND_LABEL = Object.fromEntries(KINDS);
export const ROUTE_LABEL = Object.fromEntries(ROUTES);
export const RET_STATUS_LABEL = Object.fromEntries(RET_STATUSES);
export const DEFAULT_RECEIVED_ON = '2026-09-26';

/* 内祝い状況。none＝不要／todo＝未手配／partial＝手配中（一部）／shipped＝発送済／delivered＝到着済 */
export const RETURN_STATES = [['none', '不要'], ['todo', '未手配'], ['partial', '手配中（一部）'], ['shipped', '発送済'], ['delivered', '到着済']];
export const RETURN_STATE_LABEL = Object.fromEntries(RETURN_STATES);

export const liveReturns = row => (row.returns || []).filter(r => !r.deleted_at);
export const retAmount = r => (Number(r.price_jpy) || 0) + (Number(r.shipping_jpy) || 0);

/** gift_returns の状態から内祝い状況を決める。
    要否が「不要」→ none。内祝いが無い、またはすべて「予定」（まだ何も注文していない）→ todo。
    すべて到着済 → delivered、すべて発送済か到着済 → shipped、それ以外（注文済・予定が残る）→ partial */
export function returnState(row) {
  if (!row.gift.return_needed) return 'none';
  const rs = liveReturns(row);
  if (!rs.length || rs.every(r => r.status === 'planned')) return 'todo';
  if (rs.every(r => r.status === 'delivered')) return 'delivered';
  if (rs.every(r => r.status === 'shipped' || r.status === 'delivered')) return 'shipped';
  return 'partial';
}

/* ---- 贈り主 ---- */
const guestName = g => `${g?.family_name ?? ''} ${g?.given_name ?? ''}`.trim();
const guestLatin = g => `${g?.family_name_latin ?? ''} ${g?.given_name_latin ?? ''}`.trim();
/** ゲスト一覧にいない贈り主の入力（「・」「、」「,」区切り）を名前の配列に */
export const splitNames = s => String(s ?? '').split(/[・、,，\n]/).map(x => x.trim()).filter(Boolean);
export const joinNames = a => a.map(x => String(x).trim()).filter(Boolean).join('・');
/** 贈り主の名前（ゲスト → ゲスト外 の順） */
export const giverNames = row => [...(row.givers || []).map(guestName).filter(Boolean), ...splitNames(row.gift.giver_name)];
/** 一覧の表示。1人「A」、2人「A・B」、3人以上「A・B ほか」 */
export function giverLabel(row) {
  const n = giverNames(row);
  if (!n.length) return '（贈り主未設定）';
  return n.length <= 2 ? n.join('・') : `${n[0]}・${n[1]} ほか`;
}

/* ---- 金額 ---- */
/** 円換算額。JPY は金額をそのまま（四捨五入）、それ以外は入力された円換算額。未入力は null */
export function toJpy(currency, amount, amountJpy) {
  if ((currency || 'JPY') === 'JPY') return amount === null || amount === undefined || amount === '' ? null : Math.round(Number(amount));
  return amountJpy === null || amountJpy === undefined || amountJpy === '' ? null : Math.round(Number(amountJpy));
}
/** 内祝いの参考額（円換算額の 1/3〜1/2）。金額が無ければ null */
export function returnGuide(gift) {
  const v = Number(gift.amount_jpy);
  if (!v) return null;
  return { low: Math.round(v / 3), high: Math.round(v / 2) };
}

/** フォームの入力を確かめる。問題があればメッセージ、無ければ null */
export function validateGift(f) {
  if (!(f.guestIds?.length) && !splitNames(f.giver_name).length) return '贈り主を選ぶか、名前を入力してください';
  if (!KIND_LABEL[f.kind]) return '種類を選んでください';
  if (!ROUTE_LABEL[f.route]) return '経路を選んでください';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.received_on || '')) return '受け取り日を入力してください';
  const has = v => v !== null && v !== undefined && v !== '';
  if (has(f.amount) && !(Number(f.amount) >= 0)) return '金額は 0 以上の数で入力してください';
  if (f.currency !== 'JPY' && has(f.amount_jpy) && !(Number(f.amount_jpy) >= 0)) return '円換算額は 0 以上の数で入力してください';
  if (f.kind === 'goods') return null;                         // 品物は金額任意
  if (!has(f.amount)) return '金額を入力してください';
  if (f.currency !== 'JPY' && !has(f.amount_jpy)) return '円換算額を入力してください';
  return null;
}

/* ---- 集計 ---- */
/** 一覧上部の集計カード。削除済みの gift は含めない */
export function summarize(rows) {
  const live = rows.filter(r => !r.gift.deleted_at);
  const s = { count: live.length, total: 0, groom: { count: 0, total: 0 }, bride: { count: 0, total: 0 }, none: { count: 0, total: 0 },
              returnCost: 0, returnPlanned: 0, todo: 0 };
  for (const row of live) {
    const v = Number(row.gift.amount_jpy) || 0;
    s.total += v;
    const k = row.gift.side === 'groom' || row.gift.side === 'bride' ? row.gift.side : 'none';
    s[k].count++; s[k].total += v;
    for (const r of liveReturns(row)) {
      if (r.status === 'planned') s.returnPlanned += retAmount(r); else s.returnCost += retAmount(r);
    }
    if (returnState(row) === 'todo') s.todo++;
  }
  return s;
}

/** 予算タブの自動連動の2行。
    収入「ご祝儀」＝ gifts.amount_jpy の合計（削除済みを除く）
    支出「内祝い」＝ gift_returns の price_jpy + shipping_jpy の合計（削除済み・「予定」・削除済みのご祝儀の分を除く） */
export function budgetLink(gifts, returns) {
  const liveGifts = gifts.filter(g => !g.deleted_at);
  const liveIds = new Set(liveGifts.map(g => g.id));
  const rs = returns.filter(r => !r.deleted_at && r.status !== 'planned' && liveIds.has(r.gift_id));
  return {
    giftCount: liveGifts.length,
    giftTotal: liveGifts.reduce((s, g) => s + (Number(g.amount_jpy) || 0), 0),
    returnCount: rs.length,
    returnTotal: rs.reduce((s, r) => s + retAmount(r), 0),
  };
}
/** 収入として使うご祝儀。登録が1件以上あれば実績、0件なら見込み（大人 × 1人あたり） */
export function giftIncome(link, estimate) {
  return link && link.giftCount > 0 ? { value: link.giftTotal, actual: true } : { value: estimate, actual: false };
}

/* ---- 絞り込み・並び替え ---- */
/** f = { q, side, circle, kind, state, thanks }。circlesOf(guestId) は友人圏 id の配列 */
export function matchRow(row, f, circlesOf = () => []) {
  const g = row.gift;
  if (f.side) {
    if (f.side === 'none' ? (g.side === 'groom' || g.side === 'bride') : g.side !== f.side) return false;
  }
  if (f.kind && g.kind !== f.kind) return false;
  if (f.state && returnState(row) !== f.state) return false;
  if (f.thanks === 'sent' && !g.thank_you_sent) return false;
  if (f.thanks === 'unsent' && g.thank_you_sent) return false;
  if (f.circle) {
    const cs = new Set((row.givers || []).flatMap(x => circlesOf(x.id)));
    if (f.circle === '__none' ? cs.size > 0 : !cs.has(f.circle)) return false;
  }
  const q = norm(f.q);
  if (q) {
    const hay = [...giverNames(row), ...(row.givers || []).map(guestLatin), g.envelope_name, g.memo].map(norm).join('\n');
    if (!hay.includes(q)) return false;
  }
  return true;
}
const norm = s => String(s ?? '').replace(/[\s　]/g, '').toLowerCase();
/** 並び替え：received（受け取り日の新しい順）／amount（金額の多い順）／name（名前順） */
export function sortRows(rows, key) {
  const nameKey = row => {
    const g0 = (row.givers || [])[0];
    return (g0 && (guestLatin(g0) || guestName(g0))) || giverNames(row)[0] || '';
  };
  const byName = (a, b) => nameKey(a).localeCompare(nameKey(b), 'ja', { sensitivity: 'base' });
  const byDate = (a, b) => String(b.gift.received_on || '').localeCompare(String(a.gift.received_on || ''))
    || String(b.gift.created_at || '').localeCompare(String(a.gift.created_at || ''));
  const cmp = key === 'amount' ? (a, b) => (Number(b.gift.amount_jpy) || 0) - (Number(a.gift.amount_jpy) || 0) || byName(a, b)
    : key === 'name' ? (a, b) => byName(a, b) || byDate(a, b)
    : (a, b) => byDate(a, b) || byName(a, b);
  return [...rows].sort(cmp);
}

/* ---- CSV ---- */
export const CSV_COLS = ['受け取り日', '贈り主', '贈り主（ローマ字）', '表書きの名義', 'サイド', '種類', '通貨', '金額', '円換算額',
  '経路', '内祝い要否', '内祝い状況', '内祝い 品名', '内祝い 金額（商品代＋送料）', '内祝い 明細', 'お礼状', 'メモ'];
const SIDE_LABEL = { groom: '新郎側', bride: '新婦側' };
/** 一覧の1行を CSV の1行（配列）に。内祝いは削除済みを除いてすべて（「予定」も含む） */
export function csvRow(row) {
  const g = row.gift, rs = liveReturns(row);
  const latin = (row.givers || []).map(guestLatin).filter(Boolean).map(s => s.toUpperCase()).join('・');
  return [
    (g.received_on || '').replace(/-/g, '/'),
    giverNames(row).join('・'), latin, g.envelope_name || '', SIDE_LABEL[g.side] || '',
    KIND_LABEL[g.kind] || g.kind || '', g.currency || '',
    g.amount === null || g.amount === undefined ? '' : Number(g.amount),
    g.amount_jpy === null || g.amount_jpy === undefined ? '' : Number(g.amount_jpy),
    ROUTE_LABEL[g.route] || g.route || '', g.return_needed ? '必要' : '不要', RETURN_STATE_LABEL[returnState(row)],
    rs.map(r => r.item_name).join(' / '),
    rs.length ? rs.reduce((s, r) => s + retAmount(r), 0) : '',
    rs.map(r => `${r.item_name}${r.shop ? `（${r.shop}）` : ''} 商品代${Number(r.price_jpy) || 0}円 送料${Number(r.shipping_jpy) || 0}円 ${RET_STATUS_LABEL[r.status] || r.status}`).join(' / '),
    g.thank_you_sent ? '送付済' : '未送付', g.memo || '',
  ];
}

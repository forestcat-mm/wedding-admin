/* ご祝儀・内祝いの計算（DOM に依存しない純粋な関数。tests/gifts-logic.test.mjs で検証）
   仕様：00_spec/10_gifts-v2.md（v2：出席者の仮登録と受領確認）、内祝いは 00_spec/09_gifts.md（v1）
   一覧の1行は { gift, givers, returns } の形で扱う。
     gift    = gifts の1行（status：expected＝仮／received＝受領済み、source：attendee＝出席者／manual＝追加）
     givers  = 贈り主の表示用（giverView）。{ id, kind, name, latin, idx, replyId, guestId, attending, side }
               kind：person＝出席者（reply_person_id）／guest＝招待客（guest_id）／name＝名前だけ／orphan＝紐付け先が消えた
     returns = その gift の gift_returns（削除済みを含んでよい。ここで除く） */

export const KINDS = [['cash', '現金'], ['goods', '品物'], ['transfer', '振込'], ['e_money', '電子送金'], ['other', 'その他']];
export const ROUTES = [['reception', '受付'], ['hand', '当日手渡し'], ['mail', '郵送'], ['later', '後日'], ['other', 'その他']];
export const RET_STATUSES = [['planned', '予定'], ['ordered', '注文済'], ['shipped', '発送済'], ['delivered', '到着済']];
export const CURRENCIES = ['JPY', 'USD', 'EUR', 'CNY', 'TWD', 'HKD', 'KRW', 'GBP', 'AUD', 'SGD'];
export const STATUSES = [['expected', '仮'], ['received', '受領済み']];
export const SOURCES = [['attendee', '出席者'], ['manual', '追加']];
export const KIND_LABEL = Object.fromEntries(KINDS);
export const ROUTE_LABEL = Object.fromEntries(ROUTES);
export const RET_STATUS_LABEL = Object.fromEntries(RET_STATUSES);
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const SOURCE_LABEL = Object.fromEntries(SOURCES);
export const DEFAULT_GIFT_JPY = 30000;          // app_settings.gift_default_jpy が無いときの既定

/* 内祝い状況。pending＝受領前／none＝不要／todo＝未手配／partial＝手配中（一部）／shipped＝発送済／delivered＝到着済 */
export const RETURN_STATES = [['pending', '—（受領前）'], ['none', '不要'], ['todo', '未手配'], ['partial', '手配中（一部）'], ['shipped', '発送済'], ['delivered', '到着済']];
export const RETURN_STATE_LABEL = Object.fromEntries(RETURN_STATES);

export const liveReturns = row => (row.returns || []).filter(r => !r.deleted_at);
export const retAmount = r => (Number(r.price_jpy) || 0) + (Number(r.shipping_jpy) || 0);
const isReceived = g => g.status === 'received';
/** 1件の金額。受領済みなら amount_jpy（実績）、仮なら expected_jpy（見込み） */
export const giftValue = g => isReceived(g) ? (Number(g.amount_jpy) || 0) : (Number(g.expected_jpy) || 0);
const sideOk = s => (s === 'groom' || s === 'bride') ? s : null;

/** 内祝い状況。仮（受領前）は内祝いの登録が無ければ pending（未手配には数えない）。
    要否が「不要」→ none。内祝いが無い、またはすべて「予定」→ todo。
    すべて到着済 → delivered、すべて発送済か到着済 → shipped、それ以外 → partial */
export function returnState(row) {
  const rs = liveReturns(row);
  if (!isReceived(row.gift) && !rs.length) return 'pending';
  if (!row.gift.return_needed) return 'none';
  if (!rs.length || rs.every(r => r.status === 'planned')) return 'todo';
  if (rs.every(r => r.status === 'delivered')) return 'delivered';
  if (rs.every(r => r.status === 'shipped' || r.status === 'delivered')) return 'shipped';
  return 'partial';
}

/* ---- 出席者の自動リスト化（1. 同期） ---- */
/** 有効な回答（削除されておらず、置き換えられていない）の、削除されていない出席者 */
export function attendees(replies, people) {
  const live = new Map(replies.filter(r => !r.deleted_at && !r.superseded_by).map(r => [r.id, r]));
  return people.filter(p => !p.deleted_at && p.attending === true && live.has(p.reply_id))
    .map(p => ({ person: p, reply: live.get(p.reply_id) }));
}
/** 同期の計画。何度実行しても同じ結果になる（冪等）。
    gifts・givers は削除済みを含むすべての行（gift_givers.reply_person_id は一意）。
    create      ：どの gift_givers にも入っていない出席者 → 1人1件の仮（本人 = 既定値、同行者 = 0）
    restore     ：同期で論理削除した仮の出席者のご祝儀に、その人がまた出席者として戻った → 削除を取り消す
    remove      ：仮の出席者のご祝儀で、贈り主が全員出席者ではなくなった → 論理削除
    dropGivers  ：仮の連名のうち、出席者ではなくなった人の紐付け（ほかの贈り主は残る）
    受領済みのご祝儀は触らない（一覧で「出席者ではなくなりました」と警告する） */
export function planSync({ replies, people, guests, gifts, givers, defaultJpy }) {
  const att = attendees(replies, people);
  const attIds = new Set(att.map(a => a.person.id));
  const guestById = new Map(guests.map(g => [g.id, g]));
  const giftById = new Map(gifts.map(g => [g.id, g]));
  const giverByPerson = new Map(givers.filter(x => x.reply_person_id).map(x => [x.reply_person_id, x]));
  const giversOf = new Map();
  for (const x of givers) {
    if (!giversOf.has(x.gift_id)) giversOf.set(x.gift_id, []);
    giversOf.get(x.gift_id).push(x);
  }
  const create = [], restore = new Set(), remove = [], dropGivers = [];
  for (const { person: p, reply: r } of att) {
    const gv = giverByPerson.get(p.id);
    if (!gv) {
      const g = guestById.get(r.matched_guest_id);
      create.push({ personId: p.id, replyId: r.id, idx: p.idx, side: sideOk(g?.side) || sideOk(r.side),
                    expected: p.idx === 0 ? (Number(defaultJpy) || 0) : 0 });
      continue;
    }
    const gift = giftById.get(gv.gift_id);
    if (gift && gift.deleted_at && gift.source === 'attendee' && gift.status === 'expected') restore.add(gift.id);
  }
  for (const gift of gifts) {
    const live = !gift.deleted_at || restore.has(gift.id);
    if (!live || gift.status !== 'expected') continue;
    const gs = giversOf.get(gift.id) || [];
    /* 出席者として紐付いた人（紐付け先が消えた行は、出席者のご祝儀のときだけ同じ扱い） */
    const gone = gs.filter(x => x.reply_person_id ? !attIds.has(x.reply_person_id)
      : (!x.guest_id && !x.name && gift.source === 'attendee'));
    if (!gone.length) continue;
    if (gone.length === gs.length) {
      if (restore.has(gift.id)) restore.delete(gift.id); else remove.push(gift.id);
    } else dropGivers.push(...gone.map(x => x.id));
  }
  return { create, restore: [...restore], remove, dropGivers };
}
export const syncIsEmpty = p => !p.create.length && !p.restore.length && !p.remove.length && !p.dropGivers.length;

/* ---- 贈り主 ---- */
/** ゲスト一覧にいない贈り主の入力（「・」「、」「,」区切り）を名前の配列に */
export const splitNames = s => String(s ?? '').split(/[・、,，\n]/).map(x => x.trim()).filter(Boolean);
export const giverNames = row => (row.givers || []).map(x => x.name || '（不明）');
/** 一覧の表示。連名は「A・B・C」 */
export function giverLabel(row) {
  const n = giverNames(row);
  return n.length ? n.join('・') : '（贈り主未設定）';
}
/** 受領済みなのに、出席者の贈り主が出席者ではなくなった（欠席・削除・回答の置き換え） */
export const isStale = row => row.gift.source === 'attendee'
  && (row.givers || []).some(x => (x.kind === 'person' && !x.attending) || x.kind === 'orphan');

/* ---- 金額 ---- */
/** 円換算額。JPY は金額をそのまま（四捨五入）、それ以外は入力された円換算額。未入力は null */
export function toJpy(currency, amount, amountJpy) {
  const has = v => !(v === null || v === undefined || v === '');
  if ((currency || 'JPY') === 'JPY') return has(amount) ? Math.round(Number(amount)) : null;
  return has(amountJpy) ? Math.round(Number(amountJpy)) : null;
}
/** 円の金額入力（空 → null、0 以上の整数 → 数値、それ以外 → undefined） */
export function parseYen(s) {
  const t = String(s ?? '').trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,，¥￥円\s]/g, '');
  if (t === '') return null;
  return /^\d{1,9}$/.test(t) ? Number(t) : undefined;
}
/** 内祝いの参考額（受領額の 1/3〜1/2）。金額が無ければ null */
export function returnGuide(gift) {
  const v = giftValue(gift);
  if (!v) return null;
  return { low: Math.round(v / 3), high: Math.round(v / 2) };
}
/** 「ご祝儀を追加」（欠席・招待なし）の入力の確認。問題があればメッセージ、無ければ null */
export function validateManual(f) {
  if (!(f.guestIds?.length) && !splitNames(f.names).length) return '贈り主を選ぶか、名前を入力してください';
  const v = parseYen(f.amount);
  if (v === undefined) return '金額は 0 以上の整数（円）で入力してください';
  if (v === null && f.kind !== 'goods') return '金額を入力してください';
  return null;
}

/* ---- 集計・予算連動 ---- */
/** 一覧上部の集計カード。削除済みの gift は含めない */
export function summarize(rows) {
  const live = rows.filter(r => !r.gift.deleted_at);
  const z = () => ({ count: 0, total: 0 });
  const s = { count: live.length, total: 0, received: z(), expected: z(), groom: z(), bride: z(), none: z(),
              returnCost: 0, returnPlanned: 0, todo: 0 };
  for (const row of live) {
    const v = giftValue(row.gift);
    s.total += v;
    const st = isReceived(row.gift) ? s.received : s.expected;
    st.count++; st.total += v;
    const sd = s[sideOk(row.gift.side) || 'none'];
    sd.count++; sd.total += v;
    for (const r of liveReturns(row)) {
      if (r.status === 'planned') s.returnPlanned += retAmount(r); else s.returnCost += retAmount(r);
    }
    if (returnState(row) === 'todo') s.todo++;
  }
  return s;
}
/** 予算タブの自動連動（6.）。予算データにはコピーせず毎回集計する。
    収入「ご祝儀」＝ Σ（受領済みなら amount_jpy、仮なら expected_jpy）。論理削除された gifts は除く
    支出「内祝い」＝ gift_returns の price_jpy + shipping_jpy の合計（削除済み・「予定」・削除済みのご祝儀の分を除く） */
export function budgetLink(gifts, returns) {
  const live = gifts.filter(g => !g.deleted_at);
  const liveIds = new Set(live.map(g => g.id));
  const rec = live.filter(isReceived), exp = live.filter(g => !isReceived(g));
  const rs = returns.filter(r => !r.deleted_at && r.status !== 'planned' && liveIds.has(r.gift_id));
  const sum = a => a.reduce((s, g) => s + giftValue(g), 0);
  return {
    giftCount: live.length, giftTotal: sum(live),
    receivedCount: rec.length, receivedTotal: sum(rec),
    expectedCount: exp.length, expectedTotal: sum(exp),
    returnCount: rs.length, returnTotal: rs.reduce((s, r) => s + retAmount(r), 0),
  };
}

/* ---- 連名（3.） ---- */
/** まとめる計画。rows は一覧の並び順。先頭の行を残す */
export function mergePlan(rows) {
  if (rows.length < 2) return { error: '2件以上選んでください' };
  if (rows.some(r => isReceived(r.gift))) return { error: '受領済みの行はまとめられません。先に受領を取り消してください' };
  const [keep, ...others] = rows;
  return { keep, others, expected: rows.reduce((s, r) => s + (Number(r.gift.expected_jpy) || 0), 0) };
}
/** 連名を解除する計画。贈り主ごとに1件へ。先頭の贈り主は元の gift に残る。
    仮の金額は本人（出席者の idx 0）なら既定値、それ以外は 0 */
export function unmergePlan(row, defaultJpy) {
  if ((row.givers || []).length < 2) return { error: '連名ではありません' };
  if (isReceived(row.gift)) return { error: '受領済みの連名は解除できません。先に受領を取り消してください' };
  return {
    parts: row.givers.map((x, i) => ({
      giverId: x.id, keep: i === 0,
      expected: x.kind === 'person' && x.idx === 0 ? (Number(defaultJpy) || 0) : 0,
      source: x.kind === 'person' ? 'attendee' : 'manual',
      side: sideOk(x.side) || sideOk(row.gift.side),
    })),
  };
}
/** 「同行者とまとめる」の相手：同じ回答の同行者が1人で入っている、仮のご祝儀 */
export function companionTargets(row, rows) {
  if (isReceived(row.gift)) return [];
  const me = (row.givers || []).find(x => x.kind === 'person' && x.idx === 0);
  if (!me) return [];
  return rows.filter(r => r !== row && !r.gift.deleted_at && !isReceived(r.gift) && r.givers.length === 1
    && r.givers[0].kind === 'person' && r.givers[0].idx > 0 && r.givers[0].replyId === me.replyId);
}

/* ---- 既定値の変更（7.） ---- */
/** 新しい既定値に合わせる行：仮・出席者・本人（1人）・金額を手で変えていない */
export const defaultTargets = (rows, newDefault) => rows.filter(r => !r.gift.deleted_at && !isReceived(r.gift)
  && r.gift.source === 'attendee' && !r.gift.expected_edited && r.givers.length === 1
  && r.givers[0].kind === 'person' && r.givers[0].idx === 0 && Number(r.gift.expected_jpy) !== Number(newDefault));

/* ---- 絞り込み・並び替え ---- */
const norm = s => String(s ?? '').replace(/[\s　]/g, '').toLowerCase();
/** f = { q, status, side, circle, source, state }。circlesOf(guestId) は友人圏 id の配列 */
export function matchRow(row, f, circlesOf = () => []) {
  const g = row.gift;
  if (f.status && g.status !== f.status) return false;
  if (f.side && (f.side === 'none' ? !!sideOk(g.side) : g.side !== f.side)) return false;
  if (f.source && g.source !== f.source) return false;
  if (f.state && returnState(row) !== f.state) return false;
  if (f.circle) {
    const cs = new Set((row.givers || []).flatMap(x => x.guestId ? circlesOf(x.guestId) : []));
    if (f.circle === '__none' ? cs.size > 0 : !cs.has(f.circle)) return false;
  }
  const q = norm(f.q);
  if (q) {
    const hay = [...(row.givers || []).flatMap(x => [x.name, x.latin]), g.envelope_name, g.memo].map(norm).join('\n');
    if (!hay.includes(q)) return false;
  }
  return true;
}
const SIDE_RANK = { groom: 0, bride: 1 };
/** 並び替え：name（名前）／side（新郎側→新婦側→未設定）／amount（金額の多い順）／received（受領日時の新しい順。仮は後ろ） */
export function sortRows(rows, key) {
  const nameKey = row => { const x = (row.givers || [])[0]; return (x && (x.latin || x.name)) || ''; };
  const byName = (a, b) => nameKey(a).localeCompare(nameKey(b), 'ja', { sensitivity: 'base' })
    || String(a.gift.id).localeCompare(String(b.gift.id));
  const cmp = {
    side: (a, b) => (SIDE_RANK[a.gift.side] ?? 2) - (SIDE_RANK[b.gift.side] ?? 2) || byName(a, b),
    amount: (a, b) => giftValue(b.gift) - giftValue(a.gift) || byName(a, b),
    received: (a, b) => String(b.gift.received_at || '').localeCompare(String(a.gift.received_at || '')) || byName(a, b),
  }[key] || byName;
  return [...rows].sort(cmp);
}

/* ---- CSV ---- */
export const CSV_COLS = ['贈り主', '贈り主（ローマ字）', '人数', '表書きの名義', 'サイド', '区分', '状態', '金額（円）', '通貨', '外貨の金額',
  '受領日時', '種類', '経路', '内祝い要否', '内祝い状況', '内祝い 品名', '内祝い 金額（商品代＋送料）', '内祝い 明細', 'お礼状', 'メモ'];
const SIDE_LABEL = { groom: '新郎側', bride: '新婦側' };
const pad2 = n => String(n).padStart(2, '0');
function fmtDT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** 一覧の1行を CSV の1行（配列）に。内祝いは削除済みを除いてすべて（「予定」も含む） */
export function csvRow(row) {
  const g = row.gift, rs = liveReturns(row);
  const foreign = g.currency && g.currency !== 'JPY';
  return [
    giverNames(row).join('・'), (row.givers || []).map(x => (x.latin || '').toUpperCase()).filter(Boolean).join('・'),
    (row.givers || []).length, g.envelope_name || '', SIDE_LABEL[g.side] || '',
    SOURCE_LABEL[g.source] || '', STATUS_LABEL[g.status] || '', giftValue(g),
    g.currency || '', foreign && g.amount != null ? Number(g.amount) : '',
    fmtDT(g.received_at), KIND_LABEL[g.kind] || g.kind || '', ROUTE_LABEL[g.route] || g.route || '',
    g.return_needed ? '必要' : '不要', RETURN_STATE_LABEL[returnState(row)],
    rs.map(r => r.item_name).join(' / '),
    rs.length ? rs.reduce((s, r) => s + retAmount(r), 0) : '',
    rs.map(r => `${r.item_name}${r.shop ? `（${r.shop}）` : ''} 商品代${Number(r.price_jpy) || 0}円 送料${Number(r.shipping_jpy) || 0}円 ${RET_STATUS_LABEL[r.status] || r.status}`).join(' / '),
    g.thank_you_sent ? '送付済' : '未送付', g.memo || '',
  ];
}

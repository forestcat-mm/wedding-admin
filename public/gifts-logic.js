/* ご祝儀・内祝いの計算（DOM に依存しない純粋な関数。tests/gifts-logic.test.mjs で検証）
   仕様：00_spec/11_gifts-v3.md（v3：並び順・出欠・引出物記録・品物の相当額）、10_gifts-v2.md（v2：仮登録と受領確認）、
         内祝いは 00_spec/09_gifts.md（v1）
   一覧の1行は { gift, givers, returns, hiki } の形で扱う。
     gift    = gifts の1行（status：expected＝仮／received＝受領済み、source：attendee＝出席者／manual＝追加、
               attendance：attended／absent／uninvited、return_policy：needed／hikidemono／not_needed、goods_value_jpy：品物の相当額）
     givers  = 贈り主の表示用（giverView）。{ id, kind, name, latin, idx, replyId, guestId, attending, side }
               kind：person＝出席者（reply_person_id）／guest＝招待客（guest_id）／name＝名前だけ／orphan＝紐付け先が消えた
     returns = その gift の gift_returns（削除済みを含んでよい。ここで除く）
     hiki    = その gift の gift_hikidemono（お渡しした引出物・引菓子。削除済みを含んでよい。ここで除く） */

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
/* v3：披露宴の出欠と内祝いの要否 */
export const ATTENDANCES = [['attended', '出席'], ['absent', '欠席'], ['uninvited', '招待なし']];
export const ATTENDANCE_LABEL = Object.fromEntries(ATTENDANCES);
export const RETURN_POLICIES = [['needed', '必要'], ['hikidemono', '不要（引出物お渡し済）'], ['not_needed', '不要（その他）']];
export const RETURN_POLICY_LABEL = Object.fromEntries(RETURN_POLICIES);
/** 内祝いの要否の初期値：出席は「不要（引出物お渡し済）」、欠席・招待なしは「必要」 */
export const defaultReturnPolicy = attendance => attendance === 'attended' ? 'hikidemono' : 'needed';
/** 手動登録の出欠：欠席の招待客をゲスト一覧から選んだら absent、名前の直接入力だけなら uninvited */
export const manualAttendance = guestIds => (guestIds && guestIds.length) ? 'absent' : 'uninvited';
export const HIKI_CATEGORIES = ['引出物', '引菓子', 'その他'];

/* 内祝い状況。hikidemono＝引出物済／none＝不要／pending＝受領前／todo＝未手配／partial＝手配中（一部）／shipped＝発送済／delivered＝到着済 */
export const RETURN_STATES = [['hikidemono', '引出物済'], ['none', '不要'], ['pending', '—（受領前）'], ['todo', '未手配'], ['partial', '手配中（一部）'], ['shipped', '発送済'], ['delivered', '到着済']];
export const RETURN_STATE_LABEL = Object.fromEntries(RETURN_STATES);

export const liveReturns = row => (row.returns || []).filter(r => !r.deleted_at);
export const retAmount = r => (Number(r.price_jpy) || 0) + (Number(r.shipping_jpy) || 0);
const isReceived = g => g.status === 'received';
/** 1件の金額。受領済みなら amount_jpy（実績）、仮なら expected_jpy（見込み）。品物の相当額は含めない */
export const giftValue = g => isReceived(g) ? (Number(g.amount_jpy) || 0) : (Number(g.expected_jpy) || 0);
/** 品物の相当額（ご祝儀の合計・予算には入れない） */
export const goodsValue = g => Number(g.goods_value_jpy) || 0;
const sideOk = s => (s === 'groom' || s === 'bride') ? s : null;

/* ---- お渡しした引出物・引菓子（予算には連動させない） ---- */
export const liveHiki = row => (row.hiki || []).filter(h => !h.deleted_at);
export const hikiAmount = h => (Number(h.price_jpy) || 0) * (Number(h.qty) || 0);
export const hikiTotal = row => liveHiki(row).reduce((s, h) => s + hikiAmount(h), 0);
/** CSV・一覧用の品名のまとめ（2個以上は「×n」） */
export const hikiNames = row => liveHiki(row).map(h => `${h.name}${Number(h.qty) > 1 ? `×${h.qty}` : ''}`).join(' / ');
const HIKI_RANK = { 引出物: 0, 引菓子: 1 };
/** 引出物・引菓子リスト（gift_check_items）の選択肢。区分 → 種類No. → sort の順。
    同じ区分・種類No.に複数行（色違いなど）があるものは、バリエーション・内訳も品名とラベルに入れる */
export function checkItemOptions(items) {
  const count = new Map();
  for (const it of items) { const k = `${it.category}:${it.type_no}`; count.set(k, (count.get(k) || 0) + 1); }
  return [...items].sort((a, b) => (HIKI_RANK[a.category] ?? 9) - (HIKI_RANK[b.category] ?? 9)
      || (a.type_no ?? 0) - (b.type_no ?? 0) || (a.sort ?? 0) - (b.sort ?? 0))
    .map(it => {
      const multi = count.get(`${it.category}:${it.type_no}`) > 1 && it.variant;
      const name = `${it.brand ? it.brand + ' ' : ''}${it.name}${multi ? `（${it.variant}）` : ''}`;
      const category = HIKI_CATEGORIES.includes(it.category) ? it.category : 'その他';
      const price = Math.round(Number(it.unit_price) || 0);
      return { id: it.id, category, name, price,
               label: `${category}${it.type_no != null ? ` No.${it.type_no}` : ''}　${name}　¥${price.toLocaleString('ja-JP')}` };
    });
}

/** 内祝い状況。要否が「不要（引出物お渡し済）」→ hikidemono、「不要（その他）」→ none。
    必要の行：仮（受領前）で内祝いの登録が無ければ pending（未手配には数えない）。
    内祝いが無い、またはすべて「予定」→ todo。すべて到着済 → delivered、すべて発送済か到着済 → shipped、それ以外 → partial */
export function returnState(row) {
  const rs = liveReturns(row);
  const policy = row.gift.return_policy || 'needed';
  if (policy === 'hikidemono') return 'hikidemono';
  if (policy === 'not_needed') return 'none';
  if (!isReceived(row.gift) && !rs.length) return 'pending';
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
                    expected: p.idx === 0 ? (Number(defaultJpy) || 0) : 0,
                    attendance: 'attended', return_policy: defaultReturnPolicy('attended') });
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
/** 内祝いの参考額（ご祝儀の金額＋品物の相当額 の 1/3〜1/2）。金額が無ければ null */
export function returnGuide(gift) {
  const v = giftValue(gift) + goodsValue(gift);
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
              goods: z(), returnCost: 0, returnPlanned: 0, todo: 0 };
  for (const row of live) {
    const v = giftValue(row.gift);
    s.total += v;
    if (goodsValue(row.gift) > 0) { s.goods.count++; s.goods.total += goodsValue(row.gift); }   /* 合計には入れない */
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
    仮の金額は本人（出席者の idx 0）なら既定値、それ以外は 0。
    新しく分かれる行の出欠は、出席者なら attended、招待客なら absent、名前だけなら uninvited（内祝いの要否はその初期値） */
export function unmergePlan(row, defaultJpy) {
  if ((row.givers || []).length < 2) return { error: '連名ではありません' };
  if (isReceived(row.gift)) return { error: '受領済みの連名は解除できません。先に受領を取り消してください' };
  return {
    parts: row.givers.map((x, i) => {
      const attendance = x.kind === 'person' ? 'attended' : x.kind === 'guest' ? 'absent' : 'uninvited';
      return {
        giverId: x.id, keep: i === 0,
        expected: x.kind === 'person' && x.idx === 0 ? (Number(defaultJpy) || 0) : 0,
        source: x.kind === 'person' ? 'attendee' : 'manual',
        side: sideOk(x.side) || sideOk(row.gift.side),
        attendance, return_policy: defaultReturnPolicy(attendance),
      };
    }),
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
/** f = { q, status, side, circle, source, attendance, state }。circlesOf(guestId) は友人圏 id の配列 */
export function matchRow(row, f, circlesOf = () => []) {
  const g = row.gift;
  if (f.status && g.status !== f.status) return false;
  if (f.attendance && g.attendance !== f.attendance) return false;
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
/* v3 1.：一覧は「組」（同じ回答の本人＋同行者）を単位に並べる。
   行の位置は先頭の贈り主で決まる（連名はまとめた中の先頭の贈り主の位置に1行）。出席者でない行（追加）は1行で1組 */
const anchorOf = row => (row.givers || [])[0] || null;
const anchorIdx = row => { const a = anchorOf(row); return a && a.kind === 'person' ? (a.idx ?? 0) : 0; };
export const groupKey = row => { const a = anchorOf(row); return a && a.kind === 'person' && a.replyId ? `r:${a.replyId}` : `g:${row.gift.id}`; };
/** 同行の行（先頭の贈り主が同行者 idx > 0）。一覧で字下げし「同行」ラベルを付ける */
export const isCompanionRow = row => anchorIdx(row) > 0;
/** 並び替え：name（名前）／side（新郎側→新婦側→未設定）／amount（金額の多い順）／received（受領日時の新しい順。仮は後ろ）。
    組どうしは組の先頭（本人）の値で並べ、組の中は本人 → 同行者（idx 順）。並び替えても組は崩れない */
export function sortRows(rows, key) {
  const nameKey = row => { const x = anchorOf(row); return (x && (x.latin || x.name)) || ''; };
  const byName = (a, b) => nameKey(a).localeCompare(nameKey(b), 'ja', { sensitivity: 'base' })
    || String(a.gift.id).localeCompare(String(b.gift.id));
  const cmp = {
    side: (a, b) => (SIDE_RANK[a.gift.side] ?? 2) - (SIDE_RANK[b.gift.side] ?? 2) || byName(a, b),
    amount: (a, b) => giftValue(b.gift) - giftValue(a.gift) || byName(a, b),
    received: (a, b) => String(b.gift.received_at || '').localeCompare(String(a.gift.received_at || '')) || byName(a, b),
  }[key] || byName;
  const groups = new Map();
  for (const r of rows) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const lists = [...groups.values()].map(list =>
    list.sort((a, b) => anchorIdx(a) - anchorIdx(b) || String(a.gift.id).localeCompare(String(b.gift.id))));
  lists.sort((a, b) => cmp(a[0], b[0]));
  return lists.flat();
}

/* ---- CSV ---- */
export const CSV_COLS = ['贈り主', '贈り主（ローマ字）', '人数', '表書きの名義', 'サイド', '出欠', '区分', '状態', '金額（円）', '品物の相当額（円）',
  '通貨', '外貨の金額', '受領日時', '種類', '経路', '内祝いの要否', '内祝い状況', '内祝い 品名', '内祝い 金額（商品代＋送料）', '内祝い 明細',
  'お渡しした引出物・引菓子', 'お渡しした引出物・引菓子の合計（円）', 'お礼状', 'メモ'];
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
  const hk = liveHiki(row);
  return [
    giverNames(row).join('・'), (row.givers || []).map(x => (x.latin || '').toUpperCase()).filter(Boolean).join('・'),
    (row.givers || []).length, g.envelope_name || '', SIDE_LABEL[g.side] || '',
    ATTENDANCE_LABEL[g.attendance] || '', SOURCE_LABEL[g.source] || '', STATUS_LABEL[g.status] || '', giftValue(g),
    goodsValue(g) || '',
    g.currency || '', foreign && g.amount != null ? Number(g.amount) : '',
    fmtDT(g.received_at), KIND_LABEL[g.kind] || g.kind || '', ROUTE_LABEL[g.route] || g.route || '',
    RETURN_POLICY_LABEL[g.return_policy || 'needed'], RETURN_STATE_LABEL[returnState(row)],
    rs.map(r => r.item_name).join(' / '),
    rs.length ? rs.reduce((s, r) => s + retAmount(r), 0) : '',
    rs.map(r => `${r.item_name}${r.shop ? `（${r.shop}）` : ''} 商品代${Number(r.price_jpy) || 0}円 送料${Number(r.shipping_jpy) || 0}円 ${RET_STATUS_LABEL[r.status] || r.status}`).join(' / '),
    hikiNames(row), hk.length ? hikiTotal(row) : '',
    g.thank_you_sent ? '送付済' : '未送付', g.memo || '',
  ];
}

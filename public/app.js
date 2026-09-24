import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ============================== 設定 ============================== */
const SUPA_URL = 'https://cvnqnvnppvfhwmrehagt.supabase.co';
const SUPA_KEY = 'sb_publishable_ZYwTP155dx57wEopKpezNA_LR1IOjID';
const MAIL_DOMAIN = '@forest-mm.com';
const EVENT_DATE = new Date(2026, 8, 26);   // 2026-09-26
const DEADLINE   = new Date(2026, 8, 14);   // 2026-09-14
const BUCKET = 'rsvp-photos';

const sb = createClient(SUPA_URL, SUPA_KEY);

/* ============================== 小道具 ============================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').replace(/[\s　]/g, '').toLowerCase();
const pad2 = n => String(n).padStart(2, '0');

function toast(msg, kind = '') {
  const box = $('#toast');
  const d = document.createElement('div');
  if (kind) d.className = kind;
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(() => d.remove(), kind === 'err' ? 6000 : 3200);
}
function fmtDT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function ymd(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}
function ageAt(birthdate, age) {
  if (age !== null && age !== undefined && age !== '') return Number(age);
  if (!birthdate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate);
  if (!m) return null;
  let a = EVENT_DATE.getFullYear() - +m[1];
  const mm = (EVENT_DATE.getMonth() + 1) - +m[2];
  if (mm < 0 || (mm === 0 && EVENT_DATE.getDate() - +m[3] < 0)) a--;
  return a >= 0 ? a : null;
}
/* 区分：is_child=false→大人／age 7-12→小学生／age<=6→未就学／年齢不明の子→子ども（年齢未記入） */
function kindOf(p) {
  if (!p) return '';
  if (!p.is_child) return '大人';
  const a = ageAt(p.birthdate, p.age);
  if (a === null) return '未就学児（年齢未記入）';
  if (a >= 7 && a <= 12) return `小学生・${a}歳`;
  if (a <= 6) return `未就学児・${a}歳`;
  return `大人・${a}歳`;
}
/* A2/A3: 年齢からのお子様メニュー既定。A＝6歳以下／B＝7〜8歳／C＝9歳以上 */
function mealByAge(p) {
  const a = ageAt(p?.birthdate, p?.age);
  if (a == null || a <= 6) return 'A';
  return a <= 8 ? 'B' : 'C';
}
/* A2/A3: 実際に使うお子様メニュー。kid_meal があればそれ、無ければ年齢から */
const mealOf = p => !p?.is_child ? '' : (['A', 'B', 'C'].includes(p.kid_meal) ? p.kid_meal : mealByAge(p));
function kindKey(p) {
  if (!p || !p.is_child) return 'adult';
  const a = ageAt(p.birthdate, p.age);
  if (a === null) return 'pre';        // 年齢未記入の子どもは未就学児に含める
  if (a >= 7 && a <= 12) return 'primary';
  if (a <= 6) return 'pre';
  return 'adult';
}
const sideTag = s => s === 'groom' ? '<span class="tag g">新郎友人</span>'
  : s === 'bride' ? '<span class="tag b">新婦友人</span>' : '';
const sideLabel = s => s === 'groom' ? '新郎友人' : s === 'bride' ? '新婦友人' : '未設定';
/* 有効な回答 = 削除されておらず、より新しい回答に置き換えられていないもの */
const replyLive = r => !!r && !r.deleted_at && !r.superseded_by;
const replyDup  = r => !!r && !!r.superseded_by;
/* 有効な人 = 削除されていない reply_people */
const peopleLive = rid => (S.peopleByReply.get(rid) || []).filter(p => !p.deleted_at);
const PAGE_SIZE = 150;
/* F2: 円・3桁区切り・四捨五入 */
const yen = v => '¥' + Math.round(Number(v) || 0).toLocaleString('ja-JP');
const TOOLS = [['line','LINE'],['wechat','WeChat'],['email','メール'],['phone','電話'],
                ['facebook','Facebook'],['instagram','Instagram'],['other','その他']];
const TOOL_LABEL = Object.fromEntries(TOOLS);
const TOOL_CLASS = { line:'ln', wechat:'wc', email:'ml' };
const toolTag = t => t ? `<span class="tag ${TOOL_CLASS[t] || ''}">${esc(TOOL_LABEL[t] || t)}</span>` : '';
/* A5: アイコンはすべて自前のインラインSVG。公式ロゴ画像・ワードマークは使わない。
   打診経路＝線画のアウトライン、公式登録済＝塗り＋右下のチェック印。 */
const BUBBLES = {                     // WeChat：大小2つの吹き出しが重なった形
  big:   'M8.1 3.1c3.2 0 5.8 2 5.8 4.5s-2.6 4.5-5.8 4.5c-.6 0-1.2-.1-1.8-.2l-2.4 1.2.7-2.1C3.3 10.2 2.3 9 2.3 7.6c0-2.5 2.6-4.5 5.8-4.5Z',
  small: 'M13.6 8.9c2.4 0 4.3 1.5 4.3 3.3 0 1.1-.6 2-1.6 2.6l.5 1.6-1.9-.9c-.4.1-.8.1-1.3.1-2.4 0-4.3-1.5-4.3-3.4s1.9-3.3 4.3-3.3Z',
};
const TOOL_SVG = {                    // (a) 打診経路：線のみ
  line: `<circle cx="10" cy="10" r="8.4" fill="none" stroke="#06C755" stroke-width="1.4"/>
         <text x="10" y="14" text-anchor="middle" font-size="10.5" font-weight="700" fill="#06C755"
               font-family="Helvetica,Arial,sans-serif">L</text>`,
  wechat: `<path d="${'{big}'}" fill="#fff" stroke="#07C160" stroke-width="1.3" stroke-linejoin="round"/>
           <path d="${'{small}'}" fill="#fff" stroke="#07C160" stroke-width="1.3" stroke-linejoin="round"/>`,
  email: `<rect x="1.6" y="4.2" width="16.8" height="11.6" rx="2" fill="none" stroke="#6F665E" stroke-width="1.4"/>
          <path d="M2.6 5.6 10 11l7.4-5.4" fill="none" stroke="#6F665E" stroke-width="1.4"
                stroke-linecap="round" stroke-linejoin="round"/>`,
  phone: `<circle cx="10" cy="10" r="8.4" fill="none" stroke="#6F665E" stroke-width="1.4"/>
          <path d="M6.7 6.2c.5-.5 1.2-.4 1.5.2l.7 1.3c.2.4.1.9-.2 1.2l-.5.5c.5 1 1.3 1.8 2.3 2.3l.5-.5c.3-.3.8-.4 1.2-.2l1.3.7c.6.3.7 1 .2 1.5l-.6.6c-.4.4-1 .5-1.6.3-1.3-.4-2.6-1.2-3.7-2.3S6.2 9.4 5.8 8.1c-.2-.6 0-1.2.3-1.6z"
                fill="none" stroke="#6F665E" stroke-width="1.3" stroke-linejoin="round"/>`,
  facebook: `<circle cx="10" cy="10" r="8.4" fill="none" stroke="#1877F2" stroke-width="1.4"/>
             <text x="10" y="15" text-anchor="middle" font-size="12.5" font-weight="700" fill="#1877F2"
                   font-family="Georgia,serif">f</text>`,
  instagram: `<circle cx="10" cy="10" r="8.4" fill="none" stroke="#C13584" stroke-width="1.4"/>
              <rect x="5.8" y="6.6" width="8.4" height="7" rx="2" fill="none" stroke="#C13584" stroke-width="1.2"/>
              <circle cx="10" cy="10.1" r="1.9" fill="none" stroke="#C13584" stroke-width="1.2"/>
              <path d="M8.4 6.6 9.1 5.3h1.8l.7 1.3" fill="none" stroke="#C13584" stroke-width="1.2"
                    stroke-linejoin="round"/>`,
  other: `<circle cx="10" cy="10" r="8.4" fill="none" stroke="#9C9288" stroke-width="1.4"/>
          <circle cx="6.5" cy="10" r="1" fill="#9C9288"/><circle cx="10" cy="10" r="1" fill="#9C9288"/>
          <circle cx="13.5" cy="10" r="1" fill="#9C9288"/>`,
};
TOOL_SVG.wechat = TOOL_SVG.wechat.replace('{big}', BUBBLES.big).replace('{small}', BUBBLES.small);

/* 右下の白丸＋チェック印（24グリッド） */
const CHECK24 = c => `<circle cx="18.5" cy="18.5" r="4" fill="#fff"/>
  <path d="M16.6 18.5l1.3 1.3 2.2-2.4" fill="none" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>`;
/* WeChat：大小2つの吹き出し（24グリッド） */
const B24 = {
  big:   'M9.6 4.3c3.9 0 7 2.4 7 5.3s-3.1 5.3-7 5.3c-.7 0-1.4-.1-2.1-.3l-2.9 1.5.8-2.5C3.9 12.7 2.6 11.1 2.6 9.6c0-2.9 3.1-5.3 7-5.3Z',
  small: 'M16.2 10.6c2.9 0 5.2 1.8 5.2 4 0 1.3-.7 2.4-1.9 3.1l.6 1.9-2.3-1.1c-.5.1-1 .2-1.6.2-2.9 0-5.2-1.8-5.2-4s2.3-4.1 5.2-4.1Z',
};
const JOIN_SVG = {                    // (b) 公式登録済：塗り＋チェック（viewBox 0 0 24 24）
  line: `<rect x="2" y="2" width="20" height="20" rx="5" fill="#06C755"/>
         <path d="M12 6.5c-3.6 0-6.5 2.3-6.5 5.1 0 1.7 1.1 3.2 2.7 4.1L7.7 18l2.6-1.5c.5.1 1.1.2 1.7.2 3.6 0 6.5-2.3 6.5-5.1S15.6 6.5 12 6.5z" fill="#fff"/>
         ${CHECK24('#06C755')}`,
  wechat: `<g transform="translate(-.8 -1.4) scale(.94)">
             <path d="${B24.big}" fill="#07C160"/>
             <path d="${B24.small}" fill="#07C160" stroke="#fff" stroke-width="1.2"/>
           </g>
           ${CHECK24('#07C160')}`,
};
/* A2: 未登録は薄いグレーのアウトライン。塗り版と同じ形で状態だけを変える */
const OFF = '#C9C1B7';
const JOIN_OFF_SVG = {
  line: `<rect x="2.7" y="2.7" width="18.6" height="18.6" rx="4.6" fill="none" stroke="${OFF}" stroke-width="1.4"/>
         <path d="M12 6.5c-3.6 0-6.5 2.3-6.5 5.1 0 1.7 1.1 3.2 2.7 4.1L7.7 18l2.6-1.5c.5.1 1.1.2 1.7.2 3.6 0 6.5-2.3 6.5-5.1S15.6 6.5 12 6.5z"
               fill="none" stroke="${OFF}" stroke-width="1.3" stroke-linejoin="round"/>`,
  wechat: `<g transform="translate(-.8 -1.4) scale(.94)">
             <path d="${'{big}'}" fill="none" stroke="${OFF}" stroke-width="1.4" stroke-linejoin="round"/>
             <path d="${'{small}'}" fill="#fff" stroke="${OFF}" stroke-width="1.4" stroke-linejoin="round"/>
           </g>`,
};
JOIN_OFF_SVG.wechat = JOIN_OFF_SVG.wechat.replace('{big}', B24.big).replace('{small}', B24.small);

const svgIcon = (vb, body, title, cls = 'tico') =>
  `<svg class="${cls}" viewBox="${vb}" width="20" height="20" role="img" aria-label="${esc(title)}"
     ><title>${esc(title)}</title>${body}</svg>`;
const toolIcon = t => TOOL_SVG[t] ? svgIcon('0 0 20 20', TOOL_SVG[t], `打診経路：${TOOL_LABEL[t] || t}`) : '';
/* A2: 公式登録列。登録済＝塗り／未登録＝薄いグレーのアウトラインで、常に2つ並べる */
function joinCell(g) {
  if (!g) return '';
  const one = (on, onSvg, offSvg, name) => svgIcon('0 0 24 24', on ? onSvg : offSvg,
    on ? `${name}：登録済` : `${name}：未登録`, on ? 'tico' : 'tico dim');
  return one(!!g.line_joined, JOIN_SVG.line, JOIN_OFF_SVG.line, '公式LINEアカウント')
    + one(!!g.wechat_joined, JOIN_SVG.wechat, JOIN_OFF_SVG.wechat, 'WeChatグループ');
}
/* B3: お車代・個別ギフト・配慮事項のアイコン */
const COST_SVG = {
  fee: `<rect x="1.6" y="4.6" width="16.8" height="11" rx="1.8" fill="none" stroke="#4C7A5A" stroke-width="1.4"/>
        <path d="M2.4 5.6 10 10.9l7.6-5.3" fill="none" stroke="#4C7A5A" stroke-width="1.3"
              stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="10" cy="12.3" r="3.1" fill="#fff" stroke="#4C7A5A" stroke-width="1.2"/>
        <text x="10" y="14.2" text-anchor="middle" font-size="4.6" fill="#4C7A5A"
              font-family="Helvetica,Arial,sans-serif">¥</text>`,
  gift: `<rect x="2.2" y="8" width="15.6" height="9.4" rx="1.2" fill="none" stroke="#8E1728" stroke-width="1.4"/>
         <rect x="1.4" y="5.4" width="17.2" height="3.2" rx="1" fill="none" stroke="#8E1728" stroke-width="1.4"/>
         <path d="M10 5.4v12" fill="none" stroke="#8E1728" stroke-width="1.3"/>
         <path d="M10 5.4C8.6 3 5.4 2.9 5.4 4.6c0 1.1 1.6 1.5 4.6.8Z" fill="none" stroke="#8E1728" stroke-width="1.2" stroke-linejoin="round"/>
         <path d="M10 5.4c1.4-2.4 4.6-2.5 4.6-.8 0 1.1-1.6 1.5-4.6.8Z" fill="none" stroke="#8E1728" stroke-width="1.2" stroke-linejoin="round"/>`,
  needs: `<path d="M10 2.3 18.7 17H1.3Z" fill="none" stroke="#8E1728" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M10 7.6v4.3" fill="none" stroke="#8E1728" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="10" cy="14.4" r=".95" fill="#8E1728"/>`,
};
function costIcons(g, r) {
  let out = '';
  if (g && (g.transport_fee || 0) > 0)
    out += svgIcon('0 0 20 20', COST_SVG.fee,
      `お車代 ${yen(g.transport_fee)}${g.transport_note ? '／' + g.transport_note : ''}`);
  if (g && (g.gift_note || '').trim())
    out += svgIcon('0 0 20 20', COST_SVG.gift, `ギフト：${g.gift_note}`);
  const needs = (r?.needs || '').trim();
  if (needs && replyLive(r)) out += svgIcon('0 0 20 20', COST_SVG.needs, `配慮事項：${needs}`);
  return out;
}
/* A3: 氏名の直後は打診経路のみ（＋B3 のお車代・ギフト・配慮事項） */
const nameIcons = (g, r) => (g ? toolIcon(g.contact_tool) : '') + costIcons(g, r);
const fullName = o => `${o?.family_name ?? ''} ${o?.given_name ?? ''}`.trim();
const latinName = o => `${o?.family_name_latin ?? ''} ${o?.given_name_latin ?? ''}`.trim();
/* ---- A. 氏名は「回答の最新値」（reply_people）を正とする ----
   replies_admin の氏名列と original は受信時の記録。表示・照合・出力には使わない。 */
const nameDiffers = (p, g) => !!p && !!g &&
  (norm(fullName(p)) !== norm(fullName(g)) || norm(latinName(p)) !== norm(latinName(g)));
/* 招待リスト側の表記を小さく併記する。異なるときだけ呼ぶ */
function listNameNote(p, g) {
  const lat = norm(latinName(p)) !== norm(latinName(g)) && latinName(g)
    ? `（${latinName(g).toUpperCase()}）` : '';
  return `<span class="listname" title="回答の表記を優先しています">招待リスト：${esc(fullName(g))}${esc(lat)}</span>`;
}

/* ============================== 状態 ============================== */
const S = {
  me: null,
  guests: [], circles: [], guestCircles: [], replies: [], people: [], shares: [],
  byGuest: new Map(), byReply: new Map(), peopleByReply: new Map(),
  circlesOfGuest: new Map(), replyOfGuest: new Map(),
  sel: new Set(), rows: [], allRows: [], page: 1, colw: {}, sideTab: '', sort: 'updated',
  dupOf: new Map(), dupGroups: [], repliesOfGuest: new Map(),
  photoSel: new Set(), photos: [], external: [],
  signed: new Map(),
  titles: [],                       // A1: 肩書きの選択肢（title_options）
};

/* ============================== A. 肩書き ============================== */
/* A2: 同行者の肩書きは固定の4つ（空＝なし） */
const COMP_TITLES = ['御令息', '御令嬢', '令夫人', '令夫君'];
/* A1: title_options の見出し列。列名が name 以外でも拾えるようにしておく */
let TITLE_COL = 'name';
const titleName = t => String(t?.[TITLE_COL] ?? '').trim();
const titleNames = () => [...new Set(S.titles.map(titleName).filter(Boolean))];
/* このテーブルが未作成でも一覧が壊れないよう、失敗は握りつぶす */
async function loadTitles() {
  try {
    const { data, error } = await sb.from('title_options').select('*');
    if (error) { S.titles = []; return; }
    S.titles = data || [];
    const r = S.titles[0];
    if (r) TITLE_COL = ['name', 'label', 'title', 'value'].find(k => k in r) || 'name';
    S.titles.sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)
      || titleName(a).localeCompare(titleName(b), 'ja'));
  } catch { S.titles = []; }
}
/* 肩書きプルダウン。末尾の「＋ 新しい肩書きを追加」で自己定義を足せる（A1） */
const TITLE_NEW = '__new__';
function titleSelectHTML(id, cur, opts, addable) {
  const list = [...new Set([...opts, ...(cur ? [cur] : [])])];
  return `<select id="${id}">
    <option value="">なし</option>
    ${list.map(n => `<option value="${esc(n)}"${cur === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}
    ${addable ? `<option value="${TITLE_NEW}">＋ 新しい肩書きを追加</option>` : ''}
  </select>`;
}
/* 「＋ 新しい肩書きを追加」を選んだら入力欄を出し、title_options に足してその場で選択する */
function wireTitleNew(sel) {
  if (!sel) return;
  const wrap = document.createElement('div');
  wrap.className = 'titlenew off';
  wrap.innerHTML = `<input id="tn-name" placeholder="新しい肩書き（例：御尊父様）" maxlength="12">
    <button type="button" class="btn s o" id="tn-add">＋ 追加</button>
    <button type="button" class="btn link" id="tn-cancel">やめる</button>`;
  sel.after(wrap);
  let prev = sel.value;
  const close = () => { wrap.classList.add('off'); sel.value = prev; };
  sel.addEventListener('change', () => {
    if (sel.value !== TITLE_NEW) { prev = sel.value; return; }
    wrap.classList.remove('off');
    $('#tn-name', wrap).focus();
  });
  $('#tn-cancel', wrap).addEventListener('click', close);
  $('#tn-name', wrap).addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#tn-add', wrap).click(); }
    if (e.key === 'Escape') close();
  });
  $('#tn-add', wrap).addEventListener('click', async () => {
    const name = $('#tn-name', wrap).value.trim();
    if (!name) { toast('肩書きを入力してください', 'err'); return; }
    if (titleNames().includes(name)) {
      sel.value = name; prev = name; wrap.classList.add('off'); return;
    }
    const { data, error } = await sb.from('title_options')
      .insert({ [TITLE_COL]: name, sort_order: 100 }).select().single();
    if (error) { toast('肩書きの追加に失敗：' + error.message, 'err'); return; }
    S.titles.push(data);
    sel.insertAdjacentHTML('beforeend', '');
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.insertBefore(opt, sel.querySelector(`option[value="${TITLE_NEW}"]`));
    sel.value = name; prev = name;
    wrap.classList.add('off');
    toast(`肩書き「${name}」を追加しました`, 'ok');
  });
}

/* ============================== 認証 ============================== */
async function boot() {
  const { data } = await sb.auth.getSession();
  if (data.session) { await enter(data.session.user); }
  else $('#login').classList.remove('off');
}
async function enter(user) {
  S.me = user;
  $('#me-mail').textContent = user.email.replace(MAIL_DOMAIN, '');
  $('#login').classList.add('off');
  await loadAll();
}
$('#lg-go').addEventListener('click', doLogin);
$('#lg-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('#lg-id').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lg-pw').focus(); });
async function doLogin() {
  const msg = $('#loginmsg'); msg.textContent = '';
  let id = $('#lg-id').value.trim();
  if (!id) { msg.textContent = 'IDまたはパスワードが違います'; return; }
  if (!id.includes('@')) id += MAIL_DOMAIN;
  const { data, error } = await sb.auth.signInWithPassword({ email: id, password: $('#lg-pw').value });
  if (error) { msg.textContent = 'IDまたはパスワードが違います'; return; }
  $('#lg-pw').value = '';
  await enter(data.user);
}
$('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

/* ============================== 読み込み ============================== */
async function loadAll() {
  const q = [
    sb.from('guests').select('*').order('family_name_latin', { nullsFirst: false }),
    sb.from('circles').select('*').order('name'),
    sb.from('guest_circles').select('*'),
    sb.from('replies_admin').select('*').order('received_at', { ascending: false }),
    sb.from('reply_people').select('*').order('idx'),
    sb.from('share_links').select('*'),
  ];
  const res = await Promise.all(q);
  const bad = res.find(r => r.error);
  if (bad) { toast('読み込みに失敗しました：' + bad.error.message, 'err'); return; }
  [S.guests, S.circles, S.guestCircles, S.replies, S.people, S.shares] = res.map(r => r.data || []);
  await loadTitles();
  await loadEventSettings();       // 基本情報（新郎新婦の名前・全体の申し送り）
  index();
  await loadBudgetData();          // ダッシュボードの予算カードが初回から出るよう先に読む
  fillCircleSelects();
  loadColWidths(); wireColResize();
  renderDash(); renderGuests(); renderCircles(); renderPhotos(); renderBudget();
  await loadSeating(); renderSeating();
}
/* A1: 個別ギフト欄のサジェスト元。予算タブの「個別手配分」の品目名を使う。
   このテーブルが未作成でも一覧が壊れないよう、失敗は握りつぶす */
async function loadExternal() {
  try {
    const { data, error } = await sb.from('budget_external').select('*');
    S.external = error ? [] : (data || []);
  } catch { S.external = []; }
}
const extNames = () => [...new Set((S.external || [])
  .map(x => (x.name ?? x.item ?? x.item_name ?? x.title ?? '').trim())
  .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));

function index() {
  S.byGuest = new Map(S.guests.map(g => [g.id, g]));
  S.byReply = new Map(S.replies.map(r => [r.id, r]));
  S.peopleByReply = new Map();
  for (const p of S.people) {
    if (!S.peopleByReply.has(p.reply_id)) S.peopleByReply.set(p.reply_id, []);
    S.peopleByReply.get(p.reply_id).push(p);
  }
  for (const arr of S.peopleByReply.values()) arr.sort((a, b) => a.idx - b.idx);
  S.circlesOfGuest = new Map();
  const cById = new Map(S.circles.map(c => [c.id, c]));
  for (const gc of S.guestCircles) {
    if (!S.circlesOfGuest.has(gc.guest_id)) S.circlesOfGuest.set(gc.guest_id, []);
    const c = cById.get(gc.circle_id); if (c) S.circlesOfGuest.get(gc.guest_id).push(c);
  }
  S.repliesOfGuest = new Map();       // 招待者 → 紐付いた回答（受信順）
  for (const r of S.replies) {
    if (!r.matched_guest_id || r.deleted_at) continue;
    if (!S.repliesOfGuest.has(r.matched_guest_id)) S.repliesOfGuest.set(r.matched_guest_id, []);
    S.repliesOfGuest.get(r.matched_guest_id).push(r);
  }
  for (const arr of S.repliesOfGuest.values())
    arr.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
  S.replyOfGuest = new Map();          // 招待者 → 有効な回答（1件）
  for (const [gid, arr] of S.repliesOfGuest) {
    const live = arr.find(replyLive);
    if (live) S.replyOfGuest.set(gid, live);
  }
  buildDuplicates();
}
/* ---- 重複の判定：email → 漢字姓名 → ローマ字姓名 の順で理由を決める ---- */
function dupReason(a, b) {
  const ea = norm(a.email), eb = norm(b.email);
  if (ea && eb && ea === eb) return 'メール一致';
  if (norm(a.family_name) === norm(b.family_name) && norm(a.given_name) === norm(b.given_name)
      && norm(a.family_name) && norm(a.given_name)) return '氏名（漢字）一致';
  const la = norm(a.family_name_latin), ga = norm(a.given_name_latin);
  const lb = norm(b.family_name_latin), gb = norm(b.given_name_latin);
  if (la && ga && lb && gb && la === lb && ga === gb) return '氏名（ローマ字）一致';
  return null;
}
function buildDuplicates() {
  const live = S.guests.filter(g => !g.deleted_at);
  const parent = new Map(live.map(g => [g.id, g.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const link = (x, y) => { const a = find(x), b = find(y); if (a !== b) parent.set(a, b); };
  const why = new Map();          // 「そのペアの理由」を後で表示に使う
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const r = dupReason(live[i], live[j]);
    if (!r) continue;
    link(live[i].id, live[j].id);
    why.set(live[i].id + '|' + live[j].id, r);
    why.set(live[j].id + '|' + live[i].id, r);
  }
  const groups = new Map();
  for (const g of live) {
    const k = find(g.id);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(g);
  }
  S.dupOf = new Map(); S.dupGroups = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const keeper = sorted[0];
    S.dupGroups.push({ keeper, others: sorted.slice(1) });
    for (const g of sorted.slice(1))
      S.dupOf.set(g.id, { keeper, reason: why.get(g.id + '|' + keeper.id) || '重複の可能性' });
  }
}
const dupTag = g => {
  const d = g && S.dupOf.get(g.id);
  return d ? `<span class="tag dup" title="${esc(fullName(d.keeper))}（${esc(d.reason)}）と重複">重複登録</span>` : '';
};
const person0 = rid => (S.peopleByReply.get(rid) || []).find(p => p.idx === 0);
const companions = rid => (S.peopleByReply.get(rid) || []).filter(p => p.idx >= 1);
/* B2: 削除済み同行者は「削除済みのみ／すべて」でだけ出す */
const companionsShown = rid => {
  const show = $('#g-show')?.value || 'live';
  return companions(rid).filter(p => show === 'live' ? !p.deleted_at : show === 'deleted' ? !!p.deleted_at : true);
};

/* ============================== change_log ============================== */
async function logChange(target_table, target_id, action, reason, diff) {
  const { error } = await sb.from('change_log').insert({
    actor: S.me?.email ?? null, target_table, target_id, action, reason, diff: diff ?? null,
  });
  if (error) toast('履歴の記録に失敗：' + error.message, 'err');
}

/* ============================== 画面切替 ============================== */
$$('#nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.v)));
function go(v) {
  if (seatLeaveGuard(v)) return;              /* 配席の未保存の変更を確認 */
  $$('#nav button').forEach(x => x.classList.toggle('on', x.dataset.v === v));
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  window.scrollTo(0, 0);
}
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('on'); }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $$('.modal.on').forEach(m => m.classList.remove('on'));
});
const openModal = id => $('#' + id).classList.add('on');
const closeModal = id => $('#' + id).classList.remove('on');
function wireClose(box) {
  $$('[data-close]', box).forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.remove('on')));
}
function fillCircleSelects() {
  for (const sel of [$('#g-circle'), $('#p-circle'), $('#sv-circle')]) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">友人圏：すべて</option>` +
      S.circles.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') +
      `<option value="__none">タグなし</option>`;
    sel.value = cur;
  }
}
boot();

/* ============================== 集計 ============================== */
function stats() {
  const liveGuests = S.guests.filter(g => !g.deleted_at);
  const invitedGuests = liveGuests.filter(g => !g.auto_created);
  const autoGuests = liveGuests.filter(g => g.auto_created);
  const liveReplies = S.replies.filter(replyLive);          // 有効な回答のみ
  const dupReplies = S.replies.filter(r => !r.deleted_at && replyDup(r));

  const attendPeople = [];
  let absentHouseholds = 0, attendHouseholds = 0;
  for (const r of liveReplies) {
    const ps = peopleLive(r.id);
    const me = ps.find(p => p.idx === 0);
    if (me && me.attending === false) absentHouseholds++;
    if (me && me.attending === true) attendHouseholds++;
    for (const p of ps) if (p.attending === true) attendPeople.push({ p, r });
  }
  const answeredGuestIds = new Set(liveReplies.filter(r => r.matched_guest_id).map(r => r.matched_guest_id));
  const unanswered = liveGuests.filter(g => !answeredGuestIds.has(g.id)).length;

  const bySide = { groom: [], bride: [], none: [] };
  for (const x of attendPeople) {
    const s2 = x.r.side === 'groom' ? 'groom' : x.r.side === 'bride' ? 'bride' : 'none';
    bySide[s2].push(x.p);
  }
  const kinds = list => {
    const k = { adult: 0, primary: 0, pre: 0 };
    for (const p of list) k[kindKey(p)]++;
    return k;
  };
  // side ごとの招待者と回答済み
  const sideStat = sv => {
    const gs = liveGuests.filter(g => g.side === sv);
    const ans = gs.filter(g => answeredGuestIds.has(g.id)).length;
    return { total: gs.length, answered: ans };
  };
  return {
    invited: liveGuests.length, autoCreated: autoGuests.length, listed: invitedGuests.length,
    answered: liveReplies.length, dupReplies: dupReplies.length,
    attendPeople: attendPeople.length, absent: absentHouseholds, attendHouseholds, unanswered,
    bySide, kinds: kinds(attendPeople.map(x => x.p)),
    sideKinds: { groom: kinds(bySide.groom), bride: kinds(bySide.bride), none: kinds(bySide.none) },
    side: { groom: sideStat('groom'), bride: sideStat('bride'),
            none: liveGuests.filter(g => !g.side).length },
    lineJoined: liveGuests.filter(g => g.line_joined).length,
    wechatJoined: liveGuests.filter(g => g.wechat_joined).length,
  };
}
function circleStats() {
  const out = [];
  const liveGuests = S.guests.filter(g => !g.deleted_at);
  const mk = (name, id, list) => {
    let yes = 0, no = 0, wait = 0;
    for (const g of list) {
      const r = S.replyOfGuest.get(g.id);          // 有効な回答のみ
      const me = r ? person0(r.id) : null;
      if (!r || !me) wait++;
      else if (me.attending === true) yes++;
      else if (me.attending === false) no++;
      else wait++;
    }
    out.push({ id, name, total: list.length, yes, no, wait });
  };
  for (const c of S.circles) {
    mk(c.name, c.id, liveGuests.filter(g => (S.circlesOfGuest.get(g.id) || []).some(x => x.id === c.id)));
  }
  mk('タグなし', '__none', liveGuests.filter(g => !(S.circlesOfGuest.get(g.id) || []).length));
  return out;
}

/* ============================== ダッシュボード ============================== */
function renderDash() {
  const st = stats();
  const days = Math.ceil((DEADLINE - new Date()) / 86400000);
  $('#d-sub').innerHTML = days >= 0
    ? `締切 9月14日（月）まで あと <b>${days}</b> 日 ｜ 回答DBは招待状の送信と同時に自動同期`
    : `締切 9月14日（月）は終了しました ｜ 回答DBは招待状の送信と同時に自動同期`;

  /* A6: 重複回答のアラート */
  const alert = $('#d-dup');
  alert.hidden = st.dupReplies === 0;
  if (st.dupReplies) {
    alert.innerHTML = `重複の可能性がある回答が <b>${st.dupReplies}</b> 件あります
      <button id="d-dup-go">確認</button>`;
    $('#d-dup-go').addEventListener('click', () => {
      $('#g-reply').value = 'dupreply'; $('#g-join').value = '';
      go('guests'); renderGuests();
    });
  }

  /* B1: カード3枚 */
  const rate = (n, m) => m ? Math.round(n / m * 100) : 0;
  $('#d-cards').innerHTML = `
    <div class="card"><div class="k">招待者</div><div class="v">${st.invited}<small>名</small></div>
      ${st.autoCreated ? `<div class="note">（うち自動登録 ${st.autoCreated}）</div>` : ''}</div>
    <div class="card"><div class="k">LINE公式 登録率</div>
      <div class="v">${rate(st.lineJoined, st.invited)}<small>%</small></div>
      <div class="note">${st.lineJoined} / ${st.invited} 名</div>
      <div class="bar"><i style="width:${rate(st.lineJoined, st.invited)}%"></i></div></div>
    <div class="card"><div class="k">WeChatグループ 加入率</div>
      <div class="v">${rate(st.wechatJoined, st.invited)}<small>%</small></div>
      <div class="note">${st.wechatJoined} / ${st.invited} 名</div>
      <div class="bar"><i style="width:${rate(st.wechatJoined, st.invited)}%"></i></div></div>`;

  /* A1: 予算カード（回答ベース） */
  const bc = $('#d-budget');
  if (B.set && B.items.length) {
    const t = budgetTotals(autoDriverSet());
    bc.innerHTML = `
      <div class="card b-go"><div class="k">総支出見込み</div><div class="v">${yen(t.grand)}</div>
        <div class="note">ホテル ${yen(t.hotel)}／個別手配 ${yen(t.ext)}／お車代 ${yen(t.fee)}</div>
        <div class="note">回答ベース</div></div>
      <div class="card b-go"><div class="k">ご祝儀見込み</div><div class="v">${yen(t.gift)}</div>
        <div class="note">大人 ${t.cur ? '' : ''}${autoDriverSet().adult} 名 × ${yen(B.set.gift_per_adult)}</div>
        <div class="note">回答ベース</div></div>
      <div class="card b-go${t.balance < 0 ? ' enji' : ''}"><div class="k">収支見込み</div>
        <div class="v">${t.balance < 0 ? '−' : ''}${yen(Math.abs(t.balance))}</div>
        <div class="note">ご祝儀 − 総支出</div><div class="note">回答ベース</div></div>`;
    $$('#d-budget .b-go').forEach(c => c.addEventListener('click', () => { go('budget'); renderBudget(); }));
  } else bc.innerHTML = '';

  /* B3: ドーナツ＋side ごとの回答率 */
  const total = st.attendPeople || 1;
  const C = 2 * Math.PI * 46;
  const seg = n => (n / total) * C;
  const g = st.bySide.groom.length, b = st.bySide.bride.length, n0 = st.bySide.none.length;
  const kd = k => `大人${k.adult}` + (k.primary ? `・小学生${k.primary}` : '') + (k.pre ? `・未就学児${k.pre}` : '');
  const sideBar = (label, o, color) => `
    <div class="sidebar">
      <div class="sl"><span>${label}</span><em>回答済み ${o.answered} / 招待 ${o.total}（${rate(o.answered, o.total)}%）</em></div>
      <div class="bar"><i style="width:${rate(o.answered, o.total)}%;background:${color}"></i></div>
    </div>`;
  $('#d-donut').innerHTML = `
    <svg viewBox="0 0 120 120" class="donut">
      <circle cx="60" cy="60" r="46" fill="none" stroke="#EDE6DA" stroke-width="16"/>
      <circle cx="60" cy="60" r="46" fill="none" stroke="var(--tansei)" stroke-width="16"
        stroke-dasharray="${seg(g).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <circle cx="60" cy="60" r="46" fill="none" stroke="var(--enji)" stroke-width="16"
        stroke-dasharray="${seg(b).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-seg(g)).toFixed(1)}" transform="rotate(-90 60 60)"/>
      <circle cx="60" cy="60" r="46" fill="none" stroke="#C9C2B8" stroke-width="16"
        stroke-dasharray="${seg(n0).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-seg(g) - seg(b)).toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="56" text-anchor="middle" class="dn">${st.attendPeople}</text>
      <text x="60" y="72" text-anchor="middle" class="dk">出席</text>
    </svg>
    <div class="legend">
      <div><i style="background:var(--tansei)"></i>新郎友人 <b>${g}</b><small>${kd(st.sideKinds.groom)}</small></div>
      <div><i style="background:var(--enji)"></i>新婦友人 <b>${b}</b><small>${kd(st.sideKinds.bride)}</small></div>
      ${n0 ? `<div><i style="background:#C9C2B8"></i>未設定 <b>${n0}</b><small>${kd(st.sideKinds.none)}</small></div>` : ''}
    </div>`;
  $('#d-sidebars').innerHTML = sideBar('新郎友人', st.side.groom, 'var(--tansei)') +
    sideBar('新婦友人', st.side.bride, 'var(--enji)') +
    (st.side.none ? `<p class="note">Side 未設定の招待者 ${st.side.none} 名</p>` : '');

  /* B2: 回答の進み */
  $('#d-progress').innerHTML = `
    <div class="prog1"><span class="k">回答済み世帯</span>
      <b>${st.answered}</b><small>/ ${st.invited} 名の招待者</small>
      <div class="bar"><i style="width:${rate(st.answered, st.invited)}%"></i></div></div>
    <div class="k" style="margin-top:16px">出席人数の内訳</div>
    <div class="bigs">
      <div><b>${st.kinds.adult}</b><span>大人</span></div>
      <div><b>${st.kinds.primary}</b><span>小学生</span></div>
      <div><b>${st.kinds.pre}</b><span>未就学児</span></div>
    </div>
    <p class="note" style="margin-top:10px">欠席 ${st.absent} 世帯 ／ 未回答 ${st.unanswered} 名</p>`;

  /* B4: 友人圏別・直近の回答 */
  $('#d-circles').innerHTML = circleStats().map(c => {
    const t = Math.max(1, c.total);
    return `<div class="hb" data-circle="${esc(c.id)}"><span>${esc(c.name)}</span>
      <div class="stack">
        <i style="width:${(c.yes / t * 100).toFixed(1)}%;background:var(--ok)"></i>
        <i style="width:${(c.no / t * 100).toFixed(1)}%;background:var(--enji)"></i>
        <i style="width:${(c.wait / t * 100).toFixed(1)}%;background:#E2DAD0"></i>
      </div><em>${c.yes} / ${c.total}</em></div>`;
  }).join('') || '<p class="empty">友人圏タグがまだありません。</p>';
  $$('#d-circles .hb').forEach(el => el.addEventListener('click', () => {
    $('#g-circle').value = el.dataset.circle; go('guests'); renderGuests();
  }));

  const recent = S.replies.filter(replyLive).slice(0, 5);
  $('#d-recent').innerHTML = recent.map(r => {
    const me = person0(r.id);
    const ps = peopleLive(r.id).filter(p => p.attending === true);
    const gc = r.matched_guest_id ? (S.circlesOfGuest.get(r.matched_guest_id) || []) : [];
    return `<tr><td>${fmtDT(r.received_at)}</td>
      <td class="n"><b>${esc(fullName(me))}</b><small>${esc(latinName(me).toUpperCase())}</small></td>
      <td>${attTag(me?.attending)}</td>
      <td>${ps.length || '—'}</td><td>${sideTag(r.side)}</td>
      <td>${gc.map(c => `<span class="tag circle">${esc(c.name)}</span>`).join('')}</td>
      <td>${esc(r.lang || '')}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">まだ回答がありません。</td></tr>';
}

/* ============================== ゲスト一覧 ============================== */
['g-q','g-circle','g-reply','g-match','g-join','g-show','g-comp','g-sort'].forEach(id =>
  $('#' + id).addEventListener('input', () => { S.page = 1; renderGuests(); }));
$('#g-show').addEventListener('change', () => {
  const del = $('#g-show').value === 'deleted';
  $('#bulk-del').style.display = del ? 'none' : '';
  $('#bulk-restore').style.display = del ? '' : 'none';
});

/* ---- C: 並び替え。世帯（招待者＋同行者＋重複回答）を1かたまりとして並べる ---- */
const ts = v => v ? new Date(v).getTime() : 0;
/* 回答の最終更新。同行者行の更新も拾う */
function replyTouched(r) {
  if (!r) return 0;
  return Math.max(ts(r.updated_at), ts(r.received_at),
    ...(S.peopleByReply.get(r.id) || []).map(p => ts(p.updated_at)));
}
function sortKeys(head) {
  const g = head.guest, r = head.reply, p = head.person;
  const o = g || r || p;
  return {
    /* 回答がある招待者は回答の更新時刻。招待者レコードを直接直したときも上に来るよう max を取る */
    updated: Math.max(replyTouched(r), ts(g?.updated_at), ts(g?.created_at)),
    received: r ? ts(r.received_at) : 0,
    latin: (latinName(p) || latinName(g)).toUpperCase().trim(),
    kanji: (fullName(p) || fullName(g)).trim(),
  };
}
const SORTS = [['updated', '並び：最終更新順'], ['received', '並び：受信日時順'], ['name', '並び：氏名（ローマ字）順']];
function sortGroups(groups, mode) {
  const cmp = {
    updated: (a, b) => b.k.updated - a.k.updated,
    received: (a, b) => (b.k.received - a.k.received) || (b.k.updated - a.k.updated),
    name: (a, b) => {
      const A = a.k.latin, B = b.k.latin;
      if (A && B) return A.localeCompare(B, 'en') || a.k.kanji.localeCompare(b.k.kanji, 'ja');
      if (A) return -1;
      if (B) return 1;
      return a.k.kanji.localeCompare(b.k.kanji, 'ja');
    },
  }[mode] || ((a, b) => b.k.updated - a.k.updated);
  return groups.sort(cmp);
}
function buildRows() {
  const show = $('#g-show').value;
  const alive = o => show === 'live' ? !o.deleted_at : show === 'deleted' ? !!o.deleted_at : true;
  const groups = [];
  const push = rows => groups.push({ k: sortKeys(rows[0]), rows });

  // 1) 未紐付の回答
  for (const r of S.replies) {
    if (r.matched_guest_id) continue;
    if (!alive(r)) continue;
    const head = { kind: 'unmatched', reply: r, person: person0(r.id), dup: replyDup(r) };
    push([head, ...companionsShown(r.id).map(c => ({ ...head, kind: 'companion', person: c }))]);
  }
  // 2) 招待者。有効な回答は行にまとめ、重複回答はその下に受信順で並べる
  /* B2: 「削除済みのみ」では、招待者や回答が生きていても
     削除された同行者を抱えている世帯は表示する（復元できるように） */
  const hasDelComp = g => (S.repliesOfGuest.get(g.id) || [])
    .some(r => companions(r.id).some(p => p.deleted_at));
  for (const g of S.guests) {
    if (show === 'live' && g.deleted_at) continue;
    if (show === 'deleted' && !g.deleted_at
      && !(S.repliesOfGuest.get(g.id) || []).some(r => r.deleted_at) && !hasDelComp(g)) continue;
    const all = (S.repliesOfGuest.get(g.id) || []).filter(r => show === 'live' ? alive(r) : true);
    const live = all.find(replyLive) || null;
    const rows = [{ kind: 'guest', guest: g, reply: live, person: live ? person0(live.id) : null, dup: false }];
    if (live) for (const c of companionsShown(live.id))
      rows.push({ kind: 'companion', guest: g, reply: live, person: c, dup: false });
    for (const r of all) {
      if (r === live) continue;
      const head = { kind: 'reply', guest: g, reply: r, person: person0(r.id), dup: replyDup(r) };
      rows.push(head, ...companionsShown(r.id).map(c => ({ ...head, kind: 'companion', person: c })));
    }
    push(rows);
  }
  return sortGroups(groups, S.sort).flatMap(x => x.rows);
}
function passFilter(row, f) {
  if (row.kind === 'companion') return true;   // 親で判定
  const g = row.guest, r = row.reply, p = row.person;
  if (f.q) {
    const hay = norm([fullName(g), latinName(g), g?.email, g?.messenger_id,
      fullName(p), latinName(p), r?.email, r?.messenger].join(' '));
    if (!hay.includes(norm(f.q))) return false;
  }
  const side = g?.side || r?.side || null;
  if (f.side === 'none') { if (side) return false; }
  else if (f.side && side !== f.side) return false;
  if (f.circle) {
    const cs = g ? (S.circlesOfGuest.get(g.id) || []) : [];
    if (f.circle === '__none') { if (cs.length) return false; }
    else if (!cs.some(c => c.id === f.circle)) return false;
  }
  if (f.reply) {
    if (f.reply === 'none' && (r || row.kind === 'unmatched')) return false;
    if ((f.reply === 'yes' || f.reply === 'no') && row.dup) return false;
    if (f.reply === 'yes' && p?.attending !== true) return false;
    if (f.reply === 'no' && p?.attending !== false) return false;
    if (f.reply === 'unmatched' && row.kind !== 'unmatched') return false;
    if (f.reply === 'dupreply' && !row.dup) return false;
  }
  if (f.join === 'dup' && !(g && S.dupOf.has(g.id))) return false;
  if (f.join === 'line' && g?.line_joined) return false;
  if (f.join === 'wechat' && g?.wechat_joined) return false;
  if (f.join && !g) return false;   // 回答だけの行は加入・自動登録の絞り込み対象外
  if (f.match) {
    if (f.match === 'unmatched' && row.kind !== 'unmatched') return false;
    if (f.match === 'auto' && r?.match_type !== 'auto') return false;
    if (f.match === 'manual' && r?.match_type !== 'manual') return false;
  }
  return true;
}
function renderGuests() {
  const f = {
    q: $('#g-q').value.trim(), side: S.sideTab, circle: $('#g-circle').value,
    reply: $('#g-reply').value, match: $('#g-match').value, join: $('#g-join').value,
  };
  S.sort = $('#g-sort').value;
  const showComp = $('#g-comp').checked;
  const all = buildRows();
  renderSideTabs(all, f, showComp);
  const keep = new Set();
  const out = [];
  for (const row of all) {
    if (row.kind === 'companion') { if (showComp && keep.has(row.reply.id)) out.push(row); continue; }
    if (!passFilter(row, f)) continue;
    if (row.reply) keep.add(row.reply.id);
    out.push(row);
  }
  /* A5: 1ページ150行。同行者・重複回答の行も1行として数える */
  const pages = Math.max(1, Math.ceil(out.length / PAGE_SIZE));
  if (S.page > pages) S.page = pages;
  const from = (S.page - 1) * PAGE_SIZE;
  const view = out.slice(from, from + PAGE_SIZE);
  S.allRows = out;
  S.rows = view;                       // 全選択・CSVはページ内が対象
  $('#g-body').innerHTML = view.map(rowHTML).join('') ||
    '<tr><td colspan="9" class="empty">該当する行がありません。</td></tr>';
  renderPager(out.length, pages, from, view.length);
  const n = out.filter(r => r.kind !== 'companion' && !r.dup).length;
  const gl = S.guests.filter(x => !x.deleted_at);
  const auto = gl.filter(x => x.auto_created).length;
  $('#g-count').textContent = `${n} 名（同行者を除く） / 招待リスト ${gl.length - auto} 名` +
    (auto ? ` ＋ 自動登録 ${auto} 名` : '');
  $('#g-body').closest('table').style.tableLayout = 'fixed';
  applyColWidths();
  wireGuestRows();
  $('#chkall').checked = false;
  S.sel.clear(); updateBulk();
}
function renderPager(total, pages, from, shown) {
  const html = pages <= 1 && total <= PAGE_SIZE
    ? `<span class="pinfo">${total} 行</span>`
    : `<button class="btn s o" data-pg="prev"${S.page <= 1 ? ' disabled' : ''}>← 前へ</button>
       <span class="pnums">${pageNums(pages).map(x => x === '…'
         ? '<span class="gap">…</span>'
         : `<button class="pn${x === S.page ? ' on' : ''}" data-pg="${x}">${x}</button>`).join('')}</span>
       <button class="btn s o" data-pg="next"${S.page >= pages ? ' disabled' : ''}>次へ →</button>
       <span class="pinfo">${total} 行中 ${total ? from + 1 : 0}–${from + shown} 行（${S.page} / ${pages} ページ）</span>`;
  for (const id of ['#g-pager-top', '#g-pager-bot']) {
    const el = $(id); el.innerHTML = html;
    $$('[data-pg]', el).forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.pg;
      S.page = v === 'prev' ? S.page - 1 : v === 'next' ? S.page + 1 : +v;
      renderGuests();
      $('#g-pager-top').scrollIntoView({ block: 'start' });
    }));
  }
}
/* ---- A3: Side タブ。件数は他の絞り込みを適用したうえで数える ---- */
const SIDE_TABS = [['', 'すべて'], ['groom', '新郎友人'], ['bride', '新婦友人'], ['none', '未設定']];
function renderSideTabs(all, f, showComp) {
  const count = v => all.filter(row => row.kind !== 'companion' && !row.dup
    && passFilter(row, { ...f, side: v })).length;
  $('#g-stabs').innerHTML = SIDE_TABS.map(([v, label]) =>
    `<button data-side="${v}" class="${S.sideTab === v ? 'on' : ''}">${label}<b>${count(v)}</b></button>`).join('');
  $$('#g-stabs button').forEach(b => b.addEventListener('click', () => {
    S.sideTab = b.dataset.side; S.page = 1; renderGuests();
  }));
}

/* ---- A9: 列幅のドラッグ調整（localStorage に保存） ---- */
const COLW_KEY = 'wa-gtbl-colw';
function loadColWidths() {
  try { S.colw = JSON.parse(localStorage.getItem(COLW_KEY) || '{}') || {}; }
  catch { S.colw = {}; }
}
function applyColWidths() {
  for (const [cls, px] of Object.entries(S.colw)) {
    const col = $(`#g-table col.${cls}`);
    if (col) col.style.width = px + 'px';
  }
}
function wireColResize() {
  const tbl = $('#g-table');
  $$('#g-table thead .rsz').forEach(h => h.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const th = h.parentElement, cls = th.dataset.col;
    const col = $(`#g-table col.${cls}`); if (!col) return;
    /* 最初のドラッグで全列を実測値のpxに固定し、動かした列だけが変わるようにする */
    $$('#g-table thead th').forEach((x, i) => {
      const c = $$('#g-table colgroup col')[i];
      if (c && !c.style.width.endsWith('px')) c.style.width = x.offsetWidth + 'px';
    });
    const x0 = e.clientX, w0 = th.offsetWidth;
    tbl.classList.add('resizing');
    const move = ev => { col.style.width = Math.max(40, w0 + ev.clientX - x0) + 'px'; };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      tbl.classList.remove('resizing');
      $$('#g-table colgroup col').forEach(c => {
        const k = [...c.classList].find(x => x.startsWith('c-'));
        if (k && c.style.width.endsWith('px')) S.colw[k] = parseInt(c.style.width, 10);
      });
      try { localStorage.setItem(COLW_KEY, JSON.stringify(S.colw)); } catch {}
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }));
}
$('#g-colreset').addEventListener('click', () => {
  S.colw = {};
  try { localStorage.removeItem(COLW_KEY); } catch {}
  $$('#g-table colgroup col').forEach(c => { c.style.width = ''; });
  toast('列幅を初期値に戻しました', 'ok');
});

/* 1 … 4 5 [6] 7 8 … 20 の形に間引く */
function pageNums(pages) {
  const out = [], near = n => Math.abs(n - S.page) <= 2;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || near(i)) out.push(i);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}
/* アレルギー・食事制限：同じ大きさ・同じ色。接頭辞だけ薄く。空の行は出さない */
function dietCell(p) {
  if (!p) return '';
  const line = (k, v) => v && String(v).trim()
    ? `<div class="diet ell" title="${esc(k + '：' + v)}"><span class="dk">${k}：</span>${esc(v)}</div>` : '';
  const out = line('アレルギー', p.allergy) + line('食事制限', p.dietary);
  return out || '<span class="dk">—</span>';
}
function cellTxt(v) {
  const t = String(v ?? '').trim();
  return t ? `<span class="ell" title="${esc(t)}">${esc(t)}</span>` : '';
}
const attTag = x => x === true ? '<span class="tag ok">出席</span>'
  : x === false ? '<span class="tag no">欠席</span>' : '';
/* A2: 行の左端 4px の色帯で Side を表す */
function sideBand(side) {
  const k = side === 'groom' ? 'g' : side === 'bride' ? 'b' : 'n';
  return `<span class="sband ${k}" title="${esc(sideLabel(side))}"></span>`;
}
/* A4 3段目：友人圏タグ。無ければ段ごと省略 */
function circleLine(g) {
  const cs = g ? (S.circlesOfGuest.get(g.id) || []) : [];
  return cs.length ? `<small class="circles">${cs.map(c =>
    `<span class="tag circle">${esc(c.name)}</span>`).join('')}</small>` : '';
}
function contactCell(g, r) {
  const two = (a, b) => (a && b && norm(a) !== norm(b))
    ? `<span class="ell" title="${esc(a)}">${esc(a)}</span><small class="ell" title="回答: ${esc(b)}">回答: ${esc(b)}</small>`
    : `<span class="ell" title="${esc(a || b)}">${esc(a || b || '')}</span>`;
  return two(g?.email || '', r?.email || '') +
    `<small>${two(g?.messenger_id || '', r?.messenger || '')}</small>`;
}
function linkCell(row, g, r) {
  if (row.kind === 'unmatched')
    return `<span class="tag wait">未紐付</span><small><button class="btn link" data-act="match" data-id="${r.id}">紐付ける</button></small>`;
  if (!r) return '';
  const t = r.match_type;
  const rematch = t === 'unlisted' && g?.auto_created;
  return (t === 'auto' ? '<span class="tag ok">自動</span>'
    : t === 'manual' ? '<span class="tag grey">手動</span>'
    : t === 'unlisted' ? '<span class="tag wait">招待リスト外</span>' : '') +
    (rematch ? `<small><button class="btn link" data-act="match" data-id="${r.id}">紐付け直す</button></small>` : '') +
    `<small><button class="btn link" data-act="unmatch" data-id="${r.id}">解除</button></small>`;
}
function memoCell(g, r) {
  const photos = Array.isArray(r?.photos) ? r.photos.length : 0;
  const memo = [g?.note, r?.admin_note, r?.message].filter(Boolean).join(' / ');
  return (memo ? `<span class="ell" title="${esc(memo)}">${esc(memo)}</span>` : '') +
    (photos ? `<small><button class="btn link" data-act="photos" data-id="${r.id}">📷 ${photos}枚</button></small>` : '');
}
function rowHTML(row) {
  const key = rowKey(row);
  const g = row.guest, r = row.reply, p = row.person;
  const del = (row.kind === 'guest' ? g.deleted_at
    : row.kind === 'companion' ? p?.deleted_at : r?.deleted_at);
  const cls = [row.kind === 'companion' ? 'comp' : '', row.kind === 'unmatched' ? 'unm' : '',
    row.kind === 'reply' ? 'sub' : '', row.dup ? 'dupr' : '', del ? 'del' : ''].filter(Boolean).join(' ');

  if (row.kind === 'companion') {
    return `<tr class="${cls}"><td class="ck">${sideBand(rowSide(row))}<input type="checkbox" class="chk" data-k="${key}"></td>
      <td class="n"><b>${cellTxt(fullName(p))}</b><small>${cellTxt(latinName(p).toUpperCase())}</small></td>
      <td class="ctr">${attTag(p?.attending)}<small>${esc(kindOf(p))}</small></td>
      <td></td><td>${dietCell(p)}</td><td></td><td></td><td></td>
      <td class="act"><button class="btn s o ic" data-act="edit" data-id="${r.id}" title="編集">✎</button></td></tr>`;
  }

  // A2: 回答が紐付いていれば reply_people の氏名を主表示。招待リストの表記は下に小さく併記
  const isReply = row.kind === 'reply' || row.kind === 'unmatched';
  const primary = fullName(p) || fullName(g);
  const primaryLatin = (latinName(p) || latinName(g)).toUpperCase();
  const sub2 = [];
  if (primaryLatin) sub2.push(esc(primaryLatin));
  if (isReply) sub2.push(`${esc(r.lang || '')} ／ ${fmtDT(r.received_at)} 受信`);
  if (nameDiffers(p, g)) sub2.push(listNameNote(p, g));
  const proxyTag = r?.source === 'admin'
    ? `<span class="tag proxy" title="管理画面から代理で登録した回答">代理入力</span>` : '';
  const dupBadge = row.dup
    ? `<span class="tag dupr" title="より新しい回答があります">重複（新しい回答あり・${esc(r.duplicate_reason || '判定なし')}）</span>` : '';
  const acts = [`<button class="btn s o ic" data-act="edit" data-id="${(g || r).id}" data-kind="${g ? 'guest' : 'reply'}" title="編集">✎</button>`];
  if (g && S.dupOf.has(g.id))
    acts.unshift(`<button class="btn s o ic" data-act="merge" data-id="${g.id}" title="重複を統合">⇔</button>`);
  if (row.dup) acts.push(`<button class="btn s o ic" data-act="activate" data-id="${r.id}" title="こちらを有効にする">↺</button>`);

  return `<tr class="${cls}"><td class="ck">${sideBand(rowSide(row))}<input type="checkbox" class="chk" data-k="${key}"></td>
    <td class="n"><b>${esc(primary)}${nameIcons(g, r)}${row.kind === 'guest' ? dupTag(g) : ''}${proxyTag}${dupBadge}</b>
      ${sub2.map(x => `<small>${x}</small>`).join('')}${circleLine(g)}</td>
    <td class="ctr">${p ? attTag(p.attending) : '<span class="tag grey">未回答</span>'}<small>${esc(p ? kindOf(p) : '')}</small></td>
    <td>${contactCell(g, r)}</td>
    <td>${dietCell(p)}</td>
    <td>${linkCell(row, g, r)}</td>
    <td class="join">${joinCell(g)}</td>
    <td>${memoCell(g, r)}</td>
    <td class="act">${acts.join('')}</td></tr>`;
}
const rowSide = row => row.guest?.side ?? row.reply?.side ?? null;
function rowKey(row) {
  if (row.kind === 'guest') return 'g:' + row.guest.id;
  if (row.kind === 'companion') return 'p:' + row.person.id;
  return 'r:' + row.reply.id;
}
/* 省略表示（…）のセルはタップ／クリックで全文を開閉する */
$('#g-body').addEventListener('click', e => {
  const el = e.target.closest('.ell');
  if (!el || e.target.closest('button, a, input, label')) return;
  el.classList.toggle('open');
});
function wireGuestRows() {
  $$('#g-body .chk').forEach(c => c.addEventListener('change', () => {
    c.checked ? S.sel.add(c.dataset.k) : S.sel.delete(c.dataset.k);
    c.closest('tr').classList.toggle('sel', c.checked);
    updateBulk();
  }));
  $$('#g-body [data-act]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.id;
    const fn = { 'edit': () => openEditModal(id, b.dataset.kind),
       'match': () => openMatchModal(id), 'unmatch': () => openUnmatch(id),
       'photos': () => openPhotoModalByReply(id), 'merge': () => openMergeModal(id),
       'activate': () => openActivateModal(id) }[b.dataset.act];
    if (fn) fn();
  }));
}
$('#chkall').addEventListener('change', e => {
  $$('#g-body .chk').forEach(c => { c.checked = e.target.checked; c.dispatchEvent(new Event('change')); });
});
$('#bulkclear').addEventListener('click', () => {
  S.sel.clear(); $('#chkall').checked = false;
  $$('#g-body .chk').forEach(c => { c.checked = false; c.closest('tr').classList.remove('sel'); });
  updateBulk();
});
function updateBulk() {
  $('#bulkn').textContent = S.sel.size;
  $('#bulk').classList.toggle('on', S.sel.size > 0);
}
async function bulkJoin(field, label) {
  const ids = [...S.sel].filter(k => k.startsWith('g:')).map(k => k.slice(2));
  if (!ids.length) { toast('招待者を選んでください', 'err'); return; }
  const { error } = await sb.from('guests').update({ [field]: true, updated_at: new Date().toISOString() }).in('id', ids);
  if (error) { toast('失敗：' + error.message, 'err'); return; }
  toast(`${ids.length} 名を${label}にしました`, 'ok');
  await loadAll();
}
$('#bulk-line').addEventListener('click', () => bulkJoin('line_joined', 'LINE登録済'));
$('#bulk-wechat').addEventListener('click', () => bulkJoin('wechat_joined', 'WeChat加入済'));
$('#bulk-del').addEventListener('click', () => openDeleteModal([...S.sel], 'delete'));
$('#bulk-restore').addEventListener('click', () => openDeleteModal([...S.sel], 'restore'));

/* ============================== 削除・復元 ============================== */
function openDeleteModal(keys, mode) {
  if (!keys.length) return;
  const isDel = mode === 'delete';
  const onlyDupReplies = keys.length > 0 && keys.every(k =>
    k.startsWith('r:') && replyDup(S.byReply.get(k.slice(2))));
  const preset = isDel && onlyDupReplies ? '重複回答（新しい回答を有効）' : '';
  const box = $('#m-del-box');
  box.innerHTML = `
    <h3>選択した <span>${keys.length}</span> 件を${isDel ? '削除' : '復元'}</h3>
    <p class="note">${isDel
      ? '一覧から非表示になります（「削除済みのみ」で確認・復元可能）。原本は保持されます。'
      : '一覧に戻します。'}</p>
    <div class="f req"><label>${isDel ? '削除' : '復元'}理由</label>
      <textarea id="del-reason" rows="2" placeholder="${isDel
        ? '例：本人テスト送信のため削除／二重送信のため 9/8 09:12 の回答を有効とする'
        : '例：誤って削除したため復元'}">${preset}</textarea></div>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn ${isDel ? 'enji' : ''}" id="del-go">${isDel ? '削除する' : '復元する'}</button></div>`;
  wireClose(box);
  $('#del-go').addEventListener('click', async () => {
    const reason = $('#del-reason').value.trim();
    if (!reason) { toast('理由は必須です', 'err'); return; }
    await applyDelete(keys, mode, reason);
    closeModal('m-del');
  });
  openModal('m-del');
}
async function applyDelete(keys, mode, reason) {
  const isDel = mode === 'delete';
  const patch = isDel ? { deleted_at: new Date().toISOString(), delete_reason: reason }
                      : { deleted_at: null, delete_reason: null };
  const action = isDel ? 'delete' : 'restore';
  let n = 0;
  for (const k of keys) {
    const [t, id] = k.split(':');
    try {
      if (t === 'g') {
        const { error } = await sb.from('guests').update(patch).eq('id', id); if (error) throw error;
        await logChange('guests', id, action, reason, null); n++;
      } else if (t === 'r') {
        const { error } = await sb.from('replies_admin').update(patch).eq('id', id); if (error) throw error;
        const { error: e2 } = await sb.from('reply_people').update(patch).eq('reply_id', id); if (e2) throw e2;
        await logChange('replies_admin', id, action, reason, null); n++;
      } else if (t === 'p') {
        const { error } = await sb.from('reply_people').update(patch).eq('id', id); if (error) throw error;
        await logChange('reply_people', id, action, reason, null); n++;
      }
    } catch (e) { toast('失敗：' + e.message, 'err'); }
  }
  toast(`${n} 件を${isDel ? '削除' : '復元'}しました`, 'ok');
  await loadAll();
}

/* ============================== 編集モーダル（招待者／回答タブ） ============================== */
$('#g-add').addEventListener('click', () => openEditModal(null, 'guest'));

function guestTabHTML(g) {
  const mine = new Set((g ? (S.circlesOfGuest.get(g.id) || []) : []).map(c => c.id));
  return `
    <div class="two">
      <div class="f"><label>姓</label><input id="gf-fn" value="${esc(g?.family_name || '')}"></div>
      <div class="f"><label>名</label><input id="gf-gn" value="${esc(g?.given_name || '')}"></div></div>
    <div class="two">
      <div class="f"><label>姓（ローマ字）</label><input id="gf-fl" value="${esc(g?.family_name_latin || '')}"></div>
      <div class="f"><label>名（ローマ字）</label><input id="gf-gl" value="${esc(g?.given_name_latin || '')}"></div></div>
    <div class="f"><label>新郎友人／新婦友人</label><select id="gf-side">
      <option value="">未設定</option>
      <option value="groom"${g?.side === 'groom' ? ' selected' : ''}>新郎友人</option>
      <option value="bride"${g?.side === 'bride' ? ' selected' : ''}>新婦友人</option></select></div>
    <div class="f"><label>肩書き</label>${titleSelectHTML('gf-title', g?.title || '', titleNames(), true)}</div>
    <div class="f"><label>連絡ツール</label><select id="gf-tool">
      <option value="">未設定</option>
      ${TOOLS.map(([v, l]) => `<option value="${v}"${g?.contact_tool === v ? ' selected' : ''}>${l}</option>`).join('')}
    </select></div>
    <div class="f chks">
      <label class="chk1"><input type="checkbox" id="gf-line"${g?.line_joined ? ' checked' : ''}><span>公式LINE 登録済</span></label>
      <label class="chk1"><input type="checkbox" id="gf-wc"${g?.wechat_joined ? ' checked' : ''}><span>WeChatグループ 加入済</span></label>
    </div>
    <div class="two">
      <div class="f"><label>メールアドレス</label><input id="gf-mail" value="${esc(g?.email || '')}"></div>
      <div class="f"><label>LINE / WeChat ID</label><input id="gf-mid" value="${esc(g?.messenger_id || '')}"></div></div>
    <div class="f"><label>友人圏タグ（複数可）</label>
      <div class="tagbox">
        <div class="chips" id="gf-chips">${S.circles.map(c =>
          `<label class="tag circle"><input type="checkbox" value="${esc(c.id)}"${mine.has(c.id) ? ' checked' : ''}>${esc(c.name)}</label>`).join('')}</div>
        <div class="tagnew"><input id="gf-newtag" placeholder="新しいタグ名を入力">
          <button type="button" class="btn s o" id="gf-addtag">＋ 作成</button></div>
      </div></div>
    <div class="two">
      <div class="f"><label>お車代（円）</label>
        <input id="gf-fee" type="number" min="0" step="1" inputmode="numeric" value="${g?.transport_fee ?? ''}"></div>
      <div class="f"><label>お車代備考</label><input id="gf-feenote" value="${esc(g?.transport_note || '')}"></div></div>
    <div class="f"><label>個別ギフト</label>
      <input id="gf-gift" list="gf-giftlist" value="${esc(g?.gift_note || '')}" placeholder="品目名（自由入力可）">
      <datalist id="gf-giftlist">${extNames().map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
    <div class="f"><label>メモ</label><textarea id="gf-note" rows="2">${esc(g?.note || '')}</textarea></div>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button><button class="btn" id="gf-save">保存</button></div>`;
}
function replyTabHTML(r) {
  const me = person0(r.id);
  const comps = companionsShown(r.id);
  return `
    <p class="note">管理用DBのみ更新。招待状DBの原本は変更されません。</p>
    <div class="two">
      <div class="f"><label>姓（回答者）</label><input id="rf-fn" value="${esc(me?.family_name ?? '')}"></div>
      <div class="f"><label>名（回答者）</label><input id="rf-gn" value="${esc(me?.given_name ?? '')}"></div></div>
    <div class="two">
      <div class="f"><label>姓（ローマ字）</label><input id="rf-fl" value="${esc(me?.family_name_latin ?? '')}"></div>
      <div class="f"><label>名（ローマ字）</label><input id="rf-gl" value="${esc(me?.given_name_latin ?? '')}"></div></div>
    <div class="two">
      <div class="f"><label>出欠</label><select id="rf-att">
        <option value="true"${me?.attending === true ? ' selected' : ''}>出席</option>
        <option value="false"${me?.attending === false ? ' selected' : ''}>欠席</option></select></div>
      <div class="f"><label>新郎友人／新婦友人</label><select id="rf-side">
        <option value="">未設定</option>
        <option value="groom"${r.side === 'groom' ? ' selected' : ''}>新郎友人</option>
        <option value="bride"${r.side === 'bride' ? ' selected' : ''}>新婦友人</option></select></div></div>
    <div class="two">
      <div class="f"><label>メールアドレス</label><input id="rf-mail" value="${esc(r.email || '')}"></div>
      <div class="f"><label>LINE / WeChat ID</label><input id="rf-mid" value="${esc(r.messenger || '')}"></div></div>
    <div class="two">
      <div class="f"><label>国</label><input id="rf-country" value="${esc(r.country || '')}"></div>
      <div class="f"><label>都道府県・省</label><input id="rf-region" value="${esc(r.region || '')}"></div></div>
    <div class="two">
      <div class="f"><label>アレルギー（本人）</label><input id="rf-al" value="${esc(me?.allergy || '')}"></div>
      <div class="f"><label>食事制限（本人）</label><input id="rf-di" value="${esc(me?.dietary || '')}"></div></div>
    <div class="f"><label>配慮事項</label><input id="rf-needs" value="${esc(r.needs || '')}"></div>
    <div class="f"><label>メッセージ</label><textarea id="rf-msg" rows="2">${esc(r.message || '')}</textarea></div>
    <div class="f"><label>管理メモ</label><textarea id="rf-note" rows="2">${esc(r.admin_note || '')}</textarea></div>
    ${comps.length ? `<div class="f"><label>同行者</label>${comps.map(c => `
      <div class="compbox${c.deleted_at ? ' del' : ''}" data-pid="${c.id}">
        <div class="row" style="margin:0 0 6px">
          ${c.deleted_at ? `<span class="tag no">削除済み</span><span class="note">${esc(c.delete_reason || '')}</span>` : ''}
          <span class="sp"></span>
          <button type="button" class="btn link cf-del" data-pid="${c.id}" data-del="${c.deleted_at ? 'restore' : 'delete'}"
            >${c.deleted_at ? 'この同行者を復元' : 'この同行者を削除'}</button></div>
        <div class="two">
          <div class="f"><label>姓</label><input class="cf-fn" value="${esc(c.family_name || '')}"></div>
          <div class="f"><label>名</label><input class="cf-gn" value="${esc(c.given_name || '')}"></div></div>
        <div class="two">
          <div class="f"><label>姓（ローマ字）</label><input class="cf-fl" value="${esc(c.family_name_latin || '')}"></div>
          <div class="f"><label>名（ローマ字）</label><input class="cf-gl" value="${esc(c.given_name_latin || '')}"></div></div>
        <div class="two">
          <div class="f"><label>出欠</label><select class="cf-att">
            <option value="true"${c.attending === true ? ' selected' : ''}>出席</option>
            <option value="false"${c.attending === false ? ' selected' : ''}>欠席</option></select></div>
          <div class="f"><label>区分</label><select class="cf-child">
            <option value="false"${!c.is_child ? ' selected' : ''}>大人</option>
            <option value="true"${c.is_child ? ' selected' : ''}>子ども</option></select></div></div>
        <div class="two">
          <div class="f"><label>生年月日</label><input type="date" class="cf-bd" value="${esc(c.birthdate || '')}"></div>
          <div class="f"><label>年齢（9/26時点）</label><input class="cf-age" inputmode="numeric" value="${c.age ?? ''}"></div></div>
        <div class="two">
          <div class="f"><label>肩書き</label><select class="cf-title">
            <option value="">なし</option>
            ${COMP_TITLES.concat(c.title && !COMP_TITLES.includes(c.title) ? [c.title] : []).map(t =>
              `<option value="${esc(t)}"${c.title === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}
          </select></div>
          <div class="f kidonly"><label>お子様メニュー</label><select class="cf-meal">
            <option value="">年齢から自動（${esc(mealByAge(c))}）</option>
            ${['A', 'B', 'C'].map(m =>
              `<option value="${m}"${c.kid_meal === m ? ' selected' : ''}>${m}</option>`).join('')}
          </select></div></div>
        <label class="chk1 kidonly"><input type="checkbox" class="cf-chair"${c.kids_chair ? ' checked' : ''}>
          <span>お子様椅子が必要</span></label>
        <div class="two">
          <div class="f"><label>アレルギー</label><input class="cf-al" value="${esc(c.allergy || '')}"></div>
          <div class="f"><label>食事制限</label><input class="cf-di" value="${esc(c.dietary || '')}"></div></div>
      </div>`).join('')}</div>` : ''}
    <div class="f req"><label>変更理由</label><textarea id="rf-reason" rows="2"
      placeholder="例：9/9 本人よりLINEで訂正（同行者の年齢 3→4歳）"></textarea></div>
    <details><summary class="note">元の送信内容と変更履歴</summary><pre class="note" id="rf-hist">読み込み中…</pre></details>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button><button class="btn" id="rf-save">保存</button></div>`;
}
function openEditModal(id, kind) {
  let g = null, r = null;
  if (kind === 'guest') { g = id ? S.byGuest.get(id) : null; r = g ? (S.replyOfGuest.get(g.id) || null) : null; }
  else { r = S.byReply.get(id) || null; g = r?.matched_guest_id ? S.byGuest.get(r.matched_guest_id) : null; }
  const box = $('#m-guest-box');
  const canG = !!g || kind === 'guest';
  const canNew = !r && !!g;            // B1: 回答が無い招待者は代理入力できる
  const canR = !!r || canNew;
  box.innerHTML = `
    <h3>${g ? esc(fullName(person0(S.replyOfGuest.get(g.id)?.id) ) || fullName(g))
           : r ? esc(fullName(person0(r.id))) : '招待者を追加'}</h3>
    <div class="tabs2">
      <button data-tab="g"${canG ? '' : ' disabled'} class="${canG ? 'on' : ''}">招待者情報</button>
      <button data-tab="r"${canR ? '' : ' disabled'} class="${!canG && canR ? 'on' : ''}">回答情報</button>
    </div>
    <div id="tab-g" class="tabpane${canG ? ' on' : ''}">${canG ? guestTabHTML(g) : ''}</div>
    <div id="tab-r" class="tabpane${!canG && canR ? ' on' : ''}">${
      r ? replyTabHTML(r) : canNew ? newReplyTabHTML(g) : ''}</div>`;
  wireClose(box);
  $$('.tabs2 button', box).forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    $$('.tabs2 button', box).forEach(x => x.classList.toggle('on', x === b));
    $('#tab-g').classList.toggle('on', b.dataset.tab === 'g');
    $('#tab-r').classList.toggle('on', b.dataset.tab === 'r');
  }));
  if (canG) { wireTagCreate($('#gf-newtag'), $('#gf-addtag'), $('#gf-chips'));
              wireTitleNew($('#gf-title')); wireGuestSave(g); }
  if (r) { historyHTML(r).then(t => { const el = $('#rf-hist'); if (el) el.textContent = t; });
           wireKidOnly(box); wireReplySave(r); }
  else if (canNew) wireNewReply(g);
  openModal('m-guest');
}
function wireGuestSave(g) {
  $('#gf-save').addEventListener('click', async () => {
    const rec = {
      family_name: $('#gf-fn').value.trim(), given_name: $('#gf-gn').value.trim(),
      family_name_latin: $('#gf-fl').value.trim() || null, given_name_latin: $('#gf-gl').value.trim() || null,
      side: $('#gf-side').value || null, contact_tool: $('#gf-tool').value || null,
      title: (v => v && v !== TITLE_NEW ? v : null)($('#gf-title').value),
      messenger_id: $('#gf-mid').value.trim() || null, email: $('#gf-mail').value.trim() || null,
      note: $('#gf-note').value.trim() || null,
      transport_fee: $('#gf-fee').value.trim() === '' ? 0 : Math.round(Number($('#gf-fee').value)),
      transport_note: $('#gf-feenote').value.trim() || null,
      gift_note: $('#gf-gift').value.trim() || null,
      line_joined: $('#gf-line').checked, wechat_joined: $('#gf-wc').checked,
      updated_at: new Date().toISOString(),
    };
    if (!rec.family_name || !rec.given_name) { toast('姓と名は必須です', 'err'); return; }
    let gid = g?.id;
    if (g) {
      const { error } = await sb.from('guests').update(rec).eq('id', g.id);
      if (error) { toast('保存に失敗：' + error.message, 'err'); return; }
    } else {
      const { data, error } = await sb.from('guests').insert(rec).select('id').single();
      if (error) { toast('保存に失敗：' + error.message, 'err'); return; }
      gid = data.id;
    }
    const want = $$('#gf-chips input:checked').map(i => i.value);
    await sb.from('guest_circles').delete().eq('guest_id', gid);
    if (want.length) await sb.from('guest_circles').insert(want.map(cid => ({ guest_id: gid, circle_id: cid })));
    toast('保存しました', 'ok');
    closeModal('m-guest'); await loadAll();
  });
}
/* ---- B: 管理画面からの代理入力 ---- */
const PROXY_REASON = '管理者による代理入力（LINEで受領 等）';
function compFormHTML(i) {
  return `<div class="compbox newcomp" data-i="${i}">
    <div class="row" style="margin:0 0 6px"><b>同行者 ${i + 1}</b><span class="sp"></span>
      <button class="btn link nc-del" type="button">削除</button></div>
    <div class="two">
      <div class="f"><label>姓</label><input class="cf-fn"></div>
      <div class="f"><label>名</label><input class="cf-gn"></div></div>
    <div class="two">
      <div class="f"><label>姓（ローマ字）</label><input class="cf-fl"></div>
      <div class="f"><label>名（ローマ字）</label><input class="cf-gl"></div></div>
    <div class="two">
      <div class="f"><label>区分</label><select class="cf-child">
        <option value="false">大人</option><option value="true">お子様</option></select></div>
      <div class="f"><label>生年月日</label><input type="date" class="cf-bd"></div></div>
    <div class="two">
      <div class="f"><label>年齢（9/26時点）</label><input class="cf-age" inputmode="numeric"></div>
      <div class="f"><label>出欠</label><select class="cf-att">
        <option value="true">出席</option><option value="false">欠席</option></select></div></div>
    <div class="two">
      <div class="f"><label>肩書き</label><select class="cf-title">
        <option value="">なし</option>
        ${COMP_TITLES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></div>
      <div class="f kidonly off"><label>お子様メニュー</label><select class="cf-meal">
        <option value="">年齢から自動</option>
        <option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div></div>
    <label class="chk1 kidonly off"><input type="checkbox" class="cf-chair"><span>お子様椅子が必要</span></label>
    <div class="two">
      <div class="f"><label>アレルギー</label><input class="cf-al"></div>
      <div class="f"><label>食事制限</label><input class="cf-di"></div></div>
  </div>`;
}
function newReplyTabHTML(g) {
  return `
    <p class="note">この招待者にはまだ回答がありません。LINE や口頭で受け取った内容を、招待状フォームと同じ項目で登録できます。
      招待状DBの原本（rsvp）には書き込みません。</p>
    <div id="nr-start"><button class="btn" id="nr-go" type="button">回答を登録する</button></div>
    <div id="nr-form" class="off">
      <div class="two">
        <div class="f"><label>出欠</label><select id="nr-att">
          <option value="true">出席</option><option value="false">欠席</option></select></div>
        <div class="f"><label>新郎友人／新婦友人</label><select id="nr-side">
          <option value="">未設定</option>
          <option value="groom"${g.side === 'groom' ? ' selected' : ''}>新郎友人</option>
          <option value="bride"${g.side === 'bride' ? ' selected' : ''}>新婦友人</option></select></div></div>
      <div class="two">
        <div class="f"><label>メールアドレス</label><input id="nr-mail" value="${esc(g.email || '')}"></div>
        <div class="f"><label>LINE / WeChat ID</label><input id="nr-mid" value="${esc(g.messenger_id || '')}"></div></div>
      <div class="two">
        <div class="f"><label>国</label><input id="nr-country" value="日本"></div>
        <div class="f"><label>都道府県・省</label><input id="nr-region"></div></div>
      <div class="two">
        <div class="f"><label>アレルギー（本人）</label><input id="nr-al"></div>
        <div class="f"><label>食事制限（本人）</label><input id="nr-di"></div></div>
      <div class="f"><label>同行者</label><div id="nr-comps"></div>
        <button class="btn s o" id="nr-addcomp" type="button">＋ 同行者を追加</button></div>
      <div class="f"><label>配慮事項</label><input id="nr-needs"></div>
      <div class="f"><label>メッセージ</label><textarea id="nr-msg" rows="2"></textarea></div>
      <div class="f req"><label>登録理由</label>
        <textarea id="nr-reason" rows="2">${esc(PROXY_REASON)}</textarea></div>
      <div class="row" style="margin:0"><span class="sp"></span>
        <button class="btn o" data-close type="button">キャンセル</button>
        <button class="btn" id="nr-save" type="button">回答を登録</button></div>
    </div>`;
}
function wireNewReply(g) {
  $('#nr-go').addEventListener('click', () => {
    $('#nr-start').classList.add('off');
    $('#nr-form').classList.remove('off');
  });
  let n = 0;
  const addComp = () => {
    $('#nr-comps').insertAdjacentHTML('beforeend', compFormHTML(n++));
    const box = $('#nr-comps').lastElementChild;
    $('.nc-del', box).addEventListener('click', () => box.remove());
    wireKidOnly(box.parentElement);
  };
  $('#nr-addcomp').addEventListener('click', addComp);

  $('#nr-save').addEventListener('click', async () => {
    const reason = $('#nr-reason').value.trim();
    if (!reason) { toast('登録理由は必須です', 'err'); return; }
    const btn = $('#nr-save'); btn.disabled = true; btn.textContent = '登録中…';
    const attending = $('#nr-att').value === 'true';
    const rid = crypto.randomUUID();
    const now = new Date().toISOString();
    const rec = {
      id: rid, received_at: now, lang: 'ja', source: 'admin',
      attending, side: $('#nr-side').value || null,
      family_name: g.family_name, given_name: g.given_name,
      family_name_latin: g.family_name_latin, given_name_latin: g.given_name_latin,
      email: $('#nr-mail').value.trim() || null,
      messenger: $('#nr-mid').value.trim() || null,
      country: $('#nr-country').value.trim() || null,
      region: $('#nr-region').value.trim() || null,
      message: $('#nr-msg').value.trim() || null,
      needs: $('#nr-needs').value.trim() || null,
      photos: [],
      original: { source: 'admin', entered_by: S.me?.email ?? null },
      matched_guest_id: g.id, match_type: 'manual',
    };
    const people = [{
      reply_id: rid, idx: 0, is_companion: false,
      family_name: g.family_name, given_name: g.given_name,
      family_name_latin: g.family_name_latin, given_name_latin: g.given_name_latin,
      attending, is_child: false, birthdate: null, age: null,
      allergy: $('#nr-al').value.trim() || null, dietary: $('#nr-di').value.trim() || null,
    }];
    $$('#nr-comps .newcomp').forEach((box, i) => {
      const v = sel => $(sel, box)?.value?.trim() ?? '';
      people.push({
        reply_id: rid, idx: i + 1, is_companion: true,
        family_name: v('.cf-fn') || null, given_name: v('.cf-gn') || null,
        family_name_latin: v('.cf-fl').toUpperCase() || null,
        given_name_latin: v('.cf-gl').toUpperCase() || null,
        attending: $('.cf-att', box).value === 'true',
        is_child: $('.cf-child', box).value === 'true',
        birthdate: v('.cf-bd') || null,
        age: v('.cf-age') === '' ? null : Number(v('.cf-age')),
        allergy: v('.cf-al') || null, dietary: v('.cf-di') || null,
        title: v('.cf-title') || null,
        kids_chair: $('.cf-child', box).value === 'true' && !!$('.cf-chair', box)?.checked,
        kid_meal: $('.cf-child', box).value === 'true' ? (v('.cf-meal') || null) : null,
      });
    });
    try {
      const { error } = await sb.from('replies_admin').insert(rec); if (error) throw error;
      const { error: e2 } = await sb.from('reply_people').insert(people); if (e2) throw e2;
      await logChange('replies_admin', rid, 'edit', reason, {
        before: null,
        after: { source: 'admin', attending, matched_guest_id: g.id, match_type: 'manual',
                 people: people.length, entered_by: S.me?.email ?? null },
      });
      toast('回答を登録しました', 'ok');
      closeModal('m-guest'); await loadAll();
    } catch (e) {
      toast('登録に失敗：' + e.message, 'err');
      btn.disabled = false; btn.textContent = '回答を登録';
    }
  });
}
/* B2: 同行者の削除・復元。理由必須、change_log に記録 */
function wireCompDelete(r) {
  $$('#tab-r .cf-del').forEach(b => b.addEventListener('click', () => {
    const p = S.people.find(x => x.id === b.dataset.pid); if (!p) return;
    const restore = b.dataset.del === 'restore';
    const box = $('#m-del-box');
    box.innerHTML = `<h3>同行者を${restore ? '復元' : '削除'}</h3>
      <p class="note">${esc(fullName(p) || '（氏名なし）')} を${restore
        ? '一覧に戻します。出席人数・卓数・お子様メニューの集計にも再び含まれます。'
        : '一覧から外します。原本は保持され、「削除済みのみ」で確認・復元できます。集計からは除外されます。'}</p>
      <div class="f req"><label>${restore ? '復元' : '削除'}理由</label><textarea id="cd-reason" rows="2"></textarea></div>
      <div class="row" style="margin:0"><span class="sp"></span>
        <button class="btn o" data-close>キャンセル</button>
        <button class="btn${restore ? '' : ' enji'}" id="cd-go">${restore ? '復元する' : '削除する'}</button></div>`;
    wireClose(box);
    $('#cd-go').addEventListener('click', async () => {
      const reason = $('#cd-reason').value.trim();
      if (!reason) { toast('理由は必須です', 'err'); return; }
      const before = { deleted_at: p.deleted_at ?? null, delete_reason: p.delete_reason ?? null };
      const patch = restore
        ? { deleted_at: null, delete_reason: null, updated_at: new Date().toISOString() }
        : { deleted_at: new Date().toISOString(), delete_reason: reason, updated_at: new Date().toISOString() };
      const { error } = await sb.from('reply_people').update(patch).eq('id', p.id);
      if (error) { toast('失敗：' + error.message, 'err'); return; }
      await logChange('reply_people', p.id, restore ? 'restore' : 'delete', reason,
        { before, after: { deleted_at: patch.deleted_at, delete_reason: patch.delete_reason } });
      toast(restore ? '復元しました' : '削除しました', 'ok');
      closeModal('m-del'); closeModal('m-guest'); await loadAll();
    });
    openModal('m-del');
  }));
}
function wireReplySave(r) {
  wireCompDelete(r);
  $('#rf-save').addEventListener('click', async () => {
    const reason = $('#rf-reason').value.trim();
    if (!reason) { toast('変更理由は必須です', 'err'); return; }
    const me = person0(r.id);
    /* A6: 氏名は reply_people にだけ保存する。replies_admin の氏名列は受信時の記録として残す */
    const nm = {
      family_name: $('#rf-fn').value.trim() || null, given_name: $('#rf-gn').value.trim() || null,
      family_name_latin: $('#rf-fl').value.trim().toUpperCase() || null,
      given_name_latin: $('#rf-gl').value.trim().toUpperCase() || null,
    };
    const nr = {
      side: $('#rf-side').value || null, email: $('#rf-mail').value.trim() || null,
      messenger: $('#rf-mid').value.trim() || null, country: $('#rf-country').value.trim() || null,
      region: $('#rf-region').value.trim() || null, needs: $('#rf-needs').value.trim() || null,
      message: $('#rf-msg').value.trim() || null, admin_note: $('#rf-note').value.trim() || null,
      attending: $('#rf-att').value === 'true', updated_at: new Date().toISOString(),
    };
    const np = { attending: nr.attending, allergy: $('#rf-al').value.trim() || null,
                 dietary: $('#rf-di').value.trim() || null, ...nm,
                 updated_at: new Date().toISOString() };
    const diff = { before: {}, after: {} };
    for (const k of Object.keys(nr)) if (k !== 'updated_at' && r[k] !== nr[k]) { diff.before[k] = r[k]; diff.after[k] = nr[k]; }
    if (me) for (const k of ['attending', 'allergy', 'dietary',
                             'family_name', 'given_name', 'family_name_latin', 'given_name_latin'])
      if (me[k] !== np[k]) { diff.before['person0.' + k] = me[k]; diff.after['person0.' + k] = np[k]; }
    try {
      const { error } = await sb.from('replies_admin').update(nr).eq('id', r.id);
      if (error) throw error;
      if (me) await sb.from('reply_people').update(np).eq('id', me.id);
      for (const box of $$('.compbox')) {
        const pid = box.dataset.pid;
        const old = S.people.find(x => x.id === pid); if (!old) continue;
        const v = sel => $(sel, box)?.value?.trim() ?? '';
        const cp = {
          family_name: v('.cf-fn') || null, given_name: v('.cf-gn') || null,
          family_name_latin: v('.cf-fl').toUpperCase() || null,
          given_name_latin: v('.cf-gl').toUpperCase() || null,
          attending: $('.cf-att', box).value === 'true', is_child: $('.cf-child', box).value === 'true',
          birthdate: v('.cf-bd') || null, age: v('.cf-age') === '' ? null : Number(v('.cf-age')),
          allergy: v('.cf-al') || null, dietary: v('.cf-di') || null,
          title: v('.cf-title') || null,
          updated_at: new Date().toISOString(),
        };
        /* A2: お子様椅子・お子様メニューは子どものときだけ持たせる */
        cp.kids_chair = cp.is_child && !!$('.cf-chair', box)?.checked;
        cp.kid_meal = cp.is_child ? (v('.cf-meal') || null) : null;
        const cd = { before: {}, after: {} };
        for (const k of Object.keys(cp)) if (k !== 'updated_at' && old[k] !== cp[k]) { cd.before[k] = old[k]; cd.after[k] = cp[k]; }
        if (!Object.keys(cd.after).length) continue;
        const { error: e2 } = await sb.from('reply_people').update(cp).eq('id', pid);
        if (e2) throw e2;
        await logChange('reply_people', pid, 'edit', reason, cd);
      }
      await logChange('replies_admin', r.id, 'edit', reason, diff);
      toast('保存しました', 'ok'); closeModal('m-guest'); await loadAll();
    } catch (e) { toast('保存に失敗：' + e.message, 'err'); }
  });
}
/* A2: 「お子様椅子」「お子様メニュー」は区分が子どものときだけ出す */
function wireKidOnly(root) {
  for (const box of $$('.compbox', root)) {
    const selKid = $('.cf-child', box); if (!selKid) continue;
    const sync = () => {
      const kid = selKid.value === 'true';
      $$('.kidonly', box).forEach(el => el.classList.toggle('off', !kid));
    };
    selKid.addEventListener('change', sync); sync();
  }
}
/* 入力欄から友人圏タグを新規作成して、その場でチェックを付ける */
function wireTagCreate(input, btn, chips) {
  const add = async () => {
    const name = input.value.trim();
    if (!name) return;
    let c = S.circles.find(x => norm(x.name) === norm(name));
    if (!c) {
      const { data, error } = await sb.from('circles').insert({ name }).select('id,name').single();
      if (error) { toast('タグの作成に失敗：' + error.message, 'err'); return; }
      c = data;
      S.circles.push(c); S.circles.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      fillCircleSelects();
      toast(`タグ「${name}」を作成しました`, 'ok');
    }
    input.value = '';
    const ex = [...chips.querySelectorAll('input')].find(i => i.value === String(c.id));
    if (ex) { ex.checked = true; return; }
    const l = document.createElement('label');
    l.className = 'tag circle';
    l.innerHTML = `<input type="checkbox" value="${esc(c.id)}" checked>${esc(c.name)}`;
    chips.appendChild(l);
  };
  btn.addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
}
function historyHTML(reply) {
  return sb.from('change_log').select('*').eq('target_id', reply.id).order('at')
    .then(({ data }) => {
      const orig = reply.original ? JSON.stringify(reply.original, null, 1) : '(原本なし)';
      const logs = (data || []).map(l =>
        `${new Date(l.at).toLocaleString('ja-JP')} ${l.action} ${l.actor || ''}「${l.reason}」` +
        (l.diff ? '\n  ' + JSON.stringify(l.diff) : '')).join('\n');
      return `【原本】${fmtDT(reply.received_at)} 受信\n${orig}\n\n【変更履歴】\n${logs || '(なし)'}`;
    });
}

/* ============================== 紐付け ============================== */
function scoreGuest(r, me, g) {
  let s = 0; const hit = [], miss = [];
  const eq = (a, b) => a && b && norm(a) === norm(b);
  const kf = eq(me?.family_name, g.family_name), kg = eq(me?.given_name, g.given_name);
  const lf = eq(me?.family_name_latin, g.family_name_latin), lg = eq(me?.given_name_latin, g.given_name_latin);
  if (kf) { s += 30; hit.push('姓（漢字）'); } else miss.push('姓（漢字）');
  if (kg) { s += 30; hit.push('名（漢字）'); } else miss.push('名（漢字）');
  if (lf) { s += 15; hit.push('ローマ字 姓'); }
  if (lg) { s += 15; hit.push('ローマ字 名'); }
  if (r.side && g.side && r.side === g.side) { s += 5; hit.push('Side'); }
  else if (r.side && g.side) miss.push('Side');
  if (eq(r.email, g.email)) { s += 20; hit.push('メール'); }
  if (eq(r.messenger, g.messenger_id)) { s += 20; hit.push('LINE / WeChat ID'); }
  if (kg && lg && !kf) { s += 10; hit.push('改姓の可能性'); }
  return { score: s, hit, miss };
}
function openMatchModal(rid) {
  const r = S.byReply.get(rid); if (!r) return;
  const me = person0(r.id);
  const oldGuest = r.matched_guest_id ? S.byGuest.get(r.matched_guest_id) : null;
  const merging = !!(oldGuest && oldGuest.auto_created);   // 自動登録された仮レコードからの紐付け直し
  const cands = S.guests.filter(g => !g.deleted_at && !g.auto_created)
    .map(g => ({ g, ...scoreGuest(r, me, g) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, 3);
  const box = $('#m-match-box');
  const MAXSCORE = 135;   // 30+30+15+15+5+20+20
  const mk = c => `<div class="cand" data-gid="${esc(c.g.id)}">
      <div class="pct">${Math.round(c.score / MAXSCORE * 100)}</div>
      <div class="nm"><b>${esc(fullName(c.g))}</b><small>${esc(latinName(c.g).toUpperCase())}
        ／ ${c.g.side === 'groom' ? '新郎側' : c.g.side === 'bride' ? '新婦側' : 'Side未設定'}
        ／ ${esc((S.circlesOfGuest.get(c.g.id) || []).map(x => x.name).join('・') || 'タグなし')}</small></div>
      <div class="why">一致：${c.hit.map(h => `<mark>${esc(h)}</mark>`).join('・') || 'なし'}
        ／ 不一致：${esc(c.miss.join('・') || 'なし')}</div>
      <button class="btn s" data-pick="${esc(c.g.id)}">これに紐付け</button></div>`;
  box.innerHTML = `
    <h3>${merging ? '本来の招待者に紐付け直す' : '招待者と紐付ける'}</h3>
    <p class="note">${merging
      ? `いまは自動登録された「${esc(fullName(oldGuest))}」に紐付いています。本来の招待者を選ぶと、友人圏タグを引き継いだうえで自動登録分は統合（削除）されます。`
      : '同姓同名の招待者が複数いるため、自動で決められませんでした。手動で選んでください。'}</p>
    <p class="note">回答：<b>${esc(fullName(me))}</b>（${esc(latinName(me).toUpperCase())}
      ／ ${r.side === 'groom' ? '新郎側' : r.side === 'bride' ? '新婦側' : 'Side未設定'}
      ／ ${esc(r.messenger || r.email || '')} ／ ${esc(r.lang || '')}）</p>
    ${cands.map(mk).join('') || '<p class="note">候補が見つかりませんでした。下の検索から選ぶか、リスト外として登録してください。</p>'}
    <div class="f"><label>候補以外から選ぶ</label><input id="mt-q" placeholder="招待者を検索…"></div>
    <div id="mt-res"></div>
    <div class="f"><label>理由（追記できます）</label><input id="mt-reason" value="手動紐付け"></div>
    <div class="row" style="margin:0">
      <button class="btn link" id="mt-unlisted">招待リスト外のゲストとして登録</button>
      <span class="sp"></span><button class="btn o" data-close>閉じる</button></div>`;
  wireClose(box);
  const pick = async gid => {
    const reason = $('#mt-reason').value.trim() || (merging ? '本来の招待者に紐付け直し' : '手動紐付け');
    const target = S.byGuest.get(gid);
    try {
      // a. 回答の紐付け先を差し替え
      const { error } = await sb.from('replies_admin')
        .update({ matched_guest_id: gid, match_type: 'manual', updated_at: new Date().toISOString() }).eq('id', r.id);
      if (error) throw error;
      if (merging) {
        // b. 自動作成分の友人圏タグを引き継ぐ（重複は無視）
        const tags = (S.circlesOfGuest.get(oldGuest.id) || []).map(c => ({ guest_id: gid, circle_id: c.id }));
        if (tags.length) {
          const { error: e2 } = await sb.from('guest_circles').upsert(tags, { onConflict: 'guest_id,circle_id' });
          if (e2) throw e2;
          await sb.from('guest_circles').delete().eq('guest_id', oldGuest.id);
        }
        // c. 自動作成分を削除フラグ
        const dr = `手動紐付けにより統合 → ${fullName(target)}`;
        const { error: e3 } = await sb.from('guests')
          .update({ deleted_at: new Date().toISOString(), delete_reason: dr,
                    updated_at: new Date().toISOString() }).eq('id', oldGuest.id);
        if (e3) throw e3;
        await logChange('guests', oldGuest.id, 'delete', dr, null);
      }
      // d. 変更履歴
      await logChange('replies_admin', r.id, 'match', reason,
        { before: { matched_guest_id: r.matched_guest_id, match_type: r.match_type },
          after: { matched_guest_id: gid, match_type: 'manual' },
          merged_from: merging ? oldGuest.id : null });
      toast(merging ? `${fullName(target)} に紐付け直しました` : '紐付けました', 'ok');
      closeModal('m-match'); await loadAll();
    } catch (e) { toast('紐付けに失敗：' + e.message, 'err'); }
  };
  $$('[data-pick]', box).forEach(b => b.addEventListener('click', () => pick(b.dataset.pick)));
  $('#mt-q').addEventListener('input', e => {
    const q = norm(e.target.value);
    const list = !q ? [] : S.guests.filter(g => !g.deleted_at &&
      norm([fullName(g), latinName(g), g.email, g.messenger_id].join(' ')).includes(q)).slice(0, 8);
    $('#mt-res').innerHTML = list.map(g => `<div class="cand"><div class="nm"><b>${esc(fullName(g))}</b>
      <small>${esc(latinName(g).toUpperCase())}</small></div><div class="why"></div>
      <button class="btn s o" data-pick2="${esc(g.id)}">これに紐付け</button></div>`).join('');
    $$('[data-pick2]', $('#mt-res')).forEach(b => b.addEventListener('click', () => pick(b.dataset.pick2)));
  });
  $('#mt-unlisted').addEventListener('click', async () => {
    const reason = $('#mt-reason').value.trim() || '招待リスト外として登録';
    try {
      const { data: g2, error } = await sb.from('guests').insert({
        family_name: me?.family_name || '', given_name: me?.given_name || '',
        family_name_latin: me?.family_name_latin || null, given_name_latin: me?.given_name_latin || null,
        side: r.side || null, email: r.email || null, messenger_id: r.messenger || null,
        auto_created: true, source_reply_id: r.id,
      }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await sb.from('replies_admin')
        .update({ matched_guest_id: g2.id, match_type: 'unlisted', updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (e2) throw e2;
      await logChange('replies_admin', r.id, 'match', reason,
        { after: { matched_guest_id: g2.id, match_type: 'unlisted' }, created_guest: true });
      toast('招待リスト外のゲストとして登録しました', 'ok');
      closeModal('m-match'); await loadAll();
    } catch (e) { toast('失敗：' + e.message, 'err'); }
  });
  openModal('m-match');
}
function openUnmatch(rid) {
  const r = S.byReply.get(rid); if (!r) return;
  /* 統合で消した自動登録分があれば、戻して紐付け直せるようにする */
  const merged = S.guests.find(g => g.auto_created && g.deleted_at && g.source_reply_id === r.id);
  const box = $('#m-del-box');
  box.innerHTML = `<h3>紐付けを解除</h3>
    <p class="note">回答「${esc(fullName(person0(r.id)))}」と招待者の紐付けを外します。</p>
    ${merged ? `<div class="f"><label><input type="checkbox" id="um-restore" checked>
      自動登録の招待者「${esc(fullName(merged))}」を復元して、そちらに紐付け直す</label>
      <span class="note">外すだけにしたい場合はチェックを外してください。</span></div>` : ''}
    <div class="f req"><label>解除理由</label><textarea id="um-reason" rows="2"></textarea></div>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button><button class="btn enji" id="um-go">解除する</button></div>`;
  wireClose(box);
  $('#um-go').addEventListener('click', async () => {
    const reason = $('#um-reason').value.trim();
    if (!reason) { toast('理由は必須です', 'err'); return; }
    const restore = merged && $('#um-restore')?.checked;
    try {
      if (restore) {
        const { error } = await sb.from('guests')
          .update({ deleted_at: null, delete_reason: null, updated_at: new Date().toISOString() })
          .eq('id', merged.id);
        if (error) throw error;
        await logChange('guests', merged.id, 'restore', reason, null);
        const { error: e2 } = await sb.from('replies_admin')
          .update({ matched_guest_id: merged.id, match_type: 'unlisted', updated_at: new Date().toISOString() })
          .eq('id', r.id);
        if (e2) throw e2;
        await logChange('replies_admin', r.id, 'unmatch', reason,
          { before: { matched_guest_id: r.matched_guest_id, match_type: r.match_type },
            after: { matched_guest_id: merged.id, match_type: 'unlisted' }, restored_guest: merged.id });
        toast(`自動登録の「${fullName(merged)}」に戻しました`, 'ok');
      } else {
        const { error } = await sb.from('replies_admin')
          .update({ matched_guest_id: null, match_type: null, updated_at: new Date().toISOString() }).eq('id', r.id);
        if (error) throw error;
        await logChange('replies_admin', r.id, 'unmatch', reason,
          { before: { matched_guest_id: r.matched_guest_id, match_type: r.match_type },
            after: { matched_guest_id: null } });
        toast('解除しました', 'ok');
      }
      closeModal('m-del'); await loadAll();
    } catch (e) { toast('失敗：' + e.message, 'err'); }
  });
  openModal('m-del');
}

/* ---- 重複の統合（必ず手動） ---- */
function openMergeModal(oldId) {
  const oldG = S.byGuest.get(oldId); if (!oldG) return;
  const info = S.dupOf.get(oldId); if (!info) return;
  const keeper = info.keeper;
  const rs = S.replies.filter(r => r.matched_guest_id === oldId && !r.deleted_at);
  const cs = S.circlesOfGuest.get(oldId) || [];
  const box = $('#m-del-box');
  box.innerHTML = `<h3>重複を統合</h3>
    <p class="note">${esc(info.reason)}で重複と判定されています。統合すると元の招待者は削除扱いになります。</p>
    <div class="cand"><div class="nm"><b>${esc(fullName(oldG))}</b>
      <small>${esc(latinName(oldG).toUpperCase())} ／ ${esc(oldG.email || '')}
      ／ 登録 ${oldG.created_at ? new Date(oldG.created_at).toLocaleDateString('ja-JP') : '—'}</small></div>
      <div class="why">これを削除</div></div>
    <div style="text-align:center;color:var(--ink2);margin:2px 0">↓ 統合先</div>
    <div class="cand sel"><div class="nm"><b>${esc(fullName(keeper))}</b>
      <small>${esc(latinName(keeper).toUpperCase())} ／ ${esc(keeper.email || '')}
      ／ 登録 ${keeper.created_at ? new Date(keeper.created_at).toLocaleDateString('ja-JP') : '—'}</small></div>
      <div class="why">こちらを残す（登録が新しい方）</div></div>
    <p class="note">移すもの：回答 ${rs.length} 件${cs.length ? ` ／ 友人圏タグ ${cs.map(c => c.name).join('・')}` : ''}</p>
    <div class="f req"><label>統合理由</label><textarea id="mg-reason" rows="2"
      placeholder="例：同じ人を二重に登録していたため"></textarea></div>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn enji" id="mg-go">統合する</button></div>`;
  wireClose(box);
  $('#mg-go').addEventListener('click', async () => {
    const reason = $('#mg-reason').value.trim();
    if (!reason) { toast('理由は必須です', 'err'); return; }
    try {
      // a. 回答の紐付けを新しい方へ
      for (const r of rs) {
        const { error } = await sb.from('replies_admin')
          .update({ matched_guest_id: keeper.id, updated_at: new Date().toISOString() }).eq('id', r.id);
        if (error) throw error;
        await logChange('replies_admin', r.id, 'match', `重複統合 → ${fullName(keeper)}`,
          { before: { matched_guest_id: oldId }, after: { matched_guest_id: keeper.id } });
      }
      // b. 友人圏タグを移す
      if (cs.length) {
        const { error } = await sb.from('guest_circles')
          .upsert(cs.map(c => ({ guest_id: keeper.id, circle_id: c.id })), { onConflict: 'guest_id,circle_id' });
        if (error) throw error;
        await sb.from('guest_circles').delete().eq('guest_id', oldId);
      }
      // c. 古い方を削除フラグ
      const dr = `重複統合 → ${fullName(keeper)}`;
      const { error: e3 } = await sb.from('guests')
        .update({ deleted_at: new Date().toISOString(), delete_reason: dr, updated_at: new Date().toISOString() })
        .eq('id', oldId);
      if (e3) throw e3;
      // d. 履歴
      await logChange('guests', oldId, 'delete', `${dr}（${reason}）`,
        { merged_into: keeper.id, moved_replies: rs.length, moved_circles: cs.map(c => c.name) });
      toast(`${fullName(keeper)} に統合しました`, 'ok');
      closeModal('m-del'); await loadAll();
    } catch (e) { toast('統合に失敗：' + e.message, 'err'); }
  });
  openModal('m-del');
}

/* ---- A4: 重複回答を有効化して、いまの有効な回答を重複扱いにする ---- */
function openActivateModal(rid) {
  const r = S.byReply.get(rid); if (!r) return;
  const others = (S.repliesOfGuest.get(r.matched_guest_id) || []).filter(x => x.id !== r.id && replyLive(x));
  const newer = others[0] || null;
  const box = $('#m-del-box');
  box.innerHTML = `<h3>こちらの回答を有効にする</h3>
    <p class="note">${fmtDT(r.received_at)} 受信の「${esc(fullName(person0(r.id)))}」を有効な回答にします。
      ${newer ? `いま有効な ${fmtDT(newer.received_at)} 受信の回答は重複扱い（手動で入替）になります。` : ''}</p>
    <div class="f req"><label>理由</label><textarea id="ac-reason" rows="2"
      placeholder="例：本人に確認し、こちらが最新の回答のため"></textarea></div>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="ac-go">有効にする</button></div>`;
  wireClose(box);
  $('#ac-go').addEventListener('click', async () => {
    const reason = $('#ac-reason').value.trim();
    if (!reason) { toast('理由は必須です', 'err'); return; }
    try {
      const { error } = await sb.from('replies_admin')
        .update({ superseded_by: null, duplicate_reason: null, updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (error) throw error;
      await logChange('replies_admin', r.id, 'edit', reason,
        { before: { superseded_by: r.superseded_by, duplicate_reason: r.duplicate_reason },
          after: { superseded_by: null, duplicate_reason: null } });
      if (newer) {
        const { error: e2 } = await sb.from('replies_admin')
          .update({ superseded_by: r.id, duplicate_reason: '手動で入替', updated_at: new Date().toISOString() })
          .eq('id', newer.id);
        if (e2) throw e2;
        await logChange('replies_admin', newer.id, 'edit', reason,
          { before: { superseded_by: null }, after: { superseded_by: r.id, duplicate_reason: '手動で入替' } });
      }
      toast('こちらの回答を有効にしました', 'ok');
      closeModal('m-del'); await loadAll();
    } catch (e) { toast('失敗：' + e.message, 'err'); }
  });
  openModal('m-del');
}

/* ============================== E. 一括編集 ============================== */
const BULK_FIELDS = [
  { v: 'side',       g: 'guest', label: '新郎友人／新婦友人', type: 'side' },
  { v: 'circle_add', g: 'guest', label: '友人圏タグの追加',   type: 'circle' },
  { v: 'circle_del', g: 'guest', label: '友人圏タグの除去',   type: 'circle' },
  { v: 'title',      g: 'guest', label: '肩書き',             type: 'title' },
  { v: 'tool',       g: 'guest', label: '連絡ツール',         type: 'tool' },
  { v: 'line',       g: 'guest', label: 'LINE登録済',         type: 'bool' },
  { v: 'wechat',     g: 'guest', label: 'WeChat加入済',       type: 'bool' },
  { v: 'fee',        g: 'guest', label: 'お車代',             type: 'yen' },
  { v: 'gift',       g: 'guest', label: '個別ギフト',         type: 'gift' },
  { v: 'attending',  g: 'reply', label: '出欠',               type: 'att' },
  { v: 'allergy',    g: 'reply', label: 'アレルギー',         type: 'text' },
  { v: 'dietary',    g: 'reply', label: '食事制限',           type: 'text' },
  { v: 'needs',      g: 'reply', label: '配慮事項',           type: 'text' },
];
function resolveGuest(key) {
  const [t, id] = key.split(':');
  if (t === 'g') return S.byGuest.get(id) || null;
  const r = t === 'r' ? S.byReply.get(id)
    : S.byReply.get((S.people.find(x => x.id === id) || {}).reply_id);
  return r?.matched_guest_id ? S.byGuest.get(r.matched_guest_id) : null;
}
function resolveReply(key) {
  const [t, id] = key.split(':');
  if (t === 'r') return S.byReply.get(id) || null;
  if (t === 'p') return S.byReply.get((S.people.find(x => x.id === id) || {}).reply_id) || null;
  return S.replyOfGuest.get(id) || null;      // 招待者行は有効な回答
}
$('#bulk-edit').addEventListener('click', () => {
  const keys = [...S.sel];
  if (!keys.length) return;
  const box = $('#m-tag-box');
  box.innerHTML = `<h3>一括編集（${keys.length} 件）</h3>
    <div class="f"><label>変更する項目</label><select id="be-field">
      <optgroup label="招待者">${BULK_FIELDS.filter(f => f.g === 'guest')
        .map(f => `<option value="${f.v}">${f.label}</option>`).join('')}</optgroup>
      <optgroup label="回答">${BULK_FIELDS.filter(f => f.g === 'reply')
        .map(f => `<option value="${f.v}">${f.label}</option>`).join('')}</optgroup>
    </select></div>
    <div class="f" id="be-valwrap"></div>
    <div class="f" id="be-reasonwrap"></div>
    <p class="note" id="be-hint"></p>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button><button class="btn" id="be-go">適用する</button></div>`;
  wireClose(box);
  const draw = () => {
    const f = BULK_FIELDS.find(x => x.v === $('#be-field').value);
    const vw = $('#be-valwrap');
    vw.innerHTML = { 
      side: `<label>値</label><select id="be-val"><option value="groom">新郎友人</option><option value="bride">新婦友人</option><option value="">未設定</option></select>`,
      circle: `<label>タグ</label><select id="be-val">${S.circles.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>`,
      tool: `<label>値</label><select id="be-val"><option value="">未設定</option>${TOOLS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`,
      title: `<label>値（「なし」で消去）</label><select id="be-val"><option value="">なし</option>${
        titleNames().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>`,
      bool: `<label>値</label><select id="be-val"><option value="true">はい</option><option value="false">いいえ</option></select>`,
      att: `<label>値</label><select id="be-val"><option value="true">出席</option><option value="false">欠席</option></select>`,
      text: `<label>値（空にすると消去）</label><input id="be-val">`,
      yen: `<label>金額（円。空にすると消去）</label><input id="be-val" type="number" min="0" step="1" inputmode="numeric">`,
      gift: `<label>品目名（空にすると消去）</label><input id="be-val" list="be-giftlist">
        <datalist id="be-giftlist">${extNames().map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`,
    }[f.type];
    $('#be-reasonwrap').className = 'f' + (f.g === 'reply' ? ' req' : '');
    $('#be-reasonwrap').innerHTML = `<label>理由${f.g === 'reply' ? '' : '（任意）'}</label>
      <textarea id="be-reason" rows="2"></textarea>`;
    const n = keys.filter(k => f.g === 'guest' ? resolveGuest(k) : resolveReply(k)).length;
    $('#be-hint').textContent = `対象：${n} 件 ／ 対象なしでスキップ：${keys.length - n} 件` +
      (f.v === 'attending' ? '（同行者の出欠も同じ値に更新します）' : '');
  };
  $('#be-field').addEventListener('change', draw); draw();
  $('#be-go').addEventListener('click', async () => {
    const f = BULK_FIELDS.find(x => x.v === $('#be-field').value);
    const val = $('#be-val').value;
    const reason = $('#be-reason').value.trim();
    if (f.g === 'reply' && !reason) { toast('理由は必須です', 'err'); return; }
    const btn = $('#be-go'); btn.disabled = true; btn.textContent = '適用中…';
    let ok = 0, skip = 0;
    try {
      const seen = new Set();
      for (const k of keys) {
        if (f.g === 'guest') {
          const g = resolveGuest(k);
          if (!g || seen.has('g' + g.id)) { if (!g) skip++; continue; }
          seen.add('g' + g.id);
          if (f.v === 'circle_add') {
            await sb.from('guest_circles').upsert([{ guest_id: g.id, circle_id: val }], { onConflict: 'guest_id,circle_id' });
          } else if (f.v === 'circle_del') {
            await sb.from('guest_circles').delete().eq('guest_id', g.id).eq('circle_id', val);
          } else {
            const col = { side: 'side', tool: 'contact_tool', line: 'line_joined', wechat: 'wechat_joined',
                          fee: 'transport_fee', gift: 'gift_note', title: 'title' }[f.v];
            const nv = f.type === 'bool' ? val === 'true'
              : f.type === 'yen' ? (val === '' ? 0 : Math.round(Number(val)))   // NOT NULL default 0
              : (val || null);
            const ov = g[col] ?? null;
            const { error } = await sb.from('guests')
              .update({ [col]: nv, updated_at: new Date().toISOString() }).eq('id', g.id);
            if (error) throw error;
            await logChange('guests', g.id, 'edit', reason || `一括編集：${f.label}`,
              { before: { [col]: ov }, after: { [col]: nv } });
          }
          ok++;
        } else {
          const r = resolveReply(k);
          if (!r || seen.has('r' + r.id)) { if (!r) skip++; continue; }
          seen.add('r' + r.id);
          const me = person0(r.id);
          if (f.v === 'attending') {
            const nv = val === 'true';
            const ov = r.attending ?? null;
            const nPeople = peopleLive(r.id).length;
            const { error } = await sb.from('replies_admin')
              .update({ attending: nv, updated_at: new Date().toISOString() }).eq('id', r.id);
            if (error) throw error;
            // E4: 同行者の出欠も連動
            const { error: e2 } = await sb.from('reply_people')
              .update({ attending: nv, updated_at: new Date().toISOString() }).eq('reply_id', r.id);
            if (e2) throw e2;
            await logChange('replies_admin', r.id, 'edit', reason,
              { before: { attending: ov }, after: { attending: nv }, people_updated: nPeople });
          } else if (f.v === 'needs') {
            const ov = r.needs ?? null;
            const { error } = await sb.from('replies_admin')
              .update({ needs: val || null, updated_at: new Date().toISOString() }).eq('id', r.id);
            if (error) throw error;
            await logChange('replies_admin', r.id, 'edit', reason,
              { before: { needs: ov }, after: { needs: val || null } });
          } else {
            if (!me) { skip++; continue; }
            const ov = me[f.v] ?? null;
            const { error } = await sb.from('reply_people')
              .update({ [f.v]: val || null, updated_at: new Date().toISOString() }).eq('id', me.id);
            if (error) throw error;
            await logChange('reply_people', me.id, 'edit', reason,
              { before: { [f.v]: ov }, after: { [f.v]: val || null } });
          }
          ok++;
        }
      }
      toast(`適用 ${ok} 件／スキップ ${skip} 件`, 'ok');
      closeModal('m-tag'); await loadAll();
    } catch (e) {
      toast('失敗：' + e.message, 'err');
      btn.disabled = false; btn.textContent = '適用する';
    }
  });
  openModal('m-tag');
});

/* ============================== 一括タグ ============================== */
$('#bulk-tag').addEventListener('click', () => {
  const ids = [...S.sel].filter(k => k.startsWith('g:')).map(k => k.slice(2));
  if (!ids.length) { toast('招待者を選んでください', 'err'); return; }
  const box = $('#m-tag-box');
  box.innerHTML = `<h3>友人圏タグを付ける（${ids.length} 名）</h3>
    <div class="f"><label>付けるタグ</label>
      <div class="tagbox">
        <div class="chips" id="tg-chips">${S.circles.map(c =>
          `<label class="tag circle"><input type="checkbox" value="${esc(c.id)}" style="margin-right:4px">${esc(c.name)}</label>`
          ).join('')}</div>
        <div class="tagnew"><input id="tg-newtag" placeholder="新しいタグ名を入力">
          <button type="button" class="btn s o" id="tg-addtag">＋ 作成</button></div>
      </div></div>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button><button class="btn" id="tg-go">付ける</button></div>`;
  wireClose(box);
  wireTagCreate($('#tg-newtag'), $('#tg-addtag'), $('#tg-chips'));
  $('#tg-go').addEventListener('click', async () => {
    const cids = $$('#tg-chips input:checked').map(i => i.value);
    if (!cids.length) { toast('タグを選んでください', 'err'); return; }
    const rows = [];
    for (const gid of ids) for (const cid of cids) rows.push({ guest_id: gid, circle_id: cid });
    const { error } = await sb.from('guest_circles').upsert(rows, { onConflict: 'guest_id,circle_id' });
    if (error) { toast('失敗：' + error.message, 'err'); return; }
    toast('タグを付けました', 'ok'); closeModal('m-tag'); await loadAll();
  });
  openModal('m-tag');
});

/* ============================== CSV ============================== */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
/* ---- A. CSV 一斉アップロード ---- */
const CSV_COLS = ['family_name','given_name','family_name_latin','given_name_latin','contact_tool','side'];
const TOOL_ALIAS = {
  'line':'line','ライン':'line',
  'wechat':'wechat','微信':'wechat','ウィーチャット':'wechat',
  'email':'email','mail':'email','e-mail':'email','メール':'email','めーる':'email',
  'phone':'phone','tel':'phone','電話':'phone',
  'facebook':'facebook','fb':'facebook',
  'instagram':'instagram','insta':'instagram','ig':'instagram',
  'other':'other','その他':'other','他':'other',
};
const SIDE_ALIAS = {
  'groom':'groom','新郎':'groom','新郎側':'groom',
  'bride':'bride','新婦':'bride','新婦側':'bride',
};
/* UTF-8（BOM有無）と Shift-JIS を自動判定 */
function decodeCSV(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF)
    return new TextDecoder('utf-8').decode(u8.subarray(3));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch { return new TextDecoder('shift_jis').decode(u8); }
}
$('#g-tpl').addEventListener('click', () => {
  const rows = [CSV_COLS.join(','), '山田,太郎,YAMADA,TARO,line,groom'];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'guests_template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
$('#g-csvin').addEventListener('click', () => {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.csv,text/csv';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const rows = parseCSV(decodeCSV(await f.arrayBuffer()));
    if (rows.length < 2) { toast('データ行がありません', 'err'); return; }
    const head = rows[0].map(h => h.trim().toLowerCase().replace(/^﻿/, ''));
    if (!head.includes('family_name') || !head.includes('given_name')) {
      toast('family_name / given_name の列が必要です', 'err'); return;
    }
    const recs = rows.slice(1).map(r => {
      const o = {};
      head.forEach((h, i) => { if (CSV_COLS.includes(h)) o[h] = (r[i] ?? '').trim(); });
      return o;
    });
    showCSVPreview(recs.map(classifyCSV));
  };
  inp.click();
});
/* 追加 / 更新 / エラー を判定 */
function classifyCSV(rec) {
  const errs = [];
  const fam = (rec.family_name || '').trim(), giv = (rec.given_name || '').trim();
  if (!fam || !giv) errs.push('family_name / given_name が空');
  let tool = null;
  if ((rec.contact_tool || '').trim()) {
    tool = TOOL_ALIAS[rec.contact_tool.trim().toLowerCase()] || null;
    if (!tool) errs.push(`contact_tool「${rec.contact_tool}」は不明な値`);
  }
  let side = null;
  if ((rec.side || '').trim()) {
    side = SIDE_ALIAS[rec.side.trim().toLowerCase()] || null;
    if (!side) errs.push(`side「${rec.side}」は不明な値`);
  }
  const fl = (rec.family_name_latin || '').trim(), gl = (rec.given_name_latin || '').trim();
  let target = null, replace = null;
  if (!errs.length) {
    const live = S.guests.filter(g => !g.deleted_at);
    const kanjiHit = g => norm(g.family_name) === norm(fam) && norm(g.given_name) === norm(giv);
    const latinHit = g => !!norm(fl) && !!norm(gl) &&
      norm(g.family_name_latin) === norm(fl) && norm(g.given_name_latin) === norm(gl);
    /* 通常の更新候補（自動登録は除外。ローマ字が両方に入っていれば矛盾しないこと） */
    const hits = live.filter(g => !g.auto_created && kanjiHit(g)).filter(g => {
      const a = norm(g.family_name_latin), b = norm(g.given_name_latin);
      return (!a || !norm(fl) || a === norm(fl)) && (!b || !norm(gl) || b === norm(gl));
    });
    /* A6: 自動登録された招待者は、漢字一致またはローマ字一致で置換する */
    const autos = live.filter(g => g.auto_created && (kanjiHit(g) || latinHit(g)));
    if (hits.length > 1) errs.push('同名の招待者が複数いるため自動判定できません');
    else if (hits.length === 1) target = hits[0];
    if (!errs.length) {
      if (autos.length > 1) errs.push('置換できる自動登録の招待者が複数います');
      else if (autos.length === 1) replace = autos[0];
    }
  }
  return {
    rec, errs, target, replace,
    kind: errs.length ? 'err' : replace ? 'rep' : target ? 'upd' : 'add',
    値: { family_name: fam, given_name: giv, family_name_latin: fl || null,
          given_name_latin: gl || null, contact_tool: tool, side },
  };
}
/* A6: 自動登録の招待者を CSV の行で置き換え、回答と友人圏タグを引き継ぐ */
async function replaceAutoGuest(item) {
  const old = item.replace;
  let newId;
  if (item.target) {                       // 正式な招待者が既にいれば、そこへ畳み込む
    newId = item.target.id;
    const patch = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(item.値)) if (v !== null && v !== '') patch[k] = v;
    const { error } = await sb.from('guests').update(patch).eq('id', newId);
    if (error) throw error;
  } else {
    const { data: ng, error: e1 } = await sb.from('guests').insert(item.値).select('id').single();
    if (e1) throw e1;
    newId = ng.id;
  }

  const moved = S.replies.filter(r => r.matched_guest_id === old.id).map(r => r.id);
  if (moved.length) {
    const { error } = await sb.from('replies_admin')
      .update({ matched_guest_id: newId, match_type: 'auto', updated_at: new Date().toISOString() })
      .eq('matched_guest_id', old.id);
    if (error) throw error;
    for (const rid of moved)
      await logChange('replies_admin', rid, 'edit', 'CSVアップロードにより置換',
        { before: { matched_guest_id: old.id, match_type: 'unlisted' },
          after:  { matched_guest_id: newId, match_type: 'auto' } });
  }

  const tags = (S.circlesOfGuest.get(old.id) || []).map(c => c.id);
  if (tags.length) {
    const { error } = await sb.from('guest_circles')
      .upsert(tags.map(cid => ({ guest_id: newId, circle_id: cid })), { onConflict: 'guest_id,circle_id' });
    if (error) throw error;
    await sb.from('guest_circles').delete().eq('guest_id', old.id);
  }

  const { error: e2 } = await sb.from('guests').update({
    deleted_at: new Date().toISOString(), delete_reason: 'CSVアップロードにより置換',
    updated_at: new Date().toISOString(),
  }).eq('id', old.id);
  if (e2) throw e2;

  await logChange('guests', old.id, 'delete', 'CSVアップロードにより置換',
    { before: { auto_created: true, deleted_at: null },
      after: { deleted_at: '(set)', replaced_by: newId },
      moved_replies: moved, moved_circles: tags.length });
  await logChange('guests', newId, item.target ? 'edit' : 'create', 'CSVアップロードにより置換',
    { before: item.target ? { id: newId } : null, after: { ...item.値, replaces: old.id } });
}
function showCSVPreview(items) {
  const n = k => items.filter(i => i.kind === k).length;
  const box = $('#m-csv-box');
  const label = { add: '追加', upd: '更新', rep: '置換', err: 'エラー' };
  box.innerHTML = `<h3>招待リストCSVアップロード プレビュー（${items.length} 行）</h3>
    <div class="csvsum"><span><b>${n('add')}</b>追加</span><span><b>${n('upd')}</b>更新</span>
      <span class="rep"><b>${n('rep')}</b>置換（自動登録を差し替え）</span>
      <span><b>${n('err')}</b>エラー（スキップ）</span></div>
    <div class="csvtbl"><table><thead><tr><th>判定</th><th>姓</th><th>名</th><th>姓(ローマ字)</th>
      <th>名(ローマ字)</th><th>連絡ツール</th><th>Side</th><th>備考</th></tr></thead><tbody>
      ${items.slice(0, 200).map(i => `<tr class="csv-${i.kind}">
        <td>${label[i.kind]}</td><td>${esc(i.値.family_name)}</td><td>${esc(i.値.given_name)}</td>
        <td>${esc(i.値.family_name_latin || '')}</td><td>${esc(i.値.given_name_latin || '')}</td>
        <td>${esc(i.値.contact_tool ? TOOL_LABEL[i.値.contact_tool] : '')}</td>
        <td>${i.値.side === 'groom' ? '新郎側' : i.値.side === 'bride' ? '新婦側' : ''}</td>
        <td>${i.errs.length ? esc(i.errs.join(' / '))
          : i.replace ? '自動登録「' + esc(fullName(i.replace)) + '」を置換 → '
              + (i.target ? '既存の「' + esc(fullName(i.target)) + '」に回答と友人圏タグを引き継ぎ'
                          : '新規の招待者に回答と友人圏タグを引き継ぎ')
          : i.target ? '既存：' + esc(fullName(i.target)) + ' を更新' : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${items.length > 200 ? '<p class="note">（先頭200件のみ表示）</p>' : ''}
    <div class="row" style="margin:10px 0 0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="csv-go"${n('add') + n('upd') + n('rep') ? '' : ' disabled'}>確定して反映</button></div>`;
  wireClose(box);
  $('#csv-go').addEventListener('click', async () => {
    const btn = $('#csv-go'); btn.disabled = true; btn.textContent = '反映中…';
    let added = 0, updated = 0, replaced = 0;
    try {
      const ins = items.filter(i => i.kind === 'add').map(i => i.値);
      if (ins.length) {
        const { error } = await sb.from('guests').insert(ins); if (error) throw error;
        added = ins.length;
      }
      for (const i of items.filter(x => x.kind === 'upd')) {
        const patch = { updated_at: new Date().toISOString() };
        for (const [k, v] of Object.entries(i.値)) if (v !== null && v !== '') patch[k] = v;
        const { error } = await sb.from('guests').update(patch).eq('id', i.target.id);
        if (error) throw error;
        updated++;
      }
      for (const i of items.filter(x => x.kind === 'rep')) { await replaceAutoGuest(i); replaced++; }
      toast(`追加 ${added} 件 / 更新 ${updated} 件 / 置換 ${replaced} 件 / スキップ ${n('err')} 件`, 'ok');
      closeModal('m-csv'); await loadAll();
    } catch (e) {
      toast('取り込みに失敗：' + e.message, 'err');
      btn.disabled = false; btn.textContent = '確定して反映';
    }
  });
  openModal('m-csv');
}
/* ---- B5: 選択した未回答の招待者に、出欠だけを一括で代理登録 ---- */
$('#bulk-reply').addEventListener('click', () => {
  const keys = [...S.sel];
  if (!keys.length) return;
  const targets = keys.map(k => k.startsWith('g:') ? S.byGuest.get(k.slice(2)) : null)
    .filter(g => g && !g.deleted_at && !S.replyOfGuest.get(g.id));
  const box = $('#m-tag-box');
  box.innerHTML = `<h3>回答を登録（${targets.length} 件）</h3>
    <p class="note">選択した招待者のうち、まだ回答が無い ${targets.length} 件に出欠だけを代理登録します
      （同行者なし・他の項目は空）。招待状DBの原本には書き込みません。</p>
    <div class="f"><label>出欠</label><select id="br-att">
      <option value="true">出席</option><option value="false">欠席</option></select></div>
    <div class="f req"><label>登録理由</label><textarea id="br-reason" rows="2">${esc(PROXY_REASON)}</textarea></div>
    <p class="note">対象：${targets.length} 件 ／ 対象なしでスキップ：${keys.length - targets.length} 件</p>
    <div class="row" style="margin:0"><span class="sp"></span>
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="br-go"${targets.length ? '' : ' disabled'}>登録する</button></div>`;
  wireClose(box);
  $('#br-go').addEventListener('click', async () => {
    const reason = $('#br-reason').value.trim();
    if (!reason) { toast('登録理由は必須です', 'err'); return; }
    const attending = $('#br-att').value === 'true';
    const btn = $('#br-go'); btn.disabled = true; btn.textContent = '登録中…';
    let ok = 0;
    try {
      for (const g of targets) {
        const rid = crypto.randomUUID();
        const now = new Date().toISOString();
        const { error } = await sb.from('replies_admin').insert({
          id: rid, received_at: now, lang: 'ja', source: 'admin', attending, side: g.side || null,
          family_name: g.family_name, given_name: g.given_name,
          family_name_latin: g.family_name_latin, given_name_latin: g.given_name_latin,
          email: g.email || null, messenger: g.messenger_id || null,
          country: null, region: null, message: null, needs: null, photos: [],
          original: { source: 'admin', entered_by: S.me?.email ?? null },
          matched_guest_id: g.id, match_type: 'manual',
        });
        if (error) throw error;
        const { error: e2 } = await sb.from('reply_people').insert({
          reply_id: rid, idx: 0, is_companion: false,
          family_name: g.family_name, given_name: g.given_name,
          family_name_latin: g.family_name_latin, given_name_latin: g.given_name_latin,
          attending, is_child: false, birthdate: null, age: null, allergy: null, dietary: null,
        });
        if (e2) throw e2;
        await logChange('replies_admin', rid, 'edit', reason, {
          before: null,
          after: { source: 'admin', attending, matched_guest_id: g.id, match_type: 'manual',
                   people: 1, entered_by: S.me?.email ?? null },
        });
        ok++;
      }
      toast(`登録 ${ok} 件／スキップ ${keys.length - ok} 件`, 'ok');
      closeModal('m-tag'); await loadAll();
    } catch (e) {
      toast('登録に失敗：' + e.message, 'err');
      btn.disabled = false; btn.textContent = '登録する';
    }
  });
  openModal('m-tag');
});

/* ---- A4: 選択した行だけを 1人1行の CSV で書き出す（UTF-8 BOM付き・CRLF） ---- */
const CSV_GUEST_COLS = [
  '行種別','Side','姓（漢字）','名（漢字）','姓（ローマ字）','名（ローマ字）','肩書き',
  '出欠','区分','年齢','お子様椅子','お子様メニュー',
  'メールアドレス','LINE・WeChat ID','打診経路','公式LINE登録','WeChat加入',
  'アレルギー','食事制限','配慮事項','お車代','お車代備考','個別ギフト',
  '友人圏','招待状回答紐付','メモ','受信日時','招待リスト氏名',
];
/* カンマ・改行・ダブルクォートを含むときだけ引用符で囲む */
function csvCell(v) {
  const t = String(v ?? '');
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
const csvLine = a => a.map(csvCell).join(',');
/* 区分は「大人・小学生・未就学児」だけを返し、年齢は別列に出す */
const csvKind = p => !p ? '' : !p.is_child ? '大人'
  : { primary: '小学生', pre: '未就学児' }[kindKey(p)] || '未就学児';
function csvDT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function stampName() {
  const d = new Date();
  return `guests_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}.csv`;
}
$('#bulk-csv').addEventListener('click', () => {
  const rows = S.rows.filter(r => S.sel.has(rowKey(r)));
  if (!rows.length) { toast('選択された行がありません', 'err'); return; }
  const body = rows.map(row => {
    const g = row.guest, r = row.reply, p = row.person;
    const comp = row.kind === 'companion';
    /* A5: 氏名は回答（reply_people）の現在値。無ければ招待リストの値 */
    const o = p || g;
    const age = p ? ageAt(p.birthdate, p.age) : null;
    /* 同行者行では、本人（世帯）にしか無い項目は空欄にする */
    const own = v => comp ? '' : v;
    return csvLine([
      comp ? '同行者' : '本人',
      own(sideLabel(g?.side || r?.side)),
      o?.family_name ?? '', o?.given_name ?? '',
      (o?.family_name_latin ?? '').toUpperCase(), (o?.given_name_latin ?? '').toUpperCase(),
      /* A4: 本人は招待者の肩書き、同行者は回答の肩書き */
      comp ? (p?.title || '') : (g?.title || ''),
      p ? (p.attending === true ? '出席' : p.attending === false ? '欠席' : '') : '未回答',
      csvKind(p),
      age == null ? '' : age,
      p?.is_child && p.kids_chair ? '要' : '',
      p?.is_child ? mealOf(p) : '',
      own(g?.email || r?.email || ''),
      own(g?.messenger_id || r?.messenger || ''),
      own(TOOL_LABEL[g?.contact_tool] || ''),
      own(g ? (g.line_joined ? '登録済' : '未登録') : ''),
      own(g ? (g.wechat_joined ? '加入済' : '未加入') : ''),
      p?.allergy || '', p?.dietary || '',
      own(r?.needs || ''),
      own(g?.transport_fee ? Math.round(g.transport_fee) : ''),
      own(g?.transport_note || ''),
      own(g?.gift_note || ''),
      own(g ? (S.circlesOfGuest.get(g.id) || []).map(c => c.name).join(';') : ''),
      own(row.kind === 'unmatched' ? '未紐付'
        : r?.match_type === 'auto' ? '自動'
        : r?.match_type === 'manual' ? '手動'
        : r?.match_type === 'unlisted' ? '招待リスト外' : ''),
      own([g?.note, r?.admin_note, r?.message].filter(Boolean).join(' / ')),
      own(csvDT(r?.received_at)),
      own(nameDiffers(p, g) ? [fullName(g), latinName(g).toUpperCase()].filter(Boolean).join(' / ') : ''),
    ]);
  });
  const csv = '﻿' + [csvLine(CSV_GUEST_COLS), ...body].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = stampName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`${rows.length} 行を書き出しました`, 'ok');
});

/* ============================== 写真 ============================== */
async function signedUrl(path) {
  const c = S.signed.get(path);
  if (c && c.exp > Date.now() + 5 * 60000) return c.url;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  S.signed.set(path, { url: data.signedUrl, exp: Date.now() + 3600 * 1000 });
  return data.signedUrl;
}
function photoList() {
  const inclDel = $('#p-del').checked;
  const out = [];
  for (const r of S.replies) {
    if (r.deleted_at && !inclDel) continue;        // 重複回答（superseded）の写真も出す
    const paths = Array.isArray(r.photos) ? r.photos : [];
    if (!paths.length) continue;
    const me = person0(r.id);
    const g = r.matched_guest_id ? S.byGuest.get(r.matched_guest_id) : null;
    paths.forEach((p, i) => out.push({
      path: typeof p === 'string' ? p : (p?.path || ''), idx: i, reply: r, person: me, guest: g,
      name: fullName(me) || fullName(g), listName: nameDiffers(me, g) ? fullName(g) : '',
      circles: g ? (S.circlesOfGuest.get(g.id) || []) : [],
    }));
  }
  return out.filter(x => x.path);
}
function filteredPhotos() {
  const q = norm($('#p-q').value), side = $('#p-side').value, circle = $('#p-circle').value;
  let list = photoList().filter(x => {
    /* A4: 回答側・招待リスト側どちらの表記でもヒットさせる */
    if (q && !norm([x.name, latinName(x.person), fullName(x.guest), latinName(x.guest)]
      .join(' ')).includes(q)) return false;
    const s = x.guest?.side || x.reply.side;
    if (side && s !== side) return false;
    if (circle) {
      if (circle === '__none') { if (x.circles.length) return false; }
      else if (!x.circles.some(c => c.id === circle)) return false;
    }
    return true;
  });
  const sort = $('#p-sort').value;
  list.sort((a, b) => sort === 'name'
    ? (latinName(a.guest || a.person) || a.name).localeCompare(latinName(b.guest || b.person) || b.name, 'ja')
    : sort === 'old' ? new Date(a.reply.received_at) - new Date(b.reply.received_at)
    : new Date(b.reply.received_at) - new Date(a.reply.received_at));
  return list;
}
['p-q','p-side','p-circle','p-sort','p-del'].forEach(id => $('#' + id).addEventListener('input', renderPhotos));
function renderPhotos() {
  const list = filteredPhotos();
  S.photos = list;
  $('#p-tiles').innerHTML = list.map((x, i) => `
    <figure class="tile" data-i="${i}">
      <label class="pchk"><input type="checkbox" class="pc" data-i="${i}"></label>
      <div class="img ph" data-open="${i}"></div>
      <figcaption><small>${fmtDT(x.reply.received_at)}</small>
        <b>${esc(x.name || '（氏名なし）')}</b>
        ${x.listName ? `<small class="listname" title="回答の表記を優先しています">招待リスト：${esc(x.listName)}</small>` : ''}
        <small>${[sideTag(x.guest?.side || x.reply.side),
          ...x.circles.map(c => `<span class="tag circle">${esc(c.name)}</span>`),
          replyDup(x.reply) ? '<span class="tag dupr">重複回答</span>' : '',
          x.reply.matched_guest_id ? '' : '<span class="tag wait">未紐付</span>'
          ].filter(Boolean).join(' ')}</small></figcaption>
    </figure>`).join('') || '<p class="empty">写真がありません。</p>';
  $('#p-count').textContent = `${list.length} 枚`;
  S.photoSel.clear(); updatePhotoBulk();
  list.forEach(async (x, i) => {
    const url = await signedUrl(x.path);
    const el = $(`#p-tiles .tile[data-i="${i}"] .img`);
    if (el && url) { el.style.backgroundImage = `url("${url}")`; el.classList.remove('ph'); }
  });
  $$('#p-tiles [data-open]').forEach(el => el.addEventListener('click', () => openPhotoViewer(+el.dataset.open)));
  $$('#p-tiles .pc').forEach(c => c.addEventListener('change', () => {
    c.checked ? S.photoSel.add(+c.dataset.i) : S.photoSel.delete(+c.dataset.i);
    updatePhotoBulk();
  }));
}
function updatePhotoBulk() {
  $('#pn').textContent = S.photoSel.size;
  $('#pdl').disabled = S.photoSel.size === 0;
}
$('#pall').addEventListener('change', e => {
  $$('#p-tiles .pc').forEach(c => { c.checked = e.target.checked; c.dispatchEvent(new Event('change')); });
});
function zipName(x, seq) {
  const nm = (x.name || 'guest').replace(/[\\/:*?"<>|\s]/g, '');
  const ext = (x.path.split('.').pop() || 'jpg').toLowerCase();
  return `${nm}_${ymd(x.reply.received_at)}_${pad2(seq)}.${ext}`;
}
$('#pdl').addEventListener('click', async () => {
  const btn = $('#pdl'); const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 準備中…';
  try {
    const { zipSync } = await import('https://esm.sh/fflate');
    const picks = [...S.photoSel].sort((a, b) => a - b).map(i => S.photos[i]);
    const files = {}; const seq = new Map();
    for (const x of picks) {
      const k = x.reply.id; const n = (seq.get(k) || 0) + 1; seq.set(k, n);
      const url = await signedUrl(x.path);
      if (!url) continue;
      const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let name = zipName(x, n), i = 1;
      while (files[name]) name = zipName(x, n).replace(/(\.\w+)$/, `_${++i}$1`);
      files[name] = buf;
    }
    const zipped = zipSync(files, { level: 0 });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
    a.download = `wedding-photos_${ymd(new Date().toISOString())}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    toast(`${Object.keys(files).length} 枚をZIPにまとめました`, 'ok');
  } catch (e) { toast('ZIP作成に失敗：' + e.message, 'err'); }
  btn.disabled = false; btn.innerHTML = old; updatePhotoBulk();
});
let viewer = { list: [], i: 0 };
function openPhotoModalByReply(rid) {
  const list = photoList().filter(x => x.reply.id === rid);
  if (!list.length) { toast('写真がありません', 'err'); return; }
  showViewer(list, 0);
}
function openPhotoViewer(i) {
  const x = S.photos[i];
  const list = S.photos.filter(y => y.reply.id === x.reply.id);
  showViewer(list, list.findIndex(y => y.path === x.path));
}
async function showViewer(list, i) {
  viewer = { list, i: Math.max(0, i) };
  const x = list[viewer.i];
  const box = $('#m-photo-box');
  box.innerHTML = `
    <div class="row" style="margin-bottom:8px"><h3 style="margin:0">${esc(x.name || '（氏名なし）')} さんの写真</h3>
      <span class="note">${fmtDT(x.reply.received_at)} ・
        ${x.reply.side === 'groom' || x.guest?.side === 'groom' ? '新郎側'
          : x.reply.side === 'bride' || x.guest?.side === 'bride' ? '新婦側' : ''}
        ${esc(x.circles.map(c => c.name).join('・'))} ・ ${list.length}枚</span>
      <span class="sp"></span><button class="btn link" data-close>閉じる</button></div>
    <div class="pview"><button class="nav" id="pv-l">‹</button>
      <div class="big" id="pv-big"></div><button class="nav" id="pv-r">›</button></div>
    <div class="thumbs" id="pv-th"></div>
    <div class="row" style="margin:12px 0 0"><span class="note" id="pv-meta"></span><span class="sp"></span>
      <button class="btn s" id="pv-dl">この1枚をダウンロード</button></div>`;
  wireClose(box);
  $('#pv-l').addEventListener('click', () => step(-1));
  $('#pv-r').addEventListener('click', () => step(1));
  $('#pv-dl').addEventListener('click', dlOne);
  openModal('m-photo');
  await paint();
  async function paint() {
    const y = viewer.list[viewer.i];
    const url = await signedUrl(y.path);
    $('#pv-big').style.backgroundImage = url ? `url("${url}")` : '';
    $('#pv-meta').textContent = `${viewer.i + 1} / ${viewer.list.length}`;
    const th = $('#pv-th');
    th.innerHTML = viewer.list.map((z, k) => `<div class="th${k === viewer.i ? ' on' : ''}" data-k="${k}"></div>`).join('');
    viewer.list.forEach(async (z, k) => {
      const u = await signedUrl(z.path);
      const el = $(`#pv-th .th[data-k="${k}"]`); if (el && u) el.style.backgroundImage = `url("${u}")`;
    });
    $$('#pv-th .th').forEach(el => el.addEventListener('click', () => { viewer.i = +el.dataset.k; paint(); }));
  }
  function step(d) { viewer.i = (viewer.i + d + viewer.list.length) % viewer.list.length; paint(); }
  async function dlOne() {
    const y = viewer.list[viewer.i];
    const url = await signedUrl(y.path); if (!url) return;
    const blob = await (await fetch(url)).blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = zipName(y, viewer.i + 1);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 6000);
  }
  document.addEventListener('keydown', keyNav);
  function keyNav(e) {
    if (!$('#m-photo').classList.contains('on')) { document.removeEventListener('keydown', keyNav); return; }
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  }
}

/* ============================== 友人圏・シェア ============================== */
function shareOf(cid) { return S.shares.find(s => s.circle_id === cid) || null; }
function shareURL(token) { return `${location.origin}/s/?t=${token}`; }
function renderCircles() {
  const cs = circleStats().filter(c => c.id !== '__none');
  $('#c-body').innerHTML = cs.map(c => {
    const sh = shareOf(c.id);
    const cell = sh && sh.enabled
      ? `<span class="tag ok">発行済</span> <code>…/s/?t=${esc(sh.token)}</code>
         <button class="btn link" data-copy="${esc(sh.token)}">コピー</button>`
      : sh ? `<span class="tag grey">無効</span> <code>…/s/?t=${esc(sh.token)}</code>`
      : '<span class="tag grey">未発行</span>';
    const acts = sh
      ? `<button class="btn s o" data-share="${esc(c.id)}">設定</button>
         <button class="btn s o" data-prev="${esc(sh.token)}">プレビュー</button>`
      : `<button class="btn s" data-share="${esc(c.id)}">発行</button>`;
    return `<tr><td><span class="tag circle">${esc(c.name)}</span></td><td>${c.total}</td>
      <td>${c.yes} / ${c.no} / ${c.wait}</td><td>${cell}</td>
      <td class="act">${acts}
        <button class="btn s o" data-ren="${esc(c.id)}">名称変更</button>
        <button class="btn s o" data-delc="${esc(c.id)}">削除</button></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">友人圏タグがまだありません。</td></tr>';

  $$('#c-body [data-copy]').forEach(b => b.addEventListener('click', async () => {
    const u = shareURL(b.dataset.copy);
    try { await navigator.clipboard.writeText(u); toast('URLをコピーしました', 'ok'); }
    catch { prompt('コピーしてください', u); }
  }));
  $$('#c-body [data-prev]').forEach(b => b.addEventListener('click', () =>
    window.open(shareURL(b.dataset.prev), '_blank', 'noopener')));
  $$('#c-body [data-share]').forEach(b => b.addEventListener('click', () => openShareModal(b.dataset.share)));
  $$('#c-body [data-ren]').forEach(b => b.addEventListener('click', () => renameCircle(b.dataset.ren)));
  $$('#c-body [data-delc]').forEach(b => b.addEventListener('click', () => deleteCircle(b.dataset.delc)));
}
$('#c-add').addEventListener('click', async () => {
  const name = $('#c-new').value.trim();
  if (!name) return;
  const { error } = await sb.from('circles').insert({ name });
  if (error) { toast('追加に失敗：' + error.message, 'err'); return; }
  $('#c-new').value = ''; toast('追加しました', 'ok'); await loadAll();
});
async function renameCircle(id) {
  const c = S.circles.find(x => x.id === id); if (!c) return;
  const name = prompt('新しいタグ名', c.name); if (!name || name === c.name) return;
  const { error } = await sb.from('circles').update({ name: name.trim() }).eq('id', id);
  if (error) { toast('変更に失敗：' + error.message, 'err'); return; }
  toast('変更しました', 'ok'); await loadAll();
}
async function deleteCircle(id) {
  const c = S.circles.find(x => x.id === id); if (!c) return;
  const used = S.guestCircles.filter(gc => gc.circle_id === id).length;
  if (!confirm(used ? `「${c.name}」は ${used} 名に使われています。削除しますか？（紐付けも外れます）`
                    : `「${c.name}」を削除しますか？`)) return;
  const { error } = await sb.from('circles').delete().eq('id', id);
  if (error) { toast('削除に失敗：' + error.message, 'err'); return; }
  toast('削除しました', 'ok'); await loadAll();
}
function newToken() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const r = new Uint32Array(8); crypto.getRandomValues(r);
  return [...r].map(n => a[n % a.length]).join('');
}
function openShareModal(cid) {
  const c = S.circles.find(x => x.id === cid); if (!c) return;
  const sh = shareOf(cid);
  const box = $('#m-share-box');
  box.innerHTML = `
    <h3>シェアページの設定：${esc(c.name)}</h3>
    <div class="f"><label>共有URL（自動生成・推測不可）</label>
      <input id="sh-url" value="${sh ? esc(shareURL(sh.token)) : '（保存すると発行されます）'}" readonly></div>
    <div class="two">
      <div class="f${sh ? '' : ' req'}"><label>パスワード${sh ? '（変更する場合のみ入力）' : ''}</label>
        <input id="sh-pw" type="text" autocomplete="off"></div>
      <div class="f"><label>有効期限</label><input type="date" id="sh-exp" value="${esc(sh?.expires_at || '')}"></div></div>
    <div class="f"><label>表示する項目</label><div>
      <label><input type="checkbox" checked disabled> 氏名（漢字）</label>
      <label><input type="checkbox" id="sh-latin"${sh?.show_latin !== false ? ' checked' : ''}> ローマ字</label>
      <label><input type="checkbox" checked disabled> 出欠</label></div></div>
    <div class="f"><label>表示範囲</label><div class="note">回答済みのゲストのみ。未回答は表示されません。</div></div>
    <div class="f"><label>ページタイトル（任意）</label>
      <input id="sh-title" value="${esc(sh?.page_title || '')}" placeholder="${esc(c.name)}のみなさま"></div>
    <div class="f"><label>ページ上部の一言（任意）</label>
      <input id="sh-head" value="${esc(sh?.headline || '')}" placeholder="9/14までに回答をお願いします"></div>
    <div class="row" style="margin:0">
      ${sh ? `<button class="btn link" id="sh-toggle">${sh.enabled ? '無効化する' : '有効化する'}</button>
              <button class="btn link" id="sh-regen">再発行</button>` : ''}
      <span class="sp"></span><button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="sh-save">保存${sh ? 'してURLをコピー' : 'して発行'}</button></div>`;
  wireClose(box);
  $('#sh-save').addEventListener('click', async () => {
    const pw = $('#sh-pw').value;
    const rec = {
      page_title: $('#sh-title').value.trim() || null,
      headline: $('#sh-head').value.trim() || null,
      show_latin: $('#sh-latin').checked,
      expires_at: $('#sh-exp').value || null,
    };
    try {
      let id = sh?.id, token = sh?.token;
      if (!sh) {
        if (!pw) { toast('パスワードは必須です', 'err'); return; }
        token = newToken();
        const { data, error } = await sb.from('share_links')
          .insert({ circle_id: cid, token, password_hash: 'x', enabled: true, ...rec }).select('id').single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await sb.from('share_links').update(rec).eq('id', sh.id);
        if (error) throw error;
      }
      if (pw) {
        const { error } = await sb.rpc('share_set_password', { p_link: id, p_password: pw });
        if (error) throw error;
      }
      const url = shareURL(token);
      try { await navigator.clipboard.writeText(url); } catch {}
      toast('保存しました（URLをコピーしました）', 'ok');
      closeModal('m-share'); await loadAll();
    } catch (e) { toast('保存に失敗：' + e.message, 'err'); }
  });
  if (sh) {
    $('#sh-toggle').addEventListener('click', async () => {
      const { error } = await sb.from('share_links').update({ enabled: !sh.enabled }).eq('id', sh.id);
      if (error) { toast('失敗：' + error.message, 'err'); return; }
      toast(sh.enabled ? '無効化しました' : '有効化しました', 'ok');
      closeModal('m-share'); await loadAll();
    });
    $('#sh-regen').addEventListener('click', async () => {
      if (!confirm('URLを再発行します。これまでのURLは使えなくなります。')) return;
      const { error } = await sb.from('share_links').update({ token: newToken() }).eq('id', sh.id);
      if (error) { toast('失敗：' + error.message, 'err'); return; }
      toast('再発行しました', 'ok'); closeModal('m-share'); await loadAll();
    });
  }
  openModal('m-share');
}

/* ============================================================
   予算タブ
   ============================================================ */
const B = { set: null, items: [], ext: [], sel: new Set(), saving: new Map() };
const TYPE_LABEL = { fix:'固定費', pp:'人数連動', pt:'卓数連動', man:'その他', kid:'お子様', cloth:'卓数連動', cloth0:'人数連動' };
const TYPE_CLS   = { fix:'fix', pp:'pp', pt:'pt', man:'man', kid:'man', cloth:'pt', cloth0:'pp' };
const INIT_TOTAL = 3983675;
/* D5/D6: 初期見積（ホテル発行 2026/3/28・伝票No -20526）。税抜表記のまま */
const INIT = [
 ['パック','PLAN2025年SPECIAL 30名様',1165000,1,1165000,''],['パック','PLAN2025年SPECIAL 1名様追加',20500,60,1230000,''],
 ['料理','婚礼料理',0,90,0,'プラン内：13,000円税別（16,445円コース税込）'],['料理','クレープシュゼット',500,90,45000,''],['料理','生ウェディングケーキ',1200,90,108000,''],['料理','早大特典',null,null,-108000,''],
 ['飲料','婚礼飲料',0,90,0,'プラン内'],
 ['室料','親族控室・披露宴来賓控室',0,4,0,'プラン内'],['室料','披露宴会場利用料',100000,1,100000,'※会場によって料金異なります'],['室料','特別割引',null,null,-100000,''],['室料','ブライズルーム使用料',50000,1,50000,''],['室料','ブライダルフェアご成約特典',null,null,-50000,''],
 ['装花','メインテーブル装花',0,1,0,'プラン内：50,000円分'],['装花','ゲストテーブル装花',7000,12,84000,'8名掛けの場合（最大10名掛け）'],['装花','ケーキ前装花',10000,1,10000,''],['装花','ブーケ・ブートニア',30000,1,30000,'★2点目〜ブーケ50%OFF特典'],
 ['印刷・筆耕・徽章','招待状（プラン）',0,1,0,''],['印刷・筆耕・徽章','席札',0,90,0,'プラン内：200円商品'],['印刷・筆耕・徽章','席次表',550,90,49500,''],['印刷・筆耕・徽章','メニュー',300,90,27000,''],
 ['ホテル製品・引出物','引出物',3000,72,216000,''],['ホテル製品・引出物','引菓子（※軽減税率）',1000,72,72000,''],
 ['美粧料','介添料・着付・美容・リタッチ・リハーサル',0,5,0,'プラン内'],['美粧料','ご新婦様美容・着付追加 お色直し',41000,1,41000,'洋装1点分のお仕度'],['美粧料','ご新郎様メイク',4000,1,4000,''],['美粧料','ご新郎様衣装持込料',10000,1,10000,''],['美粧料','ご新婦様衣装持込料',20000,2,40000,''],
 ['音響・映像・録音','婚礼音響基本料',0,1,0,'プラン内'],['音響・映像・録音','映像機材使用料',100000,1,100000,''],
 ['司会・演奏','司会者',80000,1,80000,''],
 ['設営','カラークロス',0,7,0,'10名につき1枚で計算'],['設営','カラーナプキン',0,90,0,''],['設営','チェアカバー',0,90,0,''],['設営','カラークロス追加分',5000,8,40000,'メイン・ケーキ卓5枚＋ゲスト卓12枚'],
 ['照明','柱サーチ',15000,1,15000,''],['照明','キャンドルイリュージョン',4800,12,57600,''],
 ['写真','スタジオ写真：六切2枚1組',0,1,0,'プラン内'],['写真','エンドロール',180000,1,180000,'メイク〜再入場（手書き修正 230,000）'],['写真','スナップアルバム',150000,1,150000,'お仕度上がり〜ご披露宴お開きまで（手書き修正 145,000）'],
 ['その他','ゲストブック',3000,1,3000,''],['その他','ペーパーバッグ',400,72,28800,''],['その他','ファーストミート',20000,1,20000,''],
 ['割引','早稲田大学OB・OG割引',-1000,90,-90000,'課税対象外'],
];
const BASE_DRV = { adult:90, child:0, tables:12, hh:90, seats:8 };

/* ---- 読み込み ---- */
async function loadBudget() { await loadBudgetData(); renderDash(); renderBudget(); }
async function loadBudgetData() {
  const [st, it, ex] = await Promise.all([
    sb.from('budget_settings').select('*').eq('id', 1).single(),
    sb.from('budget_items').select('*').is('deleted_at', null).order('sort_order'),
    sb.from('budget_external').select('*').is('deleted_at', null).order('category'),
  ]);
  if (st.error || it.error || ex.error) {
    toast('予算の読み込みに失敗：' + (st.error || it.error || ex.error).message, 'err');
    return;
  }
  B.set = st.data; B.items = it.data || []; B.ext = ex.data || [];
  S.external = B.ext;
  await normalizeKid();
}

/* ---- B1: 計算の前提 ---- */
function autoDrivers() {
  let adult = 0, child = 0, hh = 0;
  for (const r of S.replies) {
    if (!replyLive(r)) continue;
    const ppl = peopleLive(r.id).filter(p => p.attending === true);
    if (r.attending === true) hh++;
    for (const p of ppl) (p.is_child ? child++ : adult++);
  }
  return { adult, child, hh };
}
/* 参考値：招待者数 − 欠席（未回答を出席と仮定） */
function refAdults() {
  const live = S.guests.filter(g => !g.deleted_at);
  const declined = live.filter(g => {
    const r = S.replyOfGuest.get(g.id);
    return r && r.attending === false;
  }).length;
  return { invited: live.length, declined, ref: live.length - declined };
}
/* A3: 予算タブの「手入力」を無視した、回答ベースの前提。ダッシュボードはこちらを使う */
function autoDriverSet() {
  const a = autoDrivers(), seats = Math.max(1, B.set?.seats_per_table || 8);
  return { ...a, seats, tables: Math.ceil((a.adult + a.child) / seats), auto: a };
}
/* A1/C2: 総支出見込み・ご祝儀見込み・収支を1か所で計算する */
function budgetTotals(d) {
  const cur = calc(d, true);
  const hotel = cur.total, ext = extTotal(), fee = feeTotal();
  const grand = hotel + ext + fee;
  const gift = d.adult * (B.set?.gift_per_adult || 0);
  const paid = cur.rows.filter(r => r.it.paid).reduce((s, r) => s + r.a, 0);
  const extPaid = B.ext.filter(e => e.pay_status === '支払済').reduce((s, e) => s + extAmount(e), 0);
  return { cur, hotel, ext, fee, grand, gift, balance: gift - grand, paid, extPaid };
}
function drivers() {
  const a = autoDrivers(), s = B.set || {};
  const seats = Math.max(1, s.seats_per_table || 8);
  const adult = s.adult_mode === 'manual' ? (s.adult_manual || 0) : a.adult;
  const child = s.child_mode === 'manual' ? (s.child_manual || 0) : a.child;
  const tables = s.tables_mode === 'manual' ? (s.tables_manual || 0) : Math.ceil((adult + child) / seats);
  const hh = s.hh_mode === 'manual' ? (s.hh_manual || 0) : a.hh;
  return { adult, child, tables, hh, seats, auto: a };
}
/* A3: お子様メニューの既定割当は reply_people.kid_meal の集計。
   kid_meal が null の人だけ年齢から推定する（A＝6歳以下・未就学・年齢未記入／B＝7〜8歳／C＝9歳以上）。
   合計は「計算の前提」の子ども人数に合わせる（手入力で減らした場合は C→B→A の順に削り、
   増やした場合は年齢の分からない差分を A に寄せる）。 */
function kidDefault(d) {
  const c = { A:0, B:0, C:0 };
  for (const r of S.replies) {
    if (!replyLive(r)) continue;
    for (const p of peopleLive(r.id)) {
      if (p.attending !== true || !p.is_child) continue;
      c[mealOf(p)]++;
    }
  }
  let n = Math.max(0, (d || drivers()).child);
  c.C = Math.min(c.C, n); n -= c.C;
  c.B = Math.min(c.B, n); n -= c.B;
  c.A = n;
  return c;
}
const kidSlot = it => (it.name.match(/\s([ABC])\s*$/) || [])[1] || 'A';

/* ---- C1: 数量と金額 ---- */
const planCloth = d => Math.ceil(d.adult / 10);
function qtyOf(it, d, live) {
  const k = it.kind;
  if (k === 'fix' || k === 'man') return it.qty || 0;
  if (k === 'pp') return Math.max(0, d.adult - (it.base_qty || 0));
  if (k === 'cloth0') return planCloth(d);
  if (k === 'cloth') return Math.max(0, d.tables + 5 - planCloth(d));
  if (k === 'pt') {
    if (live && it.manual_qty != null) return it.manual_qty;
    if (it.split === 'high') return Math.floor(d.tables / 2);
    if (it.split === 'low') return Math.ceil(d.tables / 2);
    return d.tables;
  }
  if (k === 'kid') {
    if (!live) return 0;                      // 他シナリオでは子ども0で試算
    if (it.qty != null) return it.qty;
    return kidDefault(d)[kidSlot(it)] || 0;
  }
  return 0;
}
function calc(d, live) {
  const s = { fix:0, pp:0, pt:0, man:0, total:0, rows:[] };
  for (const it of B.items) {
    const q = qtyOf(it, d, live);
    const a = it.unit_price == null ? 0 : q * Number(it.unit_price) - Number(it.allowance || 0);
    s[TYPE_CLS[it.kind]] += a; s.total += a;
    s.rows.push({ it, q, a });
  }
  return s;
}
const extAmount = e => Number(e.unit_price || 0) * (e.qty || 0);
const extTotal = () => B.ext.reduce((s, e) => s + extAmount(e), 0);
const feeTotal = () => S.guests.filter(g => !g.deleted_at).reduce((s, g) => s + (g.transport_fee || 0), 0);

/* ---- B2: 即時保存（debounce 500ms） ---- */
function saveSoon(key, fn) {
  clearTimeout(B.saving.get(key));
  B.saving.set(key, setTimeout(fn, 500));
}
async function saveSettings(patch) {
  Object.assign(B.set, patch);
  renderBudget();
  saveSoon('set', async () => {
    const { error } = await sb.from('budget_settings')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) toast('前提の保存に失敗：' + error.message, 'err');
  });
}
async function saveItem(id, patch) {
  const it = B.items.find(x => x.id === id); if (it) Object.assign(it, patch);
  renderBudget();
  saveSoon('i' + id, async () => {
    const { error } = await sb.from('budget_items')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) toast('項目の保存に失敗：' + error.message, 'err');
  });
}
/* C3: 読み込み時、保存されているお子様メニューの割当が子ども人数と合っていなければ
   既定割当（null）に戻す。ぴったり合っているときは何も書き換えない。 */
async function normalizeKid() {
  const d = drivers();
  const kids = B.items.filter(i => i.kind === 'kid');
  if (!kids.length) return;
  const def = kidDefault(d);
  const sum = kids.reduce((s, k) => s + (k.qty != null ? k.qty : (def[kidSlot(k)] || 0)), 0);
  if (sum === d.child) return;
  for (const k of kids) {
    if (k.qty == null) continue;
    k.qty = null;
    await sb.from('budget_items').update({ qty: null }).eq('id', k.id);
  }
}

/* C2/C3: 前提が変わったら pt の manual_qty と kid の qty を戻す */
async function resetDerived() {
  const pt = B.items.filter(i => i.kind === 'pt' && i.manual_qty != null);
  const kid = B.items.filter(i => i.kind === 'kid' && i.qty != null);
  pt.forEach(i => { i.manual_qty = null; });
  kid.forEach(i => { i.qty = null; });
  for (const i of pt) await sb.from('budget_items').update({ manual_qty: null }).eq('id', i.id);
  for (const i of kid) await sb.from('budget_items').update({ qty: null }).eq('id', i.id);
}

/* ---- 描画 ---- */
function renderBudget() {
  if (!B.set) return;
  const d = drivers();
  const cur = calc(d, true), base = calc(BASE_DRV, false);

  /* 前提 */
  const modes = { adult:'adult_mode', child:'child_mode', tables:'tables_mode', hh:'hh_mode' };
  for (const [k, col] of Object.entries(modes)) {
    const man = B.set[col] === 'manual';
    $$(`.sw button[data-k="${k}"]`).forEach(b => b.classList.toggle('on', (b.dataset.src === 'man') === man));
    const inp = $('#b-' + k);
    inp.value = d[k]; inp.readOnly = !man;
  }
  $('#b-seats').value = d.seats;
  const rf = refAdults();
  $('#b-adult-src').innerHTML = `回答ベース <b>${d.auto.adult}</b>（有効な回答の大人）<br>` +
    `参考：招待者数 ${rf.invited} − 欠席 ${rf.declined} ＝ <b>${rf.ref}</b>（未回答を出席と仮定）` +
    `<button class="btn link" id="b-useref" style="margin-left:6px">この数を使う</button>`;
  $('#b-useref').addEventListener('click', () =>
    saveSettings({ adult_mode: 'manual', adult_manual: rf.ref }).then(resetDerived).then(renderBudget));
  const kd = kidDefault(d);
  $('#b-child-src').textContent =
    `小学生 ${kd.B + kd.C}・未就学 ${kd.A}。大人の人数連動には含めず、お子様メニューで計算`;

  /* C2: 上段カード6枚 ＋ 内訳パネル */
  const t = budgetTotals(d);
  const kidSum = cur.rows.filter(r => r.it.kind === 'kid').reduce((s, r) => s + r.q, 0);
  const giftQty = ty => cur.rows.filter(r => r.it.gift_type === ty).reduce((s, r) => s + r.q, 0);
  const extGift = ty => B.ext.filter(e => e.gift_type === ty).reduce((s, e) => s + (e.qty || 0), 0);
  const hd = giftQty('hikidemono') + extGift('hikidemono');
  const hg = giftQty('hikigashi') + extGift('hikigashi');

  $('#g-total').textContent = yen(t.grand);
  $('#g-total-n').textContent = `支払済 ${yen(t.paid + t.extPaid)}／残 ${yen(t.grand - t.paid - t.extPaid)}`;
  $('#g-hotel').textContent = yen(t.hotel);
  $('#g-hotel-n').textContent = `支払済 ${yen(t.paid)}／未払 ${yen(t.hotel - t.paid)}`;
  $('#g-ext').textContent = yen(t.ext);
  $('#g-ext-n').textContent = `支払済 ${yen(t.extPaid)}／検討中 ${B.ext.filter(e => e.pay_status === '検討中').length} 件`;
  $('#g-fee').textContent = yen(t.fee);
  $('#g-gift').textContent = yen(t.gift);
  $('#g-gift-n').textContent = d.adult;
  $('#b-per').value = B.set.gift_per_adult || 0;
  $('#g-bal').textContent = (t.balance < 0 ? '−' : '') + yen(Math.abs(t.balance));
  $('#g-bal-card').classList.toggle('enji', t.balance < 0);
  $('#g-bal-n').textContent = `ご祝儀 ${yen(t.gift)} − 総支出 ${yen(t.grand)}`;

  const dif = cur.total - INIT_TOTAL;
  $('#b-hotel-total').innerHTML = `ホテル試算総額 <b>${yen(cur.total)}</b>　` +
    `<span style="color:${dif > 0 ? 'var(--enji)' : 'var(--ok)'}">初期見積 ${yen(INIT_TOTAL)} より ` +
    `${dif >= 0 ? '+' : '−'}${yen(Math.abs(dif)).slice(1)}円</span>`;
  $('#b-legend').innerHTML = [['fix','#8C6E5E'],['pp','#7FA5D6'],['pt','#8E1728'],['man','#B8862B']]
    .map(([k, c]) => `<span><i style="background:${c}"></i>${TYPE_LABEL[k]} <b>${yen(cur[k])}</b></span>`).join('');
  $('#b-sub').innerHTML =
    `人数連動：大人 ${d.adult}名 × ${yen(cur.pp / Math.max(1, d.adult))}　／　卓数連動：${d.tables}卓 × ${yen(cur.pt / Math.max(1, d.tables))}` +
    `<br>その他のうち お子様メニュー ${kidSum}食　／　引き出物 ${hd}（ホテル${giftQty('hikidemono')}＋手配${extGift('hikidemono')}）・引き菓子 ${hg}　／　世帯 ${d.hh}`;

  const kw = $('#b-kidwarn');
  if (kidSum < d.child) {
    kw.style.display = '';
    kw.textContent = `⚠ お子様メニューの合計 ${kidSum}食 が子どもの出席人数 ${d.child}名 に満たしていません（未割当 ${d.child - kidSum}）`;
  } else kw.style.display = 'none';

  /* D4 内訳バー・シナリオ */
  $('#b-stack').innerHTML = [['fix','#8C6E5E'],['pp','#7FA5D6'],['pt','#8E1728'],['man','#B8862B']]
    .map(([k, c]) => `<i style="width:${cur.total ? cur[k] / cur.total * 100 : 0}%;background:${c}" title="${TYPE_LABEL[k]} ${yen(cur[k])}"></i>`).join('');
  const scen = [
    ['見積（元）', BASE_DRV, false],
    ['現在の前提', d, true],
    ['出席 60名', { adult: 60 - d.child, child: d.child, tables: Math.ceil(60 / d.seats), hh: 45, seats: d.seats }, false],
    ['出席 70名', { adult: 70 - d.child, child: d.child, tables: Math.ceil(70 / d.seats), hh: 52, seats: d.seats }, false],
    ['出席 80名', { adult: 80 - d.child, child: d.child, tables: Math.ceil(80 / d.seats), hh: 60, seats: d.seats }, false],
  ];
  const base2 = calc(BASE_DRV, false);
  $('#b-cmp').innerHTML = scen.map(([n, dd2, live], i) => {
    const c = calc(dd2, live), df = c.total - base2.total, cl = i === 1 ? ' cur' : '';
    return `<tr><td class="${cl.trim()}">${esc(n)}</td><td class="num${cl}">${dd2.adult}</td>
      <td class="num${cl}">${dd2.child}</td><td class="num${cl}">${dd2.tables}</td>
      <td class="num${cl}">${yen(c.total)}</td>
      <td class="num${cl}" style="color:${df > 0 ? 'var(--enji)' : df < 0 ? 'var(--ok)' : 'inherit'}">${
        df === 0 ? '—' : (df > 0 ? '+' : '−') + yen(Math.abs(df)).slice(1)}</td></tr>`;
  }).join('');

  renderDelta(cur, d);
  renderItems(cur, d);

  renderExt();
  renderGuestCost();
}

/* ---- D5: 初期見積との比較 ---- */
function initMapped() {
  const svc = new Set(['パック','料理','飲料','室料']);
  const m = {};
  for (const r of INIT) {
    const k = r[1].replace(/（.*?）|\s/g, '');
    let f = 1.10;
    if (svc.has(r[0])) f = 1.10 * 1.15;
    if (r[1].includes('軽減')) f = 1.08;
    if (r[0] === '割引') f = 1;
    m[k] = (m[k] || 0) + Math.round(r[4] * f);
  }
  /* 割引行は対応する項目に相殺する */
  m['生ウェディングケーキ'] = (m['生ウェディングケーキ'] || 0) + Math.round(-108000 * 1.10 * 1.15);
  m['披露宴会場利用料'] = (m['披露宴会場利用料'] || 0) + Math.round(-100000 * 1.10 * 1.15);
  m['ブライズルーム使用料'] = (m['ブライズルーム使用料'] || 0) + Math.round(-50000 * 1.10 * 1.15);
  ['早大特典','特別割引','ブライダルフェアご成約特典'].forEach(k => delete m[k]);
  return m;
}
function renderDelta(cur, d) {
  const m = initMapped(), out = [], seen = new Set();
  const line = (name, sub, a, b) =>
    `<tr><td>${esc(name)}<br><span class="note">${esc(sub)}</span></td>
      <td class="num">${a == null ? '—' : yen(a)}</td><td class="num">${b == null ? '—' : yen(b)}</td>
      <td class="num" style="color:${(b || 0) > (a || 0) ? 'var(--enji)' : 'var(--ok)'}">${
        ((b || 0) - (a || 0) > 0 ? '+' : '−') + yen(Math.abs((b || 0) - (a || 0))).slice(1)}</td></tr>`;
  const gtNow = cur.rows.filter(r => r.it.grp === 'gt').reduce((s, r) => s + r.a, 0);
  const gtInit = m['ゲストテーブル装花'] || 0;
  seen.add('ゲストテーブル装花');
  if (Math.round(gtNow) !== Math.round(gtInit))
    out.push(line('ゲストテーブル装花（High＋Low＋オプション）', `装花・卓数連動 ${d.tables}卓`, gtInit, gtNow));
  for (const r of cur.rows) {
    if (r.it.grp === 'gt') continue;
    const k = r.it.name.replace(/（.*?）|\s/g, '');
    const b = m[k];
    if (b != null) seen.add(k);
    if (Math.round(r.a) !== Math.round(b || 0))
      out.push(line(r.it.name, `${r.it.category}・${b == null ? '追加' : TYPE_LABEL[r.it.kind]}`, b == null ? null : b, r.a));
  }
  for (const k of Object.keys(m))
    if (!seen.has(k) && m[k] !== 0)
      out.push(line(k, '初期見積のみ・削除', m[k], null));
  $('#b-delta').innerHTML = out.join('') || '<tr><td colspan="4" class="note">差はありません</td></tr>';
}

/* ---- C5/C6: 項目表 ---- */
function visibleItems(cur) {
  const fc = $('#b-fcat').value, ft = $('#b-ftype').value,
        fp = $('#b-fpay').value, hz = $('#b-hidezero').checked;
  return cur.rows.filter(r =>
    (!fc || r.it.category === fc) &&
    (!ft || (ft === 'kid' ? r.it.kind === 'kid' : TYPE_CLS[r.it.kind] === ft && r.it.kind !== 'kid')) &&
    (fp === '' || (!!r.it.paid) === (fp === '1')) &&
    !(hz && Number(r.it.unit_price) === 0));
}
function renderItems(cur, d) {
  const cats = [...new Set(B.items.map(i => i.category))];
  const fc = $('#b-fcat');
  if ($$('option', fc).length !== cats.length + 1) {
    fc.innerHTML = '<option value="">カテゴリ：すべて</option>' +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  const rows = visibleItems(cur);
  const sums = {};
  cur.rows.forEach(r => { sums[r.it.category] = (sums[r.it.category] || 0) + r.a; });
  let html = '', lastCat = null;
  for (const r of rows) {
    const it = r.it, first = it.category !== lastCat; lastCat = it.category;
    const zero = Number(it.unit_price) === 0;
    const undecided = it.unit_price == null;
    let q;
    if (it.kind === 'man') q = `<input class="q" type="number" min="0" value="${r.q}" data-q="${it.id}">`;
    else if (it.kind === 'kid')
      q = `<input class="q" type="number" min="0" value="${r.q}" data-kid="${it.id}" max="${d.child}"><br><span class="note">上限 ${d.child}</span>`;
    else if (it.kind === 'pt' && it.split)
      q = `<input class="q" type="number" min="0" value="${r.q}" data-pt="${it.id}" max="${d.tables}"><br><span class="note">${it.manual_qty != null ? '手動' : '自動'}</span>`;
    else q = r.q + (it.base_qty ? `<br><span class="note">基準${it.base_qty}超過分</span>` : '');
    html += `<tr>
      <td>${zero ? '' : `<input type="checkbox" class="bchk" data-i="${it.id}"${B.sel.has(it.id) ? ' checked' : ''}>`}</td>
      <td class="catcell">${first ? esc(it.category) + `<small>小計 ${yen(sums[it.category])}</small>` : ''}</td>
      <td${zero ? ' class="zero"' : ''}>${esc(it.name)}<br><span class="note">${esc(it.tax_label || '')}</span></td>
      <td><button class="tag kindbtn ${TYPE_CLS[it.kind]}${zero ? ' plan' : ''}" data-kind="${it.id}"
        title="クリックで区分を変更">${TYPE_LABEL[it.kind]}</button></td>
      <td class="num${zero ? ' zero' : ''}">${undecided ? '<span class="note">未定</span>' : zero ? 'プラン内' : yen(it.unit_price)}${
        Number(it.allowance) ? `<br><span class="note">プラン内 −${yen(it.allowance)}</span>` : ''}</td>
      <td class="num">${q}</td>
      <td class="num${zero ? ' zero' : ''}">${yen(r.a)}</td>
      <td>${zero ? '' : `<span class="tag ${it.paid ? 'pp' : 'man'}">${it.paid ? '支払済' : '未払'}</span>`}</td>
      <td class="note">${esc(it.note || '')}</td>
      <td><button class="btn s o" data-eitem="${it.id}">編集</button></td></tr>`;
  }
  const gt = cur.rows.filter(r => r.it.grp === 'gt');
  const fcv = $('#b-fcat').value, ftv = $('#b-ftype').value;
  if (gt.length && (!fcv || fcv === gt[0].it.category) && !ftv) {
    const t = gt.reduce((s, r) => s + r.a, 0);
    html += `<tr><td></td><td class="catcell"></td><td class="note">ゲストテーブル装花 合計（装花＋オプション）</td>
      <td></td><td class="num"></td><td class="num">${d.tables}卓</td><td class="num"><b>${yen(t)}</b></td>
      <td colspan="3" class="note">1卓あたり ${yen(t / Math.max(1, d.tables))}</td></tr>`;
  }
  html += `<tr class="tot"><td colspan="6">合計（表示中の項目）</td>
    <td class="num">${yen(rows.reduce((s, r) => s + r.a, 0))}</td><td colspan="3"></td></tr>`;
  $('#b-items tbody').innerHTML = html;
  wireItemRows(d);
}
function wireItemRows(d) {
  $$('#b-items .bchk').forEach(c => c.addEventListener('change', () => {
    c.checked ? B.sel.add(c.dataset.i) : B.sel.delete(c.dataset.i);
    updateBBulk();
  }));
  $$('#b-items [data-eitem]').forEach(b =>
    b.addEventListener('click', () => openItemModal(b.dataset.eitem)));
  $$('#b-items [data-kind]').forEach(b =>
    b.addEventListener('click', () => openKindModal(b.dataset.kind)));
  $$('#b-items input[data-q]').forEach(inp => inp.addEventListener('change', () =>
    saveItem(inp.dataset.q, { qty: Math.max(0, Number(inp.value) || 0) })));
  /* C3: お子様メニューの手動調整 */
  $$('#b-items input[data-kid]').forEach(inp => inp.addEventListener('change', async () => {
    const kids = B.items.filter(i => i.kind === 'kid');
    const def = kidDefault(d);
    kids.forEach(k => { if (k.qty == null) k.qty = def[kidSlot(k)] || 0; });
    const me = kids.find(k => k.id === inp.dataset.kid);
    me.qty = Math.min(d.child, Math.max(0, Number(inp.value) || 0));
    let over = kids.reduce((s, k) => s + k.qty, 0) - d.child;
    for (const slot of ['A', 'B', 'C']) {          // 超過分は A→B→C の順に減らす
      if (over <= 0) break;
      const k = kids.find(x => x !== me && kidSlot(x) === slot);
      if (!k) continue;
      const cut = Math.min(k.qty, over); k.qty -= cut; over -= cut;
    }
    renderBudget();
    for (const k of kids) await sb.from('budget_items').update({ qty: k.qty }).eq('id', k.id);
  }));
  /* C2: High / Low の連動 */
  $$('#b-items input[data-pt]').forEach(inp => inp.addEventListener('change', async () => {
    const me = B.items.find(i => i.id === inp.dataset.pt);
    const other = B.items.find(i => i.kind === 'pt' && i.split && i.id !== me.id && i.grp === me.grp);
    const v = Math.min(d.tables, Math.max(0, Number(inp.value) || 0));
    me.manual_qty = v;
    if (other) other.manual_qty = Math.max(0, d.tables - v);
    renderBudget();
    await sb.from('budget_items').update({ manual_qty: me.manual_qty }).eq('id', me.id);
    if (other) await sb.from('budget_items').update({ manual_qty: other.manual_qty }).eq('id', other.id);
  }));
  updateBBulk();
}
function updateBBulk() {
  $('#b-bn').textContent = B.sel.size;
  $('#b-bulk').classList.toggle('on', B.sel.size > 0);
}

/* ---- E1: 個別手配分 ---- */
function renderExt() {
  const payCls = p => p === '支払済' ? 'pp' : p === '検討中' ? '' : 'man';
  $('#b-ext').innerHTML = B.ext.map(e => `<tr>
    <td class="note">${esc(e.category)}</td><td>${esc(e.name)}</td><td>${esc(e.vendor || '')}</td>
    <td class="num">${yen(e.unit_price)}</td><td class="num">${e.qty || 0}</td>
    <td class="num">${yen(extAmount(e))}</td>
    <td><span class="tag ${payCls(e.pay_status)}">${esc(e.pay_status)}</span></td>
    <td><span class="tag">${esc(e.storage_status)}</span></td>
    <td class="note">${esc(e.note || '')}</td>
    <td><button class="btn s o" data-eext="${e.id}">編集</button></td></tr>`).join('') +
    `<tr class="tot"><td colspan="5">合計</td><td class="num">${yen(extTotal())}</td><td colspan="4"></td></tr>`;
  $$('#b-ext [data-eext]').forEach(b => b.addEventListener('click', () => openExtModal(b.dataset.eext)));
}

/* ---- E2: ゲスト別費用 ---- */
function renderGuestCost() {
  const list = S.guests.filter(g => !g.deleted_at &&
    ((g.transport_fee || 0) > 0 || (g.gift_note || '').trim()));
  $('#b-gc').innerHTML = list.map(g => `<tr>
    <td>${esc(fullName(g))}</td><td class="note">${esc(sideLabel(g.side))}</td>
    <td class="num">${g.transport_fee ? yen(g.transport_fee) : '—'}</td>
    <td class="note">${esc(g.transport_note || '')}</td>
    <td>${esc(g.gift_note || '—')}</td>
    <td><button class="btn s o" data-gcost="${g.id}">ゲスト一覧へ</button></td></tr>`).join('') ||
    '<tr><td colspan="6" class="note">お車代・個別ギフトの登録がありません。</td></tr>';
  $('#b-gc').insertAdjacentHTML('beforeend',
    `<tr class="tot"><td colspan="2">合計</td><td class="num">${yen(feeTotal())}</td>
     <td colspan="3">個別ギフト ${list.filter(g => (g.gift_note || '').trim()).length} 件</td></tr>`);
  $$('#b-gc [data-gcost]').forEach(b => b.addEventListener('click', () => {
    go('guests'); renderGuests(); openEditModal(b.dataset.gcost, 'guest');
  }));
}

/* ---- C7: 項目モーダル ---- */
const TAXES = ['税サ込（サ15%＋税10%）','10%税込','8%税込（軽減）','プラン内','課税対象外'];
const KINDS = [['pp','人数連動（大人）'],['fix','固定費'],['pt','卓数連動'],['man','その他'],
               ['kid','お子様メニュー'],['cloth0','クロス（プラン内）'],['cloth','クロス追加分']];
function openItemModal(id) {
  const it = id ? B.items.find(x => x.id === id) : null;
  const box = $('#m-item-box');
  box.innerHTML = `<h3>ホテル見積項目を${it ? '編集' : '追加'}</h3>
    <div class="two">
      <div class="f"><label>カテゴリ</label><input id="if-cat" value="${esc(it?.category || '')}"></div>
      <div class="f"><label>項目名</label><input id="if-name" value="${esc(it?.name || '')}"></div></div>
    <div class="two">
      <div class="f"><label>区分</label><select id="if-kind">${KINDS.map(([v, l]) =>
        `<option value="${v}"${it?.kind === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="f"><label>税込／税サ込単価（円。空欄＝未定）</label>
        <input id="if-unit" type="number" step="0.01" value="${it?.unit_price ?? ''}"></div></div>
    <div class="two">
      <div class="f"><label>基準数（超過分のみ課金）</label>
        <input id="if-base" type="number" min="0" value="${it?.base_qty ?? ''}" placeholder="例：30"></div>
      <div class="f"><label>数量（固定費・その他のとき）</label>
        <input id="if-qty" type="number" min="0" value="${it?.qty ?? ''}" placeholder="例：16"></div></div>
    <div class="two">
      <div class="f"><label>プラン内控除額（円）</label>
        <input id="if-allow" type="number" min="0" value="${it?.allowance ?? 0}"></div>
      <div class="f"><label>税区分（表示用）</label><select id="if-tax">
        ${TAXES.map(t => `<option${it?.tax_label === t ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
    <div class="two">
      <div class="f"><label>支払い状況</label><select id="if-paid">
        <option value="0"${it?.paid ? '' : ' selected'}>未払</option>
        <option value="1"${it?.paid ? ' selected' : ''}>支払済</option></select></div>
      <div class="f"><label>備考</label><input id="if-note" value="${esc(it?.note || '')}"></div></div>
    <div class="row" style="margin:0">
      ${it ? '<button class="btn link" id="if-del">この項目を削除</button>' : ''}
      <span class="sp"></span><button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="if-save">保存</button></div>`;
  wireClose(box);
  $('#if-save').addEventListener('click', async () => {
    const num = sel => $(sel).value.trim() === '' ? null : Number($(sel).value);
    const rec = {
      category: $('#if-cat').value.trim(), name: $('#if-name').value.trim(),
      kind: $('#if-kind').value, unit_price: num('#if-unit'),
      base_qty: num('#if-base') ?? 0, qty: num('#if-qty'),
      allowance: num('#if-allow') ?? 0, tax_label: $('#if-tax').value,
      paid: $('#if-paid').value === '1', note: $('#if-note').value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!rec.category || !rec.name) { toast('カテゴリと項目名は必須です', 'err'); return; }
    const q = it ? sb.from('budget_items').update(rec).eq('id', it.id)
      : sb.from('budget_items').insert({ ...rec, sort_order: (Math.max(0, ...B.items.map(x => x.sort_order || 0)) + 10) });
    const { error } = await q;
    if (error) { toast('保存に失敗：' + error.message, 'err'); return; }
    toast('保存しました', 'ok'); closeModal('m-item'); await loadBudget();
  });
  if (it) $('#if-del').addEventListener('click', async () => {
    const { error } = await sb.from('budget_items')
      .update({ deleted_at: new Date().toISOString() }).eq('id', it.id);
    if (error) { toast('削除に失敗：' + error.message, 'err'); return; }
    toast('削除しました', 'ok'); closeModal('m-item'); await loadBudget();
  });
  openModal('m-item');
}

/* ---- C4: 区分の変更 ---- */
const KIND_CHOICES = [['fix','固定費'],['pp','人数連動'],['pt','卓数連動'],['man','その他'],['kid','お子様メニュー']];
function openKindModal(id) {
  const it = B.items.find(x => x.id === id); if (!it) return;
  const fixed = it.kind === 'cloth' || it.kind === 'cloth0';
  const box = $('#m-item-box');
  box.innerHTML = `<h3>区分を変更：${esc(it.name)}</h3>
    ${fixed ? `<p class="note">この項目は「カラークロス」の特殊計算（プラン内は大人÷10、追加分は卓数＋5−プラン内枚数）を使うため、
      区分は変更できません。計算をやめる場合は、項目を削除して別の区分で作り直してください。</p>
      <div class="row" style="margin:0"><span class="sp"></span><button class="btn o" data-close>閉じる</button></div>`
    : `<div class="f"><label>区分</label><select id="kf-kind">${KIND_CHOICES.map(([v, l]) =>
        `<option value="${v}"${it.kind === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div id="kf-opt"></div>
      <p class="note">区分に使わない設定（基準数・High／Low・数量）は初期値に戻します。</p>
      <div class="row" style="margin:0"><span class="sp"></span>
        <button class="btn o" data-close>キャンセル</button>
        <button class="btn" id="kf-save">保存</button></div>`}`;
  wireClose(box);
  if (!fixed) {
    const draw = () => {
      const k = $('#kf-kind').value;
      $('#kf-opt').innerHTML =
        k === 'fix' || k === 'man' ? `<div class="f"><label>数量</label>
            <input id="kf-qty" type="number" min="0" value="${it.qty ?? 1}"></div>`
      : k === 'pp' ? `<div class="f"><label>基準数（超過分のみ課金。0なら全員分）</label>
            <input id="kf-base" type="number" min="0" value="${it.base_qty ?? 0}"></div>`
      : k === 'pt' ? `<div class="f"><label>卓の分け方</label><select id="kf-split">
            <option value=""${it.split ? '' : ' selected'}>指定なし（全卓）</option>
            <option value="high"${it.split === 'high' ? ' selected' : ''}>High（卓数の半分・切り捨て）</option>
            <option value="low"${it.split === 'low' ? ' selected' : ''}>Low（卓数の半分・切り上げ）</option></select></div>`
      : `<div class="f"><label>数量（空欄なら年齢からの既定割当）</label>
            <input id="kf-kqty" type="number" min="0" value="${it.qty ?? ''}" placeholder="既定割当"></div>`;
    };
    $('#kf-kind').addEventListener('change', draw); draw();
    $('#kf-save').addEventListener('click', async () => {
      const k = $('#kf-kind').value;
      const rec = { kind: k, split: null, manual_qty: null, base_qty: 0, qty: null,
                    updated_at: new Date().toISOString() };
      if (k === 'fix' || k === 'man') rec.qty = Math.max(0, Number($('#kf-qty').value) || 0);
      else if (k === 'pp') rec.base_qty = Math.max(0, Number($('#kf-base').value) || 0);
      else if (k === 'pt') rec.split = $('#kf-split').value || null;
      else if (k === 'kid') rec.qty = $('#kf-kqty').value.trim() === '' ? null : Math.max(0, Number($('#kf-kqty').value));
      const { error } = await sb.from('budget_items').update(rec).eq('id', it.id);
      if (error) { toast('保存に失敗：' + error.message, 'err'); return; }
      toast('区分を変更しました', 'ok'); closeModal('m-item'); await loadBudget();
    });
  }
  openModal('m-item');
}

/* ---- E1: 個別手配分モーダル ---- */
const PAYS = ['検討中','予約済（未払）','支払済'];   // 旧値「購入済（未払）」も表示だけは通す
const STORES = ['—','注文済','自宅保管','ホテル預け'];
function openExtModal(id) {
  const e = id ? B.ext.find(x => x.id === id) : null;
  const box = $('#m-ext-box');
  box.innerHTML = `<h3>個別手配分を${e ? '編集' : '追加'}</h3>
    <div class="two">
      <div class="f"><label>カテゴリ</label><input id="xf-cat" value="${esc(e?.category || '')}"></div>
      <div class="f"><label>品目</label><input id="xf-name" value="${esc(e?.name || '')}"></div></div>
    <div class="two">
      <div class="f"><label>支払い先</label><input id="xf-vendor" value="${esc(e?.vendor || '')}"></div>
      <div class="f"><label>単価（税込）</label><input id="xf-unit" type="number" min="0" value="${e?.unit_price ?? 0}"></div></div>
    <div class="two">
      <div class="f"><label>数量</label><input id="xf-qty" type="number" min="0" value="${e?.qty ?? 0}"></div>
      <div class="f"><label>受取予定日（任意）</label><input id="xf-date" type="date" value="${esc(e?.receive_date || '')}"></div></div>
    <div class="two">
      <div class="f"><label>支払い状況</label><select id="xf-pay">${
        [...new Set([...PAYS, e?.pay_status].filter(Boolean))].map(p =>
        `<option${e?.pay_status === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      <div class="f"><label>保管状況</label><select id="xf-store">${STORES.map(p =>
        `<option${e?.storage_status === p ? ' selected' : ''}>${p}</option>`).join('')}</select></div></div>
    <div class="two">
      <div class="f"><label>引き出物・引き菓子の集計</label><select id="xf-gift">
        <option value=""${e?.gift_type ? '' : ' selected'}>集計に含めない</option>
        <option value="hikidemono"${e?.gift_type === 'hikidemono' ? ' selected' : ''}>引き出物</option>
        <option value="hikigashi"${e?.gift_type === 'hikigashi' ? ' selected' : ''}>引き菓子</option></select></div>
      <div class="f"><label>備考</label><input id="xf-note" value="${esc(e?.note || '')}"></div></div>
    <div class="row" style="margin:0">
      ${e ? '<button class="btn link" id="xf-del">この項目を削除</button>' : ''}
      <span class="sp"></span><button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="xf-save">保存</button></div>`;
  wireClose(box);
  $('#xf-save').addEventListener('click', async () => {
    const rec = {
      category: $('#xf-cat').value.trim(), name: $('#xf-name').value.trim(),
      vendor: $('#xf-vendor').value.trim() || null,
      unit_price: Number($('#xf-unit').value) || 0, qty: Number($('#xf-qty').value) || 0,
      pay_status: $('#xf-pay').value, storage_status: $('#xf-store').value,
      receive_date: $('#xf-date').value || null, gift_type: $('#xf-gift').value || null,
      note: $('#xf-note').value.trim() || null, updated_at: new Date().toISOString(),
    };
    if (!rec.category || !rec.name) { toast('カテゴリと品目は必須です', 'err'); return; }
    const { error } = e ? await sb.from('budget_external').update(rec).eq('id', e.id)
                        : await sb.from('budget_external').insert(rec);
    if (error) { toast('保存に失敗：' + error.message, 'err'); return; }
    toast('保存しました', 'ok'); closeModal('m-ext'); await loadBudget();
  });
  if (e) $('#xf-del').addEventListener('click', async () => {
    const { error } = await sb.from('budget_external')
      .update({ deleted_at: new Date().toISOString() }).eq('id', e.id);
    if (error) { toast('削除に失敗：' + error.message, 'err'); return; }
    toast('削除しました', 'ok'); closeModal('m-ext'); await loadBudget();
  });
  openModal('m-ext');
}

/* ---- D6: 初期見積ポップアップ ---- */
$('#b-initopen').addEventListener('click', () => {
  $('#m-init-box').innerHTML = `
    <div class="row" style="margin-bottom:6px"><h3 style="margin:0">初期見積（ホテル発行 2026/3/28・伝票No -20526）</h3>
      <span class="sp"></span><button class="btn link" data-close>閉じる</button></div>
    <p class="note">見積書の税抜表記のまま転記。合計 ¥3,983,675（税サ込）。現在の試算との比較用で、編集はできません。</p>
    <div class="tblwrap"><table><thead><tr><th>カテゴリ</th><th>商品名</th><th class="num">単価</th>
      <th class="num">数量</th><th class="num">金額</th><th>備考</th></tr></thead><tbody>
      ${INIT.map(r => `<tr><td class="note">${esc(r[0])}</td><td>${esc(r[1])}</td>
        <td class="num">${r[2] == null ? '' : r[2].toLocaleString()}</td>
        <td class="num">${r[3] == null ? '' : r[3]}</td>
        <td class="num" style="color:${r[4] < 0 ? 'var(--enji)' : 'inherit'}">${r[4].toLocaleString()}</td>
        <td class="note">${esc(r[5])}</td></tr>`).join('')}
    </tbody></table></div>
    <table style="margin-top:10px;max-width:360px;margin-left:auto"><tbody>
      <tr><td>割引額合計</td><td class="num">−258,000</td></tr>
      <tr><td>サービス料 15%</td><td class="num">6,750</td></tr>
      <tr><td>消費税 10%</td><td class="num">363,265</td></tr>
      <tr><td>軽減消費税 8%</td><td class="num">5,760</td></tr>
      <tr class="tot"><td>合計</td><td class="num">¥3,983,675</td></tr></tbody></table>`;
  wireClose($('#m-init-box'));
  openModal('m-init');
});

/* ---- 配線 ---- */
$$('#v-budget .sw button').forEach(b => b.addEventListener('click', async () => {
  const col = { adult:'adult_mode', child:'child_mode', tables:'tables_mode', hh:'hh_mode' }[b.dataset.k];
  const mode = b.dataset.src === 'man' ? 'manual' : 'auto';
  const patch = { [col]: mode };
  if (mode === 'manual') {          // 手入力に切り替えた瞬間は、いまの値を引き継ぐ
    const d = drivers();
    patch[{ adult:'adult_manual', child:'child_manual', tables:'tables_manual', hh:'hh_manual' }[b.dataset.k]] = d[b.dataset.k];
  }
  await saveSettings(patch);
  await resetDerived();
  renderBudget();
}));
const DRV_COL = { 'b-adult':'adult_manual', 'b-child':'child_manual', 'b-tables':'tables_manual', 'b-hh':'hh_manual' };
for (const [id, col] of Object.entries(DRV_COL)) {
  $('#' + id).addEventListener('input', async () => {
    if ($('#' + id).readOnly) return;
    await saveSettings({ [col]: Math.max(0, Number($('#' + id).value) || 0) });
    await resetDerived();
  });
}
$('#b-seats').addEventListener('input', async () => {
  await saveSettings({ seats_per_table: Math.max(1, Number($('#b-seats').value) || 8) });
  await resetDerived();
});
$('#b-per').addEventListener('input', () =>
  saveSettings({ gift_per_adult: Math.max(0, Number($('#b-per').value) || 0) }));
['b-fcat','b-ftype','b-fpay','b-hidezero'].forEach(id =>
  $('#' + id).addEventListener('change', renderBudget));
$('#b-chkall').addEventListener('change', e => {
  $$('#b-items .bchk').forEach(c => { c.checked = e.target.checked; c.dispatchEvent(new Event('change')); });
});
$('#b-bclear').addEventListener('click', () => {
  B.sel.clear(); $('#b-chkall').checked = false;
  $$('#b-items .bchk').forEach(c => { c.checked = false; });
  updateBBulk();
});
const setPaid = async v => {
  const ids = [...B.sel];
  if (!ids.length) return;
  ids.forEach(id => { const it = B.items.find(x => x.id === id); if (it) it.paid = v; });
  B.sel.clear();
  renderBudget();
  const { error } = await sb.from('budget_items')
    .update({ paid: v, updated_at: new Date().toISOString() }).in('id', ids);
  if (error) toast('更新に失敗：' + error.message, 'err');
  else toast(`${ids.length} 件を${v ? '支払済' : '未払'}にしました`, 'ok');
};
$('#b-setpaid').addEventListener('click', () => setPaid(true));
$('#b-setunpaid').addEventListener('click', () => setPaid(false));
$('#b-additem').addEventListener('click', () => openItemModal(null));
$('#b-addext').addEventListener('click', () => openExtModal(null));
$('#b-toguests').addEventListener('click', () => { go('guests'); renderGuests(); });
/* C8: 表示中の項目を CSV で書き出す */
$('#b-csv').addEventListener('click', () => {
  const d = drivers(), cur = calc(d, true), rows = visibleItems(cur);
  const cols = ['カテゴリ','項目','区分','税区分','税込単価','数量','プラン内控除','金額','支払い','備考'];
  const line = a => a.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  const csv = '﻿' + [line(cols), ...rows.map(r => line([
    r.it.category, r.it.name, TYPE_LABEL[r.it.kind], r.it.tax_label || '',
    r.it.unit_price == null ? '未定' : Math.round(r.it.unit_price), r.q,
    Math.round(r.it.allowance || 0), Math.round(r.a),
    r.it.paid ? '支払済' : '未払', r.it.note || '',
  ]))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `budget_${ymd(new Date().toISOString())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

/* ============================================================
   配席（Seating）
   会場レイアウトは reference/table_plan.pdf（リーガロイヤルホテル東京 2026-09-26）に準拠。
   卓は「行数・列数・各行の卓数」のグリッドに置く（grid_row / grid_col）。座標は％で持ち、
   キャンバス幅に比例して拡縮する。高砂は卓ではなく、上部中央の固定図形。
   編集はプレビュー／編集モードで、編集中の変更はブラウザ内に保持し「保存」で一括反映する。
   ============================================================ */

/* キャンバスの内部座標系。％→この viewBox に写す */
const VB = { w: 1400, h: 1000, pad: 24 };

/* ---------------- グリッド ---------------- */
const MAX_ROWS = 4, MAX_COLS = 6, SEATS_PER_TABLE = 10;
const DEF_LAYOUT = { rows: 3, cols: 4, counts: [4, 4, 4] };
const DEF_TITLE = '両家結婚披露宴御座席表';
const ALIGNS = [['left', '左寄せ'], ['right', '右寄せ'], ['center', '中央寄せ'], ['ends', '両端寄せ']];
const alignOf = (ev = S.ev) => ALIGNS.some(([k]) => k === ev?.short_row_align) ? ev.short_row_align : 'center';
const ROW_MID = 59, ROW_GAP = 25;        /* 行ブロックの中心（％）と最大の行間 */
const SHAPES = [['round', '丸卓'], ['rect', '角卓']];

/* event_settings の行数・列数・各行の卓数を正規化して返す */
function layoutOf(ev = S.ev) {
  const rows = Math.min(MAX_ROWS, Math.max(1, +ev?.layout_rows || DEF_LAYOUT.rows));
  const cols = Math.min(MAX_COLS, Math.max(1, +ev?.layout_cols || DEF_LAYOUT.cols));
  const src = Array.isArray(ev?.row_counts) ? ev.row_counts : DEF_LAYOUT.counts;
  const counts = [];
  for (let r = 0; r < rows; r++) {
    const v = src[r];
    counts.push(v == null ? cols : Math.min(cols, Math.max(0, +v || 0)));
  }
  return { rows, cols, counts };
}
/* (行, 行内の順番) → 中心座標（％）。各行は左右対称にセンタリング */
function gridPos(r, c, L = layoutOf()) {
  const n = L.counts[r] || 0;
  const pitch = 100 / L.cols;
  /* A2: 卓が列数に満たない行の並べ方。列数と同じ行は影響を受けない */
  const al = n >= L.cols ? 'center' : alignOf();
  let x;
  if (al === 'left') x = (c + 0.5) * pitch;
  else if (al === 'right') x = (L.cols - n + c + 0.5) * pitch;
  else if (al === 'ends') {
    const left = Math.ceil(n / 2), right = n - left;     /* 奇数は左に1つ多く */
    x = c < left ? (c + 0.5) * pitch : (L.cols - right + (c - left) + 0.5) * pitch;
  } else x = 50 + (c - (n - 1) / 2) * pitch;             /* 中央寄せ：奇数は半列ずらして対称に */
  const gap = L.rows === 1 ? 0 : Math.min(ROW_GAP, 52 / (L.rows - 1));
  const y0 = ROW_MID - (L.rows - 1) * gap / 2;
  return { x: +x.toFixed(2), y: +(y0 + r * gap).toFixed(2) };
}
/* 行数・列数が多いときは卓を少し小さく描く */
function layoutScale(L = layoutOf()) {
  return Math.min(L.rows >= 4 ? 0.76 : 1, L.cols >= 6 ? 0.94 : 1);
}
const tableAt = (r, c) => T.tables.find(t => t.grid_row === r && t.grid_col === c) || null;
/* 卓の並び（sort_order 順）。前列の左から右、次の行の左から右 */
const orderedTables = () => T.tables.slice()
  .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
    || (a.grid_row ?? 99) - (b.grid_row ?? 99) || (a.grid_col ?? 99) - (b.grid_col ?? 99));
const gridTotal = (L = layoutOf()) => L.counts.reduce((a, b) => a + b, 0);
/* 配席できる卓（定員 1 以上） */
const guestTables = () => orderedTables().filter(t => (t.capacity || 0) > 0);
/* F1: 参加ゲスト数＝有効な出席回答の reply_people（同行者含む・削除済み除く） */
const attendCount = () => [...T.pool.values()].filter(p => !p.provisional).length;
/* 卓名は自由。新しい卓には未使用の次の記号（数字の卓が主なら次の数字、そうでなければ A, B, …） */
function nextLabel() {
  const used = new Set(T.tables.map(t => String(t.label ?? '').trim()));
  const numeric = T.tables.length && T.tables.every(t => /^\d+$/.test(String(t.label ?? '').trim()));
  if (numeric) { for (let i = 1; ; i++) if (!used.has(String(i))) return String(i); }
  for (let i = 0; ; i++) {
    const s = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + i % 26);
    if (!used.has(s)) return s;
  }
}
const uuid = () => crypto.randomUUID();
/* sort_order と x/y（互換用）をグリッドから決め直す */
/* A1: 並び順（sort_order）から grid_row / grid_col と x / y を決め直す。
   位置は行数・列数・各行の卓数と並び順だけで決まり、手で動かす操作は無い */
function recomputeOrder() {
  const L = layoutOf();
  const slots = [];
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.counts[r]; c++) slots.push([r, c]);
  orderedTables().forEach((t, i) => {
    const [r, c] = slots[i] || [L.rows - 1, (L.counts[L.rows - 1] || 1) - 1];
    t.sort_order = i + 1; t.grid_row = r; t.grid_col = c;
    const p = gridPos(r, c, L);
    t.x = p.x; t.y = p.y;
  });
}
/* A3: 卓の一覧の上下ボタン。隣と sort_order を入れ替える */
function moveTable(id, dir) {
  const list = orderedTables();
  const i = list.findIndex(t => t.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i].sort_order, list[j].sort_order] = [list[j].sort_order, list[i].sort_order];
  recomputeOrder(); renderSeating();
}
function newTable(r, c) {
  const p = gridPos(r, c);
  const last = T.tables.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
  return { id: uuid(), label: nextLabel(), capacity: SEATS_PER_TABLE, shape: 'round', x: p.x, y: p.y,
           w: null, h: null, rotation: 0, memo: null, sort_order: last + 1, grid_row: r, grid_col: c };
}

const T = {
  tables: [], asg: [],
  byTable: new Map(),          // table_id → assignment[]
  asgByPerson: new Map(),      // 'type:id' → assignment
  pool: new Map(),             // 'type:id' → 配席できる人
  peopleById: new Map(),
  folded: false, sel: null, drag: null, view: 'round',
  q: '', sideF: '', circle: '', sort: 'circle',
  open: { un: true, na: true },
  loaded: false,
  edit: false, base: null, since: null, saving: false,   /* C: 編集モード */
};
const pkey = (type, id) => type + ':' + id;

/* ---------------- 読み込み ---------------- */
async function fetchSeatingRows() {
  const [t, a] = await Promise.all([
    sb.from('seating_tables').select('*').order('sort_order'),
    sb.from('seating_assignments').select('*'),
  ]);
  if (t.error || a.error) { toast('配席の読み込みに失敗：' + (t.error || a.error).message, 'err'); return false; }
  T.tables = t.data || []; T.asg = a.data || [];
  return true;
}
async function loadSeating() {
  if (!await fetchSeatingRows()) return;
  T.folded = localStorage.getItem('seatFold') === '1';
  T.view = localStorage.getItem('seatView') === 'list' ? 'list' : 'round';
  $('#sv-note').value = S.ev?.seating_note || '';       /* C1: 全体の申し送り */
  T.pool = buildPool();
  await migrateSeating();          /* 旧データ（高砂の行・座標のみの卓）をグリッドへ（一度だけ） */
  T.loaded = true;
  indexSeating();
  await reconcileSeating();
  await backfillSeats();           /* B1: seat_index が null の割当に採番（一度だけ） */
}
function indexSeating() {
  T.peopleById = new Map(S.people.map(p => [p.id, p]));
  T.byTable = new Map(T.tables.map(t => [t.id, []]));
  T.asgByPerson = new Map();
  for (const a of T.asg) {
    if (!T.byTable.has(a.table_id)) T.byTable.set(a.table_id, []);
    T.byTable.get(a.table_id).push(a);
    T.asgByPerson.set(pkey(a.person_type, a.person_id), a);
  }
  for (const arr of T.byTable.values())
    arr.sort((x, y) => (x.seat_index ?? 99) - (y.seat_index ?? 99));
}
async function reloadSeating() {
  if (!await fetchSeatingRows()) return;
  await loadEventSettings();
  $('#sv-note').value = S.ev?.seating_note || '';
  indexSeating(); renderSeating();
}

/* 旧データの移行：高砂の行は削除し、grid_row/grid_col の無い卓は sort_order 順にグリッドへ置く。
   グリッドに空きがあれば空の卓を足し、収まらない卓があれば行数・列数を広げる。DB へは一度だけ書く */
async function migrateSeating() {
  const heads = T.tables.filter(t => t.shape === 'head');
  if (heads.length) {
    const ids = heads.map(t => t.id);
    T.tables = T.tables.filter(t => !ids.includes(t.id));
    T.asg = T.asg.filter(a => !ids.includes(a.table_id));
    const { error } = await sb.from('seating_tables').delete().in('id', ids);
    if (error) toast('高砂の行の削除に失敗：' + error.message, 'err');
  }
  const ev0 = S.ev || {};
  let L = layoutOf(ev0);
  const evPatch = {};
  if (ev0.layout_rows == null || ev0.layout_cols == null || !Array.isArray(ev0.row_counts)) {
    Object.assign(evPatch, { layout_rows: L.rows, layout_cols: L.cols, row_counts: L.counts });
  }
  /* 卓が全部収まるように行数・列数を広げる */
  {
    const n = T.tables.length;
    let { rows, cols, counts } = L, grew = false;
    while (counts.reduce((a, b) => a + b, 0) < n) {
      const r = counts.findIndex(c => c < cols);
      if (r >= 0) counts[r]++;
      else if (rows < MAX_ROWS) { rows++; counts.push(1); }
      else if (cols < MAX_COLS) { cols++; }
      else break;
      grew = true;
    }
    if (grew) { L = { rows, cols, counts }; Object.assign(evPatch, { layout_rows: rows, layout_cols: cols, row_counts: counts }); }
  }
  if (Object.keys(evPatch).length) {
    Object.assign(S.ev, evPatch);
    const { error } = await sb.from('event_settings').upsert({ id: 1, ...evPatch }, { onConflict: 'id' });
    if (error) toast('レイアウト設定の保存に失敗：' + error.message, 'err');
  }
  /* 位置が余っていれば空の卓を足し、並び順（sort_order）からグリッドを割り当て直す */
  const before = new Map(T.tables.map(t => [t.id, `${t.grid_row},${t.grid_col},${t.sort_order}`]));
  const adds = [];
  for (let k = T.tables.length; k < gridTotal(L); k++) { const t = newTable(0, 0); T.tables.push(t); adds.push(t); }
  recomputeOrder();
  const missing = T.tables.filter(t => before.has(t.id) && before.get(t.id) !== `${t.grid_row},${t.grid_col},${t.sort_order}`);
  const patches = [...missing, ...adds];
  if (!patches.length) return;
  /* 一意制約 (grid_row, grid_col) に当たらないよう、動かす卓の位置をいったん外してから書く */
  const movedIds = missing.map(t => t.id);
  if (movedIds.length) await sb.from('seating_tables').update({ grid_row: null, grid_col: null }).in('id', movedIds);
  const { error } = await sb.from('seating_tables').upsert(patches.map(tableRow), { onConflict: 'id' });
  if (error) toast('卓のグリッド移行に失敗：' + error.message, 'err');
  else toast(`卓の配置をグリッドに移行しました（${missing.length} 卓を配置、${adds.length} 卓を追加）`, 'ok');
}
/* DB に書く卓の行（余計なプロパティを落とす） */
const tableRow = t => ({ id: t.id, label: t.label, capacity: t.capacity, shape: t.shape, x: t.x, y: t.y,
  w: t.w ?? null, h: t.h ?? null, rotation: t.rotation || 0, memo: t.memo ?? null,
  sort_order: t.sort_order, grid_row: t.grid_row, grid_col: t.grid_col });
const asgRow = a => ({ id: a.id, table_id: a.table_id, seat_index: a.seat_index ?? null,
  person_type: a.person_type, person_id: a.person_id, provisional: !!a.provisional });

/* D2: 未回答で仮配席していた人に回答が届いていたら、本人の reply_people の割当に置き換える（読み込み時） */
async function reconcileSeating() {
  const ups = [];
  for (const a of T.asg) {
    if (a.person_type !== 'guest') continue;
    const r = S.replyOfGuest.get(a.person_id);
    if (!r) continue;
    const me = person0(r.id);
    if (!me || me.deleted_at || me.attending !== true) continue;   // 欠席・削除は D1 の「要確認」へ
    if (T.asgByPerson.has(pkey('reply_person', me.id))) continue;  // すでに席がある
    ups.push({ a, pid: me.id });
  }
  if (!ups.length) return;
  for (const u of ups) {
    const { error } = await sb.from('seating_assignments')
      .update({ person_type: 'reply_person', person_id: u.pid, provisional: false }).eq('id', u.a.id);
    if (error) { toast('仮配席の置き換えに失敗：' + error.message, 'err'); continue; }
    u.a.person_type = 'reply_person'; u.a.person_id = u.pid; u.a.provisional = false;
  }
  indexSeating();
  toast(`回答が届いた ${ups.length} 名の仮配席を本人の席に切り替えました`, 'ok');
}

/* ---------------- 配席できる人 ---------------- */
function buildPool() {
  const map = new Map();
  for (const r of S.replies) {
    if (!replyLive(r)) continue;
    const g = r.matched_guest_id ? S.byGuest.get(r.matched_guest_id) : null;
    if (g && g.deleted_at) continue;
    const ps = peopleLive(r.id);
    const me = ps.find(p => p.idx === 0);
    for (const p of ps) {
      if (p.attending !== true) continue;
      map.set(pkey('reply_person', p.id), {
        key: pkey('reply_person', p.id), type: 'reply_person', id: p.id,
        fam: p.family_name, giv: p.given_name, famL: p.family_name_latin, givL: p.given_name_latin,
        side: g?.side || r.side || null,
        circles: g ? (S.circlesOfGuest.get(g.id) || []) : [],
        isChild: !!p.is_child, age: ageAt(p.birthdate, p.age),
        allergy: p.allergy, dietary: p.dietary, kind: kindOf(p), csvKind: csvKind(p),
        /* C3・D2・E1: 座席表のマークと配席CSVで使う */
        title: (p.idx === 0 ? (g?.title || '') : (p.title || '')),
        needs: p.idx === 0 ? (r.needs || '') : '',
        gift: p.idx === 0 ? (g?.gift_note || '') : '',
        chair: !!(p.is_child && p.kids_chair),
        meal: p.is_child ? mealOf(p) : '',
        idx: p.idx,
        comp: p.idx >= 1, headKey: me ? pkey('reply_person', me.id) : null,
        replyId: r.id, guestId: g?.id || null, provisional: false, person: p,
        /* A2: 招待リストの表記が違うときだけ併記用に持つ（本人のみ。同行者は招待リストに無い） */
        listName: !p.idx && nameDiffers(p, g) ? fullName(g) : '',
      });
    }
  }
  for (const g of S.guests) {
    if (g.deleted_at || S.replyOfGuest.get(g.id)) continue;
    map.set(pkey('guest', g.id), {
      key: pkey('guest', g.id), type: 'guest', id: g.id,
      fam: g.family_name, giv: g.given_name, famL: g.family_name_latin, givL: g.given_name_latin,
      side: g.side, circles: S.circlesOfGuest.get(g.id) || [],
      isChild: false, age: null, allergy: null, dietary: null, kind: '未回答', csvKind: '未回答',
      title: g.title || '', needs: '', gift: g.gift_note || '', chair: false, meal: '', idx: 0,
      comp: false, headKey: null, replyId: null, guestId: g.id, provisional: true, person: null,
      listName: '',
    });
  }
  return map;
}
/* D1: 席に残っているが、もう出席者ではない人の表示名 */
function staleName(a) {
  const o = a.person_type === 'guest' ? S.byGuest.get(a.person_id) : T.peopleById.get(a.person_id);
  return o ? fullName(o) : '（削除された人）';
}
function staleWhy(a) {
  if (a.person_type === 'guest') {
    const g = S.byGuest.get(a.person_id);
    if (!g) return '招待者が削除されました';
    if (g.deleted_at) return '招待者が削除されました';
    const r = S.replyOfGuest.get(g.id), me = r && person0(r.id);
    if (me && me.attending === false) return '回答が「欠席」でした';
    return '出席者ではなくなりました';
  }
  const p = T.peopleById.get(a.person_id);
  if (!p) return 'この人の回答行が削除されました';
  if (p.deleted_at) return p.idx === 0 ? '回答の本人が削除されました' : '同行者が削除されました';
  if (p.attending === false) return '回答が「欠席」に変わりました';
  const r = S.byReply.get(p.reply_id);
  if (!r) return '回答が見つかりません';
  if (r.deleted_at) return '回答が削除されました';
  if (r.superseded_by) return 'より新しい回答に置き換えられました';
  return '出席者ではなくなりました';
}
const staleAsg = () => T.asg.filter(a => !T.pool.has(pkey(a.person_type, a.person_id)));

/* ---------------- B. 卓内の席（seat_index 0〜capacity-1） ---------------- */
function seatSlots(tb) {
  const list = T.byTable.get(tb.id) || [];
  const cap = Math.max(0, tb.capacity || 0);
  const seats = new Array(cap).fill(null);
  const extra = [];
  for (const a of list) {
    const i = a.seat_index;
    if (i != null && i >= 0 && i < cap && !seats[i]) seats[i] = a; else extra.push(a);
  }
  return { seats, cap, extra, used: list.length, over: list.length > cap || !!extra.length };
}
const freeSeats = tb => seatSlots(tb).seats.reduce((a, s, i) => (s ? a : (a.push(i), a)), []);
const freeSeat = tb => { const f = freeSeats(tb); return f.length ? f[0] : null; };
/* B5: n 人ぶんの連続した空席の先頭。無ければ null */
const runIn = (taken, n) => {
  for (let i = 0; i + n <= taken.length; i++) {
    let ok = true;
    for (let k = 0; k < n; k++) if (taken[i + k]) { ok = false; break; }
    if (ok) return i;
  }
  return null;
};
const freeRun = (tb, n) => runIn(seatSlots(tb).seats.map(Boolean), n);

/* B1: seat_index が null の割当に、卓ごとに 0 から順に採番して保存する（読み込み時に一度だけ） */
async function backfillSeats() {
  const ups = [];
  for (const tb of T.tables) {
    const list = (T.byTable.get(tb.id) || []).slice()
      .sort((a, b) => (a.seat_index ?? 9999) - (b.seat_index ?? 9999));
    const taken = new Set(list.filter(a => a.seat_index != null).map(a => a.seat_index));
    let k = 0;
    for (const a of list) {
      if (a.seat_index != null) continue;
      while (taken.has(k)) k++;
      taken.add(k); a.seat_index = k;
      ups.push({ id: a.id, seat_index: k }); k++;
    }
  }
  if (!ups.length) return;
  for (const u of ups) {
    const { error } = await sb.from('seating_assignments')
      .update({ seat_index: u.seat_index }).eq('id', u.id);
    if (error) { toast('席番号の採番に失敗：' + error.message, 'err'); await reloadSeating(); return; }
  }
  indexSeating();
  toast(`${ups.length} 名の席番号を採番しました`, 'ok');
}

/* ---------------- 幾何（表示形式で変わる） ---------------- */
const LIST_HALF = 150, LIST_ROWH = 26;
function tableGeom(tb) {
  const s = layoutScale();
  /* B2: 定員0＝選んだ形の輪郭を破線で描き、卓名だけ */
  if ((tb.capacity || 0) <= 0) return { mode: 'zero', shape: tb.shape === 'rect' ? 'rect' : 'round', r: 34 * s, w: 150 * s, h: 54 * s };
  /* B1: 角卓は角丸の長方形。席は長辺の上下に振り分ける */
  if (tb.shape === 'rect') {
    return { mode: 'box', w: tb.w ? tb.w * VB.w / 100 : 300 * s, h: tb.h ? tb.h * VB.h / 100 : 76 * s };
  }
  const cap = Math.max(1, tb.capacity || 1);
  if (T.view === 'list') {
    const rowsL = Math.ceil(cap / 2);
    /* D2: ゲスト向けは肩書きの列ぶん広くとる（卓の間隔 350px には収まる） */
    return { mode: 'list', r: EX.guest ? 0 : 21, rowH: LIST_ROWH,
             half: EX.guest ? 168 : LIST_HALF, rowsL, rowsR: cap - rowsL };
  }
  return { mode: 'round', r: 54 * s, Rs: 70 * s };
}
/* B4: 席 0 は高砂に最も近い席（上）。そこから時計回り。両表示で同じ順序 */
function seatPos(tb, i, cap, g) {
  if (g.mode === 'round') {
    const a = -Math.PI / 2 + i * 2 * Math.PI / cap;
    return { x: g.Rs * Math.cos(a), y: g.Rs * Math.sin(a), c: Math.cos(a) };
  }
  if (g.mode === 'list') {
    const left = i < g.rowsL;
    const n = left ? g.rowsL : g.rowsR;
    const k = left ? i : i - g.rowsL;
    return { left, y: -(n - 1) * g.rowH / 2 + k * g.rowH };
  }
  /* B1: 角卓は長辺の上下に振り分ける（前半＝上、後半＝下）。名前枠は互い違いに高さを変えて重ねない */
  const nTop = Math.ceil(cap / 2), top = i < nTop, n = top ? nTop : cap - nTop, k = top ? i : i - nTop;
  const step = g.w / (n + 1);
  return { x: -g.w / 2 + step * (k + 1), y: top ? -g.h / 2 - 13 : g.h / 2 + 13, c: 0, alt: k % 2 };
}
const tableCenter = tb => ({ cx: tb.x * VB.w / 100, cy: tb.y * VB.h / 100 });

/* プールの人は famL / givL で持つ（reply_people / guests の生の行とは別形） */
const latinOf = p => `${p?.famL ?? ''} ${p?.givL ?? ''}`.trim();
const sideK = s => s === 'groom' ? 'g' : s === 'bride' ? 'b' : 'n';
/* 氏名は回答（reply_people）の現在値。プールに無い＝要確認の人は記録から引く */
function nameParts(p, a) {
  if (p) return { fam: (p.fam || '').trim(), giv: (p.giv || '').trim() };
  const n = staleName(a) || '（不明）';
  const sp = n.split(/[\s　]+/);
  return { fam: sp[0] || n, giv: sp.slice(1).join(' ') };
}
/* B2: 名前は常に全文。漢字姓名が5文字以下なら姓名の間を詰めて1行、
   6文字以上なら「姓」「名」の2行に分ける。ラベル幅はこれに合わせる */
function nameLines(p, a) {
  const { fam, giv } = nameParts(p, a);
  const full = (fam + giv).trim();
  if (!full) return [latinOf(p) || '？'];
  if ([...full].length <= 5) return [full];
  return giv ? [fam || full, giv] : [full];
}
/* D2: ゲスト向けの名前チップ（表形式にならない卓で使う）。「姓名 様」 */
function guestChipLines(p, a) {
  const { fam, giv } = nameParts(p, a);
  const full = (fam + giv).trim();
  if (!full) return [(latinOf(p) || '？') + ' 様'];
  return [...full].length <= 5 ? [full + ' 様'] : [fam || full, (giv || '') + ' 様'];
}
/* 一覧・確認ダイアログ用の1行表記 */
function chipLabel(p, a) {
  const { fam, giv } = nameParts(p, a);
  return (fam + giv).trim() || latinOf(p) || '？';
}
const CH = 12.2;                       /* 12px の日本語1文字ぶんの目安 */
/* 名前の行・肩書き・マークから名前枠の大きさを決める */
function chipBox(lines, markN, title) {
  const n = Math.max(...lines.map(t => [...t].length), title ? [...title].length * 0.78 : 0);
  return {
    w: Math.max(52, 16 + n * CH + markN * (MK_SIZE + MK_GAP)),
    h: (lines.length > 1 ? 30 : 20) + (title ? 11 : 0),
  };
}
/* チップの状態とツールチップ（両表示で共通） */
function chipMeta(a) {
  const p = T.pool.get(pkey(a.person_type, a.person_id));
  const stale = !p;
  const prov = !stale && p.provisional;
  const child = !!p?.isChild;
  const warn = !stale && !!(p.allergy || p.dietary);
  const tip = stale ? `${staleName(a)}｜要確認：${staleWhy(a)}`
    : [`${p.fam ?? ''} ${p.giv ?? ''}`.trim(), latinOf(p), sideLabel(p.side), p.kind,
       p.allergy ? 'アレルギー：' + p.allergy : '', p.dietary ? '食事制限：' + p.dietary : '',
       prov ? '未回答（仮配席）' : '', p.circles.map(c => c.name).join('・'),
       p.listName ? `招待リスト：${p.listName}（回答の表記を優先しています）` : ''].filter(Boolean).join('｜');
  return { p, stale, prov, child, warn, tip, cls:
    ['chip', prov && !EX.guest ? 'prov' : '', stale ? 'stale' : ''].filter(Boolean).join(' ') };
}
/* ---------------- C3: 名前の横のマーク（管理用） ----------------
   すべて単色のインラインSVGピクトグラム。絵文字・画像ファイルは使わない。
   14×14 の座標系で描き、表示サイズに合わせて scale する。線は 1.4px・角は丸め。 */
const MK_ENJI = '#8E1728', MK_KIN = '#B8862B', MK_SUMI = '#2B2B2B', MK_GREY = '#9A938C';
const mkStroke = c => `fill="none" stroke="${c}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"`;
/* 注意記号：三角形の中に感嘆符 */
const pWarn = c => `<path d="M7 1.9 12.9 12.1H1.1Z" ${mkStroke(c)}/>`
  + `<path d="M7 5.7v3" ${mkStroke(c)}/><circle cx="7" cy="10.3" r=".85" fill="${c}"/>`;
/* ナイフとフォーク（左＝フォーク3本歯／右＝ナイフ） */
const pFork = c => `<path d="M3.2 1.9v2.7M4.8 1.9v2.7M6.4 1.9v2.7" ${mkStroke(c)}/>`
  + `<path d="M3.2 4.6h3.2" ${mkStroke(c)}/><path d="M4.8 4.6v7.5" ${mkStroke(c)}/>`
  + `<path d="M10.4 1.9c1.5.9 1.5 3.7 0 4.5" ${mkStroke(c)}/><path d="M10.4 1.9v10.2" ${mkStroke(c)}/>`;
/* ギフト：角丸の箱に横帯、上部に左右のリボンループ */
const pGift = c => `<rect x="1.7" y="5.3" width="10.6" height="7" rx="1.3" ${mkStroke(c)}/>`
  + `<path d="M1.7 8.2h10.6" ${mkStroke(c)}/>`
  + `<path d="M7 5.3C5.6 3.4 4.2 1.9 3.3 2.5c-.9.7-.1 2.2 3.7 2.8Z" ${mkStroke(c)}/>`
  + `<path d="M7 5.3c1.4-1.9 2.8-3.4 3.7-2.8.9.7.1 2.2-3.7 2.8Z" ${mkStroke(c)}/>`;
/* お子様椅子：背もたれが高く脚が長い椅子を横から見た形 */
const pChair = c => `<path d="M3.9 1.8v6.9" ${mkStroke(c)}/><path d="M3.9 8.7h5.3" ${mkStroke(c)}/>`
  + `<path d="M4.2 8.7v3.6M8.9 8.7v3.6" ${mkStroke(c)}/><path d="M4.2 11h4.7" ${mkStroke(c)}/>`;
/* お子様メニュー：薄いグレーのナイフフォークに A／B／C を重ねる（文字は前面・8px） */
const pMeal = ch => pFork(MK_GREY)
  + `<circle cx="7" cy="7.4" r="4.4" fill="#fff" fill-opacity=".92"/>`
  + `<text x="7" y="10.7" font-size="9.4" font-weight="600" text-anchor="middle" fill="${MK_SUMI}"
      font-family="-apple-system,'Hiragino Sans','Yu Gothic',Helvetica,Arial,sans-serif">${esc(ch)}</text>`;

const MARK_DEF = {
  warn:  { tip: '配慮事項あり',         d: () => pWarn(MK_ENJI) },
  fork:  { tip: 'アレルギー・食事制限あり', d: () => pFork(MK_ENJI) },
  gift:  { tip: '個別ギフト',           d: () => pGift(MK_KIN) },
  chair: { tip: 'お子様椅子',           d: () => pChair(MK_SUMI) },
};
/* C3: 表示順＝注意 → ナイフフォーク → ギフト → お子様メニュー → お子様椅子
   （お子様の人型マークは廃止。お子様はメニューのマークで分かる） */
function markList(p) {
  if (!p) return [];
  const out = [];
  if (p.needs) out.push({ k: 'warn' });
  if (p.allergy || p.dietary) out.push({ k: 'fork' });
  if (p.gift) out.push({ k: 'gift' });
  if (p.isChild && p.meal) out.push({ k: 'meal', ch: p.meal });
  if (p.chair) out.push({ k: 'chair' });
  return out;
}
const MK_SIZE = 14, MK_GAP = 2.5;
const markW = list => list.length ? list.length * MK_SIZE + (list.length - 1) * MK_GAP : 0;
/* 左上を (x, y) として横に並べる */
function marksSVG(list, x, y, size) {
  const sz = size || MK_SIZE, sc = sz / 14;
  return list.map((m, i) => {
    const body = m.k === 'meal' ? pMeal(m.ch) : MARK_DEF[m.k].d();
    const tip = m.k === 'meal' ? `お子様メニュー ${m.ch}` : MARK_DEF[m.k].tip;
    return `<g class="mk" transform="translate(${(x + i * (sz + MK_GAP)).toFixed(1)},${y.toFixed(1)}) scale(${sc.toFixed(3)})">`
      + `<title>${esc(tip)}</title>${body}</g>`;
  }).join('');
}
/* C3: 右下の凡例 */
const LEGEND_W = 214, LEGEND_H = 5 * 19 + 24;
function legendSVG(x, y) {
  const rows = [['warn', '配慮事項あり'], ['fork', 'アレルギー・食事制限あり'], ['gift', '個別ギフト'],
                ['meal', 'お子様メニュー（A／B／C）'], ['chair', 'お子様椅子']];
  const rowH = 19, w = 214, h = rows.length * rowH + 24;
  let s = `<g class="legend" transform="translate(${x - w},${y - h})">`
    + `<rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#fff" stroke="#D9CFC4" stroke-width="1"/>`
    + `<text x="12" y="17" font-size="11" fill="#6F665E" letter-spacing=".08em">凡例</text>`;
  rows.forEach(([k, label], i) => {
    const ry = 24 + i * rowH;
    s += marksSVG([{ k, ch: 'B' }], 12, ry, 14)
      + `<text x="32" y="${ry + 10.5}" font-size="11" fill="#2B2B2B">${esc(label)}</text>`;
  });
  return s + '</g>';
}

/* 書き出しの設定。canvasSVG がこの値を見て名前枠の中身を変える */
const EX = { titles: false, guest: false, notesMax: Infinity, rest: [], h: VB.h };
let EXPORTING = false;
/* ---------------- SVG ---------------- */
/* PNG 書き出し（Canvas）でも同じ見た目になるよう、CSS は SVG の中に持たせる */
const SEAT_CSS = `
text{font-family:-apple-system,"Hiragino Sans","Yu Gothic",Helvetica,Arial,sans-serif;fill:#2B2B2B}
.hall{fill:#FBF9F5;stroke:#D9CFC4;stroke-width:2}
.door{stroke:#FBF9F5;stroke-width:5}
.doorl{stroke:#C9C1B7;stroke-width:1.4;stroke-dasharray:4 3;fill:none}
.fx{font-size:13px;fill:#9C9288;letter-spacing:.18em;text-anchor:middle}
.fxv{writing-mode:vertical-rl;text-orientation:upright}
.tbody{fill:#fff;stroke:#C9C1B7;stroke-width:1.6}
.hbody{fill:#F4EFE7;stroke:#8C6E5E;stroke-width:1.6}
.hlabel{font-family:Georgia,"Hiragino Mincho ProN",serif;font-size:14px;letter-spacing:.2em;text-anchor:middle;fill:#8C6E5E}
.hrole{font-size:9.5px;fill:#6F665E;letter-spacing:.1em;writing-mode:vertical-rl;text-orientation:upright;text-anchor:start}
.hname{font-family:"Hiragino Mincho ProN","Yu Mincho",Georgia,serif;font-size:17px;letter-spacing:.12em;fill:#2B2B2B;writing-mode:vertical-rl;text-orientation:upright;text-anchor:start}
.hfam{font-family:"Hiragino Mincho ProN","Yu Mincho",Georgia,serif;font-size:24px;fill:#2B2B2B}
.htitle{font-family:"Hiragino Mincho ProN","Yu Mincho",Georgia,serif;font-size:30px;letter-spacing:.16em;fill:#2B2B2B}
.hinfo{font-size:11.5px;fill:#6F665E;letter-spacing:.06em}
.tb.zero .tbody{fill:#F7F4EF;stroke:#C9C1B7;stroke-dasharray:4 3}
.tlabel.zl{font-size:15px}
.tb.hov .thit{fill-opacity:.06}
.tb.over .tbody{stroke:#8E1728;stroke-width:2.6}
.tb.hov .tbody{stroke:#2B2B2B;stroke-width:2.6;fill:#F6F1E9}
.tb.pick .tbody{stroke:#7FA5D6;stroke-width:3.4;fill:#F3F7FC}
.tb.pick .tlabel{fill:#3d6a9e}
.thit{fill:#fff;fill-opacity:0}
.tlabel{font-family:Georgia,"Hiragino Mincho ProN",serif;font-size:22px;text-anchor:middle}
.tb.head .tlabel{font-size:16px;letter-spacing:.2em}
.tb.list .tlabel{font-size:15px}
.tcount{font-size:11px;fill:#6F665E;text-anchor:middle}
.tb.over .tcount{fill:#8E1728;font-weight:700}
.thead{font-size:11px;fill:#6F665E;text-anchor:middle;letter-spacing:.04em}
.tmemo text{font-size:13px;text-anchor:middle;opacity:.28}
.tmemo.has text{opacity:1}
.shit{fill:#fff;fill-opacity:0}
.sdot{fill:#fff;stroke:#C9C1B7;stroke-width:1.2;stroke-dasharray:2.5 2}
.seat.taken .sdot{stroke-dasharray:none;stroke:#fff;stroke-width:1}
.seat.taken .sdot.g{fill:#7FA5D6}.seat.taken .sdot.b{fill:#8E1728}.seat.taken .sdot.n{fill:#B7ADA1}
.seat.prov .sdot{fill:#fff;stroke-dasharray:2.5 2}
.seat.prov .sdot.g{stroke:#7FA5D6}.seat.prov .sdot.b{stroke:#8E1728}.seat.prov .sdot.n{stroke:#C9C1B7}
.seat.stale .sdot{fill:#fff;stroke:#8E1728;stroke-width:1.6;stroke-dasharray:none}
.seat.drop .sdot{stroke:#2B2B2B;stroke-width:2.4;stroke-dasharray:none}
.cb{fill:#fff;stroke:#D9CFC4;stroke-width:1}
.chip.prov .cb{fill:#FBF9F5;stroke:#C9C1B7;stroke-dasharray:3 2}
.chip.stale .cb{stroke:#8E1728}
.cs.g{fill:#7FA5D6}.cs.b{fill:#8E1728}.cs.n{fill:#D9CFC4}
.chip.prov .cs{opacity:.45}
.ct{font-size:12px}
.chip.prov .ct{fill:#6F665E}
.chip.stale .ct{fill:#8E1728}
.cc{font-size:8.5px;fill:#6F665E;text-anchor:middle}
.cz{stroke:#8E1728;stroke-width:1.2}
.cw{font-size:9px;fill:#B8862B;text-anchor:middle}
.cttl{font-size:9px;fill:#6F665E}
.chip.prov .cttl{fill:#9C9288}
.cxh{fill:#fff;stroke:#D9CFC4;stroke-width:1;opacity:0;pointer-events:none}
.cxt{font-size:11px;fill:#8E1728;text-anchor:middle;opacity:0;pointer-events:none}
.ghead{font-size:15px;fill:#2B2B2B;text-anchor:middle;letter-spacing:.1em;
  font-family:"Hiragino Mincho ProN","Yu Mincho",Georgia,serif}
.lttl{fill:#6F665E}
.tb.list .glabel{font-size:15px;letter-spacing:.14em}
.legend text{fill:#2B2B2B}
.lfam,.lgiv{letter-spacing:.02em}
.lsuf{font-size:10px;fill:#6F665E}
.chip.prov .lfam,.chip.prov .lgiv{fill:#6F665E}
.chip.stale .lfam,.chip.stale .lgiv{fill:#8E1728}
.lrule{stroke:#EDE6DA;stroke-width:1}
.lband{fill:#D9CFC4}
.lband.g{fill:#7FA5D6}.lband.b{fill:#8E1728}
.chip.prov .lband{opacity:.45}
.lrow{fill:#fff;fill-opacity:0}
.chip.prov .lrow{fill:#FBF9F5;fill-opacity:1;stroke:#C9C1B7;stroke-width:1;stroke-dasharray:3 2}
.seat.drop .lrule{stroke:#2B2B2B;stroke-width:2}
.seat.drop .lrow{fill:#F6F1E9;fill-opacity:1;stroke:#2B2B2B;stroke-width:1.4}
.tb.clash .tbody{stroke:#8E1728;stroke-width:3.2;fill:#FBEFEF}
.doorg.clash .doorl{stroke:#8E1728;stroke-dasharray:none;stroke-width:2.4}
.doorg.clash .fx{fill:#8E1728}
.tname{font-size:11px;fill:#6F665E}
.tname b{font-weight:600}
.nttl{font-size:13px;fill:#2B2B2B;letter-spacing:.1em;font-weight:600}
.nh{font-size:12px;fill:#2B2B2B;font-weight:600}
.nt{font-size:11px;fill:#2B2B2B}
.nt.dim{fill:#9C9288}
.ntag{font-size:8.5px;fill:#6F665E;letter-spacing:.04em}
.ntagbox{fill:#F1ECE4;stroke:none}
.nrule{stroke:#D9CFC4;stroke-width:1}
`;
const SEAT_CSS_UI = `
#sv-canvas .chip,#sv-canvas .tb,#sv-canvas .seat{cursor:pointer;touch-action:none}
#sv-canvas .seatgrp:hover .cxh,#sv-canvas .seatgrp:hover .cxt{opacity:1}
#sv-canvas .seatgrp:hover .cxh{pointer-events:all;cursor:pointer}
`;

/* 見出しの日付・会場（右上に小さく） */
const HEAD_DATE = '2026年9月26日', HEAD_VENUE = 'リーガロイヤルホテル東京 ロイヤルホール';
function guestHead() {
  const { gf, gg, bf, bg } = coupleNames();
  const names = [[gf, gg].filter(Boolean).join(' '), [bf, bg].filter(Boolean).join(' ')].filter(Boolean).join('・');
  return [HEAD_DATE, names, HEAD_VENUE].filter(Boolean);
}

/* B7: 出入口は右の壁の下寄り（中心 y と開口の半分の長さ、VB 座標） */
const DOOR_H = 52, DOOR_Y = VB.h - VB.pad - 62;

/* A3: 左上の見出し。両家の姓を縦に2段（上＝新郎の姓を中央寄せ、下＝新婦の姓を字間を広げて左右いっぱいに）、
   その右に座席表タイトルを明朝で大きく */
function headerSVG() {
  const { gf, bf } = coupleNames();
  const title = (S.ev?.chart_title || '').trim() || DEF_TITLE;
  const P = VB.pad, fs = 24, x0 = P + 22, y0 = P + 10;
  const len = Math.max(3, [...gf].length, [...bf].length);   /* 2文字の姓は「吉　永」のように1字あけて広げる */
  const W0 = len * fs;
  let s = `<g class="hdr">`;
  if (gf) s += `<text class="hfam" x="${x0 + W0 / 2}" y="${y0 + fs}" text-anchor="middle">${esc(gf)}</text>`;
  if (bf) s += [...bf].length > 1
    ? `<text class="hfam" x="${x0}" y="${y0 + fs * 2 + 8}" textLength="${W0}" lengthAdjust="spacing">${esc(bf)}</text>`
    : `<text class="hfam" x="${x0 + W0 / 2}" y="${y0 + fs * 2 + 8}" text-anchor="middle">${esc(bf)}</text>`;
  const tx = x0 + (gf || bf ? W0 + 24 : 0);
  s += `<text class="htitle" x="${tx}" y="${y0 + fs * 1.5 + 6}">${esc(title)}</text>`;
  return s + '</g>';
}
/* A1・A2: 高砂は卓ではなく固定の図形。上部中央に置き、新郎（左）・新婦（右）の「名」を縦書きで、
   その上に小さく「新郎」「新婦」。姓は出さない */
const HEAD_BOX = { cx: 50, cy: 11.5, w: 300, h: 112 };
function headSVG() {
  const { gg, bg } = coupleNames();
  const cx = HEAD_BOX.cx * VB.w / 100, cy = HEAD_BOX.cy * VB.h / 100, w = HEAD_BOX.w, h = HEAD_BOX.h;
  const top = cy - h / 2;
  const col = (x, role, name) =>
    `<text class="hrole" x="${x}" y="${top + 9}">${role}</text>`
    + `<text class="hname" x="${x}" y="${top + 36}">${esc(name || '—')}</text>`;
  return `<g class="takasago">`
    + `<rect class="hbody" x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="3"/>`
    + `<text class="hlabel" x="${cx}" y="${cy + 5}">高砂</text>`
    + col(cx - 74, '新郎', gg) + col(cx + 74, '新婦', bg)
    + `</g>`;
}
const headRect = () => {
  const cx = HEAD_BOX.cx * VB.w / 100, cy = HEAD_BOX.cy * VB.h / 100;
  return { x1: cx - HEAD_BOX.w / 2, y1: cy - HEAD_BOX.h / 2, x2: cx + HEAD_BOX.w / 2, y2: cy + HEAD_BOX.h / 2 };
};

function canvasSVG(forExport) {
  EXPORTING = !!forExport;
  const P = VB.pad, W = VB.w, H = VB.h;
  let body = `<rect class="hall" x="${P}" y="${P}" width="${W - P * 2}" height="${H - P * 2}" rx="6"/>`;
  /* B7: 出入口は会場図の右側面・下寄り。右の壁を切り、扉の弧と「出入口」を添える */
  const dh = DOOR_H, dx = W - P, dy = DOOR_Y;
  body += `<g class="doorg">`
       +  `<line class="door" x1="${dx}" y1="${dy - dh}" x2="${dx}" y2="${dy + dh}"/>`
       +  `<path class="doorl" d="M${dx} ${dy - dh} v${dh * 2}"/>`
       +  `<path class="doorl" d="M${dx} ${dy + dh} a${dh * 2.2} ${dh * 2.2} 0 0 1 -7 ${-dh * 2}"/>`
       +  `<text class="fx fxv" x="${dx + 12}" y="${dy}">出入口</text></g>`;
  body += headerSVG() + headSVG();
  /* 右上に日付と会場 */
  body += `<text class="hinfo" x="${W - P - 14}" y="${P + 26}" text-anchor="end">${esc(HEAD_DATE)}</text>`
       +  `<text class="hinfo" x="${W - P - 14}" y="${P + 46}" text-anchor="end">${esc(HEAD_VENUE)}</text>`;
  body += orderedTables().map(tableSVG).join('');
  /* C3: 管理用は会場図の下に「申し送り事項」（左）と凡例（右）の帯を足す。
     帯の高さは内容で決め、EX.notesMax を超えるぶんは EX.rest に残す（PDF の2ページ目） */
  let H2 = H;
  EX.rest = [];
  if (forExport && !EX.guest) {
    const bandY = H - P + 14;
    const band = notesBandSVG(bandY);
    body += band.svg;
    H2 = bandY + band.h + P;
    EX.rest = band.rest;
  }
  EX.h = H2;
  const styles = SEAT_CSS + (forExport ? '' : SEAT_CSS_UI.replace(/#sv-canvas /g, ''));
  const out = `<svg id="sv-canvas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H2}"`
    + (forExport ? ` width="${W}" height="${H2}"` : '')
    + ` preserveAspectRatio="xMidYMid meet"><style>${styles}</style>`
    + `<rect x="0" y="0" width="${W}" height="${H2}" fill="#fff"/>${body}</svg>`;
  EXPORTING = false;
  return out;
}
/* ---------------- C3: 申し送り事項（管理用座席表の左下） ---------------- */
const NOTE_FS = 11, NOTE_LH = 16, NOTE_TAG_W = 60, NOTE_COL_GAP = 28;
const NOTES_ONE_COL_MAX = 220;     /* 1列でこの高さを超えたら2列にする */
const NOTES_BAND_MAX = 330;        /* PDF：帯がこれを超えるぶんは2ページ目へ */
/* 卓名 → 「A卓」。すでに「卓」で終わる名前と高砂はそのまま */
const tblName = t => t.shape === 'head' || /卓$/.test(t.label || '') ? (t.label || '') : `${t.label}卓`;
const byLabel = (a, b) => (a.shape === 'head') - (b.shape === 'head')
  || String(a.label ?? '').localeCompare(String(b.label ?? ''), 'ja', { numeric: true });
/* 印字する行（見出し／本文）。①全体 ②卓ごと ③配慮事項一覧 */
function noteRows() {
  const rows = [];
  const none = () => rows.push({ text: '（なし）', dim: true });
  rows.push({ h: '① 全体の申し送り' });
  const note = (S.ev?.seating_note || '').trim();
  if (note) note.split(/\r?\n/).forEach(l => rows.push({ text: l.trim() || '　' }));
  else none();
  const tables = T.tables.slice().sort(byLabel);
  rows.push({ h: '② 卓ごとの申し送り' });
  const memos = tables.filter(t => (t.memo || '').trim());
  if (memos.length) for (const t of memos)
    rows.push({ text: `${tblName(t)}：${t.memo.trim().replace(/\s*\r?\n\s*/g, '／')}` });
  else none();
  rows.push({ h: '③ 配慮事項一覧' });
  let n = 0;
  for (const t of tables) {
    const { seats, extra } = seatSlots(t);
    [...seats, ...extra].forEach((a, i) => {
      if (!a) return;
      const p = T.pool.get(pkey(a.person_type, a.person_id));
      if (!p) return;
      const who = `${tblName(t)} 席${i + 1} ${[p.fam, p.giv].filter(Boolean).join(' ') || latinOf(p)} 様`;
      const items = [];
      if (p.needs) items.push(['配慮', p.needs]);
      if (p.chair) items.push(['お子様椅子', 'お子様椅子']);
      if (p.allergy) items.push(['アレルギー', p.allergy]);
      if (p.dietary) items.push(['食事制限', p.dietary]);
      for (const [tag, txt] of items) { rows.push({ tag, text: `${who}：${txt}` }); n++; }
    });
  }
  if (!n) none();
  return rows;
}
/* 文字幅の目安（全角＝fs、半角＝0.56fs） */
const textW = (s, fs) => [...String(s ?? '')].reduce((w, c) => w + (c.charCodeAt(0) > 0xff ? fs : fs * 0.56), 0);
function wrapText(s, maxW, fs) {
  const out = []; let cur = '';
  for (const c of [...String(s ?? '')]) {
    if (cur && textW(cur + c, fs) > maxW) { out.push(cur); cur = c; } else cur += c;
  }
  out.push(cur);
  return out;
}
/* rows → 1行ずつの描画単位（折り返し済み） */
function noteLines(rows, colW) {
  const lines = [];
  for (const r of rows) {
    if (r.h) { lines.push({ h: r.h, gap: lines.length ? 8 : 0 }); continue; }
    const ind = r.tag ? NOTE_TAG_W : 0;
    wrapText(r.text, colW - ind, NOTE_FS).forEach((t, i) =>
      lines.push({ text: t, tag: i === 0 ? r.tag : '', ind, dim: r.dim, cont: i > 0 }));
  }
  return lines;
}
const linesH = ls => ls.reduce((a, l) => a + (l.gap || 0) + NOTE_LH, 0);
/* lines を cols 列に流し込む。maxH を超えたぶんは rest に返す */
function notesSVG(lines, x0, y0, w, maxH, cols, title) {
  const colW = (w - NOTE_COL_GAP * (cols - 1)) / cols;
  const top = title ? 24 : 0;
  let s = title ? `<text class="nttl" x="0" y="13">${esc(title)}</text>`
    + `<line class="nrule" x1="0" y1="19" x2="${w}" y2="19"/>` : '';
  let col = 0, y = top, maxY = top, i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i], need = (l.gap || 0) + NOTE_LH;
    if (y + need > maxH) { col++; y = top; if (col >= cols) break; }
    const x = col * (colW + NOTE_COL_GAP);
    y += l.gap || 0;
    const by = y + NOTE_LH - 4;                 /* baseline */
    if (l.h) s += `<text class="nh" x="${x}" y="${by}">${esc(l.h)}</text>`;
    else {
      if (l.tag) s += `<rect class="ntagbox" x="${x}" y="${(y + 2).toFixed(1)}" width="${NOTE_TAG_W - 6}" height="${NOTE_LH - 4}" rx="2"/>`
        + `<text class="ntag" x="${x + (NOTE_TAG_W - 6) / 2}" y="${by - 1}" text-anchor="middle">${esc(l.tag)}</text>`;
      s += `<text class="nt${l.dim ? ' dim' : ''}" x="${x + l.ind}" y="${by}">${esc(l.text)}</text>`;
    }
    y += NOTE_LH; maxY = Math.max(maxY, y);
  }
  return { svg: `<g class="notes" transform="translate(${x0},${y0})">${s}</g>`, h: maxY, rest: lines.slice(i) };
}
/* 会場図の下の帯：左＝申し送り事項、右＝凡例 */
function notesBandSVG(bandY) {
  const P = VB.pad, W = VB.w;
  const areaW = W - P * 2 - LEGEND_W - 30;
  const rows = noteRows();
  let cols = 1, lines = noteLines(rows, areaW), colH = Infinity;
  if (linesH(lines) > NOTES_ONE_COL_MAX) {
    cols = 2; lines = noteLines(rows, (areaW - NOTE_COL_GAP) / 2);
    colH = Math.ceil(linesH(lines) / 2) + 24 + NOTE_LH;      /* 2列に均等に分ける */
  }
  const nt = notesSVG(lines, P, bandY, areaW, Math.min(EX.notesMax, colH), cols, '申し送り事項');
  const h = Math.max(nt.h, LEGEND_H);
  return { svg: nt.svg + legendSVG(W - P, bandY + LEGEND_H), h, rest: nt.rest };
}
/* PDF の2ページ目以降：申し送りの続きだけを1ページに */
function notesPageSVG(rest) {
  const P = VB.pad, W = VB.w, H = VB.h;
  const nt = notesSVG(rest, P, P, W - P * 2, H - P * 2, 2, '申し送り事項（続き）');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
    + `<style>${SEAT_CSS}</style><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${nt.svg}</svg>`;
  return { svg, rest: nt.rest };
}

function tableSVG(tb) {
  const { seats, cap, extra, used, over } = seatSlots(tb);
  const g = tableGeom(tb);
  const { cx, cy } = tableCenter(tb);
  const cls = ['tb', tb.shape, g.mode === 'list' ? 'list' : '', g.mode === 'zero' ? 'zero' : '', over ? 'over' : '',
    (BK.on && BK.tables.has(tb.id)) || (SW.on && SW.tables.includes(tb.id)) ? 'pick' : ''].filter(Boolean).join(' ');
  let s = `<g class="${cls}" data-id="${esc(tb.id)}" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">`;

  if (g.mode === 'zero') {
    /* B2: 定員0の卓（物置き・ケーキ卓など）は形の輪郭を破線で描き、中央に卓名だけ。席も名前欄も描かない */
    s += g.shape === 'rect'
      ? `<rect class="thit" x="${-g.w / 2 - 10}" y="${-g.h / 2 - 10}" width="${g.w + 20}" height="${g.h + 20}" pointer-events="all"/>`
        + `<rect class="tbody" x="${-g.w / 2}" y="${-g.h / 2}" width="${g.w}" height="${g.h}" rx="8"/>`
      : `<circle class="thit" r="${g.r + 10}" pointer-events="all"/><circle class="tbody" r="${g.r}"/>`;
    s += `<text class="tlabel zl" y="6">${esc(tb.label)}</text>`;
  } else if (g.mode === 'round') {
    s += `<circle class="thit" r="${g.Rs + 14}" pointer-events="all"/>`
      +  `<circle class="tbody" r="${g.r}"/>`
      +  `<text class="tlabel" y="-1">${esc(tb.label)}</text>`
      +  (EX.guest ? '' : `<text class="tcount" y="16">${used} / ${cap}</text>`);
  } else if (g.mode === 'list') {
    const h = Math.max(g.rowsL, g.rowsR) * g.rowH;
    s += `<rect class="thit" x="${-g.half - 16}" y="${-h / 2 - 28}" width="${g.half * 2 + 32}" height="${h + 42}" pointer-events="all"/>`;
    /* D1: ゲスト向けは卓名を名簿の見出しに置き、中央の円は描かない */
    s += EX.guest
      ? `<text class="tlabel glabel" y="${-h / 2 - 14}">${esc(tb.label)}</text>`
      : `<circle class="tbody" r="${g.r}"/><text class="tlabel" y="5">${esc(tb.label)}</text>`
        + `<text class="thead" y="${-h / 2 - 12}">${esc(kindHead(tb))}　${used} / ${cap}</text>`;
  } else {
    s += `<rect class="thit" x="${-g.w / 2 - 10}" y="${-g.h / 2 - 72}" width="${g.w + 20}" height="${g.h + 144}" pointer-events="all"/>`
      +  `<rect class="tbody" x="${-g.w / 2}" y="${-g.h / 2}" width="${g.w}" height="${g.h}" rx="10"/>`
      +  `<text class="tlabel" y="2">${esc(tb.label)}</text>`
      +  (EX.guest ? '' : `<text class="tcount" y="19">${used} / ${cap}</text>`);
  }

  /* 卓メモ。編集用の印なので書き出しには出さない。表形式では中央の円の真上に置く */
  if (!EXPORTING) {
    const zr = g.mode === 'zero' && g.shape === 'rect';
    const mx = g.mode === 'round' ? g.r * 0.52 : zr ? g.w / 2 - 12 : g.mode === 'zero' ? g.r * 0.7 : g.mode === 'list' ? 0 : g.w / 2 - 13;
    const my = g.mode === 'round' ? -g.r * 0.52 : zr ? -g.h / 2 + 12 : g.mode === 'zero' ? -g.r * 0.7 : g.mode === 'list' ? -g.r - 13 : -g.h / 2 + 15;
    s += `<g class="tmemo${tb.memo ? ' has' : ''}" data-memo="${esc(tb.id)}" transform="translate(${mx.toFixed(1)},${my.toFixed(1)})">`
      +  `<title>${esc(tb.memo ? `メモ：${tb.memo}` : 'メモを追加')}</title>`
      +  `<circle r="10" fill="#fff" fill-opacity="0" pointer-events="all"/><text y="4.5">📝</text></g>`;
  }

  for (let i = 0; i < cap; i++) s += seatSVG(tb, i, seats[i], cap, g);
  /* 定員から外れてしまった割当（定員を減らしたあとなど）は卓の下に並べる */
  extra.forEach((a, k) => { s += `<g class="seatgrp">` + chipSVG(a, 0,
    ((g.mode === 'round' ? g.Rs + 26 : g.mode === 'zero' ? (g.shape === 'rect' ? g.h / 2 + 18 : g.r + 22) : g.h / 2 + 76) + k * 26), 'c', tb, null) + `</g>`; });
  return s + '</g>';
}
/* C3: 卓の上の見出し */
function kindHead(tb) {
  const list = T.byTable.get(tb.id) || [];
  let ad = 0, ch = 0;
  for (const a of list) {
    const p = T.pool.get(pkey(a.person_type, a.person_id));
    if (p?.isChild) ch++; else ad++;
  }
  return `大人 ${ad} 名／子ども ${ch} 名`;
}

/* 席（丸／行）。空席も描いてドロップ先にする */
function seatSVG(tb, i, a, cap, g) {
  const pos = seatPos(tb, i, cap, g);
  const m = a ? chipMeta(a) : null;
  const cls = ['seat', a ? 'taken' : 'free', m?.stale ? 'stale' : '',
    m?.prov && !EX.guest ? 'prov' : ''].filter(Boolean).join(' ');
  const at = `data-t="${esc(tb.id)}" data-s="${i}"${a ? ` data-a="${esc(a.id)}"` : ''}`;
  if (g.mode === 'list') return listRowSVG(tb, i, a, g, cls, at, m, pos);
  /* B3: 席と名前枠を1つの group にまとめ、この席にホバーしたときだけ「×」を出す */
  let s = `<g class="seatgrp">`
    + `<g class="${cls}" ${at} transform="translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)})">`
    + `<title>${a ? esc(m.tip) : `席 ${i + 1}（空席）`}</title>`
    + `<circle class="sdot ${sideK(m?.p?.side)}" r="6.5"/>`
    + `<circle class="shit" r="13" pointer-events="all"/></g>`;
  if (a) {
    /* ラベルは席の外側。左右に振り分け、真上・真下の席は縦にずらして重なりを避ける */
    const centered = Math.abs(pos.c) < 0.2;
    const off = 22 + (pos.alt ? 26 : 0);
    if (centered) s += chipSVG(a, pos.x, pos.y + (pos.y < 0 ? -off : off), 'c', tb, i);
    else s += chipSVG(a, pos.x, pos.y, pos.c >= 0 ? 'r' : 'l', tb, i);
  }
  return s + '</g>';
}

/* 円卓表示の名前チップ。align: 'l'=席の左／'r'=席の右／'c'=中央そろえ
   B2: 名前は省略せず、5文字以下は1行・6文字以上は姓／名の2行。枠幅はこれに合わせる。
   C3: マークはインラインSVG。C4: 肩書き付きのときは名前の下に小さく入れる。 */
function chipSVG(a, x, y, align, tb, seat) {
  const m = chipMeta(a);
  const lines = EX.guest ? guestChipLines(m.p, a) : nameLines(m.p, a);
  const title = (EX.titles || EX.guest) ? (m.p?.title || '') : '';
  const marks = EX.guest ? [] : markList(m.p);          /* D2: ゲスト向けにはマークを出さない */
  const b = chipBox(lines, marks.length, title);
  const w = b.w, h = b.h;
  const cxp = align === 'c' ? x : align === 'r' ? x + 11 + w / 2 : x - 11 - w / 2;
  const L = -w / 2, Tp = -h / 2;
  const at = tb && seat != null ? `data-t="${esc(tb.id)}" data-s="${seat}"` : '';
  let s = `<g class="${m.cls}" data-a="${esc(a.id)}" ${at} transform="translate(${cxp.toFixed(1)},${y.toFixed(1)})">`
    + `<title>${esc(m.tip)}</title>`
    + `<rect class="cb" x="${L}" y="${Tp}" width="${w}" height="${h}" rx="3"/>`
    + `<rect class="cs ${sideK(m.p?.side)}" x="${L}" y="${Tp}" width="3.5" height="${h}"/>`;
  let ty = Tp + 14;
  for (const t of lines) { s += `<text class="ct" x="${L + 8}" y="${ty.toFixed(1)}">${esc(t)}</text>`; ty += 13.5; }
  if (title) s += `<text class="cttl" x="${L + 8}" y="${(ty - 1.5).toFixed(1)}">${esc(title)}</text>`;
  if (marks.length) s += marksSVG(marks, w / 2 - 6 - markW(marks), -MK_SIZE / 2);
  if (m.stale) s += `<line class="cz" x1="${L + 1}" y1="${h / 2 - 1}" x2="${w / 2 - 1}" y2="${-h / 2 + 1}"/>`;
  /* B3: 「未配席に戻す」は名前枠の外側・左。席にホバーしたときだけ出る */
  const xc = L - 10;
  s += `<g class="cxg" data-x="${esc(a.id)}"><circle class="cxh" cx="${xc}" cy="0" r="7.5"/>`
    +  `<text class="cxt" x="${xc}" y="3.6">×</text></g></g>`;
  return s;
}

/* 列に入りきらない長さの名前は、切らずに字を詰めて収める（B2: 名前は常に全文） */
const fitFS = (t, n, base) => {
  const l = [...String(t || '')].length;
  return l > n ? Math.max(8, +(base * n / l).toFixed(2)) : base;
};
/* C3: 表形式表示の1行。「姓　名 様」を列で縦に揃える。
   左列＝前半の席、右列＝後半の席。中央の卓名の円には重ねない。
   D2: ゲスト向けは肩書きを本人＝氏名の前、同行者＝「様」の後ろに置く */
function listRowSVG(tb, i, a, g, cls, at, m, pos) {
  const left = pos.left, y = pos.y, H = g.half;
  const G = EX.guest;
  const pre = G ? 28 : 0;                        /* ゲスト向け：本人の肩書きを置く列 */
  const cw = G ? 36 : 45;
  const x0 = (left ? -H + 4 : (G ? 4 : 25)) + pre;   /* 姓 */
  const x1 = x0 + cw;                            /* 名 */
  const x2 = x1 + cw;                            /* 様 */
  const bx = left ? -H : H - 3;                  /* side の色帯（外側） */
  const hx = left ? -H - 3 : (G ? 3 : 24);       /* ドロップ領域（中央の円に重ねない） */
  const hw = G ? H - 3 : H - 21;
  let s = `<g class="${cls}${a ? ' chip' : ''} seatgrp" ${at} transform="translate(0,${y.toFixed(1)})">`
    + `<title>${a ? esc(m.tip) : `席 ${i + 1}（空席）`}</title>`
    + `<rect class="lrow" x="${hx}" y="-11" width="${hw}" height="22" rx="2"/>`
    + `<rect class="lhit" x="${hx}" y="-12" width="${hw}" height="24" fill="#fff" fill-opacity="0" pointer-events="all"/>`;
  if (!a) return s + (G ? '' : `<line class="lrule" x1="${x0}" y1="7" x2="${x2 + 28}" y2="7"/>`) + '</g>';
  const { fam, giv } = nameParts(m.p, a);
  const ttl = (EX.titles || G) ? (m.p?.title || '') : '';
  const marks = G ? [] : markList(m.p);                  /* D2: ゲスト向けにはマークを出さない */
  /* D2: 同行者の肩書きは「様」の後ろ、本人の肩書きは氏名の前 */
  const suffix = G && m.p?.comp ? ttl : '';
  const prefix = G && ttl && !m.p?.comp ? ttl : '';
  if (!G) s += `<rect class="lband ${sideK(m.p?.side)}" x="${bx}" y="-9" width="3" height="18"/>`;
  if (prefix) s += `<text class="lttl" x="${x0 - 4}" y="4" text-anchor="end"`
    + ` font-size="${fitFS(prefix, 3, 9.5)}">${esc(prefix)}</text>`;
  const fs = G ? 10.8 : 11.5;
  s += `<text class="lfam" x="${x0}" y="4" font-size="${fitFS(fam, 3, fs)}">${esc(fam)}</text>`
    +  `<text class="lgiv" x="${x1}" y="4" font-size="${fitFS(giv, 3, fs)}">${esc(giv)}</text>`
    +  `<text class="lsuf" x="${x2}" y="4">様</text>`;
  let ex = x2 + 16;
  if (suffix) { s += `<text class="lttl" x="${ex}" y="4" font-size="${fitFS(suffix, 3, 9.5)}">${esc(suffix)}</text>`;
                ex += [...suffix].length * 9.5 + 4; }
  if (!G && (EX.titles && ttl)) { s += `<text class="lttl" x="${ex}" y="4" font-size="${fitFS(ttl, 3, 9.5)}">${esc(ttl)}</text>`;
                                  ex += [...ttl].length * 9.5 + 4; }
  if (marks.length) s += marksSVG(marks, ex, -MK_SIZE / 2);
  if (m.stale) s += `<line class="cz" x1="${x0 - 3}" y1="8" x2="${x2 + 26}" y2="-8"/>`;
  const xc = left ? -H + 1 : H - 1;
  s += `<g class="cxg" data-x="${esc(a.id)}"><circle class="cxh" cx="${xc}" cy="0" r="7.5"/>`
    +  `<text class="cxt" x="${xc}" y="3.6">×</text></g></g>`;
  return s;
}

/* ---------------- 描画 ---------------- */
function renderSeating() {
  if (!T.loaded) return;
  T.pool = buildPool();
  const stale = staleAsg();
  const seated = new Set(T.asg.map(a => pkey(a.person_type, a.person_id)));
  const attend = [...T.pool.values()].filter(p => !p.provisional);
  const done = attend.filter(p => seated.has(p.key)).length;
  const prov = T.asg.filter(a => {
    const p = T.pool.get(pkey(a.person_type, a.person_id)); return p && p.provisional;
  }).length;
  const over = T.tables.filter(t => seatSlots(t).over).length;

  $('#sv-done').textContent = done;
  $('#sv-att').textContent = attend.length;
  $('#sv-un').textContent = attend.length - done;
  $('#sv-prov').textContent = prov;
  $('#sv-over').textContent = over;
  $('#sv-over').closest('.sstat').classList.toggle('on', over > 0);
  const stb = $('#sv-stale');
  stb.hidden = !stale.length;
  if (stale.length) stb.querySelector('b').textContent = stale.length;
  /* B6: 定員0の卓は卓数・定員の集計から外す */
  const gs = guestTables(), zero = T.tables.length - gs.length;
  $('#sv-venue').textContent = `リーガロイヤルホテル東京｜ゲスト卓 ${gs.length} 卓・`
    + `定員 ${gs.reduce((n, t) => n + (t.capacity || 0), 0)} 名`
    + (zero ? `（＋定員0の卓 ${zero}）` : '');

  renderGridBar();
  renderEditBar();
  renderSwapBar();
  $$('#sv-view button').forEach(b => b.classList.toggle('on', b.dataset.v === T.view));
  $('#sv-bulk').classList.toggle('on', BK.on);
  $('#sv-bulk').textContent = BK.on ? '一括配席をやめる' : '一括配席';
  $('#sv-wrap').classList.toggle('bulkmode', BK.on);
  $('#sv-wrap').classList.toggle('pv', !T.edit);
  $('#sv-box').innerHTML = canvasSVG(false);
  renderSeatSide();
  $('#sv-wrap').classList.toggle('folded', T.folded);
  $('#sv-unfold').hidden = !T.folded;
  $('#sv-fold').textContent = T.folded ? 'サイドバーを表示' : 'サイドバーを隠す';
}

/* 上部バーの行数・列数・各行の卓数と「1卓あたり平均」 */
function renderGridBar() {
  const L = layoutOf();
  const opt = (n, cur) => Array.from({ length: n }, (_, i) => i + 1)
    .map(i => `<option value="${i}"${i === cur ? ' selected' : ''}>${i}</option>`).join('');
  const dis = T.edit ? '' : ' disabled';
  $('#sv-grid').innerHTML = `
    <label class="cntbox">行 <select id="sv-rows"${dis}>${opt(MAX_ROWS, L.rows)}</select></label>
    <label class="cntbox">列 <select id="sv-cols"${dis}>${opt(MAX_COLS, L.cols)}</select></label>
    <span class="cntbox rc">各行の卓数 ${L.counts.map((c, r) =>
      `<input type="number" class="rcin" data-r="${r}" min="0" max="${L.cols}" value="${c}" title="${r + 1}行目"${dis}>`).join('')}</span>
    <label class="cntbox" title="卓が列数に満たない行（主に最終行）の並べ方">足りない行の並べ方 <select id="sv-align"${dis}>${ALIGNS.map(([k, l]) =>
      `<option value="${k}"${alignOf() === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
  $('#sv-align').addEventListener('change', e => {
    if (needEdit()) { renderGridBar(); return; }
    S.ev = { ...(S.ev || {}), short_row_align: e.target.value };
    recomputeOrder(); renderSeating();
  });
  $('#sv-rows').addEventListener('change', e => changeGrid({ rows: +e.target.value }));
  $('#sv-cols').addEventListener('change', e => changeGrid({ cols: +e.target.value }));
  $$('#sv-grid .rcin').forEach(inp => inp.addEventListener('change', () => {
    const counts = L.counts.slice();
    counts[+inp.dataset.r] = Math.min(L.cols, Math.max(0, +inp.value || 0));
    changeGrid({ counts });
  }));
  const gs = guestTables(), att = attendCount();
  /* B5・B6: 平均も不足席数も、定員 1 以上の卓の capacity 合計から出す */
  const capSum = gs.reduce((n, t) => n + (t.capacity || 0), 0);
  const short = Math.max(0, att - capSum);
  $('#sv-avg').textContent = gs.length
    ? `1卓あたり平均 ${(capSum / gs.length).toFixed(1)} 席`
    : '1卓あたり平均 — 席';
  $('#sv-min').textContent = `定員合計 ${capSum} 席／出席 ${att} 名／`
    + (short ? `不足 ${short} 席` : '不足なし');
  $('#sv-min').classList.toggle('short', short > 0);
}

/* A3: 編集モードの「卓の一覧」。上下ボタンで並びを変える（前列の左から右、次の行の左から右） */
function renderTableList() {
  const box = $('#sv-tlist');
  box.hidden = !T.edit;
  if (!T.edit) { box.innerHTML = ''; return; }
  const list = orderedTables();
  const shapeName = t => (SHAPES.find(([v]) => v === t.shape) || SHAPES[0])[1];
  box.innerHTML = `<div class="tlhd"><b>卓の一覧</b><span class="note">上下ボタンで並びを変えます。並びは前列の左から右、次の行の左から右の順です。卓名などは「編集」から。</span></div>
    <table class="tltbl"><thead><tr><th>順</th><th>位置</th><th>卓名</th><th>形</th><th class="num">定員</th><th class="num">配席</th><th></th></tr></thead><tbody>
    ${list.map((t, i) => `<tr data-id="${esc(t.id)}"><td class="num">${i + 1}</td>
      <td>${t.grid_row + 1} 行目・${t.grid_col + 1} 番目</td><td><b>${esc(t.label)}</b>${t.memo ? ' <span class="note">📝</span>' : ''}</td>
      <td>${shapeName(t)}</td><td class="num">${t.capacity}</td><td class="num">${(T.byTable.get(t.id) || []).length}</td>
      <td class="act"><button class="btn s o" data-up="${esc(t.id)}"${i === 0 ? ' disabled' : ''} title="ひとつ前へ">▲</button>
        <button class="btn s o" data-down="${esc(t.id)}"${i === list.length - 1 ? ' disabled' : ''} title="ひとつ後ろへ">▼</button>
        <button class="btn link" data-edit="${esc(t.id)}">編集</button></td></tr>`).join('')}</tbody></table>`;
  $$('[data-up]', box).forEach(b => b.addEventListener('click', () => moveTable(b.dataset.up, -1)));
  $$('[data-down]', box).forEach(b => b.addEventListener('click', () => moveTable(b.dataset.down, 1)));
  $$('[data-edit]', box).forEach(b => b.addEventListener('click', () => openTableModal(b.dataset.edit)));
}
/* C2: 編集中の帯と、モードで変わるボタンの状態 */
function renderEditBar() {
  const n = T.edit ? seatDiff().count : 0;
  const band = $('#sv-editband');
  band.hidden = !T.edit;
  $('#sv-nchg').textContent = n;
  $('#sv-save').disabled = T.saving;
  $('#sv-discard').disabled = T.saving;
  $('#sv-edit').hidden = T.edit;
  $('#sv-mode').textContent = T.edit ? '編集モード' : 'プレビューモード';
  $('#sv-mode').classList.toggle('editing', T.edit);
  renderTableList();
  for (const id of ['sv-bulk', 'sv-swap']) $('#' + id).disabled = !T.edit;
  $('#sv-note').readOnly = !T.edit;
  $('#sv-notehint').textContent = T.edit ? '編集中（保存で反映）' : '編集モードで書き換えられます';
}
function seatRowHTML(p, indent) {
  const nm = `${p.fam ?? ''} ${p.giv ?? ''}`.trim() || latinOf(p) || '（無名）';
  const lat = latinOf(p).toUpperCase();
  const warnTip = [p.allergy && 'アレルギー：' + p.allergy, p.dietary && '食事制限：' + p.dietary]
    .filter(Boolean).join(' / ');
  return `<div class="srw${indent ? ' ind' : ''}${T.sel === p.key ? ' sel' : ''}" data-k="${esc(p.key)}">
    <span class="sband ${sideK(p.side)}" title="${esc(sideLabel(p.side))}"></span>
    <div class="nm"><b>${esc(nm)}</b>${lat ? `<small>${esc(lat)}</small>` : ''}
      ${p.listName ? `<small class="listname" title="回答の表記を優先しています">招待リスト：${esc(p.listName)}</small>` : ''}
      ${p.circles.length ? `<small class="cir">${p.circles.map(c =>
        `<span class="tag circle">${esc(c.name)}</span>`).join('')}</small>` : ''}</div>
    <div class="mk">${p.isChild ? `<span class="tag grey">子${p.age != null ? '・' + p.age + '歳' : ''}</span>` : ''}
      ${warnTip ? `<span class="wico" title="${esc(warnTip)}">⚠</span>` : ''}</div>
  </div>`;
}

function unseatedLists() {
  const seated = new Set(T.asg.map(a => pkey(a.person_type, a.person_id)));
  const q = norm(T.q);
  const pass = p => {
    if (seated.has(p.key)) return false;
    if (q && !norm([p.fam, p.giv, p.famL, p.givL].join(' ')).includes(q)) return false;
    if (T.sideF === 'none') { if (p.side) return false; }
    else if (T.sideF && p.side !== T.sideF) return false;
    if (T.circle === '__none') { if (p.circles.length) return false; }
    else if (T.circle && !p.circles.some(c => c.id === T.circle)) return false;
    return true;
  };
  const key = p => T.sort === 'latin'
    ? latinOf(p).toLowerCase() + '@' + (p.fam || '')
    : (p.circles[0]?.name || '￿') + '@' + latinOf(p).toLowerCase();

  /* 同行者は本人の直下にインデント。絞り込みは世帯単位（本人が残れば同行者も残す） */
  const build = list => {
    const heads = list.filter(p => !p.comp);
    const byHead = new Map(heads.map(h => [h.key, []]));
    const orphans = [];
    for (const p of list) {
      if (!p.comp) continue;
      if (p.headKey && byHead.has(p.headKey)) byHead.get(p.headKey).push(p); else orphans.push(p);
    }
    const cmp = (a, b) => key(a).localeCompare(key(b), 'ja');
    heads.sort(cmp); orphans.sort(cmp);
    const out = [];
    for (const h of heads) {
      const kids = byHead.get(h.key);
      const hOK = pass(h), kOK = kids.some(pass);
      if (!hOK && !kOK) continue;
      if (hOK) out.push({ p: h, ind: false });
      for (const c of kids) if (!seated.has(c.key) && (hOK || pass(c))) out.push({ p: c, ind: true });
    }
    for (const o of orphans) if (pass(o)) out.push({ p: o, ind: true });
    return out;
  };
  const all = [...T.pool.values()];
  return {
    un: build(all.filter(p => !p.provisional)),
    na: build(all.filter(p => p.provisional)),
  };
}

function renderSeatSide() {
  const { un, na } = unseatedLists();
  const sec = (k, title, hint, rows) => `
    <section class="sacc${T.open[k] ? ' open' : ''}" data-acc="${k}">
      <button class="ahd"><span class="tw">${T.open[k] ? '▾' : '▸'}</span>${title}<b>${rows.length}</b></button>
      <div class="abd">${hint ? `<p class="note">${hint}</p>` : ''}
        ${rows.length ? rows.map(r => seatRowHTML(r.p, r.ind)).join('')
          : '<p class="note empty2">該当する人はいません</p>'}</div>
    </section>`;
  $('#sv-list').innerHTML = (BK.on ? bulkPanelHTML() : '') +
    sec('un', '未配席（出席回答あり）', '', un) +
    sec('na', '未回答', '仮配席としてドラッグできます。回答が届くと本人の席に自動で切り替わります。', na);
  wireBulkPanel();

  const note = $('#sv-selnote');
  const p = T.sel ? T.pool.get(T.sel) : null;
  if (!p) { T.sel = null; note.hidden = true; return; }
  note.hidden = false;
  note.innerHTML = `<b>${esc(`${p.fam ?? ''} ${p.giv ?? ''}`.trim())}</b> を選択中。配席したい卓をタップしてください。
    <button class="btn link" id="sv-unsel">選択解除</button>`;
  $('#sv-unsel').addEventListener('click', () => { T.sel = null; renderSeatSide(); });
}

/* ============================================================
   C. プレビュー／編集モード
   編集中の変更はすべてブラウザ内（T.tables / T.asg / S.ev）に持ち、「保存」で差分をまとめて書く。
   ============================================================ */
const TB_F = ['label', 'capacity', 'shape', 'memo', 'sort_order', 'grid_row', 'grid_col'];
const AS_F = ['table_id', 'seat_index', 'person_type', 'person_id', 'provisional'];
const EV_F = ['seating_note', 'layout_rows', 'layout_cols', 'row_counts', 'short_row_align'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function snapshot() {
  return { tables: T.tables.map(t => ({ ...t })), asg: T.asg.map(a => ({ ...a })),
           ev: { ...(S.ev || {}), row_counts: Array.isArray(S.ev?.row_counts) ? [...S.ev.row_counts] : null } };
}
/* 編集前の状態との差分 */
function seatDiff() {
  const b = T.base || snapshot();
  const bt = new Map(b.tables.map(t => [t.id, t])), ct = new Map(T.tables.map(t => [t.id, t]));
  const ba = new Map(b.asg.map(a => [a.id, a])), ca = new Map(T.asg.map(a => [a.id, a]));
  const delTables = [...bt.keys()].filter(id => !ct.has(id));
  const upTables = T.tables.filter(t => !bt.has(t.id) || TB_F.some(k => !same(t[k], bt.get(t.id)[k])));
  const delAsg = [...ba.keys()].filter(id => !ca.has(id) && !delTables.includes(ba.get(id).table_id));
  const upAsg = T.asg.filter(a => !ba.has(a.id) || AS_F.some(k => !same(a[k], ba.get(a.id)[k])));
  const ev = {};
  for (const k of EV_F) if (!same(S.ev?.[k], b.ev?.[k])) ev[k] = S.ev?.[k] ?? null;
  const count = delTables.length + upTables.length + delAsg.length + upAsg.length + Object.keys(ev).length;
  return { delTables, upTables, delAsg, upAsg, ev, count,
           movedTables: upTables.filter(t => bt.has(t.id)).map(t => t.id),
           movedAsg: upAsg.filter(a => ba.has(a.id)).map(a => a.id) };
}
const hasUnsaved = () => T.edit && seatDiff().count > 0;

/* C6: 各表の updated_at の最大値 */
async function fetchSince() {
  const last = async (tbl) => {
    const { data } = await sb.from(tbl).select('updated_at').order('updated_at', { ascending: false }).limit(1);
    return data?.[0]?.updated_at || null;
  };
  const [tables, asg] = await Promise.all([last('seating_tables'), last('seating_assignments')]);
  const { data } = await sb.from('event_settings').select('updated_at').eq('id', 1).maybeSingle();
  return { tables, asg, ev: data?.updated_at || null };
}
const newer = (db, mine) => !!db && (!mine || new Date(db) > new Date(mine));

async function enterEdit() {
  if (T.edit) return;
  if (!await fetchSeatingRows()) return;
  await loadEventSettings();
  $('#sv-note').value = S.ev?.seating_note || '';
  indexSeating();
  T.since = await fetchSince();
  T.base = snapshot();
  T.edit = true;
  renderSeating();
  toast('編集モードです。変更は「保存」で反映されます', 'ok');
}
function exitEdit() {
  T.edit = false; T.base = null; T.since = null;
  BK.on = false; BK.tables.clear(); SW.on = false; SW.tables = []; T.sel = null; closeSeatPop();
  renderSeating();
}
/* C5: 破棄 */
function discardEdits() {
  if (!T.edit) return;
  const run = () => {
    const b = T.base;
    T.tables = b.tables.map(t => ({ ...t })); T.asg = b.asg.map(a => ({ ...a }));
    S.ev = { ...b.ev };
    $('#sv-note').value = S.ev?.seating_note || '';
    indexSeating();
    exitEdit();
    toast('変更を破棄しました', 'ok');
  };
  const n = seatDiff().count;
  if (!n) { run(); return; }
  askSeat('変更を破棄します', `未保存の変更が ${n} 件あります。`, '編集前の状態に戻します。よろしいですか。', run, '破棄する');
}
/* C5: 未保存のまま別タブへ移ろうとしたときの確認。true を返すと go() を止める */
function seatLeaveGuard(v) {
  if (v === 'seating' || !$('#v-seating').classList.contains('on') || !hasUnsaved()) return false;
  const box = $('#m-seatask-box');
  box.innerHTML = `<h3>未保存の変更があります</h3>
    <p class="note">配席の編集中です。未保存の変更が ${seatDiff().count} 件あります。</p>
    <p style="margin:14px 0 18px">保存せずに移動すると変更は失われます。</p>
    <div class="row" style="justify-content:flex-end;margin:0">
      <button class="btn o" data-close>編集に戻る</button>
      <button class="btn enji" id="lv-go">保存せずに移動</button></div>`;
  openModal('m-seatask');
  wireClose(box);
  $('#lv-go').addEventListener('click', () => {
    closeModal('m-seatask');
    const b = T.base;
    T.tables = b.tables.map(t => ({ ...t })); T.asg = b.asg.map(a => ({ ...a })); S.ev = { ...b.ev };
    $('#sv-note').value = S.ev?.seating_note || '';
    indexSeating(); exitEdit(); go(v);
  });
  return true;
}
window.addEventListener('beforeunload', e => {
  if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
});

/* C4: 保存。まず RPC（1トランザクション）。無ければ順に実行し、失敗したら再読み込みして差分を再表示 */
async function saveEdits() {
  if (!T.edit || T.saving) return;
  const d = seatDiff();
  if (!d.count) { exitEdit(); toast('変更はありません', 'ok'); return; }
  T.saving = true; renderEditBar();
  const payload = {
    p_since_tables: T.since?.tables, p_since_asg: T.since?.asg, p_since_ev: T.since?.ev,
    p_del_tables: d.delTables, p_tables: d.upTables.map(tableRow), p_moved_tables: d.movedTables,
    p_del_asg: d.delAsg, p_asg: d.upAsg.map(asgRow), p_moved_asg: d.movedAsg,
    p_ev: Object.keys(d.ev).length ? d.ev : null,
  };
  let error = (await sb.rpc('seating_save', payload)).error;
  if (error && (error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || '')))
    error = await seqSave(d);
  T.saving = false;
  if (error) {
    if (/seating_conflict/.test(error.message || '') || error.code === '40001') { renderEditBar(); showConflict(); return; }
    toast('保存に失敗しました：' + (error.message || error), 'err');
    await reloadAndReapply();
    return;
  }
  await fetchSeatingRows(); await loadEventSettings(); indexSeating();
  exitEdit();
  toast(`保存しました（${d.count} 件）`, 'ok');
}
/* RPC が無いときの順次実行。一意制約に当たらないよう、動かす行の位置をいったん外してから upsert する */
async function seqSave(d) {
  const since = await fetchSince();
  if (newer(since.tables, T.since?.tables) || newer(since.asg, T.since?.asg) || newer(since.ev, T.since?.ev))
    return { message: 'seating_conflict' };
  const steps = [];
  if (d.delAsg.length) steps.push(() => sb.from('seating_assignments').delete().in('id', d.delAsg));
  if (d.delTables.length) steps.push(() => sb.from('seating_tables').delete().in('id', d.delTables));
  if (d.movedTables.length) steps.push(() => sb.from('seating_tables').update({ grid_row: null, grid_col: null }).in('id', d.movedTables));
  if (d.upTables.length) steps.push(() => sb.from('seating_tables').upsert(d.upTables.map(tableRow), { onConflict: 'id' }));
  if (d.movedAsg.length) steps.push(() => sb.from('seating_assignments').update({ seat_index: null }).in('id', d.movedAsg));
  if (d.upAsg.length) steps.push(() => sb.from('seating_assignments').upsert(d.upAsg.map(asgRow), { onConflict: 'id' }));
  if (Object.keys(d.ev).length) steps.push(() => sb.from('event_settings')
    .upsert({ id: 1, ...d.ev, updated_at: new Date().toISOString() }, { onConflict: 'id' }));
  for (const run of steps) { const { error } = await run(); if (error) return error; }
  return null;
}
/* 途中で失敗したとき：DB を読み直し、その上に未保存の差分を載せ直して編集を続けられるようにする */
async function reloadAndReapply() {
  const d = seatDiff();
  if (!await fetchSeatingRows()) return;
  await loadEventSettings();
  T.base = snapshot(); T.since = await fetchSince();
  T.tables = T.tables.filter(t => !d.delTables.includes(t.id));
  for (const t of d.upTables) { const i = T.tables.findIndex(x => x.id === t.id); if (i >= 0) T.tables[i] = t; else T.tables.push(t); }
  T.asg = T.asg.filter(a => !d.delAsg.includes(a.id) && !d.delTables.includes(a.table_id));
  for (const a of d.upAsg) { const i = T.asg.findIndex(x => x.id === a.id); if (i >= 0) T.asg[i] = a; else T.asg.push(a); }
  Object.assign(S.ev, d.ev);
  $('#sv-note').value = S.ev?.seating_note || '';
  indexSeating(); renderSeating();
  toast('DB を読み直しました。未保存の変更はそのまま残っています', 'err');
}
/* C6: 他の人の変更を検知したとき */
function showConflict() {
  const box = $('#m-seatask-box');
  box.innerHTML = `<h3>他の人が変更しています</h3>
    <p class="note">編集を始めたあとに、別の人が配席を変更しました。</p>
    <p style="margin:14px 0 18px">再読み込みしてやり直してください。今の変更は保存されません。</p>
    <div class="row" style="justify-content:flex-end;margin:0">
      <button class="btn o" data-close>閉じる</button>
      <button class="btn" id="cf-reload">再読み込み</button></div>`;
  openModal('m-seatask');
  wireClose(box);
  $('#cf-reload').addEventListener('click', () => location.reload());
}
const needEdit = () => { if (!T.edit) { toast('プレビューモードです。「編集」を押してから操作してください', 'err'); return true; } return false; };

/* ---------------- 配席の操作（すべてブラウザ内。保存で反映） ---------------- */
function assignPeople(keys, tableId, seat, quiet) {
  const tb = T.tables.find(t => t.id === tableId); if (!tb) return;
  if ((tb.capacity || 0) <= 0) { toast(`「${tb.label}」は定員0の卓なので配席できません`, 'err'); return; }
  const ps = keys.map(k => T.pool.get(k)).filter(Boolean);
  if (!ps.length) return;
  let idx;
  if (seat != null && ps.length === 1) idx = [seat];
  else {
    const run = freeRun(tb, ps.length);
    idx = run != null ? ps.map((_, i) => run + i) : freeSeats(tb).slice(0, ps.length);
  }
  const taken = new Set(seatSlots(tb).seats.map((a, i) => a ? i : -1));
  ps.forEach((p, i) => {
    const old = T.asgByPerson.get(p.key);
    if (old) T.asg = T.asg.filter(a => a.id !== old.id);
    const si = idx[i] != null && !taken.has(idx[i]) ? idx[i] : null;
    if (si != null) taken.add(si);
    T.asg.push({ id: uuid(), table_id: tableId, seat_index: si, person_type: p.type, person_id: p.id, provisional: p.provisional });
  });
  indexSeating(); renderSeating();
  if (!quiet) toast(`${ps.length} 名を「${tb.label}」に配席しました`, 'ok');
}
/* B2: 席を指定して配席。埋まっていれば先客を同じ卓の空席へ寄せる */
function assignToSeat(key, tid, seat, quiet) {
  const tb = T.tables.find(t => t.id === tid); if (!tb) return;
  if ((tb.capacity || 0) <= 0) { toast(`「${tb.label}」は定員0の卓なので配席できません`, 'err'); return; }
  const occ = seatSlots(tb).seats[seat];
  if (occ) {
    const free = freeSeat(tb);
    if (free == null) { toast(`「${tb.label}」に空席がありません`, 'err'); return; }
    setSeat(occ, tid, free);
  }
  assignPeople([key], tid, seat, quiet);
}
function moveToSeat(asgId, tid, seat) {
  const a = T.asg.find(x => x.id === asgId), tb = T.tables.find(t => t.id === tid);
  if (!a || !tb) return;
  if ((tb.capacity || 0) <= 0) { toast(`「${tb.label}」は定員0の卓なので配席できません`, 'err'); return; }
  if (a.table_id === tid && a.seat_index === seat) return;
  const occ = seatSlots(tb).seats[seat];
  const from = T.tables.find(t => t.id === a.table_id);
  const moved = `「${from?.label ?? ''}」${(a.seat_index ?? 0) + 1} → 「${tb.label}」${seat + 1}`;
  if (!occ) { setSeat(a, tid, seat); toast(`${moved} に移動しました`, 'ok'); return; }
  swapSeats(a, occ); toast(`${moved} と席を入れ替えました`, 'ok');
}
function moveToTable(asgId, tid) {
  const a = T.asg.find(x => x.id === asgId), tb = T.tables.find(t => t.id === tid);
  if (!a || !tb || a.table_id === tid) return;
  if ((tb.capacity || 0) <= 0) { toast(`「${tb.label}」は定員0の卓なので配席できません`, 'err'); return; }
  const free = freeSeat(tb);
  if (free == null) { toast(`「${tb.label}」に空席がありません`, 'err'); return; }
  setSeat(a, tid, free);
  toast(`「${tb.label}」席 ${free + 1} に移動しました`, 'ok');
}
function setSeat(a, tid, seat) {
  a.table_id = tid; a.seat_index = seat;
  indexSeating(); renderSeating();
}
function swapSeats(a, b) {
  const A = { table_id: a.table_id, seat_index: a.seat_index };
  a.table_id = b.table_id; a.seat_index = b.seat_index;
  b.table_id = A.table_id; b.seat_index = A.seat_index;
  indexSeating(); renderSeating();
}
function unseat(asgId, quiet) {
  const a = T.asg.find(x => x.id === asgId); if (!a) return;
  const p = T.pool.get(pkey(a.person_type, a.person_id));
  const label = p ? chipLabel(p, a) : staleName(a);
  T.asg = T.asg.filter(x => x.id !== asgId);
  indexSeating(); renderSeating();
  if (!quiet) toast(`${label} を未配席に戻しました`, 'ok');
}
/* B5: 空席を末尾から削って席番号を 0 から連番に詰め直す */
function compactSeats(tb, list) {
  list.forEach((a, i) => { a.seat_index = i; });
  indexSeating(); renderSeating();
  return true;
}
const seatedOf = tb => (T.byTable.get(tb.id) || []).slice()
  .sort((a, b) => (a.seat_index ?? 9999) - (b.seat_index ?? 9999));
/* 両卓の全配席を席番号ごと交換する */
function swapTables(aId, bId) {
  const A = T.tables.find(t => t.id === aId), B = T.tables.find(t => t.id === bId);
  if (!A || !B || aId === bId) return;
  const as = seatedOf(A), bs = seatedOf(B);
  for (const a of as) a.table_id = bId;
  for (const b of bs) b.table_id = aId;
  indexSeating(); renderSeating();
  toast(`「${A.label}」と「${B.label}」の配席を入れ替えました`, 'ok');
}
function saveTablePatch(tb, patch, msg) {
  Object.assign(tb, patch);
  closeModal('m-table');
  renderSeating();
  toast(msg || `「${patch.label}」を変更しました`, 'ok');
}

/* ---------------- B4: 行数・列数・各行の卓数の変更 ---------------- */
function changeGrid(next) {
  if (needEdit()) { renderGridBar(); return; }
  const cur = layoutOf();
  const rows = Math.min(MAX_ROWS, Math.max(1, next.rows ?? cur.rows));
  const cols = Math.min(MAX_COLS, Math.max(1, next.cols ?? cur.cols));
  const src = next.counts ?? cur.counts;
  const counts = [];
  for (let r = 0; r < rows; r++) counts.push(Math.min(cols, Math.max(0, src[r] ?? cols)));
  const L = { rows, cols, counts };
  const total = gridTotal(L);
  const drop = orderedTables().slice(total);            /* 並びの末尾から外れる */
  const n = drop.reduce((k, t) => k + (T.byTable.get(t.id) || []).length, 0);
  const run = () => {
    const ids = drop.map(t => t.id);
    T.tables = T.tables.filter(t => !ids.includes(t.id));
    T.asg = T.asg.filter(a => !ids.includes(a.table_id));
    S.ev = { ...(S.ev || {}), layout_rows: rows, layout_cols: cols, row_counts: counts };
    let added = 0;
    while (T.tables.length < total) { T.tables.push(newTable(0, 0)); added++; }
    recomputeOrder(); indexSeating(); renderSeating();
    const msg = [];
    if (ids.length) msg.push(`${ids.length} 卓を削除`);
    if (n) msg.push(`${n} 名を未配席に`);
    if (added) msg.push(`${added} 卓を追加`);
    toast(msg.length ? msg.join('・') + 'しました' : 'レイアウトを変更しました', 'ok');
  };
  if (!drop.length) { run(); return; }
  askSeat(`${drop.length} 卓を削除します`,
    `位置から外れる卓：${drop.map(t => t.label).join('・')}`,
    n ? `配席されている ${n} 名は未配席に戻ります。よろしいですか。` : 'この卓を削除します。よろしいですか。',
    run, '削除する');
}

/* ---------------- B6 世帯の確認 ---------------- */
function askHousehold(p, n, onYes) {
  const box = $('#m-seatask-box');
  box.innerHTML = `<h3>同行者も一緒に配席しますか</h3>
    <p class="note">${esc(`${p.fam ?? ''} ${p.giv ?? ''}`.trim())} には未配席の同行者が ${n} 名います。</p>
    <div class="row" style="justify-content:flex-end;margin:16px 0 0">
      <button class="btn o" id="hh-no">本人だけ</button>
      <button class="btn" id="hh-yes">同行者も一緒に（${n + 1} 名）</button></div>`;
  openModal('m-seatask');
  $('#hh-yes').addEventListener('click', () => { closeModal('m-seatask'); onYes(true); });
  $('#hh-no').addEventListener('click', () => { closeModal('m-seatask'); onYes(false); });
  $('#hh-yes').focus();
}
/* 同じ回答の未配席の同行者（本人を選んだときだけ） */
function household(key) {
  const p = T.pool.get(key);
  if (!p || p.comp || !p.replyId) return [];
  return [...T.pool.values()].filter(q => q.replyId === p.replyId && q.comp && !T.asgByPerson.has(q.key));
}
function assignWithHousehold(key, tableId, seat) {
  const mates = household(key);
  if (!mates.length)
    return seat != null ? assignToSeat(key, tableId, seat) : assignPeople([key], tableId);
  askHousehold(T.pool.get(key), mates.length, withMates => {
    if (!withMates) return seat != null ? assignToSeat(key, tableId, seat) : assignPeople([key], tableId);
    if (seat != null) { assignToSeat(key, tableId, seat, true); assignPeople(mates.map(m => m.key), tableId); }
    else assignPeople([key, ...mates.map(m => m.key)], tableId);
  });
}
/* ---------------- B4 空席をクリックして配席 ---------------- */
const POP = { tid: null, seat: null, q: '', mates: true };
const popOpen = () => POP.tid != null;
function closeSeatPop() {
  POP.tid = null;
  $('#sv-pop').classList.add('off');
}
/* 未配席で出席回答のある人。仮配席（未回答）はここには出さない */
function popPeople() {
  const q = norm(POP.q);
  return [...T.pool.values()]
    .filter(p => !p.provisional && !T.asgByPerson.has(p.key))
    .filter(p => !q || norm([p.fam, p.giv, p.famL, p.givL].join(' ')).includes(q))
    .sort((a, b) => latinOf(a).localeCompare(latinOf(b), 'ja'));
}
function renderPopList() {
  const list = popPeople();
  $('#pp-list').innerHTML = list.length ? list.map(p => {
    const sub = [latinOf(p).toUpperCase(), sideLabel(p.side), p.kind,
      p.circles.map(c => c.name).join('・')].filter(Boolean).join('｜');
    const n = household(p.key).length;
    return `<button type="button" class="pprow" data-k="${esc(p.key)}">
      <span class="sband ${sideK(p.side)}"></span>
      <span class="n"><b>${esc(chipLabel(p, null))}</b><small>${esc(sub)}</small></span>
      ${n ? `<span class="tag grey">同行者 ${n} 名</span>` : ''}</button>`;
  }).join('') : '<p class="note empty2">該当する人はいません</p>';
  $$('#pp-list .pprow').forEach(b => b.addEventListener('click', () => popAssign(b.dataset.k)));
  const anyMate = list.some(p => household(p.key).length);
  $('#pp-mates').closest('label').classList.toggle('off', !anyMate);
}
function popAssign(key) {
  const tid = POP.tid, seat = POP.seat, withMates = POP.mates && $('#pp-mates')?.checked !== false;
  const tb = T.tables.find(t => t.id === tid);
  closeSeatPop();
  const mates = withMates ? household(key) : [];
  assignToSeat(key, tid, seat, true);
  if (mates.length) assignPeople(mates.map(m => m.key), tid, null, true);
  toast(`${mates.length + 1} 名を「${tb?.label ?? ''}」に配席しました`, 'ok');
}
function openSeatPop(tid, seat, cx, cy) {
  const tb = T.tables.find(t => t.id === tid); if (!tb) return;
  POP.tid = tid; POP.seat = seat; POP.q = '';
  const box = $('#sv-pop');
  box.innerHTML = `<div class="pphd"><b>「${esc(tb.label)}」席 ${seat + 1} に配席</b>
      <span class="sp"></span><button type="button" class="btn link" id="pp-close">閉じる</button></div>
    <input id="pp-q" placeholder="氏名・ローマ字で検索" autocomplete="off">
    <label class="chk1"><input type="checkbox" id="pp-mates" checked><span>同行者も続けて配席</span></label>
    <div id="pp-list"></div>`;
  box.classList.remove('off');
  renderPopList();
  $('#pp-close').addEventListener('click', closeSeatPop);
  $('#pp-q').addEventListener('input', e => { POP.q = e.target.value; renderPopList(); });
  $('#pp-mates').addEventListener('change', e => { POP.mates = e.target.checked; });
  $('#pp-mates').checked = POP.mates;
  /* 画面からはみ出さない位置に置く */
  const r = box.getBoundingClientRect();
  const x = Math.min(Math.max(8, cx - 20), innerWidth - r.width - 8);
  const y = Math.min(Math.max(8, cy + 14), innerHeight - r.height - 8);
  box.style.left = x + 'px'; box.style.top = y + 'px';
  $('#pp-q').focus();
}
document.addEventListener('pointerdown', e => {
  if (!popOpen()) return;
  if (e.target.closest('#sv-pop')) return;
  closeSeatPop();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && popOpen()) closeSeatPop(); });

/* ---------------- B1 上部バーの「卓を選択」モード（配席の入れ替え） ---------------- */
const SW = { on: false, tables: [] };
function swapStart() {
  if (needEdit()) return;
  SW.on = true; SW.tables = [];
  if (BK.on) { BK.on = false; BK.tables.clear(); }
  T.sel = null; closeSeatPop();
  renderSeating();
}
function swapStop() { SW.on = false; SW.tables = []; renderSeating(); }
function renderSwapBar() {
  const bar = $('#sv-swapbar');
  bar.hidden = !SW.on;
  $('#sv-swap').classList.toggle('on', SW.on);
  $('#sv-swap').textContent = SW.on ? '卓の選択をやめる' : '卓を入れ替え';
  if (!SW.on) return;
  const names = SW.tables.map(id => T.tables.find(t => t.id === id)?.label ?? '');
  $('#sv-swapnote').textContent = SW.tables.length
    ? `選択中：${names.join(' ⇄ ')}（${SW.tables.length} / 2 卓）`
    : '入れ替えたい卓を2つクリックしてください。';
  $('#sv-swapgo').disabled = SW.tables.length !== 2;
}

/* ---------------- ドラッグ（Pointer Events：マウス・タッチ共通。編集モードのみ） ---------------- */
function ghostHTML(kind, id) {
  if (kind === 'chip') {
    const a = T.asg.find(x => x.id === id);
    const p = a && T.pool.get(pkey(a.person_type, a.person_id));
    return esc(p ? `${p.fam ?? ''}${p.giv ?? ''}` : (a ? staleName(a) : ''));
  }
  const p = T.pool.get(id);
  return p ? esc(`${p.fam ?? ''}${p.giv ?? ''}`) : '';
}
function beginDrag(d, ev) {
  endDrag();
  T.drag = { ...d, sx: ev.clientX, sy: ev.clientY, moved: false, ghost: null, hov: null };
  if (d.kind === 'tap') {
    T.drag.lp = setTimeout(() => {
      if (T.drag && !T.drag.moved) { const id = T.drag.id; endDrag(); openTableModal(id); }
    }, 600);
  }
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', onDragUp);
}
function endDrag() {
  if (T.drag) {
    clearTimeout(T.drag.lp);
    T.drag.ghost?.remove();
    T.drag.hov?.classList.remove('hov');
    T.drag.hovSeat?.classList.remove('drop');
    $('#sv-side')?.classList.remove('hov');
  }
  T.drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', onDragUp);
}
function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return { kind: 'none' };
  const tb = el.closest?.('.tb');
  /* B2: 席（丸／行）が最優先のドロップ先。チップ自身も席の情報を持つ */
  const st = el.closest?.('[data-s]');
  if (st && tb) return { kind: 'seat', id: st.dataset.t, seat: +st.dataset.s, el: tb, sel: st };
  if (tb) return { kind: 'table', id: tb.dataset.id, el: tb };
  if (el.closest?.('#sv-side')) return { kind: 'side' };
  return { kind: 'none' };
}
function onDragMove(ev) {
  const d = T.drag; if (!d) return;
  const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
  if (!d.moved && Math.hypot(dx, dy) < 5) return;
  if (!d.moved) {
    d.moved = true; clearTimeout(d.lp);
    if (d.kind === 'chip' || d.kind === 'person') {
      d.ghost = document.createElement('div');
      d.ghost.className = 'seat-ghost';
      d.ghost.textContent = ghostHTML(d.kind, d.id);
      document.body.appendChild(d.ghost);
    }
  }
  ev.preventDefault();
  if (d.kind === 'tap') return;                  /* A1: 卓そのものは動かせない */
  d.ghost.style.transform = `translate(${ev.clientX + 12}px,${ev.clientY + 10}px)`;
  const t = dropTarget(ev.clientX, ev.clientY);
  if (d.hov !== (t.el || null)) { d.hov?.classList.remove('hov'); d.hov = t.el || null; d.hov?.classList.add('hov'); }
  const sc = t.kind === 'seat' ? t.sel : null;
  if (d.hovSeat !== sc) { d.hovSeat?.classList.remove('drop'); d.hovSeat = sc; sc?.classList.add('drop'); }
  $('#sv-side').classList.toggle('hov', t.kind === 'side' && d.kind === 'chip');
}
function onDragUp(ev) {
  const d = T.drag; if (!d) return;
  const moved = d.moved, kind = d.kind, id = d.id, seat = d.seat;
  const t = moved ? dropTarget(ev.clientX, ev.clientY) : null;
  endDrag();

  if (kind === 'tap') {
    /* タップ：人を選んでいれば、その卓の空き最小席へ。卓は動かせない */
    if (!moved && T.sel) { const k = T.sel; T.sel = null; assignWithHousehold(k, id); }
    return;
  }
  if (!moved) {                                   /* クリック／タップ */
    if (kind === 'person') {
      T.sel = T.sel === id ? null : id;
      renderSeatSide();
    } else if (T.sel && (kind === 'chip' || kind === 'seat')) {
      const k = T.sel; T.sel = null;
      /* C4・B2: 人を選んでから席をタップ → その席へ。名前をタップ → その卓の空き最小席へ */
      if (kind === 'seat') assignWithHousehold(k, id, seat);
      else {
        const tid = T.asg.find(a => a.id === id)?.table_id;
        if (tid) assignWithHousehold(k, tid);
      }
    } else if (kind === 'seat') {
      /* B4: 空席をクリック／タップ → 未配席の人を選ぶポップオーバー */
      openSeatPop(id, seat, ev.clientX, ev.clientY);
    }
    return;
  }
  if (!t || t.kind === 'none') return;
  if (kind === 'person') {
    if (t.kind === 'seat') assignWithHousehold(id, t.id, t.seat);
    else if (t.kind === 'table') assignWithHousehold(id, t.id);
  } else if (kind === 'chip') {
    if (t.kind === 'seat') moveToSeat(id, t.id, t.seat);
    else if (t.kind === 'table') moveToTable(id, t.id);
    else if (t.kind === 'side') unseat(id);
  }
}

/* ---------------- B5 定員を減らして席が足りないとき、外す人を選んでもらう ---------------- */
function openCapPicker(tb, cap, list, patch) {
  const need = list.length - cap;
  const box = $('#m-table-box');
  const row = a => {
    const p = T.pool.get(pkey(a.person_type, a.person_id));
    const sub = p ? [latinOf(p).toUpperCase(), sideLabel(p.side), p.kind].filter(Boolean).join('｜')
                  : '要確認：' + staleWhy(a);
    return `<label class="caprow"><input type="checkbox" value="${esc(a.id)}">
      <span class="n"><b>席 ${(a.seat_index ?? 0) + 1}　${esc(chipLabel(p, a))}</b>
      <small>${esc(sub)}</small></span></label>`;
  };
  box.innerHTML = `<h3>外す人を選んでください</h3>
    <p class="note">「${esc(tb.label)}」の定員を ${tb.capacity} → ${cap} に減らします。
      空席を詰めても <b>${need}</b> 名ぶん足りません。未配席に戻す人を選んでください。</p>
    <div class="caplist">${list.map(row).join('')}</div>
    <p class="note" id="cp-hint"></p>
    <div class="row" style="justify-content:flex-end;margin:16px 0 0">
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn enji" id="cp-go" disabled>未配席に戻して確定</button></div>`;
  openModal('m-table');
  wireClose(box);
  const boxes = $$('.caplist input', box);
  const sync = () => {
    const n = boxes.filter(b => b.checked).length;
    $('#cp-hint').textContent = `選択 ${n} 名／必要 ${need} 名`;
    $('#cp-go').disabled = n < need;
  };
  boxes.forEach(b => b.addEventListener('change', sync)); sync();
  $('#cp-go').addEventListener('click', () => {
    const ids = boxes.filter(b => b.checked).map(b => b.value);
    T.asg = T.asg.filter(a => !ids.includes(a.id));
    indexSeating();
    compactSeats(tb, seatedOf(tb));
    saveTablePatch(tb, patch, `「${patch.label}」の定員を ${cap} にし、${ids.length} 名を未配席に戻しました`);
  });
}
/* 定員が違う卓どうしだと席があふれることがあるので、確認で知らせる */
function askSwapTables(aId, bId, after) {
  const A = T.tables.find(t => t.id === aId), B = T.tables.find(t => t.id === bId);
  if (!A || !B) return;
  const an = seatedOf(A).length, bn = seatedOf(B).length;
  const over = [];
  if (an > B.capacity) over.push(`「${B.label}」（定員 ${B.capacity}）に ${an} 名`);
  if (bn > A.capacity) over.push(`「${A.label}」（定員 ${A.capacity}）に ${bn} 名`);
  askSeat(`「${A.label}」と「${B.label}」を入れ替えます`,
    `${A.label}：${an} 名／${B.label}：${bn} 名。席番号はそのままで、卓だけを入れ替えます。`
      + (over.length ? `　※${over.join('・')} が入るため定員超過になります。` : ''),
    '両方の卓の配席をすべて入れ替えます。よろしいですか。',
    () => { swapTables(aId, bId); after?.(); }, '入れ替える');
}

/* ---------------- B5 卓の編集 ---------------- */
function openTableModal(id, focusMemo) {
  if (needEdit()) return;
  const tb = T.tables.find(t => t.id === id);
  if (!tb) return;
  const used = (T.byTable.get(tb.id) || []).length;
  const box = $('#m-table-box');
  box.innerHTML = `<h3>卓の編集</h3>
    <p class="note">現在 ${used} 名が配席されています。位置：${tb.grid_row + 1} 行目・左から ${tb.grid_col + 1} 番目</p>
    <div class="two" style="margin-top:12px">
      <div class="f req"><label>卓名（A, B… のほか「ケーキ」「受付」なども可）</label><input id="tf-label" value="${esc(tb.label)}" maxlength="12"></div>
      <div class="f req"><label>定員（0〜${SEATS_PER_TABLE}。0＝物置きなど、配席しない卓）</label><input id="tf-cap" type="number" min="0" max="${SEATS_PER_TABLE}" value="${tb.capacity}"></div>
    </div>
    <div class="f"><label>形</label><select id="tf-shape">${SHAPES.map(([v, l]) =>
      `<option value="${v}"${tb.shape === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>メモ（卓の申し送り。キャンバスの📝と管理用座席表に出ます）</label>
      <textarea id="tf-memo" rows="3" placeholder="例：新婦の親族卓。車椅子の導線を確保">${esc(tb.memo || '')}</textarea></div>
    <div class="f swapbox"><label>別の卓と配席を入れ替え（両卓の配席を席番号ごと交換します）</label>
      <div class="row" style="margin:0">
        <select id="tf-swap"><option value="">入れ替える卓を選ぶ</option>${
          orderedTables().filter(t => t.id !== tb.id).map(t =>
            `<option value="${esc(t.id)}">${esc(t.label)}（${(T.byTable.get(t.id) || []).length} / ${t.capacity} 名）</option>`).join('')}</select>
        <button type="button" class="btn s o" id="tf-swapgo">入れ替え</button>
      </div></div>
    <p class="note">卓の数は上部バーの「行・列・各行の卓数」で決まります。位置（順番）はキャンバス下の「卓の一覧」で上下ボタンから変えられます。</p>
    <div class="row" style="justify-content:flex-end;margin:16px 0 0">
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="tf-save">OK</button></div>`;
  openModal('m-table');
  wireClose(box);
  (focusMemo ? $('#tf-memo') : $('#tf-label')).focus();

  $('#tf-save').addEventListener('click', () => {
    const label = $('#tf-label').value.trim();
    const cap = Math.max(0, Math.min(SEATS_PER_TABLE, +$('#tf-cap').value || 0));
    if (!label) { toast('卓名を入れてください', 'err'); return; }
    const patch = { label, capacity: cap, shape: $('#tf-shape').value, memo: $('#tf-memo').value.trim() || null };
    const list = seatedOf(tb);
    /* B5: 増やすときは末尾に空席が増えるだけ */
    if (cap >= tb.capacity) return saveTablePatch(tb, patch);
    /* B5: 減らすときは、まず空席を末尾から削って席番号を 0 から詰め直す */
    if (list.length <= cap) {
      const gaps = list.some((a, i) => a.seat_index !== i);
      compactSeats(tb, list);
      return saveTablePatch(tb, patch, gaps
        ? `「${label}」の定員を ${cap} にし、席番号を詰め直しました`
        : `「${label}」を変更しました`);
    }
    /* B5: 詰めても足りないときは、外す人を選んでもらってから確定する */
    openCapPicker(tb, cap, list, patch);
  });
  $('#tf-swapgo').addEventListener('click', () => {
    const other = $('#tf-swap').value;
    if (!other) { toast('入れ替える卓を選んでください', 'err'); return; }
    closeModal('m-table');
    askSwapTables(tb.id, other);
  });
}

/* ---------------- D1 要確認 ---------------- */
$('#sv-stale').addEventListener('click', () => {
  const list = staleAsg();
  if (!list.length) return;
  const box = $('#m-table-box');
  const row = a => {
    const tb = T.tables.find(t => t.id === a.table_id);
    return `<tr><td>${esc(tb?.label ?? '')}</td><td><b>${esc(staleName(a))}</b></td>
      <td class="why">${esc(staleWhy(a))}</td>
      <td><button class="btn s o" data-un="${esc(a.id)}"${T.edit ? '' : ' disabled'}>未配席に戻す</button></td></tr>`;
  };
  box.innerHTML = `<h3>要確認 ${list.length} 名</h3>
    <p class="note">回答が欠席に変わった・削除された人が席に残っています。キャンバスでは臙脂の斜線で表示されます。${T.edit ? '' : '未配席に戻すには編集モードにしてください。'}</p>
    <div class="tblwrap" style="margin-top:10px"><table class="stale"><thead><tr>
      <th>卓</th><th>氏名</th><th>理由</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>
    <div class="row" style="justify-content:flex-end;margin:16px 0 0">
      <button class="btn enji s" id="st-all"${T.edit ? '' : ' disabled'}>${list.length} 名すべて未配席に戻す</button>
      <button class="btn o" data-close>閉じる</button></div>`;
  openModal('m-table');
  wireClose(box);
  $$('[data-un]', box).forEach(b => b.addEventListener('click', () => {
    unseat(b.dataset.un);
    closeModal('m-table');
    if (staleAsg().length) $('#sv-stale').click();
  }));
  $('#st-all').addEventListener('click', () => {
    closeModal('m-table');
    const ids = list.map(a => a.id);
    T.asg = T.asg.filter(a => !ids.includes(a.id));
    indexSeating(); renderSeating();
    toast(`${ids.length} 名を未配席に戻しました`, 'ok');
  });
});

/* ---------------- イベント ---------------- */
$('#sv-box').addEventListener('pointerdown', e => {
  if (e.button != null && e.button !== 0) return;
  if (!T.edit) return;                          /* C1: プレビューでは何も反応しない */
  if ((BK.on || SW.on) && (e.target.closest('.cxg') || e.target.closest('.tmemo'))) { e.preventDefault(); return; }
  const x = e.target.closest('.cxg');
  if (x) { e.preventDefault(); unseat(x.dataset.x); return; }
  const memo = e.target.closest('.tmemo');
  if (memo) { e.preventDefault(); openTableModal(memo.dataset.memo, true); return; }
  const chip = e.target.closest('.chip');
  if (chip && !BK.on && !SW.on) { e.preventDefault(); beginDrag({ kind: 'chip', id: chip.dataset.a }, e); return; }
  const st = e.target.closest('[data-s]');
  if (st && !BK.on && !SW.on) {
    e.preventDefault();
    /* 埋まっている席はその人のドラッグ、空席はドロップ先／タップ配席の対象 */
    beginDrag(st.dataset.a
      ? { kind: 'chip', id: st.dataset.a }
      : { kind: 'seat', id: st.dataset.t, seat: +st.dataset.s }, e);
    return;
  }
  const tb = e.target.closest('.tb');
  if (!tb) return;
  e.preventDefault();
  if (SW.on) {                                  /* B1: 入れ替える2卓を選ぶモード */
    const id = tb.dataset.id;
    const i = SW.tables.indexOf(id);
    if (i >= 0) SW.tables.splice(i, 1);
    else { SW.tables.push(id); if (SW.tables.length > 2) SW.tables.shift(); }
    renderSeating();
    return;
  }
  if (BK.on) {                                  /* G1: 卓を選択するモード */
    const id = tb.dataset.id;
    if ((T.tables.find(t => t.id === id)?.capacity || 0) <= 0) { toast('定員0の卓は一括配席の対象外です', 'err'); return; }
    BK.tables.has(id) ? BK.tables.delete(id) : BK.tables.add(id);
    renderSeating();
    return;
  }
  beginDrag({ kind: 'tap', id: tb.dataset.id }, e);
});
$('#sv-box').addEventListener('dblclick', e => {
  const tb = e.target.closest('.tb');
  if (tb && T.edit && !BK.on) openTableModal(tb.dataset.id);
});
$('#sv-box').addEventListener('contextmenu', e => { if (e.target.closest('.tb')) e.preventDefault(); });

$('#sv-list').addEventListener('pointerdown', e => {
  if (e.button != null && e.button !== 0) return;
  const rw = e.target.closest('.srw');
  if (!rw) return;
  e.preventDefault();
  if (!T.edit) return;
  beginDrag({ kind: 'person', id: rw.dataset.k }, e);
});
$('#sv-list').addEventListener('click', e => {
  const hd = e.target.closest('.ahd');
  if (!hd) return;
  const k = hd.closest('.sacc').dataset.acc;
  T.open[k] = !T.open[k];
  renderSeatSide();
});
$('#sv-q').addEventListener('input', e => { T.q = e.target.value; renderSeatSide(); });
$('#sv-side-f').addEventListener('change', e => { T.sideF = e.target.value; renderSeatSide(); });
$('#sv-circle').addEventListener('change', e => { T.circle = e.target.value; renderSeatSide(); });
$('#sv-sort').addEventListener('change', e => { T.sort = e.target.value; renderSeatSide(); });
$('#sv-edit').addEventListener('click', enterEdit);
/* C2: 「使い方」は折りたたみ可能。閉じた状態だけ localStorage に残す */
{
  const help = $('#sv-help');
  help.open = localStorage.getItem('seatHelp') !== '0';
  help.addEventListener('toggle', () => localStorage.setItem('seatHelp', help.open ? '1' : '0'));
}
$('#sv-save').addEventListener('click', saveEdits);
$('#sv-discard').addEventListener('click', discardEdits);
/* C1・C3: 全体の申し送りは編集モード中だけ書き換えられ、保存で反映 */
$('#sv-note').addEventListener('input', () => {
  if (!T.edit) return;
  S.ev = { ...(S.ev || {}), seating_note: $('#sv-note').value.trim() || null };
  renderEditBar();
});
const foldSide = v => {
  T.folded = v;
  localStorage.setItem('seatFold', v ? '1' : '0');
  renderSeating();
};
$('#sv-fold').addEventListener('click', () => foldSide(!T.folded));
$('#sv-fold2').addEventListener('click', () => foldSide(true));
$('#sv-unfold').addEventListener('click', () => foldSide(false));
$('#sv-bulk').addEventListener('click', () => BK.on ? bulkStop() : bulkStart());
$('#sv-swap').addEventListener('click', () => SW.on ? swapStop() : swapStart());
$('#sv-swapquit').addEventListener('click', swapStop);
$('#sv-swapgo').addEventListener('click', () => {
  if (SW.tables.length !== 2) return;
  const [a, b] = SW.tables;
  askSwapTables(a, b, () => swapStop());
});
/* C1: 表示形式の切替。選択は localStorage に保持 */
$$('#sv-view button').forEach(b => b.addEventListener('click', () => {
  if (T.view === b.dataset.v) return;
  T.view = b.dataset.v;
  localStorage.setItem('seatView', T.view);
  renderSeating();
}));

/* 共通の確認モーダル */
function askSeat(title, note, question, onYes, yesLabel) {
  let done = false;
  const box = $('#m-seatask-box');
  box.innerHTML = `<h3>${esc(title)}</h3>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    <p style="margin:14px 0 18px">${esc(question)}</p>
    <div class="row" style="justify-content:flex-end;margin:0">
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="ask-yes">${esc(yesLabel || '実行する')}</button></div>`;
  openModal('m-seatask');
  wireClose(box);
  /* キャンセル・Esc・背景クリックでも行列のセレクトを実際の値へ戻す */
  const mo = new MutationObserver(() => {
    if ($('#m-seatask').classList.contains('on')) return;
    mo.disconnect();
    if (!done && T.loaded) renderGridBar();
  });
  mo.observe($('#m-seatask'), { attributes: true, attributeFilter: ['class'] });
  $('#ask-yes').addEventListener('click', () => {
    done = true; closeModal('m-seatask'); onYes();
  });
  $('#ask-yes').focus();
}
/* ---------------- B7・C・D 座席表の書き出し ---------------- */
/* 図は SVG をそのまま高解像度でラスタライズして書き出す。
   PNG も PDF も同じ絵になり、日本語も画面と同じ字形で出る。 */
const DLNAME = k => `${k}_${ymd(new Date().toISOString())}`;
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/* SVG 文字列 → Canvas（PNG／PDF で共用）。高さは申し送りの帯のぶん伸びることがある */
async function svgToCanvas(svg, scale, w = VB.w, h = VB.h) {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  img.decoding = 'sync';
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const cv = document.createElement('canvas');
  cv.width = w * scale; cv.height = h * scale;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}
const canvasBlob = cv => new Promise(res => cv.toBlob(res, 'image/png'));

/* C2: 日本語フォント（images/fonts の Noto Sans JP サブセット）。
   図はラスタライズ済みなので無くても PDF は作れる。あるときだけ
   ページ下の見出し行を選択・検索できるベクタ文字で刷る。
   生成手順（fonttools が必要）：
     pip install fonttools brotli
     pyftsubset NotoSansJP-Regular.ttf --output-file=public/images/fonts/NotoSansJP-subset.ttf \
       --text-file=<座席表に出る文字を並べたテキスト> --layout-features='' --drop-tables+=GSUB,GPOS */
const JPFONT_URL = 'images/fonts/NotoSansJP-subset.ttf';
let jpFontCache;
async function loadJPFont() {
  if (jpFontCache !== undefined) return jpFontCache;
  try {
    const res = await fetch(JPFONT_URL);
    if (!res.ok) throw new Error('not found');
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    jpFontCache = btoa(bin);
  } catch { jpFontCache = null; }
  return jpFontCache;
}
/* C2: A3 横。図を余白いっぱいに収める。pages が複数なら2ページ目以降に続ける */
async function makePDF(pages, name, caption) {
  const mod = await import('https://esm.sh/jspdf');
  const JsPDF = mod.jsPDF || mod.default?.jsPDF || mod.default;
  const pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  const PW = 420, PH = 297, M = 8;
  const font = await loadJPFont();
  const capH = caption && font ? 7 : 0;
  const boxW = PW - M * 2, boxH = PH - M * 2 - capH;
  if (caption && font) {
    pdf.addFileToVFS('NotoSansJP.ttf', font);
    pdf.addFont('NotoSansJP.ttf', 'NotoSansJP', 'normal');
  }
  pages.forEach((pg, i) => {
    if (i) pdf.addPage();
    const k = Math.min(boxW / pg.w, boxH / pg.h);
    const w = pg.w * k, h = pg.h * k;
    pdf.addImage(pg.cv.toDataURL('image/png'), 'PNG', (PW - w) / 2, M, w, h, undefined, 'FAST');
    if (caption && font) {
      pdf.setFont('NotoSansJP', 'normal'); pdf.setFontSize(9); pdf.setTextColor(111, 102, 94);
      pdf.text(caption + (pages.length > 1 ? `　${i + 1} / ${pages.length}` : ''), PW / 2, PH - M + 1, { align: 'center' });
    }
  });
  pdf.setProperties({ title: name });
  pdf.save(name + '.pdf');
}
/* C1・D1: 現在の表示・肩書きの有無を切り替えて SVG を作る */
async function exportSeating({ fmt, titles, guest }) {
  const view0 = T.view;
  if (guest) T.view = 'list';                 /* D1: ゲスト向けは表形式に固定 */
  EX.titles = !!titles; EX.guest = !!guest;
  /* C3: PDF は帯の高さに上限を設け、余りは2ページ目へ。PNG は画像の縦を伸ばす */
  EX.notesMax = (fmt === 'pdf' && !guest) ? NOTES_BAND_MAX : Infinity;
  let svg, h, extra = [];
  try {
    svg = canvasSVG(true); h = EX.h;
    let rest = EX.rest;
    while (rest.length) {
      const pg = notesPageSVG(rest);
      extra.push(pg.svg);
      if (pg.rest.length >= rest.length) break;   /* 念のため無限ループ防止 */
      rest = pg.rest;
    }
  } finally { T.view = view0; EX.titles = false; EX.guest = false; EX.notesMax = Infinity; EX.rest = []; }
  const key = guest ? 'seating_guest' : 'seating_admin';
  const name = DLNAME(key);
  const scale = fmt === 'pdf' ? 3 : 2;
  try {
    const cv = await svgToCanvas(svg, scale, VB.w, h);
    if (fmt === 'pdf') {
      const pages = [{ cv, w: VB.w, h }];
      for (const s of extra) pages.push({ cv: await svgToCanvas(s, scale, VB.w, VB.h), w: VB.w, h: VB.h });
      await makePDF(pages, name, guest ? guestHead().join('　／　') : '座席表（管理用）　' + HEAD_DATE);
      toast(pages.length > 1 ? `PDFを書き出しました（${pages.length} ページ）` : 'PDFを書き出しました', 'ok');
    } else {
      saveBlob(await canvasBlob(cv), name + '.png');
      toast('PNGを書き出しました', 'ok');
    }
  } catch (e) {
    toast('書き出しに失敗しました：' + (e?.message || e), 'err');
  }
}
/* C1: 管理用の座席表ダウンロード */
$('#sv-dl').addEventListener('click', () => {
  const box = $('#m-table-box');
  box.innerHTML = `<h3>座席表ダウンロード（管理用）</h3>
    <p class="note">配慮事項・アレルギー・個別ギフト・お子様メニュー・お子様椅子のマークと凡例、左下に申し送り事項（全体・卓ごと・配慮事項一覧）が入ります。ゲストには渡さないでください。</p>
    <div class="f"><label>形式</label><select id="dl-fmt">
      <option value="png">PNG（画像。申し送りが多いときは縦に伸びます）</option><option value="pdf">PDF（A3 横。申し送りが収まらないときは2ページ目に続きます）</option></select></div>
    <div class="f"><label>肩書き</label><select id="dl-title">
      <option value="1">付き（名前の下に小さく表示）</option><option value="0">なし</option></select></div>
    <div class="f"><label>表示形式</label>
      <p class="note" style="margin:2px 0 0">現在の表示に従います（<b>${T.view === 'list' ? '表形式表示' : '円卓表示'}</b>）。
        変えるときは上部バーの切替で表示を変えてから開いてください。</p></div>
    <div class="row" style="justify-content:flex-end;margin:16px 0 0">
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="dl-go">ダウンロード</button></div>`;
  openModal('m-table');
  wireClose(box);
  $('#dl-go').addEventListener('click', async () => {
    const fmt = $('#dl-fmt').value, titles = $('#dl-title').value === '1';
    closeModal('m-table');
    await exportSeating({ fmt, titles, guest: false });
  });
});
/* D1: ゲスト向けの座席表ダウンロード */
$('#sv-gdl').addEventListener('click', () => {
  const box = $('#m-table-box');
  box.innerHTML = `<h3>ゲスト向け座席表ダウンロード</h3>
    <p class="note">表形式（ホテルPDF風）で固定です。肩書き＋「姓 名 様」を印字します。
      配慮事項・アレルギー・個別ギフト・お子様のマークや申し送りなど管理用の情報は出ません。</p>
    <div class="f"><label>形式</label><select id="gd-fmt">
      <option value="pdf">PDF（A3 横・1ページ）</option><option value="png">PNG（画像）</option></select></div>
    <div class="row" style="justify-content:flex-end;margin:16px 0 0">
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="gd-go">ダウンロード</button></div>`;
  openModal('m-table');
  wireClose(box);
  $('#gd-go').addEventListener('click', async () => {
    const fmt = $('#gd-fmt').value;
    closeModal('m-table');
    await exportSeating({ fmt, titles: true, guest: true });
  });
});

/* ---------------- E 配席CSV ---------------- */
/* E1: 配慮事項は本人の needs。お子様椅子が必要な子どもは「お子様椅子」を足す */
function seatNeeds(p) {
  if (!p) return '';
  return [p.needs, p.chair ? 'お子様椅子' : ''].filter(Boolean).join('／');
}
$('#sv-csv').addEventListener('click', () => {
  const cols = ['卓番号', '座席番号', '氏名', 'ローマ字', 'Side', '区分',
    'アレルギー・食事制限', '配慮事項', '状態'];
  const line = (tbLabel, seatNo, p, a, state) => csvLine([
    tbLabel, seatNo,
    p ? `${p.fam ?? ''} ${p.giv ?? ''}`.trim() : staleName(a),
    p ? latinOf(p).toUpperCase() : '',
    p ? sideLabel(p.side) : '',
    p ? p.csvKind : '',
    p ? [p.allergy, p.dietary].filter(Boolean).join(' / ') : '',
    seatNeeds(p),
    state,
  ]);
  /* E3: 卓番号 → 座席番号。未配席は末尾 */
  const seatedRows = [];
  for (const tb of orderedTables()) {
    const { seats, extra } = seatSlots(tb);
    const all = [...seats.entries(), ...extra.map((x, k) => [seats.length + k, x])];
    for (const [i, a] of all) {
      if (!a) continue;
      const p = T.pool.get(pkey(a.person_type, a.person_id));
      /* E2: 対象は出席回答ありの全員＋仮配席された未回答者。
         席に残った要確認の人は見落とさないよう「要確認」で出す */
      const state = !p ? '要確認：' + staleWhy(a) : p.provisional ? '仮配席' : '配席済み';
      seatedRows.push({ sort: [tb.sort_order ?? 99, i], row: line(tb.label, i + 1, p, a, state) });
    }
  }
  seatedRows.sort((x, y) => x.sort[0] - y.sort[0] || x.sort[1] - y.sort[1]);
  /* E2: 未配席は出席回答ありの人だけ（仮配席されていない未回答者は含めない） */
  const un = [...T.pool.values()]
    .filter(p => !p.provisional && !T.asgByPerson.has(p.key))
    .sort((a, b) => latinOf(a).localeCompare(latinOf(b), 'ja'))
    .map(p => line('', '', p, null, '未配席'));
  const body = [...seatedRows.map(r => r.row), ...un];
  if (!body.length) { toast('書き出す人がいません', 'err'); return; }
  const csv = '﻿' + [csvLine(cols), ...body].join('\r\n');
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), DLNAME('seating') + '.csv');
  toast(`${body.length} 行を書き出しました`, 'ok');
});
/* ============================================================
   G. タグ・Side の一括配席
   ============================================================ */
const BK = { on: false, tables: new Set(), circle: '', side: '', withProv: false, flip: false };

function bulkStart() {
  if (needEdit()) return;
  BK.on = true; BK.tables.clear();
  if (SW.on) { SW.on = false; SW.tables = []; }
  T.sel = null; closeSeatPop();
  if (T.folded) { T.folded = false; localStorage.setItem('seatFold', '0'); }
  renderSeating();
}
function bulkStop() { BK.on = false; BK.tables.clear(); renderSeating(); }

/* G1: サイドバーに出る操作パネル */
function bulkPanelHTML() {
  const picked = [...BK.tables];
  const names = guestTables().filter(t => BK.tables.has(t.id)).map(t => t.label);
  const cand = bulkCandidates();
  return `<div class="bkpanel">
    <div class="bkhd"><b>一括配席</b><span class="sp"></span>
      <button class="btn link" id="bk-quit">やめる</button></div>
    <p class="note">キャンバスの卓をクリックして、配りたい卓を選んでください（複数可）。</p>
    <p class="bkpick">${picked.length
      ? `選択中の卓：<b>${names.map(esc).join('・')}</b>（${picked.length} 卓・残席 ${bulkFree()} 席）`
      : '<span class="note">卓が選択されていません</span>'}</p>
    <div class="f"><label>友人圏タグ</label>
      <select id="bk-circle"><option value="">すべて</option>
        ${S.circles.map(c => `<option value="${esc(c.id)}"${BK.circle === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        <option value="__none"${BK.circle === '__none' ? ' selected' : ''}>タグなし</option></select></div>
    <div class="f"><label>Side</label>
      <select id="bk-side"><option value="">すべて</option>
        <option value="groom"${BK.side === 'groom' ? ' selected' : ''}>新郎友人</option>
        <option value="bride"${BK.side === 'bride' ? ' selected' : ''}>新婦友人</option>
        <option value="none"${BK.side === 'none' ? ' selected' : ''}>未設定</option></select></div>
    <label class="chk1"><input type="checkbox" id="bk-prov"${BK.withProv ? ' checked' : ''}> 未回答（仮配席）も含める</label>
    <label class="chk1"><input type="checkbox" id="bk-flip"${BK.flip ? ' checked' : ''}> 左右を反転（既定は左＝新郎友人）</label>
    <p class="note">該当する未配席者 <b>${cand.people}</b> 名／<b>${cand.houses}</b> 世帯</p>
    <button class="btn" id="bk-go" style="width:100%;margin-top:8px"${picked.length && cand.people ? '' : ' disabled'}>配席する</button>
  </div>`;
}
const bulkFree = () => guestTables().filter(t => BK.tables.has(t.id))
  .reduce((n, t) => n + Math.max(0, (t.capacity || 0) - (T.byTable.get(t.id) || []).length), 0);

/* 対象＝未配席で、タグ／Side に該当する人。世帯単位にまとめる */
function bulkHouseholds() {
  const seated = k => T.asgByPerson.has(k);
  const hit = p => {
    if (seated(p.key)) return false;
    if (p.provisional && !BK.withProv) return false;
    if (BK.side === 'none') { if (p.side) return false; }
    else if (BK.side && p.side !== BK.side) return false;
    if (BK.circle === '__none') { if (p.circles.length) return false; }
    else if (BK.circle && !p.circles.some(c => c.id === BK.circle)) return false;
    return true;
  };
  /* 世帯＝同じ回答（reply_id）の本人＋同行者。未回答の招待者は 1 人で 1 世帯 */
  const houses = new Map();
  for (const p of T.pool.values()) {
    if (!hit(p)) continue;
    const hk = p.replyId ? 'r:' + p.replyId : p.key;
    if (!houses.has(hk)) houses.set(hk, []);
    houses.get(hk).push(p);
  }
  /* G2: 大きい世帯から先に詰める。同数は本人のローマ字順で安定させる */
  return [...houses.values()]
    .map(ps => ps.sort((a, b) => (a.comp ? 1 : 0) - (b.comp ? 1 : 0)))
    .sort((a, b) => b.length - a.length || latinOf(a[0]).localeCompare(latinOf(b[0]), 'ja'));
}
function bulkCandidates() {
  const hs = bulkHouseholds();
  return { houses: hs.length, people: hs.reduce((n, h) => n + h.length, 0) };
}
/* G2・G4: 選んだ卓に世帯単位で詰める。卓の順は左右の寄せ方で決める */
function bulkPlan() {
  const picked = guestTables().filter(t => BK.tables.has(t.id));
  let order = picked.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  /* 左＝新郎友人／右＝新婦友人（反転可）。選んだ卓の中での左寄り・右寄り */
  const wantRight = BK.flip ? BK.side === 'groom' : BK.side === 'bride';
  if (BK.side === 'groom' || BK.side === 'bride') {
    order = picked.slice().sort((a, b) => wantRight ? (b.x - a.x || a.y - b.y) : (a.x - b.x || a.y - b.y));
  }
  /* B5: 卓ごとに席の空きを見て、世帯は連続した空席に並べる */
  const sim = new Map(order.map(t => [t.id, seatSlots(t).seats.map(Boolean)]));
  const put = new Map(order.map(t => [t.id, []]));
  const left = [];
  for (const h of bulkHouseholds()) {
    let done = false;
    for (const t of order) {
      const arr = sim.get(t.id);
      let at = runIn(arr, h.length);
      if (at == null) {
        /* 連続では取れないが同じ卓に空席が足りるなら、その卓の空席に散らして置く */
        const fs = arr.reduce((a, v, i) => (v ? a : (a.push(i), a)), []);
        if (fs.length < h.length) continue;
        h.forEach((p, i) => { arr[fs[i]] = true; put.get(t.id).push({ p, seat: fs[i] }); });
      } else {
        h.forEach((p, i) => { arr[at + i] = true; put.get(t.id).push({ p, seat: at + i }); });
      }
      done = true; break;
    }
    if (!done) left.push(h);
  }
  return { order, put, left, leftPeople: left.reduce((n, h) => n + h.length, 0) };
}

/* G3: プレビュー → 確認で保存 */
function openBulkPreview() {
  const { order, put, leftPeople } = bulkPlan();
  const total = [...put.values()].reduce((n, a) => n + a.length, 0);
  if (!total) { toast('選んだ卓に入る人がいません', 'err'); return; }
  const box = $('#m-table-box');
  const nm = p => `${p.fam ?? ''}${p.giv ?? ''}`.trim() || latinOf(p);
  box.innerHTML = `<h3>一括配席のプレビュー</h3>
    <p class="note">${[BK.circle === '__none' ? 'タグなし'
      : BK.circle ? S.circles.find(c => c.id === BK.circle)?.name : '全タグ',
      BK.side ? sideLabel(BK.side === 'none' ? null : BK.side) : '全Side',
      BK.withProv ? '未回答も含む' : '出席回答ありのみ'].join('／')}</p>
    <div class="tblwrap" style="margin-top:10px"><table class="bkprev"><thead><tr>
      <th>卓</th><th class="num">人数</th><th>配席される人</th></tr></thead><tbody>
      ${order.map(t => {
        const ps = put.get(t.id), used = (T.byTable.get(t.id) || []).length;
        return `<tr${ps.length ? '' : ' class="dim"'}><td><b>${esc(t.label)}</b>
          <small>${used} → ${used + ps.length} / ${t.capacity}</small></td>
          <td class="num">${ps.length ? '+' + ps.length : '—'}</td>
          <td class="who">${ps.map(({ p, seat }) =>
            `<span class="tag${p.provisional ? ' wait' : ''}" title="席 ${seat + 1}">${esc(nm(p))}</span>`)
            .join('') || '—'}</td></tr>`;
      }).join('')}</tbody></table></div>
    ${leftPeople ? `<p class="warnline">定員に入りきらない <b>${leftPeople}</b> 名は未配席のまま残ります。</p>` : ''}
    <div class="row" style="justify-content:flex-end;margin:16px 0 0">
      <button class="btn o" data-close>戻る</button>
      <button class="btn" id="bk-save">${total} 名を配席する</button></div>`;
  openModal('m-table');
  wireClose(box);
  $('#bk-save').addEventListener('click', async () => {
    closeModal('m-table');
    bulkApply(put);
  });
  $('#bk-save').focus();
}
function bulkApply(put) {
  const rows = [];
  for (const [tid, ps] of put) for (const { p, seat } of ps) {
    rows.push({ id: uuid(), table_id: tid, seat_index: seat, person_type: p.type, person_id: p.id, provisional: p.provisional });
  }
  if (!rows.length) return;
  for (const r of rows) {
    const old = T.asgByPerson.get(pkey(r.person_type, r.person_id));
    if (old) T.asg = T.asg.filter(a => a.id !== old.id);
    T.asg.push(r);
  }
  BK.on = false; BK.tables.clear();
  indexSeating(); renderSeating();
  toast(`${rows.length} 名を一括配席しました`, 'ok');
}

function wireBulkPanel() {
  if (!BK.on) return;
  const re = () => { renderSeatSide(); };
  $('#bk-quit').addEventListener('click', bulkStop);
  $('#bk-circle').addEventListener('change', e => { BK.circle = e.target.value; re(); });
  $('#bk-side').addEventListener('change', e => { BK.side = e.target.value; re(); });
  $('#bk-prov').addEventListener('change', e => { BK.withProv = e.target.checked; re(); });
  $('#bk-flip').addEventListener('change', e => { BK.flip = e.target.checked; re(); });
  $('#bk-go').addEventListener('click', openBulkPreview);
}


/* ============================================================
   A. 基本情報（event_settings：新郎新婦の姓名・座席表タイトル・レイアウト・全体の申し送り）
   ============================================================ */
const EV_DEF = { groom_family: '', groom_given: '', bride_family: '', bride_given: '',
  groom_name_latin: '', bride_name_latin: '', chart_title: '', seating_note: '',
  layout_rows: null, layout_cols: null, row_counts: null, short_row_align: null };
async function loadEventSettings() {
  try {
    const { data, error } = await sb.from('event_settings').select('*').eq('id', 1).maybeSingle();
    S.ev = error ? { ...EV_DEF, ...(S.ev || {}) } : { ...EV_DEF, ...(data || {}) };
    if (error) toast('基本情報の読み込みに失敗：' + error.message, 'err');
  } catch { S.ev = { ...EV_DEF, ...(S.ev || {}) }; }
}
/* 基本情報モーダルからの保存（配席の編集モードとは別に、即時に書く） */
async function saveEventSettings(patch) {
  const { data, error } = await sb.from('event_settings')
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select().maybeSingle();
  if (error) { toast('基本情報の保存に失敗：' + error.message, 'err'); return false; }
  S.ev = { ...(S.ev || EV_DEF), ...patch, ...(data || {}) };
  if (T.base) T.base.ev = { ...T.base.ev, ...patch, ...(data || {}) };   /* 編集中でも差分に数えない */
  return true;
}
/* 高砂・見出しで使う名前 */
function coupleNames() {
  const e = S.ev || EV_DEF, t = v => (v || '').trim();
  return { gf: t(e.groom_family), gg: t(e.groom_given), bf: t(e.bride_family), bg: t(e.bride_given),
           gl: t(e.groom_name_latin), bl: t(e.bride_name_latin) };
}
function openEventModal() {
  const e = S.ev || EV_DEF;
  const box = $('#m-ev-box');
  const f = (id, label, val, ph, max) =>
    `<div class="f"><label>${label}</label><input id="${id}" value="${esc(val || '')}" placeholder="${ph}" maxlength="${max || 40}"></div>`;
  box.innerHTML = `<h3>基本情報</h3>
    <p class="note">配席タブの見出し（両家の姓と座席表タイトル）と高砂（新郎・新婦の名）、座席表（管理用・ゲスト向け）に使います。</p>
    <div class="two" style="margin-top:12px">
      ${f('ev-gf', '新郎の姓（漢字）', e.groom_family, '例：森')}${f('ev-gg', '新郎の名（漢字）', e.groom_given, '例：喬由樹')}
      ${f('ev-bf', '新婦の姓（漢字）', e.bride_family, '例：吉永')}${f('ev-bg', '新婦の名（漢字）', e.bride_given, '例：百慧')}
      ${f('ev-gl', '新郎（ローマ字）', e.groom_name_latin, '例：Takayuki Mori', 60)}${f('ev-bl', '新婦（ローマ字）', e.bride_name_latin, '例：Momoe Yoshinaga', 60)}
    </div>
    ${f('ev-title', '座席表タイトル', e.chart_title, DEF_TITLE, 40)}
    <div class="row" style="justify-content:flex-end;margin:16px 0 0">
      <button class="btn o" data-close>キャンセル</button>
      <button class="btn" id="ev-save">保存</button></div>`;
  openModal('m-ev');
  wireClose(box);
  $('#ev-gf').focus();
  $('#ev-save').addEventListener('click', async () => {
    const v = id => $(id).value.trim() || null;
    const patch = { groom_family: v('#ev-gf'), groom_given: v('#ev-gg'), bride_family: v('#ev-bf'), bride_given: v('#ev-bg'),
                    groom_name_latin: v('#ev-gl'), bride_name_latin: v('#ev-bl'), chart_title: v('#ev-title') };
    closeModal('m-ev');
    if (await saveEventSettings(patch)) { toast('基本情報を保存しました', 'ok'); renderSeating(); }
  });
}
$('#ev-open').addEventListener('click', openEventModal);

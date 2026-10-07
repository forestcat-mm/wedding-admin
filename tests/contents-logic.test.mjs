/* 07 コンテンツ管理：contents-logic.js の単体テスト（取り込み・検証・Marché の ID） */
import { readFileSync } from 'node:fs';
import * as CL from '../public/contents-logic.js';

const ok = (name, cond) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) process.exitCode = 1; };
const ja = JSON.parse(readFileSync(new URL('../public/content-source/guide.ja.json', import.meta.url)));
const zh = JSON.parse(readFileSync(new URL('../public/content-source/guide.zh.json', import.meta.url)));

/* 取り込み */
for (const [lang, json] of [['ja', ja], ['zh', zh]]) {
  for (const s of CL.SECTION_IDS) {
    const d = CL.fromGuideJson(json, s, lang);
    ok(`${lang} ${s}: imported and valid`, d && !CL.isEmpty(d) && CL.validate(s, d).length === 0);
    if (d && CL.validate(s, d).length) console.log(CL.validate(s, d));
  }
}
let d = CL.fromGuideJson(ja, 'movies_text', 'ja');
ok('movies_text ← movies', d.title === ja.movies.title && d.play === ja.movies.play);
d = CL.fromGuideJson(ja, 'thanks_text', 'ja');
ok('thanks_text: spec keys first', CL.THANKS_KEYS.every((k, i) => Object.keys(d)[i] === k));
ok('thanks_text: new intro, old done text, old edit → resend', d.intro.startsWith('こだわって') && d.done_text === ja.thanks.done && d.resend === '内容を変更する');
ok('thanks_text: keeps other wording (errors etc.)', d.err_send === ja.thanks.err_send && d.message_ph === ja.thanks.message_ph && !('kicker' in d) && !('name_title' in d));
ok('thanks_text: placeholder is the short one', d.name_ph === 'お名前（漢字・ローマ字）');
d = CL.fromGuideJson(zh, 'help', 'zh');
ok('help: default when JSON has none', d.items.length === 7 && d.items.map(i => i.key).join() === CL.HELP_KEYS.join() && d.close === '开始浏览');
ok('help: JSON wins when present', CL.fromGuideJson({ help: { title: 'X', items: [] } }, 'help', 'ja').title === 'X');
ok('import is a copy', CL.fromGuideJson(ja, 'story', 'ja') !== ja.story);
ok('unknown section → null', CL.fromGuideJson(ja, 'nothing', 'ja') === null);

/* 検証 */
const story = CL.fromGuideJson(ja, 'story', 'ja');
story.chapter2.items[0].photo = 'https://evil.example/x.jpg';
ok('validate: photo must be media/guide or photos/', CL.validate('story', story).length === 1);
story.chapter2.items[0].photo = 'media/guide/story/meet-01-abc123.jpg';
ok('validate: media/guide path ok', CL.validate('story', story).length === 0);
story.chapter2.items[0].photo = 'photos/../../secret.jpg';
ok('validate: no traversal', CL.validate('story', story).length === 1);
const mar = CL.fromGuideJson(ja, 'marche', 'ja');
mar.sections[1].items[0].id = 'g01';
ok('validate: duplicate marche id', CL.validate('marche', mar).some(e => e.includes('重複')));
ok('validate: not an object', CL.validate('greeting', []).length === 1);
const help = CL.fromGuideJson(ja, 'help', 'ja'); help.items[0].key = 'nope';
ok('validate: help key', CL.validate('help', help).length === 1);

/* Marché の ID */
const m0 = CL.fromGuideJson(ja, 'marche', 'ja'), m1 = CL.clone(m0);
m1.sections[1].items = m1.sections[1].items.filter(i => i.id !== 's03');
ok('removedMarcheIds', CL.removedMarcheIds(m0, m1).join() === 's03');
ok('nextMarcheId: after the largest', CL.nextMarcheId(m0.sections[0], m0, 'g') === 'g21' && CL.nextMarcheId(m0.sections[1], m0, 's') === 's13');
ok('nextMarcheId: empty section uses fallback', CL.nextMarcheId({ items: [] }, m0, 'x') === 'x01');

/* パス */
const o = {}; CL.setAt(o, ['a', 'items', 0, 'title'], 'x');
ok('setAt creates arrays and objects', Array.isArray(o.a.items) && CL.getAt(o, ['a', 'items', 0, 'title']) === 'x');
ok('mediaKey', CL.mediaKey('media/guide/story/a-1.jpg') === 'guide/story/a-1.jpg' && CL.mediaKey('photos/a.jpg') === null);
ok('repoPhotoUrl', CL.repoPhotoUrl('../images/bride.webp', 'https://w.example') === 'https://w.example/images/bride.webp'
   && CL.repoPhotoUrl('photos/a.jpg', 'https://w.example/') === 'https://w.example/guide/photos/a.jpg');
ok('sameData ignores key order', CL.sameData({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }) && !CL.sameData({ a: 1 }, { a: 2 }));

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync('App.html', 'utf8');
const code = readFileSync('Code.gs', 'utf8');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing boundaries: ${start}, ${end}`);
  return source.slice(a, b);
}

const items = Array.from({length:78}, (_, i) => ({id:`F${String(78-i).padStart(4,'0')}`, de:`Original ${i}`, es:`Traducción ${i}`, notes:'', tags:[], pronunciation:'', kana:''}));
const state = {items, language:{name:'alemán', locale:'de-DE', translation:{name:'español', locale:'es-ES'}}, manageQuery:'', manageCollectionIds:[],
  memberIdsByCollection:{C1:items.filter((_, i) => i%3===0).map(item=>item.id), C2:items.filter((_, i) => i%5===0).map(item=>item.id)},
  session:{items:[], order:'random', collectionIds:[], query:'', page:1, supports:{german:true, spanish:false, pronunciation:true}, revealedIds:{}}, ssmlSettings:{reps:2, pause:3000}};
let copied, message, redraws=0;
const client = Function('state', 'copier', 'notify', 'redraw', `
  const PAGE_SIZE = 25;
  function renderPracticeList() { redraw(); }
  function copyText(text) { copier(text); return Promise.resolve(); }
  function say(text) { notify(text); }
  ${between(html, '  function targetName_()', '  function pronunciationToggleHtml_')}
  ${between(html, '  function esc(text)', '  function say(')}
  ${between(html, '  function assignedPhraseIds_()', '  function collectionIdsForPhrase_')}
  ${between(html, '  function collectionKey_(', '  function collectionById_')}
  ${between(html, '  function shuffledItems_(', '  function byId(')}
  ${between(html, '  function sessionToSsmlText_(', '  function fallbackCopyText(')}
  ${between(html, '  function copySessionSsml_()', '  function matchingItems(')}
  ${between(html, '  function matchingItems(', '  function collectionFilterLabel_')}
  ${between(html, '  function paginate(', '  function phraseCollectionPickerHtml_')}
  ${between(html, '  function sessionRowHtml_(', '  function practiceSupportsHtml_')}
  return {filterCollectionItems_, managedItems, matchingItems, refreshPractice_, sessionPage_, sessionListHtml_, toggleSupport_, row:sessionRowHtml_, copySessionSsml_};
`)(state, text=>copied=text, text=>message=text, ()=>redraws++);

assert.equal(client.filterCollectionItems_(items, []).length, 78);
const c1 = client.filterCollectionItems_(items, ['c1']);
assert.equal(c1.length, 26);
const union = client.filterCollectionItems_(items, ['C1','C2']);
assert.equal(union.length, new Set([...state.memberIdsByCollection.C1,...state.memberIdsByCollection.C2]).size);
assert.equal(new Set(union.map(item=>item.id)).size, union.length);
const unassigned = client.filterCollectionItems_(items, ['__unassigned__']);
assert.equal(unassigned.length + union.length, items.length);
assert.equal(client.filterCollectionItems_(items, ['C1','C2','__unassigned__']).length, items.length);
assert.deepEqual(client.filterCollectionItems_(items, ['deleted']), []);
state.manageCollectionIds = ['C1'];
state.manageQuery = 'Traducción 3';
assert.deepEqual(client.managedItems().map(item=>item.id), c1.filter(item=>item.es.includes('Traducción 3')).map(item=>item.id));

const originalRandom = Math.random;
try {
  Math.random = () => 0;
  state.session.collectionIds = ['C1'];
  client.refreshPractice_();
} finally { Math.random = originalRandom; }
const randomOrder = state.session.items.map(item=>item.id);
assert.notDeepEqual(randomOrder, c1.map(item=>item.id));
assert.deepEqual([...randomOrder].sort(), c1.map(item=>item.id).sort());
assert.equal(client.sessionPage_().items.length, 25);
state.session.page = 2;
assert.equal(client.sessionPage_().items.length, 1);
assert.equal(client.sessionPage_().total, 2);
state.session.revealedIds[state.session.items[0].id] = true;
client.sessionListHtml_();
assert.deepEqual(state.session.items.map(item=>item.id), randomOrder, 'Rendering and paging preserve random order');
client.toggleSupport_('spanish');
assert.deepEqual(state.session.items.map(item=>item.id), randomOrder, 'Visibility does not reshuffle');
assert.deepEqual(state.session.revealedIds, {}, 'Global visibility clears row overrides');
assert.equal(redraws, 1);
await client.copySessionSsml_();
assert.equal((copied.match(/<break time="3s" \/>/g)||[]).length, 52, 'Copy uses all 26 results twice, including other pages');
assert.ok(copied.startsWith(state.session.items[0].de));
assert.deepEqual(state.session.items.map(item=>item.id), randomOrder, 'Copy preserves random order');

state.session.order = 'manual';
client.refreshPractice_();
assert.deepEqual(state.session.items.map(item=>item.id), c1.map(item=>item.id));
state.session.page = 2;
state.session.query = 'Traducción 0';
client.refreshPractice_();
assert.equal(state.session.page, 1);
assert.equal(client.sessionPage_().items.length, 1);
assert.equal(client.sessionPage_().total, 1);
assert.doesNotMatch(client.sessionListHtml_(), /class="pagination"/);
state.session.query = 'no matches';
client.refreshPractice_();
assert.match(client.sessionListHtml_(), /No hay frases/);
copied = null;
await client.copySessionSsml_();
assert.equal(copied, null);
assert.match(message, /No hay frases filtradas/);

const phrase = {...items[0], pronunciation:'Help'};
state.session.supports = {german:false, spanish:false, pronunciation:false};
assert.doesNotMatch(client.row(phrase, 0), /Original 0|Traducción 0|Help/);
state.session.revealedIds[phrase.id] = true;
assert.match(client.row(phrase, 0), /Original 0[\s\S]*Help[\s\S]*Traducción 0/);
assert.doesNotMatch(client.row({...phrase,id:'other'}, 1), /Original 0|Traducción 0|Help/);
state.session.revealedIds[phrase.id] = false;
assert.doesNotMatch(client.row(phrase, 0), /Original 0|Traducción 0|Help/);
state.session.supports.german = true;
assert.match(client.row(phrase, 0), /Original 0/);
assert.doesNotMatch(client.row(phrase, 0), /Help/);

const assertPhraseVersion = Function(
  "const COL = { UPDATED: 8 }; function normalize_(v) { return String(v || '').trim(); } function toIso_(v) { return v instanceof Date ? v.toISOString() : ''; }\n" +
  between(code, 'function assertPhraseVersion_(', '\n\n/** Cambia sólo el estado') + '\nreturn assertPhraseVersion_;'
)();
const row = ['', '', '', '', '', '', '', new Date('2026-09-03T12:00:00.000Z')];
assert.doesNotThrow(()=>assertPhraseVersion(row, '2026-09-03T12:00:00.000Z'));
assert.throws(()=>assertPhraseVersion(row, '2026-09-03T12:01:00.000Z'), /cambió en la planilla/);
assert.doesNotMatch(html, /SpeechSynthesis|speechSynthesis|session-phase|data-view="study"|data-act="result"/);
console.log('Collection filters, filtered pagination, stable random order, revealing and complete SSML: OK');

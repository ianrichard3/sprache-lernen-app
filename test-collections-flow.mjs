import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `${startMarker} is missing`);
  assert.notEqual(end, -1, `${endMarker} is missing`);
  return source.slice(start, end);
}

const code = readFileSync('Code.gs', 'utf8');
const collectionNameKey = Function(
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  between(code, 'function collectionNameKey_(value) {', '\n\nfunction isUnassignedCollection_') +
  '\nreturn collectionNameKey_;'
)();
assert.equal(collectionNameKey('  Mi   trabajo  '), 'mi trabajo');
const isReservedCollectionName = Function(
  "const ALL_COLLECTION_NAME = 'Todas';\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  between(code, 'function collectionNameKey_(value) {', '\n\nfunction isReservedCollectionName_') +
  between(code, 'function isReservedCollectionName_(value) {', '\n\nfunction isUnassignedCollection_') +
  '\nreturn isReservedCollectionName_;'
)();
assert.equal(isReservedCollectionName(' TODAS '), true);
assert.equal(isReservedCollectionName('Todas 2'), false);
assert.match(code, /if \(isReservedCollectionName_\(name\)\) throw new Error\('El nombre "Todas" está reservado\.'\);/g);

const collectionMemberEntries = Function(
  "const COLLECTION_MEMBER_COL = { COLLECTION_ID: 1, PHRASE_ID: 2, POSITION: 3 };\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function collectionIdKey_(value) { return normalize_(value).toUpperCase(); }\n" +
  between(code, 'function collectionMemberEntries_(table, collectionId) {', '\n\nfunction collectionMemberIds_') +
  '\nreturn collectionMemberEntries_;'
)();
assert.deepEqual(
  collectionMemberEntries({values: [['C1', 'F2', 2], ['', '', ''], ['C1', 'F1', 1]]}, 'c1')
    .map(({id, rowIndex}) => [id, rowIndex]),
  [['F1', 4], ['F2', 2]]
);

const nextCollectionPosition = Function(
  "const COLLECTION_MEMBER_COL = { COLLECTION_ID: 1, PHRASE_ID: 2, POSITION: 3 };\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function collectionIdKey_(value) { return normalize_(value).toUpperCase(); }\n" +
  between(code, 'function nextCollectionPosition_(table, collectionId) {', '\n\nfunction reindexCollectionMemberEntries_') +
  '\nreturn nextCollectionPosition_;'
)();
assert.equal(nextCollectionPosition({values: [['C1', 'F1', 1], ['C1', 'F3', 3], ['C2', 'F2', 9]]}, 'c1'), 4);

const reindexCollectionMemberEntries = Function(
  "const COLLECTION_MEMBER_COL = { COLLECTION_ID: 1, PHRASE_ID: 2, POSITION: 3 };\n" +
  between(code, 'function reindexCollectionMemberEntries_(sheet, entries) {', '\n\nfunction clearCollectionMembers_') +
  '\nreturn reindexCollectionMemberEntries_;'
)();
const repairedRange = {
  values: [[3], [9], [3]],
  getValues() { return this.values.map(row => row.slice()); },
  setValues(values) { this.values = values; }
};
const repairedEntries = [{rowIndex: 2, position: 3}, {rowIndex: 4, position: 3}];
reindexCollectionMemberEntries({getRange() { return repairedRange; }}, repairedEntries);
assert.deepEqual(repairedEntries.map(({position}) => position), [1, 2]);
assert.deepEqual(repairedRange.values, [[1], [9], [2]]);

const requestedCollectionIds = Function(
  "const UNASSIGNED_COLLECTION_ID = '__unassigned__';\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function collectionIdKey_(value) { return normalize_(value).toUpperCase(); }\n" +
  "function isUnassignedCollection_(id) { return collectionIdKey_(id) === collectionIdKey_(UNASSIGNED_COLLECTION_ID); }\n" +
  between(code, 'function requestedCollectionIds_(value, collections) {', '\n\nfunction syncPhraseCollections_') +
  '\nreturn requestedCollectionIds_;'
)();
const collectionIndex = {byId: {C1: {id: 'C1'}, C2: {id: 'C2'}}};
assert.deepEqual(requestedCollectionIds(['c1', 'C1', 'C2'], collectionIndex), ['C1', 'C2']);
assert.throws(() => requestedCollectionIds(['__unassigned__'], collectionIndex), /colecciones existentes/);

const assertPhraseCollectionVersion = Function(
  "const COLLECTION_MEMBER_COL = { COLLECTION_ID: 1, PHRASE_ID: 2, POSITION: 3 };\n" +
  "const UNASSIGNED_COLLECTION_ID = '__unassigned__';\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function collectionIdKey_(value) { return normalize_(value).toUpperCase(); }\n" +
  "function isUnassignedCollection_(id) { return collectionIdKey_(id) === collectionIdKey_(UNASSIGNED_COLLECTION_ID); }\n" +
  between(code, 'function requestedCollectionIds_(value, collections) {', '\n\nfunction syncPhraseCollections_') + '\n' +
  between(code, 'function assertPhraseCollectionVersion_(table, collections, phraseId, expectedIds) {', '\n\nfunction restorePhraseMemberships_') +
  '\nreturn assertPhraseCollectionVersion_;'
)();
assert.doesNotThrow(() => assertPhraseCollectionVersion({values: [['C1', 'F1', 1]]}, collectionIndex, 'F1', ['c1']));
assert.throws(() => assertPhraseCollectionVersion({values: [['C1', 'F1', 1], ['C2', 'F1', 2]]}, collectionIndex, 'F1', ['C1']), /colecciones de esta frase cambiaron/);

const membershipRows = Function(
  "const COLLECTION_MEMBER_COL = { COLLECTION_ID: 1, PHRASE_ID: 2, POSITION: 3 };\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function collectionIdKey_(value) { return normalize_(value).toUpperCase(); }\n" +
  between(code, 'function membershipRows_(collections, members, phrases) {', '\n\nfunction collectionIdNumber_') +
  '\nreturn membershipRows_;'
)();
const memberships = membershipRows(
  {byId: {C1: {name: 'Trabajo'}}},
  {values: [['C1', 'F1', 2], ['C1', 'F1', 1], ['C2', 'F1', 1], ['C1', 'F2', 1]]},
  {byId: {F1: {de: 'Ich arbeite'}}}
);
assert.deepEqual(memberships.rows.map(({collectionKey, phraseKey, position}) => [collectionKey, phraseKey, position]), [['C1', 'F1', 2]]);
assert.deepEqual(memberships.byPhrase, {F1: ['C1']});

const html = readFileSync('App.html', 'utf8');
const localCollection = Function(
  "const ALL_COLLECTION_ID = '__all__';\n" +
  "var state = {items: [{id: 'F1'}, {id: 'F2'}, {id: 'F3'}], collections: [{id: 'C1', name: 'Trabajo'}], memberIdsByCollection: {C1: ['F1']}};\n" +
  "function collectionKey_(id) { return String(id || '').toUpperCase(); }\n" +
  "function collectionById_(id) { return state.collections.find(function (item) { return collectionKey_(item.id) === collectionKey_(id); }) || null; }\n" +
  "function assignedPhraseIds_() { return {F1: true}; }\n" +
  "function byId(id) { return state.items.find(function (item) { return item.id === id; }) || null; }\n" +
  between(html, '  function localCollection_(id) {', '\n\n  function refreshOpenCollection_') +
  '\nreturn {state, localCollection:localCollection_};'
)();
const allCollection = localCollection.localCollection('__all__');
assert.equal(allCollection.collection.name, 'Todas');
assert.equal(allCollection.collection.count, 3);
assert.deepEqual(allCollection.items.map(({id}) => id), ['F1', 'F2', 'F3']);
assert.notEqual(allCollection.items, localCollection.state.items);
assert.match(html, /var collections = \[\{ id:ALL_COLLECTION_ID, name:'Todas', count:state\.items\.length, all:true \}\]\.concat\(state\.collections\)/);
assert.match(html, /collection\.collection\.unassigned \|\| collection\.collection\.all/);
assert.match(html, /if \(act === 'new-collection-phrase'\) \{ stopPlayer_\(\)/);
assert.match(html, /expectedCollectionIds:id \? \(state\.editingCollectionIds \|\| \[\]\) : \[\]/);
assert.doesNotMatch(code, /function (?:createPhrase|updatePhrase|addCollectionPhrase|writeCollectionMember_)\b/);
const selectedCollectionCandidateIds = Function(
  "var state = {collectionSelection:{F1:true, F2:false, F3:true}};\n" +
  between(html, '  function selectedCollectionCandidateIds_() {', '\n\n  function collectionEditorHtml') +
  '\nreturn selectedCollectionCandidateIds_;'
)();
assert.deepEqual(selectedCollectionCandidateIds(), ['F1', 'F3']);

const setPhraseCollectionIds = Function(
  "var state = {memberIdsByCollection:{C1:['F1'], C2:[]}};\n" +
  "function collectionKey_(id) { return String(id || '').toUpperCase(); }\n" +
  between(html, '  function setPhraseCollectionIds_(phraseId, collectionIds) {', '\n\n  function decorateCollections_') +
  '\nreturn {state:state, set:setPhraseCollectionIds_};'
)();
setPhraseCollectionIds.set('F1', ['C2']);
assert.deepEqual(setPhraseCollectionIds.state.memberIdsByCollection, {C1: [], C2: ['F1']});
const phaseDefaults = Function(
  between(html, '  function phaseDefaults_(phase) {', '\n\n  function shuffledItems_') +
  '\nreturn phaseDefaults_;'
)();
assert.deepEqual(phaseDefaults('understand'), {german: true, spanish: true});
assert.deepEqual(phaseDefaults('listen'), {german: false, spanish: false});
assert.deepEqual(phaseDefaults('shadow'), {german: true, spanish: false});
assert.deepEqual(phaseDefaults('recall'), {german: false, spanish: true});

const shuffledItems = Function(
  between(html, '  function shuffledItems_(items) {', '\n\n  function sessionItems_') +
  '\nreturn shuffledItems_;'
)();
const originalRandom = Math.random;
Math.random = () => 0;
const originalItems = [{id: 'F1'}, {id: 'F2'}, {id: 'F3'}];
assert.deepEqual(shuffledItems(originalItems).map(({id}) => id), ['F2', 'F3', 'F1']);
assert.deepEqual(originalItems.map(({id}) => id), ['F1', 'F2', 'F3']);
Math.random = originalRandom;

const nextPlaybackPosition = Function(
  between(html, '  function nextPlaybackPosition(length, index, repetition, repetitions) {', '\n\n  function playerVoiceReady_') +
  '\nreturn nextPlaybackPosition;'
)();
assert.deepEqual(nextPlaybackPosition(3, 1, 0, 2), {index: 1, repetition: 1});
assert.deepEqual(nextPlaybackPosition(3, 1, 1, 2), {index: 2, repetition: 0});
assert.deepEqual(nextPlaybackPosition(3, 2, 0, 1), {index: 0, repetition: 0});

const movePlayer = Function(
  "var state = { session:{items:[{}, {}, {}], phase:'free', supports:{}} };\n" +
  "var player = {index:0, repetition:0, playing:false};\n" +
  "function sessionItems_() { return state.session.items; }\n" +
  "function stopPlayer_() {} function resetPhraseSupports_() {} function updatePlayerUi_() {}\n" +
  "function recallPhase_() { return false; } function startPlayer_() {}\n" +
  between(html, '  function movePlayer_(direction) {', '\n\n  function restartPlayer_') +
  '\nreturn {state:state, player:player, movePlayer_:movePlayer_};'
)();
movePlayer.movePlayer_(-1);
assert.equal(movePlayer.player.index, 2);
movePlayer.movePlayer_(1);
assert.equal(movePlayer.player.index, 0);

const toggleSupport = Function(
  "var state = {session:{phase:'recall', supports:{german:false, spanish:true}, revealedIndex:0}};\n" +
  "var player = {index:0}; var stopped = 0, updated = 0;\n" +
  "function recallPhase_() { return state.session.phase === 'recall'; }\n" +
  "function germanVisible_(index) { return state.session.revealedIndex === index; }\n" +
  "function stopPlayer_() { stopped++; } function redrawSessionRows_() {} function updatePlayerUi_() { updated++; }\n" +
  between(html, '  function toggleSupport_(support) {', '\n\n  function byId') +
  '\nreturn {state:state, toggleSupport_:toggleSupport_, counts:function () { return [stopped, updated]; }};'
)();
toggleSupport.toggleSupport_('german');
assert.deepEqual(toggleSupport.counts(), [1, 1]);
assert.equal(toggleSupport.state.session.revealedIndex, null);
toggleSupport.toggleSupport_('german');
assert.equal(toggleSupport.state.session.revealedIndex, 0);

const sessionRow = Function(
  "var state = {language:{locale:'de-DE', translation:{name:'español', locale:'es-ES'}}, session:{phase:'listen', supports:{german:false, spanish:false}, revealedIndex:null}};\n" +
  "var player = {index:0, playing:false, voice:{}};\n" +
  "function recallPhase_() { return state.session.phase === 'recall'; }\n" +
  "function germanVisible_(index) { return recallPhase_() ? state.session.revealedIndex === index : state.session.supports.german; }\n" +
  "function targetName_() { return 'alemán'; } function pronunciationHtml_() { return ''; }\n" +
  "function esc(value) { return String(value); }\n" +
  between(html, '  function sessionRowHtml_(item, index) {', '\n\n  function sessionListHtml_') +
  '\nreturn {state:state, row:sessionRowHtml_};'
)();
assert.match(sessionRow.row({de:'Guten Morgen', es:'Buenos días'}, 0), /Frase 1/);
sessionRow.state.session.phase = 'understand';
sessionRow.state.session.supports = {german:true, spanish:true};
assert.match(sessionRow.row({de:'Guten Morgen', es:'Buenos días'}, 0), /Guten Morgen[\s\S]*Buenos días/);
sessionRow.state.session.phase = 'recall';
sessionRow.state.session.revealedIndex = null;
assert.doesNotMatch(sessionRow.row({de:'Guten Morgen', es:'Buenos días'}, 0), /session-row-de/);
sessionRow.state.session.revealedIndex = 0;
assert.match(sessionRow.row({de:'Guten Morgen', es:'Buenos días'}, 0), /session-row-de/);

console.log('Collections ordering and player loop: OK');

// Exercise the real batch function and helpers against in-memory Sheets.
function generatorBackend() {
  const phraseRows = [['F0001', 'Hallo!', 'Hola original', 'nota', 'Dominada', 'saludo', '', '', '']];
  const memberRows = [['C1', 'F0001', 1]];
  let failLinks = false;
  let failRecovery = false;
  function sheet(rows, member = false) {
    return {
      getLastRow() { return rows.length + 1; },
      getRange(start, column, count, width) {
        return {
          getValues() { return rows.slice(start - 2, start - 2 + count).map(row => row.slice(0, width)); },
          setValues(values) {
            values.forEach((row, i) => { rows[start - 2 + i] = row.slice(); });
            if (member && failLinks) throw new Error('Write failed');
          },
          clearContent() {
            if (failRecovery) throw new Error('Recovery failed');
            rows.splice(start - 2, count);
          }
        };
      }
    };
  }
  const phraseSheet = sheet(phraseRows);
  const memberSheet = sheet(memberRows, true);
  const collectionSheet = sheet([['C1', 'Uno', '', ''], ['C2', 'Dos', '', '']]);
  const run = Function('phraseSheet', 'memberSheet', 'collectionSheet', `
    const PropertiesService = {getDocumentProperties: () => ({getProperty: () => '1', setProperty: () => {}}), getScriptProperties: () => ({getProperty: () => null})};
    ${code}
    getSpreadsheet_ = () => ({});
    getSheet_ = () => phraseSheet;
    getCollectionsSheet_ = () => collectionSheet;
    getCollectionMembersSheet_ = () => memberSheet;
    const LockService = {getDocumentLock: () => null, getScriptLock: () => ({waitLock() {}, releaseLock() {}})};
    return saveGeneratedPhrases;
  `)(phraseSheet, memberSheet, collectionSheet);
  return {run, phraseRows, memberRows, fail(rollback = false) { failLinks = true; failRecovery = rollback; }};
}
const generated = generatorBackend();
const batch = {items:[{de:'Hallo', es:'No sobrescribir'}, {de:'Guten Tag', es:'Buen día'}, {de:'Guten Tag!', es:'Otra'}], collectionIds:['C2'], expectedLanguageVersion:0};
assert.throws(() => generated.run({...batch, expectedLanguageVersion:1}), /idioma cambió/);
assert.equal(generated.phraseRows.length, 1);
const saved = generated.run(batch);
assert.equal(generated.phraseRows.length, 2);
assert.equal(generated.memberRows.length, 3);
assert.equal(saved.results[0].item.es, 'Hola original');
assert.equal(saved.results[0].item.status, 'Dominada');
assert.deepEqual(saved.results[0].collectionIds, ['C1', 'C2']);
assert.deepEqual(saved.results.map(result => result.reused), [true, false, true]);
generated.run(batch);
assert.equal(generated.phraseRows.length, 2);
assert.equal(generated.memberRows.length, 3);
const multiple = generatorBackend();
multiple.run({items:[{de:'Neu', es:'Nueva'}], collectionIds:['C1', 'C2'], expectedLanguageVersion:0});
assert.deepEqual(multiple.memberRows.slice(1).map(row => [row[0], row[2]]), [['C1', 2], ['C2', 1]]);
const unassigned = generatorBackend();
const withoutCollection = unassigned.run({items:[{de:'Neu', es:'Nueva'}], collectionIds:[], expectedLanguageVersion:0});
assert.equal(unassigned.phraseRows.length, 2);
assert.equal(unassigned.memberRows.length, 1);
assert.deepEqual(withoutCollection.results[0].collectionIds, []);
const reusedWithoutCollection = unassigned.run({items:[{de:'Hallo!', es:'Ignorada'}], collectionIds:[], expectedLanguageVersion:0});
assert.equal(reusedWithoutCollection.results[0].reused, true);
assert.deepEqual(reusedWithoutCollection.results[0].collectionIds, ['C1']);
for (const invalid of [
  {items:[], collectionIds:['C1'], expectedLanguageVersion:0},
  {items:[{de:'Neu', es:''}], collectionIds:['C1'], expectedLanguageVersion:0},
  {items:[{de:'Neu', es:'Nueva'}], collectionIds:['deleted'], expectedLanguageVersion:0}
]) {
  const backend = generatorBackend();
  assert.throws(() => backend.run(invalid));
  assert.equal(backend.phraseRows.length, 1);
  assert.equal(backend.memberRows.length, 1);
}
const failed = generatorBackend();
failed.fail();
assert.throws(() => failed.run(batch), /Write failed/);
assert.equal(failed.phraseRows.length, 1);
assert.deepEqual(failed.memberRows, [['C1', 'F0001', 1]]);
const failedRecovery = generatorBackend();
failedRecovery.fail(true);
assert.throws(() => failedRecovery.run(batch), /Actualizá los datos/);
console.log('Generated phrases batch save and recovery: OK');

// Web apps have no document lock. Exercise the shared helper, including failures.
let lockHeld = false;
let releases = 0;
const scriptLock = {
  waitLock(timeout) { assert.equal(timeout, 20000); lockHeld = true; },
  releaseLock() { assert.equal(lockHeld, true); lockHeld = false; releases++; }
};
const withScriptLock = Function('LockService',
  between(code, 'function withLock_(callback)', '\n/* ------------------------------------------------------------------ */') + '\nreturn withLock_;'
)({getDocumentLock: () => null, getScriptLock: () => scriptLock});
assert.equal(withScriptLock(() => { assert.equal(lockHeld, true); return 'saved'; }), 'saved');
assert.throws(() => withScriptLock(() => { throw new Error('write error'); }), /write error/);
assert.equal(lockHeld, false);
assert.equal(releases, 2);
console.log('Web app script lock and release on failure: OK');

// Audio in recall is governed by the revealed phrase, just like the visible play button.
const recallAudio = Function(`
  var state = {session:{phase:'recall', supports:{german:false}, revealedIndex:null}};
  var player = {index:0, playing:false, token:0};
  var cycles = 0;
  function currentPlayerItem_() { return {id:'F1'}; }
  function playerVoiceReady_() { return true; }
  function playPlayerCycle_() { cycles++; }
  function updatePlayerUi_() {}
  ${between(html, '  function recallPhase_()', '  function replaceSessionRow_')}
  ${between(html, '  function startPlayer_()', '  function togglePlayer_')}
  return {state, player, startPlayer_, cycles:() => cycles};
`)();
recallAudio.startPlayer_();
assert.equal(recallAudio.cycles(), 0);
recallAudio.state.session.revealedIndex = 0;
recallAudio.startPlayer_();
assert.equal(recallAudio.cycles(), 1);
recallAudio.state.session.revealedIndex = 1;
recallAudio.startPlayer_();
assert.equal(recallAudio.cycles(), 1, 'Another revealed row does not reveal the current phrase');
recallAudio.state.session.phase = 'listen';
recallAudio.startPlayer_();
assert.equal(recallAudio.cycles(), 2, 'Listening remains available with hidden original');
console.log('Recall audio starts only after revealing the current phrase: OK');

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
const setPhraseCollectionIds = Function(
  "var state = {memberIdsByCollection:{C1:['F1'], C2:[]}};\n" +
  "function collectionKey_(id) { return String(id || '').toUpperCase(); }\n" +
  between(html, '  function setPhraseCollectionIds_(phraseId, collectionIds) {', '\n\n  function decorateCollections_') +
  '\nreturn {state:state, set:setPhraseCollectionIds_};'
)();
setPhraseCollectionIds.set('F1', ['C2']);
assert.deepEqual(setPhraseCollectionIds.state.memberIdsByCollection, {C1: [], C2: ['F1']});
// Exercise the real batch function and helpers against in-memory Sheets.
function generatorBackend() {
  const phraseRows = [['F0001', 'Hallo!', 'Hola original', 'nota', 'Dominada', 'saludo', '', '', '']];
  const memberRows = [['C1', 'F0001', 1]];
  let failLinks = false;
  let failRecovery = false;
  function sheet(rows, member = false) {
    return {
      getLastRow() { return rows.length + 1; },
      deleteRow(index) { rows.splice(index - 2, 1); },
      getRangeList(ranges) { return {clearContent() { ranges.forEach(range => { rows[Number(range.match(/\d+/)[0]) - 2] = ['', '', '']; }); }}; },
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
    const PRODUCTION_SPREADSHEET_ID = 'test';
    const PropertiesService = {getDocumentProperties: () => ({getProperty: () => '1', setProperty: () => {}}), getScriptProperties: () => ({getProperty: () => null})};
    ${code}
    getSpreadsheet_ = () => ({});
    getSheet_ = () => phraseSheet;
    getCollectionsSheet_ = () => collectionSheet;
    getCollectionMembersSheet_ = () => memberSheet;
    const LockService = {getDocumentLock: () => null, getScriptLock: () => ({waitLock() {}, releaseLock() {}})};
    return {saveGeneratedPhrases, savePhrase, createCollection, renameCollection, deleteCollection, loadAppData, deletePhrase};
  `)(phraseSheet, memberSheet, collectionSheet);
  return {api:run, run:run.saveGeneratedPhrases, phraseRows, memberRows, fail(rollback = false) { failLinks = true; failRecovery = rollback; }};
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


// Collection metadata and membership editing use the existing phrase save API.
const managed = generatorBackend();
const originalPhrase = managed.phraseRows[0].slice();
const created = managed.api.createCollection({name:'Viajes'});
assert.throws(() => managed.api.createCollection({name:'  viajes  '}), /Ya existe/);
assert.equal(managed.api.renameCollection({id:created.id, name:'Vacaciones'}).name, 'Vacaciones');
assert.throws(() => managed.api.renameCollection({id:created.id, name:'Uno'}), /Ya existe/);
managed.api.deleteCollection(created.id);
assert.deepEqual(managed.phraseRows[0], originalPhrase);
const edited = managed.api.savePhrase({id:'F0001', de:'Hallo!', es:'Hola original', notes:'nota', tags:'saludo', collectionIds:['C1', 'C2'], expectedCollectionIds:['C1'], expectedUpdated:'', expectedLanguageVersion:0});
assert.deepEqual(edited.collectionIds, ['C1', 'C2']);
managed.api.deleteCollection('C1');
const snapshot = managed.api.loadAppData();
assert.equal(snapshot.items.length, 1);
assert.deepEqual(snapshot.memberIdsByCollection.C2, ['F0001']);
assert.equal(Object.hasOwn(snapshot, 'history'), false);
assert.deepEqual(managed.api.deletePhrase({id:'F0001', expectedUpdated:edited.item.updated}), {id:'F0001'});
assert.equal(managed.phraseRows.length, 0);
assert.deepEqual(managed.memberRows, [['', '', ''], ['', '', '']]);
assert.doesNotMatch(code, /Historial|recordStudy|addCollectionPhrases|removeCollectionPhrase|moveCollectionPhrase/);
console.log('Collection CRUD, phrase membership, deletion and history-free snapshot: OK');

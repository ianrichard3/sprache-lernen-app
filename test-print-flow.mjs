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
const html = readFileSync('App.html', 'utf8');
const printPlan = Function(
  "const UNASSIGNED_COLLECTION_ID = '__unassigned__';\n" +
  "const ALL_PRINT_SCOPE = 'all';\n" +
  "const COLLECTION_PRINT_SCOPE = 'collections';\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function collectionIdKey_(value) { return normalize_(value).toUpperCase(); }\n" +
  "function isUnassignedCollection_(id) { return collectionIdKey_(id) === collectionIdKey_(UNASSIGNED_COLLECTION_ID); }\n" +
  between(code, 'function shuffleItems_(items) {', '\n\nfunction requestedPrintCollectionIds_') +
  between(code, 'function requestedPrintCollectionIds_(value, collections) {', '\n\nfunction printPlan_') +
  between(code, 'function printPlan_(data, payload) {', '\n\nfunction printMarkdownCell_') +
  '\nreturn printPlan_;'
)();

const item = (id, printedAt = '') => ({id, de: id, es: id + ' es', printedAt});
const items = [item('F1'), item('F2', '2026-09-01T00:00:00.000Z'), item('F3'), item('F4')];
const data = {
  phrases: {items, byId: Object.fromEntries(items.map(value => [value.id, value]))},
  collections: {
    byId: {
      C1: {id: 'C1', name: 'Trabajo'},
      C2: {id: 'C2', name: 'Viaje'}
    }
  },
  memberships: {
    rows: [
      {collectionKey: 'C1', phraseKey: 'F2', position: 2, sourceIndex: 0},
      {collectionKey: 'C1', phraseKey: 'F1', position: 1, sourceIndex: 1},
      {collectionKey: 'C2', phraseKey: 'F2', position: 1, sourceIndex: 2},
      {collectionKey: 'C2', phraseKey: 'F3', position: 2, sourceIndex: 3}
    ]
  }
};

const selected = printPlan(data, {
  scope: 'collections', collectionIds: ['C2', 'C1'], onlyUnprinted: false, order: 'manual'
});
assert.deepEqual(selected.groups.map(group => [group.name, group.items.map(value => value.id)]), [
  ['Viaje', ['F2', 'F3']],
  ['Trabajo', ['F1', 'F2']]
]);
assert.deepEqual(selected.phraseIds, ['F2', 'F3', 'F1']);
assert.equal(selected.count, 3);
assert.equal(selected.rowCount, 4);

const unprinted = printPlan(data, {
  scope: 'collections', collectionIds: ['C1', '__unassigned__'], onlyUnprinted: true, order: 'manual'
});
assert.deepEqual(unprinted.groups.map(group => [group.name, group.items.map(value => value.id)]), [
  ['Trabajo', ['F1']],
  ['Sin colección', ['F4']]
]);
assert.equal(unprinted.rowCount, 2);

const all = printPlan(data, {scope: 'all', collectionIds: [], onlyUnprinted: false, order: 'manual'});
assert.deepEqual(all.groups[0].items.map(value => value.id), ['F4', 'F3', 'F2', 'F1']);
assert.equal(all.rowCount, 4);

const originalRandom = Math.random;
Math.random = () => 0;
const random = printPlan(data, {scope: 'all', collectionIds: [], onlyUnprinted: false, order: 'random'});
Math.random = originalRandom;
const randomIds = random.groups[0].items.map(value => value.id);
assert.deepEqual([...randomIds].sort(), ['F1', 'F2', 'F3', 'F4']);
assert.notDeepEqual(randomIds, ['F4', 'F3', 'F2', 'F1']);

assert.throws(
  () => printPlan(data, {scope: 'collections', collectionIds: [], onlyUnprinted: false, order: 'manual'}),
  /al menos una colección/
);
assert.throws(
  () => printPlan(data, {scope: 'all', collectionIds: [], onlyUnprinted: false, order: 'invalid'}),
  /orden válido/
);

const phraseContentChanged = Function(
  'const COL = {DE: 2, ES: 3};\n' +
  'function normalize_(value) { return String(value == null ? \'\' : value).trim(); }\n' +
  between(code, 'function phraseContentChanged_(row, de, es) {', '\n\nfunction savePhrase') +
  '\nreturn phraseContentChanged_;'
)();
const existingRow = ['', 'Guten Morgen', 'Buen día'];
assert.equal(phraseContentChanged(existingRow, 'Guten Morgen', 'Buen día'), false);
assert.equal(phraseContentChanged(existingRow, 'Guten Tag', 'Buen día'), true);
assert.equal(phraseContentChanged(existingRow, 'Guten Morgen', 'Buenos días'), true);

const printMarkdownCell = Function(
  'function normalize_(value) { return String(value == null ? \'\' : value).trim(); }\n' +
  between(code, 'function printMarkdownCell_(value) {', '\n\nfunction printMarkdown_') +
  '\nreturn printMarkdownCell_;'
)();
assert.equal(printMarkdownCell(' Ich | bin\\du\nheute '), 'Ich \\| bin\\\\du<br>heute');
assert.equal(printMarkdownCell('<x> &'), '&lt;x&gt; &amp;');

const printMarkdown = Function(
  "const Session = {getScriptTimeZone: () => 'TZ'};\n" +
  "const Utilities = {formatDate: () => 'FECHA'};\n" +
  'function normalize_(value) { return String(value == null ? \'\' : value).trim(); }\n' +
  between(code, 'function printMarkdownCell_(value) {', '\n\nfunction printMarkdown_') +
  between(code, 'function printMarkdown_(plan, now) {', '\n\nfunction printFileName_') +
  '\nreturn printMarkdown_;'
)();
assert.equal(printMarkdown({count: 1, rowCount: 2, groups: [
  {name: 'Viaje', items: [{de: 'Ich | bin', es: 'Estoy'}]},
  {name: 'Sin colección', items: [{de: 'Guten Morgen', es: ''}]}
]}, new Date()), '# Deutsch – Frases para estudiar\n\nGenerado el FECHA · 1 frases distintas · 2 filas\n\n## Viaje\n\n| Deutsch | Español |\n| --- | --- |\n| Ich \\| bin | Estoy |\n\n## Sin colección\n\n| Deutsch | Español |\n| --- | --- |\n| Guten Morgen |  |\n');

assert.doesNotMatch(code, /DriveApp|DocumentApp|generatePhrasePdf/);
assert.match(html, /generatePhraseMarkdown/);
assert.doesNotMatch(html, /generatePhrasePdf|generate-pdf/);

console.log('Print selection, ordering, and unprinted filtering: OK');

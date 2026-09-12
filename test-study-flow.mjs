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
const historyWindow = Function(
  "const HISTORY_LIMIT = 20;\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  between(code, 'function historyWindow_(entries, latest) {', '\n\nfunction writeHistory_') +
  '\nreturn historyWindow_;'
)();

const updated = historyWindow([
  {id: 'F0001', correct: true},
  {id: 'F0002', correct: true}
], {id: 'F0001', correct: false});
assert.deepEqual(updated.map(({id, correct}) => [id, correct]), [
  ['F0001', false], ['F0002', true]
]);

const limited = historyWindow(
  Array.from({length: 20}, (_, i) => ({id: `F${i + 1}`})),
  {id: 'F21'}
);
assert.equal(limited.length, 20);
assert.equal(limited[0].id, 'F21');
assert.equal(limited.at(-1).id, 'F19');

const html = readFileSync('App.html', 'utf8');
const matchingItems = Function(
  between(html, '  function matchingItems(items, query) {', '\n\n  function managedItems') +
  '\nreturn matchingItems;'
)();
const searchableItems = [
  {id: 'F1', de: 'Guten Morgen', es: 'Buenos días', notes: 'saludo', tags: ['A1']},
  {id: 'F2', de: 'Auf Wiedersehen', es: 'Hasta luego', notes: 'despedida', tags: ['viaje']}
];
assert.deepEqual(matchingItems(searchableItems, 'BUENOS').map(({id}) => id), ['F1']);
assert.deepEqual(matchingItems(searchableItems, 'viaje').map(({id}) => id), ['F2']);
assert.deepEqual(matchingItems(searchableItems, 'f2').map(({id}) => id), ['F2']);

const randomCandidate = Function(
  between(html, '  function randomCandidate(items, history) {', '\n\n  function dateLabel') +
  '\nreturn randomCandidate;'
)();
const items = [{id: 'F1'}, {id: 'F2'}, {id: 'F3'}];
const originalRandom = Math.random;
Math.random = () => 0.99;
assert.equal(randomCandidate(items, [{id: 'F2'}]).id, 'F3');
Math.random = originalRandom;
assert.equal(randomCandidate(items, items), null);

const paginate = Function(
  'const PAGE_SIZE = 25;\n' +
  between(html, '  function paginate(items, requestedPage) {', '\n\n  function paginationHtml') +
  '\nreturn paginate;'
)();
const pagedItems = Array.from({length: 51}, (_, i) => i + 1);
assert.deepEqual(paginate(pagedItems, 1).items, pagedItems.slice(0, 25));
assert.equal(paginate(pagedItems, 3).items.length, 1);
assert.equal(paginate(pagedItems, 99).page, 3);

const fiveThousand = Array.from({length: 5000}, (_, i) => i);
assert.equal(paginate(fiveThousand, 200).items.length, 25);
assert.equal(paginate(fiveThousand, 201).items.length, 25);

const updateSessionRows = Function(
  'const PAGE_SIZE = 25;\n' +
  'var state = {collectionPage: 2};\n' +
  'var player = {index: 0, uiIndex: 0};\n' +
  'var renders = 0;\n' +
  'function renderCollections() { renders++; }\n' +
  'function replaceSessionRow_() {}\n' +
  'var document = {querySelector() { return null; }};\n' +
  between(html, '  function updateSessionRows_(scrollActive) {', '\n\n  function redrawSessionRows_') +
  '\nreturn {run: updateSessionRows_, state, player, renders: () => renders};'
)();
updateSessionRows.run(false);
assert.equal(updateSessionRows.state.collectionPage, 2);
assert.equal(updateSessionRows.renders(), 0);
updateSessionRows.state.collectionPage = 1;
updateSessionRows.player.index = 25;
updateSessionRows.run(true);
assert.equal(updateSessionRows.state.collectionPage, 2);
assert.equal(updateSessionRows.renders(), 1);

const assertPhraseVersion = Function(
  "const COL = { UPDATED: 8 };\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function toIso_(value) { return value instanceof Date ? value.toISOString() : ''; }\n" +
  between(code, 'function assertPhraseVersion_(row, expectedUpdated) {', '\n\n/** Cambia sólo el estado') +
  '\nreturn assertPhraseVersion_;'
)();
const row = ['', '', '', '', '', '', '', new Date('2026-09-03T12:00:00.000Z')];
assert.doesNotThrow(() => assertPhraseVersion(row, '2026-09-03T12:00:00.000Z'));
assert.throws(() => assertPhraseVersion(row, '2026-09-03T12:01:00.000Z'), /cambió en la planilla/);

console.log('Study history, random selection, and pagination: OK');

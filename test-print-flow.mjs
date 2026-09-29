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
  "function languageHeading_() { return 'Deutsch'; }\n" +
  'function normalize_(value) { return String(value == null ? \'\' : value).trim(); }\n' +
  between(code, 'function printMarkdownCell_(value) {', '\n\nfunction printMarkdown_') +
  between(code, 'function printMarkdown_(plan, now) {', '\n\nfunction printFileName_') +
  '\nreturn printMarkdown_;'
)();
assert.equal(printMarkdown({count: 1, rowCount: 2, groups: [
  {name: 'Viaje', items: [{de: 'Ich | bin', es: 'Estoy'}]},
  {name: 'Sin colección', items: [{de: 'Guten Morgen', es: ''}]}
]}, new Date()), '# Deutsch – Frases para estudiar\n\nGenerado el FECHA · 1 frases distintas · 2 filas\n\n## Viaje\n\n| Deutsch | Español |\n| --- | --- |\n| Ich \\| bin | Estoy |\n\n## Sin colección\n\n| Deutsch | Español |\n| --- | --- |\n| Guten Morgen |  |\n');

const printHtml = Function(
  "const Session = {getScriptTimeZone: () => 'TZ'};\n" +
  "const Utilities = {formatDate: () => 'FECHA'};\n" +
  "function languageHeading_() { return 'Deutsch'; }\n" +
  "function targetLanguage_() { return {locale:'de-DE'}; }\n" +
  'function normalize_(value) { return String(value == null ? \'\' : value).trim(); }\n' +
  between(code, 'function printHtmlCell_(value) {', '\n\nfunction printHtmlBody_') +
  between(code, 'function printHtmlBody_(plan, now) {', '\n\nfunction printHtmlDocument_') +
  '\nreturn printHtmlBody_;'
)();
const htmlMaterial = printHtml({count: 1, rowCount: 1, groups: [
  {name: 'Viaje', items: [{de: '<Ich>', es: 'Estoy & bien'}]}
]}, new Date());
assert.match(htmlMaterial, /&lt;Ich&gt;/);
assert.match(htmlMaterial, /Estoy &amp; bien/);
assert.match(htmlMaterial, /<table>[\s\S]*<th>Deutsch<\/th>/);

const frenchHtml = Function(
  "const Session = {getScriptTimeZone: () => 'TZ'};\n" +
  "const Utilities = {formatDate: () => 'FECHA'};\n" +
  "function languageHeading_() { return 'Francés'; }\n" +
  "function targetLanguage_() { return {locale:'fr-FR'}; }\n" +
  'function normalize_(value) { return String(value == null ? \'\' : value).trim(); }\n' +
  between(code, 'function printHtmlCell_(value) {', '\n\nfunction printHtmlBody_') +
  between(code, 'function printHtmlBody_(plan, now) {', '\n\nfunction printHtmlDocument_') +
  '\nreturn printHtmlBody_;'
)();
assert.match(frenchHtml({count:1, rowCount:1, groups:[{name:'Viaje', items:[{de:'Bonjour', es:'Hola'}]}]}, new Date()), /<th>Francés<\/th>[\s\S]*<td lang="fr-FR">Bonjour<\/td>/);

const properties = new Map();
const bound = Function('PropertiesService', 'SpreadsheetApp',
  "const SPREADSHEET_ID_PROPERTY = 'APP_SPREADSHEET_ID';\n" +
  between(code, 'function getSpreadsheet_() {', '\n\nfunction targetLanguage_()') +
  '\nreturn {registerSpreadsheet_, getSpreadsheet_};'
)({getScriptProperties:() => ({getProperty:key => properties.get(key), setProperty:(key, value) => properties.set(key, value)})},
  {getActiveSpreadsheet:() => ({getId:() => 'NEW-SHEET'}), openById:id => ({id})});
assert.throws(() => bound.getSpreadsheet_(), /menú Frases/);
bound.registerSpreadsheet_();
assert.equal(bound.getSpreadsheet_().id, 'NEW-SHEET');

const production = Function('PropertiesService', 'SpreadsheetApp',
  "const SPREADSHEET_ID_PROPERTY = 'APP_SPREADSHEET_ID'; const PRODUCTION_SPREADSHEET_ID = 'PRODUCTION-SHEET';\n" +
  between(code, 'function getSpreadsheet_() {', '\n\nfunction targetLanguage_()') +
  '\nreturn getSpreadsheet_;'
)({getScriptProperties:() => ({getProperty:() => null})}, {openById:id => ({id})});
assert.equal(production().id, 'PRODUCTION-SHEET');

let targetHeader = '';
let failHeader = false;
const saveLanguage = Function('PropertiesService', 'getSpreadsheet_',
  "const LANGUAGE_PROPERTY = 'APP_TARGET_LANGUAGE'; const SHEET_NAME = 'Frases'; const COL = {DE:2};\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function withLock_(callback) { return callback(); }\n" +
  "function targetLanguage_() { const saved = PropertiesService.getScriptProperties().getProperty(LANGUAGE_PROPERTY); return saved ? JSON.parse(saved) : {name:'alemán', locale:'de-DE', version:0}; }\n" +
  "function assertLanguageVersion_(version) { if (version !== targetLanguage_().version) throw new Error('El idioma cambió'); }\n" +
  between(code, 'function saveLanguageSettings(payload) {', '\n\nfunction getSheet_') +
  '\nreturn saveLanguageSettings;'
)({getScriptProperties:() => ({getProperty:key => properties.get(key) ?? null, setProperty:(key, value) => properties.set(key, value), deleteProperty:key => properties.delete(key)})},
  () => ({getSheetByName:() => ({getRange:() => ({getValue:() => targetHeader, setValue:value => { if (failHeader) { failHeader = false; throw new Error('Header failed'); } targetHeader = value; }})})}));
assert.deepEqual(saveLanguage({name:'Francés', locale:'fr-FR', expectedVersion:0}), {name:'francés', locale:'fr-FR', version:1});
assert.equal(targetHeader, 'Frase (FR)');
assert.deepEqual(JSON.parse(properties.get('APP_TARGET_LANGUAGE')), {name:'francés', locale:'fr-FR', version:1});
assert.throws(() => saveLanguage({name:'Italiano', locale:'it-IT', expectedVersion:0}), /idioma cambió/);
failHeader = true;
assert.throws(() => saveLanguage({name:'Italiano', locale:'it-IT', expectedVersion:1}), /Header failed/);
assert.equal(targetHeader, 'Frase (FR)');
assert.deepEqual(JSON.parse(properties.get('APP_TARGET_LANGUAGE')), {name:'francés', locale:'fr-FR', version:1});

const replaceMaterialBody = Function(
  between(html, '  function replaceMaterialBody_(document, body) {', '\n\n  function generatePrintMaterial_') +
  '\nreturn replaceMaterialBody_;'
)();
assert.equal(replaceMaterialBody('<html><body><p>Original</p></body></html>', ''), '<html><body></body></html>');

assert.doesNotMatch(code, /DriveApp|DocumentApp|generatePhrasePdf/);
assert.match(html, /generatePhraseMarkdown/);
assert.match(html, /generatePhraseHtml/);
assert.doesNotMatch(html, /generatePhrasePdf|generate-pdf/);

console.log('Print selection, ordering, and unprinted filtering: OK');

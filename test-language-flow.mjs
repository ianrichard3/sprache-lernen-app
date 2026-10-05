import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code = readFileSync('Code.gs', 'utf8');
const ai = readFileSync('Ai.gs', 'utf8');
const html = readFileSync('App.html', 'utf8');
const spanish = {name:'español', locale:'es-ES'};
const english = {name:'inglés', locale:'en-US'};

// Execute the actual backend against Sheets that enforce range widths.
function sheet(name, rows, columns = 26) {
  return {
    rows, columns,
    getName: () => name,
    getMaxColumns() { return this.columns; },
    insertColumnsAfter(position, count) { assert.equal(position, this.columns); this.columns += count; },
    getLastRow() { return this.rows.length; },
    getRange(start, column, count = 1, width = 1) {
      assert.ok(column + width - 1 <= this.columns);
      const range = {
        getValues: () => Array.from({length:count}, (_, i) => Array.from({length:width}, (_, j) => rows[start + i - 1]?.[column + j - 1] ?? '')),
        setValues(values) {
          assert.equal(values.length, count);
          values.forEach((valuesRow, i) => {
            assert.equal(valuesRow.length, width);
            const row = rows[start + i - 1] ||= [];
            valuesRow.forEach((value, j) => { row[column + j - 1] = value; });
          });
          return range;
        },
        getValue: () => range.getValues()[0][0],
        setValue: value => range.setValues([[value]]),
        clearContent: () => range.setValues(Array.from({length:count}, () => Array(width).fill(''))),
        getSheet: () => this,
        getColumn: () => column,
        getRow: () => start,
        getNumColumns: () => width,
        getNumRows: () => count
      };
      return range;
    }
  };
}
const created = new Date('2026-10-01T00:00:00Z');
const sheets = {
  Frases:sheet('Frases', [Array(9).fill(''), ['F0001', 'Hallo', 'Hola', 'nota', 'Dominada', 'saludo', created, created, created]], 9),
  Historial:sheet('Historial', [['ID', 'Resultado', 'Estudiado']]),
  Colecciones:sheet('Colecciones', [['ID', 'Nombre', 'Creado', 'Actualizado'], ['C0001', 'Viaje', created, created]]),
  ColeccionesFrases:sheet('ColeccionesFrases', [['Colección ID', 'Frase ID', 'Posición']])
};
const properties = new Map([['APP_SPREADSHEET_ID', 'sheet-1'], ['APP_TARGET_LANGUAGE', JSON.stringify({name:'alemán', locale:'de-DE', version:0})]]);
const propertyStore = {getProperty:key => properties.get(key) ?? null, setProperty:(key, value) => properties.set(key, value), deleteProperty:key => properties.delete(key)};
const spreadsheet = {getSheetByName:name => sheets[name]};
let instruction, input, response, beforeResponse;
const api = Function('PropertiesService', 'SpreadsheetApp', 'LockService', 'Utilities', 'Session', 'aiResponse', `
  ${code}\n${ai}
  geminiText_ = (prompt, text) => aiResponse(prompt, text);
  return {targetLanguage_, saveLanguageSettings, loadAppData, savePhrase, saveGeneratedPhrases, importPhrases,
    setPhrasePrinted, onEdit, saveMaterialPronunciations, printPlanSignature_, previewPhraseMaterial, generatePhraseHtml, generatePhraseMarkdown,
    suggestGermanTranslation, suggestSpanishTranslation, generatePhrases, analyzeEtymology, suggestPronunciation};
`)(
  {getScriptProperties:() => propertyStore, getDocumentProperties:() => propertyStore},
  {openById:id => { assert.equal(id, 'sheet-1'); return spreadsheet; }},
  {getScriptLock:() => ({waitLock() {}, releaseLock() {}})},
  {formatDate:() => 'FECHA', parseCsv:(text, delimiter) => text.trim().split('\n').map(row => row.split(delimiter))},
  {getScriptTimeZone:() => 'UTC'},
  (prompt, text) => { instruction = prompt; input = text; if (beforeResponse) beforeResponse(); return response; }
);
// A direct grid edit must migrate a physically nine-column sheet before reading it.
const legacyRow = sheets.Frases.rows[1].slice();
api.onEdit({range:sheets.Frases.getRange(2, 2)});
assert.equal(sheets.Frases.columns, 11);
assert.equal(sheets.Frases.rows[1][8], '');
assert.equal(sheets.Frases.rows[1][9], '');
assert.equal(sheets.Frases.rows[1][10], '');
assert.deepEqual(sheets.Frases.rows[1].slice(0, 7), legacyRow.slice(0, 7));
sheets.Frases.rows[1] = legacyRow;
assert.deepEqual(api.targetLanguage_().translation, spanish);
const old = api.loadAppData().items[0];
assert.equal(old.de, 'Hallo');
assert.equal(old.pronunciation, '');
assert.equal(old.kana, '');
assert.equal(sheets.Frases.columns, 11);
const japanese = api.saveLanguageSettings({name:'japonés', locale:'ja-JP', translation:spanish, expectedVersion:0});
assert.equal(japanese.version, 1);
assert.deepEqual(sheets.Frases.rows[1].slice(0, 9), ['F0001', 'Hallo', 'Hola', 'nota', 'Dominada', 'saludo', created, created, created]);
const payload = {de:'今日はコーヒーを飲みます。', es:'Hoy tomaré café.', kana:'きょうはコーヒーをのみます。', pronunciation:'Kyō wa kōhī o nomimasu.', collectionIds:['C0001'], expectedLanguageVersion:1};
const saved = api.savePhrase(payload);
assert.equal(saved.item.kana, payload.kana);
assert.equal(saved.item.pronunciation, payload.pronunciation);
assert.deepEqual(api.loadAppData().memberIdsByCollection.C0001, [saved.item.id]);
const legacyEdit = api.savePhrase({id:saved.item.id, de:payload.de, es:payload.es, collectionIds:['C0001'],
  expectedCollectionIds:['C0001'], expectedUpdated:saved.item.updated, expectedLanguageVersion:1});
assert.equal(legacyEdit.item.pronunciation, payload.pronunciation);
assert.equal(legacyEdit.item.kana, payload.kana);
const mark = api.setPhrasePrinted({id:saved.item.id, printed:true, expectedUpdated:legacyEdit.item.updated});
const unchanged = api.savePhrase({...payload, id:saved.item.id, expectedUpdated:mark.updated, expectedCollectionIds:['C0001']});
assert.equal(unchanged.item.printedAt, mark.printedAt);
const edited = api.savePhrase({...payload, id:saved.item.id, pronunciation:'Kyō wa kōhī o nomimasu', expectedUpdated:unchanged.item.updated, expectedCollectionIds:['C0001']});
assert.equal(edited.item.printedAt, '');
const marked = api.setPhrasePrinted({id:saved.item.id, printed:true, expectedUpdated:edited.item.updated});
const kanaEdit = api.savePhrase({...payload, id:saved.item.id, kana:'きょうは コーヒーを のみます。', expectedUpdated:marked.updated, expectedCollectionIds:['C0001']});
assert.equal(kanaEdit.item.printedAt, '');
api.setPhrasePrinted({id:saved.item.id, printed:true, expectedUpdated:kanaEdit.item.updated});
api.onEdit({range:sheets.Frases.getRange(3, 10)});
assert.equal(api.loadAppData().items.find(item => item.id === saved.item.id).printedAt, '');
assert.throws(() => api.savePhrase({...payload, de:'Invalid', pronunciation:{}}), /deben ser texto/);

const plain = api.savePhrase({de:'ありがとう。', es:'Gracias.', collectionIds:[], expectedLanguageVersion:1}).item;
const printPayload = {scope:'all', order:'manual', onlyUnprinted:false, expectedLanguageVersion:1};
const preview = api.previewPhraseMaterial(printPayload);
assert.match(preview.body, /<th>Japonés<\/th><th data-print-pronunciation>Pronunciación<\/th><th>Español<\/th>/);
assert.match(preview.body, /きょうは コーヒーを のみます。<\/span><span[^>]+>Kyō wa kōhī o nomimasu\./);
assert.match(preview.body, /ありがとう。<\/td><td data-print-pronunciation><span[^>]+><\/span><span[^>]+><\/span><\/td><td lang="es-ES">Gracias\./);
const withPronunciation = api.generatePhraseMarkdown(printPayload);
assert.match(withPronunciation.content, /\| Japonés \| Pronunciación \| Español \|/);
assert.match(withPronunciation.content, /\| ありがとう。 \|  \| Gracias\. \|/);
const document = api.generatePhraseHtml({...printPayload, previewSignature:api.previewPhraseMaterial(printPayload).signature});
assert.match(document.content, /きょうは コーヒーを のみます。<\/span><span[^>]+>Kyō wa kōhī o nomimasu\./);
// Marking a downloaded document must not invalidate its content signature.
const downloadedAgain = api.generatePhraseHtml({...printPayload, previewSignature:document.signature});
assert.equal(downloadedAgain.signature, document.signature);
assert.ok(downloadedAgain.phrases.every(item => item.updated));
const beforePreviewSave = api.loadAppData().items.find(item => item.id === saved.item.id);
const savePreviewPayload = {...printPayload, previewSignature:downloadedAgain.signature,
  edits:[{id:saved.item.id, expectedUpdated:beforePreviewSave.updated, pronunciation:'Updated romaji', kana:'あたらしいよみ'}]};
const unchangedRows = JSON.stringify(sheets.Frases.rows);
for (const invalid of [
  {...savePreviewPayload, previewSignature:'old'},
  {...savePreviewPayload, expectedLanguageVersion:0},
  {...savePreviewPayload, edits:[{...savePreviewPayload.edits[0], id:'unknown'}]},
  {...savePreviewPayload, edits:[...savePreviewPayload.edits, ...savePreviewPayload.edits]},
  {...savePreviewPayload, edits:[{...savePreviewPayload.edits[0], expectedUpdated:'old'}]},
  {...savePreviewPayload, edits:[{...savePreviewPayload.edits[0], kana:null}]},
  {...savePreviewPayload, edits:[savePreviewPayload.edits[0], {id:plain.id, expectedUpdated:'old', pronunciation:'No partial write', kana:''}]}
]) {
  assert.throws(() => api.saveMaterialPronunciations(invalid));
  assert.equal(JSON.stringify(sheets.Frases.rows), unchangedRows, 'Failed saves must not partially mutate phrases');
}
const previewSaved = api.saveMaterialPronunciations(savePreviewPayload);
assert.equal(previewSaved.items.length, 1);
assert.equal(previewSaved.items[0].pronunciation, 'Updated romaji');
assert.equal(previewSaved.items[0].kana, 'あたらしいよみ');
assert.equal(previewSaved.items[0].printedAt, '');
for (const field of ['de', 'es', 'notes', 'tags', 'status', 'created']) {
  assert.deepEqual(previewSaved.items[0][field], beforePreviewSave[field]);
}
assert.deepEqual(api.loadAppData().memberIdsByCollection.C0001, [saved.item.id]);
assert.notEqual(previewSaved.signature, downloadedAgain.signature);
const afterPreviewSave = api.generatePhraseHtml({...printPayload, previewSignature:previewSaved.signature});
const unchangedSave = api.saveMaterialPronunciations({...printPayload, previewSignature:afterPreviewSave.signature,
  edits:afterPreviewSave.phrases.filter(item => item.id === saved.item.id).map(item => ({...item, expectedUpdated:item.updated, pronunciation:' Updated romaji '}))});
assert.deepEqual(unchangedSave.items, []);
assert.ok(api.loadAppData().items.find(item => item.id === saved.item.id).printedAt, 'No-op aid edits preserve marks');
const latest = api.loadAppData().items.find(item => item.id === saved.item.id);
api.savePhrase({...payload, id:saved.item.id, pronunciation:'Edited', expectedUpdated:latest.updated, expectedCollectionIds:['C0001']});
assert.throws(() => api.generatePhraseHtml({...printPayload, previewSignature:document.signature}), /Volvé a previsualizarlo/);
const unprinted = api.previewPhraseMaterial({...printPayload, onlyUnprinted:true});
assert.equal(unprinted.includedCount, 1);
const plainRow = sheets.Frases.rows.find(row => row[0] === plain.id);
// A collection with no aids keeps two columns even when other phrases have aids.
sheets.ColeccionesFrases.rows.push(['C0001', plain.id, 2]);
const plainPrint = {scope:'collections', collectionIds:['__unassigned__'], order:'manual', onlyUnprinted:false, expectedLanguageVersion:1};
assert.doesNotMatch(api.previewPhraseMaterial(plainPrint).body, /<th[^>]*>Pronunciación<\/th>/);
assert.doesNotMatch(api.generatePhraseMarkdown(plainPrint).content, /\| Pronunciación \|/);
assert.equal(plainRow[9], '');

// One phrase can appear twice in a document but has one editable snapshot.
sheets.Colecciones.rows.push(['C0002', 'Café', created, created]);
sheets.ColeccionesFrases.rows.push(['C0002', saved.item.id, 1]);
const repeatedPrint = {...printPayload, scope:'collections', collectionIds:['C0001', 'C0002']};
const repeatedPreview = api.previewPhraseMaterial(repeatedPrint);
assert.equal(repeatedPreview.rowCount, repeatedPreview.includedCount + 1);
assert.equal(repeatedPreview.phrases.filter(item => item.id === saved.item.id).length, 1);
const removedAids = api.saveMaterialPronunciations({...repeatedPrint, previewSignature:repeatedPreview.signature,
  edits:repeatedPreview.phrases.filter(item => item.id === saved.item.id).map(item => ({id:item.id, expectedUpdated:item.updated, pronunciation:'', kana:''}))});
assert.doesNotMatch(removedAids.body, /data-print-pronunciation/);
assert.equal(removedAids.items[0].printedAt, '');
assert.equal(removedAids.items[0].de, payload.de);
api.generatePhraseHtml({...repeatedPrint, previewSignature:removedAids.signature});
console.log('Legacy grid migration, preview saves and repeated downloads: OK');

const imported = api.importPhrases({text:'Original\tTraducción\tRomaji\tKana\n日本へ行きます。\tVoy a Japón.\tNihon e ikimasu.\tにほんへいきます。', delimiter:'\t', hasHeader:true,
  deColumn:0, esColumn:1, pronunciationColumn:2, kanaColumn:3, expectedLanguageVersion:1});
assert.equal(imported.items[0].kana, 'にほんへいきます。');
assert.equal(imported.items[0].pronunciation, 'Nihon e ikimasu.');
const twoColumns = {text:'Original,Traducción\nおはよう。,Buen día.', delimiter:',', hasHeader:true, deColumn:0, esColumn:1, expectedLanguageVersion:1};
assert.equal(api.importPhrases(twoColumns).items[0].pronunciation, '');
assert.equal(api.importPhrases(twoColumns).duplicate, 1);
for (const columns of [{pronunciationColumn:0}, {kanaColumn:8}, {pronunciationColumn:0.5}, {pronunciationColumn:1, kanaColumn:1}]) {
  assert.throws(() => api.importPhrases({...twoColumns, ...columns}), /columnas distintas y válidas/);
}
const generated = api.saveGeneratedPhrases({items:[{de:'猫がいます。', es:'Hay un gato.', pronunciation:'Neko ga imasu.', kana:'ねこがいます。'}], collectionIds:[], expectedLanguageVersion:1});
assert.equal(generated.results[0].item.kana, 'ねこがいます。');
const reused = api.saveGeneratedPhrases({items:[{de:'猫がいます。', es:'Otra', pronunciation:'Otra', kana:'ほか'}], collectionIds:[], expectedLanguageVersion:1});
assert.equal(reused.results[0].item.pronunciation, 'Neko ga imasu.');
assert.equal(reused.results[0].item.es, 'Hay un gato.');

response = JSON.stringify({pronunciation:payload.pronunciation, kana:payload.kana});
assert.deepEqual(api.suggestPronunciation(payload.de, 1), {pronunciation:payload.pronunciation, kana:payload.kana});
assert.match(instruction, /lectura COMPLETA[\s\S]*sin ningún kanji[\s\S]*hiragana y katakana/);
assert.equal(input, 'Texto original:\n' + payload.de);
for (const invalid of ['not json', '{}', JSON.stringify({pronunciation:'test', kana:'今日'}), JSON.stringify({pronunciation:'test', kana:'romaji'}), JSON.stringify({pronunciation:'test', kana:''})]) {
  response = invalid;
  assert.throws(() => api.suggestPronunciation(payload.de, 1), /pronunciación (inválida|incompleta)/);
}
const englishPair = api.saveLanguageSettings({name:'japonés', locale:'ja-JP', translation:english, expectedVersion:1});
assert.equal(englishPair.version, 2);
assert.deepEqual(api.loadAppData().language.translation, english);
assert.equal(api.loadAppData().items.find(item => item.id === saved.item.id).es, payload.es);
assert.equal(sheets.Frases.rows[0][2], 'Traducción (EN)');
assert.throws(() => api.savePhrase({...payload, expectedLanguageVersion:1}), /idioma cambió/);
response = 'I will drink coffee today.';
api.suggestSpanishTranslation(payload.de, 2);
assert.match(instruction, /japonés a inglés/);
api.suggestGermanTranslation(response, 2);
assert.match(instruction, /de inglés a japonés/);
assert.match(input, /Texto en inglés/);
api.analyzeEtymology('猫', 2);
assert.match(instruction, /explicación y los encabezados en inglés/);
response = JSON.stringify(Array.from({length:10}, () => ({target:'猫がいます。', es:'There is a cat.'})));
assert.equal(api.generatePhrases('Animales', 'intermediate', 2)[0].es, 'There is a cat.');
assert.match(instruction, /traducción natural a inglés/);
assert.match(api.previewPhraseMaterial({...printPayload, expectedLanguageVersion:2}).body, /<th>Inglés<\/th>/);
const beforeInvalidSettings = api.targetLanguage_();
assert.throws(() => api.saveLanguageSettings({name:'ruso', locale:'ru-RU', translation:{name:'inglés', locale:'bad code'}, expectedVersion:2}), /código válido/);
assert.deepEqual(api.targetLanguage_(), beforeInvalidSettings);
api.saveLanguageSettings({name:'ruso', locale:'ru-RU', translation:english, expectedVersion:2});
const russian = api.savePhrase({de:'Доброе утро', es:'Good morning', pronunciation:'Dobroye utro', collectionIds:[], expectedLanguageVersion:3}).item;
assert.equal(russian.pronunciation, 'Dobroye utro');
assert.equal(russian.kana, '');
response = JSON.stringify({pronunciation:'Dobroye utro', kana:''});
assert.deepEqual(api.suggestPronunciation(russian.de, 3), {pronunciation:'Dobroye utro', kana:''});
assert.match(instruction, /romanización convencional/);
api.saveLanguageSettings({name:'chino mandarín', locale:'zh-CN', translation:english, expectedVersion:3});
response = JSON.stringify({pronunciation:'Nǐ hǎo', kana:''});
assert.equal(api.suggestPronunciation('你好', 4).pronunciation, 'Nǐ hǎo');
assert.match(instruction, /pinyin con marcas de tono/);
beforeResponse = () => api.saveLanguageSettings({name:'ruso', locale:'ru-RU', translation:english, expectedVersion:4});
assert.throws(() => api.suggestPronunciation('你好', 4), /idioma cambió/);
beforeResponse = null;
console.log('Language pairs, phrase persistence, imports, documents and AI validation: OK');

// Use real client helpers and callbacks. Suggestions fill drafts without saving.
function between(start, end) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }
const state = {language:japanese, showPronunciation:true, languageBusy:0, view:'generate',
  generator:{busy:false, items:[{de:payload.de, es:payload.es, pronunciation:'', kana:'', saved:false}]},
  session:{phase:'listen', supports:{german:false, spanish:true}, revealedIndex:null}, detailId:'F1', studyTab:'phrases', revealed:false};
const fields = Object.fromEntries(['f-de', 'f-pronunciation', 'f-kana', 'f-pronunciation-warning'].map(id => [id, {value:'', hidden:true}]));
fields['f-de'].value = payload.de;
let success, failure, calls = 0, sent, renders = 0;
const button = {dataset:{index:'0'}, disabled:false};
const run = {withSuccessHandler(fn) { success = fn; return this; }, withFailureHandler(fn) { failure = fn; return this; }, suggestPronunciation(text, version) { calls++; sent = [text, version]; }};
const screen = {innerHTML:''};
const client = Function('state', 'document', 'google', 'screen', `
  var player = {index:0, playing:false, voice:{}};
  var el = {screen};
  function renderGenerator() { google.rendered(); }
  function say() {}
  function byId() { return ${JSON.stringify({...payload, id:'F1'})}; }
  function studyTabsHtml() { return ''; }
  ${between('  function targetName_()', '  function languageDraft_')}
  ${between('  function esc(text)', '  function say(')}
  ${between('  function recallPhase_()', '  function currentAudioAvailable_')}
  ${between('  function sessionRowHtml_(', '  function sessionPage_')}
  ${between('  function renderStudy()', '  function phraseCollectionPickerHtml_')}
  ${between('  function originalChanged_(', '  function translateToGerman()')}
  ${between('  function matchingItems(', '  function managedItems()')}
  return {suggestPronunciation_, originalChanged_, pronunciationFieldsHtml_, row:sessionRowHtml_, renderStudy, matchingItems};
`)(state, {getElementById:id => fields[id] || null, body:{contains:() => true}}, {script:{run}, rendered() { renders++; }}, screen);
client.suggestPronunciation_(button);
assert.equal(state.languageBusy, 1);
assert.deepEqual(sent, [payload.de, 1]);
success({pronunciation:payload.pronunciation, kana:payload.kana});
assert.equal(calls, 1, 'Only the suggestion RPC was made');
assert.equal(state.generator.items[0].pronunciation, payload.pronunciation);
assert.equal(state.generator.items[0].saved, false);
assert.equal(state.languageBusy, 0);
assert.equal(renders, 1);
const warningHtml = client.pronunciationFieldsHtml_(state.generator.items[0], 0, '');
assert.match(warningHtml, /generated-kana-0/);
assert.match(warningHtml, /generated-pronunciation-0/);
client.originalChanged_(0);
assert.equal(state.generator.items[0].pronunciationNeedsReview, true);
client.suggestPronunciation_(button);
state.generator.items[0].de = '別の文';
success({pronunciation:'Must not overwrite', kana:'べつのぶん'});
assert.equal(state.generator.items[0].pronunciation, payload.pronunciation);
client.suggestPronunciation_(button);
failure({message:'Provider failed'});
assert.equal(state.languageBusy, 0);
assert.equal(state.generator.items[0].pronunciationBusy, false);
const editorButton = {dataset:{}, disabled:false};
client.suggestPronunciation_(editorButton);
success({pronunciation:payload.pronunciation, kana:payload.kana});
assert.equal(fields['f-kana'].value, payload.kana);
assert.equal(fields['f-pronunciation'].value, payload.pronunciation);
client.originalChanged_();
assert.equal(fields['f-pronunciation-warning'].hidden, false);
client.suggestPronunciation_(editorButton);
fields['f-pronunciation'].value = 'Manual edit during request';
success({pronunciation:'Do not overwrite', kana:payload.kana});
assert.equal(fields['f-pronunciation'].value, 'Manual edit during request');
const japaneseItem = {...payload, id:'F1', notes:'', tags:[]};
assert.doesNotMatch(client.row(japaneseItem, 0), /きょう|Kyō|今日は/);
state.session.phase = 'understand';
state.session.supports.german = true;
assert.match(client.row(japaneseItem, 0), /今日は[\s\S]*きょう[\s\S]*Kyō/);
state.showPronunciation = false;
assert.doesNotMatch(client.row(japaneseItem, 0), /きょう|Kyō/);
state.showPronunciation = true;
state.session.phase = 'recall';
assert.doesNotMatch(client.row(japaneseItem, 0), /きょう|Kyō|今日は/);
state.session.revealedIndex = 0;
assert.match(client.row(japaneseItem, 0), /きょう[\s\S]*Kyō/);
assert.doesNotMatch(client.row(japaneseItem, 1), /きょう|Kyō|今日は/);
client.renderStudy();
assert.doesNotMatch(screen.innerHTML, /きょう|Kyō|今日は/);
state.revealed = true;
client.renderStudy();
assert.match(screen.innerHTML, /きょう[\s\S]*Kyō/);
assert.equal((screen.innerHTML.match(/data-act="toggle-pronunciation"/g) || []).length, 1);
state.showPronunciation = false;
client.renderStudy();
assert.doesNotMatch(screen.innerHTML, /きょう|Kyō/);
assert.deepEqual(client.matchingItems([japaneseItem], 'きょう'), [japaneseItem]);
assert.deepEqual(client.matchingItems([japaneseItem], 'KYŌ'), [japaneseItem]);
state.language = {name:'ruso', locale:'ru-RU', translation:english};
assert.doesNotMatch(client.pronunciationFieldsHtml_(russian, null, ''), /id="f-kana"/);
assert.match(client.pronunciationFieldsHtml_(russian, null, ''), /Dobroye utro/);
assert.match(html, /new SpeechSynthesisUtterance\(item.de\)/);
console.log('Editable pronunciation suggestions, search, study hiding and original audio: OK');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code = readFileSync('Code.gs', 'utf8');
const ai = readFileSync('Ai.gs', 'utf8');
const html = readFileSync('App.html', 'utf8');
const spanish = {name:'español', locale:'es-ES'};
const english = {name:'inglés', locale:'en-US'};
const example = 'まだ日本語のネイティブの本を1冊も読めていません。';
const furigana = '日本語（にほんご）   ---   本（ほん）   ---   1冊（いっさつ）   ---   読めていません（よめていません）';
const coffeeFurigana = '今日（きょう）   ---   飲みます（のみます）';

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
let instruction, input, response, beforeResponse, responseCalls = 0;
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
  (prompt, text) => { responseCalls++; instruction = prompt; input = text; if (beforeResponse) beforeResponse(); return response; }
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

response = JSON.stringify({pronunciation:payload.pronunciation});
assert.deepEqual(api.suggestPronunciation(payload.de, 1), {pronunciation:payload.pronunciation, kana:''});
assert.match(instruction, /romaji Hepburn completo en alfabeto latino/);
assert.match(instruction, /único campo pronunciation/);
assert.doesNotMatch(instruction, /desglose|lectura COMPLETA/);
assert.equal(input, 'Texto original:\n' + payload.de);
for (const invalid of ['not json', '{}', '[]', JSON.stringify({pronunciation:1}), JSON.stringify({pronunciation:''}), JSON.stringify({pronunciation:'きょう'}), JSON.stringify({pronunciation:'Today 今日'})]) {
  response = invalid;
  assert.throws(() => api.suggestPronunciation(payload.de, 1), /pronunciación (inválida|incompleta)/);
}
response = furigana;
assert.deepEqual(api.suggestPronunciation(example, 1, 'kana'), {pronunciation:'', kana:furigana});
assert.match(instruction, /formas conjugadas completas[\s\S]*No transcribas toda la frase[\s\S]*una sola línea/);
assert.ok(instruction.includes('tres espacios, tres guiones y tres espacios: "   ---   "'));
assert.match(instruction, /respondé únicamente con la línea formateada\. Sin JSON ni Markdown/);
assert.doesNotMatch(instruction, /romaji Hepburn/);
assert.equal(input, 'Texto original:\n' + example);
for (const [original, line] of [
  [example, '日本語（にほんご）'],
  [example, 'まだ日本語のネイティブの本を1冊も読めていません（まだにほんごのねいてぃぶのほんをいっさつもよめていません）'],
  ['日本語の本', '日本語の本（にほんごのほん）'],
  ['読めていません。', '読（よ）'],
  ['読めていません。', '読め（よめ）'],
  ['読めていません。', '読めていま（よめていま）'],
  ['日本語', '日本（にほん）   ---   語（ご）'],
  [example, '本（ほん）   ---   日本語（にほんご）   ---   1冊（いっさつ）   ---   読めていません（よめていません）']
]) {
  response = line;
  assert.throws(() => api.suggestPronunciation(original, 1, 'kana'), /furigana inválido/, original + ': ' + line);
}
for (const [original, line] of [
  ['1,000円を払いました。', '1,000円（せんえん）   ---   払いました（はらいました）'],
  ['1.5時間かかります。', '1.5時間（いってんごじかん）'],
  ['3,000,000円です。', '3,000,000円（さんびゃくまんえん）'],
  ['取り扱います。', '取り扱います（とりあつかいます）'],
  ['飲みます。', '飲みます（ノミマス）'],
  ['山の手', '山の手（やまのて）'],
  ['女の子', '女の子（おんなのこ）'],
  ['お金がありません。', 'お金（おかね）'],
  ['本を読みます。本を読みます。', '本（ほん）   ---   読みます（よみます）   ---   本（ほん）   ---   読みます（よみます）']
]) {
  response = line;
  assert.deepEqual(api.suggestPronunciation(original, 1, 'kana'), {pronunciation:'', kana:line}, original);
}
for (const invalid of ['texto extra', '{}', JSON.stringify({kana:furigana}), null, '', 'まだにほんごのねいてぃぶのほんをいっさつもよめていません。', '本（hon）', '本（本）', 'ねこ（ねこ）', '猫（ねこ）', '本（ほん）説明', '本（ほん）\n日本語（にほんご）', example + '（まだにほんご）', ...['\n', '\r', '\r\n', ' --- ', '  ---  ', '    ---    ', '   --   ', '   —   ', '   ---   \n'].map(separator => furigana.replaceAll('   ---   ', separator))]) {
  response = invalid;
  assert.throws(() => api.suggestPronunciation(example, 1, 'kana'), /pronunciación (inválida|incompleta)|furigana inválido/);
}
const callsBeforeKanaOnly = responseCalls;
assert.deepEqual(api.suggestPronunciation('ありがとう。', 1, 'kana'), {pronunciation:'', kana:''});
assert.equal(responseCalls, callsBeforeKanaOnly, 'No AI request is needed without kanji');
response = '本（ほん）';
assert.deepEqual(api.suggestPronunciation('本', 1, 'kana'), {pronunciation:'', kana:response});
assert.throws(() => api.suggestPronunciation(example, 1, 'both'), /ayuda de pronunciación válida/);
assert.throws(() => api.suggestPronunciation('', 1, 'kana'), /texto original/);

// The one-line furigana and its exact spaces survive storage and exports.
const didactic = api.saveGeneratedPhrases({items:[{de:example, es:'Todavía no pude leer ni un libro nativo en japonés.', pronunciation:'', kana:''}], collectionIds:[], expectedLanguageVersion:1}).results[0].item;
const didacticPreview = api.previewPhraseMaterial(printPayload);
const didacticSaved = api.saveMaterialPronunciations({...printPayload, previewSignature:didacticPreview.signature,
  edits:[{id:didactic.id, expectedUpdated:didactic.updated, pronunciation:'', kana:furigana}]});
assert.equal(didacticSaved.items[0].kana, furigana);
assert.equal(api.loadAppData().items.find(item => item.id === didactic.id).kana, furigana);
assert.ok(didacticSaved.body.includes(furigana));
assert.match(didacticSaved.body, /aria-label="Kanji con furigana/);
assert.ok(api.generatePhraseHtml({...printPayload, previewSignature:didacticSaved.signature}).content.includes(furigana));
assert.ok(api.generatePhraseMarkdown(printPayload).content.includes(furigana));
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
assert.throws(() => api.suggestPronunciation(russian.de, 3, 'kana'), /ayuda de pronunciación válida/);
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
  generator:{busy:false, items:[{de:payload.de, es:payload.es, pronunciation:'', kana:payload.kana, saved:false}]},
  session:{phase:'listen', supports:{german:false, spanish:true}, revealedIndex:null}, detailId:'F1', studyTab:'phrases', revealed:false};
const fields = Object.fromEntries(['f-de', 'f-pronunciation', 'f-kana', 'f-pronunciation-warning'].map(id => [id, {value:'', hidden:true}]));
fields['f-de'].value = payload.de;
let success, failure, calls = 0, sent, renders = 0, message;
const button = {dataset:{index:'0', field:'pronunciation'}, disabled:false, textContent:'Sugerir romaji con IA'};
const furiganaButton = {dataset:{index:'0', field:'kana'}, disabled:false, textContent:'Sugerir furigana con IA'};
const run = {withSuccessHandler(fn) { success = fn; return this; }, withFailureHandler(fn) { failure = fn; return this; }, suggestPronunciation(text, version, field) { calls++; sent = [text, version, field]; }};
const screen = {innerHTML:''};
const client = Function('state', 'document', 'google', 'screen', `
  var player = {index:0, playing:false, voice:{}};
  var el = {screen};
  function renderGenerator() { google.rendered(); }
  function say(text) { google.notified(text); }
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
`)(state, {getElementById:id => fields[id] || null, body:{contains:() => true}}, {script:{run}, rendered() { renders++; }, notified(text) { message = text; }}, screen);
client.suggestPronunciation_(button);
assert.equal(state.languageBusy, 1);
assert.deepEqual(sent, [payload.de, 1, 'pronunciation']);
assert.equal(renders, 1, 'Pending draft renders disabled controls immediately');
assert.match(client.pronunciationFieldsHtml_(state.generator.items[0], 0, ' disabled'), /data-field="kana"[^>]* disabled/);
client.suggestPronunciation_(furiganaButton);
assert.equal(calls, 1, 'The visibly disabled second action cannot start another request');
success({pronunciation:payload.pronunciation, kana:''});
assert.equal(calls, 1, 'Only the suggestion RPC was made');
assert.equal(state.generator.items[0].pronunciation, payload.pronunciation);
assert.equal(state.generator.items[0].kana, payload.kana, 'Romaji preserves existing kana');
assert.equal(state.generator.items[0].saved, false);
assert.equal(state.languageBusy, 0);
assert.equal(renders, 2);
assert.equal(button.textContent, 'Sugerir romaji con IA');
const warningHtml = client.pronunciationFieldsHtml_(state.generator.items[0], 0, '');
assert.match(warningHtml, /generated-kana-0/);
assert.match(warningHtml, /generated-pronunciation-0/);
assert.match(warningHtml, /data-field="kana"[^>]*>Sugerir furigana con IA/);
assert.match(warningHtml, /data-field="pronunciation"[^>]*>Sugerir romaji con IA/);
assert.doesNotMatch(warningHtml, /sin kanji/);
client.suggestPronunciation_(furiganaButton);
assert.deepEqual(sent, [payload.de, 1, 'kana']);
state.generator.items[0].pronunciation = 'Manual romaji during furigana request';
success({pronunciation:'', kana:coffeeFurigana});
assert.equal(state.generator.items[0].kana, coffeeFurigana);
assert.equal(state.generator.items[0].pronunciation, 'Manual romaji during furigana request');
assert.equal(furiganaButton.textContent, 'Sugerir furigana con IA');
client.originalChanged_(0);
assert.deepEqual(state.generator.items[0].pronunciationNeedsReview, {pronunciation:true, kana:true});
client.suggestPronunciation_(button);
success({pronunciation:payload.pronunciation, kana:''});
assert.deepEqual(state.generator.items[0].pronunciationNeedsReview, {pronunciation:false, kana:true});
assert.match(client.pronunciationFieldsHtml_(state.generator.items[0], 0, ''), /id="generated-pronunciation-warning-0">/);
client.suggestPronunciation_(furiganaButton);
success({pronunciation:'', kana:coffeeFurigana});
assert.deepEqual(state.generator.items[0].pronunciationNeedsReview, {pronunciation:false, kana:false});
assert.match(client.pronunciationFieldsHtml_(state.generator.items[0], 0, ''), /id="generated-pronunciation-warning-0" hidden/);
client.suggestPronunciation_(button);
state.generator.items[0].de = '別の文';
success({pronunciation:'Must not overwrite', kana:'べつのぶん'});
assert.equal(state.generator.items[0].pronunciation, payload.pronunciation);
client.suggestPronunciation_(button);
failure({message:'Provider failed'});
assert.equal(state.languageBusy, 0);
assert.equal(state.generator.items[0].pronunciationBusy, false);
const callsBeforeEmptyDraft = calls;
state.generator.items[0].de = 'ありがとう。';
const oldDraftKana = state.generator.items[0].kana;
client.suggestPronunciation_(furiganaButton);
assert.match(message, /no tiene kanji/);
assert.equal(calls, callsBeforeEmptyDraft);
assert.equal(state.generator.items[0].kana, oldDraftKana);
const editorButton = {dataset:{field:'pronunciation'}, disabled:false, textContent:'Sugerir romaji con IA'};
const editorFuriganaButton = {dataset:{field:'kana'}, disabled:false, textContent:'Sugerir furigana con IA'};
fields['f-kana'].value = payload.kana;
const callsBeforeEmptyEditor = calls;
fields['f-de'].value = 'ありがとう。';
client.suggestPronunciation_(editorFuriganaButton);
assert.match(message, /no tiene kanji/);
assert.equal(calls, callsBeforeEmptyEditor);
assert.equal(fields['f-kana'].value, payload.kana);
fields['f-de'].value = payload.de;
client.suggestPronunciation_(editorButton);
assert.deepEqual(sent, [payload.de, 1, 'pronunciation']);
success({pronunciation:payload.pronunciation, kana:''});
assert.equal(fields['f-kana'].value, payload.kana);
assert.equal(fields['f-pronunciation'].value, payload.pronunciation);
client.originalChanged_();
assert.equal(fields['f-pronunciation-warning'].hidden, false);
client.suggestPronunciation_(editorButton);
success({pronunciation:payload.pronunciation, kana:''});
assert.equal(fields['f-pronunciation-warning'].hidden, false, 'Furigana still needs review');
client.suggestPronunciation_(editorFuriganaButton);
assert.deepEqual(sent, [payload.de, 1, 'kana']);
fields['f-pronunciation'].value = 'Manual romaji';
success({pronunciation:'', kana:coffeeFurigana});
assert.equal(fields['f-kana'].value, coffeeFurigana);
assert.equal(fields['f-pronunciation'].value, 'Manual romaji');
assert.equal(fields['f-pronunciation-warning'].hidden, true);
client.suggestPronunciation_(editorButton);
fields['f-pronunciation'].value = 'Manual edit during request';
success({pronunciation:'Do not overwrite', kana:payload.kana});
assert.equal(fields['f-pronunciation'].value, 'Manual edit during request');
client.suggestPronunciation_(editorFuriganaButton);
fields['f-kana'].value = 'Manual furigana during request';
success({pronunciation:'', kana:coffeeFurigana});
assert.equal(fields['f-kana'].value, 'Manual furigana during request');
client.suggestPronunciation_(editorFuriganaButton);
fields['f-de'].value = '別の文';
success({pronunciation:'', kana:coffeeFurigana});
assert.equal(fields['f-kana'].value, 'Manual furigana during request');
client.suggestPronunciation_(editorFuriganaButton);
failure({message:'Provider failed'});
assert.equal(state.languageBusy, 0);
assert.equal(editorFuriganaButton.disabled, false);
assert.equal(editorFuriganaButton.textContent, 'Sugerir furigana con IA');
client.suggestPronunciation_(editorFuriganaButton);
state.language = {...japanese, version:2};
success({pronunciation:'', kana:coffeeFurigana});
assert.equal(fields['f-kana'].value, 'Manual furigana during request', 'Late language response is ignored');
state.language = japanese;
const editorHtml = client.pronunciationFieldsHtml_({...payload, kana:coffeeFurigana}, null, '');
assert.match(editorHtml, /data-field="kana"[^>]*>Sugerir furigana con IA/);
assert.match(editorHtml, /data-field="pronunciation"[^>]*>Sugerir romaji con IA/);
const japaneseItem = {...payload, id:'F1', notes:'', tags:[]};
assert.doesNotMatch(client.row(japaneseItem, 0), /きょう|Kyō|今日は/);
state.session.phase = 'understand';
state.session.supports.german = true;
assert.match(client.row(japaneseItem, 0), /今日は[\s\S]*きょう[\s\S]*Kyō/);
assert.ok(client.row({...japaneseItem, kana:coffeeFurigana}, 0).includes(coffeeFurigana));
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
assert.deepEqual(client.matchingItems([{...japaneseItem, kana:coffeeFurigana}], 'のみます'), [{...japaneseItem, kana:coffeeFurigana}]);
state.language = {name:'ruso', locale:'ru-RU', translation:english};
assert.doesNotMatch(client.pronunciationFieldsHtml_(russian, null, ''), /id="f-kana"/);
assert.match(client.pronunciationFieldsHtml_(russian, null, ''), /Dobroye utro/);
assert.match(client.pronunciationFieldsHtml_(russian, null, ''), /Sugerir pronunciación con IA/);
assert.match(html, /new SpeechSynthesisUtterance\(item.de\)/);
console.log('Editable pronunciation suggestions, search, study hiding and original audio: OK');

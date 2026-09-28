import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `${startMarker} is missing`);
  assert.notEqual(end, -1, `${endMarker} is missing`);
  return source.slice(start, end);
}

const code = readFileSync('Ai.gs', 'utf8');
const extractGeminiText = Function(
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  between(code, 'function extractGeminiText_(data) {', '\n\nfunction geminiText_') +
  '\nreturn extractGeminiText_;'
)();

assert.equal(extractGeminiText({
  steps: [{type: 'model_output', content: [{type: 'text', text: ' Guten Morgen '}]}]
}), 'Guten Morgen');
assert.equal(extractGeminiText({steps: [{type: 'model_output', content: []}]}), '');
assert.equal(extractGeminiText({}), '');

const suggestSpanishTranslation = Function(
  "const SPANISH_TRANSLATION_INSTRUCTION = 'Traducí del alemán al español.';\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function geminiText_(instruction, input) { return instruction + '\\n' + input; }\n" +
  between(code, 'function suggestSpanishTranslation(text) {', '\n\nfunction analyzeEtymology') +
  '\nreturn suggestSpanishTranslation;'
)();
assert.equal(
  suggestSpanishTranslation(' Guten Morgen '),
  'Traducí del alemán al español.\nTexto en alemán:\nGuten Morgen'
);
assert.throws(() => suggestSpanishTranslation('  '), /frase en alemán/);

console.log('Gemini response parsing: OK');

const generation = Function('geminiText_', code.slice(code.indexOf('function generatePhrases(context)')) + '\nreturn generatePhrases;');
const phrases = Array.from({length:10}, (_, i) => ({de:` Satz ${i} `, es:` Frase ${i} `}));
assert.deepEqual(generation(() => JSON.stringify(phrases))('Trenes'), phrases.map(({de, es}) => ({de:de.trim(), es:es.trim()})));
assert.throws(() => generation(() => '[]')('Trenes'), /10 frases/);
assert.throws(() => generation(() => 'No JSON')('Trenes'), /inválidas/);
assert.throws(() => generation(() => JSON.stringify(phrases.map(() => ({de:'Hallo', es:''}))))('Trenes'), /10 frases/);
assert.throws(() => generation(() => { throw new Error('Proveedor caído'); })('Trenes'), /Proveedor caído/);
assert.throws(() => generation(() => { assert.fail('No debe llamar a Gemini'); })('  '), /temática/);
console.log('Phrase generation validation: OK');

// Client flow: selection, errors and callbacks while another screen is open.
const html = readFileSync('App.html', 'utf8');
function generatorClient() {
  const state = {loadingData:false, view:'generate', items:[], generator:{context:'Trenes', items:[], collectionIds:['C1', 'C2'], busy:false, saving:false}};
  let success, failure, sent, confirmation = true, renders = 0;
  const run = {
    withSuccessHandler(callback) { success = callback; return this; },
    withFailureHandler(callback) { failure = callback; return this; },
    generatePhrases(context) { sent = context; },
    saveGeneratedPhrases(payload) { sent = payload; },
    loadAppData() { sent = 'loadAppData'; }
  };
  const methods = Function('state', 'google', 'confirm', `
    function renderGenerator() { rendered(); }
    function render() { rendered(); }
    function say() {}
    function byId(id) { return state.items.find(item => item.id === id); }
    function setPhraseCollectionIds_() {}
    function decorateCollections_() {}
    function refreshOpenCollection_() {}
    function clearPrintResult_() { state.printPreview = null; }
    function applyAppData_(data) { state.items = data.items; }
    ${between(html, '  function generatePhrases_()', '  function renderEtymology()')}
    ${between(html, '  function reload(done, preservePrint)', '\n\n  el.app.addEventListener')}
    return {generatePhrases_, saveGeneratedPhrases_, reload};
  `.replaceAll('rendered();', 'google.rendered();'))(state, {script:{run}, rendered() { renders++; }}, () => confirmation);
  return {state, ...methods, success(value) { success(value); }, failure() { failure({message:'Error'}); }, sent:() => sent, renders:() => renders, cancel() { confirmation = false; }};
}
const client = generatorClient();
client.generatePhrases_();
assert.equal(client.state.generator.busy, true);
client.success(phrases);
assert.equal(client.state.generator.items.length, 10);
assert.ok(client.state.generator.items.every(item => !item.selected));
client.state.generator.items[1].selected = true;
client.state.generator.items[1].de = 'Editada DE';
client.state.generator.items[1].es = 'Editada ES';
client.saveGeneratedPhrases_();
assert.deepEqual(client.sent(), {items:[{de:'Editada DE', es:'Editada ES'}], collectionIds:['C1', 'C2']});
client.failure();
assert.equal(client.state.generator.busy, false);
assert.equal(client.state.generator.items[1].de, 'Editada DE');
assert.equal(client.state.generator.items[1].saved, false);
client.saveGeneratedPhrases_();
client.success({results:[{item:{id:'F1', de:'Editada DE', es:'Existente ES'}, reused:true, collectionIds:['C1', 'C2']}]});
assert.equal(client.state.generator.items[1].saved, true);
assert.equal(client.state.generator.items[1].es, 'Existente ES');
assert.equal(client.state.generator.items[0].saved, false);
const beforeFailure = client.state.generator.items;
client.generatePhrases_();
client.failure();
assert.equal(client.state.generator.items, beforeFailure);
client.cancel();
client.generatePhrases_();
assert.equal(client.state.generator.busy, false);
assert.equal(client.state.generator.items, beforeFailure);
const navigated = generatorClient();
navigated.generatePhrases_();
navigated.state.view = 'collections';
const renderCount = navigated.renders();
navigated.success(phrases);
assert.equal(navigated.renders(), renderCount);
assert.equal(navigated.state.generator.items.length, 10);
console.log('Generator client selection and draft preservation: OK');

const savedResult = {results:[{item:{id:'F2', de:'Hallo', es:'Hola'}, collectionIds:['C1']}]};
function selectedClient() {
  const client = generatorClient();
  client.state.generator.items = [{de:'Hallo', es:'Hola', selected:true, saved:false}];
  return client;
}
for (const view of ['manage', 'print', 'collections']) {
  const background = selectedClient();
  background.saveGeneratedPhrases_();
  background.state.view = view;
  background.state.printPreview = {body:'Ediciones pendientes', signature:'original'};
  const preview = background.state.printPreview;
  const renders = background.renders();
  background.success(savedResult);
  assert.equal(background.renders(), renders, 'No debe reconstruir la pantalla activa');
  assert.equal(background.state.printPreview, preview, 'No debe descartar material editado');
  assert.equal(background.state.items[0].id, 'F2');
  assert.equal(background.state.generator.saving, false);
}
const savingFirst = selectedClient();
savingFirst.saveGeneratedPhrases_();
const savePayload = savingFirst.sent();
savingFirst.reload();
assert.equal(savingFirst.sent(), savePayload, 'No puede iniciar una lectura durante el guardado');
savingFirst.success(savedResult);
savingFirst.reload();
assert.equal(savingFirst.sent(), 'loadAppData');
savingFirst.success({items:[savedResult.results[0].item]});
assert.equal(savingFirst.state.items[0].id, 'F2');
assert.equal(savingFirst.state.loadingData, false);
const loadingFirst = selectedClient();
loadingFirst.reload();
loadingFirst.saveGeneratedPhrases_();
assert.equal(loadingFirst.sent(), 'loadAppData', 'No puede guardar con una lectura pendiente');
assert.equal(loadingFirst.state.generator.saving, false);
loadingFirst.success({items:[]});
loadingFirst.saveGeneratedPhrases_();
assert.equal(loadingFirst.state.generator.saving, true);
loadingFirst.failure();
assert.equal(loadingFirst.state.generator.saving, false);
loadingFirst.reload();
loadingFirst.failure();
assert.equal(loadingFirst.state.loadingData, false);
loadingFirst.saveGeneratedPhrases_();
assert.equal(loadingFirst.state.generator.saving, true, 'Los errores no deben bloquear reintentos');
console.log('Background save preserves edits; refresh and save cannot overlap: OK');

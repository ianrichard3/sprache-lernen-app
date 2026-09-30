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
  "function targetLanguage_() { return {name:'alemán', locale:'de-DE'}; }\n" +
  "function assertLanguageVersion_() {}\n" +
  "function normalize_(value) { return String(value == null ? '' : value).trim(); }\n" +
  "function geminiText_(instruction, input) { return instruction + '\\n' + input; }\n" +
  between(code, 'function suggestSpanishTranslation(text, expectedLanguageVersion) {', '\n\nfunction analyzeEtymology') +
  '\nreturn suggestSpanishTranslation;'
)();
assert.equal(
  suggestSpanishTranslation(' Guten Morgen '),
  'Traducí del alemán al español natural para estudiar. Devolvé únicamente la traducción española, sin comillas, explicaciones ni alternativas.\nTexto en alemán:\nGuten Morgen'
);
assert.throws(() => suggestSpanishTranslation('  '), /frase en alemán/);

console.log('Gemini response parsing: OK');

const generation = Function('geminiText_', "function targetLanguage_() { return {name:'alemán', locale:'de-DE'}; }\nfunction assertLanguageVersion_() {}\n" + code.slice(code.indexOf('function generatePhrases(context, level, expectedLanguageVersion)')) + '\nreturn generatePhrases;');
const phrases = Array.from({length:10}, (_, i) => ({de:` Satz ${i} `, es:` Frase ${i} `}));
const aiPhrases = phrases.map(({de, es}) => ({target:de, es}));
assert.deepEqual(generation(() => JSON.stringify(aiPhrases))('Trenes'), phrases.map(({de, es}) => ({de:de.trim(), es:es.trim()})));
assert.throws(() => generation(() => '[]')('Trenes'), /10 frases/);
assert.throws(() => generation(() => 'No JSON')('Trenes'), /Respuesta de Gemini:\nNo JSON/);
assert.throws(() => generation(() => JSON.stringify(aiPhrases.map(() => ({target:'Hallo', es:''}))))('Trenes'), /10 frases/);
assert.deepEqual(generation(() => JSON.stringify(phrases))('Trenes'), phrases.map(({de, es}) => ({de:de.trim(), es:es.trim()})));
assert.deepEqual(generation(() => JSON.stringify(aiPhrases.map(({target, es}) => ({ja:target, es}))))('Trenes'), phrases.map(({de, es}) => ({de:de.trim(), es:es.trim()})));
assert.throws(() => generation(() => { throw new Error('Proveedor caído'); })('Trenes'), /Proveedor caído/);
assert.throws(() => generation(() => { assert.fail('No debe llamar a Gemini'); })('  '), /temática/);
let advancedInstruction = '';
const frenchGeneration = Function('geminiText_', "function targetLanguage_() { return {name:'francés', locale:'fr-FR'}; }\nfunction assertLanguageVersion_() {}\n" + code.slice(code.indexOf('function generatePhrases(context, level, expectedLanguageVersion)')) + '\nreturn generatePhrases;')((instruction) => {
  advancedInstruction = instruction;
  return JSON.stringify(aiPhrases);
});
frenchGeneration('Trenes', 'advanced');
assert.match(advancedInstruction, /francés de nivel C1–C2/);
assert.match(advancedInstruction, /campos target y es/);
assert.throws(() => frenchGeneration('Trenes', 'invalid'), /intermedio o avanzado/);
console.log('Phrase generation validation: OK');

// Client flow: selection, errors and callbacks while another screen is open.
const html = readFileSync('App.html', 'utf8');
assert.match(html, /Nivel de la próxima tanda/);
assert.match(html, /Tanda generada:/);
assert.match(html, /button:disabled \{ cursor:not-allowed;/);
function renderGeneratorFor(state) {
  const screen = {innerHTML:''};
  const document = {activeElement:null, getElementById() { return null; }};
  const render = Function('state', 'document', 'el', 'esc', 'targetName_', 'collectionById_',
    between(html, '  function renderGenerator() {', '\n\n  function generatePhrases_') + '\nreturn renderGenerator;')(
      state, document, {screen}, value => String(value == null ? '' : value), () => 'alemán',
      id => state.collections.find(collection => collection.id === id) || null
    );
  render();
  return screen.innerHTML;
}
const renderedGeneratorState = {language:{locale:'de-DE'}, collections:[{id:'C1', name:'Colección'}],
  generator:{busy:false, saving:false, context:'Trenes', level:'intermediate', generatedLevel:'intermediate',
    items:[{de:'Hallo', es:'Hola', selected:false, saved:false}], collectionIds:[]}};
assert.match(renderGeneratorFor(renderedGeneratorState), /Marcá al menos una frase/);
assert.match(renderGeneratorFor(renderedGeneratorState), /Agregar seleccionadas \(0\)<\/button>/);
renderedGeneratorState.generator.items[0].selected = true;
assert.match(renderGeneratorFor(renderedGeneratorState), /Las frases nuevas quedarán en “Sin colección”/);
assert.match(renderGeneratorFor(renderedGeneratorState), /data-act="save-generated">Agregar seleccionadas \(1\)<\/button>/);
renderedGeneratorState.generator.collectionIds = ['C1'];
assert.doesNotMatch(renderGeneratorFor(renderedGeneratorState), /Las frases nuevas quedarán en “Sin colección”/);
assert.doesNotMatch(renderGeneratorFor(renderedGeneratorState), /data-act="save-generated" disabled>/);
renderedGeneratorState.generator.busy = true;
assert.match(renderGeneratorFor(renderedGeneratorState), /Generando frases/);
assert.match(renderGeneratorFor(renderedGeneratorState), /data-act="save-generated" disabled>Agregar seleccionadas \(1\)<\/button>/);
function generatorClient() {
  const state = {loadingData:false, view:'generate', language:{version:0}, items:[], generator:{context:'Trenes', level:'intermediate', generatedLevel:null, items:[], collectionIds:['C1', 'C2'], busy:false, saving:false, debug:''}};
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
    function targetName_() { return 'alemán'; }
    function applyAppData_(data) { state.items = data.items; }
    ${between(html, '  function generatePhrases_()', '  function renderEtymology()')}
    ${between(html, '  function reload(done, preservePrint)', '\n\n  el.app.addEventListener')}
    return {generatePhrases_, saveGeneratedPhrases_, reload};
  `.replaceAll('rendered();', 'google.rendered();'))(state, {script:{run}, rendered() { renders++; }}, () => confirmation);
  return {state, ...methods, success(value) { success(value); }, failure(message = 'Error') { failure({message}); }, sent:() => sent, renders:() => renders, cancel() { confirmation = false; }};
}
const client = generatorClient();
client.generatePhrases_();
assert.equal(client.state.generator.busy, true);
client.success(phrases);
assert.equal(client.state.generator.items.length, 10);
assert.equal(client.state.generator.generatedLevel, 'intermediate');
assert.ok(client.state.generator.items.every(item => !item.selected));
client.state.generator.items[1].selected = true;
client.state.generator.items[1].de = 'Editada DE';
client.state.generator.items[1].es = 'Editada ES';
client.saveGeneratedPhrases_();
assert.deepEqual(client.sent(), {items:[{de:'Editada DE', es:'Editada ES'}], collectionIds:['C1', 'C2'], expectedLanguageVersion:0});
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
client.failure('La IA devolvió JSON inválido.\n\nRespuesta de Gemini:\n```json\n[]\n```');
assert.equal(client.state.generator.items, beforeFailure);
assert.equal(client.state.generator.debug, '```json\n[]\n```');
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
const saveWithoutCollection = selectedClient();
saveWithoutCollection.state.generator.collectionIds = [];
saveWithoutCollection.saveGeneratedPhrases_();
assert.deepEqual(saveWithoutCollection.sent().collectionIds, []);
assert.equal(saveWithoutCollection.state.generator.busy, true);
saveWithoutCollection.success({results:[{item:{id:'F3', de:'Hallo', es:'Hola'}, collectionIds:[]}]});
assert.equal(saveWithoutCollection.state.generator.items[0].saved, true);
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

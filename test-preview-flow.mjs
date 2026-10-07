import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

// Native browser coverage for contenteditable and the actual app event handlers.
// Run separately from the Node-only CI checks: this requires Firefox installed.
const html = readFileSync('App.html', 'utf8');
const mock = String.raw`<script>
Object.defineProperty(window,'speechSynthesis',{get(){throw Error('Audio must not be used');}});
var copied = '';
Object.defineProperty(navigator,'clipboard',{value:{writeText(text){copied=text;return Promise.resolve();}}});
var calls = [], pendingSave, deferSave = false, failSave = false, deferredTranslation, deferredPronunciation;
var snapshot = {language:{name:'japonés',locale:'ja-JP',translation:{name:'inglés',locale:'en-US'},version:1},
 items:[{id:'F1',de:'今日はコーヒーを飲みます。',es:'I will drink coffee today.',kana:'きょうはコーヒーをのみます。',pronunciation:'Kyō wa kōhī o nomimasu.',notes:'',tags:[],updated:'initial',printedAt:'printed'},
 {id:'F2',de:'ありがとう。',es:'Thank you.',kana:'',pronunciation:'',notes:'',tags:[],updated:'initial2',printedAt:''}],
 collections:[{id:'__unassigned__',name:'Sin colección',count:0,unassigned:true},{id:'C1',name:'Café',count:2},{id:'C2',name:'Viaje',count:1}],memberIdsByCollection:{C1:['F1','F2'],C2:['F1']}};
for(var index=3;index<=52;index++) {
 snapshot.items.push({id:'F'+index,de:'Original '+index,es:'Translation '+index,kana:'',pronunciation:'',notes:'',tags:[],updated:'initial'+index,printedAt:''});
 if(index<=27) snapshot.memberIdsByCollection.C1.push('F'+index);
}
function materialBody() {
 var aids=snapshot.items.some(item=>item.pronunciation||item.kana);
 function row(item) {
  return '<tr data-phrase-id="'+item.id+'"><td>'+item.de+'</td>'+(aids?'<td data-print-pronunciation>'+['kana','pronunciation'].map(field=>'<span data-pronunciation-field="'+field+'" data-phrase-id="'+item.id+'">'+item[field]+'</span>').join('')+'</td>':'')+'<td>'+item.es+'</td></tr>';
 }
 return '<h1>Material</h1>'+[snapshot.items.slice(0,2),[snapshot.items[0]]].map(items=>'<table><thead><tr><th>Japonés</th>'+(aids?'<th data-print-pronunciation>Pronunciación</th>':'')+'<th>Inglés</th></tr></thead><tbody>'+items.map(row).join('')+'</tbody></table>').join('');
}
function materialResult() {
 var body=materialBody();
 return {body,content:'<html><body>'+body+'</body></html>',signature:JSON.stringify(snapshot.items.map(item=>[item.id,item.pronunciation,item.kana])),includedCount:2,rowCount:3,name:'material.html',markedAt:'printed',
 phrases:snapshot.items.map(({id,pronunciation,kana,updated})=>({id,pronunciation,kana,updated}))};
}
window.google={script:{get run() {
 var success,failure;
 return new Proxy({}, {get:function(_,key) {
  if(key==='withSuccessHandler') return function(fn){success=fn;return this;};
  if(key==='withFailureHandler') return function(fn){failure=fn;return this;};
  return function(payload,version,field) {
   calls.push([key,payload,version,field]);
   if(key==='suggestGermanTranslation'||key==='suggestSpanishTranslation') {deferredTranslation=success;return;}
   if(key==='suggestPronunciation') {deferredPronunciation=success;return;}
   if(key==='generatePhrases') return success(Array.from({length:10},()=>({de:snapshot.items[0].de,es:snapshot.items[0].es})));
   if(key==='previewImport') return success({columnCount:2,rows:[['Original','Translation']]});
   if(key==='importPhrases') return failure({message:'Import failed'});
   if(key==='createCollection') {var collection={id:'C3',name:payload.name,count:0};snapshot.collections.push(collection);snapshot.memberIdsByCollection.C3=[];return success(collection);}
   if(key==='renameCollection') {var collection=snapshot.collections.find(item=>item.id===payload.id);collection.name=payload.name;return success({...collection});}
   if(key==='deleteCollection') {snapshot.collections=snapshot.collections.filter(item=>item.id!==payload);delete snapshot.memberIdsByCollection[payload];return success({id:payload});}
   if(key==='loadAppData') return success(structuredClone(snapshot));
   if(key==='previewPhraseMaterial') return success(materialResult());
   if(key==='generatePhraseHtml') {
    snapshot.items.forEach(item=>{item.printedAt='printed';item.updated+='!';});
    return success(materialResult());
   }
   if(key==='saveMaterialPronunciations') {
    var finish=function(){
     if(failSave) return failure({message:'Save failed'});
     var items=payload.edits.map(edit=>{
      var item=snapshot.items.find(item=>item.id===edit.id);
      item.kana=edit.kana;item.pronunciation=edit.pronunciation;item.printedAt='';item.updated+='!';return {...item};
     });
     success({...materialResult(),items});
    };
    if(deferSave) pendingSave=finish;else finish();
    return;
   }
  };
 }});
}}};
window.confirm=()=>true;
</script>`;
const smoke = String.raw`<script>
(async function(){
 var count=0;
 function check(value,message){if(!value)throw Error(message);count++;}
 function node(selector){var result=document.querySelector(selector);check(!!result,selector);return result;}
 function click(selector){node(selector).click();}
 function edit(selector,value){var field=node(selector);field.textContent=value;field.dispatchEvent(new Event('input',{bubbles:true}));}
 function aids(field){return '#print-preview-content [data-phrase-id="F1"][data-pronunciation-field="'+field+'"]';}
 function saves(){return calls.filter(call=>call[0]==='saveMaterialPronunciations').length;}
 function downloads(){return calls.filter(call=>call[0]==='generatePhraseHtml').length;}
 try {
  // Both translation directions preserve edits made during the request.
  click('[data-view="manage"]');click('[data-act="edit"][data-id="F1"]');
  click('[data-act="translate-to-es"]');node('#f-es').value='Manual translation';deferredTranslation('Late translation');
  check(node('#f-es').value==='Manual translation','preserve translation');
  click('[data-act="translate"]');node('#f-de').value='Manual original';deferredTranslation('Late original');
  check(node('#f-de').value==='Manual original','preserve original');
  check(!node('#ai-translate').disabled,'translation reenabled');
  // Each pronunciation button requests and fills only its own field.
  node('#f-de').value=snapshot.items[0].de;node('#f-de').dispatchEvent(new Event('input',{bubbles:true}));
  var furigana='今日（きょう）   ---   飲みます（のみます）';
  click('[data-field="pronunciation"][data-act="suggest-pronunciation"]');
  check(calls.at(-1)[3]==='pronunciation','request only romaji');
  deferredPronunciation({pronunciation:'Kyō wa kōhī o nomimasu.',kana:''});
  check(node('#f-kana').value===snapshot.items[0].kana,'romaji preserves existing kana');
  check(!node('#f-pronunciation-warning').hidden,'furigana still needs review');
  click('[data-field="kana"][data-act="suggest-pronunciation"]');
  check(calls.at(-1)[3]==='kana','request only furigana');
  node('#f-pronunciation').value='Manual romaji';
  deferredPronunciation({pronunciation:'',kana:furigana});
  check(node('#f-pronunciation').value==='Manual romaji','furigana preserves edits to romaji');
  check(node('#f-kana').value===furigana,'one-line furigana fills its field with exact spaces');
  check(node('#f-de').value===snapshot.items[0].de,'original stays unchanged');
  check(node('#f-pronunciation-warning').hidden,'both aids reviewed');
  check(calls.filter(call=>call[0]==='suggestPronunciation').length===2,'one request per click');
  node('#f-de').value='ありがとう。';
  var callsBeforeNoKanji=calls.length;
  click('[data-field="kana"][data-act="suggest-pronunciation"]');
  check(node('#note').textContent.includes('no tiene kanji'),'no-kanji notice in editor');
  check(calls.length===callsBeforeNoKanji,'no-kanji editor avoids RPC');
  check(node('#f-kana').value===furigana,'no-kanji editor preserves existing aid');
  // Five primary sections, native import disclosure and stable filtered practice.
  check(document.querySelectorAll('header .nav').length===5,'five primary sections');
  click('[data-act="cancel-editor"]');
  check(!node('#import-panel').open,'import initially collapsed');
  node('#import-panel').open=true;
  await new Promise(resolve=>setTimeout(resolve,0));
  node('#import-text').value='Original,Translation';node('#import-text').dispatchEvent(new Event('input',{bubbles:true}));
  click('[data-act="preview-import"]');check(node('#import-panel').open,'preview stays open');
  node('#import-de').value='1';node('#import-de').dispatchEvent(new Event('change',{bubbles:true}));
  click('[data-act="import"]');check(node('#import-panel').open,'failed import stays open');
  click('[data-view="settings"]');click('[data-view="manage"]');
  check(node('#import-text').value==='Original,Translation','import draft preserved');
  check(node('#import-de').value==='1','import mapping preserved');
  click('[data-act="edit"][data-id="F1"]');node('#f-es').value='Pending edit';
  click('[data-phrase-filter="manage"][value="C1"]');
  check(document.querySelectorAll('.manage-item').length===25,'manage filters before pagination');
  check(node('#f-es').value==='Pending edit','filter preserves phrase editor');
  click('[data-act="page"][data-list="manage"][data-direction="1"]');
  check(document.querySelectorAll('.manage-item').length===2,'27 filtered phrases on two pages');
  click('[data-phrase-filter="manage"][value="C1"]');click('[data-phrase-filter="manage"][value="C2"]');
  check(document.querySelectorAll('.manage-item').length===1,'filter resets manage page');
  check(!document.querySelector('.pagination'),'one filtered page has no pagination');
  click('[data-view="collections"]');
  check(document.querySelectorAll('.collection-choice').length===2,'only real collections');
  check(!document.querySelector('[data-act="new-collection-phrase"]'),'collections have no phrase creation');
  click('[data-act="new-collection"]');node('#collection-name').value='Test collection';click('[data-act="save-collection"]');
  click('[data-act="edit-collection"][data-id="C3"]');node('#collection-name').value='Renamed';click('[data-act="save-collection"]');
  check(node('[data-act="edit-collection"][data-id="C3"]').parentElement.textContent.includes('Renamed'),'rename collection');
  click('[data-act="delete-collection"][data-id="C3"]');check(snapshot.items.length===52,'delete collection preserves phrases');
  click('[data-view="practice"]');
  check(node('#session-order').value==='random','random is default');
  click('[data-phrase-filter="practice"][value="C1"]');click('[data-phrase-filter="practice"][value="C2"]');
  check(node('#practice-count').textContent==='27 frases','collection union deduplicates');
  var firstIds=Array.from(document.querySelectorAll('.session-choice')).map(row=>row.dataset.id).join(',');
  click('[data-act="page"][data-list="practice"][data-direction="1"]');
  check(document.querySelectorAll('.session-choice').length===2,'practice filters before pagination');
  click('[data-act="page"][data-list="practice"][data-direction="-1"]');
  check(Array.from(document.querySelectorAll('.session-choice')).map(row=>row.dataset.id).join(',')===firstIds,'page changes preserve random order');
  click('[data-act="copy-session-ssml"]');await Promise.resolve();
  check((copied.match(/<break /g)||[]).length===27,'SSML includes all filtered pages');
  check(copied.includes(snapshot.items[0].de)&&!copied.includes('Original 28'),'SSML contains only filtered phrases');
  click('[data-act="clear-phrase-filter"][data-list="practice"]');
  var order=node('#session-order');order.value='manual';order.dispatchEvent(new Event('change',{bubbles:true}));
  check(node('.session-choice').dataset.id==='F1','normal order follows phrase list');
  click('[data-act="toggle-support"][data-support="german"]');
  check(document.activeElement.dataset.support==='german','global visibility retains keyboard focus');
  check(!document.querySelector('.session-row-de'),'global hide original');
  check(!document.querySelector('.pronunciation'),'hidden original hides aids');
  click('[data-act="reveal-practice"][data-id="F1"]');
  check(document.activeElement.dataset.id==='F1','row reveal retains keyboard focus');
  check(node('.pronunciation').textContent.includes('きょう'),'row reveal shows kana');
  check(node('.session-row-es').textContent===snapshot.items[0].es,'row reveal shows translation');
  click('[data-act="reveal-practice"][data-id="F1"]');check(!document.querySelector('.session-row-de'),'second click hides row');
  click('[data-act="reveal-practice"][data-id="F1"]');
  click('[data-act="toggle-support"][data-support="spanish"]');check(!document.querySelector('.session-row-de'),'global controls clear row reveals');
  var search=node('#practice-search');search.value='does not exist';search.dispatchEvent(new Event('input',{bubbles:true}));
  check(!document.querySelector('.pagination')&&node('[data-act="copy-session-ssml"]').disabled,'empty filtered state');
  click('[data-view="tools"]');check(!node('#tool-nav').hidden,'tool navigation visible');
  check(node('header [data-view="tools"]').getAttribute('aria-current')==='page','tools primary section active');
  click('[data-view="print"]');click('[data-act="preview-material"]');
  check(node(aids('kana')).contentEditable==='true','editable kana');
  check(node(aids('kana')).parentElement.contentEditable==='false','editing preserves field boundaries');
  // A corrected pronunciation is stored once and synchronized across collections.
  edit('#print-preview-content tr[data-phrase-id="F1"] td:first-child','File-only original');
  edit(aids('kana'),'あたらしいよみ');edit(aids('pronunciation'),'New romaji');
  click('[data-act="generate-material"]');check(downloads()===0,'must save aids before download');
  check(node('#note').textContent.includes('Guardá la pronunciación'),'pending aids message');
  deferSave=true;click('[data-act="save-print-pronunciation"]');
  check(node(aids('kana')).contentEditable==='false','lock edits while saving');
  check(node('[data-act="generate-material"]').disabled,'lock download while saving');
  click('[data-act="refresh-data"]');check(!calls.slice(-1).some(call=>call[0]==='loadAppData'),'refresh cannot overlap save');
  pendingSave();deferSave=false;
  check(snapshot.items[0].printedAt==='','saved aids clear material mark');
  check(snapshot.items[0].de==='今日はコーヒーを飲みます。','save aids preserves original');
  check(node('#print-preview-content tr[data-phrase-id="F1"] td:first-child').textContent==='File-only original','preserve file-only edits');
  check(Array.from(document.querySelectorAll(aids('kana'))).every(field=>field.textContent==='あたらしいよみ'),'duplicate kana synchronized');
  check(Array.from(document.querySelectorAll(aids('pronunciation'))).every(field=>field.textContent==='New romaji'),'duplicate romaji synchronized');
  click('[data-act="save-print-pronunciation"]');check(saves()===1,'unchanged save makes no RPC');
  // Conflicting copies must be reconciled, instead of silently choosing one.
  var copies=document.querySelectorAll(aids('pronunciation'));copies[0].textContent='First';copies[1].textContent='Second';
  click('[data-act="save-print-pronunciation"]');check(saves()===1,'conflicting copies rejected');
  check(node('#note').textContent.includes('distintas entre colecciones'),'conflict explained');
  copies[1].textContent='New romaji';failSave=true;
  click('[data-act="save-print-pronunciation"]');
  check(node(aids('pronunciation')).textContent==='First','failed save preserves pending edit');
  check(!node('[data-act="save-print-pronunciation"]').disabled,'failed save can retry');
  failSave=false;click('[data-act="save-print-pronunciation"]');
  check(snapshot.items[0].pronunciation==='First','retry persists edit');
  click('[data-view="etymology"]');click('[data-view="print"]');
  check(node('#print-preview-content tr[data-phrase-id="F1"] td:first-child').textContent==='File-only original','tool switch preserves material edits');
  // Browser line breaks round-trip as text, including kana-free romanization.
  node(aids('pronunciation')).innerHTML='Line 1<br>Line 2';
  click('[data-act="save-print-pronunciation"]');
  check(snapshot.items[0].pronunciation==='Line 1\nLine 2','line breaks preserved');
  // File-only changes still download, and a second download succeeds.
  click('[data-act="generate-material"]');click('[data-act="generate-material"]');
  check(downloads()===2,'repeated download');
  check(node('#print-preview-content tr[data-phrase-id="F1"] td:first-child').textContent==='File-only original','downloads retain file-only changes');
  // Clearing all aids returns the document to two columns.
  document.querySelectorAll('#print-preview-content [data-pronunciation-field]').forEach(field=>field.textContent='');
  click('[data-act="save-print-pronunciation"]');
  check(!document.querySelector('#print-preview-content [data-print-pronunciation]'),'remove pronunciation column');
  check(document.querySelectorAll('#print-preview-content tbody tr:first-child td').length===4,'two columns in both tables');
  check(node('#print-preview-content tr[data-phrase-id="F1"] td:first-child').textContent==='File-only original','column removal retains file text');
  check(snapshot.items[0].printedAt==='','clearing aids clears mark');
  // Generated drafts share the same independent actions.
  click('[data-view="generate"]');
  node('#generator-context').value='Coffee';node('#generator-context').dispatchEvent(new Event('input',{bubbles:true}));
  click('[data-act="generate-phrases"]');
  click('[data-field="kana"][data-index="0"][data-act="suggest-pronunciation"]');
  check(calls.at(-1)[3]==='kana','draft requests only furigana');
  check(node('[data-field="pronunciation"][data-index="0"][data-act="suggest-pronunciation"]').disabled,'other draft button visibly disabled during request');
  var pendingCalls=calls.length;
  click('[data-field="pronunciation"][data-index="0"][data-act="suggest-pronunciation"]');
  check(calls.length===pendingCalls,'disabled draft button makes no request');
  deferredPronunciation({pronunciation:'',kana:furigana});
  check(node('#generated-kana-0').value===furigana,'draft fills furigana');
  check(node('#generated-pronunciation-0').value==='','draft preserves empty romaji');
  click('[data-field="pronunciation"][data-index="0"][data-act="suggest-pronunciation"]');
  check(calls.at(-1)[3]==='pronunciation','draft requests only romaji');
  deferredPronunciation({pronunciation:'Kyō wa kōhī o nomimasu.',kana:''});
  check(node('#generated-pronunciation-0').value==='Kyō wa kōhī o nomimasu.','draft fills romaji');
  check(node('#generated-kana-0').value===furigana,'draft romaji preserves furigana');
  node('#generated-de-0').value='ありがとう。';node('#generated-de-0').dispatchEvent(new Event('input',{bubbles:true}));
  callsBeforeNoKanji=calls.length;
  click('[data-field="kana"][data-index="0"][data-act="suggest-pronunciation"]');
  check(node('#note').textContent.includes('no tiene kanji'),'no-kanji notice in draft');
  check(calls.length===callsBeforeNoKanji,'no-kanji draft avoids RPC');
  check(node('#generated-kana-0').value===furigana,'no-kanji draft preserves existing aid');
  click('[data-view="settings"]');click('[data-view="tools"]');
  check(node('#generator-context').value==='Coffee'&&node('#generated-kana-0').value===furigana,'tools reopen last tool with drafts');
  check(document.documentElement.scrollWidth<=window.innerWidth,'layout fits viewport');
  await fetch('/result' ,{method:'POST',body:JSON.stringify({count})});
 } catch(error) {await fetch('/result',{method:'POST',body:JSON.stringify({count,error:error.message+"\n"+error.stack})});}
}());
</script>`;
const page = html.replace('<script>\n(function ()', mock + '\n<script>\n(function ()')
  .replace('</body>\n</html>', smoke + '</body>\n</html>');
const directory = mkdtempSync(join(tmpdir(), 'sprache-preview-'));
let browser, timer;
const server = createServer((request, response) => {
  if (request.url === '/result') {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => { response.end('ok'); finish(JSON.parse(body)); });
  } else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(page); }
});
let finish;
try {
  const report = new Promise((resolve, reject) => {
    finish = resolve;
    timer = setTimeout(() => reject(new Error('Browser checks timed out')), 30000);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const mobile = process.argv.includes('--mobile');
  browser = spawn('firefox', ['--headless', '--no-remote', '--width', mobile ? '390' : '1280', '--height', mobile ? '844' : '900', '--profile', directory, `http://127.0.0.1:${server.address().port}`], {stdio:'ignore'});
  browser.on('error', error => finish({error:error.message}));
  const result = await report;
  assert.equal(result.error, undefined, result.error);
  console.log(`Navigation, filters, practice, pronunciation and preview editing in Firefox (${mobile ? 'mobile' : 'desktop'}): ${result.count} checks OK`);
} finally {
  clearTimeout(timer);
  if (browser && browser.exitCode === null) {
    browser.kill();
    await new Promise(resolve => browser.once('exit', resolve));
  }
  await new Promise(resolve => server.close(resolve));
  rmSync(directory, {recursive:true, force:true});
}

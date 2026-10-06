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
var spoken = [], cancellations = 0;
Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'ja-JP',name:'Japanese'}],cancel:()=>cancellations++,speak:utterance=>spoken.push(utterance.text),addEventListener(){}}});
window.SpeechSynthesisUtterance=function(text){this.text=text;};
var calls = [], pendingSave, deferSave = false, failSave = false, deferredTranslation, deferredPronunciation;
var snapshot = {language:{name:'japonés',locale:'ja-JP',translation:{name:'inglés',locale:'en-US'},version:1},
 items:[{id:'F1',de:'今日はコーヒーを飲みます。',es:'I will drink coffee today.',kana:'きょうはコーヒーをのみます。',pronunciation:'Kyō wa kōhī o nomimasu.',notes:'',tags:[],updated:'initial',printedAt:'printed'},
 {id:'F2',de:'ありがとう。',es:'Thank you.',kana:'',pronunciation:'',notes:'',tags:[],updated:'initial2',printedAt:''}],
 history:[],collections:[{id:'C1',name:'Café',count:2},{id:'C2',name:'Viaje',count:1}],memberIdsByCollection:{C1:['F1','F2'],C2:['F1']}};
function materialBody() {
 var aids=snapshot.items.some(item=>item.pronunciation||item.kana);
 function row(item) {
  return '<tr data-phrase-id="'+item.id+'"><td>'+item.de+'</td>'+(aids?'<td data-print-pronunciation>'+['kana','pronunciation'].map(field=>'<span data-pronunciation-field="'+field+'" data-phrase-id="'+item.id+'">'+item[field]+'</span>').join('')+'</td>':'')+'<td>'+item.es+'</td></tr>';
 }
 return '<h1>Material</h1>'+[snapshot.items,[snapshot.items[0]]].map(items=>'<table><thead><tr><th>Japonés</th>'+(aids?'<th data-print-pronunciation>Pronunciación</th>':'')+'<th>Inglés</th></tr></thead><tbody>'+items.map(row).join('')+'</tbody></table>').join('');
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
  click('[data-view="collections"]');click('[data-act="open-collection"][data-id="C1"]');
  var phase=node('#session-phase');phase.value='recall';phase.dispatchEvent(new Event('change',{bubbles:true}));
  check(!document.querySelector('.session-row-de'),'recall hides original');
  check(!document.querySelector('.pronunciation'),'recall hides aids');
  click('[data-act="toggle-support"][data-support="german"]');
  check(node('.pronunciation').textContent.includes('きょう'),'revealing shows kana');
  click('[data-act="player-row-toggle"][data-index="0"]');
  check(spoken.length===1&&spoken[0]===snapshot.items[0].de,'revealed audio reads original');
  var beforeHide=cancellations;click('[data-act="toggle-support"][data-support="german"]');
  check(cancellations>beforeHide,'hiding stops revealed audio');
  check(!document.querySelector('.pronunciation'),'hiding removes aids');
  phase=node('#session-phase');phase.value='listen';phase.dispatchEvent(new Event('change',{bubbles:true}));
  click('[data-act="player-row-toggle"][data-index="0"]');
  check(spoken.length===2,'listening can play while original hidden');
  check(!document.querySelector('.pronunciation'),'listening hides aids');
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
  await fetch('/result',{method:'POST',body:JSON.stringify({count})});
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
  browser = spawn('firefox', ['--headless', '--no-remote', '--profile', directory, `http://127.0.0.1:${server.address().port}`], {stdio:'ignore'});
  browser.on('error', error => finish({error:error.message}));
  const result = await report;
  assert.equal(result.error, undefined, result.error);
  console.log(`Independent pronunciation, preview editing, translation and recall audio in Firefox: ${result.count} checks OK`);
} finally {
  clearTimeout(timer);
  if (browser && browser.exitCode === null) {
    browser.kill();
    await new Promise(resolve => browser.once('exit', resolve));
  }
  await new Promise(resolve => server.close(resolve));
  rmSync(directory, {recursive:true, force:true});
}

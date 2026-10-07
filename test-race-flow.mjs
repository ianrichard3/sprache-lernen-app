import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('App.html', 'utf8');
const originalScript = html.match(/<script>([\s\S]*)<\/script>/)[1];
const exported = ['state', 'applyAppData_', 'render', 'saveCollection', 'deleteCurrentCollection', 'savePhrase', 'reload', 'importPhrases', 'saveGeneratedPhrases_', 'showEtymology', 'sessionToSsmlText_', 'refreshPractice_', 'previewImport', 'removePhrase', 'setPrintStatus_', 'saveLanguageSettings_'];
const script = originalScript.replace('  reload();\n}());', '  globalThis.audit = {' + exported.join(',') + '};\n}());');
assert.notEqual(script, originalScript);
const phrase = id => ({id, de:'Original ' + id, es:'Translation ' + id, notes:'', tags:[], pronunciation:'', kana:'', updated:'v1', printedAt:''});
const base = () => ({language:{name:'alemán', locale:'de-DE', translation:{name:'español',locale:'es-ES'}, version:0},
  items:Array.from({length:52}, (_, i) => phrase('F' + String(52-i).padStart(4,'0'))),
  collections:[{id:'__unassigned__', name:'Sin colección', unassigned:true}, {id:'C1',name:'A',count:2}], memberIdsByCollection:{C1:['F0052','F0051']}});
function harness(data = base()) {
  const elements = new Map(), queue = [], listeners = {};
  let phraseCollections = [];
  const roots = new Set(['app','screen','note','tool-nav','nav','refresh']);
  function element(id) {
    let content = '';
    const node = {id, value:'', textContent:'', style:{}, dataset:{}, disabled:false, alive:true, hidden:false, checked:false,
      setAttribute(){}, focus(){}, querySelectorAll(){return [];}, matches(){return false;},
      addEventListener(type, callback){listeners[id + ':' + type] = callback;},
      get innerHTML(){return content;}, set innerHTML(value){
        content = value;
        if(id === 'screen') {
          phraseCollections = Array.from(value.matchAll(/<input[^>]*name="phrase-collection"[^>]*>/g), match => ({value:match[0].match(/value="([^"]*)"/)[1], checked:/\bchecked/.test(match[0])}));
          for(const [key, old] of elements) if(!roots.has(key)){old.alive=false;elements.delete(key);}
          for(const match of value.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
            const child = element(match[2]);
            if(match[1] === 'textarea') child.value = value.slice(match.index + match[0].length).split('</textarea>')[0];
            else if(match[1] === 'input') child.value = match[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
            child.checked = /\bchecked/.test(match[0]);
            elements.set(match[2], child);
          }
        }
      }};
    return node;
  }
  for(const id of roots) elements.set(id, element(id));
  const delimiter = {value:',',checked:true};
  const document = {activeElement:null, body:{contains:node=>node?.alive}, addEventListener(){},
    getElementById:id=>elements.get(id) || null,
    querySelector:selector=>selector==='nav' ? elements.get('nav') : selector==='[data-act="refresh-data"]' ? elements.get('refresh') : selector==='input[name="delimiter"]:checked' ? delimiter : null,
    querySelectorAll:selector=>selector.startsWith('input[name="phrase-collection"]') ? phraseCollections.filter(input=>!selector.endsWith(':checked') || input.checked) : []};
  const google = {script:{get run(){
    let success, failure;
    return new Proxy({}, {get(_,key){
      if(key==='withSuccessHandler')return function(fn){success=fn;return this;};
      if(key==='withFailureHandler')return function(fn){failure=fn;return this;};
      return (...args)=>queue.push({key,args,success,failure});
    }});
  }}};
  const context = vm.createContext({document,google,localStorage:{getItem(){return null;}},navigator:{},setTimeout(){return 1;},clearTimeout(){},confirm:()=>true});
  vm.runInContext(script, context, {timeout:2000});
  const audit = context.audit;
  audit.applyAppData_(structuredClone(data));
  audit.render();
  function reply(key, result, occurrence=0, failed=false) {
    const index = queue.map((call, i)=>call.key===key ? i : -1).filter(i=>i!==-1)[occurrence] ?? -1;
    assert.notEqual(index,-1,`Missing pending ${key}`);
    const call = queue.splice(index,1)[0];
    (failed ? call.failure : call.success)(structuredClone(result));
  }
  function act(act, data={}) {
    const button={dataset:{act,...data}};
    listeners['app:click']({target:{closest:()=>button}});
  }
  function input(id, value) {
    const field=document.getElementById(id);field.value=value;
    listeners['app:input']({target:field});
  }
  return {...audit,document,queue,reply,act,input};
}
function startImport(h) {
  h.state.importText='Original,Translation\nFirst,Primera\nSecond,Segunda';
  h.state.importPreview={text:h.state.importText,delimiter:',',data:{columnCount:2,rows:[]}};
  h.state.importOpen=true;
  h.render();
  for(const [id,value] of Object.entries({'import-de':0,'import-es':1,'import-pronunciation':-1,'import-kana':-1})) h.document.getElementById(id).value=String(value);
  h.importPhrases();
}

// Exercise the real client script with delayed RPCs; never connect to live Sheets.
{
  const h=harness();
  h.act('switch-view',{view:'collections'});h.act('new-collection');
  h.input('collection-name','Pending collection');h.saveCollection();
  h.act('switch-view',{view:'manage'});h.act('new');
  h.input('f-de','UNSAVED NEW PHRASE');h.input('f-es','UNSAVED TRANSLATION');
  h.document.querySelectorAll('input[name="phrase-collection"]')[0].checked=true;
  h.reply('createCollection',{id:'C2',name:'Pending collection',count:0});
  assert.equal(h.document.getElementById('f-de').value,'UNSAVED NEW PHRASE');
  assert.equal(h.document.getElementById('f-es').value,'UNSAVED TRANSLATION');
  assert.equal(h.document.querySelectorAll('input[name="phrase-collection"]:checked')[0].value,'C1');
  assert.equal(h.document.querySelectorAll('input[name="phrase-collection"]').length,2);
}
{
  const h=harness();
  h.act('edit',{id:'F0052'});h.savePhrase();
  h.act('edit',{id:'F0051'});h.input('f-de','UNSAVED EDIT OF ANOTHER PHRASE');
  h.reply('savePhrase',{item:{...phrase('F0052'),updated:'v2'},collectionIds:['C1']});
  assert.equal(h.state.editing,'F0051');
  assert.equal(h.state.editingUpdated,'v1');
  assert.equal(h.document.getElementById('f-de').value,'UNSAVED EDIT OF ANOTHER PHRASE');
}
{
  const h=harness();h.act('new');h.input('f-de','First version');h.savePhrase();
  // A read-only callback remounts the editor while its own save is pending.
  h.previewImport();
  h.reply('previewImport',{columnCount:2,rows:[]});
  h.input('f-de','Changed while saving');
  h.reply('savePhrase',{item:{...phrase('F0053'),de:'First version',updated:'v2'},collectionIds:[]});
  assert.equal(h.state.editing,'F0053');
  assert.equal(h.document.getElementById('f-de').value,'Changed while saving');
  h.savePhrase();
  assert.equal(h.queue[0].args[0].id,'F0053','Continues editing the created phrase rather than creating another');
  assert.equal(h.queue[0].args[0].expectedUpdated,'v2');
  h.reply('savePhrase',{item:{...phrase('F0053'),de:'Changed while saving',updated:'v3'},collectionIds:[]});
  assert.equal(h.state.editing,null,'Closes only the unchanged submitted draft');
}
{
  const h=harness();h.act('new');h.input('f-de','First phrase');h.savePhrase();
  h.act('cancel-editor');h.act('new');h.input('f-de','Another new phrase');
  h.reply('savePhrase',{item:phrase('F0053'),collectionIds:[]});
  assert.equal(h.state.editing,'','A separate new-phrase form must not become an edit of the first saved phrase');
  assert.equal(h.document.getElementById('f-de').value,'Another new phrase');
}
{
  const h=harness();h.act('edit',{id:'F0052'});h.input('f-de','My draft');h.reload();
  const refreshed=base();refreshed.items[0].de='External edit';refreshed.items[0].updated='external-v2';refreshed.memberIdsByCollection.C1=['F0051'];
  h.reply('loadAppData',refreshed);
  assert.equal(h.document.getElementById('f-de').value,'My draft');
  h.savePhrase();
  assert.equal(h.queue[0].args[0].expectedUpdated,'v1','Preserving a draft must not bypass stale-write protection');
  assert.deepEqual(Array.from(h.queue[0].args[0].expectedCollectionIds),['C1']);
}
{
  const h=harness();h.act('edit',{id:'F0052'});h.input('f-de','My draft');
  h.setPrintStatus_('F0052',true);h.reply('setPhrasePrinted',{id:'F0052',updated:'marked-v2',printedAt:'now'});
  assert.equal(h.state.editingUpdated,'marked-v2','A local metadata-only change can advance the version without replacing the draft');
  h.reload();const refreshed=base();refreshed.items[0].updated='marked-v3';refreshed.items[0].printedAt='later';h.reply('loadAppData',refreshed);
  h.savePhrase();assert.equal(h.queue[0].args[0].expectedUpdated,'marked-v3');
  assert.equal(h.queue[0].args[0].de,'My draft');
}
{
  const h=harness();h.act('switch-view',{view:'settings'});h.saveLanguageSettings_();
  h.reply('saveLanguageSettings',base().language);
  h.act('switch-view',{view:'manage'});h.act('new');h.input('f-de','Draft during settings reload');
  h.reply('loadAppData',base());
  assert.equal(h.document.getElementById('f-de').value,'Draft during settings reload');
}
{
  const h=harness();h.act('switch-view',{view:'collections'});h.act('new-collection');
  h.input('collection-name','Submitted');h.saveCollection();h.input('collection-name','New draft name');
  h.reply('createCollection',{id:'C2',name:'Submitted',count:0});
  assert.equal(h.state.collectionId,'C2');
  assert.equal(h.document.getElementById('collection-name').value,'New draft name');
  h.saveCollection();assert.equal(h.queue[0].key,'renameCollection');
  h.reply('renameCollection',{id:'C2',name:'New draft name',count:0});
  assert.equal(h.state.collectionEditor,null);
}
{
  const h=harness();h.act('switch-view',{view:'collections'});h.act('new-collection');
  h.input('collection-name','First');h.saveCollection();
  h.act('cancel-collection-editor');h.act('new-collection');h.input('collection-name','Second');
  h.reply('createCollection',{id:'C2',name:'First',count:0});
  assert.equal(h.state.collectionEditor,'new');
  assert.equal(h.document.getElementById('collection-name').value,'Second');
}
{
  const h=harness();h.reload();
  h.act('switch-view',{view:'collections'});h.act('new-collection');h.input('collection-name','Blocked');h.saveCollection();
  assert.deepEqual(h.queue.map(call=>call.key),['loadAppData']);
  assert.equal(h.state.writingData,false);
  h.reply('loadAppData',base());h.saveCollection();
  h.reload();assert.deepEqual(h.queue.map(call=>call.key),['createCollection']);
  h.reply('createCollection',{message:'Write failed'},0,true);
  assert.equal(h.state.writingData,false);h.saveCollection();
  h.reply('createCollection',{id:'C2',name:'Blocked',count:0});h.reload();
  assert.deepEqual(h.queue.map(call=>call.key),['loadAppData'],'Errors release the write guard and successful writes allow refresh');
}
{
  const h=harness();startImport(h);h.reload();h.importPhrases();
  assert.deepEqual(h.queue.map(call=>call.key),['importPhrases'],'Neither refresh nor repeated import can overlap the pending write');
  h.input('import-text','A DIFFERENT IMPORT DRAFT');
  const additions=[phrase('F0053'),phrase('F0054')];
  h.reply('importPhrases',{imported:2,duplicate:0,empty:0,items:additions});
  assert.equal(h.state.languageBusy,0);assert.equal(h.state.writingData,false);
  assert.equal(h.document.getElementById('import-text').value,'A DIFFERENT IMPORT DRAFT');
  h.reload();const refreshed=base();refreshed.items=[...additions,...refreshed.items];h.reply('loadAppData',refreshed);
  assert.equal(h.state.items.filter(item=>item.id==='F0053').length,1);
  assert.equal(h.state.session.items.filter(item=>item.id==='F0053').length,1);
}
{
  const h=harness();h.act('switch-view',{view:'generate'});
  h.state.generator.items=[{de:'New phrase',es:'Nueva frase',selected:true,saved:false}];h.saveGeneratedPhrases_();
  h.act('switch-view',{view:'practice'});h.state.session.page=2;
  const order=Array.from(h.state.session.items,item=>item.id), revealed=order[25];h.state.session.revealedIds[revealed]=true;h.render();
  h.reply('saveGeneratedPhrases',{results:[{item:phrase('F0053'),collectionIds:[],reused:false}]});
  assert.equal(h.state.session.page,2);
  assert.equal(h.state.session.revealedIds[revealed],true);
  assert.deepEqual(Array.from(h.state.session.items.slice(0,52),item=>item.id),order,'Existing random order remains unchanged; additions follow it');
  h.removePhrase(revealed);h.reply('deletePhrase',{id:revealed});
  assert.equal(h.state.session.revealedIds[revealed],undefined);
  assert.deepEqual(Array.from(h.state.session.items,item=>item.id),[...order.filter(id=>id!==revealed),'F0053']);
}
{
  const h=harness();h.act('switch-view',{view:'etymology'});h.input('etymology-source','Haus');h.showEtymology();
  h.act('switch-view',{view:'manage'});h.act('switch-view',{view:'etymology'});h.input('etymology-source','Baum');h.showEtymology();
  h.reply('analyzeEtymology','RESULT FOR Baum',1);h.reply('analyzeEtymology','RESULT FOR Haus');
  assert.equal(h.state.etymologyResult,'RESULT FOR Baum');
  assert.equal(h.document.getElementById('ai-etymology-result').textContent,'RESULT FOR Baum');
  assert.equal(h.state.languageBusy,0);
  h.act('switch-view',{view:'manage'});h.act('switch-view',{view:'etymology'});
  assert.match(h.document.getElementById('screen').innerHTML,/Baum<\/textarea>[\s\S]*RESULT FOR Baum/);
  h.showEtymology();h.input('etymology-source','Another word');h.reply('analyzeEtymology','STALE RESULT');
  assert.equal(h.state.etymologyResult,'');assert.equal(h.document.getElementById('ai-etymology').disabled,false);
  assert.equal(h.document.getElementById('ai-etymology-result').hidden,true);
}
{
  const h=harness();h.act('switch-view',{view:'etymology'});h.input('etymology-source','Haus');h.showEtymology();
  h.act('switch-view',{view:'manage'});h.act('switch-view',{view:'etymology'});h.showEtymology();
  h.reply('analyzeEtymology','LATEST SAME-WORD RESULT',1);h.reply('analyzeEtymology',{message:'Old error'},0,true);
  assert.equal(h.state.etymologyResult,'LATEST SAME-WORD RESULT');
  assert.equal(h.document.getElementById('ai-etymology-result').hidden,false);
  assert.equal(h.state.languageBusy,0);
  h.showEtymology();h.state.language.version++;h.reply('analyzeEtymology','STALE LANGUAGE RESULT');
  assert.equal(h.state.etymologyResult,'');assert.equal(h.state.languageBusy,0);
}
console.log('Delayed callbacks preserve drafts, serialized data operations, stable practice and current etymology: OK');

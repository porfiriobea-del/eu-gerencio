import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { protectTranslatedDom, syncDocumentLanguage } from '../src/lib/browserTranslation.ts';

test('entry document disables browser translation for root and portal content',()=>{
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 const document=dom.window.document;
 assert.equal(document.documentElement.lang,'pt-BR');
 assert.equal(document.querySelector('meta[name="google"]').content,'notranslate');
 for(const node of [document.body,document.getElementById('root')]){
  assert.equal(node.getAttribute('translate'),'no');assert.ok(node.classList.contains('notranslate'));
 }
 dom.window.close();
});

test('translation guard repairs detached references, is idempotent and preserves valid DOM operations and other errors',()=>{
 const dom=new JSDOM('<body></body>'), previous=globalThis.Node;
 globalThis.Node=dom.window.Node;
 try{
  let repaired=0;
  protectTranslatedDom(()=>repaired++);
  const remove=Node.prototype.removeChild, insert=Node.prototype.insertBefore;
  protectTranslatedDom(()=>assert.fail('guard installed twice'));
  assert.equal(Node.prototype.removeChild,remove);assert.equal(Node.prototype.insertBefore,insert);
  const parent=dom.window.document.createElement('div'), other=dom.window.document.createElement('div');
  const original=dom.window.document.createTextNode('Nome original'), foreign=dom.window.document.createTextNode('outro');
  parent.appendChild(original);other.appendChild(foreign);
  // The translator replaces a text node which React still references.
  const translated=dom.window.document.createElement('font');translated.textContent='tradução';parent.replaceChild(translated,original);
  assert.equal(parent.removeChild(original),original);assert.equal(repaired,1);
  const next=dom.window.document.createElement('span');
  assert.equal(parent.insertBefore(next,foreign),next);assert.equal(repaired,2);assert.equal(next.parentNode,null);
  parent.insertBefore(next,null);assert.equal(parent.lastChild,next);
  assert.equal(parent.removeChild(next),next);assert.equal(next.parentNode,null);
  assert.throws(()=>parent.insertBefore(parent,null),/ancestor|hierarchy/i);
  assert.throws(()=>parent.removeChild(null),/Node|parameter/i);
 }finally{globalThis.Node=previous;dom.window.close();}
});

test('selected locale survives translator mutation and updates after switching language',async()=>{
 const dom=new JSDOM('<html lang="pt-BR"><body></body></html>');
 const saved={window:globalThis.window,document:globalThis.document};
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 try{
  for(const [language,expected] of [['pt','pt-BR'],['en','en'],['es','es']]){
   const stop=syncDocumentLanguage(language);assert.equal(document.documentElement.lang,expected);
   document.documentElement.lang='fr';await new Promise(resolve=>setTimeout(resolve,0));
   assert.equal(document.documentElement.lang,expected);stop();
  }
 }finally{Object.assign(globalThis,saved);dom.window.close();}
});

test('React can navigate away and use browser back after a translator replaces a managed text node',async()=>{
 const dom=new JSDOM('<div id="root" translate="no" class="notranslate"></div>',{url:'https://example.test/estoque'});
 const saved={window:globalThis.window,document:globalThis.document,Node:globalThis.Node,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const React=await import('react'), {createRoot}=await import('react-dom/client');
 const errors=[];let repaired=0, root;
 try{
  protectTranslatedDom(()=>repaired++);
  function View(){
   const [path,setPath]=React.useState(window.location.pathname);
   React.useEffect(()=>{const change=()=>setPath(window.location.pathname);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
   return React.createElement('div',null,path==='/estoque'?'Nome original do produto':null,React.createElement('span',null,'Menu'));
  }
  const container=document.getElementById('root');
  root=createRoot(container,{onUncaughtError:error=>errors.push(error)});
  await React.act(async()=>root.render(React.createElement(View)));
  const parent=container.firstChild, original=parent.firstChild;
  const translated=document.createElement('font');translated.textContent='Texto alterado pelo navegador';parent.replaceChild(translated,original);
  await React.act(async()=>{window.history.pushState({},'','/outra');window.dispatchEvent(new window.PopStateEvent('popstate'));});
  await React.act(async()=>{window.history.back();await new Promise(resolve=>setTimeout(resolve,30));});
  assert.equal(window.location.pathname,'/estoque');assert.equal(errors.length,0);assert.ok(repaired>=1);
  assert.ok(container.textContent.includes('Nome original do produto'));
 }finally{if(root)await React.act(async()=>root.unmount());Object.assign(globalThis,saved);dom.window.close();}
});

test('long dates use a Portuguese month regardless of the machine default locale',()=>{
 const date=new Date(2026,9,13,12);
 assert.equal(date.toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'}),'13 de outubro de 2026');
 const dashboard=readFileSync(new URL('../src/pages/Dashboard.tsx',import.meta.url),'utf8');
 assert.ok(dashboard.includes("new Date().toLocaleDateString('pt-BR'"));
 assert.ok(!dashboard.includes("dd 'de' MMMM 'de' yyyy"));
});

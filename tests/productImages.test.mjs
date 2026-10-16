import test from 'node:test';
import assert from 'node:assert/strict';
import {compressProductImage,storeProductImage} from '../src/lib/productImages.ts';

test('photos fit 400px, remain WebP quality 0.7 and shrink further to respect 30KB',async t=>{
 const previousImage=globalThis.Image,previousDocument=globalThis.document;
 t.after(()=>{globalThis.Image=previousImage;globalThis.document=previousDocument;});
 globalThis.Image=class {width=1600;height=1200;set src(value){queueMicrotask(()=>this.onload());}};
 const calls=[];
 const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(callback,type,quality){
  calls.push({width:this.width,height:this.height,type,quality});
  callback(new Blob([new Uint8Array(calls.length===1?40000:20000)],{type}));
 }};
 globalThis.document={createElement:()=>canvas};
 const photo=await compressProductImage('data:image/jpeg;base64,YQ==');
 assert.equal(photo.type,'image/webp');assert.ok(photo.size<=30720);
 assert.deepEqual(calls,[{width:400,height:300,type:'image/webp',quality:0.7},{width:320,height:240,type:'image/webp',quality:0.7}]);
 calls.length=0;
 globalThis.Image=class {width=100;height=50;set src(value){queueMicrotask(()=>this.onload());}};
 canvas.toBlob=function(callback,type,quality){calls.push({width:this.width,height:this.height,type,quality});callback(new Blob(['small'],{type}));};
 await compressProductImage('data:image/png;base64,YQ==');
 assert.equal(calls[0].width,100);assert.equal(calls[0].height,50);
 canvas.toBlob=callback=>callback(new Blob(['png'],{type:'image/png'}));
 await assert.rejects(compressProductImage('data:image/png;base64,YQ=='),/WebP/);
 await assert.rejects(compressProductImage('invalid'),/válida/);
 assert.equal(await storeProductImage('https://example.com/product.webp','owner'),'https://example.com/product.webp');
 assert.equal(await storeProductImage(undefined,'owner'),undefined);
 await assert.rejects(storeProductImage('javascript:bad','owner'),/válido/);
});

test('card images get a source only after intersection',async t=>{
 const {JSDOM}=await import('jsdom');
 const React=await import('react');
 const {createRoot}=await import('react-dom/client');
 const {build}=await import('esbuild');
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const folder=await mkdtemp(new URL('../.image-test-',import.meta.url).pathname);
 t.after(()=>rm(folder,{recursive:true,force:true}));
 const result=await build({entryPoints:['src/components/ProductImage.tsx'],bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
 await writeFile(folder+'/component.mjs',result.outputFiles[0].text);
 const {ProductImage}=await import(folder+'/component.mjs');
 const dom=new JSDOM('<div id="root"></div>');
 const old={window:globalThis.window,document:globalThis.document,IntersectionObserver:globalThis.IntersectionObserver,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 let notify;
 globalThis.IntersectionObserver=class {constructor(cb){notify=cb;}observe(){}disconnect(){}};
 t.after(()=>{Object.assign(globalThis,old);dom.window.close();});
 const root=createRoot(document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(ProductImage,{src:'https://example.com/a.webp',alt:'Produto'})));
 const img=document.querySelector('img');
 assert.equal(img.getAttribute('src'),null);
 await React.act(async()=>notify([{isIntersecting:false}]));
 assert.equal(img.getAttribute('src'),null);
 await React.act(async()=>notify([{isIntersecting:true}]));
 assert.equal(img.getAttribute('src'),'https://example.com/a.webp');
 assert.equal(img.getAttribute('loading'),'lazy');assert.equal(img.getAttribute('decoding'),'async');
 await React.act(async()=>root.unmount());
});

test('Storage saves only compressed WebP and returns a stable link; failures never fall back to Base64',async t=>{
 const {build}=await import('esbuild');
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const folder=await mkdtemp(new URL('../.upload-test-',import.meta.url).pathname);
 t.after(()=>rm(folder,{recursive:true,force:true}));
 const result=await build({entryPoints:['src/lib/productImages.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'storage',setup(b){
  b.onResolve({filter:/^\.\/supabase$/},()=>({path:'storage',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const supabase={storage:{from:()=>globalThis.__photoBucket}}',loader:'js'}));
 }}]});
 await writeFile(folder+'/images.mjs',result.outputFiles[0].text);
 const {storeProductImage:store}=await import(folder+'/images.mjs');
 const old={Image:globalThis.Image,document:globalThis.document,__photoBucket:globalThis.__photoBucket};
 t.after(()=>Object.assign(globalThis,old));
 globalThis.Image=class {width=800;height=800;set src(v){queueMicrotask(()=>this.onload());}};
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toBlob(cb,type){cb(new Blob(['compressed'],{type}));}})};
 const uploads=[];
 globalThis.__photoBucket={async upload(path,blob,options){uploads.push({path,blob,options});return {error:null};},getPublicUrl(path){return {data:{publicUrl:'https://storage.test/produtos/'+path}};}};
 const source='data:image/jpeg;base64,YQ==';
 const url=await store(source,'shop123');
 assert.equal(await store(source,'shop123'),url);
 assert.match(url,/^https:\/\/storage.test\/produtos\/shop123\/[a-f0-9]{64}\.webp$/);
 assert.equal(uploads[0].blob.type,'image/webp');assert.ok(uploads[0].blob.size<=30720);
 assert.equal(uploads[0].options.contentType,'image/webp');
 globalThis.__photoBucket.upload=async()=>({error:new Error('offline')});
 await assert.rejects(store(source,'shop123'),/nuvem/);
});

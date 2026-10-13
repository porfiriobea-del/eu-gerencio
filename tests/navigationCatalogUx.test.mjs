import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
const previous = new Map();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'CustomEvent', 'Event', 'MutationObserver']) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { MemoryRouter } = await import('react-router-dom');
const { render, fireEvent, act, cleanup } = await import('@testing-library/react');
const { AppToast } = await import('../src/components/AppToast.tsx');
let desktop = false;
window.matchMedia = () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} });
const cache = new URL('../node_modules/.cache/', import.meta.url);
await mkdir(cache, { recursive: true });
const dir = await mkdtemp(new URL('navigation-catalog-ui-', cache));
const apiExports = ['subscribeSettings', 'getActiveStoreSession', 'subscribeProducts', 'subscribeTodaySales', 'updateProduct', 'adjustProductStock', 'addProduct', 'addMultipleProducts', 'deleteProduct', 'deleteMultipleProducts', 'recordMovement', 'importSupplierCatalog'];
const mocks = {
  api: apiExports.map(name => `export const ${name} = (...args) => globalThis.__uiApi.${name}(...args);`).join('\n'),
  auth: 'export const logout = () => {};',
  preferencesContext: "export const usePreferences=()=>({t:k=>k,v:(k,f)=>f||k,entityName:()=> 'Produto',languageMode:'neutral',isBasicMode:false,simpleViewMode:false,darkMode:false,setDarkMode:()=>{},toggleSimpleViewMode:()=>{}});",
  employeeContext: 'export const useEmployee=()=>({currentEmployee:null,activeAnnouncement:null,clearAnnouncement:()=>{},openSwitchModal:()=>{}});',
  useOnlineStatus: 'export const useOnlineStatus=()=>({isOnline:true,wasOffline:false,syncNow:()=>{}});',
  categories: "export const getAllCategories=()=>['Bebidas','Diversos']; export const saveCustomCategory=()=>{};",
  geminiCatalogScanner: 'export const prepareCatalogFile=(file)=>globalThis.__prepareFile(file); export const recognizeCatalog=(...args)=>globalThis.__recognizeCatalog(...args);'
};
const childMocks = ['TutorialModal', 'InviteModal', 'EmployeeSwitchModal', 'GlobalMovementHistory', 'PocketTip', 'CameraCaptureModal'];
for (const [name, source] of [['Layout','components/Layout'],['CatalogImportModal','components/CatalogImportModal'],['Stock','pages/Stock']]) {
  await build({ entryPoints: [new URL(`../src/${source}.tsx`, import.meta.url).pathname], bundle:true, packages:'external', format:'esm', platform:'node', jsx:'automatic', outfile:`${dir}/${name}.mjs`,
    plugins:[{name:'mock-integrations',setup(builder){
      builder.onResolve({filter:/.*/},args=> {
        if (!args.path.startsWith('.')) return;
        const name=args.path.split('/').at(-1);
        if (mocks[name] || childMocks.includes(name)) return {path:name,namespace:'ui-mock'};
      });
      builder.onLoad({filter:/.*/,namespace:'ui-mock'},args=>({contents:mocks[args.path]||`export const ${args.path}=()=>null;`,loader:'js'}));
    }}]
  });
}
const {Layout}=await import(pathToFileURL(`${dir}/Layout.mjs`).href);
const {CatalogImportModal}=await import(pathToFileURL(`${dir}/CatalogImportModal.mjs`).href);
const {default:Stock}=await import(pathToFileURL(`${dir}/Stock.mjs`).href);
function api() {
  globalThis.__uiApi={
    subscribeSettings(cb){cb({storeName:'Loja Teste'});return()=>{};},getActiveStoreSession:()=>null,
    subscribeProducts(cb){cb([]);return()=>{};},subscribeTodaySales(cb){cb([]);return()=>{};},
    importSupplierCatalog:()=>assert.fail('Unexpected save')
  };
}
afterEach(()=>{cleanup();delete globalThis.__uiApi;delete globalThis.__prepareFile;delete globalThis.__recognizeCatalog;});
after(async()=>{
  await rm(dir,{recursive:true,force:true});dom.window.close();
  for(const [name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
function nav() {
  api();
  function Harness(){const[pinned,setPinned]=React.useState(true);return React.createElement(Layout,{menuPinned:pinned,onToggleMenuPinned:()=>setPinned(p=>!p)});}
  return render(React.createElement(MemoryRouter,null,React.createElement(Harness)));
}

test('desktop pinned navigation is vertical in a sidebar; unpinning collapses it',()=>{
  desktop=true;const ui=nav();
  assert.ok(ui.getByRole('navigation',{name:'Navegação principal'}).className.includes('flex-col'));
  assert.equal(ui.container.querySelector('header nav'),null);
  assert.equal(ui.queryByRole('dialog'),null);
  fireEvent.click(ui.getAllByRole('button',{name:'Desafixar menu'})[0]);
  assert.equal(ui.queryByRole('navigation',{name:'Navegação principal'}),null);
  fireEvent.click(ui.getByRole('button',{name:'Abrir menu de navegação'}));
  assert.ok(ui.getByRole('dialog',{name:'Menu'}));
  fireEvent.keyDown(document,{key:'Escape'});
  assert.equal(ui.queryByRole('dialog'),null);
});

test('mobile has no tabs; hamburger opens a vertical drawer and navigation closes it',()=>{
  desktop=false;const ui=nav();
  assert.equal(ui.queryByRole('navigation'),null);
  fireEvent.click(ui.getByRole('button',{name:'Abrir menu de navegação'}));
  assert.ok(ui.getByRole('dialog',{name:'Menu'}));
  assert.equal(document.body.style.overflow,'hidden');
  assert.ok(ui.container.querySelector('main').parentElement.hasAttribute('inert'));
  fireEvent.click(ui.getByRole('link',{name:'nav.pos'}));
  assert.equal(ui.queryByRole('dialog'),null);
  assert.equal(document.body.style.overflow,'');
});

test('Stock header has only the three requested actions and no generic banner',()=>{
  api();const ui=render(React.createElement(MemoryRouter,null,React.createElement(Stock)));
  for(const label of ['📸 Cadastrar por Foto (IA)','Novo Produto','📁 Importar Catálogo (PDF ou Foto da Galeria)']) assert.ok(ui.getByRole('button',{name:label}));
  assert.equal(ui.queryByText('Pré-Adicionar / Fotos'),null);
  assert.equal(ui.queryByText('Colocar Todos os Produtos Pré-Cadastrados no Estoque'),null);
  assert.equal(ui.queryByText('📦 Importar Catálogo Padrão (100+ Produtos)'),null);
});

const draft={id:'s-1',selected:true,name:'Suco Fornecedor 1L',category:'Bebidas',type:'comum',purchaseCost:60,costBasis:'embalagem',unitsPerPackage:12,purchaseForm:'fardo',basePrice:'',pricePack:'',priceCart:'',priceHalfCart:'',priceUnit:''};
function importer(){
  api();globalThis.__prepareFile=async()=> 'data:application/pdf;base64,JVBERi0=';
  globalThis.__recognizeCatalog=async()=>({products:[draft],truncated:false});
  function Harness(){const[open,setOpen]=React.useState(true);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setOpen(true)},'Abrir importação'),React.createElement(CatalogImportModal,{isOpen:open,onClose:()=>setOpen(false),availableCategories:['Bebidas'],existingProductNames:[]}),React.createElement(AppToast));}
  return render(React.createElement(Harness));
}
async function upload(ui){await act(async()=>{fireEvent.change(document.querySelector('input[accept="application/pdf,.pdf"]'),{target:{files:[new dom.window.File(['%PDF'], 'fornecedor.pdf',{type:'application/pdf'})]}});});}

test('supplier import offers camera/gallery/PDF and requires reviewed prices before saving',async()=>{
  const ui=importer();
  for(const name of ['Tirar foto do catálogo','Selecionar da galeria','Enviar PDF']) assert.ok(ui.getByRole('button',{name}));
  assert.equal(document.querySelector('input[capture]').getAttribute('capture'),'environment');
  await upload(ui);
  assert.ok(ui.getByDisplayValue(draft.name));
  assert.equal(ui.getByLabelText('Preço de venda (R$)').value,'');
  fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));
  assert.match(ui.getByRole('alert').textContent,/preço de venda/);
  let submitted;
  globalThis.__uiApi.importSupplierCatalog=async products=>{submitted=products;return products.length;};
  fireEvent.change(ui.getByLabelText('Preço de venda (R$)'),{target:{value:'8'}});
  await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));});
  assert.equal(submitted.length,1);assert.equal(submitted[0].unitCost,5);assert.equal(submitted[0].stock,0);
  assert.equal(ui.queryByRole('dialog'),null);
  assert.match(ui.getByRole('status').textContent,/1 produtos do seu catálogo/);
});

test('catalogue reading failure preserves the modal and manual entry',async()=>{
  const ui=importer();globalThis.__recognizeCatalog=async()=>{throw new Error('Limite da IA atingido. Preencha manualmente.');};
  await upload(ui);
  assert.ok(ui.getByRole('dialog'));
  assert.match(ui.getByRole('alert').textContent,/Preencha manualmente/);
  fireEvent.click(ui.getByRole('button',{name:'Adicionar produto manualmente'}));
  assert.ok(ui.getByLabelText('Nome do produto'));
  assert.equal(ui.getByRole('button',{name:'Enviar PDF'}).disabled,false);
});


test('interrupting analysis prevents late results from overwriting manual review',async()=>{
  const ui=importer();let finish;
  globalThis.__recognizeCatalog=()=>new Promise(resolve=>{finish=resolve;});
  await act(async()=>{fireEvent.change(document.querySelector('input[accept="application/pdf,.pdf"]'),{target:{files:[new dom.window.File(['%PDF'], 'fornecedor.pdf',{type:'application/pdf'})]}});});
  assert.ok(ui.getByRole('button',{name:'Interromper'}));
  fireEvent.click(ui.getByRole('button',{name:'Interromper'}));
  fireEvent.click(ui.getByRole('button',{name:'Adicionar produto manualmente'}));
  fireEvent.change(ui.getByLabelText('Nome do produto'),{target:{value:'Cadastro manual preservado'}});
  await act(async()=>{finish({products:[draft],truncated:false});});
  assert.ok(ui.getByDisplayValue('Cadastro manual preservado'));
  assert.equal(ui.queryByDisplayValue(draft.name),null);
});

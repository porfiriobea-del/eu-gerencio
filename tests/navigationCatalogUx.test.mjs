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
const { render, fireEvent, act, cleanup, within } = await import('@testing-library/react');
const { AppToast } = await import('../src/components/AppToast.tsx');
let desktop = false;
window.matchMedia = () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} });
const cache = new URL('../node_modules/.cache/', import.meta.url);
await mkdir(cache, { recursive: true });
const dir = await mkdtemp(new URL('navigation-catalog-ui-', cache));
const apiExports = ['subscribeSettings', 'getActiveStoreSession', 'subscribeProducts', 'subscribeTodaySales', 'updateProduct', 'adjustProductStock', 'addProduct', 'addMultipleProducts', 'deleteProduct', 'deleteMultipleProducts', 'recordMovement', 'importSupplierCatalog', 'getProductDuplicates', 'mergeProducts', 'getEffectiveOwnerId'];
const mocks = {
  api: apiExports.map(name => `export const ${name} = (...args) => globalThis.__uiApi.${name}(...args);`).join('\n'),
  usageReporting: 'export const reportUsage=()=>{};',
  auth: 'export const logout = () => {};',
  permissionsContext: "export const usePermissions=()=>({isOwner:globalThis.__testRole!=='manager',role:globalThis.__testRole||'owner',ready:true,isEmployee:false,canAccess:()=>true});",
  preferencesContext: "export const usePreferences=()=>({t:k=>k,v:(k,f)=>({'replenish.merge':'Juntar produtos','replenish.mergeConfirm':'Confirmar união dos produtos?','replenish.cancel':'Cancelar','replenish.saving':'Salvando...'}[k]||f||k),entityName:()=> 'Produto',languageMode:'neutral',isBasicMode:false,simpleViewMode:false,darkMode:false,setDarkMode:()=>{},toggleSimpleViewMode:()=>{}});",
  employeeContext: 'export const useEmployee=()=>({currentEmployee:null,activeAnnouncement:null,clearAnnouncement:()=>{},openSwitchModal:()=>{}});',
  useOnlineStatus: 'export const useOnlineStatus=()=>({isOnline:true,wasOffline:false,syncNow:()=>{}});',
  cloudStore: "export const deleteField=()=>({__eu_delete_field:true});",
  categories: "export const getAllCategories=()=>['Bebidas','Diversos']; export const saveCustomCategory=()=>{};",
  geminiCatalogScanner: 'export const prepareCatalogFile=(file)=>globalThis.__prepareFile(file); export const recognizeCatalog=(...args)=>globalThis.__recognizeCatalog(...args);'
};
const childMocks = ['OwnerPinDialog','EmployeeFirstPin', 'TutorialModal', 'InviteModal', 'EmployeeSwitchModal', 'GlobalMovementHistory', 'PocketTip', 'CameraCaptureModal'];
for (const [name, source] of [['Layout','components/Layout'],['CatalogImportModal','components/CatalogImportModal'],['Stock','pages/Stock'],['ProductDuplicateDialog','components/ProductDuplicateDialog']]) {
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
const {ProductDuplicateDialog}=await import(pathToFileURL(`${dir}/ProductDuplicateDialog.mjs`).href);
const {default:Stock}=await import(pathToFileURL(`${dir}/Stock.mjs`).href);
function api() {
  globalThis.__uiApi={
    subscribeSettings(cb){cb({storeName:'Loja Teste'});return()=>{};},getActiveStoreSession:()=>null,
    subscribeProducts(cb){cb([]);return()=>{};},subscribeTodaySales(cb){cb([]);return()=>{};},
    getEffectiveOwnerId:()=> 'owner',getProductDuplicates:async()=>[],mergeProducts:()=>assert.fail('Unexpected merge'),
    importSupplierCatalog:()=>assert.fail('Unexpected save')
  };
}
afterEach(()=>{cleanup();delete globalThis.__uiApi;delete globalThis.__prepareFile;delete globalThis.__recognizeCatalog;delete globalThis.__testRole;});
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
function importer(props={}){
  api();globalThis.__prepareFile=async()=> 'data:application/pdf;base64,JVBERi0=';
  globalThis.__recognizeCatalog=async()=>({products:[draft],truncated:false});
  function Harness(){const[open,setOpen]=React.useState(true);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setOpen(true)},'Abrir importação'),React.createElement(CatalogImportModal,{isOpen:open,onClose:()=>setOpen(false),availableCategories:['Bebidas'],existingProductNames:[],...props}),React.createElement(AppToast));}
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
  assert.match(ui.getByRole('status').textContent,/1 produto do seu catálogo/);
});

test('catalogue reading failure preserves the modal and manual entry',async()=>{
  const ui=importer();globalThis.__recognizeCatalog=async()=>{throw new Error('Limite da IA atingido. Preencha manualmente.');};
  await upload(ui);
  assert.ok(ui.getByRole('dialog'));
  assert.match(ui.getByRole('alert').textContent,/Preencha manualmente/);
  assert.match(ui.getByRole('status').textContent,/não foi concluída/);
  assert.ok(!ui.queryByText(/Processando catálogo com IA/));
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


test('catalog barcode duplicates start unchecked and require an explicit override',async()=>{
 const existing={id:'existing',name:'Outra apresentação',barcode:'001234',type:'comum',stock:5};
 const ui=importer({existingProducts:[existing]});
 globalThis.__recognizeCatalog=async()=>({products:[{...draft,barcode:'001234',basePrice:8}],truncated:false});
 await upload(ui);
 assert.equal(ui.getByRole('checkbox',{name:'Produto 1'}).checked,false);
 assert.ok(ui.getByText(/Produto parecido: Outra apresentação/));
 fireEvent.click(ui.getByRole('button',{name:'Cadastrar mesmo assim'}));
 assert.equal(ui.getByRole('checkbox',{name:'Produto 1'}).checked,true);
 let saved;
 globalThis.__uiApi.importSupplierCatalog=async(products,options)=>{saved={products,options};return products.length;};
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));});
 assert.equal(saved.products[0].barcode,'001234');assert.equal(saved.options.allowDuplicates,true);
});

test('duplicate confirmation exposes all three actions and the selected existing product',()=>{
 const decisions=[];
 const ui=render(React.createElement(ProductDuplicateDialog,{matches:[{id:'p1',name:'Café',type:'comum',stock:2}],quantity:3,onDecision:value=>decisions.push(value)}));
 fireEvent.click(ui.getByRole('button',{name:'Abrir o existente'}));
 fireEvent.click(ui.getByRole('button',{name:'Somar ao estoque dele'}));
 fireEvent.click(ui.getByRole('button',{name:'Cadastrar mesmo assim'}));
 assert.deepEqual(decisions.map(value=>value.action),['open','add','allow']);
 assert.equal(decisions[1].quantity,3);assert.equal(decisions[0].product.id,'p1');
});


test('manual save checks fresh cloud duplicates and opens the existing product without inserting',async()=>{
 api();
 const existing={id:'existing',name:'Café existente',type:'comum',stock:5,basePrice:10,unitCost:2,unitsPerPackage:1,purchaseForm:'unidade',category:'Bebidas',safetyStock:0,dailyAverageSales:0,replacementDays:3};
 globalThis.__uiApi.getProductDuplicates=async(candidate,excludeId)=>{assert.equal(candidate.name,'cafe existente');assert.equal(excludeId,undefined);return [existing];};
 globalThis.__uiApi.addProduct=()=>assert.fail('Must not insert before the duplicate decision');
 const ui=render(React.createElement(MemoryRouter,null,React.createElement(Stock)));
 fireEvent.click(ui.getByRole('button',{name:'Novo Produto'}));
 fireEvent.change(ui.getByPlaceholderText('Ex: Coca-Cola 350ml, Sabonete Dove...'),{target:{value:'cafe existente'}});
 await act(async()=>{fireEvent.submit(ui.getByRole('button',{name:'Salvar Produto'}).closest('form'));});
 assert.ok(ui.getByRole('dialog',{name:'Produto parecido já cadastrado'}));
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Abrir o existente'}));});
 assert.ok(ui.getByDisplayValue('Café existente'));
 assert.equal(ui.queryByRole('dialog',{name:'Produto parecido já cadastrado'}),null);
});


test('stock duplicate review deduplicates name/barcode pairs and provides an explicit merge action',async()=>{
 api();
 const common={name:'Café',barcode:'00123',category:'Bebidas',type:'comum',basePrice:5,unitCost:1,unitsPerPackage:1,safetyStock:0,dailyAverageSales:0,replacementDays:3};
 globalThis.__uiApi.subscribeProducts=cb=>{cb([{...common,id:'a',stock:2},{...common,id:'b',stock:3}]);return()=>{};};
 let merged;
 globalThis.__uiApi.mergeProducts=async(target,source)=>{merged={target,source};};
 const ui=render(React.createElement(MemoryRouter,null,React.createElement(Stock)));
 fireEvent.click(ui.getByRole('button',{name:'Revisar duplicados'}));
 assert.equal(ui.getAllByRole('button',{name:'Juntar produtos'}).length,1);
 fireEvent.click(ui.getByRole('button',{name:'Juntar produtos'}));
 assert.equal(merged,undefined);
 const confirmation=ui.getByRole('dialog',{name:'Juntar produtos'});
 await act(async()=>{fireEvent.click(within(confirmation).getByRole('button',{name:'Juntar produtos'}));});
 assert.deepEqual(merged,{target:'a',source:'b'});
});

test('supplier half-pack choice recalculates cost, persists five carteiras and preserves the ten-carteira sale pack',async()=>{
 api();
 let product={id:'cig',name:'Cigarro teste',category:'Cigarros',type:'cigarro',stockUnit:'carteira',stock:20,initialStock:20,basePrice:1,pricePack:100,priceCart:12,priceHalfCart:6,priceUnit:1,unitCost:4,unitsPerPackage:10,purchaseForm:'pacote',safetyStock:2,maxStock:30,dailyAverageSales:1,replacementDays:3};
 globalThis.__uiApi.subscribeProducts=cb=>{cb([product]);return()=>{};};
 let saved;
 globalThis.__uiApi.updateProduct=async(id,payload)=>{saved={id,payload};product={...product,...payload};for(const key of Object.keys(product))if(product[key]?.__eu_delete_field)delete product[key];};
 let ui=render(React.createElement(MemoryRouter,null,React.createElement(Stock)));
 fireEvent.click(ui.getByTitle('Editar Produto e Estoque'));
 let selector=ui.getByRole('combobox',{name:'purchase.size'});
 assert.equal(selector.value,'10');
 fireEvent.change(selector,{target:{value:'5'}});
 await act(async()=>{fireEvent.submit(ui.getByRole('button',{name:'Salvar Produto'}).closest('form'));});
 assert.equal(saved.id,'cig');assert.equal(saved.payload.supplierPackageUnits,5);
 assert.equal(saved.payload.unitsPerPackage,10);assert.equal(saved.payload.unitCost,8);assert.equal(saved.payload.stock,undefined);
 ui.unmount();ui=render(React.createElement(MemoryRouter,null,React.createElement(Stock)));
 fireEvent.click(ui.getByTitle('Editar Produto e Estoque'));
 assert.equal(ui.getByRole('combobox',{name:'purchase.size'}).value,'5');
 assert.ok(ui.getByDisplayValue('40'));
});

test('catalog validation highlights the invalid row and a failed save preserves reviewed values for retry',async()=>{
 const ui=importer();await upload(ui);
 fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));
 assert.ok(ui.getByRole('alert'));
 assert.ok(document.querySelector('article[aria-describedby]'));
 fireEvent.change(ui.getByLabelText('Preço de venda (R$)'),{target:{value:'9'}});
 let attempts=0,firstIds;
 globalThis.__uiApi.importSupplierCatalog=async(products,options)=>{
  attempts++;assert.equal(products[0].basePrice,9);
  if(attempts===1){firstIds=options.draftIds;throw new Error('Network failure');}
  assert.deepEqual(options.draftIds,firstIds);return 1;
 };
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));});
 assert.ok(ui.getByRole('dialog'));assert.ok(ui.getByDisplayValue(draft.name));
 assert.equal(ui.getByLabelText('Preço de venda (R$)').value,'9');
 assert.equal(ui.getByRole('button',{name:'Cadastrar selecionados'}).disabled,false);
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));});
 assert.equal(attempts,2);assert.equal(ui.queryByRole('dialog'),null);
});

test('rapid repeated clicks dispatch only one selected catalogue save',async()=>{
 const ui=importer();await upload(ui);fireEvent.change(ui.getByLabelText('Preço de venda (R$)'),{target:{value:'9'}});
 let resolve,calls=0;
 globalThis.__uiApi.importSupplierCatalog=()=>{calls++;return new Promise(done=>{resolve=done;});};
 await act(async()=>{const button=ui.getByRole('button',{name:'Cadastrar selecionados'});fireEvent.click(button);fireEvent.click(button);});
 assert.equal(calls,1);assert.equal(ui.getByRole('button',{name:'Salvando produtos...'}).disabled,true);
 await act(async()=>{resolve(1);});assert.equal(ui.queryByRole('dialog'),null);
});

test('cancelled duplicate review does not write other selected products or close the importer',async()=>{
 const ui=importer({onBeforeSave:async()=>false});await upload(ui);fireEvent.change(ui.getByLabelText('Preço de venda (R$)'),{target:{value:'9'}});
 globalThis.__uiApi.importSupplierCatalog=()=>assert.fail('Cancelled review must not insert');
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));});
 assert.ok(ui.getByRole('dialog'));assert.equal(ui.getByRole('button',{name:'Cadastrar selecionados'}).disabled,false);
});

test('catalogue saves only checked rows and retains unchecked drafts after reopening',async()=>{
 const ui=importer();
 globalThis.__recognizeCatalog=async()=>({products:[{...draft,id:'chosen',basePrice:8},{...draft,id:'leftover',name:'Outro produto',basePrice:9}],truncated:false});
 await upload(ui);
 fireEvent.click(ui.getByRole('checkbox',{name:'Produto 2'}));
 let saved;
 globalThis.__uiApi.importSupplierCatalog=async(products,options)=>{saved={products,options};return products.length;};
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));});
 assert.equal(saved.products.length,1);assert.equal(saved.products[0].name,draft.name);assert.deepEqual(saved.options.draftIds,['chosen']);
 fireEvent.click(ui.getByRole('button',{name:'Abrir importação'}));
 assert.ok(ui.getByDisplayValue('Outro produto'));assert.equal(ui.queryByDisplayValue(draft.name),null);
});

test('clicking save with all products unchecked explains the issue instead of silently disabling the action',async()=>{
 const ui=importer();await upload(ui);
 fireEvent.click(ui.getByRole('button',{name:'Desmarcar todos'}));
 const button=ui.getByRole('button',{name:'Cadastrar selecionados'});assert.equal(button.disabled,false);
 globalThis.__uiApi.importSupplierCatalog=()=>assert.fail('No checked rows must never be saved');
 fireEvent.click(button);
 assert.match(ui.getByRole('alert').textContent,/Selecione pelo menos/);
 assert.ok(ui.getByRole('dialog'));
 assert.ok(ui.getByText(/Nenhum produto selecionado/));
});
test('empty extraction explains why there are no products to register',async()=>{
 const ui=importer();globalThis.__recognizeCatalog=async()=>({products:[],truncated:false});
 await upload(ui);assert.match(ui.getByRole('alert').textContent,/Nenhum produto foi encontrado/);
 assert.equal(ui.getByRole('button',{name:'Cadastrar selecionados'}).disabled,true);
 assert.ok(ui.getByRole('button',{name:'Adicionar produto manualmente'}));
});

test('cigarette catalogue cost selector offers full pack, half pack and a carteira and saves the correct cost',async()=>{
 const ui=importer();
 globalThis.__recognizeCatalog=async()=>({products:[{...draft,name:'Cigarro catálogo',type:'cigarro',category:'Cigarros',costBasis:'',purchaseCost:40,basePrice:'',priceCart:12}],truncated:false});
 await upload(ui);
 const selector=ui.getByLabelText('Este custo corresponde a');
 assert.deepEqual(Array.from(selector.options,option=>option.value),['','maco','meio_maco','carteira']);
 fireEvent.change(selector,{target:{value:'meio_maco'}});
 let saved;globalThis.__uiApi.importSupplierCatalog=async products=>{saved=products;return products.length;};
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));});
 assert.equal(saved[0].unitCost,8);assert.equal(saved[0].supplierPackageUnits,5);assert.equal(saved[0].unitsPerPackage,10);
});

test('catalog modal follows the visible mobile viewport when the keyboard opens and removes listeners',()=>{
 const previous=Object.getOwnPropertyDescriptor(window,'visualViewport');
 const handlers=new Map();
 const visible={height:420,offsetTop:12,addEventListener:(name,listener)=>handlers.set(name,listener),removeEventListener:name=>handlers.delete(name)};
 Object.defineProperty(window,'visualViewport',{value:visible,configurable:true});
 try{
  const ui=importer();const dialog=ui.getByRole('dialog');const overlay=dialog.parentElement;
  assert.equal(overlay.style.height,'420px');assert.equal(overlay.style.top,'12px');
  act(()=>{visible.height=290;visible.offsetTop=20;handlers.get('resize')();});
  assert.equal(overlay.style.height,'290px');assert.equal(overlay.style.top,'20px');
  assert.ok(dialog.className.includes('max-h-full'));
  assert.ok(dialog.querySelector('footer').className.includes('shrink-0'));
  assert.ok(ui.getByRole('button',{name:'Cadastrar selecionados'}).className.includes('w-full'));
  ui.unmount();assert.equal(handlers.size,0);
 }finally{if(previous)Object.defineProperty(window,'visualViewport',previous);else delete window.visualViewport;}
});


test('catalogue optional initial inventory is manually reviewed and sent with selected products',async()=>{
 const ui=importer();
 globalThis.__recognizeCatalog=async()=>({products:[{...draft,initialStock:999}],truncated:false});
 await upload(ui);
 const input=ui.getByLabelText(/Estoque inicial.*unidades/);
 assert.equal(input.value,'');
 fireEvent.change(input,{target:{value:'24'}});
 fireEvent.change(ui.getByLabelText('Preço de venda (R$)'),{target:{value:'8'}});
 let submitted;
 globalThis.__uiApi.importSupplierCatalog=async products=>{submitted=products;return products.length;};
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Cadastrar selecionados'}));});
 assert.equal(submitted[0].stock,24);assert.equal(submitted[0].initialStock,24);
 assert.equal(ui.queryByRole('dialog'),null);
});


test('catalogue provider rejection appears once and keeps manual entry available',async()=>{
 const ui=importer();
 globalThis.__recognizeCatalog=async()=>{throw Object.assign(new Error('provider failure'),{code:'REQUEST_REJECTED'});};
 await upload(ui);
 const alert=ui.getByRole('alert');
 assert.match(alert.textContent,/IA recusou/);
 assert.equal(ui.getAllByText(alert.textContent).length,1);
 assert.ok(ui.getByRole('button',{name:'Adicionar produto manualmente'}));
 assert.ok(ui.getByRole('dialog'));
});

test('owner review contains all three real typo/abbreviation pairs, and excludes a different presentation',()=>{
 api();
 const names=['Brahma (LATAO)','Bhrama Latão','Budwiser latao','Budweiser Latão','Budweiser (long)','Budweiser Long Neck','Brahma Long Neck'];
 globalThis.__uiApi.subscribeProducts=cb=>{cb(names.map((name,i)=>({id:String(i),name,stock:1,type:'comum',category:'Bebidas',unitCost:1,basePrice:2,safetyStock:0})));return()=>{};};
 const ui=render(React.createElement(MemoryRouter,null,React.createElement(Stock)));
 fireEvent.click(ui.getByRole('button',{name:'Revisar duplicados'}));
 const review=within(ui.getByRole('dialog',{name:'Revisar duplicados'}));
 assert.equal(review.getAllByRole('button',{name:'Juntar produtos'}).length,3);
 for(const name of names.slice(0,6))assert.match(review.getByText(new RegExp(name.replace(/[()]/g,'\\$&'))).textContent,new RegExp(name.replace(/[()]/g,'\\$&')));
 assert.equal(review.queryByText(/Brahma Long Neck/),null);
});
test('manager cannot open stock duplicate review',()=>{
 api();globalThis.__testRole='manager';
 const ui=render(React.createElement(MemoryRouter,null,React.createElement(Stock)));
 assert.equal(ui.queryByRole('button',{name:'Revisar duplicados'}),null);
});
for(const [existingName,readName] of [['Brahma (LATAO)','Bhrama Latão'],['Budwiser latao','Budweiser Latão'],['Budweiser (long)','Budweiser Long Neck']])test(`catalog ${readName} is flagged and unchecked against ${existingName}`,async()=>{
 const existing={id:'existing',name:existingName,type:'comum',stock:2};
 const ui=importer({existingProducts:[existing]});
 globalThis.__recognizeCatalog=async()=>({products:[{...draft,name:readName}],truncated:false});await upload(ui);
 assert.equal(ui.getByRole('checkbox',{name:'Produto 1'}).checked,false);
 assert.match(ui.getByText(/Desmarcado por padrão/).textContent,new RegExp(existingName.replace(/[()]/g,'\\$&')));
 assert.ok(ui.getByRole('button',{name:'Abrir o existente'}));assert.ok(ui.getByRole('button',{name:'Somar ao estoque dele'}));assert.ok(ui.getByRole('button',{name:'Cadastrar mesmo assim'}));
});
test('editing an existing product requires a second confirmation to merge and blocks that option for managers',()=>{
 const decisions=[];
 let ui=render(React.createElement(ProductDuplicateDialog,{matches:[{id:'p',name:'Brahma Latão',stock:1,type:'comum'}],quantity:2,isMerge:true,onDecision:d=>decisions.push(d)}));
 fireEvent.click(ui.getByRole('button',{name:'Somar ao estoque dele'}));assert.equal(decisions.length,0);
 fireEvent.click(ui.getByRole('button',{name:'Confirmar união'}));assert.equal(decisions[0].action,'add');cleanup();
 globalThis.__testRole='manager';
 ui=render(React.createElement(ProductDuplicateDialog,{matches:[{id:'p',name:'Brahma Latão',stock:1,type:'comum'}],quantity:2,isMerge:true,onDecision:()=>assert.fail('Manager cannot merge')}));
 assert.equal(ui.getByRole('button',{name:'Somar ao estoque dele'}).disabled,true);
});

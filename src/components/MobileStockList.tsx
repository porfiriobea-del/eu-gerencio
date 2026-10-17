import {useState} from 'react';
import {Plus,Minus,Edit2,Package,MoreHorizontal,Camera,FileUp,X} from 'lucide-react';
import type {Product} from '../types';
import {ProductImage} from './ProductImage';
import {usePreferences} from '../lib/preferencesContext';
import {useStockFormatting} from '../lib/useStockFormatting';
import {getReorderPoint} from '../lib/stockSuggestions';
import {useMobileViewport} from '../lib/useMobileViewport';
interface Props{products:Product[];selected:string[];onSelect:(id:string)=>void;onSelectAll:()=>void;onDelete:()=>void;onEdit:(p:Product)=>void;onAdjust:(p:Product,amount:number)=>Promise<void>;onPhoto:()=>void;onCatalog:()=>void;onNew:()=>void}
export function MobileStockList(props:Props){
 const {v}=usePreferences(),{formatProductStock}=useStockFormatting(),{keyboardOpen}=useMobileViewport();
 const [expanded,setExpanded]=useState<string|null>(null),[selecting,setSelecting]=useState(false),[addOpen,setAddOpen]=useState(false),[busy,setBusy]=useState<string|null>(null);
 const actions=[[props.onPhoto,Camera,v('ui.photo','Cadastrar por foto')],[props.onCatalog,FileUp,v('ui.import','Importar catálogo')],[props.onNew,Plus,v('entity.new','Novo produto')]] as const;
 return <section className="md:hidden" aria-label={v('stock.title','Estoque')}>
 <div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">{props.products.length} {v('entity.plural','Produtos')}</span>
 <details className="relative"><summary aria-label={v('mobile.stockActions','Ações do estoque')} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl hover:bg-muted"><MoreHorizontal/></summary><div className="absolute right-0 z-30 w-60 space-y-1 rounded-xl border border-border bg-surface p-2 shadow-xl">
 <button type="button" className="min-h-11 w-full text-left text-sm" onClick={()=>setSelecting(!selecting)}>{v('mobile.select','Selecionar produtos')}</button>
 {selecting&&<button type="button" className="min-h-11 w-full text-left text-sm" onClick={props.onSelectAll}>{v('mobile.selectAll','Marcar/desmarcar todos')}</button>}
 <button type="button" disabled={!props.products.length} className="min-h-11 w-full text-left text-sm text-red-600 disabled:opacity-40" onClick={props.onDelete}>{props.selected.length?v('mobile.deleteSelected','Excluir selecionados'):v('mobile.deleteAll','Excluir todos')}</button>
 </div></details></div>
 <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
 {props.products.map(p=>{const id=p.id!,open=expanded===id,status=p.stock<=0?'out':p.stock<=getReorderPoint(p)?'low':'normal',label=v(status==='out'?'stock.outOfStock':status==='low'?'stock.lowStock':'stock.inStock');return <article key={id}>
 <div className="flex items-center gap-2 px-3 py-2">
 {selecting&&<input type="checkbox" aria-label={`${v('mobile.select','Selecionar')} ${p.name}`} checked={props.selected.includes(id)} onChange={()=>props.onSelect(id)} className="h-5 w-5 shrink-0"/>}
 <button type="button" aria-expanded={open} onClick={()=>setExpanded(open?null:id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
 {p.imageUrl?<ProductImage src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-neutral-100 object-contain dark:bg-neutral-900"/>:<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted"><Package className="h-6 w-6 text-muted-foreground"/></span>}
 <span translate="no" className="notranslate min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
 <span className="max-w-[35%] text-right text-xs font-semibold">{formatProductStock(p)}</span>
 <span role="img" aria-label={label} title={label} className={`h-2.5 w-2.5 shrink-0 rounded-full ${status==='out'?'bg-red-500':status==='low'?'bg-amber-400':'bg-emerald-500'}`}/>
 </button></div>
 {open&&<div className="space-y-3 border-t border-border bg-muted/30 p-4">
 {p.imageUrl&&<ProductImage src={p.imageUrl} alt={p.name} className="mx-auto h-40 w-40 rounded-xl bg-neutral-100 object-contain dark:bg-neutral-900"/>}
 <p translate="no" className="notranslate text-sm font-bold">{p.name}</p><p translate="no" className="notranslate text-xs text-muted-foreground">{p.category}</p>
 <div className="flex items-center gap-3"><button type="button" disabled={!!busy||p.stock<1} aria-label={v('mobile.removeOne','Retirar 1 do estoque')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border disabled:opacity-40" onClick={async()=>{setBusy(id);try{await props.onAdjust(p,-1);}finally{setBusy(null);}}}><Minus/></button>
 <strong className="flex-1 text-center text-sm">{formatProductStock(p)}</strong>
 <button type="button" disabled={!!busy} aria-label={v('mobile.addOne','Somar 1 ao estoque')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border disabled:opacity-40" onClick={async()=>{setBusy(id);try{await props.onAdjust(p,1);}finally{setBusy(null);}}}><Plus/></button></div>
 <button type="button" onClick={()=>props.onEdit(p)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"><Edit2 className="h-4 w-4"/>{v('entity.edit','Editar produto')}</button>
 </div>}</article>;})}
 </div>
 {!keyboardOpen&&<div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40">
 {addOpen&&<div className="mb-3 w-72 space-y-1 rounded-2xl border border-border bg-surface p-2 shadow-xl">{actions.map(([action,Icon,label])=><button type="button" key={label} onClick={()=>{setAddOpen(false);action();}} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-muted"><Icon className="h-5 w-5 shrink-0"/>{label}</button>)}</div>}
 <button type="button" aria-label={v('mobile.addProduct','Adicionar produto')} aria-expanded={addOpen} onClick={()=>setAddOpen(!addOpen)} className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">{addOpen?<X/>:<Plus className="h-7 w-7"/>}</button>
 </div>}
 </section>;
}

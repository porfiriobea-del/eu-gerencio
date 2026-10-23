import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Plus,Trash2,X} from 'lucide-react';
import {useModalViewport} from '../lib/useModalViewport';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {useStockFormatting} from '../lib/useStockFormatting';
import {showToast,showActionError} from '../lib/actionFeedback';
import {sortByName} from '../lib/alphabetical';
import {invoiceLine,newInvoiceLine,productSearchKey,type InvoiceDraftLine} from '../lib/purchaseInvoice';
import type {Product,BonusRule} from '../types';
export function PurchaseInvoiceModal({products,rules,suppliers,onClose}:{products:Product[];rules:BonusRule[];suppliers:string[];onClose:()=>void}) {
 const {v}=usePreferences(),{formatMoney}=useCurrency(),{formatProductStock}=useStockFormatting(),viewport=useModalViewport(true);
 const [id]=useState(()=>crypto.randomUUID()),[supplier,setSupplier]=useState(''),[date,setDate]=useState(()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;});
 const [lines,setLines]=useState<InvoiceDraftLine[]>(()=>[newInvoiceLine()]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const before=document.body.style.overflow,previous=document.activeElement as HTMLElement|null;
  document.body.style.overflow='hidden';
  const panel=document.getElementById('invoice-title')?.closest('section');panel?.querySelector<HTMLButtonElement>('button')?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!panel?.querySelector('fieldset')?.disabled){event.preventDefault();onClose();}
   if(event.key==='Tab'){
    const nodes=Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)') || []),first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };document.addEventListener('keydown',keydown);
  return()=>{document.body.style.overflow=before;document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
 },[]);
 const rows=lines.map(line=>invoiceLine(line,products,rules,supplier)),total=rows.reduce((n,r)=>n+(Number.isFinite(r.cost)?r.cost:0),0);
 const patch=(id:string,values:Partial<InvoiceDraftLine>)=>setLines(rows=>rows.map(r=>r.id===id?{...r,...values}:r));
 const add=()=>{const row=newInvoiceLine();setLines(rows=>[...rows,row]);requestAnimationFrame(()=>document.getElementById(`invoice-search-${row.id}`)?.focus());};
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;
  if(rows.some(r=>!r.valid)){setError(v('invoice.invalid'));return;}
  setBusy(true);setError('');
  try{const {recordPurchaseInvoice}=await import('../lib/api');await recordPurchaseInvoice({id,supplier,date,items:rows.map((r,i)=>({productId:r.product!.id!,productName:r.product!.name,category:r.product!.category,quantity:r.quantity,unitCost:r.cost/r.quantity,totalCost:r.cost,packageQuantity:lines[i].measure==='package'?r.count:undefined,packageType:lines[i].measure==='package'?r.product!.purchaseForm:'unidade',bonusProductId:r.bonusProductId||undefined,bonusQuantity:r.bonusQuantity,bonusRuleId:r.rule?.id}))});showToast(v('invoice.saved'));onClose();}
  catch(e){setError(e instanceof Error?e.message:v('invoice.failed'));showActionError(e,v('invoice.failed'));}finally{setBusy(false);}
 };
 return createPortal(<div className="fixed inset-x-0 z-50 flex items-center justify-center bg-black/60 md:p-4" style={{top:viewport.top,height:viewport.height}}>
  <section role="dialog" aria-modal="true" aria-labelledby="invoice-title" className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-2xl">
   <header className="flex shrink-0 items-center justify-between border-b border-border p-4"><h2 id="invoice-title" className="font-bold">{v('invoice.title')}</h2><button type="button" aria-label={v('invoice.close')} disabled={busy} onClick={onClose} className="min-h-11 min-w-11"><X/></button></header>
   <form onSubmit={submit} onKeyDown={e=>{if(e.key==='Enter'&&(e.target as HTMLElement).getAttribute('type')==='search')e.preventDefault();}} className="flex min-h-0 flex-col">
    <fieldset disabled={busy} className="min-h-0 min-w-0 space-y-4 overflow-y-auto overscroll-contain p-4" style={{maxHeight:'100dvh',WebkitOverflowScrolling:'touch'}}>
     <div className="grid gap-3 sm:grid-cols-2"><label>{v('invoice.supplier')}<input value={supplier} maxLength={200} onChange={e=>setSupplier(e.target.value)} list="invoice-suppliers" className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"/></label><datalist id="invoice-suppliers">{suppliers.map(s=><option key={s}>{s}</option>)}</datalist><label>{v('invoice.date')}<input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"/></label></div>
     {lines.map((line,index)=>{const row=rows[index],options=sortByName(products.filter(p=>p.id===line.productId||productSearchKey(p.name).includes(productSearchKey(line.search))));return <section key={line.id} aria-label={`${v('invoice.item')} ${index+1}`} className="space-y-3 rounded-2xl border border-border p-3">
      <div className="flex items-center justify-between"><strong>{v('invoice.item')} {index+1}</strong><button type="button" disabled={lines.length===1} aria-label={`${v('invoice.remove')} ${index+1}`} onClick={()=>setLines(rows=>rows.filter(r=>r.id!==line.id))} className="min-h-11 min-w-11 text-red-600 disabled:opacity-40"><Trash2 size={18}/></button></div>
      <div className="grid gap-3 sm:grid-cols-2"><label>{v('invoice.search')}<input id={`invoice-search-${line.id}`} value={line.search} onChange={e=>patch(line.id,{search:e.target.value})} type="search" className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"/></label><label>{v('invoice.product')}<select required value={line.productId} onChange={e=>patch(line.id,{productId:e.target.value,quantity:'1',measure:'unit',cost:null,manualBonus:false,bonusProductId:'',bonusQuantity:'0'})} className="notranslate block min-h-11 w-full rounded-xl border border-border bg-surface p-2" translate="no"><option value="">{v('invoice.choose')}</option>{options.map(p=><option key={p.id} value={p.id}>{p.name} · {p.category}</option>)}</select></label></div>
      <div className="grid gap-3 sm:grid-cols-3"><label>{v('invoice.quantity')}<input required type="number" min={line.measure==='unit'&&row.product?.type==='cigarro'?'.05':'1'} step={line.measure==='unit'&&row.product?.type==='cigarro'?'.05':'1'} value={line.quantity} onChange={e=>patch(line.id,{quantity:e.target.value})} className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"/></label>
       <label>{v('invoice.measure')}<select value={line.measure} onChange={e=>patch(line.id,{measure:e.target.value as 'unit'|'package'})} className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"><option value="unit">{v(row.product?.type==='cigarro'?'invoice.wallets':'invoice.units')}</option>{row.product&&row.product.unitsPerPackage>1&&<option value="package">{row.product.type==='cigarro'?v('invoice.maco'):v('invoice.package')} ({row.factor===1?(row.product.supplierPackageUnits || row.product.unitsPerPackage):row.factor})</option>}</select></label>
       <label>{v('invoice.cost')}<input required type="number" min="0" step="0.01" placeholder={v('cost.enter')} value={line.cost===null?(Number.isFinite(row.cost)?row.cost:''):line.cost} onChange={e=>patch(line.id,{cost:e.target.value})} className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"/></label>
      </div>
      {row.ruleInvalid&&<p role="alert" className="text-sm text-amber-600">{v('bonus.ruleInvalid')}</p>}
      {row.product&&row.valid&&<p className="text-xs text-muted-foreground">{v('invoice.receiving')}: {formatProductStock(row.product,row.quantity)} · {v('invoice.unitCost')}: {row.cost>0?formatMoney(row.cost/row.quantity):v('cost.enter')}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><label>{v('bonus.receivedProduct')}<select value={row.bonusProductId} onChange={e=>patch(line.id,{manualBonus:true,bonusProductId:e.target.value,bonusQuantity:'0'})} className="notranslate block min-h-11 w-full rounded-xl border border-border bg-surface p-2" translate="no"><option value="">{v('bonus.none')}</option>{row.product&&<option value={row.product.id}>{v('bonus.same')}</option>}{sortByName(products.filter(p=>p.id!==line.productId)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{v('bonus.receivedQuantity')} ({v(row.bonusProduct?.type==='cigarro'?'invoice.wallets':'invoice.units')})<input type="number" disabled={!row.bonusProductId} min="0" step={row.bonusProduct?.type==='cigarro'?'.05':'1'} value={line.manualBonus?line.bonusQuantity:row.bonusQuantity} onChange={e=>patch(line.id,{manualBonus:true,bonusProductId:row.bonusProductId,bonusQuantity:e.target.value})} className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"/></label></div>
     </section>;})}
     <button type="button" disabled={lines.length>=100} onClick={add} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3"><Plus size={18}/>{v('invoice.add')}</button>
    </fieldset>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
     {error&&<p role="alert" className="w-full text-sm text-red-600">{error}</p>}<strong>{v('invoice.total')}: {rows.some(r=>!Number.isFinite(r.cost))?v('invoice.pendingTotal'):formatMoney(total)}</strong><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-white disabled:opacity-50">{v(busy?'invoice.saving':'invoice.confirm')}</button>
    </footer>
   </form>
  </section>
 </div>,document.body);
}

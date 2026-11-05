import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import type {Purchase,Product} from '../types';
import {updatePurchase} from '../lib/api';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {useStockFormatting} from '../lib/useStockFormatting';
import {useModalViewport} from '../lib/useModalViewport';
import {showToast} from '../lib/actionFeedback';
export function PurchaseEditModal({purchase,suppliers=[],stockType='comum',onClose}:{purchase:Purchase;suppliers?:string[];stockType?:Product['type'];onClose:()=>void}) {
 const {v}=usePreferences(),{formatMoney,currencySymbol}=useCurrency(),{formatStockNumber}=useStockFormatting(),viewport=useModalViewport(true);
 const [total,setTotal]=useState(String(purchase.totalCost)),[supplier,setSupplier]=useState(purchase.supplier||''),[notes,setNotes]=useState(purchase.notes||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),revision=useRef(crypto.randomUUID());
 const changed=()=>{revision.current=crypto.randomUUID();setError('');};
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,before=document.body.style.overflow;
  document.body.style.overflow='hidden';document.getElementById('purchase-edit-total')?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!lock.current)onClose();
   if(e.key==='Tab'){const nodes=Array.from(document.getElementById('purchase-edit-form')?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')||[]),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  };document.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=before;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
 },[]);
 const amount=total.trim()===''?NaN:Number(total.replace(',','.')),valid=Number.isFinite(amount)&&amount>=0&&Math.abs(amount*100-Math.round(amount*100))<1e-7;
 const effective=valid?amount/(purchase.quantity+(purchase.bonusQuantity||0)):null;
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(lock.current)return;if(!valid){setError(v('purchase.edit.invalid'));return;}
  lock.current=true;setBusy(true);setError('');
  try{
   await updatePurchase(purchase.id!,{totalCost:amount,supplier,notes,expectedUpdatedAt:purchase.updatedAt??purchase.createdAt,correctionId:revision.current});
   showToast(v('purchase.edit.success'));onClose();
  }catch(err){const message=err instanceof Error?err.message:v('purchase.edit.failure');setError(message);showToast(v('purchase.edit.failure'),'error');}
  finally{lock.current=false;setBusy(false);}
 };
 return createPortal(<div className="fixed inset-x-0 z-[100] bg-black/60 flex items-center justify-center p-3" style={{top:viewport.top,height:viewport.height}} onMouseDown={e=>{if(e.target===e.currentTarget&&!lock.current)onClose();}}>
  <section role="dialog" aria-modal="true" aria-labelledby="purchase-edit-title" className="w-full max-w-xl flex flex-col overflow-hidden rounded-2xl bg-surface text-foreground border border-border shadow-2xl" style={{height:'min(640px, 100%)',maxHeight:'100%',overscrollBehavior:'contain'}}>
   <form id="purchase-edit-form" onSubmit={submit} className="flex flex-1 flex-col min-h-0 max-h-full">
    <header className="shrink-0 p-4 border-b border-border flex justify-between gap-3"><h2 id="purchase-edit-title" className="font-bold">{v('purchase.edit.title')}</h2><button type="button" disabled={busy} aria-label={v('purchase.edit.close')} onClick={onClose}><X className="w-5 h-5"/></button></header>
    <fieldset disabled={busy} className="min-h-0 overflow-y-auto p-4 space-y-4" style={{WebkitOverflowScrolling:'touch',overscrollBehavior:'contain'}}>
     <p className="font-bold notranslate" translate="no">{purchase.productName}</p>
     <p className="text-sm text-muted-foreground">{v('purchase.edit.quantity')}: {formatStockNumber(purchase.quantity)} {v(stockType==='cigarro'?'bonus.unit.carteira':'bonus.unit.unidade')} · {v('purchase.edit.original')}: {formatMoney(purchase.totalCost)}</p>
     <label className="block text-sm" htmlFor="purchase-edit-total">{v('purchase.edit.total')} ({currencySymbol})</label><input id="purchase-edit-total" type="number" inputMode="decimal" min="0" step="0.01" required value={total} onChange={e=>{changed();setTotal(e.target.value);}} className="w-full min-h-11 rounded-xl border border-border bg-surface p-3"/>
     {effective!==null&&<p className="text-sm">{v('purchase.edit.effective')}: <strong>{formatMoney(effective)} / {v(stockType==='cigarro'?'bonus.unit.carteira':'bonus.unit.unidade')}</strong></p>}
     <label className="block text-sm">{v('invoice.supplier')}<input list="purchase-edit-suppliers" maxLength={500} value={supplier} onChange={e=>{changed();setSupplier(e.target.value);}} className="block w-full min-h-11 rounded-xl border border-border bg-surface p-3"/></label>
     <datalist id="purchase-edit-suppliers">{suppliers.map(s=><option key={s} value={s}/>)}</datalist>
     <label className="block text-sm">{v('purchase.edit.notes')}<textarea maxLength={5000} rows={3} value={notes} onChange={e=>{changed();setNotes(e.target.value);}} className="block w-full rounded-xl border border-border bg-surface p-3"/></label>
     <p className="text-xs text-muted-foreground">{v('purchase.edit.explanation')}</p>
     {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    </fieldset>
    <footer className="shrink-0 sticky bottom-0 p-4 border-t border-border bg-surface flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-border px-4 py-3">{v('purchase.edit.cancel')}</button><button type="submit" disabled={busy||!valid} className="rounded-xl bg-primary text-white px-4 py-3 disabled:opacity-50">{v(busy?'purchase.edit.saving':'purchase.edit.save')}</button></footer>
   </form>
  </section>
 </div>,document.body);
}

import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import type {Product} from '../types';
import {getCigaretteFormats} from '../lib/productUnits';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
export function QuickProductDialog({product,onClose,onAdd}:{product:Product;onClose:()=>void;onAdd:(product:Product,format:string,price:number,units:number)=>void}){
 const {v}=usePreferences(),{formatMoney}=useCurrency(),panel=useRef<HTMLElement>(null);
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const buttons=()=>Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
  buttons()[0]?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();close.current();}
   if(event.key==='Tab'){
    const items=buttons(),first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
 },[]);
 const formats=getCigaretteFormats(product);
 return createPortal(<div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-4" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
 <section ref={panel} role="dialog" aria-modal="true" aria-label={v('mobile.chooseFormat','Escolher formato')} className="max-h-[80dvh] w-full max-w-md space-y-3 overflow-auto overscroll-contain rounded-2xl border border-border bg-surface p-4">
 <h2 translate="no" className="notranslate font-bold">{product.name}</h2>
 {!formats.length&&<p className="text-sm text-muted-foreground">{v('mobile.noFormats','Cadastre um preço de venda nos detalhes do produto.')}</p>}
 {formats.map(option=><button type="button" key={option.label} disabled={product.stock<option.units} onClick={()=>{onAdd(product,option.label,option.price,option.units);onClose();}} className="flex min-h-12 w-full justify-between rounded-xl border border-border p-3 text-sm disabled:opacity-40"><span>{option.label}</span><strong>{formatMoney(option.price)}</strong></button>)}
 <button type="button" onClick={onClose} className="min-h-11 w-full text-sm">{v('ui.close','Fechar')}</button>
 </section></div>,document.body);
}

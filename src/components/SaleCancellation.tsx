import {useState} from 'react';
import type {Sale} from '../types';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {showToast,showActionError} from '../lib/actionFeedback';
export function SaleCancellation({sale}:{sale:Sale}) {
 const {v}=usePreferences(),{formatMoney}=useCurrency();const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false);
 const cancel=async()=>{if(busy)return;setBusy(true);try{const {cancelSale}=await import('../lib/api');await cancelSale(sale.id!);showToast(v('sale.cancelled'));}catch(error){showActionError(error,v('sale.cancelFailed'));}finally{setBusy(false);setConfirm(false);}};
 return <div className="rounded-xl border border-border p-3 text-sm">
  <p className="notranslate" translate="no">{sale.itemsSummary}</p><span>{formatMoney(sale.total)}</span>
  {confirm?<div role="group" aria-label={v('sale.cancelConfirm')} className="mt-2 space-y-2"><p>{v('sale.cancelConfirm')}</p><div className="flex gap-2"><button disabled={busy} onClick={cancel} className="min-h-11 rounded-lg bg-red-600 px-3 text-white">{v(busy?'sale.cancelling':'sale.cancel')}</button><button disabled={busy} onClick={()=>setConfirm(false)} className="min-h-11 rounded-lg border border-border px-3">{v('sale.keep')}</button></div></div>:<button onClick={()=>setConfirm(true)} className="ml-3 min-h-11 text-red-600">{v('sale.cancel')}</button>}
 </div>;
}

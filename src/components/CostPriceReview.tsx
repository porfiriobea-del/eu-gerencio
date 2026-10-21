import {useState} from 'react';
import type {Product} from '../types';
import {useCurrency} from '../lib/useCurrency';
import {usePreferences} from '../lib/preferencesContext';
import {usePermissions} from '../lib/permissionsContext';
import {showToast,showActionError} from '../lib/actionFeedback';

export function ProductCosts({product}:{product:Product}) {
  const {v}=usePreferences(),{formatMoney}=useCurrency();
  return <dl className="text-xs space-y-1"><div className="flex justify-between gap-3"><dt>{v('cost.average')}</dt><dd>{formatMoney(product.unitCost || 0)}</dd></div><div className="flex justify-between gap-3"><dt>{v('cost.last')}</dt><dd>{formatMoney(product.lastCost ?? product.unitCost ?? 0)}</dd></div></dl>;
}
export function CostPriceReview({product}:{product:Product}) {
  const {v}=usePreferences(),{formatMoney,language}=useCurrency(),{isEmployee}=usePermissions();
  const [busy,setBusy]=useState(false);
  const review=product.pendingPriceReview;
  if(!review || isEmployee)return null;
  const text=v(review.changePercent>0?'cost.rose':'cost.fell').replace('{old}',formatMoney(review.oldCost)).replace('{new}',formatMoney(review.newCost))
    .replace('{percent}',`${review.changePercent>0?'+':''}${review.changePercent.toLocaleString(language,{maximumFractionDigits:1})}`);
  const decide=async(accept:boolean)=>{
    if(busy)return;setBusy(true);
    try{const {resolvePriceReview}=await import('../lib/api');await resolvePriceReview(product.id!,review.id,accept);showToast(v(accept?'cost.accepted':'cost.kept'));}
    catch(error){showActionError(error,v('cost.failed'));}finally{setBusy(false);}
  };
  return <aside aria-label={v('cost.review')} className="rounded-2xl border border-amber-500/40 bg-surface p-4 space-y-3">
    <h3 className="font-semibold notranslate" translate="no">{product.name}</h3><p>{text}</p>
    <div className="space-y-2">{review.prices.map(price=><p key={price.field} className="text-sm">{v(`cost.format.${price.field}`)}: {v('cost.suggestion').replace('{suggested}',formatMoney(price.newPrice)).replace('{today}',formatMoney(price.oldPrice))}</p>)}</div>
    <p className="text-xs text-muted-foreground">{v('cost.confirmInfo')}</p>
    <div className="flex gap-3"><button type="button" disabled={busy} onClick={()=>void decide(true)} className="rounded-xl bg-primary text-white px-4 py-2 disabled:opacity-50">{busy?v('cost.saving'):v('cost.accept')}</button><button type="button" disabled={busy} onClick={()=>void decide(false)} className="rounded-xl border border-border px-4 py-2 disabled:opacity-50">{v('cost.keep')}</button></div>
  </aside>;
}

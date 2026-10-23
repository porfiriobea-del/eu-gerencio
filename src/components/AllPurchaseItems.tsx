import {useState} from 'react';
import type {Product} from '../types';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {useStockFormatting} from '../lib/useStockFormatting';
import {sortByName,sortCategories} from '../lib/alphabetical';
import {productSearchKey} from '../lib/purchaseInvoice';
export function AllPurchaseItems({products,onBuy}:{products:Product[];onBuy:(product:Product)=>void}) {
 const {v}=usePreferences(),{formatMoney}=useCurrency(),{formatProductStock}=useStockFormatting();const [search,setSearch]=useState(''),[category,setCategory]=useState('all');
 const visible=sortByName(products.filter(p=>!p.mergedIntoId&&(category==='all'||p.category===category)&&productSearchKey(p.name).includes(productSearchKey(search))));
 return <section aria-label={v('purchases.allItems')} className="space-y-3">
  <div className="grid gap-3 sm:grid-cols-2"><label>{v('invoice.search')}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"/></label><label>{v('report.category')}<select value={category} onChange={e=>setCategory(e.target.value)} className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2"><option value="all">{v('report.allCategories')}</option>{sortCategories(products.map(p=>p.category)).map(c=><option key={c}>{c}</option>)}</select></label></div>
  {!visible.length&&<p>{v('purchases.noItems')}</p>}
  {visible.map(p=><article key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4"><div className="min-w-0 flex-1"><h3 className="notranslate break-words font-semibold" translate="no">{p.name}</h3><p className="text-xs text-muted-foreground">{p.category}</p><p className="text-sm">{v('purchases.itemStock')}: {formatProductStock(p)}</p><p className="text-sm">{v('cost.last')}: {(p.lastCost??p.unitCost)>0?formatMoney(p.lastCost??p.unitCost):v('cost.enter')}</p></div><button type="button" onClick={()=>onBuy(p)} className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-white">{v('purchases.buyItem')}</button></article>)}
 </section>;
}

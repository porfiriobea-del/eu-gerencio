import {useStockFormatting} from '../lib/useStockFormatting';
import {usePermissions} from '../lib/permissionsContext';
import { useMemo, useState } from 'react';
import type { Product } from '../types';
import { suspiciousProductPairs } from '../lib/duplicateDetector';
import { mergeProducts } from '../lib/api';
import { usePreferences } from '../lib/preferencesContext';
import { showToast, showActionError } from '../lib/actionFeedback';

export function ReplenishmentDuplicates({products,expanded=false}: {products: Product[];expanded?:boolean}) {
  const {v} = usePreferences();
  const {isOwner}=usePermissions();
  const {formatProductStock}=useStockFormatting();
  const pairs = useMemo(()=>suspiciousProductPairs(products),[products]);
  const [selected,setSelected] = useState<[Product,Product] | null>(null);
  const [busy,setBusy] = useState(false);
  if (!isOwner || (!pairs.length && !selected)) return null;
  return <aside className="rounded-2xl border border-amber-500/40 p-4 space-y-3">
    <details open={expanded || undefined}><summary className="cursor-pointer font-semibold">{v('replenish.similar')} ({pairs.length})</summary>
      <p className="text-sm text-muted-foreground my-2">{v('replenish.reviewNames')}</p>
      <div className="max-h-64 overflow-y-auto space-y-2">{pairs.map(([a,b])=><div key={`${a.id}:${b.id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2">
        <span className="notranslate" translate="no">{a.name} ({formatProductStock(a)}) / {b.name} ({formatProductStock(b)})</span>
        <button type="button" onClick={()=>setSelected([a,b])} disabled={busy} className="rounded-lg border border-border px-3 py-2">{v('replenish.merge')}</button>
      </div>)}</div>
    </details>
    {selected && <div role="dialog" aria-modal="true" aria-label={v('replenish.merge')} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl p-5 max-w-md w-full space-y-4">
        <h2 className="font-bold">{v('replenish.mergeConfirm')}</h2>
        <p className="notranslate" translate="no">{selected[1].name} → {selected[0].name}</p>
        <p className="text-sm">{v('replenish.mergeExplanation')}</p>
        {selected[0].type !== selected[1].type && <p role="alert">{v('replenish.incompatible')}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={()=>setSelected(null)}>{v('replenish.cancel')}</button>
          <button type="button" disabled={busy || selected[0].type !== selected[1].type} className="bg-primary text-white rounded-xl px-4 py-2 disabled:opacity-50" onClick={async()=>{
            setBusy(true);
            try {await mergeProducts(selected[0].id!,selected[1].id!,true);setSelected(null);showToast(v('replenish.merged'));}
            catch(error){showActionError(error,v('replenish.mergeFailed'));}
            finally{setBusy(false);}
          }}>{busy ? v('replenish.saving') : v('replenish.merge')}</button>
        </div>
      </div>
    </div>}
  </aside>;
}

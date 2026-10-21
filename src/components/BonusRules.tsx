import {useState} from 'react';
import type {BonusRule, BonusUnit, Product} from '../types';
import {usePreferences} from '../lib/preferencesContext';
import {saveBonusRule} from '../lib/api';
import {showToast,showActionError} from '../lib/actionFeedback';
import {validBonusRule,bonusUnitKey} from '../lib/purchaseBonus';
export const bonusUnitChoices=(product?: Product):BonusUnit[]=>product?.type==='cigarro'?['maco','pacote','carteira']:['unidade','fardo','pacote'];
export function BonusRules({rules,products,suppliers,ready}:{rules:BonusRule[];products:Product[];suppliers:string[];ready:boolean}) {
  const {v}=usePreferences();
  const fresh=():BonusRule=>({id:crypto.randomUUID(),supplier:'',productId:'',buyQuantity:1,buyUnit:'maco',bonusProductId:'',bonusQuantity:1,bonusUnit:'maco'});
  const [draft,setDraft]=useState<BonusRule>(fresh),[busy,setBusy]=useState(false),[remove,setRemove]=useState<BonusRule|null>(null);
  const selectProduct=(id:string,bonus=false)=>{
    const unit=bonusUnitChoices(products.find(p=>p.id===id))[0];
    setDraft(d=>({...d,[bonus?'bonusProductId':'productId']:id,[bonus?'bonusUnit':'buyUnit']:unit}));
  };
  return <section className="space-y-4">
    <h2 className="font-bold text-lg">{v('bonus.rules')}</h2><p className="text-sm text-muted-foreground">{v('bonus.explanation')}</p>
    {!ready && <p role="status">{v('bonus.loading')}</p>}
    <form className="bg-surface border border-border rounded-2xl p-4 space-y-3" onSubmit={async e=>{
      e.preventDefault();if(busy || !ready)return;setBusy(true);
      try{validBonusRule(draft,products);await saveBonusRule(draft);setDraft(fresh());showToast(v('bonus.saved'));}
      catch(error){showActionError(error,v('bonus.saveFailed'));}finally{setBusy(false);}
    }}>
      <label className="block">{v('bonus.supplier')}<input required list="bonus-suppliers" value={draft.supplier} onChange={e=>setDraft({...draft,supplier:e.target.value})} className="block w-full border border-border bg-surface rounded-xl p-2" /></label>
      <datalist id="bonus-suppliers">{suppliers.map(name=><option key={name} value={name}/>)}</datalist>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[false,true].map(isBonus=><fieldset key={String(isBonus)} className="space-y-2 min-w-0">
          <legend className="font-semibold">{v(isBonus?'bonus.gains':'bonus.every')}</legend>
          <label className="block text-sm">{v('bonus.product')}<select required value={isBonus?draft.bonusProductId:draft.productId} onChange={e=>selectProduct(e.target.value,isBonus)} className="w-full block border border-border bg-surface rounded-xl p-2 notranslate" translate="no">
            <option value="">{v('bonus.choose')}</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          <label className="block text-sm">{v('bonus.quantity')}<input required type="number" min="1" step="1" value={isBonus?draft.bonusQuantity:draft.buyQuantity} onChange={e=>setDraft({...draft,[isBonus?'bonusQuantity':'buyQuantity']:Number(e.target.value)})} className="w-full border border-border bg-surface rounded-xl p-2"/></label>
          <label className="block text-sm">{v('bonus.measure')}<select value={isBonus?draft.bonusUnit:draft.buyUnit} onChange={e=>setDraft({...draft,[isBonus?'bonusUnit':'buyUnit']:e.target.value})} className="w-full block border border-border bg-surface rounded-xl p-2">
            {bonusUnitChoices(products.find(p=>p.id===(isBonus?draft.bonusProductId:draft.productId))).map(unit=><option key={unit} value={unit}>{v(`bonus.unit.${unit}`)}</option>)}
          </select></label>
        </fieldset>)}
      </div>
      <button disabled={busy || !ready} className="bg-primary text-white rounded-xl px-4 py-2 disabled:opacity-50">{busy?v('bonus.saving'):v('bonus.saveRule')}</button>
    </form>
    {rules.length===0 && <p>{v('bonus.noRules')}</p>}
    {rules.map(rule=><article key={rule.id} className="bg-surface border border-border rounded-2xl p-4 space-y-2">
      <h3 className="font-semibold notranslate" translate="no">{rule.supplier}</h3>
      <p>{v('bonus.every')} {rule.buyQuantity} {v(bonusUnitKey(rule.buyUnit,rule.buyQuantity))} — <span className="notranslate" translate="no">{products.find(p=>p.id===rule.productId)?.name || v('bonus.unavailable')}</span></p>
      <p>{v('bonus.gains')} {rule.bonusQuantity} {v(bonusUnitKey(rule.bonusUnit,rule.bonusQuantity))} — <span className="notranslate" translate="no">{products.find(p=>p.id===rule.bonusProductId)?.name || v('bonus.unavailable')}</span></p>
      <div className="flex gap-4"><button disabled={busy} onClick={()=>setDraft(rule)}>{v('bonus.edit')}</button><button disabled={busy} onClick={()=>setRemove(rule)}>{v('bonus.remove')}</button></div>
    </article>)}
    {remove && <div role="dialog" aria-modal="true" aria-label={v('bonus.remove')} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"><div className="bg-surface border border-border rounded-2xl p-5 max-w-md space-y-4">
      <p>{v('bonus.removeConfirm')}</p><div className="flex gap-4 justify-end"><button disabled={busy} onClick={()=>setRemove(null)}>{v('bonus.cancel')}</button><button disabled={busy} onClick={async()=>{setBusy(true);try{await saveBonusRule(null,remove.id);if(draft.id===remove.id)setDraft(fresh());setRemove(null);showToast(v('bonus.saved'));}catch(error){showActionError(error,v('bonus.saveFailed'));}finally{setBusy(false);}}}>{v('bonus.remove')}</button></div>
    </div></div>}
  </section>;
}

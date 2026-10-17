import {useEffect,useState} from 'react';
import {useEmployee} from '../lib/employeeContext';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {useStockFormatting} from '../lib/useStockFormatting';
import {subscribeProducts,subscribeCustomers,subscribeSettings,subscribeTodaySales,recordPayment} from '../lib/api';
import {getShifts,shiftAction,type Shift} from '../lib/workforceApi';
import {usePermissions} from '../lib/permissionsContext';
import {getAccessState} from '../lib/accessControl';
import {showToast,showActionError} from '../lib/actionFeedback';
import {sortByName} from '../lib/alphabetical';
import {ProductImage} from './ProductImage';
import type {Customer,Product,Sale,Settings} from '../types';
export function StaffHome(){
 const {v}=usePreferences(),{formatMoney,language}=useCurrency(),{currentEmployee,logoutEmployee,loginEmployee,employees}=useEmployee(),{employeeId}=usePermissions();
 const [shifts,setShifts]=useState<Shift[]>([]),[sales,setSales]=useState<Sale[]>([]),[settings,setSettings]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let alive=true;const refresh=()=>void getShifts().then(rows=>{if(alive)setShifts(rows);}).catch(()=>{if(alive)setError(v('access.loadFailed'));});
  refresh();const timer=setInterval(refresh,15000);window.addEventListener('cloud-refresh',refresh);window.addEventListener('focus',refresh);
  const unsubSales=subscribeTodaySales(setSales),unsubSettings=subscribeSettings(setSettings);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('cloud-refresh',refresh);window.removeEventListener('focus',refresh);unsubSales();unsubSettings();};
 },[v]);
 const open=shifts.find(s=>s.status==='open'&&s.employee_id===employeeId);
 const act=async()=>{if(busy)return;setBusy(true);try{if(open&&currentEmployee)await logoutEmployee();else if(open)await shiftAction('end',employeeId);else {const employee=employees.find(e=>e.id===employeeId);if(!employee)throw new Error('Employee unavailable');await loginEmployee(employee);}setError('');setShifts(await getShifts());}catch{setError(v('access.shiftFailed'));}finally{setBusy(false);}};
 return <section className="max-w-2xl space-y-4"><h1 className="text-2xl font-bold">{v('access.myShift')}</h1>
 <p className="notranslate" translate="no">{currentEmployee?.name}</p>
 <div className="rounded-2xl border border-border bg-surface p-5 space-y-4"><p>{v('access.entry')}: <strong>{open?new Date(open.started_at).toLocaleTimeString(language==='en'?'en-US':language==='es'?'es-ES':'pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}):v('access.noShift')}</strong></p>
 <p>{v('access.mySales')}: <strong className="text-3xl block">{sales.filter(s=>s.employeeId===employeeId).length}</strong></p>
 <p>{v('access.dailyGoal')}: <strong>{formatMoney(settings?.dailyGoal || 0)}</strong></p>
 <button disabled={busy} className="bg-primary text-white rounded-xl px-4 py-3 disabled:opacity-50" onClick={()=>void act()}>{v(busy?'access.wait':open?'access.endShift':'access.startShift')}</button>
 </div>{error&&<p role="alert" className="text-amber-600">{error}</p>}
 <p className="text-sm text-muted-foreground">{v('access.midnight')}</p></section>;
}
export function StaffStock(){
 const {v}=usePreferences(),{formatProductStock}=useStockFormatting();const [products,setProducts]=useState<Product[]>([]),[search,setSearch]=useState('');
 useEffect(()=>subscribeProducts(setProducts),[]);
 return <section className="space-y-4"><h1 className="text-2xl font-bold">{v('access.stockRead')}</h1><input aria-label={v('access.search')} placeholder={v('access.search')} value={search} onChange={e=>setSearch(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-surface"/>
 {sortByName(products).filter(p=>p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p=><article key={p.id} className="flex items-center gap-3 rounded-xl border border-border p-3 bg-surface"><div className="w-14 h-14 shrink-0 bg-muted rounded-lg">{p.imageUrl&&<ProductImage src={p.imageUrl} alt={p.name} className="w-full h-full object-contain"/>}</div><div className="flex-1 min-w-0"><strong translate="no" className="notranslate block">{p.name}</strong><span className="text-sm text-muted-foreground">{p.category}</span></div><span>{formatProductStock(p)}</span></article>)}</section>;
}
export function StaffDebt(){
 const {v}=usePreferences(),{formatMoney}=useCurrency();const [customers,setCustomers]=useState<Customer[]>([]),[selected,setSelected]=useState<Customer|null>(null),[amount,setAmount]=useState(''),[method,setMethod]=useState<'cash'|'card'>('cash'),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 useEffect(()=>subscribeCustomers(setCustomers),[]);
 const receive=async()=>{if(!selected?.id||busy)return;const value=Number(amount);if(!Number.isFinite(value)||value<=0||value>selected.totalDebt){showToast(v('access.checkAmount'),'warning');return;}setBusy(true);try{await recordPayment(selected.id,value,method);setSelected(null);setAmount('');showToast(v('access.paymentSaved'));}catch(error){showActionError(error,v('access.paymentFailed'));}finally{setBusy(false);}};
 return <section className="space-y-4"><h1 className="text-2xl font-bold">{v('access.receiveDebt')}</h1><input aria-label={v('access.search')} placeholder={v('access.search')} value={search} onChange={e=>setSearch(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-surface"/>
 {sortByName(customers).filter(c=>c.totalDebt>0 && c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c=><article key={c.id} className="flex flex-wrap items-center gap-3 border border-border rounded-xl p-4 bg-surface"><strong translate="no" className="notranslate flex-1">{c.name}</strong><span className="text-red-600 font-bold">{formatMoney(c.totalDebt)}</span><button onClick={()=>{setSelected(c);setAmount('');}} className="rounded-xl px-4 py-2 bg-primary text-white">{v('access.receive')}</button></article>)}
 {selected&&<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={v('access.receive')}><form className="rounded-2xl bg-surface p-5 space-y-4 w-full max-w-sm" onSubmit={e=>{e.preventDefault();void receive();}}><h2 className="notranslate font-bold" translate="no">{selected.name}</h2><label className="block">{v('access.amount')}<input autoFocus type="number" min="0.01" max={selected.totalDebt} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy} className="block w-full p-3 bg-background rounded-xl border border-border"/></label><label className="block">{v('access.method')}<select value={method} disabled={busy} onChange={e=>setMethod(e.target.value as 'cash'|'card')} className="w-full p-3 bg-background border rounded-xl"><option value="cash">{v('access.cash')}</option><option value="card">{v('access.card')}</option></select></label><div className="flex gap-3"><button type="button" disabled={busy} onClick={()=>setSelected(null)} className="border rounded-xl p-3">{v('access.cancel')}</button><button disabled={busy} className="bg-primary text-white rounded-xl p-3">{v(busy?'access.wait':'access.receive')}</button></div></form></div>}</section>;
}

import {useState} from 'react';
import {Filter} from 'lucide-react';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {activeReportFilterCount,type ReportFilters as Values} from '../lib/reportFilters';
import {sortCategories,sortByName} from '../lib/alphabetical';
export type ReportPeriod='hoje'|'semana'|'mes'|'personalizado';
export function ReportFilters({period,setPeriod,start,end,setStart,setEnd,filters,setFilters,employees,categories,onClear}:{period:ReportPeriod;setPeriod:(p:ReportPeriod)=>void;start:string;end:string;setStart:(s:string)=>void;setEnd:(s:string)=>void;filters:Values;setFilters:(v:Values)=>void;employees:{id?:string;name:string}[];categories:string[];onClear:()=>void}) {
 const {v}=usePreferences(),{isBrazil}=useCurrency();const [open,setOpen]=useState(false),count=activeReportFilterCount(filters);
 return <section aria-label={v('report.controls')} className="mb-4 space-y-3">
  <div className="flex flex-wrap gap-2">{(['hoje','semana','mes','personalizado'] as const).map(p=><button type="button" key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)} className={`min-h-11 rounded-xl border border-border px-3 text-sm ${period===p?'bg-primary text-white':'bg-surface'}`}>{v(`report.period.${p}`)}</button>)}
   <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm"><Filter size={16}/>{v('report.filter')}{count>0&&<span aria-label={v('report.active')} className="rounded-full bg-primary px-2 text-white">{count}</span>}</button>
   <button type="button" onClick={onClear} className="min-h-11 rounded-xl border border-border px-3 text-sm">{v('report.clear')}</button>
  </div>
  {period==='personalizado'&&<div className="flex flex-wrap gap-3"><label>{v('report.from')}<input type="date" value={start} onChange={e=>setStart(e.target.value)} className="block min-h-11 rounded-xl border border-border bg-surface p-2"/></label><label>{v('report.to')}<input type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)} className="block min-h-11 rounded-xl border border-border bg-surface p-2"/></label>{(!start||!end||start>end)&&<p role="alert">{v('report.invalidDates')}</p>}</div>}
  {open&&<div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-3">
   <label>{v('report.payment')}<select value={filters.payment} onChange={e=>setFilters({...filters,payment:e.target.value})} className="block min-h-11 w-full rounded-xl border border-border bg-surface p-2">{['todas','cash','card','credit','debit','voucher',...(isBrazil?['pix','pix_machine']:[]),'fiado'].map(k=><option key={k} value={k}>{v(k==='card'&&!isBrazil?'report.pay.cardsOnly':`report.pay.${k}`)}</option>)}</select></label>
   <label>{v('report.employee')}<select value={filters.employee} onChange={e=>setFilters({...filters,employee:e.target.value})} className="notranslate block min-h-11 w-full rounded-xl border border-border bg-surface p-2" translate="no"><option value="all">{v('report.allEmployees')}</option>{sortByName([{id:'owner',name:v('report.owner')},...employees.filter(e=>e.id!=='owner')]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
   <label>{v('report.category')}<select value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})} className="notranslate block min-h-11 w-full rounded-xl border border-border bg-surface p-2" translate="no"><option value="all">{v('report.allCategories')}</option>{sortCategories(categories).map(c=><option key={c}>{c}</option>)}</select></label>
  <p className="text-xs text-muted-foreground sm:col-span-3">{v('report.purchaseFilterNote')}</p></div>}
 </section>;
}

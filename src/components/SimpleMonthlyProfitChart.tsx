import {useEffect,useMemo,useState} from 'react';
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,CartesianGrid,ReferenceLine,Cell} from 'recharts';
import {endOfMonth} from 'date-fns';
import {getSalesByDateRange,getPurchasesByDateRange} from '../lib/api';
import {activeMonthlyBalances,activeMonthStats} from '../lib/simpleHome';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import type {Sale,Purchase} from '../types';
export function SimpleMonthlyProfitChart(){
 const {v}=usePreferences(),{formatMoney,language}=useCurrency();
 const [history,setHistory]=useState<{sales:Sale[];purchases:Purchase[]}>({sales:[],purchases:[]});
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[selected,setSelected]=useState<string>();
 useEffect(()=>{
  let active=true;
  setLoading(true);setFailed(false);
  const end=endOfMonth(new Date()).getTime();
  // Sparse histories may have gaps longer than six calendar months.
  void Promise.all([getSalesByDateRange(0,end),getPurchasesByDateRange(0,end)]).then(([sales,purchases])=>{
   if(active)setHistory({sales,purchases});
  }).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[retry]);
 const months=useMemo(()=>activeMonthlyBalances(history.sales,history.purchases,language),[history,language]);
 const stats=useMemo(()=>activeMonthStats(months),[months]);
 const chosen=months.find(month=>month.monthKey===selected);
 return <section id="dashboard-monthly-profit" className="rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-label={v('home.monthly','O que sobrou por mês')}>
 <h2 className="font-bold">{v('home.monthly','O que sobrou por mês')}</h2>
 {loading?<p role="status" className="py-10 text-center text-sm text-muted-foreground">{v('home.loading','Buscando os meses…')}</p>:failed?<div className="py-6 text-center"><p className="text-sm">{v('home.chartError','Não foi possível buscar os meses agora.')}</p><button type="button" onClick={()=>setRetry(value=>value+1)} className="mt-3 min-h-11 rounded-xl border border-border px-4 text-sm">{v('home.retry','Tentar de novo')}</button></div>:!months.length?<p className="py-10 text-center text-sm text-muted-foreground">{v('home.noMonths','Ainda não há movimento para mostrar.')}</p>:<>
 <div className="mt-4 h-56 w-full" aria-hidden="true">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={months} margin={{top:8,right:8,left:0,bottom:0}} accessibilityLayer={false}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2}/>
 <XAxis dataKey="shortLabel" tick={{fontSize:10,fill:'currentColor'}} axisLine={false} tickLine={false} interval={0} angle={months.length>4?-35:0} textAnchor={months.length>4?'end':'middle'} height={months.length>4?44:30}/>
 <YAxis width={96} tick={{fontSize:10,fill:'currentColor'}} axisLine={false} tickLine={false} tickFormatter={value=>formatMoney(Number(value))}/>
 <ReferenceLine y={0} stroke="currentColor" opacity={0.3}/>
 <Bar dataKey="profit" radius={[5,5,0,0]} maxBarSize={48} isAnimationActive={false} onClick={entry=>{
  const data=entry as unknown as {monthKey?:string;payload?:{monthKey?:string}};
  const key=data.payload?.monthKey||data.monthKey;
  if(key)setSelected(key);
 }}>
 {months.map(month=><Cell key={month.monthKey} fill={month.profit>=0?'#10B981':'#F59E0B'} opacity={!chosen||selected===month.monthKey?1:0.5}/>)}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </div>
 <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm font-semibold">{chosen?`${chosen.monthName}: ${formatMoney(chosen.profit)}`:v('home.touchBar','Toque em uma barra para ver o valor.')}</p>
 <div className="sr-only focus-within:not-sr-only">{months.map(month=><button type="button" key={month.monthKey} onClick={()=>setSelected(month.monthKey)} className="min-h-11 px-3">{month.monthName}: {formatMoney(month.profit)}</button>)}</div>
 <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
 {stats.best&&<p>{v('home.bestMonth','Mês que mais sobrou')}: <strong className="capitalize">{stats.best.monthName}</strong> — {formatMoney(stats.best.profit)}</p>}
 {stats.average!==undefined&&<p>{v('home.monthlyAverage','Média por mês')}: <strong>{formatMoney(stats.average)}</strong></p>}
 </div>
 </>}
 </section>;
}

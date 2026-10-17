import {useId,useState} from 'react';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {simpleDayBalance} from '../lib/simpleHome';
export function SimpleHomeSummary({sales,purchases,fees}:{sales:number;purchases:number;fees:number}){
 const {v}=usePreferences(),{formatMoney}=useCurrency(),[help,setHelp]=useState(false),id=useId();
 const balance=simpleDayBalance(sales,purchases,fees);
 return <section id="dashboard-simple-summary" aria-label={v('home.today','Hoje')} className="rounded-2xl border border-border bg-surface p-5">
 <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-muted-foreground">{v('home.today','Hoje')}</h2><button type="button" aria-label={v('home.explain','Entender a sobra')} aria-controls={id} aria-expanded={help} onClick={()=>setHelp(!help)} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg font-bold">?</button></div>
 <div className="grid gap-5 sm:grid-cols-3">
 <p className="text-base">{v('home.sold','Você vendeu')} <strong className="mt-1 block text-3xl font-extrabold tabular-nums">{formatMoney(balance.sales)}</strong></p>
 <p className="text-base">{v('home.spent','Gastou em compras e taxas')} <strong className="mt-1 block text-3xl font-extrabold tabular-nums">{formatMoney(balance.spent)}</strong></p>
 <p className="text-base">{v('home.left','Sobrou')} <strong className={`mt-1 block text-3xl font-extrabold tabular-nums ${balance.left>=0?'text-emerald-700 dark:text-emerald-400':'text-red-600 dark:text-red-400'}`}>{formatMoney(balance.left)}</strong></p>
 </div>
 {help&&<p id={id} className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">{v('home.warning','Isso não é o lucro. As vendas incluem fiado. A diferença entre vendas, compras e taxas também não é o dinheiro disponível no caixa.')}</p>}
 </section>;
}

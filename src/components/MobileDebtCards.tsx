import {Link} from 'react-router-dom';
import {DollarSign,ShoppingCart,History} from 'lucide-react';
import type {Customer} from '../types';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {formatDate,normalizeLanguage} from '../lib/language';
import {customerLastMovement} from '../lib/debtOverview';
export function MobileDebtCards({customers,legacyDates,loadingDates,dateError,onHistory,onReceive}:{customers:Customer[];legacyDates:Record<string,number>;loadingDates:boolean;dateError:boolean;onHistory:(customer:Customer)=>void;onReceive:(customer:Customer)=>void}){
 const {v}=usePreferences(),{formatMoney,language}=useCurrency();
 return <div className="space-y-3 md:hidden">
 {customers.map(customer=>{
 const date=customerLastMovement(customer,legacyDates),waiting=customer.lastMovementAt===undefined&&loadingDates;
 const dateLabel=waiting?v('debt.loadingDate','Buscando data…'):dateError&&customer.lastMovementAt===undefined?v('debt.dateUnavailable','Data indisponível'):date?formatDate(date,normalizeLanguage(language)):v('debt.noMovement','Sem movimento');
 return <article key={customer.id} className="w-full rounded-2xl border border-border bg-surface p-4 shadow-xs">
 <button type="button" onClick={()=>onHistory(customer)} aria-label={`${v('debt.openHistory','Ver histórico de')} ${customer.name}`} className="w-full space-y-2 text-left">
 <span translate="no" className="notranslate block break-words pr-2 text-base font-bold">{customer.name}</span>
 <strong className={`block text-2xl font-extrabold ${customer.totalDebt>0?'text-red-600 dark:text-red-400':'text-emerald-700 dark:text-emerald-400'}`}>{customer.totalDebt>0?formatMoney(customer.totalDebt):v('debt.settled','Quitado')}</strong>
 <span className="flex items-center gap-2 text-xs text-muted-foreground"><History className="h-4 w-4 shrink-0"/>{v('debt.lastMovement','Último movimento')}: {dateLabel}</span>
 </button>
 <div className="mt-4 grid grid-cols-2 gap-2">
 <button type="button" disabled={customer.totalDebt<=0} onClick={()=>onReceive(customer)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-40"><DollarSign className="h-4 w-4"/>{v('debt.receive','Receber')}</button>
 <Link to={`/caixa?fiado_cliente=${encodeURIComponent(customer.id!)}`} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-center text-sm font-semibold"><ShoppingCart className="h-4 w-4 shrink-0"/>{v('debt.addPurchase','Anotar compra')}</Link>
 </div></article>;
 })}
 {!customers.length&&<p className="rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground">{v('debt.noCustomers','Nenhum cliente encontrado.')}</p>}
 </div>;
}

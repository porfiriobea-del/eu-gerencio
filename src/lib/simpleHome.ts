import type {Sale,Purchase} from '../types';
import {saleFee} from './paymentFees';
import {moneyLocale,type MoneyLanguage} from './currency';
const cents=(value:number)=>Number.isFinite(value)?Math.round(value*100):0;
export function simpleDayBalance(sales:number,purchases:number,fees:number){
 const spent=cents(purchases)+cents(fees);
 return {sales:cents(sales)/100,spent:spent/100,left:(cents(sales)-spent)/100};
}
export interface ActiveMonth {monthKey:string;monthName:string;shortLabel:string;sales:number;purchases:number;profit:number;salesCount:number;purchasesCount:number}
export function activeMonthlyBalances(sales:readonly Sale[],purchases:readonly Purchase[],language:MoneyLanguage='pt-BR'):ActiveMonth[]{
 const months=new Map<string,{date:Date;sales:number;purchases:number;fees:number;salesCount:number;purchasesCount:number}>();
 const month=(timestamp:number)=>{
  if(!Number.isFinite(timestamp)||timestamp<=0)return;
  const date=new Date(timestamp);if(!Number.isFinite(date.getTime()))return;
  const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  if(!months.has(key))months.set(key,{date:new Date(date.getFullYear(),date.getMonth(),1),sales:0,purchases:0,fees:0,salesCount:0,purchasesCount:0});
  return months.get(key)!;
 };
 for(const sale of sales){const row=month(sale.createdAt);if(row){row.sales+=cents(sale.total);row.fees+=cents(saleFee(sale));row.salesCount++;}}
 for(const purchase of purchases){const row=month(purchase.createdAt);if(row){row.purchases+=cents(purchase.totalCost);row.purchasesCount++;}}
 const locale=moneyLocale(language);
 return [...months].sort(([a],[b])=>a.localeCompare(b)).slice(-6).map(([monthKey,row])=>({
  monthKey,monthName:row.date.toLocaleDateString(locale,{month:'long',year:'numeric'}),
  shortLabel:`${row.date.toLocaleDateString(locale,{month:'short'}).replace(/\.$/,'')}/${String(row.date.getFullYear()).slice(-2)}`,
  sales:row.sales/100,purchases:row.purchases/100,profit:(row.sales-row.purchases-row.fees)/100,salesCount:row.salesCount,purchasesCount:row.purchasesCount
 }));
}
export function activeMonthStats(months:readonly ActiveMonth[]){
 const best=months.reduce<ActiveMonth|undefined>((best,row)=>!best||row.profit>best.profit?row:best,undefined);
 return {best,average:months.length<2?undefined:Math.round(months.reduce((sum,row)=>sum+cents(row.profit),0)/months.length)/100};
}

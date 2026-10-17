import type {Customer} from '../types';
import {compareAlphabetical} from './alphabetical';
export function debtOverview(customers:readonly Customer[]){
 const owing=customers.filter(customer=>Number.isFinite(customer.totalDebt)&&customer.totalDebt>0);
 return {count:owing.length,total:owing.reduce((sum,customer)=>sum+Math.round(customer.totalDebt*100),0)/100};
}
export function orderDebtCustomers(customers:readonly Customer[],order:'name'|'debt'){
 return [...customers].sort((a,b)=>(order==='debt'?Math.max(0,b.totalDebt)-Math.max(0,a.totalDebt):0)||compareAlphabetical(a.name,b.name));
}
export function customerLastMovement(customer:Customer,legacy:Record<string,number>={}):number|undefined{
 const value=Math.max(customer.lastMovementAt||0,legacy[customer.id||'']||0,customer.previousDebt>0?customer.createdAt:0);
 return Number.isFinite(value)&&value>0?value:undefined;
}

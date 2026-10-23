import type {Customer,Product,Purchase,Sale,SaleItem} from '../types';
export interface ReportFilters {payment:string;employee:string;category:string;}
export const emptyReportFilters:ReportFilters={payment:'todas',employee:'all',category:'all'};
export const activeReportFilterCount=(f:ReportFilters)=>Number(f.payment!=='todas')+Number(f.employee!=='all')+Number(f.category!=='all');
/** Category totals use only matching lines, with fees/surcharge apportioned, never the whole mixed sale. */
export async function filterReport(sales:Sale[],purchases:Purchase[],products:Product[],filters:ReportFilters,loadItems:(id:string)=>Promise<SaleItem[]>) {
 const employeeMatches=(employeeId:string|undefined,ownerId:string)=>filters.employee==='all'||(filters.employee==='owner'?(!employeeId||employeeId==='owner'||employeeId===ownerId):employeeId===filters.employee);
 const categories=new Map(products.map(p=>[p.id,p.category]));
 const filteredSales=(await Promise.all(sales.filter(s=>!s.cancelledAt&&employeeMatches(s.employeeId,s.ownerId)&&
  (filters.payment==='todas'||s.paymentMethod===filters.payment||(filters.payment==='card'?s.type==='card':!s.paymentMethod&&s.type===filters.payment))).map(async sale=>{
   if(filters.category==='all')return sale;
   if(!sale.id)return null;
   const items=await loadItems(sale.id),matches=items.filter(i=>categories.get(i.productId)===filters.category);
   if(!matches.length)return null;
   const amount=matches.reduce((n,i)=>n+i.price*i.quantity,0),subtotal=items.reduce((n,i)=>n+i.price*i.quantity,0);
   if(!(subtotal>0))return null;
   const ratio=amount/subtotal,round=(n:number)=>Math.round(n*100)/100;
   return {...sale,subtotal:round(amount),total:round(sale.total*ratio),feeAmount:round((sale.feeAmount || 0)*ratio),surchargeAmount:round((sale.surchargeAmount || 0)*ratio),netTotal:round((sale.netTotal??sale.total)*ratio),itemsSummary:matches.map(i=>`${i.quantity}x ${i.name}`).join(', ')};
 }))).filter((s):s is Sale=>s!==null);
 const filteredPurchases=purchases.filter(p=>employeeMatches(p.employeeId,p.ownerId)&&(filters.category==='all'||(p.category || categories.get(p.productId))===filters.category));
 return {sales:filteredSales,purchases:filteredPurchases};
}

export function reportExportEntities(sales:Sale[],customers:Customer[],products:Product[],filters:ReportFilters) {
 const ids=new Set(sales.filter(s=>s.type==='fiado').map(s=>s.customerId));
 return {customers:activeReportFilterCount(filters)?customers.filter(c=>ids.has(c.id)):customers,products:filters.category==='all'?products:products.filter(p=>p.category===filters.category)};
}

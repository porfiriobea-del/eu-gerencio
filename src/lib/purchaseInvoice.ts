import type {BonusRule,Product} from '../types';
import {calculateBonus,supplierKey} from './purchaseBonus';
import {getPurchasePackageUnits} from './productUnits';
export interface InvoiceDraftLine {id:string;productId:string;search:string;quantity:string;measure:'unit'|'package';cost:string|null;bonusProductId:string;bonusQuantity:string;manualBonus:boolean;}
export const newInvoiceLine=():InvoiceDraftLine=>({id:crypto.randomUUID(),productId:'',search:'',quantity:'1',measure:'unit',cost:null,bonusProductId:'',bonusQuantity:'0',manualBonus:false});
export function invoiceLine(line:InvoiceDraftLine,products:Product[],rules:BonusRule[],supplier:string) {
 const product=products.find(p=>p.id===line.productId&&!p.mergedIntoId);
 const count=line.quantity.trim()?Number(line.quantity):NaN;
 const factor=product&&line.measure==='package'?getPurchasePackageUnits(product):1;
 const quantity=Math.round(count*factor*20)/20;
 const validQuantity=Number.isFinite(count)&&count>0&&(line.measure==='package'?Number.isSafeInteger(count):product?.type==='cigarro'?Math.abs(count*20-Math.round(count*20))<1e-7:Number.isSafeInteger(count));
 const cost=line.cost===null?(product&&(product.lastCost ?? product.unitCost ?? 0)>0?Math.round(quantity*(product.lastCost ?? product.unitCost)*100)/100:NaN):line.cost.trim()?Number(line.cost):NaN;
 const rule=rules.find(r=>r.productId===product?.id&&supplierKey(r.supplier || '')===supplierKey(supplier));
 const bonusProductId=line.manualBonus?line.bonusProductId:rule?.bonusProductId || '';
 const bonusProduct=products.find(p=>p.id===bonusProductId&&!p.mergedIntoId);
 let bonusQuantity=line.manualBonus?Number(line.bonusQuantity):0;
 if(!bonusProductId)bonusQuantity=0;
 let ruleInvalid=false;
 if(!line.manualBonus&&rule&&product&&bonusProduct&&validQuantity){try{bonusQuantity=calculateBonus(rule,product,bonusProduct,quantity);}catch{ruleInvalid=true;}}
 const validBonus=Number.isFinite(bonusQuantity)&&bonusQuantity>=0&&(!bonusQuantity||!!bonusProduct)&&(bonusProduct?.type==='cigarro'?Math.abs(bonusQuantity*20-Math.round(bonusQuantity*20))<1e-7:Number.isSafeInteger(bonusQuantity));
 return {product,count,quantity,factor,cost,bonusProduct,bonusProductId,bonusQuantity,rule,ruleInvalid,valid:!!product&&!ruleInvalid&&validQuantity&&(product.type==='cigarro'||Number.isSafeInteger(quantity))&&validBonus&&Number.isFinite(cost)&&cost>=0};
}
export const productSearchKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

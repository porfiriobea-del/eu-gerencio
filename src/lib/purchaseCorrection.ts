import type {Product,Purchase} from '../types';
import {bonusCost} from './purchaseBonus';
import {inventoryLots,lotFields} from './fifoCost';
import {costPriceReview} from './costPricing';
export interface PurchaseCorrection {totalCost:number;supplier:string;notes:string;expectedUpdatedAt:number;correctionId:string;}
export function correctedPurchase(before:Purchase,patch:PurchaseCorrection,now:number,actor:string):Purchase {
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(patch.correctionId)||!Number.isFinite(patch.totalCost)||patch.totalCost<0||!Number.isSafeInteger(Math.round(patch.totalCost*100))||Math.abs(patch.totalCost*100-Math.round(patch.totalCost*100))>1e-7)throw new Error('Informe um valor válido, em centavos.');
  if(!Number.isFinite(patch.expectedUpdatedAt))throw new Error('Atualize a compra antes de editar.');
  if((before.updatedAt??before.createdAt)!==patch.expectedUpdatedAt)throw new Error('Esta compra foi alterada em outro aparelho. Feche e abra a edição novamente.');
  if(typeof patch.supplier!=='string'||typeof patch.notes!=='string'||patch.supplier.length>500||patch.notes.length>5000)throw new Error('Confira fornecedor e observações.');
  const totalCost=Math.round(patch.totalCost*100)/100,costs=bonusCost(before.quantity,before.bonusQuantity||0,totalCost);
  return {...before,totalCost,unitCost:totalCost/before.quantity,...costs,supplier:patch.supplier.trim(),notes:patch.notes.trim(),updatedAt:now,updatedBy:actor,lastCorrectionId:patch.correctionId};
}
/** Reprice only unconsumed lots; changing their identity preserves old allocations on sale cancellation. */
export function correctedProductCosts(product:Product,before:Purchase,after:Purchase,history:Purchase[],revision:string,now:number):Partial<Product> {
  if(before.totalCost===after.totalCost)return {};
  const lots=inventoryLots(product,history);
  const cost=after.effectiveUnitCost!;
  const next=lots.map(l=>l.purchaseId===before.id?{...l,id:`${l.id}:cost:${revision}`,unitCost:cost}:l);
  const ids=new Set([product.id,...(product.mergedProductIds||[])]);
  const relevant=history.filter(p=>ids.has(p.productId)||(p.bonusQuantity||0)>0&&ids.has(p.bonusProductId||p.productId));
  const latest=[...relevant].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)||(b.id||'').localeCompare(a.id||'','en'))[0];
  const latestChanged=latest?.id===before.id;
  return {...lotFields({...product,...(latestChanged?{lastCost:cost}:{})},next),...(latestChanged?{lastCost:cost,pendingPriceReview:costPriceReview(product,cost,revision,now)}:{}),updatedAt:now};
}

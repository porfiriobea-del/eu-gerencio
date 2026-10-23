import type {Product,Purchase,FifoLot} from '../types';

// Quantities are integer twentieths, including ordinary units (20 ticks).
export function stockTicks(quantity:number):number {
  const ticks=Math.round(quantity*20);
  if(!Number.isFinite(quantity)||quantity<0||!Number.isSafeInteger(ticks)||Math.abs(quantity*20-ticks)>1e-7)throw new Error('Quantidade inválida: use passos de 0,05 carteira.');
  return ticks;
}
export const lotOrder=(a:FifoLot,b:FifoLot)=>Number(b.kind==='initial')-Number(a.kind==='initial') || a.createdAt-b.createdAt || a.id.localeCompare(b.id,'en');
export function receiptLots(purchase:Purchase,productId:string):FifoLot[] {
  if(purchase.stockUpdated===false || (purchase.productId!==productId && (purchase.bonusProductId || purchase.productId)!==productId))return [];
  const bonus=purchase.bonusQuantity || 0;
  const cost=purchase.effectiveUnitCost ?? (Number.isFinite(purchase.totalCost)?purchase.totalCost/(purchase.quantity+bonus):purchase.unitCost ?? 0);
  if(!Number.isFinite(cost)||cost<0)throw new Error('Custo da compra inválido.');
  const base={purchaseId:purchase.id!,unitCost:cost,createdAt:purchase.createdAt || Date.parse(purchase.date) || 0};
  return [
    ...(purchase.productId===productId&&purchase.quantity>0?[{...base,id:`${purchase.id}:0`,kind:'purchase' as const,quantity:purchase.quantity}]:[]),
    ...((purchase.bonusProductId || purchase.productId)===productId&&bonus>0?[{...base,id:`${purchase.id}:1`,kind:'bonus' as const,quantity:bonus}]:[])
  ];
}
/** Bootstrap once from newest receipts backwards. Subsequent immutable lot identities preserve returns. */
export function inventoryLots(product:Product,purchases:Purchase[]=[]):FifoLot[] {
  const stock=stockTicks(product.stock);
  if(product.fifoLots!==undefined){
    const lots=product.fifoLots.map(l=>({...l})).sort(lotOrder);
    if(lots.some(l=>!Number.isFinite(l.unitCost)||l.unitCost<0)||lots.reduce((n,l)=>n+stockTicks(l.quantity),0)!==stock)throw new Error('Os lotes não conferem com o estoque. Atualize a loja antes de continuar.');
    return lots;
  }
  const ids=new Set([product.id,...(product.mergedProductIds || [])]);
  const receipts=purchases.flatMap(p=>[...ids].flatMap(id=>id?receiptLots(p,id):[])).sort(lotOrder);
  let remaining=stock;const lots:FifoLot[]=[];
  for(const lot of receipts.reverse()){
    const take=Math.min(remaining,stockTicks(lot.quantity));if(take)lots.push({...lot,quantity:take/20});remaining-=take;if(!remaining)break;
  }
  if(remaining)lots.push({id:`initial:${product.id}`,kind:'initial',quantity:remaining/20,unitCost:product.initialUnitCost ?? product.unitCost ?? 0,createdAt:0});
  return lots.sort(lotOrder);
}
export function lotFields(product:Product,lots:FifoLot[]):Partial<Product> {
  lots=lots.filter(l=>stockTicks(l.quantity)>0).map(l=>({...l})).sort(lotOrder);
  const initial=lots.find(l=>l.kind==='initial');
  return {fifoLots:lots,stock:lots.reduce((n,l)=>n+stockTicks(l.quantity),0)/20,unitCost:lots[0]?.unitCost ?? product.lastCost ?? product.unitCost ?? 0,
    ...(product.initialUnitCost===undefined?{initialUnitCost:initial?.unitCost ?? product.unitCost ?? 0}:{})};
}
export function consumeLots(lots:FifoLot[],quantity:number) {
  let remaining=stockTicks(quantity),totalCost=0,known=true;const allocations:FifoLot[]=[],next:FifoLot[]=[];
  if(!remaining)throw new Error('Quantidade de venda inválida.');
  for(const lot of [...lots].sort(lotOrder)) {
    const available=stockTicks(lot.quantity),take=Math.min(available,remaining);
    if(take){allocations.push({...lot,quantity:take/20});totalCost+=take/20*lot.unitCost;if(!(lot.unitCost>0))known=false;}
    if(available>take)next.push({...lot,quantity:(available-take)/20});remaining-=take;
  }
  if(remaining)throw new Error('Estoque insuficiente.');
  return {lots:next,allocations,costKnown:known,totalCost:known?totalCost:null};
}
export function restoreLots(lots:FifoLot[],allocations:FifoLot[]) {
  const map=new Map(lots.map(l=>[l.id,{...l}]));
  for(const a of allocations){const current=map.get(a.id);if(current&&(current.unitCost!==a.unitCost||current.createdAt!==a.createdAt))throw new Error('O lote devolvido não confere.');map.set(a.id,{...a,quantity:(stockTicks(current?.quantity || 0)+stockTicks(a.quantity))/20});}
  return [...map.values()].sort(lotOrder);
}

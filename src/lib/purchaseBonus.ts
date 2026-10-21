import type {BonusRule, BonusUnit, Product, Purchase} from '../types';
import {getPurchasePackageUnits} from './productUnits';
export const supplierKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const bonusUnitKey=(unit:BonusUnit,quantity:number)=>`bonus.unit.${unit}${quantity===1?'.single':''}`;
export function bonusUnits(product: Product, unit: BonusUnit): number {
  if (unit === 'carteira' || unit === 'maco') {
    if (product.type !== 'cigarro') throw new Error('Carteiras e maços são medidas de cigarro.');
    return unit === 'maco' ? 10 : 1;
  }
  if (unit === 'unidade') return 1;
  return getPurchasePackageUnits(product);
}
export function validBonusRule(rule: BonusRule, products: Product[]) {
  if (!rule.id || !rule.supplier.trim() || !Number.isSafeInteger(rule.buyQuantity) || rule.buyQuantity<=0 || !Number.isSafeInteger(rule.bonusQuantity) || rule.bonusQuantity<=0) throw new Error('Informe fornecedor e quantidades inteiras maiores que zero.');
  const buy=products.find(p=>p.id===rule.productId && !p.mergedIntoId),bonus=products.find(p=>p.id===rule.bonusProductId && !p.mergedIntoId);
  if (!buy || !bonus) throw new Error('Selecione os dois produtos cadastrados.');
  if (![rule.buyUnit,rule.bonusUnit].every(unit=>['maco','pacote','carteira','unidade','fardo'].includes(unit))) throw new Error('Selecione uma medida válida.');
  if (!Number.isSafeInteger(rule.buyQuantity*bonusUnits(buy,rule.buyUnit)*20) || !Number.isSafeInteger(rule.bonusQuantity*bonusUnits(bonus,rule.bonusUnit)*20)) throw new Error('Quantidade muito grande. Confira a regra.');
}
export function calculateBonus(rule: BonusRule, bought: Product, bonus: Product, quantity: number) {
  const threshold=Math.round(rule.buyQuantity*bonusUnits(bought,rule.buyUnit)*20);
  const multiplier=Math.floor(Math.round(quantity*20)/threshold);
  return multiplier*rule.bonusQuantity*bonusUnits(bonus,rule.bonusUnit);
}
export function bonusCost(quantity: number, bonusQuantity: number, totalCost: number) {
  if (!Number.isFinite(quantity) || quantity<=0 || !Number.isFinite(bonusQuantity) || bonusQuantity<0 || !Number.isFinite(totalCost) || totalCost<0 || !Number.isFinite(quantity+bonusQuantity)) throw new Error('Confira quantidade, bônus e valor da compra.');
  const effectiveUnitCost=totalCost/(quantity+bonusQuantity);
  return {effectiveUnitCost, bonusSavings:bonusQuantity*(totalCost/quantity)};
}
export function nearBonus(rules: BonusRule[], supplier: string, product: Product, quantity: number) {
  if (!quantity || !supplier) return [];
  return rules.filter(r=>r.productId===product.id && supplierKey(r.supplier)===supplierKey(supplier)).flatMap(rule=>{
    let threshold: number;
    try {threshold=rule.buyQuantity*bonusUnits(product,rule.buyUnit);} catch {return [];}
    if (!Number.isFinite(threshold) || threshold<=0) return [];
    const remainder=Math.round(quantity*20)%Math.round(threshold*20);
    if (!remainder) return [];
    const missing=(Math.round(threshold*20)-remainder)/20;
    return missing<=Math.max(getPurchasePackageUnits(product),threshold*0.2) ? [{rule,missing,extraBonus:rule.bonusQuantity}] : [];
  });
}
export function monthlyBonusSavings(purchases: Purchase[], date=new Date()) {
  const month=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  return purchases.filter(p=>typeof p.date==='string' && p.date.startsWith(month)).reduce((sum,p)=>sum+(Number.isFinite(p.bonusSavings)?p.bonusSavings!:0),0);
}

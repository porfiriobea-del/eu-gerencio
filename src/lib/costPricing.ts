import type {Product,PriceField,PriceChange,PriceReview} from '../types';
import {calculateMargin} from './pricing';
export const PRICE_FIELDS:PriceField[]=['basePrice','pricePackage','pricePack','priceCart','priceHalfCart','priceUnit','promoPrice'];
export function salePriceFormats(product:Product):{field:PriceField;units:number}[] {
  const formats:{field:PriceField;units:number}[]=product.type==='cigarro'
    ? [{field:'pricePack' as const,units:10},{field:'priceCart' as const,units:1},{field:'priceHalfCart' as const,units:0.5},{field:'priceUnit' as const,units:0.05}]
    : [{field:'basePrice' as const,units:1},{field:'pricePackage' as const,units:Math.max(1,product.unitsPerPackage || 1)}];
  if (product.type!=='cigarro' && product.hasPromoSuggestion) formats.push({field:'promoPrice',units:1});
  return formats.filter(f=>Number.isFinite(product[f.field]) && Number(product[f.field])>0);
}
export function costPriceReview(product:Product,newCost:number,id:string,createdAt=Date.now()):PriceReview|null {
  const oldCost=product.lastCost ?? product.unitCost;
  if (!(oldCost>0) || !Number.isFinite(newCost) || newCost<=0) return null;
  const changePercent=(newCost-oldCost)/oldCost*100;
  if (Math.abs(changePercent)<=3+1e-9) return null;
  const prices=salePriceFormats(product).map(({field})=>({field,oldPrice:Number(product[field]),newPrice:Math.max(0.5,Math.round(Number(product[field])*newCost/oldCost*2)/2)}));
  return prices.length?{id,oldCost,newCost,changePercent,prices,createdAt}:null;
}
export function changedPrices(before:Product,after:Product):PriceChange[] {
  return PRICE_FIELDS.flatMap(field=>{
    const value=(n:unknown)=>{
      if(n && typeof n==='object' && '__eu_delete_field' in n) return 0;
      const number=Number(n || 0);
      if(!Number.isFinite(number) || number<0)throw new Error('Informe preços válidos.');
      return number;
    };
    const oldPrice=value(before[field]),newPrice=value(after[field]);
    return oldPrice!==newPrice ? [{field,oldPrice,newPrice}] : [];
  });
}
export function lowMarginFormats(product:Product,storeMargin=30) {
  const desired=Number.isFinite(product.desiredMargin)?product.desiredMargin!:storeMargin;
  if (!Number.isFinite(desired) || desired<0 || desired>=100) return [];
  return salePriceFormats(product).filter(f=>!(f.field==='basePrice' && product.hasPromoSuggestion && Number(product.promoPrice)>0)).flatMap(({field,units})=>{
    const margin=calculateMargin(product.unitCost*units,Number(product[field]));
    return margin!==null && margin<desired ? [{field,margin,desired}] : [];
  });
}

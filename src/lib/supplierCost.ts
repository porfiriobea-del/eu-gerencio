import type {Product} from '../types';
import {getPurchasePackageUnits} from './productUnits';
/** A supplier quote is separate from the actual FIFO cost of inventory already received. */
export function supplierPackageCost(product:Partial<Product>):number {
  if(typeof product.supplierPackageCost==='number'&&Number.isFinite(product.supplierPackageCost)&&product.supplierPackageCost>=0)return product.supplierPackageCost;
  const cost=product.lastCost??product.unitCost??0;
  return Number.isFinite(cost)&&cost>=0?Math.round(cost*getPurchasePackageUnits(product as Product)*100)/100:0;
}
export function supplierUnitCost(product:Partial<Product>):number {
  if(typeof product.supplierPackageCost==='number'&&Number.isFinite(product.supplierPackageCost)&&product.supplierPackageCost>=0)return product.supplierPackageCost/getPurchasePackageUnits(product as Product);
  return product.lastCost??product.unitCost??0;
}

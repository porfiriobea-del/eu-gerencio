import {useCurrency} from './useCurrency';
import {formatProductStock,formatStockNumber,stockInputValue} from './productUnits';
import type {Product} from '../types';

/** Physical quantities use the same exact presentation in every language mode. */
export function useStockFormatting() {
  const {language}=useCurrency();
  return {
    stockInputValue,
    formatProductStock:(product:Pick<Product,'type'|'stock'>,stock=product.stock)=>formatProductStock(product,stock,language),
    formatStockNumber:(stock:number)=>formatStockNumber(stock,language)
  };
}

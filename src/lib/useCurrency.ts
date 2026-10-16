import { createContext, useContext } from 'react';
import { formatMoney, formatAmount, getCurrencySymbol, normalizeCurrency, type MoneyOptions } from './currency';

export const CurrencyContext = createContext<MoneyOptions>({currency:'BRL',language:'pt-BR'});
export function useCurrency() {
  const preferences = useContext(CurrencyContext);
  const currency = normalizeCurrency(preferences.currency);
  const language = preferences.language || 'pt-BR';
  const options = {currency,language};
  return {currency,language,isBrazil:currency==='BRL',currencySymbol:getCurrencySymbol(options),
    formatMoney:(value:number)=>formatMoney(value,options), formatAmount:(value:number)=>formatAmount(value,options)};
}

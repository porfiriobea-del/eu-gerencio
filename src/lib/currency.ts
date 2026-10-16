export type StoreCurrency = 'BRL' | 'USD' | 'EUR';
export type MoneyLanguage = 'pt' | 'pt-BR' | 'en' | 'es';
export interface MoneyOptions { currency?: StoreCurrency; language?: MoneyLanguage }
export const moneyLocales = {pt:'pt-BR','pt-BR':'pt-BR',en:'en-US',es:'es-ES'} as const;
export function normalizeCurrency(value: unknown): StoreCurrency { return value === 'USD' || value === 'EUR' ? value : 'BRL'; }
export function moneyLocale(language?: string): string { return moneyLocales[language as MoneyLanguage] || moneyLocales.pt; }
const currencyFormatters = new Map<string, Intl.NumberFormat>();
const amountFormatters = new Map<string, Intl.NumberFormat>();
function currencyFormatter(options: MoneyOptions): Intl.NumberFormat {
  const currency = normalizeCurrency(options.currency), locale = moneyLocale(options.language), key = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {style:'currency', currency, currencyDisplay:currency==='BRL'?'narrowSymbol':'symbol'});
    currencyFormatters.set(key,formatter);
  }
  return formatter;
}
export function formatMoney(value: number, options: MoneyOptions = {}): string { return currencyFormatter(options).format(value); }
export function formatAmount(value: number, options: MoneyOptions = {}): string {
  const locale = moneyLocale(options.language);
  let formatter = amountFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
    amountFormatters.set(locale,formatter);
  }
  return formatter.format(value);
}
export function getCurrencySymbol(options: MoneyOptions = {}): string {
  return currencyFormatter(options).formatToParts(0).find(part=>part.type==='currency')?.value || 'R$';
}

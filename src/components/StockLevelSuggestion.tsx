import { useStockFormatting } from '../lib/useStockFormatting';
import { suggestStockLevels } from '../lib/stockSuggestions';
import { usePreferences } from '../lib/preferencesContext';
import type { Product } from '../types';

interface Props {
  product: Pick<Product, 'type' | 'stock' | 'dailyAverageSales' | 'replacementDays'>;
  coverageDays: number;
  onCoverageChange: (days: number) => void;
  onApply: (values: { safetyStock: number; maxStock: number }) => void;
}
export function StockLevelSuggestion({ product, coverageDays, onCoverageChange, onApply }: Props) {
  const { formatProductStock, formatStockNumber: quantity } = useStockFormatting();
  const { v, isBasicMode } = usePreferences();
  const suggestion = suggestStockLevels(product, coverageDays);
  const text = (key: string, values: Record<string, string>) => Object.entries(values).reduce((result, [name, value]) => result.replace(`{${name}}`, value), v(key));
  const unit = product.type === 'cigarro' ? 'carteiras' : 'unidades';
  return <section aria-label="Sugestão de estoque mínimo e máximo" className="my-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
    <h3 className="font-bold text-foreground">{v('suggestion.title')}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{v('suggestion.description')}</p>
    <label className="mt-3 block text-sm text-foreground">{v('suggestion.coverage')}
      <input type="number" min={1} max={365} step={1} value={coverageDays} onChange={event => onCoverageChange(Math.max(1, Math.min(365, Math.trunc(Number(event.target.value)) || 1)))} className="ml-2 w-20 rounded-lg border border-border bg-surface p-2 text-foreground" />
    </label>
    {!suggestion ? <p role="status" className="mt-3 text-sm text-muted-foreground">{v('suggestion.noAverage')}</p> : <>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-surface p-3"><dt className="text-muted-foreground">{v('suggestion.min')}</dt><dd className="font-bold text-foreground">{formatProductStock(product, suggestion.minimum)}</dd></div>
        <div className="rounded-xl bg-surface p-3"><dt className="text-muted-foreground">{v('suggestion.max')}</dt><dd className="font-bold text-foreground">{formatProductStock(product, suggestion.maximum)}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-foreground">{Number(product.stock) === 0 ? v('suggestion.empty') : text('suggestion.days', {days: quantity(suggestion.daysRemaining)})}</p>
      <p className="mt-1 text-sm text-foreground">{text(suggestion.excess > 0 ? 'suggestion.excess' : 'suggestion.buy', {quantity: formatProductStock(product, suggestion.excess > 0 ? suggestion.excess : suggestion.toBuy), unit: ''})}</p>
      {suggestion.needsReorder && <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-300">{v('suggestion.warning')}</p>}
      <button type="button" onClick={() => onApply({ safetyStock: suggestion.safetyStock, maxStock: suggestion.maximum })} className="mt-4 min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{v('suggestion.apply')}</button>
      <p className="mt-2 text-xs text-muted-foreground">{v('suggestion.confirm')}</p>
      <details key={`explanation-${isBasicMode}`} open={!isBasicMode} className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer py-1">{v('suggestion.details')}</summary><p className="mt-1">{v('suggestion.formula')}</p></details>
    </>}
  </section>;
}

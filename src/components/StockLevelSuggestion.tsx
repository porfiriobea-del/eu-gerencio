import { suggestStockLevels } from '../lib/stockSuggestions';
import { usePreferences } from '../lib/preferencesContext';
import type { Product } from '../types';

interface Props {
  product: Pick<Product, 'type' | 'stock' | 'dailyAverageSales' | 'replacementDays'>;
  coverageDays: number;
  onCoverageChange: (days: number) => void;
  onApply: (values: { safetyStock: number; maxStock: number }) => void;
}
const quantity = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export function StockLevelSuggestion({ product, coverageDays, onCoverageChange, onApply }: Props) {
  const { v, isBasicMode } = usePreferences();
  const suggestion = suggestStockLevels(product, coverageDays);
  const unit = product.type === 'cigarro' ? 'carteiras' : 'unidades';
  return <section aria-label="Sugestão de estoque mínimo e máximo" className="my-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
    <h3 className="font-bold text-foreground">{isBasicMode ? 'Quanto manter na loja?' : 'Sugestão de estoque mínimo e máximo'}</h3>
    <p className="mt-1 text-sm text-muted-foreground">Usa a média diária informada acima e o prazo do fornecedor. A reserva é de 25% das vendas durante a espera.</p>
    <label className="mt-3 block text-sm text-foreground">Cobertura entre compras (dias)
      <input type="number" min={1} max={365} step={1} value={coverageDays} onChange={event => onCoverageChange(Math.max(1, Math.min(365, Math.trunc(Number(event.target.value)) || 1)))} className="ml-2 w-20 rounded-lg border border-border bg-surface p-2 text-foreground" />
    </label>
    {!suggestion ? <p role="status" className="mt-3 text-sm text-muted-foreground">Informe uma média de vendas maior que zero para calcular. Se ainda não tem histórico, use uma estimativa.</p> : <>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-surface p-3"><dt className="text-muted-foreground">{v('stock.min', 'Mínimo sugerido')}</dt><dd className="font-bold text-foreground">{quantity(suggestion.minimum)} {unit}</dd></div>
        <div className="rounded-xl bg-surface p-3"><dt className="text-muted-foreground">{v('stock.max', 'Máximo sugerido')}</dt><dd className="font-bold text-foreground">{quantity(suggestion.maximum)} {unit}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-foreground">Com a média informada, o estoque atual dura cerca de {quantity(suggestion.daysRemaining)} dias.</p>
      <p className="mt-1 text-sm text-foreground">{suggestion.excess > 0 ? `Há ${quantity(suggestion.excess)} ${unit} acima do máximo sugerido. Não é preciso comprar agora.` : `Faltam ${quantity(suggestion.toBuy)} ${unit} para chegar ao máximo sugerido.`}</p>
      {suggestion.needsReorder && <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-300">O estoque chegou ao mínimo sugerido. Planeje a reposição.</p>}
      <button type="button" onClick={() => onApply({ safetyStock: suggestion.safetyStock, maxStock: suggestion.maximum })} className="mt-4 min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Usar limites sugeridos</button>
      <p className="mt-2 text-xs text-muted-foreground">Preenche a reserva de segurança e o máximo no formulário. O mínimo é a reserva mais as vendas previstas até a entrega. Clique em Salvar Produto para confirmar. O saldo atual não será alterado.</p>
    </>}
  </section>;
}

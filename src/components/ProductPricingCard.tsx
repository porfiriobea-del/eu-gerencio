import { useCurrency } from '../lib/useCurrency';
import type { Product } from '../types';
import { calculateMargin, getPricingFormats, isFractionalCigarette, priceForMargin } from '../lib/pricing';


function PriceDetails({ cost, price }: { cost: number; price: number }) {
  const { formatMoney } = useCurrency();
  const currency = (value:number) => Number.isFinite(value) ? formatMoney(value) : 'Não informado';
  const margin = calculateMargin(cost, price);
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Custo</dt><dd className="text-right font-medium tabular-nums">{currency(cost)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Preço atual</dt><dd className="text-right font-bold tabular-nums">{currency(price)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Margem atual</dt><dd className={`text-right font-bold tabular-nums ${margin !== null && margin < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{margin === null ? '—' : `${margin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}</dd></div>
    </dl>
  );
}

interface ProductPricingCardProps {
  product: Product;
  isSaving: boolean;
  onUpdatePrice: (id: string, field: 'basePrice' | 'pricePack' | 'priceCart' | 'priceHalfCart' | 'priceUnit', price: number) => void;
}

export function ProductPricingCard({ product, isSaving, onUpdatePrice }: ProductPricingCardProps) {
  const { formatMoney, currencySymbol } = useCurrency(); const currency = (value:number) => Number.isFinite(value) ? formatMoney(value) : 'Não informado';

  const fractional = isFractionalCigarette(product);
  const formats = fractional ? getPricingFormats(product) : [];
  const suggestions = (cost: number, field: Parameters<ProductPricingCardProps['onUpdatePrice']>[1]) => (
    <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      <h4 className="text-xs font-semibold text-muted-foreground">Sugestões de margem</h4>
      {[20, 30, 40].map(margin => {
        const price = priceForMargin(cost, margin);
        return (
          <button key={margin} type="button" disabled={isSaving || !product.id || price === null}
            onClick={() => price !== null && product.id && onUpdatePrice(product.id, field, price)}
            aria-label={`Aplicar margem de ${margin}%${field !== 'basePrice' ? ` no formato ${formats.find(format => format.key === field)?.label}` : ''} de ${product.name}`}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:hover:bg-slate-800 notranslate normal-case" translate="no">
            <span>Sugestão {margin}%</span><span className="text-right font-bold tabular-nums text-blue-700 dark:text-blue-400">{price === null ? 'Informe o custo' : currency(price)}</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <article aria-label={`Precificação de ${product.name}`} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-foreground shadow-sm dark:border-slate-800 dark:bg-slate-950 notranslate normal-case" translate="no">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-base font-bold notranslate normal-case" translate="no">{product.name}</h3><p className="mt-1 text-sm font-medium text-blue-700 dark:text-blue-400">{product.category || 'Sem categoria'}</p></div>
        {isSaving && <span role="status" className="text-xs text-muted-foreground">Salvando preço...</span>}
      </header>
      {fractional ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">Custo proporcional ao estoque contado em carteiras. Apenas formatos com preço cadastrado.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {formats.map(format => (
              <section key={format.key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                <h4 className="font-bold">{format.label}</h4><p className="mb-3 text-xs text-muted-foreground notranslate normal-case" translate="no">{format.description}</p>
                <PriceDetails cost={format.cost} price={format.price} />
                {suggestions(format.cost, format.key)}
              </section>
            ))}
          </div>
          {formats.length === 0 && <p className="text-sm text-muted-foreground">Nenhum formato de venda habilitado. Cadastre os preços no Estoque.</p>}
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <PriceDetails cost={Number(product.unitCost)} price={Number(product.basePrice)} />
            {Number(product.pricePackage) > 0 && <p className="mt-3 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">Embalagem ({product.unitsPerPackage} unidades)</span><span className="text-right font-semibold">{currency(Number(product.pricePackage))}</span></p>}
            {product.hasPromoSuggestion && Number(product.promoPrice) > 0 && <p className="mt-3 flex justify-between gap-3 text-xs text-amber-700 dark:text-amber-400"><span>Preço promocional</span><span className="text-right font-semibold">{currency(Number(product.promoPrice))}</span></p>}
          </div>
          <div>{suggestions(Number(product.unitCost), 'basePrice')}</div>
        </div>
      )}
    </article>
  );
}

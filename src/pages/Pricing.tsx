import { sortByName } from '../lib/alphabetical';
import { useCurrency } from '../lib/useCurrency';
import { ProductPricingCard } from '../components/ProductPricingCard';
import { showToast, showActionError } from '../lib/actionFeedback';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { subscribeProducts, updateProduct, getMonthlyFinancials } from '../lib/api';
import { Product, MonthlyFinancials } from '../types';
import { DollarSign, RefreshCw, ShoppingCart, Info, Tag, PieChart, ShoppingBag, ChevronDown, Sparkles } from 'lucide-react';
import { usePreferences } from '../lib/preferencesContext';

export default function Pricing() {
  const { formatMoney, currencySymbol } = useCurrency();

  const { v, entityName, languageMode, isBasicMode, simpleViewMode } = usePreferences();
  const [products, setProducts] = useState<Product[]>([]);
  const [savingPriceIds, setSavingPriceIds] = useState<Set<string>>(new Set());
  const [financials, setFinancials] = useState<MonthlyFinancials | null>(null);
  const [loadingFinancials, setLoadingFinancials] = useState(true);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<number>(0); // 0 = atual, -1 = anterior
  const [isDeductionsExpanded, setIsDeductionsExpanded] = useState(() => !(simpleViewMode || isBasicMode));
  useEffect(() => { setIsDeductionsExpanded(!simpleViewMode); }, [simpleViewMode]);

  const loadFinancials = async (offset: number) => {
    setLoadingFinancials(true);
    const targetDate = new Date();
    if (offset !== 0) {
      targetDate.setMonth(targetDate.getMonth() + offset);
    }
    const data = await getMonthlyFinancials(targetDate);
    setFinancials(data);
    setLoadingFinancials(false);
  };

  useEffect(() => {
    const unsubProducts = subscribeProducts(items => setProducts(sortByName(items)));
    loadFinancials(selectedMonthOffset);
    return () => {
      unsubProducts();
    };
  }, [selectedMonthOffset]);

  const handleUpdatePrice = async (id: string, field: 'basePrice' | 'pricePack' | 'priceCart' | 'priceHalfCart' | 'priceUnit', newPrice: number) => {
    if (savingPriceIds.has(id)) return;
    setSavingPriceIds(previous => new Set(previous).add(id));
    try {
      await updateProduct(id, { [field]: newPrice });
      showToast('✓ Preço atualizado com sucesso!');
    } catch (error) {
      showActionError(error, 'Não foi possível confirmar a alteração do preço. Confira antes de repetir.');
    } finally {
      setSavingPriceIds(previous => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{v('pricing.title', 'Preços & Lucratividade')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analise os valores ganhos no mês ({v('pricing.grossProfit', 'lucro bruto').toLowerCase()} e {v('pricing.netProfit', 'líquido').toLowerCase()}) e gerencie a precificação dos {entityName(true).toLowerCase()}.
          </p>
        </div>
      </div>

      {/* Subárea: Valores Ganhos no Mês (Lucro Bruto e Líquido) */}
      <div className="bg-surface rounded-2xl shadow-sm border border-border p-5 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-palette-1 text-primary rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {languageMode === 'basic' ? 'Quanto Você Ganhou no Mês' : 'Valores Ganhos no Mês'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {languageMode === 'basic'
                  ? 'Confira o total vendido, o custo dos itens vendidos e o resultado estimado.'
                  : 'Apuração financeira do faturamento, custos de mercadoria (CMV), lucro bruto e líquido.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted p-1 rounded-xl text-xs font-semibold text-foreground border border-border">
              <button
                type="button"
                onClick={() => setSelectedMonthOffset(0)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  selectedMonthOffset === 0
                    ? 'bg-surface text-primary shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Mês Vigente
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonthOffset(-1)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  selectedMonthOffset === -1
                    ? 'bg-surface text-primary shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Mês Anterior
              </button>
            </div>

            <button
              type="button"
              onClick={() => loadFinancials(selectedMonthOffset)}
              disabled={loadingFinancials}
              className="p-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar dados do mês"
            >
              <RefreshCw className={`w-4 h-4 ${loadingFinancials ? 'animate-spin text-primary' : ''}`} />
            </button>
          </div>
        </div>

        {/* 4 Cards de Destaque Financeiro */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Faturamento Bruto / Tudo o que Entrou */}
          <div className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span className="font-semibold">{v('pricing.grossRevenue', 'Faturamento Bruto')}</span>
              <span className="p-1 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <ShoppingCart className="w-3.5 h-3.5" />
              </span>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">
                {formatMoney((financials?.totalGrossSales || 0))}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                <span>
                  {languageMode === 'basic' ? `${financials?.salesCount || 0} compras de clientes` : `Total de ${financials?.salesCount || 0} vendas`}
                </span>
                <span>
                  {languageMode === 'basic' ? `Média ${formatMoney((financials?.averageTicket || 0))}` : `Ticket: ${formatMoney((financials?.averageTicket || 0))}`}
                </span>
              </div>
              {languageMode === 'basic' && (
                <p className="text-[11px] text-muted-foreground/80 mt-1 border-t border-border/40 pt-1">
                  Total vendido, incluindo fiado
                </p>
              )}
            </div>
          </div>

          {/* Card 2: Custo das Mercadorias (CMV) / Gasto com o que Você Vendeu */}
          <div className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span className="font-semibold">{v('pricing.cogs', 'Custo Mercadorias (CMV)')}</span>
              <span className="p-1 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <Tag className="w-3.5 h-3.5" />
              </span>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">
                {financials?.profitIncomplete?v('cost.incomplete'):formatMoney((financials?.totalCostOfGoods || 0))}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {financials?.profitIncomplete?v('cost.incomplete'):financials?.totalGrossSales
                  ? (languageMode === 'basic'
                      ? `${(((financials.totalCostOfGoods ?? 0) / financials.totalGrossSales) * 100).toFixed(1)}% do dinheiro que entrou`
                      : `${(((financials.totalCostOfGoods ?? 0) / financials.totalGrossSales) * 100).toFixed(1)}% da receita bruta`)
                  : 'Sem vendas registradas'}
              </div>
              {languageMode === 'basic' && (
                <p className="text-[11px] text-muted-foreground/80 mt-1 border-t border-border/40 pt-1">
                  Quanto você pagou aos fornecedores por eles
                </p>
              )}
            </div>
          </div>

          {/* Card 3: Lucro Bruto / O que Sobrou das Vendas */}
          <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-xs font-bold mb-2">
              <span>{v('pricing.grossProfit', 'Lucro Bruto')}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px]">
                {financials?.profitIncomplete?'—':(financials?.grossMargin || 0).toFixed(1)}% {languageMode === 'basic' ? 'de sobra' : 'Margem'}
              </span>
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                {financials?.profitIncomplete?v('cost.incomplete'):formatMoney((financials?.grossProfit || 0))}
              </div>
              <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1">
                {languageMode === 'basic'
                  ? 'Dinheiro das vendas tirando o custo dos produtos'
                  : 'Receita bruta subtraída do custo dos produtos'}
              </div>
            </div>
          </div>

          {/* Card 4: Lucro Líquido Real / Dinheiro Limpo no Seu Bolso */}
          <div className="p-4 rounded-xl border border-primary/30 bg-palette-1/50 flex flex-col justify-between">
            <div className="flex items-center justify-between text-primary text-xs font-bold mb-2">
              <span>{v('pricing.netProfit', 'Lucro Líquido Real')}</span>
              <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px]">
                {financials?.profitIncomplete?'—':(financials?.netMargin || 0).toFixed(1)}% {languageMode === 'basic' ? 'estimado' : 'Estimado'}
              </span>
            </div>
            <div>
              <div className="text-2xl font-black text-primary">
                {financials?.profitIncomplete?v('cost.incomplete'):formatMoney((financials?.totalNetProfit || 0))}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {languageMode === 'basic'
                  ? 'Estimativa após custos, taxas e retiradas registradas'
                  : 'Lucro final após taxas de cartão e retiradas'}
              </div>
            </div>
          </div>
        </div>

        {/* Detalhamento de Deduções & Meios de Pagamento (Minimizado no modo básico para manter a interface simples) */}
        <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsDeductionsExpanded(!isDeductionsExpanded)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-palette-1 text-primary">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {languageMode === 'basic' ? 'Cálculo Detalhado do Lucro & Meios de Pagamento' : 'Detalhamento de Deduções & Meios de Pagamento'}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isDeductionsExpanded ? 'Clique para minimizar este detalhamento' : 'Extrato analítico de taxas de cartão, retiradas de caixa e divisão por meio de pagamento'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-primary font-semibold shrink-0">
              <span>{isDeductionsExpanded ? 'Minimizar' : 'Ver cálculo completo'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDeductionsExpanded ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {isDeductionsExpanded && (
            <div className="p-4 pt-0 border-t border-border/60">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3">
          {/* Deduções para Lucro Líquido */}
          <div className="p-4 rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" />
                {languageMode === 'basic' ? 'Como calculamos o resultado estimado' : 'Como é apurado o Lucro Líquido'}
              </h3>
              <span className="text-xs font-semibold text-foreground">{financials?.monthName}</span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">
                  {languageMode === 'basic' ? 'Sobra das vendas (Vendas menos Custo dos itens)' : 'Lucro Bruto Apurado (Receita - CMV)'}
                </span>
                <span className="font-bold text-foreground">{financials?.profitIncomplete?v('cost.incomplete'):formatMoney((financials?.grossProfit || 0))}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground flex items-center gap-1">
                  <span>{v('cost.saleFees')}</span>
                  <span className="text-[10px] text-muted-foreground">sobre {formatMoney((financials?.cardSales || 0))}</span>
                </span>
                <span className="font-medium text-red-600 dark:text-red-400">- {formatMoney((financials?.cardFeesEstimated || 0))}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">
                  {languageMode === 'basic' ? 'Dinheiro que você retirou do caixa' : 'Retiradas / Sangrias do Caixa'}
                </span>
                <span className="font-medium text-red-600 dark:text-red-400">- {formatMoney((financials?.totalWithdrawals || 0))}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="font-bold text-foreground">
                  {v('pricing.netProfit', 'Lucro Líquido Real')}
                </span>
                <span className="text-base font-extrabold text-primary">{financials?.profitIncomplete?v('cost.incomplete'):formatMoney((financials?.totalNetProfit || 0))}</span>
              </div>
              <div className="flex items-center justify-between pt-1 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                  <span>{languageMode === 'basic' ? 'Total que você gastou com compras novas no mês:' : 'Total em Compras de Reposição no Mês:'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{formatMoney((financials?.totalPurchasesSpent || 0))}</span>
                  <Link to="/compras" className="text-[11px] text-primary hover:underline">Ver compras</Link>
                </div>
              </div>
            </div>
          </div>

          {/* Vendas por Meio de Pagamento */}
          <div className="p-4 rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-primary" />
                {languageMode === 'basic' ? 'De onde veio o dinheiro das vendas' : 'Faturamento por Forma de Pagamento'}
              </h3>
              <span className="text-xs text-muted-foreground">Total: {formatMoney((financials?.totalGrossSales || 0))}</span>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-muted-foreground">
                    {languageMode === 'basic' ? '💵 Dinheiro na mão (notas e moedas)' : '💵 Dinheiro (À Vista)'}
                  </span>
                  <span className="text-foreground font-bold">{formatMoney((financials?.cashSales || 0))}</span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${financials?.totalGrossSales ? ((financials.cashSales / financials.totalGrossSales) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-muted-foreground">
                    {languageMode === 'basic' ? '💳 Cartão (passado na maquininha)' : '💳 Cartão (Débito/Crédito)'}
                  </span>
                  <span className="text-foreground font-bold">{formatMoney((financials?.cardSales || 0))}</span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${financials?.totalGrossSales ? ((financials.cardSales / financials.totalGrossSales) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-muted-foreground">
                    {languageMode === 'basic' ? '📋 Caderneta / Fiado (pra receber depois)' : '📋 Fiado (A Receber)'}
                  </span>
                  <span className="text-foreground font-bold">{formatMoney((financials?.fiadoSales || 0))}</span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all"
                    style={{ width: `${financials?.totalGrossSales ? ((financials.fiadoSales / financials.totalGrossSales) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
</div>

      <section aria-label="Precificação por produto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">Precificação por {entityName()} & Margem</h2>
            <p className="text-xs text-muted-foreground">Margem sobre o preço de venda: (preço − custo) ÷ preço. Clique numa sugestão para aplicar.</p>
          </div>
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">{products.length} {entityName(true).toLowerCase()} cadastrados</span>
        </div>
        {sortByName(products).map(product => (
          <ProductPricingCard key={product.id} product={product} isSaving={savingPriceIds.has(product.id!)} onUpdatePrice={handleUpdatePrice} />
        ))}
        {products.length === 0 && <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Nenhum produto cadastrado para precificar.</p>}
      </section>
    </div>
  );
}

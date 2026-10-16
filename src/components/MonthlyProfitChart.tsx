import { useCurrency } from '../lib/useCurrency';
import { saleFee } from '../lib/paymentFees';
import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Line,
  ComposedChart,
  Cell
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingBag, 
  ShoppingCart, 
  Sparkles, 
  Calendar, 
  ChevronDown, 
  ArrowUpRight, 
  ArrowDownRight,
  Info,
  Layers,
  BarChart2,
  RefreshCw
} from 'lucide-react';
import { Sale, Purchase } from '../types';
import { getSalesByDateRange, getPurchasesByDateRange } from '../lib/api';
import { usePreferences } from '../lib/preferencesContext';

export interface MonthlyProfitData {
  monthKey: string;
  monthName: string;
  shortLabel: string;
  sales: number;
  purchases: number;
  profit: number;
  salesCount: number;
  purchasesCount: number;
}

export function MonthlyProfitChart() {
  const { formatMoney, currencySymbol } = useCurrency();

  const { v, languageMode, isBasicMode, simpleViewMode } = usePreferences();
  const [loading, setLoading] = useState(true);
  const [periodMonths, setPeriodMonths] = useState<6 | 12>(6);
  const [chartView, setChartView] = useState<'profitOnly' | 'comparison'>('profitOnly');
  const [monthlyData, setMonthlyData] = useState<MonthlyProfitData[]>([]);
  // No modo simples/descomplicado, permite recolher/expandir mantendo o objetivo de interface limpa
  const [isExpanded, setIsExpanded] = useState<boolean>(!simpleViewMode);
  useEffect(() => { setIsExpanded(!simpleViewMode); }, [simpleViewMode]);

  const loadProfitData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      // Período: do 1º dia de (now - (periodMonths - 1)) até o final do mês atual
      const startDate = startOfMonth(subMonths(now, periodMonths - 1));
      const endDate = endOfMonth(now);

      const startTs = startDate.getTime();
      const endTs = endDate.getTime();

      // Busca vendas e compras do período completo em paralelo
      const [sales, purchases] = await Promise.all([
        getSalesByDateRange(startTs, endTs),
        getPurchasesByDateRange(startTs, endTs)
      ]);

      // Monta os meses do período em ordem cronológica
      const monthsList: MonthlyProfitData[] = [];
      for (let i = periodMonths - 1; i >= 0; i--) {
        const mDate = subMonths(now, i);
        const mStart = startOfMonth(mDate).getTime();
        const mEnd = endOfMonth(mDate).getTime();
        const monthKey = format(mDate, 'yyyy-MM');
        
        // Nome amigável do mês
        const rawMonth = format(mDate, 'MMMM', { locale: ptBR });
        const monthName = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
        const shortLabel = format(mDate, 'MMM/yy', { locale: ptBR });

        // Vendas no mês
        const mSales = sales.filter(s => s.createdAt >= mStart && s.createdAt <= mEnd);
        const salesTotal = mSales.reduce((acc, s) => acc + (s.total || 0), 0);

        // Compras de mercadorias no mês
        const mPurchases = purchases.filter(p => p.createdAt >= mStart && p.createdAt <= mEnd);
        const purchasesTotal = mPurchases.reduce((acc, p) => acc + (p.totalCost || 0), 0);

        // Diferença = Vendas - Compras (Diferença entre vendas e compras Real das Mercadorias)
        const profit = salesTotal - purchasesTotal - mSales.reduce((sum,sale) => sum + saleFee(sale), 0);

        monthsList.push({
          monthKey,
          monthName,
          shortLabel,
          sales: Number(salesTotal.toFixed(2)),
          purchases: Number(purchasesTotal.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          salesCount: mSales.length,
          purchasesCount: mPurchases.length
        });
      }

      setMonthlyData(monthsList);
    } catch (err) {
      console.warn('Erro ao carregar dados de lucro mensal:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfitData();
  }, [periodMonths]);

  // Cálculos consolidados para os cards de destaque
  const stats = useMemo(() => {
    if (monthlyData.length === 0) {
      return {
        totalSales: 0,
        totalPurchases: 0,
        totalProfit: 0,
        bestMonth: null as MonthlyProfitData | null,
        averageProfit: 0,
        positiveMonthsCount: 0
      };
    }

    const totalSales = monthlyData.reduce((acc, m) => acc + m.sales, 0);
    const totalPurchases = monthlyData.reduce((acc, m) => acc + m.purchases, 0);
    const totalProfit = monthlyData.reduce((sum,month) => sum + month.profit, 0);
    const averageProfit = totalProfit / monthlyData.length;
    const positiveMonthsCount = monthlyData.filter(m => m.profit > 0).length;

    // Encontra o melhor mês em lucro
    let bestMonth = monthlyData[0];
    monthlyData.forEach(m => {
      if (m.profit > bestMonth.profit) {
        bestMonth = m;
      }
    });

    return {
      totalSales,
      totalPurchases,
      totalProfit,
      bestMonth: bestMonth && (bestMonth.sales > 0 || bestMonth.purchases > 0) ? bestMonth : null,
      averageProfit,
      positiveMonthsCount
    };
  }, [monthlyData]);

  const hasAnyData = monthlyData.some(m => m.sales > 0 || m.purchases > 0);

  // Formatação na moeda da loja.
  const formatCurrency = formatMoney;

  // Custom Tooltip com vocabulário simples e amigável
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data: MonthlyProfitData = payload[0]?.payload;
    if (!data) return null;

    const isProfitPositive = data.profit >= 0;

    return (
      <div className="bg-popover/95 backdrop-blur-xs border border-border p-3 rounded-xl shadow-xl text-xs space-y-2 min-w-[200px]">
        <div className="border-b border-border pb-1.5 flex items-center justify-between">
          <span className="font-bold text-foreground text-sm flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            {data.monthName}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {data.shortLabel}
          </span>
        </div>

        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between gap-3 text-emerald-600 dark:text-emerald-400">
            <span className="flex items-center gap-1 font-medium">
              <ShoppingCart className="w-3 h-3" />
              {languageMode === 'basic' ? 'Vendeu no mês:' : 'Total de Vendas:'}
            </span>
            <span className="font-bold font-mono">{formatCurrency(data.sales)}</span>
          </div>

          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400">
            <span className="flex items-center gap-1 font-medium">
              <ShoppingBag className="w-3 h-3" />
              {languageMode === 'basic' ? 'Comprou de mercadoria:' : 'Custos com Compras:'}
            </span>
            <span className="font-bold font-mono">{formatCurrency(data.purchases)}</span>
          </div>

          <div className="border-t border-border pt-1.5 flex items-center justify-between gap-3">
            <span className="font-bold text-foreground flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              {languageMode === 'basic' ? 'Vendas menos compras:' : 'Diferença no mês:'}
            </span>
            <span className={`font-black font-mono text-sm ${isProfitPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {isProfitPositive ? '+' : ''}{formatCurrency(data.profit)}
            </span>
          </div>
        </div>

        {languageMode === 'basic' && (
          <div className="text-[10px] text-muted-foreground bg-muted/50 p-1.5 rounded-lg border border-border/50">
            {isProfitPositive ? (
              <span>O total vendido inclui fiado. Essa diferença não é o lucro nem o saldo do caixa.</span>
            ) : (
              <span>📦 Neste mês você investiu mais na compra de mercadorias para vender depois.</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
      {/* CABEÇALHO DO COMPONENTE: CLARO, OBJETIVO E MINIMIZÁVEL NO MODO BÁSICO */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 text-left cursor-pointer select-none group flex-1"
          aria-expanded={isExpanded}
        >
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 group-hover:scale-105 transition-transform">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base md:text-lg text-foreground">
                {languageMode === 'basic'
                  ? 'Vendas e compras por mês'
                  : 'Comparativo Mensal de Vendas e Aquisições'}
              </h3>
              {languageMode === 'basic' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center gap-1 border border-emerald-200 dark:border-emerald-800/50">
                  <Sparkles className="w-3 h-3" /> Descomplicado
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {languageMode === 'basic'
                ? 'Calcula de forma automática: Vendas menos o que você gastou comprando mercadorias.'
                : 'Acompanhamento do resultado operacional apurado através da diferença entre faturamento e custos de compra.'}
            </p>
          </div>
        </button>

        {/* CONTROLES RÁPIDOS NO CABEÇALHO */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
          {/* Seletor de período: 6 meses vs 12 meses */}
          <div className="flex items-center bg-muted/70 p-1 rounded-xl border border-border text-xs">
            <button
              type="button"
              onClick={() => setPeriodMonths(6)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                periodMonths === 6
                  ? 'bg-surface text-primary shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              6 meses
            </button>
            <button
              type="button"
              onClick={() => setPeriodMonths(12)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                periodMonths === 12
                  ? 'bg-surface text-primary shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              1 ano
            </button>
          </div>

          <button
            type="button"
            onClick={loadProfitData}
            disabled={loading}
            className="p-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            title="Atualizar dados do gráfico"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>

          {/* Botão de Minimizar / Expandir */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-primary transition-colors cursor-pointer"
          >
            <span>{isExpanded ? 'Minimizar' : 'Ver Gráfico'}</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* CONTEÚDO EXPANSÍVEL */}
      {isExpanded && (
        <div className="p-4 sm:p-6 pt-0 border-t border-border space-y-5">
          {/* 3 CARDS DE DESTAQUE COM TRADUÇÃO SIMPLES */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
            {/* Card 1: Total que sobrou no período */}
            <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col justify-between shadow-2xs">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {languageMode === 'basic' ? 'Vendas menos compras no período' : 'Resultado Acumulado'}
              </span>
              <div className="my-1.5">
                <span className={`text-xl sm:text-2xl font-black ${stats.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {stats.totalProfit >= 0 ? '+' : ''}{formatCurrency(stats.totalProfit)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {languageMode === 'basic'
                  ? `Soma dos últimos ${periodMonths} meses`
                  : `Diferença de vendas e compras no período de ${periodMonths} meses`}
              </p>
            </div>

            {/* Card 2: Melhor mês */}
            <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col justify-between shadow-2xs">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {languageMode === 'basic' ? 'Mês mais lucrativo' : 'Melhor Desempenho'}
              </span>
              <div className="my-1.5">
                {stats.bestMonth ? (
                  <div>
                    <span className="text-lg sm:text-xl font-black text-foreground">
                      {stats.bestMonth.monthName}
                    </span>
                    <span className="ml-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(stats.bestMonth.profit)}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">Aguardando dados</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {stats.bestMonth && stats.bestMonth.sales > 0
                  ? `Vendeu ${formatCurrency(stats.bestMonth.sales)} no mês`
                  : 'Registre vendas e compras'}
              </p>
            </div>

            {/* Card 3: Média mensal */}
            <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col justify-between shadow-2xs">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {languageMode === 'basic' ? 'Média que sobra por mês' : 'Média Mensal'}
              </span>
              <div className="my-1.5">
                <span className={`text-xl sm:text-2xl font-black ${stats.averageProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {stats.averageProfit >= 0 ? '+' : ''}{formatCurrency(stats.averageProfit)}
                </span>
                <span className="text-xs font-medium text-muted-foreground ml-1">/mês</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {languageMode === 'basic'
                  ? `${stats.positiveMonthsCount} de ${periodMonths} meses no positivo`
                  : `${stats.positiveMonthsCount} meses com vendas maiores que compras`}
              </p>
            </div>
          </div>

          {/* DICA DE LINGUAGEM SIMPLES: "COMO É FEITA A CONTA" */}
          <div className="bg-muted/30 border border-border/80 p-3 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <span>
                {languageMode === 'basic' ? (
                  <>
                    <strong>Conta simples:</strong> [Total vendido] − [Compras registradas] − [Taxas da maquininha] = <strong className="text-foreground">Diferença entre vendas e compras</strong>.
                  </>
                ) : (
                  <>
                    <strong>Fórmula do indicador:</strong> Faturamento Bruto Mensal deduzido do Custo Total de Mercadorias Adquiridas.
                  </>
                )}
              </span>
            </div>

            {/* Botão de alternar o tipo de visualização do gráfico */}
            <div className="flex items-center gap-1.5 bg-surface border border-border p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setChartView('profitOnly')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  chartView === 'profitOnly'
                    ? 'bg-palette-1 text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                <span>{languageMode === 'basic' ? 'Só a diferença' : 'Diferença de vendas e compras'}</span>
              </button>

              <button
                type="button"
                onClick={() => setChartView('comparison')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  chartView === 'comparison'
                    ? 'bg-palette-1 text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>{languageMode === 'basic' ? 'Comparar Tudo' : 'Entrou vs Saiu vs Sobra'}</span>
              </button>
            </div>
          </div>

          {/* ÁREA DO GRÁFICO RECHARTS */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-medium">Carregando vendas e compras por mês...</span>
            </div>
          ) : !hasAnyData ? (
            <div className="py-12 px-4 text-center border-2 border-dashed border-border rounded-xl bg-muted/20">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
                <BarChart2 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-foreground">
                {languageMode === 'basic' ? 'Ainda não há vendas ou compras registradas' : 'Sem movimentações no período selecionado'}
              </h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                {languageMode === 'basic'
                  ? 'Assim que você registrar vendas no Caixa e anotar compras de reposição, as barras de vendas e compras vão aparecer aqui automaticamente!'
                  : 'Ao registrar vendas e compras de reposição de estoque, o gráfico comparativo de rentabilidade será atualizado dinamicamente.'}
              </p>
            </div>
          ) : (
            <div className="w-full bg-card rounded-xl border border-border p-4 shadow-2xs">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartView === 'profitOnly' ? (
                    // MODO 1: GRÁFICO FOCO EM SOBRA / LUCRO (EXTREMAMENTE LIMPO E INTUITIVO)
                    <BarChart
                      data={monthlyData}
                      margin={{ top: 15, right: 10, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                      <XAxis
                        dataKey="shortLabel"
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) => formatMoney(Number(val))}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={0} stroke="currentColor" opacity={0.4} strokeWidth={1.5} />
                      <Bar
                        dataKey="profit"
                        name={languageMode === 'basic' ? 'Vendas menos compras e taxas' : 'Vendas menos compras e taxas'}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      >
                        {monthlyData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.profit >= 0 ? '#10B981' : '#F59E0B'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    // MODO 2: COMPARATIVO COMPLETO (VENDAS vs COMPRAS vs SOBRA)
                    <ComposedChart
                      data={monthlyData}
                      margin={{ top: 15, right: 10, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                      <XAxis
                        dataKey="shortLabel"
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) => formatMoney(Number(val))}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={0} stroke="currentColor" opacity={0.3} />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span className="text-xs font-semibold text-foreground px-1">{value}</span>
                        )}
                      />
                      <Bar
                        dataKey="sales"
                        name={languageMode === 'basic' ? '💵 Entrou (Vendas)' : 'Receita em Vendas'}
                        fill="#3B82F6"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="purchases"
                        name={languageMode === 'basic' ? '📦 Saiu (Compras)' : 'Custo de Compras'}
                        fill="#EF4444"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        name={languageMode === 'basic' ? 'Vendas menos compras e taxas' : 'Vendas menos compras e taxas'}
                        stroke="#10B981"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#FFFFFF' }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* LEGENDA E NOTA EXPLICATIVA RÁPIDA ABAIXO DO GRÁFICO */}
              <div className="mt-3 pt-3 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    {languageMode === 'basic' ? 'Verde: vendeu mais do que comprou' : 'Vendas maiores que compras'}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    {languageMode === 'basic' ? 'Âmbar: Comprou mais estoque do que vendeu no mês' : 'Investimento / Saldo Negativo'}
                  </span>
                </div>

                <span className="text-[11px] text-muted-foreground italic">
                  Atualizado em tempo real com vendas e compras
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

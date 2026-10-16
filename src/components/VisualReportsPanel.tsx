import { PaymentSummary } from './PaymentSummary';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, BarChart3, Package, Calendar, ArrowUpRight, DollarSign, Award, ShoppingBag, Sparkles } from 'lucide-react';
import { Sale, SaleItem } from '../types';
import { getSalesByDateRange, getSaleItems } from '../lib/api';

interface DailyRevenueData {
  dateKey: string;
  dayLabel: string;
  formattedDate: string;
  faturamento: number;
  totalVendas: number;
}

interface TopProductData {
  name: string;
  category?: string;
  totalQuantity: number;
  totalRevenue: number;
}

const BAR_COLORS = [
  '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#1D4ED8',
  '#10B981', '#059669', '#34D399', '#6EE7B7', '#047857'
];

export function VisualReportsPanel() {
  const [loading, setLoading] = useState(true);
  const [salesLast7Days, setSalesLast7Days] = useState<Sale[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductData[]>([]);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [metricType, setMetricType] = useState<'revenue' | 'quantity'>('revenue');

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      try {
        const today = new Date();
        const start = startOfDay(subDays(today, 6)).getTime();
        const end = endOfDay(today).getTime();

        const sales = await getSalesByDateRange(start, end);
        if (!isMounted) return;
        setSalesLast7Days(sales);

        // Fetch sale items to extract best sellers
        const itemsPromises = sales.map(async (sale) => {
          if (!sale.id) return [];
          try {
            return await getSaleItems(sale.id);
          } catch {
            return [];
          }
        });

        const itemsBySale = await Promise.all(itemsPromises);
        if (!isMounted) return;

        // Group by product name
        const productStatsMap = new Map<string, { name: string; category?: string; totalQuantity: number; totalRevenue: number }>();

        itemsBySale.flat().forEach((item: SaleItem) => {
          if (!item || !item.name) return;
          const key = item.name.trim();
          const existing = productStatsMap.get(key) || {
            name: key,
            category: item.format,
            totalQuantity: 0,
            totalRevenue: 0
          };
          existing.totalQuantity += item.quantity || 1;
          existing.totalRevenue += (item.price || 0) * (item.quantity || 1);
          productStatsMap.set(key, existing);
        });

        // If items are not fully populated from individual items subcollection (e.g. older sales summary), parse summary
        if (productStatsMap.size === 0) {
          sales.forEach((s) => {
            if (s.itemsSummary) {
              // Parse strings like "2x Coca-Cola (unidade), 1x Marlboro (maço)"
              const parts = s.itemsSummary.split(',');
              parts.forEach(part => {
                const match = part.trim().match(/^(\d+)x\s+(.+?)(?:\s*\((.*?)\))?$/);
                if (match) {
                  const qty = parseInt(match[1], 10) || 1;
                  const name = match[2].trim();
                  const formatName = match[3] || 'unidade';
                  const existing = productStatsMap.get(name) || {
                    name,
                    category: formatName,
                    totalQuantity: 0,
                    totalRevenue: 0
                  };
                  existing.totalQuantity += qty;
                  existing.totalRevenue += (s.total / parts.length);
                  productStatsMap.set(name, existing);
                }
              });
            }
          });
        }

        const sorted = Array.from(productStatsMap.values())
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
          .slice(0, 5);

        setTopProducts(sorted);
      } catch (err) {
        console.warn('Erro ao carregar dados do painel de relatórios:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute 7 days series data (including days with zero sales)
  const dailyData: DailyRevenueData[] = useMemo(() => {
    const today = new Date();
    const result: DailyRevenueData[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = subDays(today, i);
      const dateKey = format(d, 'yyyy-MM-dd');
      const dayLabel = format(d, 'EEE', { locale: ptBR }).replace('.', '').toUpperCase();
      const formattedDate = format(d, 'dd/MM');

      // Filter sales on this day
      const daySales = salesLast7Days.filter((s) => isSameDay(new Date(s.createdAt), d));
      const faturamento = daySales.reduce((acc, curr) => acc + (curr.total || 0), 0);

      result.push({
        dateKey,
        dayLabel,
        formattedDate,
        faturamento: Number(faturamento.toFixed(2)),
        totalVendas: daySales.length
      });
    }

    return result;
  }, [salesLast7Days]);

  const total7DaysRevenue = useMemo(() => {
    return dailyData.reduce((acc, d) => acc + d.faturamento, 0);
  }, [dailyData]);

  const averageDailyRevenue = useMemo(() => {
    return total7DaysRevenue / 7;
  }, [total7DaysRevenue]);

  const bestDay = useMemo(() => {
    if (dailyData.length === 0) return null;
    return [...dailyData].sort((a, b) => b.faturamento - a.faturamento)[0];
  }, [dailyData]);

  const sortedTopProducts = useMemo(() => {
    if (metricType === 'revenue') {
      return [...topProducts].sort((a, b) => b.totalRevenue - a.totalRevenue);
    }
    return [...topProducts].sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [topProducts, metricType]);

  return (
    <div id="visual-reports-panel" className="bg-surface rounded-2xl p-5 md:p-6 shadow-sm border border-border space-y-6">
      <PaymentSummary sales={salesLast7Days} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-palette-1 text-primary border border-primary/20 shadow-2xs">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl font-bold text-foreground">
                Painel Visual de Relatórios
              </h2>
              <span className="text-[10px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Últimos 7 dias
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Acompanhe seu faturamento diário consolidado e conheça os produtos campeões de venda da banca.
            </p>
          </div>
        </div>

        {/* Quick Metrics Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-xl bg-muted/60 border border-border text-xs flex items-center gap-2">
            <span className="text-muted-foreground">Total 7 dias:</span>
            <span className="font-bold text-foreground">R$ {total7DaysRevenue.toFixed(2)}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-muted/60 border border-border text-xs flex items-center gap-2">
            <span className="text-muted-foreground">Média/dia:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">R$ {averageDailyRevenue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium">Carregando métricas visuais...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* GRÁFICO 1: FATURAMENTO DIÁRIO DOS ÚLTIMOS 7 DIAS (Cols 12 or 7) */}
          <div className="lg:col-span-7 bg-card rounded-xl border border-border p-4 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm md:text-base text-foreground flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary" />
                    Faturamento Diário (Últimos 7 dias)
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {bestDay && bestDay.faturamento > 0 ? (
                    <>Melhor dia: <strong className="text-foreground">{bestDay.dayLabel} ({bestDay.formattedDate})</strong> com <strong className="text-emerald-600 dark:text-emerald-400">R$ {bestDay.faturamento.toFixed(2)}</strong></>
                  ) : (
                    'Valores recebidos a cada dia da semana'
                  )}
                </p>
              </div>

              {/* Botões alternadores de visualização (Barras vs Linha) */}
              <div className="flex items-center bg-muted/70 p-1 rounded-lg border border-border/80 text-xs">
                <button
                  type="button"
                  onClick={() => setChartType('bar')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    chartType === 'bar' ? 'bg-surface text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Barras
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('line')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    chartType === 'line' ? 'bg-surface text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Linha
                </button>
              </div>
            </div>

            {/* Container do Recharts */}
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border/60" />
                    <XAxis 
                      dataKey="dayLabel" 
                      tick={{ fontSize: 11, fill: 'currentColor' }} 
                      className="text-muted-foreground"
                      tickLine={false}
                      axisLine={{ stroke: 'currentColor', className: 'text-border' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: 'currentColor' }} 
                      className="text-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `R$${val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as DailyRevenueData;
                          return (
                            <div className="bg-surface border border-border p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                              <p className="font-bold text-foreground">
                                {data.dayLabel} ({data.formattedDate})
                              </p>
                              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>R$ {data.faturamento.toFixed(2)}</span>
                              </div>
                              <p className="text-muted-foreground text-[11px]">
                                {data.totalVendas} {data.totalVendas === 1 ? 'venda registrada' : 'vendas registradas'}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="faturamento" radius={[6, 6, 0, 0]}>
                      {dailyData.map((entry, index) => {
                        const isToday = index === dailyData.length - 1;
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={isToday ? '#2563EB' : '#3B82F6'} 
                            fillOpacity={entry.faturamento === 0 ? 0.3 : 0.9}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                ) : (
                  <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border/60" />
                    <XAxis 
                      dataKey="dayLabel" 
                      tick={{ fontSize: 11, fill: 'currentColor' }} 
                      className="text-muted-foreground"
                      tickLine={false}
                      axisLine={{ stroke: 'currentColor', className: 'text-border' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: 'currentColor' }} 
                      className="text-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `R$${val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as DailyRevenueData;
                          return (
                            <div className="bg-surface border border-border p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                              <p className="font-bold text-foreground">
                                {data.dayLabel} ({data.formattedDate})
                              </p>
                              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>R$ {data.faturamento.toFixed(2)}</span>
                              </div>
                              <p className="text-muted-foreground text-[11px]">
                                {data.totalVendas} {data.totalVendas === 1 ? 'venda registrada' : 'vendas registradas'}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="faturamento" 
                      stroke="#2563EB" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#2563EB', strokeWidth: 2, stroke: '#FFFFFF' }}
                      activeDot={{ r: 6, fill: '#1D4ED8' }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Rodapé explicativo do gráfico */}
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                Hoje: <strong>{dailyData[dailyData.length - 1]?.dayLabel} (R$ {dailyData[dailyData.length - 1]?.faturamento.toFixed(2)})</strong>
              </span>
              <span>Total de transações: <strong>{salesLast7Days.length}</strong></span>
            </div>
          </div>

          {/* GRÁFICO 2: PRODUTOS MAIS VENDIDOS (TOP 5) (Cols 12 or 5) */}
          <div className="lg:col-span-5 bg-card rounded-xl border border-border p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <h3 className="font-bold text-sm md:text-base text-foreground">
                    Produtos Mais Vendidos
                  </h3>
                </div>

                {/* Filtro: Por Faturamento vs Por Quantidade */}
                <div className="flex items-center bg-muted/70 p-1 rounded-lg border border-border/80 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setMetricType('revenue')}
                    className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                      metricType === 'revenue' ? 'bg-surface text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    R$ Valor
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricType('quantity')}
                    className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                      metricType === 'quantity' ? 'bg-surface text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Unidades
                  </button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-3">
                {metricType === 'revenue' 
                  ? 'Itens que mais trouxeram receita para o seu caixa na semana.' 
                  : 'Itens com maior volume de saída física na semana.'}
              </p>

              {sortedTopProducts.length === 0 ? (
                <div className="h-52 flex flex-col items-center justify-center text-center p-4 rounded-lg bg-muted/30 border border-dashed border-border text-muted-foreground">
                  <Package className="w-8 h-8 opacity-40 mb-1" />
                  <p className="text-xs font-semibold">Nenhuma venda detalhada registrada</p>
                  <p className="text-[11px] mt-0.5">As vendas feitas no Caixa aparecerão aqui automaticamente.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Gráfico Horizontal com Barras de Progresso e Recharts */}
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={sortedTopProducts} 
                        layout="vertical" 
                        margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                      >
                        <XAxis 
                          type="number" 
                          tick={{ fontSize: 10, fill: 'currentColor' }} 
                          className="text-muted-foreground"
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(val) => metricType === 'revenue' ? `R$${val}` : `${val}un`}
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={85}
                          tick={{ fontSize: 11, fill: 'currentColor' }} 
                          className="text-foreground font-medium"
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(name) => name.length > 11 ? `${name.slice(0, 10)}…` : name}
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const p = payload[0].payload as TopProductData;
                              return (
                                <div className="bg-surface border border-border p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                                  <p className="font-bold text-foreground notranslate normal-case" translate="no">{p.name}</p>
                                  <div className="text-primary font-semibold">
                                    Total vendido: {p.totalQuantity} unidades
                                  </div>
                                  <div className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    Faturamento: R$ {p.totalRevenue.toFixed(2)}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar 
                          dataKey={metricType === 'revenue' ? 'totalRevenue' : 'totalQuantity'} 
                          radius={[0, 4, 4, 0]}
                        >
                          {sortedTopProducts.map((_, idx) => (
                            <Cell key={`top-${idx}`} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Lista com o detalhamento dos 5 produtos */}
                  <div className="space-y-1.5 pt-1">
                    {sortedTopProducts.map((prod, idx) => (
                      <div 
                        key={prod.name} 
                        className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 overflow-hidden mr-2">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 ${
                            idx === 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                            idx === 1 ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200' :
                            idx === 2 ? 'bg-amber-800/10 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {idx + 1}º
                          </span>
                          <span className="font-medium text-foreground truncate notranslate normal-case" title={prod.name} translate="no">
                            {prod.name}
                          </span>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                          <span className="text-muted-foreground text-[11px]">{prod.totalQuantity} un.</span>
                          <span className="font-bold text-foreground">R$ {prod.totalRevenue.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                Baseado nas vendas dos últimos 7 dias
              </span>
              <span className="font-medium text-primary hover:underline cursor-pointer">
                Top 5 itens
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

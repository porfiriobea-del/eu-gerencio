import { saleFee, paymentLabel } from '../lib/paymentFees';
import { PaymentSummary } from '../components/PaymentSummary';
import { formatProductStock } from '../lib/productUnits';
import { getReorderPoint } from '../lib/stockSuggestions';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { subscribeProducts, subscribeTodaySales, subscribeCustomers, subscribeSettings, getSaleItems, getPurchasesByDateRange } from '../lib/api';
import { Product, Sale, Customer, Settings, SaleItem } from '../types';
import { Package, TrendingUp, AlertTriangle, Users, Eye, X, ShoppingBag, ShoppingCart, PlusCircle, ArrowDownLeft, ArrowUpRight, Wallet, Sparkles, Compass, FileSpreadsheet, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { usePreferences } from '../lib/preferencesContext';
import { PocketTip } from '../components/PocketTip';
import { GuidedTour } from '../components/GuidedTour';
import { ExportPeriodModal } from '../components/ExportPeriodModal';
import { VisualReportsPanel } from '../components/VisualReportsPanel';
import { MonthlyProfitChart } from '../components/MonthlyProfitChart';

export default function Dashboard() {
  const { v, entityName, languageMode, isBasicMode, simpleViewMode } = usePreferences();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [todayPurchasesSpent, setTodayPurchasesSpent] = useState<number>(0);
  const [todayPurchasesCount, setTodayPurchasesCount] = useState<number>(0);
  const [isExportPeriodModalOpen, setIsExportPeriodModalOpen] = useState(false);
  const [isVisualReportsOpen, setIsVisualReportsOpen] = useState(!simpleViewMode);
  const [isSalesDetailedTableOpen, setIsSalesDetailedTableOpen] = useState(!simpleViewMode);
  useEffect(() => {
    setIsVisualReportsOpen(!simpleViewMode);
    setIsSalesDetailedTableOpen(!simpleViewMode);
  }, [simpleViewMode]);

  // Tour guiado interativo
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [showWelcomeTourBanner, setShowWelcomeTourBanner] = useState(() => {
    try {
      return !localStorage.getItem('eu_gerencio_guided_tour_completed');
    } catch {
      return false;
    }
  });

  // Modal para detalhar os itens da venda
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    // Sugere o tour guiado para novos usuários após breve renderização inicial
    try {
      const completed = localStorage.getItem('eu_gerencio_guided_tour_completed');
      if (!completed) {
        const timer = setTimeout(() => {
          setIsTourOpen(true);
        }, 1200);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const unsubProducts = subscribeProducts(setProducts);
    const unsubSales = subscribeTodaySales(setSales);
    const unsubCustomers = subscribeCustomers(setCustomers);
    const unsubSettings = subscribeSettings(setSettings);

    const fetchTodayPurchases = async () => {
      try {
        const start = startOfDay(new Date()).getTime();
        const end = endOfDay(new Date()).getTime();
        const purchases = await getPurchasesByDateRange(start, end);
        const spent = purchases.reduce((acc, p) => acc + (p.totalCost || 0), 0);
        setTodayPurchasesSpent(spent);
        setTodayPurchasesCount(purchases.length);
      } catch (err) {
        console.warn('Erro ao carregar compras de hoje:', err);
      }
    };
    fetchTodayPurchases();

    return () => {
      unsubProducts();
      unsubSales();
      unsubCustomers();
      unsubSettings();
    };
  }, []);

  const handleOpenSaleDetails = async (sale: Sale) => {
    setSelectedSale(sale);
    setLoadingItems(true);
    setSaleItems([]);
    if (sale.id) {
      const items = await getSaleItems(sale.id);
      setSaleItems(items);
    }
    setLoadingItems(false);
  };

  const totalSales = sales.reduce((sum, sale) => sum + sale.total, 0);
  const feesPaid = sales.reduce((sum,sale) => sum + saleFee(sale), 0);
  const totalDebt = customers.reduce((sum, c) => sum + c.totalDebt, 0);
  const goal = settings?.dailyGoal || 500;
  
  const toReplenish = products.filter(p => p.stock <= getReorderPoint(p));

  return (
    <div className="space-y-6">
      <div id="dashboard-header" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Início - Resumo do Dia</h1>
          <span className="text-xs text-muted-foreground">
            {format(new Date(), "dd 'de' MMMM 'de' yyyy")}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">

          <button
            type="button"
            onClick={() => setIsTourOpen(true)}
            id="btn-start-guided-tour"
            className="px-3.5 py-1.5 rounded-xl bg-palette-1 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Conheça os principais botões do aplicativo com o tour guiado interativo"
          >
            <Compass className="w-4 h-4" />
            <span>Tour Guiado</span>
          </button>
        </div>
      </div>

      {/* CARD DE 'RESUMO DO DIA' / PAINEL FINANCEIRO SIMPLIFICADO */}
      <div id="dashboard-summary-card" className="bg-surface rounded-2xl p-5 md:p-6 shadow-sm border border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-bold text-foreground">
                  {languageMode === 'basic' ? 'Resumo do Dia' : v('reports.summary', 'Demonstrativo Operacional do Dia')}
                </h2>
                {languageMode === 'basic' && (
                  <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700/50 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Descomplicado
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {languageMode === 'basic' 
                  ? 'Veja de forma direta quanto dinheiro entrou, quanto saiu e o que sobrou no seu bolso hoje.'
                  : `Movimentações registradas em ${format(new Date(), "dd/MM/yyyy")}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsExportPeriodModalOpen(true)}
              className="text-xs font-bold text-primary hover:text-primary/90 bg-palette-1 px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Exportar relatório do comércio por período personalizado"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exportar por Período</span>
            </button>
            <Link
              to="/configuracoes"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              {languageMode === 'basic' ? 'Mais Detalhes' : 'Relatórios Detalhados'}
            </Link>
          </div>
        </div>

        {/* 4 CARDS COM TRADUÇÃO DESCOMPLICADA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Card 1: Dinheiro que entrou */}
          <div className="bg-card border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                  {v('reports.inflow')}
                </span>
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-foreground">
                R$ {totalSales.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total vendido hoje, incluindo fiado
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs font-medium text-muted-foreground flex justify-between items-center mb-1.5">
                <span>Meta do dia (R$ {goal.toFixed(0)})</span>
                <span className={totalSales >= goal ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}>
                  {totalSales >= goal ? '100% batida! 🎉' : `${Math.round((totalSales / goal) * 100)}%`}
                </span>
              </div>
              <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${totalSales >= goal ? 'bg-emerald-500' : 'bg-primary'}`} 
                  style={{ width: `${Math.min(100, (totalSales / goal) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Dinheiro que saiu */}
          <div className="bg-card border border-rose-200 dark:border-rose-900/40 rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                  {v('reports.outflow')}
                </span>
                <div className="p-1.5 rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-foreground">
                R$ {todayPurchasesSpent.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {languageMode === 'basic' ? 'O que você pagou em mercadorias' : 'Compras e reposições de estoque'}
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{todayPurchasesCount} {todayPurchasesCount === 1 ? 'reposição feita' : 'reposições feitas'}</span>
              <Link to="/compras" className="font-semibold text-primary hover:underline flex items-center gap-1">
                <PlusCircle className="w-3.5 h-3.5" /> Anotar
              </Link>
            </div>
          </div>

          {/* Card 3: O que sobrou hoje */}
          <div className={`bg-card border ${totalSales - todayPurchasesSpent - feesPaid >= 0 ? 'border-emerald-200 dark:border-emerald-900/40' : 'border-amber-200 dark:border-amber-900/40'} rounded-xl p-4 flex flex-col justify-between shadow-xs`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wide ${totalSales - todayPurchasesSpent - feesPaid >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {v('reports.balance')}
                </span>
                <div className={`p-1.5 rounded-lg ${totalSales - todayPurchasesSpent - feesPaid >= 0 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'}`}>
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className={`text-2xl font-black ${totalSales - todayPurchasesSpent - feesPaid >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                R$ {(totalSales - todayPurchasesSpent - feesPaid).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Diferença entre o total vendido e as compras registradas.
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Conta rápida:</span>
              <strong className="text-foreground">Vendas − Compras</strong>
            </div>
          </div>

          {/* Card 4: Vendido pra receber depois */}
          <div className="bg-card border border-purple-200 dark:border-purple-900/40 rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                  {languageMode === 'basic' ? 'Vendido pra receber depois' : v('reports.pending', 'Crédito Rotativo (Fiado)')}
                </span>
                <div className="p-1.5 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-foreground">
                R$ {totalDebt.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {languageMode === 'basic' ? 'Compras anotadas na caderneta' : 'Total acumulado a prazo'}
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{customers.filter(c => c.totalDebt > 0).length} clientes devendo</span>
              <Link to="/fiado" className="font-semibold text-primary hover:underline">
                Caderneta →
              </Link>
            </div>
          </div>
        </div>

        {/* EXPLICAÇÃO CLARA E DIRETA ("EM POUCAS PALAVRAS") */}
        <div className="bg-muted/40 border border-border p-3.5 rounded-xl flex items-center gap-3 text-xs md:text-sm">
          <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="text-foreground leading-relaxed">
            {v('reports.note')}
          </p>
        </div>
      </div>

      {/* GRÁFICO DE LUCRO MENSAL (VENDAS − CUSTOS DE COMPRA) */}
      <PaymentSummary sales={sales} />
      <div id="dashboard-monthly-profit">
        <MonthlyProfitChart />
      </div>

      {/* PAINEL DE RELATÓRIOS VISUAIS: MINIMIZADO NO MODO BÁSICO, EXPANSÍVEL SOB DEMANDA */}
      <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setIsVisualReportsOpen(!isVisualReportsOpen)}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-muted/40 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-palette-1 text-primary shrink-0 border border-primary/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-foreground">
                  Gráficos de Faturamento & Produtos Mais Vendidos
                </h3>
                {languageMode === 'basic' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                    Opcional / Minimizado
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isVisualReportsOpen 
                  ? 'Visualizando comparativo dos últimos 7 dias e curva de vendas por produto.' 
                  : 'Toque para expandir os gráficos da semana e ver detalhes analíticos de faturamento.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-primary shrink-0">
            <span className="hidden sm:inline">{isVisualReportsOpen ? 'Minimizar Gráficos' : 'Ver Gráficos Detalhados'}</span>
            <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isVisualReportsOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isVisualReportsOpen && (
          <div className="p-4 sm:p-6 pt-0 border-t border-border">
            <VisualReportsPanel />
          </div>
        )}
      </div>

      {/* Alerta de Reposição de Estoque */}
      <div className="bg-surface p-6 rounded-xl shadow-sm border border-border flex flex-col">
         <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-foreground font-bold">{v('stock.reorderWarning', 'Atenção: Repor Estoque')}</h3>
              <Link
                to="/compras"
                className="text-xs font-semibold text-primary hover:underline bg-palette-1 px-2.5 py-0.5 rounded-full"
              >
                Abrir {v('purchases.title', 'Compras')} →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {languageMode === 'basic' 
                ? 'Produtos que estão acabando na prateleira e precisam de pedido para o fornecedor.'
                : `Calculado para atingir o ${v('stock.max', 'Estoque Máximo')}`}
            </p>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 dark:bg-amber-900/30 rounded-lg"><AlertTriangle className="w-5 h-5"/></div>
        </div>
        <div className="overflow-y-auto max-h-[160px]">
          {toReplenish.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">Nenhum {entityName().toLowerCase()} precisando de reposição no momento.</p>
          ) : (
            <ul className="space-y-2">
              {toReplenish.slice(0, 5).map(p => {
                const maxStockVal = p.maxStock || Math.max(p.stock, p.safetyStock * 2, 10);
                const suggestedBuy = Math.max(0, maxStockVal - p.stock);
                return (
                  <li key={p.id} className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                    <div>
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({formatProductStock(p)} atuais / máx: {maxStockVal})</span>
                    </div>
                    <span className="text-red-500 font-semibold bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded text-xs">
                      {languageMode === 'basic' ? `Comprar +${suggestedBuy} un.` : `Comprar +${suggestedBuy} un.`}
                    </span>
                  </li>
                );
              })}
              {toReplenish.length > 5 && (
                <li className="text-sm text-primary font-medium">e mais {toReplenish.length - 5} {entityName(true).toLowerCase()} precisando de compra...</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-foreground">Vendas Recentes de Hoje</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Mostrando os produtos vendidos em cada transação</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-palette-1 text-primary rounded-full">
            {sales.length} {sales.length === 1 ? 'venda hoje' : 'vendas hoje'}
          </span>
        </div>

        {sales.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">Nenhuma venda registrada hoje.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-muted-foreground font-medium w-20">Hora</th>
                  <th className="p-3 text-muted-foreground font-medium">Itens Vendidos</th>
                  <th className="p-3 text-muted-foreground font-medium w-28">Pagamento</th>
                  <th className="p-3 text-muted-foreground font-medium text-right w-28">Valor Total</th>
                  <th className="p-3 text-muted-foreground font-medium text-center w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sales.sort((a,b) => b.createdAt - a.createdAt).slice(0, 15).map(sale => {
                  const customer = sale.customerId ? customers.find(c => c.id === sale.customerId) : null;
                  return (
                    <tr key={sale.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-muted-foreground font-medium">
                        {format(new Date(sale.createdAt), 'HH:mm')}
                      </td>
                      <td className="p-3">
                        {sale.itemsSummary ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-foreground text-sm leading-snug">
                              {sale.itemsSummary}
                            </span>
                            {customer && (
                              <span className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded font-medium">
                                Fiado: {customer.name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground italic">
                              Venda registrada
                            </span>
                            {customer && (
                              <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded font-medium">
                                Fiado: {customer.name}
                              </span>
                            )}
                            <button
                              onClick={() => handleOpenSaleDetails(sale)}
                              className="text-xs text-primary hover:underline font-medium cursor-pointer"
                            >
                              Ver produtos
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          sale.type === 'cash' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' :
                          sale.type === 'card' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' :
                          'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400'
                        }`}>
                          {paymentLabel(sale)}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-foreground">
                        R$ {sale.total.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleOpenSaleDetails(sale)}
                          title="Visualizar itens e detalhes da venda"
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-palette-1 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 text-xs font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden sm:inline">Ver Itens</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Banner de Boas-Vindas ao Tour para novos usuários */}
      {showWelcomeTourBanner && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-palette-1 via-palette-1/60 to-surface border-2 border-primary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-sm">
              <Compass className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-foreground">
                  Primeiros passos no Eu Gerencio!
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  Tour de 1 minuto
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Faça o tour guiado interativo para conhecer os principais botões de navegação (Caixa, Estoque, Compras e Fiado).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowWelcomeTourBanner(false);
                try { localStorage.setItem('eu_gerencio_guided_tour_completed', 'true'); } catch {}
              }}
              className="text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={() => {
                setShowWelcomeTourBanner(false);
                setIsTourOpen(true);
              }}
              className="px-4 py-1.5 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Iniciar Tour Guiado</span>
            </button>
          </div>
        </div>
      )}

      {/* Dicas de Bolso: O Dia a Dia em 2 Passos */}
      <div id="dashboard-pocket-tip">
        <PocketTip
          id="dashboard-guide"
          badgeText="Dicas de Bolso"
          title="O Dia a Dia do Comércio em 2 Passos"
          subtitle="Aprenda rapidinho a registrar vendas ou anotar compras sem complicação."
          helpfulNote="Dica: o sistema calcula tudo no final do dia para você saber exatamente quanto sobrou no bolso!"
          sections={[
            {
              id: 'registrar-venda',
              badge: 'Vender para o cliente',
              title: 'Como registrar uma nova venda',
              subtitle: 'Toda vez que um cliente comprar algo na sua loja, faça assim:',
              step1: {
                label: '1. Abra o Caixa (Vender)',
                description: 'Clique no botão "Ir para o Caixa" abaixo ou no menu lateral. A lista de produtos vai aparecer na tela.'
              },
              step2: {
                label: '2. Toque no item e finalize',
                description: 'Clique no produto que o cliente escolheu e depois aperte o botão verde "Finalizar Venda". Escolha se foi dinheiro, cartão ou fiado!'
              },
              actionButton: {
                label: 'Ir para o Caixa (Vender Agora)',
                to: '/caixa',
                icon: <ShoppingCart className="w-4 h-4" />
              }
            },
            {
              id: 'entrada-estoque',
              badge: 'Chegou mercadoria',
              title: 'Como anotar mercadorias que chegaram (Compras)',
              subtitle: 'Sempre que você comprar produtos do fornecedor para reabastecer a loja:',
              step1: {
                label: '1. Abra a aba de Compras',
                description: 'Clique em "Anotar Compra / Reposição" abaixo. Você verá o histórico e o botão para nova compra.'
              },
              step2: {
                label: '2. Escolha o item e quantos chegaram',
                description: 'Selecione o produto, coloque a quantidade e o preço pago. O sistema já soma no estoque na hora sozinho!'
              },
              actionButton: {
                label: 'Anotar Compra / Reposição',
                to: '/compras',
                icon: <PlusCircle className="w-4 h-4" />
              }
            }
          ]}
        />
      </div>

      {/* Modal de Detalhes dos Itens da Venda */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-surface rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-palette-1 text-primary rounded-lg">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Detalhes da Venda</h3>
                  <p className="text-xs text-muted-foreground">
                    Registrada às {format(new Date(selectedSale.createdAt), 'HH:mm - dd/MM/yyyy')}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedSale(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informações da Venda */}
            <div className="grid grid-cols-2 gap-3 mb-4 bg-muted/40 p-3 rounded-xl text-xs">
              <div>
                <span className="text-muted-foreground block">Forma de Pagamento:</span>
                <span className="font-bold capitalize text-foreground">
                  {selectedSale.type === 'cash' ? '💵 Dinheiro' : selectedSale.type === 'card' ? '💳 Cartão' : '📝 Fiado'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Valor Total:</span>
                <span className="font-bold text-primary text-base">R$ {selectedSale.total.toFixed(2)}</span>
              </div>
              {selectedSale.customerId && (
                <div className="col-span-2 border-t border-border/50 pt-2">
                  <span className="text-muted-foreground block">Cliente (Fiado):</span>
                  <span className="font-bold text-orange-600 dark:text-orange-400">
                    {customers.find(c => c.id === selectedSale.customerId)?.name || 'Cliente'}
                  </span>
                </div>
              )}
            </div>

            {/* Lista dos Itens */}
            <div className="space-y-2 mb-6">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Produtos Vendidos:</h4>
              
              {loadingItems ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Carregando itens...</div>
              ) : saleItems.length > 0 ? (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {saleItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2.5 bg-surface border border-border rounded-xl text-sm">
                      <div>
                        <div className="font-medium text-foreground">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.format} • {item.quantity} un. x R$ {item.price.toFixed(2)}
                        </div>
                      </div>
                      <div className="font-bold text-foreground">
                        R$ {(item.quantity * item.price).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedSale.itemsSummary ? (
                <div className="p-4 bg-surface border border-border rounded-xl">
                  <p className="text-sm font-medium text-foreground">{selectedSale.itemsSummary}</p>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Itens detalhados não encontrados para esta venda.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80 text-sm cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tour Guiado Interativo com setas e caixas explicativas */}
      <GuidedTour 
        isOpen={isTourOpen} 
        onClose={() => setIsTourOpen(false)} 
      />

      {/* Modal de Exportação por Período Personalizado */}
      <ExportPeriodModal
        isOpen={isExportPeriodModalOpen}
        onClose={() => setIsExportPeriodModalOpen(false)}
      />


    </div>
  );
}

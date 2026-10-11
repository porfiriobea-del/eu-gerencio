import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, 
  subMonths, parseISO, startOfDay, endOfDay 
} from 'date-fns';
import { 
  FileSpreadsheet, DownloadCloud, Calendar, Filter, X, 
  ArrowDownLeft, ArrowUpRight, Wallet, Users, Sparkles, Printer, CheckCircle2 
} from 'lucide-react';
import { getSalesByDateRange, getPurchasesByDateRange, subscribeCustomers, subscribeSettings } from '../lib/api';
import { exportFullReportToCSV } from '../lib/exportUtils';
import { exportToSheets } from '../lib/sheets';
import { usePreferences } from '../lib/preferencesContext';
import { Sale, Purchase, Customer, Settings } from '../types';

interface ExportPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
}

export function ExportPeriodModal({ isOpen, onClose, defaultStartDate, defaultEndDate }: ExportPeriodModalProps) {
  const { languageMode, v } = usePreferences();
  const [startDate, setStartDate] = useState(() => defaultStartDate || format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => defaultEndDate || format(new Date(), 'yyyy-MM-dd'));
  const [paymentType, setPaymentType] = useState<'todas' | 'cash' | 'card' | 'fiado'>('todas');
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Carrega clientes e dados do comércio
  useEffect(() => {
    if (!isOpen) return;
    const unsubCust = subscribeCustomers(setCustomers);
    const unsubSet = subscribeSettings(setSettings);
    return () => {
      unsubCust();
      unsubSet();
    };
  }, [isOpen]);

  // Carrega as métricas do período selecionado
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    const loadData = async () => {
      try {
        setLoadingMetrics(true);
        setStatusMessage(null);

        const now = new Date();
        const parsedStart = startDate ? parseISO(startDate) : subDays(now, 7);
        const parsedEnd = endDate ? parseISO(endDate) : now;

        const validStart = isNaN(parsedStart.getTime()) ? subDays(now, 7) : parsedStart;
        const validEnd = isNaN(parsedEnd.getTime()) ? now : parsedEnd;

        const startTimestamp = startOfDay(validStart).getTime();
        const endTimestamp = endOfDay(validEnd).getTime();

        const [fetchedSales, fetchedPurchases] = await Promise.all([
          getSalesByDateRange(startTimestamp, endTimestamp),
          getPurchasesByDateRange(startTimestamp, endTimestamp)
        ]);

        if (isCancelled) return;

        let filteredSales = fetchedSales;
        if (paymentType !== 'todas') {
          filteredSales = fetchedSales.filter(s => s.type === paymentType);
        }

        setSales(filteredSales);
        setPurchases(fetchedPurchases);
      } catch (err) {
        if (!isCancelled) {
          console.error('Erro ao carregar dados do período:', err);
        }
      } finally {
        if (!isCancelled) {
          setLoadingMetrics(false);
        }
      }
    };

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, startDate, endDate, paymentType]);

  // Cálculos financeiros consolidados
  const totalInflow = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const cashInflow = sales.filter(s => s.type === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
  const cardInflow = sales.filter(s => s.type === 'card').reduce((sum, s) => sum + (s.total || 0), 0);
  const fiadoInflow = sales.filter(s => s.type === 'fiado').reduce((sum, s) => sum + (s.total || 0), 0);
  const totalOutflow = purchases.reduce((sum, p) => sum + (p.totalCost || 0), 0);
  const balance = totalInflow - totalOutflow;

  const periodLabelFormatted = `${format(parseISO(startDate), 'dd/MM/yyyy')} até ${format(parseISO(endDate), 'dd/MM/yyyy')}`;

  // Ação de exportar CSV
  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      setStatusMessage(null);

      exportFullReportToCSV({
        purchases,
        sales,
        customers,
        periodLabel: periodLabelFormatted,
        startDate,
        endDate,
        storeName: settings?.storeName,
        inflow: totalInflow,
        outflow: totalOutflow,
        balance,
        fiadoInflow
      });

      setStatusMessage({
        type: 'success',
        text: `Relatório exportado com sucesso! Arquivo baixado com ${sales.length} vendas e ${purchases.length} compras.`
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Erro ao exportar planilha: ${err.message || 'Erro desconhecido'}`
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Ação de exportar Google Sheets
  const handleExportSheets = async () => {
    try {
      setIsExporting(true);
      setStatusMessage(null);

      const url = await exportToSheets({
        sales,
        expenses: [],
        customers,
        purchases
      });

      setStatusMessage({
        type: 'success',
        text: 'Relatório criado com sucesso no seu Google Drive/Google Sheets!'
      });
      window.open(url, '_blank');
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Erro ao enviar para Google Sheets: ${err.message || 'Erro desconhecido'}`
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Impressão visual direta
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-10 my-8 text-foreground"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-border flex items-center justify-between gap-3 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-palette-1 text-primary flex items-center justify-center border border-primary/20 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <span>Exportar Relatório por Período</span>
                  <span className="text-[10px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                    Personalizado
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Escolha as datas exatas que você deseja analisar e baixar em Excel (.CSV) ou Google Sheets.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Atalhos Rápidos de Período */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                Escolha rápida de intervalo:
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const today = format(new Date(), 'yyyy-MM-dd');
                    setStartDate(today);
                    setEndDate(today);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-palette-1 hover:text-primary border border-border transition-colors cursor-pointer"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setStartDate(format(startOfWeek(now), 'yyyy-MM-dd'));
                    setEndDate(format(endOfWeek(now), 'yyyy-MM-dd'));
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-palette-1 hover:text-primary border border-border transition-colors cursor-pointer"
                >
                  Esta Semana
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-palette-1 hover:text-primary border border-border transition-colors cursor-pointer"
                >
                  Últimos 7 dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(format(subDays(new Date(), 15), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-palette-1 hover:text-primary border border-border transition-colors cursor-pointer"
                >
                  Últimos 15 dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-palette-1 hover:text-primary border border-border transition-colors cursor-pointer"
                >
                  Últimos 30 dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
                    setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-palette-1 hover:text-primary border border-border transition-colors cursor-pointer"
                >
                  Este Mês
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setStartDate(format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
                    setEndDate(format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-palette-1 hover:text-primary border border-border transition-colors cursor-pointer"
                >
                  Mês Passado
                </button>
              </div>
            </div>

            {/* Campos de Data Personalizada e Filtro */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-muted/30 border border-border rounded-xl">
              <div>
                <label className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Data Inicial (De)
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-surface border border-border text-foreground text-xs font-semibold rounded-lg p-2.5 outline-none focus:border-primary cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Data Final (Até)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-surface border border-border text-foreground text-xs font-semibold rounded-lg p-2.5 outline-none focus:border-primary cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-primary" />
                  Forma de Pagamento
                </label>
                <select
                  value={paymentType}
                  onChange={e => setPaymentType(e.target.value as any)}
                  className="w-full bg-surface border border-border text-foreground text-xs font-semibold rounded-lg p-2.5 outline-none focus:border-primary cursor-pointer"
                >
                  <option value="todas">Todas as Vendas</option>
                  <option value="cash">Apenas Dinheiro Vivo</option>
                  <option value="card">Apenas Cartão</option>
                  <option value="fiado">Apenas Fiado</option>
                </select>
              </div>
            </div>

            {/* Pré-visualização do Resumo Financeiro do Período */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Prévia Consolidada deste Período:
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">
                  {loadingMetrics ? 'Calculando...' : `${sales.length} vendas • ${purchases.length} compras`}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Entrou */}
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl">
                  <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                    <span>{languageMode === 'basic' ? 'Dinheiro que entrou' : 'Receita Vendas'}</span>
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-base sm:text-lg font-black text-emerald-800 dark:text-emerald-200 mt-1">
                    R$ {totalInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {sales.length} vendas
                  </div>
                </div>

                {/* Saiu */}
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-xl">
                  <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300 flex items-center justify-between">
                    <span>{languageMode === 'basic' ? 'Dinheiro que saiu' : 'Desembolsos Compras'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <div className="text-base sm:text-lg font-black text-rose-800 dark:text-rose-200 mt-1">
                    R$ {totalOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                    {purchases.length} compras
                  </div>
                </div>

                {/* Sobrou no Bolso */}
                <div className={`p-3 rounded-xl border ${
                  balance >= 0 
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700/50' 
                    : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/50'
                }`}>
                  <div className={`text-[11px] font-bold flex items-center justify-between ${
                    balance >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    <span>{languageMode === 'basic' ? 'O que sobrou no bolso' : 'Resultado Líquido'}</span>
                    <Wallet className="w-3.5 h-3.5" />
                  </div>
                  <div className={`text-base sm:text-lg font-black mt-1 ${
                    balance >= 0 ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'
                  }`}>
                    R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {balance >= 0 ? 'Sobra livre' : 'Reposição'}
                  </div>
                </div>

                {/* Fiado */}
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 rounded-xl">
                  <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300 flex items-center justify-between">
                    <span>{languageMode === 'basic' ? 'Fiado no período' : 'Crédito Rotativo'}</span>
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <div className="text-base sm:text-lg font-black text-purple-800 dark:text-purple-200 mt-1">
                    R$ {fiadoInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">
                    A receber
                  </div>
                </div>
              </div>
            </div>

            {/* Status Feedback */}
            {statusMessage && (
              <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
              }`}>
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}
          </div>

          {/* Footer com Botões de Exportação */}
          <div className="p-4 sm:p-5 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted text-xs font-semibold transition-colors cursor-pointer text-center"
            >
              Fechar
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Imprimir visualização deste relatório"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>

              <button
                type="button"
                onClick={handleExportSheets}
                disabled={isExporting}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                title="Salvar planilha no Google Drive"
              >
                <DownloadCloud className="w-4 h-4" />
                <span>Google Sheets</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                disabled={isExporting}
                className="px-5 py-2.5 rounded-xl bg-primary hover:opacity-90 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-opacity disabled:opacity-50 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{isExporting ? 'Exportando...' : 'Baixar Planilha Excel (.CSV)'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

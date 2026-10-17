import { sortByName } from '../lib/alphabetical';
import { useCurrency } from '../lib/useCurrency';
import { usePreferences } from '../lib/preferencesContext';
import { showToast, showActionError } from '../lib/actionFeedback';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  subscribeCustomers, 
  addCustomer, 
  recordPayment,
  deleteCustomer,
  subscribeCustomerSales,
  subscribeCustomerPayments
} from '../lib/api';
import { Customer, Sale, Payment } from '../types';
import { 
  Plus, DollarSign, Clock, Search, FileText, ShoppingCart, 
  CheckCircle2, ArrowDownLeft, ArrowUpRight, Printer, X, 
  Phone, User, Calendar, History, ArrowRight,
  Trash2, AlertTriangle
} from 'lucide-react';
import { useEmployee } from '../lib/employeeContext';

interface LedgerItem {
  id: string;
  type: 'sale' | 'payment' | 'initial_debt';
  timestamp: number;
  amount: number;
  description: string;
  employeeName?: string;
  paymentMethod?: 'cash' | 'card';
  itemsSummary?: string;
}

export default function Debt() {
  const { formatMoney, currencySymbol, isBrazil } = useCurrency();

  const { v } = usePreferences();
  const { currentEmployee } = useEmployee();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Customer Form State
  const [formData, setFormData] = useState({ name: '', phone: '', previousDebt: 0, notes: '' });
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'cash'|'card'>('cash');

  // Customer History State
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([]);
  const [historyTab, setHistoryTab] = useState<'all' | 'sales' | 'payments'>('all');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    return subscribeCustomers(items => setCustomers(sortByName(items)));
  }, []);

  // When selectedCustomer changes and history modal is open, listen to sales & payments
  useEffect(() => {
    if (!selectedCustomer?.id || !isHistoryModalOpen) {
      setCustomerSales([]);
      setCustomerPayments([]);
      return;
    }

    setIsLoadingHistory(true);

    const unsubSales = subscribeCustomerSales(selectedCustomer.id, (sales) => {
      setCustomerSales(sales);
      setIsLoadingHistory(false);
    });

    const unsubPayments = subscribeCustomerPayments(selectedCustomer.id, (payments) => {
      setCustomerPayments(payments);
      setIsLoadingHistory(false);
    });

    return () => {
      unsubSales();
      unsubPayments();
    };
  }, [selectedCustomer?.id, isHistoryModalOpen]);

  // Keep selectedCustomer updated if customers list updates in real time
  useEffect(() => {
    if (selectedCustomer?.id) {
      const updated = customers.find(c => c.id === selectedCustomer.id);
      if (updated) {
        setSelectedCustomer(updated);
      }
    }
  }, [customers]);

  const totalDebt = useMemo(() => {
    return customers.reduce((acc, c) => acc + c.totalDebt, 0);
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return sortByName(customers);
    const q = searchQuery.toLowerCase().trim();
    return sortByName(customers).filter(c =>
      c.name.toLowerCase().includes(q) || 
      (c.phone && c.phone.includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingCustomer) return;
    setIsSavingCustomer(true);
    try {
      await addCustomer({
        name: formData.name, phone: formData.phone,
        previousDebt: Number(formData.previousDebt) || 0,
        totalDebt: Number(formData.previousDebt) || 0, notes: formData.notes
      });
      showToast('✓ Cliente cadastrado com sucesso!');
      setFormData({ name: '', phone: '', previousDebt: 0, notes: '' });
    } catch (error) {
      showActionError(error, 'Não foi possível cadastrar o cliente. Confira os dados e tente novamente.');
    } finally {
      setIsModalOpen(false);
      setIsSavingCustomer(false);
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || payAmount <= 0 || isPaying) return;
    setIsPaying(true);
    try {
      await recordPayment(selectedCustomer.id!, Number(payAmount), payMethod,
        currentEmployee ? { id: currentEmployee.id || 'employee', name: currentEmployee.name } : undefined);
      showToast('✓ Pagamento registrado com sucesso!');
      setPayAmount(0);
    } catch (error) {
      showActionError(error, 'Não foi possível registrar o pagamento. Confira os dados antes de tentar novamente.');
    } finally {
      setIsPayModalOpen(false);
      setIsPaying(false);
    }
  };

  const handleOpenDelete = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!customerToDelete?.id || isDeletingCustomer) return;
    try {
      setIsDeletingCustomer(true);
      await deleteCustomer(customerToDelete.id, customerToDelete.name);
      showToast('✓ Cliente removido com sucesso!');
      
      // If the customer was open in history modal, close it
      if (selectedCustomer?.id === customerToDelete.id) {
        setIsHistoryModalOpen(false);
        setSelectedCustomer(null);
      }
      setIsDeleteModalOpen(false);
      setCustomerToDelete(null);
    } catch (err: any) {
      showActionError(err, 'Não foi possível remover o cliente. Confira os dados antes de tentar novamente.');
    } finally {
      setIsDeleteModalOpen(false);
      setCustomerToDelete(null);
      setIsDeletingCustomer(false);
    }
  };

  // Combine and sort customer transactions into a unified ledger timeline
  const ledgerTimeline = useMemo<LedgerItem[]>(() => {
    if (!selectedCustomer) return [];

    const items: LedgerItem[] = [];

    // 1. Initial debt when customer was created, if any
    if (selectedCustomer.previousDebt > 0) {
      items.push({
        id: `initial-${selectedCustomer.id}`,
        type: 'initial_debt',
        timestamp: selectedCustomer.createdAt,
        amount: selectedCustomer.previousDebt,
        description: 'Dívida inicial / anterior cadastrada na abertura da ficha',
        employeeName: 'Cadastro Inicial'
      });
    }

    // 2. Sales made on credit (fiado)
    customerSales.forEach(s => {
      items.push({
        id: s.id || `sale-${s.createdAt}`,
        type: 'sale',
        timestamp: s.createdAt,
        amount: s.total,
        description: s.itemsSummary ? `Compra a prazo: ${s.itemsSummary}` : 'Compra a prazo realizada no fiado',
        employeeName: s.employeeName || 'Operador',
        itemsSummary: s.itemsSummary
      });
    });

    // 3. Payments made towards debt
    customerPayments.forEach(p => {
      items.push({
        id: p.id || `pay-${p.createdAt}`,
        type: 'payment',
        timestamp: p.createdAt,
        amount: p.amount,
        description: `Pagamento recebido (${p.method === 'cash' ? 'Dinheiro' : 'Cartão'})`,
        employeeName: p.employeeName || 'Operador',
        paymentMethod: p.method
      });
    });

    // Sort descending (most recent first)
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Apply tab filter
    if (historyTab === 'sales') {
      return items.filter(it => it.type === 'sale' || it.type === 'initial_debt');
    }
    if (historyTab === 'payments') {
      return items.filter(it => it.type === 'payment');
    }

    return items;
  }, [selectedCustomer, customerSales, customerPayments, historyTab]);

  // Calculate stats for selected customer
  const customerStats = useMemo(() => {
    const totalPurchases = customerSales.reduce((acc, s) => acc + (s.total || 0), 0);
    const totalPayments = customerPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    return {
      totalPurchases,
      totalPayments,
      initialDebt: selectedCustomer?.previousDebt || 0,
      currentDebt: selectedCustomer?.totalDebt || 0
    };
  }, [selectedCustomer, customerSales, customerPayments]);

  const formatDateTime = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} às ${timeStr}`;
    } catch {
      return 'Data não disponível';
    }
  };

  const handlePrintStatement = () => {
    window.print();
  };


  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">{v('debt.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {v('debt.balance')}: <span className="font-bold text-red-600 dark:text-red-400">{formatMoney(totalDebt)}</span> ({customers.length} cliente{customers.length !== 1 ? 's' : ''})
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="w-full sm:w-auto bg-primary text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 font-semibold cursor-pointer shadow-xs text-sm transition-opacity"
          >
            <Plus className="w-4 h-4"/> Novo Cliente
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-surface p-2.5 rounded-2xl border border-border shadow-2xs">
        <Search className="w-4 h-4 text-muted-foreground ml-2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar cliente por nome, telefone ou observação..."
          className="w-full bg-transparent text-foreground text-sm font-medium focus:outline-none placeholder:text-muted-foreground/70"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-muted-foreground hover:text-foreground mr-2 cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Customers Table */}
      <div className="bg-surface rounded-2xl shadow-xs border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">Cliente</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">Telefone</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">Observação</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider text-right">Dívida Total</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider text-center">Histórico & Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c => (
                <tr 
                  key={c.id} 
                  className="border-b border-border/70 hover:bg-muted/30 transition-colors group cursor-pointer"
                  onClick={(e) => {
                    // Prevent triggering if clicked button
                    if ((e.target as HTMLElement).closest('button')) return;
                    setSelectedCustomer(c);
                    setIsHistoryModalOpen(true);
                  }}
                >
                  <td className="p-4 font-semibold text-foreground">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-palette-1 text-primary flex items-center justify-center font-bold text-xs shrink-0 notranslate normal-case" translate="no">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="block leading-tight text-foreground hover:text-primary transition-colors notranslate normal-case" translate="no">
                          {c.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-normal">
                          Clique para ver compras e pagamentos
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-muted-foreground text-sm">
                    {c.phone ? (
                      <span className="flex items-center gap-1 font-mono text-xs">
                        <Phone className="w-3 h-3 text-muted-foreground/70" />
                        {c.phone}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-4 text-muted-foreground text-sm max-w-[200px] truncate" title={c.notes}>
                    {c.notes || '-'}
                  </td>
                  <td className="p-4 text-right font-bold text-sm">
                    {c.totalDebt > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-mono">
                        {formatMoney(c.totalDebt)}
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                        Sem débitos ({formatMoney(0)})
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <div className="inline-flex items-center justify-center gap-2">
                      {/* Botão de Histórico de Compras e Pagamentos */}
                      <button 
                        type="button"
                        onClick={(e) => { 
                          e.stopPropagation();
                          setSelectedCustomer(c); 
                          setIsHistoryModalOpen(true); 
                        }} 
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-2xs"
                        title="Ver histórico detalhado de compras e pagamentos deste cliente com dia e horário"
                      >
                        <History className="w-3.5 h-3.5 text-primary"/>
                        <span>Ver Histórico</span>
                      </button>

                      {/* Botão de Receber Pagamento */}
                      <button 
                        type="button"
                        onClick={(e) => { 
                          e.stopPropagation();
                          setSelectedCustomer(c); 
                          setPayAmount(c.totalDebt);
                          setIsPayModalOpen(true); 
                        }} 
                        disabled={c.totalDebt <= 0}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
                        title={c.totalDebt > 0 ? "Receber pagamento do fiado" : "Cliente sem dívida em aberto"}
                      >
                        <DollarSign className="w-3.5 h-3.5"/>
                        <span>Receber</span>
                      </button>

                      {/* Botão de Excluir Cliente */}
                      <button 
                        type="button"
                        onClick={(e) => { 
                          e.stopPropagation();
                          handleOpenDelete(c);
                        }} 
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                        title="Excluir este cliente da caderneta de fiado"
                      >
                        <Trash2 className="w-3.5 h-3.5"/>
                        <span className="sr-only sm:not-sr-only">Excluir</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground text-sm">
                    {searchQuery ? 'Nenhum cliente encontrado para a busca.' : 'Nenhum cliente cadastrado no fiado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: HISTÓRICO DE COMPRAS E PAGAMENTOS (COM DIA E HORÁRIO) */}
      {/* ========================================================================= */}
      {isHistoryModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-surface rounded-3xl w-full max-w-2xl border border-border shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-border bg-muted/30 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3.5 overflow-hidden">
                <div className="w-12 h-12 rounded-2xl bg-palette-1 text-primary flex items-center justify-center font-bold text-lg shrink-0 border border-primary/20 shadow-xs notranslate normal-case" translate="no">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold font-heading text-foreground truncate notranslate normal-case" translate="no">
                      {selectedCustomer.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                      Ficha do Cliente
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {selectedCustomer.phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3" /> {selectedCustomer.phone}
                      </span>
                    )}
                    <span>
                      Cadastrado em {new Date(selectedCustomer.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer shrink-0"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Summary Cards */}
            <div className="p-5 sm:p-6 border-b border-border/60 bg-muted/10 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                <span className="text-[10px] uppercase font-bold text-red-700 dark:text-red-300">
                  Dívida Atual
                </span>
                <p className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400 font-mono mt-0.5">
                  {formatMoney(selectedCustomer.totalDebt)}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">
                  Total em Compras
                </span>
                <p className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                  {formatMoney(customerStats.totalPurchases)}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300">
                  Total Pago
                </span>
                <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                  {formatMoney(customerStats.totalPayments)}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-muted border border-border">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                  Dívida Inicial
                </span>
                <p className="text-base sm:text-lg font-bold text-foreground font-mono mt-0.5">
                  {formatMoney(customerStats.initialDebt)}
                </p>
              </div>
            </div>

            {/* Filter Tabs & Quick Action */}
            <div className="px-5 sm:px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setHistoryTab('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    historyTab === 'all'
                      ? 'bg-palette-1 text-primary border border-primary/20 shadow-2xs font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Tudo ({ledgerTimeline.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab('sales')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    historyTab === 'sales'
                      ? 'bg-palette-1 text-primary border border-primary/20 shadow-2xs font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Compras ({customerSales.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab('payments')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    historyTab === 'payments'
                      ? 'bg-palette-1 text-primary border border-primary/20 shadow-2xs font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Pagamentos ({customerPayments.length})
                </button>
              </div>

              <div className="flex items-center gap-2">

                <button
                  type="button"
                  onClick={() => {
                    setPayAmount(selectedCustomer.totalDebt);
                    setIsPayModalOpen(true);
                  }}
                  disabled={selectedCustomer.totalDebt <= 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Abater / Receber</span>
                </button>
              </div>
            </div>

            {/* Scrollable Timeline List with Day & Time */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-3 flex-1">
              {isLoadingHistory ? (
                <div className="py-12 text-center text-muted-foreground text-xs flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 animate-spin text-primary" />
                  <span>Carregando histórico do fiado...</span>
                </div>
              ) : ledgerTimeline.length > 0 ? (
                <div className="space-y-2.5">
                  {ledgerTimeline.map((item) => {
                    const isSale = item.type === 'sale';
                    const isPayment = item.type === 'payment';
                    const isInitial = item.type === 'initial_debt';

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                          isSale
                            ? 'bg-red-500/5 hover:bg-red-500/10 border-red-500/20'
                            : isPayment
                            ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20'
                            : 'bg-muted/40 hover:bg-muted/60 border-border'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-start gap-3">
                            {/* Icon Indicator */}
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                              isSale
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                                : isPayment
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                : 'bg-muted text-muted-foreground border-border'
                            }`}>
                              {isSale ? (
                                <ShoppingCart className="w-4 h-4" />
                              ) : isPayment ? (
                                <ArrowDownLeft className="w-4 h-4" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                            </div>

                            {/* Details: Day, Hour, and Operator */}
                            <div className="notranslate normal-case" translate="no">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs font-bold ${
                                  isSale
                                    ? 'text-red-700 dark:text-red-300'
                                    : isPayment
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : 'text-foreground'
                                }`}>
                                  {isSale ? '🛒 Compra no Fiado (A Prazo)' : isPayment ? '💰 Pagamento de Fiado Recebido' : '📋 Saldo Anterior / Dívida Inicial'}
                                </span>

                                {/* Dia e Horário Formatado com Destaque */}
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-surface px-2 py-0.5 rounded-md border border-border/60">
                                  <Clock className="w-3 h-3 text-primary shrink-0" />
                                  <span>{formatDateTime(item.timestamp)}</span>
                                </span>
                              </div>

                              {/* Summary / Items of the purchase */}
                              <p className="text-xs text-foreground/90 mt-1 leading-relaxed notranslate normal-case" translate="no">
                                {item.description}
                              </p>

                              {/* Employee / Operator who performed the action */}
                              {item.employeeName && (
                                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                                  <span>Registrado por:</span>
                                  <span className="font-semibold text-foreground notranslate normal-case" translate="no">{item.employeeName}</span>
                                  {item.paymentMethod && (
                                    <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-muted rounded border border-border">
                                      {item.paymentMethod === 'cash' ? 'Dinheiro' : 'Cartão'}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Valor da transação */}
                          <div className="text-right sm:text-right shrink-0 pl-12 sm:pl-0">
                            <span className={`text-base font-bold font-mono ${
                              isSale
                                ? 'text-red-600 dark:text-red-400'
                                : isPayment
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-foreground'
                            }`}>
                              {isSale ? `+ ${formatMoney(item.amount)}` : isPayment ? `- ${formatMoney(item.amount)}` : `${formatMoney(item.amount)}`}
                            </span>
                            <span className="block text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                              {isSale ? 'Acréscimo na Dívida' : isPayment ? 'Abatimento' : 'Saldo Inicial'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground text-xs space-y-2">
                  <History className="w-10 h-10 mx-auto text-muted-foreground/40" />
                  <p className="font-semibold text-foreground text-sm">
                    Nenhum registro encontrado neste período
                  </p>
                  <p className="max-w-xs mx-auto">
                    Assim que o cliente comprar fiado no Caixa ou realizar um pagamento, as movimentações aparecerão aqui com dia e horário exatos.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenDelete(selectedCustomer)}
                  className="px-3 py-2 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Excluir este cliente da caderneta de fiado"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Cliente</span>
                </button>
                <span className="text-xs text-muted-foreground hidden md:inline">
                  Ficha de <span className="font-bold text-foreground notranslate normal-case" translate="no">{selectedCustomer.name}</span>
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  className="px-3.5 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Imprimir extrato do fiado"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Extrato</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                >
                  Fechar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVO CLIENTE */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-surface rounded-2xl w-full max-w-md p-6 border border-border shadow-xl">
            <h2 className="text-xl font-bold font-heading text-foreground mb-4">Novo Cliente</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Nome do Cliente *</label>
                <input 
                  required 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  placeholder="Ex: João da Padaria, Dona Maria..."
                  className="w-full border border-border bg-surface text-foreground p-2.5 rounded-xl text-sm focus:outline-hidden focus:border-primary notranslate normal-case"
                 translate="no"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Telefone (opcional)</label>
                <input 
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: e.target.value})} 
                  placeholder={isBrazil ? '(11) 98765-4321' : 'Telefone com código do país'}
                  className="w-full border border-border bg-surface text-foreground p-2.5 rounded-xl text-sm focus:outline-hidden focus:border-primary" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Dívida Anterior Já Existente ({currencySymbol})</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={formData.previousDebt} 
                  onChange={e => setFormData({...formData, previousDebt: Number(e.target.value)})} 
                  placeholder="0,00"
                  className="w-full border border-border bg-surface text-foreground p-2.5 rounded-xl text-sm focus:outline-hidden focus:border-primary" 
                />
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  Se o cliente já devia algo de antes, informe o valor para iniciar a caderneta com esse saldo.
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Observações (opcional)</label>
                <textarea 
                  value={formData.notes} 
                  onChange={e => setFormData({...formData, notes: e.target.value})} 
                  placeholder="Ex: Paga todo dia 10, trabalha na oficina vizinha..."
                  className="w-full border border-border bg-surface text-foreground p-2.5 rounded-xl text-sm focus:outline-hidden focus:border-primary" 
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-border">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-4 py-2 border border-border rounded-xl hover:bg-muted text-foreground text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" disabled={isSavingCustomer}
                  className="px-4 py-2 bg-primary text-white rounded-xl hover:opacity-90 text-sm font-semibold transition-opacity cursor-pointer shadow-xs"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECEBER PAGAMENTO */}
      {/* ========================================================================= */}
      {isPayModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-surface rounded-2xl w-full max-w-md p-6 border border-border shadow-xl">
            <h2 className="text-xl font-bold font-heading text-foreground mb-1">{v('debt.pay')}</h2>
            <p className="text-muted-foreground text-xs mb-5">
              Cliente: <span className="font-semibold text-foreground notranslate normal-case" translate="no">{selectedCustomer.name}</span> (Dívida total pendente: <span className="font-bold text-red-600">{formatMoney(selectedCustomer.totalDebt)}</span>)
            </p>
            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Valor do Pagamento ({currencySymbol})</label>
                <input 
                  type="number" 
                  step="0.01" 
                  max={selectedCustomer.totalDebt} 
                  required 
                  value={payAmount} 
                  onChange={e => setPayAmount(Number(e.target.value))} 
                  className="w-full border border-border bg-surface text-foreground p-2.5 rounded-xl text-sm font-bold text-base focus:outline-hidden focus:border-primary" 
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setPayAmount(selectedCustomer.totalDebt)}
                    className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                  >
                    Pagar valor total ({formatMoney(selectedCustomer.totalDebt)})
                  </button>
                  {selectedCustomer.totalDebt > 10 && (
                    <>
                      <span className="text-border">•</span>
                      <button
                        type="button"
                        onClick={() => setPayAmount(Number((selectedCustomer.totalDebt / 2).toFixed(2)))}
                        className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Pagar metade
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Forma de Pagamento</label>
                <select 
                  value={payMethod} 
                  onChange={e => setPayMethod(e.target.value as 'cash'|'card')} 
                  className="w-full border border-border p-2.5 rounded-xl bg-surface text-foreground text-sm focus:outline-hidden focus:border-primary font-semibold"
                >
                  <option value="cash">Dinheiro em Espécie</option>
                  <option value="card">{isBrazil ? 'Cartão / Pix' : 'Cartão'}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-border">
                <button 
                  type="button" 
                  onClick={() => setIsPayModalOpen(false)} 
                  className="px-4 py-2 border border-border rounded-xl hover:bg-muted text-foreground text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" disabled={isPaying}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-opacity cursor-pointer shadow-xs"
                >
                  Confirmar Pagamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EXCLUIR CLIENTE DO FIADO */}
      {/* ========================================================================= */}
      {isDeleteModalOpen && customerToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-surface rounded-3xl w-full max-w-md p-6 border border-border shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold font-heading text-foreground">
                  Excluir Cliente do Fiado?
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Esta ação remove o cliente permanentemente da sua caderneta.
                </p>
              </div>
            </div>

            <div className="bg-muted/40 rounded-2xl p-4 border border-border/80 space-y-2 mb-5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Nome:</span>
                <span className="font-bold text-foreground notranslate normal-case" translate="no">{customerToDelete.name}</span>
              </div>
              {customerToDelete.phone && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Telefone:</span>
                  <span className="font-mono text-foreground">{customerToDelete.phone}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-xs pt-1 border-t border-border/60">
                <span className="text-muted-foreground">Dívida pendente atual:</span>
                <span className={`font-mono font-bold ${customerToDelete.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'}`}>
                  {formatMoney(customerToDelete.totalDebt)}
                </span>
              </div>
            </div>

            {customerToDelete.totalDebt > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs mb-5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Atenção:</strong> Este cliente possui uma dívida em aberto de <strong>{formatMoney(customerToDelete.totalDebt)}</strong>. Ao excluir, essa dívida deixará de constar no balanço de fiados.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setCustomerToDelete(null);
                }}
                disabled={isDeletingCustomer}
                className="px-4 py-2.5 border border-border rounded-xl hover:bg-muted text-foreground text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingCustomer}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-xs transition-opacity cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingCustomer ? 'Excluindo...' : 'Sim, Excluir Cliente'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

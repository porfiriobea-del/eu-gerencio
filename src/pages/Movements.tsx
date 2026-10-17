import {isInvalidTemporaryPin} from '../lib/teamInvitation';
import { sortByName } from '../lib/alphabetical';
import { useCurrency } from '../lib/useCurrency';
import { formatProductStock } from '../lib/productUnits';
import { usePreferences } from '../lib/preferencesContext';
import { showToast, showActionError } from '../lib/actionFeedback';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, Users, ShoppingCart, Package, DollarSign, LogIn, LogOut, 
  Search, Filter, Calendar, Download, Plus, Clock, CheckCircle2, 
  AlertCircle, ArrowUpRight, ArrowDownRight, RefreshCw, Eye, EyeOff,
  Trash2, Edit3, Shield, FileText, Check, Phone, Lock, Sparkles,
  Layers, ChevronDown, X, AlertTriangle
} from 'lucide-react';
import { useEmployee } from '../lib/employeeContext';
import { 
  subscribeMovements, 
  recordMovement, 
  updateProduct,
  subscribeProducts
} from '../lib/api';
import { Movement, MovementType, Employee, Product } from '../types';

export default function Movements() {
  const { formatMoney, currencySymbol, isBrazil } = useCurrency();

  const { v, simpleViewMode } = usePreferences();
  const { 
    currentEmployee, 
    employees, 
    loginEmployee, 
    logoutEmployee, 
    createEmployee, 
    editEmployee, 
    removeEmployee, 
    openSwitchModal,
    activeShiftDuration 
  } = useEmployee();

  const [activeTab, setActiveTab] = useState<'history' | 'team'>('history');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);

  // Filter States
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<'today' | 'yesterday' | '7days' | 'month' | 'all'>('today');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual Movement Modal State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualType, setManualType] = useState<'stock_out' | 'stock_in' | 'manual_entry'>('stock_out');
  const [manualProduct, setManualProduct] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualReason, setManualReason] = useState('Avaria / Produto Danificado');
  const [manualNotes, setManualNotes] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Edit / Add Employee Modal
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState('Operador de Caixa');
  const [empPhone, setEmpPhone] = useState('');
  const [empPin, setEmpPin] = useState('');
  const [empColor, setEmpColor] = useState('bg-blue-500');
  const [empFormError, setEmpFormError] = useState('');
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isDeletingEmployee, setIsDeletingEmployee] = useState(false);
  const [empToDelete, setEmpToDelete] = useState<Employee | null>(null);

  // Password verification state when switching employee in Movements.tsx
  const [selectedEmpForLogin, setSelectedEmpForLogin] = useState<Employee | null>(null);
  const [loginPasswordInput, setLoginPasswordInput] = useState('');
  const [loginPasswordError, setLoginPasswordError] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isSettingNewPinOnLogin, setIsSettingNewPinOnLogin] = useState(false);

  // Real-time subscriptions
  useEffect(() => {
    const unsubMov = subscribeMovements((list) => {
      setMovements(list);
      setIsLoadingMovements(false);
    });

    const unsubProd = subscribeProducts((list) => {
      setProducts(sortByName(list));
    });

    return () => {
      unsubMov();
      unsubProd();
    };
  }, []);

  // Filter Logic
  const filteredMovements = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const yesterdayStart = todayStart - 86400000;
    const sevenDaysStart = todayStart - (6 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

    return movements.filter(m => {
      // Period filter
      if (selectedPeriodFilter === 'today' && m.timestamp < todayStart) return false;
      if (selectedPeriodFilter === 'yesterday' && (m.timestamp < yesterdayStart || m.timestamp >= todayStart)) return false;
      if (selectedPeriodFilter === '7days' && m.timestamp < sevenDaysStart) return false;
      if (selectedPeriodFilter === 'month' && m.timestamp < monthStart) return false;

      // Employee filter
      if (selectedEmployeeFilter !== 'all') {
        if (selectedEmployeeFilter === 'owner' && m.employeeId !== 'owner') return false;
        if (selectedEmployeeFilter !== 'owner' && m.employeeId !== selectedEmployeeFilter) return false;
      }

      // Type filter
      if (selectedTypeFilter !== 'all') {
        if (selectedTypeFilter === 'sales' && m.type !== 'sale') return false;
        if (selectedTypeFilter === 'stock' && !['stock_in', 'stock_out', 'stock_adjustment'].includes(m.type)) return false;
        if (selectedTypeFilter === 'shifts' && !['employee_login', 'employee_logout','shift_start','shift_end'].includes(m.type)) return false;
        if (selectedTypeFilter === 'debt' && !['debt_add', 'debt_payment'].includes(m.type)) return false;
        if (selectedTypeFilter === 'closure' && m.type !== 'cash_closure') return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim();
        const descMatch = m.description.toLowerCase().includes(queryLower);
        const empMatch = m.employeeName.toLowerCase().includes(queryLower);
        const entityMatch = m.entityName?.toLowerCase().includes(queryLower);
        const notesMatch = m.notes?.toLowerCase().includes(queryLower);
        if (!descMatch && !empMatch && !entityMatch && !notesMatch) return false;
      }

      return true;
    }).sort((a,b)=>b.timestamp-a.timestamp);
  }, [movements, selectedPeriodFilter, selectedEmployeeFilter, selectedTypeFilter, searchQuery]);

  // Metrics summary
  const metrics = useMemo(() => {
    let salesCount = 0;
    let salesTotal = 0;
    let stockInCount = 0;
    let stockOutCount = 0;
    let shiftsCount = 0;

    filteredMovements.forEach(m => {
      if (m.type === 'sale') {
        salesCount++;
        salesTotal += m.amount || 0;
      } else if (m.type === 'stock_in') {
        stockInCount += m.quantity || 1;
      } else if (m.type === 'stock_out') {
        stockOutCount += m.quantity || 1;
      } else if (['employee_login','employee_logout','shift_start','shift_end'].includes(m.type)) {
        shiftsCount++;
      }
    });

    return {
      total: filteredMovements.length,
      salesCount,
      salesTotal,
      stockInCount,
      stockOutCount,
      shiftsCount
    };
  }, [filteredMovements]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredMovements.length === 0) return;

    const headers = ['Data e Hora', 'Funcionário', 'Cargo', 'Tipo', 'Descrição', ("Valor (" + currencySymbol + ")"), 'Quantidade'];
    const rows = filteredMovements.map(m => [
      new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(m.timestamp),
      `"${m.employeeName.replace(/"/g, '""')}"`,
      `"${(m.employeeRole || '').replace(/"/g, '""')}"`,
      `"${m.type}"`,
      `"${m.description.replace(/"/g, '""')}"`,
      m.amount ? m.amount.toFixed(2) : '',
      m.quantity !== undefined ? m.quantity : ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + 
      [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `historico_movimentacoes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Submit Manual Movement (Baixa / Entrada Manual)
  const handleSaveManualMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(manualQty);
    if (isNaN(qty) || qty <= 0) return;

    setIsSubmittingManual(true);
    try {
      const activeEmp = currentEmployee || { id: 'owner', name: 'Proprietário', role: 'Administrador' };
      const selectedProd = products.find(p => p.name === manualProduct || p.id === manualProduct);

      let typeDesc = '';
      if (manualType === 'stock_out') {
        typeDesc = `BAIXA DE ESTOQUE: -${qty} un de "${selectedProd?.name || manualProduct}" | Motivo: ${manualReason}`;
      } else if (manualType === 'stock_in') {
        typeDesc = `ENTRADA MANUAL DE ESTOQUE: +${qty} un de "${selectedProd?.name || manualProduct}" | Motivo: ${manualReason}`;
      } else {
        typeDesc = `MOVIMENTAÇÃO MANUAL: ${manualReason} (${qty} un de "${selectedProd?.name || manualProduct}")`;
      }

      if (manualNotes.trim()) {
        typeDesc += ` • Obs: ${manualNotes.trim()}`;
      }

      // Update product stock if matched
      if (selectedProd && selectedProd.id) {
        const currentStock = selectedProd.stock || 0;
        const newStock = manualType === 'stock_out' 
          ? Math.max(0, currentStock - qty)
          : currentStock + qty;

        await updateProduct(selectedProd.id, { stock: newStock });
      }

      // Record movement
      const movementId = await recordMovement({
        timestamp: Date.now(),
        employeeId: activeEmp.id || 'employee',
        employeeName: activeEmp.name,
        employeeRole: activeEmp.role || 'Operador',
        type: manualType,
        description: typeDesc,
        entityId: selectedProd?.id,
        entityName: selectedProd?.name || manualProduct,
        quantity: qty,
        notes: manualNotes.trim() || undefined
      });

      if (!movementId) throw new Error('Não foi possível confirmar o histórico da movimentação.');
      showToast('✓ Movimentação registrada com sucesso!');
      // Reset form
      setManualProduct('');
      setManualQty('1');
      setManualNotes('');
      setIsManualModalOpen(false);
    } catch (err) {
      showActionError(err, 'Não foi possível confirmar a movimentação. Confira os dados antes de repetir.');
    } finally {
      setIsManualModalOpen(false);
      setIsSubmittingManual(false);
    }
  };

  // Employee Form submit (Add or Edit)
  const handleSaveEmployeeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if(isInvalidTemporaryPin(empPin)){setEmpFormError(v('team.temporaryPinLength'));return;}
    if (!empName.trim()) {
      setEmpFormError('Por favor, informe o nome do funcionário.');
      return;
    }

    if (!empPin.trim()) {
      setEmpFormError('A senha é obrigatória para cada funcionário para trocas de turno.');
      return;
    }

    if (isSavingEmployee) return;
    setIsSavingEmployee(true);
    try {
      if (editingEmployee && editingEmployee.id) {
        await editEmployee(editingEmployee.id, {
          name: empName.trim(),
          role: empRole,
          phone: empPhone.trim() || undefined,
          pin: empPin.trim(),
          color: empColor
        });
      } else {
        await createEmployee({
          name: empName.trim(),
          role: empRole,
          phone: empPhone.trim() || undefined,
          pin: empPin.trim(),
          color: empColor,
          isActive: true
        });
      }
      showToast(editingEmployee ? '✓ Alterações salvas!' : '✓ Funcionário cadastrado com sucesso!');
      setIsEmployeeModalOpen(false);
      setEditingEmployee(null);
      setEmpName('');
      setEmpPhone('');
      setEmpPin('');
      setEmpFormError('');
    } catch (err) {
      console.error('Error saving employee:', err);
      showActionError(err, 'Não foi possível salvar o funcionário. Confira os dados antes de repetir.');
    } finally {
      setIsEmployeeModalOpen(false);
      setEditingEmployee(null);
      setIsSavingEmployee(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!empToDelete?.id || isDeletingEmployee) return;
    setIsDeletingEmployee(true);
    try {
      await removeEmployee(empToDelete.id);
      showToast('✓ Funcionário removido com sucesso!');
    } catch (error) {
      showActionError(error, 'Não foi possível remover o funcionário. Confira os dados antes de repetir.');
    } finally {
      setEmpToDelete(null);
      setIsDeletingEmployee(false);
    }
  };

  const openAddEmployee = () => {
    setEditingEmployee(null);
    setEmpName('');
    setEmpRole('Operador de Caixa');
    setEmpPhone('');
    setEmpPin('');
    setEmpColor('bg-blue-500');
    setEmpFormError('');
    setIsEmployeeModalOpen(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpName(emp.name);
    setEmpRole(emp.role);
    setEmpPhone(emp.phone || '');
    setEmpPin(emp.pin || '');
    setEmpColor(emp.color || 'bg-blue-500');
    setEmpFormError('');
    setIsEmployeeModalOpen(true);
  };

  const handleStartLogin = (emp: Employee) => {
    setSelectedEmpForLogin(emp);
    setLoginPasswordInput('');
    setLoginPasswordError('');
    setShowLoginPassword(false);
    setIsSettingNewPinOnLogin(!emp.pin);
  };

  const handleConfirmLogin = async () => {
    if (!selectedEmpForLogin) return;
    if (!loginPasswordInput.trim()) {
      setLoginPasswordError('Por favor, digite a senha para entrar.');
      return;
    }
    if (selectedEmpForLogin.pin && selectedEmpForLogin.pin !== loginPasswordInput.trim()) {
      setLoginPasswordError('Senha incorreta. Tente novamente.');
      return;
    }
    try {
      if (!selectedEmpForLogin.pin && selectedEmpForLogin.id) {
        await editEmployee(selectedEmpForLogin.id, { pin: loginPasswordInput.trim() });
      }
      await loginEmployee(selectedEmpForLogin);
      showToast('✓ Entrada do funcionário registrada!');
    } catch (error) {
      showActionError(error, 'Não foi possível confirmar a entrada do funcionário. Confira antes de repetir.');
    } finally {
      setSelectedEmpForLogin(null);
      setLoginPasswordInput('');
    }
  };

  // Helper badge for movement type
  const renderMovementTypeBadge = (type: MovementType) => {
    switch (type) {
      case 'shift_start':
      case 'employee_login':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            <LogIn className="w-3 h-3 text-emerald-600" />
            Entrada de Funcionário
          </span>
        );
      case 'shift_end':
      case 'employee_logout':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            <LogOut className="w-3 h-3 text-rose-600" />
            Saída de Funcionário
          </span>
        );
      case 'sale':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
            <ShoppingCart className="w-3 h-3 text-blue-600" />
            Venda no Caixa
          </span>
        );
      case 'stock_in':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
            <ArrowUpRight className="w-3 h-3 text-teal-600" />
            Entrada de Estoque
          </span>
        );
      case 'stock_out':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            <ArrowDownRight className="w-3 h-3 text-amber-600" />
            Baixa / Saída de Estoque
          </span>
        );
      case 'stock_adjustment':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
            <RefreshCw className="w-3 h-3 text-purple-600" />
            Ajuste de Estoque
          </span>
        );
      case 'debt_payment':
      case 'debt_add':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
            <DollarSign className="w-3 h-3 text-indigo-600" />
            Fiado & Pagamento
          </span>
        );
      case 'cash_closure':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border border-yellow-500/30">
            <FileText className="w-3 h-3 text-yellow-600" />
            Fechamento de Caixa
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground border border-border">
            <Activity className="w-3 h-3" />
            Movimentação
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="p-6 sm:p-7 rounded-3xl bg-surface border border-border shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold font-heading text-foreground">
              {v('movements.title')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {v('movements.description')}
          </p>
        </div>

        {/* Current Active Employee in Shift Indicator */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {currentEmployee ? (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold truncate max-w-[130px] notranslate normal-case" translate="no">{currentEmployee.name}</span>
                  <span className="text-[10px] bg-emerald-500 text-white font-bold px-1.5 py-0.2 rounded uppercase">Em Turno</span>
                </div>
                {activeShiftDuration && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {activeShiftDuration}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="px-3.5 py-2 rounded-2xl bg-muted/60 border border-border text-xs text-muted-foreground">
              <span>Nenhum funcionário em turno</span>
            </div>
          )}

          <button
            onClick={openSwitchModal}
            className="px-4 py-2.5 rounded-2xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Trocar / Entrar Funcionário</span>
          </button>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex items-center border-b border-border gap-2">
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3.5 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>{v('movements.history')} ({filteredMovements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('team')}
          className={`pb-3.5 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'team'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{simpleViewMode ? 'Equipe' : 'Equipe e Turnos'} ({employees.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: HISTÓRICO DE MOVIMENTAÇÕES */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Quick Stats Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-xs font-medium">Movimentações</span>
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-heading text-foreground">
                {metrics.total}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                registradas no filtro atual
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-xs font-medium">Vendas no Caixa</span>
                <ShoppingCart className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-heading text-blue-600 dark:text-blue-400">
                {formatMoney(metrics.salesTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {metrics.salesCount} vendas realizadas
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-xs font-medium">Entradas de Estoque</span>
                <ArrowUpRight className="w-4 h-4 text-teal-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-heading text-teal-600 dark:text-teal-400">
                +{metrics.stockInCount} un
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                produtos repostos
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-xs font-medium">Entradas/Saídas Pessoal</span>
                <LogIn className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-heading text-foreground">
                {metrics.shiftsCount}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                turnos registrados
              </p>
            </div>
          </div>

          {/* Action & Filter Toolbar */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3.5">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por funcionário, produto, descrição..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-muted/30 text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsManualModalOpen(true)}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-palette-1 hover:bg-palette-3/30 text-primary border border-primary/25 text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Registrar baixa manual por avaria, quebra, validade ou reposição rápida"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{v('movements.manual')}</span>
                </button>

                <button
                  onClick={handleExportCSV}
                  disabled={filteredMovements.length === 0}
                  className="px-3.5 py-2 rounded-xl border border-border bg-surface hover:bg-muted text-foreground text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Exportar registros filtrados para planilha Excel/CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Exportar CSV</span>
                </button>
              </div>
            </div>

            {/* Filter Pills / Dropdowns */}
            <details key={`filters-${simpleViewMode}`} open={!simpleViewMode}>
            <summary className="cursor-pointer py-2 text-sm font-semibold text-foreground">Filtrar registros</summary>
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
              {/* Period Filter */}
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border text-xs">
                {(['today', 'yesterday', '7days', 'month', 'all'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setSelectedPeriodFilter(p)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      selectedPeriodFilter === p 
                        ? 'bg-surface text-foreground font-bold shadow-2xs border border-border' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p === 'today' && 'Hoje'}
                    {p === 'yesterday' && 'Ontem'}
                    {p === '7days' && '7 Dias'}
                    {p === 'month' && 'Este Mês'}
                    {p === 'all' && 'Tudo'}
                  </button>
                ))}
              </div>

              {/* Employee Filter */}
              <select
                value={selectedEmployeeFilter}
                onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-border bg-surface text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 font-medium"
              >
                <option value="all">Todos os Funcionários</option>
                <option value="owner">Proprietário / Gerente</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id} className="notranslate normal-case" translate="no">{emp.name} ({emp.role})</option>
                ))}
              </select>

              {/* Type Filter */}
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-border bg-surface text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 font-medium"
              >
                <option value="all">Todos os Tipos de Ação</option>
                <option value="shifts">Entradas e Saídas de Pessoal</option>
                <option value="sales">Vendas no Caixa</option>
                <option value="stock">Estoque (Entradas, Baixas, Ajustes)</option>
                <option value="debt">Fiados e Pagamentos</option>
                <option value="closure">Fechamentos de Caixa</option>
              </select>
            </div>
            </details>
          </div>

          {/* Timeline / Movements List */}
          {isLoadingMovements ? (
            <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">Carregando histórico de movimentações...</span>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-border bg-surface/50">
              <Activity className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-bold text-base text-foreground">
                Nenhuma movimentação encontrada
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {searchQuery || selectedTypeFilter !== 'all' || selectedEmployeeFilter !== 'all'
                  ? 'Tente ajustar os filtros ou o período selecionado para ver outros registros.'
                  : 'Assim que vendas forem feitas, funcionários entrarem em turno ou compras forem cadastradas, o histórico completo aparecerá aqui automaticamente.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredMovements.map((m) => {
                const dateObj = new Date(m.timestamp);
                const timeStr = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(dateObj);
                const dateStr = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(dateObj);

                return (
                  <div
                    key={m.id || m.timestamp}
                    className="p-4 rounded-2xl bg-surface border border-border hover:border-primary/40 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-2xs group"
                  >
                    {/* Left: Time, Employee, and Badge */}
                    <div className="flex items-start sm:items-center gap-3.5 flex-1 overflow-hidden">
                      {/* Timestamp Pill */}
                      <div className="flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl bg-muted/60 border border-border text-center shrink-0 min-w-[58px]">
                        <span className="text-xs font-bold text-foreground leading-none">{timeStr}</span>
                        <span className="text-[10px] text-muted-foreground leading-none mt-1">{dateStr}</span>
                      </div>

                      {/* Content Details */}
                      <div className="space-y-1 overflow-hidden">
                        <div className="flex flex-wrap items-center gap-2">
                          {renderMovementTypeBadge(m.type)}

                          {/* Operator Tag */}
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border">
                            <span className="w-2 h-2 rounded-full bg-primary/70"></span>
                            <span className="notranslate normal-case" translate="no">{m.employeeName}</span>
                            {m.employeeRole && (
                              <span className="text-muted-foreground text-[10px]">({m.employeeRole})</span>
                            )}
                          </span>
                        </div>

                        {/* Description */}
                        <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed notranslate normal-case" translate="no">
                          {m.description}
                        </p>
                      </div>
                    </div>

                    {/* Right: Quantity or Amount Badge */}
                    {(m.amount !== undefined || m.quantity !== undefined) && (
                      <div className="shrink-0 flex items-center gap-3 self-end md:self-center">
                        {m.quantity !== undefined && (
                          <span className="text-xs font-bold text-foreground bg-muted px-2.5 py-1 rounded-lg">
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity} un
                          </span>
                        )}
                        {m.amount !== undefined && (
                          <span className="text-xs sm:text-sm font-bold text-primary bg-palette-1 px-3 py-1 rounded-xl border border-primary/20">
                            {formatMoney(m.amount)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GESTÃO DA EQUIPE & TURNOS */}
      {/* ========================================================================= */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface border border-border">
            <div>
              <h2 className="text-lg font-bold font-heading text-foreground">
                Colaboradores Cadastrados
              </h2>
              <p className="text-xs text-muted-foreground">
                Cadastre todos que atendem no balcão, operam o caixa ou organizam o estoque.
              </p>
            </div>
            <button
              onClick={openAddEmployee}
              className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Funcionário</span>
            </button>
          </div>

          {employees.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-border bg-surface/50">
              <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-bold text-base text-foreground">
                Nenhum funcionário cadastrado ainda
              </h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
                Cadastre seus funcionários para que cada movimentação no caixa, no estoque e no fiado fique gravada no nome da pessoa correta.
              </p>
              <button
                onClick={openAddEmployee}
                className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Cadastrar Primeiro Funcionário
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employees.map(emp => {
                const isCurrent = currentEmployee?.id === emp.id;
                const hasShiftStarted = !!emp.currentShiftStartedAt;

                return (
                  <div
                    key={emp.id}
                    className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                      isCurrent
                        ? 'border-emerald-500/50 bg-emerald-500/5 shadow-xs'
                        : 'border-border bg-surface hover:border-primary/40 shadow-2xs'
                    }`}
                  >
                    <div>
                      {/* Card Header: Avatar & Status */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className={['notranslate', 'normal-case', (`w-12 h-12 rounded-2xl ${emp.color || 'bg-primary'} text-white font-bold flex items-center justify-center text-lg shadow-xs`)].filter(Boolean).join(' ')} translate="no">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-bold text-base text-foreground notranslate normal-case" translate="no">
                              {emp.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {emp.role}
                            </p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        {isCurrent ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500 text-white tracking-wide uppercase flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                            Em Turno
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                            Fora de Turno
                          </span>
                        )}
                      </div>

                      {/* Info lines */}
                      <div className="space-y-1.5 text-xs text-muted-foreground py-2 border-t border-b border-border/50 my-3">
                        {emp.email && (
                          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200">
                            <span className="font-semibold block text-[11px]">
                              {v('team.exactEmail')}
                            </span>
                            <span className="font-mono text-xs font-bold text-foreground">
                              {emp.email}
                            </span>
                          </div>
                        )}
                        {emp.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-primary" />
                            <span>{emp.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{emp.pin ? 'PIN Protegido' : 'Sem PIN (Acesso livre)'}</span>
                        </div>
                        {isCurrent && activeShiftDuration && (
                          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Ativo há {activeShiftDuration}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditEmployee(emp)}
                          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          title="Editar Funcionário"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEmpToDelete(emp)}
                          className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                          title="Excluir Funcionário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {isCurrent ? (
                        <button
                          onClick={logoutEmployee}
                          className="px-3.5 py-1.5 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sair / Encerrar Turno</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartLogin(emp)}
                          className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                          title="Digitar senha e registrar entrada"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>Registrar Entrada</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MANUAL MOVEMENT (BAIXA / ENTRADA MANUAL) */}
      {/* ========================================================================= */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div 
            className="bg-surface border border-border rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative my-8 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsManualModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <ArrowDownRight className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-heading text-foreground">
                  {v('movements.manual')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Dê baixa em produtos danificados, quebras ou registre reposição manual.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveManualMovement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Tipo de Movimentação
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualType('stock_out')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      manualType === 'stock_out'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'border-border bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Baixa / Perda (- un)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setManualType('stock_in')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      manualType === 'stock_in'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                        : 'border-border bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Entrada Manual (+ un)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Produto *
                </label>
                <input
                  type="text"
                  required
                  list="products-datalist"
                  value={manualProduct}
                  onChange={(e) => setManualProduct(e.target.value)}
                  placeholder="Selecione ou digite o nome do produto..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/30 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <datalist id="products-datalist">
                  {products.map(p => (
                    <option key={p.id} value={p.name} className="notranslate normal-case" translate="no">
                      Estoque atual: {formatProductStock(p)}
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Quantidade *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={manualQty}
                    onChange={(e) => setManualQty(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/30 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Motivo Principal
                  </label>
                  <select
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/30 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="Avaria / Produto Danificado">Avaria / Quebra</option>
                    <option value="Validade Vencida">Validade Vencida</option>
                    <option value="Consumo do Estabelecimento">Consumo Interno</option>
                    <option value="Erro de Contagem Anterior">Ajuste de Contagem</option>
                    <option value="Devolução ou Troca">Devolução / Troca</option>
                    <option value="Outro Motivo">Outro...</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Observações Adicionais (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Ex: Embalagem rasgada pelo cliente, descarte feito no lixo."
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-muted/30 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-palette-1 border border-primary/20 text-xs text-muted-foreground notranslate normal-case" translate="no">
                <span className="font-semibold text-foreground">Operador responsável:</span>{' '}
                {currentEmployee ? `${currentEmployee.name} (${currentEmployee.role})` : 'Proprietário / Gerente'}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border hover:bg-muted text-foreground text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual || !manualProduct.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingManual ? 'Gravando...' : 'Gravar no Histórico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT EMPLOYEE */}
      {/* ========================================================================= */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div 
            className="bg-surface border border-border rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative my-8 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsEmployeeModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-heading text-foreground">
                  {editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Preencha os dados do colaborador do estabelecimento.
                </p>
              </div>
            </div>

            {empFormError && (
              <div className="p-3 mb-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold">
                {empFormError}
              </div>
            )}

            <form onSubmit={handleSaveEmployeeForm} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Nome do Funcionário *
                </label>
                <input
                  type="text"
                  required
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="Ex: Maria Atendente, Carlos Repositor..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/30 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 notranslate normal-case"
                 translate="no"/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Função / Cargo *
                  </label>
                  <select
                    value={empRole}
                    onChange={(e) => setEmpRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/30 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  >
                    <option value="Operador de Caixa">Operador de Caixa</option>
                    <option value="Atendente">Atendente</option>
                    <option value="Repositor de Estoque">Repositor</option>
                    <option value="Gerente de Loja">Gerente</option>
                    <option value="Auxiliar Geral">Auxiliar</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-foreground">
                      Senha / PIN *
                    </label>
                    <span className="text-[10px] font-semibold text-primary">
                      Obrigatória
                    </span>
                  </div>
                  <input
                    type="password"
                    required
                    title={v('team.temporaryPinHelp')}
                    minLength={4}
                    maxLength={64}
                    value={empPin}
                    onChange={(e) => setEmpPin(e.target.value)}
                    placeholder="Defina a senha..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/30 text-foreground text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{v('team.temporaryPinHelp')}</p>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Telefone (Opcional)
                </label>
                <input
                  type="text"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  placeholder={isBrazil ? '(11) 99999-9999' : 'Telefone com código do país'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/30 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Cor do Crachá
                </label>
                <div className="flex items-center gap-2">
                  {['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEmpColor(c)}
                      className={`w-7 h-7 rounded-full ${c} transition-all cursor-pointer flex items-center justify-center text-white ${
                        empColor === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      {empColor === c && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border hover:bg-muted text-foreground text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEmployee || !empName.trim() || !empPin.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DIGITAR SENHA PARA MUDAR DE FUNCIONÁRIO / ENTRAR EM TURNO */}
      {/* ========================================================================= */}
      {selectedEmpForLogin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div 
            className="bg-surface border border-border rounded-3xl max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Lock className="w-4 h-4" />
                <span className="notranslate normal-case" translate="no">Senha de {selectedEmpForLogin.name}</span>
              </div>
              <button 
                onClick={() => setSelectedEmpForLogin(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-3 notranslate normal-case" translate="no">
              {isSettingNewPinOnLogin
                ? 'Este colaborador ainda não tem senha cadastrada. Digite uma senha para ele e confirme para entrar:'
                : `Digite a senha de ${selectedEmpForLogin.name} para confirmar a mudança de operador:`}
            </p>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPasswordInput}
                  onChange={(e) => {
                    setLoginPasswordInput(e.target.value);
                    setLoginPasswordError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmLogin()}
                  placeholder="Digite a senha..."
                  autoFocus
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border bg-surface text-foreground text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {loginPasswordError && (
                <p className="text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {loginPasswordError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedEmpForLogin(null)}
                  className="flex-1 py-2 px-3 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLogin}
                  className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Entrar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Funcionário */}
      {empToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div 
            className="bg-surface border border-border rounded-3xl max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400 font-bold text-sm mb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Excluir Funcionário</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Tem certeza que deseja excluir <strong className="notranslate normal-case" translate="no">{empToDelete.name}</strong> ({empToDelete.role}) da equipe? Ele será removido permanentemente do estabelecimento.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEmpToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteEmployee}
                disabled={isDeletingEmployee}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sim, Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

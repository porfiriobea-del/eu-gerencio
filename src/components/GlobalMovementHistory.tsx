import { usePreferences } from '../lib/preferencesContext';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, ShoppingCart, Users, DollarSign, Package, 
  LogIn, LogOut, FileText, ChevronDown, ChevronUp, 
  RefreshCw, Search, ArrowRight, ShieldCheck, Clock,
  Sparkles, Eye, EyeOff
} from 'lucide-react';
import { subscribeMovements } from '../lib/api';
import { Movement } from '../types';
import { Link } from 'react-router-dom';

export function GlobalMovementHistory() {
  const { v, simpleViewMode } = usePreferences();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modo suspenso: inicia recolhido para manter a interface 100% limpa, ou lembra a preferência
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return !simpleViewMode && localStorage.getItem('suspended_movement_history_open') === 'true';
    } catch {
      return false;
    }
  });

  const [hasNewMovementAlert, setHasNewMovementAlert] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'debt' | 'stock' | 'closure'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(6);
  const prevCountRef = useRef<number>(0);

  useEffect(() => { if (simpleViewMode) setIsOpen(false); }, [simpleViewMode]);

  useEffect(() => {
    let alertTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribeMovements((list) => {
      if (prevCountRef.current > 0 && list.length > prevCountRef.current && !isOpen) {
        setHasNewMovementAlert(true);
        clearTimeout(alertTimer);
        alertTimer = setTimeout(() => setHasNewMovementAlert(false), 8000);
      }
      // Always receive fresh records, including while collapsed.
      prevCountRef.current = list.length;
      setMovements(list);
      setIsLoading(false);
    });
    return () => { unsub(); clearTimeout(alertTimer); };
  }, [isOpen]);

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('suspended_movement_history_open', String(next));
      } catch {}
      if (next) {
        setHasNewMovementAlert(false);
      }
      return next;
    });
  };

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      // Type filter
      if (filterType === 'sales' && m.type !== 'sale') return false;
      if (filterType === 'debt' && !['debt_add', 'debt_payment'].includes(m.type)) return false;
      if (filterType === 'stock' && !['stock_in', 'stock_out', 'stock_adjustment', 'product_create', 'product_update', 'product_delete'].includes(m.type)) return false;
      if (filterType === 'closure' && m.type !== 'cash_closure') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = m.description?.toLowerCase().includes(q);
        const empMatch = m.employeeName?.toLowerCase().includes(q);
        const entityMatch = m.entityName?.toLowerCase().includes(q);
        if (!descMatch && !empMatch && !entityMatch) return false;
      }

      return true;
    });
  }, [movements, filterType, searchQuery]);

  const displayedMovements = filteredMovements.slice(0, visibleLimit);
  const latestMovement = movements.length > 0 ? movements[0] : null;

  const formatTimestamp = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const isToday = 
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (isToday) {
        return `Hoje às ${timeStr}`;
      }

      const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      return `${dateStr} às ${timeStr}`;
    } catch {
      return 'Recentemente';
    }
  };

  const getMovementVisuals = (type: Movement['type']) => {
    switch (type) {
      case 'sale':
        return {
          icon: ShoppingCart,
          bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
          label: 'Venda'
        };
      case 'debt_add':
        return {
          icon: Users,
          bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
          label: 'Fiado (A Prazo)'
        };
      case 'debt_payment':
        return {
          icon: DollarSign,
          bg: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20',
          label: 'Pagamento de Fiado'
        };
      case 'stock_in':
      case 'stock_out':
      case 'stock_adjustment':
        return {
          icon: Package,
          bg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
          label: 'Estoque / Compra'
        };
      case 'product_create':
      case 'product_update':
      case 'product_delete':
        return {
          icon: Package,
          bg: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20',
          label: 'Catálogo'
        };
      case 'cash_closure':
        return {
          icon: FileText,
          bg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
          label: 'Fechamento de Caixa'
        };
      case 'employee_login':
      case 'employee_logout':
        return {
          icon: LogIn,
          bg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
          label: 'Acesso / Turno'
        };
      default:
        return {
          icon: Activity,
          bg: 'bg-muted text-muted-foreground border-border',
          label: 'Registro'
        };
    }
  };

  return (
    <section 
      id="fixed-suspended-movement-history"
      aria-label={v('movements.history')}
      className="mt-14 mb-8 pt-4 border-t border-border/50"
    >
      {/* Container Suspenso Clean */}
      <div className={`rounded-3xl border transition-all duration-300 ${
        isOpen
          ? 'bg-surface border-border shadow-md'
          : 'bg-surface/80 hover:bg-surface border-border/80 hover:border-primary/30 shadow-2xs'
      }`}>
        
        {/* Barra Suspensa Principal (Sempre visível no fim da página, limpa e discreta) */}
        <div 
          onClick={toggleOpen}
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleOpen(); } }}
          className="p-3.5 sm:p-4.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none group"
        >
          {/* Lado Esquerdo: Identificação e Status em Tempo Real */}
          <div className="flex items-center gap-3 overflow-hidden">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
              hasNewMovementAlert
                ? 'bg-emerald-500 text-white animate-pulse'
                : 'bg-palette-1 text-primary border-primary/20 group-hover:scale-105'
            }`}>
              <Activity className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold font-heading text-foreground tracking-tight truncate">
                  {v('movements.history')}
                </h3>

                <span className={`${simpleViewMode ? 'hidden' : 'inline-flex'} items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shrink-0`}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  Tempo Real
                </span>

                {hasNewMovementAlert && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold animate-bounce shrink-0">
                    Nova movimentação!
                  </span>
                )}
              </div>

              {/* Ticker / Preview curto da última ação */}
              {latestMovement ? (
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px] sm:max-w-md notranslate normal-case" translate="no">
                  <span className="font-semibold text-foreground/80 notranslate normal-case" translate="no">{latestMovement.employeeName || 'Operador'}:</span>{' '}
                  {latestMovement.description}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Toque para ver os registros da loja
                </p>
              )}
            </div>
          </div>

          {/* Lado Direito: Ações e Botão de Expandir / Recolher */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-xl bg-palette-1 border border-primary/20 text-xs font-bold text-primary">
              {movements.length} {movements.length === 1 ? 'ação' : 'ações'}
            </span>

            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-muted/60 hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
            >
              <span>{isOpen ? 'Recolher' : 'Abrir Histórico'}</span>
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CONTEÚDO SUSPENSO EXPANDIDO */}
        {/* ========================================================================= */}
        {isOpen && (
          <div className="border-t border-border/60 p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
            {/* Header de Filtros e Busca dentro do Modo Suspenso */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Filtros em Pílulas */}
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-palette-1 text-primary border border-primary/20 shadow-2xs font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Todas ({movements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('sales')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'sales'
                      ? 'bg-palette-1 text-primary border border-primary/20 shadow-2xs font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Vendas
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('debt')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'debt'
                      ? 'bg-palette-1 text-primary border border-primary/20 shadow-2xs font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Fiados & Pagamentos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('stock')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'stock'
                      ? 'bg-palette-1 text-primary border border-primary/20 shadow-2xs font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Estoque / Compras
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('closure')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'closure'
                      ? 'bg-palette-1 text-primary border border-primary/20 shadow-2xs font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Caixa
                </button>
              </div>

              {/* Busca em Tempo Real */}
              <div className="relative min-w-[200px] sm:max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar ação ou funcionário..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-surface text-foreground text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Lista de Movimentações */}
            {isLoading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-muted-foreground text-xs">
                <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                <span>Carregando movimentações do estabelecimento...</span>
              </div>
            ) : displayedMovements.length > 0 ? (
              <div className="space-y-2">
                {displayedMovements.map((m) => {
                  const visuals = getMovementVisuals(m.type);
                  const IconComponent = visuals.icon;

                  return (
                    <div
                      key={m.id || `${m.timestamp}-${m.employeeName}`}
                      className="p-3 sm:p-3.5 rounded-2xl bg-muted/30 hover:bg-muted/60 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors"
                    >
                      <div className="flex items-start sm:items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${visuals.bg}`}>
                          <IconComponent className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-xs text-foreground truncate notranslate normal-case" translate="no">
                              {m.employeeName || 'Operador'}
                            </span>
                            {m.employeeRole && (
                              <span className="px-2 py-0.5 rounded-md bg-palette-1 border border-primary/20 text-[10px] font-semibold text-primary">
                                {m.employeeRole}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3 inline text-muted-foreground/70" />
                              {formatTimestamp(m.timestamp)}
                            </span>
                          </div>

                          <p className="text-xs text-foreground/90 mt-0.5 line-clamp-2 leading-relaxed notranslate normal-case" translate="no">
                            {m.description}
                          </p>
                        </div>
                      </div>

                      {/* Valor ou Quantidade em Destaque */}
                      <div className="flex items-center sm:flex-col sm:items-end justify-between shrink-0 pl-11 sm:pl-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
                        {m.amount !== undefined && m.amount > 0 && (
                          <span className="text-xs sm:text-sm font-bold text-foreground font-mono">
                            R$ {m.amount.toFixed(2)}
                          </span>
                        )}
                        {m.quantity !== undefined && m.amount === undefined && (
                          <span className="text-xs font-semibold text-primary">
                            {m.quantity} un
                          </span>
                        )}
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
                          {visuals.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-xs space-y-1">
                <ShieldCheck className="w-7 h-7 mx-auto text-muted-foreground/60 mb-1" />
                <p className="font-semibold text-foreground text-sm">
                  Nenhuma movimentação neste filtro
                </p>
                <p>
                  As ações realizadas pela equipe aparecerão aqui em tempo real.
                </p>
              </div>
            )}

            {/* Rodapé do Modo Suspenso: Ver mais ou recolher */}
            <div className="pt-2 flex items-center justify-between border-t border-border/50">
              {filteredMovements.length > visibleLimit ? (
                <button
                  type="button"
                  onClick={() => setVisibleLimit(prev => prev + 10)}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  + Carregar mais movimentações ({filteredMovements.length - visibleLimit} restantes)
                </button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Exibindo {displayedMovements.length} de {filteredMovements.length} ações
                </span>
              )}

              <div className="flex items-center gap-3">
                <Link
                  to="/movimentacoes"
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                >
                  <span>{v('nav.movements')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={toggleOpen}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  Recolher
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

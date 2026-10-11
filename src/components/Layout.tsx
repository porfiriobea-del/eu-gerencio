import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  Home, ShoppingCart, Package, DollarSign, Users, Settings as SettingsIcon, 
  HelpCircle, LogOut, MailPlus, ShoppingBag, PanelLeftClose, PanelLeftOpen,
  Sun, Moon, WifiOff, RefreshCw, CheckCircle2, MessageSquareQuote, ShieldAlert,
  Sparkles, Eye, EyeOff, Activity, ChevronDown, LogIn, X, Briefcase
} from 'lucide-react';
import { logout } from '../lib/auth';
import { subscribeSettings, getActiveStoreSession, leaveStoreSubAccount, ActiveStoreSession } from '../lib/api';
import { usePreferences } from '../lib/preferencesContext';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { useEmployee } from '../lib/employeeContext';
import { TutorialModal } from './TutorialModal';
import { InviteModal } from './InviteModal';
import { EmployeeSwitchModal } from './EmployeeSwitchModal';
import { GlobalMovementHistory } from './GlobalMovementHistory';

export function Layout() {
  const [storeName, setStoreName] = useState('Eu Gerencio!');
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [storeSession, setStoreSession] = useState<ActiveStoreSession | null>(getActiveStoreSession);
  const location = useLocation();
  const { isOnline, wasOffline, isReconnecting, reconnectedJustNow, syncNow } = useOnlineStatus();
  const { currentEmployee, activeAnnouncement, clearAnnouncement, openSwitchModal } = useEmployee();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const { t, v, darkMode, setDarkMode, isBasicMode, simpleViewMode, toggleSimpleViewMode } = usePreferences();

  useEffect(() => {
    const handleSessionChange = (e: any) => {
      setStoreSession(e.detail || getActiveStoreSession());
    };
    window.addEventListener('store-session-changed', handleSessionChange);
    return () => window.removeEventListener('store-session-changed', handleSessionChange);
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const NAV_ITEMS = [
    { to: '/', icon: Home, label: t('nav.home'), id: 'nav-item-home' },
    { to: '/caixa', icon: ShoppingCart, label: v('nav.pos', t('nav.pos')), id: 'nav-item-caixa' },
    { to: '/estoque', icon: Package, label: v('nav.stock', t('nav.stock')), id: 'nav-item-estoque' },
    { to: '/compras', icon: ShoppingBag, label: v('nav.purchases', t('nav.purchases')), id: 'nav-item-compras' },
    { to: '/precos', icon: DollarSign, label: v('nav.pricing', t('nav.pricing')), id: 'nav-item-precos' },
    { to: '/fiado', icon: Users, label: v('nav.debt', t('nav.debt')), id: 'nav-item-fiado' },
    { to: '/movimentacoes', icon: Activity, label: 'Movimentações', id: 'nav-item-movimentacoes' },
    { to: '/ajustes', icon: SettingsIcon, label: t('nav.settings'), id: 'nav-item-ajustes' },
    { to: '/tutorial', icon: HelpCircle, label: t('nav.tutorial'), id: 'nav-item-tutorial' },
  ];

  useEffect(() => {
    const unsub = subscribeSettings(s => {
      if (s) {
        if (s.storeName) setStoreName(s.storeName);
        setLogoUrl(s.logoUrl);
      }
    });
    return () => unsub();
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      <aside 
        className={`${
          isCollapsed ? 'w-20' : 'w-64'
        } bg-surface border-r border-border flex flex-col transition-all duration-300 ease-in-out shrink-0`}
      >
        {/* Header / Brand & Toggle */}
        <div className={`p-4 flex items-center ${isCollapsed ? 'flex-col gap-3 justify-center' : 'justify-between'} border-b border-border/50`}>
          {!isCollapsed ? (
            <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-2">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={storeName} 
                  className="w-9 h-9 rounded-lg object-cover shrink-0 border border-primary/20 shadow-xs" 
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-palette-1 text-primary flex items-center justify-center font-bold text-base shrink-0 border border-primary/20">
                  {storeName.charAt(0).toUpperCase()}
                </div>
              )}
              <h1 className="text-lg font-bold font-heading text-foreground tracking-tight leading-tight truncate" title={storeName}>
                {storeName}
              </h1>
            </div>
          ) : (
            <div 
              className="cursor-pointer" 
              title={storeName}
              onClick={toggleCollapse}
            >
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={storeName} 
                  className="w-10 h-10 rounded-xl object-cover shrink-0 border border-primary/20 shadow-xs" 
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-palette-1 text-primary flex items-center justify-center font-bold text-lg shrink-0 shadow-xs border border-primary/20">
                  {storeName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}

          <button
            onClick={toggleCollapse}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title={isCollapsed ? "Expandir menu lateral" : "Minimizar menu lateral (apenas ícones)"}
            aria-label={isCollapsed ? "Expandir menu" : "Minimizar menu"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 text-primary" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              id={item.id}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-xl text-sm font-medium transition-all group ${
                  isCollapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5'
                } ${
                  isActive
                    ? 'bg-palette-1 text-primary font-semibold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <item.icon className="w-5 h-5 shrink-0 transition-transform group-hover:scale-105" />
              {!isCollapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-border space-y-1.5">
          {/* Acesso Rápido ao Modo do Funcionário */}
          <button
            onClick={openSwitchModal}
            id="sidebar-employee-mode-btn"
            title={isCollapsed ? (currentEmployee ? `Modo Funcionário: ${currentEmployee.name}` : "Modo do Funcionário") : undefined}
            className={`flex items-center w-full rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              currentEmployee 
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30' 
                : 'text-foreground hover:bg-muted'
            } ${
              isCollapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5'
            }`}
          >
            <Users className={`w-5 h-5 shrink-0 ${currentEmployee ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`} />
            {!isCollapsed && (
              <div className="flex-1 text-left overflow-hidden">
                <span className="block truncate font-bold text-xs">
                  {currentEmployee ? currentEmployee.name : 'Modo do Funcionário'}
                </span>
                <span className="block text-[10px] text-muted-foreground truncate">
                  {currentEmployee ? 'Colaborador em turno' : 'Trocar com senha • Equipe'}
                </span>
              </div>
            )}
          </button>

          <button
            onClick={() => setShowInviteModal(true)}
            title={isCollapsed ? t('nav.invite') : undefined}
            className={`flex items-center w-full rounded-xl text-sm font-medium text-primary hover:bg-palette-1 transition-colors cursor-pointer ${
              isCollapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2'
            }`}
          >
            <MailPlus className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="truncate">{t('nav.invite')}</span>}
          </button>

          <button
            onClick={logout}
            title={isCollapsed ? t('nav.logout') : undefined}
            className={`flex items-center w-full rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer ${
              isCollapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2'
            }`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="truncate">{t('nav.logout')}</span>}
          </button>

          {/* Quick collapse footer button when expanded */}
          {!isCollapsed && (
            <button
              onClick={toggleCollapse}
              className="mt-2 flex items-center justify-center gap-2 w-full py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg transition-colors cursor-pointer"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
              <span>Minimizar menu</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area with Top Toolbar */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Barra de Ferramentas Superior (Top Toolbar) */}
        <header 
          id="app-top-toolbar" 
          className="h-16 border-b border-border bg-surface px-4 sm:px-6 flex items-center justify-between shrink-0 z-20 gap-3 shadow-2xs"
        >
          {/* Left: Store identity & Connection/Sync Status Indicator */}
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="font-heading font-semibold text-foreground text-sm sm:text-base hidden md:inline truncate max-w-[200px]">
              {storeName}
            </span>

            {/* Sub-conta Indicator Badge */}
            {storeSession?.isEmployee && (
              <div 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-semibold"
                title={`Você está conectado como funcionário com uma sub-conta vinculada a este estabelecimento (${storeSession.employeeName || 'Colaborador'} - ${storeSession.employeeRole || 'Equipe'}).`}
              >
                <Briefcase className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">Sub-conta: {storeSession.employeeName || 'Funcionário'}</span>
              </div>
            )}

            <span className="text-border hidden md:inline">•</span>

            {/* Offline Status Indicator */}
            {!isOnline && (
              <div 
                id="offline-indicator-badge"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-semibold animate-pulse shadow-xs"
                role="status"
                aria-live="polite"
                title="Você está sem internet no momento. Todas as suas vendas, compras e registros ficam salvos localmente e serão sincronizados automaticamente com a nuvem assim que a conexão retornar."
              >
                <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">Modo Offline • Ações salvas e sincronizadas ao voltar</span>
              </div>
            )}

            {/* Reconnecting / Syncing Status Indicator */}
            {isOnline && isReconnecting && (
              <div 
                id="syncing-indicator-badge"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold shadow-xs"
                role="status"
                aria-live="polite"
              >
                <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 animate-spin" />
                <span className="truncate">Internet restabelecida! Sincronizando dados com a nuvem...</span>
              </div>
            )}

            {/* Reconnected Just Now Success Toast */}
            {isOnline && !isReconnecting && reconnectedJustNow && (
              <div 
                id="reconnected-indicator-badge"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold shadow-xs transition-all"
                role="status"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Online & Tudo sincronizado!</span>
              </div>
            )}

            {/* Normal Online Indicator */}
            {isOnline && !isReconnecting && !reconnectedJustNow && (
              <div 
                id="online-indicator-badge"
                className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-palette-1 border border-primary/20 text-xs text-muted-foreground"
                title="Conexão com Firestore ativa: seus dados estão sincronizados em tempo real."
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-medium text-foreground/80">Online & Sincronizado</span>
              </div>
            )}
          </div>

          {/* Right: Quick Actions Toolbar */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Active Employee Switcher Button */}
            <button
              type="button"
              onClick={openSwitchModal}
              id="topbar-employee-switcher"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-2xs border ${
                currentEmployee
                  ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-muted/70 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              }`}
              title={
                currentEmployee
                  ? `Modo do Funcionário ativo: ${currentEmployee.name} (${currentEmployee.role}). Clique para mudar de colaborador com senha ou registrar saída.`
                  : 'Modo do Funcionário: Adicione, exclua ou alterne de colaborador com senha protegida.'
              }
            >
              {currentEmployee ? (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="truncate max-w-[120px] font-bold text-foreground">
                    {currentEmployee.name}
                  </span>
                  <span className="hidden lg:inline text-[10px] text-muted-foreground font-medium">
                    (Modo Funcionário)
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-semibold text-foreground">Modo do Funcionário</span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </>
              )}
            </button>

            {/* Quick Simple / Complete View Mode Toggle for Basic Mode */}
            {isBasicMode && (
              <button
                id="topbar-quick-simple-mode-toggle"
                type="button"
                onClick={toggleSimpleViewMode}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-2xs border ${
                  simpleViewMode
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700/60'
                    : 'bg-muted/80 text-foreground border-border hover:bg-muted'
                }`}
                title={
                  simpleViewMode
                    ? "Interface simplificada ativa: detalhes técnicos ficam minimizados. Clique para expandir todos os detalhes."
                    : "Visão detalhada ativa. Clique para voltar à interface simples e limpa."
                }
              >
                {simpleViewMode ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="hidden sm:inline">Interface Simples</span>
                    <span className="text-[10px] bg-amber-200/80 dark:bg-amber-900/60 px-1.5 py-0.5 rounded-md font-bold">Ativa</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="hidden sm:inline">Visão Completa</span>
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground font-medium">Expandida</span>
                  </>
                )}
              </button>
            )}

            {/* Quick Feedback Button */}
            <NavLink
              to="/tutorial?tab=feedback"
              id="topbar-quick-feedback-btn"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium border border-primary/25 bg-palette-1 hover:bg-palette-3/30 text-primary transition-colors cursor-pointer shadow-2xs"
              title="Envie sua sugestão, elogio ou relato de problema diretamente para a equipe"
            >
              <MessageSquareQuote className="w-4 h-4 shrink-0 text-primary" />
              <span className="hidden sm:inline">Dar Feedback</span>
            </NavLink>

            {/* Quick Dark / Light Mode Toggle Button */}
            <button
              id="topbar-quick-theme-toggle"
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/50 hover:bg-muted text-foreground transition-all cursor-pointer text-xs sm:text-sm font-medium shadow-2xs group"
              title={
                darkMode 
                  ? "Alternar para Tema Claro (Modo Dia)" 
                  : "Alternar para Tema Escuro (Ideal para ambientes com pouca luz)"
              }
              aria-label={darkMode ? "Alternar para Tema Claro" : "Alternar para Tema Escuro"}
            >
              {darkMode ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 shrink-0 transition-transform group-hover:rotate-45" />
                  <span className="hidden md:inline font-medium">Tema Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:-rotate-12" />
                  <span className="hidden md:inline font-medium">Tema Escuro</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* ANNOUNCEMENT BANNER FOR EMPLOYEE ENTRY & EXIT */}
        {activeAnnouncement && (
          <div 
            id="employee-announcement-banner"
            className={`mx-4 sm:mx-6 mt-3 p-3.5 sm:p-4 rounded-2xl border shadow-md flex items-center justify-between gap-3 animate-in slide-in-from-top-3 duration-300 ${
              activeAnnouncement.type === 'entry'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-900 dark:text-emerald-100'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700/60 text-rose-900 dark:text-rose-100'
            }`}
            role="alert"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                activeAnnouncement.type === 'entry'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-rose-500 text-white'
              }`}>
                {activeAnnouncement.type === 'entry' ? (
                  <LogIn className="w-5 h-5" />
                ) : (
                  <LogOut className="w-5 h-5" />
                )}
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold leading-tight">
                  {activeAnnouncement.type === 'entry' ? '👋 ENTRADA REGISTRADA:' : '🚪 SAÍDA REGISTRADA:'} {activeAnnouncement.title}
                </p>
                <p className="text-xs opacity-90 mt-0.5">
                  {activeAnnouncement.message}
                </p>
              </div>
            </div>

            <button
              onClick={clearAnnouncement}
              className="p-1.5 rounded-lg opacity-70 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              title="Dispensar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Content View */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
            {/* Histórico de Movimentações fixado no fim de cada página em modo suspenso (retrátil e limpo) */}
            <GlobalMovementHistory />
          </div>
        </main>
      </div>

      <TutorialModal />
      <InviteModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />
      <EmployeeSwitchModal />
    </div>
  );
}


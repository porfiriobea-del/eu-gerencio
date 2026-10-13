import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  Home, ShoppingCart, Package, DollarSign, Users, Settings as SettingsIcon, 
  HelpCircle, LogOut, MailPlus, ShoppingBag, Menu,
  Sun, Moon, WifiOff, RefreshCw, CheckCircle2, MessageSquareQuote, 
  Sparkles, Eye,  Activity, LogIn, X, Briefcase, Pin, PinOff
} from 'lucide-react';
import { logout } from '../lib/auth';
import { subscribeSettings, getActiveStoreSession, type ActiveStoreSession } from '../lib/api';
import { usePreferences } from '../lib/preferencesContext';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { useEmployee } from '../lib/employeeContext';
import { TutorialModal } from './TutorialModal';
import { InviteModal } from './InviteModal';
import { EmployeeSwitchModal } from './EmployeeSwitchModal';
import { GlobalMovementHistory } from './GlobalMovementHistory';

interface LayoutProps {
  menuPinned: boolean;
  onToggleMenuPinned: () => void;
}

export function Layout({ menuPinned, onToggleMenuPinned }: LayoutProps) {
  const [storeName, setStoreName] = useState('Eu Gerencio!');
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [storeSession, setStoreSession] = useState<ActiveStoreSession | null>(getActiveStoreSession);
  const location = useLocation();
  const { isOnline, wasOffline, isReconnecting, reconnectedJustNow, syncNow } = useOnlineStatus();
  const { currentEmployee, activeAnnouncement, clearAnnouncement, openSwitchModal } = useEmployee();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const { t, v, darkMode, setDarkMode, isBasicMode, simpleViewMode, toggleSimpleViewMode } = usePreferences();

  useEffect(() => {
    const handleSessionChange = (e: any) => {
      setStoreSession(e.detail || getActiveStoreSession());
    };
    window.addEventListener('store-session-changed', handleSessionChange);
    return () => window.removeEventListener('store-session-changed', handleSessionChange);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mainRef.current?.setAttribute('inert', '');
    const drawer = drawerRef.current;
    const getFocusable = () => Array.from(drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex="0"]'
    ) ?? []).filter(element => element.getClientRects().length > 0);
    getFocusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
      }
      if (event.key === 'Tab') {
        const items = getFocusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      mainRef.current?.removeAttribute('inert');
      document.removeEventListener('keydown', handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  const handleToggleMenuPinned = () => {
    setMenuOpen(false);
    onToggleMenuPinned();
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
    <div className="flex h-[100dvh] min-h-0 bg-background text-foreground font-sans">
      <div ref={mainRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {menuPinned ? (
        <header
          id="app-top-toolbar"
          className="sticky top-0 z-50 shrink-0 border-b border-border bg-surface"
        >
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
          <button ref={menuButtonRef} type="button" onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu de navegação" aria-expanded={menuOpen} aria-controls="app-navigation-drawer"
            className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <Menu className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">Menu</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={storeName}>{storeName}</p>
            <p className="truncate text-xs text-muted-foreground">{NAV_ITEMS.find(item => item.to === location.pathname)?.label || t('nav.home')}</p>
          </div>
          <button
            type="button"
            onClick={handleToggleMenuPinned}
            aria-pressed={menuPinned}
            aria-label={menuPinned ? 'Desafixar menu' : 'Fixar menu'}
            title={menuPinned ? 'Desafixar menu' : 'Fixar menu'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {menuPinned ? <Pin className="h-5 w-5 text-primary" aria-hidden="true" /> : <PinOff className="h-5 w-5" aria-hidden="true" />}
          </button>
          <div role="status" aria-live="polite" className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            {!isOnline ? <WifiOff className="h-4 w-4 text-amber-600" /> : isReconnecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            <span>{!isOnline ? 'Offline' : isReconnecting ? 'Sincronizando' : reconnectedJustNow ? 'Reconectado' : 'Online'}</span>
          </div>
          </div>
          <nav aria-label="Menu fixo" className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 sm:px-6">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                id={`${item.id}-pinned`}
                className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium ${isActive ? 'bg-palette-1 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </header>
        ) : (
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu de navegação"
            aria-expanded={menuOpen}
            aria-controls="app-navigation-drawer"
            className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface shadow-lg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
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
              aria-label="Dispensar aviso"
              className="min-h-[44px] min-w-[44px] p-1.5 rounded-lg opacity-70 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              title="Dispensar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}


        <main className={`flex-1 p-4 sm:p-6 md:p-8 ${menuPinned ? '' : 'pt-20 sm:pt-20 md:pt-20'}`}>
          <div className="mx-auto w-full min-w-0 max-w-6xl">
            <Outlet />
            <GlobalMovementHistory />
          </div>
        </main>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          <aside ref={drawerRef} id="app-navigation-drawer" role="dialog" aria-modal="true" aria-labelledby="navigation-title"
            className="absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col border-r border-border bg-surface shadow-xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-border p-4">
              {logoUrl ? <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-palette-1 font-bold text-primary">{storeName.charAt(0).toUpperCase()}</div>}
              <div className="min-w-0 flex-1"><h2 id="navigation-title" className="font-semibold">Menu</h2><p className="truncate text-xs text-muted-foreground">{storeName}</p></div>
              <button
                type="button"
                onClick={handleToggleMenuPinned}
                aria-pressed={menuPinned}
                aria-label={menuPinned ? 'Desafixar menu' : 'Fixar menu'}
                title={menuPinned ? 'Desafixar menu' : 'Fixar menu'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted"
              >
                {menuPinned ? <Pin className="h-5 w-5 text-primary" aria-hidden="true" /> : <PinOff className="h-5 w-5" aria-hidden="true" />}
              </button>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <nav aria-label="Navegação principal" className="space-y-1">
                {NAV_ITEMS.map(item => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} id={item.id} onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => `flex min-h-[48px] items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-palette-1 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                    <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <button type="button" id="sidebar-employee-mode-btn" onClick={() => { setMenuOpen(false); openSwitchModal(); }} className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm hover:bg-muted">
                  <Users className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate font-medium">{currentEmployee ? currentEmployee.name : 'Modo do Funcionário'}</span><span className="block text-xs text-muted-foreground">{currentEmployee ? 'Colaborador em turno' : 'Trocar com senha • Equipe'}</span></span>
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); setShowInviteModal(true); }} className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-primary hover:bg-muted"><MailPlus className="h-5 w-5" />{t('nav.invite')}</button>
                <button type="button" onClick={logout} className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-red-600 hover:bg-muted"><LogOut className="h-5 w-5" />{t('nav.logout')}</button>
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 [&>button]:min-h-[44px] [&>a]:min-h-[44px]">
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
                    <span className="">Interface Simples</span>
                    <span className="text-[10px] bg-amber-200/80 dark:bg-amber-900/60 px-1.5 py-0.5 rounded-md font-bold">Ativa</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="">Visão Completa</span>
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground font-medium">Expandida</span>
                  </>
                )}
              </button>
            )}

            {/* Quick Feedback Button */}
            <NavLink
              to="/tutorial?tab=feedback"
              onClick={() => setMenuOpen(false)}
              id="topbar-quick-feedback-btn"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium border border-primary/25 bg-palette-1 hover:bg-palette-3/30 text-primary transition-colors cursor-pointer shadow-2xs"
              title="Envie sua sugestão, elogio ou relato de problema diretamente para a equipe"
            >
              <MessageSquareQuote className="w-4 h-4 shrink-0 text-primary" />
              <span className="">Dar Feedback</span>
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
                  <span className=" font-medium">Tema Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:-rotate-12" />
                  <span className=" font-medium">Tema Escuro</span>
                </>
              )}
            </button>

              </div>
              {storeSession?.isEmployee && <div className="mt-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground"><Briefcase className="mb-1 h-4 w-4" />Sub-conta: {storeSession.employeeName || 'Funcionário'}</div>}
              {!isOnline && <p className="mt-4 text-xs text-muted-foreground">Sem conexão. Aguarde o retorno da internet para sincronizar os registros.</p>}
              {isOnline && wasOffline && <button type="button" onClick={syncNow} className="mt-3 flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" />Sincronizar agora</button>}
            </div>
          </aside>
        </div>
      )}

      <TutorialModal />
      <InviteModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />
      <EmployeeSwitchModal />
    </div>
  );
}

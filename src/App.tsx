import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initAuth, googleSignIn } from './lib/auth';
import { checkAndRunDailyAutomatedBackup } from './lib/backupService';
import { Layout } from './components/Layout';
import { User } from 'firebase/auth';
import { db, doc, getDoc, onSnapshot, verifyCloudIdentity } from './lib/cloudStore';
import { motion } from 'motion/react';
import { 
  checkAndAcceptPendingInvitation, 
  getStoreInvitationById, 
  setActiveStoreSession
} from './lib/api';
import { TeamInvitation } from './types';

import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Stock from './pages/Stock';
import Purchases from './pages/Purchases';
import Pricing from './pages/Pricing';
import Debt from './pages/Debt';
import SettingsView from './pages/SettingsView';
import Tutorial from './pages/Tutorial';
import Onboarding from './pages/Onboarding';
import Movements from './pages/Movements';
import { EmployeeProvider } from './lib/employeeContext';
import { TermsModal, PrivacyModal } from './components/LegalModals';
import { hydrateCloudCategories } from './lib/categories';
import { hydrateCloudSheets } from './lib/googleSheets';
import { updateSettings } from './lib/api';
import { showActionError } from './lib/actionFeedback';

export default function App() {
  const [menuPinned, setMenuPinned] = useState(() => {
    try {
      return localStorage.getItem('eu_gerencio_menu_pinned') !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('eu_gerencio_menu_pinned', String(menuPinned));
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  }, [menuPinned]);

  const storeResolvedRef = useRef(false);
  const [cloudError, setCloudError] = useState('');
  const [retryLoad, setRetryLoad] = useState(0);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<TeamInvitation | null>(null);

  // Check URL parameters for team invitation on startup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const inviteId = urlParams.get('invite');
      if (inviteId) {
        sessionStorage.setItem('pending_invite_id', inviteId);
        getStoreInvitationById(inviteId).then((inv) => {
          if (inv) setPendingInvite(inv);
        }).catch(() => {});
      } else {
        const storedInviteId = sessionStorage.getItem('pending_invite_id');
        if (storedInviteId) {
          getStoreInvitationById(storedInviteId).then((inv) => {
            if (inv) setPendingInvite(inv);
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Could not inspect invite params:', e);
    }
  }, []);

  useEffect(() => {
    let unsubscribeSettings: (() => void) | null = null;
    let active = true;
    let generation = 0;
    const fail = (error: unknown) => {
      if (!active) return;
      if (storeResolvedRef.current) { showActionError(error, 'Sem confirmação da nuvem. Verifique sua conexão antes de repetir uma operação.'); return; }
      setCloudError(error instanceof Error ? error.message : 'Não foi possível acessar os dados da loja.');
      setLoading(false);
    };
    const unsubscribeAuth = initAuth(async currentUser => {
      const request = ++generation;
      storeResolvedRef.current = false;
      setUser(currentUser); setNeedsAuth(false); setLoading(true); setCloudError('');
      setOnboardingComplete(null); unsubscribeSettings?.(); setActiveStoreSession(null);
      hydrateCloudCategories(undefined, [], 'mercearia');
      hydrateCloudSheets(undefined);
      try {
        await verifyCloudIdentity(currentUser.uid);
        const inviteId = new URLSearchParams(window.location.search).get('invite') || sessionStorage.getItem('pending_invite_id');
        const session = await checkAndAcceptPendingInvitation(currentUser.uid, currentUser.email || '', inviteId);
        if (!active || request !== generation) return;
        const ownerId = session?.storeOwnerId || currentUser.uid;
        const profileRef = doc(db, 'settings', ownerId);
        const profile = await getDoc(profileRef);
        if (!profile.exists() && !session?.isEmployee) {
          // Existing Google accounts keep their UID; copy legacy data once, never delete the source.
          const { migrateLegacyStore } = await import('./lib/legacyMigration');
          await migrateLegacyStore(ownerId);
        } else if (profile.exists() && profile.data().legacyMigrationPending && !session?.isEmployee) {
          void import('./lib/legacyMigration').then(({ migrateLegacyStore }) => migrateLegacyStore(ownerId))
            .catch(() => console.warn('A migração do legado será retomada quando a origem estiver disponível.'));
        }
        if (!active || request !== generation) return;
        if (inviteId) sessionStorage.removeItem('pending_invite_id');
        unsubscribeSettings = onSnapshot(profileRef, snapshot => {
          if (!active || request !== generation) return;
          const data = snapshot.exists() ? snapshot.data() : null;
          if (!data?.storeName && session?.isEmployee) { storeResolvedRef.current = false; fail(new Error('O acesso à loja não está disponível. Entre novamente ou fale com o proprietário.')); return; }
          storeResolvedRef.current = true;
          if (data) {
            hydrateCloudCategories(ownerId, data.customCategories || [], data.businessSector || 'mercearia');
            hydrateCloudSheets(ownerId, data.googleSheetsWebhookUrl || '', data.googleSheetsWebhookEnabled === true);
            window.dispatchEvent(new CustomEvent('cloud-preferences', { detail: { ...data, currency: ['USD','EUR'].includes(data.currency) ? data.currency : 'BRL' } }));
          }
          setOnboardingComplete(!!data?.storeName);
          setCloudError(''); setLoading(false);
          if (data?.storeName) void checkAndRunDailyAutomatedBackup();
        }, fail);
      } catch (error) { if (request === generation) fail(error); }
    }, () => {
      generation++; storeResolvedRef.current = false; unsubscribeSettings?.(); setActiveStoreSession(null);
      hydrateCloudCategories(undefined, [], 'mercearia');
      hydrateCloudSheets(undefined);
      setUser(null); setNeedsAuth(true); setLoading(false); setOnboardingComplete(null); setCloudError('');
    });
    return () => { active = false; generation++; unsubscribeAuth(); unsubscribeSettings?.(); };
  }, [retryLoad]);

  useEffect(() => {
    if (!user || !onboardingComplete || cloudError) return;
    const persist = (event: Event) => {
      void updateSettings((event as CustomEvent).detail).catch(error => showActionError(error, 'Não foi possível salvar a preferência na nuvem.'));
    };
    window.addEventListener('cloud-preference-change', persist);
    return () => window.removeEventListener('cloud-preference-change', persist);
  }, [user, onboardingComplete, cloudError]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await googleSignIn();
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.error('Login failed:', err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (cloudError && user) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-xl font-bold">Não foi possível carregar sua loja</h1>
        <p role="alert" className="text-sm text-muted-foreground">{cloudError}</p>
        <p className="text-sm">Seus dados não foram apagados. Verifique a conexão e tente novamente.</p>
        <button type="button" onClick={() => setRetryLoad(value => value + 1)} className="rounded-xl bg-primary px-4 py-3 font-semibold text-white">Tentar novamente</button>
      </div>
    </div>;
  }

  if (loading || (!needsAuth && onboardingComplete === null)) {
    return <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">Carregando...</div>;
  }

  if (needsAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden" style={{ backgroundColor: '#C8D3C5' }}>
        {/* Abstract background shapes from reference */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-1/2 h-full bg-[#BFA89E]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="bg-[#Fdfcf7] p-8 sm:p-10 rounded-[3rem] shadow-2xl max-w-[400px] w-full text-center relative z-10 border-4 border-[#3c3c3c]"
        >
          {/* Custom Logo from reference */}
          <div className="mx-auto w-32 h-32 mb-6 relative">
            <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" stroke="currentColor">
              {/* E */}
              <path d="M 45,25 L 25,25 L 25,75 L 45,75 M 25,50 L 40,50" stroke="#BFA89E" strokeWidth="2" strokeLinecap="square"/>
              {/* Box shape representing G */}
              <path d="M 50,20 L 75,30 L 75,65 L 50,75 L 50,55 L 75,55" stroke="#90A591" strokeWidth="2" strokeLinejoin="miter"/>
              {/* Divider line */}
              <line x1="50" y1="20" x2="50" y2="75" stroke="#90A591" strokeWidth="2" />
            </svg>
          </div>
          
          <h1 className="text-[32px] text-[#333333] mb-4 font-serif relative inline-block">
            Eu Gerencio<span className="text-[#C1A89F] ml-1">✦</span>
          </h1>
          
          <p className="text-[#666666] mb-8 text-sm leading-relaxed px-4 font-light">
            Acesse seu painel para gerenciar vendas, estoque e fiados de forma simples e rápida.
          </p>
          
          {/* Decorative icons line */}
          <div className="flex justify-center items-center gap-6 mb-12 relative">
            <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-gradient-to-r from-transparent via-[#C1A89F]/50 to-transparent -z-10" style={{ transform: 'translateY(10px) scaleY(10) scaleX(0.8)', borderRadius: '50%' }} />
            <svg className="w-6 h-6 text-[#555555]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <svg className="w-6 h-6 text-[#555555]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            <svg className="w-6 h-6 text-[#555555]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </div>
          
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="group w-full flex items-center justify-center gap-3 bg-[#A48F85] rounded-xl px-6 py-4 text-white font-medium hover:bg-[#8F7C73] transition-all shadow-[0_4px_14px_rgba(164,143,133,0.4)] disabled:opacity-50 disabled:cursor-not-allowed mb-4 cursor-pointer"
          >
            <div className="bg-white p-1 rounded">
              <svg className="w-5 h-5 transition-transform group-hover:scale-105" viewBox="0 0 48 48">
                <path fill="#555555" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#555555" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#555555" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#555555" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
            </div>
            <span className="text-[16px] font-normal">{isLoggingIn ? 'Autenticando...' : 'Continuar com Google'}</span>
          </button>

          {/* Aviso para membros de equipe convidados */}
          {pendingInvite ? (
            <div className="p-3.5 mb-6 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-left">
              <p className="text-xs font-bold text-emerald-950 dark:text-emerald-100 flex items-center gap-1.5">
                <span>🏢 Convite da Loja:</span>
                <span className="underline notranslate normal-case" translate="no">{pendingInvite.storeName || 'Estabelecimento'}</span>
              </p>
              <p className="text-xs text-foreground font-semibold mt-1 notranslate normal-case" translate="no">
                Olá, {pendingInvite.name}! ({pendingInvite.role})
              </p>
              <p className="text-[11px] text-[#444444] mt-1 leading-snug">
                Você <span className="font-bold underline">vai entrar pelo e-mail que foi convidado</span>: <span className="font-mono font-bold text-emerald-800">{pendingInvite.email}</span>. Ao entrar, sua sub-conta será ativada automaticamente.
              </p>
            </div>
          ) : (
            <div className="p-3 mb-6 rounded-2xl bg-[#90A591]/15 border border-[#90A591]/30 text-left">
              <p className="text-[11px] font-semibold text-[#3c3c3c]">
                💼 Convidado para a equipe?
              </p>
              <p className="text-[11px] text-[#555555] mt-0.5">
                Você <span className="font-bold underline">vai entrar pelo e-mail que foi convidado, enviado o convite</span>.
              </p>
            </div>
          )}

          <div className="text-center">
            <p className="text-[#666666] text-sm mb-4">
              Já tem uma conta? <button className="text-[#333333] font-medium hover:underline">Entrar com E-mail</button>
            </p>
            <div className="flex justify-center gap-4 text-xs text-[#999999]">
              <button onClick={() => setShowTerms(true)} className="hover:underline cursor-pointer">Termos de Uso</button>
              <button onClick={() => setShowPrivacy(true)} className="hover:underline cursor-pointer">Política de Privacidade</button>
            </div>
          </div>
        </motion.div>

        <TermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
        <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
      </div>
    );
  }

  if (!onboardingComplete && user) {
    return <Onboarding user={user} onComplete={() => setOnboardingComplete(true)} />;
  }

  return (
    <BrowserRouter>
      <EmployeeProvider>
        <Routes>
          <Route path="/" element={<Layout menuPinned={menuPinned} onToggleMenuPinned={() => setMenuPinned(previous => !previous)} />}>
            <Route index element={<Dashboard />} />
            <Route path="caixa" element={<POS />} />
            <Route path="estoque" element={<Stock />} />
            <Route path="compras" element={<Purchases />} />
            <Route path="precos" element={<Pricing />} />
            <Route path="fiado" element={<Debt />} />
            <Route path="movimentacoes" element={<Movements />} />
            <Route path="ajustes" element={<SettingsView />} />
            <Route path="tutorial" element={<Tutorial />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </EmployeeProvider>
    </BrowserRouter>
  );
}

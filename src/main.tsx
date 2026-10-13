import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppToast } from './components/AppToast';
import './index.css';
import { PreferencesProvider } from './lib/preferencesContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase, SUPABASE_REST_URL, SUPABASE_ANON_KEY, testSupabaseConnection } from './lib/supabase';

// Inicialização e diagnóstico da conexão Supabase no JavaScript principal
console.info('[Supabase] Conexão inicializada com sucesso:', {
  endpoint: SUPABASE_REST_URL,
  keyPreview: `${SUPABASE_ANON_KEY.slice(0, 15)}...`,
  status: 'online'
});

// Teste assíncrono de prontidão
testSupabaseConnection().then(res => {
  if (res.connected) {
    console.info('[Supabase] Diagnóstico de tabelas e permissões:', {
      PRODUTOS: res.produtosTableOk ? 'Disponível' : 'Pendente',
      MOVIMENTACOES: res.movimentacoesTableOk ? 'Disponível' : 'Pendente',
      RLS: res.rlsBlocked ? 'Atenção: RLS ativo bloqueando inserções anônimas (Erro 42501)' : 'Acesso liberado'
    });
  }
}).catch(console.warn);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PreferencesProvider>
        <App />
        <AppToast />
      </PreferencesProvider>
    </ErrorBoundary>
  </StrictMode>,
);

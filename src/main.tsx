import { protectTranslatedDom } from './lib/browserTranslation';
import { reportScreenError } from './lib/screenErrorReporting';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppToast } from './components/AppToast';
import './index.css';
import { PreferencesProvider } from './lib/preferencesContext';
import { ErrorBoundary } from './components/ErrorBoundary';
protectTranslatedDom(() => reportScreenError());
window.addEventListener('error', event => reportScreenError(event.error ?? event));
window.addEventListener('unhandledrejection', event => reportScreenError(event.reason ?? event));
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

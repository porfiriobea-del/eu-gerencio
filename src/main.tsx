import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppToast } from './components/AppToast';
import './index.css';
import { PreferencesProvider } from './lib/preferencesContext';
import { ErrorBoundary } from './components/ErrorBoundary';
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

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message?.toLowerCase() || '';
      const isNetwork = 
        errMsg.includes('offline') || 
        errMsg.includes('network') || 
        errMsg.includes('unavailable') ||
        errMsg.includes('could not reach') ||
        errMsg.includes('connection failed');

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#fdfcf7] text-[#191a26]">
          <div className="max-w-md w-full bg-white border-2 border-[#191a26] p-6 shadow-[4px_4px_0_#191a26] text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 border border-[#191a26]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <h2 className="text-xl font-bold mb-2 font-['Syne']">
              {isNetwork ? 'Conexão Instável' : 'Algo inesperado aconteceu'}
            </h2>
            
            <p className="text-sm text-gray-600 mb-6">
              {isNetwork
                ? 'O aplicativo está operando em modo offline. Seus dados continuam seguros e salvos localmente no seu aparelho.'
                : 'Não se preocupe, seus dados estão seguros. Recarregue a página para continuar normalmente.'}
            </p>

            <button
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#e8e6f5] hover:bg-[#d8d4ed] border-1.5 border-[#191a26] font-semibold text-sm transition-transform active:translate-x-0.5 active:translate-y-0.5"
            >
              <RefreshCw className="w-4 h-4" />
              Recarregar aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

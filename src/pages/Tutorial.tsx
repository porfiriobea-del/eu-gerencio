import { usePreferences } from '../lib/preferencesContext';
import { TutorialGuide } from '../components/TutorialGuide';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HelpCircle, MessageSquareQuote, BookOpen, Lightbulb } from 'lucide-react';
import { FeedbackSection } from '../components/FeedbackSection';
import { subscribeSettings } from '../lib/api';

export default function Tutorial() {
  const { v } = usePreferences();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'feedback' ? 'feedback' : searchParams.get('tab') === 'faq' ? 'faq' : 'guide';
  const [activeTab, setActiveTab] = useState<'guide' | 'feedback' | 'faq'>(initialTab);
  const [storeName, setStoreName] = useState('Eu Gerencio!');
  const [contactPhone, setContactPhone] = useState('');

  useEffect(() => {
    const unsub = subscribeSettings(s => {
      if (s) {
        if (s.storeName) setStoreName(s.storeName);
        if (s.phone) setContactPhone(s.phone);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    setActiveTab(tabParam === 'feedback' ? 'feedback' : tabParam === 'faq' ? 'faq' : 'guide');
  }, [searchParams]);

  const handleTabChange = (tab: 'guide' | 'feedback' | 'faq') => {
    setActiveTab(tab);
    setSearchParams(tab === 'guide' ? {} : { tab });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-palette-1 text-primary">
              <HelpCircle className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold font-heading text-foreground">
              {v('help.title')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Aprenda a tirar o máximo proveito do sistema e envie suas sugestões para melhorarmos juntos.
          </p>
        </div>

        {/* Tab Navigation Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => handleTabChange('guide')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            <span>Guia Passo a Passo</span>
          </button>

          <button
            type="button"
            id="help-feedback-tab-btn"
            onClick={() => handleTabChange('feedback')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'feedback'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquareQuote className="w-3.5 h-3.5" />
            <span>Enviar Meu Feedback</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('faq')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'faq'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            <span>Dúvidas Frequentes</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Enviar Feedback */}
      {activeTab === 'feedback' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <FeedbackSection 
            storeName={storeName} 
            defaultContact={contactPhone}
          />
        </div>
      )}

      {/* TAB 2: Guia Passo a Passo */}
      {activeTab === 'guide' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <TutorialGuide onClose={() => navigate('/')} />
        </div>
      )}

      {/* TAB 3: Perguntas Frequentes (FAQ) */}
      {activeTab === 'faq' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-foreground">
              O aplicativo continua funcionando se a internet cair?
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Você precisa de internet para salvar vendas e alterações na loja. Se a conexão cair, aguarde voltar e confira a confirmação antes de considerar a operação concluída.
            </p>
          </div>

          <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-foreground">
              Como funciona o cálculo do estoque de segurança?
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O sistema multiplica a sua <strong>venda média diária</strong> pelo <strong>tempo em dias que o fornecedor leva para entregar</strong> a mercadoria, adicionando uma margem protetiva de 25%. Dessa forma, você nunca fica sem mercadoria para vender nos fins de semana e feriados.
            </p>
          </div>

          <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-foreground">
              Como as taxas da maquininha afetam meus relatórios?
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Na aba de Ajustes, você define a porcentagem da sua maquininha (por exemplo, 3,5% no crédito e 1,5% no débito). O sistema calcula o dinheiro líquido real que entrará na sua conta bancária e deduz a taxa ao apresentar o lucro final nas exportações.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

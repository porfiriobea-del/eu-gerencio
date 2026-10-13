import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  HelpCircle, MessageSquareQuote, BookOpen, ShoppingCart, 
  Package, DollarSign, Users, Settings as SettingsIcon, 
  Lightbulb, ChevronRight, Phone, Mail, Sparkles 
} from 'lucide-react';
import { FeedbackSection } from '../components/FeedbackSection';
import { subscribeSettings } from '../lib/api';

export default function Tutorial() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'feedback' ? 'feedback' : 'guide';
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
    if (tabParam === 'feedback' && activeTab !== 'feedback') {
      setActiveTab('feedback');
    }
  }, [searchParams]);

  const handleTabChange = (tab: 'guide' | 'feedback' | 'faq') => {
    setActiveTab(tab);
    setSearchParams(tab === 'feedback' ? { tab: 'feedback' } : {});
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
              Central de Ajuda & Feedback
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Início */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-base">
                <span className="w-7 h-7 rounded-lg bg-palette-1 flex items-center justify-center text-xs">1</span>
                <h3>Início (Painel Diário)</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Veja o faturamento do dia em tempo real, confira o valor pendente no fiado e monitore itens que atingiram o estoque de segurança.
              </p>
            </div>

            {/* 2. Caixa */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-base">
                <span className="w-7 h-7 rounded-lg bg-palette-1 flex items-center justify-center text-xs">2</span>
                <h3>Caixa (Frente de Loja)</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Adicione itens com um clique. Ao fechar a venda, selecione Dinheiro, Cartão ou Caderneta (Fiado). O estoque baixa na hora!
              </p>
            </div>

            {/* 3. Estoque */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-base">
                <span className="w-7 h-7 rounded-lg bg-palette-1 flex items-center justify-center text-xs">3</span>
                <h3>Estoque & Consumo Diário</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cadastre suas mercadorias por fardo, pacote ou unidade. O sistema calcula a venda diária e sugere a compra de segurança.
              </p>
            </div>

            {/* 4. Preços */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-base">
                <span className="w-7 h-7 rounded-lg bg-palette-1 flex items-center justify-center text-xs">4</span>
                <h3>Preços & Margens</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Simule margens de lucro de 20%, 30% ou 40% com base no custo real pago na compra e atualize os preços de venda instantaneamente.
              </p>
            </div>

            {/* 5. Fiado */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-base">
                <span className="w-7 h-7 rounded-lg bg-palette-1 flex items-center justify-center text-xs">5</span>
                <h3>Fiado (Caderneta Digital)</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Substitua o caderninho de papel. Cada venda a prazo vai para o saldo do cliente e ao registrar o pagamento o valor é abatido.
              </p>
            </div>

            {/* 6. Ajustes & Relatórios */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-base">
                <span className="w-7 h-7 rounded-lg bg-palette-1 flex items-center justify-center text-xs">6</span>
                <h3>Ajustes & Taxas da Maquininha</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Configure as taxas de cartão de crédito e débito, altere o tema visual e exporte planilhas completas com vendas diárias.
              </p>
            </div>
          </div>
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
              Sim! O sistema possui tecnologia de operação offline. Você pode continuar registrando vendas, baixando estoque e fazendo lançamentos no caixa. Assim que o Wi-Fi ou sinal de dados retornar, o indicador na barra superior sincronizará todas as informações com a nuvem automaticamente.
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

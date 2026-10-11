import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, ChevronRight, ChevronLeft, X, Sparkles, 
  Lightbulb, CheckCircle2, ArrowRight, ExternalLink, HelpCircle 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface TourStep {
  id: string;
  targetId: string;
  title: string;
  badge: string;
  description: string;
  tip: string;
  actionUrl?: string;
  actionLabel?: string;
  preferredPlacement?: 'right' | 'bottom' | 'top' | 'left' | 'center';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard-summary',
    targetId: 'dashboard-summary-card',
    title: 'Resumo do Dia: Seu Bolso em Tempo Real',
    badge: 'Visão Geral Descomplicada',
    description: 'Aqui no Início você acompanha tudo o que acontece na sua loja hoje. Traduzimos termos contábeis complicados para o que realmente importa: "Dinheiro que entrou", "Dinheiro que saiu" e "O que sobrou no seu bolso"!',
    tip: 'Acompanhe se a sua meta diária de vendas foi atingida com a barrinha de progresso colorida!',
    preferredPlacement: 'bottom'
  },
  {
    id: 'nav-caixa',
    targetId: 'nav-item-caixa',
    title: 'Caixa: Onde você Realiza as Vendas',
    badge: 'O Coração da Loja',
    description: 'Quando um cliente chega no balcão, é aqui que a mágica acontece. Basta tocar nos produtos, escolher a forma de pagamento (dinheiro, cartão ou fiado) e o sistema calcula o troco e atualiza o estoque na hora!',
    tip: 'O caixa conta com fotos dos produtos e busca rápida para você atender a fila sem demora.',
    actionUrl: '/caixa',
    actionLabel: 'Ir para o Caixa',
    preferredPlacement: 'right'
  },
  {
    id: 'nav-estoque',
    targetId: 'nav-item-estoque',
    title: 'Estoque & Fotos das Mercadorias',
    badge: 'Controle de Produtos',
    description: 'Cadastre todos os produtos que você vende na loja. Adicione fotos reais, código de barras, preço de custo e preço de venda. O sistema calcula a sua margem de lucro sozinho!',
    tip: 'O sistema avisa automaticamente em amarelo e vermelho quando um produto estiver acabando na prateleira.',
    actionUrl: '/estoque',
    actionLabel: 'Ver Estoque',
    preferredPlacement: 'right'
  },
  {
    id: 'nav-compras',
    targetId: 'nav-item-compras',
    title: 'Compras & Entrada de Mercadorias',
    badge: 'Chegou Mercadoria?',
    description: 'Sempre que o caminhão do fornecedor chegar ou você for ao atacadista fazer compras, anote aqui! O estoque aumenta automaticamente e o gasto entra no "Dinheiro que saiu".',
    tip: 'Anotar as compras é o segredo para ter um relatório financeiro 100% fiel no fim do mês.',
    actionUrl: '/compras',
    actionLabel: 'Ver Compras',
    preferredPlacement: 'right'
  },
  {
    id: 'nav-fiado',
    targetId: 'nav-item-fiado',
    title: 'Caderneta de Fiado Digital',
    badge: 'Adeus Papelzinho!',
    description: 'Chega de anotar fiado em pedaço de papel que rasga ou some. Aqui você tem o nome de cada cliente de confiança, quanto ele deve e o histórico exato de cada item levado.',
    tip: 'Quando o cliente vier pagar uma parte, dê baixa em um clique com o botão "Abater Dívida"!',
    actionUrl: '/fiado',
    actionLabel: 'Ver Caderneta',
    preferredPlacement: 'right'
  },
  {
    id: 'nav-ajustes',
    targetId: 'nav-item-ajustes',
    title: 'Ajustes, Logotipo & Personalização',
    badge: 'Deixe com a Sua Cara',
    description: 'Personalize o sistema com a sua identidade! Adicione o logotipo do seu comércio, escolha as cores no menu suspenso de temas, ajuste o tamanho das letras e consulte relatórios completos.',
    tip: 'Todas as alterações que você faz aqui são salvas na nuvem automaticamente em tempo real.',
    actionUrl: '/ajustes',
    actionLabel: 'Abrir Ajustes',
    preferredPlacement: 'right'
  },
  {
    id: 'dashboard-pocket-tip',
    targetId: 'dashboard-pocket-tip',
    title: 'Dicas de Bolso: O Dia a Dia em 2 Passos',
    badge: 'Guia Rápido',
    description: 'Criamos esse guia simplificado para que qualquer funcionário ou familiar possa operar o comércio sem medo. Dois passos simples para vender e dois passos para registrar compras!',
    tip: 'Você concluiu o tour com sucesso! Pode reabrir este guia quando quiser pelo botão "Tour Guiado" no topo da página.',
    preferredPlacement: 'bottom'
  }
];

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
  initialStepIndex?: number;
}

export function GuidedTour({ isOpen, onClose, initialStepIndex = 0 }: GuidedTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [placement, setPlacement] = useState<'right' | 'bottom' | 'top' | 'left' | 'center'>('bottom');
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  const currentStep = TOUR_STEPS[currentStepIndex];

  // Função para recalcular posição e rolar o elemento para a visão
  const updatePosition = useCallback(() => {
    if (!isOpen || !currentStep) return;

    const el = document.getElementById(currentStep.targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      // Pequeno timeout para capturar após início de scroll
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);

        // Define o posicionamento inteligente baseado na largura da tela e na posição do elemento
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
          // Em telas móveis, posiciona abaixo ou centralizado
          setPlacement(rect.top > window.innerHeight - 260 ? 'top' : 'bottom');
        } else {
          // Em desktop, se o alvo for na sidebar à esquerda, posiciona à direita
          if (rect.left < 280) {
            setPlacement('right');
          } else if (rect.top > window.innerHeight - 280) {
            setPlacement('top');
          } else {
            setPlacement(currentStep.preferredPlacement || 'bottom');
          }
        }
      }, 120);
    } else {
      setTargetRect(null);
      setPlacement('center');
    }
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleResize = () => updatePosition();
      const handleScroll = () => {
        if (!currentStep) return;
        const el = document.getElementById(currentStep.targetId);
        if (el) setTargetRect(el.getBoundingClientRect());
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen, currentStepIndex, updatePosition]);

  // Suporte a teclas de atalho
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape') {
        handleFinish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStepIndex]);

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleFinish = () => {
    try {
      localStorage.setItem('eu_gerencio_guided_tour_completed', 'true');
    } catch {}
    onClose();
  };

  const handleNavigateToSection = (url?: string) => {
    if (url) {
      handleFinish();
      navigate(url);
    }
  };

  if (!isOpen || !currentStep) return null;

  // Cálculo das coordenadas da caixa de texto flutuante
  let tooltipStyle: React.CSSProperties = {};
  let arrowClass = '';

  const tooltipWidth = 380;
  const padding = 16;

  if (targetRect && placement !== 'center') {
    if (placement === 'right') {
      const top = Math.max(padding, Math.min(window.innerHeight - 380, targetRect.top - 20));
      const left = Math.min(window.innerWidth - tooltipWidth - padding, targetRect.right + 20);
      tooltipStyle = { top: `${top}px`, left: `${left}px`, position: 'fixed', width: `${tooltipWidth}px` };
      arrowClass = 'arrow-left';
    } else if (placement === 'bottom') {
      const top = Math.min(window.innerHeight - 360, targetRect.bottom + 20);
      const left = Math.max(padding, Math.min(window.innerWidth - tooltipWidth - padding, targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2)));
      tooltipStyle = { top: `${top}px`, left: `${left}px`, position: 'fixed', width: `${tooltipWidth}px` };
      arrowClass = 'arrow-top';
    } else if (placement === 'top') {
      const top = Math.max(padding, targetRect.top - 360);
      const left = Math.max(padding, Math.min(window.innerWidth - tooltipWidth - padding, targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2)));
      tooltipStyle = { top: `${top}px`, left: `${left}px`, position: 'fixed', width: `${tooltipWidth}px` };
      arrowClass = 'arrow-bottom';
    } else if (placement === 'left') {
      const top = Math.max(padding, Math.min(window.innerHeight - 380, targetRect.top - 20));
      const left = Math.max(padding, targetRect.left - tooltipWidth - 20);
      tooltipStyle = { top: `${top}px`, left: `${left}px`, position: 'fixed', width: `${tooltipWidth}px` };
      arrowClass = 'arrow-right';
    }
  } else {
    // Centralizado caso elemento não seja medido ou em telas muito pequenas
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '90%',
      maxWidth: '420px'
    };
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 pointer-events-auto select-none">
        {/* Backdrop escurecido */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          onClick={handleFinish}
        />

        {/* Efeito Spotlight / Moldura de Destaque ao redor do elemento alvo */}
        {targetRect && (
          <motion.div
            layoutId="tour-spotlight"
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed pointer-events-none rounded-2xl ring-4 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] z-50"
            style={{
              top: `${targetRect.top - 6}px`,
              left: `${targetRect.left - 6}px`,
              width: `${targetRect.width + 12}px`,
              height: `${targetRect.height + 12}px`,
            }}
          >
            {/* Efeito de pulso animado na borda */}
            <div className="absolute -inset-1 rounded-2xl border-2 border-primary animate-ping opacity-30 pointer-events-none" />
          </motion.div>
        )}

        {/* SETA INDICATIVA FLUTUANTE (Apontando diretamente para o botão) */}
        {targetRect && placement === 'right' && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            className="fixed z-50 pointer-events-none text-primary flex items-center gap-1.5"
            style={{
              top: `${Math.max(16, targetRect.top + targetRect.height / 2 - 16)}px`,
              left: `${targetRect.right + 6}px`
            }}
          >
            <div className="w-0 h-0 border-y-8 border-y-transparent border-r-12 border-r-primary drop-shadow-md" />
            <span className="hidden sm:inline-block bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
              Olhe aqui
            </span>
          </motion.div>
        )}

        {targetRect && placement === 'bottom' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            className="fixed z-50 pointer-events-none text-primary flex flex-col items-center"
            style={{
              top: `${targetRect.bottom + 4}px`,
              left: `${targetRect.left + targetRect.width / 2 - 8}px`
            }}
          >
            <div className="w-0 h-0 border-x-8 border-x-transparent border-b-12 border-b-primary drop-shadow-md" />
          </motion.div>
        )}

        {targetRect && placement === 'top' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            className="fixed z-50 pointer-events-none text-primary flex flex-col items-center"
            style={{
              top: `${targetRect.top - 18}px`,
              left: `${targetRect.left + targetRect.width / 2 - 8}px`
            }}
          >
            <div className="w-0 h-0 border-x-8 border-x-transparent border-t-12 border-t-primary drop-shadow-md" />
          </motion.div>
        )}

        {/* CAIXA DE TEXTO AMIGÁVEL (Card do Tour) */}
        <div style={tooltipStyle} className="z-50" ref={cardRef}>
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.2 }}
            className="bg-surface text-foreground rounded-2xl shadow-2xl border-2 border-primary/40 overflow-hidden"
          >
            {/* Topo do Card com Badge e Controles */}
            <div className="p-4 sm:p-5 pb-3">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-palette-1 text-primary border border-primary/20 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {currentStep.badge}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Passo {currentStepIndex + 1} de {TOUR_STEPS.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Fechar tour (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Título Amigável */}
              <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2 leading-snug">
                <span>{currentStep.title}</span>
              </h3>

              {/* Descrição em Linguagem Clara e Direta */}
              <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                {currentStep.description}
              </p>

              {/* Dica de Ouro */}
              <div className="mt-3.5 p-3 rounded-xl bg-palette-1/40 border border-primary/20 flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-snug font-medium">
                  {currentStep.tip}
                </p>
              </div>

              {/* Botão de Ação Opcional (Ir direto para a tela) */}
              {currentStep.actionUrl && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => handleNavigateToSection(currentStep.actionUrl)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline hover:text-primary/80 transition-colors cursor-pointer"
                  >
                    <span>{currentStep.actionLabel || 'Conhecer esta tela agora'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Barra de Progresso em Pontinhos */}
            <div className="px-4 sm:px-5 py-1.5 bg-muted/40 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {TOUR_STEPS.map((step, idx) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setCurrentStepIndex(idx)}
                    title={`Ir para passo ${idx + 1}: ${step.title}`}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      idx === currentStepIndex
                        ? 'w-6 bg-primary'
                        : idx < currentStepIndex
                        ? 'w-2 bg-primary/40'
                        : 'w-2 bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">
                {Math.round(((currentStepIndex + 1) / TOUR_STEPS.length) * 100)}% concluído
              </span>
            </div>

            {/* Rodapé de Ações: Pular, Anterior e Próximo */}
            <div className="p-3 sm:p-4 bg-muted/20 border-t border-border flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleFinish}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Pular Tour
              </button>

              <div className="flex items-center gap-2">
                {currentStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="px-3 py-1.5 rounded-xl border border-border text-foreground hover:bg-muted text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                >
                  {currentStepIndex === TOUR_STEPS.length - 1 ? (
                    <>
                      <span>Concluir Tour</span>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>Próximo</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}

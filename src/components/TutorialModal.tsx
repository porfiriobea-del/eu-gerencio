import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, ShoppingCart, ChevronRight, X, Check } from 'lucide-react';

export function TutorialModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('tutorialCompleted');
    if (!hasSeenTutorial) {
      // Delay slightly to not interrupt initial render aggressively
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('tutorialCompleted', 'true');
  };

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
    else handleClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden z-10"
          >
            <div className="p-6">
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <div className="flex justify-center mb-6">
                  {step === 1 && (
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                      <span className="text-3xl">👋</span>
                    </div>
                  )}
                  {step === 2 && (
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                      <Package className="w-8 h-8" />
                    </div>
                  )}
                  {step === 3 && (
                    <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center">
                      <ShoppingCart className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
                  {step === 1 && "Bem-vindo ao Eu Gerencio!"}
                  {step === 2 && "1. Cadastre seu Estoque"}
                  {step === 3 && "2. Realize sua 1ª Venda"}
                </h2>
                
                <p className="text-center text-gray-500 leading-relaxed">
                  {step === 1 && "Vamos fazer um tour rápido de 1 minuto para te mostrar como é fácil começar a gerenciar o seu negócio."}
                  {step === 2 && "Acesse o menu 'Estoque' e clique em 'Novo Produto'. Preencha o nome, preço de custo e quantidade. Isso é essencial para acompanhar seus lucros!"}
                  {step === 3 && "Vá para o menu 'Caixa', busque pelo produto que acabou de cadastrar e finalize a venda. O valor será contabilizado no seu faturamento diário."}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={nextStep}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {step < 3 ? (
                    <>Próximo <ChevronRight className="w-4 h-4" /></>
                  ) : (
                    <>Começar agora <Check className="w-4 h-4" /></>
                  )}
                </button>
                {step < 3 && (
                  <button
                    onClick={handleClose}
                    className="w-full py-2 px-4 text-gray-500 hover:text-gray-700 hover:bg-gray-100 font-medium rounded-xl transition-colors text-sm"
                  >
                    Pular tutorial
                  </button>
                )}
              </div>
            </div>
            
            {/* Progress indicators */}
            <div className="bg-gray-50 p-4 flex justify-center gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? "w-6 bg-blue-600" : "w-1.5 bg-gray-300"
                  }`}
                />
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

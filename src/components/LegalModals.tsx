import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function LegalModal({ isOpen, onClose, title, children }: LegalModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden z-10 max-h-[80vh] flex flex-col"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">{title}</h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 text-gray-600 text-sm space-y-4">
              {children}
            </div>
            
            <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Entendi
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function TermsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  return (
    <LegalModal isOpen={isOpen} onClose={onClose} title="Termos de Uso">
      <h3 className="font-semibold text-gray-800 text-base">1. Aceitação dos Termos</h3>
      <p>Ao acessar e usar o aplicativo Eu Gerencio, você concorda em cumprir estes termos de serviço. Se você não concordar com alguma parte destes termos, não deverá usar o aplicativo.</p>

      <h3 className="font-semibold text-gray-800 text-base mt-4">2. Uso do Aplicativo</h3>
      <p>O aplicativo é fornecido "no estado em que se encontra", para uso pessoal ou comercial na gestão de estoque, vendas e clientes.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Você é responsável por manter a confidencialidade de sua conta.</li>
        <li>Você concorda em fornecer informações verdadeiras e exatas sobre seu comércio.</li>
        <li>É proibido o uso do aplicativo para fins ilegais.</li>
      </ul>

      <h3 className="font-semibold text-gray-800 text-base mt-4">3. Limitação de Responsabilidade</h3>
      <p>O Eu Gerencio não se responsabiliza por perdas de lucros, dados ou outras perdas intangíveis resultantes do uso ou da incapacidade de usar o serviço. Recomendamos conferências regulares dos dados inseridos.</p>

      <h3 className="font-semibold text-gray-800 text-base mt-4">4. Modificações dos Termos</h3>
      <p>Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão notificadas através do aplicativo.</p>
    </LegalModal>
  );
}

export function PrivacyModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  return (
    <LegalModal isOpen={isOpen} onClose={onClose} title="Política de Privacidade">
      <h3 className="font-semibold text-gray-800 text-base">1. Coleta de Dados</h3>
      <p>Coletamos informações que você fornece diretamente, como nome da loja, e-mail (via autenticação Google) e os dados inseridos (produtos, vendas e clientes).</p>

      <h3 className="font-semibold text-gray-800 text-base mt-4">2. Uso das Informações</h3>
      <p>Seus dados são utilizados exclusivamente para:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Fornecer, manter e melhorar o aplicativo.</li>
        <li>Sincronizar seus dados entre seus dispositivos usando infraestrutura do Supabase.</li>
        <li>Permitir a funcionalidade offline.</li>
      </ul>

      <h3 className="font-semibold text-gray-800 text-base mt-4">3. Proteção de Dados</h3>
      <p>Implementamos medidas de segurança rígidas (políticas de acesso por loja no Supabase e autenticação do Google) para garantir que apenas você tenha acesso aos dados da sua conta. Nós não vendemos seus dados para terceiros.</p>

      <h3 className="font-semibold text-gray-800 text-base mt-4">4. Seus Direitos</h3>
      <p>Você tem o direito de acessar, corrigir ou excluir seus dados pessoais a qualquer momento, diretamente através das configurações do aplicativo ou entrando em contato com o suporte.</p>
    </LegalModal>
  );
}

import { useState } from 'react';
import { User } from 'firebase/auth';
import { saveStoreProfile, addMultipleProducts } from '../lib/api';
import { 
  Store, Building2, Phone, CheckCircle2, Mail, ExternalLink, ArrowRight, ArrowLeft, 
  Sparkles, Check, HelpCircle, Wrench, Utensils, ShoppingBag, Plus, X, Layers, RotateCcw, AlertCircle
} from 'lucide-react';
import { openWelcomeEmail, getGmailComposeUrl } from '../lib/emailNotification';
import { usePreferences, LANGUAGE_MODE_INFOS, LanguageMode } from '../lib/preferencesContext';
import { BUSINESS_SECTORS, BusinessSector, setCustomCategories, saveBusinessSector } from '../lib/categories';
import { PRELOADED_PRODUCTS } from '../lib/preloadedProducts';
import { Product } from '../types';

export default function Onboarding({ user, onComplete }: { user: User, onComplete: () => void }) {
  const { languageMode, setLanguageMode } = usePreferences();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [storeName, setStoreName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const email = user.email || '';

  // Sector selection & categories customization
  const [selectedSectorId, setSelectedSectorId] = useState<string>('mercearia');
  const [sectorCategories, setSectorCategories] = useState<string[]>(() => {
    const defaultSector = BUSINESS_SECTORS.find(s => s.id === 'mercearia');
    return defaultSector ? [...defaultSector.suggestedCategories] : [];
  });
  const [newCatInput, setNewCatInput] = useState('');
  const [shouldPreloadProducts, setShouldPreloadProducts] = useState(true);

  // Language Mode
  const [selectedMode, setSelectedMode] = useState<LanguageMode>(languageMode || 'neutral');
  
  // Status states
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [emailOpened, setEmailOpened] = useState(false);
  const [createdProductsCount, setCreatedProductsCount] = useState<number>(0);

  const selectedSector = BUSINESS_SECTORS.find(s => s.id === selectedSectorId) || BUSINESS_SECTORS[0];

  const handleSelectSector = (sector: BusinessSector) => {
    setSelectedSectorId(sector.id);
    setSectorCategories([...sector.suggestedCategories]);
    setShouldPreloadProducts(sector.suggestProductsPreload ?? false);
  };

  const handleRemoveCategory = (catToRemove: string) => {
    setSectorCategories(prev => prev.filter(c => c.toLowerCase() !== catToRemove.toLowerCase()));
  };

  const handleAddCategory = () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    if (sectorCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewCatInput('');
      return;
    }
    setSectorCategories(prev => [...prev, trimmed]);
    setNewCatInput('');
  };

  const handleResetSectorCategories = () => {
    if (selectedSector) {
      setSectorCategories([...selectedSector.suggestedCategories]);
    }
  };

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) return;
    setStep(2);
  };

  const handleNextStep2 = () => {
    if (sectorCategories.length === 0) {
      alert('Mantenha ao menos uma categoria cadastrada para o seu comércio.');
      return;
    }
    setStep(3);
  };

  const handleFinalSubmit = async () => {
    if (!storeName.trim()) return;
    setIsSaving(true);
    try {
      // 1. Apply chosen mode immediately to context and localStorage
      setLanguageMode(selectedMode);

      // 2. Save business sector and customized categories
      saveBusinessSector(selectedSectorId);
      setCustomCategories(sectorCategories);

      // 3. Save store profile in Firestore settings
      await saveStoreProfile({ 
        storeName: storeName.trim(), 
        cnpj: cnpj.trim(), 
        phone: phone.trim(), 
        email,
        languageMode: selectedMode,
        businessSector: selectedSectorId
      });

      // 4. If merchant chose to pre-load products (e.g. for Mercearia)
      let preloadedCount = 0;
      if (shouldPreloadProducts && PRELOADED_PRODUCTS.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const payload: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[] = PRELOADED_PRODUCTS.map(p => ({
          name: p.name,
          type: p.type,
          category: p.category,
          purchaseForm: p.purchaseForm,
          unitsPerPackage: p.unitsPerPackage,
          unitCost: p.unitCost,
          stock: p.stock,
          safetyStock: p.safetyStock,
          maxStock: p.maxStock,
          initialStock: p.initialStock,
          initialStockDate: todayStr,
          dailyAverageSales: p.dailyAverageSales,
          replacementDays: p.replacementDays,
          basePrice: p.basePrice,
          pricePackage: p.pricePackage,
          pricePack: p.pricePack,
          priceCart: p.priceCart,
          priceHalfCart: p.priceHalfCart,
          priceUnit: p.priceUnit
        }));

        preloadedCount = await addMultipleProducts(payload);
        setCreatedProductsCount(preloadedCount);
      }

      setIsCompleted(true);
    } catch (err: any) {
      console.error('Error during onboarding submit:', err);
      alert('Erro ao salvar configurações do comércio: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendEmail = () => {
    openWelcomeEmail({
      storeName: storeName.trim(),
      email,
      cnpj: cnpj.trim(),
      phone: phone.trim(),
    });
    setEmailOpened(true);
  };

  const handleOpenGmail = () => {
    const gmailUrl = getGmailComposeUrl({
      storeName: storeName.trim(),
      email,
      cnpj: cnpj.trim(),
      phone: phone.trim(),
    });
    window.open(gmailUrl, '_blank');
    setEmailOpened(true);
  };

  const currentModeInfo = LANGUAGE_MODE_INFOS.find(m => m.id === selectedMode) || LANGUAGE_MODE_INFOS[1];

  const getSectorIcon = (iconName: string) => {
    switch (iconName) {
      case 'store': return <Store className="w-5 h-5" />;
      case 'wrench': return <Wrench className="w-5 h-5" />;
      case 'utensils': return <Utensils className="w-5 h-5" />;
      case 'shopping-bag': return <ShoppingBag className="w-5 h-5" />;
      default: return <Sparkles className="w-5 h-5" />;
    }
  };

  if (isCompleted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-xl w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Conta Criada com Sucesso!</h1>
          <p className="text-gray-600 text-sm mb-6">
            O comércio <span className="font-semibold text-gray-900">{storeName}</span> já está configurado no setor <strong className="text-gray-900">{selectedSector.name}</strong> e pronto para operar.
          </p>

          {/* Destaque dos Produtos Pré-Cadastrados */}
          {createdProductsCount > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-left mb-5">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm mb-1">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>{createdProductsCount} Produtos Pré-Cadastrados com Valores de Venda!</span>
              </div>
              <p className="text-xs text-emerald-800">
                Os produtos das marcas mais vendidas (cigarros com preços nos 4 formatos, bebidas, doces e tabacaria) já foram inseridos no seu estoque. Tudo pronto para você fazer a contagem e editar quando quiser!
              </p>
            </div>
          )}

          {/* Destaque do Setor e Categorias */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Setor & Categorias Ativas</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {selectedSector.name}
              </span>
            </div>
            <p className="text-xs text-gray-600">
              {sectorCategories.length} categorias configuradas ({sectorCategories.slice(0, 4).join(', ')}...). Você pode gerenciar mais em Ajustes.
            </p>
          </div>

          {/* Destaque do Modo de Linguagem */}
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-left mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">Linguagem Ativada</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${currentModeInfo.badgeColor}`}>
                {currentModeInfo.badge}
              </span>
            </div>
            <h3 className="text-sm font-bold text-purple-950">{currentModeInfo.name}</h3>
            <p className="text-xs text-purple-800 mt-0.5">{currentModeInfo.tagline}</p>
          </div>

          {/* Confirmação por e-mail */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-left mb-6">
            <div className="flex items-center gap-2 text-blue-900 font-semibold text-sm mb-1">
              <Mail className="w-4 h-4 text-blue-600" />
              <span>Confirmação da Conta por E-mail</span>
            </div>
            <p className="text-xs text-blue-700 mb-3">
              Envie um resumo de confirmação e acesso para <strong className="font-medium text-blue-900">{email}</strong>.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleSendEmail}
                className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Mail className="w-3.5 h-3.5" />
                {emailOpened ? 'E-mail Aberto / Reenviar' : 'Enviar Confirmação'}
              </button>

              <button
                type="button"
                onClick={handleOpenGmail}
                className="py-2.5 px-3 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                Abrir no Gmail
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onComplete}
            className="w-full py-4 px-4 bg-gray-900 hover:bg-black text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <span>Acessar o Painel do Comércio</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 sm:p-6">
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl max-w-2xl w-full border border-gray-100">
        
        {/* Step Indicator Header (3 Steps) */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <button 
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              step === 1 ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/20 text-center text-[10px] leading-4 inline-block font-bold">1</span>
            <span>Dados</span>
          </button>

          <span className="w-4 h-0.5 bg-gray-200" />

          <button 
            type="button"
            disabled={!storeName.trim()}
            onClick={() => storeName.trim() && setStep(2)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-40 ${
              step === 2 ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/20 text-center text-[10px] leading-4 inline-block font-bold">2</span>
            <span>Setor & Categorias</span>
          </button>

          <span className="w-4 h-0.5 bg-gray-200" />

          <button 
            type="button"
            disabled={!storeName.trim() || sectorCategories.length === 0}
            onClick={() => storeName.trim() && sectorCategories.length > 0 && setStep(3)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-40 ${
              step === 3 ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/20 text-center text-[10px] leading-4 inline-block font-bold">3</span>
            <span>Linguagem</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* STEP 1: DADOS DO COMÉRCIO */}
        {/* ======================================================== */}
        {step === 1 && (
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Store className="w-7 h-7" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Bem-vindo ao Eu Gerencio!</h1>
              <p className="text-gray-500 text-sm">Etapa 1: Informe o nome do seu comércio para começar.</p>
            </div>

            <form onSubmit={handleNextStep1} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Comércio *</label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input 
                    required
                    maxLength={100}
                    value={storeName} 
                    onChange={e => setStoreName(e.target.value)} 
                    placeholder="Ex: Mercearia Esperança, Mercearia e Tabacaria Central" 
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs text-sm font-medium outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ (Opcional)</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                      maxLength={20}
                      value={cnpj} 
                      onChange={e => setCnpj(e.target.value)} 
                      placeholder="00.000.000/0001-00" 
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs text-sm outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Celular / WhatsApp (Opcional)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                      maxLength={20}
                      value={phone} 
                      onChange={e => setPhone(e.target.value)} 
                      placeholder="(00) 00000-0000" 
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Acesso</label>
                <input 
                  disabled
                  value={email} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 shadow-xs text-sm cursor-not-allowed"
                />
                <p className="text-[11px] text-gray-400 mt-1">E-mail autenticado com sua conta Google.</p>
              </div>

              <button 
                type="submit"
                disabled={!storeName.trim()}
                className="w-full py-3.5 mt-2 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Avançar: Escolher Setor do Comércio</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 2: QUAL O SETOR DO SEU COMÉRCIO? */}
        {/* ======================================================== */}
        {step === 2 && (
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Layers className="w-7 h-7" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Qual o setor do seu comércio?</h1>
              <p className="text-gray-500 text-xs sm:text-sm max-w-lg mx-auto">
                Selecione o segmento para preparar um modelo de categorias pronto. Você pode personalizar, adicionar ou excluir categorias como quiser!
              </p>
            </div>

            {/* Grid de Setores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {BUSINESS_SECTORS.map((sector) => {
                const isSelected = selectedSectorId === sector.id;
                return (
                  <div
                    key={sector.id}
                    onClick={() => handleSelectSector(sector)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl shrink-0 ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {getSectorIcon(sector.iconName)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-gray-900">{sector.name}</h3>
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{sector.tagline}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Categorias Sugeridas do Modelo Escolhido */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Modelo de Categorias para {selectedSector.name}</span>
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Clique no <strong>(✕)</strong> para remover o que você não vende ou adicione novas abaixo:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetSectorCategories}
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                  title="Restaurar lista padrão sugerida"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar sugestões</span>
                </button>
              </div>

              {/* Tags Interativas de Categorias */}
              <div className="flex flex-wrap gap-1.5 mb-3.5">
                {sectorCategories.map(cat => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-white border border-gray-200 text-gray-800 shadow-2xs group"
                  >
                    <span>{cat}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(cat)}
                      className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-0.5 rounded-full transition-colors cursor-pointer"
                      title={`Excluir categoria "${cat}"`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {sectorCategories.length === 0 && (
                  <p className="text-xs text-red-500 italic">
                    Nenhuma categoria selecionada. Adicione ao menos uma abaixo.
                  </p>
                )}
              </div>

              {/* Input para adicionar mais categorias */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ex: Laticínios, Congelados, Tabacos Especiais..."
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  disabled={!newCatInput.trim()}
                  className="px-3 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Adicionar</span>
                </button>
              </div>

              {/* Opção de pré-carregar produtos prontos */}
              {selectedSectorId === 'mercearia' && (
                <div className="mt-4 pt-3.5 border-t border-gray-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shouldPreloadProducts}
                      onChange={(e) => setShouldPreloadProducts(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Pré-carregar modelo de produtos prontos das marcas líderes
                      </span>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Já cadastra no estoque os produtos das fotos (cigarros com preços de carteira/maço/avulso, bebidas, doces e mercearia) com todos os valores de venda certinhos. O estoque fica pronto para você fazer a contagem e editar!
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Botões de Navegação */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-3 px-4 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar</span>
              </button>

              <button
                type="button"
                onClick={handleNextStep2}
                disabled={sectorCategories.length === 0}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Avançar: Sistema de Linguagem</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 3: SISTEMA PERSONALIZADO DE LINGUAGEM */}
        {/* ======================================================== */}
        {step === 3 && (
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-7 h-7" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Como você quer ver as palavras?</h1>
              <p className="text-gray-600 text-xs sm:text-sm max-w-lg mx-auto">
                Escolha o estilo de linguagem do sistema. Você poderá alternar a qualquer momento nos Ajustes.
              </p>
            </div>

            {/* Seleção dos Modos de Linguagem */}
            <div className="space-y-3 mb-6">
              {LANGUAGE_MODE_INFOS.map((mode) => {
                const isSelected = selectedMode === mode.id;
                return (
                  <div
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id as LanguageMode)}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-900">{mode.name}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mode.badgeColor}`}>
                              {mode.badge}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{mode.tagline}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2.5 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-gray-500">
                      {mode.examples.slice(0, 3).map((ex, idx) => (
                        <div key={idx}>
                          <span className="text-gray-400 block text-[9px] uppercase">{ex.concept}</span>
                          <strong className="text-gray-700">{ex.term}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumo antes de concluir */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 mb-6 text-xs text-gray-600 flex items-center justify-between">
              <div>
                <span>Comércio: <strong>{storeName}</strong></span>
                <span className="mx-2">•</span>
                <span>Setor: <strong>{selectedSector.name}</strong></span>
              </div>
              {shouldPreloadProducts && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  ✓ Produtos das fotos inclusos
                </span>
              )}
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={isSaving}
                className="py-3 px-4 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar</span>
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSaving}
                className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm transition-colors shadow-md shadow-purple-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <span>Configurando Comércio...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Concluir Cadastro & Começar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

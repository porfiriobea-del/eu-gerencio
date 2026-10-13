import { useState, useId, useRef } from 'react';
import { 
  X, Sparkles, Check, CheckCircle2, Image as ImageIcon, Upload, Trash2, 
  Plus, AlertCircle, ShoppingBag, Layers, Filter, Eye, Camera, Loader2, RefreshCw, Wand2 
} from 'lucide-react';
import { PRELOADED_PRODUCTS, PreloadedProduct } from '../lib/preloadedProducts';
import { addMultipleProducts, recordMovement } from '../lib/api';
import { usePreferences } from '../lib/preferencesContext';
import { Product } from '../types';
import { recognizeProductFromImage } from '../lib/geminiProductScanner';

interface PreAddProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  existingProductNames: string[];
}

export function PreAddProductsModal({ isOpen, onClose, onSuccess, existingProductNames }: PreAddProductsModalProps) {
  const { v, isBasicMode } = usePreferences();
  const fileInputId = useId();
  
  const [activeTab, setActiveTab] = useState<'catalog' | 'images'>('catalog');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(() => {
    // By default, select all products that aren't already registered
    const initial: Record<string, boolean> = {};
    const existingLower = new Set(existingProductNames.map(n => n.toLowerCase().trim()));
    PRELOADED_PRODUCTS.forEach(p => {
      if (!existingLower.has(p.name.toLowerCase().trim())) {
        initial[p.name] = true;
      }
    });
    return initial;
  });

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initQty: Record<string, number> = {};
    PRELOADED_PRODUCTS.forEach(p => {
      initQty[p.name] = p.suggestedQty || p.stock || 10;
    });
    return initQty;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // States for Image Import Tab
  const [uploadedImages, setUploadedImages] = useState<{ id: string; name: string; url: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<string | null>(null);

  const [customDrafts, setCustomDrafts] = useState<Array<{
    id: string;
    name: string;
    category: string;
    type: 'comum' | 'cigarro';
    unitCost: number;
    basePrice: number;
    stock: number;
    unitsPerPackage: number;
    purchaseForm: 'pacote' | 'fardo' | 'unidade';
    imageUrl?: string;
    aiDetected?: boolean;
    barcode?: string;
  }>>([
    {
      id: 'd-1',
      name: '',
      category: 'Diversos',
      type: 'comum',
      unitCost: 0,
      basePrice: 0,
      stock: 0,
      unitsPerPackage: 1,
      purchaseForm: 'unidade'
    }
  ]);

  if (!isOpen) return null;

  const existingLowerSet = new Set(existingProductNames.map(n => n.toLowerCase().trim()));

  const filteredProducts = PRELOADED_PRODUCTS.filter(p => {
    if (selectedCategory === 'Todas') return true;
    return p.category === selectedCategory;
  });

  const categories = ['Todas', ...Array.from(new Set(PRELOADED_PRODUCTS.map(p => p.category)))];

  const toggleItem = (name: string) => {
    setSelectedItems(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const selectAll = (enable: boolean) => {
    const next = { ...selectedItems };
    filteredProducts.forEach(p => {
      if (!existingLowerSet.has(p.name.toLowerCase().trim())) {
        next[p.name] = enable;
      }
    });
    setSelectedItems(next);
  };

  const selectAllAllCategories = (enable: boolean) => {
    const next = { ...selectedItems };
    PRELOADED_PRODUCTS.forEach(p => {
      if (!existingLowerSet.has(p.name.toLowerCase().trim())) {
        next[p.name] = enable;
      }
    });
    setSelectedItems(next);
  };

  const selectedCount = Object.keys(selectedItems).filter(name => selectedItems[name]).length;
  const unaddedTotalCatalogCount = PRELOADED_PRODUCTS.filter(p => !existingLowerSet.has(p.name.toLowerCase().trim())).length;

  const handleAddSelectedCatalog = async () => {
    const toAdd = PRELOADED_PRODUCTS.filter(p => selectedItems[p.name]);
    if (toAdd.length === 0) return;

    setIsSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const payload: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[] = toAdd.map(p => {
        const customStock = quantities[p.name] !== undefined ? quantities[p.name] : p.stock;
        return {
          name: p.name,
          type: p.type,
          category: p.category,
          purchaseForm: p.purchaseForm,
          stockUnit: p.type === 'cigarro' ? 'carteira' : 'unidade',
          unitsPerPackage: p.type === 'cigarro' ? 10 : p.unitsPerPackage,
          unitCost: p.type === 'cigarro' ? p.unitCost * 20 : p.unitCost,
          stock: customStock,
          safetyStock: p.type === 'cigarro' ? p.safetyStock/20 : p.safetyStock,
          maxStock: p.type === 'cigarro' && p.maxStock !== undefined ? p.maxStock/20 : p.maxStock,
          initialStock: customStock,
          initialStockDate: todayStr,
          dailyAverageSales: p.type === 'cigarro' ? p.dailyAverageSales/20 : p.dailyAverageSales,
          replacementDays: p.replacementDays,
          basePrice: p.basePrice,
          pricePackage: p.pricePackage,
          pricePack: p.pricePack,
          priceCart: p.priceCart,
          priceHalfCart: p.priceHalfCart,
          priceUnit: p.priceUnit
        };
      });

      const count = await addMultipleProducts(payload);
      recordMovement({
        type: 'product_create',
        description: `Importação em massa: +${count} produtos do catálogo pré-cadastrado adicionados ao estoque.`,
        quantity: count
      }).catch(() => {});

      setFeedbackMessage(`${count} produtos adicionados com sucesso ao estoque!`);
      setTimeout(() => {
        onSuccess(count);
        onClose();
      }, 1000);
    } catch (err: any) {
      alert('Erro ao adicionar produtos: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Image handling and AI product recognition
  const processImageWithAI = async (dataUrl: string, fileName?: string) => {
    setIsScanningAI(true);
    setScanningStatus('Lendo foto do produto com inteligência artificial...');
    try {
      const recognized = await recognizeProductFromImage(dataUrl, categories.filter(c => c !== 'Todas'));
      
      setCustomDrafts(prev => {
        // If there's only 1 initial blank draft, replace it
        const hasOnlyBlank = prev.length === 1 && prev[0].name.trim() === '';
        const newDraft = {
          id: `d-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: recognized.name,
          category: recognized.category || 'Diversos',
          type: 'comum' as const,
          unitCost: 0,
          basePrice: 0,
          stock: 0,
          unitsPerPackage: 1,
          purchaseForm: 'unidade' as const,
          imageUrl: dataUrl,
          aiDetected: true,
          barcode: ''
        };
        return hasOnlyBlank ? [newDraft] : [...prev, newDraft];
      });

      setScanningStatus(`✓ Identificado com sucesso: "${recognized.name}" (${recognized.category})`);
      setTimeout(() => setScanningStatus(null), 5000);
    } catch (err: any) {
      console.warn('AI recognition failed:', err);
      // Still add a line with the image so the user can easily write the values
      setCustomDrafts(prev => {
        const hasOnlyBlank = prev.length === 1 && prev[0].name.trim() === '';
        const newDraft = {
          id: `d-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: fileName ? fileName.replace(/\.[^/.]+$/, "") : '',
          category: 'Diversos',
          type: 'comum' as const,
          unitCost: 0,
          basePrice: 0,
          stock: 0,
          unitsPerPackage: 1,
          purchaseForm: 'unidade' as const,
          imageUrl: dataUrl
        };
        return hasOnlyBlank ? [newDraft] : [...prev, newDraft];
      });
      setScanningStatus((err instanceof Error ? err.message : 'Não foi possível ler a imagem.') + ' Preencha os dados na tabela.');
      setTimeout(() => setScanningStatus(null), 5000);
    } finally {
      setIsScanningAI(false);
    }
  };

  const handleImageFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dataUrl = event.target.result as string;
          setUploadedImages(prev => [
            ...prev,
            {
              id: `${Date.now()}-${idx}`,
              name: file.name,
              url: dataUrl
            }
          ]);
          // Run AI auto-reading
          processImageWithAI(dataUrl, file.name);
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset file input so same file can be selected again
    e.target.value = '';
  };

  const removeUploadedImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  const addCustomDraft = () => {
    setCustomDrafts(prev => [
      ...prev,
      {
        id: `d-${Date.now()}`,
        name: '',
        category: 'Diversos',
        type: 'comum',
        unitCost: 0,
        basePrice: 0,
        stock: 0,
        unitsPerPackage: 1,
        purchaseForm: 'unidade'
      }
    ]);
  };

  const removeCustomDraft = (id: string) => {
    setCustomDrafts(prev => prev.filter(d => d.id !== id));
  };

  const updateDraft = (id: string, field: string, value: any) => {
    setCustomDrafts(prev => prev.map(d => {
      if (d.id !== id) return d;
      const updated = { ...d, [field]: value };
      if (field === 'type' && value === 'cigarro') {
        updated.category = 'Cigarros';
        updated.purchaseForm = 'pacote';
        updated.unitsPerPackage = 10;
      }
      return updated;
    }));
  };

  const handleSaveDrafts = async () => {
    const validDrafts = customDrafts.filter(d => d.name.trim().length > 0 && d.basePrice > 0);
    if (validDrafts.length === 0) {
      alert('Preencha ao menos um produto com nome e preço de venda válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const payload: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[] = validDrafts.map(d => {
        const isCigarro = d.type === 'cigarro';
        const unitsPerPkg = isCigarro ? 10 : (Number(d.unitsPerPackage) || 1);
        const basePrice = Number(d.basePrice) || 0;
        const uCost = Number(d.unitCost) || 0;
        const stockQty = Number(d.stock) || 0;

        return {
          name: d.name.trim(),
          type: d.type,
          stockUnit: isCigarro ? 'carteira' : 'unidade',
          category: d.category || 'Diversos',
          purchaseForm: d.purchaseForm,
          unitsPerPackage: unitsPerPkg,
          unitCost: uCost,
          stock: stockQty,
          safetyStock: Math.max(1, Math.round(stockQty * 0.25)),
          maxStock: Math.max(10, stockQty * 2),
          initialStock: stockQty,
          initialStockDate: todayStr,
          dailyAverageSales: Math.max(1, Math.round(stockQty / 15)),
          replacementDays: 3,
          basePrice: basePrice,
          imageUrl: d.imageUrl,
          barcode: d.barcode,
          pricePack: isCigarro ? 0 : undefined,
          priceCart: isCigarro ? 0 : undefined,
          priceHalfCart: isCigarro ? 0 : undefined,
          priceUnit: isCigarro ? basePrice : undefined,
          pricePackage: !isCigarro && unitsPerPkg > 1 ? Number((basePrice * unitsPerPkg * 0.95).toFixed(2)) : undefined
        };
      });

      const count = await addMultipleProducts(payload);
      recordMovement({
        type: 'product_create',
        description: `Importação por fotos/IA: +${count} produtos com foto/rótulo adicionados ao estoque.`,
        quantity: count
      }).catch(() => {});

      setFeedbackMessage(`${count} produtos importados das imagens com sucesso!`);
      setTimeout(() => {
        onSuccess(count);
        onClose();
      }, 1000);
    } catch (err: any) {
      alert('Erro ao cadastrar produtos: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-surface border border-border rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                Pré-Adicionar Produtos ao Estoque
              </h2>
              <p className="text-xs text-muted-foreground">
                Cadastre instantaneamente produtos prontos de alta rotação ou importe fotos de tabelas e notas.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="px-5 pt-3 border-b border-border flex items-center gap-2 bg-surface">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'catalog'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Catálogo Pronto (1-Clique)</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
              {PRELOADED_PRODUCTS.length} itens
            </span>
          </button>

          <button
            onClick={() => setActiveTab('images')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'images'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Tirar Foto / Importar Foto (Leitura IA)</span>
            {uploadedImages.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                {uploadedImages.length} foto(s)
              </span>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {feedbackMessage && (
            <div className="mb-4 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-sm font-medium">{feedbackMessage}</span>
            </div>
          )}

          {activeTab === 'catalog' ? (
            <div className="space-y-4">
              {/* Filter Categories and Select All Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3 rounded-2xl border border-border">
                {/* Category Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-xs px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-primary text-white shadow-xs'
                          : 'bg-surface text-muted-foreground hover:text-foreground border border-border'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Bulk Select Toggles */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => selectAllAllCategories(true)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30 hover:bg-amber-500/25 font-bold cursor-pointer transition-colors flex items-center gap-1"
                    title="Marca todos os produtos de todas as categorias para adicionar ao estoque"
                  >
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>Colocar Todos os Produtos ({unaddedTotalCatalogCount})</span>
                  </button>
                  <button
                    onClick={() => selectAll(true)}
                    className="text-xs text-primary hover:underline font-medium cursor-pointer"
                  >
                    Marcar desta lista
                  </button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <button
                    onClick={() => selectAllAllCategories(false)}
                    className="text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                  >
                    Desmarcar todos
                  </button>
                </div>
              </div>

              {/* Products Table / Cards */}
              <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border bg-surface">
                {filteredProducts.map(p => {
                  const isRegistered = existingLowerSet.has(p.name.toLowerCase().trim());
                  const isChecked = !isRegistered && !!selectedItems[p.name];
                  const marginPct = p.basePrice > 0 ? Math.round(((p.basePrice - p.unitCost) / p.basePrice) * 100) : 0;

                  return (
                    <div
                      key={p.name}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isRegistered 
                          ? 'bg-muted/40 opacity-60' 
                          : isChecked 
                            ? 'bg-primary/5 hover:bg-primary/10' 
                            : 'hover:bg-muted/30'
                      }`}
                    >
                      {/* Checkbox & Details */}
                      <div className="flex items-start gap-3 flex-1">
                        <input
                          type="checkbox"
                          disabled={isRegistered}
                          checked={isChecked}
                          onChange={() => toggleItem(p.name)}
                          className="mt-1 w-4 h-4 rounded text-primary focus:ring-primary border-border cursor-pointer disabled:opacity-50"
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground">{p.name}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                              {p.category}
                            </span>
                            {p.type === 'cigarro' && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                🚬 Maço/Carteira/Avulso
                              </span>
                            )}
                            {isRegistered && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                ✓ Já cadastrado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{p.description}</p>
                        </div>
                      </div>

                      {/* Financial info & Quantity input */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-7 sm:pl-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">
                            {isBasicMode ? 'Você Paga:' : 'Custo:'} <span className="font-semibold text-foreground">R$ {p.unitCost.toFixed(2)}</span>
                          </div>
                          <div className="text-sm font-bold text-foreground">
                            {isBasicMode ? 'Venda:' : 'Preço:'} <span className="text-primary">R$ {p.basePrice.toFixed(2)}</span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium ml-1">
                              ({marginPct}%)
                            </span>
                          </div>
                        </div>

                        {/* Stock input */}
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] text-muted-foreground">Qtd:</label>
                          <input
                            type="number"
                            min="0"
                            disabled={isRegistered}
                            value={quantities[p.name] !== undefined ? quantities[p.name] : p.stock}
                            onChange={(e) => setQuantities({ ...quantities, [p.name]: Math.max(0, parseInt(e.target.value) || 0) })}
                            className="w-16 px-2 py-1 text-xs text-center border border-border rounded-lg bg-surface text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TAB 2: IMPORT BY IMAGES & CAMERA (AI) */
            <div className="space-y-6">
              {/* Image & Camera Upload Box */}
              <div className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-2xl p-6 text-center bg-muted/20">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                    <Camera className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1">
                    Tirar Foto ou Carregar Fotos de Produtos
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md mb-4">
                    Aponte para bebidas, maços de cigarro ou produtos: a Inteligência Artificial lê o nome comercial, identifica a categoria e preenche automaticamente para você conferir.
                  </p>
                  
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {/* Camera Button */}
                    <label className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 shadow-sm cursor-pointer flex items-center gap-2 transition-transform active:scale-95">
                      <Camera className="w-4 h-4" />
                      <span>📸 Tirar Foto com a Câmera</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageFiles}
                        className="hidden"
                      />
                    </label>

                    {/* Gallery/File Button */}
                    <label className="px-4 py-2.5 rounded-xl bg-surface border border-border hover:bg-muted text-foreground text-xs font-bold shadow-xs cursor-pointer flex items-center gap-2 transition-colors">
                      <Upload className="w-4 h-4 text-primary" />
                      <span>📁 Selecionar da Galeria / Arquivos</span>
                      <input
                        type="file"
                        id={fileInputId}
                        multiple
                        accept="image/*"
                        onChange={handleImageFiles}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* AI Processing Status Banner */}
              {isScanningAI && (
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-3 animate-pulse">
                  <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-primary block">Processando foto com Inteligência Artificial...</span>
                    <span className="text-muted-foreground">Lendo rótulo, embalagem, marca e valores comerciais automaticamente.</span>
                  </div>
                </div>
              )}

              {scanningStatus && !isScanningAI && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{scanningStatus}</span>
                </div>
              )}

              {/* Gallery of Uploaded Images */}
              {uploadedImages.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4" />
                    <span>Fotos Carregadas ({uploadedImages.length})</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {uploadedImages.map(img => (
                      <div
                        key={img.id}
                        className="group relative rounded-xl border border-border overflow-hidden bg-muted aspect-square flex items-center justify-center shadow-xs"
                      >
                        <img
                          src={img.url}
                          alt={img.name}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => setPreviewImage(img.url)}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => setPreviewImage(img.url)}
                            className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-black transition-colors"
                            title="Visualizar tela cheia"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeUploadedImage(img.id)}
                            className="p-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white transition-colors"
                            title="Remover foto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white bg-black/60 backdrop-blur-xs px-1.5 py-0.5 rounded-sm truncate">
                          {img.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted / Draft Products List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Produtos a Cadastrar a partir das Imagens
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Consulte as fotos acima e preencha ou confirme os dados dos produtos:
                    </p>
                  </div>
                  <button
                    onClick={addCustomDraft}
                    className="text-xs bg-surface border border-border hover:bg-muted text-foreground px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    <span>+ Adicionar Outra Linha</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {customDrafts.map((d, index) => (
                    <div
                      key={d.id}
                      className="p-3 bg-surface border border-border rounded-xl flex flex-col md:flex-row items-start md:items-center gap-3 shadow-xs hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-muted-foreground w-5">#{index + 1}</span>
                        {d.imageUrl ? (
                          <img
                            src={d.imageUrl}
                            alt="Foto"
                            className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                            <ShoppingBag className="w-5 h-5 opacity-40" />
                          </div>
                        )}
                      </div>

                      {/* Product Name */}
                      <div className="flex-1 w-full">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <label className="text-[10px] text-muted-foreground block">Nome do Produto</label>
                          {d.aiDetected && (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded-md flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              Lido por IA
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Ex: Cigarro Chesterfield Blue, Coca-Cola 2L..."
                          value={d.name}
                          onChange={(e) => updateDraft(d.id, 'name', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-semibold border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                        />
                      </div>

                      {/* Category & Type */}
                      <div className="w-full md:w-36">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Categoria</label>
                        <select
                          value={d.category}
                          onChange={(e) => updateDraft(d.id, 'category', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                        >
                          <option value="Cigarros">Cigarros</option>
                          <option value="Bebidas">Bebidas</option>
                          <option value="Doces e Confeitos">Doces e Confeitos</option>
                          <option value="Isqueiros e Fósforos">Isqueiros e Fósforos</option>
                          <option value="Sedas">Sedas</option>
                          <option value="Fumo">Fumo</option>
                          <option value="Comidas">Comidas</option>
                          <option value="Produtos de Limpeza">Produtos de Limpeza</option>
                          <option value="Diversos">Diversos</option>
                        </select>
                      </div>

                      <div className="w-full md:w-28">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Tipo</label>
                        <select
                          value={d.type}
                          onChange={(e) => updateDraft(d.id, 'type', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                        >
                          <option value="comum">Comum</option>
                          <option value="cigarro">Cigarro (Maço)</option>
                        </select>
                      </div>

                      {/* Cost */}
                      <div className="w-full md:w-24">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Custo (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={d.unitCost || ''}
                          onChange={(e) => updateDraft(d.id, 'unitCost', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                        />
                      </div>

                      {/* Sale Price */}
                      <div className="w-full md:w-24">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Venda (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={d.basePrice || ''}
                          onChange={(e) => updateDraft(d.id, 'basePrice', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-xs font-bold text-primary border border-border rounded-lg bg-surface focus:ring-1 focus:ring-primary focus:outline-hidden"
                        />
                      </div>

                      {/* Stock */}
                      <div className="w-full md:w-20">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Estoque</label>
                        <input
                          type="number"
                          min="0"
                          value={d.stock}
                          onChange={(e) => updateDraft(d.id, 'stock', parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-surface text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                        />
                      </div>

                      {/* Delete */}
                      {customDrafts.length > 1 && (
                        <button
                          onClick={() => removeCustomDraft(d.id)}
                          className="p-2 text-muted-foreground hover:text-red-500 rounded-lg transition-colors cursor-pointer self-end md:self-center mt-2 md:mt-4"
                          title="Remover linha"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-border bg-muted/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4 text-primary" />
            {activeTab === 'catalog' ? (
              <span><strong>{selectedCount}</strong> produtos selecionados para adicionar</span>
            ) : (
              <span><strong>{customDrafts.filter(d => d.name.trim()).length}</strong> produtos preenchidos das imagens</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted font-medium text-xs cursor-pointer transition-colors"
            >
              Cancelar
            </button>

            {activeTab === 'catalog' ? (
              <button
                onClick={handleAddSelectedCatalog}
                disabled={selectedCount === 0 || isSubmitting}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-xs hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-sm flex items-center justify-center gap-2 transition-all"
              >
                {isSubmitting ? (
                  <span>Salvando no Estoque...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Adicionar {selectedCount} Produtos ao Estoque</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleSaveDrafts}
                disabled={isSubmitting || customDrafts.filter(d => d.name.trim()).length === 0}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-xs hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-sm flex items-center justify-center gap-2 transition-all"
              >
                {isSubmitting ? (
                  <span>Cadastrando...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvar Produtos das Imagens no Estoque</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Image Zoom Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img 
              src={previewImage} 
              alt="Ampliada" 
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            />
            <button 
              onClick={() => setPreviewImage(null)} 
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-lg font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

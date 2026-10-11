import { useState, useRef, useEffect } from 'react';
import { 
  Camera, Upload, X, Sparkles, RefreshCw, Check, CheckCircle2, 
  AlertCircle, Plus, Minus, Tag, DollarSign, Package, Layers, 
  Barcode, Loader2, ArrowRight, Image as ImageIcon
} from 'lucide-react';
import { recognizeProductFromImage, RecognizedProduct } from '../lib/geminiProductScanner';
import { addMultipleProducts } from '../lib/api';
import { Product } from '../types';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableCategories: string[];
  onProductSaved?: (productName: string) => void;
  onSelectForEdit?: (draft: RecognizedProduct) => void;
}

export function CameraCaptureModal({
  isOpen,
  onClose,
  availableCategories,
  onProductSaved,
  onSelectForEdit
}: CameraCaptureModalProps) {
  const [mode, setMode] = useState<'camera' | 'upload' | 'preview'>('camera');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [recognizedProduct, setRecognizedProduct] = useState<RecognizedProduct | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Editable fields for confirmed product
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Bebidas');
  const [editSalePrice, setEditSalePrice] = useState<number>(0);
  const [editCost, setEditCost] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(10);
  const [editPurchaseForm, setEditPurchaseForm] = useState<'unidade' | 'fardo' | 'pacote'>('unidade');
  const [editUnitsPerPackage, setEditUnitsPerPackage] = useState<number>(1);
  const [editBarcode, setEditBarcode] = useState('');
  const [editType, setEditType] = useState<'comum' | 'cigarro'>('comum');

  // Start Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Try environment camera first (rear camera for smartphones)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch {
        // Fallback to any available video stream
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError('Câmera indisponível ou permissão negada. Você também pode escolher uma foto do seu dispositivo!');
      setIsCameraActive(false);
      setMode('upload');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setRecognizedProduct(null);
      setAnalysisError(null);
      setCameraError(null);
      setMode('camera');
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Capture photo from live camera
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    stopCamera();
    setCapturedImage(dataUrl);
    setMode('preview');
    analyzeImage(dataUrl);
  };

  // Upload photo from file input
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        stopCamera();
        setCapturedImage(dataUrl);
        setMode('preview');
        analyzeImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Run AI analysis
  const analyzeImage = async (dataUrl: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await recognizeProductFromImage(dataUrl, availableCategories);
      setRecognizedProduct(result);
      
      // Pre-fill editable state
      setEditName(result.name);
      setEditCategory(result.category);
      setEditSalePrice(result.suggestedSalePrice || 0);
      setEditCost(result.estimatedCost || 0);
      setEditStock(result.stock || 10);
      setEditPurchaseForm(result.purchaseForm || 'unidade');
      setEditUnitsPerPackage(result.unitsPerPackage || 1);
      setEditBarcode(result.barcode || '');
      setEditType(result.type || 'comum');
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setAnalysisError(err.message || 'Não foi possível ler o produto na imagem. Você pode preencher os dados manualmente.');
      // Default fallback draft
      setEditName('');
      setEditCategory(availableCategories[0] || 'Bebidas');
      setEditSalePrice(0);
      setEditCost(0);
      setEditStock(10);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setRecognizedProduct(null);
    setAnalysisError(null);
    setMode('camera');
    startCamera();
  };

  const handleSaveToStock = async () => {
    if (!editName.trim()) {
      alert('Informe o nome do produto.');
      return;
    }
    if (editSalePrice <= 0) {
      alert('Informe um preço de venda válido.');
      return;
    }

    setIsSaving(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const isCigarro = editType === 'cigarro' || editCategory.toLowerCase().includes('cigar');
      const unitsPerPkg = isCigarro ? 200 : (Number(editUnitsPerPackage) || 1);
      const stockQty = Number(editStock) || 0;
      const basePrice = Number(editSalePrice) || 0;
      const uCost = Number(editCost) || 0;

      const productPayload: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
        name: editName.trim(),
        type: isCigarro ? 'cigarro' : 'comum',
        category: editCategory || 'Diversos',
        purchaseForm: editPurchaseForm,
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
        barcode: editBarcode.trim() || undefined,
        imageUrl: capturedImage || undefined,
        pricePack: isCigarro ? Number((basePrice * 130).toFixed(2)) : undefined,
        priceCart: isCigarro ? Number((basePrice * 13.5).toFixed(2)) : undefined,
        priceHalfCart: isCigarro ? Number((basePrice * 7).toFixed(2)) : undefined,
        priceUnit: isCigarro ? basePrice : undefined,
        pricePackage: !isCigarro && unitsPerPkg > 1 ? Number((basePrice * unitsPerPkg * 0.95).toFixed(2)) : undefined
      };

      await addMultipleProducts([productPayload]);
      setSavedCount(prev => prev + 1);
      if (onProductSaved) {
        onProductSaved(editName.trim());
      }

      // Allow user to immediately scan next or close
      alert(`✓ "${editName.trim()}" cadastrado com sucesso no estoque!`);
      handleRetake();
    } catch (err: any) {
      alert('Erro ao salvar produto: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenInFullForm = () => {
    if (onSelectForEdit) {
      onSelectForEdit({
        name: editName,
        category: editCategory,
        type: editType,
        suggestedSalePrice: editSalePrice,
        estimatedCost: editCost,
        stock: editStock,
        unitsPerPackage: editUnitsPerPackage,
        purchaseForm: editPurchaseForm,
        barcode: editBarcode,
        imageUrl: capturedImage || undefined
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-surface border border-border rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                Tirar Foto & Leitor Inteligente (IA)
                <span className="text-[11px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-semibold">
                  Sem Digitação
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Aponte para uma bebida, cigarro ou produto: a IA lê o nome, categoria e preços automaticamente.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* CAMERA / CAPTURE VIEW */}
          {mode === 'camera' && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center border-2 border-dashed border-border shadow-inner">
                {isCameraActive ? (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Viewfinder Overlay */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                      <div className="w-64 h-48 border-2 border-white/70 rounded-2xl border-dashed shadow-2xl relative">
                        <div className="absolute top-2 left-2 text-[10px] text-white/90 bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs font-medium">
                          Enquadre o produto ou rótulo
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <Camera className="w-12 h-12 text-muted-foreground/60 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {cameraError || 'Inicializando câmera...'}
                    </p>
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:opacity-90 inline-flex items-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Tentar Câmera Novamente
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                {isCameraActive && (
                  <button
                    onClick={capturePhoto}
                    className="w-full sm:flex-1 py-3.5 px-6 bg-primary text-white font-bold rounded-2xl hover:opacity-95 shadow-md flex items-center justify-center gap-2 text-base cursor-pointer"
                  >
                    <Camera className="w-5 h-5" />
                    Tirar Foto do Produto
                  </button>
                )}

                <label className="w-full sm:w-auto py-3 px-5 bg-surface border border-border hover:bg-muted text-foreground font-semibold rounded-2xl flex items-center justify-center gap-2 text-sm cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-primary" />
                  <span>Importar da Galeria / Arquivo</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Dica prática:</span> Você pode tirar foto direta de garrafas, latas, maços de cigarro, embalagens de doces ou notas fiscais. O leitor lê o nome certinho e já sugere a categoria (ex: "Bebidas" ou "Cigarros").
                </div>
              </div>
            </div>
          )}

          {/* PREVIEW & AI RECOGNITION VIEW */}
          {mode === 'preview' && (
            <div className="space-y-5">
              {/* Photo Banner with AI State */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-muted/40 border border-border">
                {capturedImage && (
                  <img
                    src={capturedImage}
                    alt="Foto capturada"
                    className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-xl border border-border shadow-xs shrink-0"
                  />
                )}

                <div className="flex-1 min-w-0 text-center sm:text-left">
                  {isAnalyzing ? (
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 text-primary font-bold text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Lendo produto com IA...
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Identificando nome do produto, marca, categoria e valores na embalagem...
                      </p>
                    </div>
                  ) : analysisError ? (
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-rose-500 font-bold text-sm">
                        <AlertCircle className="w-4 h-4" />
                        Atenção na leitura automática
                      </div>
                      <p className="text-xs text-muted-foreground">{analysisError}</p>
                    </div>
                  ) : recognizedProduct ? (
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        Produto Reconhecido com Sucesso!
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">
                        Confira os dados abaixo e clique em Salvar no Estoque. Você pode ajustar tudo o que desejar.
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center justify-center sm:justify-start gap-2">
                    <button
                      onClick={handleRetake}
                      className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Tirar outra foto
                    </button>
                  </div>
                </div>
              </div>

              {/* Editable Fields Form */}
              <div className="space-y-4 bg-surface p-4 sm:p-5 rounded-2xl border border-border">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" />
                  Dados Identificados do Produto
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Nome do Produto */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Nome do Produto *
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Ex: Coca-Cola 2L ou Cerveja Heineken 330ml"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Categoria */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Categoria do Produto *
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditCategory(val);
                        if (val.toLowerCase().includes('cigar')) {
                          setEditType('cigarro');
                        } else {
                          setEditType('comum');
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
                    >
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      {!availableCategories.includes('Bebidas') && <option value="Bebidas">Bebidas</option>}
                      {!availableCategories.includes('Cigarros') && <option value="Cigarros">Cigarros</option>}
                      {!availableCategories.includes('Doces & Balas') && <option value="Doces & Balas">Doces & Balas</option>}
                      {!availableCategories.includes('Salgadinhos & Snacks') && <option value="Salgadinhos & Snacks">Salgadinhos & Snacks</option>}
                      {!availableCategories.includes('Mercearia') && <option value="Mercearia">Mercearia</option>}
                      {!availableCategories.includes('Diversos') && <option value="Diversos">Diversos</option>}
                    </select>
                  </div>

                  {/* Formato de Compra / Unidades */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Formato de Venda / Lote
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['unidade', 'fardo', 'pacote'] as const).map(fmt => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setEditPurchaseForm(fmt)}
                          className={`py-2 px-2 text-xs font-bold rounded-xl border capitalize cursor-pointer transition-colors ${
                            editPurchaseForm === fmt
                              ? 'bg-primary text-white border-primary'
                              : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                          }`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preço de Venda */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Preço de Venda Sugerido (R$) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editSalePrice || ''}
                        onChange={(e) => setEditSalePrice(parseFloat(e.target.value) || 0)}
                        placeholder="0,00"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm font-bold text-emerald-600 dark:text-emerald-400 focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Custo Unitário */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Custo Unitário (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editCost || ''}
                        onChange={(e) => setEditCost(parseFloat(e.target.value) || 0)}
                        placeholder="0,00"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Quantidade Inicial em Estoque */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Quantidade Inicial em Estoque (un.)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditStock(prev => Math.max(0, prev - 1))}
                        className="w-9 h-9 rounded-xl border border-border bg-muted flex items-center justify-center text-foreground hover:bg-muted/80 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={editStock}
                        onChange={(e) => setEditStock(parseInt(e.target.value) || 0)}
                        className="flex-1 text-center py-1.5 rounded-xl border border-border bg-background text-foreground text-sm font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => setEditStock(prev => prev + 1)}
                        className="w-9 h-9 rounded-xl border border-border bg-muted flex items-center justify-center text-foreground hover:bg-muted/80 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Código de Barras (Opcional) */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Código de Barras (EAN)
                    </label>
                    <div className="relative">
                      <Barcode className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={editBarcode}
                        onChange={(e) => setEditBarcode(e.target.value)}
                        placeholder="Opcional"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Final Actions */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveToStock}
                    disabled={isSaving || isAnalyzing || !editName.trim()}
                    className="w-full sm:flex-1 py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer text-sm"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cadastrando...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Confirmar e Salvar no Estoque
                      </>
                    )}
                  </button>

                  {onSelectForEdit && (
                    <button
                      type="button"
                      onClick={handleOpenInFullForm}
                      className="w-full sm:w-auto py-2.5 px-4 rounded-xl border border-border hover:bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Editar Detalhado
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-border bg-muted/20 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {savedCount > 0 ? (
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                ✓ {savedCount} {savedCount === 1 ? 'produto cadastrado' : 'produtos cadastrados'} nesta sessão!
              </span>
            ) : (
              <span>Foto do produto com IA para preenchimento ágil.</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}

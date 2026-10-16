import { showToast, showActionError } from '../lib/actionFeedback';
import { isValidStockQuantity } from '../lib/productUnits';
import { useState, useRef, useEffect } from 'react';
import { 
  Camera, Upload, X, Sparkles, RefreshCw, Check, CheckCircle2, 
  AlertCircle, Info, Plus, Minus, Tag,
  Barcode, Loader2, ArrowRight, Image as ImageIcon
} from 'lucide-react';
import { recognizeProductFromImage, prepareProductImage, RecognizedProduct } from '../lib/geminiProductScanner';
import { addMultipleProducts } from '../lib/api';
import { Product } from '../types';

export interface CameraProductDraft extends RecognizedProduct {
  type: 'comum' | 'cigarro';
  basePrice: number | '';
  unitCost: number | '';
  stock: number | '';
  unitsPerPackage: number;
  purchaseForm: 'unidade' | 'fardo' | 'pacote';
  barcode: string;
  imageUrl?: string;
}

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableCategories: string[];
  onRecognized?: (product: RecognizedProduct, imageUrl: string) => void;
  onBeforeSave?: (product: Pick<Product, 'name' | 'barcode' | 'stock' | 'type'>) => Promise<boolean>;
  onProductSaved?: (productName: string) => void;
  onSelectForEdit?: (draft: CameraProductDraft) => void;
}

export function CameraCaptureModal({
  isOpen,
  onClose,
  availableCategories,
  onProductSaved,
  onBeforeSave,
  onRecognized,
  onSelectForEdit
}: CameraCaptureModalProps) {
  const [mode, setMode] = useState<'camera' | 'preview'>('camera');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [recognizedProduct, setRecognizedProduct] = useState<RecognizedProduct | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisIdRef = useRef(0);
  const analysisControllerRef = useRef<AbortController | null>(null);
  const cameraIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Editable fields for confirmed product
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Bebidas');
  const [editSalePrice, setEditSalePrice] = useState<number | ''>('');
  const [editCost, setEditCost] = useState<number | ''>('');
  const [editStock, setEditStock] = useState<number | ''>('');
  const [editPurchaseForm, setEditPurchaseForm] = useState<'unidade' | 'fardo' | 'pacote'>('unidade');
  const [editUnitsPerPackage, setEditUnitsPerPackage] = useState<number>(1);
  const [editBarcode, setEditBarcode] = useState('');
  const [editType, setEditType] = useState<'comum' | 'cigarro'>('comum');

  // Start Camera
  const startCamera = async () => {
    const cameraId = ++cameraIdRef.current;
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
        if (cameraId !== cameraIdRef.current) return;
        // Fallback to any available video stream
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      if (cameraId !== cameraIdRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (cameraId === cameraIdRef.current) setIsCameraActive(true);
      }
    } catch (err: any) {
      if (cameraId !== cameraIdRef.current) return;
      console.warn('Camera access denied or unavailable:', err);
      stopCamera();
      setCameraError('Câmera indisponível ou permissão negada. Você também pode escolher uma foto do seu dispositivo!');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    cameraIdRef.current++;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Capture a ready video frame, then await the shared Gemini analysis.
  const capturePhoto = async () => {
    if (!isOpen || isSaving || isAnalyzing) return;
    if (!videoRef.current || !videoRef.current.videoWidth || !videoRef.current.videoHeight) {
      setCameraError('Aguarde a câmera ficar pronta antes de tirar a foto.');
      return;
    }
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      stopCamera();
      setCapturedImage(dataUrl);
      setMode('preview');
      // The scanner validates this data URL and sends only raw Base64 to Gemini.
      await analyzeImage(dataUrl);
    } catch {
      stopCamera();
      resetDraft();
      setMode('preview');
      setAnalysisError('Não foi possível capturar a foto. Preencha nome e categoria manualmente ou tire outra foto.');
    }
  };

  // Read and resize the gallery photo before the same Gemini/manual-preview flow.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isOpen || isSaving || isAnalyzing) return;
    analysisControllerRef.current?.abort();
    const analysisId = ++analysisIdRef.current;
    stopCamera();
    setMode('preview');
    resetDraft();
    setCapturedImage(null);
    setAnalysisError(null);
    setIsAnalyzing(true);
    try {
      const dataUrl = await prepareProductImage(file);
      if (analysisId !== analysisIdRef.current) return;
      setCapturedImage(dataUrl);
      await analyzeImage(dataUrl);
    } catch (error) {
      if (analysisId !== analysisIdRef.current) return;
      setAnalysisError(error instanceof Error ? error.message : 'Não foi possível processar a foto. Preencha manualmente.');
    } finally {
      // analyzeImage owns its newer request; only release this file-reading phase here.
      if (analysisId === analysisIdRef.current) setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setRecognizedProduct(null);
      setAnalysisError(null);
      setCameraError(null);
      resetDraft();
      setMode('camera');
    } else {
      stopCamera();
    }
    return () => {
      analysisIdRef.current++;
      analysisControllerRef.current?.abort();
      stopCamera();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && mode === 'camera') startCamera();
    return () => stopCamera();
  }, [isOpen, mode]);

  const resetDraft = () => {
    setEditName('');
    setEditCategory(availableCategories[0] || 'Diversos');
    setEditSalePrice('');
    setEditCost('');
    setEditStock('');
    setEditPurchaseForm('unidade');
    setEditUnitsPerPackage(1);
    setEditBarcode('');
    setEditType('comum');
    setRecognizedProduct(null);
    setIsAnalyzing(false);
  };

  const analyzeImage = async (dataUrl: string) => {
    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const analysisId = ++analysisIdRef.current;
    resetDraft();
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await recognizeProductFromImage(dataUrl, availableCategories, controller.signal);
      if (analysisId !== analysisIdRef.current) return;
      setRecognizedProduct(result);
      setEditName(result.name);
      setEditCategory(result.category);
      onRecognized?.(result, dataUrl);
    } catch (err: unknown) {
      if (analysisId !== analysisIdRef.current) return;
      setAnalysisError(err instanceof Error ? err.message : 'Não foi possível ler o rótulo. Preencha manualmente.');
    } finally {
      if (analysisId === analysisIdRef.current) {
        setIsAnalyzing(false);
        analysisControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (isOpen && mode === 'preview' && analysisError && !isAnalyzing) {
      nameInputRef.current?.focus();
    }
  }, [isOpen, mode, analysisError, isAnalyzing]);

  const handleContinueManually = () => {
    analysisIdRef.current++;
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = null;
    setIsAnalyzing(false);
    setAnalysisError('Preencha nome e categoria abaixo. A foto e os valores digitados serão mantidos.');
    nameInputRef.current?.focus();
  };

  const handleRetake = () => {
    analysisControllerRef.current?.abort();
    analysisIdRef.current++;
    resetDraft();
    setCapturedImage(null);
    setRecognizedProduct(null);
    setAnalysisError(null);
    setMode('camera');
  };

  const handleSaveToStock = async () => {
    if (!editName.trim()) {
      alert('Informe o nome do produto.');
      return;
    }
    if (!Number.isFinite(Number(editSalePrice)) || Number(editSalePrice) <= 0) {
      alert('Informe um preço de venda válido.');
      return;
    }

    if (!Number.isFinite(Number(editCost)) || Number(editCost) < 0 ||
        !(editCategory.toLowerCase().includes('cigar') ? isValidStockQuantity(Number(editStock)) : Number.isInteger(Number(editStock))) || Number(editStock) < 0) {
      alert('Informe um custo válido e uma quantidade inteira de estoque, ambos não negativos.');
      return;
    }

    setIsSaving(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const isCigarro = editType === 'cigarro' || editCategory.toLowerCase().includes('cigar');
      const unitsPerPkg = isCigarro ? 10 : (Number(editUnitsPerPackage) || 1);
      const stockQty = Number(editStock) || 0;
      const basePrice = Number(editSalePrice) || 0;
      const uCost = Number(editCost) || 0;

      const productPayload: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
        name: editName.trim(),
        type: isCigarro ? 'cigarro' : 'comum',
        stockUnit: isCigarro ? 'carteira' : 'unidade',
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
        pricePack: isCigarro ? 0 : undefined,
        priceCart: isCigarro ? 0 : undefined,
        priceHalfCart: isCigarro ? 0 : undefined,
        priceUnit: isCigarro ? basePrice : undefined,
        pricePackage: !isCigarro && unitsPerPkg > 1 ? Number((basePrice * unitsPerPkg * 0.95).toFixed(2)) : undefined
      };

      if (onBeforeSave && !await onBeforeSave(productPayload)) return;
      await addMultipleProducts([productPayload]);
      setSavedCount(prev => Number(prev) + 1);
      if (onProductSaved) {
        onProductSaved(editName.trim());
      }

      showToast(`✓ "${editName.trim()}" cadastrado com sucesso no estoque!`);
    } catch (err: any) {
      showActionError(err, 'Não foi possível cadastrar o produto. Confira o estoque antes de repetir.');
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  const handleOpenInFullForm = () => {
    if (onSelectForEdit) {
      onSelectForEdit({
        name: editName,
        category: editCategory,
        type: editType,
        basePrice: editSalePrice,
        unitCost: editCost,
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
                  Nome e Categoria
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Aponte para uma bebida, cigarro ou produto: a IA preenche apenas nome e categoria. Você informa os preços e o estoque.
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
          
          {cameraError && isCameraActive && (
            <p role="alert" className="text-sm text-rose-500">{cameraError}</p>
          )}
        {/* CAMERA / CAPTURE VIEW */}
          {mode === 'camera' && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center border-2 border-dashed border-border shadow-inner">
                {/* O vídeo fica sempre no DOM para o ref nunca ser nulo */}
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Overlay ou Tela de Carregamento */}
                {isCameraActive ? (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                    <div className="w-64 h-48 border-2 border-white/70 rounded-2xl border-dashed shadow-2xl relative">
                      <div className="absolute top-2 left-2 text-[10px] text-white/90 bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs font-medium">
                        Enquadre o produto ou rótulo
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-3 bg-black/90">
                    <Camera className="w-12 h-12 text-muted-foreground/60 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {cameraError || 'Inicializando câmera...'}
                    </p>
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:opacity-90 inline-flex items-center gap-2 cursor-pointer"
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
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Dica prática:</span> Você pode tirar foto direta de garrafas, latas, maços de cigarro, embalagens de doces ou notas fiscais. A IA usa os textos visíveis como pistas para identificar nome e categoria (ex: "Bebidas" ou "Cigarros").
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
                    <div role="status" aria-live="polite" className="space-y-2">
                      <div className="inline-flex items-center gap-2 text-primary font-bold text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando imagem com IA...
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Identificando apenas o nome e a categoria do produto...
                      </p>
                    </div>
                  ) : analysisError ? (
                    <div role="status" aria-live="polite" className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-primary font-bold text-sm">
                        <Info className="w-4 h-4" />
                        Preenchimento manual disponível
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
                        Confira nome e categoria. Preencha custo, preço de venda e estoque manualmente.
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
                    {isAnalyzing && (
                      <button type="button" onClick={handleContinueManually} className="text-xs font-semibold text-primary hover:underline">
                        Continuar manualmente
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Editable Fields Form */}
              <div className="space-y-4 bg-surface p-4 sm:p-5 rounded-2xl border border-border">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" />
                  Dados do Produto
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Nome do Produto */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Nome do Produto *
                    </label>
                    <input
                      type="text"
                      ref={nameInputRef}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Ex: Coca-Cola 2L ou Cerveja Heineken 330ml"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary notranslate normal-case"
                     translate="no"/>
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
                      {Array.from(new Set([...availableCategories, editCategory, 'Bebidas', 'Cigarros', 'Doces & Balas', 'Salgadinhos & Snacks', 'Mercearia', 'Diversos'])).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
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
                      Preço de Venda {editCategory.toLowerCase().includes('cigar') ? 'do Avulso' : ''} (R$) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editSalePrice}
                        onChange={(e) => setEditSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0,00"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm font-bold text-emerald-600 dark:text-emerald-400 focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Custo Unitário */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Custo ({editCategory.toLowerCase().includes('cigar') ? 'por carteira' : 'unitário'}) (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editCost}
                        onChange={(e) => setEditCost(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0,00"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Quantidade Inicial em Estoque */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Quantidade em Estoque ({editCategory.toLowerCase().includes('cigar') ? 'carteiras' : 'unidades'})
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditStock(prev => Math.max(0, Number(prev) - 1))}
                        className="w-9 h-9 rounded-xl border border-border bg-muted flex items-center justify-center text-foreground hover:bg-muted/80 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step={editCategory.toLowerCase().includes('cigar') ? '0.05' : '1'}
                        placeholder="Quantidade"
                        value={editStock}
                        onChange={(e) => setEditStock(e.target.value === '' ? '' : Number(e.target.value))}
                        className="flex-1 text-center py-1.5 rounded-xl border border-border bg-background text-foreground text-sm font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => setEditStock(prev => Number(prev) + 1)}
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
                      disabled={isAnalyzing || isSaving}
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

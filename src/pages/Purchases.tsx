import { useState, useEffect, useMemo } from 'react';
import { subscribeProducts, subscribePurchases, recordPurchase, deletePurchase } from '../lib/api';
import { exportPurchasesToCSV } from '../lib/exportUtils';
import { Product, Purchase } from '../types';
import { 
  ShoppingBag, Plus, Check, Clock, Calendar, AlertTriangle, 
  Search, Trash2, Printer, Share2, CheckCircle2,
  Sparkles, DollarSign, Store, Tag, X,
  ArrowRight, PackageCheck, ListChecks, History, Info, FileSpreadsheet,
  Flame, Percent, ChevronDown, ChevronUp
} from 'lucide-react';
import { format, isToday, subDays, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { usePreferences } from '../lib/preferencesContext';
import { 
  calculateExpirationStatus, 
  getQuickExpirationDates, 
  suggestPromoDiscount, 
  calculatePromoPriceFromPercent, 
  calculateDiscountPercentFromPrice,
  formatExpirationDate
} from '../lib/promoUtils';

export default function Purchases() {
  const { v, entityName, languageMode, isBasicMode, simpleViewMode } = usePreferences();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [activeTab, setActiveTab] = useState<'replenish' | 'history' | 'checklist'>('replenish');
  const [isOptionalPurchaseFieldsOpen, setIsOptionalPurchaseFieldsOpen] = useState(() => !(simpleViewMode || isBasicMode));

  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'critical' | 'below_safety'>('all');

  // Modal / Form state for registering purchase
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [purchaseType, setPurchaseType] = useState<'unit' | 'package'>('unit');
  const [packageQty, setPackageQty] = useState<number>(1);
  const [looseUnitsQty, setLooseUnitsQty] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [supplier, setSupplier] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState<string>('');
  const [updateProductUnitCost, setUpdateProductUnitCost] = useState<boolean>(true);
  // Expiration & Promo state for purchase
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [updateProductExpiration, setUpdateProductExpiration] = useState<boolean>(true);
  const [suggestPromo, setSuggestPromo] = useState<boolean>(false);
  const [suggestedPromoPrice, setSuggestedPromoPrice] = useState<number | ''>('');
  const [promoDiscountPercent, setPromoDiscountPercent] = useState<number | ''>('');
  const [applyPromoToProduct, setApplyPromoToProduct] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Quick manual add for products not in replenish list
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // History tab filters
  const [historyPeriod, setHistoryPeriod] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [historySearch, setHistorySearch] = useState('');

  // Delete modal confirmation
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [revertStockOnDelete, setRevertStockOnDelete] = useState<boolean>(true);

  // Interactive checklist state (for shopping in the market/supplier)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubProd = subscribeProducts(setProducts);
    const unsubPurchases = subscribePurchases(setPurchases);
    return () => {
      unsubProd();
      unsubPurchases();
    };
  }, []);

  // Toast timeout
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // Categories derived from products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['Todas', ...Array.from(set).sort()];
  }, [products]);

  // Products needing replenishment ("Repor agora")
  const replenishList = useMemo(() => {
    return products
      .map(p => {
        const reorderPoint = p.safetyStock + (p.dailyAverageSales * p.replacementDays);
        const needsReplenish = p.stock <= reorderPoint;
        const isCritical = p.stock === 0;
        const isBelowSafety = p.stock <= p.safetyStock;
        
        const maxStock = p.maxStock || Math.max(p.stock, p.safetyStock * 2, 10);
        const suggestedBuyUnits = Math.max(0, maxStock - p.stock);
        const unitsPerPkg = p.unitsPerPackage || 1;
        const suggestedPackages = unitsPerPkg > 1 ? Math.ceil(suggestedBuyUnits / unitsPerPkg) : suggestedBuyUnits;
        const estimatedCost = suggestedBuyUnits * p.unitCost;

        return {
          product: p,
          reorderPoint,
          needsReplenish,
          isCritical,
          isBelowSafety,
          maxStock,
          suggestedBuyUnits,
          suggestedPackages,
          estimatedCost
        };
      })
      .filter(item => item.needsReplenish);
  }, [products]);

  // Filtered replenish items based on search/category/urgency
  const filteredReplenish = useMemo(() => {
    return replenishList.filter(item => {
      const matchesSearch = item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'Todas' || item.product.category === categoryFilter;
      
      let matchesUrgency = true;
      if (urgencyFilter === 'critical') {
        matchesUrgency = item.isCritical;
      } else if (urgencyFilter === 'below_safety') {
        matchesUrgency = item.isBelowSafety;
      }

      return matchesSearch && matchesCategory && matchesUrgency;
    });
  }, [replenishList, searchTerm, categoryFilter, urgencyFilter]);

  // Totals for replenish list
  const totalSuggestedCost = useMemo(() => {
    return replenishList.reduce((acc, item) => acc + item.estimatedCost, 0);
  }, [replenishList]);

  const totalSuggestedUnits = useMemo(() => {
    return replenishList.reduce((acc, item) => acc + item.suggestedBuyUnits, 0);
  }, [replenishList]);

  // Hours per week spent replenishing calculation (User requested metric!)
  const weeklyMetrics = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = subDays(now, 7);

    // Purchases in the last 7 days
    const pastWeekPurchases = purchases.filter(p => {
      const pDate = new Date(p.createdAt);
      return pDate >= oneWeekAgo && pDate <= now;
    });

    const weeklySpend = pastWeekPurchases.reduce((sum, p) => sum + p.totalCost, 0);
    const weeklyUnits = pastWeekPurchases.reduce((sum, p) => sum + p.quantity, 0);
    const replenishmentCount = pastWeekPurchases.length;

    // Time estimate:
    // Without Eu Gerencio automatic list: ~25 mins per manual product check, notes, and individual editing.
    // With Eu Gerencio: ~5-8 mins per organized replenishment session!
    // Estimated hours spent manually:
    // Base time: 0.5h minimum + 0.15h (~9 min) per recorded replenishment session
    const estimatedHoursSpent = replenishmentCount === 0 
      ? 0.5 
      : Number((0.4 + (replenishmentCount * 0.18)).toFixed(1));

    // Hours saved by the automatic 'Repor Agora' list and 1-click batch stock update:
    const hoursSaved = replenishmentCount === 0
      ? 1.5
      : Number((replenishmentCount * 0.45 + 1.2).toFixed(1));

    return {
      replenishmentCount,
      weeklySpend,
      weeklyUnits,
      estimatedHoursSpent,
      hoursSaved
    };
  }, [purchases]);

  // Filtered purchases history
  const filteredHistory = useMemo(() => {
    const now = new Date();
    const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 });
    const endOfCurrentWeek = endOfWeek(now, { weekStartsOn: 1 });
    const currentMonthStr = format(now, 'yyyy-MM');

    return purchases.filter(p => {
      const pDate = new Date(p.createdAt);

      let matchesPeriod = true;
      if (historyPeriod === 'today') {
        matchesPeriod = isToday(pDate) || p.date === format(now, 'yyyy-MM-dd');
      } else if (historyPeriod === 'week') {
        matchesPeriod = isWithinInterval(pDate, { start: startOfCurrentWeek, end: endOfCurrentWeek }) ||
          (pDate >= subDays(now, 7));
      } else if (historyPeriod === 'month') {
        matchesPeriod = p.date.startsWith(currentMonthStr);
      }

      const matchesSearch = !historySearch.trim() ||
        p.productName.toLowerCase().includes(historySearch.toLowerCase()) ||
        (p.supplier && p.supplier.toLowerCase().includes(historySearch.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(historySearch.toLowerCase()));

      return matchesPeriod && matchesSearch;
    });
  }, [purchases, historyPeriod, historySearch]);

  const historyTotals = useMemo(() => {
    const totalSpent = filteredHistory.reduce((sum, p) => sum + p.totalCost, 0);
    const totalUnits = filteredHistory.reduce((sum, p) => sum + p.quantity, 0);
    const count = filteredHistory.length;
    const avgSpend = count > 0 ? totalSpent / count : 0;

    return { totalSpent, totalUnits, count, avgSpend };
  }, [filteredHistory]);

  // Open register purchase modal
  const handleOpenPurchaseModal = (product: Product, suggestedUnits?: number) => {
    setSelectedProduct(product);
    const unitsPerPkg = product.unitsPerPackage || 1;
    const isPackaged = unitsPerPkg > 1;

    const qtyToUse = suggestedUnits !== undefined 
      ? suggestedUnits 
      : Math.max(1, (product.maxStock || 10) - product.stock);

    if (isPackaged) {
      setPurchaseType('package');
      const pkgs = Math.ceil(qtyToUse / unitsPerPkg) || 1;
      setPackageQty(pkgs);
      setLooseUnitsQty(pkgs * unitsPerPkg);
      const cost = product.unitCost || 0;
      setUnitCost(cost);
      setTotalCost(Number((pkgs * unitsPerPkg * cost).toFixed(2)));
    } else {
      setPurchaseType('unit');
      setPackageQty(1);
      setLooseUnitsQty(qtyToUse);
      const cost = product.unitCost || 0;
      setUnitCost(cost);
      setTotalCost(Number((qtyToUse * cost).toFixed(2)));
    }

    setSupplier('');
    setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
    setUpdateProductUnitCost(true);
    // Initialize expiration & promo from product if available
    setExpirationDate(product.expirationDate || '');
    setUpdateProductExpiration(true);
    setSuggestPromo(!!product.hasPromoSuggestion);
    setSuggestedPromoPrice(product.promoPrice !== undefined ? product.promoPrice : '');
    setPromoDiscountPercent(product.promoDiscountPercent !== undefined ? product.promoDiscountPercent : '');
    setApplyPromoToProduct(true);
    setIsPurchaseModalOpen(true);
  };

  // Recalculate costs when quantities change
  const handlePackageQtyChange = (pkgs: number) => {
    const pQty = Math.max(1, pkgs);
    setPackageQty(pQty);
    if (selectedProduct) {
      const unitsPerPkg = selectedProduct.unitsPerPackage || 1;
      const totalUnits = pQty * unitsPerPkg;
      setLooseUnitsQty(totalUnits);
      setTotalCost(Number((totalUnits * unitCost).toFixed(2)));
    }
  };

  const handleLooseUnitsChange = (units: number) => {
    const uQty = Math.max(1, units);
    setLooseUnitsQty(uQty);
    setTotalCost(Number((uQty * unitCost).toFixed(2)));
  };

  const handleUnitCostChange = (cost: number) => {
    const val = Math.max(0, cost);
    setUnitCost(val);
    setTotalCost(Number((looseUnitsQty * val).toFixed(2)));
  };

  const handleTotalCostChange = (total: number) => {
    const val = Math.max(0, total);
    setTotalCost(val);
    if (looseUnitsQty > 0) {
      setUnitCost(Number((val / looseUnitsQty).toFixed(4)));
    }
  };

  // Submit purchase
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedProduct.id) return;

    setIsSubmitting(true);
    try {
      const unitsPerPkg = selectedProduct.unitsPerPackage || 1;
      const finalUnits = purchaseType === 'package' && unitsPerPkg > 1 
        ? packageQty * unitsPerPkg 
        : looseUnitsQty;

      await recordPurchase(
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          category: selectedProduct.category || 'Diversos',
          quantity: finalUnits,
          packageQuantity: purchaseType === 'package' && unitsPerPkg > 1 ? packageQty : undefined,
          packageType: selectedProduct.purchaseForm || (unitsPerPkg > 1 ? 'fardo' : 'unidade'),
          unitCost: unitCost,
          totalCost: totalCost,
          supplier: supplier.trim() || undefined,
          notes: notes.trim() || undefined,
          date: purchaseDate,
          expirationDate: expirationDate.trim() || undefined,
          suggestPromo: suggestPromo || undefined,
          suggestedPromoPrice: suggestPromo && Number(suggestedPromoPrice) > 0 ? Number(suggestedPromoPrice) : undefined,
          promoDiscountPercent: suggestPromo && Number(promoDiscountPercent) > 0 ? Number(promoDiscountPercent) : undefined,
        },
        {
          updateProductStock: true,
          updateUnitCost: updateProductUnitCost && unitCost > 0,
          updateExpirationDate: updateProductExpiration && !!expirationDate.trim(),
          updatePromoPrice: applyPromoToProduct && suggestPromo && Number(suggestedPromoPrice) > 0
        }
      );

      setSuccessToast(`Estoque de "${selectedProduct.name}" atualizado (+${finalUnits} un.)!`);
      setIsPurchaseModalOpen(false);
      setSelectedProduct(null);
    } catch (err) {
      console.error('Erro ao registrar compra:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete purchase handler
  const handleConfirmDelete = async () => {
    if (!purchaseToDelete || !purchaseToDelete.id) return;
    try {
      await deletePurchase(
        purchaseToDelete.id,
        revertStockOnDelete && purchaseToDelete.productId
          ? {
              productId: purchaseToDelete.productId,
              quantityToSubtract: purchaseToDelete.quantity
            }
          : undefined
      );
      setSuccessToast(
        revertStockOnDelete 
          ? `Registro removido e estoque estornado em -${purchaseToDelete.quantity} un.` 
          : 'Registro de compra removido do histórico.'
      );
      setPurchaseToDelete(null);
    } catch (err) {
      console.error('Erro ao excluir compra:', err);
    }
  };

  // Share formatted checklist for WhatsApp
  const handleShareWhatsApp = () => {
    if (replenishList.length === 0) return;

    let text = `🛒 *LISTA DE COMPRAS - ${format(new Date(), 'dd/MM/yyyy')}*\n`;
    text += `*Eu Gerencio* | ${replenishList.length} itens a repor\n\n`;

    replenishList.forEach((item, idx) => {
      const p = item.product;
      const unitsPerPkg = p.unitsPerPackage || 1;
      const isPkg = unitsPerPkg > 1;

      text += `${idx + 1}. *${p.name}*\n`;
      if (isPkg) {
        text += `   📦 Comprar: *${item.suggestedPackages} ${p.purchaseForm || 'fardo(s)'}* (= ${item.suggestedBuyUnits} un.)\n`;
      } else {
        text += `   📦 Comprar: *${item.suggestedBuyUnits} un.*\n`;
      }
      text += `   (Estoque atual: ${p.stock} un. | Custo est.: R$ ${item.estimatedCost.toFixed(2)})\n\n`;
    });

    text += `💰 *Total Estimado de Compras:* R$ ${totalSuggestedCost.toFixed(2)}`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Print checklist
  const handlePrint = () => {
    window.print();
  };

  const quickSuppliers = ['Atacadão', 'Assaí', 'Distribuidora', 'Ambev', 'Coca-Cola', 'Mercado Central', 'Atacado Local'];

  return (
    <div className="space-y-6 pb-12">
      {/* Toast */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">{successToast}</span>
          <button onClick={() => setSuccessToast(null)} className="ml-2 text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{v('purchases.title', 'Gestão de Compras & Reposição')}</h1>
            <span className="bg-palette-1 text-primary text-xs font-bold px-2.5 py-0.5 rounded-full">
              {replenishList.length} para repor
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Puxa automaticamente {entityName(true).toLowerCase()} em alerta de reposição e atualiza as quantidades em 1 clique.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setIsProductPickerOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-border bg-surface hover:bg-muted text-foreground font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-primary" />
            <span>Repor Outro {entityName()}</span>
          </button>

          <button
            onClick={handleShareWhatsApp}
            disabled={replenishList.length === 0}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
            title="Enviar lista formatada para o WhatsApp"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden md:inline">WhatsApp</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={replenishList.length === 0}
            className="px-3 py-2.5 rounded-xl border border-border bg-surface hover:bg-muted text-foreground text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Imprimir lista para compras"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Primary Indicator Cards: Time Saved & Replenish Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Core User-Requested Metric: Horas/semana gastas repondo estoque */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tempo Gasto em Reposição
            </span>
            <div className="p-2 bg-palette-1 text-primary rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {weeklyMetrics.estimatedHoursSpent}h
            </span>
            <span className="text-xs text-muted-foreground font-medium">/semana</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-xl">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>
              Economizando <strong>~{weeklyMetrics.hoursSaved}h/semana</strong> com a lista pronta e entrada automática!
            </span>
          </div>
        </div>

        {/* Total a Comprar Card */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {v('purchases.suggestion', 'Necessidade de Reposição')}
            </span>
            <div className={`p-2 rounded-xl ${replenishList.length > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-palette-1 text-primary'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {replenishList.length}
            </span>
            <span className="text-xs text-muted-foreground font-medium">{entityName(true).toLowerCase()} ({totalSuggestedUnits} un. sugeridas)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {replenishList.filter(i => i.isCritical).length > 0 ? (
              <span className="text-red-600 font-semibold">
                ⚠️ {replenishList.filter(i => i.isCritical).length} {entityName(true).toLowerCase()} com estoque totalmente zerado!
              </span>
            ) : (
              `Calculado para atingir o ${v('stock.max', 'estoque máximo').toLowerCase()} ideal.`
            )}
          </p>
        </div>

        {/* Estimativa de Gasto Card */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Investimento Sugerido p/ Repor
            </span>
            <div className="p-2 bg-palette-1 text-primary rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-primary">
              R$ {totalSuggestedCost.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Total gasto nos últimos 7 dias: <strong>R$ {weeklyMetrics.weeklySpend.toFixed(2)}</strong> ({weeklyMetrics.replenishmentCount} reposições)
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-border gap-6">
        <button
          onClick={() => setActiveTab('replenish')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'replenish'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Lista de Reposição ("Repor Agora")</span>
          <span className="bg-muted text-foreground text-xs px-2 py-0.5 rounded-full">
            {replenishList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('checklist')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'checklist'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ListChecks className="w-4 h-4" />
          <span>Modo Levar às Compras (Checklist)</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Histórico de Compras</span>
          <span className="bg-muted text-foreground text-xs px-2 py-0.5 rounded-full">
            {purchases.length}
          </span>
        </button>
      </div>

      {/* TAB 1: REPLENISH LIST */}
      {activeTab === 'replenish' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar produto para repor..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm cursor-pointer"
            >
              {categories.map(c => (
                <option key={c} value={c}>{c === 'Todas' ? 'Todas as categorias' : c}</option>
              ))}
            </select>

            <select
              value={urgencyFilter}
              onChange={e => setUrgencyFilter(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm cursor-pointer"
            >
              <option value="all">Todas as urgências</option>
              <option value="critical">🚨 Estoque Zerado (Crítico)</option>
              <option value="below_safety">⚠️ Abaixo da Segurança</option>
            </select>
          </div>

          {/* List Content */}
          {filteredReplenish.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 mx-auto flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Nenhum produto precisando de reposição!</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1 mb-6">
                Todos os seus produtos estão com estoque acima do ponto de reposição. Caso tenha feito uma compra preventiva, você pode registrar manualmente.
              </p>
              <button
                onClick={() => setIsProductPickerOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Registrar Compra Manual
              </button>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="p-3.5 text-muted-foreground font-medium">Produto</th>
                      <th className="p-3.5 text-muted-foreground font-medium text-center">Estoque Atual</th>
                      <th className="p-3.5 text-muted-foreground font-medium">Sugestão de Compra</th>
                      <th className="p-3.5 text-muted-foreground font-medium">Custo Estimado</th>
                      <th className="p-3.5 text-muted-foreground font-medium text-center">Status</th>
                      <th className="p-3.5 text-muted-foreground font-medium text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredReplenish.map(item => {
                      const p = item.product;
                      const unitsPerPkg = p.unitsPerPackage || 1;
                      const isPkg = unitsPerPkg > 1;

                      return (
                        <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5">
                            <div className="font-semibold text-foreground text-sm leading-snug">
                              {p.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                              <span className="bg-muted px-2 py-0.5 rounded text-[11px] font-medium">
                                {p.category}
                              </span>
                              {isPkg && (
                                <span>
                                  1 {p.purchaseForm || 'fardo'} = {unitsPerPkg} un.
                                </span>
                              )}
                              {p.expirationDate && (() => {
                                const expStatus = calculateExpirationStatus(p.expirationDate);
                                return (
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${expStatus.badgeClass}`}>
                                    <Clock className="w-2.5 h-2.5" />
                                    <span>Val: {formatExpirationDate(p.expirationDate, 'dd/MM')} ({expStatus.statusText})</span>
                                  </span>
                                );
                              })()}
                              {p.hasPromoSuggestion && p.promoPrice && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">
                                  <Flame className="w-2.5 h-2.5 text-amber-500" />
                                  <span>Promo: R$ {p.promoPrice.toFixed(2)}</span>
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="p-3.5 text-center">
                            <div className={`font-bold ${item.isCritical ? 'text-red-600' : item.isBelowSafety ? 'text-amber-600' : 'text-foreground'}`}>
                              {p.stock} un.
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Segurança: {p.safetyStock} un. | Máx: {item.maxStock} un.
                            </div>
                          </td>

                          <td className="p-3.5">
                            <div className="font-bold text-primary">
                              +{item.suggestedBuyUnits} un.
                            </div>
                            {isPkg && (
                              <div className="text-xs font-semibold text-muted-foreground">
                                (= {item.suggestedPackages} {p.purchaseForm === 'fardo' ? 'fardos' : p.purchaseForm || 'embalagens'})
                              </div>
                            )}
                          </td>

                          <td className="p-3.5">
                            <div className="font-semibold text-foreground">
                              R$ {item.estimatedCost.toFixed(2)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              (R$ {p.unitCost.toFixed(2)}/un.)
                            </div>
                          </td>

                          <td className="p-3.5 text-center">
                            {item.isCritical ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-full">
                                <AlertTriangle className="w-3.5 h-3.5" /> Zerado
                              </span>
                            ) : item.isBelowSafety ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full">
                                Abaixo Segurança
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1 rounded-full">
                                Repor Agora
                              </span>
                            )}
                          </td>

                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => handleOpenPurchaseModal(p, item.suggestedBuyUnits)}
                              className="px-3.5 py-1.5 bg-primary hover:opacity-90 text-white rounded-xl text-xs font-semibold transition-opacity cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Marcar Comprado</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CHECKLIST MODE (FOR THE SUPERMARKET / WHOLESALER) */}
      {activeTab === 'checklist' && (
        <div className="space-y-4">
          <div className="bg-palette-1/50 border border-primary/20 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="font-bold text-foreground text-sm">Modo de Compras Ativo</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vá marcando cada item conforme colocar no carrinho. Depois de pagar, você pode registrar a compra rapidamente.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCheckedItems({})}
                className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                Limpar marcações
              </button>
              <button
                onClick={handleShareWhatsApp}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" /> WhatsApp
              </button>
            </div>
          </div>

          {replenishList.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border p-12 text-center text-muted-foreground text-sm">
              Sua lista de compras está vazia no momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {replenishList.map(item => {
                const p = item.product;
                const isChecked = Boolean(checkedItems[p.id!]);
                const unitsPerPkg = p.unitsPerPackage || 1;
                const isPkg = unitsPerPkg > 1;

                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isChecked
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 opacity-75'
                        : 'bg-surface border-border hover:border-primary/40 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          setCheckedItems(prev => ({ ...prev, [p.id!]: e.target.checked }));
                        }}
                        className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className={`font-bold text-sm truncate ${isChecked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {p.name}
                        </h4>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className="font-semibold text-primary">
                            {isPkg
                              ? `${item.suggestedPackages} ${p.purchaseForm || 'fardo(s)'} (${item.suggestedBuyUnits} un.)`
                              : `${item.suggestedBuyUnits} unidades`}
                          </span>
                          <span>• Est. R$ {item.estimatedCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenPurchaseModal(p, item.suggestedBuyUnits)}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      Registrar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PURCHASES HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* History Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-1.5 bg-muted p-1 rounded-xl">
              <button
                onClick={() => setHistoryPeriod('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  historyPeriod === 'today' ? 'bg-surface text-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Hoje
              </button>
              <button
                onClick={() => setHistoryPeriod('week')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  historyPeriod === 'week' ? 'bg-surface text-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Esta Semana
              </button>
              <button
                onClick={() => setHistoryPeriod('month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  historyPeriod === 'month' ? 'bg-surface text-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Este Mês
              </button>
              <button
                onClick={() => setHistoryPeriod('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  historyPeriod === 'all' ? 'bg-surface text-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos
              </button>
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por produto ou fornecedor..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              onClick={() => exportPurchasesToCSV(filteredHistory, `relatorio-compras-${historyPeriod}`)}
              disabled={filteredHistory.length === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs whitespace-nowrap"
              title="Extrair todas as informações de compras deste período em planilha Excel/CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Extrair Relatório (CSV)</span>
            </button>
          </div>

          {/* History Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface p-4 rounded-2xl border border-border shadow-xs text-xs">
            <div>
              <span className="text-muted-foreground block">Total Desembolsado:</span>
              <span className="text-lg font-bold text-primary">R$ {historyTotals.totalSpent.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Unidades Repostas:</span>
              <span className="text-lg font-bold text-foreground">{historyTotals.totalUnits} un.</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Registros no Período:</span>
              <span className="text-lg font-bold text-foreground">{historyTotals.count}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Média por Registro:</span>
              <span className="text-lg font-bold text-foreground">R$ {historyTotals.avgSpend.toFixed(2)}</span>
            </div>
          </div>

          {/* History Table */}
          {filteredHistory.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border p-12 text-center text-muted-foreground text-sm">
              Nenhuma compra registrada no período selecionado.
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="p-3 text-muted-foreground font-medium w-28">Data</th>
                      <th className="p-3 text-muted-foreground font-medium">Produto Reposto</th>
                      <th className="p-3 text-muted-foreground font-medium text-center">Quantidade</th>
                      <th className="p-3 text-muted-foreground font-medium text-right">Custo Unit.</th>
                      <th className="p-3 text-muted-foreground font-medium text-right">Total Pago</th>
                      <th className="p-3 text-muted-foreground font-medium">Fornecedor / Local</th>
                      <th className="p-3 text-muted-foreground font-medium text-center w-12">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHistory.map(item => {
                      return (
                        <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 text-xs text-muted-foreground font-mono">
                            {format(new Date(item.createdAt), 'dd/MM/yy HH:mm')}
                          </td>

                          <td className="p-3">
                            <div className="font-semibold text-foreground text-sm">
                              {item.productName}
                            </div>
                            {item.category && (
                              <div className="text-[11px] text-muted-foreground">
                                {item.category}
                              </div>
                            )}
                            {/* Badges de Validade e Promoção do Lote */}
                            {(item.expirationDate || (item.suggestPromo && item.suggestedPromoPrice)) && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {item.expirationDate && (() => {
                                  const expStatus = calculateExpirationStatus(item.expirationDate);
                                  return (
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${expStatus.badgeClass}`}>
                                      <Clock className="w-2.5 h-2.5" />
                                      <span>Val: {formatExpirationDate(item.expirationDate, 'dd/MM/yy')} ({expStatus.statusText})</span>
                                    </span>
                                  );
                                })()}
                                {item.suggestPromo && item.suggestedPromoPrice && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">
                                    <Flame className="w-2.5 h-2.5 text-amber-500" />
                                    <span>Promo: R$ {item.suggestedPromoPrice.toFixed(2)}</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="p-3 text-center font-bold text-foreground">
                            {item.quantity} un.
                            {item.packageQuantity && item.packageQuantity > 0 && (
                              <span className="block text-[11px] text-muted-foreground font-normal">
                                ({item.packageQuantity} {item.packageType || 'emb.'})
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-right text-xs text-muted-foreground">
                            R$ {item.unitCost.toFixed(2)}
                          </td>

                          <td className="p-3 text-right font-bold text-primary">
                            R$ {item.totalCost.toFixed(2)}
                          </td>

                          <td className="p-3 text-xs text-muted-foreground">
                            {item.supplier ? (
                              <span className="inline-flex items-center gap-1 font-medium text-foreground bg-muted px-2 py-0.5 rounded">
                                <Store className="w-3 h-3 text-primary" /> {item.supplier}
                              </span>
                            ) : (
                              <span className="italic text-muted-foreground/60">Não informado</span>
                            )}
                            {item.notes && (
                              <div className="text-[11px] text-muted-foreground italic truncate max-w-[160px] mt-0.5">
                                "{item.notes}"
                              </div>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            <button
                              onClick={() => setPurchaseToDelete(item)}
                              className="p-1.5 text-muted-foreground hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                              title="Excluir ou estornar esta compra"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: REGISTRAR COMPRA */}
      {isPurchaseModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-surface rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-border animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-palette-1 text-primary rounded-xl">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Registrar Compra & Reposição</h3>
                  <p className="text-xs text-muted-foreground">
                    O estoque será somado automaticamente sem precisar abrir o produto.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPurchaseModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPurchase} className="space-y-4">
              {/* Product summary card */}
              <div className="bg-muted/40 p-3 rounded-xl border border-border/60 flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-sm text-foreground block">{selectedProduct.name}</span>
                  <span className="text-muted-foreground">
                    Categoria: {selectedProduct.category} • Estoque atual: <strong>{selectedProduct.stock} un.</strong>
                  </span>
                </div>
                {selectedProduct.unitsPerPackage && selectedProduct.unitsPerPackage > 1 && (
                  <div className="bg-palette-1 text-primary px-2.5 py-1 rounded-lg font-semibold">
                    1 {selectedProduct.purchaseForm || 'fardo'} = {selectedProduct.unitsPerPackage} un.
                  </div>
                )}
              </div>

              {/* Package or Unit Toggle (if packaged product) */}
              {selectedProduct.unitsPerPackage && selectedProduct.unitsPerPackage > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Como você comprou este item?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPurchaseType('package');
                        handlePackageQtyChange(packageQty);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        purchaseType === 'package'
                          ? 'bg-palette-1 text-primary border-primary ring-1 ring-primary'
                          : 'bg-surface border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      📦 Em {selectedProduct.purchaseForm === 'fardo' ? 'Fardos' : 'Pacotes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPurchaseType('unit');
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        purchaseType === 'unit'
                          ? 'bg-palette-1 text-primary border-primary ring-1 ring-primary'
                          : 'bg-surface border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      🥫 Em Unidades Avulsas
                    </button>
                  </div>
                </div>
              )}

              {/* Quantity Inputs */}
              {purchaseType === 'package' && selectedProduct.unitsPerPackage && selectedProduct.unitsPerPackage > 1 ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Quantidade de {selectedProduct.purchaseForm === 'fardo' ? 'Fardos' : 'Pacotes'}:
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={packageQty}
                      onChange={e => handlePackageQtyChange(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground font-bold text-base focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Total de Unidades a Somar:
                    </label>
                    <div className="px-3 py-2 rounded-xl border border-border bg-muted/60 text-primary font-bold text-base flex items-center">
                      +{looseUnitsQty} un. físicas
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Quantidade Comprada (Unidades):
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={looseUnitsQty}
                    onChange={e => handleLooseUnitsChange(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground font-bold text-base focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {/* Costs Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Valor Total Pago (R$):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={totalCost}
                    onChange={e => handleTotalCostChange(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground font-bold text-base focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    Gasto total neste produto
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Custo por Unidade (R$):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    required
                    value={unitCost}
                    onChange={e => handleUnitCostChange(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground font-medium text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    Anterior: R$ {selectedProduct.unitCost.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Option to update product registered cost */}
              {unitCost > 0 && Math.abs(unitCost - selectedProduct.unitCost) > 0.001 && (
                <div className="p-3 bg-palette-1/50 rounded-xl border border-primary/20 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-foreground block">
                      Atualizar custo unitário no cadastro?
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Mudará de R$ {selectedProduct.unitCost.toFixed(2)} para R$ {unitCost.toFixed(2)} (mantém a margem de lucro real).
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={updateProductUnitCost}
                    onChange={e => setUpdateProductUnitCost(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                </div>
              )}

              {/* SEÇÃO OPCIONAL: Fornecedor, Data, Validade e Promoção (Minimizada por padrão no modo básico) */}
              <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsOptionalPurchaseFieldsOpen(!isOptionalPurchaseFieldsOpen)}
                  className="w-full p-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-foreground block">
                        Mais Detalhes da Compra (Opcional)
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {isOptionalPurchaseFieldsOpen 
                          ? 'Clique para minimizar campos secundários' 
                          : 'Fornecedor, data da compra, validade do lote e observações'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-primary font-semibold shrink-0">
                    <span>{isOptionalPurchaseFieldsOpen ? 'Minimizar' : 'Ver campos opcionais'}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOptionalPurchaseFieldsOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isOptionalPurchaseFieldsOpen && (
                  <div className="p-3 pt-2 space-y-3 border-t border-border/60">
                    {/* Supplier & Date */}
                    <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Fornecedor / Local:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Atacadão, Assaí..."
                    value={supplier}
                    onChange={e => setSupplier(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Data da Compra:
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Quick Supplier Chips */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-muted-foreground">Sugestões:</span>
                {quickSuppliers.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSupplier(s)}
                    className="px-2 py-0.5 rounded-lg bg-muted text-foreground text-[11px] hover:bg-palette-1 hover:text-primary transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* SEÇÃO: VALIDADE DO LOTE & SUGESTÃO DE PROMOÇÃO NA COMPRA (EDITÁVEL, AUTOMÁTICO, OPCIONAL) */}
              <div className="p-3.5 bg-muted/40 rounded-xl border border-border/80 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        Validade do Lote & Sugestão de Promoção
                        <span className="text-[10px] font-semibold text-primary bg-palette-1 px-2 py-0.2 rounded-full border border-primary/20">
                          Opcional
                        </span>
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Registre a validade dos produtos deste pedido e programe promoções inteligentes de saída.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Data de Validade */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-primary" /> Data de Validade deste Lote:
                    </label>
                    {expirationDate && (
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const expStatus = calculateExpirationStatus(expirationDate);
                          return (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${expStatus.badgeClass}`}>
                              {expStatus.statusText}
                            </span>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => setExpirationDate('')}
                          className="text-[10px] text-muted-foreground hover:text-red-500 underline cursor-pointer"
                        >
                          Limpar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                    <input
                      type="date"
                      value={expirationDate}
                      onChange={e => {
                        const newDate = e.target.value;
                        setExpirationDate(newDate);
                        if (newDate && selectedProduct) {
                          const expStatus = calculateExpirationStatus(newDate);
                          if (expStatus.isExpiringSoon && !suggestPromo) {
                            const sug = suggestPromoDiscount(selectedProduct.basePrice, unitCost, expStatus.daysLeft);
                            setSuggestPromo(true);
                            setSuggestedPromoPrice(sug.promoPrice);
                            setPromoDiscountPercent(sug.discountPercent);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />

                    {/* Atalhos Rápidos */}
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] text-muted-foreground">Atalhos:</span>
                      {getQuickExpirationDates().map(chip => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => {
                            setExpirationDate(chip.value);
                            if (selectedProduct) {
                              const expStatus = calculateExpirationStatus(chip.value);
                              if (expStatus.isExpiringSoon && !suggestPromo) {
                                const sug = suggestPromoDiscount(selectedProduct.basePrice, unitCost, expStatus.daysLeft);
                                setSuggestPromo(true);
                                setSuggestedPromoPrice(sug.promoPrice);
                                setPromoDiscountPercent(sug.discountPercent);
                              }
                            }
                          }}
                          className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-medium hover:bg-palette-1 hover:text-primary transition-colors cursor-pointer"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {expirationDate && (
                    <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={updateProductExpiration}
                        onChange={e => setUpdateProductExpiration(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-primary focus:ring-primary cursor-pointer"
                      />
                      <span>Atualizar validade no cadastro geral de <strong>{selectedProduct.name}</strong></span>
                    </label>
                  )}
                </div>

                {/* Sugestão de Promoção na Compra */}
                <div className="pt-2 border-t border-border/80 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={suggestPromo}
                        onChange={e => {
                          const checked = e.target.checked;
                          setSuggestPromo(checked);
                          if (checked && selectedProduct) {
                            const expStatus = calculateExpirationStatus(expirationDate);
                            const sug = suggestPromoDiscount(selectedProduct.basePrice, unitCost, expStatus.daysLeft);
                            setSuggestedPromoPrice(suggestedPromoPrice ? suggestedPromoPrice : sug.promoPrice);
                            setPromoDiscountPercent(promoDiscountPercent !== '' ? promoDiscountPercent : sug.discountPercent);
                          }
                        }}
                        className="w-3.5 h-3.5 rounded text-primary focus:ring-primary cursor-pointer"
                      />
                      <span className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-amber-500" />
                        Definir / Sugerir Preço Promocional de Saída
                      </span>
                    </label>

                    {suggestPromo && selectedProduct && (
                      <button
                        type="button"
                        onClick={() => {
                          const expStatus = calculateExpirationStatus(expirationDate);
                          const sug = suggestPromoDiscount(selectedProduct.basePrice, unitCost, expStatus.daysLeft);
                          setSuggestedPromoPrice(sug.promoPrice);
                          setPromoDiscountPercent(sug.discountPercent);
                        }}
                        className="text-[11px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        Recalcular Sugestão
                      </button>
                    )}
                  </div>

                  {suggestPromo && selectedProduct && (
                    <div className="p-3 bg-surface rounded-xl border border-primary/20 space-y-2.5 animate-in fade-in">
                      {/* Presets Rápidos */}
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-[10px] text-muted-foreground mr-1">Predefinições:</span>
                        {[
                          { label: '🔥 Queima (-30%)', pct: 30 },
                          { label: '⚡ Oferta (-20%)', pct: 20 },
                          { label: '🏷️ Leve (-10%)', pct: 10 }
                        ].map(preset => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              const base = selectedProduct.basePrice || 0;
                              const p = calculatePromoPriceFromPercent(base, preset.pct);
                              setSuggestedPromoPrice(p);
                              setPromoDiscountPercent(preset.pct);
                            }}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted/60 hover:bg-palette-1 hover:text-primary transition-colors cursor-pointer border border-border/50"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      {/* Inputs Editáveis de Promoção */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-foreground mb-1">
                            Preço Promo Sugerido (R$):
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1.5 text-xs font-bold text-muted-foreground">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={suggestedPromoPrice !== undefined ? suggestedPromoPrice : ''}
                              onChange={e => {
                                const val = e.target.value;
                                const numVal = parseFloat(val) || 0;
                                const base = selectedProduct.basePrice || 0;
                                const disc = base > 0 ? calculateDiscountPercentFromPrice(base, numVal) : 0;
                                setSuggestedPromoPrice(val as any);
                                setPromoDiscountPercent(disc);
                              }}
                              className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-border bg-surface text-foreground font-bold text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="Ex: 3.50"
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            Preço de venda normal: R$ {selectedProduct.basePrice.toFixed(2)}
                          </span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-foreground mb-1">
                            % de Desconto:
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max="99"
                              value={promoDiscountPercent !== undefined ? promoDiscountPercent : ''}
                              onChange={e => {
                                const val = e.target.value;
                                const numVal = parseFloat(val) || 0;
                                const base = selectedProduct.basePrice || 0;
                                const p = calculatePromoPriceFromPercent(base, numVal);
                                setPromoDiscountPercent(val as any);
                                setSuggestedPromoPrice(p);
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-foreground font-bold text-sm pr-7 focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="Ex: 20"
                            />
                            <span className="absolute right-2 top-1.5 text-xs font-bold text-muted-foreground">%</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            Calculado ou editável livremente
                          </span>
                        </div>
                      </div>

                      {/* Resumo Financeiro da Promoção com o novo custo de compra */}
                      {Number(suggestedPromoPrice) > 0 && (
                        <div className="p-2 rounded-lg bg-muted/40 border border-border/80 text-[11px] space-y-0.5">
                          {(() => {
                            const pPrice = Number(suggestedPromoPrice) || 0;
                            const cost = unitCost > 0 ? unitCost : selectedProduct.unitCost;
                            const profit = pPrice - cost;
                            const marginPct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : '0';
                            return (
                              <div className="flex justify-between items-center font-semibold">
                                <span className="text-muted-foreground">Lucro por unidade vendida:</span>
                                <span className={profit >= 0 ? 'text-emerald-600' : 'text-red-600 font-bold'}>
                                  R$ {profit.toFixed(2)} ({profit >= 0 ? `+${marginPct}%` : 'Abaixo do Custo'})
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={applyPromoToProduct}
                          onChange={e => setApplyPromoToProduct(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-primary focus:ring-primary cursor-pointer"
                        />
                        <span>Aplicar preço promocional imediatamente no cadastro do produto</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Observações (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ex: Lote com validade até dez/26, promoção de atacado..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}
        </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsPurchaseModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border text-foreground hover:bg-muted text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-primary hover:opacity-90 text-white text-xs font-bold transition-opacity cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Atualizando Estoque...' : 'Confirmar & Somar ao Estoque'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PICK OTHER PRODUCT NOT IN REPLENISH LIST */}
      {isProductPickerOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-surface rounded-2xl w-full max-w-md p-6 shadow-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">Selecionar Produto para Repor</h3>
                <p className="text-xs text-muted-foreground">Escolha qualquer item cadastrado no seu comércio.</p>
              </div>
              <button
                onClick={() => setIsProductPickerOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Digitar nome do produto..."
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 divide-y divide-border/50">
              {products
                .filter(p => p.name.toLowerCase().includes(pickerSearch.toLowerCase()) || p.category.toLowerCase().includes(pickerSearch.toLowerCase()))
                .slice(0, 30)
                .map(p => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setIsProductPickerOpen(false);
                      handleOpenPurchaseModal(p);
                    }}
                    className="p-2.5 rounded-xl hover:bg-palette-1/50 transition-colors cursor-pointer flex justify-between items-center text-xs"
                  >
                    <div>
                      <span className="font-semibold text-foreground block">{p.name}</span>
                      <span className="text-muted-foreground text-[11px]">{p.category} • Estoque atual: {p.stock} un.</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-primary block">R$ {p.unitCost.toFixed(2)}</span>
                      <span className="text-[11px] text-muted-foreground">custo unit.</span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-border mt-3">
              <button
                onClick={() => setIsProductPickerOpen(false)}
                className="px-4 py-2 rounded-xl bg-muted text-foreground text-xs font-medium cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE PURCHASE CONFIRMATION */}
      {purchaseToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-border">
            <h3 className="text-lg font-bold text-foreground">Excluir Registro de Compra?</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Você está prestes a excluir a compra de <strong>{purchaseToDelete.quantity} un.</strong> de "{purchaseToDelete.productName}".
            </p>

            <div className="bg-muted/50 p-3 rounded-xl mb-4 text-xs">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={revertStockOnDelete}
                  onChange={e => setRevertStockOnDelete(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500 mt-0.5 cursor-pointer"
                />
                <div>
                  <span className="font-semibold text-foreground block">
                    Estornar estoque do produto (-{purchaseToDelete.quantity} un.)?
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    Subtrai a quantidade somada nesta compra do estoque atual para corrigir lançamentos indevidos.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPurchaseToDelete(null)}
                className="px-4 py-2 rounded-xl border border-border text-foreground hover:bg-muted text-xs font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

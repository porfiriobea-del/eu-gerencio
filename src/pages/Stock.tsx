import { getPackageUnits, CIGARETTE_UNITS, isValidStockQuantity } from '../lib/productUnits';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { deleteField } from 'firebase/firestore';
import { subscribeProducts, updateProduct, adjustProductStock, addProduct, addMultipleProducts, deleteProduct, deleteMultipleProducts, subscribeTodaySales, recordMovement } from '../lib/api';
import { Product, Sale } from '../types';
import { getAllCategories, saveCustomCategory } from '../lib/categories';
import { Plus, Edit2, Trash2, Package, AlertTriangle, CheckCircle2, ShoppingBag, Calendar, ArrowUpRight, TrendingUp, Info, Tag, Check, X, RotateCcw, Sparkles, Camera, Image as ImageIcon, Clock, Flame, Percent, LayoutGrid, List, ChevronDown, ChevronUp, Minus, Eye, EyeOff, Loader2 } from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { usePreferences } from '../lib/preferencesContext';
import { PocketTip } from '../components/PocketTip';
import { PreAddProductsModal } from '../components/PreAddProductsModal';
import { recognizeProductFromImage, prepareProductImage } from '../lib/geminiProductScanner';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { analyzeDuplicates, normalizeProductName } from '../lib/duplicateDetector';
import { PRELOADED_PRODUCTS } from '../lib/preloadedProducts';
import { 
  calculateExpirationStatus, 
  getQuickExpirationDates, 
  suggestPromoDiscount, 
  calculatePromoPriceFromPercent, 
  calculateDiscountPercentFromPrice,
  formatExpirationDate
} from '../lib/promoUtils';

export default function Stock() {
  const { v, entityName, languageMode, isBasicMode, simpleViewMode } = usePreferences();
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterReplenishOnly, setFilterReplenishOnly] = useState(false);
  const [filterExpiringOnly, setFilterExpiringOnly] = useState(false);
  const [filterPromoOnly, setFilterPromoOnly] = useState(false);
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryVersion, setCategoryVersion] = useState(0);
  const [displayMode, setDisplayMode] = useState<'cards' | 'table'>(() => (simpleViewMode || isBasicMode) ? 'cards' : 'table');
  const [expandedProductIds, setExpandedProductIds] = useState<Record<string, boolean>>({});

  const toggleProductExpand = (id: string) => {
    setExpandedProductIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllExpand = () => {
    const allExpanded = filteredProducts.every(p => p.id && expandedProductIds[p.id]);
    const next: Record<string, boolean> = {};
    if (!allExpanded) {
      filteredProducts.forEach(p => { if (p.id) next[p.id] = true; });
    }
    setExpandedProductIds(next);
  };

  // States for creating a new category inside the product modal
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // States for editing monthly initial stock and date directly
  const [editingInitialStockProduct, setEditingInitialStockProduct] = useState<Product | null>(null);
  const [initialStockEditDate, setInitialStockEditDate] = useState<string>('');
  const [initialStockEditUnits, setInitialStockEditUnits] = useState<number>(0);
  const [initialStockEditPackages, setInitialStockEditPackages] = useState<number>(0);
  const [initialStockEditLoose, setInitialStockEditLoose] = useState<number>(0);
  const [isSavingInitialStock, setIsSavingInitialStock] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // States for deleting product (single & multiple)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState<boolean>(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // States for Batch Monthly Turnover ("Virada de Mês")
  const [isMonthlyTurnoverOpen, setIsMonthlyTurnoverOpen] = useState<boolean>(false);
  const [turnoverDate, setTurnoverDate] = useState<string>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [turnoverMode, setTurnoverMode] = useState<'copy_current' | 'keep_qty'>('copy_current');
  const [isSavingTurnover, setIsSavingTurnover] = useState<boolean>(false);

  // State for Pre-Add Products & Image Import Modal
  const [isPreAddModalOpen, setIsPreAddModalOpen] = useState<boolean>(false);

  const categories = useMemo(() => {
    return getAllCategories(products.map(p => p.category));
  }, [products, categoryVersion]);

  const [formData, setFormData] = useState<any>({
    name: '', type: 'comum', category: 'Diversos', 
    imageUrl: '',
    purchaseForm: 'unidade', unitsPerPackage: 1, 
    unitCost: 0, purchaseTotalCost: '', stock: 0, safetyStock: 0, 
    maxStock: 0, initialStock: 0, initialStockDate: format(new Date(), 'yyyy-MM-dd'),
    dailyAverageSales: 0, replacementDays: 0, basePrice: 0,
    expirationDate: '',
    hasPromoSuggestion: false,
    promoPrice: '',
    promoDiscountPercent: '',
    promoNotes: ''
  });

  const formUnitsPerPackage = getPackageUnits(formData);
  const formCostPerUnit = Number(formData.unitCost) / (formData.type === 'cigarro' ? 20 : 1);

  const [isReadingLabel, setIsReadingLabel] = useState(false);
  const [labelReadError, setLabelReadError] = useState<string | null>(null);
  const labelRequestRef = useRef(0);

  useEffect(() => {
    labelRequestRef.current++;
    setIsReadingLabel(false);
    setLabelReadError(null);
    return () => { labelRequestRef.current++; };
  }, [isModalOpen, editingId]);

  const handleProductImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const requestId = ++labelRequestRef.current;
    setIsReadingLabel(true);
    setLabelReadError(null);
    try {
      const imageBase64 = await prepareProductImage(file);
      if (requestId !== labelRequestRef.current) return;
      setFormData((prev: any) => ({ ...prev, imageUrl: imageBase64 }));

      const { name, category } = await recognizeProductFromImage(imageBase64, categories);
      if (requestId !== labelRequestRef.current) return;
      setFormData((prev: any) => ({ ...prev, name, category }));
    } catch (error) {
      if (requestId !== labelRequestRef.current) return;
      setLabelReadError(error instanceof Error ? error.message : 'Não foi possível ler o rótulo.');
    } finally {
      if (requestId === labelRequestRef.current) setIsReadingLabel(false);
    }
  };

  useEffect(() => {
    return subscribeProducts(setProducts);
  }, []);

  const handleAddNewCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    saveCustomCategory(trimmed);
    setCategoryVersion(v => v + 1);
    handleCategoryChange(trimmed);
    setNewCategoryName('');
    setShowNewCategoryInput(false);
  };

  const normalizeCategory = (category: string) => category
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  const isBeverageCategory = (category: string) =>
    /\b(bebidas?|refrigerantes?|cervejas?|sucos?|aguas?|energeticos?|destilados?)\b/.test(normalizeCategory(category));

  const handleCategoryChange = (cat: string) => {
    setFormData((prev: any) => {
      const isCigarette = /\bcigarros?\b/.test(normalizeCategory(cat));
      const wasCigarette = prev.type === 'cigarro';
      const sameBeverageGroup = isBeverageCategory(prev.category);

      if (isCigarette) {
        const baseUnit = Number(prev.basePrice) > 0 ? Number(prev.basePrice) : 0.75;
        return {
          ...prev,
          category: cat,
          type: 'cigarro',
          purchaseForm: 'pacote',
          unitsPerPackage: CIGARETTE_UNITS.pack,
          stockUnit: 'carteira', // 1 maço = 10 carteiras; 1 carteira = 20 avulsos.
          unitCost: Number(prev.unitCost) > 0 ? prev.unitCost : 9,
          basePrice: baseUnit,
          priceUnit: baseUnit,
          pricePack: wasCigarette && prev.pricePack ? prev.pricePack : Number((baseUnit * 200).toFixed(2)),
          priceCart: wasCigarette && prev.priceCart ? prev.priceCart : Number((baseUnit * 20).toFixed(2)),
          priceHalfCart: wasCigarette && prev.priceHalfCart ? prev.priceHalfCart : Number((baseUnit * 10).toFixed(2)),
          pricePackage: undefined,
          purchaseTotalCost: wasCigarette ? prev.purchaseTotalCost : '',
          safetyStock: Number(prev.safetyStock) > 2 ? prev.safetyStock : 2,
          maxStock: Number(prev.maxStock) > 20 ? prev.maxStock : 20
        };
      }

      const isBeverage = isBeverageCategory(cat);
      const keepPackage = isBeverage && sameBeverageGroup && !wasCigarette;
      return {
        ...prev,
        category: cat,
        type: 'comum',
        stockUnit: 'unidade',
        purchaseForm: isBeverage ? 'fardo' : 'unidade',
        unitsPerPackage: isBeverage ? (keepPackage && Number(prev.unitsPerPackage) > 1 ? Number(prev.unitsPerPackage) : 12) : 1,
        pricePackage: keepPackage ? prev.pricePackage : undefined,
        purchaseTotalCost: keepPackage ? prev.purchaseTotalCost : '',
        priceUnit: undefined,
        pricePack: undefined,
        priceCart: undefined,
        priceHalfCart: undefined
      };
    });
  };

  const openModal = (product?: Product) => {
    if (product) {
      const unitsPkg = getPackageUnits(product);
      const calculatedPkgCost = product.unitCost && unitsPkg > 1 
        ? Number((product.unitCost * unitsPkg).toFixed(2)) 
        : product.unitCost;
      setFormData({
        ...product,
        unitsPerPackage: unitsPkg,
        purchaseForm: product.type === 'cigarro' ? 'pacote' : product.purchaseForm,
        imageUrl: product.imageUrl || '',
        purchaseTotalCost: calculatedPkgCost ? String(calculatedPkgCost) : '',
        initialStock: product.initialStock !== undefined ? product.initialStock : product.stock,
        initialStockDate: product.initialStockDate || (product.createdAt ? format(new Date(product.createdAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')),
        maxStock: product.maxStock || Math.max(product.stock, product.safetyStock * 2 || 20),
        pricePackage: product.pricePackage !== undefined ? product.pricePackage : (unitsPkg > 1 ? Number((product.basePrice * unitsPkg).toFixed(2)) : undefined),
        pricePack: product.pricePack !== undefined ? product.pricePack : (product.type === 'cigarro' ? Number((product.basePrice * 200).toFixed(2)) : undefined),
        priceCart: product.priceCart !== undefined ? product.priceCart : (product.type === 'cigarro' ? Number((product.basePrice * 20).toFixed(2)) : undefined),
        priceHalfCart: product.priceHalfCart !== undefined ? product.priceHalfCart : (product.type === 'cigarro' ? Number((product.basePrice * 10).toFixed(2)) : undefined),
        priceUnit: product.priceUnit !== undefined ? product.priceUnit : product.basePrice,
        expirationDate: product.expirationDate || '',
        hasPromoSuggestion: !!product.hasPromoSuggestion,
        promoPrice: product.promoPrice !== undefined ? product.promoPrice : '',
        promoDiscountPercent: product.promoDiscountPercent !== undefined ? product.promoDiscountPercent : '',
        promoNotes: product.promoNotes || '',
      });
      setEditingId(product.id!);
    } else {
      setFormData({
        name: '', type: 'comum', category: 'Diversos', 
        imageUrl: '',
        purchaseForm: 'unidade', unitsPerPackage: 1, 
        unitCost: 0, purchaseTotalCost: '', stock: 0, safetyStock: 5, 
        maxStock: 30, initialStock: 0, initialStockDate: format(new Date(), 'yyyy-MM-dd'),
        dailyAverageSales: 1, replacementDays: 3, basePrice: 0,
        pricePackage: undefined,
        pricePack: undefined,
        priceCart: undefined,
        priceHalfCart: undefined,
        priceUnit: undefined,
        expirationDate: '',
        hasPromoSuggestion: false,
        promoPrice: '',
        promoDiscountPercent: '',
        promoNotes: ''
      });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const stockNum = Number(formData.stock);
    const safetyNum = Number(formData.safetyStock);
    const maxNum = Number(formData.maxStock) || Math.max(stockNum, safetyNum * 2, 10);
    const initStockNum = Number(formData.initialStock !== undefined ? formData.initialStock : stockNum);
    const unitsPkg = getPackageUnits(formData);
    if (!(formData.type === 'cigarro' ? isValidStockQuantity(stockNum) && isValidStockQuantity(initStockNum) : Number.isSafeInteger(stockNum) && stockNum >= 0 && Number.isSafeInteger(initStockNum) && initStockNum >= 0)) {
      alert('Informe um estoque válido: cigarros em carteiras (incrementos de 0,05), demais produtos em unidades inteiras.');
      return;
    }
    if (formData.type === 'cigarro' && ['priceUnit', 'priceHalfCart', 'priceCart', 'pricePack'].some(field =>
      formData[field] !== undefined && formData[field] !== '' &&
      (!Number.isFinite(Number(formData[field])) || Number(formData[field]) < 0))) {
      alert('Informe preços válidos para cada formato de cigarro.');
      return;
    }

    const payload: any = {
      ...formData,
      stockUnit: formData.type === 'cigarro' ? 'carteira' : 'unidade',
      unitsPerPackage: unitsPkg,
      purchaseForm: formData.type === 'cigarro' ? 'pacote' : formData.purchaseForm,
      unitCost: Number(formData.unitCost) || 0,
      stock: stockNum,
      safetyStock: safetyNum,
      maxStock: maxNum,
      initialStock: initStockNum,
      initialStockDate: formData.initialStockDate || format(new Date(), 'yyyy-MM-dd'),
      dailyAverageSales: Number(formData.dailyAverageSales) || 0,
      replacementDays: Number(formData.replacementDays) || 0,
      basePrice: Number(formData.basePrice) || 0
    };

    delete payload.purchaseTotalCost;

    if (formData.expirationDate && String(formData.expirationDate).trim() !== '') {
      payload.expirationDate = String(formData.expirationDate).trim();
    } else if (editingId) {
      payload.expirationDate = deleteField();
    } else {
      delete payload.expirationDate;
    }

    if (formData.hasPromoSuggestion) {
      payload.hasPromoSuggestion = true;
      payload.promoPrice = Number(formData.promoPrice) || 0;
      if (formData.promoDiscountPercent !== undefined && formData.promoDiscountPercent !== '') {
        payload.promoDiscountPercent = Number(formData.promoDiscountPercent);
      } else if (editingId) {
        payload.promoDiscountPercent = deleteField();
      } else {
        delete payload.promoDiscountPercent;
      }
      if (formData.promoNotes && String(formData.promoNotes).trim() !== '') {
        payload.promoNotes = String(formData.promoNotes).trim();
      } else if (editingId) {
        payload.promoNotes = deleteField();
      } else {
        delete payload.promoNotes;
      }
    } else {
      payload.hasPromoSuggestion = false;
      if (editingId) {
        payload.promoPrice = deleteField();
        payload.promoDiscountPercent = deleteField();
        payload.promoNotes = deleteField();
      } else {
        delete payload.promoPrice;
        delete payload.promoDiscountPercent;
        delete payload.promoNotes;
      }
    }

    if (formData.type === 'cigarro') {
      if (formData.pricePack !== undefined && formData.pricePack !== '') {
        payload.pricePack = Number(formData.pricePack);
      } else if (editingId) {
        payload.pricePack = deleteField();
      } else {
        delete payload.pricePack;
      }
      if (formData.priceCart !== undefined && formData.priceCart !== '') {
        payload.priceCart = Number(formData.priceCart);
      } else if (editingId) {
        payload.priceCart = deleteField();
      } else {
        delete payload.priceCart;
      }
      if (formData.priceHalfCart !== undefined && formData.priceHalfCart !== '') {
        payload.priceHalfCart = Number(formData.priceHalfCart);
      } else if (editingId) {
        payload.priceHalfCart = deleteField();
      } else {
        delete payload.priceHalfCart;
      }
      if (formData.priceUnit !== undefined && formData.priceUnit !== '') {
        payload.priceUnit = Number(formData.priceUnit);
        payload.basePrice = Number(formData.priceUnit);
      } else if (editingId) {
        payload.priceUnit = deleteField();
      } else {
        delete payload.priceUnit;
      }
      if (editingId) {
        payload.pricePackage = deleteField();
      } else {
        delete payload.pricePackage;
      }
    } else {
      if (editingId) {
        payload.pricePack = deleteField();
        payload.priceCart = deleteField();
        payload.priceHalfCart = deleteField();
        payload.priceUnit = deleteField();
      } else {
        delete payload.pricePack;
        delete payload.priceCart;
        delete payload.priceHalfCart;
        delete payload.priceUnit;
      }
      if (unitsPkg > 1 && formData.pricePackage !== undefined && formData.pricePackage !== '') {
        payload.pricePackage = Number(formData.pricePackage);
      } else if (editingId) {
        payload.pricePackage = deleteField();
      } else {
        delete payload.pricePackage;
      }
    }

    // Strip any keys with undefined values
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    }

    if (editingId) {
      await updateProduct(editingId, payload);
    } else {
      await addProduct(payload);
    }
    setIsModalOpen(false);
  };

  // Delete product action with loading state & optimistic update
  const handleDeleteProduct = async () => {
    if (!productToDelete?.id || isDeleting) return;
    setIsDeleting(true);
    const targetProduct = productToDelete;
    const targetId = targetProduct.id!;

    // 1. Atualização Otimista Imediata no estado local
    setProducts(prev => prev.filter(p => p.id !== targetId));
    setSelectedProductIds(prev => prev.filter(id => id !== targetId));

    try {
      await deleteProduct(targetId, targetProduct.name);
      setToastMessage(`✓ Produto "${targetProduct.name}" excluído.`);
      setTimeout(() => setToastMessage(null), 4000);
      setProductToDelete(null);
      if (editingId === targetId) {
        setIsModalOpen(false);
        setEditingId(null);
      }
    } catch (err) {
      console.error('Erro ao excluir produto no banco de dados:', err);
      // Caso ocorra erro na exclusão, recarrega o item de volta ao estado local
      setProducts(prev => prev.some(p => p.id === targetId) ? prev : [...prev, targetProduct]);
      setToastMessage(`⚠️ Erro ao excluir "${targetProduct.name}". O produto foi recarregado no estoque.`);
      setTimeout(() => setToastMessage(null), 6000);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredProducts.filter(p => !!p.id).map(p => p.id as string);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedProductIds.includes(id));
    if (allSelected) {
      setSelectedProductIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedProductIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedProductIds([]);
  };

  // Helper to trigger bulk delete for all listed items or current selection
  const handleTriggerDeleteAll = () => {
    if (selectedProductIds.length === 0) {
      const allFilteredIds = filteredProducts.filter(p => !!p.id).map(p => p.id as string);
      if (allFilteredIds.length === 0) return;
      setSelectedProductIds(allFilteredIds);
    }
    setIsBulkDeleteModalOpen(true);
  };

  // Bulk delete action: Optimistic update + single bulk request with Supabase .in('id', ids)
  const handleConfirmBulkDelete = async () => {
    if (selectedProductIds.length === 0 || isBulkDeleting) return;
    const idsToDelete = [...selectedProductIds];
    const itemsToDelete = products.filter(p => p.id && idsToDelete.includes(p.id));

    // 1. Atualização Otimista Imediata:
    // Remove todos os itens selecionados da tela instantaneamente assim que a exclusão for confirmada
    setProducts(prev => prev.filter(p => !p.id || !idsToDelete.includes(p.id)));

    // Fecha a subtela/modal e limpa a seleção imediatamente
    setIsBulkDeleteModalOpen(false);
    setSelectedProductIds([]);
    if (editingId && idsToDelete.includes(editingId)) {
      setIsModalOpen(false);
      setEditingId(null);
    }

    setToastMessage(`✓ ${idsToDelete.length} item(ns) excluído(s) com sucesso.`);
    setTimeout(() => setToastMessage(null), 4000);

    // 2. Exclusão em Lote (Bulk Delete): Executa uma única requisição rápida (.in('id', idsSelecionados))
    setIsBulkDeleting(true);
    try {
      await deleteMultipleProducts(idsToDelete);
    } catch (err) {
      console.error('Erro na exclusão em lote de produtos:', err);
      // Rollback otimista: recarrega os itens que falharam de volta ao estado local
      setProducts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const toRestore = itemsToDelete.filter(item => !existingIds.has(item.id));
        return [...prev, ...toRestore];
      });
      setToastMessage(`⚠️ Erro ao excluir os itens selecionados. Os produtos foram recarregados.`);
      setTimeout(() => setToastMessage(null), 6000);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Quick purchase/stock update helper
  const handleQuickAddStock = async (product: Product, amountToAdd: number) => {
    if (!product.id) return;
    try {
      await adjustProductStock(product.id, amountToAdd);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível atualizar o estoque.');
    }
  };

  const duplicateAnalysis = useMemo(() => {
    return analyzeDuplicates(products);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const reorderPoint = p.safetyStock + (p.dailyAverageSales * p.replacementDays);
      const needsReplenish = p.stock <= reorderPoint;
      
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
      const matchesReplenish = !filterReplenishOnly || needsReplenish;
      const matchesDuplicates = !filterDuplicatesOnly || (p.id ? duplicateAnalysis.duplicateIdSet.has(p.id) : false);

      let matchesExpiring = true;
      if (filterExpiringOnly) {
        if (!p.expirationDate) {
          matchesExpiring = false;
        } else {
          const expStatus = calculateExpirationStatus(p.expirationDate);
          matchesExpiring = expStatus.isExpiringSoon || expStatus.isExpired;
        }
      }

      let matchesPromo = true;
      if (filterPromoOnly) {
        matchesPromo = !!p.hasPromoSuggestion && !!p.promoPrice;
      }

      return matchesSearch && matchesCategory && matchesReplenish && matchesExpiring && matchesPromo && matchesDuplicates;
    });
  }, [products, searchTerm, selectedCategory, filterReplenishOnly, filterExpiringOnly, filterPromoOnly, filterDuplicatesOnly, duplicateAnalysis]);

  const replenishCount = useMemo(() => {
    return products.filter(p => p.stock <= (p.safetyStock + (p.dailyAverageSales * p.replacementDays))).length;
  }, [products]);

  const expiringCount = useMemo(() => {
    return products.filter(p => {
      if (!p.expirationDate) return false;
      const exp = calculateExpirationStatus(p.expirationDate);
      return exp.isExpiringSoon || exp.isExpired;
    }).length;
  }, [products]);

  const promoCount = useMemo(() => {
    return products.filter(p => !!p.hasPromoSuggestion && !!p.promoPrice).length;
  }, [products]);

  const totalReplenishCost = useMemo(() => {
    return products.reduce((acc, p) => {
      const max = p.maxStock || Math.max(p.stock, p.safetyStock * 2, 10);
      const reorderPoint = p.safetyStock + (p.dailyAverageSales * p.replacementDays);
      if (p.stock <= reorderPoint && max > p.stock) {
        const qtyToBuy = max - p.stock;
        return acc + (qtyToBuy * p.unitCost);
      }
      return acc;
    }, 0);
  }, [products]);

  const openInitialStockModal = (p: Product) => {
    setEditingInitialStockProduct(p);
    const currentDateBase = p.initialStockDate || format(startOfMonth(new Date()), 'yyyy-MM-dd');
    setInitialStockEditDate(currentDateBase);
    
    const initStock = p.initialStock !== undefined ? p.initialStock : p.stock;
    const unitsPkg = getPackageUnits(p);
    
    if (unitsPkg > 1) {
      setInitialStockEditPackages(Math.floor(initStock / unitsPkg));
      setInitialStockEditLoose(initStock % unitsPkg);
    }
    setInitialStockEditUnits(initStock);
  };

  const handleSaveInitialStock = async () => {
    if (!editingInitialStockProduct?.id) return;
    try {
      setIsSavingInitialStock(true);
      const unitsPkg = getPackageUnits(editingInitialStockProduct);
      let finalUnits = initialStockEditUnits;
      if (unitsPkg > 1) {
        finalUnits = (initialStockEditPackages * unitsPkg) + initialStockEditLoose;
      }

      await updateProduct(editingInitialStockProduct.id, {
        initialStock: Math.max(0, finalUnits),
        initialStockDate: initialStockEditDate || format(new Date(), 'yyyy-MM-dd')
      });

      setToastMessage(`Estoque inicial e data de "${editingInitialStockProduct.name}" atualizados com sucesso!`);
      setEditingInitialStockProduct(null);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      alert('Erro ao atualizar estoque inicial: ' + err.message);
    } finally {
      setIsSavingInitialStock(false);
    }
  };

  const handleSaveMonthlyTurnover = async () => {
    if (products.length === 0) return;
    try {
      setIsSavingTurnover(true);
      for (const p of products) {
        if (!p.id) continue;
        const newInitialStock = turnoverMode === 'copy_current' ? p.stock : (p.initialStock !== undefined ? p.initialStock : p.stock);
        await updateProduct(p.id, {
          initialStock: newInitialStock,
          initialStockDate: turnoverDate
        });
      }
      setToastMessage(`Virada de mês aplicada com sucesso a ${products.length} produtos para a data ${format(new Date(turnoverDate + 'T12:00:00'), 'dd/MM/yyyy')}!`);
      setIsMonthlyTurnoverOpen(false);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      alert('Erro ao aplicar virada de mês: ' + err.message);
    } finally {
      setIsSavingTurnover(false);
    }
  };

  const [isInsertingPhotoProducts, setIsInsertingPhotoProducts] = useState<boolean>(false);

  const handleInsertPhotoProductsDirectly = async () => {
    setIsInsertingPhotoProducts(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const existingLower = new Set(products.map(p => p.name.toLowerCase().trim()));
      const toInsert = PRELOADED_PRODUCTS.filter(p => !existingLower.has(p.name.toLowerCase().trim()));

      if (toInsert.length === 0) {
        alert('Todos os produtos das fotos já foram cadastrados no seu estoque anteriormente!');
        setIsInsertingPhotoProducts(false);
        return;
      }

      const payload: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[] = toInsert.map(p => ({
        name: p.name,
        type: p.type,
        category: p.category,
        purchaseForm: p.purchaseForm,
        unitsPerPackage: getPackageUnits(p),
        unitCost: p.unitCost,
        stock: 0, // Aguardando contagem de estoque
        safetyStock: p.safetyStock,
        maxStock: p.maxStock,
        initialStock: 0,
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

      const count = await addMultipleProducts(payload);
      recordMovement({
        type: 'product_create',
        description: `Carga de produtos: +${count} produtos do catálogo cadastrados no estoque com valores de venda completos.`,
        quantity: count
      }).catch(() => {});
      setToastMessage(`✓ ${count} produtos do catálogo cadastrados com sucesso com os valores de venda certinhos! Você já pode fazer a contagem.`);
      setTimeout(() => setToastMessage(null), 6000);
    } catch (err: any) {
      alert('Erro ao cadastrar produtos: ' + err.message);
    } finally {
      setIsInsertingPhotoProducts(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (() => {
        const isError = toastMessage.includes('⚠️') || toastMessage.toLowerCase().includes('erro');
        return (
          <div className={`fixed bottom-6 right-6 z-50 ${isError ? 'bg-red-600' : 'bg-emerald-600'} text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 max-w-md`}>
            {isError ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span className="text-sm font-medium">{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="ml-2 text-white/80 hover:text-white shrink-0 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })()}

      {/* Header & Metrics */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{v('stock.title', 'Controle de Estoque & Reposição')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestão com base na {v('stock.initialDate', 'data do estoque inicial').toLowerCase()} e limites de {v('stock.max', 'estoque máximo').toLowerCase()} para compras precisas.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => setIsMonthlyTurnoverOpen(true)}
            className="flex-1 sm:flex-none bg-surface border border-border hover:bg-muted text-foreground px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-2 font-medium cursor-pointer transition-colors text-sm shadow-xs"
            title={`Atualizar a ${v('stock.initialDate', 'data do estoque inicial').toLowerCase()} para a ${v('stock.turnoverAction', 'virada de mês').toLowerCase()}`}
          >
            <Calendar className="w-4 h-4 text-primary" />
            <span>{v('stock.turnoverAction', 'Virada de Mês')}</span>
          </button>

          <Link
            to="/compras"
            className="flex-1 sm:flex-none bg-surface border border-border hover:bg-muted text-foreground px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-medium cursor-pointer transition-colors text-sm shadow-xs"
          >
            <ShoppingBag className="w-4 h-4 text-primary" />
            <span>{v('purchases.title', 'Compras de Reposição')}</span>
          </Link>

          <button
            onClick={() => setIsPreAddModalOpen(true)}
            className="flex-1 sm:flex-none bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold cursor-pointer transition-colors text-sm shadow-xs"
            title="Pré-adicionar produtos de alta rotação ou importar fotos de tabelas e notas"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Pré-Adicionar / Fotos</span>
          </button>

          <button
            onClick={() => setIsCameraModalOpen(true)}
            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold cursor-pointer transition-all text-sm shadow-sm"
            title="Tirar foto do produto com a câmera do celular ou computador para preencher apenas nome e categoria automaticamente"
          >
            <Camera className="w-4 h-4" />
            <span>📸 Cadastrar por Foto (IA)</span>
          </button>

          <button 
            onClick={() => openModal()} 
            className="flex-1 sm:flex-none bg-primary text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 font-medium cursor-pointer shadow-sm text-sm"
          >
            <Plus className="w-4 h-4"/> {v('entity.new', `Novo ${entityName()}`)}
          </button>
        </div>
      </div>

      {/* Banner de Destaque: Inserir Produtos das Fotos Anexadas */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-surface border border-amber-300 dark:border-amber-800/60 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                Colocar Todos os Produtos Pré-Cadastrados no Estoque
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                Catálogo Completo & Valores Certinhos
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
              Cigarros com valores nos 4 formatos (Maço, Carteira, Meia e Avulso), Bebidas, Doces, Sedas, Isqueiros e Mercearia já configurados com seus valores de venda. Clique no botão ao lado para cadastrar todos os produtos de uma só vez!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
          <button
            onClick={() => setIsPreAddModalOpen(true)}
            className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl border border-border bg-surface hover:bg-muted text-foreground text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
          >
            Ver Detalhes / Filtros
          </button>
          <button
            onClick={handleInsertPhotoProductsDirectly}
            disabled={isInsertingPhotoProducts}
            className="flex-1 sm:flex-none px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isInsertingPhotoProducts ? (
              <span>Cadastrando...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Colocar Todos os Produtos Agora</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dica de Bolso para Estoque */}
      <PocketTip
        id="stock-guide"
        badgeText="Dica de Bolso"
        title={`Como Usar o ${v('stock.title', 'Estoque')} em 2 Passos`}
        subtitle="Passo a passo simples e rápido para manter tudo organizado na prateleira sem complicação."
        helpfulNote="Dica: o sistema calcula o que vender e o que repor automaticamente para você não passar aperto!"
        sections={[
          {
            id: 'cadastrar-novo',
            badge: 'Adicionar produto',
            title: `Como cadastrar um ${entityName().toLowerCase()} novo`,
            subtitle: 'Faça isso quando tiver uma mercadoria nova para começar a vender.',
            step1: {
              label: `1. Clique em "+ Novo ${entityName()}"`,
              description: `Aperte o botão colorido no topo da página ou no botão logo abaixo para abrir a ficha de cadastro.`
            },
            step2: {
              label: '2. Coloque o nome, os valores e salve',
              description: 'Escreva o nome do item, quanto você paga nele e por quanto vai vender. Depois aperte Salvar!'
            },
            actionButton: {
              label: `+ Cadastrar Novo ${entityName()} Agora`,
              onClick: () => openModal(),
              icon: <Plus className="w-4 h-4" />
            }
          },
          {
            id: 'atualizar-quantidade',
            badge: 'Contagem e prateleira',
            title: 'Como atualizar a quantidade de um item',
            subtitle: 'Use quando contar os itens na prateleira ou quando chegarem novos do fornecedor.',
            step1: {
              label: '1. Localize o item e clique em "Estoque Inicial" ou no lápis',
              description: 'Procure o produto na lista abaixo. Clique no botão de estoque inicial ou no ícone de editar.'
            },
            step2: {
              label: '2. Digite a nova quantidade e confirme',
              description: 'Escreva quantas unidades você tem na prateleira e salve. O sistema atualiza o total no mesmo instante!'
            },
            actionButton: {
              label: 'Registrar Entrada por Compra',
              to: '/compras',
              icon: <ShoppingBag className="w-4 h-4" />
            }
          }
        ]}
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-xl border border-border shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-medium">Total de {entityName(true)} Cadastrados</span>
            <p className="text-2xl font-bold text-foreground mt-0.5">{products.length}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-palette-1 text-primary">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div 
          onClick={() => {
            setFilterReplenishOnly(!filterReplenishOnly);
            setFilterExpiringOnly(false);
            setFilterPromoOnly(false);
          }}
          className={`p-4 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition-all ${
            filterReplenishOnly 
              ? 'border-red-500 bg-red-50/60 dark:bg-red-950/20 ring-2 ring-red-400' 
              : 'bg-surface border-border hover:border-red-200'
          }`}
        >
          <div>
            <span className="text-xs text-muted-foreground font-medium">{v('stock.reorderWarning', 'Precisando de Reposição')}</span>
            <p className="text-2xl font-bold text-red-600 mt-0.5">{replenishCount} {entityName(true).toLowerCase()}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div 
          onClick={() => {
            setFilterExpiringOnly(!filterExpiringOnly);
            setFilterReplenishOnly(false);
            setFilterPromoOnly(false);
          }}
          className={`p-4 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition-all ${
            filterExpiringOnly 
              ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 ring-2 ring-amber-400' 
              : 'bg-surface border-border hover:border-amber-200'
          }`}
        >
          <div>
            <span className="text-xs text-muted-foreground font-medium">Validade Próxima / Vencidos</span>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{expiringCount} {entityName(true).toLowerCase()}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-border shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-medium">Custo Sugerido p/ {v('stock.max', 'Estoque Máximo')}</span>
            <p className="text-2xl font-bold text-foreground mt-0.5">R$ {totalReplenishCost.toFixed(2)}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-primary">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Banner de Alerta de Produtos Duplicados (se houver) */}
      {duplicateAnalysis.totalDuplicates > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-rose-500/10 border-2 border-rose-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs font-bold text-lg">
              ⚠️
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2">
                Atenção: {duplicateAnalysis.totalDuplicates} {duplicateAnalysis.totalDuplicates === 1 ? 'produto duplicado' : 'produtos duplicados'} identificados no estoque!
                <span className="text-[11px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold">
                  Cadastrado 2x ou mais
                </span>
              </h4>
              <p className="text-xs text-rose-600/90 dark:text-rose-300 mt-1 max-w-2xl leading-relaxed">
                Detectamos produtos com o mesmo nome ou código de barras cadastrados repetidamente. Eles estão destacados em <strong>vermelho com tarja de aviso</strong> para você identificar facilmente e excluir as cópias excedentes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setFilterDuplicatesOnly(!filterDuplicatesOnly);
                setFilterReplenishOnly(false);
                setFilterExpiringOnly(false);
                setFilterPromoOnly(false);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                filterDuplicatesOnly
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
              }`}
            >
              {filterDuplicatesOnly ? '✓ Mostrando Apenas Duplicados' : '🔍 Ver Apenas os Duplicados'}
            </button>
            {filterDuplicatesOnly && (
              <button
                type="button"
                onClick={() => setFilterDuplicatesOnly(false)}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
              >
                Ver Todos
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between flex-wrap">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <input 
            type="text"
            placeholder={`Buscar ${entityName().toLowerCase()} por nome...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm cursor-pointer"
          >
            <option value="Todas">Todas as categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {duplicateAnalysis.totalDuplicates > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterDuplicatesOnly(!filterDuplicatesOnly);
                setFilterReplenishOnly(false);
                setFilterExpiringOnly(false);
                setFilterPromoOnly(false);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                filterDuplicatesOnly
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-400 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>⚠️ Duplicados ({duplicateAnalysis.totalDuplicates})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFilterExpiringOnly(!filterExpiringOnly)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterExpiringOnly
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Validade Próxima ({expiringCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterPromoOnly(!filterPromoOnly)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterPromoOnly
                ? 'bg-primary text-white shadow-xs'
                : 'bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Em Promoção ({promoCount})</span>
          </button>

          {(filterReplenishOnly || filterExpiringOnly || filterPromoOnly || filterDuplicatesOnly) && (
            <button
              onClick={() => {
                setFilterReplenishOnly(false);
                setFilterExpiringOnly(false);
                setFilterPromoOnly(false);
                setFilterDuplicatesOnly(false);
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            >
              Limpar Filtros (✕)
            </button>
          )}
        </div>
      </div>

      {/* Barra de Seleção de Modo de Visualização (Cards Simples vs Tabela Completa) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-foreground">
            {filteredProducts.length} {filteredProducts.length === 1 ? entityName().toLowerCase() : entityName(true).toLowerCase()}
          </span>
          {isBasicMode && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60">
              Modo Descomplicado
            </span>
          )}

          {filteredProducts.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                filteredProducts.every(p => p.id && selectedProductIds.includes(p.id))
                  ? 'bg-primary text-white border-primary shadow-xs'
                  : selectedProductIds.length > 0
                  ? 'bg-palette-1 text-primary border-primary/40'
                  : 'bg-surface text-muted-foreground hover:text-foreground border-border hover:bg-muted'
              }`}
              title="Selecionar ou desmarcar produtos para exclusão em lote"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {filteredProducts.every(p => p.id && selectedProductIds.includes(p.id))
                  ? 'Desmarcar Todos'
                  : selectedProductIds.length > 0
                  ? `Selecionados (${selectedProductIds.length})`
                  : 'Selecionar Vários'}
              </span>
            </button>
          )}

          {selectedProductIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs animate-in fade-in"
              title="Excluir todos os produtos selecionados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Tudo ({selectedProductIds.length})</span>
            </button>
          ) : (
            filteredProducts.length > 0 && (
              <button
                type="button"
                onClick={handleTriggerDeleteAll}
                className="text-xs font-bold px-2.5 py-1.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Excluir todos os produtos listados"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Tudo</span>
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-2">
          {displayMode === 'cards' && filteredProducts.length > 0 && (
            <button
              type="button"
              onClick={toggleAllExpand}
              className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-muted transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{filteredProducts.every(p => p.id && expandedProductIds[p.id]) ? 'Minimizar Todos' : 'Expandir Todos'}</span>
            </button>
          )}

          <div className="flex items-center bg-muted p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setDisplayMode('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                displayMode === 'cards'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Visualização em cards simples, limpos e dinâmicos com detalhes minimizados sob demanda"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards Simples</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                displayMode === 'table'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Visualização em tabela analítica completa com todas as colunas de inventário"
            >
              <List className="w-3.5 h-3.5" />
              <span>Tabela Completa</span>
            </button>
          </div>
        </div>
      </div>

      {/* Visualização 1: Cards Simples e Dinâmicos com Detalhes Ocultáveis Sob Demanda */}
      {displayMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(p => {
            const reorderPoint = p.safetyStock + (p.dailyAverageSales * p.replacementDays);
            const maxStockVal = p.maxStock || Math.max(p.stock, p.safetyStock * 2, 10);
            const needsReplenish = p.stock <= reorderPoint;
            const isOverStocked = p.stock > maxStockVal;
            const suggestedBuyUnits = Math.max(0, maxStockVal - p.stock);
            const isExpanded = p.id ? !!expandedProductIds[p.id] : false;
            const unitsPkg = getPackageUnits(p);
            const suggestedPackages = unitsPkg > 1 ? Math.ceil(suggestedBuyUnits / unitsPkg) : suggestedBuyUnits;

            const isDuplicate = p.id ? duplicateAnalysis.duplicateIdSet.has(p.id) : false;
            const duplicateCount = p.id ? (duplicateAnalysis.duplicateCountById.get(p.id) || 1) : 1;
            const isSelected = p.id ? selectedProductIds.includes(p.id) : false;

            return (
              <div 
                key={p.id} 
                className={`rounded-2xl border transition-all duration-200 shadow-xs flex flex-col justify-between overflow-hidden relative ${
                  isSelected
                    ? 'border-2 border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/40 shadow-md'
                    : isDuplicate
                    ? 'border-2 border-rose-500 bg-gradient-to-b from-rose-100/50 via-surface to-surface dark:from-rose-950/50 dark:via-surface ring-2 ring-rose-500/25 shadow-md'
                    : p.stock === 0
                    ? 'bg-surface border-red-400/60 dark:border-red-600/40 bg-gradient-to-b from-red-50/20 to-surface'
                    : needsReplenish 
                    ? 'bg-surface border-amber-400/60 dark:border-amber-600/40 bg-gradient-to-b from-amber-50/20 to-surface' 
                    : 'bg-surface border-border hover:border-primary/40'
                }`}
              >
                <div className="p-4 sm:p-5 pb-3">
                  {/* Banner de Aviso de Item Duplicado no Card */}
                  {isDuplicate && (
                    <div className="mb-3 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center justify-between shadow-2xs">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        PRODUTO DUPLICADO ({duplicateCount}x cadastrado)
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProductToDelete(p);
                        }}
                        className="px-2 py-0.5 rounded bg-white text-rose-700 hover:bg-rose-50 text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                        title="Excluir cópia repetida deste produto"
                      >
                        Excluir Cópia
                      </button>
                    </div>
                  )}

                  {/* Header: Imagem, Checkbox, Nome e Categoria */}
                  <div className="flex items-start gap-3">
                    {/* Checkbox de Seleção Rápida */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (p.id) toggleSelectProduct(p.id);
                      }}
                      className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all cursor-pointer border shrink-0 mt-1 ${
                        isSelected
                          ? 'bg-primary text-white border-primary shadow-xs scale-105'
                          : 'bg-muted/60 text-transparent hover:text-muted-foreground/30 border-border hover:border-primary/50'
                      }`}
                      title={isSelected ? 'Desmarcar este produto' : 'Selecionar este produto para exclusão'}
                    >
                      <Check className={`w-4 h-4 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                    {p.imageUrl ? (
                      <img 
                        src={p.imageUrl} 
                        alt={p.name} 
                        className={`w-12 h-12 rounded-xl object-cover border shadow-2xs shrink-0 ${isDuplicate ? 'border-rose-400 ring-1 ring-rose-400' : 'border-border'}`} 
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${isDuplicate ? 'bg-rose-100 text-rose-600 border border-rose-300' : 'bg-palette-1 text-primary border border-primary/20'}`}>
                        <Package className="w-6 h-6 opacity-80" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-bold text-base text-foreground leading-snug truncate" title={p.name}>
                          {p.name}
                        </h3>
                        {isDuplicate && (
                          <span className="text-[10px] font-bold text-white bg-rose-600 px-1.5 py-0.2 rounded-md">
                            Duplicado
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[11px] font-semibold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-md">
                          {p.category}
                        </span>
                        {p.hasPromoSuggestion && p.promoPrice && (
                          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Flame className="w-3 h-3 text-amber-500" />
                            Promo R$ {p.promoPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status do Item (Linguagem Direta e Simples) */}
                  <div className="mt-3 flex items-center justify-between">
                    {p.stock === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/50 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        {v('stock.outOfStock', 'Acabou Tudo')}
                      </span>
                    ) : needsReplenish ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-2.5 py-1 rounded-full">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        {v('stock.lowStock', 'Hora de Pedir Mais')}
                      </span>
                    ) : isOverStocked ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full">
                        {v('stock.overStock', 'Estoque Alto')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        {v('stock.inStock', 'Quantidade Boa')}
                      </span>
                    )}

                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">
                        {v('pricing.selling', 'Preço de Venda')}
                      </span>
                      <span className="text-sm font-black text-foreground">
                        R$ {p.basePrice.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Quantidade em Estoque e Botões Rápidos + e - */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/60 border border-border/70 my-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                        {v('stock.current', 'Quantidade na Prateleira')}
                      </span>
                      <div className="text-2xl font-black text-foreground flex items-baseline gap-1 mt-0.5">
                        {getPackageUnits(p) > 1 ? (
                          <>
                            <span>{Math.floor(p.stock / getPackageUnits(p))} {p.type === 'cigarro' ? 'maços' : 'fardos'}</span>
                            <span className="text-xs font-normal text-muted-foreground">+ {p.stock % getPackageUnits(p)} {p.type === 'cigarro' ? 'carteiras' : 'un.'}</span>
                          </>
                        ) : (
                          <>
                            <span>{p.stock}</span>
                            <span className="text-xs font-normal text-muted-foreground">un.</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Botões Rápidos de 1 Toque */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title={p.type === 'cigarro' ? 'Diminuir 1 carteira do estoque' : 'Diminuir 1 unidade física da prateleira'}
                        onClick={() => handleQuickAddStock(p, -1)}
                        className="w-9 h-9 rounded-xl bg-surface border border-border text-foreground hover:bg-muted font-bold flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 transition-all"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title={p.type === 'cigarro' ? 'Adicionar 1 carteira ao estoque' : 'Adicionar 1 unidade física na prateleira'}
                        onClick={() => handleQuickAddStock(p, 1)}
                        className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 transition-all hover:opacity-90"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      {getPackageUnits(p) > 1 && (
                        <button
                          type="button"
                          title={`Entrada rápida de +1 ${p.type === 'cigarro' ? 'pacote' : 'fardo'} (+${getPackageUnits(p)} ${p.type === 'cigarro' ? 'carteiras' : 'un.'})`}
                          onClick={() => handleQuickAddStock(p, getPackageUnits(p))}
                          className="px-2.5 h-9 rounded-xl bg-palette-1 border border-primary/25 text-primary text-xs font-bold flex items-center justify-center cursor-pointer shadow-2xs hover:bg-palette-1/80 active:scale-95 transition-all"
                        >
                          +1 {p.type === 'cigarro' ? 'Maço' : 'Fardo'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Informações Completas Ocultáveis / Minimizadas */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/80 space-y-2 text-xs bg-palette-1/20 -mx-4 -mb-3 p-4 rounded-b-2xl border-t">
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>{v('stock.initial', 'Estoque no Início do Mês')}:</span>
                        <strong className="text-foreground">
                          {p.initialStock !== undefined ? p.initialStock : p.stock} un.
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>{v('stock.initialDate', 'Data Base da Contagem')}:</span>
                        <button
                          type="button"
                          onClick={() => openInitialStockModal(p)}
                          className="text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Calendar className="w-3 h-3" />
                          <span>{p.initialStockDate ? format(new Date(p.initialStockDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Definir'}</span>
                          <Edit2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>{v('stock.min', 'Quando Pedir Mais (Mínimo)')}:</span>
                        <strong className="text-foreground">{Math.round(reorderPoint)} un. (segurança: {p.safetyStock})</strong>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>{v('stock.max', 'Limite para Não Sobrar (Máximo)')}:</span>
                        <strong className="text-foreground">{maxStockVal} un.</strong>
                      </div>
                      {needsReplenish && (
                        <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/40 p-2 rounded-lg">
                          <span>{v('purchases.suggestion', 'O Que Comprar Agora')}:</span>
                          <span>+{suggestedBuyUnits} un. ({suggestedPackages} fardos)</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>{v('purchases.unitCost', 'Quanto Você Paga (Custo)')}:</span>
                        <strong className="text-foreground">R$ {p.unitCost.toFixed(2)}/un.</strong>
                      </div>
                      {p.expirationDate && (
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Validade:</span>
                          <span className="font-semibold text-foreground">
                            {formatExpirationDate(p.expirationDate, 'dd/MM/yyyy')}
                          </span>
                        </div>
                      )}

                      <div className="pt-2 flex items-center justify-end gap-2 border-t border-border/60 mt-2">
                        <button
                          type="button"
                          onClick={() => openModal(p)}
                          className="px-3 py-1.5 rounded-lg bg-surface border border-border text-foreground hover:bg-muted text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-primary" />
                          <span>Editar Cadastro</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductToDelete(p)}
                          className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-red-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Botão de Expansão Inteligente (Sob Demanda) */}
                <div className={`border-t border-border/80 ${isExpanded ? 'bg-palette-1/40' : 'bg-surface'}`}>
                  <button
                    type="button"
                    onClick={() => p.id && toggleProductExpand(p.id)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-primary hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <span>{isExpanded ? 'Ocultar detalhes técnicos' : 'Ver detalhes completos do item'}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full p-8 text-center bg-surface rounded-2xl border border-border text-muted-foreground text-sm">
              Nenhum {entityName().toLowerCase()} encontrado com os filtros selecionados.
            </div>
          )}
        </div>
      )}

      {/* Visualização 2: Tabela Analítica Completa */}
      {displayMode === 'table' && (
      <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="p-3.5 w-12 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer border mx-auto ${
                      filteredProducts.length > 0 && filteredProducts.every(p => p.id && selectedProductIds.includes(p.id))
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : selectedProductIds.length > 0
                        ? 'bg-primary/20 text-primary border-primary'
                        : 'bg-surface text-transparent hover:text-muted-foreground/30 border-border'
                    }`}
                    title={
                      filteredProducts.length > 0 && filteredProducts.every(p => p.id && selectedProductIds.includes(p.id))
                        ? 'Desmarcar todos'
                        : 'Selecionar todos os produtos listados'
                    }
                  >
                    {filteredProducts.length > 0 && filteredProducts.every(p => p.id && selectedProductIds.includes(p.id)) ? (
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    ) : selectedProductIds.length > 0 ? (
                      <Minus className="w-3.5 h-3.5 stroke-[3]" />
                    ) : null}
                  </button>
                </th>
                <th className="p-3.5 font-semibold text-muted-foreground">{entityName()}</th>
                <th className="p-3.5 font-semibold text-muted-foreground">{v('stock.initial', 'Estoque Inicial')} ({v('stock.initialDate', 'Data Base')})</th>
                <th className="p-3.5 font-semibold text-muted-foreground">{v('stock.current', 'Estoque Atual')}</th>
                <th className="p-3.5 font-semibold text-muted-foreground">{v('stock.min', 'Mínimo')} / {v('stock.max', 'Máximo')}</th>
                <th className="p-3.5 font-semibold text-muted-foreground">{v('purchases.suggestion', 'Sugestão de Compra')}</th>
                <th className="p-3.5 font-semibold text-muted-foreground text-center">{v('stock.status', 'Status')}</th>
                <th className="p-3.5 font-semibold text-muted-foreground text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredProducts.map(p => {
                const reorderPoint = p.safetyStock + (p.dailyAverageSales * p.replacementDays);
                const maxStockVal = p.maxStock || Math.max(p.stock, p.safetyStock * 2, 10);
                const needsReplenish = p.stock <= reorderPoint;
                const isOverStocked = p.stock > maxStockVal;
                
                // Suggested units to reach max stock
                const suggestedBuyUnits = Math.max(0, maxStockVal - p.stock);
                const suggestedPackages = getPackageUnits(p) > 1
                  ? Math.ceil(suggestedBuyUnits / getPackageUnits(p))
                  : suggestedBuyUnits;

                const stockPercentage = Math.min(100, Math.round((p.stock / maxStockVal) * 100));
                const isDuplicate = p.id ? duplicateAnalysis.duplicateIdSet.has(p.id) : false;
                const duplicateCount = p.id ? (duplicateAnalysis.duplicateCountById.get(p.id) || 1) : 1;
                const isSelected = p.id ? selectedProductIds.includes(p.id) : false;

                return (
                  <tr key={p.id} className={`transition-colors ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : isDuplicate ? 'bg-rose-50/70 dark:bg-rose-950/40 border-l-4 border-l-rose-600 hover:bg-rose-100/60' : 'hover:bg-muted/40'}`}>
                    <td className="p-3.5 w-12 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (p.id) toggleSelectProduct(p.id);
                        }}
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer border mx-auto ${
                          isSelected
                            ? 'bg-primary text-white border-primary shadow-xs'
                            : 'bg-surface text-transparent hover:text-muted-foreground/30 border-border hover:border-primary/40'
                        }`}
                        title={isSelected ? 'Desmarcar produto' : 'Selecionar produto para exclusão'}
                      >
                        <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                      </button>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          <img 
                            src={p.imageUrl} 
                            alt={p.name} 
                            className={`w-12 h-12 rounded-xl object-cover border shadow-2xs shrink-0 ${isDuplicate ? 'border-rose-400 ring-1 ring-rose-400' : 'border-border'}`} 
                          />
                        ) : (
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDuplicate ? 'bg-rose-100 text-rose-600 border border-rose-300' : 'bg-palette-1 text-primary border border-primary/20'}`}>
                            <Package className="w-5 h-5 opacity-70" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground truncate">{p.name}</span>
                            {isDuplicate && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 text-white shadow-2xs shrink-0 animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                Duplicado ({duplicateCount}x)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-medium">{p.category}</span>
                            <span>•</span>
                            <span>Custo: R$ {p.unitCost.toFixed(2)}/un.</span>
                          </div>

                          {/* Badges de Validade e Promoção */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {p.expirationDate && (() => {
                              const expStatus = calculateExpirationStatus(p.expirationDate);
                              return (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${expStatus.badgeClass}`}>
                                  <Clock className="w-3 h-3" />
                                  <span>Val: {formatExpirationDate(p.expirationDate, 'dd/MM/yy')} ({expStatus.statusText})</span>
                                </span>
                              );
                            })()}

                            {p.hasPromoSuggestion && p.promoPrice && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                <Flame className="w-3 h-3 text-amber-500" />
                                <span>Promo: R$ {p.promoPrice.toFixed(2)} {p.promoDiscountPercent ? `(-${p.promoDiscountPercent}%)` : ''}</span>
                              </span>
                            )}
                          </div>

                          {p.type === 'cigarro' ? (
                            <div className="text-[11px] text-primary font-medium mt-1">
                              🚬 Maço: R$ {(p.pricePack || (p.basePrice * 200)).toFixed(2)} | Cart: R$ {(p.priceCart || (p.basePrice * 20)).toFixed(2)} | Avulso: R$ {(p.priceUnit || p.basePrice).toFixed(2)}
                            </div>
                          ) : getPackageUnits(p) > 1 ? (
                            <div className="text-[11px] text-primary font-medium mt-1">
                              📦 {p.purchaseForm === 'fardo' ? 'Fardo' : 'Pacote'} c/ {getPackageUnits(p)} un.: R$ {(p.pricePackage || (p.basePrice * getPackageUnits(p))).toFixed(2)} | Avulso: R$ {p.basePrice.toFixed(2)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {/* Estoque Inicial com Data Base */}
                    <td className="p-3.5">
                      {getPackageUnits(p) > 1 ? (
                        <div>
                          <div className="font-bold text-foreground">
                            {Math.floor((p.initialStock !== undefined ? p.initialStock : p.stock) / getPackageUnits(p))} {p.type === 'cigarro' ? 'maços' : 'fardos'} + {((p.initialStock !== undefined ? p.initialStock : p.stock) % getPackageUnits(p))} un.
                          </div>
                          <div className="text-xs text-muted-foreground font-medium">
                            ({p.initialStock !== undefined ? p.initialStock : p.stock} un. no total)
                          </div>
                        </div>
                      ) : (
                        <div className="font-medium text-foreground">
                          {p.initialStock !== undefined ? p.initialStock : p.stock} un.
                        </div>
                      )}
                      <button
                        onClick={() => openInitialStockModal(p)}
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 mt-1 group cursor-pointer bg-muted/60 hover:bg-palette-1 px-2 py-0.5 rounded-md transition-colors border border-border/40 hover:border-primary/30"
                        title="Clique para editar a data base e atualizar o estoque inicial deste mês"
                      >
                        <Calendar className="w-3 h-3 text-primary group-hover:scale-110 transition-transform" />
                        <span className="font-semibold text-foreground group-hover:text-primary">
                          {p.initialStockDate ? format(new Date(p.initialStockDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Não informada'}
                        </span>
                        <Edit2 className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 text-primary" />
                      </button>
                    </td>

                    {/* Estoque Atual e Barra Visual */}
                    <td className="p-3.5">
                      {getPackageUnits(p) > 1 ? (
                        <div>
                          <div className={`font-bold text-base ${needsReplenish ? 'text-red-600' : 'text-foreground'}`}>
                            {Math.floor(p.stock / getPackageUnits(p))} {p.type === 'cigarro' ? 'maços' : 'fardos'} + {p.stock % getPackageUnits(p)} un.
                          </div>
                          <div className="text-xs text-muted-foreground font-medium">
                            {p.stock} un. físicas no total
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-base ${needsReplenish ? 'text-red-600' : 'text-foreground'}`}>
                            {p.stock}
                          </span>
                          <span className="text-xs text-muted-foreground">un.</span>
                        </div>
                      )}
                      <div className="w-24 bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            needsReplenish ? 'bg-red-500' : isOverStocked ? 'bg-amber-500' : 'bg-primary'
                          }`}
                          style={{ width: `${stockPercentage}%` }}
                        />
                      </div>
                    </td>

                    {/* Mínimo (Ponto de Reposição) / Máximo */}
                    <td className="p-3.5 text-xs">
                      <div>
                        <span className="text-muted-foreground">Segurança: </span>
                        <span className="font-semibold text-foreground">
                          {getPackageUnits(p) > 1 ? `${p.safetyStock} un. (${Math.floor(p.safetyStock / getPackageUnits(p))} fardos)` : `${p.safetyStock} un.`}
                        </span>
                      </div>
                      <div className="mt-0.5">
                        <span className="text-muted-foreground">Ponto Repor: </span>
                        <span className="font-semibold text-foreground">{Math.round(reorderPoint)} {p.type === 'cigarro' ? 'carteiras' : 'un.'}</span>
                      </div>
                      <div className="mt-0.5 text-primary font-bold">
                        <span>Estoque Máximo: </span>
                        <span>
                          {getPackageUnits(p) > 1 ? `${maxStockVal} un. (${Math.floor(maxStockVal / getPackageUnits(p))} fardos)` : `${maxStockVal} un.`}
                        </span>
                      </div>
                    </td>

                    {/* Sugestão de Compra calculada */}
                    <td className="p-3.5">
                      {suggestedBuyUnits > 0 ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-palette-1 text-primary">
                            + {suggestedBuyUnits} un. ({suggestedPackages} {p.purchaseForm === 'fardo' ? 'fardos' : p.purchaseForm || 'emb.'})
                          </span>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            Est. R$ {(suggestedBuyUnits * p.unitCost).toFixed(2)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Abastecido
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-3.5 text-center">
                      {needsReplenish ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/30 px-2.5 py-1 rounded-full">
                          <AlertTriangle className="w-3.5 h-3.5"/> Repor
                        </span>
                      ) : isOverStocked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-full">
                          Acima do Máx
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-palette-1 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5"/> Normal
                        </span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {getPackageUnits(p) > 1 && (
                          <button
                            title={`Entrada de +1 ${p.purchaseForm === 'fardo' ? 'fardo' : 'pacote'} (+${getPackageUnits(p)} ${p.type === 'cigarro' ? 'carteiras' : 'un.'})`}
                            onClick={() => handleQuickAddStock(p, getPackageUnits(p))}
                            className="px-2 py-1 bg-palette-1 hover:opacity-90 text-primary rounded text-xs font-bold transition-opacity cursor-pointer border border-primary/20"
                          >
                            +1 {p.type === 'cigarro' ? 'Maço' : 'Fardo'}
                          </button>
                        )}
                        <button
                          title="Entrada rápida de +1 unidade avulsa"
                          onClick={() => handleQuickAddStock(p, 1)}
                          className="px-2 py-1 bg-muted hover:bg-palette-1 text-foreground hover:text-primary rounded text-xs font-bold transition-colors cursor-pointer"
                        >
                          +1 Unid.
                        </button>
                        <button 
                          onClick={() => openModal(p)} 
                          title="Editar Produto e Estoque"
                          className="p-1.5 text-primary hover:bg-palette-1 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4"/>
                        </button>
                        <button 
                          onClick={() => setProductToDelete(p)} 
                          title={isDuplicate ? `Excluir cópia duplicada (${duplicateCount}x no estoque)` : "Excluir Produto (Por engano ou indisponível)"}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isDuplicate
                              ? 'text-white bg-rose-600 hover:bg-rose-700 shadow-xs'
                              : 'text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30'
                          }`}
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Nenhum produto encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Modal de Cadastro / Edição com Estoque Inicial, Data Base e Estoque Máximo */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
            }
          }}
        >
          <div 
            className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 border border-border shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold mb-2 text-foreground">
              {editingId ? 'Editar Produto e Parâmetros de Reposição' : 'Novo Produto'}
            </h2>
            <p className="text-xs text-muted-foreground mb-6">
              Configure o estoque inicial na data base e defina o estoque máximo para abastecimento automático.
            </p>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Foto Exata do Produto */}
                <div className="col-span-1 sm:col-span-2 p-3.5 rounded-xl border border-border bg-palette-1/40 flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative shrink-0">
                    {formData.imageUrl ? (
                      <div className="relative group">
                        <img 
                          src={formData.imageUrl} 
                          alt="Prévia do produto" 
                          className="w-20 h-20 rounded-xl object-cover border-2 border-primary/40 shadow-xs" 
                        />
                        <button
                          type="button"
                          onClick={() => setFormData((prev: any) => ({ ...prev, imageUrl: '' }))}
                          className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full shadow hover:bg-red-700 cursor-pointer"
                          title="Remover foto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground">
                        <Package className="w-8 h-8 opacity-40 mb-0.5" />
                        <span className="text-[10px] font-medium">Sem foto</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-foreground">
                        Foto / Imagem Exata do Produto
                      </label>
                      {formData.imageUrl && (
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                          ✓ Foto anexada
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-xs">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Tirar ou Escolher Foto</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleProductImageFile}
                          disabled={isReadingLabel}
                        />
                      </label>
                      <span className="text-[11px] text-muted-foreground">ou informe o link direto:</span>
                      <button
                        type="button"
                        onClick={() => setIsCameraModalOpen(true)}
                        className="px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-lg hover:bg-amber-500/25 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                        title="Tirar foto para ler o produto com IA e preencher apenas nome e categoria"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Preencher com Câmera (IA)</span>
                      </button>
                    </div>
                    {isReadingLabel && (
                      <p role="status" className="flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" /> Processando imagem com IA...
                      </p>
                    )}
                    {labelReadError && (
                      <p role="alert" className="text-xs text-red-600">{labelReadError} Você pode preencher manualmente.</p>
                    )}
                    <input 
                      type="url"
                      placeholder="https://exemplo.com/foto-do-produto.jpg"
                      value={formData.imageUrl || ''}
                      onChange={e => setFormData((prev: any) => ({ ...prev, imageUrl: e.target.value }))}
                      className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-foreground">Nome do Produto *</label>
                    <button
                      type="button"
                      onClick={() => setIsCameraModalOpen(true)}
                      className="text-xs text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>📸 Ler da Foto (IA)</span>
                    </button>
                  </div>
                  <input 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    placeholder="Ex: Coca-Cola 350ml, Sabonete Dove..."
                    className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground" 
                  />
                  {!editingId && formData.name.trim().length > 1 && products.some(p => normalizeProductName(p.name) === normalizeProductName(formData.name)) && (
                    <div className="mt-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        <strong>Atenção (Produto Duplicado):</strong> Já existe outro produto cadastrado com o nome &quot;{formData.name}&quot;. Se salvar, ele ficará marcado como duplicado no estoque.
                      </span>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Tipo</label>
                  <select 
                    value={formData.type} 
                    onChange={e => {
                      const newType = e.target.value as 'comum' | 'cigarro';
                      if (newType === 'cigarro') {
                        handleCategoryChange('Cigarros');
                      } else {
                        setFormData({...formData, type: newType});
                      }
                    }} 
                    className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground cursor-pointer"
                  >
                    <option value="comum">Comum (Geral)</option>
                    <option value="cigarro">Cigarro (Venda fracionada/maço)</option>
                  </select>
                </div>

                <div className="col-span-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-foreground">Categoria *</label>
                    <button
                      type="button"
                      onClick={() => setShowNewCategoryInput(!showNewCategoryInput)}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showNewCategoryInput ? 'Ocultar' : 'Nova Categoria'}
                    </button>
                  </div>

                  {showNewCategoryInput && (
                    <div className="mb-2 p-2.5 bg-palette-1/60 border border-primary/30 rounded-lg space-y-2">
                      <span className="text-[11px] font-semibold text-primary block">
                        Cadastrar Nova Categoria:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Ex: Frios, Padaria, Congelados..."
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddNewCategory();
                            }
                          }}
                          className="flex-1 text-xs border border-border rounded-md px-2 py-1.5 bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={handleAddNewCategory}
                          disabled={!newCategoryName.trim()}
                          className="text-xs font-bold px-3 py-1.5 bg-primary text-primary-foreground rounded-md disabled:opacity-50 cursor-pointer shadow-xs hover:opacity-90"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewCategoryInput(false);
                            setNewCategoryName('');
                          }}
                          className="text-xs p-1.5 text-muted-foreground hover:text-foreground cursor-pointer rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <select 
                    value={formData.category} 
                    onChange={e => {
                      if (e.target.value === '__new__') {
                        setShowNewCategoryInput(true);
                      } else {
                        handleCategoryChange(e.target.value);
                      }
                    }} 
                    className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground cursor-pointer"
                  >
                    {Array.from(new Set([...categories, formData.category])).map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__new__">➕ + Cadastrar Nova Categoria...</option>
                  </select>
                </div>

                {formData.type === 'cigarro' && (
                  <div className="col-span-1 sm:col-span-2 p-4 rounded-xl bg-palette-1/70 border border-primary/20 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-primary text-sm">
                        <span>🚬 Preços de Venda Editáveis por Formato de Cigarro:</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const unit = Number(formData.priceUnit || formData.basePrice) || 0.75;
                          setFormData({
                            ...formData,
                            basePrice: unit,
                            priceUnit: unit,
                            pricePack: Number((unit * 200).toFixed(2)),
                            priceCart: Number((unit * 20).toFixed(2)),
                            priceHalfCart: Number((unit * 10).toFixed(2))
                          });
                        }}
                        className="text-[11px] font-bold text-primary hover:underline cursor-pointer bg-surface px-2.5 py-1 rounded-md border border-primary/30"
                      >
                        ⚡ Calcular proporcional à unidade
                      </button>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      Defina livremente o valor de venda de cada formato. O sistema descontará no estoque a quantidade exata de cigarros vendidos.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                      <div className="bg-surface p-2.5 rounded-lg border border-border shadow-xs">
                        <label className="block text-[11px] font-bold text-foreground mb-1">
                          📦 Pacote/Maço (200 un.)
                        </label>
                        <span className="text-[10px] text-muted-foreground block mb-1">10 carteiras</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-muted-foreground">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={formData.pricePack !== undefined ? formData.pricePack : Number(((Number(formData.basePrice) || 0.75) * 200).toFixed(2))}
                            onChange={e => setFormData({...formData, pricePack: e.target.value})}
                            className="w-full border border-border p-1.5 rounded bg-surface text-foreground font-bold text-xs"
                          />
                        </div>
                      </div>

                      <div className="bg-surface p-2.5 rounded-lg border border-border shadow-xs">
                        <label className="block text-[11px] font-bold text-foreground mb-1">
                          🏷️ Carteira (20 un.)
                        </label>
                        <span className="text-[10px] text-muted-foreground block mb-1">1 carteira fechada</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-muted-foreground">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={formData.priceCart !== undefined ? formData.priceCart : Number(((Number(formData.basePrice) || 0.75) * 20).toFixed(2))}
                            onChange={e => setFormData({...formData, priceCart: e.target.value})}
                            className="w-full border border-border p-1.5 rounded bg-surface text-foreground font-bold text-xs"
                          />
                        </div>
                      </div>

                      <div className="bg-surface p-2.5 rounded-lg border border-border shadow-xs">
                        <label className="block text-[11px] font-bold text-foreground mb-1">
                          ✂️ Meia Carteira (10 un.)
                        </label>
                        <span className="text-[10px] text-muted-foreground block mb-1">10 cigarros soltos</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-muted-foreground">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={formData.priceHalfCart !== undefined ? formData.priceHalfCart : Number(((Number(formData.basePrice) || 0.75) * 10).toFixed(2))}
                            onChange={e => setFormData({...formData, priceHalfCart: e.target.value})}
                            className="w-full border border-border p-1.5 rounded bg-surface text-foreground font-bold text-xs"
                          />
                        </div>
                      </div>

                      <div className="bg-surface p-2.5 rounded-lg border border-border shadow-xs">
                        <label className="block text-[11px] font-bold text-foreground mb-1">
                          🚬 Unidade Avulsa (1 un.)
                        </label>
                        <span className="text-[10px] text-muted-foreground block mb-1">1 cigarro avulso</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-muted-foreground">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={formData.priceUnit !== undefined ? formData.priceUnit : (formData.basePrice || 0.75)}
                            onChange={e => {
                              const val = e.target.value;
                              setFormData({...formData, priceUnit: val, basePrice: val});
                            }}
                            className="w-full border border-border p-1.5 rounded bg-surface text-foreground font-bold text-xs text-primary"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Forma de Compra e Configuração de Embalagem */}
                <div className="col-span-1 sm:col-span-2 p-4 rounded-xl bg-palette-1/50 border border-primary/20 space-y-4">
                  <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <Package className="w-4 h-4" /> Forma de Compra & Cálculo Automático de Custos
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formData.purchaseForm === 'fardo' ? 'Ex: Fardo de bebidas' : formData.purchaseForm === 'pacote' ? 'Ex: Pacote fechado' : 'Compra direta em avulso'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        Forma como você compra do Fornecedor *
                      </label>
                      <select 
                        value={formData.type === 'cigarro' ? 'pacote' : formData.purchaseForm}
                        disabled={formData.type === 'cigarro'}
                        onChange={e => {
                          const newForm = e.target.value as any;
                          const currentUnits = formUnitsPerPackage || 1;
                          const defaultUnits = newForm === 'unidade' ? 1 : (currentUnits > 1 ? currentUnits : (newForm === 'fardo' ? 6 : 12));
                          const totalCost = parseFloat(formData.purchaseTotalCost);
                          const newUnitCost = !isNaN(totalCost) && totalCost > 0 
                            ? Number((totalCost / defaultUnits).toFixed(2)) 
                            : formData.unitCost;

                          setFormData((prev: any) => ({
                            ...prev, 
                            purchaseForm: newForm,
                            unitsPerPackage: defaultUnits,
                            unitCost: newUnitCost,
                            pricePackage: newForm !== 'unidade' && prev.basePrice ? (prev.pricePackage ?? Number(((Number(prev.basePrice) || 0) * defaultUnits).toFixed(2))) : prev.pricePackage
                          }));
                        }} 
                        className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-semibold text-sm cursor-pointer"
                      >
                        <option value="fardo">Fardo Fechado (Ex: Bebidas, cerveja, refrigerante)</option>
                        <option value="pacote">Pacote / Caixa Fechada (Ex: Biscoitos, doces, confeitos)</option>
                        <option value="unidade">Unidade Avulsa (Compra unitária direta)</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        Quantas {formData.type === 'cigarro' ? 'carteiras' : 'unidades'} vêm no {formData.purchaseForm === 'fardo' ? 'fardo' : formData.purchaseForm === 'pacote' ? 'pacote' : 'item'}? *
                      </label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          required 
                          min={1} 
                          value={formUnitsPerPackage}
                          disabled={formData.type === 'cigarro'}
                          onChange={e => {
                            const newUnits = Math.max(1, parseInt(e.target.value) || 1);
                            const totalCost = parseFloat(formData.purchaseTotalCost);
                            const newUnitCost = !isNaN(totalCost) && totalCost > 0 
                              ? Number((totalCost / newUnits).toFixed(2)) 
                              : formData.unitCost;
                            
                            setFormData((prev: any) => ({
                              ...prev, 
                              unitsPerPackage: newUnits,
                              unitCost: newUnitCost,
                              pricePackage: prev.pricePackage !== undefined ? prev.pricePackage : Number(((Number(prev.basePrice) || 0) * newUnits).toFixed(2))
                            }));
                          }} 
                          className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-bold text-sm" 
                        />
                        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          {formData.type === 'cigarro' ? 'carteiras' : 'unidades'}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground mt-0.5 block">
                        {formData.purchaseForm === 'fardo' ? 'Ex: Fardo de Guaraná/Coca = 6 unidades' : 'Ex: Pacote de salgadinho = 10 unidades'}
                      </span>
                    </div>
                  </div>

                  {isBeverageCategory(formData.category) && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Bebidas: escolha o tamanho do fardo.</span>
                      {[6, 12].map(units => (
                        <button
                          key={units}
                          type="button"
                          aria-pressed={formUnitsPerPackage === units}
                          className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted"
                          onClick={() => setFormData((prev: any) => ({
                            ...prev,
                            purchaseForm: 'fardo',
                            unitsPerPackage: units,
                            unitCost: Number(prev.purchaseTotalCost) > 0
                              ? Number((Number(prev.purchaseTotalCost) / units).toFixed(2))
                              : prev.unitCost
                          }))}
                        >
                          {units} unidades
                        </button>
                      ))}
                    </div>
                  )}
                  {formData.type === 'cigarro' && (
                    <p className="text-xs text-muted-foreground">Estoque contado em carteiras: 1 maço = 10 carteiras; meia carteira = 0,5; avulso = 0,05.</p>
                  )}

                  {/* Campos de Valor de Compra e Custo por Unidade Automático + Editável */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {formData.purchaseForm !== 'unidade' && (
                      <div className="p-3 bg-surface rounded-xl border border-border">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-foreground">
                            Valor de Compra do {formData.purchaseForm === 'fardo' ? 'Fardo' : 'Pacote'} (R$)
                          </label>
                          <span className="text-[10px] text-primary font-semibold">Valor da NF/Fornecedor</span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                          <input 
                            type="number" 
                            step="0.01" 
                            min={0}
                            placeholder="Ex: 38.00"
                            value={formData.purchaseTotalCost !== undefined ? formData.purchaseTotalCost : ''} 
                            onChange={e => {
                              const val = e.target.value;
                              const numVal = parseFloat(val);
                              const units = formUnitsPerPackage || 1;
                              const calcUnitCost = !isNaN(numVal) && numVal > 0 
                                ? Number((numVal / units).toFixed(2))
                                : 0;
                              
                              setFormData((prev: any) => ({
                                ...prev,
                                purchaseTotalCost: val,
                                unitCost: !isNaN(numVal) && numVal > 0 ? calcUnitCost : prev.unitCost
                              }));
                            }} 
                            className="w-full border border-border pl-8 pr-3 py-2 rounded-lg bg-surface text-foreground font-bold text-base text-primary" 
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground mt-1 block">
                          Informe quanto você pagou no {formData.purchaseForm === 'fardo' ? 'fardo' : 'pacote'} fechado.
                        </span>
                      </div>
                    )}

                    <div className={`p-3 bg-surface rounded-xl border border-border ${formData.purchaseForm === 'unidade' ? 'col-span-1 sm:col-span-2' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-foreground">
                          Custo por {formData.type === 'cigarro' ? 'Carteira' : 'Unidade'} (R$) *
                        </label>
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                          Automático & Editável
                        </span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                        <input 
                          type="number" 
                          step="0.01" 
                          required 
                          min={0}
                          value={formData.unitCost} 
                          onChange={e => {
                            const val = e.target.value;
                            const numVal = parseFloat(val) || 0;
                            const units = formUnitsPerPackage || 1;
                            setFormData((prev: any) => ({
                              ...prev,
                              unitCost: val,
                              purchaseTotalCost: units > 1 ? String(Number((numVal * units).toFixed(2))) : prev.purchaseTotalCost
                            }));
                          }} 
                          className="w-full border border-border pl-8 pr-3 py-2 rounded-lg bg-surface text-foreground font-bold text-base" 
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                        <span>
                          {formData.purchaseForm !== 'unidade' && formUnitsPerPackage > 1 && parseFloat(formData.purchaseTotalCost) > 0 ? (
                            <>Calculado: R$ {parseFloat(formData.purchaseTotalCost).toFixed(2)} ÷ {formUnitsPerPackage} {formData.type === 'cigarro' ? 'carteiras' : 'un.'}</>
                          ) : (
                            <>Custo individual de cada unidade para o estoque</>
                          )}
                        </span>
                        {formData.purchaseForm !== 'unidade' && formUnitsPerPackage > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const total = parseFloat(formData.purchaseTotalCost) || 0;
                              const units = formUnitsPerPackage || 1;
                              if (total > 0) {
                                setFormData((prev: any) => ({
                                  ...prev,
                                  unitCost: Number((total / units).toFixed(2))
                                }));
                              }
                            }}
                            className="text-[10px] text-primary font-bold hover:underline cursor-pointer"
                          >
                            Recalcular divisão
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Área de Preço de Venda da Unidade, Margem de Lucro e Sugestões Inteligentes */}
                <div className="col-span-1 sm:col-span-2 p-4 rounded-xl border border-border bg-surface space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-primary" /> Preço de Venda & Margem de Lucro da Unidade
                    </span>
                    {formCostPerUnit > 0 && Number(formData.basePrice) > 0 && (
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                        Number(formData.basePrice) > formCostPerUnit
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-300'
                      }`}>
                        {Number(formData.basePrice) > formCostPerUnit ? (
                          <>
                            +{(((Number(formData.basePrice) - formCostPerUnit) / formCostPerUnit) * 100).toFixed(0)}% de ganho
                            (Lucro: R$ {(Number(formData.basePrice) - formCostPerUnit).toFixed(2)}/un.)
                          </>
                        ) : (
                          <>Abaixo do custo!</>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        Preço de Venda da Unidade Avulsa (R$) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                        <input 
                          type="number" 
                          step="0.01" 
                          required 
                          min={0} 
                          value={formData.basePrice} 
                          onChange={e => {
                            const val = e.target.value;
                            const numPrice = parseFloat(val) || 0;
                            const units = formUnitsPerPackage || 1;
                            setFormData((prev: any) => ({
                              ...prev, 
                              basePrice: val,
                              priceUnit: prev.type === 'cigarro' ? val : prev.priceUnit,
                              pricePackage: prev.type !== 'cigarro' && units > 1 && (prev.pricePackage === undefined || prev.pricePackage === '' || prev.pricePackage === 0)
                                ? Number((numPrice * units).toFixed(2))
                                : prev.pricePackage
                            }));
                          }} 
                          className="w-full border border-border pl-8 pr-3 py-2 rounded-lg bg-surface text-foreground font-bold text-base" 
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground mt-0.5 block">
                        Valor cobrado ao cliente por cada unidade avulsa
                      </span>
                    </div>

                    {/* Sugestões Rápidas de Margem de Lucro para a Unidade */}
                    {formCostPerUnit > 0 && (
                      <div className="p-2.5 rounded-lg bg-palette-1/50 border border-primary/20 flex flex-col justify-between">
                        <span className="text-[11px] font-bold text-primary block mb-1">
                          💡 Sugestões de Preço de Venda p/ Unidade:
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { label: '30%', mult: 1.30 },
                            { label: '40%', mult: 1.40 },
                            { label: '50%', mult: 1.50 }
                          ].map(sug => {
                            const sugPrice = Number((formCostPerUnit * sug.mult).toFixed(2));
                            const units = formUnitsPerPackage || 1;
                            return (
                              <button
                                key={sug.label}
                                type="button"
                                onClick={() => {
                                  setFormData((prev: any) => ({
                                    ...prev,
                                    basePrice: sugPrice,
                                    priceUnit: prev.type === 'cigarro' ? sugPrice : prev.priceUnit,
                                    pricePackage: prev.type !== 'cigarro' && units > 1
                                      ? Number((sugPrice * units).toFixed(2))
                                      : prev.pricePackage
                                  }));
                                }}
                                className="px-2 py-1.5 bg-surface hover:bg-primary hover:text-primary-foreground text-foreground border border-border rounded text-[11px] font-semibold transition-colors text-center cursor-pointer shadow-2xs"
                              >
                                <span className="block font-bold">+{sug.label}</span>
                                <span className="text-[10px] opacity-80">R$ {sugPrice.toFixed(2)}</span>
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 block">
                          Clique em uma opção para preencher o preço da unidade automaticamente.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Preço de Venda e Sugestão do Fardo/Pacote Fechado */}
                {formData.type !== 'cigarro' && formUnitsPerPackage > 1 && (
                  <div className="col-span-1 sm:col-span-2 p-4 rounded-xl bg-palette-1/60 border border-primary/30 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-primary/20 pb-2">
                      <div>
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          📦 Venda por {formData.purchaseForm === 'fardo' ? 'Fardo' : 'Pacote'} Fechado ({formData.unitsPerPackage} un.)
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Sugestão de valor para quando o cliente quiser levar o {formData.purchaseForm === 'fardo' ? 'fardo' : 'pacote'} fechado completo.
                        </p>
                      </div>
                      
                      {/* Sugestões de preenchimento rápido para o Fardo */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const calculated = Number(((Number(formData.basePrice) || 0) * formUnitsPerPackage).toFixed(2));
                            setFormData((prev: any) => ({ ...prev, pricePackage: calculated }));
                          }}
                          className="text-[11px] font-bold text-primary hover:underline cursor-pointer bg-surface px-2.5 py-1 rounded-md border border-primary/20 shadow-2xs"
                          title="Preço proporcional exato das unidades avulsas somadas"
                        >
                          ⚡ Proporcional (R$ {((Number(formData.basePrice) || 0) * formUnitsPerPackage).toFixed(2)})
                        </button>

                        {Number(formData.basePrice) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              // Desconto atrativo de atacado/fardo de 5% sobre o proporcional
                              const prop = (Number(formData.basePrice) || 0) * formUnitsPerPackage;
                              const discounted = Number((prop * 0.95).toFixed(2));
                              setFormData((prev: any) => ({ ...prev, pricePackage: discounted }));
                            }}
                            className="text-[11px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:underline cursor-pointer px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800 shadow-2xs"
                            title="Preço de fardo com 5% de desconto promocional para incentivar venda fechada"
                          >
                            🏷️ Com Desconto Promo (-5%)
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">
                          Preço de Venda do {formData.purchaseForm === 'fardo' ? 'Fardo' : 'Pacote'} Fechado (R$)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                          <input 
                            type="number" 
                            step="0.01" 
                            min={0}
                            value={formData.pricePackage ?? ''}
                            onChange={e => setFormData({...formData, pricePackage: e.target.value})} 
                            className="w-full border border-border pl-8 pr-3 py-2 rounded-lg bg-surface text-foreground font-bold text-base" 
                          />
                        </div>
                      </div>

                      {/* Resumo de Lucro no Fardo Fechado */}
                      {Number(formData.pricePackage) > 0 && (
                        <div className="p-3 bg-surface rounded-xl border border-border text-xs space-y-1">
                          {(() => {
                            const fardoPrice = Number(formData.pricePackage) || 0;
                            const fardoCost = parseFloat(formData.purchaseTotalCost) > 0 
                              ? parseFloat(formData.purchaseTotalCost) 
                              : (Number(formData.unitCost) * formUnitsPerPackage);
                            const profit = fardoPrice - fardoCost;
                            const marginPercent = fardoCost > 0 ? ((profit / fardoCost) * 100).toFixed(0) : '0';
                            return (
                              <>
                                <div className="flex items-center justify-between font-semibold">
                                  <span className="text-muted-foreground">Custo do Fardo:</span>
                                  <span className="text-foreground">R$ {fardoCost.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center justify-between font-bold">
                                  <span className="text-muted-foreground">Lucro no Fardo Fechado:</span>
                                  <span className={profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                    R$ {profit.toFixed(2)} (+{marginPercent}%)
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground pt-1">
                      🛒 <strong>Venda Flexível no Caixa (PDV):</strong> O atendente poderá vender tanto a <strong>unidade avulsa</strong> (eliminando 1 unidade no estoque) quanto o <strong>fardo fechado</strong> (eliminando {formData.unitsPerPackage} unidades no estoque com o preço especial de fardo).
                    </p>
                  </div>
                )}

                {/* SEÇÃO: VALIDADE DO PRODUTO & SUGESTÃO DE PROMOÇÃO (EDITÁVEL, AUTOMÁTICO, OPCIONAL) */}
                <div className="col-span-1 sm:col-span-2 border-t border-border pt-4 mt-2">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                          Validade do Produto & Sugestão de Promoção
                          <span className="text-[10px] font-semibold text-primary bg-palette-1 px-2 py-0.5 rounded-full border border-primary/20">
                            Opcional & Inteligente
                          </span>
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Controle a data de validade dos seus lotes e receba sugestões automáticas de desconto editáveis para evitar perdas.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 mt-3 bg-muted/30 border border-border/80 rounded-2xl p-4">
                    {/* Campo de Data de Validade */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-primary" /> Data de Validade (Opcional)
                        </label>
                        {formData.expirationDate && (
                          <div className="flex items-center gap-2">
                            {(() => {
                              const expStatus = calculateExpirationStatus(formData.expirationDate);
                              return (
                                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${expStatus.badgeClass}`}>
                                  {expStatus.statusText}
                                </span>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, expirationDate: '' })}
                              className="text-[11px] text-muted-foreground hover:text-red-500 underline cursor-pointer"
                            >
                              Limpar data
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                        <input 
                          type="date" 
                          value={formData.expirationDate || ''} 
                          onChange={e => {
                            const newDate = e.target.value;
                            setFormData((prev: any) => {
                              const updated = { ...prev, expirationDate: newDate };
                              // Se a data estiver próxima (< 30 dias) e o usuário ainda não tiver ativado promo, sugere automaticamente!
                              if (newDate) {
                                const status = calculateExpirationStatus(newDate);
                                if (status.isExpiringSoon && !prev.hasPromoSuggestion && Number(prev.basePrice) > 0) {
                                  const sug = suggestPromoDiscount(Number(prev.basePrice), Number(prev.unitCost), status.daysLeft);
                                  updated.hasPromoSuggestion = true;
                                  updated.promoPrice = sug.promoPrice;
                                  updated.promoDiscountPercent = sug.discountPercent;
                                  updated.promoNotes = sug.reason;
                                }
                              }
                              return updated;
                            });
                          }} 
                          className="w-full border border-border p-2.5 rounded-xl bg-surface text-foreground font-medium text-sm focus:ring-1 focus:ring-primary focus:border-primary" 
                        />

                        {/* Atalhos Rápidos de Validade */}
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[11px] text-muted-foreground mr-1">Atalhos:</span>
                          {getQuickExpirationDates().map(chip => (
                            <button
                              key={chip.label}
                              type="button"
                              onClick={() => {
                                setFormData((prev: any) => {
                                  const updated = { ...prev, expirationDate: chip.value };
                                  const status = calculateExpirationStatus(chip.value);
                                  if (status.isExpiringSoon && !prev.hasPromoSuggestion && Number(prev.basePrice) > 0) {
                                    const sug = suggestPromoDiscount(Number(prev.basePrice), Number(prev.unitCost), status.daysLeft);
                                    updated.hasPromoSuggestion = true;
                                    updated.promoPrice = sug.promoPrice;
                                    updated.promoDiscountPercent = sug.discountPercent;
                                    updated.promoNotes = sug.reason;
                                  }
                                  return updated;
                                });
                              }}
                              className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-surface border border-border hover:bg-palette-1 hover:text-primary transition-colors cursor-pointer shadow-2xs"
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Subseção Sugestão de Promoção */}
                    <div className="pt-3 border-t border-border/80">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!formData.hasPromoSuggestion}
                            onChange={e => {
                              const checked = e.target.checked;
                              if (checked) {
                                const expStatus = calculateExpirationStatus(formData.expirationDate);
                                const sug = suggestPromoDiscount(Number(formData.basePrice) || 0, Number(formData.unitCost) || 0, expStatus.daysLeft);
                                setFormData((prev: any) => ({
                                  ...prev,
                                  hasPromoSuggestion: true,
                                  promoPrice: prev.promoPrice && prev.promoPrice > 0 ? prev.promoPrice : sug.promoPrice,
                                  promoDiscountPercent: prev.promoDiscountPercent !== undefined && prev.promoDiscountPercent !== '' ? prev.promoDiscountPercent : sug.discountPercent,
                                  promoNotes: prev.promoNotes || sug.reason
                                }));
                              } else {
                                setFormData((prev: any) => ({
                                  ...prev,
                                  hasPromoSuggestion: false
                                }));
                              }
                            }}
                            className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                          />
                          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5 text-amber-500" /> Ativar Preço Promocional para este produto
                          </span>
                        </label>

                        {formData.hasPromoSuggestion && Number(formData.basePrice) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const expStatus = calculateExpirationStatus(formData.expirationDate);
                              const sug = suggestPromoDiscount(Number(formData.basePrice) || 0, Number(formData.unitCost) || 0, expStatus.daysLeft);
                              setFormData((prev: any) => ({
                                ...prev,
                                promoPrice: sug.promoPrice,
                                promoDiscountPercent: sug.discountPercent,
                                promoNotes: sug.reason
                              }));
                            }}
                            className="text-xs font-bold text-primary bg-surface hover:bg-palette-1 px-3 py-1 rounded-lg border border-primary/30 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>Recalcular Sugestão Automática</span>
                          </button>
                        )}
                      </div>

                      {formData.hasPromoSuggestion && (
                        <div className="mt-3 bg-surface p-3.5 rounded-xl border border-primary/20 space-y-3 animate-in fade-in">
                          {/* Alerta de motivo/sugestão */}
                          {formData.promoNotes && (
                            <div className="text-xs p-2.5 rounded-lg bg-palette-1/50 border border-primary/20 text-foreground flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                              <span><strong>Sugestão inteligente:</strong> {formData.promoNotes}</span>
                            </div>
                          )}

                          {/* Botões de presets rápidos */}
                          {Number(formData.basePrice) > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-[11px] text-muted-foreground mr-1">Predefinições rápidas:</span>
                              {[
                                { label: '🔥 Queima (-30%)', pct: 30 },
                                { label: '⚡ Oferta (-20%)', pct: 20 },
                                { label: '🏷️ Leve (-10%)', pct: 10 },
                                { label: '🛡️ No Custo', pct: null }
                              ].map(preset => {
                                return (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => {
                                      const base = Number(formData.basePrice) || 0;
                                      if (preset.pct !== null) {
                                        const calculatedPrice = calculatePromoPriceFromPercent(base, preset.pct);
                                        setFormData((prev: any) => ({
                                          ...prev,
                                          promoPrice: calculatedPrice,
                                          promoDiscountPercent: preset.pct,
                                          promoNotes: `Desconto de ${preset.pct}% aplicado`
                                        }));
                                      } else {
                                        const cost = Number(formData.unitCost) || 0;
                                        const disc = calculateDiscountPercentFromPrice(base, cost);
                                        setFormData((prev: any) => ({
                                          ...prev,
                                          promoPrice: cost,
                                          promoDiscountPercent: disc,
                                          promoNotes: 'Preço promocional igual ao custo de compra (R$ ' + cost.toFixed(2) + ')'
                                        }));
                                      }
                                    }}
                                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-palette-1 hover:text-primary transition-colors cursor-pointer border border-border/60"
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Inputs de Preço Promo e % Desconto (Totalmente Editáveis) */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-foreground mb-1">
                                Preço Promocional de Venda (R$) *
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  required={formData.hasPromoSuggestion}
                                  value={formData.promoPrice !== undefined ? formData.promoPrice : ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const numVal = parseFloat(val) || 0;
                                    const base = Number(formData.basePrice) || 0;
                                    const disc = base > 0 ? calculateDiscountPercentFromPrice(base, numVal) : 0;
                                    setFormData((prev: any) => ({
                                      ...prev,
                                      promoPrice: val,
                                      promoDiscountPercent: disc
                                    }));
                                  }}
                                  className="w-full border-2 border-primary/40 pl-8 pr-3 py-2 rounded-lg bg-surface text-foreground font-bold text-base text-primary"
                                  placeholder="Ex: 3.50"
                                />
                              </div>
                              <span className="text-[11px] text-muted-foreground mt-0.5 block">
                                Preço normal atual: R$ {Number(formData.basePrice || 0).toFixed(2)}
                              </span>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-foreground mb-1">
                                % de Desconto para o Cliente
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  max="99"
                                  value={formData.promoDiscountPercent !== undefined ? formData.promoDiscountPercent : ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const numVal = parseFloat(val) || 0;
                                    const base = Number(formData.basePrice) || 0;
                                    const calculatedPrice = calculatePromoPriceFromPercent(base, numVal);
                                    setFormData((prev: any) => ({
                                      ...prev,
                                      promoDiscountPercent: val,
                                      promoPrice: calculatedPrice
                                    }));
                                  }}
                                  className="w-full border border-border px-3 py-2 rounded-lg bg-surface text-foreground font-bold text-base pr-8"
                                  placeholder="Ex: 20"
                                />
                                <span className="absolute right-3 top-2.5 text-xs font-bold text-muted-foreground">% OFF</span>
                              </div>
                              <span className="text-[11px] text-muted-foreground mt-0.5 block">
                                Altere a % para recalcular o preço, ou digite o preço diretamente.
                              </span>
                            </div>
                          </div>

                          {/* Feedback de Lucro e Margem no Preço Promocional */}
                          {Number(formData.promoPrice) > 0 && (
                            <div className="p-3 rounded-xl bg-muted/40 border border-border/80 text-xs space-y-1">
                              {(() => {
                                const pPrice = Number(formData.promoPrice) || 0;
                                const cost = Number(formData.unitCost) || 0;
                                const base = Number(formData.basePrice) || 0;
                                const profit = pPrice - cost;
                                const marginPct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : '0';
                                const clientSavings = Math.max(0, base - pPrice);

                                return (
                                  <>
                                    <div className="flex justify-between items-center text-muted-foreground">
                                      <span>Economia para o cliente:</span>
                                      <span className="font-bold text-foreground">
                                        R$ {clientSavings.toFixed(2)} ({formData.promoDiscountPercent || 0}% de desconto)
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center font-bold">
                                      <span className="text-muted-foreground">Lucro restante por unidade:</span>
                                      <span className={profit >= 0 ? 'text-emerald-600' : 'text-red-600 font-extrabold'}>
                                        R$ {profit.toFixed(2)} ({profit >= 0 ? `+${marginPct}% de margem` : 'PREJUÍZO'})
                                      </span>
                                    </div>
                                    {profit < 0 && (
                                      <p className="text-[11px] text-red-600 font-semibold pt-1">
                                        ⚠️ Atenção: O preço promocional está R$ {Math.abs(profit).toFixed(2)} abaixo do custo de compra (R$ {cost.toFixed(2)}).
                                      </p>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* Motivo ou Nota da Promoção */}
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">
                              Motivo da Promoção / Nota Interna (Opcional):
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Queima de lote com validade em 15 dias, promoção de atacado..."
                              value={formData.promoNotes || ''}
                              onChange={e => setFormData({ ...formData, promoNotes: e.target.value })}
                              className="w-full border border-border p-2 rounded-lg bg-surface text-foreground text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Seção Estoque Inicial & Data Base com Entrada Dupla (Fardos + Unidades) */}
                <div className="col-span-1 sm:col-span-2 border-t border-border pt-4 mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-foreground">Estoque Inicial & Data Base de Controle</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Defina a contagem inicial em embalagens fechadas e {formData.type === 'cigarro' ? 'carteiras ou frações de carteira' : 'unidades avulsas'}.
                  </p>
                </div>

                {formUnitsPerPackage > 1 ? (
                  <div className="col-span-1 sm:col-span-2 p-3.5 bg-muted/50 border border-border rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Contagem do Estoque Inicial:
                      </span>
                      <span className="text-xs font-bold text-primary bg-surface px-2.5 py-1 rounded-md border border-border">
                        Total Inicial: {formData.initialStock !== undefined ? formData.initialStock : formData.stock} {formData.type === 'cigarro' ? 'carteiras' : 'unidades'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          📦 Quantidade de {formData.purchaseForm === 'fardo' ? 'Fardos Fechados' : 'Pacotes Fechados'} ({formUnitsPerPackage} {formData.type === 'cigarro' ? 'carteiras' : 'un.'} cada)
                        </label>
                        <input 
                          type="number"
                          min={0}
                          value={Math.floor(Number(formData.initialStock !== undefined ? formData.initialStock : formData.stock) / formUnitsPerPackage)}
                          onChange={e => {
                            const pkgs = Math.max(0, parseInt(e.target.value) || 0);
                            const currentTotal = Number(formData.initialStock !== undefined ? formData.initialStock : formData.stock);
                            const loose = currentTotal % formUnitsPerPackage;
                            const totalUnits = (pkgs * formUnitsPerPackage) + loose;
                            setFormData({ ...formData, initialStock: totalUnits });
                          }}
                          className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-bold text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          🔹 {formData.type === 'cigarro' ? 'Carteiras/Frações (Fora do maço)' : 'Unidades Avulsas (Fora do fardo)'}
                        </label>
                        <input 
                          type="number"
                          min={0}
                          step={formData.type === 'cigarro' ? '0.05' : '1'}
                          value={Number(formData.initialStock !== undefined ? formData.initialStock : formData.stock) % formUnitsPerPackage}
                          onChange={e => {
                            const loose = Math.max(0, Number(e.target.value) || 0);
                            const currentTotal = Number(formData.initialStock !== undefined ? formData.initialStock : formData.stock);
                            const pkgs = Math.floor(currentTotal / formUnitsPerPackage);
                            const totalUnits = (pkgs * formUnitsPerPackage) + loose;
                            setFormData({ ...formData, initialStock: totalUnits });
                          }}
                          className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-bold text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Estoque Inicial (Unidades)</label>
                    <input 
                      type="number" 
                      required 
                      min={0} 
                      value={formData.initialStock !== undefined ? formData.initialStock : formData.stock} 
                      onChange={e => setFormData({...formData, initialStock: e.target.value})} 
                      className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-semibold" 
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-foreground">Data Base do Estoque Inicial</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, initialStockDate: format(startOfMonth(new Date()), 'yyyy-MM-dd') })}
                        className="text-[11px] text-primary hover:underline px-1.5 py-0.5 rounded bg-palette-1/50 cursor-pointer"
                        title="Definir para o 1º dia do mês corrente"
                      >
                        1º deste mês
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, initialStockDate: format(new Date(), 'yyyy-MM-dd') })}
                        className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted cursor-pointer"
                        title="Definir para hoje"
                      >
                        Hoje
                      </button>
                    </div>
                  </div>
                  <input 
                    type="date" 
                    required 
                    value={formData.initialStockDate || format(new Date(), 'yyyy-MM-dd')} 
                    onChange={e => setFormData({...formData, initialStockDate: e.target.value})} 
                    className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground" 
                  />
                  <span className="text-[11px] text-muted-foreground block mt-1">
                    Atualize a cada mês para acompanhar o giro e a reposição mensal com precisão.
                  </span>
                </div>

                {/* Seção Estoque Atual Físico e Limites de Reposição */}
                <div className="col-span-1 sm:col-span-2 border-t border-border pt-4 mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-foreground">Estoque Atual Físico & Limites de Reposição</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Informe o estoque físico em embalagens fechadas e {formData.type === 'cigarro' ? 'carteiras ou frações de carteira' : 'unidades avulsas'}.
                  </p>
                </div>

                {formUnitsPerPackage > 1 ? (
                  <div className="col-span-1 sm:col-span-2 p-3.5 bg-muted/50 border border-border rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Estoque Atual Físico em Prateleira/Depósito:
                      </span>
                      <span className="text-xs font-bold text-primary bg-surface px-2.5 py-1 rounded-md border border-border">
                        Total Atual Físico: {formData.stock} {formData.type === 'cigarro' ? 'carteiras' : 'unidades'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          📦 Quantidade de {formData.purchaseForm === 'fardo' ? 'Fardos Fechados' : 'Pacotes Fechados'} ({formUnitsPerPackage} {formData.type === 'cigarro' ? 'carteiras' : 'un.'} cada)
                        </label>
                        <input 
                          type="number"
                          min={0}
                          value={Math.floor(Number(formData.stock || 0) / formUnitsPerPackage)}
                          onChange={e => {
                            const pkgs = Math.max(0, parseInt(e.target.value) || 0);
                            const loose = Number(formData.stock || 0) % formUnitsPerPackage;
                            const totalUnits = (pkgs * formUnitsPerPackage) + loose;
                            setFormData({ ...formData, stock: totalUnits });
                          }}
                          className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-bold text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          🔹 {formData.type === 'cigarro' ? 'Carteiras/Frações (Fora do maço)' : 'Unidades Avulsas Físicas (Fora do fardo)'}
                        </label>
                        <input 
                          type="number"
                          min={0}
                          step={formData.type === 'cigarro' ? '0.05' : '1'}
                          value={Number(formData.stock || 0) % formUnitsPerPackage}
                          onChange={e => {
                            const loose = Math.max(0, Number(e.target.value) || 0);
                            const pkgs = Math.floor(Number(formData.stock || 0) / formUnitsPerPackage);
                            const totalUnits = (pkgs * formUnitsPerPackage) + loose;
                            setFormData({ ...formData, stock: totalUnits });
                          }}
                          className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-bold text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Estoque Atual Físico (Unidades) *</label>
                    <input 
                      type="number" 
                      required 
                      min={0}
                      value={formData.stock} 
                      onChange={e => setFormData({...formData, stock: e.target.value})} 
                      className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-bold" 
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-primary font-bold mb-1">
                    Estoque Máximo (Teto de Compra) *
                  </label>
                  <input 
                    type="number" 
                    required 
                    min={1}
                    value={formData.maxStock || ''} 
                    placeholder="Ex: 50"
                    onChange={e => setFormData({...formData, maxStock: e.target.value})} 
                    className="w-full border-2 border-primary p-2.5 rounded-lg bg-surface text-foreground font-bold shadow-xs" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Estoque de Segurança (Mínimo)</label>
                  <input 
                    type="number" 
                    required 
                    min={0}
                    step={formData.type === 'cigarro' ? '0.05' : '1'}
                      value={formData.safetyStock}
                    onChange={e => setFormData({...formData, safetyStock: e.target.value})} 
                    className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Venda Média Estimada / Dia</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    required 
                    min={0}
                    value={formData.dailyAverageSales} 
                    onChange={e => setFormData({...formData, dailyAverageSales: e.target.value})} 
                    className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Prazo de Entrega do Fornecedor (Dias)</label>
                  <input 
                    type="number" 
                    required 
                    min={0}
                    value={formData.replacementDays} 
                    onChange={e => setFormData({...formData, replacementDays: e.target.value})} 
                    className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground" 
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 mt-8 pt-4 border-t border-border">
                {editingId ? (
                  <button 
                    type="button" 
                    onClick={() => {
                      const prod = products.find(p => p.id === editingId);
                      if (prod) {
                        setProductToDelete(prod);
                      }
                    }} 
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir Produto</span>
                  </button>
                ) : <div />}

                <div className="flex items-center justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)} 
                    className="px-4 py-2.5 border border-border rounded-xl hover:bg-muted text-muted-foreground font-medium cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2.5 bg-primary text-white rounded-xl hover:opacity-90 font-bold cursor-pointer shadow-sm"
                  >
                    Salvar Produto
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição Rápida de Estoque Inicial e Data */}
      {editingInitialStockProduct && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingInitialStock) {
              setEditingInitialStockProduct(null);
            }
          }}
        >
          <div 
            className="bg-surface rounded-2xl max-w-lg w-full p-6 border border-border shadow-2xl animate-in fade-in zoom-in-95 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 border-b border-border pb-3">
              <div>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider block">Atualização Mensal</span>
                <h2 className="text-xl font-bold text-foreground mt-0.5">Estoque Inicial & Data Base</h2>
                <p className="text-sm font-medium text-muted-foreground mt-0.5">{editingInitialStockProduct.name}</p>
              </div>
              <button 
                onClick={() => setEditingInitialStockProduct(null)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="space-y-4">
              {/* Campo Data Base com atalhos */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-foreground">Data Base do Estoque Inicial</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setInitialStockEditDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'))}
                      className="text-xs px-2 py-0.5 rounded-lg bg-palette-1 text-primary font-medium hover:opacity-90 cursor-pointer"
                    >
                      1º deste mês
                    </button>
                    <button
                      type="button"
                      onClick={() => setInitialStockEditDate(format(new Date(), 'yyyy-MM-dd'))}
                      className="text-xs px-2 py-0.5 rounded-lg bg-muted text-foreground font-medium hover:bg-muted/80 cursor-pointer"
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => setInitialStockEditDate(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'))}
                      className="text-xs px-2 py-0.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      1º mês anterior
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  value={initialStockEditDate}
                  onChange={e => setInitialStockEditDate(e.target.value)}
                  className="w-full border border-border p-3 rounded-xl bg-surface text-foreground font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Esta data marca o início da contagem deste mês para cálculo de consumo e reposição.
                </p>
              </div>

              {/* Quantidade Inicial do Mês */}
              <div className="bg-muted/40 p-4 rounded-xl border border-border/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground">Quantidade Inicial na Data</label>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editingInitialStockProduct.stock;
                      const unitsPkg = getPackageUnits(editingInitialStockProduct);
                      if (unitsPkg > 1) {
                        setInitialStockEditPackages(Math.floor(cur / unitsPkg));
                        setInitialStockEditLoose(cur % unitsPkg);
                      }
                      setInitialStockEditUnits(cur);
                    }}
                    className="text-xs text-primary hover:underline font-medium cursor-pointer flex items-center gap-1"
                    title="Preenche com o estoque físico atual"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Copiar estoque atual ({editingInitialStockProduct.stock} un.)</span>
                  </button>
                </div>

                {getPackageUnits(editingInitialStockProduct) > 1 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">
                        {editingInitialStockProduct.purchaseForm === 'fardo' ? 'Fardos' : 'Pacotes'} (c/ {getPackageUnits(editingInitialStockProduct)} un.)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={initialStockEditPackages}
                        onChange={e => setInitialStockEditPackages(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">{editingInitialStockProduct.type === 'cigarro' ? 'Carteiras/Frações' : 'Unidades Avulsas'}</span>
                      <input
                        type="number"
                        min={0}
                        step={editingInitialStockProduct.type === 'cigarro' ? '0.05' : '1'}
                        value={initialStockEditLoose}
                        onChange={e => setInitialStockEditLoose(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground font-bold"
                      />
                    </div>
                    <div className="col-span-2 text-xs text-primary font-semibold">
                      Total Inicial Calculado: {(initialStockEditPackages * getPackageUnits(editingInitialStockProduct)) + initialStockEditLoose} {editingInitialStockProduct.type === 'cigarro' ? 'carteiras' : 'unidades'}
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="number"
                      min={0}
                      value={initialStockEditUnits}
                      onChange={e => setInitialStockEditUnits(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border border-border p-2.5 rounded-lg bg-surface text-foreground text-lg font-bold"
                    />
                    <span className="text-xs text-muted-foreground mt-1 block">Unidades no início do período</span>
                  </div>
                )}
              </div>

              {/* Informações de contexto */}
              <div className="text-xs text-muted-foreground bg-palette-1/30 p-3 rounded-xl border border-palette-1/50 flex items-start gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  O estoque físico atual deste produto é de <strong>{editingInitialStockProduct.stock} un.</strong> Atualizar o estoque inicial redefine a referência mensal sem apagar as vendas realizadas.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingInitialStockProduct(null)}
                className="px-4 py-2.5 border border-border rounded-xl hover:bg-muted text-muted-foreground font-medium text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveInitialStock}
                disabled={isSavingInitialStock}
                className="px-5 py-2.5 bg-primary text-white rounded-xl hover:opacity-90 font-bold text-sm cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSavingInitialStock ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Virada de Mês em Massa */}
      {isMonthlyTurnoverOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingTurnover) {
              setIsMonthlyTurnoverOpen(false);
            }
          }}
        >
          <div 
            className="bg-surface rounded-2xl max-w-lg w-full p-6 border border-border shadow-2xl animate-in fade-in zoom-in-95 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 border-b border-border pb-3">
              <div>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider block">Virada de Mês</span>
                <h2 className="text-xl font-bold text-foreground mt-0.5">Atualizar Todos os Produtos</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Defina a nova data base de estoque para o novo mês</p>
              </div>
              <button 
                onClick={() => setIsMonthlyTurnoverOpen(false)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Nova Data Base do Novo Mês</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="date"
                    value={turnoverDate}
                    onChange={e => setTurnoverDate(e.target.value)}
                    className="flex-1 border border-border p-2.5 rounded-xl bg-surface text-foreground font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setTurnoverDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'))}
                    className="px-3 py-2.5 rounded-xl bg-palette-1 text-primary font-medium text-xs whitespace-nowrap cursor-pointer"
                  >
                    1º deste mês
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Como definir o novo estoque inicial?</label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    turnoverMode === 'copy_current' ? 'border-primary bg-palette-1/30 text-foreground' : 'border-border bg-surface text-muted-foreground'
                  }`}>
                    <input
                      type="radio"
                      name="turnover_mode"
                      checked={turnoverMode === 'copy_current'}
                      onChange={() => setTurnoverMode('copy_current')}
                      className="mt-1 text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-sm font-bold text-foreground block">Copiar estoque físico atual de hoje</span>
                      <span className="text-xs text-muted-foreground">
                        Recomendado na virada de mês: o estoque restante atual vira o estoque inicial do novo mês.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    turnoverMode === 'keep_qty' ? 'border-primary bg-palette-1/30 text-foreground' : 'border-border bg-surface text-muted-foreground'
                  }`}>
                    <input
                      type="radio"
                      name="turnover_mode"
                      checked={turnoverMode === 'keep_qty'}
                      onChange={() => setTurnoverMode('keep_qty')}
                      className="mt-1 text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-sm font-bold text-foreground block">Apenas atualizar a data (manter quantidades)</span>
                      <span className="text-xs text-muted-foreground">
                        Atualiza apenas a data base de todos os produtos para {turnoverDate ? format(new Date(turnoverDate + 'T12:00:00'), 'dd/MM/yyyy') : ''}.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                Esta ação atualizará os <strong>{products.length} produtos cadastrados</strong> simultaneamente.
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setIsMonthlyTurnoverOpen(false)}
                className="px-4 py-2.5 border border-border rounded-xl hover:bg-muted text-muted-foreground font-medium text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveMonthlyTurnover}
                disabled={isSavingTurnover || products.length === 0}
                className="px-5 py-2.5 bg-primary text-white rounded-xl hover:opacity-90 font-bold text-sm cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                <span>{isSavingTurnover ? 'Atualizando...' : 'Confirmar Virada de Mês'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Excluir Produto Individual */}
      {productToDelete && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setProductToDelete(null);
            }
          }}
        >
          <div 
            className="bg-surface rounded-2xl max-w-md w-full p-6 border border-border shadow-2xl space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0 border border-red-200 dark:border-red-900/40">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Excluir Produto?</h3>
                <p className="text-xs text-muted-foreground">Esta ação removerá o produto do catálogo e estoque.</p>
              </div>
            </div>

            <div className="p-4 bg-muted/60 rounded-xl border border-border space-y-2">
              <div className="font-bold text-foreground text-sm flex items-center justify-between">
                <span>{productToDelete.name}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-palette-1 text-primary">
                  {productToDelete.category}
                </span>
              </div>
              <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                <div>
                  <span className="block font-medium">Estoque atual:</span>
                  <span className="font-bold text-foreground">{productToDelete.stock} unidades</span>
                </div>
                <div>
                  <span className="block font-medium">Preço de venda:</span>
                  <span className="font-bold text-foreground">R$ {productToDelete.basePrice?.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Use esta opção se o produto foi <strong>cadastrado por engano</strong> ou se ficou <strong>indisponível/descontinuado</strong> na sua banca.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 border border-border rounded-xl hover:bg-muted text-foreground font-medium text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                disabled={isDeleting}
                className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                title={isDeleting ? 'Excluindo produto...' : 'Confirmar exclusão'}
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isDeleting ? 'Excluindo...' : 'Sim, Excluir Produto'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra Flutuante de Ações para Seleção Múltipla */}
      {selectedProductIds.length > 0 && (
        <div className="fixed bottom-6 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 bg-surface/95 backdrop-blur-md border-2 border-primary/50 text-foreground px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 sm:gap-6 animate-in slide-in-from-bottom-5 duration-200 max-w-xl w-full">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              {selectedProductIds.length}
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-foreground truncate">
                {selectedProductIds.length} {selectedProductIds.length === 1 ? 'produto selecionado' : 'produtos selecionados'}
              </p>
              <p className="text-[11px] text-muted-foreground hidden sm:block truncate">
                Clique em excluir para remover os selecionados juntos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold cursor-pointer transition-colors"
            >
              {filteredProducts.length > 0 && filteredProducts.every(p => p.id && selectedProductIds.includes(p.id)) ? 'Desmarcar' : 'Todos'}
            </button>

            <button
              type="button"
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="px-3.5 sm:px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir ({selectedProductIds.length})</span>
            </button>

            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Cancelar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Exclusão em Massa de Produtos */}
      {isBulkDeleteModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isBulkDeleting) {
              setIsBulkDeleteModalOpen(false);
            }
          }}
        >
          <div 
            className="bg-surface rounded-2xl max-w-lg w-full p-6 border border-border shadow-2xl space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0 border border-red-200 dark:border-red-900/40">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  Excluir {selectedProductIds.length} Produtos?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Esta ação removerá todos os {selectedProductIds.length} produtos selecionados do catálogo e estoque.
                </p>
              </div>
            </div>

            <div className="p-3 bg-muted/60 rounded-xl border border-border max-h-56 overflow-y-auto space-y-1.5 divide-y divide-border/40">
              {selectedProductIds.map(id => {
                const prod = products.find(p => p.id === id);
                if (!prod) return null;
                return (
                  <div key={id} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                    <div className="truncate pr-2">
                      <span className="font-bold text-foreground">{prod.name}</span>
                      <span className="text-muted-foreground ml-1.5 text-[11px]">({prod.category})</span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-muted-foreground">{prod.stock} {prod.type === 'cigarro' ? 'carteiras' : 'un.'}</span>
                      <span className="font-semibold text-foreground">R$ {prod.basePrice?.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Use esta opção para excluir com facilidade mais de um produto quando necessário (como produtos duplicados, descontinuados ou cadastrados por engano).
            </p>

            {isBulkDeleting && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs font-semibold text-foreground">
                  <span>Excluindo produtos...</span>
                  <span>{bulkDeleteProgress.current} de {bulkDeleteProgress.total}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-red-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(bulkDeleteProgress.current / (bulkDeleteProgress.total || 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={isBulkDeleting}
                className="px-4 py-2 border border-border rounded-xl hover:bg-muted text-foreground font-medium text-sm cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                disabled={isBulkDeleting}
                className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                title={isBulkDeleting ? 'Excluindo produtos...' : 'Confirmar exclusão em massa'}
              >
                {isBulkDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isBulkDeleting ? 'Excluindo...' : `Sim, Excluir ${selectedProductIds.length} Produtos`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Add Products & Image Import Modal */}
      <PreAddProductsModal
        isOpen={isPreAddModalOpen}
        onClose={() => setIsPreAddModalOpen(false)}
        onSuccess={(count) => {
          setToastMessage(`${count} produtos pré-adicionados com sucesso ao estoque!`);
          setTimeout(() => setToastMessage(null), 5000);
        }}
        existingProductNames={products.map(p => p.name)}
      />

      {/* Camera AI Recognition Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        availableCategories={categories}
        onRecognized={(product, imageUrl) => {
          if (isModalOpen) {
            setFormData((prev: any) => ({ ...prev, name: product.name, category: product.category, imageUrl }));
          }
        }}
        onProductSaved={(name) => {
          setToastMessage(`✓ Produto "${name}" cadastrado com sucesso por foto!`);
          setTimeout(() => setToastMessage(null), 5000);
        }}
        onSelectForEdit={(draft) => {
          openModal();
          setFormData((prev: any) => ({
            ...prev,
            name: draft.name,
            category: draft.category,
            type: draft.type,
            basePrice: draft.basePrice,
            unitCost: draft.unitCost,
            stock: draft.stock,
            unitsPerPackage: draft.unitsPerPackage || 1,
            purchaseForm: draft.purchaseForm || 'unidade',
            barcode: draft.barcode || '',
            imageUrl: draft.imageUrl || ''
          }));
        }}
      />
    </div>
  );
}


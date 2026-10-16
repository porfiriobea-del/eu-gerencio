import { useCurrency } from '../lib/useCurrency';
import { saleFee, pixTotals } from '../lib/paymentFees';
import { PaymentSummary } from '../components/PaymentSummary';
import { showToast, showActionError, withActionDeadline } from '../lib/actionFeedback';
import { useState, useEffect, useRef } from 'react';
import { subscribeSettings, updateSettings, subscribeCustomers, subscribeProducts, getSalesByDateRange, deleteEntireAccountData, getPurchasesByDateRange } from '../lib/api';
import { deleteUserAccountAuth } from '../lib/auth';
import { exportToSheets } from '../lib/sheets';
import { exportFullReportToCSV, exportDailySalesAndSafetyStockToCSV } from '../lib/exportUtils';
import { ExportPeriodModal } from '../components/ExportPeriodModal';
import { ThemeSelectorDropdown } from '../components/ThemeSelectorDropdown';
import { CardFeeSettingsSection } from '../components/CardFeeSettingsSection';
import { FeedbackSection } from '../components/FeedbackSection';
import { Settings, Customer, Purchase, Product } from '../types';
import { Save, DownloadCloud, AlertCircle, Calendar, RefreshCcw, Filter, CreditCard, Trash2, X, Mail, ExternalLink, ShieldCheck, Database, CheckCircle2, Clock, Globe, Type, Palette, Sparkles, Check, Target, Sun, Moon, ShoppingBag, FileSpreadsheet, ArrowDownLeft, ArrowUpRight, Wallet, Users, ShoppingCart, ChevronDown, ChevronUp, Camera, Image as ImageIcon, Printer, Package, Plus, KeyRound, Lock, UserCheck, Copy } from 'lucide-react';
import { openWelcomeEmail, getGmailComposeUrl } from '../lib/emailNotification';
import { generateFullUserDataBackup, downloadBackupJsonFile, checkAndRunDailyAutomatedBackup, getLastBackupTimestamp } from '../lib/backupService';
import { usePreferences, THEME_STYLES, Language, FontSize, ThemePreset, normalizeThemePreset, LanguageMode, LANGUAGE_MODE_INFOS } from '../lib/preferencesContext';
import { useEmployee } from '../lib/employeeContext';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, subDays, subMonths } from 'date-fns';
import { BUSINESS_SECTORS, getSavedBusinessSector, saveBusinessSector, getCustomCategories, setCustomCategories, saveCustomCategory, removeCustomCategory, getAllCategories } from '../lib/categories';
import { 
  GOOGLE_SHEETS_WEBHOOK_URL,
  getGoogleSheetsWebhookUrl,
  setGoogleSheetsWebhookUrl,
  testGoogleSheetsWebhook,
  getGoogleSheetsLogs,
  clearGoogleSheetsLogs,
  isGoogleSheetsWebhookEnabled,
  setGoogleSheetsWebhookEnabled,
  GoogleSheetsWebhookLog
} from '../lib/supabase';

export default function SettingsView() {
  const { formatMoney, currencySymbol, currency, isBrazil } = useCurrency();

  const { language, setLanguage, languageMode, setLanguageMode, fontSize, setFontSize, themePreset, setThemePreset, darkMode, setDarkMode, t, v, isBasicMode, simpleViewMode, setSimpleViewMode } = usePreferences();
  const { employees, currentEmployee, openSwitchModal } = useEmployee();
  const [isVocabularyExpanded, setIsVocabularyExpanded] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [theme, setTheme] = useState('standard');
  const [defaultMargin, setDefaultMargin] = useState(30);
  const [dailyGoal, setDailyGoal] = useState(500);

  const [storeName, setStoreName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [businessSector, setBusinessSector] = useState(() => getSavedBusinessSector());
  const [categoriesList, setCategoriesList] = useState<string[]>(() => getAllCategories());
  const [newCatInput, setNewCatInput] = useState('');
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Save Feedback States
  const [isSavingCustomization, setIsSavingCustomization] = useState(false);
  const [customizationFeedback, setCustomizationFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [goalFeedback, setGoalFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [isSavingStore, setIsSavingStore] = useState(false);
  const [storeFeedback, setStoreFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Export Filters State
  const [period, setPeriod] = useState<'hoje' | 'semana' | 'mes' | 'personalizado'>('hoje');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saleType, setSaleType] = useState<'todas' | 'cash' | 'card' | 'fiado'>('todas');
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [isExportPeriodModalOpen, setIsExportPeriodModalOpen] = useState(false);

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Email Notification State
  const [emailNoticeFeedback, setEmailNoticeFeedback] = useState('');

  // Daily Backup State
  const [lastBackupTime, setLastBackupTime] = useState<number | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState('');

  // Google Sheets Webhook State & Handlers
  const [sheetsWebhookUrl, setSheetsWebhookUrl] = useState(() => getGoogleSheetsWebhookUrl());
  const [sheetsEnabled, setSheetsEnabled] = useState(() => isGoogleSheetsWebhookEnabled());
  const [sheetsTesting, setSheetsTesting] = useState(false);
  const [sheetsTestResult, setSheetsTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sheetsLogs, setSheetsLogs] = useState<GoogleSheetsWebhookLog[]>(() => getGoogleSheetsLogs());
  const [isSheetsLogsOpen, setIsSheetsLogsOpen] = useState(false);
  const [isAppsScriptCodeOpen, setIsAppsScriptCodeOpen] = useState(false);
  const [copiedAppsScript, setCopiedAppsScript] = useState(false);

  useEffect(() => {
    const handleLogAdded = () => {
      setSheetsLogs(getGoogleSheetsLogs());
    };
    window.addEventListener('google-sheets-log-added', handleLogAdded);
    return () => window.removeEventListener('google-sheets-log-added', handleLogAdded);
  }, []);

  const handleSaveSheetsWebhookUrl = (newUrl: string) => {
    setSheetsWebhookUrl(newUrl);

  };

  const handleToggleSheetsEnabled = (enabled: boolean) => {
    setSheetsEnabled(enabled);
    setGoogleSheetsWebhookEnabled(enabled);
  };

  const handleTestSheetsWebhook = async () => {
    setSheetsTesting(true);
    setSheetsTestResult(null);
    try {
      const res = await testGoogleSheetsWebhook(sheetsWebhookUrl);
      setSheetsTestResult(res);
      setSheetsLogs(getGoogleSheetsLogs());
    } catch (e: any) {
      setSheetsTestResult({
        success: false,
        message: e?.message || 'Falha ao conectar ao Webhook do Google Sheets'
      });
    } finally {
      setSheetsTesting(false);
    }
  };

  const handleCopyAppsScriptCode = async () => {
    const code = `// Cole este código no Google Apps Script da sua Planilha (Extensões > Apps Script)
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Insere automaticamente na última linha da planilha
    sheet.appendRow([
      data.data || new Date().toLocaleString("pt-BR"),
      (data.tipo || "VENDA").toUpperCase(),
      data.produto || "-",
      data.quantidade || 1,
      data.valor || 0,
      data.forma_pagamento || "-",
      data.cliente || "-",
      data.descricao || "-"
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", received: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedAppsScript(true);
      setTimeout(() => setCopiedAppsScript(false), 3000);
    } catch {
      // Fallback
    }
  };

  // Auto-save State (Todas as ações salvas automaticamente + Sincronização a cada 4 minutos)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date>(new Date());
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveAllFeedback, setSaveAllFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const isInitialLoadDoneRef = useRef(false);
  const lastCloudSettingsRef = useRef<Settings | null>(null);
  const autoSaveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLastBackupTime(getLastBackupTimestamp());
    const unsubSet = subscribeSettings(s => {
      if(s) {
        lastCloudSettingsRef.current = s;
        setSheetsWebhookUrl(s.googleSheetsWebhookUrl || '');
        setSheetsEnabled(s.googleSheetsWebhookEnabled === true);
        setSettings(s);
        if (s.businessSector) setBusinessSector(s.businessSector);
        if (s.customCategories) setCategoriesList(s.customCategories);
        const resolvedTheme = s.theme || 'standard';
        setTheme(resolvedTheme);

        setDefaultMargin(s.defaultMargin ?? 30);
        setDailyGoal(s.dailyGoal ?? 500);
        setStoreName(s.storeName || '');
        setCnpj(s.cnpj || '');
        setPhone(s.phone || '');
        setEmail(s.email || '');
        setLogoUrl(s.logoUrl || '');
      }
      isInitialLoadDoneRef.current = true;
    });
    const unsubC = subscribeCustomers(setCustomers);
    const unsubP = subscribeProducts(setProducts);
    
    return () => { unsubSet(); unsubC(); unsubP(); };
  }, []);

  // Função central de salvamento imediato (usada em ações diretas e auto-save)
  const triggerImmediateSave = async (overrides?: Partial<Settings>, showFeedback: boolean = false, throwErrors = false) => {
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
      autoSaveDebounceRef.current = null;
    }
    setAutoSaveStatus('saving');
    try {
      const payload: Partial<Settings> = {
        ...(overrides?.currency ? { currency: overrides.currency } : {}),
        businessSector: overrides?.businessSector ?? businessSector,
        customCategories: overrides?.customCategories ?? categoriesList,
        language: overrides?.language ?? language, fontSize: overrides?.fontSize ?? fontSize, simpleViewMode: overrides?.simpleViewMode ?? simpleViewMode,
        googleSheetsWebhookUrl: sheetsWebhookUrl, googleSheetsWebhookEnabled: sheetsEnabled,
        storeName: overrides?.storeName !== undefined ? overrides.storeName : (storeName.trim() || settings?.storeName || 'Meu Comércio'),
        cnpj: overrides?.cnpj !== undefined ? overrides.cnpj : (cnpj.trim() || settings?.cnpj || ''),
        phone: overrides?.phone !== undefined ? overrides.phone : (phone.trim() || settings?.phone || ''),
        email: overrides?.email !== undefined ? overrides.email : (email || settings?.email || ''),
        logoUrl: overrides?.logoUrl !== undefined ? overrides.logoUrl : (logoUrl || settings?.logoUrl || ''),
        theme: overrides?.theme !== undefined ? overrides.theme : theme,
        darkMode: overrides?.darkMode !== undefined ? overrides.darkMode : darkMode,
        languageMode: overrides?.languageMode !== undefined ? overrides.languageMode : languageMode,
        defaultMargin: overrides?.defaultMargin !== undefined ? Number(overrides.defaultMargin) : (Number(defaultMargin) || 30),
        dailyGoal: overrides?.dailyGoal !== undefined ? Number(overrides.dailyGoal) : (Number(dailyGoal) || 500),
        // Card and payment fees
        enableCardFees: overrides?.enableCardFees !== undefined ? overrides.enableCardFees : (settings?.enableCardFees ?? true),
        creditCardRate: overrides?.creditCardRate !== undefined ? Number(overrides.creditCardRate) : (settings?.creditCardRate ?? 3.5),
        debitCardRate: overrides?.debitCardRate !== undefined ? Number(overrides.debitCardRate) : (settings?.debitCardRate ?? 1.5),
        pixRate: overrides?.pixRate !== undefined ? Number(overrides.pixRate) : (settings?.pixRate ?? 0.0),
        voucherRate: overrides?.voucherRate !== undefined ? Number(overrides.voucherRate) : (settings?.voucherRate ?? 2.0),
        otherFeesRate: overrides?.otherFeesRate !== undefined ? Number(overrides.otherFeesRate) : (settings?.otherFeesRate ?? 0.0),
        passCardFeeToCustomer: overrides?.passCardFeeToCustomer !== undefined ? overrides.passCardFeeToCustomer : (settings?.passCardFeeToCustomer ?? false),
        cardFeeCalculationMode: overrides?.cardFeeCalculationMode !== undefined ? overrides.cardFeeCalculationMode : (settings?.cardFeeCalculationMode ?? 'absorb'),
      };

      const patch = Object.fromEntries(Object.entries(payload).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify((lastCloudSettingsRef.current as any)?.[key])));
      if (Object.keys(patch).length) await updateSettings(patch);
      const now = new Date();
      setLastAutoSaveTime(now);
      setAutoSaveStatus('saved');

      if (showFeedback) {
        setSaveAllFeedback({
          type: 'success',
          text: `Todas as configurações foram salvas com sucesso às ${format(now, 'HH:mm:ss')}!`
        });
        setTimeout(() => setSaveAllFeedback(null), 4000);
      }
      return true;
    } catch (err) {
      console.error('Erro no salvamento automático:', err);
      setAutoSaveStatus('error');
      if (showFeedback) {
        setSaveAllFeedback({
          type: 'error',
          text: 'Não foi possível salvar na nuvem agora. Suas preferências continuam ativas no navegador.'
        });
        setTimeout(() => setSaveAllFeedback(null), 5000);
      }
      if (throwErrors) throw err;
      return false;
    }
  };

  const handleSaveAll = async (silent: boolean = false) => {
    if (isSavingAll) return;
    setIsSavingAll(true);
    try {
      await triggerImmediateSave(undefined, !silent, true);
      if (!silent) showToast('✓ Configurações salvas com sucesso!');
    } catch (error) {
      if (!silent) showActionError(error, 'Não foi possível confirmar o salvamento das configurações.');
    } finally {
      setIsSavingAll(false);
    }
  };

  // Salvamento automático contínuo de todas as ações de digitação e ajustes (debounce 700ms)
  useEffect(() => {
    if (!isInitialLoadDoneRef.current) return;
    setAutoSaveStatus('saving');
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
    }
    autoSaveDebounceRef.current = setTimeout(() => {
      triggerImmediateSave();
    }, 700);
    return () => {
      if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    };
  }, [storeName, cnpj, phone, email, logoUrl, theme, darkMode, languageMode, defaultMargin, dailyGoal, businessSector, categoriesList, language, fontSize, simpleViewMode]);

  const handleSelectLanguageMode = async (mode: LanguageMode) => {
    setLanguageMode(mode);
    const modeName = LANGUAGE_MODE_INFOS.find(m => m.id === mode)?.name || mode;
    setCustomizationFeedback({ type: 'success', text: `Sistema de linguagem atualizado para "${modeName}"! O salvamento é automático.` });
    setTimeout(() => setCustomizationFeedback(null), 4000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          setLogoUrl(dataUrl);
          triggerImmediateSave({ logoUrl: dataUrl });
          setStoreFeedback({ type: 'success', text: 'Logotipo atualizado e salvo com sucesso!' });
          setTimeout(() => setStoreFeedback(null), 4000);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    triggerImmediateSave({ logoUrl: '' });
    setStoreFeedback({ type: 'success', text: 'Logotipo do comércio removido com sucesso.' });
    setTimeout(() => setStoreFeedback(null), 3000);
  };

  const handleSaveStoreData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      alert('Nome do comércio é obrigatório.');
      return;
    }
    setIsSavingStore(true);
    setStoreFeedback(null);
    try {
      await triggerImmediateSave({
        storeName: storeName.trim(),
        cnpj: cnpj.trim(),
        phone: phone.trim(),
        logoUrl,
        businessSector
      }, false, true);
      saveBusinessSector(businessSector);
      setCustomCategories(categoriesList);
      setStoreFeedback({ type: 'success', text: 'Dados do comércio e categorias salvos com sucesso!' });
      setTimeout(() => setStoreFeedback(null), 4000);
      showToast('✓ Dados do comércio salvos com sucesso!');
    } catch (error) {
      showActionError(error, 'Não foi possível confirmar o salvamento dos dados do comércio.');
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleRemoveCategory = (cat: string) => {
    const updated = categoriesList.filter(c => c.toLowerCase() !== cat.toLowerCase());
    setCategoriesList(updated);
    setCustomCategories(updated);
  };

  const handleAddCategory = () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    if (categoriesList.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewCatInput('');
      return;
    }
    const updated = [...categoriesList, trimmed];
    setCategoriesList(updated);
    setCustomCategories(updated);
    setNewCatInput('');
  };

  const handleSwitchSector = (sectorId: string) => {
    setBusinessSector(sectorId);
    saveBusinessSector(sectorId);
    triggerImmediateSave({ businessSector: sectorId });
    const sector = BUSINESS_SECTORS.find(s => s.id === sectorId);
    if (sector) {
      const updated = [...sector.suggestedCategories];
      setCategoriesList(updated);
      setCustomCategories(updated);
    }
  };

  const handleSaveCustomization = async () => {
    setIsSavingCustomization(true);
    setCustomizationFeedback(null);
    try {
      await updateSettings({ 
        storeName: storeName.trim() || settings?.storeName || 'Meu Comércio', 
        cnpj: cnpj.trim() || settings?.cnpj || '', 
        phone: phone.trim() || settings?.phone || '', 
        email: email || settings?.email || '', 
        theme, 
        darkMode, 
        languageMode,
        defaultMargin: Number(defaultMargin) || 30, 
        dailyGoal: Number(dailyGoal) || 500 
      });
      showToast('✓ Personalização salva com sucesso!');
      setCustomizationFeedback({ type: 'success', text: 'Personalização do sistema salva na nuvem com sucesso!' });
      setTimeout(() => setCustomizationFeedback(null), 4000);
    } catch (err) {
      showActionError(err, 'Não foi possível confirmar o salvamento da personalização.');
      setCustomizationFeedback({ type: 'error', text: 'Erro ao salvar na nuvem. O tema e modo escuro permanecem ativos no navegador!' });
      setTimeout(() => setCustomizationFeedback(null), 5000);
    } finally {
      setIsSavingCustomization(false);
    }
  };

  const handleSaveDailyGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGoal(true);
    setGoalFeedback(null);
    try {
      await triggerImmediateSave({ dailyGoal: Number(dailyGoal), defaultMargin: Number(defaultMargin) }, false, true);
      setGoalFeedback({ type: 'success', text: 'Meta do dia salva com sucesso!' });
      setTimeout(() => setGoalFeedback(null), 4000);
      showToast('✓ Meta do dia salva com sucesso!');
    } catch (error) {
      showActionError(error, 'Não foi possível confirmar o salvamento da meta.');
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    setThemePreset(normalizeThemePreset(newTheme));
    triggerImmediateSave({ theme: newTheme });
  };

  const resetFilters = () => {
    setPeriod('hoje');
    setSaleType('todas');
    setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const getPeriodTimestamps = () => {
    let startTimestamp = 0;
    let endTimestamp = 0;
    let periodLabel = 'Hoje';
    const now = new Date();
    if (period === 'hoje') {
      startTimestamp = startOfDay(now).getTime();
      endTimestamp = endOfDay(now).getTime();
      periodLabel = `Hoje (${format(now, 'dd/MM/yyyy')})`;
    } else if (period === 'semana') {
      startTimestamp = startOfWeek(now).getTime();
      endTimestamp = endOfWeek(now).getTime();
      periodLabel = `Esta Semana (${format(startOfWeek(now), 'dd/MM')} a ${format(endOfWeek(now), 'dd/MM/yyyy')})`;
    } else if (period === 'mes') {
      startTimestamp = startOfMonth(now).getTime();
      endTimestamp = endOfMonth(now).getTime();
      periodLabel = `Este Mês (${format(now, 'MM/yyyy')})`;
    } else {
      const parsedStart = startDate ? parseISO(startDate) : subDays(now, 7);
      const parsedEnd = endDate ? parseISO(endDate) : now;
      const validStart = isNaN(parsedStart.getTime()) ? subDays(now, 7) : parsedStart;
      const validEnd = isNaN(parsedEnd.getTime()) ? now : parsedEnd;
      startTimestamp = startOfDay(validStart).getTime();
      endTimestamp = endOfDay(validEnd).getTime();
      periodLabel = `Período Personalizado (${format(validStart, 'dd/MM/yyyy')} a ${format(validEnd, 'dd/MM/yyyy')})`;
    }
    return { startTimestamp, endTimestamp, periodLabel };
  };

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [reportMetrics, setReportMetrics] = useState<{
    pix: ReturnType<typeof pixTotals>;
    inflow: number;
    cashInflow: number;
    cardInflow: number;
    fiadoInflow: number;
    outflow: number;
    balance: number;
    salesCount: number;
    purchasesCount: number;
    loading: boolean;
  }>({
    pix: pixTotals([]),
    inflow: 0,
    cashInflow: 0,
    cardInflow: 0,
    fiadoInflow: 0,
    outflow: 0,
    balance: 0,
    salesCount: 0,
    purchasesCount: 0,
    loading: true
  });

  useEffect(() => {
    let isCancelled = false;
    const loadReportMetrics = async () => {
      try {
        setReportMetrics(prev => ({ ...prev, loading: true }));
        const { startTimestamp, endTimestamp } = getPeriodTimestamps();
        const [fetchedSales, fetchedPurchases] = await Promise.all([
          getSalesByDateRange(startTimestamp, endTimestamp),
          getPurchasesByDateRange(startTimestamp, endTimestamp)
        ]);

        if (isCancelled) return;

        let filteredSales = fetchedSales;
        if (saleType !== 'todas') {
          filteredSales = fetchedSales.filter(s => s.type === saleType);
        }

        let inflow = 0;
        let cashInflow = 0;
        let cardInflow = 0;
        let fiadoInflow = 0;
        filteredSales.forEach(s => {
          inflow += s.total || 0;
          if (s.type === 'cash') cashInflow += s.total || 0;
          else if (s.type === 'card') cardInflow += s.total || 0;
          else if (s.type === 'fiado') fiadoInflow += s.total || 0;
        });

        let outflow = 0;
        fetchedPurchases.forEach(p => {
          outflow += p.totalCost || 0;
        });

        const balance = inflow - outflow - filteredSales.reduce((sum,sale) => sum + saleFee(sale), 0);

        setReportMetrics({
          pix: pixTotals(filteredSales),
          inflow,
          cashInflow,
          cardInflow,
          fiadoInflow,
          outflow,
          balance,
          salesCount: filteredSales.length,
          purchasesCount: fetchedPurchases.length,
          loading: false
        });
      } catch (e) {
        if (!isCancelled) {
          console.warn('Erro ao carregar métricas para o relatório:', e);
          setReportMetrics(prev => ({ ...prev, loading: false }));
        }
      }
    };

    loadReportMetrics();
    return () => {
      isCancelled = true;
    };
  }, [period, startDate, endDate, saleType]);

  const handleExport = async () => {
    const confirmed = window.confirm("Deseja executar e exportar o Relatório completo (Vendas, Compras e Fiado) para o Google Sheets?");
    if(!confirmed) return;

    try {
      setIsExporting(true);
      setExportMessage('');
      
      const { startTimestamp, endTimestamp } = getPeriodTimestamps();

      let fetchedSales = await getSalesByDateRange(startTimestamp, endTimestamp);
      if (saleType !== 'todas') {
         fetchedSales = fetchedSales.filter(s => s.type === saleType);
      }

      // Buscar compras do período para incluir na nova aba do relatório
      const fetchedPurchases = await getPurchasesByDateRange(startTimestamp, endTimestamp);

      const url = await exportToSheets({
        currency, language,
        sales: fetchedSales,
        expenses: [],
        customers: customers,
        purchases: fetchedPurchases
      });
      setExportMessage(`Relatório criado com sucesso com as abas de Vendas, Compras e Fiado! Você pode acessá-lo no seu Google Drive.`);
      window.open(url, '_blank');
    } catch (err: any) {
      setExportMessage("Erro ao exportar: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      setExportMessage('');
      const { startTimestamp, endTimestamp, periodLabel } = getPeriodTimestamps();

      let fetchedSales = await getSalesByDateRange(startTimestamp, endTimestamp);
      if (saleType !== 'todas') {
        fetchedSales = fetchedSales.filter(s => s.type === saleType);
      }

      const fetchedPurchases = await getPurchasesByDateRange(startTimestamp, endTimestamp);

      exportFullReportToCSV({
        currency, language,
        purchases: fetchedPurchases,
        sales: fetchedSales,
        customers: customers,
        products: products,
        periodLabel,
        startDate: period === 'personalizado' ? startDate : undefined,
        endDate: period === 'personalizado' ? endDate : undefined,
        storeName: storeName || settings?.storeName,
        inflow: reportMetrics.inflow,
        outflow: reportMetrics.outflow,
        balance: reportMetrics.balance,
        fiadoInflow: reportMetrics.fiadoInflow
      });

      setExportMessage(`Planilha completa baixada com sucesso (${fetchedPurchases.length} compras, ${fetchedSales.length} vendas e ${products.length} produtos analisados com venda diária e estoque de segurança).`);
    } catch (err: any) {
      setExportMessage("Erro ao baixar planilha: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDailySalesAndSafety = () => {
    try {
      exportDailySalesAndSafetyStockToCSV(products, storeName || settings?.storeName, undefined, {currency,language});
      setExportMessage(`Relatório exclusivo de Venda Diária e Estoque de Segurança baixado com sucesso para ${products.length} itens cadastrados!`);
    } catch (err: any) {
      setExportMessage("Erro ao gerar relatório de estoque de segurança: " + (err.message || err));
    }
  };

  const handleRunManualBackup = async () => {
    try {
      setIsBackingUp(true);
      setBackupSuccessMessage('');
      const res = await checkAndRunDailyAutomatedBackup();
      const backup = await generateFullUserDataBackup();
      downloadBackupJsonFile(backup);
      setLastBackupTime(Date.now());
      setBackupSuccessMessage(`Backup completo do Supabase realizado e baixado com sucesso! (${backup.metrics.totalProducts} produtos, ${backup.metrics.totalCustomers} clientes, ${backup.metrics.totalSales} vendas).`);
      setTimeout(() => setBackupSuccessMessage(''), 8000);
    } catch (err: any) {
      alert('Erro ao realizar backup: ' + (err.message || err));
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText.trim().toUpperCase() !== 'EXCLUIR') {
      setDeleteError('Digite EXCLUIR para confirmar.');
      return;
    }

    try {
      setIsDeletingAccount(true);
      setDeleteError('');
      // 1. Delete all Supabase user data
      await withActionDeadline(deleteEntireAccountData, 120000)();
      // 2. Clear browser client cache
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.warn('Error clearing storage:', e);
      }
      // 3. Delete auth user or sign out
      await withActionDeadline(deleteUserAccountAuth)();
      showToast('✓ Conta removida com sucesso!', 'success', true);
      // Redirect to root
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error deleting account:', err);
      showActionError(err, 'Não foi possível concluir a exclusão da conta. Confira o estado da conta antes de repetir.');
    } finally {
      setShowDeleteModal(false);
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      {/* Card de Salvamento Automático */}
      <div className="p-4 sm:p-5 rounded-2xl border border-primary/20 bg-palette-1/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-primary text-primary-foreground shrink-0 mt-0.5 sm:mt-0 shadow-2xs">
            <RefreshCcw className={`w-5 h-5 ${autoSaveStatus === 'saving' || isSavingAll ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-foreground">Salvamento automático</h2>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Salva todas as ações automaticamente + cada 4 min
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Suas configurações são salvas sozinhas a cada 4 minutos. Você também pode salvar a qualquer momento no botão abaixo.
            </p>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
              {autoSaveStatus === 'saving' || isSavingAll ? (
                <span className="text-xs font-semibold text-primary flex items-center gap-1.5 bg-palette-1 px-2.5 py-0.5 rounded-lg border border-primary/30">
                  <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                  Salvando alterações automaticamente em tempo real...
                </span>
              ) : (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Todas as suas ações são salvas sozinhas na nuvem (último registro: {format(lastAutoSaveTime, 'HH:mm:ss')}).
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => handleSaveAll(false)}
            disabled={isSavingAll || autoSaveStatus === 'saving'}
            className="px-4 py-2.5 bg-primary text-primary-foreground hover:opacity-90 transition-all rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs active:scale-98"
          >
            <Save className="w-4 h-4" />
            <span>{isSavingAll ? 'Salvando agora...' : 'Salvar Configurações Agora'}</span>
          </button>
        </div>
      </div>

      {saveAllFeedback && (
        <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
          saveAllFeedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
            : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800'
        }`}>
          {saveAllFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          <span>{saveAllFeedback.text}</span>
        </div>
      )}

      {/* Personalização do Sistema (Estilo Menu Suspenso / Dropdown) */}
      <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden transition-all mb-6">
        <div 
          onClick={() => setIsCustomizationOpen(!isCustomizationOpen)}
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors select-none"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-palette-1 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-foreground">Personalização e Tema</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Menu Suspenso
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cores do tema, modo escuro, linguagem do sistema e escala de leitura.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Badges de resumo rápido */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="px-2.5 py-1 bg-muted rounded-lg font-medium border border-border/60 text-foreground text-xs notranslate normal-case" translate="no">
                {THEME_STYLES.find(t => t.id === themePreset)?.name || 'Padrão / Comum'}
              </span>
              <span className="px-2.5 py-1 bg-muted rounded-lg font-medium border border-border/60 text-foreground text-xs">
                {darkMode ? '🌙 Escuro' : '☀️ Claro'}
              </span>
            </div>
            <div className={`p-2 rounded-xl bg-muted/70 text-foreground transition-transform duration-200 ${isCustomizationOpen ? 'rotate-180' : ''}`}>
              <ChevronDown className="w-5 h-5 text-primary" />
            </div>
          </div>
        </div>

        {isCustomizationOpen && (
          <div className="p-6 pt-2 border-t border-border">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-6 flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">
                Configurações ativas são salvas automaticamente em tempo real na nuvem.
              </span>
              <button 
                type="button" 
                onClick={handleSaveCustomization} 
                disabled={isSavingCustomization} 
                className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingCustomization ? 'Salvando...' : 'Salvar Personalização'}
              </button>
            </div>

            {customizationFeedback && (
              <div className={`mb-5 p-3 rounded-xl text-sm flex items-center gap-2 ${
                customizationFeedback.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                  : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}>
                {customizationFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                <span>{customizationFeedback.text}</span>
              </div>
            )}

            <div className="space-y-6">
          {/* 1. SISTEMA PERSONALIZADO DE LINGUAGEM */}
          <div className="pb-6 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{v('settings.languageMode')}</h3>
                  <p className="text-xs text-muted-foreground">
                    Escolha como o sistema expressa os conceitos de estoque, compras, preços e caixa.
                  </p>
                </div>
              </div>
              <span className="self-start sm:self-auto text-[11px] font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 notranslate normal-case" translate="no">
                Ativo: {LANGUAGE_MODE_INFOS.find(m => m.id === languageMode)?.name}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
              {LANGUAGE_MODE_INFOS.map((mode) => {
                const isSelected = languageMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    aria-pressed={isSelected}
                    type="button"
                    onClick={() => handleSelectLanguageMode(mode.id)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-primary bg-palette-1/50 shadow-md ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50 bg-surface'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5 mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mode.badgeColor}`}>
                          {mode.badge}
                        </span>
                        {isSelected && (
                          <span className="p-1 rounded-full bg-primary text-white">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-foreground mb-1 notranslate normal-case" translate="no">{mode.name}</h4>
                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed notranslate normal-case" translate="no">{simpleViewMode ? mode.tagline : mode.description}</p>
                    </div>

                    <div className="pt-2.5 border-t border-border/60 text-[11px] space-y-1.5">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Catálogo:</span>
                        <strong className="text-foreground font-semibold">{mode.id === 'technical' ? 'Mercadoria' : mode.id === 'basic' ? 'Item' : 'Produto'}</strong>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Alerta:</span>
                        <strong className="text-foreground font-semibold">{mode.id === 'technical' ? 'Ponto de Pedido' : mode.id === 'basic' ? 'Quando Pedir Mais' : 'Estoque Mínimo'}</strong>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Lucratividade:</span>
                        <strong className="text-foreground font-semibold">{mode.id === 'technical' ? 'Margem Operacional' : mode.id === 'basic' ? 'Quanto Sobra de Lucro' : 'Margem de Lucro'}</strong>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Live Comparative Vocabulary Preview Box (Minimizado por padrão no modo básico para manter a interface simples e limpa) */}
            <div className="rounded-2xl bg-muted/40 border border-border mt-3 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsVocabularyExpanded(!isVocabularyExpanded)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground block notranslate normal-case" translate="no">
                      Comparativo de termos ({LANGUAGE_MODE_INFOS.find(m => m.id === languageMode)?.name})
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {isVocabularyExpanded 
                        ? 'Clique para minimizar este comparativo' 
                        : 'Informações completas mantidas. Clique para visualizar a tabela de termos sob demanda'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <span>{isVocabularyExpanded ? 'Minimizar' : 'Ver termos completos'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isVocabularyExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isVocabularyExpanded && (
                <div className="p-4 pt-0 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground mb-3 mt-3">
                    Cada conceito expressa a mesma verdade matemática do negócio com palavras descomplicadas:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {(LANGUAGE_MODE_INFOS.find(m => m.id === languageMode) || LANGUAGE_MODE_INFOS[1]).examples.map((ex, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-surface border border-border/80 shadow-2xs">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">{ex.concept}</span>
                        <span className="text-xs font-bold text-primary block mb-1">{ex.term}</span>
                        <span className="text-[11px] text-muted-foreground leading-snug block">{ex.explanation}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Controle de Interface Simples e Dinâmica */}
            {isBasicMode && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      Interface 100% Descomplicada Ativa
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Em todas as telas (Estoque, Caixa, Compras, Preços, Fiado e Início), os detalhes técnicos e tabelas extensas ficam minimizados de forma limpa e dinâmica, prontos para expandir com 1 toque quando você precisar.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSimpleViewMode(!simpleViewMode)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs border ${
                      simpleViewMode
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-surface text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {simpleViewMode ? '✓ Visão Simples Ativa' : 'Expandir Tudo por Padrão'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Temas de Interface e Modo Escuro */}
          <div className="pt-2 border-t border-border">
            <ThemeSelectorDropdown 
              onSaveTheme={(themeId) => {
                setTheme(themeId);
                triggerImmediateSave({ theme: themeId });
              }}
              onSaveDarkMode={(isDark) => {
                triggerImmediateSave({ darkMode: isDark });
              }}
            />
          </div>


          {/* 2. Idiomas */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-primary" />
              <label className="text-sm font-semibold text-foreground">{t('settings.language')}</label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'pt', label: 'Português (Brasil)', flag: '🇧🇷' },
                { id: 'en', label: 'English (US)', flag: '🇺🇸' },
                { id: 'es', label: 'Español (Latam)', flag: '🇪🇸' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLanguage(item.id as Language)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                    language === item.id
                      ? 'border-primary bg-palette-1 text-primary shadow-sm ring-1 ring-primary'
                      : 'border-border hover:border-gray-300 dark:hover:border-gray-600 bg-surface text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{item.flag}</span>
                    <span>{item.label}</span>
                  </span>
                  {language === item.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Acessibilidade de Leitura */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-1">
              <Type className="w-4 h-4 text-primary" />
              <label className="text-sm font-semibold text-foreground">{t('settings.accessibility')}</label>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('settings.accessibility.desc')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'normal', label: t('font.normal'), desc: 'Escala balanceada padrão' },
                { id: 'large', label: t('font.large'), desc: 'Aumento de 15% para nitidez' },
                { id: 'xlarge', label: t('font.xlarge'), desc: 'Texto expandido e confortável' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFontSize(item.id as FontSize)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    fontSize === item.id
                      ? 'border-primary bg-palette-1 text-primary shadow-sm ring-1 ring-primary'
                      : 'border-border hover:border-gray-300 dark:hover:border-gray-600 bg-surface text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{item.label}</span>
                    {fontSize === item.id && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <span className="text-xs text-muted-foreground">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
          </div>
        )}
      </div>

      {/* Dados do Comércio */}
      <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border mb-6">
        <h2 className="text-lg font-bold mb-4 border-b border-border pb-2 text-foreground">Dados do Comércio</h2>
          <section className="mb-4">
            <label htmlFor="store-currency" className="block text-sm font-semibold">{v('currency.title', 'Moeda da loja')}</label>
            <select id="store-currency" value={settings?.currency || currency} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface p-3" onChange={async event => {
              const next = event.target.value as 'BRL' | 'USD' | 'EUR';
              if (next === (settings?.currency || currency) || !window.confirm(v('currency.warning', 'Os valores não serão convertidos, só o símbolo muda.'))) return;
              try { await triggerImmediateSave({currency:next}, true, true); } catch { /* Saving already displays the error. */ }
            }}>
              <option value="BRL">R$ — BRL</option><option value="USD">$ — USD</option><option value="EUR">€ — EUR</option>
            </select>
            <p className="mt-2 text-xs text-muted-foreground">{v('currency.help', 'A escolha vale para toda a loja e não muda quando você troca o idioma.')}</p>
          </section>
        
        {storeFeedback && (
          <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
            storeFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {storeFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
            <span>{storeFeedback.text}</span>
          </div>
        )}

        {/* Foto / Logotipo do Comércio */}
        <div className="mb-6 p-4 rounded-2xl bg-palette-1/30 border border-primary/20 flex flex-col sm:flex-row items-center gap-5">
          <div className="relative shrink-0">
            {logoUrl ? (
              <div className="relative group">
                <img 
                  src={logoUrl} 
                  alt={storeName || 'Logotipo do Comércio'} 
                  className="w-24 h-24 rounded-2xl object-cover border-2 border-primary/40 shadow-sm bg-surface" 
                />
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="absolute -top-2 -right-2 p-1.5 bg-red-600 text-white rounded-full shadow hover:bg-red-700 cursor-pointer transition-transform hover:scale-110"
                  title="Remover logotipo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground">
                <Camera className="w-8 h-8 opacity-40 mb-1 text-primary" />
                <span className="text-[10px] font-medium text-center px-1">Sem Logotipo</span>
              </div>
            )}
          </div>

          <div className="flex-1 w-full space-y-2 text-left">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <span>Logotipo / Imagem do Comércio</span>
              </label>
              {logoUrl && (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  ✓ Logo configurada
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Esta imagem ou logo aparecerá no cabeçalho do menu lateral, nos comprovantes de venda e nos relatórios.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label className="cursor-pointer px-3.5 py-1.5 bg-primary text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-xs">
                <Camera className="w-3.5 h-3.5" />
                <span>Escolher Imagem / Foto</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleLogoUpload} 
                />
              </label>
              {logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="px-3 py-1.5 bg-muted text-foreground text-xs font-medium rounded-xl hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  Remover Foto
                </button>
              )}
            </div>
            <div className="pt-1">
              <input 
                type="url"
                placeholder="Ou cole o link direto da imagem (ex: https://...)"
                value={logoUrl}
                onChange={e => {
                  setLogoUrl(e.target.value);
                  triggerImmediateSave({ logoUrl: e.target.value });
                }}
                className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveStoreData} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nome do Comércio *</label>
              <input 
                required 
                maxLength={100} 
                value={storeName} 
                onChange={e => setStoreName(e.target.value)} 
                onBlur={() => triggerImmediateSave({ storeName: storeName.trim() })}
                className="w-full border border-border bg-surface text-foreground p-2.5 rounded-lg focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div hidden={!isBrazil}>
              <label className="block text-sm font-medium text-foreground mb-1">CNPJ</label>
              <input 
                maxLength={20} 
                value={cnpj} 
                onChange={e => setCnpj(e.target.value)} 
                onBlur={() => triggerImmediateSave({ cnpj: cnpj.trim() })}
                className="w-full border border-border bg-surface text-foreground p-2.5 rounded-lg focus:ring-1 focus:ring-primary outline-none" 
                placeholder="00.000.000/0000-00" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Celular</label>
              <input 
                maxLength={20} 
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
                onBlur={() => triggerImmediateSave({ phone: phone.trim() })}
                className="w-full border border-border bg-surface text-foreground p-2.5 rounded-lg focus:ring-1 focus:ring-primary outline-none" 
                placeholder={isBrazil ? '(00) 00000-0000' : 'Telefone com código do país'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">E-mail</label>
              <input disabled value={email} className="w-full border border-border p-2.5 rounded-lg bg-muted text-muted-foreground cursor-not-allowed" />
            </div>
          </div>

          {/* Setor de Atuação e Categorias */}
          <div className="pt-4 border-t border-border space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-primary" />
                  <span>Setor de Atuação do Comércio</span>
                </label>
                <span className="text-[10px] text-muted-foreground">
                  Altera as sugestões de categorias modelo
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {BUSINESS_SECTORS.map(s => {
                  const isSelected = businessSector === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSwitchSector(s.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-primary bg-palette-1 text-primary ring-1 ring-primary shadow-xs' 
                          : 'border-border bg-surface text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-xs mb-0.5">
                        <span className="notranslate normal-case" translate="no">{s.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{s.tagline}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gerenciamento de Categorias Ativas */}
            <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Categorias Ativas ({categoriesList.length})
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Clique no <strong>(✕)</strong> para excluir ou adicione novas categorias abaixo:
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {categoriesList.map(cat => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-surface border border-border text-foreground shadow-2xs"
                  >
                    <span>{cat}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(cat)}
                      className="text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 p-0.5 rounded-full transition-colors cursor-pointer"
                      title={`Remover categoria "${cat}"`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Nome de uma nova categoria..."
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  disabled={!newCatInput.trim()}
                  className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  openWelcomeEmail({
                    storeName: storeName || 'Meu Comércio',
                    email,
                    cnpj,
                    phone,
                  });
                  setEmailNoticeFeedback('Cliente de e-mail aberto com a confirmação!');
                  setTimeout(() => setEmailNoticeFeedback(''), 4000);
                }}
                className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 text-primary" />
                Enviar Notificação da Conta por E-mail
              </button>

              <button
                type="button"
                onClick={() => {
                  const url = getGmailComposeUrl({
                    storeName: storeName || 'Meu Comércio',
                    email,
                    cnpj,
                    phone,
                  });
                  window.open(url, '_blank');
                  setEmailNoticeFeedback('Aberto no Gmail com os dados da conta preenchidos!');
                  setTimeout(() => setEmailNoticeFeedback(''), 4000);
                }}
                className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                Abrir no Gmail
              </button>

              {emailNoticeFeedback && (
                <span className="text-xs text-emerald-600 font-medium">
                  {emailNoticeFeedback}
                </span>
              )}
            </div>

            <button type="submit" disabled={isSavingStore} className="px-5 py-2.5 bg-primary text-white rounded-lg flex items-center gap-2 hover:opacity-90 font-medium cursor-pointer shadow-sm disabled:opacity-50">
              <Save className="w-4 h-4" /> {isSavingStore ? 'Salvando...' : 'Salvar Dados'}
            </button>
          </div>
        </form>
      </div>

      {/* Modo do Funcionário & Gestão de Equipe */}
      <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border">
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-palette-1 text-primary rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">Modo do Funcionário & Equipe</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  {employees.length} {employees.length === 1 ? 'colaborador' : 'colaboradores'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adicione e exclua funcionários. Cada colaborador possui senha individual para alternar de operador no sistema.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openSwitchModal}
            className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Gerenciar / Adicionar Funcionário</span>
          </button>
        </div>

        {/* Status Atual do Operador */}
        <div className="mb-4 p-3.5 rounded-xl border border-border bg-muted/30 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={['notranslate', 'normal-case', (`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-xs ${currentEmployee?.color || 'bg-primary'}`)].filter(Boolean).join(' ')} translate="no">
              {currentEmployee ? currentEmployee.name.charAt(0).toUpperCase() : 'P'}
            </div>
            <div>
              <p className="text-xs font-bold text-foreground notranslate normal-case" translate="no">
                {currentEmployee ? `Operador Ativo: ${currentEmployee.name}` : 'Modo Proprietário / Gerente'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {currentEmployee 
                  ? `Função: ${currentEmployee.role} • Movimentações em andamento registradas no nome dele.`
                  : 'Nenhum funcionário em turno agora. Clique em "Mudar de Funcionário" para entrar com senha.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openSwitchModal}
            className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-primary" />
            <span>{currentEmployee ? 'Trocar Operador com Senha' : 'Entrar com Senha de Funcionário'}</span>
          </button>
        </div>

        {/* Lista de Colaboradores Cadastrados */}
        {employees.length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed border-border rounded-xl bg-muted/10">
            <p className="text-xs text-muted-foreground mb-2">
              Você ainda não cadastrou funcionários com senha para a sua loja.
            </p>
            <button
              type="button"
              onClick={openSwitchModal}
              className="px-3.5 py-1.5 bg-primary text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Cadastrar Primeiro Funcionário
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {employees.map(emp => {
              const isCurrent = currentEmployee?.id === emp.id;
              const hasPin = Boolean(emp.pin && emp.pin.trim().length > 0);

              return (
                <div 
                  key={emp.id}
                  onClick={openSwitchModal}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                    isCurrent 
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-xs' 
                      : 'border-border bg-surface hover:border-primary/40'
                  }`}
                  title="Clique para gerenciar, excluir ou mudar de funcionário com senha"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                    <div className={['notranslate', 'normal-case', (`w-8 h-8 rounded-lg ${emp.color || 'bg-primary'} text-white font-bold flex items-center justify-center text-xs shrink-0`)].filter(Boolean).join(' ')} translate="no">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <p className="text-xs font-bold text-foreground truncate notranslate normal-case" translate="no">{emp.name}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="truncate">{emp.role}</span>
                        <span>•</span>
                        <span className={hasPin ? "text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-0.5" : "text-amber-700 dark:text-amber-300"}>
                          <Lock className="w-2.5 h-2.5" />
                          {hasPin ? 'Com senha' : 'Sem senha'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    isCurrent ? 'bg-emerald-500 text-white' : 'bg-muted text-foreground'
                  }`}>
                    {isCurrent ? 'Ativo' : 'Mudar'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Meta do Dia & Parâmetros Comerciais (Separado conforme solicitado) */}
      <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border">
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-palette-1 text-primary rounded-xl">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Meta do Dia & Parâmetros Comerciais</h2>
              <p className="text-xs text-muted-foreground">Defina a meta diária de vendas e a margem sugerida para precificação.</p>
            </div>
          </div>
        </div>

        {goalFeedback && (
          <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
            goalFeedback.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
              : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {goalFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
            <span>{goalFeedback.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveDailyGoal} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Meta Diária de Vendas ({currencySymbol})</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground font-semibold text-sm">{currencySymbol}</span>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  value={dailyGoal} 
                  onChange={e => setDailyGoal(Number(e.target.value))} 
                  onBlur={() => triggerImmediateSave({ dailyGoal: Number(dailyGoal) })}
                  className="w-full border border-border bg-surface text-foreground pl-10 p-2.5 rounded-xl font-bold text-base focus:ring-1 focus:ring-primary outline-none" 
                  placeholder="500.00"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Alvo diário exibido no velocímetro de progresso na tela inicial.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Margem de Lucro Padrão (%)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="0.1" 
                  required 
                  value={defaultMargin} 
                  onChange={e => setDefaultMargin(Number(e.target.value))} 
                  onBlur={() => triggerImmediateSave({ defaultMargin: Number(defaultMargin) })}
                  className="w-full border border-border bg-surface text-foreground p-2.5 pr-8 rounded-xl font-bold text-base focus:ring-1 focus:ring-primary outline-none" 
                  placeholder="30"
                />
                <span className="absolute right-3 top-2.5 text-muted-foreground font-semibold text-sm">%</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Margem sugerida na precificação automática de novos itens cadastrados.</p>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-border">
            <button 
              type="submit" 
              disabled={isSavingGoal} 
              className="px-5 py-2.5 bg-primary text-white rounded-xl flex items-center gap-2 hover:opacity-90 font-semibold text-sm cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {isSavingGoal ? 'Salvando Meta...' : 'Salvar Meta do Dia'}
            </button>
          </div>
        </form>
      </div>

      {/* 4. Taxas de Cartão & Maquininha ("Taxinha do Cartão") */}
      <div className="mt-6 mb-6">
        <CardFeeSettingsSection 
          settings={settings} 
          onSave={async updates => { await triggerImmediateSave(updates, false, true); }}
          isSaving={autoSaveStatus === 'saving'} 
        />
      </div>

      {/* Relatórios Personalizados & Resumo do Dia */}
      <div className="bg-surface p-6 md:p-8 rounded-2xl shadow-xl border border-border mt-8 text-foreground">
        <div className="flex justify-between items-start md:items-center mb-6 border-b border-border pb-4 flex-col md:flex-row gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground tracking-wide flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                {v('reports.title')}
              </h2>
              {languageMode === 'basic' && (
                <span className="text-[11px] font-bold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Modo Descomplicado
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {v('settings.reportDescription')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors bg-muted/40 border border-border px-3 py-2 rounded-lg hover:bg-muted"
            >
              <Filter className="w-3.5 h-3.5 text-purple-400" />
              {showAdvancedFilters ? 'Ocultar Filtros Detalhados' : 'Filtros de Data & Pagamento'}
              {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button 
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-muted-foreground transition-colors bg-muted/40 border border-border px-3 py-2 rounded-lg hover:bg-muted"
              title="Restaurar sugestões"
            >
              <RefreshCcw className="w-3.5 h-3.5"/>
            </button>
          </div>
        </div>

        {/* CARD PRINCIPAL DE 'RESUMO DO DIA' / PERÍODO */}
        <div className="mb-6 bg-gradient-to-br from-muted/50 to-surface border-2 border-emerald-500/30 rounded-2xl p-5 md:p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  <Wallet className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
                    {languageMode === 'basic' ? (
                      period === 'hoje' ? 'Resumo do Dia' : period === 'semana' ? 'Resumo da Semana' : period === 'mes' ? 'Resumo do Mês' : 'Resumo do Período'
                    ) : (
                      v('reports.summary', 'Demonstrativo Consolidado do Período')
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {languageMode === 'basic' 
                      ? 'Veja exatamente quanto dinheiro entrou e quanto dinheiro saiu do seu comércio de forma muito clara e direta.'
                      : `Apuração operacional calculada para: ${getPeriodTimestamps().periodLabel}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Seletor Rápido de Período */}
            <div className="flex items-center bg-muted/40 p-1 rounded-xl border border-border shrink-0 self-start sm:self-auto flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setPeriod('hoje')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${period === 'hoje' ? 'bg-emerald-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setPeriod('semana')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${period === 'semana' ? 'bg-emerald-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Esta Semana
              </button>
              <button
                type="button"
                onClick={() => setPeriod('mes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${period === 'mes' ? 'bg-emerald-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => setPeriod('personalizado')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${period === 'personalizado' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-700 dark:text-purple-300 hover:text-foreground'}`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Personalizado</span>
              </button>
            </div>
          </div>

          {/* BARRA DE SELEÇÃO DE PERÍODO PERSONALIZADO */}
          {period === 'personalizado' && (
            <div className="mb-6 p-4 rounded-xl bg-muted/40 border border-purple-500/40 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" />
                    De:
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="bg-surface border border-border text-foreground text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:border-purple-500 outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-300">Até:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="bg-surface border border-border text-foreground text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:border-purple-500 outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
                  />
                </div>
              </div>

              {/* Atalhos Rápidos de Datas */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground mr-1">Atalhos:</span>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                  }}
                  className="text-[11px] font-semibold px-2 py-1 bg-surface hover:bg-purple-900/40 text-purple-700 dark:text-purple-200 rounded-lg border border-border transition-colors cursor-pointer"
                >
                  Últimos 7 dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(format(subDays(new Date(), 15), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                  }}
                  className="text-[11px] font-semibold px-2 py-1 bg-surface hover:bg-purple-900/40 text-purple-700 dark:text-purple-200 rounded-lg border border-border transition-colors cursor-pointer"
                >
                  Últimos 15 dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                  }}
                  className="text-[11px] font-semibold px-2 py-1 bg-surface hover:bg-purple-900/40 text-purple-700 dark:text-purple-200 rounded-lg border border-border transition-colors cursor-pointer"
                >
                  Últimos 30 dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
                    setEndDate(format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
                  }}
                  className="text-[11px] font-semibold px-2 py-1 bg-surface hover:bg-purple-900/40 text-purple-700 dark:text-purple-200 rounded-lg border border-border transition-colors cursor-pointer"
                >
                  Mês Passado
                </button>
              </div>
            </div>
          )}

          <PaymentSummary totals={reportMetrics.pix} />
          {/* 4 CARDS DE MÉTRICAS COM TRADUÇÃO DESCOMPLICADA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Card 1: Dinheiro que entrou */}
            <div className="bg-muted/40 border border-emerald-500/30 hover:border-emerald-500/50 transition-colors rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    {v('reports.inflow')}
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-foreground tracking-tight">
                  {reportMetrics.loading ? '...' : `${formatMoney(reportMetrics.inflow)}`}
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  Total das vendas, incluindo fiado
                </p>
              </div>

              <div className={`${simpleViewMode ? 'hidden' : ''} mt-4 pt-3 border-t border-border space-y-1 text-[11px] text-muted-foreground`}>
                <div className="flex justify-between">
                  <span>💵 Em dinheiro vivo:</span>
                  <strong className="text-muted-foreground">{formatMoney(reportMetrics.cashInflow)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>💳 No cartão / máq.:</span>
                  <strong className="text-muted-foreground">{formatMoney(reportMetrics.cardInflow)}</strong>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>🛒 Total de vendas:</span>
                  <strong className="text-emerald-700 dark:text-emerald-400 font-semibold">{reportMetrics.salesCount} {reportMetrics.salesCount === 1 ? 'venda' : 'vendas'}</strong>
                </div>
              </div>
            </div>

            {/* Card 2: Dinheiro que saiu */}
            <div className="bg-muted/40 border border-rose-500/30 hover:border-rose-500/50 transition-colors rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                    {v('reports.outflow')}
                  </span>
                  <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-700 dark:text-rose-400">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-foreground tracking-tight">
                  {reportMetrics.loading ? '...' : `${formatMoney(reportMetrics.outflow)}`}
                </div>
                <p className="text-xs text-rose-300/80 mt-1">
                  {languageMode === 'basic' ? 'O que você pagou em mercadorias' : 'Gastos em compras e reposições'}
                </p>
              </div>

              <div className={`${simpleViewMode ? 'hidden' : ''} mt-4 pt-3 border-t border-border space-y-1 text-[11px] text-muted-foreground`}>
                <div className="flex justify-between">
                  <span>📦 Reposições anotadas:</span>
                  <strong className="text-muted-foreground">{reportMetrics.purchasesCount} {reportMetrics.purchasesCount === 1 ? 'compra' : 'compras'}</strong>
                </div>
                <div className="flex justify-between">
                  <span>🚚 Pagos a fornecedores:</span>
                  <strong className="text-rose-300">{formatMoney(reportMetrics.outflow)}</strong>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>🏷️ Custo do estoque:</span>
                  <span className="text-muted-foreground">Reposição direta</span>
                </div>
              </div>
            </div>

            {/* Card 3: O que sobrou para você */}
            <div className={`bg-muted/40 border ${reportMetrics.balance >= 0 ? 'border-emerald-500/40 hover:border-emerald-500/60' : 'border-amber-500/40 hover:border-amber-500/60'} transition-colors rounded-xl p-4 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${reportMetrics.balance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-400'}`}>
                    {v('reports.balance')}
                  </span>
                  <div className={`p-1.5 rounded-lg ${reportMetrics.balance >= 0 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className={`text-2xl font-black tracking-tight ${reportMetrics.balance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-400'}`}>
                  {reportMetrics.loading ? '...' : `${formatMoney(reportMetrics.balance)}`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Diferença entre o total vendido e as compras registradas.
                </p>
              </div>

              <div className={`${simpleViewMode ? 'hidden' : ''} mt-4 pt-3 border-t border-border space-y-1 text-[11px] text-muted-foreground`}>
                <div className="flex justify-between">
                  <span>Conta rápida:</span>
                  <strong className="text-muted-foreground">Vendas − Compras − Taxas</strong>
                </div>
                <div className="flex justify-between">
                  <span>Status do caixa:</span>
                  <strong className={reportMetrics.balance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-400'}>
                    {reportMetrics.balance >= 0 ? 'Positivo (Sobra)' : 'Estoque reforçado'}
                  </strong>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Margem no bolso:</span>
                  <span className="text-muted-foreground">
                    {reportMetrics.inflow > 0 ? `${((reportMetrics.balance / reportMetrics.inflow) * 100).toFixed(0)}% retido` : '0%'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 4: Vendido pra receber depois (Caderneta / Fiado) */}
            <div className="bg-muted/40 border border-purple-500/30 hover:border-purple-500/50 transition-colors rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                    {languageMode === 'basic' ? 'Vendido pra receber depois' : v('reports.pending', 'Crédito Rotativo (Fiado)')}
                  </span>
                  <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-foreground tracking-tight">
                  {reportMetrics.loading ? '...' : `${formatMoney(reportMetrics.fiadoInflow)}`}
                </div>
                <p className="text-xs text-purple-700 dark:text-purple-300/80 mt-1">
                  {languageMode === 'basic' ? 'Compras anotadas na caderneta' : 'Vendas faturadas a prazo'}
                </p>
              </div>

              <div className={`${simpleViewMode ? 'hidden' : ''} mt-4 pt-3 border-t border-border space-y-1 text-[11px] text-muted-foreground`}>
                <div className="flex justify-between">
                  <span>📋 Caderneta ativa:</span>
                  <strong className="text-purple-700 dark:text-purple-300">Registrado no Fiado</strong>
                </div>
                <div className="flex justify-between">
                  <span>Quando entra:</span>
                  <strong className="text-muted-foreground">Ao receber do cliente</strong>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Acertos no Caixa:</span>
                  <span className="text-muted-foreground">Vira dinheiro na entrada</span>
                </div>
              </div>
            </div>
          </div>

          <p className="mb-5 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{v('reports.note')}</p>

          {/* AÇÕES DIRETAS DO RELATÓRIO */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground flex items-center gap-2 w-full sm:w-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Dados atualizados com Vendas, Compras e Caderneta</span>
            </div>
            
            <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
              <button 
                type="button"
                onClick={() => setIsExportPeriodModalOpen(true)}
                className="w-full sm:w-auto px-4 py-2.5 bg-purple-600/20 text-purple-700 dark:text-purple-300 border border-purple-500/40 rounded-xl flex items-center justify-center gap-2 hover:bg-purple-600/30 hover:text-foreground font-bold text-xs transition-colors shadow cursor-pointer"
                title="Abrir janela de exportação por intervalo personalizado de datas"
              >
                <Calendar className="w-4 h-4 text-purple-400" />
                <span>Exportar por Período...</span>
              </button>

              <button 
                type="button"
                onClick={handleExportDailySalesAndSafety}
                className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-600/30 hover:text-foreground font-bold text-xs transition-colors shadow cursor-pointer"
                title="Exportar planilha de consumo diário médio de cada produto e sugestão de estoque de segurança"
              >
                <Package className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Venda Diária & Estoque Segurança (.csv)</span>
              </button>

              <button 
                type="button"
                onClick={handleExportCSV}
                disabled={isExporting}
                className="w-full sm:w-auto px-4 py-2.5 bg-muted/40 text-muted-foreground border border-border rounded-xl flex items-center justify-center gap-2 hover:bg-muted hover:text-foreground font-bold text-sm disabled:opacity-50 transition-colors shadow cursor-pointer"
                title="Baixar planilha Excel (.csv) com abas de Compras, Vendas, Fiado e Estoque de Segurança"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                {period === 'personalizado'
                  ? `Baixar Planilha (${format(parseISO(startDate), 'dd/MM')} a ${format(parseISO(endDate), 'dd/MM')})`
                  : (languageMode === 'basic' ? 'Baixar Planilha (Excel / CSV)' : 'Baixar Planilha Excel/CSV Completa')}
              </button>

              <button 
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-500 font-bold text-sm disabled:opacity-50 transition-colors shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <DownloadCloud className="w-4 h-4"/> {isExporting ? 'Processando...' : 'Google Sheets'}
              </button>
            </div>
          </div>
        </div>

        {/* FILTROS DETALHADOS (Expandíveis com toggle) */}
        {showAdvancedFilters && (
          <div className="mb-6 p-5 rounded-xl bg-muted/40/80 border border-border animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-bold text-foreground">Filtros Detalhados de Consulta e Exportação</h4>
              </div>
              <span className="text-xs text-muted-foreground">Ajuste os parâmetros conforme sua necessidade</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Período */}
              <div className="bg-surface border border-border rounded-xl p-3.5 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-foreground">Período de Análise</h3>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">Escolha o recorte de tempo</p>
                <div className="mt-auto">
                   <select 
                     value={period} 
                     onChange={e => setPeriod(e.target.value as any)}
                     className="w-full bg-muted/40 border border-border text-muted-foreground text-xs rounded-lg p-2 focus:border-purple-500 outline-none"
                   >
                     <option value="hoje">Hoje</option>
                     <option value="semana">Esta Semana</option>
                     <option value="mes">Este Mês</option>
                     <option value="personalizado">Data específica...</option>
                   </select>
                </div>
              </div>

              {/* Card 2: Data Inicial */}
              <div className={`bg-surface border border-border rounded-xl p-3.5 flex flex-col transition-opacity ${period === 'personalizado' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-foreground">Data Inicial</h3>
                </div>
                 <p className="text-[11px] text-muted-foreground mb-3">A partir de</p>
                 <div className="mt-auto">
                   <input 
                     type="date"
                     value={startDate}
                     onChange={e => setStartDate(e.target.value)}
                     className="w-full bg-muted/40 border border-border text-muted-foreground text-xs rounded-lg p-2 focus:border-blue-500 outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                   />
                 </div>
              </div>

              {/* Card 3: Data Final */}
              <div className={`bg-surface border border-border rounded-xl p-3.5 flex flex-col transition-opacity ${period === 'personalizado' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-foreground">Data Final</h3>
                </div>
                 <p className="text-[11px] text-muted-foreground mb-3">Até</p>
                 <div className="mt-auto">
                   <input 
                     type="date"
                     value={endDate}
                     onChange={e => setEndDate(e.target.value)}
                     className="w-full bg-muted/40 border border-border text-muted-foreground text-xs rounded-lg p-2 focus:border-blue-500 outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                   />
                 </div>
              </div>
              
              {/* Card 4: Tipo de Venda */}
              <div className="bg-surface border border-border rounded-xl p-3.5 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <h3 className="text-xs font-bold text-foreground">Forma de Pagamento</h3>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">Filtrar por meio de recebimento</p>
                <div className="mt-auto">
                   <select 
                     value={saleType} 
                     onChange={e => setSaleType(e.target.value as any)}
                     className="w-full bg-muted/40 border border-border text-muted-foreground text-xs rounded-lg p-2 focus:border-emerald-500 outline-none"
                   >
                     <option value="todas">Todas as Formas</option>
                     <option value="cash">Apenas Dinheiro Vivo</option>
                     <option value="card">{isBrazil ? 'Cartão e Pix' : 'Cartão'}</option>
                     <option value="fiado">Apenas Fiado / Caderneta</option>
                   </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Banner do Módulo de Compras no Relatório */}
        <div className="mb-6 p-4 rounded-xl bg-purple-950/30 border border-purple-800/40 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-900/60 text-purple-700 dark:text-purple-300">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">Módulo de Compras integrado ao Relatório</span>
                <span className="text-[10px] font-bold uppercase bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-800/60">Novo</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {languageMode === 'basic' 
                  ? 'Tudo o que você gasta reabastecendo os produtos da loja é somado automaticamente no relatório.'
                  : 'Todas as reposições de estoque e despesas com fornecedores são extraídas automaticamente junto com as Vendas e Fiado.'}
              </p>
            </div>
          </div>
        </div>

        {exportMessage && (
          <div className={`mt-6 p-4 rounded-xl flex gap-3 text-sm border ${exportMessage.includes('Erro') ? 'bg-red-900/20 text-red-400 border-red-900/50' : 'bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-900/50'}`}>
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{exportMessage}</span>
          </div>
        )}
      </div>

      <details key={`advanced-${simpleViewMode}`} open={!simpleViewMode} className="rounded-2xl border border-border bg-surface p-4">
        <summary className="cursor-pointer py-2 font-semibold text-foreground">{v('settings.advanced')}</summary>
        <div className="mt-4 space-y-5">
      {/* Rotina de Backup Diário e Segurança dos Dados */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 text-gray-900 font-bold text-lg mb-1">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
              <span>Rotina de Backup Diário (Supabase & Nuvem)</span>
            </div>
            <p className="text-sm text-gray-500 max-w-2xl">
              Seus dados do comércio (estoque, fiados, vendas, clientes e configurações) são verificados e salvaguardados diariamente para proteção contra perdas acidentais.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunManualBackup}
            disabled={isBackingUp}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-all text-sm whitespace-nowrap flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Database className="w-4 h-4" />
            {isBackingUp ? 'Gerando Backup...' : 'Fazer Backup Agora'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-4">
            <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Status da Rotina
            </div>
            <div className="text-sm font-semibold text-emerald-950">Ativa (1x ao dia)</div>
            <p className="text-xs text-emerald-700 mt-1">Execução programada a cada 24 horas</p>
          </div>

          <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4">
            <div className="flex items-center gap-2 text-blue-800 text-xs font-bold uppercase tracking-wider mb-1">
              <Clock className="w-4 h-4 text-blue-600" />
              Último Backup
            </div>
            <div className="text-sm font-semibold text-blue-950">
              {lastBackupTime ? format(new Date(lastBackupTime), "dd/MM/yyyy 'às' HH:mm") : 'Executado ao abrir o sistema'}
            </div>
            <p className="text-xs text-blue-700 mt-1">Sincronizado na nuvem</p>
          </div>

          <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-4">
            <div className="flex items-center gap-2 text-purple-800 text-xs font-bold uppercase tracking-wider mb-1">
              <Database className="w-4 h-4 text-purple-600" />
              Destinos de Segurança
            </div>
            <div className="text-sm font-semibold text-purple-950">Supabase + Arquivo JSON</div>
            <p className="text-xs text-purple-700 mt-1">Compatível com restauração</p>
          </div>
        </div>

        {backupSuccessMessage && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{backupSuccessMessage}</span>
          </div>
        )}
      </div>

      {/* Integração com Google Sheets via Webhook (Google Apps Script) */}
      <div className="bg-white dark:bg-[#1e1e1e] p-6 rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-900/40">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2.5 text-foreground font-bold text-lg mb-1">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <span>Google Sheets (Webhook Google Apps Script)</span>
              <span className={`text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                sheetsEnabled 
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-muted text-muted-foreground border-border'
              }`}>
                {sheetsEnabled ? 'Ativo' : 'Pausado'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Ao registrar uma venda ou movimentação, os dados são enviados automaticamente para a sua planilha Google Sheets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestSheetsWebhook}
              disabled={sheetsTesting || !sheetsEnabled}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-all text-xs whitespace-nowrap flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${sheetsTesting ? 'animate-spin' : ''}`} />
              {sheetsTesting ? 'Testando Webhook...' : 'Testar Envio para a Planilha'}
            </button>
          </div>
        </div>

        {/* Feedback do Teste */}
        {sheetsTestResult && (
          <div className={`mt-4 p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            sheetsTestResult.success
              ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200'
              : 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-200'
          }`}>
            {sheetsTestResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{sheetsTestResult.message}</span>
          </div>
        )}

        {/* URL do Webhook configurada */}
        <div className="mt-4 p-4 rounded-xl bg-muted/40 border border-border space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-emerald-600" />
              <span>URL DO WEBHOOK APPS SCRIPT (MÉTODO POST)</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground font-medium">
              <input
                type="checkbox"
                checked={sheetsEnabled}
                onChange={(e) => handleToggleSheetsEnabled(e.target.checked)}
                className="rounded border-border text-emerald-600 focus:ring-emerald-500 w-4 h-4"
              />
              <span>Ativar sincronização automática com a planilha</span>
            </label>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={sheetsWebhookUrl}
              onChange={(e) => handleSaveSheetsWebhookUrl(e.target.value)}
              onBlur={() => setGoogleSheetsWebhookUrl(sheetsWebhookUrl)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="flex-1 px-3 py-2 text-xs font-mono bg-surface border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-foreground"
            />
            {sheetsWebhookUrl !== GOOGLE_SHEETS_WEBHOOK_URL && (
              <button
                type="button"
                onClick={() => { handleSaveSheetsWebhookUrl(''); setGoogleSheetsWebhookUrl(''); }}
                className="px-3 py-2 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-xl border border-border transition-colors font-medium cursor-pointer"
                title="Restaurar URL padrão"
              >
                Padrão
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sempre que uma venda ou movimentação for salva, este endpoint recebe um JSON completo com data, tipo, produto, quantidade, valor, operador e array <code className="text-foreground font-mono">linha</code> formatado.
          </p>
        </div>

        {/* Botões de Ação Auxiliares: Código do Apps Script e Histórico de Envios */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => setIsAppsScriptCodeOpen(!isAppsScriptCodeOpen)}
            className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-lg border border-border transition-colors font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isAppsScriptCodeOpen ? 'Ocultar Código do Apps Script' : 'Ver Código do Google Apps Script'}</span>
            {isAppsScriptCodeOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsSheetsLogsOpen(!isSheetsLogsOpen)}
            className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-lg border border-border transition-colors font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>{isSheetsLogsOpen ? 'Ocultar Histórico de Envios' : `Ver Histórico de Envios (${sheetsLogs.length})`}</span>
            {isSheetsLogsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Bloco de Código do Apps Script (Pronto para copiar) */}
        {isAppsScriptCodeOpen && (
          <div className="mt-4 p-4 rounded-xl bg-muted/30 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">
                Script doPost(e) para a sua Planilha (Google Sheets)
              </span>
              <button
                type="button"
                onClick={handleCopyAppsScriptCode}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                {copiedAppsScript ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Código</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              No seu Google Sheets, abra <strong>Extensões &gt; Apps Script</strong>, substitua o conteúdo pelo código abaixo, clique em <strong>Implantar &gt; Nova Implantação &gt; App da Web</strong>, configure <em>Executar como: Eu</em> e <em>Quem pode acessar: Qualquer pessoa</em>, e copie a URL gerada:
            </p>

            <pre className="font-mono text-[11px] bg-black/85 text-emerald-400 p-3 rounded-lg border border-border overflow-x-auto leading-relaxed select-all">
{`function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Insere linha: [Data/Hora, Tipo, Produto, Quantidade, Valor R$, Pagamento, Cliente, Detalhes]
    sheet.appendRow([
      data.data || new Date().toLocaleString("pt-BR"),
      (data.tipo || "VENDA").toUpperCase(),
      data.produto || "-",
      data.quantidade || 1,
      data.valor || 0,
      data.forma_pagamento || "-",
      data.cliente || "-",
      data.descricao || "-"
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", received: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`}
            </pre>
          </div>
        )}

        {/* Histórico dos Últimos Envios via Webhook */}
        {isSheetsLogsOpen && (
          <div className="mt-4 p-4 rounded-xl bg-muted/30 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">
                Últimos Envios Transmitidos para a Planilha
              </span>
              {sheetsLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearGoogleSheetsLogs();
                    setSheetsLogs([]);
                  }}
                  className="text-xs text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                >
                  Limpar Histórico
                </button>
              )}
            </div>

            {sheetsLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                Nenhum registro transmitido ainda. Registre uma venda ou faça um teste de envio acima.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {sheetsLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-2 rounded-lg bg-surface border border-border text-xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        log.status === 'enviado' ? 'bg-emerald-500' : 'bg-red-500'
                      }`} />
                      <span className="font-semibold uppercase text-[11px] text-foreground">
                        {log.tipo}
                      </span>
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {log.produto}
                      </span>
                      {log.valor > 0 && (
                        <span className="font-mono text-[11px] text-emerald-600 font-bold">
                          {formatMoney(log.valor)}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

        </div>
      </details>

      {/* Seção de Feedback e Sugestões do Usuário */}
      <div className="mb-6">
        <FeedbackSection 
          storeName={storeName || settings?.storeName}
          defaultContact={phone || settings?.phone}
        />
      </div>

      {/* Danger Zone: Exclusão de Conta */}
      <div className="bg-[#13141f] border border-red-900/30 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-red-400 font-bold text-base mb-1">
              <Trash2 className="w-5 h-5 text-red-500" />
              <span>Zona de Perigo — Exclusão de Conta</span>
            </div>
            <p className="text-sm text-gray-400 max-w-xl">
              Excluir permanentemente sua conta, produtos cadastrados, histórico de vendas, clientes, fiados e dados da loja. Esta ação é irreversível.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmationText('');
              setDeleteError('');
              setShowDeleteModal(true);
            }}
            className="px-5 py-2.5 bg-red-600/10 text-red-400 hover:bg-red-600 hover:text-white border border-red-600/30 rounded-xl font-medium transition-all text-sm whitespace-nowrap flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            Excluir Minha Conta
          </button>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão de Conta */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#181926] border border-red-900/50 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
              disabled={isDeletingAccount}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Tem certeza absoluta?</h3>
                <p className="text-xs text-red-400 font-medium">Ação irreversível</p>
              </div>
            </div>

            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Todos os seus <strong>produtos em estoque</strong>, <strong>vendas realizadas</strong>, <strong>clientes cadastrados</strong>, <strong>dívidas de fiado</strong> e dados do seu comércio serão permanentemente apagados da nuvem.
            </p>

            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">
                Para confirmar, digite <span className="font-bold text-white tracking-wider">EXCLUIR</span> no campo abaixo:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="EXCLUIR"
                disabled={isDeletingAccount}
                className="w-full bg-[#11121c] border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none uppercase"
              />
            </div>

            {deleteError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800/50 text-xs text-red-300">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingAccount}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount || deleteConfirmationText.trim().toUpperCase() !== 'EXCLUIR'}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isDeletingAccount ? 'Excluindo todos os dados...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exportação por Período Personalizado */}
      <ExportPeriodModal
        isOpen={isExportPeriodModalOpen}
        onClose={() => setIsExportPeriodModalOpen(false)}
        defaultStartDate={startDate}
        defaultEndDate={endDate}
      />
    </div>
  );
}

import { calculatePayment } from '../lib/paymentFees';
import { formatProductStock } from '../lib/productUnits';
import { rankProductsBySales } from '../lib/productSalesRanking';
import { CartDrawer, type CartItem } from '../components/CartDrawer';
import { showToast, showActionError } from '../lib/actionFeedback';
import { getCigaretteFormats, getPackageUnits, calculateStockUpdates } from '../lib/productUnits';
import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  subscribeProducts, getProductSalesTotals,
  subscribeCustomers, 
  addCustomer,
  recordSale, 
  subscribeTodaySales, 
  saveCashClosure, 
  subscribeCashClosures, 
  subscribeSettings 
} from '../lib/api';
import { Product, Customer, Sale, CashClosure, Settings } from '../types';
import { getAllCategories } from '../lib/categories';
import { 
  Search, 
  ShoppingCart, 
  X, 
  Check, 
  Lock, 
  Printer, 
  Calendar, 
  History, 
  DollarSign, 
  AlertCircle, 
  CheckCircle2, 
  TrendingDown, 
  FileText,
  Clock,
  Package,
  Flame,
  Sparkles,
  UserPlus,
  Users,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { usePreferences } from '../lib/preferencesContext';
import { PocketTip } from '../components/PocketTip';
import { calculateExpirationStatus } from '../lib/promoUtils';
import { useEmployee } from '../lib/employeeContext';

export default function POS() {
  const { v, entityName, languageMode, isBasicMode, simpleViewMode } = usePreferences();
  const { currentEmployee, openSwitchModal } = useEmployee();
  const [products, setProducts] = useState<Product[]>([]);
  const [salesTotals, setSalesTotals] = useState<Record<string, number>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [cashClosures, setCashClosures] = useState<CashClosure[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showDetailedCardFees, setShowDetailedCardFees] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartRef = useRef<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  
  // Checkout states
  const [paymentType, setPaymentType] = useState<'cash'|'card'|'fiado'>('cash');
  const [cardMethod, setCardMethod] = useState<'debit'|'credit'|'pix'|'pix_machine'|'voucher'>('debit');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [amountReceived, setAmountReceived] = useState<number>(0);

  // New customer inline creation states inside POS Checkout
  const [isCreatingNewCustomer, setIsCreatingNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerPreviousDebt, setNewCustomerPreviousDebt] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');
  const [isSubmittingNewCustomer, setIsSubmittingNewCustomer] = useState(false);
  const [newlyCreatedCustomerName, setNewlyCreatedCustomerName] = useState<string | null>(null);

  // Cash closure (Fechar Caixa) states
  const [isCashClosureOpen, setIsCashClosureOpen] = useState(false);
  const [closureTab, setClosureTab] = useState<'close' | 'history'>('close');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [withdrawals, setWithdrawals] = useState<number>(0);
  const [countedCash, setCountedCash] = useState<string>('');
  const [closureNotes, setClosureNotes] = useState<string>('');
  const [isSavingClosure, setIsSavingClosure] = useState(false);
  const [closureSuccessMsg, setClosureSuccessMsg] = useState('');

  useEffect(() => {
    const unsubP = subscribeProducts(setProducts);
    const unsubC = subscribeCustomers(setCustomers);
    const unsubS = subscribeTodaySales(setTodaySales);
    const unsubClosures = subscribeCashClosures(setCashClosures);
    const unsubSettings = subscribeSettings(setSettings);
    return () => { 
      unsubP(); 
      unsubC(); 
      unsubS();
      unsubClosures();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (!products.length) { setSalesTotals({}); return; }
    const controller = new AbortController();
    let active = true;
    void getProductSalesTotals(products, controller.signal).then(totals => {
      if (active) setSalesTotals(previous => Object.keys(previous).length === Object.keys(totals).length && Object.keys(totals).every(id => previous[id] === totals[id]) ? previous : totals);
    }).catch(() => { /* Optional ordering must not interrupt sales. */ });
    return () => { active = false; controller.abort(); };
  }, [products, todaySales]);

  const categories = useMemo(() => {
    return ['Todas', ...getAllCategories(products.map(p => p.category))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return rankProductsBySales(products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === 'Todas' || p.category === selectedCategory;
      return matchSearch && matchCat;
    }), salesTotals);
  }, [products, search, selectedCategory, salesTotals]);

  const addToCart = (product: Product, format: string, price: number, stockDeduction: number) => {
    if (checkoutInProgressRef.current) return;
    const current = cartRef.current;
    const existing = current.find(i => i.product.id === product.id && i.format === format);
    const nextCart = existing
      ? current.map(i => i === existing ? { ...i, quantity: i.quantity + 1 } : i)
      : [...current, { product, format, quantity: 1, price, stockDeduction }];
    try {
      calculateStockUpdates(nextCart, products);
      cartRef.current = nextCart;
      setCart(nextCart);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível adicionar o produto.');
    }
  };

  const changeCartQuantity = (index: number, delta: number) => {
    if (checkoutInProgressRef.current) return;
    const next = cartRef.current.map((item, i) => i === index ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0);
    try { calculateStockUpdates(next, products); cartRef.current = next; setCart(next); }
    catch (error) { showActionError(error, error instanceof Error ? error.message : 'Estoque insuficiente.'); }
  };
  const removeFromCart = (index: number) => {
    if (checkoutInProgressRef.current) return;
    const next = cartRef.current.filter((_, i) => i !== index);
    cartRef.current = next; setCart(next);
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Card Fee logic
  const isCardFeeEnabled = settings?.enableCardFees ?? false;
  const payment = useMemo(() => calculatePayment(cartTotal, paymentType === 'card' ? cardMethod : paymentType, settings), [cartTotal, paymentType, cardMethod, settings]);
  const activeRate = payment.feeRate;
  const finalTotal = payment.total;
  const estimatedDeduction = payment.feeAmount;
  const isSurchargeMode = payment.surchargeAmount > 0;

  const change = Math.max(0, amountReceived - finalTotal);

  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const checkoutInProgressRef = useRef(false);

  const handleCheckout = async () => {
    if (checkoutInProgressRef.current) return;
    checkoutInProgressRef.current = true;
    setIsCompletingSale(true);
    try {
      await completeCheckout();
    } catch (error) {
      showActionError(error, 'Não foi possível confirmar a venda. Confira os dados antes de repetir.');
    } finally {
      checkoutInProgressRef.current = false;
      setIsCompletingSale(false);
    }
  };

  const completeCheckout = async () => {
    if (cart.length === 0) return;

    let productsToUpdate: { id: string; newStock: number }[];
    try {
      for (const item of cart) {
        const latest = products.find(product => product.id === item.product.id);
        if (latest?.type === 'cigarro' && !getCigaretteFormats(latest).some(format => format.units === item.stockDeduction && format.price === item.price)) {
          throw new Error(`O formato ou preço de ${latest.name} foi alterado. Remova o item e selecione novamente.`);
        }
      }
      // Use the latest product balances and sum all formats of the same product.
      productsToUpdate = calculateStockUpdates(cart, products);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível validar o estoque.');
      return;
    }

    let finalCustomerId = selectedCustomerId;

    if (paymentType === 'fiado') {
      if (isCreatingNewCustomer && newCustomerName.trim()) {
        try {
          setIsSubmittingNewCustomer(true);
          const prevDebt = Number(newCustomerPreviousDebt) || 0;
          finalCustomerId = await addCustomer({
            name: newCustomerName.trim(),
            phone: newCustomerPhone.trim() || undefined,
            previousDebt: prevDebt,
            totalDebt: prevDebt,
            notes: newCustomerNotes.trim() || undefined
          });
          setSelectedCustomerId(finalCustomerId);
          setNewlyCreatedCustomerName(newCustomerName.trim());
        } catch (err: any) {
          showActionError(err, 'Não foi possível cadastrar o cliente. Confira os dados antes de repetir.');
          setIsSubmittingNewCustomer(false);
          return;
        } finally {
          setIsSubmittingNewCustomer(false);
        }
      } else if (!finalCustomerId) {
        alert("Selecione quem está comprando ou cadastre um novo cliente para o fiado.");
        return;
      }
    }

    const items = cart.map(i => ({
      productId: i.product.id!,
      name: i.product.name,
      format: i.format,
      stockDeduction: i.stockDeduction,
      quantity: i.quantity,
      price: i.price,
      unitCost: i.product.unitCost * i.stockDeduction,
    }));

    try {
      await recordSale(
        {
          total: finalTotal,
          type: paymentType,
          paymentMethod: paymentType === 'card' ? cardMethod : paymentType,
          customerId: finalCustomerId,
          employeeId: currentEmployee?.id || 'owner',
          employeeName: currentEmployee?.name || 'Proprietário'
        },
        items,
        productsToUpdate
      );
      showToast('✓ Venda concluída com sucesso!');
    } finally {
      setIsCheckoutOpen(false);
    }

    cartRef.current = [];
    setCart([]);
    setIsCheckoutOpen(false);
    setPaymentType('cash');
    setCardMethod('debit');
    setSelectedCustomerId('');
    setIsCreatingNewCustomer(false);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerPreviousDebt('');
    setNewCustomerNotes('');
    setAmountReceived(0);
    setNewlyCreatedCustomerName(null);
  };

  const handleQuickCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;
    setIsSubmittingNewCustomer(true);
    try {
      const prevDebt = Number(newCustomerPreviousDebt) || 0;
      const createdId = await addCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
        previousDebt: prevDebt,
        totalDebt: prevDebt,
        notes: newCustomerNotes.trim() || undefined
      });

      if (createdId) {
        setSelectedCustomerId(createdId);
        setNewlyCreatedCustomerName(newCustomerName.trim());
        showToast('✓ Cliente cadastrado com sucesso!');
        setIsCreatingNewCustomer(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setNewCustomerPreviousDebt('');
        setNewCustomerNotes('');
      }
    } catch (err: any) {
      showActionError(err, 'Não foi possível cadastrar o cliente. Confira os dados antes de repetir.');
    } finally {
      setIsCreatingNewCustomer(false);
      setIsSubmittingNewCustomer(false);
    }
  };

  const totalSalesToday = useMemo(() => todaySales.reduce((sum, s) => sum + s.total, 0), [todaySales]);
  const cashSalesToday = useMemo(() => todaySales.filter(s => s.type === 'cash').reduce((sum, s) => sum + s.total, 0), [todaySales]);
  const cardSalesToday = useMemo(() => todaySales.filter(s => s.type === 'card').reduce((sum, s) => sum + s.total, 0), [todaySales]);
  const fiadoSalesToday = useMemo(() => todaySales.filter(s => s.type === 'fiado').reduce((sum, s) => sum + s.total, 0), [todaySales]);

  const expectedCash = useMemo(() => {
    const ob = Number(openingBalance) || 0;
    const w = Number(withdrawals) || 0;
    return Number((ob + cashSalesToday - w).toFixed(2));
  }, [openingBalance, cashSalesToday, withdrawals]);

  const diff = useMemo(() => {
    if (countedCash === '') return null;
    const c = Number(countedCash) || 0;
    return Number((c - expectedCash).toFixed(2));
  }, [countedCash, expectedCash]);

  const handleSaveClosure = async () => {
    setIsSavingClosure(true);
    try {
      const c = countedCash === '' ? expectedCash : (Number(countedCash) || 0);
      const d = Number((c - expectedCash).toFixed(2));
      await saveCashClosure({
        date: format(new Date(), 'yyyy-MM-dd'),
        closedAt: Date.now(),
        totalSales: totalSalesToday,
        totalCash: cashSalesToday,
        totalCard: cardSalesToday,
        totalFiado: fiadoSalesToday,
        salesCount: todaySales.length,
        openingBalance: Number(openingBalance) || 0,
        withdrawals: Number(withdrawals) || 0,
        expectedCash,
        countedCash: c,
        difference: d,
        notes: closureNotes.trim()
      });
      showToast('✓ Fechamento de caixa salvo com sucesso!');
      setTimeout(() => setClosureSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
      showActionError(err, 'Não foi possível confirmar o fechamento. Confira os dados antes de repetir.');
    } finally {
      setIsCashClosureOpen(false);
      setIsSavingClosure(false);
    }
  };

  const handlePrintClosure = () => {
    const storeName = settings?.storeName || 'Mercearia & Conveniência';
    const nowStr = format(new Date(), 'dd/MM/yyyy HH:mm:ss');
    const c = countedCash === '' ? expectedCash : (Number(countedCash) || 0);
    const d = Number((c - expectedCash).toFixed(2));

    const printWin = window.open('', '_blank', 'width=380,height=600');
    if (!printWin) return;
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fechamento de Caixa - ${nowStr}</title>
          <style>
            body { font-family: monospace; font-size: 12px; padding: 12px; margin: 0; color: #000; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .line { border-bottom: 1px dashed #000; margin: 8px 0; }
            .flex { display: flex; justify-content: space-between; }
            .mt { margin-top: 6px; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 14px;">${storeName}</div>
          <div class="center">COMPROVANTE DE FECHAMENTO DE CAIXA</div>
          <div class="center">${nowStr}</div>
          <div class="line"></div>
          <div class="bold">RESUMO DE VENDAS DO DIA:</div>
          <div class="flex mt"><span>Qtd. de Vendas:</span><span class="bold">${todaySales.length}</span></div>
          <div class="flex"><span>Vendas em Dinheiro:</span><span class="bold">R$ ${cashSalesToday.toFixed(2)}</span></div>
          <div class="flex"><span>Cartão e Pix:</span><span class="bold">R$ ${cardSalesToday.toFixed(2)}</span></div>
          <div class="flex"><span>Vendas no Fiado:</span><span class="bold">R$ ${fiadoSalesToday.toFixed(2)}</span></div>
          <div class="flex bold" style="font-size: 13px; margin-top: 4px;"><span>TOTAL VENDIDO:</span><span>R$ ${totalSalesToday.toFixed(2)}</span></div>
          <div class="line"></div>
          <div class="bold">CONFERÊNCIA DE GAVETA (DINHEIRO):</div>
          <div class="flex mt"><span>(+) Fundo Inicial (Troco):</span><span>R$ ${(Number(openingBalance) || 0).toFixed(2)}</span></div>
          <div class="flex"><span>(+) Entradas em Dinheiro:</span><span>R$ ${cashSalesToday.toFixed(2)}</span></div>
          <div class="flex"><span>(-) Retiradas / Sangrias:</span><span>R$ ${(Number(withdrawals) || 0).toFixed(2)}</span></div>
          <div class="flex bold mt"><span>(=) Dinheiro Esperado:</span><span>R$ ${expectedCash.toFixed(2)}</span></div>
          <div class="flex bold"><span>Dinheiro Informado:</span><span>R$ ${c.toFixed(2)}</span></div>
          <div class="flex bold" style="font-size: 13px; margin-top: 4px;">
            <span>Diferença:</span>
            <span>${d === 0 ? 'R$ 0.00 (Exato)' : d > 0 ? `+ R$ ${d.toFixed(2)} (Sobra)` : `- R$ ${Math.abs(d).toFixed(2)} (Falta)`}</span>
          </div>
          ${closureNotes ? `<div class="mt"><strong>Obs:</strong> ${closureNotes}</div>` : ''}
          <div class="line"></div>
          <div style="margin-top: 40px; border-top: 1px solid #000; text-align: center; padding-top: 5px;">
            Assinatura do Operador de Caixa
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <div className="space-y-4">
      {/* Pocket Tip: Guia do Caixa em 2 Passos */}
      <PocketTip
        id="pos-guide"
        badgeText="Dica de Bolso"
        title={`Como Usar o ${v('pos.title', 'Caixa')} em 2 Passos`}
        subtitle="Passo a passo simples para registrar vendas no balcão e gerenciar o dinheiro da gaveta."
        helpfulNote="Dica: se o cliente levar mais de uma unidade, basta clicar no item várias vezes ou alterar a quantidade no carrinho!"
        sections={[
          {
            id: 'registrar-venda',
            badge: 'Vender no Balcão',
            title: 'Como registrar uma nova venda',
            subtitle: 'Toda vez que um cliente for comprar itens na sua loja:',
            step1: {
              label: `1. Toque no ${entityName().toLowerCase()} para colocar no carrinho`,
              description: 'Localize o produto na lista ou pela busca. Ao clicar nele, ele entra automaticamente no carrinho ao lado.'
            },
            step2: {
              label: '2. Clique em "Cobrar" e confirme o pagamento',
              description: 'Aperte o botão colorido no fim do carrinho. Escolha se o cliente pagou em Dinheiro, Cartão ou Fiado e conclua!'
            },
            actionButton: {
              label: cart.length > 0 
                ? `Cobrar Venda Atual (R$ ${cartTotal.toFixed(2)})` 
                : 'Escolha um item na lista para vender',
              onClick: () => {
                if (cart.length > 0) {
                  setIsCheckoutOpen(true);
                } else {
                  const el = document.querySelector('input');
                  if (el) el.focus();
                }
              },
              icon: <ShoppingCart className="w-4 h-4" />
            }
          },
          {
            id: 'entrada-dinheiro',
            badge: 'Gaveta & Troco',
            title: 'Como registrar entrada de dinheiro ou conferir',
            subtitle: 'Use para registrar troco inicial na gaveta ou conferir o caixa:',
            step1: {
              label: '1. Clique no botão "Fechar / Conferir Caixa"',
              description: 'Aperte o botão no topo da tela (com o ícone de cadeado) para abrir a ficha de controle do caixa.'
            },
            step2: {
              label: '2. Digite o valor do troco ou dinheiro contado',
              description: 'Informe quanto dinheiro você colocou na gaveta ou contou no fim do dia. O sistema calcula a sobra ou falta na hora!'
            },
            actionButton: {
              label: 'Conferir / Abrir Caixa',
              onClick: () => setIsCashClosureOpen(true),
              icon: <Lock className="w-4 h-4" />
            }
          }
        ]}
      />

      <div className="flex flex-col lg:flex-row h-full gap-6">
      {/* Products Section */}
      <div className="min-w-0 flex-1 flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <div className="relative min-w-0 flex-1 sm:min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder={`Buscar ${entityName().toLowerCase()} por nome...`} 
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            />
          </div>
          <select 
            value={selectedCategory} 
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border bg-surface text-foreground shadow-xs cursor-pointer text-sm"
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setIsCashClosureOpen(true)}
            className="px-3.5 py-2.5 bg-palette-1 text-primary hover:bg-palette-1/80 border border-primary/30 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs shrink-0 text-sm"
          >
            <Lock className="w-4 h-4" />
            <span>Fechar Caixa</span>
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold">
              {todaySales.length}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 overflow-y-auto pb-24">
          {Object.keys(salesTotals).length > 0 && <p className="col-span-full text-xs text-muted-foreground">{v('pos.salesOrder', 'Mais vendidos primeiro')}</p>}
          {filteredProducts.map(p => (
            <div key={p.id} className="bg-surface border border-border rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
              <div>
                {/* Imagem Exata do Produto no Caixa */}
                <div className="w-full h-28 mb-3 rounded-xl overflow-hidden bg-palette-1/40 border border-border/80 flex items-center justify-center shrink-0">
                  {p.imageUrl ? (
                    <img 
                      src={p.imageUrl} 
                      alt={p.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-primary/40 p-2">
                      <Package className="w-8 h-8 mb-1" />
                      <span className="text-[10px] font-medium text-muted-foreground truncate max-w-full">{p.category}</span>
                    </div>
                  )}
                </div>

                <h3 className="font-semibold text-foreground leading-tight text-sm line-clamp-2">{p.name}</h3>
                <div className="mt-1 flex items-center justify-between gap-1 flex-wrap">
                  <span className="text-[10px] font-semibold text-primary bg-palette-1 px-1.5 py-0.5 rounded">
                    {p.category}
                  </span>
                  {p.type === 'cigarro' ? <span className="text-[11px] text-muted-foreground">{formatProductStock(p)}</span> : getPackageUnits(p) > 1 ? (
                    <span className="text-[11px] text-muted-foreground font-medium">
                      📦 {Math.floor(p.stock / getPackageUnits(p))} {p.purchaseForm === 'fardo' ? 'fardos' : 'pac.'} + {Number((p.stock % getPackageUnits(p)).toFixed(2))} un.
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{p.stock} un.</span>
                  )}
                </div>

                {/* Badges de Validade e Promoção no PDV */}
                {(p.expirationDate || (p.hasPromoSuggestion && p.promoPrice)) && (
                  <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                    {p.expirationDate && (() => {
                      const expStatus = calculateExpirationStatus(p.expirationDate);
                      if (!expStatus.isExpiringSoon && !expStatus.isExpired) return null;
                      return (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${expStatus.badgeClass}`}>
                          <Clock className="w-2.5 h-2.5" />
                          <span>{expStatus.statusText}</span>
                        </span>
                      );
                    })()}
                    {p.hasPromoSuggestion && p.promoPrice && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">
                        <Flame className="w-2.5 h-2.5" />
                        <span>Promo</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="mt-3">
                {p.type === 'cigarro' ? (
                  <div className="flex flex-col gap-1.5">
                    {getCigaretteFormats(p).length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum formato habilitado. Configure os preços no Estoque.</p>
                    )}
                    {getCigaretteFormats(p).map(option => {
                      const reserved = cart.filter(item => item.product.id === p.id)
                        .reduce((total, item) => total + item.quantity * item.stockDeduction, 0);
                      return (
                        <button
                          key={option.label}
                          onClick={() => addToCart(p, option.label, option.price, option.units)}
                          disabled={Math.round((p.stock - reserved) * 20) < Math.round(option.units * 20)}
                          className="w-full text-left text-xs px-2.5 py-1.5 bg-muted/60 hover:bg-palette-1 border border-border hover:border-primary/40 rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          <span className="font-semibold text-foreground">{option.label}</span>
                          <span className="font-bold text-primary">R$ {option.price.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : getPackageUnits(p) > 1 ? (
                  <div className="flex flex-col gap-1.5">
                    {/* Venda de Unidade Avulsa - Deduz APENAS 1 unidade no estoque */}
                    <button 
                      onClick={() => addToCart(p, 'Unidade Avulsa', p.basePrice, 1)} 
                      disabled={p.stock < 1}
                      className="w-full text-left text-xs px-2.5 py-2 bg-muted/60 hover:bg-palette-1 border border-border hover:border-primary/40 rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <div>
                        <span className="font-semibold text-foreground block">🔹 Unidade Avulsa</span>
                        <span className="text-[10px] text-muted-foreground">baixa 1 un.</span>
                      </div>
                      <span className="font-bold text-primary text-sm">R$ {p.basePrice.toFixed(2)}</span>
                    </button>

                    {/* Venda de Fardo/Pacote Fechado - Deduz unitsPerPackage unidades no estoque */}
                    {(() => {
                      const fardoPrice = p.pricePackage !== undefined ? p.pricePackage : Number((p.basePrice * p.unitsPerPackage).toFixed(2));
                      return (
                        <button 
                          onClick={() => addToCart(p, `${p.purchaseForm === 'fardo' ? 'Fardo' : 'Pacote'} (${p.unitsPerPackage} un.)`, fardoPrice, p.unitsPerPackage)} 
                          disabled={p.stock < p.unitsPerPackage}
                          className="w-full text-left text-xs px-2.5 py-2 bg-palette-1 hover:opacity-90 border border-primary/30 rounded-lg flex items-center justify-between transition-opacity disabled:opacity-40 cursor-pointer"
                        >
                          <div>
                            <span className="font-bold text-primary block">
                              📦 {p.purchaseForm === 'fardo' ? 'Fardo Fechado' : 'Pacote Fechado'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {p.unitsPerPackage} un.
                            </span>
                          </div>
                          <span className="font-bold text-primary text-sm">R$ {fardoPrice.toFixed(2)}</span>
                        </button>
                      );
                    })()}
                    {/* Venda com Preço Promocional se ativo */}
                    {p.hasPromoSuggestion && p.promoPrice && (
                      <button 
                        onClick={() => addToCart(
                          p, 
                          p.promoDiscountPercent && p.promoDiscountPercent > 0 
                            ? `Promoção Avulsa (${p.promoDiscountPercent}% OFF)` 
                            : 'Promoção Avulsa', 
                          p.promoPrice!, 
                          1
                        )} 
                        disabled={p.stock < 1}
                        className="w-full text-left text-xs px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer shadow-2xs font-semibold"
                        title="Vender unidade avulsa em promoção"
                      >
                        <span className="flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5" /> Promoção Avulsa
                        </span>
                        <span>R$ {p.promoPrice.toFixed(2)}</span>
                      </button>
                    )}
                  </div>
                ) : p.hasPromoSuggestion && p.promoPrice ? (
                  <div className="flex flex-col gap-1.5">
                    <button 
                      onClick={() => addToCart(
                        p, 
                        p.promoDiscountPercent && p.promoDiscountPercent > 0 
                          ? `Promoção (${p.promoDiscountPercent}% OFF)` 
                          : 'Promoção', 
                        p.promoPrice!, 
                        1
                      )} 
                      disabled={p.stock < 1}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer flex justify-between px-3 items-center shadow-xs text-xs"
                      title="Vender pelo preço promocional"
                    >
                      <span className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5" /> Promoção
                      </span>
                      <span>R$ {p.promoPrice.toFixed(2)}</span>
                    </button>
                    <button 
                      onClick={() => addToCart(p, 'Padrão', p.basePrice, 1)} 
                      disabled={p.stock < 1}
                      className="w-full py-1 text-muted-foreground hover:text-foreground text-[11px] font-medium text-center hover:underline cursor-pointer"
                      title="Vender pelo preço normal"
                    >
                      Normal: R$ {p.basePrice.toFixed(2)}
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => addToCart(p, 'Padrão', p.basePrice, 1)} 
                    disabled={p.stock < 1}
                    className="w-full py-2.5 bg-palette-1 text-primary hover:opacity-90 border border-primary/30 rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer flex justify-between px-3 items-center"
                  >
                    <span className="text-xs">Vender</span>
                    <span>R$ {p.basePrice.toFixed(2)}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500">Nenhum produto encontrado.</div>
          )}
        </div>
      </div>

      <CartDrawer items={cart} total={cartTotal} busy={isCompletingSale} onQuantity={changeCartQuantity} onRemove={removeFromCart}
        onCheckout={() => { setPaymentType('cash'); setIsCheckoutOpen(true); }}
        onFiado={() => { setPaymentType('fiado'); setIsCheckoutOpen(true); }} />

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-label="Finalizar venda" className="max-h-[90dvh] overflow-y-auto bg-surface rounded-2xl w-full max-w-md p-6 shadow-2xl border border-border">
            <h2 className="text-2xl font-bold mb-4 text-foreground border-b border-border pb-3">Finalizar Venda</h2>
            
            {/* Active Operator info */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border text-xs mb-4">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="text-muted-foreground">Operador:</span>
                <span className="font-bold text-foreground truncate">
                  {currentEmployee ? currentEmployee.name : 'Proprietário'}
                </span>
                {currentEmployee?.role && (
                  <span className="text-[10px] text-muted-foreground">({currentEmployee.role})</span>
                )}
              </div>
              <button
                type="button"
                onClick={openSwitchModal}
                className="text-primary hover:underline font-bold text-[11px] shrink-0 cursor-pointer"
              >
                Trocar
              </button>
            </div>
            
            <fieldset disabled={isCompletingSale} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Forma de Pagamento</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button 
                    onClick={() => { setPaymentType('cash'); setAmountReceived(finalTotal); }} 
                    className={`py-3 rounded-xl border font-bold text-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 shadow-2xs ${paymentType === 'cash' ? 'bg-palette-1 border-primary text-primary ring-2 ring-primary/20' : 'bg-surface border-border hover:bg-muted text-foreground'}`}
                  >
                    <span className="text-base">💵</span>
                    <span>Dinheiro</span>
                  </button>
                  <button 
                    onClick={() => { setPaymentType('card'); setCardMethod('debit'); }}
                    className={`py-3 rounded-xl border font-bold text-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 shadow-2xs ${paymentType === 'card' && !['pix', 'pix_machine'].includes(cardMethod) ? 'bg-palette-1 border-primary text-primary ring-2 ring-primary/20' : 'bg-surface border-border hover:bg-muted text-foreground'}`}
                  >
                    <span className="text-base">💳</span>
                    <span>Cartão</span>
                  </button>
                  <button type="button" onClick={() => { setPaymentType('card'); setCardMethod('pix'); }}
                    className={`rounded-xl border py-3 text-sm font-bold ${paymentType === 'card' && cardMethod === 'pix' ? 'border-primary bg-palette-1 text-primary' : 'border-border bg-surface'}`}>
                    {v('payment.pixDirect', 'Pix (direto na conta)')}
                  </button>
                  <button type="button" onClick={() => { setPaymentType('card'); setCardMethod('pix_machine'); }} className={`rounded-xl border py-3 text-sm font-bold ${paymentType === 'card' && cardMethod === 'pix_machine' ? 'border-primary bg-palette-1 text-primary' : 'border-border bg-surface'}`}>
                    {v('payment.pixMachine', 'Pix na maquininha')}
                  </button>
                  <button 
                    onClick={() => setPaymentType('fiado')} 
                    className={`py-3 rounded-xl border font-bold text-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 shadow-2xs ${paymentType === 'fiado' ? 'bg-amber-100 border-amber-500 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 ring-2 ring-amber-500/20' : 'bg-surface border-border hover:bg-muted text-foreground'}`}
                  >
                    <span className="text-base">📝</span>
                    <span>{v('debt.title', 'Caderneta')}</span>
                  </button>
                </div>
              </div>

              {paymentType === 'card' && isCardFeeEnabled && (
                <div className="p-3 bg-muted/50 rounded-xl border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-foreground">Detalhes do pagamento</label>
                    <button
                      type="button"
                      onClick={() => setShowDetailedCardFees(!showDetailedCardFees)}
                      className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                    >
                      {showDetailedCardFees ? 'Ocultar taxas' : 'Ver taxas'}
                    </button>
                  </div>
                  
                  <div className={`grid grid-cols-3 gap-1.5 text-xs ${['pix','pix_machine'].includes(cardMethod) ? 'hidden' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setCardMethod('debit')}
                      className={`py-2 px-1 rounded-lg border font-bold text-center transition-colors cursor-pointer ${cardMethod === 'debit' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-surface border-border hover:bg-muted text-foreground'}`}
                    >
                      Débito
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardMethod('credit')}
                      className={`py-2 px-1 rounded-lg border font-bold text-center transition-colors cursor-pointer ${cardMethod === 'credit' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-surface border-border hover:bg-muted text-foreground'}`}
                    >
                      Crédito
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardMethod('voucher')}
                      className={`py-2 px-1 rounded-lg border font-bold text-center transition-colors cursor-pointer ${cardMethod === 'voucher' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-surface border-border hover:bg-muted text-foreground'}`}
                    >
                      Vale
                    </button>
                  </div>

                  {showDetailedCardFees && (
                    <div className="pt-2 border-t border-border/60 text-xs">
                      {isSurchargeMode ? (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg">
                          + Taxa de {activeRate}% repassada ao cliente: R$ {(finalTotal - cartTotal).toFixed(2)}
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground bg-surface p-2 rounded-lg border border-border/60">
                          Taxa de {activeRate}% absorvida pela loja: ~R$ {estimatedDeduction.toFixed(2)} • Você recebe: R$ {payment.netTotal.toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {paymentType === 'cash' && (
                <div className="pt-1 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1.5">Quanto o cliente entregou?</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={amountReceived || ''} 
                      onChange={e => setAmountReceived(Number(e.target.value))} 
                      className="w-full border border-border p-3 rounded-xl text-xl font-black bg-surface text-foreground focus:ring-2 focus:ring-primary focus:outline-none" 
                      placeholder="0,00"
                    />
                  </div>

                  {/* Atalhos rápidos de valores */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setAmountReceived(finalTotal)}
                      className="px-2.5 py-1 rounded-lg bg-palette-1 text-primary text-xs font-bold border border-primary/20 hover:opacity-90 cursor-pointer"
                    >
                      Exato (R$ {finalTotal.toFixed(2)})
                    </button>
                    {[10, 20, 50, 100].filter(val => val > finalTotal).slice(0, 3).map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAmountReceived(val)}
                        className="px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border cursor-pointer"
                      >
                        R$ {val},00
                      </button>
                    ))}
                  </div>

                  {amountReceived >= finalTotal && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase">Troco a devolver:</span>
                      <span className="text-xl font-black">R$ {change.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {paymentType === 'fiado' && (
                <div className="pt-1 space-y-3">
                  {/* Alternador Rápido entre Caderneta Existente e Novo Cliente */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1.5">
                      {v('debt.customer', 'Cliente da Compra no Fiado')}
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-xl border border-border">
                      <button
                        type="button"
                        onClick={() => setIsCreatingNewCustomer(false)}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          !isCreatingNewCustomer 
                            ? 'bg-surface text-foreground shadow-xs border border-border/80' 
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Caderneta ({customers.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingNewCustomer(true)}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          isCreatingNewCustomer 
                            ? 'bg-amber-500 text-white shadow-xs' 
                            : 'text-amber-800 dark:text-amber-300 hover:bg-amber-500/10'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Novo Cliente</span>
                      </button>
                    </div>
                  </div>

                  {isCreatingNewCustomer ? (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                          <UserPlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          Cadastrar Novo Cliente na Hora da Compra
                        </span>
                        {customers.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setIsCreatingNewCustomer(false)}
                            className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                          >
                            Ver já cadastrados
                          </button>
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Preencha o nome abaixo. Ao confirmar a venda, ele será salvo na sua caderneta e a dívida vinculada automaticamente.
                      </p>

                      <div>
                        <label className="block text-[11px] font-semibold text-foreground mb-1">
                          Nome do Novo Cliente *
                        </label>
                        <input
                          type="text"
                          required
                          autoFocus
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                          placeholder="Ex: Seu Zé Pedreiro, Dona Maria da Esquina..."
                          className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-foreground mb-1">
                            Telefone (Opcional)
                          </label>
                          <input
                            type="text"
                            value={newCustomerPhone}
                            onChange={(e) => setNewCustomerPhone(e.target.value)}
                            placeholder="(11) 99999-9999"
                            className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-foreground mb-1">
                            Dívida Anterior (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={newCustomerPreviousDebt}
                            onChange={(e) => setNewCustomerPreviousDebt(e.target.value)}
                            placeholder="0,00"
                            className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-foreground mb-1">
                          Observações / Referência (Opcional)
                        </label>
                        <input
                          type="text"
                          value={newCustomerNotes}
                          onChange={(e) => setNewCustomerNotes(e.target.value)}
                          placeholder="Ex: Casa verde em frente ao bar..."
                          className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>

                      <div className="pt-1 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={!newCustomerName.trim() || isSubmittingNewCustomer}
                          onClick={handleQuickCreateCustomer}
                          className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSubmittingNewCustomer ? (
                            <span>Salvando...</span>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Salvar Cliente e Continuar na Compra</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customers.length === 0 ? (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center space-y-2">
                          <p className="text-xs font-semibold text-foreground">
                            Nenhum cliente cadastrado na caderneta ainda.
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsCreatingNewCustomer(true)}
                            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Cadastrar Novo Cliente Agora</span>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <select 
                            value={selectedCustomerId} 
                            onChange={e => {
                              if (e.target.value === '__NEW__') {
                                setIsCreatingNewCustomer(true);
                              } else {
                                setSelectedCustomerId(e.target.value);
                              }
                            }} 
                            className="w-full border border-border p-3 rounded-xl bg-surface text-foreground text-sm font-semibold focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                          >
                            <option value="">-- Selecione quem está comprando na caderneta --</option>
                            <option value="__NEW__" className="font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950">
                              ➕ [+ Cadastrar Novo Cliente Agora nesta Compra]
                            </option>
                            {customers.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.totalDebt > 0 ? `(Já deve R$ ${c.totalDebt.toFixed(2)})` : '(Sem dívida)'}
                              </option>
                            ))}
                          </select>

                          <div className="mt-1.5 flex items-center justify-between px-1">
                            <span className="text-[11px] text-muted-foreground">
                              Não encontrou o cliente na lista?
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsCreatingNewCustomer(true)}
                              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Cadastrar Novo Cliente</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {newlyCreatedCustomerName && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Novo cliente "{newlyCreatedCustomerName}" selecionado para esta compra!</span>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-muted p-4 rounded-xl mt-6">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total {isSurchargeMode && paymentType === 'card' && activeRate > 0 && '(c/ taxa)'}</span>
                  <span className="text-xl font-bold text-foreground">R$ {finalTotal.toFixed(2)}</span>
                </div>
              </div>
            </fieldset>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button disabled={isCompletingSale} onClick={() => setIsCheckoutOpen(false)} className="px-6 py-3 border border-border rounded-xl hover:bg-muted font-medium text-muted-foreground cursor-pointer disabled:opacity-50">Cancelar</button>
              <button 
                onClick={handleCheckout} 
                disabled={isCompletingSale || (
                  paymentType === 'fiado' && 
                  !selectedCustomerId && 
                  (!isCreatingNewCustomer || !newCustomerName.trim()))
                }
                className="px-6 py-3 bg-primary text-white rounded-xl hover:opacity-90 font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <Check className="w-5 h-5"/> 
                {paymentType === 'fiado' && isCreatingNewCustomer && newCustomerName.trim()
                  ? `Confirmar Fiado para ${newCustomerName}`
                  : 'Confirmar'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Closure (Fechar Caixa) Modal */}
      {isCashClosureOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-border my-auto">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-palette-1 text-primary">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Fechamento de Caixa</h2>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Data: {format(new Date(), 'dd/MM/yyyy')}</span>
                    <span>•</span>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{format(new Date(), 'HH:mm')}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-muted p-1 rounded-xl flex items-center text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setClosureTab('close')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      closureTab === 'close'
                        ? 'bg-surface text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Fechar Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => setClosureTab('history')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      closureTab === 'history'
                        ? 'bg-surface text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Histórico</span>
                    <span className="text-[10px] bg-muted-foreground/20 px-1.5 py-0.2 rounded-full">
                      {cashClosures.length}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCashClosureOpen(false)}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {closureSuccessMsg && (
                <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{closureSuccessMsg}</span>
                </div>
              )}

              {closureTab === 'close' ? (
                <>
                  {/* Sales Metrics of the Day */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-primary" />
                      Resumo de Vendas Registradas Hoje ({todaySales.length} {todaySales.length === 1 ? 'venda' : 'vendas'})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-muted/40 p-3 rounded-xl border border-border">
                        <span className="text-[11px] font-medium text-muted-foreground block">Total Vendido</span>
                        <span className="text-base font-extrabold text-foreground block mt-0.5">
                          R$ {totalSalesToday.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/60">
                        <span className="text-[11px] font-medium text-emerald-700 block">💵 Dinheiro</span>
                        <span className="text-base font-extrabold text-emerald-800 block mt-0.5">
                          R$ {cashSalesToday.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200/60">
                        <span className="text-[11px] font-medium text-blue-700 block">💳 Cartão e Pix</span>
                        <span className="text-base font-extrabold text-blue-800 block mt-0.5">
                          R$ {cardSalesToday.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/60">
                        <span className="text-[11px] font-medium text-amber-700 block">📝 Fiado</span>
                        <span className="text-base font-extrabold text-amber-800 block mt-0.5">
                          R$ {fiadoSalesToday.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cash Drawer Reconciliation */}
                  <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <span>Conferência Física de Gaveta (Dinheiro em Espécie)</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1">
                          (+) Fundo de Troco Inicial (Abertura)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={openingBalance || ''}
                            onChange={e => setOpeningBalance(Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full pl-8 pr-3 py-2 text-sm font-semibold rounded-lg border border-border bg-surface text-foreground"
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          Valor que já estava no caixa para dar troco
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1">
                          (-) Sangrias / Retiradas de Dinheiro
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={withdrawals || ''}
                            onChange={e => setWithdrawals(Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full pl-8 pr-3 py-2 text-sm font-semibold rounded-lg border border-border bg-surface text-foreground"
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          Despesas pagas ou retiradas para o cofre
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                      <div className="bg-surface p-3 rounded-lg border border-border">
                        <span className="text-xs text-muted-foreground block">(=) Dinheiro Esperado na Gaveta:</span>
                        <span className="text-xl font-black text-foreground block mt-0.5">
                          R$ {expectedCash.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-muted-foreground block mt-1">
                          Fundo ({openingBalance.toFixed(2)}) + Dinheiro ({cashSalesToday.toFixed(2)}) - Sangrias ({withdrawals.toFixed(2)})
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">
                          Dinheiro Físico Contado na Gaveta:
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-primary">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={countedCash}
                            onChange={e => setCountedCash(e.target.value)}
                            placeholder={expectedCash.toFixed(2)}
                            className="w-full pl-9 pr-3 py-2.5 text-base font-extrabold rounded-lg border border-primary/40 bg-surface text-foreground focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          Conte as notas e moedas físicas na gaveta
                        </span>
                      </div>
                    </div>

                    {/* Result Difference Alert */}
                    {diff !== null && (
                      <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                        diff === 0 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                          : diff > 0 
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          {diff === 0 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 shrink-0 text-current" />
                          )}
                          <span>
                            {diff === 0 
                              ? 'O caixa bateu perfeitamente! Sem diferença.' 
                              : diff > 0 
                              ? `Sobra de caixa: R$ ${diff.toFixed(2)} a mais na gaveta.` 
                              : `Falta de caixa: R$ ${Math.abs(diff).toFixed(2)} a menos na gaveta.`}
                          </span>
                        </div>
                        <span className="font-bold text-sm">
                          {diff > 0 ? `+ R$ ${diff.toFixed(2)}` : diff < 0 ? `- R$ ${Math.abs(diff).toFixed(2)}` : 'R$ 0,00'}
                        </span>
                      </div>
                    )}

                    {/* Notes Field */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Observações do Fechamento (Opcional):
                      </label>
                      <input
                        type="text"
                        value={closureNotes}
                        onChange={e => setClosureNotes(e.target.value)}
                        placeholder="Ex: Pagamento de entregador de gás R$ 20, troco faltante em moedas..."
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-foreground"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* History Tab */
                <div className="space-y-3">
                  {cashClosures.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-xs">
                      Nenhum fechamento de caixa registrado ainda.
                    </div>
                  ) : (
                    cashClosures.map(c => {
                      const d = c.difference || 0;
                      return (
                        <div key={c.id} className="p-3.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground text-sm">
                                {format(new Date(c.closedAt || c.date), 'dd/MM/yyyy')}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                às {format(new Date(c.closedAt || c.date), 'HH:mm')}
                              </span>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                              d === 0 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : d > 0 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {d === 0 ? 'Exato' : d > 0 ? `Sobra: +R$ ${d.toFixed(2)}` : `Falta: -R$ ${Math.abs(d).toFixed(2)}`}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Total Vendido</span>
                              <span className="font-bold text-foreground">R$ {c.totalSales.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Dinheiro / Cartão e Pix</span>
                              <span className="font-medium text-foreground">
                                💵 {c.totalCash.toFixed(2)} | 💳 {c.totalCard.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Esperado em Caixa</span>
                              <span className="font-medium text-foreground">R$ {c.expectedCash.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Dinheiro Informado</span>
                              <span className="font-bold text-foreground">R$ {c.countedCash.toFixed(2)}</span>
                            </div>
                          </div>

                          {c.notes && (
                            <div className="text-[11px] text-muted-foreground bg-surface p-2 rounded-lg border border-border/60">
                              <span className="font-semibold text-foreground">Obs:</span> {c.notes}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border flex items-center justify-between gap-2 bg-muted/10">
              <button
                type="button"
                onClick={handlePrintClosure}
                className="px-3.5 py-2 border border-border bg-surface hover:bg-muted text-foreground rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4 text-primary" />
                <span>Imprimir Comprovante</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCashClosureOpen(false)}
                  className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground rounded-xl text-xs font-medium cursor-pointer"
                >
                  Fechar Janela
                </button>
                {closureTab === 'close' && (
                  <button
                    type="button"
                    onClick={handleSaveClosure}
                    disabled={isSavingClosure}
                    className="px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingClosure ? 'Salvando...' : 'Salvar Fechamento'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

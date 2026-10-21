export type PriceField = 'basePrice' | 'pricePackage' | 'pricePack' | 'priceCart' | 'priceHalfCart' | 'priceUnit' | 'promoPrice';
export interface PriceChange {field:PriceField;oldPrice:number;newPrice:number;}
export interface PriceReview {id:string;oldCost:number;newCost:number;changePercent:number;prices:PriceChange[];createdAt:number;}

export interface Product {
  id?: string;
  name: string;
  type: 'comum' | 'cigarro';
  stockUnit?: 'unidade' | 'carteira'; // Missing marker on cigarettes indicates legacy avulso balances.
  category: string;
  imageUrl?: string;
  barcode?: string;
  mergedIntoId?: string;
  mergedProductIds?: string[]; // Historical source IDs retained when joining products.
  mergedAt?: number;
  purchaseForm: 'pacote' | 'fardo' | 'unidade';
  unitsPerPackage: number;
  supplierPackageUnits?: 5 | 10; // Cigarette purchase packaging; sale pack remains 10 carteiras.
  lastCost?: number; // Effective unit cost of the most recent receipt; never the weighted average.
  pendingPriceReview?: PriceReview | null;
  desiredMargin?: number;
  unitCost: number; // Weighted average per stock unit: carteira for cigarettes, individual unit otherwise.
  stock: number;
  safetyStock: number;
  maxStock?: number;
  stockCoverageDays?: number; // Planned days of sales between replenishments.
  initialStock?: number;
  initialStockDate?: string;
  dailyAverageSales: number;
  replacementDays: number;
  basePrice: number;
  pricePackage?: number;
  pricePack?: number;
  priceCart?: number;
  priceHalfCart?: number;
  priceUnit?: number;
  expirationDate?: string; // Data de validade 'yyyy-MM-dd' (opcional)
  hasPromoSuggestion?: boolean; // Se está com preço promocional ativo / sugerido (opcional)
  promoPrice?: number; // Preço promocional da unidade (opcional)
  promoDiscountPercent?: number; // % de desconto promocional (opcional)
  promoNotes?: string; // Motivo da promoção / observação (opcional)
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Customer {
  debtImports?: { id: string; createdAt: number; description: string; amount: number; lines: {description: string; amount: number}[]; readTotal: number | null; summedTotal: number }[];
  lastMovementAt?: number;
  id?: string;
  name: string;
  phone?: string;
  previousDebt: number;
  totalDebt: number;
  notes?: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Employee {
  mustChangePin?: boolean;
  pinChangedAt?: number;
  id?: string;
  name: string;
  role: string;
  pin?: string;
  phone?: string;
  color?: string;
  avatarUrl?: string;
  isActive: boolean;
  currentShiftStartedAt?: number;
  lastShiftEndedAt?: number;
  email?: string; // e-mail pelo qual foi convidado e vai entrar
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface TeamInvitation {
  id?: string;
  name: string;
  role: string;
  email: string;
  phone?: string;
  pin?: string;
  storeName?: string;
  storeOwnerId?: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: number;
  invitedAt?: number;
  acceptedAt?: number;
  acceptedByUid?: string;
  ownerId: string;
}

export interface UserStore {
  userUid: string;
  ownerId: string;
  storeName?: string;
  email?: string;
  name?: string;
  role?: string;
  linkedAt: number;
}

export type MovementType = 
  | 'shift_start'
  | 'shift_end'
  | 'employee_login'
  | 'employee_logout'
  | 'sale'
  | 'stock_in'
  | 'stock_out'
  | 'stock_adjustment'
  | 'product_create'
  | 'product_update'
  | 'product_delete'
  | 'debt_add'
  | 'debt_payment'
  | 'debt_remove'
  | 'cash_closure'
  | 'manual_entry';

export interface Movement {
  priceChanges?: PriceChange[];
  actorUserId?: string;
  entryKind?: 'bonus';
  id?: string;
  timestamp: number;
  employeeId: string;
  employeeName: string;
  employeeRole?: string;
  type: MovementType;
  description: string;
  entityId?: string;
  entityName?: string;
  quantity?: number;
  amount?: number;
  previousValue?: string | number;
  newValue?: string | number;
  notes?: string;
  ownerId: string;
  createdAt: number;
}

export interface Sale {
  id?: string;
  total: number;
  type: 'cash' | 'card' | 'fiado';
  paymentMethod?: 'cash' | 'debit' | 'credit' | 'pix' | 'pix_machine' | 'voucher' | 'fiado';
  customerId?: string;
  itemsSummary?: string;
  subtotal?: number;
  feeRate?: number;
  feeAmount?: number;
  surchargeAmount?: number;
  netTotal?: number;
  employeeId?: string;
  employeeName?: string;
  ownerId: string;
  createdAt: number;
}

export interface CashClosure {
  id?: string;
  date: string;
  closedAt: number;
  totalSales: number;
  totalCash: number;
  totalCard: number;
  totalFiado: number;
  salesCount: number;
  openingBalance: number;
  withdrawals: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  notes: string;
  employeeId?: string;
  employeeName?: string;
  ownerId: string;
  createdAt: number;
}

export interface SaleItem {
  stockDeduction?: number; // Stock units consumed by one item in the selected sale format.
  id?: string;
  productId: string;
  name: string;
  format: string;
  quantity: number;
  price: number;
  unitCost: number;
  ownerId: string;
  createdAt: number;
}

export interface Payment {
  id?: string;
  customerId: string;
  amount: number;
  method: 'cash' | 'card';
  employeeId?: string;
  employeeName?: string;
  ownerId: string;
  createdAt: number;
}

export type BonusUnit = 'maco' | 'pacote' | 'carteira' | 'unidade' | 'fardo';
export interface BonusRule {
  id: string;
  supplier: string;
  productId: string;
  buyQuantity: number;
  buyUnit: BonusUnit;
  bonusProductId: string;
  bonusQuantity: number;
  bonusUnit: BonusUnit;
}

export interface Purchase {
  bonusQuantity?: number; // In the bonus product's base stock unit, not packages.
  bonusProductId?: string;
  bonusProductName?: string;
  bonusStockUnit?: 'carteira' | 'unidade';
  bonusRuleId?: string;
  effectiveUnitCost?: number;
  bonusSavings?: number; // Estimated value at the pre-bonus acquisition cost.
  stockUpdated?: boolean;
  previousAverageCost?: number;
  averageCostAfter?: number;
  bonusAverageCostAfter?: number;
  id?: string;
  productId: string;
  productName: string;
  category?: string;
  quantity: number; // quantidade em unidades físicas
  packageQuantity?: number; // quantidade em fardos/pacotes (se aplicável)
  packageType?: 'unidade' | 'fardo' | 'pacote';
  unitCost: number; // custo unitário por unidade física
  totalCost: number; // custo total desembolsado
  supplier?: string; // fornecedor, mercado, distribuidora
  notes?: string;
  date: string; // 'yyyy-MM-dd'
  expirationDate?: string; // Data de validade deste lote 'yyyy-MM-dd' (opcional)
  suggestPromo?: boolean; // Se foi definida sugestão de promoção na compra (opcional)
  suggestedPromoPrice?: number; // Preço promocional sugerido (opcional)
  promoDiscountPercent?: number; // % de desconto sugerido (opcional)
  employeeId?: string;
  employeeName?: string;
  ownerId: string;
  createdAt: number;
}

export interface Settings {
  bonusRules?: BonusRule[];
  currency?: 'BRL' | 'USD' | 'EUR';
  googleSheetsWebhookUrl?: string;
  googleSheetsWebhookEnabled?: boolean;
  customCategories?: string[];
  language?: string;
  fontSize?: string;
  simpleViewMode?: boolean;
  id?: string;
  storeName: string;
  cnpj: string;
  phone: string;
  email: string;
  logoUrl?: string;
  theme: string;
  darkMode: boolean;
  defaultMargin: number;
  dailyGoal: number;
  languageMode?: 'technical' | 'neutral' | 'basic';
  businessSector?: string;
  // Card & Payment Fees ("Taxinha da Maquininha")
  enableCardFees?: boolean;
  creditCardRate?: number; // % taxa cartão de crédito (ex: 3.5%)
  debitCardRate?: number; // % taxa cartão de débito (ex: 1.5%)
  pixRate?: number; // % taxa somente do Pix na maquininha; Pix direto é isento.
  voucherRate?: number; // % taxa vale/alimentação (ex: 2.0%)
  otherFeesRate?: number; // % outras taxas
  passCardFeeToCustomer?: boolean; // Se verdadeiro, repassa a taxa para o cliente no valor final
  cardFeePaymentMode?: 'absorb' | 'repass'; // 'absorb' (loja arca) ou 'repass' (adiciona ao total do cliente)
  cardFeeCalculationMode?: 'absorb' | 'surcharge';
  ownerId: string;
  updatedAt: number;
}

export interface Feedback {
  id?: string;
  ownerId: string;
  userEmail?: string;
  rating?: number; // 1 a 5 estrelas
  category: 'sugestao' | 'elogio' | 'dificuldade' | 'duvida' | string;
  message: string;
  contact?: string; // Telefone para retorno
  storeName?: string;
  createdAt: number;
}

export interface MonthlyFinancials {
  monthName: string;
  totalGrossSales: number;
  totalCostOfGoods: number; // CMV
  grossProfit: number;
  grossMargin: number;
  cardFeesEstimated: number;
  totalWithdrawals: number;
  totalNetProfit: number;
  netMargin: number;
  salesCount: number;
  averageTicket: number;
  cashSales: number;
  cardSales: number;
  fiadoSales: number;
  totalPurchasesSpent?: number; // Total investido em compras/reposição de estoque no mês
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

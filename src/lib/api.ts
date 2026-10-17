import { validateNotebook, moneyCents, notebookSum, type NotebookEntry } from './debtNotebook';
import { storeProductImage, isEmbeddedProductImage } from './productImages';
import { calculatePayment, paymentLabel } from './paymentFees';
import { soldBaseQuantity } from './productSalesRanking';
import { findDuplicateProducts, isDuplicateProduct } from './duplicateDetector';
import { supabase } from './supabase';
import { reportUsage } from './usageReporting';
import { exportFeedbackToSheets } from './feedbackSheets';
import { type CatalogProduct } from './standardCatalog';
import { executeCatalogImport, catalogDocumentId } from './catalogImport';
import { withActionDeadline, ConfirmationTimeoutError } from './actionFeedback';
import { formatProductStock, formatCigaretteStock, normalizeCigaretteStock, cigaretteStockFields, isValidStockQuantity, getCigaretteFormats } from './productUnits';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, writeBatch, runTransaction } from './cloudStore';
import { db, enqueueCloudWrite } from './cloudStore';
import { auth } from './firebase';
import { 
  OperationType, 
  Product, 
  Customer, 
  Sale, 
  SaleItem, 
  Payment, 
  Settings, 
  CashClosure, 
  MonthlyFinancials, 
  Purchase, 
  Feedback, 
  Employee, 
  Movement, 
  MovementType,
  TeamInvitation,
  UserStore
} from '../types';
import { postToGoogleSheets, GOOGLE_SHEETS_WEBHOOK_URL } from './supabase';

export { postToGoogleSheets, GOOGLE_SHEETS_WEBHOOK_URL };

export function removeUndefinedFields<T extends Record<string, any>>(obj: T): Partial<T> {
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  }
  return clean;
}

export function handleCloudError(error: unknown, operationType: OperationType, path: string | null) {
  if (error instanceof ConfirmationTimeoutError) throw error;
  const errCode = (error as any)?.code;
  const errMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const isOfflineOrUnavailable = 
    errCode === 'unavailable' || 
    errCode === 'deadline-exceeded' || 
    errCode === 'failed-precondition' ||
    errMsg.includes('offline') || 
    errMsg.includes('unavailable') ||
    errMsg.includes('could not reach cloud firestore') ||
    errMsg.includes('backend didn\'t respond') ||
    errMsg.includes('network') ||
    errMsg.includes('connection failed') ||
    errMsg.includes('the operation could not be completed');

  console.error('[Supabase]', { operationType, path, code: errCode });
  if (isOfflineOrUnavailable && typeof window !== 'undefined') window.dispatchEvent(new Event('cloud-offline'));
  throw error instanceof Error ? error : new Error('Não foi possível confirmar a operação na nuvem.');
}

// ---------------------------------------------------------------------------
// ACTIVE STORE / SUB-ACCOUNT MANAGEMENT (EQUIPE & MULTI-USUÁRIO)
// ---------------------------------------------------------------------------
export interface ActiveStoreSession {
  storeOwnerId: string;
  storeName?: string;
  isEmployee: boolean;
  employeeId?: string;
  employeeName?: string;
  employeeRole?: string;
  employeeEmail?: string;
}

let activeStoreSession: ActiveStoreSession | null = null;
export const getActiveStoreSession = (): ActiveStoreSession | null => activeStoreSession;
export const setActiveStoreSession = (session: ActiveStoreSession | null) => {
  activeStoreSession = session;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('store-session-changed', { detail: session }));
};
if (typeof window !== 'undefined') window.addEventListener('auth-user-changed', () => {
  setActiveStoreSession(null);
  setActiveEmployeeStorage(null);
});

export const getEffectiveOwnerId = (): string => {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return '';
  const session = getActiveStoreSession();
  if (session && session.storeOwnerId) {
    return session.storeOwnerId;
  }
  return currentUid;
};

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
export const subscribeSettings = (callback: (s: Settings | null) => void, onError?: (error: unknown) => void) => {
  const uid = getEffectiveOwnerId();
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'settings', uid), (snapshot) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cloud-online'));
    }
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() } as Settings);
    } else {
      callback(null);
    }
  }, onError || ((error) => handleCloudError(error, OperationType.GET, `settings/${uid}`)));
};

export const saveStoreProfile = async (profile: {storeName: string, cnpj: string, phone: string, email: string, languageMode?: 'technical' | 'neutral' | 'basic', businessSector?: string, customCategories?: string[]}) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Entre na sua conta para salvar o comércio.');
  try {
    const initial: Settings = {
      ...profile,
      currency: 'BRL', fontSize: 'normal', simpleViewMode: profile.languageMode === 'basic',
      theme: 'standard',
      darkMode: false,
      defaultMargin: 30,
      dailyGoal: 500,
      languageMode: profile.languageMode || 'neutral',
      businessSector: profile.businessSector || 'mercearia',
      ownerId: uid,
      updatedAt: Date.now()
    };
    await setDoc(doc(db, 'settings', uid), initial);
  } catch (error) {
    handleCloudError(error, OperationType.WRITE, `settings/${uid}`);
  }
};

export const updateSettings = withActionDeadline(async (data: Partial<Settings>) => {
  if (data.currency !== undefined && !['BRL','USD','EUR'].includes(data.currency)) throw new Error('Selecione BRL, USD ou EUR.');
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  const path = `settings/${uid}`;
  try {
    const { id, ...cleanData } = data as any;
    const settingsRef = doc(db, 'settings', uid);
    const d = await getDoc(settingsRef);
    const now = Date.now();
    if (d.exists()) {
      await updateDoc(settingsRef, { ...cleanData, updatedAt: now });
    } else {
      const initial: Settings = {
        ...cleanData,
        currency: cleanData.currency || 'BRL',
        storeName: cleanData.storeName || 'Eu Gerencio!',
        cnpj: cleanData.cnpj || '',
        phone: cleanData.phone || '',
        email: cleanData.email || auth.currentUser?.email || '',
        theme: cleanData.theme || 'standard',
        darkMode: cleanData.darkMode ?? false,
        defaultMargin: typeof cleanData.defaultMargin === 'number' ? cleanData.defaultMargin : 30,
        dailyGoal: typeof cleanData.dailyGoal === 'number' ? cleanData.dailyGoal : 500,
        ownerId: uid,
        updatedAt: now
      };
      await setDoc(settingsRef, initial);
    }
  } catch (error) {
    handleCloudError(error, OperationType.WRITE, path);
    throw error;
  }
});

// ---------------------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------------------
export const subscribeProducts = (callback: (p: Product[]) => void) => {
  const uid = getEffectiveOwnerId();
  if (!uid) return () => {};
  const q = query(collection(db, 'products'), where('ownerId', '==', uid));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => normalizeCigaretteStock({ id: doc.id, ...doc.data() } as Product)).filter(product => !product.mergedIntoId));
  }, (error) => handleCloudError(error, OperationType.LIST, 'products'));
};

export const addProduct = withActionDeadline(async (product: Omit<Product, 'id'|'ownerId'|'createdAt'|'updatedAt'>) => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  const path = 'products';
  try {
    const ref = doc(collection(db, path));
    const now = Date.now();
    product = { ...product, imageUrl: await storeProductImage(product.imageUrl, uid) };
    const cleanProduct = removeUndefinedFields(normalizeCigaretteStock(product) as any);
    await setDoc(ref, {
      ...cleanProduct,
      ownerId: uid,
      createdAt: now,
      updatedAt: now
    });

    reportUsage('produto_cadastrado', uid);
    const activeEmp = getActiveEmployeeStorage();
    recordMovement({
      sourceOwnerId: uid,
      timestamp: now,
      employeeId: activeEmp.id,
      employeeName: activeEmp.name,
      employeeRole: activeEmp.role,
      type: 'product_create',
      description: `Produto cadastrado: "${product.name}" (${product.category}) • Estoque: ${formatProductStock(product)}`,
      entityId: ref.id,
      entityName: product.name,
      quantity: product.stock,
      amount: product.basePrice
    }).catch(() => {});
  } catch (err) {
    handleCloudError(err, OperationType.CREATE, path);
  }
});

export const addMultipleProducts = withActionDeadline(async (productsList: Omit<Product, 'id'|'ownerId'|'createdAt'|'updatedAt'>[]): Promise<number> => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  if (!productsList || productsList.length === 0) return 0;

  const path = 'products';
  const now = Date.now();
  let count = 0;

  // Atomic Supabase RPC supports up to 500 operations per batch
  const CHUNK_SIZE = 400;
  for (let i = 0; i < productsList.length; i += CHUNK_SIZE) {
    const chunk = productsList.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const original of chunk) {
      const prod = { ...original, imageUrl: await storeProductImage(original.imageUrl, uid) };
      const ref = doc(collection(db, path));
      const cleanProduct = removeUndefinedFields(normalizeCigaretteStock(prod) as any);
      batch.set(ref, {
        ...cleanProduct,
        ownerId: uid,
        createdAt: now,
        updatedAt: now
      });
      count++;
    }

    try {
      await batch.commit();
    } catch (err) {
      handleCloudError(err, OperationType.CREATE, path);
    }
  }

  const activeEmp = getActiveEmployeeStorage();
  recordMovement({
      sourceOwnerId: uid,
    timestamp: now,
    employeeId: activeEmp.id,
    employeeName: activeEmp.name,
    employeeRole: activeEmp.role,
    type: 'product_create',
    description: `Importação rápida de estoque: ${count} produtos cadastrados no catálogo`,
    quantity: count
  }).catch(() => {});

  reportUsage('produto_cadastrado', uid);
  return count;
});

// Apply quick stock entries to the current database balance, not a stale UI snapshot.
function withProductWriteQueue<A extends unknown[], R>(action: (id: string, ...args: A) => Promise<R>) {
  return (id: string, ...args: A): Promise<R> => {
    const ownerId = getEffectiveOwnerId();
    return enqueueCloudWrite(`products/${ownerId}/${id}`, () => {
      if (!ownerId || getEffectiveOwnerId() !== ownerId) throw new Error('A sessão da loja mudou. Entre novamente antes de alterar o estoque.');
      // Keep the queue locked until the actual operation finishes, including retries.
      // Individual HTTP requests are bounded by fetchCloud's timeout.
      return action(id, ...args);
    });
  };
}
export const adjustProductStock = withProductWriteQueue(async (id: string, individualUnits: number) => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  if (!isValidStockQuantity(Math.abs(individualUnits))) throw new Error('Quantidade inválida: use incrementos de 0,05 carteira.');
  const result = await runTransaction(db, async transaction => {
    const ref = doc(db, 'products', id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Produto não encontrado.');
    const product = normalizeCigaretteStock(snapshot.data() as Product);
    if (product.mergedIntoId) throw new Error('Este produto foi mesclado. Abra o produto existente.');
    if (product.type !== 'cigarro' && !Number.isSafeInteger(individualUnits)) throw new Error('Informe unidades inteiras para este produto.');
    if (product.ownerId !== uid) throw new Error('Sem acesso a este produto.');
    const newStock = (Math.round(Number(product.stock) * 20) + Math.round(individualUnits * 20)) / 20;
    if (newStock < 0) throw new Error('Estoque insuficiente.');
    transaction.update(ref, { ...cigaretteStockFields(product), stock: newStock, updatedAt: Date.now() });
    return { name: product.name, type: product.type, stock: newStock, newStock };
  });
  recordMovement({
      sourceOwnerId: uid,
    type: 'product_update', entityId: id, entityName: result.name,
    description: `Estoque de ${result.name}: ${individualUnits > 0 ? '+' : '−'}${formatProductStock(result, Math.abs(individualUnits))}; estoque agora ${formatProductStock(result)}.`,
    quantity: individualUnits
  }).catch(() => {});
  return result.newStock;
});

export const updateProduct = withProductWriteQueue(async (id: string, data: Partial<Product>) => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  if (data.imageUrl !== undefined) data = { ...data, imageUrl: await storeProductImage(data.imageUrl, uid) };
  try {
    const now = Date.now();
    const changedProduct = await runTransaction(db, async transaction => {
      const ref = doc(db, 'products', id);
      const current = await transaction.get(ref);
      if (!current.exists()) throw new Error('Produto não encontrado.');
      if (current.data().mergedIntoId) throw new Error('Este produto foi mesclado. Abra o produto existente.');
      const stockFields = cigaretteStockFields(current.data() as Product);
      const merged = normalizeCigaretteStock({ ...current.data(), ...stockFields, ...data } as Product);
      if (merged.type === 'cigarro' && (!isValidStockQuantity(merged.stock) || (merged.initialStock !== undefined && !isValidStockQuantity(merged.initialStock)))) throw new Error('Estoque inválido: use carteiras em passos de 0,05.');
      transaction.update(ref, { ...removeUndefinedFields({ ...stockFields, ...data, ...cigaretteStockFields(merged) }), updatedAt: now });
      return merged;
    });

    const activeEmp = getActiveEmployeeStorage();
    const descParts: string[] = [];
    if (data.name) descParts.push(`nome: "${data.name}"`);
    if (data.stock !== undefined) descParts.push(`estoque: ${formatProductStock(changedProduct)}`);
    if (data.basePrice !== undefined) descParts.push(`preço atualizado para ${data.basePrice.toFixed(2)}`);
    if (data.unitCost !== undefined) descParts.push(`custo atualizado para ${data.unitCost.toFixed(2)}`);

    recordMovement({
      sourceOwnerId: uid,
      timestamp: now,
      employeeId: activeEmp.id,
      employeeName: activeEmp.name,
      employeeRole: activeEmp.role,
      type: 'product_update',
      description: `Produto atualizado ${data.name ? `"${data.name}"` : `ID ${id.slice(0, 6)}`}: ${descParts.join(', ') || 'dados alterados'}`,
      entityId: id,
      entityName: data.name,
      quantity: data.stock,
      amount: data.basePrice
    }).catch(() => {});
  } catch (err) {
    handleCloudError(err, OperationType.UPDATE, `products/${id}`);
  }
});

export const deleteProduct = withProductWriteQueue(async (id: string, productName?: string) => {
  try {
    await deleteDoc(doc(db, 'products', id));

    const activeEmp = getActiveEmployeeStorage();
    recordMovement({
      timestamp: Date.now(),
      employeeId: activeEmp.id,
      employeeName: activeEmp.name,
      employeeRole: activeEmp.role,
      type: 'product_delete',
      description: `Produto removido do catálogo: "${productName || id}"`,
      entityId: id,
      entityName: productName
    }).catch(() => {});
  } catch (err) {
    handleCloudError(err, OperationType.DELETE, `products/${id}`);
    throw err;
  }
});

function catalogStore(ownerId: string) {
  return {
    readExisting: async () => {
      const snapshot = await getDocs(query(collection(db, 'products'), where('ownerId', '==', ownerId)));
      return snapshot.docs.filter(record => !record.data().mergedIntoId).map(record => ({ name: String(record.data().name || '') }));
    },
    insertProducts: async (missing: CatalogProduct[]) => {
      const refs = await Promise.all(missing.map(async product => doc(db, 'products', await catalogDocumentId(ownerId, product.name))));
      // Deterministic IDs make retries safe after a partial confirmation.
      return runTransaction(db, async transaction => {
        const current = await Promise.all(refs.map(ref => transaction.get(ref)));
        const now = Date.now();
        let added = 0;
        for (let index = 0; index < missing.length; index++) {
          if (current[index].exists()) continue;
          transaction.set(refs[index], { ...missing[index], ownerId, createdAt: now, updatedAt: now });
          added++;
        }
        return added;
      });
    }
  };
}

/** Supplier drafts are reviewed by the merchant; never seed generic products or fictitious stock. */
export const importSupplierCatalog = withActionDeadline(async (products: CatalogProduct[], options?: { allowDuplicates?: boolean; draftIds?: string[] }): Promise<number> => {
  const ownerId = getEffectiveOwnerId();
  if (!ownerId) throw new Error('Entre na sua conta para importar o catálogo.');
  if (!products.length || products.length > 200) throw new Error('Importe entre 1 e 200 produtos por vez.');
  for (const product of products) {
    if (!product.name.trim() || product.name.length > 100 || !product.category.trim() || product.category.length > 50 ||
        !Number.isFinite(product.unitCost) || product.unitCost < 0 || !Number.isFinite(product.basePrice) || product.basePrice <= 0 ||
        (!Number.isFinite(product.stock) || product.stock < 0 || !(product.type === 'cigarro' ? isValidStockQuantity(product.stock) : Number.isSafeInteger(product.stock))) ||
        (product.initialStock != null && product.initialStock !== product.stock) || !['comum', 'cigarro'].includes(product.type) ||
        (product.type === 'cigarro' && (product.stockUnit !== 'carteira' || product.unitsPerPackage !== 10))) {
      throw new Error('Confira os nomes, custos, medidas e preços dos produtos antes de importar.');
    }
  }
  products = await Promise.all(products.map(async product => ({ ...product, ...(product.imageUrl ? { imageUrl: await storeProductImage(product.imageUrl, ownerId) } : {}) })));
  if (options?.draftIds && (options.draftIds.length !== products.length || new Set(options.draftIds).size !== products.length || options.draftIds.some(id => !/^[a-zA-Z0-9_-]{1,160}$/.test(id)))) {
    throw new Error('A revisão do catálogo está inválida. Reabra os produtos antes de cadastrar.');
  }
  const count = options?.allowDuplicates ? await (async () => {
    // Stable IDs make an uncertain confirmation safe to retry, even for allowed duplicates.
    const refs = options.draftIds
      ? await Promise.all(options.draftIds.map(async id => doc(db, 'products', await catalogDocumentId(ownerId, `supplier-draft:${id}`))))
      : products.map(() => doc(collection(db, 'products')));
    return await runTransaction(db, async transaction => {
      const existing = options.draftIds ? await Promise.all(refs.map(ref => transaction.get(ref))) : [];
      const now = Date.now();
      let added = 0;
      products.forEach((product, index) => {
        if (existing[index]?.exists()) return;
        transaction.set(refs[index], { ...product, ownerId, createdAt: now, updatedAt: now });
        added++;
      });
      return added;
    });
  })() : await executeCatalogImport(ownerId, catalogStore(ownerId), products);

  if (count > 0) recordMovement({
      sourceOwnerId: ownerId, type: 'product_create', description: `Catálogo do fornecedor: ${count} produtos cadastrados.`, quantity: count }).catch(() => {});
  if (count > 0) reportUsage('produto_cadastrado', ownerId);
  return count;
}, 60000);

/** Confirm the Supabase bulk insert before creating products used by the existing Stock/POS. */
export const importStandardCatalog = withActionDeadline(async (): Promise<number> => {
  const ownerId = getEffectiveOwnerId();
  if (!ownerId) throw new Error('Entre na sua conta para importar o catálogo.');
  const count = await executeCatalogImport(ownerId, catalogStore(ownerId));
  recordMovement({
      sourceOwnerId: ownerId, type: 'product_create', description: `Importação do catálogo padrão: ${count} produtos.`, quantity: count }).catch(() => {});
  return count;
}, 60000);

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------
export const subscribeCustomers = (callback: (c: Customer[]) => void) => {
  const uid = getEffectiveOwnerId();
  if (!uid) return () => {};
  const q = query(collection(db, 'customers'), where('ownerId', '==', uid));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
  }, (error) => handleCloudError(error, OperationType.LIST, 'customers'));
};

export const addCustomer = withActionDeadline(async (customer: Omit<Customer, 'id'|'ownerId'|'createdAt'|'updatedAt'>): Promise<string> => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  try {
    const ref = doc(collection(db, 'customers'));
    const now = Date.now();
    await setDoc(ref, { ...removeUndefinedFields(customer as any), lastMovementAt: customer.previousDebt > 0 ? now : 0, ownerId: uid, createdAt: now, updatedAt: now });

    recordMovement({
      sourceOwnerId: uid,
      timestamp: now,
      type: 'debt_add',
      description: `Novo cliente adicionado à caderneta de fiado: "${customer.name}"${customer.phone ? ` (Tel: ${customer.phone})` : ''}${customer.previousDebt > 0 ? ` com dívida inicial registrada` : ''}`,
      entityId: ref.id,
      entityName: customer.name,
      amount: customer.previousDebt || undefined
    }).catch(() => {});

    return ref.id;
  } catch (err) {
    handleCloudError(err, OperationType.CREATE, 'customers');
    return '';
  }
});

export const updateCustomer = withActionDeadline(async (id: string, data: Partial<Customer>) => {
  try {
    const cleanData = removeUndefinedFields(data as any);
    await updateDoc(doc(db, 'customers', id), { ...cleanData, updatedAt: Date.now() });
  } catch (err) {
    handleCloudError(err, OperationType.UPDATE, `customers/${id}`);
  }
});

export const deleteCustomer = withActionDeadline(async (id: string, customerName?: string): Promise<void> => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');

  try {
    await deleteDoc(doc(db, 'customers', id));

    const activeEmp = getActiveEmployeeStorage();
    recordMovement({
      sourceOwnerId: uid,
      timestamp: Date.now(),
      employeeId: activeEmp.id,
      employeeName: activeEmp.name,
      employeeRole: activeEmp.role,
      type: 'debt_remove',
      description: `Cliente removido da caderneta de fiado: "${customerName || id}"`,
      entityId: id,
      entityName: customerName
    }).catch(() => {});
  } catch (err) {
    handleCloudError(err, OperationType.DELETE, `customers/${id}`);
    throw err;
  }
});

// ---------------------------------------------------------------------------
// SALES & PAYMENTS
// ---------------------------------------------------------------------------
function productFormatUnits(product: Product, format: string): number {
  return product.type === 'cigarro' ? getCigaretteFormats(product).find(item => item.label === format)?.units || 0
    : /^(Fardo|Pacote) \(/.test(format) ? product.unitsPerPackage : 1;
}

export const recordSale = withActionDeadline(async (
  sale: { total: number, type: 'cash' | 'card' | 'fiado', paymentMethod?: Sale['paymentMethod'], customerId: string, employeeId?: string, employeeName?: string },
  items: Omit<SaleItem, 'id'|'ownerId'|'createdAt'>[],
  _productsToUpdate: {id: string, newStock: number}[]
) => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  
  const now = Date.now();
  let confirmedSummary = '';
  const summary = items.map(item => `${item.quantity}x ${item.name} (${item.format})`).join(', ').slice(0, 950);
  const activeEmp = getActiveEmployeeStorage();
  const empId = sale.employeeId || activeEmp.id;
  const empName = sale.employeeName || activeEmp.name;
  const saleRef = doc(collection(db, 'sales'));
  const itemRefs = items.map(() => doc(collection(db, `sales/${saleRef.id}/saleItems`)));
  if (!items.length || !Number.isFinite(sale.total) || sale.total <= 0) throw new Error('Venda inválida.');
  if (items.some(item => !Number.isFinite(item.price) || item.price <= 0)) throw new Error('Preço de venda inválido.');
  if (items.some(item => !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) throw new Error('Quantidade inválida.');
  try {
    await runTransaction(db, async transaction => {
      const ids = [...new Set(items.map(item => item.productId))];
      const snapshots = await Promise.all(ids.map(id => transaction.get(doc(db, 'products', id))));
      const feeSettings = await transaction.get(doc(db, 'settings', uid));
      const payment = calculatePayment(items.reduce((sum,item) => sum + item.price * item.quantity, 0), sale.paymentMethod || (sale.type === 'card' ? 'debit' : sale.type), feeSettings.exists() ? feeSettings.data() as Settings : null);
      if (Math.abs(payment.total - sale.total) > 0.001) throw new Error('O valor ou a taxa mudou. Confira o pagamento antes de confirmar.');
      const customer = sale.type === 'fiado' && sale.customerId ? await transaction.get(doc(db, 'customers', sale.customerId)) : null;
      const deductions = new Map<string, number>();
      const stockProducts = new Map<string, Product>();
      for (const snapshot of snapshots) {
        if (!snapshot.exists() || snapshot.data().mergedIntoId) throw new Error('Um produto não está mais disponível. Atualize o carrinho.');
        stockProducts.set(snapshot.id, normalizeCigaretteStock(snapshot.data() as Product));
      }
      for (const item of items) {
        const product = stockProducts.get(item.productId)!;
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error('Quantidade inválida.');
        if (!Number.isFinite(item.price) || item.price <= 0) throw new Error('Preço de venda inválido.');
        const units = item.stockDeduction ?? (product.type === 'cigarro'
          ? getCigaretteFormats(product).find(format => format.label === item.format)?.units
          : /^(Fardo|Pacote) \(/.test(item.format) ? product.unitsPerPackage : 1);
        if (!units || !isValidStockQuantity(units)) throw new Error('Formato inválido.');
        if (units !== productFormatUnits(product, item.format)) throw new Error('A medida do produto mudou. Confira o carrinho.');
        if (product.type === 'cigarro' && !getCigaretteFormats(product).some(format => format.label === item.format && format.units === units && format.price === item.price)) throw new Error('O preço ou formato mudou. Confira o carrinho.');
        deductions.set(item.productId, (deductions.get(item.productId) || 0) + Math.round(units * 20) * item.quantity);
      }
      const balances = new Map<string, number>();
      for (const [id, deduction] of deductions) {
        const product = stockProducts.get(id)!;
        if (!isValidStockQuantity(product.stock)) throw new Error(`Estoque inválido para ${product.name}. Confira a contagem.`);
        const balance = Math.round(product.stock * 20) - deduction;
        balances.set(id, balance / 20);
        if (balance < 0) throw new Error(`Estoque insuficiente para ${product.name}.`);
        transaction.update(doc(db, 'products', id), { ...cigaretteStockFields(product), stock: balance / 20, updatedAt: now });
      }
      if (sale.type === 'fiado') {
        if (!customer?.exists()) throw new Error('Cliente de fiado não encontrado.');
        transaction.update(customer.ref, { totalDebt: Math.round((Number(customer.data().totalDebt) + sale.total) * 100) / 100, lastMovementAt: now, updatedAt: now });
      }
      confirmedSummary = items.map(item => {
        const product = stockProducts.get(item.productId)!;
        return product.type === 'cigarro'
          ? `${item.name} — Venda: ${formatCigaretteStock(Math.round(productFormatUnits(product, item.format) * 20) * item.quantity / 20)}; estoque agora ${formatProductStock(product, balances.get(item.productId)!)}`
          : `${item.quantity}x ${item.name} (${item.format})`;
      }).join('; ');
      transaction.set(saleRef, { ...sale, ...payment, itemsSummary: confirmedSummary || summary, employeeId: empId, employeeName: empName, ownerId: uid, createdAt: now });
      items.forEach((item, index) => transaction.set(itemRefs[index], {
        ...item, stockAfter: balances.get(item.productId), unitCost: stockProducts.get(item.productId)!.unitCost * (item.stockDeduction ?? (productFormatUnits(stockProducts.get(item.productId)!, item.format))), ownerId: uid, createdAt: now
      }));
    });

    reportUsage('venda', uid, sale.total);
    if (sale.type === 'fiado') reportUsage('fiado_lancado', uid, sale.total);
    const typeLabel = paymentLabel(sale);
    const totalQuantity = items.reduce((acc, it) => acc + (it.quantity || 1), 0);

    recordMovement({
      sourceOwnerId: uid,
      timestamp: now,
      employeeId: empId,
      employeeName: empName,
      type: 'sale',
      description: `Venda (${typeLabel}) - ${items.length} item(ns): ${confirmedSummary || summary}`,
      entityId: saleRef.id,
      amount: sale.total,
      quantity: totalQuantity,
      skipSupabaseSync: true
    }).catch(() => {});
  } catch (err) {
    handleCloudError(err, OperationType.WRITE, 'sales (batch)');
  }
});

export const recordPayment = withActionDeadline(async (
  customerId: string, 
  amount: number, 
  method: 'cash'|'card',
  employee?: { id: string; name: string }
) => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  
  const now = Date.now();
  const activeEmp = getActiveEmployeeStorage();
  const empId = employee?.id || activeEmp.id;
  const empName = employee?.name || activeEmp.name;
  const pRef = doc(collection(db, 'payments'));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Pagamento inválido.');
  let customerName = 'Cliente';
  try {
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'customers', customerId);
      const customer = await transaction.get(ref);
      if (!customer.exists()) throw new Error('Cliente não encontrado.');
      customerName = customer.data().name;
      const debtCents = Math.round(Number(customer.data().totalDebt) * 100);
      const amountCents = Math.round(amount * 100);
      if (!Number.isSafeInteger(debtCents) || debtCents < 0) throw new Error('Saldo de fiado inválido. Confira o cadastro do cliente.');
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Pagamento inválido.');
      if (amountCents > debtCents) throw new Error('O pagamento excede o saldo de fiado atual. Atualize o cliente e confira o valor.');
      transaction.update(ref, { totalDebt: (debtCents - amountCents) / 100, lastMovementAt: now, updatedAt: now });
      transaction.set(pRef, { customerId, amount: amountCents / 100, method, employeeId: empId, employeeName: empName, ownerId: uid, createdAt: now });
    });

    recordMovement({
      sourceOwnerId: uid,
      timestamp: now,
      employeeId: empId,
      employeeName: empName,
      type: 'debt_payment',
      description: `Pagamento de Fiado recebido (${method === 'cash' ? 'Dinheiro' : 'Cartão'}) - Cliente: ${customerName}`,
      entityId: customerId,
      entityName: customerName,
      amount: amount
    }).catch(() => {});
  } catch(err) {
    handleCloudError(err, OperationType.WRITE, 'payments (batch)');
  }
});

export const subscribeTodaySales = (callback: (s: Sale[]) => void) => {
  const uid = getEffectiveOwnerId();
  if (!uid) return () => {};
  
  const q = query(
    collection(db, 'sales'),
    where('ownerId', '==', uid)
  );
  return onSnapshot(q, (snapshot) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTs = startOfDay.getTime();

    const allSales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
    const todaySales = allSales
      .filter(s => s.createdAt >= startTs)
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(todaySales);
  }, (error) => handleCloudError(error, OperationType.LIST, 'sales'));
};

export const getSalesByDateRange = async (start: number, end: number): Promise<Sale[]> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthenticated');
  const q = query(
    collection(db, 'sales'),
    where('ownerId', '==', uid)
  );
  try {
    const snapshot = await getDocs(q);
    const allSales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
    // Memory filtering to avoid requiring composite indexes for inequality checks
    return allSales.filter(s => s.createdAt >= start && s.createdAt <= end);
  } catch (error) {
    handleCloudError(error, OperationType.LIST, 'sales');
    return [];
  }
};

export const getSaleItems = async (saleId: string): Promise<SaleItem[]> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const q = query(collection(db, `sales/${saleId}/saleItems`), where('ownerId', '==', uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleItem));
  } catch (error) {
    handleCloudError(error, OperationType.LIST, `sales/${saleId}/saleItems`);
    return [];
  }
};

export const getMonthlyFinancials = async (targetDate: Date = new Date()): Promise<MonthlyFinancials> => {
  const uid = auth.currentUser?.uid;
  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 0, 0, 0, 0).getTime();
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const monthName = `${monthNames[targetDate.getMonth()]} de ${targetDate.getFullYear()}`;

  const defaultResult: MonthlyFinancials = {
    monthName,
    totalGrossSales: 0,
    totalCostOfGoods: 0,
    grossProfit: 0,
    grossMargin: 0,
    cardFeesEstimated: 0,
    totalWithdrawals: 0,
    totalNetProfit: 0,
    netMargin: 0,
    salesCount: 0,
    averageTicket: 0,
    cashSales: 0,
    cardSales: 0,
    fiadoSales: 0,
    totalPurchasesSpent: 0
  };

  if (!uid) return defaultResult;

  try {
    let totalPurchasesSpent = 0;
    try {
      const purchasesSnap = await getDocs(query(collection(db, 'purchases'), where('ownerId', '==', uid)));
      const purchases = purchasesSnap.docs.map(d => d.data() as Purchase);
      purchases.filter(p => p.createdAt >= start && p.createdAt <= end).forEach(p => {
        totalPurchasesSpent += p.totalCost || 0;
      });
    } catch (e) {
      console.warn('Could not fetch purchases for monthly financials:', e);
    }

    const sales = await getSalesByDateRange(start, end);
    if (sales.length === 0) {
      return {
        ...defaultResult,
        totalPurchasesSpent
      };
    }

    let totalGrossSales = 0;
    let cashSales = 0;
    let cardSales = 0;
    let fiadoSales = 0;

    sales.forEach(s => {
      totalGrossSales += s.total || 0;
      if (s.type === 'cash') cashSales += s.total || 0;
      else if (s.type === 'card') cardSales += s.total || 0;
      else if (s.type === 'fiado') fiadoSales += s.total || 0;
    });

    let totalCostOfGoods = 0;
    const itemsPromises = sales.map(async s => {
      if (!s.id) return [];
      return await getSaleItems(s.id);
    });
    const allItemsArrays = await Promise.all(itemsPromises);

    allItemsArrays.forEach((items, idx) => {
      if (items.length > 0) {
        items.forEach(item => {
          totalCostOfGoods += (item.unitCost || 0) * (item.quantity || 1);
        });
      } else {
        const saleTotal = sales[idx]?.total || 0;
        totalCostOfGoods += saleTotal * 0.7; // default 30% margin fallback
      }
    });

    let totalWithdrawals = 0;
    try {
      const closuresSnap = await getDocs(query(collection(db, 'cashClosures'), where('ownerId', '==', uid)));
      const closures = closuresSnap.docs.map(d => d.data() as CashClosure);
      closures.filter(c => c.closedAt >= start && c.closedAt <= end).forEach(c => {
        totalWithdrawals += c.withdrawals || 0;
      });
    } catch (e) {
      console.warn('Could not fetch closures for withdrawals:', e);
    }

    const grossProfit = Math.max(0, totalGrossSales - totalCostOfGoods);
    const grossMargin = totalGrossSales > 0 ? (grossProfit / totalGrossSales) * 100 : 0;
    const cardFeesEstimated = cardSales * 0.02; // taxa de aprox 2% em cartao
    const totalNetProfit = grossProfit - cardFeesEstimated - totalWithdrawals;
    const netMargin = totalGrossSales > 0 ? (totalNetProfit / totalGrossSales) * 100 : 0;

    return {
      monthName,
      totalGrossSales,
      totalCostOfGoods,
      grossProfit,
      grossMargin,
      cardFeesEstimated,
      totalWithdrawals,
      totalNetProfit,
      netMargin,
      salesCount: sales.length,
      averageTicket: sales.length > 0 ? totalGrossSales / sales.length : 0,
      cashSales,
      cardSales,
      fiadoSales,
      totalPurchasesSpent
    };
  } catch (error) {
    console.error('Error calculating monthly financials:', error);
    return defaultResult;
  }
};

// ---------------------------------------------------------------------------
// CASH CLOSURES (FECHAMENTO DE CAIXA)
// ---------------------------------------------------------------------------
export const saveCashClosure = withActionDeadline(async (closure: Omit<CashClosure, 'id'|'ownerId'|'createdAt'>): Promise<string> => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');
  const path = 'cashClosures';
  const activeEmp = getActiveEmployeeStorage();
  const empId = closure.employeeId || activeEmp.id;
  const empName = closure.employeeName || activeEmp.name;

  try {
    const ref = doc(collection(db, path));
    const now = Date.now();
    await setDoc(ref, {
      ...removeUndefinedFields(closure as any),
      employeeId: empId,
      employeeName: empName,
      ownerId: uid,
      createdAt: now
    });

    recordMovement({
      sourceOwnerId: uid,
      timestamp: now,
      employeeId: empId,
      employeeName: empName,
      type: 'cash_closure',
      description: `Fechamento de Caixa da data ${closure.date}`,
      entityId: ref.id,
      amount: closure.totalSales
    }).catch(() => {});

    return ref.id;
  } catch (err) {
    handleCloudError(err, OperationType.CREATE, path);
    return '';
  }
});

export const subscribeCashClosures = (callback: (closures: CashClosure[]) => void) => {
  const uid = getEffectiveOwnerId();
  if (!uid) return () => {};
  const q = query(collection(db, 'cashClosures'), where('ownerId', '==', uid));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashClosure));
    data.sort((a, b) => b.closedAt - a.closedAt);
    callback(data);
  }, (error) => handleCloudError(error, OperationType.LIST, 'cashClosures'));
};

// ---------------------------------------------------------------------------
// ACCOUNT DELETION
// ---------------------------------------------------------------------------
export const deleteEntireAccountData = async (): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Entre na sua conta para excluir os dados.');
  const { error } = await supabase.rpc('eu_clear_account_data');
  if (error) throw new Error(error.message);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('cloud-refresh'));
};


export const subscribePurchases = (callback: (purchases: Purchase[]) => void) => {
  const uid = getEffectiveOwnerId();
  if (!uid) return () => {};
  const q = query(collection(db, 'purchases'), where('ownerId', '==', uid));
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase));
    list.sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  }, (error) => handleCloudError(error, OperationType.LIST, 'purchases'));
};

async function resolveActiveProduct(transaction: { get: typeof getDoc }, productId: string) {
  const visited = new Set<string>();
  let snapshot = await transaction.get(doc(db, 'products', productId));
  while (snapshot.exists() && snapshot.data().mergedIntoId) {
    if (visited.has(snapshot.id) || visited.size >= 20) throw new Error('Não foi possível localizar o produto mesclado.');
    visited.add(snapshot.id);
    snapshot = await transaction.get(doc(db, 'products', snapshot.data().mergedIntoId));
  }
  return snapshot;
}

export const recordPurchase = withActionDeadline(async (
  purchase: Omit<Purchase, 'id' | 'ownerId' | 'createdAt'>,
  options?: { 
    updateProductStock?: boolean; 
    updateUnitCost?: boolean;
    updateExpirationDate?: boolean;
    updatePromoPrice?: boolean;
  }
) => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');

  const now = Date.now();
  const purchaseRef = doc(collection(db, 'purchases'));

  const cleanPurchase = removeUndefinedFields(purchase as any);
  try {
    await runTransaction(db, async batch => {
      batch.set(purchaseRef, {
        ...cleanPurchase,
        ownerId: uid,
        createdAt: now
      });

      // Atualizar automaticamente o estoque do produto sem precisar abrir o modal
      if (purchase.productId && (options?.updateProductStock !== false || options?.updateUnitCost || options?.updateExpirationDate || options?.updatePromoPrice)) {
        const prodDoc = await resolveActiveProduct(batch, purchase.productId);
        const prodRef = prodDoc.ref;
        if (prodDoc.exists()) {
          const p = normalizeCigaretteStock(prodDoc.data() as Product);
          const updatePayload: any = {
            ...cigaretteStockFields(p),
            updatedAt: now
          };

          if (options?.updateProductStock !== false) {
            updatePayload.stock = Math.max(0, Math.round(((p.stock || 0) + purchase.quantity) * 20) / 20);
          }

          if (options?.updateUnitCost && purchase.unitCost > 0) {
            updatePayload.unitCost = purchase.unitCost;
          }

          if (options?.updateExpirationDate && purchase.expirationDate) {
            updatePayload.expirationDate = purchase.expirationDate;
          }

          if (options?.updatePromoPrice && purchase.suggestedPromoPrice !== undefined && purchase.suggestedPromoPrice > 0) {
            updatePayload.hasPromoSuggestion = purchase.suggestPromo !== false;
            updatePayload.promoPrice = purchase.suggestedPromoPrice;
            if (purchase.promoDiscountPercent !== undefined) {
              updatePayload.promoDiscountPercent = purchase.promoDiscountPercent;
            }
          }

          batch.update(prodRef, removeUndefinedFields(updatePayload));
        }
      }

    });

    reportUsage('compra_registrada', uid, purchase.totalCost || 0);
    const activeEmp = getActiveEmployeeStorage();
    recordMovement({
      sourceOwnerId: uid,
      timestamp: now,
      employeeId: purchase.employeeId || activeEmp.id,
      employeeName: purchase.employeeName || activeEmp.name,
      type: 'stock_in',
      description: `Entrada de Estoque / Compra: +${purchase.quantity} un de "${purchase.productName}"`,
      entityId: purchase.productId,
      entityName: purchase.productName,
      quantity: purchase.quantity,
      amount: purchase.totalCost
    }).catch(() => {});

    return purchaseRef.id;
  } catch (err) {
    handleCloudError(err, OperationType.WRITE, 'purchases');
    throw err;
  }
});

export const deletePurchase = withActionDeadline(async (purchaseId: string, revertStock?: { productId: string; quantityToSubtract: number }) => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');

  try {
    await runTransaction(db, async batch => {
      batch.delete(doc(db, 'purchases', purchaseId));

      if (revertStock?.productId && revertStock.quantityToSubtract > 0) {
        const prodDoc = await resolveActiveProduct(batch, revertStock.productId);
        const prodRef = prodDoc.ref;
        if (prodDoc.exists()) {
          const p = prodDoc.data() as Product;
          const newStock = Math.max(0, Math.round(((p.stock || 0) - revertStock.quantityToSubtract) * 20) / 20);
          batch.update(prodRef, { stock: newStock, updatedAt: Date.now() });
        }
      }

    });
  } catch (err) {
    handleCloudError(err, OperationType.DELETE, `purchases/${purchaseId}`);
    throw err;
  }
});


export const getPurchasesByDateRange = async (startTimestamp: number, endTimestamp: number): Promise<Purchase[]> => {
  const uid = getEffectiveOwnerId();
  if (!uid) return [];
  try {
    const q = query(
      collection(db, 'purchases'),
      where('ownerId', '==', uid)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Purchase));
    return list
      .filter(p => p.createdAt >= startTimestamp && p.createdAt <= endTimestamp)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    handleCloudError(err, OperationType.LIST, 'purchases');
    return [];
  }
};

// ---------------------------------------------------------------------------
// FEEDBACK & USER SUGGESTIONS
// ---------------------------------------------------------------------------
export const submitFeedback = withActionDeadline(async (feedbackData: {
  category: string;
  message: string;
  rating?: number;
  contact?: string;
  storeName?: string;
}): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Você precisa estar autenticado para enviar feedback.');
  }

  const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const feedbackDoc: Feedback = {
    ownerId: uid,
    userEmail: auth.currentUser?.email || '',
    category: feedbackData.category,
    message: feedbackData.message.trim(),
    createdAt: Date.now()
  };

  if (feedbackData.rating && feedbackData.rating >= 1 && feedbackData.rating <= 5) {
    feedbackDoc.rating = feedbackData.rating;
  }
  if (feedbackData.contact?.trim()) {
    feedbackDoc.contact = feedbackData.contact.trim();
  }
  if (feedbackData.storeName?.trim()) {
    feedbackDoc.storeName = feedbackData.storeName.trim();
  }

  try {
    await setDoc(doc(db, 'feedbacks', feedbackId), feedbackDoc);
  } catch (err) {
    handleCloudError(err, OperationType.WRITE, `feedbacks/${feedbackId}`);
    throw err;
  }
  // The confirmed cloud record remains the source of truth if Sheets is unavailable.
  void exportFeedbackToSheets(feedbackId, getEffectiveOwnerId());
});

export const subscribeFeedbacks = (callback: (feedbacks: Feedback[]) => void, onError?: (error: unknown) => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  const q = query(
    collection(db, 'feedbacks'),
    where('ownerId', '==', uid)
  );

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Feedback));
    list.sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  }, (err) => { if (onError) onError(err); else handleCloudError(err, OperationType.LIST, 'feedbacks'); });
};

// ---------------------------------------------------------------------------
// ACTIVE EMPLOYEE STORAGE HELPER
// ---------------------------------------------------------------------------
export const getActiveEmployeeStorage = (): { id: string; name: string; role?: string } => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('eu_gerencio_active_employee') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.name) {
        return {
          id: parsed.id || 'employee',
          name: parsed.name,
          role: parsed.role || 'Operador'
        };
      }
    }
  } catch {}
  return {
    id: 'owner',
    name: 'Proprietário / Gerente',
    role: 'Administrador'
  };
};

export const setActiveEmployeeStorage = (employee: { id: string; name: string; role?: string } | null) => {
  try {
    if (typeof window !== 'undefined') {
      if (employee) {
        localStorage.setItem('eu_gerencio_active_employee', JSON.stringify(employee));
      } else {
        localStorage.removeItem('eu_gerencio_active_employee');
      }
    }
  } catch {}
};

// ---------------------------------------------------------------------------
// EMPLOYEES (FUNCIONÁRIOS DO ESTABELECIMENTO)
// ---------------------------------------------------------------------------
export const subscribeEmployees = (callback: (employees: Employee[]) => void) => {
  const uid = getEffectiveOwnerId();
  if (!uid) return () => {};

  const q = query(
    collection(db, 'employees'),
    where('ownerId', '==', uid)
  );

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
    list.sort((a, b) => a.name.localeCompare(b.name));
    callback(list);
  }, (err) => handleCloudError(err, OperationType.LIST, 'employees'));
};

export const addEmployee = withActionDeadline(async (
  employee: Omit<Employee, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');

  const ref = doc(collection(db, 'employees'));
  const now = Date.now();
  const cleanData = removeUndefinedFields({
    ...employee,
    isActive: employee.isActive ?? true,
    ownerId: uid,
    createdAt: now,
    updatedAt: now
  });

  try {
    await setDoc(ref, cleanData);
    return ref.id;
  } catch (err) {
    handleCloudError(err, OperationType.CREATE, 'employees');
    throw err;
  }
});

export const updateEmployee = withActionDeadline(async (id: string, data: Partial<Employee>): Promise<void> => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');

  try {
    const cleanData = removeUndefinedFields({
      ...data,
      updatedAt: Date.now()
    });
    await updateDoc(doc(db, 'employees', id), cleanData);
  } catch (err) {
    handleCloudError(err, OperationType.UPDATE, `employees/${id}`);
    throw err;
  }
});

export const deleteEmployee = withActionDeadline(async (id: string, employeeName?: string): Promise<void> => {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Unauthenticated');

  try {
    await deleteDoc(doc(db, 'employees', id));

    const activeEmp = getActiveEmployeeStorage();
    recordMovement({
      sourceOwnerId: uid,
      timestamp: Date.now(),
      employeeId: activeEmp.id,
      employeeName: activeEmp.name,
      employeeRole: activeEmp.role,
      type: 'employee_logout',
      description: `Funcionário excluído da equipe: "${employeeName || id}"`,
      entityId: id,
      entityName: employeeName
    }).catch(() => {});
  } catch (err) {
    handleCloudError(err, OperationType.DELETE, `employees/${id}`);
    throw err;
  }
});

// ---------------------------------------------------------------------------
// MOVEMENTS & AUDIT HISTORY (HISTÓRICO DE MOVIMENTAÇÃO)
// ---------------------------------------------------------------------------
export const recordMovement = withActionDeadline(async (
  movement: {
    sourceOwnerId?: string; // Capture the mutation store; late responses never create logs in another account.
    type: MovementType;
    description: string;
    timestamp?: number;
    employeeId?: string;
    employeeName?: string;
    employeeRole?: string;
    entityId?: string;
    entityName?: string;
    quantity?: number;
    amount?: number;
    previousValue?: string | number;
    newValue?: string | number;
    notes?: string;
    skipSupabaseSync?: boolean;
  }
): Promise<string> => {
  const uid = getEffectiveOwnerId();
  if (movement.sourceOwnerId && movement.sourceOwnerId !== uid) return '';
  if (!uid) return '';

  const now = Date.now();
  const ref = doc(collection(db, 'movements'));
  const activeEmp = getActiveEmployeeStorage();

  const payload: Movement = {
    timestamp: movement.timestamp || now,
    employeeId: movement.employeeId || activeEmp.id,
    employeeName: movement.employeeName || activeEmp.name,
    employeeRole: movement.employeeRole || activeEmp.role || 'Operador',
    type: movement.type,
    description: movement.description,
    entityId: movement.entityId,
    entityName: movement.entityName,
    quantity: movement.quantity,
    amount: movement.amount,
    previousValue: movement.previousValue,
    newValue: movement.newValue,
    notes: movement.notes,
    ownerId: uid,
    createdAt: now
  };

  const cleanPayload = removeUndefinedFields(payload as any);

  try {
    await setDoc(ref, cleanPayload);
    if (getEffectiveOwnerId() !== uid) return ref.id;
    // Dispatch local event for instant UI awareness
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('movement-recorded', { detail: cleanPayload }));
    }

    postToGoogleSheets({ tipo: movement.type, descricao: movement.description, valor: movement.amount,
      quantidade: movement.quantity, produto: movement.entityName, created_at: new Date(movement.timestamp || now).toISOString() }).catch(() => {});

    return ref.id;
  } catch (err) {
    console.warn('Movement record failed softly:', err);
    return '';
  }
});

export const subscribeMovements = (callback: (movements: Movement[]) => void) => {
  const uid = getEffectiveOwnerId();
  if (!uid) return () => {};

  const q = query(
    collection(db, 'movements'),
    where('ownerId', '==', uid)
  );

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Movement));
    list.sort((a, b) => b.timestamp - a.timestamp);
    callback(list);
  }, (err) => handleCloudError(err, OperationType.LIST, 'movements'));
};

export const getMovementsByDateRange = async (
  startTimestamp: number,
  endTimestamp: number,
  employeeId?: string,
  type?: string
): Promise<Movement[]> => {
  const uid = getEffectiveOwnerId();
  if (!uid) return [];

  try {
    const q = query(
      collection(db, 'movements'),
      where('ownerId', '==', uid)
    );
    const snap = await getDocs(q);
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Movement));

    // Memory filter
    list = list.filter(m => m.timestamp >= startTimestamp && m.timestamp <= endTimestamp);

    if (employeeId && employeeId !== 'all') {
      list = list.filter(m => m.employeeId === employeeId);
    }

    if (type && type !== 'all') {
      list = list.filter(m => m.type === type);
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    handleCloudError(err, OperationType.LIST, 'movements');
    return [];
  }
};

// ---------------------------------------------------------------------------
// TEAM INVITATIONS & SUB-ACCOUNTS (SUB-CONTA DO ESTABELECIMENTO)
// ---------------------------------------------------------------------------
export const createTeamInvitation = withActionDeadline(async (data: {
  email: string;
  name: string;
  role: string;
  phone?: string;
  pin?: string;
}): Promise<{ inviteId: string; inviteUrl: string }> => {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error('Unauthenticated');

  const ref = doc(collection(db, 'teamInvitations'));
  const now = Date.now();
  const cleanEmail = data.email.trim().toLowerCase();

  // Ler o nome da loja
  let storeName = 'Nosso Estabelecimento';
  try {
    const settingsSnap = await getDoc(doc(db, 'settings', currentUid));
    if (settingsSnap.exists() && settingsSnap.data()?.storeName) {
      storeName = settingsSnap.data().storeName;
    }
  } catch {}

  const invitation = {
    ownerId: currentUid,
    storeName,
    email: cleanEmail,
    name: data.name.trim(),
    role: data.role,
    phone: data.phone?.trim() || undefined,
    pin: data.pin?.trim() || undefined,
    status: 'pending',
    createdAt: now
  };

  await setDoc(ref, removeUndefinedFields(invitation as any));

  // Assegurar que o funcionário também existe na coleção employees do estabelecimento
  try {
    const empQ = query(
      collection(db, 'employees'), 
      where('ownerId', '==', currentUid),
      where('email', '==', cleanEmail)
    );
    const empSnap = await getDocs(empQ);
    if (empSnap.empty) {
      const empRef = doc(collection(db, 'employees'));
      await setDoc(empRef, removeUndefinedFields({
        name: data.name.trim(),
        role: data.role,
        email: cleanEmail,
        phone: data.phone?.trim() || undefined,
        pin: data.pin?.trim() || undefined,
        isActive: true,
        color: 'bg-emerald-500',
        ownerId: currentUid,
        createdAt: now,
        updatedAt: now
      }));
    }
  } catch (err) {
    console.warn('Could not auto-sync employee record:', err);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = `${origin}?invite=${ref.id}&store=${currentUid}`;

  return { inviteId: ref.id, inviteUrl };
});

export const getStoreInvitationById = async (inviteId: string): Promise<TeamInvitation | null> => {
  if (!inviteId) return null;
  try {
    const invRef = doc(db, 'teamInvitations', inviteId);
    const invSnap = await getDoc(invRef);
    if (invSnap.exists()) {
      return { id: invSnap.id, ...invSnap.data() } as TeamInvitation;
    }
    return null;
  } catch {
    return null;
  }
};

export const checkAndAcceptPendingInvitation = async (
  userUid: string,
  userEmail: string,
  inviteIdFromUrl?: string | null
): Promise<ActiveStoreSession | null> => {
  if (!userUid || !userEmail) return null;

  const cleanEmail = userEmail.trim().toLowerCase();
  setActiveStoreSession(null);

  try {
    // 1. Verificar se o usuário já tem uma associação ativa de sub-conta
    const userStoreRef = doc(db, 'userStores', userUid);
    const userStoreSnap = await getDoc(userStoreRef);
    if (userStoreSnap.exists()) {
      const data = userStoreSnap.data() as UserStore;
      const session: ActiveStoreSession = {
        storeOwnerId: data.ownerId,
        storeName: data.storeName,
        isEmployee: data.ownerId !== userUid,
        employeeId: userUid,
        employeeName: data.name,
        employeeRole: data.role,
        employeeEmail: data.email
      };
      setActiveStoreSession(session);
      return session;
    }

    // 2. Se houver inviteId na URL ou convite pendente por e-mail
    let targetInvite: TeamInvitation | null = null;
    let targetDocId = '';

    if (inviteIdFromUrl) {
      const invRef = doc(db, 'teamInvitations', inviteIdFromUrl);
      const invSnap = await getDoc(invRef);
      if (invSnap.exists()) {
        const invData = invSnap.data() as TeamInvitation;
        if (invData.status === 'pending' && invData.email.toLowerCase() === cleanEmail) {
          targetInvite = invData;
          targetDocId = invSnap.id;
        }
      }
    }

    if (!targetInvite) {
      const q = query(
        collection(db, 'teamInvitations'),
        where('email', '==', cleanEmail),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        targetInvite = snap.docs[0].data() as TeamInvitation;
        targetDocId = snap.docs[0].id;
      }
    }

    if (targetInvite) {
      const now = Date.now();
      const { data: accepted, error } = await supabase.rpc('eu_accept_invitation', { invite_id: targetDocId });
      if (error) throw new Error(error.message);
      if (!accepted || accepted.ownerId !== targetInvite.ownerId) throw new Error('Não foi possível confirmar o vínculo com a loja.');

      const session: ActiveStoreSession = {
        storeOwnerId: targetInvite.ownerId,
        storeName: targetInvite.storeName,
        isEmployee: true,
        employeeId: userUid,
        employeeName: targetInvite.name,
        employeeRole: targetInvite.role,
        employeeEmail: cleanEmail
      };
      setActiveStoreSession(session);

      // Definir funcionário ativo no turno
      setActiveEmployeeStorage({
        id: userUid,
        name: targetInvite.name,
        role: targetInvite.role
      });

      // Gravar no histórico de movimentações da loja
      recordMovement({
      sourceOwnerId: targetInvite.ownerId,
        timestamp: now,
        employeeId: userUid,
        employeeName: targetInvite.name,
        employeeRole: targetInvite.role,
        type: 'employee_login',
        description: `Colaborador ${targetInvite.name} (${targetInvite.role}) entrou pelo link de convite e ativou a sub-conta do estabelecimento.`,
        entityId: targetDocId,
        entityName: targetInvite.name
      }).catch(() => {});

      return session;
    }

    return null;
  } catch (err) {
    console.warn('Não foi possível confirmar a loja da conta.');
    throw err;
  }
};

export const leaveStoreSubAccount = async (userUid: string) => {
  try {
    await deleteDoc(doc(db, 'userStores', userUid));
  } catch {}
  setActiveStoreSession(null);
  setActiveEmployeeStorage(null);
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
};

// ---------------------------------------------------------------------------
// CUSTOMER SALES & PAYMENTS LEDGER (HISTÓRICO DO FIADO / CADERNETA)
// ---------------------------------------------------------------------------
export const subscribeCustomerSales = (
  customerId: string,
  callback: (sales: Sale[]) => void
) => {
  const uid = getEffectiveOwnerId();
  if (!uid || !customerId) return () => {};

  const q = query(
    collection(db, 'sales'),
    where('ownerId', '==', uid),
    where('customerId', '==', customerId)
  );

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale));
    list.sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  }, (err) => handleCloudError(err, OperationType.LIST, 'sales/byCustomer'));
};

export const subscribeCustomerPayments = (
  customerId: string,
  callback: (payments: Payment[]) => void
) => {
  const uid = getEffectiveOwnerId();
  if (!uid || !customerId) return () => {};

  const q = query(
    collection(db, 'payments'),
    where('ownerId', '==', uid),
    where('customerId', '==', customerId)
  );

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
    list.sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  }, (err) => handleCloudError(err, OperationType.LIST, 'payments/byCustomer'));
};

export const getSaleItemsForSale = async (saleId: string): Promise<SaleItem[]> => {
  const uid = getEffectiveOwnerId();
  if (!uid || !saleId) return [];
  try {
    const snap = await getDocs(collection(db, `sales/${saleId}/saleItems`));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleItem));
  } catch {
    return [];
  }
};


async function deleteMultipleProductsImpl(ids: string[]) {
  if (!ids || ids.length === 0) return;
  const { doc, writeBatch } = await import('./cloudStore');
  const batch = writeBatch(db);
  
  ids.forEach(id => {
    const ref = doc(db, 'products', id);
    batch.delete(ref);
  });
  
  await batch.commit();
}

export const deleteMultipleProducts = withActionDeadline(deleteMultipleProductsImpl);


export async function getProductDuplicates(candidate: Pick<Product, 'name' | 'barcode'>, excludeId?: string) {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Entre na sua conta.');
  const snapshot = await getDocs(query(collection(db, 'products'), where('ownerId', '==', uid)));
  return findDuplicateProducts(candidate, snapshot.docs.map(row => normalizeCigaretteStock({ ...row.data(), id: row.id } as Product)), excludeId);
}

// Preserve the original record for historical sales and purchases; hide it from active lists.
export const mergeProducts = withProductWriteQueue(async (targetId: string, sourceId: string) => {
  if (targetId === sourceId) throw new Error('Escolha dois produtos diferentes.');
  const uid = getEffectiveOwnerId();
  await runTransaction(db, async transaction => {
    const targetRef = doc(db, 'products', targetId), sourceRef = doc(db, 'products', sourceId);
    const [targetDoc, sourceDoc] = await Promise.all([transaction.get(targetRef), transaction.get(sourceRef)]);
    if (!targetDoc.exists() || !sourceDoc.exists()) throw new Error('Produto não encontrado.');
    const target = normalizeCigaretteStock(targetDoc.data() as Product), source = normalizeCigaretteStock(sourceDoc.data() as Product);
    if (target.ownerId !== uid || source.ownerId !== uid || target.mergedIntoId || source.mergedIntoId) throw new Error('Estes produtos não estão disponíveis para mesclar.');
    if (!isDuplicateProduct(target, source)) throw new Error('Os produtos não correspondem. Atualize a lista.');
    if (target.type !== source.type) throw new Error('Não é possível somar carteiras de cigarro com unidades comuns. Corrija o tipo antes de mesclar.');
    const stock = (Math.round(target.stock * 20) + Math.round(source.stock * 20)) / 20;
    if (!isValidStockQuantity(stock)) throw new Error('Estoque inválido.');
    const now = Date.now();
    transaction.update(targetRef, { ...cigaretteStockFields(target), stock, initialStock: (Math.round((target.initialStock ?? target.stock) * 20) + Math.round((source.initialStock ?? source.stock) * 20)) / 20, updatedAt: now });
    transaction.update(sourceRef, { ...cigaretteStockFields(source), stock: 0, initialStock: 0, mergedIntoId: targetId, mergedAt: now, updatedAt: now });
  });
});

/** Owner-scoped history, paginated to avoid Supabase's default row limit. */
export async function getProductSalesTotals(products: Product[], signal?: AbortSignal): Promise<Record<string, number>> {
  const ownerId = getEffectiveOwnerId();
  if (!ownerId) return {};
  const byId = new Map(products.map(product => [product.id, product]));
  const totals: Record<string, number> = Object.create(null);
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from('eu_sale_items').select('id,collection_path,data')
      .eq('owner_id', ownerId).order('collection_path').order('id').range(offset, offset + 999)
      .abortSignal(signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000));
    if (result.error) throw new Error('Não foi possível consultar os produtos mais vendidos.');
    if (getEffectiveOwnerId() !== ownerId) throw new Error('A sessão da loja mudou.');
    const rows = result.data || [];
    for (const row of rows) {
      const item = row.data as SaleItem;
      if (!byId.has(item.productId)) continue;
      totals[item.productId] = Math.round(((totals[item.productId] || 0) + soldBaseQuantity(item, byId.get(item.productId))) * 10000) / 10000;
    }
    if (rows.length < 1000) return totals;
  }
}


/** Resumable migration: one image at a time; stale photos and stock are never overwritten. */
export async function migrateProductImages(products: Product[], shouldContinue: () => boolean = () => true): Promise<number> {
  const ownerId = getEffectiveOwnerId();
  if (!ownerId) return 0;
  let migrated = 0;
  for (const product of products) {
    if (!shouldContinue() || getEffectiveOwnerId() !== ownerId) break;
    if (!product.id || !isEmbeddedProductImage(product.imageUrl)) continue;
    const original = product.imageUrl;
    const imageUrl = await storeProductImage(original,ownerId);
    if (!shouldContinue() || getEffectiveOwnerId() !== ownerId) break;
    const updated = await runTransaction(db,async transaction => {
      const ref = doc(db,'products',product.id!);
      const current = await transaction.get(ref);
      if (!shouldContinue() || getEffectiveOwnerId() !== ownerId || !current.exists() || current.data().ownerId !== ownerId || current.data().imageUrl !== original) return false;
      transaction.update(ref,{imageUrl,updatedAt:Date.now()});
      return true;
    });
    if (updated) migrated++;
  }
  return migrated;
}


/** One lightweight paginated pass for legacy customers; new financial writes carry their timestamp. */
export async function getCustomerLastMovements(): Promise<Record<string, number>> {
  const ownerId=getEffectiveOwnerId();
  if(!ownerId)return {};
  const maps=await Promise.all(['eu_sales','eu_payments'].map(async table=>{
    const result:Record<string,number>=Object.create(null);
    for(let offset=0;;offset+=1000){
      let request=supabase.from(table).select('customer_id:data->>customerId,created_at:data->>createdAt').eq('owner_id',ownerId);
      if(table==='eu_sales')request=request.eq('data->>type','fiado');
      const {data,error}=await request.order('collection_path').order('id').range(offset,offset+999).abortSignal(AbortSignal.timeout(15000));
      if(error)throw new Error('Não foi possível consultar as datas do fiado.');
      if(getEffectiveOwnerId()!==ownerId)throw new Error('A sessão da loja mudou.');
      for(const row of data||[]){
        const timestamp=Number(row.created_at);
        if(typeof row.customer_id==='string'&&Number.isFinite(timestamp)&&timestamp>0)result[row.customer_id]=Math.max(result[row.customer_id]||0,timestamp);
      }
      if((data||[]).length<1000)return result;
    }
  }));
  const combined:Record<string,number>=Object.create(null);
  for(const map of maps)for(const [id,time]of Object.entries(map))combined[id]=Math.max(combined[id]||0,time);
  return combined;
}

// Stable entry IDs make retries safe, including after a request timeout.
export const importDebtNotebook = withActionDeadline(async (entries: NotebookEntry[], confirmed: boolean) => {
 if (confirmed !== true) throw new Error('Confirme a conferência antes de salvar');
 validateNotebook(entries);
 const ownerId = getEffectiveOwnerId();
 if (!ownerId) throw new Error('Unauthenticated');
 const refs = entries.map(entry => doc(db, 'customers', entry.customerId || `notebook_${entry.id}`));
 return runTransaction(db, async transaction => {
  const snapshots = await Promise.all(refs.map(ref=>transaction.get(ref)));
  const pending = new Map<string, any>();
  entries.forEach((entry,index) => {
   const existing = pending.get(refs[index].id) || (snapshots[index].exists() ? snapshots[index].data() : null);
   if (entry.customerId && !existing) throw new Error('Cliente não encontrado');
   if (existing && existing.ownerId !== ownerId) throw new Error('Cliente de outra loja');
   if (existing?.debtImports?.some((item: {id:string})=>item.id===entry.id)) return;
   const now = Date.now();
   const description = `Importado da caderneta em ${new Date(now).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'})}`;
   const customer = existing || {name:entry.name.trim(),previousDebt:0,totalDebt:0,ownerId,createdAt:now};
   pending.set(refs[index].id, {...customer,totalDebt:(Math.round(customer.totalDebt*100)+moneyCents(entry.amount))/100,updatedAt:now,lastMovementAt:now,
    debtImports:[...(customer.debtImports || []),{id:entry.id,createdAt:now,description,amount:moneyCents(entry.amount)/100,lines:entry.lines.map(line=>({description:line.description,amount:moneyCents(line.amount)/100})),readTotal:entry.readTotal,summedTotal:notebookSum(entry.lines)}]});
  });
  for(const [id,data] of pending) transaction.set(doc(db,'customers',id),data);
 });
});

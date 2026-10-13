import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  postToGoogleSheets,
  GOOGLE_SHEETS_WEBHOOK_URL,
  getGoogleSheetsWebhookUrl,
  setGoogleSheetsWebhookUrl,
  testGoogleSheetsWebhook,
  getGoogleSheetsLogs,
  clearGoogleSheetsLogs,
  isGoogleSheetsWebhookEnabled,
  setGoogleSheetsWebhookEnabled,
  GoogleSheetsMovementPayload,
  GoogleSheetsWebhookLog
} from './googleSheets';

export {
  postToGoogleSheets,
  GOOGLE_SHEETS_WEBHOOK_URL,
  getGoogleSheetsWebhookUrl,
  setGoogleSheetsWebhookUrl,
  testGoogleSheetsWebhook,
  getGoogleSheetsLogs,
  clearGoogleSheetsLogs,
  isGoogleSheetsWebhookEnabled,
  setGoogleSheetsWebhookEnabled
};
export type { GoogleSheetsMovementPayload, GoogleSheetsWebhookLog };

// Credenciais oficiais do Supabase fornecidas
// O SDK Supabase requer a URL base sem o caminho '/rest/v1/' para evitar o erro PGRST125
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://zixwpheatwyptkqpzgdg.supabase.co').replace(/\/$/, '');
export const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1/`;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppeHdwaGVhdHd5cHRrcXB6Z2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MTkxNDUsImV4cCI6MjEwNjM5NTE0NX0.ioEXPQlmL-5bRyZuChmoxkg2veYNMi8lSD6_BehyuAU';

// Comando SQL para o usuário rodar no SQL Editor do Supabase para liberar o acesso
export const SUPABASE_FIX_RLS_SQL = `-- Executar no SQL Editor do Supabase para liberar o acesso às tabelas:
ALTER TABLE "PRODUTOS" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "MOVIMENTAÇOES" DISABLE ROW LEVEL SECURITY;
GRANT ALL ON "PRODUTOS" TO anon;
GRANT ALL ON "MOVIMENTAÇOES" TO anon;
`;

// Helper para normalizar o mapeamento de tabelas (ex: 'produtos' -> 'PRODUTOS' e 'movimentacoes' -> 'MOVIMENTAÇOES')
function createMappedSupabaseClient(url: string, key: string): SupabaseClient {
  const rawClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  const originalFrom = rawClient.from.bind(rawClient);
  rawClient.from = function (table: string) {
    let target = table;
    const normalized = (table || '').trim().toLowerCase();
    if (normalized === 'produtos' || normalized === 'produto') {
      target = 'PRODUTOS';
    } else if (
      normalized === 'movimentacoes' ||
      normalized === 'movimentações' ||
      normalized === 'movimentacao' ||
      normalized === 'movimentação'
    ) {
      target = 'MOVIMENTAÇOES';
    }
    return originalFrom(target);
  } as any;

  return rawClient;
}

// Inicializa o cliente principal do Supabase
export const supabase: SupabaseClient = (() => {
  try {
    const client = createMappedSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    if (typeof window !== 'undefined') {
      (window as any).supabaseSdk = (window as any).supabase;
      (window as any).supabase = client;
      (window as any).supabaseClient = client;
      (window as any).SUPABASE_CONFIG = {
        url: SUPABASE_URL,
        restUrl: SUPABASE_REST_URL,
        anonKey: SUPABASE_ANON_KEY
      };
    }

    return client;
  } catch (error) {
    console.error('[Supabase] Erro ao inicializar conexão:', error);
    return createMappedSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
})();

// Estrutura das tabelas no Supabase
export interface SupabaseProdutoPayload {
  nome: string;
  preco_venda: number;
  preco_custo: number;
  estoque_atual: number;
}

export interface SupabaseMovimentacaoPayload {
  tipo: string;
  valor: number;
  quantidade: number;
  produto: string;
  created_at: string;
}

interface PendingSyncItem {
  id: string;
  kind: 'product' | 'movement' | 'stock';
  payload: any;
  timestamp: number;
  error?: string;
}

const STORAGE_PENDING_KEY = 'supabase_pending_sync_queue';

function getPendingQueue(): PendingSyncItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingQueue(queue: PendingSyncItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PENDING_KEY, JSON.stringify(queue.slice(0, 300)));
    window.dispatchEvent(new CustomEvent('supabase-queue-updated', { detail: { count: queue.length } }));
  } catch (e) {
    console.warn('[Supabase] Erro ao salvar fila pendente:', e);
  }
}

export function getPendingSupabaseCount(): number {
  return getPendingQueue().length;
}

function enqueuePendingSync(kind: 'product' | 'movement' | 'stock', payload: any, error?: string) {
  const queue = getPendingQueue();
  const newItem: PendingSyncItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    payload,
    timestamp: Date.now(),
    error
  };
  queue.push(newItem);
  savePendingQueue(queue);
}

/**
 * Grava ou sincroniza um produto na tabela PRODUTOS do Supabase
 */
export async function syncProductToSupabase(product: {
  name: string;
  basePrice?: number;
  unitCost?: number;
  stock?: number;
}): Promise<{ success: boolean; rlsBlocked?: boolean; error?: string }> {
  const payload: SupabaseProdutoPayload = {
    nome: (product.name || '').trim(),
    preco_venda: typeof product.basePrice === 'number' ? Number(product.basePrice.toFixed(2)) : 0,
    preco_custo: typeof product.unitCost === 'number' ? Number(product.unitCost.toFixed(2)) : 0,
    estoque_atual: typeof product.stock === 'number' ? Math.round(product.stock) : 0
  };

  if (!payload.nome) {
    return { success: false, error: 'Nome do produto obrigatório' };
  }

  try {
    // 1. Verifica se já existe um produto com este nome
    const checkRes = await supabase.from('PRODUTOS').select('id').eq('nome', payload.nome).limit(1);

    if (!checkRes.error && checkRes.data && checkRes.data.length > 0) {
      // Já existe: atualiza preços e estoque
      const existingId = checkRes.data[0].id;
      const updateRes = await supabase
        .from('PRODUTOS')
        .update({
          preco_venda: payload.preco_venda,
          preco_custo: payload.preco_custo,
          estoque_atual: payload.estoque_atual
        })
        .eq('id', existingId);

      if (updateRes.error) {
        if (updateRes.error.code === '42501') {
          enqueuePendingSync('product', payload, 'RLS policy error');
          return { success: false, rlsBlocked: true, error: updateRes.error.message };
        }
        enqueuePendingSync('product', payload, updateRes.error.message);
        return { success: false, error: updateRes.error.message };
      }

      return { success: true };
    }

    // 2. Não existe: insere novo registro
    const insertRes = await supabase.from('PRODUTOS').insert([payload]);

    if (insertRes.error) {
      const isRls = insertRes.error.code === '42501';
      enqueuePendingSync('product', payload, insertRes.error.message);
      if (isRls) {
        console.warn('[Supabase RLS] Gravação bloqueada na tabela PRODUTOS por política RLS. Item enfileirado para sincronização.');
      }
      return { success: false, rlsBlocked: isRls, error: insertRes.error.message };
    }

    return { success: true };
  } catch (err: any) {
    enqueuePendingSync('product', payload, err?.message);
    return { success: false, error: err?.message || 'Erro desconhecido' };
  }
}

/**
 * Atualiza o estoque de um produto no Supabase
 */
export async function updateProductStockInSupabase(
  productName: string,
  newStock: number
): Promise<{ success: boolean; rlsBlocked?: boolean; error?: string }> {
  const cleanName = (productName || '').trim();
  const cleanStock = Math.round(newStock);

  try {
    const res = await supabase
      .from('PRODUTOS')
      .update({ estoque_atual: cleanStock })
      .eq('nome', cleanName);

    if (res.error) {
      const isRls = res.error.code === '42501';
      enqueuePendingSync('stock', { productName: cleanName, newStock: cleanStock }, res.error.message);
      return { success: false, rlsBlocked: isRls, error: res.error.message };
    }

    return { success: true };
  } catch (err: any) {
    enqueuePendingSync('stock', { productName: cleanName, newStock: cleanStock }, err?.message);
    return { success: false, error: err?.message };
  }
}

/**
 * Grava uma movimentação na tabela MOVIMENTAÇOES do Supabase
 */
export async function syncMovementToSupabase(movement: {
  type: string;
  description?: string;
  amount?: number;
  quantity?: number;
  entityName?: string;
  timestamp?: number;
  paymentMethod?: string;
  customerName?: string;
  employeeName?: string;
}): Promise<{ success: boolean; rlsBlocked?: boolean; error?: string }> {
  const payload: SupabaseMovimentacaoPayload = {
    tipo: (movement.type || 'geral').slice(0, 50),
    valor: typeof movement.amount === 'number' ? Number(movement.amount.toFixed(2)) : 0,
    quantidade: typeof movement.quantity === 'number' ? Math.max(1, Math.round(movement.quantity)) : 1,
    produto: (movement.entityName || movement.description || 'Movimentação').slice(0, 255),
    created_at: new Date(movement.timestamp || Date.now()).toISOString()
  };

  try {
    const result = await supabase.from('MOVIMENTAÇOES').insert([payload]);

    if (result.error) {
      const isRls = result.error.code === '42501';
      enqueuePendingSync('movement', payload, result.error.message);
      if (isRls) {
        console.warn('[Supabase RLS] Gravação bloqueada na tabela MOVIMENTAÇOES por política RLS. Item enfileirado para sincronização.');
      }
      return { success: false, rlsBlocked: isRls, error: result.error.message };
    }

    // Registrado com sucesso no Supabase!
    // Dispara a função auxiliar de POST para o Google Sheets via Webhook (Google Apps Script)
    postToGoogleSheets({
      tipo: payload.tipo,
      descricao: movement.description || payload.produto,
      valor: payload.valor,
      quantidade: payload.quantidade,
      produto: payload.produto,
      forma_pagamento: movement.paymentMethod,
      cliente: movement.customerName,
      operador: movement.employeeName,
      timestamp: movement.timestamp || Date.now(),
      created_at: payload.created_at
    }).catch(sheetErr => {
      console.warn('[Google Sheets Webhook] Erro ao transmitir após gravação no Supabase:', sheetErr);
    });

    return { success: true };
  } catch (err: any) {
    enqueuePendingSync('movement', payload, err?.message);
    return { success: false, error: err?.message };
  }
}

/**
 * Sincroniza todos os itens que ficaram pendentes na fila local
 */
export async function flushPendingSupabaseSync(): Promise<{
  total: number;
  synced: number;
  remaining: number;
  rlsBlocked: boolean;
}> {
  const queue = getPendingQueue();
  if (queue.length === 0) {
    return { total: 0, synced: 0, remaining: 0, rlsBlocked: false };
  }

  let synced = 0;
  const remainingQueue: PendingSyncItem[] = [];
  let isRlsBlocked = false;

  for (const item of queue) {
    try {
      if (item.kind === 'product') {
        const res = await supabase.from('PRODUTOS').insert([item.payload]);
        if (!res.error) {
          synced++;
        } else {
          if (res.error.code === '42501') isRlsBlocked = true;
          remainingQueue.push(item);
        }
      } else if (item.kind === 'movement') {
        const res = await supabase.from('MOVIMENTAÇOES').insert([item.payload]);
        if (!res.error) {
          synced++;
          // Sincroniza no Google Sheets via Webhook quando o item pendente for salvo no Supabase
          postToGoogleSheets({
            tipo: item.payload.tipo,
            descricao: item.payload.produto,
            valor: item.payload.valor,
            quantidade: item.payload.quantidade,
            produto: item.payload.produto,
            created_at: item.payload.created_at
          }).catch(() => {});
        } else {
          if (res.error.code === '42501') isRlsBlocked = true;
          remainingQueue.push(item);
        }
      } else if (item.kind === 'stock') {
        const res = await supabase
          .from('PRODUTOS')
          .update({ estoque_atual: item.payload.newStock })
          .eq('nome', item.payload.productName);
        if (!res.error) {
          synced++;
        } else {
          if (res.error.code === '42501') isRlsBlocked = true;
          remainingQueue.push(item);
        }
      }
    } catch {
      remainingQueue.push(item);
    }
  }

  savePendingQueue(remainingQueue);
  return {
    total: queue.length,
    synced,
    remaining: remainingQueue.length,
    rlsBlocked: isRlsBlocked
  };
}

/**
 * Testa a conectividade com o Supabase e checa leitura e permissões de escrita (RLS)
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  message: string;
  produtosTableOk: boolean;
  movimentacoesTableOk: boolean;
  rlsBlocked: boolean;
  pendingCount: number;
}> {
  const pendingCount = getPendingSupabaseCount();

  try {
    const [prodCheck, movCheck] = await Promise.all([
      supabase.from('PRODUTOS').select('id').limit(1),
      supabase.from('MOVIMENTAÇOES').select('id').limit(1)
    ]);

    const produtosTableOk = !prodCheck.error || prodCheck.error.code !== 'PGRST205';
    const movimentacoesTableOk = !movCheck.error || movCheck.error.code !== 'PGRST205';

    // Testa permissão de escrita de forma segura
    let rlsBlocked = false;
    try {
      const pingTest = await supabase.from('PRODUTOS').insert([{ nome: '__ping_diagnostic__' }]).select();
      if (pingTest.error) {
        if (pingTest.error.code === '42501') {
          rlsBlocked = true;
        }
      } else if (pingTest.data && pingTest.data.length > 0) {
        // Se inseriu, limpa o registro de teste
        const idToDelete = pingTest.data[0].id;
        await supabase.from('PRODUTOS').delete().eq('id', idToDelete);
      }
    } catch {
      // Ignora falha de rede no ping
    }

    let message = 'Conexão com o Supabase ativa e respondendo.';
    if (rlsBlocked) {
      message = 'Conexão ativa, porém o Supabase está com RLS ativado bloqueando gravações anônimas (Erro 42501).';
    } else if (produtosTableOk && movimentacoesTableOk) {
      message = 'Conexão com o Supabase ativa e permissões de leitura/escrita liberadas com sucesso!';
    }

    return {
      connected: true,
      message,
      produtosTableOk,
      movimentacoesTableOk,
      rlsBlocked,
      pendingCount
    };
  } catch (err: any) {
    return {
      connected: false,
      message: err?.message || 'Falha ao conectar com o Supabase',
      produtosTableOk: false,
      movimentacoesTableOk: false,
      rlsBlocked: false,
      pendingCount
    };
  }
}

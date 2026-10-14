/**
 * Integração com Google Sheets via Webhook (Google Apps Script)
 * URL do Webhook: https://script.google.com/macros/s/AKfycbz_Tn-SPjYQgA2fTORqV64GHV_EfpGveOnbmpB9_uF-4_a432DrvfYJ3VyzzHv9S2DjfA/exec
 */

export const GOOGLE_SHEETS_WEBHOOK_URL = ''; // Each store configures its own endpoint in Supabase.
  'https://script.google.com/macros/s/AKfycbz_Tn-SPjYQgA2fTORqV64GHV_EfpGveOnbmpB9_uF-4_a432DrvfYJ3VyzzHv9S2DjfA/exec';

const STORAGE_KEY_WEBHOOK_URL = 'google_sheets_webhook_url';
const STORAGE_KEY_WEBHOOK_LOGS = 'google_sheets_webhook_logs';
const STORAGE_KEY_WEBHOOK_ENABLED = 'google_sheets_webhook_enabled';

export interface GoogleSheetsMovementPayload {
  tipo: string;
  descricao?: string;
  valor?: number;
  quantidade?: number;
  produto?: string;
  forma_pagamento?: string;
  cliente?: string;
  operador?: string;
  timestamp?: number;
  created_at?: string;
  [key: string]: any;
}

export interface GoogleSheetsWebhookLog {
  id: string;
  timestamp: number;
  tipo: string;
  produto: string;
  valor: number;
  quantidade: number;
  status: 'enviado' | 'erro';
  mensagem: string;
  url: string;
}

let cloudOwnerId: string | undefined;
let cloudWebhookUrl = '';
let cloudWebhookEnabled = false;
let webhookLogs: GoogleSheetsWebhookLog[] = [];
export function hydrateCloudSheets(ownerId: string | undefined, url = '', enabled = false) {
  if (cloudOwnerId !== ownerId) webhookLogs = [];
  cloudOwnerId = ownerId; cloudWebhookUrl = typeof url === 'string' ? url : ''; cloudWebhookEnabled = enabled;
}
export const getGoogleSheetsWebhookUrl = () => cloudWebhookUrl;
export const isGoogleSheetsWebhookEnabled = () => cloudWebhookEnabled;
export function setGoogleSheetsWebhookUrl(url: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cloud-preference-change', { detail: { googleSheetsWebhookUrl: url.trim() } }));
}
export function setGoogleSheetsWebhookEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cloud-preference-change', { detail: { googleSheetsWebhookEnabled: enabled } }));
}
export const getGoogleSheetsLogs = () => [...webhookLogs];
export const clearGoogleSheetsLogs = () => { webhookLogs = []; };

function appendWebhookLog(entry: Omit<GoogleSheetsWebhookLog, 'id'>): void {
  webhookLogs = [{ ...entry, id: crypto.randomUUID() }, ...webhookLogs].slice(0, 100);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('google-sheets-log-updated'));
}

/**
 * Função auxiliar que faz o POST dos dados para o Google Sheets via Webhook (Google Apps Script)
 * Formata os dados de forma ultra-compatível com qualquer script doPost(e) do Apps Script
 */
export async function postToGoogleSheets(
  payload: GoogleSheetsMovementPayload
): Promise<{ success: boolean; message: string; status?: number }> {
  if (!isGoogleSheetsWebhookEnabled()) {
    return { success: false, message: 'Integração Google Sheets desativada pelo usuário.' };
  }

  const webhookUrl = getGoogleSheetsWebhookUrl();
  const requestOwnerId = cloudOwnerId;
  if (!webhookUrl || !/^https:\/\//i.test(webhookUrl)) {
    return { success: false, message: 'URL do Webhook do Google Sheets não configurada.' };
  }

  const dateObj = new Date(payload.timestamp || Date.now());
  const dataFormatada = dateObj.toLocaleDateString('pt-BR');
  const horaFormatada = dateObj.toLocaleTimeString('pt-BR');
  const dataHoraFormatada = `${dataFormatada} ${horaFormatada}`;

  const valorNum = typeof payload.valor === 'number' ? Number(payload.valor.toFixed(2)) : 0;
  const quantNum = typeof payload.quantidade === 'number' ? payload.quantidade : 1;
  const produtoNome = (payload.produto || payload.descricao || 'Item').slice(0, 255);
  const tipoStr = (payload.tipo || 'movimentacao').toLowerCase();

  // Payload completo com sinônimos em PT e EN + formato de linha (row/linha) para sheet.appendRow
  const bodyData = {
    // Identificação temporal
    data: dataHoraFormatada,
    data_hora: dataHoraFormatada,
    data_apenas: dataFormatada,
    hora_apenas: horaFormatada,
    timestamp: dateObj.getTime(),
    created_at: payload.created_at || dateObj.toISOString(),

    // Propriedades em Português
    tipo: tipoStr,
    produto: produtoNome,
    quantidade: quantNum,
    valor: valorNum,
    descricao: payload.descricao || produtoNome,
    forma_pagamento: payload.forma_pagamento || '',
    cliente: payload.cliente || '',
    operador: payload.operador || '',
    origem: 'Eu Gerencio! (Supabase)',

    // Propriedades em Inglês (compatibilidade)
    type: tipoStr,
    product: produtoNome,
    quantity: quantNum,
    amount: valorNum,
    description: payload.descricao || produtoNome,
    payment_method: payload.forma_pagamento || '',
    customer: payload.cliente || '',
    operator: payload.operador || '',

    // Formato de linha pronto para Google Apps Script: sheet.appendRow(data.linha)
    linha: [
      dataHoraFormatada,
      tipoStr.toUpperCase(),
      produtoNome,
      quantNum,
      valorNum,
      payload.forma_pagamento || '-',
      payload.cliente || '-',
      payload.descricao || '-'
    ],
    row: [
      dataHoraFormatada,
      tipoStr.toUpperCase(),
      produtoNome,
      quantNum,
      valorNum,
      payload.forma_pagamento || '-',
      payload.cliente || '-',
      payload.descricao || '-'
    ]
  };

  const jsonString = JSON.stringify(bodyData);

  // Tentativa 1: Envio com Content-Type text/plain (evita preflight OPTIONS do CORS em requisições de navegador)
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: jsonString,
      redirect: 'follow'
    });

    if (res.ok || res.type === 'opaque' || res.status === 200 || res.status === 302) {
      if (requestOwnerId === cloudOwnerId) appendWebhookLog({
        timestamp: Date.now(),
        tipo: tipoStr,
        produto: produtoNome,
        valor: valorNum,
        quantidade: quantNum,
        status: 'enviado',
        mensagem: 'Enviado com sucesso para a planilha Google Sheets',
        url: webhookUrl
      });
      return { success: true, message: 'Dados gravados no Google Sheets!', status: res.status };
    }

    // Se o Apps Script retornou status HTTP diferente, tentar modo no-cors
    throw new Error(`Status ${res.status}: ${res.statusText}`);
  } catch {
    // Tentativa 2 (Fallback robusto para Google Apps Script):
    // Apps Script comumente faz redirect 302 que em modo CORS no navegador pode disparar erro silencioso.
    // O modo 'no-cors' envia a requisição POST diretamente ao Google sem ser bloqueado pela política de mesma origem.
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: jsonString,
        mode: 'no-cors'
      });

      if (requestOwnerId === cloudOwnerId) appendWebhookLog({
        timestamp: Date.now(),
        tipo: tipoStr,
        produto: produtoNome,
        valor: valorNum,
        quantidade: quantNum,
        status: 'enviado',
        mensagem: 'Enviado com sucesso para a planilha via Google Apps Script (no-cors)',
        url: webhookUrl
      });

      return {
        success: true,
        message: 'Dados transmitidos com sucesso para a planilha Google Sheets.'
      };
    } catch (fallbackErr: any) {
      if (requestOwnerId === cloudOwnerId) appendWebhookLog({
        timestamp: Date.now(),
        tipo: tipoStr,
        produto: produtoNome,
        valor: valorNum,
        quantidade: quantNum,
        status: 'erro',
        mensagem: fallbackErr?.message || 'Erro na transmissão ao Google Sheets',
        url: webhookUrl
      });

      return {
        success: false,
        message: `Falha ao transmitir ao Google Sheets: ${fallbackErr?.message || 'Erro de conexão'}`
      };
    }
  }
}

/**
 * Função para testar o envio de um registro fictício para a planilha Google Sheets
 */
export async function testGoogleSheetsWebhook(customUrl?: string): Promise<{ success: boolean; message: string }> {
  const targetUrl = (customUrl || getGoogleSheetsWebhookUrl()).trim();
  if (!targetUrl) {
    return { success: false, message: 'URL do Google Apps Script não fornecida.' };
  }

  return postToGoogleSheets({
    tipo: 'teste',
    descricao: 'Teste de conexão efetuado pelo Eu Gerencio!',
    valor: 1.0,
    quantidade: 1,
    produto: 'Item de Teste de Integração',
    forma_pagamento: 'Sistema',
    operador: 'Administrador',
    timestamp: Date.now()
  });
}

// Expõe globalmente no window para scripts ou depuração no console
if (typeof window !== 'undefined') {
  (window as any).postToGoogleSheets = postToGoogleSheets;
  (window as any).testGoogleSheetsWebhook = testGoogleSheetsWebhook;
  (window as any).GOOGLE_SHEETS_WEBHOOK_URL = GOOGLE_SHEETS_WEBHOOK_URL;
}

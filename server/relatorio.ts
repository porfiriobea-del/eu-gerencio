import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppeHdwaGVhdHd5cHRrcXB6Z2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MTkxNDUsImV4cCI6MjEwNjM5NTE0NX0.ioEXPQlmL-5bRyZuChmoxkg2veYNMi8lSD6_BehyuAU';
const hashId = (kind: string, id: string) => `${kind}_${createHash('sha256').update(`${kind}:${id}`).digest('hex')}`;

export async function enviarParaPlanilha(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ success: false });
  const url = process.env.APPS_SCRIPT_URL?.trim();
  const secret = process.env.APPS_SCRIPT_SECRET;
  // Optional reporting must never prevent the app's business operation.
  const skip = () => res.status(202).json({ success: false, skipped: true });
  if (!url || !secret || !/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url)) return skip();
  const token = req.headers.authorization;
  if (!token?.startsWith('Bearer ')) return skip();
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://zixwpheatwyptkqpzgdg.supabase.co').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const apikey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = { apikey, Authorization: token };
    const identity = await fetch(`${base}/rest/v1/rpc/eu_user_id`, { headers, signal: controller.signal });
    if (!identity.ok) return skip();
    const uid = await identity.json();
    if (typeof uid !== 'string' || !uid) return skip();
    const loja = /^loja_[a-f0-9]{64}$/.test(req.body?.loja || '') ? req.body.loja : hashId('loja', uid);
    const payload: Record<string, unknown> = { secret, loja, usuario: hashId('usuario', uid) };
    if (req.body?.categoria === 'feedback') {
      const id = req.body.feedbackId;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return skip();
      const query = new URLSearchParams({ select: 'id,data', collection_path: 'eq.feedbacks', id: `eq.${id}`, owner_id: `eq.${uid}`, limit: '1' });
      const source = await fetch(`${base}/rest/v1/eu_feedbacks?${query}`, { headers, signal: controller.signal });
      if (!source.ok) return skip();
      const rows = await source.json();
      const feedback = rows?.[0]?.data;
      if (!feedback || feedback.ownerId !== uid) return skip();
      Object.assign(payload, { categoria: 'feedback', nota: feedback.rating ?? '', tipo: feedback.category, mensagem: feedback.message,
        id: `feedback_${createHash('sha256').update(id).digest('hex')}` });
      if (feedback.contact?.trim()) payload.contato = feedback.contact.trim();
    } else if (req.body?.categoria === 'uso') {
      if (!['venda', 'produto_cadastrado', 'foto_ia', 'fiado_lancado', 'compra_registrada', 'erro_tela'].includes(req.body.evento)) return skip();
      const valor = req.body.valor ?? 0;
      if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return skip();
      Object.assign(payload, { categoria: 'uso', evento: req.body.evento, valor });
    } else if (req.body?.categoria === 'comercios') {
      // Count in the database, never trust a total provided by the browser.
      const countResponse = await fetch(`${base}/rest/v1/rpc/eu_registered_stores_count`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
      });
      if (!countResponse.ok) return skip();
      const total = await countResponse.json();
      if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) return skip();
      Object.assign(payload, { categoria: 'comercios', totalComercios: total });
    } else return skip();
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, signal: controller.signal, body: JSON.stringify(payload) });
    const responseBody = await response.text();
    let result;
    try { result = JSON.parse(responseBody); } catch { result = null; }
    const confirmed = result?.ok === true || (result?.ok === undefined && result?.success === true);
    if (!response.ok || !confirmed) {
      let preview = responseBody;
      // Apps Script errors can echo request values: redact before taking the excerpt.
      for (const value of [secret, token, payload.mensagem, payload.contato]) {
        if (typeof value !== 'string' || !value) continue;
        preview = preview.split(value).join('[REDACTED]');
        preview = preview.split(JSON.stringify(value).slice(1, -1)).join('[REDACTED]');
      }
      preview = preview.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED]')
        .replace(/\+?\d[\d ().-]{7,}\d/g, '[REDACTED]').replace(/\s+/g, ' ').slice(0, 320);
      const htmlResponse = /text\/html/i.test(response.headers.get('content-type') || '');
      const reason = (response.status === 401 || response.status === 403) && htmlResponse
        ? 'APPS_SCRIPT_ACCESS_DENIED'
        : result?.code === 'INVALID_SECRET' ? 'APPS_SCRIPT_SECRET_MISMATCH'
        : result?.code === 'SHEET_SCHEMA_MISMATCH' ? 'SHEET_SCHEMA_MISMATCH' : 'UNCONFIRMED_RESPONSE';
      console.warn('[Apps Script report]', { code: 'EXPORT_NOT_CONFIRMED', reason, status: response.status,
        contentType: response.headers.get('content-type'), responsePreview: preview });
      return skip();
    }
    return res.json({ success: true });
  } catch { return skip(); }
  finally { clearTimeout(timer); }
}

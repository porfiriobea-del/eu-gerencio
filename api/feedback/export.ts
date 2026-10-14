import type { Request, Response } from 'express';

const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbxz_eklg-nmMFKsFhY0ipNnIQZIqLiqO69f90tXTFtzFsJhVwPf5CZJkA4nlW-YAHpk6A/exec';
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppeHdwaGVhdHd5cHRrcXB6Z2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MTkxNDUsImV4cCI6MjEwNjM5NTE0NX0.ioEXPQlmL-5bRyZuChmoxkg2veYNMi8lSD6_BehyuAU';

export default async function exportFeedback(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const token = req.headers.authorization;
  const id = req.body?.feedbackId;
  if (!token?.startsWith('Bearer ')) return res.status(401).json({ error: 'Entre na sua conta.' });
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return res.status(400).json({ error: 'Feedback inválido.' });
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://zixwpheatwyptkqpzgdg.supabase.co').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const apikey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON;
  const webhook = process.env.FEEDBACK_SHEETS_WEBHOOK_URL || DEFAULT_WEBHOOK;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(webhook)) return res.status(503).json({ error: 'Destino da planilha inválido.' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let stage = 'identity';
  try {
    const headers = { apikey, Authorization: token };
    const identity = await fetch(`${base}/rest/v1/rpc/eu_user_id`, { headers, signal: controller.signal });
    if (!identity.ok) return res.status(401).json({ error: 'A sessão não foi reconhecida.' });
    const uid = await identity.json();
    if (typeof uid !== 'string' || !uid) return res.status(401).json({ error: 'A sessão não foi reconhecida.' });
    stage = 'read-feedback';
    const query = new URLSearchParams({ select: 'id,data', collection_path: 'eq.feedbacks', id: `eq.${id}`, owner_id: `eq.${uid}`, limit: '1' });
    const source = await fetch(`${base}/rest/v1/eu_feedbacks?${query}`, { headers, signal: controller.signal });
    if (!source.ok) throw new Error('SOURCE_UNAVAILABLE');
    const rows = await source.json();
    const feedback = rows?.[0]?.data;
    if (!feedback || feedback.ownerId !== uid) return res.status(404).json({ error: 'Feedback não encontrado.' });
    const labels: Record<string, string> = { suggestion: 'Sugestão', praise: 'Elogio', bug: 'Problema', question: 'Dúvida', other: 'Outro' };
    const safeCell = (value: unknown) => { const text = String(value ?? ''); return /^[=+@-]/.test(text) ? `'${text}` : text; };
    const date = new Date(feedback.createdAt).toISOString();
    const row = [id, date, feedback.storeName, feedback.userEmail, labels[feedback.category] || feedback.category, feedback.rating ?? '', feedback.message, feedback.contact].map(safeCell);
    stage = 'export';
    const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ tipo: 'feedback', sheetName: 'Feedbacks', aba: 'Feedbacks', feedbackId: id, id, categoria: labels[feedback.category] || feedback.category,
        category: feedback.category, mensagem: feedback.message, message: feedback.message, email: feedback.userEmail || '', loja: feedback.storeName || '',
        nota: feedback.rating ?? '', contato: feedback.contact || '', created_at: date, linha: row, row }) });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) throw new Error('EXPORT_NOT_CONFIRMED');
    return res.json({ success: true });
  } catch {
    console.warn('[Feedback Sheets export]', { stage, code: controller.signal.aborted ? 'TIMEOUT' : 'EXPORT_NOT_CONFIRMED' });
    return res.status(502).json({ error: 'O feedback está salvo no Supabase, mas a cópia na planilha não foi confirmada.' });
  } finally { clearTimeout(timer); }
}
export const config = { maxDuration: 30 };

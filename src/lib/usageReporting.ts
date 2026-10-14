import { auth } from './firebase';
export type UsageEvent = 'venda' | 'produto_cadastrado' | 'foto_ia' | 'fiado_lancado' | 'compra_registrada';
export async function anonymousCode(kind: 'loja' | 'usuario', id: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${kind}:${id}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `${kind}_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
export async function sendReport(data: Record<string, unknown>, storeId?: string): Promise<boolean> {
  try {
    const user = auth.currentUser;
    const token = await user?.getIdToken();
    if (!user || !token) return false;
    const [loja, usuario] = await Promise.all([anonymousCode('loja', storeId || user.uid), anonymousCode('usuario', user.uid)]);
    const response = await fetch('/api/relatorio', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...data, loja, usuario }), signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => null);
    return response.ok && result?.success === true;
  } catch { return false; }
}
export function reportUsage(evento: UsageEvent, storeId: string, valor = 0): void {
  void sendReport({ categoria: 'uso', evento, valor }, storeId);
}

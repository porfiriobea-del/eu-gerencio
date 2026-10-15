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
type PendingUsage = { evento: UsageEvent; storeId: string; valor: number; userId: string };
const pendingUsage: PendingUsage[] = [];
let activeUsage = 0;
const MAX_CONCURRENT_USAGE = 2;

function flushUsageQueue(): void {
  while (activeUsage < MAX_CONCURRENT_USAGE && pendingUsage.length) {
    const job = pendingUsage.shift()!;
    if (auth.currentUser?.uid !== job.userId) continue;
    activeUsage++;
    void Promise.resolve().then(() => {
      if (auth.currentUser?.uid !== job.userId) return false;
      return sendReport({ categoria: 'uso', evento: job.evento, valor: job.valor }, job.storeId);
    }).catch(() => false).finally(() => {
      activeUsage--;
      flushUsageQueue();
    });
  }
}

/** Optional telemetry: never await this from a sale, purchase or product mutation. */
export function reportUsage(evento: UsageEvent, storeId: string, valor = 0): void {
  const userId = auth.currentUser?.uid;
  if (!userId || !storeId || !Number.isFinite(valor) || valor < 0) return;
  pendingUsage.push({ evento, storeId, valor, userId });
  // No token, hash or network work on the business operation's call stack.
  queueMicrotask(flushUsageQueue);
}

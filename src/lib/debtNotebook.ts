export interface NotebookEntry { id: string; name: string; lines: { description: string; amount: number }[]; readTotal: number | null; amount: number; customerId?: string; }
export const normalizedCustomerName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
export function moneyCents(value: number) { if (!Number.isFinite(value) || value < 0 || value > 10000000) throw new Error('Valor inválido'); return Math.round(value * 100); }
export const notebookSum = (lines: NotebookEntry['lines']) => lines.reduce((sum, line) => sum + moneyCents(line.amount), 0) / 100;
export function validateNotebook(entries: NotebookEntry[]) {
 if (!entries.length || entries.length > 50 || new Set(entries.map(e=>e.id)).size !== entries.length) throw new Error('Confira os clientes');
 for (const entry of entries) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) || !entry.name.trim() || entry.name.length > 150 || !Array.isArray(entry.lines) || entry.lines.length > 100) throw new Error('Confira o nome e os itens');
  if (!moneyCents(entry.amount)) throw new Error('Informe o valor a somar');
  if(entry.readTotal !== null) moneyCents(entry.readTotal);
  for(const line of entry.lines) { if(typeof line.description !== 'string' || line.description.length > 300) throw new Error('Item inválido'); moneyCents(line.amount); }
 }
}

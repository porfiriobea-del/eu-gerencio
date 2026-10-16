import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Product } from '../types';

export type DuplicateDecision = { action: 'open' | 'add' | 'allow' | 'cancel'; product?: Product; quantity?: number };
export function ProductDuplicateDialog({ matches, quantity, isMerge, onDecision }: { matches: Product[]; quantity: number; isMerge?: boolean; onDecision: (decision: DuplicateDecision) => void }) {
  const [targetId, setTargetId] = useState(matches[0].id);
  const [amount, setAmount] = useState(String(quantity));
  const heading = useRef<HTMLHeadingElement>(null);
  const target = matches.find(product => product.id === targetId)!;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onDecision({ action: 'cancel' }); }
      if (event.key !== 'Tab') return;
      const items = Array.from(heading.current?.parentElement?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select') || []);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [onDecision]);
  return createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="duplicate-product-title" className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6 text-foreground">
      <h2 ref={heading} tabIndex={-1} id="duplicate-product-title" className="text-lg font-bold">Produto já cadastrado</h2>
      <p className="text-sm">O nome ou código de barras coincide com um produto da loja.</p>
      <label className="block text-sm">Produto existente<select value={targetId} onChange={event => setTargetId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2">{matches.map(product => <option key={product.id} value={product.id} className="notranslate normal-case" translate="no">{product.name} — estoque {product.stock}</option>)}</select></label>
      <p className="text-xs text-muted-foreground">{target.category || 'Sem categoria'}{target.barcode ? ` · Código: ${target.barcode}` : ''}</p>
      {isMerge ? <p className="text-sm">O estoque atual do produto editado será transferido e o registro ficará arquivado. Os dados do produto existente serão mantidos.</p> : <label className="block text-sm">Quantidade a somar ({target.type === 'cigarro' ? 'carteiras' : 'unidades'})<input type="number" min="0" step={target.type === 'cigarro' ? '0.05' : '1'} value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2" /></label>}
      <div className="grid gap-2">
        <button type="button" onClick={() => onDecision({ action: 'open', product: target })} className="rounded-lg border border-border p-2">Abrir o existente</button>
        <button type="button" disabled={!isMerge && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)} onClick={() => onDecision({ action: 'add', product: target, quantity: Number(amount) })} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-50">Somar ao estoque dele</button>
        <button type="button" onClick={() => onDecision({ action: 'allow' })} className="rounded-lg border border-amber-500 p-2">Cadastrar mesmo assim</button>
        <button type="button" onClick={() => onDecision({ action: 'cancel' })} className="p-2 text-muted-foreground">Cancelar</button>
      </div>
    </section>
  </div>, document.body);
}

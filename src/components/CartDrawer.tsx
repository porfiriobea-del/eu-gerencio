import { useCurrency } from '../lib/useCurrency';
import { formatProductStock } from '../lib/productUnits';
import { usePreferences } from '../lib/preferencesContext';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingCart, Pin, PinOff, X, Plus, Minus, Trash2 } from 'lucide-react';
import type { Product } from '../types';

export interface CartItem { product: Product; format: string; quantity: number; price: number; stockDeduction: number }
interface Props { items: CartItem[]; total: number; busy?: boolean; onQuantity: (index: number, delta: number) => void; onRemove: (index: number) => void; onCheckout: () => void; onFiado: () => void }
const storageKey = 'eu_gerencio_pos_cart_pinned';

export function CartDrawer({ items, total, busy = false, onQuantity, onRemove, onCheckout, onFiado }: Props) {
  const { formatMoney, currencySymbol } = useCurrency(); const money = formatMoney;

  const { v } = usePreferences();
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem(storageKey) !== 'false'; } catch { return true; } });
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 1024px)').matches);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const panelId = useId();
  const expanded = desktop && pinned;
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  useEffect(() => { try { localStorage.setItem(storageKey, String(pinned)); } catch {} }, [pinned]);
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 1024px)');
    if (!query) return;
    const changed = () => setDesktop(query.matches);
    changed(); query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  useEffect(() => { if (expanded) setOpen(false); }, [expanded]);
  useEffect(() => {
    if (!open || expanded) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') || []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [open, expanded]);
  const checkout = (action: () => void) => { setOpen(false); action(); };
  const content = <div ref={panel} id={panelId} role={expanded ? 'complementary' : 'dialog'} aria-modal={expanded ? undefined : true} aria-labelledby={titleId}
    className={`flex min-h-0 flex-col overflow-hidden border border-border bg-surface text-foreground shadow-xl ${expanded ? 'sticky self-start top-20 h-[calc(100dvh-7rem)] w-80 shrink-0 rounded-2xl xl:w-96' : 'h-full w-full max-w-md rounded-l-2xl'}`}>
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-4">
      <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold"><ShoppingCart className="h-5 w-5 text-primary" />{v('pos.cart', 'Carrinho')} <span className="rounded-full bg-fuchsia-600 px-2 text-xs text-white" aria-live="polite">{count}</span></h2>
      <div className="flex gap-1">
        {desktop && <button type="button" aria-label={pinned ? 'Desfixar carrinho' : 'Fixar carrinho'} aria-pressed={pinned} title={pinned ? 'Carrinho suspenso/flutuante' : 'Fixar carrinho'} onClick={() => { setPinned(value => !value); setOpen(false); }} className="rounded-lg p-2 hover:bg-muted">{pinned ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />}</button>}
        {!expanded && <button type="button" aria-label="Fechar carrinho" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5" /></button>}
      </div>
    </header>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {!items.length && <p className="py-12 text-center text-muted-foreground">{v('pos.emptyCart', 'Carrinho vazio')}</p>}
      {items.map((item, index) => <article key={`${item.product.id}:${item.format}`} className="rounded-xl border border-border p-3">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold notranslate normal-case" translate="no">{item.product.name}</h3><p className="text-xs text-muted-foreground">{item.format}</p><p className="mt-1 text-xs">{item.quantity} × {money(item.price)}</p></div><strong className="shrink-0 text-primary">{money(item.price * item.quantity)}</strong></div>
        <p className="mt-2 text-xs text-muted-foreground">Baixa: {formatProductStock(item.product, Math.round(item.quantity * item.stockDeduction * 20) / 20)}</p>
        <div className="mt-3 flex items-center justify-between"><div className="flex items-center gap-3"><button type="button" disabled={busy} aria-label={`Diminuir ${item.product.name}, ${item.format}`} onClick={() => onQuantity(index, -1)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border disabled:opacity-50 notranslate normal-case" translate="no"><Minus className="h-4 w-4" /></button><span className="text-sm font-bold">{item.quantity}</span><button type="button" disabled={busy} aria-label={`Aumentar ${item.product.name}, ${item.format}`} onClick={() => onQuantity(index, 1)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border disabled:opacity-50 notranslate normal-case" translate="no"><Plus className="h-4 w-4" /></button></div><button type="button" disabled={busy} aria-label={`Remover ${item.product.name}, ${item.format}`} onClick={() => onRemove(index)} className="flex h-11 w-11 items-center justify-center rounded-lg text-red-500 disabled:opacity-50 notranslate normal-case" translate="no"><Trash2 className="h-4 w-4" /></button></div>
      </article>)}
    </div>
    <footer className="shrink-0 space-y-3 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between"><span>Total a pagar</span><strong className="text-2xl">{money(total)}</strong></div>
      <button type="button" disabled={!items.length || busy} onClick={() => checkout(onCheckout)} className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50">Finalizar Compra / Receber</button>
      <button type="button" disabled={!items.length || busy} onClick={() => checkout(onFiado)} className="w-full rounded-xl border border-amber-500/40 px-3 py-2 text-sm font-semibold disabled:opacity-50">Vender no Fiado</button>
    </footer>
  </div>;
  if (expanded) return content;
  return <>
    <span role="status" aria-live="polite" className="sr-only">Carrinho: {count} {count === 1 ? 'item' : 'itens'}</span>
    <button type="button" aria-label={`Abrir carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(true)}
      className="fixed right-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-primary shadow-lg">
      <ShoppingCart className="h-6 w-6" /><span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-surface bg-fuchsia-600 px-1 text-center text-xs font-bold text-white">{count}</span>
    </button>
    {open && createPortal(<div className="fixed inset-0 z-[80] flex justify-end bg-black/60 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>{content}</div>, document.body)}
  </>;
}

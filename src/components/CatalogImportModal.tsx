import { useModalViewport } from '../lib/useModalViewport';
import { usePreferences } from '../lib/preferencesContext';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, FileText, Image, Loader2, Plus, Trash2, X } from 'lucide-react';
import { prepareCatalogFile, recognizeCatalog } from '../lib/geminiCatalogScanner';
import { blankSupplierDraft, buildSupplierProducts, type SupplierDraft } from '../lib/supplierCatalog';
import type { Product } from '../types';
import { normalizeProductName, findDuplicateProducts, isDuplicateProduct } from '../lib/duplicateDetector';
import { importSupplierCatalog, adjustProductStock } from '../lib/api';
import { showActionError, showToast } from '../lib/actionFeedback';

interface Props { isOpen: boolean; onClose: () => void; availableCategories: string[]; existingProductNames: string[]; existingProducts?: Product[]; onBeforeSave?: (product: Pick<Product, 'name' | 'barcode' | 'stock' | 'type'>) => Promise<boolean>; onOpenExisting?: (product: Product) => void }

export function CatalogImportModal({ isOpen, onClose, availableCategories, existingProductNames, existingProducts = [], onBeforeSave, onOpenExisting }: Props) {
  const { v } = usePreferences();
  const viewport = useModalViewport(isOpen);
  const copy = (key: string, fallback: string) => v(key, fallback);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<SupplierDraft[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const readingRef = useRef(false);
  const savingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const headingId = useId();
  const categoriesId = useId();
  const existing = new Set(existingProductNames.map(normalizeProductName));
  const match = (row: SupplierDraft) => findDuplicateProducts(row, existingProducts)[0];
  const duplicated = (row: SupplierDraft, index: number) => !!match(row) || existing.has(normalizeProductName(row.name)) || drafts.some((other, otherIndex) => otherIndex < index && isDuplicateProduct(row, other));

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const wasInert = root?.hasAttribute('inert');
    root?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    headingRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) onCloseRef.current();
      if (event.key !== 'Tab') return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []).filter(element => !element.hidden && element.getAttribute('type') !== 'hidden');
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      generationRef.current++;
      controllerRef.current?.abort();
      readingRef.current = false;
      setIsReading(false);
      document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = previousOverflow;
      if (!wasInert) root?.removeAttribute('inert');
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const update = (id: string, patch: Partial<SupplierDraft>) => {
    setError('');
    setRowErrors(previous => { const next = {...previous}; delete next[id]; return next; });
    setDrafts(previous => previous.map((row, index) => {
    if (row.id !== id) return row;
    const next = { ...row, ...patch };
    if ('name' in patch || 'barcode' in patch) {
      next.allowDuplicate = false;
      if (match(next) || existing.has(normalizeProductName(next.name)) || previous.some((other, i) => i < index && isDuplicateProduct(next, other))) next.selected = false;
    }
    return next;
  }));
  };
  const readFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || readingRef.current || savingRef.current) return;
    if (files.length > 10) { setError('Selecione até 10 arquivos por vez.'); return; }
    readingRef.current = true;
    setIsReading(true); setError('');
    const generation = ++generationRef.current;
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      for (const [index, file] of files.entries()) {
        setStatus(`Processando catálogo com IA... (${index + 1}/${files.length}: ${file.name})`);
        const data = await prepareCatalogFile(file);
        if (generation !== generationRef.current) return;
        const result = await recognizeCatalog(data, availableCategories, controller.signal);
        if (generation !== generationRef.current) return;
        setDrafts(previous => {
          const added = result.products.map((row, index) => ({ ...row, initialStock: '' as const,
            costBasis: row.type === 'cigarro' ? row.costBasis === 'embalagem' ? 'maco' : ['maco','meio_maco','carteira'].includes(row.costBasis) ? row.costBasis : '' : row.costBasis,
            selected: !match(row) && !existing.has(normalizeProductName(row.name)) && ![...previous, ...result.products.slice(0, index)].some(other => isDuplicateProduct(row, other)) }));
          return [...previous, ...added];
        });
        if (!result.products.length) setError(copy('catalog.empty', 'Nenhum produto foi encontrado neste arquivo. Tente outra foto ou preencha manualmente.'));
        if (result.skippedCount) setError(copy('catalog.partial', 'Alguns produtos não ficaram legíveis. Confira a lista e acrescente os que faltam.'));
        if (result.truncated) setError('Este arquivo tem mais de 200 itens. A IA retornou os primeiros; envie as páginas restantes separadamente.');
      }
      setStatus('Leitura concluída. Revise nomes, medidas de compra, custos e preços de venda antes de cadastrar.');
    } catch (error) {
      if (generation === generationRef.current) {
        setStatus('A leitura não foi concluída. Os produtos já revisados foram mantidos.');
        setError((error as { code?: string })?.code === 'TIMEOUT' ? copy('catalog.timeout', 'A leitura demorou demais, mesmo com o modelo alternativo. Tente mais tarde ou adicione os produtos manualmente.') : (error as { code?: string })?.code === 'REQUEST_REJECTED' ? copy('catalog.rejected', 'A IA recusou a leitura. Tente mais tarde ou adicione os produtos manualmente.') : error instanceof Error ? error.message : 'Não foi possível ler o catálogo. Preencha os produtos manualmente.');
      }
    } finally {
      if (generation === generationRef.current) { setIsReading(false); readingRef.current = false; controllerRef.current = null; }
    }
  };
  const cancelReading = () => {
    generationRef.current++; controllerRef.current?.abort(); readingRef.current = false;
    setIsReading(false); setStatus('Leitura interrompida. Os produtos já extraídos foram mantidos.');
  };
  const save = async () => {
    if (savingRef.current || readingRef.current) return;
    const selected = drafts.filter(row => row.selected);
    if (!selected.length || selected.length > 200) {
      const message = selected.length ? copy('catalog.tooMany', 'Selecione até 200 produtos por importação.') : copy('catalog.noSelection', 'Selecione pelo menos um produto.');
      setError(message); showToast(message, 'warning'); return;
    }
    const errors: Record<string, string> = {};
    const candidates: { row: SupplierDraft; product: ReturnType<typeof buildSupplierProducts>[number] }[] = [];
    for (const row of selected) {
      const index = drafts.findIndex(item => item.id === row.id);
      if (duplicated(row, index) && !row.allowDuplicate) { errors[row.id] = copy('catalog.duplicate', 'Revise o produto duplicado.'); continue; }
      try { candidates.push({ row, product: buildSupplierProducts([row])[0] }); }
      catch (error) { errors[row.id] = error instanceof Error ? error.message : copy('catalog.fix', 'Confira os dados deste produto.'); }
    }
    setRowErrors(errors);
    if (Object.keys(errors).length) {
      setError(`${copy('catalog.validation', 'Confira os dados selecionados.')} ${Object.values(errors)[0]}`);
      showToast(copy('catalog.fix', 'Corrija as linhas destacadas antes de cadastrar.'), 'warning');
      const first = document.getElementById(`catalog-row-${Object.keys(errors)[0]}`);
      first?.focus(); first?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    savingRef.current = true; setIsSaving(true); setError('');
    setStatus(copy('catalog.checking', 'Conferindo os produtos selecionados...'));
    const generation = generationRef.current;
    try {
      for (const {row, product} of candidates) {
        if (!row.allowDuplicate && onBeforeSave && !await onBeforeSave(product)) {
          setStatus(copy('catalog.cancelled', 'Cadastro não confirmado. Revise os produtos.')); return;
        }
      }
      if (generation !== generationRef.current) return;
      const count = await importSupplierCatalog(candidates.map(item => item.product), { allowDuplicates: true, draftIds: candidates.map(item => item.row.id) });
      const message = count === 0 ? copy('catalog.alreadySaved', 'Os selecionados já foram cadastrados.')
        : count === 1 ? copy('catalog.successOne', '1 produto do seu catálogo adicionado ao estoque com sucesso!')
        : copy('catalog.success', '{count} produtos do seu catálogo adicionados ao estoque com sucesso!').replace('{count}', String(count));
      showToast(`✓ ${message}`);
      const confirmed = new Set(candidates.map(item => item.row.id));
      setDrafts(previous => previous.filter(row => !confirmed.has(row.id))); setStatus('');
      onClose();
    } catch (error) {
      const message = copy('catalog.failed', 'Não foi possível confirmar a importação. A revisão foi mantida. Confira o estoque e a conexão antes de repetir.');
      setError(message); setStatus(''); showActionError(error, message);
    } finally { savingRef.current = false; setIsSaving(false); }
  };

  const numberField = (row: SupplierDraft, field: 'initialStock' | 'purchaseCost' | 'unitsPerPackage' | 'basePrice' | 'pricePack' | 'priceCart' | 'priceHalfCart' | 'priceUnit', label: string) => (
    <label className="block text-xs font-medium">{label}
      <input type="number" inputMode="decimal" min="0" step={field === 'initialStock' ? row.type === 'cigarro' ? '0.05' : '1' : field === 'unitsPerPackage' ? '1' : '0.01'} value={row[field] ?? ''} onChange={event => update(row.id, { [field]: event.target.value === '' ? '' : Number(event.target.value) })}
        className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" placeholder="Não informado" />
    </label>
  );
  return createPortal(
    <div style={{top: viewport.top, height: viewport.height, bottom: 'auto'}} className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/50 p-2 sm:p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={headingId} className="flex max-h-full w-full min-w-0 max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-xl [&_input]:text-base [&_select]:text-base [&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
          <div><h2 ref={headingRef} tabIndex={-1} id={headingId} className="text-lg font-bold">{copy('catalog.title', 'Importar catálogo do fornecedor')}</h2><p className="mt-1 text-xs text-muted-foreground">PDF ou fotos da sua lista de preços. A IA extrai vários produtos para você revisar.</p></div>
          <button type="button" disabled={isSaving} onClick={onClose} aria-label="Fechar importação" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={readFiles} />
          <input ref={galleryRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={readFiles} />
          <input ref={pdfRef} hidden type="file" accept="application/pdf,.pdf" multiple onChange={readFiles} />
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={isReading || isSaving} onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-border p-3 text-sm hover:bg-muted disabled:opacity-50"><Camera className="h-5 w-5" />Tirar foto do catálogo</button>
            <button type="button" disabled={isReading || isSaving} onClick={() => galleryRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-border p-3 text-sm hover:bg-muted disabled:opacity-50"><Image className="h-5 w-5" />Selecionar da galeria</button>
            <button type="button" disabled={isReading || isSaving} onClick={() => pdfRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-border p-3 text-sm hover:bg-muted disabled:opacity-50"><FileText className="h-5 w-5" />Enviar PDF</button>
          </div>
          <p className="text-xs text-muted-foreground">{copy('catalog.fileHelp', 'PDF: até 3 MB. Fotos: JPEG, PNG ou WebP. Até 200 produtos por vez. Estoque inicial opcional. Preços não encontrados ficam em branco.')}</p>
          {(status || isReading) && <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">{(isReading || isSaving) && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}{status}{isReading && <button type="button" onClick={cancelReading} className="ml-auto shrink-0 font-semibold text-primary">Interromper</button>}</div>}
          {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">{error}</p>}
          <datalist id={categoriesId}>{availableCategories.map(category => <option key={category} value={category} />)}</datalist>
          <fieldset disabled={isReading || isSaving} className="space-y-3 disabled:opacity-70">
            {drafts.map((row, index) => (
              <article key={row.id} id={`catalog-row-${row.id}`} tabIndex={-1} aria-describedby={rowErrors[row.id] ? `catalog-error-${row.id}` : undefined} className={`rounded-2xl border p-3 ${rowErrors[row.id] ? 'border-red-500 ring-1 ring-red-500' : 'border-border'}`}>
                {rowErrors[row.id] && <p id={`catalog-error-${row.id}`} className="mb-3 text-sm font-semibold text-red-700 dark:text-red-300">{rowErrors[row.id]}</p>}
                <div className="mb-3 flex items-center justify-between gap-2"><label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={row.selected} onChange={event => update(row.id, { selected: event.target.checked && (!duplicated(row, index) || !!row.allowDuplicate) })} />Produto {index + 1}</label><button type="button" aria-label={`Remover produto ${index + 1}`} onClick={() => setDrafts(previous => previous.filter(item => item.id !== row.id))} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-red-600 hover:bg-muted"><Trash2 className="h-4 w-4" /></button></div>
                {duplicated(row, index) && <div className="mb-3 rounded-lg border border-amber-500 p-3 text-xs">
                  <p className="font-semibold">Duplicado suspeito: {match(row)?.name || row.name}. Desmarcado por padrão.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={!match(row) || !onOpenExisting} onClick={() => onOpenExisting?.(match(row)!)} className="rounded border border-border px-2 py-1">Abrir o existente</button>
                    <input aria-label={`Quantidade a somar de ${row.name}`} type="number" min="0" step={row.type === 'cigarro' ? '0.05' : '1'} value={row.stockToAdd ?? 1} onChange={event => update(row.id, { stockToAdd: Number(event.target.value) })} className="w-20 rounded border border-border bg-background p-1" />
                    <button type="button" disabled={!match(row) || match(row)?.type !== row.type} onClick={async () => {
                      try { await adjustProductStock(match(row)!.id!, row.stockToAdd ?? 1); update(row.id, { selected: false }); showToast('✓ Estoque atualizado!'); }
                      catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível somar ao estoque.'); }
                    }} className="rounded border border-border px-2 py-1">Somar ao estoque dele</button>
                    <button type="button" onClick={() => update(row.id, { allowDuplicate: true, selected: true })} className="rounded border border-amber-500 px-2 py-1">Cadastrar mesmo assim</button>
                  </div>
                  {row.allowDuplicate && <p className="mt-2">Novo cadastro duplicado autorizado.</p>}
                </div>}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-xs font-medium sm:col-span-2">Nome do produto<input value={row.name} maxLength={100} onChange={event => update(row.id, { name: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" /></label>
                  <label className="block text-xs font-medium">Código de barras<input value={row.barcode || ''} onChange={event => update(row.id, { barcode: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" /></label>
                  <label className="block text-xs font-medium">Categoria<input list={categoriesId} value={row.category} maxLength={50} onChange={event => update(row.id, { category: event.target.value, ...(/cigar/i.test(event.target.value) && row.type !== 'cigarro' ? { type: 'cigarro', costBasis: '', unitsPerPackage: 10 } : {}) })} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" /></label>
                  <label className="block text-xs font-medium">Tipo<select value={row.type} onChange={event => update(row.id, { type: event.target.value as SupplierDraft['type'], costBasis: '', unitsPerPackage: event.target.value === 'cigarro' ? 10 : 1 })} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"><option value="comum">Comum</option><option value="cigarro">Cigarro fracionado</option></select></label>
                  {numberField(row, 'purchaseCost', 'Custo da compra (R$)')}
                  <label className="block min-w-0 text-xs font-medium">{copy('catalog.costBasis', 'Este custo corresponde a')}<select value={row.costBasis} onChange={event => update(row.id, { costBasis: event.target.value as SupplierDraft['costBasis'] })} className="mt-1 w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm"><option value="">{copy('catalog.costPlaceholder', 'Confirme a medida')}</option>{row.type === 'cigarro' ? <><option value="maco">{copy('catalog.costPack', '1 maço (10 carteiras)')}</option><option value="meio_maco">{copy('catalog.costHalf', 'Meio maço (5 carteiras)')}</option><option value="carteira">{copy('catalog.costCart', '1 carteira avulsa')}</option></> : <><option value="unidade">1 unidade</option><option value="embalagem">1 embalagem fechada</option></>}</select></label>
                  {row.type === 'cigarro' && <p className="text-xs text-muted-foreground sm:col-span-2">{copy('catalog.costHelp', 'O custo por carteira usa 10, 5 ou 1 carteira, conforme a opção escolhida.')}</p>}
                  {row.type === 'comum' && <><label className="block text-xs font-medium">Forma de compra<select value={row.purchaseForm} onChange={event => update(row.id, { purchaseForm: event.target.value as SupplierDraft['purchaseForm'] })} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"><option value="unidade">Unidade</option><option value="fardo">Fardo / Caixa</option><option value="pacote">Pacote</option></select></label>{numberField(row, 'unitsPerPackage', 'Unidades por embalagem')}</>}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {row.type === 'cigarro' ? <>{numberField(row, 'pricePack', 'Venda: Maço (10 carteiras)')}{numberField(row, 'priceCart', 'Venda: Carteira (20 cigarros)')}{numberField(row, 'priceHalfCart', 'Venda: Meia carteira')}{numberField(row, 'priceUnit', 'Venda: Unidade avulsa')}</> : numberField(row, 'basePrice', 'Preço de venda (R$)')}
                </div>
                <div className="mt-3 max-w-md">{numberField(row, 'initialStock', `${copy('catalog.initialStock', 'Estoque inicial (opcional)')} — ${row.type === 'cigarro' ? 'carteiras' : 'unidades'}`)}<p className="mt-1 text-xs text-muted-foreground">{copy('catalog.initialStockHelp', 'Informe unidades ou carteiras para cigarros. Se deixar vazio, começa com zero.')}</p></div>
                {row.type === 'cigarro' && <p className="mt-2 text-xs text-muted-foreground">Formatos sem preço ou com valor zero não serão vendidos. O estoque será contado em carteiras.</p>}
              </article>
            ))}
            <button type="button" onClick={() => setDrafts(previous => [...previous, blankSupplierDraft()])} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"><Plus className="h-4 w-4" />Adicionar produto manualmente</button>
          </fieldset>
        </div>
        <footer className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t border-border bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
          {drafts.length > 0 && !drafts.some(row => row.selected) && <p role="status" className="w-full text-sm font-semibold text-amber-800 dark:text-amber-300">{copy('catalog.unchecked', 'Nenhum produto selecionado. Marque os desejados e revise os avisos de duplicidade.')}</p>}
          {error && Object.keys(rowErrors).length > 0 && <p className="w-full text-sm font-semibold text-amber-800 dark:text-amber-300">{copy('catalog.fix', 'Confira os dados antes de repetir.')}</p>}
          <div><p className="text-xs text-muted-foreground">{drafts.filter(row => row.selected).length} selecionados. Confira os valores antes de salvar.</p><div className="mt-1 flex gap-3 text-xs"><button type="button" disabled={isReading || isSaving} onClick={() => setDrafts(previous => previous.map((row, index) => ({ ...row, selected: !duplicated(row, index) || !!row.allowDuplicate })))} className="min-h-11 text-primary hover:underline">Selecionar todos</button><button type="button" disabled={isReading || isSaving} onClick={() => setDrafts(previous => previous.map(row => ({ ...row, selected: false })))} className="min-h-11 text-primary hover:underline">Desmarcar todos</button></div></div>
          <button type="button" onClick={save} disabled={isReading || isSaving || !drafts.length} className="min-h-11 w-full rounded-xl bg-primary px-4 py-3 sm:w-auto text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{isSaving ? copy('catalog.saving', 'Salvando produtos...') : copy('catalog.save', 'Cadastrar selecionados')}</button>
        </footer>
      </div>
    </div>, document.body
  );
}

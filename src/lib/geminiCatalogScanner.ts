import { prepareProductImage } from './geminiProductScanner';
import { parseSupplierDraft, type SupplierDraft } from './supplierCatalog';

export async function prepareCatalogFile(file: File): Promise<string> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > 3 * 1024 * 1024) throw new Error('O PDF deve ter até 3 MB. Divida o catálogo em arquivos menores.');
    const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (header !== '%PDF-') throw new Error('Este arquivo não é um PDF válido.');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível abrir o PDF.'));
      reader.onload = () => resolve(`data:application/pdf;base64,${String(reader.result).split(',')[1]}`);
      reader.readAsDataURL(file);
    });
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha uma foto JPEG, PNG ou WebP, ou um arquivo PDF.');
  if (file.size > 20 * 1024 * 1024) throw new Error('A foto é muito grande. Escolha uma imagem de até 20 MB.');
  return prepareProductImage(file);
}

export async function recognizeCatalog(dataUrl: string, categories: string[], signal?: AbortSignal): Promise<{ products: SupplierDraft[]; truncated: boolean }> {
  const data = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!data || data[2].length % 4 !== 0) throw new Error('O arquivo está inválido. Selecione outro PDF ou foto.');
  if (data[2].length > 4 * 1024 * 1024) throw new Error('O arquivo é muito grande. Divida o catálogo em arquivos menores.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 50000);
  try {
    const response = await fetch('/api/gemini/recognize-catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ fileBase64: data[2], mimeType: data[1].toLowerCase(), availableCategories: categories.slice(0, 100) })
    });
    const result = await response.json().catch(() => null);
    if (response.status === 429) throw new Error('O limite da IA foi atingido. Tente mais tarde ou adicione os produtos manualmente.');
    if (!response.ok || !result) throw new Error(response.status === 413 ? 'O arquivo é muito grande. Divida o catálogo em arquivos menores.' : 'Não foi possível ler o catálogo agora. Tente outra foto ou PDF, ou preencha manualmente.');
    if (result.success !== true || !Array.isArray(result.products) || result.products.length === 0 || result.products.length > 200) throw new Error('A IA não identificou produtos. Tente um arquivo mais legível ou preencha manualmente.');
    return { products: result.products.map(parseSupplierDraft), truncated: result.truncated === true };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Leitura interrompida. Os itens já revisados foram mantidos.' : 'A leitura demorou demais. Tente um catálogo menor ou preencha manualmente.');
    if (error instanceof TypeError) throw new Error('Não foi possível enviar o arquivo. Verifique sua conexão ou preencha manualmente.');
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}

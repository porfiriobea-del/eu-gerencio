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
  const imageType = file.type === 'image/jpg' ? 'image/jpeg' : (!file.type || file.type === 'application/octet-stream') ? (/\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : '') : file.type;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageType)) throw new Error('Escolha uma foto JPEG, PNG ou WebP, ou um arquivo PDF.');
  if (file.size > 20 * 1024 * 1024) throw new Error('A foto é muito grande. Escolha uma imagem de até 20 MB.');
  return prepareProductImage(file, 2800);
}

export async function recognizeCatalog(dataUrl: string, categories: string[], signal?: AbortSignal): Promise<{ products: SupplierDraft[]; truncated: boolean; skippedCount?: number }> {
  const data = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!data || data[2].length % 4 !== 0) throw new Error('O arquivo está inválido. Selecione outro PDF ou foto.');
  const sizeMessage = 'O limite por arquivo enviado é 3 MB. Reduza a foto ou divida o PDF em arquivos menores.';
  if (data[2].length > 4 * 1024 * 1024) throw new Error(sizeMessage);
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
    if (!response.ok || !result) {
      console.error('[Gemini catalog scanner]', {
        code: typeof result?.code === 'string' ? result.code : 'HTTP_ERROR', status: response.status,
        ...(typeof result?.providerReason === 'string' ? { providerReason: result.providerReason } : {}),
        providerStatus: typeof result?.providerStatus === 'number' ? result.providerStatus : null,
        requestId: response.headers.get('x-request-id'), mimeType: data[1].toLowerCase(), base64Length: data[2].length
      });
    }
    if (response.status === 429) throw new Error('O limite da IA foi atingido. Tente mais tarde ou adicione os produtos manualmente.');
    if (!response.ok || !result) {
      if (response.status === 413 || result?.code === 'FILE_TOO_LARGE') throw new Error(sizeMessage);
      const messages: Record<string, string> = {
        PROVIDER_UNAVAILABLE: 'A IA está temporariamente indisponível, mesmo após as tentativas automáticas. Tente novamente em alguns minutos ou preencha manualmente.',
        MODEL_UNAVAILABLE: 'O serviço de leitura está indisponível. Você pode cadastrar os produtos manualmente enquanto a configuração é verificada.',
        AUTHORIZATION_FAILED: 'O serviço de leitura está indisponível. Você pode cadastrar os produtos manualmente enquanto a configuração é verificada.',
        MISSING_API_KEY: 'O serviço de leitura está indisponível. Você pode cadastrar os produtos manualmente enquanto a configuração é verificada.',
        INCOMPLETE_CATALOG: 'O catálogo tem muitas informações. Envie menos páginas ou divida a foto em partes.',
        INVALID_JSON_RESPONSE: 'A IA não conseguiu organizar os produtos desta imagem. Envie menos itens por foto ou preencha manualmente.',
        INVALID_CATALOG_RESPONSE: 'A IA não conseguiu organizar os produtos desta imagem. Envie menos itens por foto ou preencha manualmente.',
        TIMEOUT: 'A leitura demorou demais. Envie menos páginas ou uma foto com menos produtos.',
        REQUEST_REJECTED: 'A IA recusou a leitura após as tentativas automáticas. Tente novamente mais tarde ou adicione os produtos manualmente.'
      };
      throw Object.assign(new Error(messages[result?.code] || 'Não foi possível ler o catálogo agora. Tente outra foto ou PDF, ou preencha manualmente.'), { code: result?.code });
    }
    if (result.success !== true || !Array.isArray(result.products) || result.products.length === 0 || result.products.length > 200) throw new Error('A IA não identificou produtos. Tente um arquivo mais legível ou preencha manualmente.');
    const products: SupplierDraft[] = [];
    let skippedCount = Number.isSafeInteger(result.skippedCount) ? result.skippedCount : 0;
    for (const row of result.products) {
      try { products.push(parseSupplierDraft(row)); } catch { skippedCount++; }
    }
    if (!products.length) throw new Error('A IA não identificou produtos completos. Tente uma foto mais próxima ou preencha manualmente.');
    return { products, truncated: result.truncated === true, skippedCount };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Leitura interrompida. Os itens já revisados foram mantidos.' : 'A leitura demorou demais. Tente um catálogo menor ou preencha manualmente.');
    if (error instanceof TypeError) throw new Error('Não foi possível enviar o arquivo. Verifique sua conexão ou preencha manualmente.');
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}

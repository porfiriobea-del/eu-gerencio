export interface RecognizedProduct {
  name: string;
  category: string;
}

/** Resize before upload so mobile photos fit serverless request limits. */
export async function prepareProductImage(file: File): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível abrir a foto.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível abrir esta imagem. Escolha uma foto JPEG, PNG ou WebP.'));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível processar a imagem.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Sends only image data and category context; prices and stock are entered manually. */
export async function recognizeProductFromImage(
  imageDataUrl: string,
  availableCategories: string[] = [],
  signal?: AbortSignal
): Promise<RecognizedProduct> {
  const image = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(imageDataUrl);
  if (!image || image[2].length % 4 !== 0) {
    throw new Error('Escolha uma imagem JPEG, PNG ou WebP válida.');
  }

  if (image[2].length > 4 * 1024 * 1024) {
    throw new Error('A foto é muito grande. Tire outra foto ou escolha uma imagem menor.');
  }

  // Only the Base64 payload is sent; the canvas data URL prefix is excluded.
  const imageBase64 = image[2];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();

  let result: { success?: boolean; product?: RecognizedProduct; error?: string } | null;
  try {
    const res = await fetch('/api/gemini/recognize-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType: image[1].toLowerCase(), availableCategories }),
      signal: controller.signal
    });
    result = await res.json().catch(() => null);
    if (res.status === 413) throw new Error('A foto é muito grande. Escolha uma imagem menor.');
    if (res.status === 429) {
      throw new Error('O limite de leitura por IA foi atingido. Preencha nome e categoria manualmente ou tente mais tarde.');
    }
    if (res.status >= 500 || res.status === 401 || res.status === 403 || res.status === 404) {
      throw new Error('A leitura automática não está disponível no momento. Você pode preencher nome e categoria manualmente.');
    }
    if (!res.ok) {
      throw new Error(typeof result?.error === 'string' ? result.error : 'Não foi possível ler esta foto. Preencha os dados manualmente ou escolha outra imagem.');
    }
    const product = result?.product;
    if (!result) throw new Error('O serviço de leitura de imagens não está disponível neste endereço. Preencha manualmente.');
    if (result.success !== true || typeof product?.name !== 'string' || !product.name.trim() ||
        typeof product?.category !== 'string' || !product.category.trim()) {
      throw new Error('A IA retornou dados incompletos. Tente outra foto ou preencha manualmente.');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(signal?.aborted ? 'Leitura interrompida. Preencha os dados manualmente.' : 'A leitura demorou mais que o esperado. Preencha os dados manualmente ou tente novamente.');
    }
    if (error instanceof TypeError) throw new Error('Não foi possível enviar a foto. Verifique sua conexão ou preencha manualmente.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }

  const product = result!.product!;
  const category = product.category.trim();
  const matchedCategory = availableCategories.find(c => c.toLowerCase() === category.toLowerCase());
  return { name: product.name.trim(), category: matchedCategory || category };
}

export interface RecognizedProduct {
  name: string;
  category: string;
}

/** Sends only image data and category context; prices and stock are entered manually. */
export async function recognizeProductFromImage(
  imageDataUrl: string,
  availableCategories: string[] = []
): Promise<RecognizedProduct> {
  const image = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(imageDataUrl);
  if (!image || image[2].length % 4 !== 0) {
    throw new Error('Escolha uma imagem JPEG, PNG ou WebP válida.');
  }

  const res = await fetch('/api/gemini/recognize-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: image[2],
      mimeType: image[1].toLowerCase(),
      availableCategories
    })
  });

  const result = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof result?.error === 'string'
      ? result.error
      : `Não foi possível analisar a foto (status ${res.status}).`);
  }
  const product = result?.product;
  if (result?.success !== true || typeof product?.name !== 'string' ||
      !product.name.trim() || typeof product?.category !== 'string' || !product.category.trim()) {
    throw new Error('A IA retornou dados incompletos. Tente outra foto ou preencha manualmente.');
  }

  const category = product.category.trim();
  const matchedCategory = availableCategories.find(c => c.toLowerCase() === category.toLowerCase());
  return { name: product.name.trim(), category: matchedCategory || category };
}

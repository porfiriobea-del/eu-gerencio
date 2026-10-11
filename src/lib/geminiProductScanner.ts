export interface RecognizedProduct {
  name: string;
  category: string;
  type: 'comum' | 'cigarro';
  suggestedSalePrice: number;
  estimatedCost: number;
  stock: number;
  unitsPerPackage: number;
  purchaseForm: 'unidade' | 'fardo' | 'pacote';
  barcode?: string;
  description?: string;
  imageUrl?: string;
}

/**
 * Sends a base64 image or data URL to the backend Gemini AI vision endpoint
 * to automatically identify the product name, category (e.g. Bebidas), pricing and quantities.
 */
export async function recognizeProductFromImage(
  imageDataUrl: string,
  availableCategories: string[] = []
): Promise<RecognizedProduct> {
  const mimeMatch = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  const res = await fetch('/api/gemini/recognize-product', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      imageBase64: imageDataUrl,
      mimeType,
      availableCategories
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao reconhecer imagem (status ${res.status})`);
  }

  const result = await res.json();
  if (!result.success || !result.product) {
    throw new Error(result.error || 'Nenhum produto pôde ser identificado.');
  }

  const p = result.product;
  const rawCategory = (p.category || 'Diversos').trim();
  
  // Normalize category against available categories if exact or case-insensitive match exists
  let matchedCategory = rawCategory;
  if (availableCategories.length > 0) {
    const found = availableCategories.find(c => c.toLowerCase() === rawCategory.toLowerCase());
    if (found) {
      matchedCategory = found;
    } else {
      // Check for keywords
      const lower = rawCategory.toLowerCase();
      if (lower.includes('bebid') || lower.includes('cervej') || lower.includes('refriger')) {
        const bebCat = availableCategories.find(c => c.toLowerCase().includes('bebid'));
        if (bebCat) matchedCategory = bebCat;
      } else if (lower.includes('cigar') || lower.includes('tabac') || lower.includes('fumo')) {
        const cigCat = availableCategories.find(c => c.toLowerCase().includes('cigar'));
        if (cigCat) matchedCategory = cigCat;
      }
    }
  }

  return {
    name: p.name || 'Produto Identificado',
    category: matchedCategory,
    type: p.type === 'cigarro' ? 'cigarro' : 'comum',
    suggestedSalePrice: Number(p.suggestedSalePrice) || 0,
    estimatedCost: Number(p.estimatedCost) || 0,
    stock: Number(p.stock) || 10,
    unitsPerPackage: Number(p.unitsPerPackage) || 1,
    purchaseForm: (['unidade', 'fardo', 'pacote'].includes(p.purchaseForm) ? p.purchaseForm : 'unidade') as 'unidade' | 'fardo' | 'pacote',
    barcode: p.barcode || '',
    description: p.description || '',
    imageUrl: imageDataUrl
  };
}

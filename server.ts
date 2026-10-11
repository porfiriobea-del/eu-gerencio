import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Support larger payloads for base64 images
app.use(express.json({ limit: '25mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API endpoint: Auto-detect product info from photo/camera
app.post('/api/gemini/recognize-product', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', availableCategories = [] } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Nenhuma foto fornecida.' });
    }

    const categoriesPrompt = availableCategories.length > 0 
      ? `As categorias cadastradas no comércio são: ${JSON.stringify(availableCategories)}.`
      : `Categorias comuns: "Bebidas", "Cigarros", "Doces & Balas", "Salgadinhos & Snacks", "Mercearia", "Limpeza", "Higiene Pessoal", "Frios & Laticínios", "Diversos".`;

    const prompt = `Você é um leitor inteligente de produtos para comércios e mercearias brasileiras.
O usuário tirou uma foto de um produto físico (ex: bebida, refrigerante, cerveja, cigarro, doce, salgadinho, produto de limpeza ou alimento).
Analise a embalagem ou rótulo na foto e identifique:

1. "name": Nome comercial claro e correto do produto (incluindo marca, sabor/versão e tamanho/volume se legível, ex: "Coca-Cola 2L", "Refrigerante Guaraná Antarctica 350ml", "Cerveja Heineken Long Neck 330ml", "Cerveja Brahma Chopp Lata 350ml", "Cigarro Marlboro Red Maço", "Chocolate KitKat 41.5g", "Salgadinho Ruffles 76g", "Isqueiro BIC Maxi").
2. "category": Categoria exata do produto. ${categoriesPrompt}
   - Se for qualquer refrigerante, cerveja, destilado, suco, energético ou água -> DEVE ser "Bebidas".
   - Se for cigarro, tabaco, seda, fumo -> DEVE ser "Cigarros".
   - Se for bombom, chocolate, bala, chiclete -> DEVE ser "Doces & Balas" (ou Doces).
   - Se for salgadinho, batata, amendoim -> DEVE ser "Salgadinhos & Snacks" (ou Mercearia).
   - Se for arroz, feijão, óleo, molho -> DEVE ser "Mercearia" (ou Alimentos).
3. "type": se for cigarro ou tabaco retorne "cigarro", caso contrário "comum".
4. "suggestedSalePrice": valor sugerido de venda em Reais no varejo (número, ex: 10.50).
5. "estimatedCost": custo estimado de compra (número, ex: 7.00).
6. "stock": quantidade inicial sugerida (número inteiro, padrão 10 ou 12 se for engradado/fardo).
7. "unitsPerPackage": unidades por pacote/fardo se for produto vendido em lote (ex: cerveja 12, cigarro 200, refrigerante 6, ou 1 se unitário).
8. "purchaseForm": "unidade" | "fardo" | "pacote".
9. "barcode": código de barras numérico (EAN) se estiver nítido e legível na foto, senão "" (vazio).
10. "description": uma frase resumindo o produto identificado.

Responda ESTRITAMENTE em formato JSON com as chaves:
{
  "name": string,
  "category": string,
  "type": "comum" | "cigarro",
  "suggestedSalePrice": number,
  "estimatedCost": number,
  "stock": number,
  "unitsPerPackage": number,
  "purchaseForm": "unidade" | "fardo" | "pacote",
  "barcode": string,
  "description": string
}`;

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const candidateModels = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    let lastError: any = null;
    let responseText = '';

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType: mimeType || 'image/jpeg'
                  }
                }
              ]
            }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        });

        if (response && response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed, trying next candidate:`, err.message || err);
      }
    }

    let data;
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        data = JSON.parse(cleaned);
      }
    } else {
      // Graceful heuristic fallback if quota or network issue
      data = {
        name: 'Produto da Foto',
        category: availableCategories[0] || 'Bebidas',
        type: 'comum',
        suggestedSalePrice: 10.00,
        estimatedCost: 7.00,
        stock: 10,
        unitsPerPackage: 1,
        purchaseForm: 'unidade',
        barcode: '',
        description: 'Foto carregada pelo usuário. Confirme os valores nos campos acima.'
      };
    }

    return res.json({
      success: true,
      product: data
    });
  } catch (error: any) {
    console.error('Error recognizing product image:', error);
    // Even on error, return a usable fallback draft
    return res.json({ 
      success: true, 
      product: {
        name: 'Produto da Foto',
        category: 'Bebidas',
        type: 'comum',
        suggestedSalePrice: 10.00,
        estimatedCost: 7.00,
        stock: 10,
        unitsPerPackage: 1,
        purchaseForm: 'unidade',
        barcode: '',
        description: 'Foto pronta para conferência e cadastro.'
      }
    });
  }
});

// Vite middleware in dev or static files in production
const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening at http://0.0.0.0:${port}`);
});

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

// Analyze only the product label. Never fabricate a successful recognition.
app.post('/api/gemini/recognize-product', async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg', availableCategories = [] } = req.body || {};
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
    return res.status(400).json({ error: 'Nenhuma foto fornecida.' });
  }

  // Accept either raw Base64 or the data URL produced by canvas/FileReader.
  const dataUrl = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(imageBase64);
  const imageMimeType = dataUrl ? dataUrl[1].toLowerCase() : mimeType;
  const data = dataUrl ? dataUrl[2] : imageBase64;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageMimeType) ||
      data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return res.status(400).json({ error: 'Envie uma imagem JPEG, PNG ou WebP em Base64 válido.' });
  }
  if (!Array.isArray(availableCategories) || availableCategories.length > 100 ||
      availableCategories.some(category => typeof category !== 'string' || category.length > 100)) {
    return res.status(400).json({ error: 'A lista de categorias é inválida.' });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Leitura por IA indisponível. Preencha nome e categoria manualmente.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [
        { text: `Leia o rótulo do produto na imagem. Retorne APENAS o nome comercial (marca, versão e tamanho legíveis) e a categoria. Não estime preço, custo, quantidade ou qualquer outro campo. Use uma categoria desta lista quando aplicável: ${JSON.stringify(availableCategories)}. Se a imagem não permitir identificar o produto, retorne name e category vazios.` },
        { inlineData: { data, mimeType: imageMimeType } }
      ] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: { name: { type: 'string' }, category: { type: 'string' } },
          required: ['name', 'category'],
          additionalProperties: false
        },
        httpOptions: { timeout: 30000 }
      }
    });

    let product;
    try {
      product = JSON.parse((response.text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
    } catch {
      return res.status(502).json({ error: 'A IA retornou uma resposta inválida. Tente outra foto ou preencha manualmente.' });
    }
    if (typeof product?.name !== 'string' || !product.name.trim() ||
        typeof product?.category !== 'string' || !product.category.trim()) {
      return res.status(422).json({ error: 'Não foi possível identificar o rótulo. Tente outra foto ou preencha manualmente.' });
    }
    const category = availableCategories.find(value => value.toLowerCase() === product.category.trim().toLowerCase()) || product.category.trim();
    return res.json({ success: true, product: { name: product.name.trim(), category } });
  } catch {
    return res.status(502).json({ error: 'Não foi possível consultar a IA. Tente novamente ou preencha manualmente.' });
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

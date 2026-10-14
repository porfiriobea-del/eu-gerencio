import express from 'express';
import { recognizeProduct } from './server/geminiRecognition.ts';
import { recognizeCatalog } from './api/gemini/recognize-catalog.ts';
import relatorio from './api/relatorio.ts';
import exportFeedback from './api/feedback/export.ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Support larger payloads for base64 images
app.use(express.json({ limit: '25mb' }));

app.post('/api/gemini/recognize-product', recognizeProduct);
app.post('/api/gemini/recognize-catalog', recognizeCatalog);
app.post('/api/feedback/export', exportFeedback);
app.post('/api/relatorio', relatorio);

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

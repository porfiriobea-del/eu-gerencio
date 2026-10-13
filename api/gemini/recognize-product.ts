// Shared handler for Vercel; the API key stays on the server.
export { recognizeProduct as default } from '../../server/geminiRecognition';
export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';
import { auth } from './firebase';
import { fetchCloud } from './cloudTransport';
export {
  postToGoogleSheets, GOOGLE_SHEETS_WEBHOOK_URL, getGoogleSheetsWebhookUrl,
  setGoogleSheetsWebhookUrl, testGoogleSheetsWebhook, getGoogleSheetsLogs,
  clearGoogleSheetsLogs, isGoogleSheetsWebhookEnabled, setGoogleSheetsWebhookEnabled
} from './googleSheets';
export type { GoogleSheetsMovementPayload, GoogleSheetsWebhookLog } from './googleSheets';

// The legacy anon key identifies the project; signed-in requests use the user's JWT.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://zixwpheatwyptkqpzgdg.supabase.co')
  .trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppeHdwaGVhdHd5cHRrcXB6Z2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MTkxNDUsImV4cCI6MjEwNjM5NTE0NX0.ioEXPQlmL-5bRyZuChmoxkg2veYNMi8lSD6_BehyuAU').trim();
export const SUPABASE_ANON_KEY = SUPABASE_KEY;
export const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1/`;
console.info('[Supabase] Configuração', {
  endpoint: SUPABASE_URL,
  keyPrefix: SUPABASE_KEY.slice(0, 15)
});
export function assertSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para acessar os dados da loja.');
}

// Firebase Auth is retained only for Google identity. Configure Firebase Third-Party Auth in Supabase.
// No business records are stored in Firebase or browser storage.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  accessToken: async () => auth.currentUser ? await auth.currentUser.getIdToken() : null,
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchCloud }
});

import { createClient } from '@supabase/supabase-js';
import { auth } from './firebase';
import { fetchCloud } from './cloudTransport';
export {
  postToGoogleSheets, GOOGLE_SHEETS_WEBHOOK_URL, getGoogleSheetsWebhookUrl,
  setGoogleSheetsWebhookUrl, testGoogleSheetsWebhook, getGoogleSheetsLogs,
  clearGoogleSheetsLogs, isGoogleSheetsWebhookEnabled, setGoogleSheetsWebhookEnabled
} from './googleSheets';
export type { GoogleSheetsMovementPayload, GoogleSheetsWebhookLog } from './googleSheets';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1/`;
export function assertSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para acessar os dados da loja.');
}

// Firebase Auth is retained only for Google identity. Configure Firebase Third-Party Auth in Supabase.
// No business records are stored in Firebase or browser storage.
export const supabase = createClient(SUPABASE_URL || 'https://configuration-required.invalid', SUPABASE_ANON_KEY || 'configuration-required', {
  accessToken: async () => auth.currentUser ? await auth.currentUser.getIdToken() : null,
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchCloud }
});

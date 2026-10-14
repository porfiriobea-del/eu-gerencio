import { auth } from './firebase';

export async function exportFeedbackToSheets(feedbackId: string): Promise<boolean> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return false;
    const response = await fetch('/api/feedback/export', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feedbackId }), signal: AbortSignal.timeout(25000) });
    const result = await response.json().catch(() => null);
    return response.ok && result?.success === true;
  } catch { return false; }
}

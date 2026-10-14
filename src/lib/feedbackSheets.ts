import { sendReport } from './usageReporting';
export async function exportFeedbackToSheets(feedbackId: string, storeId?: string): Promise<boolean> {
  return sendReport({ categoria: 'feedback', feedbackId }, storeId);
}

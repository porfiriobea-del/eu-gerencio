// Backward-compatible route: the old PII export is no longer used.
import type { Request, Response } from 'express';
import relatorio from '../relatorio.ts';
export default async function exportFeedback(req: Request, res: Response) {
  req.body = { ...req.body, categoria: 'feedback' };
  return relatorio(req, res);
}
export const config = { maxDuration: 30 };

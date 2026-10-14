// Backward-compatible route: the old PII export is no longer used.
import type { Request, Response } from 'express';
import { enviarParaPlanilha } from '../../server/relatorio.js';
export default async function exportFeedback(req: Request, res: Response) {
  req.body = { ...req.body, categoria: 'feedback' };
  return enviarParaPlanilha(req, res);
}
export const config = { maxDuration: 30 };

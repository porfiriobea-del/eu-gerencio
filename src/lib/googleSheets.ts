/** Retired browser webhook. Compatibility exports are inert, including with old saved settings. */
export const GOOGLE_SHEETS_WEBHOOK_URL = '';
export interface GoogleSheetsMovementPayload {
  tipo: string;
  descricao?: string;
  valor?: number;
  quantidade?: number;
  produto?: string;
  forma_pagamento?: string;
  cliente?: string;
  operador?: string;
  timestamp?: number;
  created_at?: string;
  [key: string]: any;
}

export interface GoogleSheetsWebhookLog {
  id: string;
  timestamp: number;
  tipo: string;
  produto: string;
  valor: number;
  quantidade: number;
  status: 'enviado' | 'erro';
  mensagem: string;
  url: string;
}


export function hydrateCloudSheets(_owner?:string,_url?:string,_enabled?:boolean) {}
export const getGoogleSheetsWebhookUrl=()=>'';
export const isGoogleSheetsWebhookEnabled=()=>false;
export function setGoogleSheetsWebhookUrl(_url:string) {}
export function setGoogleSheetsWebhookEnabled(_enabled:boolean) {}
export const getGoogleSheetsLogs=():GoogleSheetsWebhookLog[]=>[];
export function clearGoogleSheetsLogs() {}
export async function postToGoogleSheets(_payload:GoogleSheetsMovementPayload,_url?:string) {return {success:false,message:'Integração antiga desativada.'};}
export async function testGoogleSheetsWebhook(_url?:string) {return {success:false,message:'Integração antiga desativada.'};}

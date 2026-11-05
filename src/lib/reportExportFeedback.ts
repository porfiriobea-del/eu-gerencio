export type ExportNotice = {type:'success'|'error';text:string;url?:string};
export class ReportExportError extends Error {
  constructor(public code:'GOOGLE_AUTH'|'GOOGLE_QUOTA'|'EXPORT_TIMEOUT'|'EXPORT_NETWORK'|'GOOGLE_FAILURE',public stage:string,public status?:number,public partialUrl?:string) {
    super(code);this.name='ReportExportError';
  }
}
const errorKeys:Record<string,string>={GOOGLE_AUTH:'report.exportAuth',GOOGLE_QUOTA:'report.exportQuota',EXPORT_TIMEOUT:'report.exportTimeout',EXPORT_NETWORK:'report.exportNetwork',GOOGLE_FAILURE:'report.exportGoogleFailed'};
export function exportErrorText(error:unknown,v:(key:string)=>string) {
  const code=error instanceof Error&&(error as ReportExportError).code;
  return v(code&&errorKeys[code] || 'report.exportFailed');
}
export function logExportError(format:string,error:unknown) {
  const detail=error as Partial<ReportExportError>|null;
  // Do not include tokens, report contents, customer names or provider response bodies.
  console.warn('[Report export]',{format,code:detail?.code||'EXPORT_FAILED',stage:detail?.stage||'generate',status:detail?.status??null});
}
/** Each request has a real, abortable deadline instead of abandoning a still-running export. */
export async function googleReportRequest(url:string,init:RequestInit,stage:string,partialUrl?:string,timeoutMs=60000):Promise<Response> {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(url,{...init,signal:controller.signal});
    if(!response.ok)throw new ReportExportError(response.status===401||response.status===403?'GOOGLE_AUTH':response.status===429?'GOOGLE_QUOTA':'GOOGLE_FAILURE',stage,response.status,partialUrl);
    return response;
  } catch(error) {
    if(error instanceof ReportExportError)throw error;
    throw new ReportExportError(controller.signal.aborted?'EXPORT_TIMEOUT':'EXPORT_NETWORK',stage,undefined,partialUrl);
  } finally {clearTimeout(timer);}
}

/** A blocked popup is not a failed export: the UI retains a normal link to the created sheet. */
export function openExportLink(url:string) {
  try {return Boolean(window.open(url,'_blank','noopener,noreferrer'));} catch {return false;}
}

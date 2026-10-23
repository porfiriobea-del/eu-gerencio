import {getAccessState} from './accessControl';
export interface Shift {id:string;owner_id:string;employee_id:string;employee_name:string;started_at:number;ended_at:number|null;status:'open'|'ended'|'not_closed';}
export async function workforceRpc<T=any>(name:string,args:Record<string,unknown>={}) :Promise<T>{
 const {supabase}=await import('./supabase');
 const {data,error}=await supabase.rpc(name,{store_id:getAccessState().storeId,...args});
 if(error)throw Object.assign(new Error('Não foi possível confirmar a ação. Verifique a conexão e a migração de permissões do Supabase.'),{code:error.code});
 if(typeof window!=='undefined' && ['eu_staff_sale','eu_staff_sale_fifo','eu_staff_receive','eu_shift_action','eu_change_own_pin'].includes(name))window.dispatchEvent(new Event('cloud-refresh'));
 return data as T;
}
export const getShifts=()=>workforceRpc<Shift[]>('eu_list_shifts');
export const shiftAction=(action:'start'|'end',employeeId?:string)=>workforceRpc<Shift|null>('eu_shift_action',{action,employee_id:employeeId || null});

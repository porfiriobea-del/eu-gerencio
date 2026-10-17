export type AccessRole='owner'|'manager'|'employee';
export function normalizeAccessRole(role?:string):AccessRole {
 const value=role?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim() || '';
 return /^(gerente|manager)(\b|$)/.test(value)?'manager':'employee';
}
export function canAccessPath(role:AccessRole,path:string){return role!=='employee'||['/','/caixa','/estoque','/fiado'].includes(path.replace(/\/$/,'')||'/');}
let state:{enabled:boolean;role:AccessRole;storeId:string;employeeId?:string;scoped:boolean}={enabled:false,role:'owner',storeId:'',scoped:false};
export const getAccessState=()=>state;
export const configureAccess=(next:Partial<typeof state>)=>{state={...state,...next};};
export function requireManagement(){if(state.role==='employee')throw new Error('Esta ação é permitida apenas ao dono ou gerente.');}
export function requireOwner(){if(state.role!=='owner')throw new Error('Esta ação é permitida apenas ao dono.');}
export interface DeleteTarget {table:string;id:string;}
let approve:((targets:DeleteTarget[])=>Promise<string>)|undefined;
export const setDeletionApprover=(handler:typeof approve)=>{approve=handler;};
export function requestDeletionApproval(targets:DeleteTarget[]){requireManagement();if(!approve)throw new Error('Abra a loja novamente para confirmar com o PIN do dono.');return approve(targets);}

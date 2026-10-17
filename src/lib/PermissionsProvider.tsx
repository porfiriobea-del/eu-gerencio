import {useEffect,useState,type ReactNode} from 'react';
import {useEmployee} from './employeeContext';
import {configureAccess,getAccessState,normalizeAccessRole,type AccessRole,canAccessPath} from './accessControl';
import {workforceRpc} from './workforceApi';
import {usePreferences} from './preferencesContext';
import {PermissionsContext} from './permissionsContext';
export function PermissionsProvider({children}:{children:ReactNode}){
 const {currentEmployee}=useEmployee();const {v}=usePreferences();
 const scope=getAccessState();
 const [verified,setVerified]=useState<{role:AccessRole;employeeId?:string}|null>(null),[error,setError]=useState<false|'setup'|'denied'>(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!scope.scoped)return;
  let alive=true;
  const refresh=()=>void workforceRpc<{role:AccessRole;employeeId?:string}>('eu_access_context').then(value=>{
   if(alive){setVerified(value);setError(false);}
  }).catch((error)=>{if(alive){setError(['PGRST202','PGRST205','42883'].includes(error.code)?'setup':'denied');setVerified(null);}});
  refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[scope.storeId,scope.scoped,retry]);
 const role=scope.scoped?(verified?.role || scope.role):(currentEmployee?.id && currentEmployee.id!=='owner'?normalizeAccessRole(currentEmployee.role):'owner');
 const employeeId=scope.scoped?verified?.employeeId:currentEmployee?.id;
 configureAccess({enabled:true,role,employeeId});
 const ready=!scope.scoped || !!verified;
 if(!ready)return <div className="p-6 text-foreground"><p role="status">{v(error==='setup'?'access.setupRequired':error==='denied'?'access.denied':'access.loading')}</p>{error&&<button className="p-3 border rounded-xl mt-3" onClick={()=>setRetry(n=>n+1)}>{v('access.retry')}</button>}</div>;
 return <PermissionsContext.Provider value={{role,isEmployee:role==='employee',isOwner:role==='owner',employeeId,ready,canAccess:path=>canAccessPath(role,path)}}>{children}</PermissionsContext.Provider>;
}

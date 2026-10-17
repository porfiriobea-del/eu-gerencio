import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {setDeletionApprover,type DeleteTarget} from '../lib/accessControl';
import {workforceRpc} from '../lib/workforceApi';
import {usePermissions} from '../lib/permissionsContext';
import {usePreferences} from '../lib/preferencesContext';
export function OwnerPinDialog(){
 const {v}=usePreferences(),{isOwner}=usePermissions();
 const [request,setRequest]=useState<{targets:DeleteTarget[];resolve:(token:string)=>void;reject:(error:Error)=>void}|null>(null),[pin,setPin]=useState(''),[confirmation,setConfirmation]=useState(''),[configured,setConfigured]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef<typeof request>(null),panel=useRef<HTMLFormElement>(null);
 useEffect(()=>{setDeletionApprover(targets=>new Promise((resolve,reject)=>{
  active.current?.reject(new Error(v('access.cancelled')));
  const next={targets,resolve,reject};active.current=next;setRequest(next);setPin('');setConfirmation('');setError('');setConfigured(null);
  void workforceRpc<boolean>('eu_owner_pin_state').then(setConfigured).catch(()=>setError(v('access.setupRequired')));
 }));return()=>{setDeletionApprover(undefined);active.current?.reject(new Error(v('access.cancelled')));};},[v]);
 const close=()=>{active.current?.reject(new Error(v('access.cancelled')));active.current=null;setRequest(null);setPin('');};
 useEffect(()=>{if(!request)return;const previous=document.activeElement as HTMLElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const controls=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)')||[]);controls()[0]?.focus();
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)close();if(e.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
 document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.focus();};},[request,busy]);
 if(!request)return null;
 const submit=async()=>{if(busy||configured===null)return;setBusy(true);setError('');try{
  if(!configured){if(!isOwner||pin!==confirmation){setError(v('access.pinMismatch'));return;}await workforceRpc('eu_set_owner_pin',{new_pin:pin});setConfigured(true);}
  const result=await workforceRpc<{ok:boolean;token?:string;code?:string}>('eu_approve_deletion',{pin,targets:request.targets});
  if(!result.ok||!result.token){setError(v(result.code==='PIN_LOCKED'?'access.pinLocked':'access.pinWrong'));return;}
  request.resolve(result.token);active.current=null;setRequest(null);setPin('');
 }catch{setError(v('access.pinFailed'));}finally{setBusy(false);}};
 return createPortal(<div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={v('access.ownerPin')}><form ref={panel} className="w-full max-w-md max-h-[90dvh] overflow-auto rounded-2xl border border-border bg-surface text-foreground p-5 space-y-4" onSubmit={e=>{e.preventDefault();void submit();}}><h2 className="text-lg font-bold">{v('access.ownerPin')}</h2><p>{v(configured===false?'access.createOwnerPin':'access.deletePinHelp')}</p>
 {configured===false&&!isOwner?<p>{v('access.askOwnerPin')}</p>:<><label className="block">{v('access.ownerPin')}<input autoFocus type="password" autoComplete="off" minLength={4} maxLength={64} value={pin} onChange={e=>setPin(e.target.value)} disabled={busy} className="w-full block border border-border bg-background rounded-xl p-3"/></label>{configured===false&&<label className="block">{v('access.confirmOwnerPin')}<input type="password" autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy} className="block w-full border border-border bg-background rounded-xl p-3"/></label>}</>}
 {error&&<p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}<div className="flex gap-3"><button type="button" onClick={close} disabled={busy} className="border rounded-xl p-3">{v('access.cancel')}</button><button disabled={busy||configured===null||(configured===false&&!isOwner)} className="bg-red-600 text-white rounded-xl p-3">{v(busy?'access.wait':'access.confirmDelete')}</button></div></form></div>,document.body);
}

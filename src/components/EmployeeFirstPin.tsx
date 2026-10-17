import {getAccessState} from '../lib/accessControl';
import {useState,useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {useEmployee} from '../lib/employeeContext';
import {usePreferences} from '../lib/preferencesContext';
import {changeEmployeeFirstPin,getActiveStoreSession} from '../lib/api';
import {isObviousEmployeePin} from '../lib/teamInvitation';
import {showToast} from '../lib/actionFeedback';
export function EmployeeFirstPin() {
 const {employees,currentEmployee,isLoadingEmployees}=useEmployee();
 const session=getActiveStoreSession();
 const employee=session?.isEmployee ? employees?.find(e=>e.isActive && (getAccessState().employeeId?e.id===getAccessState().employeeId:e.email?.trim().toLowerCase()===session.employeeEmail?.trim().toLowerCase())) : employees?.find(e=>e.id===currentEmployee?.id);
 const {v}=usePreferences();
 const [oldPin,setOldPin]=useState(''),[pin,setPin]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const required=!isLoadingEmployees && !!employee?.id && (!!employee.mustChangePin || !employee.pin);
 const form=useRef<HTMLFormElement>(null);
 useEffect(()=>{
  if(!required)return;
  const previous=document.activeElement as HTMLElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const controls=()=>Array.from(form.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)') || []);
  controls()[0]?.focus();
  const trap=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}
   if(event.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(!first){event.preventDefault();return;}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  };
  document.addEventListener('keydown',trap,true);return()=>{document.removeEventListener('keydown',trap,true);document.body.style.overflow=overflow;previous?.focus();};
 },[required]);
 if(!required || !employee)return null;
 const save=async()=>{
  if(busy)return;
  if(isObviousEmployeePin(pin)){setError(v('team.pinWeak'));return;}
  if(pin.trim()!==confirmation.trim()){setError(v('team.pinMismatch'));return;}
  if(employee.pin && oldPin.trim()!==employee.pin){setError(v('team.pinIncorrect'));return;}
  if(employee.pin===pin.trim()){setError(v('team.pinDifferent'));return;}
  setBusy(true);setError('');
  try{await changeEmployeeFirstPin(employee.id!,oldPin,pin);setOldPin('');setPin('');setConfirmation('');showToast(v('team.pinSaved'));}
  catch{setError(v('team.pinFailed'));}finally{setBusy(false);}
 };
 return createPortal(<div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={v('team.firstPin')}>
 <form ref={form} className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface text-foreground border border-border p-5 space-y-4" onSubmit={e=>{e.preventDefault();void save();}}>
 <h2 className="text-lg font-bold">{v('team.firstPin')}</h2><p className="text-sm">{v('team.firstPinHelp')}</p>
 {employee.pin&&<label className="block text-sm">{v('team.currentPin')}<input autoFocus type="password" autoComplete="current-password" disabled={busy} value={oldPin} onChange={e=>setOldPin(e.target.value)} className="block w-full p-3 rounded-xl bg-background border border-border"/></label>}
 <label className="block text-sm">{v('team.newPin')}<input autoFocus={!employee.pin} type="password" autoComplete="new-password" minLength={4} maxLength={64} disabled={busy} value={pin} onChange={e=>setPin(e.target.value)} className="block w-full p-3 rounded-xl bg-background border border-border"/></label>
 <label className="block text-sm">{v('team.confirmPin')}<input type="password" autoComplete="new-password" disabled={busy} value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="block w-full p-3 rounded-xl bg-background border border-border"/></label>
 {error&&<p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
 <button type="submit" disabled={busy} className="w-full p-3 bg-primary text-white rounded-xl disabled:opacity-50">{v(busy?'team.savingPin':'team.savePin')}</button>
 </form></div>,document.body);
}

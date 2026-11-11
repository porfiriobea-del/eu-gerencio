import {useSyncExternalStore} from 'react';
export const REPORTS_PIN_KEY='eu_gerencio_reports_pinned';
const event='reports-pin-changed';
function read(){try{return localStorage.getItem(REPORTS_PIN_KEY)==='true';}catch{return false;}}
function subscribe(notify:()=>void){window.addEventListener('storage',notify);window.addEventListener(event,notify);return()=>{window.removeEventListener('storage',notify);window.removeEventListener(event,notify);};}
export function useReportsPinned(){
 const pinned=useSyncExternalStore(subscribe,read,()=>false);
 return {pinned,toggle:()=>{try{localStorage.setItem(REPORTS_PIN_KEY,String(!read()));window.dispatchEvent(new Event(event));}catch{/* Navigation remains available without browser storage. */}}};
}

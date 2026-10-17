import {useEffect,useState} from 'react';
import {usePermissions} from '../lib/permissionsContext';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {getAccessState} from '../lib/accessControl';
import {getShifts,type Shift} from '../lib/workforceApi';
export function TeamShifts(){
 const {isOwner}=usePermissions(),{v}=usePreferences(),{language}=useCurrency();const [rows,setRows]=useState<Shift[]>([]),[error,setError]=useState(false);
 useEffect(()=>{if(!isOwner||!getAccessState().enabled)return;let alive=true;const load=()=>void getShifts().then(value=>{if(alive){setRows(value);setError(false);}}).catch(()=>{if(alive)setError(true);});load();const timer=setInterval(load,15000);window.addEventListener('focus',load);return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',load);};},[isOwner]);
 if(!isOwner||!getAccessState().enabled)return null;
 const locale=language==='en'?'en-US':language==='es'?'es-ES':'pt-BR';
 const date=(ms:number)=>new Date(ms).toLocaleString(locale,{timeZone:'America/Sao_Paulo'});
 return <section className="bg-surface rounded-2xl border border-border p-4 space-y-3"><h2 className="text-lg font-bold">{v('access.teamShifts')}</h2>{error&&<p role="alert">{v('access.loadFailed')}</p>}{!rows.length&&!error&&<p>{v('access.noShifts')}</p>}
 <div className="max-h-80 overflow-y-auto space-y-2">{rows.map(row=><article key={row.id} className="border-b border-border py-2 text-sm"><strong translate="no" className="notranslate">{row.employee_name}</strong><p>{v('access.entry')}: {date(row.started_at)}</p><p>{v('access.exit')}: {row.ended_at?date(row.ended_at):v('access.inShift')}</p>{row.ended_at&&<p>{v('access.hours')}: {Math.floor((row.ended_at-row.started_at)/3600000)}h {Math.floor((row.ended_at-row.started_at)%3600000/60000)}min</p>}{row.status==='not_closed'&&<span className="text-amber-600 dark:text-amber-400 font-semibold">{v('access.notClosed')}</span>}</article>)}</div></section>;
}

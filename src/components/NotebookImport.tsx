import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Plus,Trash2} from 'lucide-react';
import type {Customer} from '../types';
import {usePreferences} from '../lib/preferencesContext';
import {useCurrency} from '../lib/useCurrency';
import {prepareCatalogFile} from '../lib/geminiCatalogScanner';
import {notebookSum,normalizedCustomerName,validateNotebook,type NotebookEntry} from '../lib/debtNotebook';
import {importDebtNotebook} from '../lib/api';
import {showToast} from '../lib/actionFeedback';
export function NotebookImport({customers,onClose}:{customers:Customer[];onClose:()=>void}) {
 const {v}=usePreferences();const {formatMoney}=useCurrency();
 const [entries,setEntries]=useState<NotebookEntry[]>([]),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
 const panel=useRef<HTMLElement>(null);
 const abort=useRef<AbortController|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement;
  const old=document.body.style.overflow;document.body.style.overflow='hidden';
  const controls=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)') || []);
  controls()[0]?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!saving)onClose();if(e.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;previous?.focus();};
 },[saving,onClose]);
 const update=(index:number,change:Partial<NotebookEntry>)=>{setConfirmed(false);setEntries(rows=>rows.map((row,i)=>i===index?{...row,...change}:row));};
 const upload=async(file?:File)=>{
  if(!file || busy)return;setBusy(true);setError('');setConfirmed(false);abort.current=new AbortController();const timer=setTimeout(()=>abort.current?.abort(),55000);
  let image='';let body='';
  try{
   if(!file.type.startsWith('image/'))throw new Error(v('notebook.photoOnly'));
   image=await prepareCatalogFile(file);if(!alive.current)return;
   const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
   if(!match || match[2].length>4*1024*1024)throw new Error(v('notebook.tooLarge'));
   body=JSON.stringify({mimeType:match[1],fileBase64:match[2]});image='';
   const response=await fetch('/api/gemini/recognize-notebook',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:abort.current.signal});body='';
   const data=await response.json();if(!response.ok)throw new Error(data.error || v('notebook.failed'));
   if(!alive.current)return;
   const rows:NotebookEntry[]=data.clients.map((row:any)=>{const lines=row.lines;return {id:crypto.randomUUID(),name:row.name,lines,readTotal:row.readTotal,amount:lines.length?notebookSum(lines):row.readTotal || 0};});
   setEntries(rows);
  }catch(e){if(alive.current)setError(e instanceof Error && e.name!=='AbortError'?e.message:v('notebook.failed'));}
  finally{image='';body='';clearTimeout(timer);if(alive.current)setBusy(false);}
 };
 const save=async()=>{
  if(saving || !confirmed)return;
  setError('');try{validateNotebook(entries);}catch{setError(v('notebook.check'));return;}
  setSaving(true);
  try{await importDebtNotebook(entries,true);showToast(v('notebook.success'));onClose();}
  catch{if(alive.current)setError(v('notebook.saveError'));}
  finally{if(alive.current)setSaving(false);}
 };
 return createPortal(<div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-2 sm:p-6" role="dialog" aria-modal="true" aria-label={v('notebook.title')}>
 <section ref={panel} className="bg-surface text-foreground border border-border rounded-2xl w-full max-w-3xl max-h-[90dvh] flex flex-col">
 <header className="p-4 border-b border-border flex justify-between gap-3"><h2 className="font-bold">{v('notebook.title')}</h2><button disabled={saving} onClick={onClose} aria-label={v('notebook.close')}><X/></button></header>
 <div className="overflow-y-auto p-4 space-y-4">
 <p className="text-sm text-muted-foreground">{v('notebook.privacy')}</p>
 <label className="inline-block border border-border rounded-xl p-3 cursor-pointer">{v('notebook.choose')}<input aria-label={v('notebook.choose')} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy||saving||entries.length>0} className="block max-w-full text-sm" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
 {busy&&<p role="status">{v('notebook.reading')}</p>}{error&&<p role="alert" className="text-amber-600 dark:text-amber-400">{error}</p>}
 {entries.map((entry,index)=>{let sum=0;try{sum=notebookSum(entry.lines);}catch{/* Invalid edits are rejected by validateNotebook before saving. */}const differs=entry.readTotal!==null&&Math.round(entry.readTotal*100)!==Math.round(sum*100);const matches=customers.filter(c=>normalizedCustomerName(c.name)===normalizedCustomerName(entry.name));return <article key={entry.id} className={`rounded-2xl p-4 border space-y-3 ${differs?'border-yellow-500 bg-yellow-500/10':'border-border'}`}>
 <div className="flex gap-2"><label className="flex-1 min-w-0">{v('notebook.name')}<input translate="no" className="notranslate w-full bg-background border border-border rounded-lg p-2" value={entry.name} disabled={saving} onChange={e=>update(index,{name:e.target.value,customerId:undefined})}/></label><button aria-label={v('notebook.remove')} disabled={saving} onClick={()=>{setConfirmed(false);setEntries(rows=>rows.filter((_,i)=>i!==index));}}><Trash2 size={18}/></button></div>
 {entry.lines.map((line,j)=><div className="flex gap-2" key={j}><input aria-label={v('notebook.item')} className="min-w-0 flex-1 bg-background border border-border rounded-lg p-2" value={line.description} disabled={saving} onChange={e=>update(index,{lines:entry.lines.map((l,k)=>k===j?{...l,description:e.target.value}:l)})}/><input aria-label={v('notebook.value')} className="w-24 bg-background border border-border rounded-lg p-2" type="number" min="0" step="0.01" disabled={saving} value={line.amount} onChange={e=>update(index,{lines:entry.lines.map((l,k)=>k===j?{...l,amount:Number(e.target.value)}:l)})}/><button disabled={saving} aria-label={v('notebook.remove')} onClick={()=>update(index,{lines:entry.lines.filter((_,k)=>k!==j)})}><X size={16}/></button></div>)}
 <button disabled={saving||entry.lines.length>=100} onClick={()=>update(index,{lines:[...entry.lines,{description:'',amount:0}]})}><Plus className="inline w-4"/>{v('notebook.addLine')}</button>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label>{v('notebook.readTotal')}<input type="number" min="0" step="0.01" className="w-full p-2 bg-background border border-border rounded-lg" value={entry.readTotal??''} disabled={saving} onChange={e=>update(index,{readTotal:e.target.value===''?null:Number(e.target.value)})}/></label><div>{v('notebook.sum')}<strong className="block p-2">{formatMoney(sum)}</strong><button disabled={saving} className="underline text-sm" onClick={()=>update(index,{amount:sum})}>{v('notebook.useSum')}</button></div><label>{v('notebook.amount')}<input type="number" min="0" step="0.01" className="w-full p-2 bg-background border border-border rounded-lg" value={entry.amount} disabled={saving} onChange={e=>update(index,{amount:Number(e.target.value)})}/></label></div>
 {differs&&<p className="text-yellow-700 dark:text-yellow-300" role="status">{v('notebook.difference')}</p>}
 {!!matches.length&&<label className="block">{v('notebook.match')}<select className="block w-full bg-background p-2 border border-border rounded-lg notranslate" translate="no" value={entry.customerId||''} disabled={saving} onChange={e=>update(index,{customerId:e.target.value||undefined})}><option value="">{v('notebook.new')}</option>{matches.map(c=><option key={c.id} value={c.id}>{v('notebook.merge')} {c.name} ({formatMoney(c.totalDebt)})</option>)}</select></label>}
 </article>;})}
 </div><footer className="p-4 border-t border-border space-y-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving||!entries.length} onChange={e=>setConfirmed(e.target.checked)}/>{v('notebook.confirm')}</label><button className="w-full bg-primary text-white rounded-xl p-3 disabled:opacity-40" disabled={!confirmed||!entries.length||busy||saving} onClick={()=>void save()}>{v(saving?'notebook.saving':'notebook.save')}</button></footer>
 </section></div>,document.body);
}

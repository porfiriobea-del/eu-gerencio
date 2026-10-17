import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,GlassWater,Cigarette,Utensils,Package,Layers,X} from 'lucide-react';
import {categoryAppearance} from '../lib/categoryAppearance';
import type {PosCategory} from '../lib/posCategories';
import {usePreferences} from '../lib/preferencesContext';
export function CategoryFilter({categories,total,value,onChange}:{categories:PosCategory[];total:number;value:string;onChange:(value:string)=>void}){
 const {v}=usePreferences(),[open,setOpen]=useState(false),id=useId(),container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null);
 const options=[{name:'Todas',count:total},...categories];
 const choose=(name:string)=>{onChange(name);setOpen(false);trigger.current?.focus();};
 useEffect(()=>{
  if(!open)return;
  const outside=(event:MouseEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('mousedown',outside);
  document.addEventListener('pointerdown',outside);
  list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('pointerdown',outside);};
 },[open]);
 return <div ref={container} className="relative shrink-0">
 <button type="button" ref={trigger} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);}}} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-semibold">
 {v('pos.category','Categoria')}<ChevronDown className="h-4 w-4" aria-hidden="true"/>
 </button>
 {open&&<div ref={list} id={id} role="listbox" aria-label={v('pos.category','Categoria')} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus();}
  const items=Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')||[]);
  const index=items.indexOf(document.activeElement as HTMLButtonElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   e.preventDefault();
   const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
   items[next]?.focus();
  }
  if(e.key==='Tab'){setOpen(false);trigger.current?.focus();}
 }} className="absolute right-0 top-full z-40 mt-2 max-h-[min(60dvh,24rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-xl">
 {options.map(category=>{const look=categoryAppearance(category.name),Icon=category.name==='Todas'?Layers:look.icon==='drink'?GlassWater:look.icon==='cigarette'?Cigarette:look.icon==='food'?Utensils:Package;return <button type="button" role="option" key={category.name} aria-label={`${category.name==='Todas'?v('ui.categories','Todas as categorias'):category.name} (${category.count} ${v('entity.plural','produtos').toLowerCase()})`} aria-selected={value===category.name} onClick={()=>choose(category.name)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm ${value===category.name?'bg-primary/10 font-bold':'hover:bg-muted'}`}>
 <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${look.className}`}><Icon className="h-4 w-4"/></span>
 <span translate="no" className="notranslate min-w-0 flex-1 break-words">{category.name==='Todas'?v('ui.categories','Todas as categorias'):category.name}</span>
 <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{category.count}</span>
 </button>;})}
 </div>}
 </div>;
}
export function SelectedCategory({value,onClear}:{value:string;onClear:()=>void}){
 const {v}=usePreferences();
 if(value==='Todas')return null;
 return <button type="button" onClick={onClear} aria-label={`${v('pos.clearCategory','Limpar categoria')} ${value}`} className="inline-flex max-w-full min-h-9 items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-semibold text-primary"><span translate="no" className="notranslate truncate">{value}</span><X className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/></button>;
}

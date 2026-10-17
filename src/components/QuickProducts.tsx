import {useEffect,useState} from 'react';
import {Star,Package} from 'lucide-react';
import type {Product} from '../types';
import {usePreferences} from '../lib/preferencesContext';
import {ProductImage} from './ProductImage';
import {rankProductsBySales} from '../lib/productSalesRanking';
function read(key:string):string[]{try{const ids=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string').slice(0,100):[];}catch{return [];}}
export function useProductShortcuts(scope:string){
 const [data,setData]=useState<{scope:string;favorites:string[];recent:string[]}>({scope:'',favorites:[],recent:[]});
 useEffect(()=>{setData({scope,favorites:scope?read('pos_favorites:'+scope):[],recent:scope?read('pos_recent:'+scope):[]});},[scope]);
 const update=(field:'favorites'|'recent',id:string)=>{
  if(!scope)return;
  setData(previous=>{
   const active=previous.scope===scope?previous:{scope,favorites:[],recent:[]};
   const ids=field==='favorites'?(active.favorites.includes(id)?active.favorites.filter(value=>value!==id):[id,...active.favorites]):[id,...active.recent.filter(value=>value!==id)].slice(0,20);
   try{localStorage.setItem((field==='favorites'?'pos_favorites:':'pos_recent:')+scope,JSON.stringify(ids));}catch{}
   return {...active,[field]:ids};
  });
 };
 return {favorites:data.scope===scope?data.favorites:[],recent:data.scope===scope?data.recent:[],toggleFavorite:(id:string)=>update('favorites',id),remember:(id:string)=>update('recent',id)};
}
export function QuickProducts({products,totals,favorites,recent,onChoose,onFavorite}:{products:Product[];totals:Record<string,number>;favorites:string[];recent:string[];onChoose:(p:Product)=>void;onFavorite:(id:string)=>void}){
 const {v}=usePreferences();const [tab,setTab]=useState<'best'|'favorites'|'recent'>('best');
 const items=(tab==='best'?rankProductsBySales(products,totals):tab==='favorites'?products.filter(p=>favorites.includes(p.id!)):recent.map(id=>products.find(p=>p.id===id)).filter((p):p is Product=>!!p)).slice(0,6);
 return <section className="md:hidden min-w-0" aria-label={v('mobile.shortcuts','Atalhos de produtos')}>
 <div className="mb-2 flex gap-2">{(['best','favorites','recent'] as const).map(value=><button type="button" key={value} aria-pressed={tab===value} onClick={()=>setTab(value)} className={`min-h-9 rounded-full px-3 text-xs ${tab===value?'bg-primary text-primary-foreground':'bg-muted text-muted-foreground'}`}>{v('mobile.'+value,value==='best'?'Mais vendidos':value==='favorites'?'Favoritos':'Recentes')}</button>)}</div>
 <div className="flex gap-2 overflow-x-auto pb-2">{items.map(p=><div key={p.id} className="relative w-36 shrink-0 rounded-xl border border-border bg-surface p-2">
 <button type="button" aria-label={`${v('mobile.choose','Escolher')} ${p.name}`} onClick={()=>onChoose(p)} className="flex min-h-12 w-full items-center gap-2 pr-6 text-left">
 {p.imageUrl?<ProductImage src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-neutral-100 object-contain dark:bg-neutral-900"/>:<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted"><Package className="h-4 w-4"/></span>}
 <span translate="no" className="notranslate min-w-0 flex-1 truncate text-xs font-semibold">{p.name}</span></button>
 <button type="button" aria-label={`${v('mobile.favorite','Favoritar')} ${p.name}`} aria-pressed={favorites.includes(p.id!)} onClick={()=>onFavorite(p.id!)} className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90"><Star className={`h-4 w-4 ${favorites.includes(p.id!)?'fill-amber-400 text-amber-600':''}`}/></button>
 </div>)}</div>{!items.length&&<p className="py-2 text-xs text-muted-foreground">{v('mobile.noShortcuts','Os produtos aparecerão aqui conforme você usar o Caixa.')}</p>}
 </section>;
}

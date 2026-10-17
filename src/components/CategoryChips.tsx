import {GlassWater,Cigarette,Utensils,Package,Layers} from 'lucide-react';
import {categoryAppearance} from '../lib/categoryAppearance';
import {usePreferences} from '../lib/preferencesContext';
export function CategoryChips({categories,value,onChange}:{categories:string[];value:string;onChange:(value:string)=>void}){
 const {v}=usePreferences();
 return <div role="group" aria-label={v('mobile.categories','Categorias')} className="flex min-w-0 gap-2 overflow-x-auto pb-2">
 {categories.map(category=>{
 const look=categoryAppearance(category),Icon=category==='Todas'?Layers:look.icon==='drink'?GlassWater:look.icon==='cigarette'?Cigarette:look.icon==='food'?Utensils:Package;
 return <button type="button" key={category} aria-pressed={value===category} onClick={()=>onChange(category)} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${look.className} ${value===category?'border-primary ring-2 ring-primary/40':'border-transparent'}`}><Icon className="h-4 w-4"/><span translate="no" className="notranslate">{category==='Todas'?v('ui.categories','Todas as categorias'):category}</span></button>;
 })}</div>;
}

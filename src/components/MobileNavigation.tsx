import {useEffect,useRef} from 'react';
import {NavLink,useLocation} from 'react-router-dom';
import {Home,ShoppingCart,Package,Users,MoreHorizontal,Settings,DollarSign,HelpCircle,ShoppingBag,Activity} from 'lucide-react';
import {usePreferences} from '../lib/preferencesContext';
import {useMobileViewport} from '../lib/useMobileViewport';
export function MobileNavigation(){
 const {t,v}=usePreferences(),{mobile,keyboardOpen}=useMobileViewport();
 const more=useRef<HTMLDetailsElement>(null),location=useLocation();
 useEffect(()=>{if(more.current)more.current.open=false;},[location.pathname,keyboardOpen]);
 if(!mobile||keyboardOpen)return null;
 const items=[{to:'/',Icon:Home,label:t('nav.home')},{to:'/estoque',Icon:Package,label:t('nav.stock')},{to:'/caixa',Icon:ShoppingCart,label:t('nav.pos')},{to:'/fiado',Icon:Users,label:t('nav.debt')}];
 return <nav aria-label={v('mobile.navigation','Navegação rápida')} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface px-2 pt-2 shadow-lg" style={{paddingBottom:'max(.5rem, env(safe-area-inset-bottom))'}}>
 {items.map(({to,Icon,label})=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] ${isActive?'text-primary font-bold':'text-muted-foreground'}`}>
 <span className={to==='/caixa'?'flex h-12 w-12 -mt-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg':'flex h-6 items-center'}><Icon className={to==='/caixa'?'h-6 w-6':'h-5 w-5'}/></span>{label}</NavLink>)}
 <details ref={more} onKeyDown={e=>{if(e.key==='Escape'&&more.current)more.current.open=false;}} className="relative">
 <summary className="flex min-h-12 cursor-pointer list-none flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"><MoreHorizontal className="h-5 w-5"/>{v('mobile.more','Mais')}</summary>
 <div className="absolute bottom-full right-0 mb-4 w-56 rounded-2xl border border-border bg-surface p-2 shadow-xl">
 {[[ '/precos',DollarSign,t('nav.pricing')],['/ajustes',Settings,t('nav.settings')],['/tutorial',HelpCircle,v('mobile.help','Ajuda')],['/compras',ShoppingBag,t('nav.purchases')],['/movimentacoes',Activity,v('nav.movements','Movimentações')]].map(([to,Icon,label])=>{const Component=Icon as typeof Home;return <NavLink key={String(to)} to={String(to)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-muted"><Component className="h-5 w-5"/>{String(label)}</NavLink>;})}
 </div></details></nav>;
}

import {Link} from 'react-router-dom';
import {FileSpreadsheet,Pin,PinOff} from 'lucide-react';
import {usePreferences} from '../lib/preferencesContext';
import {useReportsPinned} from '../lib/useReportsPinned';
export function ReportsShortcut({page=false}:{page?:boolean}){
 const {v}=usePreferences(),{pinned,toggle}=useReportsPinned();
 return <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4">
 <div className="min-w-0"><h2 className="flex items-center gap-2 font-bold"><FileSpreadsheet className="h-5 w-5 text-primary"/>{v('reports.nav')}</h2><p className="mt-1 text-sm text-muted-foreground">{v('reports.shortcutHelp')}</p></div>
 <div className="flex flex-wrap gap-2">{!page&&<Link to="/relatorios" className="rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">{v('reports.open')}</Link>}
 <button type="button" onClick={toggle} aria-pressed={pinned} className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold">{pinned?<PinOff className="h-4 w-4"/>:<Pin className="h-4 w-4"/>}{v(pinned?'reports.unpin':'reports.pin')}</button></div>
 </section>;
}

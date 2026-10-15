import { usePreferences } from '../lib/preferencesContext';

export function CigarettePurchaseOptions({ value, onChange }: { value: 5 | 10; onChange: (value: 5 | 10) => void }) {
  const { v } = usePreferences();
  return <>
    <div><span className="mb-1 block text-xs font-bold text-foreground">{v('purchase.form')}</span>
      <p className="rounded-lg border border-border bg-surface p-2.5 text-sm font-semibold text-foreground">{v('purchase.package')}</p>
    </div>
    <div><label htmlFor="supplier-cigarette-size" className="mb-1 block text-xs font-bold text-foreground">{v('purchase.size')}</label>
      <select id="supplier-cigarette-size" value={value} onChange={event => onChange(event.target.value === '5' ? 5 : 10)} className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm font-semibold text-foreground">
        <option value="10">{v('purchase.full')}</option><option value="5">{v('purchase.half')}</option>
      </select>
    </div>
    <p className="text-xs text-muted-foreground sm:col-span-2">{v('purchase.note')}</p>
  </>;
}

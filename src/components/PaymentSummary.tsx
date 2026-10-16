import type { Sale } from '../types';
import { pixTotals } from '../lib/paymentFees';
import { usePreferences } from '../lib/preferencesContext';
export function PaymentSummary({ sales = [], totals }: { sales?: Sale[]; totals?: ReturnType<typeof pixTotals> }) {
  const { v } = usePreferences();
  const values = totals ?? pixTotals(sales);
  const currency = (amount: number) => amount.toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  return <dl className="grid gap-3 sm:grid-cols-3">
    {[[v('payment.pixDirect','Pix (direto na conta)'),values.direct], [v('payment.pixMachine','Pix na maquininha'),values.machine], [v('payment.pixFees','Taxas do Pix na maquininha'),values.machineFees]].map(([label,amount])=><div key={String(label)} className="rounded-xl border border-border bg-surface p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-bold text-foreground">{currency(Number(amount))}</dd></div>)}
  </dl>;
}

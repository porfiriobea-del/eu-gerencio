import type { Sale, Settings } from '../types';
export type PaymentMethod = NonNullable<Sale['paymentMethod']>;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function calculatePayment(subtotal: number, method: PaymentMethod, settings: Partial<Settings> | null = null) {
  if (settings?.currency && settings.currency !== 'BRL' && ['pix','pix_machine'].includes(method)) throw new Error('Pix só está disponível para lojas em BRL. Selecione outra forma de pagamento.');
  let rate = 0;
  if (settings?.enableCardFees) {
    rate = method === 'pix_machine' ? settings.pixRate ?? 0 : method === 'credit' ? settings.creditCardRate ?? 3.5
      : method === 'debit' ? settings.debitCardRate ?? 1.5 : method === 'voucher' ? settings.voucherRate ?? 2 : 0;
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || !Number.isFinite(subtotal) || subtotal < 0) throw new Error('Confira o valor e a taxa do pagamento.');
  const surcharge = ['credit','debit','voucher'].includes(method) && settings?.cardFeeCalculationMode === 'surcharge' && settings?.passCardFeeToCustomer === true;
  const surchargeAmount = surcharge ? money(subtotal * rate / 100) : 0;
  const total = money(subtotal + surchargeAmount);
  const feeAmount = money(total * rate / 100);
  return { subtotal: money(subtotal), total, feeRate: rate, feeAmount, surchargeAmount, netTotal: money(total - feeAmount) };
}
export function saleFee(sale: Pick<Sale, 'feeAmount'>): number { return Math.max(0, Number(sale.feeAmount) || 0); }
export function saleNet(sale: Pick<Sale, 'total' | 'feeAmount'>): number { return money(sale.total - saleFee(sale)); }
export function paymentLabel(sale: Pick<Sale, 'paymentMethod' | 'type'>): string {
  const labels: Record<string, string> = {pix:'Pix (direto na conta)',pix_machine:'Pix na maquininha',credit:'Crédito',debit:'Débito',voucher:'Voucher',cash:'Dinheiro',fiado:'Fiado'};
  return labels[sale.paymentMethod || ''] || (sale.type === 'card' ? 'Cartão' : sale.type === 'cash' ? 'Dinheiro' : 'Fiado');
}
export function pixTotals(sales: Pick<Sale, 'total' | 'paymentMethod' | 'feeAmount'>[]) {
  return sales.reduce((totals,sale)=> {
    if(sale.paymentMethod === 'pix') totals.direct += sale.total;
    if(sale.paymentMethod === 'pix_machine') {totals.machine += sale.total; totals.machineFees += saleFee(sale);}
    return totals;
  }, {direct:0,machine:0,machineFees:0});
}

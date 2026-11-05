import {format,isValid,parseISO} from 'date-fns';
/** Legacy or incomplete dates must be visible as invalid, rather than aborting a whole report. */
export function reportDate(value:unknown,pattern='dd/MM/yyyy HH:mm') {
  const date=typeof value==='string'?parseISO(value):typeof value==='number'&&Number.isFinite(value)?new Date(value):null;
  return date&&isValid(date)?format(date,pattern):'Data inválida';
}

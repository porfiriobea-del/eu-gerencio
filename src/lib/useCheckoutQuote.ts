import {useEffect,useState} from 'react';
import {workforceRpc} from './workforceApi';
import {usePermissions} from './permissionsContext';
import type {calculatePayment,PaymentMethod} from './paymentFees';
type Payment=ReturnType<typeof calculatePayment>;
export function useCheckoutQuote(subtotal:number,method:PaymentMethod,fallback:Payment,active=true){
 const {isEmployee}=usePermissions();const key=subtotal+':'+method;
 const [quote,setQuote]=useState<{key:string;value:Payment}|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!isEmployee)return;if(!active){setQuote(null);setFailed(false);return;}let alive=true;setFailed(false);
  void workforceRpc<{subtotal:number;total:number;surchargeAmount:number}>('eu_sale_quote',{subtotal,method}).then(value=>{if(alive)setQuote({key,value:{...value,feeRate:0,feeAmount:0,netTotal:0}});}).catch(()=>{if(alive)setFailed(true);});
  return()=>{alive=false;};
 },[isEmployee,key,active]);
 return {payment:isEmployee&&quote?.key===key?quote.value:fallback,waiting:isEmployee&&active&&quote?.key!==key,failed:isEmployee&&failed};
}

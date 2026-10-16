import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayment, saleNet, pixTotals, paymentLabel } from '../src/lib/paymentFees.ts';
const settings={enableCardFees:true,pixRate:0.49,creditCardRate:3,debitCardRate:2,voucherRate:4,cardFeeCalculationMode:'surcharge',passCardFeeToCustomer:true};
test('direct Pix is free; machine Pix always absorbs the fee, never increases the customer total',()=>{
 assert.deepEqual(calculatePayment(100,'pix',settings),{subtotal:100,total:100,feeRate:0,feeAmount:0,surchargeAmount:0,netTotal:100});
 assert.deepEqual(calculatePayment(100,'pix_machine',settings),{subtotal:100,total:100,feeRate:0.49,feeAmount:0.49,surchargeAmount:0,netTotal:99.51});
 for(const cardFeeCalculationMode of ['absorb','surcharge'])for(const passCardFeeToCustomer of [true,false])assert.equal(calculatePayment(100,'pix_machine',{...settings,cardFeeCalculationMode,passCardFeeToCustomer}).total,100);
});
test('only debit, credit and voucher surcharge, requiring both explicit flags',()=>{
 for(const [method,total] of [['credit',103],['debit',102],['voucher',104]]){
  assert.equal(calculatePayment(100,method,settings).total,total);
  assert.equal(calculatePayment(100,method,{...settings,passCardFeeToCustomer:false}).total,100);
  assert.equal(calculatePayment(100,method,{...settings,cardFeeCalculationMode:'absorb'}).total,100);
 }
 assert.equal(calculatePayment(100,'pix_machine',{...settings,enableCardFees:false}).feeAmount,0);
});
test('reports separate both Pix channels and preserve the historical fee without current settings',()=>{
 const sales=[{type:'card',paymentMethod:'pix',total:100},{type:'card',paymentMethod:'pix_machine',total:100,feeAmount:0.49}];
 assert.deepEqual(pixTotals(sales),{direct:100,machine:100,machineFees:0.49});
 assert.equal(saleNet(sales[1]),99.51);assert.equal(saleNet(sales[0]),100);
 assert.equal(paymentLabel(sales[0]),'Pix (direto na conta)');assert.equal(paymentLabel(sales[1]),'Pix na maquininha');
});

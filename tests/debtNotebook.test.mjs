import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedCustomerName,notebookSum,validateNotebook} from '../src/lib/debtNotebook.ts';
test('notebook matches accents/case/spaces, sums in cents and validates confirmation data',()=>{
 assert.equal(normalizedCustomerName('  JOSÉ   da Silva '),normalizedCustomerName('jose da silva'));
 assert.equal(notebookSum([{amount:0.1},{amount:0.2}]),0.3);
 const entry={id:'stable-id',name:'José',lines:[{description:'Compra',amount:10}],readTotal:12,amount:10};
 assert.doesNotThrow(()=>validateNotebook([entry]));
 assert.throws(()=>validateNotebook([{...entry,amount:0}]));
 assert.throws(()=>validateNotebook([{...entry,lines:[{description:'x',amount:NaN}]}]));
 assert.throws(()=>validateNotebook([entry,entry]));
});

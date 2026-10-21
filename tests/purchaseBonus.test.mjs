import test from 'node:test';
import assert from 'node:assert/strict';
import {bonusUnits,calculateBonus,bonusCost,validBonusRule,nearBonus,monthlyBonusSavings} from '../src/lib/purchaseBonus.ts';
const camel={id:'camel',type:'cigarro',supplierPackageUnits:10},winston={...camel,id:'winston',supplierPackageUnits:5};
const rule={id:'r',supplier:'Distribuidora',productId:'camel',buyQuantity:10,buyUnit:'maco',bonusProductId:'winston',bonusQuantity:1,bonusUnit:'maco'};
test('floor-based bonus converts supplier packages, ten-wallet macos and carteiras without accumulating purchases',()=>{
 assert.equal(calculateBonus(rule,camel,winston,100),10);
 assert.equal(calculateBonus(rule,camel,winston,199),10);
 assert.equal(calculateBonus(rule,camel,winston,200),20);
 assert.equal(calculateBonus(rule,camel,winston,99),0);
 assert.equal(calculateBonus({...rule,bonusUnit:'pacote'},camel,winston,100),5);
 assert.equal(bonusUnits(winston,'maco'),10);assert.equal(bonusUnits(winston,'pacote'),5);
});
test('1000 paid for 100 plus 10 has exact unrounded effective cost, conserved across both products',()=>{
 const cost=bonusCost(100,10,1000);
 assert.ok(Math.abs(cost.effectiveUnitCost-9.09090909090909)<1e-10);
 assert.equal(cost.bonusSavings,100);assert.ok(Math.abs(cost.effectiveUnitCost*110-1000)<1e-8);
 assert.equal(bonusCost(100,0,1000).effectiveUnitCost,10);
 assert.equal(bonusCost(100,10,0).effectiveUnitCost,0);
 for(const values of [[0,10,1000],[100,-1,1000],[100,10,NaN],[100,Infinity,0]])assert.throws(()=>bonusCost(...values));
});
test('rules reject unavailable products, negative/fractional thresholds and incompatible units',()=>{
 validBonusRule(rule,[camel,winston]);
 assert.throws(()=>validBonusRule({...rule,buyQuantity:0},[camel,winston]));
 assert.throws(()=>validBonusRule({...rule,bonusQuantity:0.5},[camel,winston]));
 assert.throws(()=>validBonusRule(rule,[camel]));
 assert.throws(()=>validBonusRule(rule,[{...camel,type:'comum'},winston]));
});
test('replenishment hints count only the missing quantity for matching supplier and product',()=>{
 const [hint]=nearBonus([rule],' DISTRIBUIDORA ',camel,80);
 assert.equal(hint.missing,20);assert.equal(hint.extraBonus,1);
 assert.equal(nearBonus([rule],'Other',camel,80).length,0);
 assert.equal(nearBonus([rule],rule.supplier,camel,100).length,0);
 assert.equal(nearBonus([rule],rule.supplier,camel,10).length,0);
});
test('monthly estimated savings respect purchase date and ignore historical purchases without bonus',()=>{
 const result=monthlyBonusSavings([{date:'2026-10-01',bonusSavings:100},{date:'2026-09-30',bonusSavings:200},{date:'2026-10-20'},{date:'2026-10-21',bonusSavings:50}],new Date(2026,9,21));
 assert.equal(result,150);
});

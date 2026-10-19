import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../integrations/feedback-apps-script.gs', import.meta.url), 'utf8');
function run(data, incompatible = false, original = false, summaryFailure = false) {
  const rows = original ? [['Data','Loja (código)','Usuário (código)','Nota','Tipo','Mensagem','Contato (opcional)','Dados brutos']] : [];
  const sheet = {
    getLastRow: () => rows.length,
    appendRow: row => rows.push(row),
    setFrozenRows() {},
    getRange: () => ({ setNumberFormat() {}, getValues: () => [incompatible ? ['Data', 'Loja (código)'] : rows[0]] }),
  };
  const context = vm.createContext({
    Date, Number, isFinite,
    LockService: { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'APPS_SCRIPT_SECRET' ? 'test-secret' : null }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => { if (summaryFailure && name === 'Resumo') throw new Error('Protected summary'); return name === 'Resumo' ? null : sheet; } }), flush() {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
  });
  vm.runInContext(source, context);
  const result = context.doPost({ postData: { contents: JSON.stringify({
    secret: 'test-secret', loja: `loja_${'a'.repeat(64)}`, usuario: `usuario_${'b'.repeat(64)}`, ...data,
  }) } });
  return { result, rows };
}
test('Apps Script preserves feedback Date and numeric rating and escapes formulas', () => {
  const { result, rows } = run({ categoria: 'feedback', id: `feedback_${'c'.repeat(64)}`, nota: 5, tipo: 'praise', mensagem: '=IMPORTXML("url")' });
  assert.equal(result.ok, true);
  assert.ok(rows[1][1] instanceof Date);
  assert.equal(rows[1][4], 5);
  assert.equal(rows[1][6], '\'=IMPORTXML("url")');
});
test('Apps Script preserves numeric sales amounts for spreadsheet aggregation', () => {
  const { result, rows } = run({ categoria: 'uso', evento: 'venda', valor: 12.5 });
  assert.equal(result.ok, true);
  assert.ok(rows[1][0] instanceof Date);
  assert.equal(rows[1][4], 12.5);
});
test('Apps Script rejects invalid numeric values without appending a data row', () => {
  const { result, rows } = run({ categoria: 'uso', evento: 'venda', valor: 'invalid' });
  assert.equal(result.ok, false);
  assert.equal(rows.length, 1);
});

test("Apps Script refuses incompatible headers before appending misplaced feedback", () => {
 const { result, rows } = run({ categoria: "feedback", id: `feedback_${"c".repeat(64)}`, nota: 5 }, true);
 assert.equal(result.code, "SHEET_SCHEMA_MISMATCH");
 assert.equal(rows.length, 1);
});

test('Apps Script writes original Feedback headers without relocating data or leaking secrets', () => {
 const { result, rows } = run({categoria: 'feedback', id: `feedback_${'c'.repeat(64)}`, nota: 4, tipo: 'praise', mensagem: 'Bom'}, false, true);
 assert.equal(result.ok, true);
 assert.ok(rows[1][0] instanceof Date);
 assert.equal(rows[1][3],4);
 assert.equal(rows[1][4],'praise');
 assert.deepEqual(JSON.parse(rows[1][7]),{id: `feedback_${'c'.repeat(64)}`});
 assert.equal(JSON.stringify(rows).includes('test-secret'),false);
});

test('summary replaces broken formulas with correct locale-independent numeric results', () => {
 const values = {};
 const summary = { getRange: cell => ({ getValue: () => cell === 'A3' ? 'Feedbacks recebidos — título alterado' : '#ERROR!', setValue: value => { values[cell] = value; } }) };
 const feedback = { getDataRange: () => ({ getValues: () => [
  ['Data','Loja','Usuário','Nota','Tipo'],
  [new Date(), 'loja_a','user',5,'praise'],
  [new Date(), 'loja_a','user','','Sugestão'],
  [new Date(), 'loja_b','user','3,0','bug'],
  [new Date(), 'loja_b','user',0,'Dúvida de uso'],
  [new Date(), 'loja_b','user',4,'other']
 ] }) };
 const usage = { getDataRange: () => ({ getValues: () => [
  ['Data','Loja','Usuário','Evento','Valor'],
  [new Date('2026-10-14T10:00:00Z'),'loja_a','user','venda',10],
  [new Date('2026-10-14T15:00:00Z'),'loja_a','user','foto_ia',0],
  ['2026-10-15T12:00:00Z','loja_b','user','venda',20],
  ['', '', '', '', '']
 ] }) };
 const context = vm.createContext({ Date, Set, Utilities: { formatDate: date => date.toISOString().slice(0,10) } });
 vm.runInContext(source, context);
 context.corrigirResumo({ getSpreadsheetTimeZone: () => 'UTC', getSheetByName: name => ({Resumo:summary, Feedback:feedback, Uso:usage})[name] });
 assert.deepEqual(values, {B3:5,B4:4,B5:2,B7:3,B8:2,B9:2,B10:1.5,B11:2,B12:1,B15:1,B16:1,B17:1,B18:1,B19:1});
});
test('empty summary writes zeros rather than formula errors', () => {
 const values = {};
 const summary = {getRange: cell => ({getValue: () => cell === 'A3' ? 'Feedbacks recebidos' : '',setValue: value => {values[cell] = value;}})};
 const sheet = {getDataRange: () => ({getValues: () => [['Data']]})};
 const context = vm.createContext({Date,Set});vm.runInContext(source,context);
 context.corrigirResumo({getSpreadsheetTimeZone: () => 'America/Sao_Paulo', getSheetByName: name => name === 'Resumo' ? summary : sheet});
 assert.equal(Object.keys(values).length,14);
 assert.ok(Object.values(values).every(value => value === 0));
});

for (const entryPoint of ['corrigirPlanilhaOriginal', 'corrigirResumo']) {
test(`${entryPoint} can run directly from the editor and verifies the original workbook`, () => {
 const values = {};
 let target, destination, toast;
 const summary = {getRange: cell => ({getValue: () => values[cell], getFormula: () => '', setValue: value => { values[cell] = value; }})};
 const data = {getDataRange: () => ({getValues: () => [['Data']]})};
 const book = {getSpreadsheetTimeZone: () => 'UTC',getSheetByName: name => name === 'Resumo' ? summary : data,toast: message => {toast=message;}};
 const context=vm.createContext({Date,Set, console:{log(){}},SpreadsheetApp:{openById: id => {target=id;return book;},flush(){}},PropertiesService:{getScriptProperties:()=>({setProperty:(key,value)=>{destination=value;}})}});
 vm.runInContext(source,context);
 const result=context[entryPoint]();
 assert.equal(result.updated,true);
 assert.equal(target,'13oh-mdCTnX-8aBAd8oVdBarglzaMYTZXrd7FRqsX4Ck');
 assert.equal(destination,target);
 assert.match(toast,/14 indicadores/);
 assert.equal(Object.keys(values).length,14);
});
}

test('a saved usage row stays confirmed even when summary cannot be updated', () => {
 const {result,rows}=run({categoria:'uso',evento:'venda',valor:10},false,false,true);
 assert.equal(result.ok,true);
 assert.equal(result.summaryUpdated,false);
 assert.equal(rows.length,2);
 assert.equal(rows[1][4],10);
});

test('Apps Script accepts anonymous screen-error events in the Uso sheet',()=>{
 const {result,rows}=run({categoria:'uso',evento:'erro_tela',valor:0});
 assert.equal(result.ok,true);assert.equal(rows[1][3],'erro_tela');assert.equal(rows[1][4],0);
});

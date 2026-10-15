import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../integrations/feedback-apps-script.gs', import.meta.url), 'utf8');
function run(data, incompatible = false, original = false) {
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
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => name === 'Resumo' ? null : sheet }), flush() {} },
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

test('summary repairs original column references, excludes blank days and counts app category codes', () => {
 const formulas = {};
 const summary = { getRange: cell => ({ getValue: () => cell === 'A3' ? 'Feedbacks recebidos' : '', getFormula: () => '', setFormula: value => { formulas[cell] = value; } }) };
 const feedback = { getRange: () => ({ getValue: () => 'Data' }) };
 const context = vm.createContext({});
 vm.runInContext(source, context);
 context.corrigirResumo({ getSheetByName: name => name === 'Resumo' ? summary : name === 'Feedback' ? feedback : null });
 assert.equal(Object.keys(formulas).length, 14);
 assert.match(formulas.B4, /AVERAGE\(Feedback!D/);
 assert.match(formulas.B5, /FILTER\(Feedback!B/);
 assert.match(formulas.B9, /FILTER\(ARRAYFORMULA\(INT\(Uso!A2:A\)\)/);
 assert.equal(formulas.B9.includes('-1'), false);
 assert.match(formulas.B16, /Feedback!E2:E,"praise"/);
 assert.match(formulas.B16, /\*Elogio\*/);
});

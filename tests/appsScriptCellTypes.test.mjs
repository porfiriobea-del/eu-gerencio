import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../integrations/feedback-apps-script.gs', import.meta.url), 'utf8');
function run(data, incompatible = false) {
  const rows = [];
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
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }), flush() {} },
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

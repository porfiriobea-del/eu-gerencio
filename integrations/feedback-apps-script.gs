// Bound to the destination spreadsheet. Set APPS_SCRIPT_SECRET in Script Properties.
// Merge this doPost with existing handlers rather than discarding unrelated integrations.
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SECRET');
    if (!expected || data.secret !== expected) return reportJson({ok: false});
    if (!/^loja_[a-f0-9]{64}$/.test(data.loja || '') || !/^usuario_[a-f0-9]{64}$/.test(data.usuario || '')) return reportJson({ok: false});
    let name, headings, row;
    if (data.categoria === 'feedback') {
      name = 'Feedback';
      headings = ['ID', 'Data UTC', 'Loja anônima', 'Usuário anônimo', 'Nota', 'Tipo', 'Mensagem', 'Contato'];
      if (!/^feedback_[a-f0-9]{64}$/.test(data.id || '')) return reportJson({ok: false});
      row = [data.id, new Date(), data.loja, data.usuario, data.nota == null || data.nota === '' ? '' : Number(data.nota), data.tipo, data.mensagem, data.contato || ''];
    } else if (data.categoria === 'uso' && ['venda','produto_cadastrado','foto_ia','fiado_lancado','compra_registrada'].indexOf(data.evento) >= 0) {
      name = 'Uso';
      headings = ['Data UTC', 'Loja anônima', 'Usuário anônimo', 'Evento', 'Valor'];
      row = [new Date(), data.loja, data.usuario, data.evento, Number(data.valor || 0)];
    } else return reportJson({ok: false});
    lock.waitLock(20000);
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    const book = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!book) throw new Error('Vincule o script à planilha de destino.');
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    if (sheet.getLastRow() === 0) { sheet.appendRow(headings); sheet.setFrozenRows(1); }
    const actualHeadings = sheet.getRange(1, 1, 1, headings.length).getValues()[0];
    const originalFeedback = ['Data', 'Loja (código)', 'Usuário (código)', 'Nota', 'Tipo', 'Mensagem', 'Contato (opcional)', 'Dados brutos'];
    const originalUsage = ['Data', 'Loja (código)', 'Usuário (código)', 'Evento', 'Valor'];
    const same = function(expected) { return expected.every(function(value, index) { return actualHeadings[index] === value; }); };
    const originalLayout = same(name === 'Feedback' ? originalFeedback : originalUsage);
    if (!same(headings) && !originalLayout) return reportJson({ok: false, code: 'SHEET_SCHEMA_MISMATCH', sheet: name});
    let idColumn = 1, dateColumn = name === 'Feedback' ? 2 : 1, duplicateId = data.id;
    if (name === 'Feedback' && originalLayout) {
      // Preserve the original administrator's column order and never export the secret.
      const metadata = JSON.stringify({id: data.id});
      row = [row[1], row[2], row[3], row[4], row[5], row[6], row[7], metadata];
      idColumn = 8; dateColumn = 1; duplicateId = metadata;
    }
    if (data.categoria === 'feedback' && sheet.getLastRow() > 1 && sheet.getRange(2,idColumn,sheet.getLastRow()-1,1).createTextFinder(duplicateId).matchEntireCell(true).findNext()) return reportJson({ok: true, duplicate: true});
    row = row.map(function(value) {
      if (value instanceof Date) return value;
      if (typeof value === 'number') {
        if (!isFinite(value)) throw new Error('Valor numérico inválido.');
        return value;
      }
      const text = String(value == null ? '' : value); return /^[=+@-]/.test(text) ? "'" + text : text; });
    sheet.appendRow(row);
    sheet.getRange(sheet.getLastRow(), dateColumn).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    corrigirResumo(book);
    SpreadsheetApp.flush();
    return reportJson({ok: true});
  } catch (error) { return reportJson({ok: false}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function reportJson(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

// Run manually once after deploying, or let the first confirmed report refresh Resumo.
function corrigirPlanilhaOriginal() {
  const properties = PropertiesService.getScriptProperties();
  const id = properties.getProperty('SPREADSHEET_ID') || '13oh-mdCTnX-8aBAd8oVdBarglzaMYTZXrd7FRqsX4Ck';
  corrigirResumo(SpreadsheetApp.openById(id));
  SpreadsheetApp.flush();
}
function corrigirResumo(book) {
  const summary = book.getSheetByName('Resumo');
  const feedback = book.getSheetByName('Feedback');
  if (!summary || !feedback) return;
  // Only update the known summary from the workbook reviewed; leave other layouts alone.
  if (summary.getRange('A3').getValue() !== 'Feedbacks recebidos') return;
  const original = feedback.getRange('A1').getValue() === 'Data';
  const rating = original ? 'D' : 'E', store = original ? 'B' : 'C', type = original ? 'E' : 'F';
  const formulas = {
    B3: '=COUNTA(Feedback!A2:A)',
    B4: '=IFERROR(AVERAGE(Feedback!' + rating + '2:' + rating + '),0)',
    B5: '=IFERROR(COUNTUNIQUE(FILTER(Feedback!' + store + '2:' + store + ',Feedback!' + store + '2:' + store + '<>"")),0)',
    B7: '=COUNTA(Uso!A2:A)',
    B8: '=IFERROR(COUNTUNIQUE(FILTER(Uso!B2:B,Uso!B2:B<>"")),0)',
    B9: '=IFERROR(COUNTUNIQUE(FILTER(ARRAYFORMULA(INT(Uso!A2:A)),Uso!A2:A<>"")),0)',
    B10: '=IFERROR(B7/B9,0)', B11: '=COUNTIF(Uso!D2:D,"venda")', B12: '=IFERROR(B11/B9,0)'
  };
  [['suggestion','*Sugest*'],['praise','*Elogio*'],['bug','*Problema*'],['question','*vida*'],['other','*Outro*']].forEach(function(pair, index) {
    formulas['B' + (15 + index)] = '=COUNTIF(Feedback!' + type + '2:' + type + ',"' + pair[0] + '")+COUNTIF(Feedback!' + type + '2:' + type + ',"' + pair[1] + '")';
  });
  Object.keys(formulas).forEach(function(cell) {
    const range = summary.getRange(cell);
    if (range.getFormula() !== formulas[cell]) range.setFormula(formulas[cell]);
  });
}

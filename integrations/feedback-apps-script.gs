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
    // Never append into an incompatible layout: it silently corrupts summary calculations.
    const actualHeadings = sheet.getRange(1, 1, 1, headings.length).getValues()[0];
    if (headings.some(function(heading, index) { return actualHeadings[index] !== heading; })) {
      return reportJson({ok: false, code: 'SHEET_SCHEMA_MISMATCH', sheet: name});
    }
    if (data.categoria === 'feedback' && sheet.getLastRow() > 1 && sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(data.id).matchEntireCell(true).findNext()) return reportJson({ok: true, duplicate: true});
    row = row.map(function(value) {
      if (value instanceof Date) return value;
      if (typeof value === 'number') {
        if (!isFinite(value)) throw new Error('Valor numérico inválido.');
        return value;
      }
      const text = String(value == null ? '' : value); return /^[=+@-]/.test(text) ? "'" + text : text; });
    sheet.appendRow(row);
    sheet.getRange(sheet.getLastRow(), name === 'Feedback' ? 2 : 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    SpreadsheetApp.flush();
    return reportJson({ok: true});
  } catch (error) { return reportJson({ok: false}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function reportJson(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

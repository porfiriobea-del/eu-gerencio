// Use in the Apps Script attached to the destination spreadsheet.
// If this project already has doPost, merge the feedback branch instead of replacing it.
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.tipo !== 'feedback' || !data.feedbackId || !Array.isArray(data.linha) || data.linha.length !== 8 || data.linha[0] !== data.feedbackId) {
      return feedbackJson({success: false, error: 'Payload inválido'});
    }
    lock.waitLock(20000);
    const book = SpreadsheetApp.getActiveSpreadsheet();
    if (!book) throw new Error('Vincule este script à planilha de destino.');
    const sheet = book.getSheetByName('Feedbacks') || book.insertSheet('Feedbacks');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['ID', 'Data UTC', 'Loja', 'E-mail', 'Tipo', 'Nota', 'Mensagem', 'Contato']);
      sheet.setFrozenRows(1);
    }
    if (sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(data.feedbackId).matchEntireCell(true).findNext()) {
      return feedbackJson({success: true, duplicate: true});
    }
    const row = data.linha.map(function(value) { const text = String(value == null ? '' : value); return /^[=+@-]/.test(text) ? "'" + text : text; });
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return feedbackJson({success: true});
  } catch (error) { return feedbackJson({success: false, error: 'Não foi possível gravar o feedback.'}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function feedbackJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

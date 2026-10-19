// Bound to the destination spreadsheet. Set APPS_SCRIPT_SECRET in Script Properties.
// Merge this doPost with existing handlers rather than discarding unrelated integrations.
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SECRET');
    if (!expected || data.secret !== expected) return reportJson({ok: false, code: 'INVALID_SECRET'});
    if (!/^loja_[a-f0-9]{64}$/.test(data.loja || '') || !/^usuario_[a-f0-9]{64}$/.test(data.usuario || '')) return reportJson({ok: false});
    let name, headings, row;
    if (data.categoria === 'feedback') {
      name = 'Feedback';
      headings = ['ID', 'Data UTC', 'Loja anônima', 'Usuário anônimo', 'Nota', 'Tipo', 'Mensagem', 'Contato'];
      if (!/^feedback_[a-f0-9]{64}$/.test(data.id || '')) return reportJson({ok: false});
      row = [data.id, new Date(), data.loja, data.usuario, data.nota == null || data.nota === '' ? '' : Number(data.nota), data.tipo, data.mensagem, data.contato || ''];
    } else if (data.categoria === 'uso' && ['venda','produto_cadastrado','foto_ia','fiado_lancado','compra_registrada', 'erro_tela'].indexOf(data.evento) >= 0) {
      name = 'Uso';
      headings = ['Data UTC', 'Loja anônima', 'Usuário anônimo', 'Evento', 'Valor'];
      row = [new Date(), data.loja, data.usuario, data.evento, Number(data.valor || 0)];
    } else if (data.categoria === 'comercios') {
      if (typeof data.totalComercios !== 'number' || !Number.isSafeInteger(data.totalComercios) || data.totalComercios < 0) return reportJson({ok: false});
    } else return reportJson({ok: false});
    lock.waitLock(20000);
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    const book = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!book) throw new Error('Vincule o script à planilha de destino.');
    if (data.categoria === 'comercios') {
      atualizarAbaComercios(book, data.totalComercios);
      SpreadsheetApp.flush();
      return reportJson({ok: true});
    }
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
    // Once the row is persisted, a summary failure must not invite duplicate usage writes.
    SpreadsheetApp.flush();
    let summaryUpdated = false;
    try {
      const result = corrigirResumo(book);
      SpreadsheetApp.flush();
      summaryUpdated = !!(result && result.updated);
    } catch (error) { console.warn('SUMMARY_UPDATE_FAILED'); }
    return reportJson({ok: true, summaryUpdated: summaryUpdated});
  } catch (error) { return reportJson({ok: false}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function reportJson(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

// Run manually once after deploying, or let the first confirmed report refresh Resumo.
function corrigirPlanilhaOriginal() {
  // This repair must target the original workbook, even if a stale property points elsewhere.
  const id = '13oh-mdCTnX-8aBAd8oVdBarglzaMYTZXrd7FRqsX4Ck';
  const book = SpreadsheetApp.openById(id);
  const result = corrigirResumo(book);
  if (!result || !result.updated) throw new Error('Resumo não atualizado: ' + (result ? result.reason : 'resultado ausente'));
  SpreadsheetApp.flush();
  const summary = book.getSheetByName('Resumo');
  Object.keys(result.values).forEach(function(cell) {
    const range = summary.getRange(cell);
    if (range.getFormula() || range.getValue() !== result.values[cell]) {
      throw new Error('A correção não foi confirmada na célula ' + cell + '. Verifique proteção da aba e outros scripts.');
    }
  });
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id);
  console.log(JSON.stringify({status: 'RESUMO_CORRIGIDO', spreadsheetId: id, cells: Object.keys(result.values).length, values: result.values}));
  book.toast('Resumo corrigido: 14 indicadores atualizados, sem fórmulas.', 'Eu Gerencio', 10);
  return result;
}

function corrigirResumo(book) {
  // The Apps Script editor calls selected functions without arguments.
  // Use the verified repair entry point instead of dereferencing undefined.
  if (!book) return corrigirPlanilhaOriginal();
  const summary = book.getSheetByName('Resumo');
  const feedback = book.getSheetByName('Feedback');
  if (!summary || !feedback) return {updated: false, reason: 'Abas Resumo ou Feedback não encontradas.'};
  const usage = book.getSheetByName('Uso');
  if (!usage) return {updated: false, reason: 'Aba Uso não encontrada.'};
  const feedbackRows = feedback.getDataRange().getValues();
  const usageRows = usage.getDataRange().getValues();
  const firstHeading = String(feedbackRows[0][0] || '').trim();
  if (firstHeading !== 'Data' && firstHeading !== 'ID') throw new Error('Cabeçalho Feedback desconhecido: esperado Data ou ID em A1.');
  const original = firstHeading === 'Data';
  const ratingColumn = original ? 3 : 4, storeColumn = original ? 1 : 2, typeColumn = original ? 4 : 5;
  const feedbacks = feedbackRows.slice(1).filter(function(row) { return row[0] !== '' && row[0] != null; });
  const events = usageRows.slice(1).filter(function(row) { return row[0] !== '' && row[0] != null; });
  const unique = function(rows, column) {
    return new Set(rows.map(function(row) { return String(row[column] || '').trim(); }).filter(Boolean)).size;
  };
  const ratings = feedbacks.map(function(row) {
    const value = row[ratingColumn];
    return typeof value === 'number' ? value : Number(String(value == null ? '' : value).replace(',', '.'));
  }).filter(function(value) { return isFinite(value) && value >= 1 && value <= 5; });
  const timezone = book.getSpreadsheetTimeZone();
  const days = new Set();
  events.forEach(function(row) {
    const raw = row[0];
    // Native Sheets dates and legacy ISO timestamps; skip unsupported ambiguous strings.
    const date = raw instanceof Date ? raw : typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw) ? new Date(raw) : null;
    if (date && !isNaN(date.getTime())) days.add(Utilities.formatDate(date, timezone, 'yyyy-MM-dd'));
  });
  const sales = events.filter(function(row) { return String(row[3]).trim() === 'venda'; }).length;
  const values = {
    B3: feedbacks.length,
    B4: ratings.length ? ratings.reduce(function(total, value) { return total + value; }, 0) / ratings.length : 0,
    B5: unique(feedbacks, storeColumn), B7: events.length, B8: unique(events, 1),
    B9: days.size, B10: days.size ? events.length / days.size : 0,
    B11: sales, B12: days.size ? sales / days.size : 0,
    B15: 0, B16: 0, B17: 0, B18: 0, B19: 0
  };
  feedbacks.forEach(function(row) {
    const type = String(row[typeColumn] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const cell = type === 'suggestion' || type.indexOf('sugest') >= 0 ? 'B15'
      : type === 'praise' || type.indexOf('elogio') >= 0 ? 'B16'
      : type === 'bug' || type.indexOf('problema') >= 0 || type === 'erro' ? 'B17'
      : type === 'question' || type.indexOf('duvida') >= 0 ? 'B18'
      : type === 'other' || type.indexOf('outro') >= 0 ? 'B19' : null;
    if (cell) values[cell]++;
  });
  // setValue replaces broken formulas with numeric results; no locale parsing involved.
  Object.keys(values).forEach(function(cell) { summary.getRange(cell).setValue(values[cell]); });
  return {updated: true, values: values};
}


// Total real de cadastros válidos no Supabase, não lojas com feedback ou uso.
function atualizarAbaComercios(book, total) {
  const sheet = book.getSheetByName('Comércios') || book.insertSheet('Comércios');
  sheet.getRange(1, 1, 5, 2).setValues([
    ['Comércios cadastrados — Eu Gerencio', ''],
    ['Indicador', 'Valor'],
    ['Total de comércios cadastrados', total],
    ['Última atualização', new Date()],
    ['Fonte', 'Supabase: cadastros de lojas válidos']
  ]);
  sheet.getRange(1, 1, 2, 2).setFontWeight('bold');
  sheet.setFrozenRows(2);
  sheet.getRange('B3').setNumberFormat('0');
  sheet.getRange('B4').setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

import { analysisSheet, type AnalysisInput } from './reportAnalysis';
import { normalizeCurrency, type MoneyOptions } from './currency';
import { paymentLabel, saleFee, saleNet } from './paymentFees';
import { getAccessToken } from "./auth";
import { format } from "date-fns";

export async function exportToSheets(data: Pick<AnalysisInput, 'startDate' | 'endDate' | 'periodLabel' | 'storeName' | 'filterDescription' | 'languageMode'> & {
  currency?: MoneyOptions['currency'],
  language?: MoneyOptions['language'],
  sales: any[],
  expenses: any[],
  customers: any[],
  purchases?: any[]
}) {
  const csvCurrency = normalizeCurrency(data.currency);
  const analysis = analysisSheet({...data, purchases: data.purchases || []});
  const token = await getAccessToken();
  if (!token) throw new Error("Google Drive access token missing.");

  // 1. Create a new Spreadsheet
  const title = `Relatório Eu Gerencio - ${format(new Date(), "dd/MM/yyyy")}`;
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: "Vendas", sheetId: 1 } },
        { properties: { title: "Compras", sheetId: 2 } },
        { properties: { title: "Fiado", sheetId: 3 } },
        { properties: { title: "Análise", sheetId: 100, gridProperties: {rowCount: Math.max(1000, analysis.rows.length + 30), columnCount: 6, frozenRowCount: 8} } },
      ]
    })
  });

  if (!createRes.ok) throw new Error("Failed to create spreadsheet.");
  const spreadSheet = await createRes.json();
  const spreadsheetId = spreadSheet.spreadsheetId;

  // 2. Prepare Data
  const salesData = [
    ["Data", "Tipo", ("Total (" + csvCurrency + ")"), ("Taxa (" + csvCurrency + ")"), ("Valor líquido (" + csvCurrency + ")")],
    ...data.sales.map(s => [format(new Date(s.createdAt), "dd/MM/yyyy HH:mm"), paymentLabel(s), Number(s.total || 0), saleFee(s), saleNet(s)])
  ];

  const purchasesData = [
    ["Data da Compra", "Produto", "Categoria", "Qtd Unidades", "Fardos/Pacotes", ("Custo Unitário (" + csvCurrency + ")"), ("Total Desembolsado (" + csvCurrency + ")"), "Fornecedor / Local", "Observações"],
    ...(data.purchases || []).map(p => [
      p.date ? format(new Date(p.date + 'T12:00:00'), "dd/MM/yyyy") : format(new Date(p.createdAt), "dd/MM/yyyy"),
      p.productName || "",
      p.category || "",
      p.quantity || 0,
      p.packageQuantity && p.packageQuantity > 0 ? `${p.packageQuantity} ${p.packageType || 'emb.'}` : '-',
      Number(p.unitCost || 0),
      Number(p.totalCost || 0),
      p.supplier || "Não informado",
      p.notes || ""
    ])
  ];

  const fiadoData = [
    ["Cliente", "Telefone", ("Dívida Atual (" + csvCurrency + ")")],
    ...data.customers.filter(c => c.totalDebt > 0).map(c => [c.name, c.phone || "", Number(c.totalDebt || 0)])
  ];

  // 3. Update Sheets with data
  const updateReq = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [
        { range: "Vendas!A1", values: salesData },
        { range: "Compras!A1", values: purchasesData },
        { range: "Fiado!A1", values: fiadoData },
        { range: "'Análise'!A1", values: analysis.rows },
      ]
    })
  });

  if (!updateReq.ok) throw new Error("Failed to populate spreadsheet data.");

  // Native charts reference the same numeric cells that readers can inspect and edit.
  const requests: object[] = [
    ...[330,200,540,160,160,180].map((width,index)=>({updateDimensionProperties: {range: {sheetId: 100, dimension: 'COLUMNS', startIndex: index, endIndex: index+1}, properties: {pixelSize: width}, fields: 'pixelSize'}})),
    {repeatCell: {range: {sheetId: 100}, cell: {userEnteredFormat: {wrapStrategy: 'WRAP', verticalAlignment: 'TOP'}}, fields: 'userEnteredFormat'}},
    {updateDimensionProperties: {range: {sheetId: 100, dimension: 'ROWS', startIndex: 0, endIndex: analysis.rows.length}, properties: {pixelSize: 22}, fields: 'pixelSize'}},
    ...analysis.rows.flatMap((row,index)=>{
      if (!row.some(value=>value!=='')) return [];
      const requests: object[]=[{updateDimensionProperties: {range: {sheetId: 100, dimension: 'ROWS', startIndex: index, endIndex: index+1}, properties: {pixelSize: 64}, fields: 'pixelSize'}}];
      const start=typeof row[1]==='string'&&row[1].length>65?1:typeof row[2]==='string'&&row[2].length>65?2:null;
      if(start!==null)requests.push({mergeCells:{range:{sheetId:100,startRowIndex:index,endRowIndex:index+1,startColumnIndex:start,endColumnIndex:6},mergeType:'MERGE_ALL'}});
      return requests;
    }),
    ...analysis.charts.map(chart => ({addChart: {chart: {
      spec: {title: `${chart.title} (${csvCurrency})`, basicChart: {chartType: 'COLUMN', legendPosition: 'NO_LEGEND', headerCount: 0,
        axis: [{position: 'BOTTOM_AXIS', title: 'Período / componente'}, {position: 'LEFT_AXIS', title: `Valor (${csvCurrency})`}],
        domains: [{domain: {sourceRange: {sources: [{sheetId: 100, startRowIndex: chart.dataStart-1, endRowIndex: chart.dataEnd, startColumnIndex: 0, endColumnIndex: 1}]}}}],
        series: [{series: {sourceRange: {sources: [{sheetId: 100, startRowIndex: chart.dataStart-1, endRowIndex: chart.dataEnd, startColumnIndex: chart.column, endColumnIndex: chart.column+1}]}}, targetAxis: 'LEFT_AXIS'}]}},
      position: {overlayPosition: {anchorCell: {sheetId: 100, rowIndex: chart.row-1, columnIndex: 0}, widthPixels: 1050, heightPixels: 340}}
    }}}))
  ];
  const chartResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: JSON.stringify({requests})
  });
  if (!chartResponse.ok) throw new Error('Os dados foram exportados, mas não foi possível concluir os gráficos. Tente exportar novamente.');
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

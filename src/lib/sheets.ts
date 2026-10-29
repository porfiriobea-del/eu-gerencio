import { analysisSheet, analysisMergeStart, visualReport, type AnalysisInput } from './reportAnalysis';
import { normalizeCurrency, type MoneyOptions } from './currency';
import { paymentLabel, saleFee, saleNet } from './paymentFees';
import { getAccessToken } from "./auth";
import { format, isValid, parseISO } from "date-fns";

const sourceDate = (value: number | string, purchase = false) => {
  const date = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(date) ? format(date, purchase ? 'dd/MM/yyyy' : 'dd/MM/yyyy HH:mm') : 'Data inválida';
};

export async function exportToSheets(data: Pick<AnalysisInput, 'startDate' | 'endDate' | 'periodLabel' | 'storeName' | 'filterDescription' | 'languageMode' | 'products'> & {
  currency?: MoneyOptions['currency'],
  language?: MoneyOptions['language'],
  sales: any[],
  expenses: any[],
  customers: any[],
  purchases?: any[]
}) {
  const csvCurrency = normalizeCurrency(data.currency);
  const analysisInput={...data, purchases:data.purchases || []};
  const analysis = analysisSheet(analysisInput);
  const dashboard = visualReport(analysisInput,analysis);
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
        { properties: { title: "Painel visual", sheetId: 101, gridProperties: {rowCount: Math.max(1000,dashboard.rows.length+30), columnCount: 16, frozenRowCount: 2} } },
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
    ...data.sales.map(s => [sourceDate(s.createdAt), paymentLabel(s), Number(s.total || 0), saleFee(s), saleNet(s)])
  ];

  const purchasesData = [
    ["Data da Compra", "Produto", "Categoria", "Qtd Unidades", "Fardos/Pacotes", ("Custo Unitário (" + csvCurrency + ")"), ("Total Desembolsado (" + csvCurrency + ")"), "Fornecedor / Local", "Observações"],
    ...(data.purchases || []).map(p => [
      sourceDate(p.date || p.createdAt, true),
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
        { range: "'Painel visual'!A1", values: dashboard.rows },
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
      const start=analysisMergeStart(row);
      if(start!==null)requests.push({mergeCells:{range:{sheetId:100,startRowIndex:index,endRowIndex:index+1,startColumnIndex:start,endColumnIndex:6},mergeType:'MERGE_ALL'}});
      return requests;
    }),
    {updateDimensionProperties:{range:{sheetId:101,dimension:'COLUMNS',startIndex:0,endIndex:16},properties:{pixelSize:78},fields:'pixelSize'}},
    {updateDimensionProperties:{range:{sheetId:101,dimension:'ROWS',startIndex:0,endIndex:dashboard.rows.length},properties:{pixelSize:24},fields:'pixelSize'}},
    {repeatCell:{range:{sheetId:101},cell:{userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'MIDDLE',textFormat:{fontSize:10}}},fields:'userEnteredFormat'}},
    ...dashboard.merges.map(m=>({mergeCells:{range:{sheetId:101,startRowIndex:m.row-1,endRowIndex:m.row,startColumnIndex:m.from-1,endColumnIndex:m.to},mergeType:'MERGE_ALL'}})),
    ...[...dashboard.sections,...dashboard.headers].map(s=>({repeatCell:{range:{sheetId:101,startRowIndex:s.row-1,endRowIndex:s.row,startColumnIndex:s.from-1,endColumnIndex:s.to},cell:{userEnteredFormat:{backgroundColor:{red:0.12,green:0.23,blue:0.37},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}},fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat'}})),
    ...dashboard.cards.map(s=>({repeatCell:{range:{sheetId:101,startRowIndex:s.row-1,endRowIndex:s.row,startColumnIndex:s.from-1,endColumnIndex:s.to},cell:{userEnteredFormat:{backgroundColor:{red:0.94,green:0.97,blue:1},textFormat:{bold:true,fontSize:16,foregroundColor:{red:0.01,green:0.4,blue:0.65}},...(s.row===28?{numberFormat:{type:'NUMBER',pattern:`"${csvCurrency}" #,##0.00`}}:{})}},fields:'userEnteredFormat'}})),
    ...dashboard.critical.slice(0,5).map((s,i)=>({repeatCell:{range:{sheetId:101,startRowIndex:18+i,endRowIndex:19+i,startColumnIndex:0,endColumnIndex:8},cell:{userEnteredFormat:{backgroundColor:s.product.stock<=0?{red:1,green:0.88,blue:0.88}:{red:1,green:0.96,blue:0.78}}},fields:'userEnteredFormat.backgroundColor'}})),
    ...dashboard.rows.flatMap((row,index)=>row[8]&&index>=4&&index<35?[{updateDimensionProperties:{range:{sheetId:101,dimension:'ROWS',startIndex:index,endIndex:index+1},properties:{pixelSize:48},fields:'pixelSize'}}]:[]),
    {repeatCell:{range:{sheetId:101,startRowIndex:5,endRowIndex:14,startColumnIndex:7,endColumnIndex:8},cell:{userEnteredFormat:{numberFormat:{type:'PERCENT',pattern:'0.0%'}}},fields:'userEnteredFormat.numberFormat'}},
    ...dashboard.charts.map(chart => {
      const source=(column:number)=>({sourceRange:{sources:[{sheetId:100,startRowIndex:chart.dataStart-1,endRowIndex:chart.dataEnd,startColumnIndex:column,endColumnIndex:column+1}]}});
      return {addChart:{chart:{
        spec:{title:chart.unit==='stock'?chart.title:`${chart.title} (${csvCurrency})`, ...(chart.type==='pie'
          ? {pieChart:{legendPosition:'RIGHT_LEGEND',domain:source(0),series:source(chart.column),pieHole:(chart.hole||0)/100}}
          : {basicChart:{chartType:chart.type==='bar'?'BAR':'COLUMN',legendPosition:'NO_LEGEND',headerCount:0,
            axis:[{position:'BOTTOM_AXIS',title:chart.type==='bar'?`Valor (${csvCurrency})`:'Período / produto'},{position:'LEFT_AXIS',title:chart.type==='bar'?'Componente':chart.unit==='stock'?'Quantidade (unidade indicada no produto)':`Valor (${csvCurrency})`}],
            domains:[{domain:source(0)}],series:[{series:source(chart.column),targetAxis:chart.type==='bar'?'BOTTOM_AXIS':'LEFT_AXIS'}]}})},
        position:{overlayPosition:{anchorCell:{sheetId:101,rowIndex:chart.row-1,columnIndex:chart.col||0},widthPixels:chart.width||600,heightPixels:340}}
      }}};
    })
  ];
  const chartResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: JSON.stringify({requests})
  });
  if (!chartResponse.ok) throw new Error('Os dados foram exportados, mas não foi possível concluir os gráficos. Tente exportar novamente.');
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=101`;
}

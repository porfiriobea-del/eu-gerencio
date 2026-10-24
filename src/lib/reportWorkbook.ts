import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {format} from 'date-fns';
import {analysisSheet, visualReport, type AnalysisInput, type AnalysisChart} from './reportAnalysis';
import {normalizeCurrency} from './currency';
import {paymentLabel, saleFee, saleNet} from './paymentFees';

const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const col=(n:number)=>String.fromCharCode(65+n);
function chartXml(chart:AnalysisChart,currency:string) {
  const labels=chart.labels.map((v,i)=>`<c:pt idx="${i}"><c:v>${xml(v)}</c:v></c:pt>`).join('');
  const values=chart.values.map((v,i)=>`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');
  const cat=`'Análise'!$A$${chart.dataStart}:$A$${chart.dataEnd}`;
  const val=`'Análise'!$${col(chart.column)}$${chart.dataStart}:$${col(chart.column)}$${chart.dataEnd}`;
  const series=`<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Valor (${currency})</c:v></c:tx>${chart.type==='pie'?chart.labels.map((_,i)=>`<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${['2563EB','10B981','F59E0B','8B5CF6','EC4899','06B6D4','64748B'][i%7]}"/></a:solidFill></c:spPr></c:dPt>`).join(''):'<c:spPr><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill></c:spPr>'}<c:cat><c:strRef><c:f>${xml(cat)}</c:f><c:strCache><c:ptCount val="${chart.labels.length}"/>${labels}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${xml(val)}</c:f><c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="${chart.values.length}"/>${values}</c:numCache></c:numRef></c:val></c:ser>`;
  const horizontal=chart.type==='bar';
  const plot=chart.type==='pie'
    ? `<c:pieChart><c:varyColors val="1"/>${series}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showLeaderLines val="1"/></c:dLbls><c:firstSliceAng val="270"/></c:pieChart>`
    : `<c:barChart><c:barDir val="${horizontal?'bar':'col'}"/><c:grouping val="clustered"/>${series}<c:dLbls><c:showVal val="1"/></c:dLbls><c:axId val="100"/><c:axId val="200"/></c:barChart><c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="${horizontal?'l':'b'}"/><c:tickLblPos val="nextTo"/><c:crossAx val="200"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="${horizontal?'b':'l'}"/><c:majorGridlines/><c:numFmt formatCode="&quot;${currency}&quot; #,##0.00" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/>${plot}</c:plotArea>${chart.type==='pie'?'<c:legend><c:legendPos val="r"/><c:layout/></c:legend>':''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
/** Native editable OOXML charts: no canvas, external URLs, screenshots or formula-looking CSV text. */
async function addCharts(bytes:ExcelJS.Buffer,charts:AnalysisChart[]) {
  const zip=await JSZip.loadAsync(bytes);
  const sheetPath='xl/worksheets/sheet1.xml';
  let sheet=await zip.file(sheetPath)!.async('string');
  sheet=sheet.replace('</worksheet>','<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdCharts"/></worksheet>');
  zip.file(sheetPath,sheet);
  zip.file('xl/worksheets/_rels/sheet1.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdCharts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  zip.file('xl/drawings/drawing1.xml',`<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${charts.map((c,i)=>`<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.row-1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="8572500" cy="3143250"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i+1}" name="Gráfico ${i+1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i+1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`).join('')}</xdr:wsDr>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${charts.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i+1}.xml"/>`).join('')}</Relationships>`);
  let types=await zip.file('[Content_Types].xml')!.async('string');
  types=types.replace('</Types>',`<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${charts.map((_,i)=>`<Override PartName="/xl/charts/chart${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}</Types>`);
  zip.file('[Content_Types].xml',types);
  return zip;
}
export async function buildReportWorkbook(input:AnalysisInput) {
  const result=analysisSheet(input),dashboard=visualReport(input,result),book=new ExcelJS.Workbook(),currency=normalizeCurrency(input.currency);
  book.creator='Eu Gerencio';book.created=new Date();
  const panel=book.addWorksheet('Painel visual');
  panel.columns=Array.from({length:6},()=>({width:25}));
  panel.addRows(dashboard.rows);
  panel.views=[{state:'frozen',ySplit:6,showGridLines:false}];
  panel.eachRow(row=>{
    row.height=22;row.alignment={vertical:'middle',wrapText:true};
    if(row.number!==5&&row.number!==6){
      if(row.cellCount===1){panel.mergeCells(row.number,1,row.number,6);row.font={bold:true,size:14,color:{argb:'FF1E3A5F'}};row.height=32;}
      else {panel.mergeCells(row.number,2,row.number,6);row.height=48;}
    }
  });
  panel.getRow(1).height=40;
  [5,6].forEach(r=>{const row=panel.getRow(r);row.height=r===6?42:30;row.font={bold:true,size:r===6?18:11,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A5F'}};});
  [1,2,3,4,6].forEach(c=>panel.getCell(6,c).numFmt=`"${currency}" #,##0.00`);
  panel.getCell('E6').numFmt='0';
  panel.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
  book.views=[{x:0,y:0,width:1200,height:800,visibility:'visible',activeTab:0,firstSheet:0}];
  const analysis=book.addWorksheet('Análise');
  analysis.columns=[{width:43},{width:28},{width:78},{width:20},{width:20},{width:24}];
  analysis.addRows(result.rows);
  analysis.views=[{state:'frozen',ySplit:8}];
  analysis.eachRow(row=>{row.height=30;row.alignment={vertical:'middle',wrapText:true};
    const values=row.values as unknown[];
    if(typeof values[1]==='string'&&/^\d\. /.test(values[1])){row.font={bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A5F'}};}
    if(typeof values[2]==='string'&&String(values[2]).length>65){analysis.mergeCells(row.number,2,row.number,6);row.height=60;}
    else if(typeof values[3]==='string'&&String(values[3]).length>65){analysis.mergeCells(row.number,3,row.number,6);row.height=45;}
    if(['Indicador','Data','Forma','Componente'].includes(String(values[1]))){row.font={bold:true};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDBEAFE'}};}
    row.eachCell(cell=>{if(typeof cell.value==='number')cell.numFmt='#,##0.00';cell.border={bottom:{style:'hair',color:{argb:'FFE2E8F0'}}};});
  });
  const raw=(name:string,headings:string[],rows:unknown[][])=>{
    const ws=book.addWorksheet(name);ws.addRow(headings);
    rows.forEach(values=>ws.addRow(values.map(v=>typeof v==='number'&&!Number.isFinite(v)?'Inválido':v??'')));
    ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:'A1',to:{row:1,column:headings.length}};
    ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A5F'}};
    ws.columns.forEach((c,i)=>c.width=i<2?28:23);
    ws.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};r.eachCell(c=>{if(typeof c.value==='number')c.numFmt='#,##0.00';});});
    return ws;
  };
  const date=(value:number)=>Number.isFinite(value)&&!isNaN(new Date(value).getTime())?format(new Date(value),'yyyy-MM-dd HH:mm:ss'):'Data inválida';
  raw('Vendas',['ID','Data e hora','Pagamento',`Total (${currency})`,`Taxa (${currency})`,`Líquido de taxa (${currency})`,'Resumo','Funcionário','Cancelada','Incluída na análise'],input.sales.map(s=>[s.id,date(s.createdAt),paymentLabel(s),s.total,s.feeAmount??'Não informada',saleNet(s),s.itemsSummary,s.employeeName,s.cancelledAt?'Sim':'Não',result.analysis.sales.includes(s)?'Sim':'Não']));
  raw('Compras',['ID','Data','Produto','Categoria','Quantidade (unidade de estoque)',`Custo unitário registrado (${currency})`,`Valor pago (${currency})`,'Fornecedor','Quantidade de bônus','Produto de bônus','Unidade do bônus','Incluída na análise'],input.purchases.map(p=>[p.id,p.date||date(p.createdAt),p.productName,p.category,p.quantity,p.unitCost,p.totalCost,p.supplier,p.bonusQuantity??0,p.bonusProductName,p.bonusStockUnit,result.analysis.purchases.includes(p)?'Sim':'Não']));
  raw('Fiado atual',['Cliente','Dívida atual','Referência'],input.customers.map(c=>[c.name,c.totalDebt,'Posição atual na extração; não é saldo histórico do período']));
  raw('Estoque atual',['Produto','Categoria','Saldo atual','Unidade de estoque','Referência'],(input.products||[]).map(p=>[p.name,p.category,Math.round(p.stock*100)/100,p.type==='cigarro'?'carteiras':'unidades','Posição atual na extração']));
  const bytes=await book.xlsx.writeBuffer();
  const zip=await addCharts(bytes,dashboard.charts);
  dashboard.charts.forEach((c,i)=>zip.file(`xl/charts/chart${i+1}.xml`,chartXml(c,currency)));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
export async function exportReportWorkbook(input:AnalysisInput) {
  const bytes=await buildReportWorkbook(input);
  const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=`relatorio-analise-${input.startDate||format(new Date(),'yyyy-MM-dd')}${input.endDate?'-a-'+input.endDate:''}.xlsx`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

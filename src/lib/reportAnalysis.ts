import {differenceInCalendarDays, eachDayOfInterval, format, isValid, parseISO} from 'date-fns';
import type {Customer, Product, Purchase, Sale} from '../types';
import {paymentLabel} from './paymentFees';
import {formatMoney, type MoneyOptions} from './currency';

export interface AnalysisInput extends MoneyOptions {
  sales: Sale[]; purchases: Purchase[]; customers: Customer[]; products?: Product[];
  periodLabel?: string; storeName?: string; startDate?: string; endDate?: string;
  filterDescription?: string; languageMode?: 'basic'|'neutral'|'technical';
}
export type AnalysisRow = (string|number)[];
/** Merge explanatory prose only when every cell to its right is empty. */
export function analysisMergeStart(row:AnalysisRow): 1 | 2 | null {
  const empty=(value:unknown)=>value===''||value===null||value===undefined;
  if(typeof row[1]==='string'&&row[1].length>65&&row.slice(2).every(empty))return 1;
  if(typeof row[2]==='string'&&row[2].length>65&&row.slice(3).every(empty))return 2;
  return null;
}
export interface AnalysisChart {type:'column'|'pie'|'bar'; title:string; col?:number; width?:number; hole?:number; unit?:'money'|'stock'; row:number; labels:string[]; values:number[]; dataStart:number; dataEnd:number; column:number;}
const cents=(n:number)=>Math.round((n+Number.EPSILON)*100);
const amount=(n:number)=>n/100;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export function analyzeReport(input:AnalysisInput) {
  const invalidSales=input.sales.filter(s=>!s.cancelledAt&&(!finite(s.total)||s.total<0||!finite(s.createdAt)||!isValid(new Date(s.createdAt))));
  const validSales=input.sales.filter(s=>!s.cancelledAt&&!invalidSales.includes(s));
  const validPurchaseDate=(p:Purchase)=>p.date?parseISO(p.date):new Date(p.createdAt);
  const invalidPurchases=input.purchases.filter(p=>!finite(p.totalCost)||p.totalCost<0||!isValid(validPurchaseDate(p)));
  const validPurchases=input.purchases.filter(p=>!invalidPurchases.includes(p));
  const dates=[...validSales.map(s=>new Date(s.createdAt)),...validPurchases.map(validPurchaseDate)];
  const from=input.startDate?parseISO(input.startDate):dates.length?new Date(dates.reduce((min,d)=>Math.min(min,+d),Infinity)):null;
  const to=input.endDate?parseISO(input.endDate):dates.length?new Date(dates.reduce((max,d)=>Math.max(max,+d),-Infinity)):null;
  if ((from&&!isValid(from))||(to&&!isValid(to))||(from&&to&&differenceInCalendarDays(to,from)<0))throw new Error('Confira as datas do relatório.');
  const start=from?format(from,'yyyy-MM-dd'):null,end=to?format(to,'yyyy-MM-dd'):null;
  const inside=(date:Date)=>{const d=format(date,'yyyy-MM-dd');return (!start||d>=start)&&(!end||d<=end);};
  const sales=validSales.filter(s=>inside(new Date(s.createdAt))),purchases=validPurchases.filter(p=>inside(validPurchaseDate(p)));
  let revenue=0,fees=0,bought=0,credit=0;
  let missingFees=0;
  const daily=new Map<string,{revenue:number;count:number;purchases:number;fees:number}>();
  const payments=new Map<string,{revenue:number;count:number;fees:number}>();
  const day=(date:Date)=>{const key=format(date,'yyyy-MM-dd');if(!daily.has(key))daily.set(key,{revenue:0,count:0,purchases:0,fees:0});return daily.get(key)!;};
  // Avoid allocating one row per day for very long histories; the denominator still uses calendar days.
  const calendarDays=from&&to?differenceInCalendarDays(to,from)+1:0;
  if(from&&to&&calendarDays<=366)eachDayOfInterval({start:from,end:to}).forEach(day);
  sales.forEach(s=>{
    const value=cents(s.total),fee=finite(s.feeAmount)&&s.feeAmount>=0?cents(s.feeAmount):0;revenue+=value;fees+=fee;
    if(s.type==='fiado'||s.paymentMethod==='fiado')credit+=value;
    if(!finite(s.feeAmount)||s.feeAmount<0)missingFees++;
    const d=day(new Date(s.createdAt));d.revenue+=value;d.fees+=fee;d.count++;
    const label=paymentLabel(s),p=payments.get(label)||{revenue:0,count:0,fees:0};p.revenue+=value;p.fees+=fee;p.count++;payments.set(label,p);
  });
  purchases.forEach(p=>{const value=cents(p.totalCost);bought+=value;day(validPurchaseDate(p)).purchases+=value;});
  const dailyRows=[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,d])=>({date,count:d.count,revenue:amount(d.revenue),fees:amount(d.fees),purchases:amount(d.purchases),balance:amount(d.revenue-d.fees-d.purchases)}));
  const paymentRows=[...payments].sort(([,a],[,b])=>b.revenue-a.revenue).map(([label,p])=>({label,count:p.count,revenue:amount(p.revenue),fees:amount(p.fees),share:revenue?p.revenue/revenue:0}));
  return {sales,purchases,dailyRows,paymentRows,start,end,calendarDays,revenue:amount(revenue),fees:amount(fees),bought:amount(bought),credit:amount(credit),balance:amount(revenue-fees-bought),count:sales.length,ticket:sales.length?amount(revenue)/sales.length:null,activeDays:dailyRows.filter(d=>d.count>0).length,invalidSales:invalidSales.length,invalidPurchases:invalidPurchases.length,cancelled:input.sales.filter(s=>s.cancelledAt).length,outsidePeriod:validSales.length-sales.length+validPurchases.length-purchases.length,missingFees};
}
export function analysisSheet(input:AnalysisInput) {
  const a=analyzeReport(input),rows:AnalysisRow[]=[],charts:AnalysisChart[]=[];
  const basic=input.languageMode==='basic',money=(n:number)=>formatMoney(n,input);
  const add=(...cells:AnalysisRow)=>{rows.push(cells);return rows.length;};
  add(basic?'Entenda suas vendas':'Análise comercial — indicadores e metodologia');
  add('Comércio',input.storeName||'Não informado');
  add('Período',`${a.start||'Sem início informado'} até ${a.end||'Sem fim informado'}`);
  add('Seleção',input.filterDescription||input.periodLabel||'Dados fornecidos pela exportação');
  add('Extraído em',new Date().toLocaleString(input.language==='en'?'en-US':input.language==='es'?'es-ES':'pt-BR'));
  add('Fuso horário',Intl.DateTimeFormat().resolvedOptions().timeZone);
  add('Como ler','Primeiro confira o período e os filtros. Depois compare os indicadores, gráficos e tabelas. Os números refletem somente os registros exportados.');
  add('Atualização','Retrato do momento da extração; este arquivo não se atualiza sozinho com o Supabase.');
  add('1. '+(basic?'Os números da loja':'Indicadores consolidados'));
  add('Indicador','Valor','Como foi calculado / interpretação');
  add('Vendas registradas',a.count,'Quantidade de vendas válidas e não canceladas, após filtros.');
  add('Valor das vendas',a.revenue,'Soma dos totais das vendas, inclusive fiado. Não significa dinheiro já recebido.');
  add('Média por venda',a.ticket??'Sem vendas','Valor das vendas ÷ quantidade de vendas; sem vendas, não há média.');
  add('Compras',a.bought,'Soma dos valores pagos em compras selecionadas; não é o custo das mercadorias vendidas.');
  add('Taxas registradas',a.fees,'Soma de feeAmount gravado nas vendas; Pix direto e Pix na maquininha ficam separados.');
  add('Saldo operacional',a.balance,'Valor das vendas − compras − taxas. Inclui fiado ainda não recebido; não é lucro nem saldo de caixa.');
  add('Vendas fiadas no período',a.credit,'Valor vendido a prazo no período; não mede o saldo atual de todos os clientes.');
  add('Dias no período',a.calendarDays,'Dias corridos entre início e fim, incluindo ambos. Sem datas nem registros, não há período calculável.');
  add('Dias com vendas',a.activeDays,'Dias com pelo menos uma venda válida; não são dias em que a loja necessariamente abriu.');
  add('Vendas por dia corrido',a.calendarDays?a.count/a.calendarDays:'Sem período','Quantidade de vendas ÷ dias corridos, incluindo dias sem venda.');
  add('Valor médio por dia corrido',a.calendarDays?a.revenue/a.calendarDays:'Sem período','Valor das vendas ÷ dias corridos. O mês em andamento inclui as datas futuras se estiverem selecionadas.');
  const best=a.dailyRows.filter(d=>d.count).sort((x,y)=>y.revenue-x.revenue)[0];
  add('Leitura dos resultados',a.count?`${a.count} vendas somaram ${money(a.revenue)}. A média por venda foi ${money(a.ticket!)}. ${best?`Maior valor diário: ${best.date}, com ${money(best.revenue)}. Em empate, é exibida a primeira data.`:''}`:'Sem vendas válidas neste recorte. Não é possível indicar melhor dia ou calcular ticket médio.');
  add('2. '+(basic?'Vendas ao longo dos dias':'Série temporal e concentração de vendas'));
  add('Data','Vendas','Valor das vendas','Taxas','Compras','Saldo operacional');
  const dailyStart=rows.length+1;
  a.dailyRows.forEach(d=>add(d.date,d.count,d.revenue,d.fees,d.purchases,d.balance));
  const dailyEnd=rows.length;
  add('Dias sem movimento',a.calendarDays>366?'Neste período longo, a tabela lista somente datas com registros. As médias continuam divididas por todos os dias corridos.':'A tabela inclui os dias sem registros no intervalo selecionado. Isso não comprova que a loja esteve fechada.');
  add('Interpretação','Compare dias de maior valor com a quantidade de vendas: um pico pode vir de mais vendas ou de vendas maiores. O gráfico sozinho não identifica a causa.');
  if(a.dailyRows.length){
    // Daily chart for up to 62 dates, monthly aggregation beyond that, retaining full detail above.
    const buckets=new Map<string,number>();
    a.dailyRows.forEach(d=>{const key=a.calendarDays>62?d.date.slice(0,7):d.date;buckets.set(key,(buckets.get(key)||0)+cents(d.revenue));});
    add(a.calendarDays>62?'Gráfico: total por mês':'Gráfico: total por dia','Valor das vendas');
    const first=rows.length+1;const labels=[...buckets.keys()],values=[...buckets.values()].map(amount);
    labels.forEach((label,i)=>add(label,values[i]));
    const last=rows.length;const anchor=rows.length+1;
    charts.push({type:'column',title:a.calendarDays>62?'Vendas por mês':'Vendas por dia',row:anchor,labels,values,dataStart:first,dataEnd:last,column:1});
  }else add('Sem gráfico','Não há registros válidos para a série temporal.');
  add('3. '+(basic?'Como os clientes pagaram':'Composição das formas de pagamento'));
  add('Forma','Quantidade','Valor das vendas','Taxas','Participação (%)');
  const paymentStart=rows.length+1;
  a.paymentRows.forEach(p=>add(p.label,p.count,p.revenue,p.fees,Math.round(p.share*10000)/100));
  const paymentEnd=rows.length;
  add('Interpretação','Participação = valor dessa forma ÷ total das vendas × 100. Separar o Pix direto do Pix na maquininha evidencia as taxas; registros antigos sem subtipo permanecem como Cartão.');
  if(a.revenue>0){const anchor=rows.length+1;charts.push({type:'pie',title:'Participação por forma de pagamento',row:anchor,labels:a.paymentRows.map(p=>p.label),values:a.paymentRows.map(p=>p.revenue),dataStart:paymentStart,dataEnd:paymentEnd,column:2});}
  add('4. '+(basic?'Vendas, compras e taxas':'Comparativo financeiro'));
  add('Componente','Valor');const financialStart=rows.length+1;
  add('Vendas',a.revenue);add('Compras',a.bought);add('Taxas',a.fees);add('Saldo operacional',a.balance);
  const financialEnd=rows.length,anchor=rows.length+1;
  charts.push({type:'bar',title:'Vendas, compras, taxas e saldo',row:anchor,labels:['Vendas','Compras','Taxas','Saldo operacional'],values:[a.revenue,a.bought,a.fees,a.balance],dataStart:financialStart,dataEnd:financialEnd,column:1});
  add('Interpretação',`O saldo operacional do recorte é ${money(a.balance)}. Comprar estoque em um dia e vender em outro altera esse saldo; isso não demonstra, sozinho, ganho ou perda na venda.`);
  add('5. '+(basic?'Confira antes de apresentar':'Qualidade, rastreabilidade e limitações'));
  add('Vendas canceladas excluídas',a.cancelled);add('Vendas inválidas excluídas',a.invalidSales);add('Compras inválidas excluídas',a.invalidPurchases);add('Registros fora do período excluídos',a.outsidePeriod);add('Vendas sem taxa válida informada',a.missingFees,'Consideradas sem taxa registrada, não como comprovação de isenção.');
  add('Validação','Totais e datas inválidos são excluídos e contados acima. Cada registro representa uma operação; sem um identificador confiável não é possível deduplicar com segurança. Valores são somados em centavos.');
  add('Estoque e fiado','As abas Estoque atual e Fiado atual são posições atuais, não reconstruções do último dia do período. Cigarros são contados em carteiras; 0,05 carteira equivale a 1 cigarro quando a carteira tem 20.');
  add('Lucro não apurado','Este conjunto não inclui todos os itens e lotes consumidos, despesas operacionais, devoluções e recebimentos. Não use saldo operacional como lucro ou fluxo de caixa recebido.');
  add('Produtos mais vendidos','Não é calculado a partir do texto do resumo da venda: faltam linhas estruturadas dos itens para um ranking auditável. Estoque atual não mede vendas.');
  add('Comparações e previsões','Sem um período anterior equivalente e sem conhecer dias de abertura, não se atribui crescimento, tendência, causalidade ou previsão. Dias sem registros podem indicar falta de movimento ou de dados.');
  add('Filtros','Forma de pagamento filtra vendas. Funcionário e categoria também podem filtrar compras. Em categoria, uma venda com itens de várias categorias pode ter seu valor rateado; a contagem representa vendas que contêm a categoria.');
  add('Gráficos','As tabelas são a fonte dos gráficos editáveis. Uma série longa é agrupada por mês apenas no gráfico; o detalhe permanece na tabela. Valores monetários seguem a moeda da loja, sem conversão cambial.');
  return {analysis:a,rows,charts,dailyStart,dailyEnd,paymentStart,paymentEnd};
}

/** Presentation dashboard: compact tables on the left, evidence-based commentary on the right. */
export function visualReport(input:AnalysisInput,result=analysisSheet(input)) {
  const a=result.analysis,basic=input.languageMode==='basic',money=(n:number)=>formatMoney(n,input);
  const rows:AnalysisRow[]=Array.from({length:100},()=>Array(16).fill(''));
  const merges:{row:number;from:number;to:number}[]=[],sections:{row:number;from:number;to:number}[]=[],headers:{row:number;from:number;to:number}[]=[],cards:{row:number;from:number;to:number}[]=[];
  const put=(r:number,c:number,value:string|number)=>{rows[r-1][c-1]=value;};
  const merged=(r:number,from:number,to:number,value:string|number)=>{put(r,from,value);if(to>from)merges.push({row:r,from,to});};
  const section=(r:number,from:number,to:number,title:string)=>{merged(r,from,to,title);sections.push({row:r,from,to});};
  const text=(r:number,value:string)=>merged(r,9,16,'• '+value);
  section(1,1,16,basic?'Sua loja: números, gráficos e explicações':'Painel executivo — desempenho comercial e estoque');
  merged(2,1,16,`${input.storeName||'Comércio'} | ${a.start||'Sem início'} a ${a.end||'sem fim'} | ${input.filterDescription||input.periodLabel||'Dados selecionados'}`);
  section(4,1,8,basic?'1. Como os clientes pagaram':'1. Desempenho comercial por forma de pagamento');
  const payCols=[['Forma de pagamento',1,2],['Valor vendido',3,4],['Taxas',5,5],['Líquido de taxas',6,7],['Parte (%)',8,8]] as const;
  payCols.forEach(([label,from,to])=>merged(5,from,to,label));headers.push({row:5,from:1,to:8});
  a.paymentRows.forEach((p,i)=>{const r=6+i;merged(r,1,2,p.label);merged(r,3,4,p.revenue);put(r,5,p.fees);merged(r,6,7,Math.round((p.revenue-p.fees)*100)/100);put(r,8,p.share);});
  merged(14,1,2,'Total');merged(14,3,4,a.revenue);put(14,5,a.fees);merged(14,6,7,Math.round((a.revenue-a.fees)*100)/100);put(14,8,a.revenue?1:0);headers.push({row:14,from:1,to:8});
  merged(15,1,8,'Líquido de taxas inclui fiado. Não significa valor já recebido.');
  section(4,9,16,basic?'Entenda as vendas':'Parecer técnico — dinâmica financeira');
  text(5,`${a.count} vendas válidas somaram ${money(a.revenue)}; taxas registradas: ${money(a.fees)}.`);
  text(7,a.ticket===null?'Não há vendas para calcular a média por venda.':`Média por venda: ${money(a.ticket)}. Fórmula: valor vendido ÷ número de vendas.`);
  text(9,`Compras: ${money(a.bought)}. Saldo operacional: ${money(a.balance)} (vendas − compras − taxas). Não é lucro.`);
  const top=a.paymentRows[0];
  text(11,top&&a.revenue?`Maior participação: ${top.label}, com ${(top.share*100).toFixed(1)}% do valor vendido. Não é uma comparação com outro período.`:'Sem valor vendido, não há participação para desenhar a rosca.');
  text(13,`Vendas fiadas no período: ${money(a.credit)}. Recebimentos e despesas operacionais não foram apurados neste painel.`);
  const products=(input.products||[]).filter(p=>!p.mergedIntoId&&finite(p.stock));
  const zero=products.filter(p=>p.stock<=0),positive=products.filter(p=>p.stock>0);
  const critical=products.filter(p=>p.stock<=0||p.stock<Math.max(0,p.safetyStock||0)).sort((x,y)=>Number(y.stock<=0)-Number(x.stock<=0)||x.stock-y.stock||x.name.localeCompare(y.name,'pt-BR',{sensitivity:'base'}));
  const suggestions=critical.map(p=>{const target=Math.max(p.safetyStock||0,p.maxStock||0),pack=p.purchaseForm==='unidade'?1:p.type==='cigarro'?(p.supplierPackageUnits||10):Math.max(1,p.unitsPerPackage||1);return {product:p,quantity:target>0?Math.ceil(Math.max(0,target-p.stock)/pack)*pack:null,unit:p.type==='cigarro'?'carteiras':'unidades'};});
  section(17,1,8,basic?'2. O que precisa de reposição':'2. Diagnóstico de estoque e reposição');
  [['Produto',1,2],['Categoria',3,3],['Saldo',4,4],['Mínimo',5,5],['Situação / compra sugerida',6,8]].forEach(([label,from,to])=>merged(18,Number(from),Number(to),String(label)));headers.push({row:18,from:1,to:8});
  suggestions.slice(0,5).forEach(({product:p,quantity,unit},i)=>{const r=19+i;merged(r,1,2,p.name);put(r,3,p.category);put(r,4,Math.round(p.stock*100)/100);put(r,5,p.safetyStock||0);merged(r,6,8,`${p.stock<=0?'SEM ESTOQUE':'ABAIXO DO MÍNIMO'}; ${quantity===null?'definir limites':`comprar ${quantity} ${unit}`}`);});
  if(!critical.length)merged(19,1,8,products.length?'Nenhum produto zerado ou abaixo do mínimo cadastrado.':'Estoque não incluído nesta exportação.');
  merged(24,1,8,`${critical.length} itens em atenção; exibidos até 5. Quantidades respeitam a embalagem cadastrada. Detalhes na aba Análise.`);
  section(17,9,16,basic?'Entenda o estoque':'Parecer técnico — exposição de estoque');
  text(18,products.length?`${products.length} produtos no recorte; ${positive.length} com saldo positivo e ${zero.length} zerados ou negativos.`:'Não foram fornecidos produtos para avaliar estoque. Isso não comprova estoque zero na loja.');
  text(20,products.length?`Disponibilidade: ${(positive.length/products.length*100).toFixed(1)}% dos produtos. Esgotados: ${(zero.length/products.length*100).toFixed(1)}%. Esses percentuais contam produtos, não unidades.`:'Sem base de produtos, os indicadores operacionais ficam indisponíveis.');
  text(22,`${critical.length} produtos precisam de atenção pelos limites cadastrados. Não se estima venda perdida ou receita futura sem dados suficientes.`);
  text(24,'Sugestão = limite maior entre máximo e mínimo, menos saldo; arredondada para a embalagem de compra. Sem limite, é preciso configurar antes de estimar.');
  text(26,'Estoque é uma posição atual, não o saldo histórico do período. Carteiras e unidades comuns não são somadas entre si.');
  text(28,'Não foi usada a média de vendas salva no cadastro. Este recorte não contém todas as linhas históricas necessárias para recalcular a procura por produto.');
  section(26,1,8,basic?'3. Resumo do dinheiro':'3. Indicadores financeiros');
  const debt=input.customers.reduce((n,c)=>n+(finite(c.totalDebt)&&c.totalDebt>0?Math.round(c.totalDebt*100):0),0)/100;
  const financial=[['Valor vendido',a.revenue],['Taxas',a.fees],['Saldo operacional',a.balance],['Fiado atual',debt]] as const;
  financial.forEach(([label,value],i)=>{const from=i*2+1;merged(27,from,from+1,label);merged(28,from,from+1,value);cards.push({row:28,from,to:from+1});});
  merged(29,1,8,'Saldo não é lucro. Fiado atual é o saldo dos clientes incluídos na extração, não apenas das vendas deste período.');
  section(32,1,8,basic?'4. Resumo dos produtos':'4. Indicadores operacionais');
  const operational=[['Produtos',products.length||'Sem base'],['Com estoque',products.length?positive.length:'Sem base'],['Esgotados',products.length?zero.length:'Sem base'],['Disponibilidade',products.length?`${(positive.length/products.length*100).toFixed(1)}%`:'Sem base']] as const;
  operational.forEach(([label,value],i)=>{const from=i*2+1;merged(33,from,from+1,label);merged(34,from,from+1,value);cards.push({row:34,from,to:from+1});});
  merged(35,1,8,'Produto = um cadastro ativo no recorte. Não é quantidade física nem prova de variedade disponível para venda.');
  text(30,`Qualidade: ${a.cancelled} vendas canceladas, ${a.invalidSales} vendas inválidas e ${a.invalidPurchases} compras inválidas excluídas.`);
  text(32,`Taxas ausentes ou inválidas em ${a.missingFees} vendas. Nenhuma taxa atual foi aplicada retroativamente.`);
  text(34,'A aba Análise preserva cálculos, fontes e limitações. Este arquivo é um retrato da extração, sem atualização automática.');
  // Stock chart sources are appended to the auditable analysis table, never inferred from sales text.
  const stockedOut=suggestions.filter(s=>s.product.stock<=0&&s.quantity!==null).slice(0,5);
  result.rows.push(['Reposição de produtos zerados','Quantidade','Unidade de estoque']);
  const first=result.rows.length+1;
  stockedOut.forEach(s=>result.rows.push([`${s.product.name} (${s.unit})`,s.quantity!,s.unit]));
  const stockChart:AnalysisChart|null=stockedOut.length?{type:'column',title:'Reposição imediata — produtos zerados',row:38,col:8,width:600,unit:'stock',labels:stockedOut.map(s=>`${s.product.name} (${s.unit})`),values:stockedOut.map(s=>s.quantity!),dataStart:first,dataEnd:result.rows.length,column:1}:null;
  const pie=result.charts.find(c=>c.type==='pie'),daily=result.charts.find(c=>c.type==='column'),finance=result.charts.find(c=>c.type==='bar');
  const charts:AnalysisChart[]=[];
  if(pie)charts.push({...pie,row:38,col:0,width:600,hole:55});else merged(40,1,8,'Sem valor vendido para desenhar a rosca por forma de pagamento.');
  if(stockChart)charts.push(stockChart);
  if(daily)charts.push({...daily,row:60,col:0,width:600});
  if(finance)charts.push({...finance,row:stockChart?60:38,col:8,width:600});
  merged(56,1,8,'Rosca: participação no valor vendido, não no número de vendas. Inclui fiado; não significa recebimento.');
  merged(56,9,16,stockChart?'Barras: até 5 produtos zerados com limites definidos. Leia a unidade em cada rótulo; carteiras não equivalem a unidades comuns.':'Barras: comparação de vendas, compras, taxas e saldo. Sem reposição quantificável pelos limites cadastrados, mostramos o financeiro; nenhum limite de estoque foi inventado.');
  merged(79,1,16,'Apresentação: confira filtros e período; leia os indicadores; compare gráficos com as tabelas de origem; consulte as ressalvas antes de concluir sobre lucro ou demanda.');
  result.rows.push(['Todos os produtos em atenção','Categoria','Saldo atual','Mínimo','Compra sugerida','Unidade de estoque']);
  suggestions.forEach(s=>result.rows.push([s.product.name,s.product.category,Math.round(s.product.stock*100)/100,s.product.safetyStock||0,s.quantity??'Definir limites',s.unit]));
  return {rows,charts,merges,sections,headers,cards,critical:suggestions};
}

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
export interface AnalysisChart {title:string; row:number; labels:string[]; values:number[]; dataStart:number; dataEnd:number; column:number;}
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
    const last=rows.length;const anchor=rows.length+1;for(let i=0;i<18;i++)add('');
    charts.push({title:a.calendarDays>62?'Vendas por mês':'Vendas por dia',row:anchor,labels,values,dataStart:first,dataEnd:last,column:1});
  }else add('Sem gráfico','Não há registros válidos para a série temporal.');
  add('3. '+(basic?'Como os clientes pagaram':'Composição das formas de pagamento'));
  add('Forma','Quantidade','Valor das vendas','Taxas','Participação (%)');
  const paymentStart=rows.length+1;
  a.paymentRows.forEach(p=>add(p.label,p.count,p.revenue,p.fees,Math.round(p.share*10000)/100));
  const paymentEnd=rows.length;
  add('Interpretação','Participação = valor dessa forma ÷ total das vendas × 100. Separar o Pix direto do Pix na maquininha evidencia as taxas; registros antigos sem subtipo permanecem como Cartão.');
  if(a.paymentRows.length){const anchor=rows.length+1;for(let i=0;i<18;i++)add('');charts.push({title:'Valor por forma de pagamento',row:anchor,labels:a.paymentRows.map(p=>p.label),values:a.paymentRows.map(p=>p.revenue),dataStart:paymentStart,dataEnd:paymentEnd,column:2});}
  add('4. '+(basic?'Vendas, compras e taxas':'Comparativo financeiro'));
  add('Componente','Valor');const financialStart=rows.length+1;
  add('Vendas',a.revenue);add('Compras',a.bought);add('Taxas',a.fees);add('Saldo operacional',a.balance);
  const financialEnd=rows.length,anchor=rows.length+1;for(let i=0;i<18;i++)add('');
  charts.push({title:'Vendas, compras, taxas e saldo',row:anchor,labels:['Vendas','Compras','Taxas','Saldo operacional'],values:[a.revenue,a.bought,a.fees,a.balance],dataStart:financialStart,dataEnd:financialEnd,column:1});
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

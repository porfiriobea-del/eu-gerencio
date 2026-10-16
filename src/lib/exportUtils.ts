import { formatAmount, formatMoney, normalizeCurrency, type MoneyOptions } from './currency';
import { paymentLabel, saleFee, saleNet } from './paymentFees';
import { format } from 'date-fns';
import { Purchase, Sale, Customer, Product } from '../types';

/**
 * Downloads a text content as a file with UTF-8 BOM so Excel opens with proper accents.
 */
function downloadFile(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports purchases to CSV with complete columns and totals.
 */
export function exportPurchasesToCSV(purchases: Purchase[], filenamePrefix = 'relatorio-compras', csvOptions: MoneyOptions = {}) {
  const csvCurrency = normalizeCurrency(csvOptions.currency);
  const rows: string[][] = [
    ['RELATÓRIO DETALHADO DE COMPRAS E REPOSIÇÕES DE ESTOQUE'],
    [`Extraído em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
    [`Total de Compras Registradas: ${purchases.length}`],
    [''],
    [
      'Data da Compra',
      'Produto',
      'Categoria',
      'Quantidade (Unidades)',
      'Embalagem/Fardo',
      ("Custo Unitário (" + csvCurrency + ")"),
      ("Total Pago (" + csvCurrency + ")"),
      'Fornecedor / Local',
      'Observações'
    ]
  ];

  let totalSpent = 0;
  let totalUnits = 0;

  purchases.forEach(p => {
    totalSpent += Number(p.totalCost || 0);
    totalUnits += Number(p.quantity || 0);

    const dateFormatted = p.date 
      ? format(new Date(p.date + 'T12:00:00'), 'dd/MM/yyyy') 
      : format(new Date(p.createdAt), 'dd/MM/yyyy HH:mm');

    const pkgStr = p.packageQuantity && p.packageQuantity > 0 
      ? `${p.packageQuantity} ${p.packageType || 'emb.'}` 
      : '-';

    rows.push([
      dateFormatted,
      `"${(p.productName || '').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      String(p.quantity || 0),
      `"${pkgStr}"`,
      formatAmount(Number(p.unitCost || 0), csvOptions),
      formatAmount(Number(p.totalCost || 0), csvOptions),
      `"${(p.supplier || 'Não informado').replace(/"/g, '""')}"`,
      `"${(p.notes || '').replace(/"/g, '""')}"`
    ]);
  });

  rows.push(['']);
  rows.push([
    'TOTAIS',
    '',
    '',
    String(totalUnits),
    '',
    '',
    formatAmount(totalSpent, csvOptions),
    '',
    ''
  ]);

  const csvContent = rows.map(r => r.join(';')).join('\r\n');
  const filename = `${filenamePrefix}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  downloadFile(csvContent, filename);
}

/**
 * Comprehensive multi-section CSV report (Compras + Vendas + Fiado) with financial consolidation.
 */
export function exportFullReportToCSV(data: {
  currency?: MoneyOptions['currency'];
  language?: MoneyOptions['language'];
  purchases: Purchase[];
  sales: Sale[];
  customers: Customer[];
  products?: Product[];
  periodLabel: string;
  startDate?: string;
  endDate?: string;
  storeName?: string;
  inflow?: number;
  outflow?: number;
  balance?: number;
  fiadoInflow?: number;
}) {
  const csvOptions: MoneyOptions = data;
  const csvCurrency = normalizeCurrency(csvOptions.currency);
  const store = data.storeName ? data.storeName.toUpperCase() : 'EU GERENCIO!';
  const rows: string[][] = [
    [`RELATÓRIO GERAL DO COMÉRCIO - ${store}`],
    [`Período de Análise: ${data.periodLabel}`],
    [`Data da Extração: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
    [''],
    ['========================================'],
    ['RESUMO FINANCEIRO DO PERÍODO'],
    ['========================================'],
    ['Indicador', ("Valor (" + csvCurrency + ")"), 'Observação'],
    [
      'Dinheiro que entrou (Vendas Faturadas)',
      formatAmount(Number(data.inflow ?? data.sales.reduce((sum, s) => sum + (s.total || 0), 0)), csvOptions),
      'Receita operacional apurada no período'
    ],
    [
      'Dinheiro que saiu (Compras e Reposições)',
      formatAmount(Number(data.outflow ?? data.purchases.reduce((sum, p) => sum + (p.totalCost || 0), 0)), csvOptions),
      'Desembolsos para reposição de mercadorias'
    ],
    ['Taxas pagas pela loja', formatAmount(data.sales.reduce((sum,sale) => sum + saleFee(sale), 0), csvOptions), 'Taxas gravadas na data da venda'],
    [
      'O que sobrou para você (Saldo Operacional)',
      formatAmount(Number(data.balance ?? ((data.inflow ?? data.sales.reduce((sum, s) => sum + (s.total || 0), 0)) - (data.outflow ?? data.purchases.reduce((sum, p) => sum + (p.totalCost || 0), 0)) - data.sales.reduce((sum,sale) => sum + saleFee(sale), 0))), csvOptions),
      'Vendas menos compras e taxas; inclui fiado ainda não recebido'
    ],
    [
      'Total em Caderneta (Fiado a Receber no Período)',
      formatAmount(Number(data.fiadoInflow ?? data.sales.filter(s => s.type === 'fiado').reduce((sum, s) => sum + (s.total || 0), 0)), csvOptions),
      'Compras a prazo anotadas para clientes'
    ],
    [''],
    ['========================================'],
    ['1. DETALHAMENTO DE VENDAS REALIZADAS'],
    ['========================================'],
    ['Data e Hora', 'Forma de Pagamento', 'Itens Vendidos', ("Valor Total (" + csvCurrency + ")"), ("Taxa (" + csvCurrency + ")"), ("Valor líquido (" + csvCurrency + ")")]
  ];

  let totalSalesAmount = 0;
  data.sales.forEach(s => {
    totalSalesAmount += Number(s.total || 0);
    const typeLabel = paymentLabel(s);
    const itemsText = s.itemsSummary ? `"${s.itemsSummary.replace(/"/g, '""')}"` : '"Venda registrada"';
    rows.push([
      format(new Date(s.createdAt), 'dd/MM/yyyy HH:mm'),
      typeLabel,
      itemsText,
      formatAmount(Number(s.total || 0), csvOptions),
      formatAmount(saleFee(s), csvOptions),
      formatAmount(saleNet(s), csvOptions)
    ]);
  });

  rows.push(['TOTAL VENDAS', '', `${data.sales.length} vendas`, formatAmount(totalSalesAmount, csvOptions)]);

  rows.push(['']);
  rows.push(['========================================'],);
  rows.push(['2. COMPRAS E REPOSIÇÕES NO PERÍODO']);
  rows.push(['========================================']);
  rows.push([
    'Data da Compra',
    'Produto',
    'Categoria',
    'Quantidade (Unidades)',
    'Embalagem',
    ("Custo Unitário (" + csvCurrency + ")"),
    ("Total Pago (" + csvCurrency + ")"),
    'Fornecedor',
    'Observações'
  ]);

  let totalPurchasesSpent = 0;
  let totalPurchasesUnits = 0;

  data.purchases.forEach(p => {
    totalPurchasesSpent += Number(p.totalCost || 0);
    totalPurchasesUnits += Number(p.quantity || 0);

    const dateFormatted = p.date 
      ? format(new Date(p.date + 'T12:00:00'), 'dd/MM/yyyy') 
      : format(new Date(p.createdAt), 'dd/MM/yyyy');

    rows.push([
      dateFormatted,
      `"${(p.productName || '').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      String(p.quantity || 0),
      `"${p.packageQuantity && p.packageQuantity > 0 ? `${p.packageQuantity} ${p.packageType || 'emb.'}` : '-'}"`,
      formatAmount(Number(p.unitCost || 0), csvOptions),
      formatAmount(Number(p.totalCost || 0), csvOptions),
      `"${(p.supplier || 'Não informado').replace(/"/g, '""')}"`,
      `"${(p.notes || '').replace(/"/g, '""')}"`
    ]);
  });

  rows.push([
    'TOTAL COMPRAS',
    '',
    '',
    String(totalPurchasesUnits),
    '',
    '',
    formatAmount(totalPurchasesSpent, csvOptions),
    '',
    ''
  ]);

  rows.push(['']);
  rows.push(['========================================']);
  rows.push(['3. CLIENTES COM SALDO EM FIADO (CADERNETA)']);
  rows.push(['========================================']);
  rows.push(['Nome do Cliente', 'Telefone', ("Dívida Atual (" + csvCurrency + ")")]);

  let totalDebt = 0;
  data.customers.filter(c => c.totalDebt > 0).forEach(c => {
    totalDebt += Number(c.totalDebt || 0);
    rows.push([
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      formatAmount(Number(c.totalDebt || 0), csvOptions)
    ]);
  });

  rows.push(['TOTAL FIADO PENDENTE', '', formatAmount(totalDebt, csvOptions)]);

  if (data.products && data.products.length > 0) {
    rows.push(['']);
    rows.push(['========================================']);
    rows.push(['4. VENDA DIÁRIA E SUGESTÃO DE ESTOQUE DE SEGURANÇA']);
    rows.push(['========================================']);
    rows.push([
      'Produto / Mercadoria',
      'Categoria',
      'Estoque Físico Atual (unid.)',
      'Venda Média Diária (unid./dia)',
      'Prazo Reposição Fornecedor (dias)',
      'Estoque de Segurança Recomendado (unid.)',
      'Estoque Mínimo Cadastrado (unid.)',
      'Diagnóstico de Ruptura',
      'Sugestão de Reposição Imediata (unid.)'
    ]);

    data.products.forEach(p => {
      const dailyAvg = Number(p.dailyAverageSales || 0);
      const leadTimeDays = Number(p.replacementDays || 1);
      // Sugestão de Estoque de Segurança: Consumo durante o lead time + margem de segurança de 25% (ou mínimo 1)
      const suggestedSafety = Math.max(1, Math.ceil(dailyAvg * leadTimeDays * 1.25));
      const currentStock = Number(p.stock || 0);
      const configuredMin = Number(p.safetyStock || 0);

      let status = 'Estoque Saudável';
      let purchaseSuggestion = 0;

      if (currentStock <= 0) {
        status = 'RUPTURA CRÍTICA (Sem estoque)';
        purchaseSuggestion = Math.max(suggestedSafety * 2, 5);
      } else if (currentStock <= (configuredMin || suggestedSafety)) {
        status = 'ATENÇÃO: Abaixo da Segurança (Comprar)';
        purchaseSuggestion = Math.max(0, (suggestedSafety * 2) - currentStock);
      }

      rows.push([
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        String(currentStock),
        dailyAvg.toFixed(1).replace('.', ','),
        String(leadTimeDays),
        String(suggestedSafety),
        String(configuredMin),
        `"${status}"`,
        String(purchaseSuggestion)
      ]);
    });
  }

  const csvContent = rows.map(r => r.join(';')).join('\r\n');
  const safeDateRange = data.startDate && data.endDate 
    ? `${data.startDate}-a-${data.endDate}` 
    : format(new Date(), 'yyyy-MM-dd');
  const filename = `relatorio-comercio-${safeDateRange}.csv`;
  downloadFile(csvContent, filename);
}

/**
 * Dedicated export for daily sales per product and safety stock recommendations.
 */
export function exportDailySalesAndSafetyStockToCSV(
  products: Product[],
  storeName?: string,
  filenamePrefix = 'venda-diaria-estoque-seguranca',
  csvOptions: MoneyOptions = {}
) {
  const csvCurrency = normalizeCurrency(csvOptions.currency);
  const store = storeName ? storeName.toUpperCase() : 'EU GERENCIO!';
  const rows: string[][] = [
    [`RELATÓRIO DE CONSUMO DIÁRIO E SUGESTÃO DE ESTOQUE DE SEGURANÇA - ${store}`],
    [`Data da Análise: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
    ['Base de Cálculo: Consumo Diário Médio × Prazo de Entrega do Fornecedor + Margem Protetiva (25%)'],
    [''],
    [
      'Produto / Mercadoria',
      'Categoria',
      'Estoque Atual (unid.)',
      'Venda Diária Média (unid./dia)',
      'Prazo Fornecedor (dias)',
      'Estoque de Segurança Recomendado (unid.)',
      'Estoque Mínimo Configurado (unid.)',
      ("Custo Unitário (" + csvCurrency + ")"),
      ("Capital de Giro na Segurança (" + csvCurrency + ")"),
      'Diagnóstico de Ruptura',
      'Sugestão de Pedido Imediato (unid.)'
    ]
  ];

  let totalCriticalItems = 0;
  let totalWarningItems = 0;
  let totalSafetyCapital = 0;

  products.forEach(p => {
    const dailyAvg = Number(p.dailyAverageSales || 0);
    const leadTimeDays = Number(p.replacementDays || 1);
    const suggestedSafety = Math.max(1, Math.ceil(dailyAvg * leadTimeDays * 1.25));
    const currentStock = Number(p.stock || 0);
    const configuredMin = Number(p.safetyStock || 0);
    const unitCost = Number(p.unitCost || 0);
    const safetyCapital = suggestedSafety * unitCost;
    totalSafetyCapital += safetyCapital;

    let status = 'Normal (Estoque OK)';
    let orderQty = 0;

    if (currentStock <= 0) {
      status = 'RUPTURA CRÍTICA (Esgotado)';
      totalCriticalItems++;
      orderQty = Math.max(suggestedSafety * 2, 5);
    } else if (currentStock <= (configuredMin || suggestedSafety)) {
      status = 'ATENÇÃO: Abaixo do Mínimo';
      totalWarningItems++;
      orderQty = Math.max(0, (suggestedSafety * 2) - currentStock);
    }

    rows.push([
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      String(currentStock),
      dailyAvg.toFixed(1).replace('.', ','),
      String(leadTimeDays),
      String(suggestedSafety),
      String(configuredMin),
      formatAmount(unitCost, csvOptions),
      formatAmount(safetyCapital, csvOptions),
      `"${status}"`,
      String(orderQty)
    ]);
  });

  rows.push(['']);
  rows.push(['RESUMO DO DIAGNÓSTICO']);
  rows.push(['Total de Produtos Analisados', String(products.length)]);
  rows.push(['Produtos em Ruptura Crítica (Estoque Zero)', String(totalCriticalItems)]);
  rows.push(['Produtos em Ponto de Pedido (Comprar com Urgência)', String(totalWarningItems)]);
  rows.push(['Capital Total Recomendado Imobilizado em Segurança', formatMoney(totalSafetyCapital,csvOptions)]);

  const csvContent = rows.map(r => r.join(';')).join('\r\n');
  const filename = `${filenamePrefix}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  downloadFile(csvContent, filename);
}


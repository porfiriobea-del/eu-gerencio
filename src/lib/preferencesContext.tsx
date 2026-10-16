import { CurrencyContext } from './useCurrency';
import { normalizeCurrency, getCurrencySymbol, type StoreCurrency } from './currency';
import { syncDocumentLanguage } from './browserTranslation';
import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'pt' | 'en' | 'es';
export type FontSize = 'normal' | 'large' | 'xlarge';
export type LanguageMode = 'technical' | 'neutral' | 'basic';
export { THEME_STYLES, normalizeThemePreset } from './interfaceThemes';
export type { ThemePreset, ThemeStyle } from './interfaceThemes';
import { normalizeThemePreset, getThemeTokens } from './interfaceThemes';
import type { ThemePreset } from './interfaceThemes';

// ---------------------------------------------------------------------------
// LANGUAGE MODES (SISTEMA PERSONALIZADO DE LINGUAGEM)
// ---------------------------------------------------------------------------
export interface LanguageModeExample {
  concept: string;
  term: string;
  explanation: string;
}

export interface LanguageModeInfo {
  id: LanguageMode;
  name: string;
  badge: string;
  badgeColor: string;
  tagline: string;
  description: string;
  examples: LanguageModeExample[];
}

export const LANGUAGE_MODE_INFOS: LanguageModeInfo[] = [
  {
    id: 'technical',
    name: 'Técnico / Profissional',
    badge: 'Gestão & Finanças',
    badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    tagline: 'Termos reais e formais do negócio com explicações aprofundadas',
    description: 'Usa os termos reais do negócio (Ponto de pedido, Margem operacional, Prazo de reposição / Lead time, CMV, etc.), com explicações completas e detalhadas para quem já entende do assunto e busca profundidade analítica.',
    examples: [
      { concept: 'Entidade do Catálogo', term: 'Mercadoria', explanation: 'Itens inventariáveis do ativo circulante destinados à revenda' },
      { concept: 'Alerta de Reposição', term: 'Ponto de Pedido (Estoque Mínimo)', explanation: 'Nível de estoque de segurança que dispara o pedido de compra para mitigar risco de ruptura' },
      { concept: 'Capacidade Limite', term: 'Estoque Máximo (Capacidade)', explanation: 'Teto de armazenagem para evitar custo de estocagem e depreciação de mercadoria' },
      { concept: 'Ganho na Venda', term: 'Margem Bruta de Venda', explanation: 'Percentual retido sobre o faturamento após dedução do custo unitário de aquisição' },
      { concept: 'Prazo do Fornecedor', term: 'Lead Time de Ressuprimento', explanation: 'Tempo decorrido entre a emissão do pedido ao fornecedor e a disponibilização física' },
      { concept: 'Relatório Financeiro', term: 'Demonstrativo Consolidado (Entradas e Saídas)', explanation: 'Comparação de vendas faturadas e aquisições, sem confundir a diferença com lucro líquido' },
    ],
  },
  {
    id: 'neutral',
    name: 'Neutro (Comercial)',
    badge: 'Equilibrado & Prático',
    badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    tagline: 'Linguagem comercial comum e precisa do dia a dia da loja',
    description: 'Um meio-termo, com linguagem comum mas ainda precisa, sem termo técnico difícil nem simplificação exagerada — pensado para quem tem familiaridade com o dia a dia do comércio.',
    examples: [
      { concept: 'Entidade do Catálogo', term: 'Produto', explanation: 'Produtos cadastrados para venda e controle de giro na loja' },
      { concept: 'Alerta de Reposição', term: 'Estoque Mínimo (Alerta)', explanation: 'Quantidade mínima de segurança para não deixar faltar mercadoria na prateleira' },
      { concept: 'Capacidade Limite', term: 'Estoque Máximo (Teto)', explanation: 'Quantidade máxima recomendada para não imobilizar dinheiro em excesso' },
      { concept: 'Ganho na Venda', term: 'Margem de Lucro', explanation: 'Percentual de lucro bruto obtido sobre o preço cobrado' },
      { concept: 'Prazo do Fornecedor', term: 'Prazo de Entrega do Fornecedor', explanation: 'Dias que o fornecedor demora para entregar as mercadorias pedidas' },
      { concept: 'Relatório Financeiro', term: 'Resumo do Período (Vendas x Compras)', explanation: 'Visão equilibrada de vendas faturadas versus gastos em compras de mercadorias' },
    ],
  },
  {
    id: 'basic',
    name: 'Simples / Descomplicado',
    badge: 'Simples & Amigável',
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    tagline: 'A mesma informação completa, explicada com palavras do dia a dia',
    description: 'Palavras simples e ações diretas. Os detalhes ficam recolhidos e podem ser abertos quando você precisar. Nenhuma função é removida.',
    examples: [
      { concept: 'Entidade do Catálogo', term: 'Item', explanation: 'Cada item vendido e cuidado na sua loja' },
      { concept: 'Alerta de Reposição', term: 'Quando Pedir Mais (Mínimo)', explanation: 'Quando a quantidade chegar aqui, já é hora de ligar pro fornecedor para não ficar na mão' },
      { concept: 'Capacidade Limite', term: 'Limite para Não Sobrar (Máximo)', explanation: 'O limite recomendado para não comprar além da conta e ficar com produto encalhado' },
      { concept: 'Ganho na Venda', term: 'Quanto Sobra de Lucro', explanation: 'Parte do preço de venda que resta após descontar o custo do item, antes de taxas e despesas' },
      { concept: 'Prazo do Fornecedor', term: 'Quantos Dias Demora pra Chegar', explanation: 'Quantos dias o pedido leva para bater na sua porta após ser feito' },
      { concept: 'Relatório Financeiro', term: 'Resumo de vendas e compras', explanation: 'Mostra vendas, compras e a diferença entre elas. Fiado vendido ainda pode não ter sido recebido.' },
    ],
  },
];

// Unified, consistent dictionary per language mode
export const VOCABULARY: Record<LanguageMode, Record<string, string>> = {
  technical: {
    'catalog.costBasis': 'Base do custo de aquisição',
    'catalog.costPack': 'Maço integral (10 carteiras)',
    'catalog.costHalf': 'Meio maço (5 carteiras)',
    'catalog.costCart': 'Carteira avulsa (1 carteira)',
    'catalog.costPlaceholder': 'Selecione a base de aquisição',
    'catalog.costHelp': 'O custo unitário por carteira resulta da divisão do custo informado por 10, 5 ou 1, respectivamente.',
    'catalog.initialStock': 'Saldo inicial (opcional)',
    'catalog.initialStockHelp': 'Informe o saldo em unidades; para cigarros, em carteiras. Vazio equivale a zero.',
    'catalog.partial': 'Alguns itens incompletos foram ignorados. Revise os produtos reconhecidos e adicione os demais manualmente.',
    'catalog.rejected': 'A IA recusou a requisição após a recuperação automática. Tente mais tarde ou cadastre os produtos manualmente.',
    'catalog.timeout': 'Os modelos de leitura excederam o prazo. Tente novamente mais tarde ou cadastre os produtos manualmente.',
    'payment.pixDirect': 'Pix (direto na conta)',
    'payment.pixMachine': 'Pix na maquininha',
    'payment.pixRate': 'Taxa do Pix na maquininha',
    'payment.pixHelp': 'Incide somente sobre o Pix processado pela maquininha, sempre absorvida pela loja; Pix direto na conta é isento.',
    'payment.surchargeHelp': 'O acréscimo vale só para crédito, débito e voucher. A taxa do Pix na maquininha fica com a loja; Pix direto é sem taxa.',
    'payment.pixFees': 'Taxas do Pix na maquininha',
    'currency.title': 'Moeda do estabelecimento',
    'currency.warning': 'Os valores não serão convertidos, só o símbolo muda.',
    'currency.cardHelp': 'O acréscimo vale apenas para crédito, débito e voucher.',
    'currency.help': 'A escolha vale para toda a loja e não muda quando você troca o idioma.',
    'payment.fees': 'Taxas pagas pela loja',
    'catalog.fileHelp': 'PDF: até 3 MB. Fotos: JPEG, PNG ou WebP. Até 200 produtos por vez. Estoque inicial opcional. Preços não encontrados ficam em branco.',
    'catalog.unchecked': 'Nenhum registro selecionado. Selecione os cadastros e confirme eventuais coincidências.',
    'catalog.empty': 'A extração não retornou registros neste arquivo. Revise o documento ou cadastre manualmente.',
    'catalog.title': 'Importação de catálogo do fornecedor',
    'catalog.save': 'Confirmar cadastros selecionados',
    'catalog.saving': 'Persistindo cadastros...',
    'catalog.validation': 'Corrija os dados inválidos antes de confirmar o lote.',
    'catalog.fix': 'Revise as linhas sinalizadas e execute novamente a confirmação.',
    'catalog.noSelection': 'Selecione ao menos um registro para persistência.',
    'catalog.tooMany': 'O limite é de 200 cadastros por transação de importação.',
    'catalog.duplicate': 'Confirme a criação de um cadastro adicional para o registro coincidente.',
    'catalog.failed': 'A persistência do lote não foi confirmada. A revisão foi preservada; consulte o estoque e tente novamente.',
    'catalog.checking': 'Validando os registros selecionados...',
    'catalog.cancelled': 'Confirmação interrompida; registros mantidos para revisão.',
    'catalog.success': '{count} cadastros confirmados no estoque.',
    'catalog.successOne': '1 cadastro confirmado no estoque.',
    'catalog.alreadySaved': 'Lote anteriormente persistido; reenvio confirmado sem novos cadastros.',
    'pos.salesOrder': 'Ordenação por volume vendido no histórico (unidade-base de estoque).',
    'suggestion.applied': 'Parâmetros preenchidos. Confirme o cadastro para persistir.',
    'suggestion.title': 'Parâmetros sugeridos de ressuprimento',
    'suggestion.description': 'Projeção baseada no estoque físico, consumo médio diário e prazo de reposição.',
    'suggestion.coverage': 'Ciclo de aquisição (dias)',
    'suggestion.noAverage': 'Informe consumo médio diário positivo para dimensionar os limites de estoque.',
    'suggestion.min': 'Ponto de pedido sugerido',
    'suggestion.max': 'Estoque máximo sugerido',
    'suggestion.days': 'Cobertura do saldo físico: aproximadamente {days} dias.',
    'suggestion.empty': 'Saldo físico zerado.',
    'suggestion.buy': 'Necessidade para atingir o estoque-alvo: {quantity} {unit}.',
    'suggestion.excess': 'Excedente sobre o estoque-alvo: {quantity} {unit}. Não há necessidade de aquisição.',
    'suggestion.warning': 'Ponto de pedido atingido. Programar ressuprimento.',
    'suggestion.apply': 'Aplicar parâmetros sugeridos',
    'suggestion.confirm': 'Atualiza reserva e estoque-alvo no formulário. Confirme o cadastro para persistir; o saldo físico é preservado.',
    'suggestion.details': 'Memória de cálculo',
    'suggestion.formula': 'Ponto de pedido = demanda no prazo de reposição + reserva de 25%. Estoque-alvo = demanda no prazo e ciclo de aquisição + reserva.',
    'purchase.title': 'Embalagem de aquisição e custo unitário',
    'purchase.form': 'Forma de aquisição do fornecedor',
    'purchase.size': 'Carteiras por embalagem de aquisição',
    'purchase.full': 'Maço integral — 10 carteiras',
    'purchase.half': 'Meio maço — 5 carteiras',
    'purchase.note': 'O custo unitário por carteira é calculado com a embalagem de aquisição; o formato comercial de venda maço mantém 10 carteiras.',
    'purchase.package': 'Embalagem de aquisição de cigarros',
    'purchase.cost': 'Custo total da embalagem de aquisição (R$)',
    'purchase.costHelp': 'Informe o custo total referente às 10 ou 5 carteiras da embalagem selecionada.',
    'nav.movements': 'Registro de operações',
    'movements.title': 'Registro de Operações e Equipe',
    'movements.description': 'Consulte operações, responsáveis e ajustes manuais do período.',
    'movements.history': 'Registro de operações',
    'movements.manual': 'Registrar ajuste operacional',
    'debt.description': 'Acompanhe os saldos devedores e registre recebimentos dos clientes.',
    'reports.note': 'Vendas faturadas, incluindo crédito a receber, menos aquisições e taxas da maquininha. Esta diferença não representa lucro líquido nem saldo disponível.',
    'settings.languageMode': 'Linguagem da interface',
    'help.title': 'Central de Ajuda e Feedback',
    'settings.advanced': 'Integrações e segurança',
    'settings.reportDescription': 'Vendas faturadas, aquisições e crédito a receber do período selecionado.',
    // Entities (Strictly 'Mercadoria' / 'Mercadorias')
    'entity.item': 'Mercadoria',
    'entity.items': 'Mercadorias',
    'entity.singular': 'Mercadoria',
    'entity.plural': 'Mercadorias',
    'entity.new': 'Nova Mercadoria',
    'entity.add': 'Cadastrar Mercadoria',
    'entity.edit': 'Editar Mercadoria',
    'entity.delete': 'Remover Mercadoria',
    'entity.name': 'Denominação da Mercadoria',
    'entity.category': 'Classificação / Categoria',
    'entity.code': 'Código / EAN da Mercadoria',
    'entity.all': 'Todas as Mercadorias',

    // Stock & Inventory
    'stock.title': 'Posição de Estoque & Inventário',
    'stock.current': 'Posição de Estoque Físico',
    'stock.initial': 'Estoque Inicial do Exercício',
    'stock.initialDate': 'Data Base de Inventário',
    'stock.min': 'Ponto de Pedido (Estoque Mínimo)',
    'stock.max': 'Estoque Máximo (Capacidade Operacional)',
    'stock.leadTime': 'Lead Time de Ressuprimento',
    'stock.leadTimeDays': 'dias úteis de ressuprimento',
    'stock.reorderWarning': 'Atingiu o Ponto de Pedido (Comprar)',
    'stock.turnover': 'Consumo Médio Diário e Giro',
    'stock.turnoverAction': 'Virada de Exercício Mensal',
    'stock.value': 'Valoração Total do Estoque',
    'stock.status': 'Condição Operacional',
    'stock.inStock': 'Em Nível Normal',
    'stock.lowStock': 'Abaixo do Ponto de Pedido',
    'stock.outOfStock': 'Ruptura de Estoque (Zerado)',
    'stock.overStock': 'Acima da Capacidade Máxima',

    // Purchases & Replenishment
    'purchases.title': 'Aquisições e Ressuprimento',
    'purchases.action': 'Registrar Aquisição',
    'purchases.suggestion': 'Necessidade Líquida de Ressuprimento',
    'purchases.history': 'Histórico de Entradas e Custos',
    'purchases.totalSpent': 'Desembolso Total em Aquisições',
    'purchases.pending': 'Ordens de Aquisição em Aberto',
    'purchases.unitCost': 'Custo Unitário de Aquisição',
    'purchases.totalCost': 'Montante Total Faturado',

    // Pricing & Financials
    'pricing.title': 'Demonstrativo de Preços e Resultados',
    'pricing.cost': 'Custo Unitário de Aquisição',
    'pricing.selling': 'Preço de Venda Praticado',
    'pricing.margin': 'Margem Bruta de Venda',
    'pricing.markup': 'Fator Markup Aplicado',
    'pricing.grossRevenue': 'Receita Operacional Bruta',
    'pricing.cogs': 'Custo das Mercadorias Vendidas (CMV)',
    'pricing.grossProfit': 'Lucro Operacional Bruto',
    'pricing.netProfit': 'Resultado líquido estimado',
    'pricing.avgTicket': 'Ticket Médio por Atendimento',
    'pricing.totalPurchases': 'Desembolso em Aquisições do Mês',

    // Reports & Statements
    'reports.title': 'Demonstrativo e Relatórios Operacionais',
    'reports.summary': 'Demonstrativo Consolidado do Período',
    'reports.inflow': 'Receita Operacional Bruta (Entradas)',
    'reports.outflow': 'Desembolsos com Aquisições (Saídas)',
    'reports.balance': 'Vendas menos aquisições e taxas',
    'reports.pending': 'Valores a Receber (Crédito Rotativo)',

    // POS & Sales
    'pos.title': 'Frente de Caixa (PDV)',
    'pos.action': 'Efetivar Operação de Venda',
    'pos.cart': 'Composição do Atendimento',
    'pos.emptyCart': 'Nenhuma mercadoria registrada no momento',

    // Debt & Receivables
    'debt.title': 'Contas a Receber (Crédito Rotativo)',
    'debt.customer': 'Titular da Conta / Cliente',
    'debt.balance': 'Saldo Devedor em Aberto',
    'debt.pay': 'Amortizar / Baixar Débito',

    // Nav
    'nav.stock': 'Estoque & Inventário',
    'nav.purchases': 'Aquisições',
    'nav.pricing': 'Demonstrativo de Preços',
    'nav.debt': 'Contas a Receber',
    'nav.pos': 'Frente de Caixa',
  },
  neutral: {
    'catalog.costBasis': 'Este custo corresponde a',
    'catalog.costPack': '1 maço (10 carteiras)',
    'catalog.costHalf': 'Meio maço (5 carteiras)',
    'catalog.costCart': '1 carteira avulsa',
    'catalog.costPlaceholder': 'Confirme a medida',
    'catalog.costHelp': 'O custo por carteira é calculado usando 10, 5 ou 1 carteira, conforme a opção escolhida.',
    'catalog.initialStock': 'Estoque inicial (opcional)',
    'catalog.initialStockHelp': 'Informe unidades ou carteiras para cigarros. Se deixar vazio, começa com zero.',
    'catalog.partial': 'Alguns itens não foram lidos por completo. Confira a lista e adicione os que faltam.',
    'catalog.rejected': 'A IA recusou a leitura após as tentativas automáticas. Tente mais tarde ou adicione os produtos manualmente.',
    'catalog.timeout': 'A leitura demorou demais, mesmo com o modelo alternativo. Tente mais tarde ou adicione os produtos manualmente.',
    'payment.pixDirect': 'Pix (direto na conta)',
    'payment.pixMachine': 'Pix na maquininha',
    'payment.pixRate': 'Taxa do Pix na maquininha',
    'payment.pixHelp': 'Vale apenas para Pix pago na maquininha; a loja paga essa taxa e o Pix direto na conta não tem taxa.',
    'payment.surchargeHelp': 'O acréscimo vale só para crédito, débito e voucher. A taxa do Pix na maquininha fica com a loja; Pix direto é sem taxa.',
    'payment.pixFees': 'Taxas do Pix na maquininha',
    'currency.title': 'Moeda da loja',
    'currency.warning': 'Os valores não serão convertidos, só o símbolo muda.',
    'currency.cardHelp': 'O acréscimo vale apenas para crédito, débito e voucher.',
    'currency.help': 'A escolha vale para toda a loja e não muda quando você troca o idioma.',
    'payment.fees': 'Taxas pagas pela loja',
    'catalog.fileHelp': 'PDF: até 3 MB. Fotos: JPEG, PNG ou WebP. Até 200 produtos por vez. Estoque inicial opcional. Preços não encontrados ficam em branco.',
    'catalog.unchecked': 'Nenhum produto selecionado. Marque os desejados e revise os avisos de duplicidade.',
    'catalog.empty': 'Nenhum produto foi encontrado neste arquivo. Tente outra foto ou preencha manualmente.',
    'catalog.title': 'Importar catálogo do fornecedor',
    'catalog.save': 'Cadastrar selecionados',
    'catalog.saving': 'Salvando produtos...',
    'catalog.validation': 'Revise os dados dos produtos selecionados.',
    'catalog.fix': 'Corrija as linhas destacadas antes de cadastrar.',
    'catalog.noSelection': 'Selecione pelo menos um produto para cadastrar.',
    'catalog.tooMany': 'Selecione até 200 produtos por importação.',
    'catalog.duplicate': 'Revise o produto duplicado e confirme se deseja outro cadastro.',
    'catalog.failed': 'Não foi possível confirmar a importação. A revisão foi mantida. Confira o estoque e a conexão antes de tentar novamente.',
    'catalog.checking': 'Conferindo os produtos selecionados...',
    'catalog.cancelled': 'Cadastro não confirmado. Os produtos foram mantidos para revisão.',
    'catalog.success': '{count} produtos do seu catálogo adicionados ao estoque com sucesso!',
    'catalog.successOne': '1 produto do seu catálogo adicionado ao estoque com sucesso!',
    'catalog.alreadySaved': 'Os produtos selecionados já foram cadastrados. Nenhuma cópia foi criada.',
    'pos.salesOrder': 'Mais vendidos primeiro, pelo histórico da loja.',
    'suggestion.applied': 'Limites preenchidos. Salve o produto para confirmar.',
    'suggestion.title': 'Sugestão de estoque mínimo e máximo',
    'suggestion.description': 'Compara estoque, média diária cadastrada e prazo de entrega para orientar a reposição.',
    'suggestion.coverage': 'Intervalo entre compras (dias)',
    'suggestion.noAverage': 'Informe uma média de vendas maior que zero. Use uma estimativa se ainda não tem histórico.',
    'suggestion.min': 'Mínimo sugerido',
    'suggestion.max': 'Máximo sugerido',
    'suggestion.days': 'Com a média informada, o estoque dura cerca de {days} dias.',
    'suggestion.empty': 'Estoque atual zerado.',
    'suggestion.buy': 'Faltam {quantity} {unit} para atingir o máximo sugerido.',
    'suggestion.excess': 'Há {quantity} {unit} acima do máximo sugerido. Não é necessário comprar agora.',
    'suggestion.warning': 'Estoque no mínimo sugerido. Planeje a reposição.',
    'suggestion.apply': 'Usar limites sugeridos',
    'suggestion.confirm': 'Preenche a reserva e o máximo. Salve o produto para confirmar, sem alterar o estoque atual.',
    'suggestion.details': 'Entenda o cálculo',
    'suggestion.formula': 'O mínimo cobre as vendas até a entrega mais 25% de reserva. O máximo inclui também os dias entre compras.',
    'purchase.title': 'Forma de compra e custo',
    'purchase.form': 'Embalagem do fornecedor',
    'purchase.size': 'Quantidade comprada por embalagem',
    'purchase.full': 'Maço inteiro — 10 carteiras',
    'purchase.half': 'Meio maço — 5 carteiras',
    'purchase.note': 'O custo por carteira usa a embalagem selecionada. O maço de venda permanece com 10 carteiras.',
    'purchase.package': 'Maço ou meio maço',
    'purchase.cost': 'Preço da embalagem comprada (R$)',
    'purchase.costHelp': 'Informe o valor pago pelo maço inteiro ou pelo meio maço selecionado.',
    'nav.movements': 'Movimentações',
    'movements.title': 'Movimentações e Equipe',
    'movements.description': 'Veja o que aconteceu na loja e quem fez cada registro.',
    'movements.history': 'Histórico de movimentações',
    'movements.manual': 'Registrar movimentação',
    'debt.description': 'Confira as dívidas dos clientes e registre os pagamentos.',
    'reports.note': 'O total vendido inclui fiado. Vendas menos compras e taxas não é o lucro nem o dinheiro disponível no caixa.',
    'settings.languageMode': 'Modo de linguagem',
    'help.title': 'Ajuda e Feedback',
    'settings.advanced': 'Integrações e segurança',
    'settings.reportDescription': 'Confira vendas, compras e fiado no período escolhido.',
    // Entities (Strictly 'Produto' / 'Produtos')
    'entity.item': 'Produto',
    'entity.items': 'Produtos',
    'entity.singular': 'Produto',
    'entity.plural': 'Produtos',
    'entity.new': 'Novo Produto',
    'entity.add': 'Cadastrar Produto',
    'entity.edit': 'Editar Produto',
    'entity.delete': 'Excluir Produto',
    'entity.name': 'Nome do Produto',
    'entity.category': 'Categoria do Produto',
    'entity.code': 'Código / Código de Barras',
    'entity.all': 'Todos os Produtos',

    // Stock & Inventory
    'stock.title': 'Gestão de Estoque',
    'stock.current': 'Estoque Físico Atual',
    'stock.initial': 'Estoque Inicial',
    'stock.initialDate': 'Data do Estoque Inicial',
    'stock.min': 'Estoque Mínimo (Alerta)',
    'stock.max': 'Estoque Máximo (Teto)',
    'stock.leadTime': 'Prazo de Entrega do Fornecedor',
    'stock.leadTimeDays': 'dias de entrega do fornecedor',
    'stock.reorderWarning': 'Estoque Baixo (Repor)',
    'stock.turnover': 'Giro e Consumo Diário',
    'stock.turnoverAction': 'Virada de Mês',
    'stock.value': 'Valor Total em Estoque',
    'stock.status': 'Situação do Estoque',
    'stock.inStock': 'Estoque Normal',
    'stock.lowStock': 'Estoque Baixo',
    'stock.outOfStock': 'Esgotado',
    'stock.overStock': 'Estoque Excessivo',

    // Purchases & Replenishment
    'purchases.title': 'Compras de Reposição',
    'purchases.action': 'Registrar Compra',
    'purchases.suggestion': 'Sugestão de Compra',
    'purchases.history': 'Histórico de Compras',
    'purchases.totalSpent': 'Total Investido em Compras',
    'purchases.pending': 'Compras Pendentes',
    'purchases.unitCost': 'Preço de Custo',
    'purchases.totalCost': 'Custo Total da Compra',

    // Pricing & Financials
    'pricing.title': 'Tabela de Preços e Margens',
    'pricing.cost': 'Preço de Custo',
    'pricing.selling': 'Preço de Venda',
    'pricing.margin': 'Margem de Lucro',
    'pricing.markup': 'Markup',
    'pricing.grossRevenue': 'Faturamento Bruto',
    'pricing.cogs': 'Custo dos Produtos Vendidos',
    'pricing.grossProfit': 'Lucro Bruto Apurado',
    'pricing.netProfit': 'Lucro Líquido Real',
    'pricing.avgTicket': 'Valor Médio por Venda',
    'pricing.totalPurchases': 'Total em Compras de Reposição',

    // Reports & Statements
    'reports.title': 'Relatórios do Comércio',
    'reports.summary': 'Resumo do Período',
    'reports.inflow': 'Total de Vendas (Entradas)',
    'reports.outflow': 'Total de Compras (Saídas)',
    'reports.balance': 'Saldo do Período',
    'reports.pending': 'Total em Fiado a Receber',

    // POS & Sales
    'pos.title': 'Caixa',
    'pos.action': 'Finalizar Venda',
    'pos.cart': 'Carrinho de Vendas',
    'pos.emptyCart': 'Nenhum produto adicionado à venda',

    // Debt & Receivables
    'debt.title': 'Fiado (Pendências)',
    'debt.customer': 'Cliente',
    'debt.balance': 'Valor Pendente',
    'debt.pay': 'Receber Pagamento',

    // Nav
    'nav.stock': 'Estoque',
    'nav.purchases': 'Compras',
    'nav.pricing': 'Preços',
    'nav.debt': 'Fiado',
    'nav.pos': 'Caixa',
  },
  basic: {
    'catalog.costBasis': 'Esse preço é de quê?',
    'catalog.costPack': '1 maço (10 carteiras)',
    'catalog.costHalf': 'Meio maço (5 carteiras)',
    'catalog.costCart': '1 carteira avulsa',
    'catalog.costPlaceholder': 'Escolha uma opção',
    'catalog.costHelp': 'Maço: dividimos por 10. Meio maço: por 5. Carteira: usamos o preço informado.',
    'catalog.initialStock': 'Quantidade que você já tem (opcional)',
    'catalog.initialStockHelp': 'Cigarros: conte as carteiras. Outros produtos: conte as unidades. Pode deixar vazio para começar com zero.',
    'catalog.partial': 'Alguns produtos não ficaram legíveis. Confira a lista e acrescente os que faltam.',
    'catalog.rejected': 'Não deu para ler agora. Tente mais tarde ou preencha os produtos aqui.',
    'catalog.timeout': 'A leitura demorou e não terminou. Tente mais tarde ou preencha os produtos aqui.',
    'payment.pixDirect': 'Pix (direto na conta)',
    'payment.pixMachine': 'Pix na maquininha',
    'payment.pixRate': 'Taxa do Pix na maquininha',
    'payment.pixHelp': 'Só vale para Pix na maquininha. A loja paga a taxa; no Pix direto na conta, não há taxa.',
    'payment.surchargeHelp': 'O acréscimo vale só para crédito, débito e voucher. A taxa do Pix na maquininha fica com a loja; Pix direto é sem taxa.',
    'payment.pixFees': 'Taxas do Pix na maquininha',
    'currency.title': 'Moeda da loja',
    'currency.warning': 'Os valores não serão convertidos, só o símbolo muda.',
    'currency.cardHelp': 'O acréscimo vale apenas para crédito, débito e voucher.',
    'currency.help': 'A escolha vale para toda a loja e não muda quando você troca o idioma.',
    'payment.fees': 'Taxas pagas pela loja',
    'catalog.fileHelp': 'PDF: até 3 MB. Fotos: JPEG, PNG ou WebP. Até 200 produtos por vez. Estoque inicial opcional. Preços não encontrados ficam em branco.',
    'catalog.unchecked': 'Nenhum produto marcado. Marque os que quer salvar. Os repetidos precisam da sua confirmação.',
    'catalog.empty': 'Não encontramos produtos neste arquivo. Tente outra foto ou adicione à mão.',
    'catalog.title': 'Trazer produtos de uma foto ou PDF',
    'catalog.save': 'Salvar produtos marcados',
    'catalog.saving': 'Salvando produtos...',
    'catalog.validation': 'Falta preencher alguns dados.',
    'catalog.fix': 'Corrija os produtos destacados e tente de novo.',
    'catalog.noSelection': 'Marque pelo menos um produto para salvar.',
    'catalog.tooMany': 'Salve até 200 produtos por vez.',
    'catalog.duplicate': 'Este produto parece repetido. Confira o aviso antes de salvar.',
    'catalog.failed': 'Não deu para confirmar o cadastro. Seus produtos continuam aqui para tentar de novo. Confira também o estoque.',
    'catalog.checking': 'Conferindo os produtos marcados...',
    'catalog.cancelled': 'Cadastro interrompido. Os produtos continuam aqui para você revisar.',
    'catalog.success': '{count} produtos salvos no estoque!',
    'catalog.successOne': '1 produto salvo no estoque!',
    'catalog.alreadySaved': 'Esses produtos já foram salvos. Nenhuma cópia foi criada.',
    'pos.salesOrder': 'O que mais vende aparece primeiro.',
    'suggestion.applied': 'Preenchido! Agora toque em Salvar Produto.',
    'suggestion.title': 'Quanto manter na loja?',
    'suggestion.description': 'Veja quando comprar mais e quanto vale a pena ter na prateleira.',
    'suggestion.coverage': 'De quantos em quantos dias você compra?',
    'suggestion.noAverage': 'Diga acima quanto vende por dia. Pode ser uma estimativa.',
    'suggestion.min': 'Quando comprar mais',
    'suggestion.max': 'Quanto manter na loja',
    'suggestion.days': 'O que você tem deve durar cerca de {days} dias.',
    'suggestion.empty': 'Você está sem estoque.',
    'suggestion.buy': 'Para chegar à quantidade sugerida, compre mais {quantity} {unit}.',
    'suggestion.excess': 'Você tem {quantity} {unit} a mais que o sugerido. Não precisa comprar agora.',
    'suggestion.warning': 'Está na hora de comprar mais.',
    'suggestion.apply': 'Preencher para mim',
    'suggestion.confirm': 'Depois, toque em Salvar Produto. Isso não muda a quantidade que você tem.',
    'suggestion.details': 'Como fizemos a conta?',
    'suggestion.formula': 'Contamos o que deve vender até o pedido chegar e guardamos um extra de 25%. Para o máximo, contamos também os dias entre suas compras.',
    'purchase.title': 'Como você compra?',
    'purchase.form': 'Como vem do fornecedor?',
    'purchase.size': 'Quanto você compra de cada vez?',
    'purchase.full': 'Maço inteiro — 10 carteiras',
    'purchase.half': 'Meio maço — 5 carteiras',
    'purchase.note': 'O preço pago é dividido por 10 ou por 5 para saber o custo de cada carteira. Na venda, 1 maço continua sendo 10 carteiras.',
    'purchase.package': 'Maço ou meio maço',
    'purchase.cost': 'Quanto pagou nessa compra (R$)',
    'purchase.costHelp': 'Informe o preço do maço ou do meio maço escolhido.',
    'nav.movements': 'Histórico da loja',
    'movements.title': 'O que aconteceu na loja',
    'movements.description': 'Confira quem vendeu, recebeu ou mudou o estoque.',
    'movements.history': 'Registros da loja',
    'movements.manual': 'Anotar ajuste',
    'debt.description': 'Veja quem está devendo e anote quando receber.',
    'reports.note': 'O total vendido inclui fiado. Esta conta não mostra o lucro nem quanto há no caixa.',
    'settings.languageMode': 'Como o app fala com você',
    'help.title': 'Ajuda e sugestões',
    'settings.advanced': 'Mais opções: planilhas e cópias de segurança',
    'settings.reportDescription': 'Veja quanto vendeu, quanto comprou e o que foi vendido fiado.',
    // Entities (Strictly 'Item' / 'Itens')
    'entity.item': 'Item',
    'entity.items': 'Itens',
    'entity.singular': 'Item',
    'entity.plural': 'Itens',
    'entity.new': 'Novo Item',
    'entity.add': 'Adicionar Item',
    'entity.edit': 'Alterar Item',
    'entity.delete': 'Apagar Item',
    'entity.name': 'Nome do Item',
    'entity.category': 'Tipo / Grupo do Item',
    'entity.code': 'Código ou Código de Barras',
    'entity.all': 'Todos os Itens',

    // Stock & Inventory
    'stock.title': 'O Que Tem na Loja',
    'stock.current': 'Quantidade na Prateleira',
    'stock.initial': 'Quantidade no Começo do Mês',
    'stock.initialDate': 'Dia da Contagem do Mês',
    'stock.min': 'Quando Pedir Mais (Mínimo)',
    'stock.max': 'Limite para Não Sobrar (Máximo)',
    'stock.leadTime': 'Quantos Dias Demora pra Chegar',
    'stock.leadTimeDays': 'dias para a mercadoria chegar',
    'stock.reorderWarning': 'Item Acabando (Pedir Já)',
    'stock.turnover': 'O Quanto Sai por Dia',
    'stock.turnoverAction': 'Começar Novo Mês',
    'stock.value': 'Valor Total Guardado na Loja',
    'stock.status': 'Situação do Item',
    'stock.inStock': 'Quantidade Boa',
    'stock.lowStock': 'Hora de Pedir Mais',
    'stock.outOfStock': 'Acabou Tudo',
    'stock.overStock': 'Tem Demais na Loja',

    // Purchases & Replenishment
    'purchases.title': 'Compras de Mercadorias',
    'purchases.action': 'Anotar Compra Feita',
    'purchases.suggestion': 'O Que Comprar Agora',
    'purchases.history': 'Histórico do que Comprou',
    'purchases.totalSpent': 'Total Gasto com Compras',
    'purchases.pending': 'Pedidos a Receber',
    'purchases.unitCost': 'Quanto Você Paga no Item',
    'purchases.totalCost': 'Total Pago na Compra',

    // Pricing & Financials
    'pricing.title': 'Preços e Ganhos do Negócio',
    'pricing.cost': 'Quanto Você Paga no Item',
    'pricing.selling': 'Preço Cobrado do Cliente',
    'pricing.margin': 'Quanto Sobra de Lucro',
    'pricing.markup': 'Aumento sobre o Custo',
    'pricing.grossRevenue': 'Total vendido',
    'pricing.cogs': 'Gasto com o que Você Vendeu',
    'pricing.grossProfit': 'O que Sobrou das Vendas',
    'pricing.netProfit': 'Resultado estimado',
    'pricing.avgTicket': 'Média Gasta por Cliente',
    'pricing.totalPurchases': 'Dinheiro que Saiu em Compras',

    // Reports & Statements (Simples / Descomplicado)
    'reports.title': 'Relatório Simples do Seu Comércio',
    'reports.summary': 'Resumo do Dia',
    'reports.inflow': 'Total vendido',
    'reports.outflow': 'Total em compras',
    'reports.balance': 'Vendas menos compras e taxas',
    'reports.pending': 'Vendido pra receber depois',

    // POS & Sales
    'pos.title': 'Registrar Venda (Caixa)',
    'pos.action': 'Concluir Venda',
    'pos.cart': 'Lista da Venda Atual',
    'pos.emptyCart': 'Nenhum item colocado na venda ainda',

    // Debt & Receivables
    'debt.title': 'Caderneta (Vendido pra Pagar Depois)',
    'debt.customer': 'Nome do Cliente',
    'debt.balance': 'Quanto falta receber',
    'debt.pay': 'Anotar pagamento',

    // Nav
    'nav.stock': 'O Que Tem na Loja',
    'nav.purchases': 'Compras',
    'nav.pricing': 'Preços & Lucro',
    'nav.debt': 'Caderneta',
    'nav.pos': 'Registrar Venda',
  },
};

export interface PreferencesContextType {
  currency: StoreCurrency;
  language: Language;
  setLanguage: (lang: Language) => void;
  languageMode: LanguageMode;
  setLanguageMode: (mode: LanguageMode) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  themePreset: ThemePreset;
  setThemePreset: (preset: ThemePreset) => void;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => void;
  t: (key: string) => string;
  v: (key: string, fallback?: string) => string;
  entityName: (plural?: boolean) => string;
  isBasicMode: boolean;
  simpleViewMode: boolean;
  setSimpleViewMode: (simple: boolean) => void;
  toggleSimpleViewMode: () => void;
}

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  pt: {
    // Navigation
    'nav.home': 'Início',
    'nav.pos': 'Caixa',
    'nav.stock': 'Estoque',
    'nav.purchases': 'Compras',
    'nav.pricing': 'Preços',
    'nav.debt': 'Fiado',
    'nav.settings': 'Ajustes',
    'nav.tutorial': 'Tutorial',
    'nav.invite': 'Convidar Equipe',
    'nav.logout': 'Sair',

    // Settings
    'settings.title': 'Ajustes e Personalização',
    'settings.customization': 'Personalização do Sistema',
    'settings.customization.desc': 'Ajuste o modo de linguagem, tema visual, escala de leitura e idioma.',
    'settings.langMode': 'Sistema Personalizado de Linguagem',
    'settings.langMode.desc': 'Escolha como o sistema se comunica com você em todas as telas.',
    'settings.language': 'Idioma Global do Sistema',
    'settings.accessibility': 'Acessibilidade de Leitura',
    'settings.accessibility.desc': 'Aumente o tamanho das fontes e espaçamentos para facilitar a leitura.',
    'settings.themes': 'Temas e Estilos Visuais',
    'settings.themes.desc': 'Selecione um estilo para aplicar paletas harmônicas com a fonte Outfit.',
    'settings.storeData': 'Dados do Comércio',
    'settings.systemPref': 'Preferências Gerais',
    'settings.backup': 'Rotina de Backup Diário (Firestore)',
    'settings.backupNow': 'Fazer Backup Agora',
    'settings.save': 'Salvar Alterações',

    // Accessibility options
    'font.normal': 'Padrão (16px)',
    'font.large': 'Grande (18px) — Recomendado',
    'font.xlarge': 'Extra Grande (20px) — Acessível',
  },
  en: {
    'nav.home': 'Home',
    'nav.pos': 'Checkout',
    'nav.stock': 'Inventory',
    'nav.purchases': 'Purchases',
    'nav.pricing': 'Pricing',
    'nav.debt': 'Credit (Fiado)',
    'nav.settings': 'Settings',
    'nav.tutorial': 'Tutorial',
    'nav.invite': 'Invite Team',
    'nav.logout': 'Sign Out',

    'settings.title': 'Settings & Customization',
    'settings.customization': 'System Customization',
    'settings.customization.desc': 'Adjust language mode, visual theme, reading scale, and language.',
    'settings.langMode': 'Custom Language & Vocabulary Mode',
    'settings.langMode.desc': 'Choose how the system words metrics, stock and financial concepts.',
    'settings.language': 'System Language',
    'settings.accessibility': 'Reading Accessibility',
    'settings.accessibility.desc': 'Increase font size and spacing for comfortable reading.',
    'settings.themes': 'Themes & Visual Styles',
    'settings.themes.desc': 'Select a curated style palette powered by the Outfit typeface.',
    'settings.storeData': 'Store Details',
    'settings.systemPref': 'General Preferences',
    'settings.backup': 'Daily Cloud Backup Routine',
    'settings.backupNow': 'Backup Now',
    'settings.save': 'Save Changes',

    'font.normal': 'Normal (16px)',
    'font.large': 'Large (18px) — Recommended',
    'font.xlarge': 'Extra Large (20px) — Accessible',
  },
  es: {
    'nav.home': 'Inicio',
    'nav.pos': 'Caja',
    'nav.stock': 'Inventario',
    'nav.purchases': 'Compras',
    'nav.pricing': 'Precios',
    'nav.debt': 'Crédito',
    'nav.settings': 'Ajustes',
    'nav.tutorial': 'Tutorial',
    'nav.invite': 'Invitar Equipo',
    'nav.logout': 'Cerrar Sesión',

    'settings.title': 'Ajustes y Personalización',
    'settings.customization': 'Personalización del Sistema',
    'settings.customization.desc': 'Configura el modo de lenguaje, tema visual, tamaño de letra e idioma.',
    'settings.langMode': 'Sistema Personalizado de Lenguaje',
    'settings.langMode.desc': 'Elige cómo el sistema expresa los conceptos de gestión y stock.',
    'settings.language': 'Idioma del Sistema',
    'settings.accessibility': 'Accesibilidad de Lectura',
    'settings.accessibility.desc': 'Aumenta el tamaño de letra para una lectura descansada.',
    'settings.themes': 'Temas y Estilos Visuales',
    'settings.themes.desc': 'Elige una paleta armónica con la tipografía Outfit.',
    'settings.storeData': 'Datos del Comercio',
    'settings.systemPref': 'Preferências Generales',
    'settings.backup': 'Copia de Seguridad Diaria (Nube)',
    'settings.backupNow': 'Crear Copia Ahora',
    'settings.save': 'Guardar Cambios',

    'font.normal': 'Normal (16px)',
    'font.large': 'Grande (18px) — Recomendado',
    'font.xlarge': 'Muy Grande (20px) — Accesible',
  },
};

function cachedPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function cachePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch {}
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<StoreCurrency>('BRL');
  useEffect(() => {
    const reset = () => setCurrency('BRL');
    window.addEventListener('auth-user-changed', reset);
    return () => window.removeEventListener('auth-user-changed', reset);
  }, []);
  const [language, setLanguageState] = useState<Language>(() => {
    const value = cachedPreference('app_lang');
    return value === 'en' || value === 'es' ? value : 'pt';
  });

  useEffect(() => syncDocumentLanguage(language), [language]);

  const [languageMode, setLanguageModeState] = useState<LanguageMode>(() => {
    const mode = cachedPreference('app_lang_mode');
    return mode === 'basic' || mode === 'technical' ? mode : 'neutral';
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    return (cachedPreference('app_fontsize') as FontSize) || 'normal';
  });

  const [themePreset, setThemePresetState] = useState<ThemePreset>(() => {
    return normalizeThemePreset(cachedPreference('app_theme_preset'));
  });

  const [darkMode, setDarkModeState] = useState<boolean>(() => {
    return cachedPreference('app_dark_mode') === 'true';
  });

  const [simpleViewMode, setSimpleViewModeState] = useState<boolean>(() => {
    const saved = cachedPreference('app_simple_view_mode');
    if (saved !== null) return saved === 'true';
    const currentMode = cachedPreference('app_lang_mode');
    return currentMode === 'basic';
  });

  useEffect(() => {
    const receive = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (!data || typeof data !== 'object') return;
      if ('currency' in data) setCurrency(normalizeCurrency(data.currency));
      if (data.theme) setThemePresetState(normalizeThemePreset(data.theme));
      if (typeof data.darkMode === 'boolean') setDarkModeState(data.darkMode);
      if (['technical','neutral','basic'].includes(data.languageMode)) {
        setLanguageModeState(data.languageMode);
        cachePreference('app_lang_mode', data.languageMode);
        if (typeof data.simpleViewMode !== 'boolean') {
          setSimpleViewModeState(data.languageMode === 'basic');
          cachePreference('app_simple_view_mode', String(data.languageMode === 'basic'));
        }
      }
      if (['pt','en','es'].includes(data.language)) setLanguageState(data.language);
      if (['normal','large','xlarge'].includes(data.fontSize)) setFontSizeState(data.fontSize);
      if (typeof data.simpleViewMode === 'boolean') {
        setSimpleViewModeState(data.simpleViewMode);
        cachePreference('app_simple_view_mode', String(data.simpleViewMode));
      }
    };
    window.addEventListener('cloud-preferences', receive);
    return () => window.removeEventListener('cloud-preferences', receive);
  }, []);
  const persistPreference = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent('cloud-preference-change', { detail }));

  const isBasicMode = languageMode === 'basic';

  // Apply Dark Mode class to <html> root
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    cachePreference('app_dark_mode', String(darkMode));
  }, [darkMode]);

  // Apply Font Size class to <html> root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('text-accessibility-large', 'text-accessibility-xlarge');
    if (fontSize === 'large') {
      root.classList.add('text-accessibility-large');
    } else if (fontSize === 'xlarge') {
      root.classList.add('text-accessibility-xlarge');
    }
  }, [fontSize]);

  // Apply Theme CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themePreset;
    root.style.colorScheme = darkMode ? 'dark' : 'light';
    for (const [property, value] of Object.entries(getThemeTokens(themePreset, darkMode))) {
      root.style.setProperty(property, value);
    }
  }, [themePreset, darkMode]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    cachePreference('app_lang', lang);
    persistPreference({ language: lang });
  };

  const setLanguageMode = (mode: LanguageMode) => {
    setLanguageModeState(mode);
    cachePreference('app_lang_mode', mode);
    const simple = mode === 'basic';
    setSimpleViewModeState(simple);
    cachePreference('app_simple_view_mode', String(simple));
    persistPreference({ languageMode: mode, simpleViewMode: simple });
  };

  const setSimpleViewMode = (simple: boolean) => {
    setSimpleViewModeState(simple);
    cachePreference('app_simple_view_mode', String(simple));
    persistPreference({ simpleViewMode: simple });
  };

  const toggleSimpleViewMode = () => setSimpleViewMode(!simpleViewMode);

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    cachePreference('app_fontsize', size);
    persistPreference({ fontSize: size });
  };

  const setThemePreset = (preset: ThemePreset) => {
    setThemePresetState(preset);
    cachePreference('app_theme_preset', preset);
    persistPreference({ theme: preset });
  };

  const setDarkMode = (enabled: boolean) => {
    setDarkModeState(enabled);
    cachePreference('app_dark_mode', String(enabled));
    persistPreference({ darkMode: enabled });
  };

  const t = (key: string): string => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS.pt[key] || key;
  };

  // Vocabulary translation according to the active language mode
  const v = (key: string, fallback?: string): string => {
    return (VOCABULARY[languageMode]?.[key] || fallback || key).replace(/R\$/g, getCurrencySymbol({currency,language}));
  };

  // Consistent entity naming helper (never mix "produto", "item", "mercadoria" in the same mode)
  const entityName = (plural: boolean = false): string => {
    if (languageMode === 'technical') {
      return plural ? 'Mercadorias' : 'Mercadoria';
    }
    if (languageMode === 'basic') {
      return plural ? 'Itens' : 'Item';
    }
    return plural ? 'Produtos' : 'Produto';
  };

  return (
    <CurrencyContext.Provider value={{currency,language}}>
    <PreferencesContext.Provider
      value={{
        currency,
        language,
        setLanguage,
        languageMode,
        setLanguageMode,
        fontSize,
        setFontSize,
        themePreset,
        setThemePreset,
        darkMode,
        setDarkMode,
        t,
        v,
        entityName,
        isBasicMode,
        simpleViewMode,
        setSimpleViewMode,
        toggleSimpleViewMode,
      }}
    >
      {children}
    </PreferencesContext.Provider>
    </CurrencyContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}

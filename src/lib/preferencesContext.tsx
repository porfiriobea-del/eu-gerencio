import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'pt' | 'en' | 'es';
export type FontSize = 'normal' | 'large' | 'xlarge';
export type ThemePreset = 
  | 'emerald' 
  | 'modern-dark' 
  | 'classic-blue' 
  | 'warm-amber' 
  | 'deep-ocean' 
  | 'royal-wine' 
  | 'earth-forest' 
  | 'slate-titanium';
export type LanguageMode = 'technical' | 'neutral' | 'basic';

export interface ThemeStyle {
  id: ThemePreset;
  name: string;
  category: 'Moderno' | 'Elegante' | 'Corporativo' | 'Contraste' | 'Natureza' | 'Equilíbrio';
  vismeConcept: string; // Conceito baseado no guia de esquemas de cores Visme
  primary: string;
  palette: [string, string, string, string, string];
  description: string;
}

export const THEME_STYLES: ThemeStyle[] = [
  {
    id: 'classic-blue',
    name: 'Azul Corporativo Pro',
    category: 'Corporativo',
    vismeConcept: 'Monocromático de Alto Contraste & Confiança',
    primary: '#2563EB',
    palette: ['#F8FAFC', '#FFFFFF', '#DBEAFE', '#2563EB', '#0F172A'],
    description: 'Paleta solicitada com Azul Principal #2563EB, fundo #F8FAFC, cartões #FFFFFF, realce #DBEAFE e texto #0F172A.',
  },
  {
    id: 'emerald',
    name: 'Esmeralda Orgânico',
    category: 'Natureza',
    vismeConcept: 'Harmonia Análoga & Orgânica',
    primary: '#059669',
    palette: ['#F0FDF4', '#FFFFFF', '#BBF7D0', '#059669', '#064E3B'],
    description: 'Verde esmeralda com menta suave. Transmite equilíbrio, frescor, tranquilidade e estabilidade operacional.',
  },
  {
    id: 'warm-amber',
    name: 'Âmbar & Terracota',
    category: 'Elegante',
    vismeConcept: 'Tons Terrosos Acolhedores',
    primary: '#D97706',
    palette: ['#FFFBEB', '#FFFFFF', '#FDE68A', '#D97706', '#78350F'],
    description: 'Amarelo dourado e âmbar aconchegante. Estimula o apetite e a proximidade humana em empórios e comércios de bairro.',
  },
  {
    id: 'modern-dark',
    name: 'Midnight Luxury',
    category: 'Contraste',
    vismeConcept: 'Contraste Neomórfico Noturno',
    primary: '#10B981',
    palette: ['#064E3B', '#0F172A', '#10B981', '#34D399', '#ECFDF5'],
    description: 'Fundo escuro profundo com acentos de verde esmeralda luminoso. Foco máximo e descanso visual para pouca luz.',
  },
  {
    id: 'deep-ocean',
    name: 'Oceano Pacífico',
    category: 'Moderno',
    vismeConcept: 'Esquema Análogo Frio & Dinâmico',
    primary: '#0284C7',
    palette: ['#F0F9FF', '#FFFFFF', '#BAE6FD', '#0284C7', '#0C4A6E'],
    description: 'Azul cerúleo e ciano límpido. Proporciona sensação de clareza mental, fluidez e organização diária.',
  },
  {
    id: 'royal-wine',
    name: 'Bordô & Púrpura Imperial',
    category: 'Elegante',
    vismeConcept: 'Esquema Complementar Dividido Sofisticado',
    primary: '#9333EA',
    palette: ['#FAF5FF', '#FFFFFF', '#E9D5FF', '#9333EA', '#581C87'],
    description: 'Vinho nobre e violeta refinado. Transmite exclusividade, qualidade premium e identidade marcante.',
  },
  {
    id: 'earth-forest',
    name: 'Floresta & Cedro',
    category: 'Equilíbrio',
    vismeConcept: 'Paleta Triádica Equilibrada (Regra 60-30-10)',
    primary: '#15803D',
    palette: ['#F7FEE7', '#FFFFFF', '#BBF7D0', '#15803D', '#365314'],
    description: 'Verde oliva e toques terrosos. Esquema orgânico relaxante ideal para hortifrútis, floriculturas e feiras.',
  },
  {
    id: 'slate-titanium',
    name: 'Titânio & Grafite Neutro',
    category: 'Corporativo',
    vismeConcept: 'Monocromático Minimalista de Alta Precisão',
    primary: '#475569',
    palette: ['#F8FAFC', '#FFFFFF', '#CBD5E1', '#475569', '#0F172A'],
    description: 'Grafite fosco e ardósia neutra. Neutralidade total para manter o foco 100% nos números, preços e estoque.',
  },
];

export const normalizeThemePreset = (val?: string): ThemePreset => {
  if (!val) return 'classic-blue';
  if (val === 'blue' || val === 'classic-blue') return 'classic-blue';
  if (val === 'green' || val === 'emerald') return 'emerald';
  if (val === 'orange' || val === 'warm-amber') return 'warm-amber';
  if (val === 'modern-dark' || val === 'dark') return 'modern-dark';
  if (val === 'deep-ocean' || val === 'ocean') return 'deep-ocean';
  if (val === 'royal-wine' || val === 'wine' || val === 'purple') return 'royal-wine';
  if (val === 'earth-forest' || val === 'forest') return 'earth-forest';
  if (val === 'slate-titanium' || val === 'slate') return 'slate-titanium';
  return 'classic-blue';
};

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
      { concept: 'Ganho na Venda', term: 'Margem Operacional Bruta', explanation: 'Percentual retido sobre o faturamento após dedução do custo unitário de aquisição' },
      { concept: 'Prazo do Fornecedor', term: 'Lead Time de Ressuprimento', explanation: 'Tempo decorrido entre a emissão do pedido ao fornecedor e a disponibilização física' },
      { concept: 'Relatório Financeiro', term: 'Demonstrativo Consolidado (Entradas e Saídas)', explanation: 'Apuração formal de receitas faturadas, desembolsos de aquisição e resultado líquido' },
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
    name: 'Básico / Descomplicado',
    badge: 'Simples & Amigável',
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    tagline: 'A mesma informação completa, explicada com palavras do dia a dia',
    description: 'Explica a mesma informação da forma mais simples possível (ex.: "quando pedir mais", "quanto sobra de lucro"), para quem tem pouca ou nenhuma familiaridade com tecnologia ou termos de gestão — igualmente completo, nunca uma versão resumida.',
    examples: [
      { concept: 'Entidade do Catálogo', term: 'Item', explanation: 'Cada item vendido e cuidado na sua loja' },
      { concept: 'Alerta de Reposição', term: 'Quando Pedir Mais (Mínimo)', explanation: 'Quando a quantidade chegar aqui, já é hora de ligar pro fornecedor para não ficar na mão' },
      { concept: 'Capacidade Limite', term: 'Limite para Não Sobrar (Máximo)', explanation: 'O limite recomendado para não comprar além da conta e ficar com produto encalhado' },
      { concept: 'Ganho na Venda', term: 'Quanto Sobra de Lucro', explanation: 'A fatia do valor da venda que sobra limpa no seu bolso depois de pagar o custo' },
      { concept: 'Prazo do Fornecedor', term: 'Quantos Dias Demora pra Chegar', explanation: 'Quantos dias o pedido leva para bater na sua porta após ser feito' },
      { concept: 'Relatório Financeiro', term: 'Resumo do Dia (Dinheiro que entrou / Dinheiro que saiu)', explanation: 'Troca termos difíceis por frases diretas: dinheiro que entrou, dinheiro que saiu e o que sobrou no seu bolso' },
    ],
  },
];

// Unified, consistent dictionary per language mode
export const VOCABULARY: Record<LanguageMode, Record<string, string>> = {
  technical: {
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
    'pricing.margin': 'Margem Operacional Bruta',
    'pricing.markup': 'Fator Markup Aplicado',
    'pricing.grossRevenue': 'Receita Operacional Bruta',
    'pricing.cogs': 'Custo das Mercadorias Vendidas (CMV)',
    'pricing.grossProfit': 'Lucro Operacional Bruto',
    'pricing.netProfit': 'Lucro Líquido Real Apurado',
    'pricing.avgTicket': 'Ticket Médio por Atendimento',
    'pricing.totalPurchases': 'Desembolso em Aquisições do Mês',

    // Reports & Statements
    'reports.title': 'Demonstrativo e Relatórios Operacionais',
    'reports.summary': 'Demonstrativo Consolidado do Período',
    'reports.inflow': 'Receita Operacional Bruta (Entradas)',
    'reports.outflow': 'Desembolsos com Aquisições (Saídas)',
    'reports.balance': 'Resultado Operacional Líquido',
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
    'pricing.grossRevenue': 'Dinheiro que Entrou (Vendas)',
    'pricing.cogs': 'Gasto com o que Você Vendeu',
    'pricing.grossProfit': 'O que Sobrou das Vendas',
    'pricing.netProfit': 'Dinheiro Limpo no Seu Bolso',
    'pricing.avgTicket': 'Média Gasta por Cliente',
    'pricing.totalPurchases': 'Dinheiro que Saiu em Compras',

    // Reports & Statements (Simples / Descomplicado)
    'reports.title': 'Relatório Simples do Seu Comércio',
    'reports.summary': 'Resumo do Dia',
    'reports.inflow': 'Dinheiro que entrou',
    'reports.outflow': 'Dinheiro que saiu',
    'reports.balance': 'O que sobrou para você',
    'reports.pending': 'Vendido pra receber depois',

    // POS & Sales
    'pos.title': 'Registrar Venda (Caixa)',
    'pos.action': 'Concluir Venda',
    'pos.cart': 'Lista da Venda Atual',
    'pos.emptyCart': 'Nenhum item colocado na venda ainda',

    // Debt & Receivables
    'debt.title': 'Caderneta (Vendido pra Pagar Depois)',
    'debt.customer': 'Nome do Cliente',
    'debt.balance': 'Conta a Pagar',
    'debt.pay': 'Receber Dinheiro da Conta',

    // Nav
    'nav.stock': 'O Que Tem na Loja',
    'nav.purchases': 'Compras',
    'nav.pricing': 'Preços & Lucro',
    'nav.debt': 'Caderneta',
    'nav.pos': 'Registrar Venda',
  },
};

export interface PreferencesContextType {
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

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('app_lang') as Language) || 'pt';
  });

  const [languageMode, setLanguageModeState] = useState<LanguageMode>(() => {
    return (localStorage.getItem('app_lang_mode') as LanguageMode) || 'neutral';
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    return (localStorage.getItem('app_fontsize') as FontSize) || 'normal';
  });

  const [themePreset, setThemePresetState] = useState<ThemePreset>(() => {
    return (localStorage.getItem('app_theme_preset') as ThemePreset) || 'classic-blue';
  });

  const [darkMode, setDarkModeState] = useState<boolean>(() => {
    return localStorage.getItem('app_dark_mode') === 'true';
  });

  const [simpleViewMode, setSimpleViewModeState] = useState<boolean>(() => {
    const saved = localStorage.getItem('app_simple_view_mode');
    if (saved !== null) return saved === 'true';
    const currentMode = localStorage.getItem('app_lang_mode');
    return currentMode === 'basic';
  });

  const isBasicMode = languageMode === 'basic';

  // Apply Dark Mode class to <html> root
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('app_dark_mode', String(darkMode));
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
    const selected = THEME_STYLES.find(t => t.id === themePreset) || THEME_STYLES[0];
    const root = document.documentElement;
    root.style.setProperty('--color-primary', selected.primary);
    root.style.setProperty('--color-palette-1', selected.palette[0]);
    root.style.setProperty('--color-palette-2', selected.palette[1]);
    root.style.setProperty('--color-palette-3', selected.palette[2]);
    root.style.setProperty('--color-palette-4', selected.palette[3]);
    root.style.setProperty('--color-palette-5', selected.palette[4]);

    if (!darkMode) {
      root.style.setProperty('--color-background', selected.palette[0]);
      root.style.setProperty('--color-surface', selected.palette[1]);
      root.style.setProperty('--color-card', selected.palette[1]);
      root.style.setProperty('--color-border', selected.palette[2]);
      root.style.setProperty('--color-foreground', selected.palette[4]);
    } else {
      root.style.setProperty('--color-background', '#090D16');
      root.style.setProperty('--color-surface', '#0F172A');
      root.style.setProperty('--color-card', '#0F172A');
      root.style.setProperty('--color-border', '#1E3A8A');
      root.style.setProperty('--color-foreground', '#F8FAFC');
    }
  }, [themePreset, darkMode]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_lang', lang);
  };

  const setLanguageMode = (mode: LanguageMode) => {
    setLanguageModeState(mode);
    localStorage.setItem('app_lang_mode', mode);
    if (mode === 'basic') {
      setSimpleViewModeState(true);
      localStorage.setItem('app_simple_view_mode', 'true');
    }
  };

  const setSimpleViewMode = (simple: boolean) => {
    setSimpleViewModeState(simple);
    localStorage.setItem('app_simple_view_mode', String(simple));
  };

  const toggleSimpleViewMode = () => {
    setSimpleViewModeState(prev => {
      const next = !prev;
      localStorage.setItem('app_simple_view_mode', String(next));
      return next;
    });
  };

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem('app_fontsize', size);
  };

  const setThemePreset = (preset: ThemePreset) => {
    setThemePresetState(preset);
    localStorage.setItem('app_theme_preset', preset);
  };

  const setDarkMode = (enabled: boolean) => {
    setDarkModeState(enabled);
    localStorage.setItem('app_dark_mode', String(enabled));
  };

  const t = (key: string): string => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS.pt[key] || key;
  };

  // Vocabulary translation according to the active language mode
  const v = (key: string, fallback?: string): string => {
    return VOCABULARY[languageMode]?.[key] || fallback || key;
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
    <PreferencesContext.Provider
      value={{
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
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}

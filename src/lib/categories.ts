export interface BusinessSector {
  id: string;
  name: string;
  tagline: string;
  description: string;
  iconName: 'store' | 'wrench' | 'utensils' | 'shopping-bag' | 'sparkles';
  suggestedCategories: string[];
  suggestProductsPreload?: boolean;
}

export const BUSINESS_SECTORS: BusinessSector[] = [
  {
    id: 'mercearia',
    name: 'Comércio de Venda / Mercearia',
    tagline: 'Mercearia, Minimercado, Conveniência, Tabacaria ou Banca',
    description: 'Ideal para venda de produtos físicos, bebidas, doces, cigarros e itens de prateleira.',
    iconName: 'store',
    suggestProductsPreload: true,
    suggestedCategories: [
      'Bebidas',
      'Cigarros',
      'Doces e Confeitos',
      'Isqueiros e Fósforos',
      'Sedas',
      'Fumo',
      'Comidas',
      'Produtos de Limpeza',
      'Higiene Pessoal',
      'Diversos'
    ]
  },
  {
    id: 'servicos',
    name: 'Prestação de Serviços',
    tagline: 'Salão de Beleza, Barbearia, Estética, Reparos, Costura',
    description: 'Ideal para controle de serviços prestados, agendamentos, mão de obra e venda de cosméticos.',
    iconName: 'wrench',
    suggestProductsPreload: false,
    suggestedCategories: [
      'Cortes & Cabelo',
      'Barba & Cuidados',
      'Manicure & Pedicure',
      'Mão de Obra / Reparos',
      'Peças & Acessórios',
      'Produtos para Venda',
      'Diversos'
    ]
  },
  {
    id: 'bar_lanchonete',
    name: 'Bar, Lanchonete ou Restaurante',
    tagline: 'Bares, Cafeterias, Pastelarias, Espetinhos, Lanchonetes',
    description: 'Ideal para consumação no local, lanches, porções, doses e bebidas geladas.',
    iconName: 'utensils',
    suggestProductsPreload: false,
    suggestedCategories: [
      'Bebidas Geladas',
      'Cervejas & Doses',
      'Lanches & Salgados',
      'Porções & Petiscos',
      'Sobremesas & Doces',
      'Diversos'
    ]
  },
  {
    id: 'varejo_geral',
    name: 'Loja de Variedades / Varejo',
    tagline: 'Bazar, Papelaria, Armarinho, Vestuário, Presentes',
    description: 'Ideal para lojas de roupas, brinquedos, utensílios domésticos e artigos diversos.',
    iconName: 'shopping-bag',
    suggestProductsPreload: false,
    suggestedCategories: [
      'Acessórios & Utilidades',
      'Eletrônicos & Cabos',
      'Papelaria & Escritório',
      'Vestuário & Calçados',
      'Presentes & Decoração',
      'Diversos'
    ]
  },
  {
    id: 'outro',
    name: 'Outro Setor de Atuação',
    tagline: 'Modelo Personalizado para Outras Áreas',
    description: 'Configure suas categorias sob medida para qualquer outro segmento de negócio.',
    iconName: 'sparkles',
    suggestProductsPreload: false,
    suggestedCategories: [
      'Produtos Principais',
      'Serviços Prestados',
      'Materiais & Insumos',
      'Diversos'
    ]
  }
];

export const DEFAULT_CATEGORIES: string[] = [
  'Diversos',
  'Doces e Confeitos',
  'Produtos de Limpeza',
  'Higiene Pessoal',
  'Comidas',
  'Fumo',
  'Isqueiros e Fósforos',
  'Sedas',
  'Cigarros',
  'Bebidas'
];

const STORAGE_KEY = 'eu_gerencio_custom_categories';
const SECTOR_STORAGE_KEY = 'eu_gerencio_business_sector';

export function getSavedBusinessSector(): string {
  try {
    return localStorage.getItem(SECTOR_STORAGE_KEY) || 'mercearia';
  } catch (e) {
    return 'mercearia';
  }
}

export function saveBusinessSector(sectorId: string): void {
  try {
    localStorage.setItem(SECTOR_STORAGE_KEY, sectorId);
  } catch (e) {
    console.warn('Could not save business sector to localStorage', e);
  }
}

export function getCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function setCustomCategories(categories: string[]): string[] {
  const clean = Array.from(new Set(categories.map(c => c.trim()).filter(Boolean)));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (e) {
    console.warn('Could not set custom categories to localStorage', e);
  }
  return clean;
}

export function saveCustomCategory(categoryName: string): string[] {
  const trimmed = categoryName.trim();
  if (!trimmed) return getAllCategories();

  const current = getCustomCategories();
  if (!current.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
    const updated = [...current, trimmed];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save category to localStorage', e);
    }
  }
  return getAllCategories();
}

export function removeCustomCategory(categoryName: string): string[] {
  const trimmed = categoryName.trim().toLowerCase();
  const current = getCustomCategories();
  const updated = current.filter(c => c.toLowerCase() !== trimmed);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Could not remove category from localStorage', e);
  }
  return updated;
}

export function getAllCategories(productCategories: string[] = []): string[] {
  const custom = getCustomCategories();
  const set = new Set<string>();

  // If custom categories are explicitly set, prioritize them
  if (custom.length > 0) {
    custom.forEach(c => set.add(c));
  } else {
    // Fallback to default
    DEFAULT_CATEGORIES.forEach(c => set.add(c));
  }

  // Always keep categories that already exist in products
  productCategories.forEach(c => {
    if (c && c.trim()) set.add(c.trim());
  });

  if (!set.has('Diversos')) {
    set.add('Diversos');
  }

  return Array.from(set);
}

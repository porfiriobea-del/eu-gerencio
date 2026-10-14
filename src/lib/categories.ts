import { showActionError } from './actionFeedback';
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

// Hydrated from the logged store. Only transient UI state is kept in memory.
let cloudOwnerId: string | undefined;
let customCategories: string[] = [];
let businessSector = 'mercearia';
export function hydrateCloudCategories(ownerId: string | undefined, categories: string[], sector: string) {
  cloudOwnerId = ownerId;
  customCategories = Array.from(new Set(categories.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())));
  businessSector = sector;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('cloud-categories'));
}
function persist(values: Record<string, unknown>, rollback: () => void = () => {}) {
  if (!cloudOwnerId) return;
  const ownerId = cloudOwnerId;
  void import('./cloudStore').then(({ db, doc, updateDoc }) => updateDoc(doc(db, 'settings', ownerId), values))
    .catch(error => { rollback(); showActionError(error, 'Não foi possível salvar as categorias da loja. Tente novamente.'); if (typeof window !== 'undefined') window.dispatchEvent(new Event('cloud-categories')); });
}
export function getSavedBusinessSector(): string { return businessSector; }
export function saveBusinessSector(sectorId: string) { const previous = businessSector; businessSector = sectorId; persist({ businessSector: sectorId }, () => { businessSector = previous; }); }
export function getCustomCategories(): string[] { return [...customCategories]; }
export function setCustomCategories(categories: string[]): string[] {
  const previous = customCategories;
  customCategories = Array.from(new Set(categories.map(value => value.trim()).filter(Boolean)));
  persist({ customCategories }, () => { customCategories = previous; });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('cloud-categories'));
  return [...customCategories];
}
export function saveCustomCategory(name: string): string[] {
  if (name.trim() && !customCategories.some(value => value.toLowerCase() === name.trim().toLowerCase())) setCustomCategories([...customCategories, name.trim()]);
  return getAllCategories();
}
export function removeCustomCategory(name: string): string[] { return setCustomCategories(customCategories.filter(value => value.toLowerCase() !== name.trim().toLowerCase())); }
export function getAllCategories(productCategories: string[] = []): string[] {
  return Array.from(new Set([...(customCategories.length ? customCategories : DEFAULT_CATEGORIES), ...productCategories.filter(Boolean), 'Diversos']));
}

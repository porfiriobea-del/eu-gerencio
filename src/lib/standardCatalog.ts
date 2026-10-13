import type { Product } from '../types';
import { PRELOADED_PRODUCTS } from './preloadedProducts';
import { normalizeCigaretteStock } from './productUnits';
import { normalizeProductName } from './duplicateDetector';

export type CatalogProduct = Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;

// Reference prices are editable; importing creates a catalogue, never fictitious stock.
const extraItems: [string, string, number, number][] = [
  ['Seda RAW Classic King Size Slim', 'Sedas', 3, 6],
  ['Seda RAW Organic Hemp King Size', 'Sedas', 4, 8],
  ['Seda RAW Black King Size Slim', 'Sedas', 4, 8],
  ['Seda OCB Premium King Size Slim', 'Sedas', 3, 6],
  ['Seda OCB Virgin King Size Slim', 'Sedas', 3, 6],
  ['Seda OCB Organic Hemp King Size', 'Sedas', 4, 8],
  ['Seda Smoking Brown King Size', 'Sedas', 3, 6],
  ['Seda Smoking Deluxe King Size', 'Sedas', 3, 6],
  ['Seda Smoking Blue King Size', 'Sedas', 3, 6],
  ['Seda Bem Bolado Brown King Size', 'Sedas', 2, 5],
  ['Seda Bem Bolado Original King Size', 'Sedas', 2, 5],
  ['Seda Zomo King Size', 'Sedas', 2, 5],
  ['Seda Lion Rolling Circus King Size', 'Sedas', 3, 6],
  ['Piteira RAW Tips Original', 'Acessórios de Tabacaria', 2, 5],
  ['Piteira OCB Premium', 'Acessórios de Tabacaria', 2, 5],
  ['Piteira Bem Bolado Longa', 'Acessórios de Tabacaria', 2, 5],
  ['Piteira Smoking Tips', 'Acessórios de Tabacaria', 2, 5],
  ['Filtro OCB Slim 6mm', 'Acessórios de Tabacaria', 4, 8],
  ['Filtro Smoking Slim 6mm', 'Acessórios de Tabacaria', 4, 8],
  ['Isqueiro BIC Maxi', 'Isqueiros', 3, 6],
  ['Isqueiro BIC Mini', 'Isqueiros', 2, 5],
  ['Isqueiro Clipper Recarregável', 'Isqueiros', 5, 10],
  ['Isqueiro Cricket', 'Isqueiros', 2, 5],
  ['Isqueiro Maçarico Portátil', 'Isqueiros', 10, 20],
  ['Fósforo Fiat Lux 40 palitos', 'Isqueiros', 1, 2],
  ['Refrigerante Coca-Cola Zero 350ml', 'Bebidas', 3, 5],
  ['Refrigerante Coca-Cola Zero 2L', 'Bebidas', 7, 11],
  ['Refrigerante Guaraná Antarctica Zero 350ml', 'Bebidas', 2.5, 5],
  ['Refrigerante Guaraná Antarctica Zero 2L', 'Bebidas', 6, 10],
  ['Refrigerante Pepsi Black 350ml', 'Bebidas', 2.5, 5],
  ['Refrigerante Pepsi 2L', 'Bebidas', 6, 10],
  ['Refrigerante Fanta Uva 350ml', 'Bebidas', 2.5, 5],
  ['Refrigerante Fanta Uva 2L', 'Bebidas', 6, 10],
  ['Refrigerante Sprite 350ml', 'Bebidas', 2.5, 5],
  ['Refrigerante Sprite 2L', 'Bebidas', 6, 10],
  ['Refrigerante Schweppes Citrus 350ml', 'Bebidas', 3, 6],
  ['Água Tônica Schweppes 350ml', 'Bebidas', 3, 6],
  ['Água Mineral Crystal Sem Gás 500ml', 'Bebidas', 1, 3],
  ['Água Mineral Crystal Com Gás 500ml', 'Bebidas', 1.5, 3.5],
  ['Água Mineral Bonafont 1,5L', 'Bebidas', 2, 4],
  ['Energético Monster Ultra 473ml', 'Bebidas', 6, 10],
  ['Energético Monster Mango Loco 473ml', 'Bebidas', 6, 10],
  ['Energético Red Bull Sugarfree 250ml', 'Bebidas', 6, 10],
  ['Energético TNT Original 473ml', 'Bebidas', 4, 7],
  ['Energético Baly Melancia 473ml', 'Bebidas', 4, 7],
  ['Cerveja Heineken Zero 330ml', 'Bebidas', 4, 7],
  ['Cerveja Budweiser 350ml', 'Bebidas', 3, 5],
  ['Cerveja Stella Artois 330ml', 'Bebidas', 4, 7],
  ['Cerveja Corona Extra 330ml', 'Bebidas', 5, 8],
  ['Cerveja Brahma Duplo Malte 350ml', 'Bebidas', 3, 5],
  ['Cerveja Original 350ml', 'Bebidas', 3, 5],
  ['Suco Del Valle Uva 1L', 'Bebidas', 5, 8],
  ['Suco Del Valle Pêssego 1L', 'Bebidas', 5, 8],
  ['Chá Leão Pêssego 450ml', 'Bebidas', 3, 5],
  ['Gatorade Limão 500ml', 'Bebidas', 4, 7],
  ['Gatorade Uva 500ml', 'Bebidas', 4, 7],
  ['Chocolate KitKat 41,5g', 'Doces & Balas', 2, 4],
  ['Chocolate Bis Ao Leite 100,8g', 'Doces & Balas', 4, 7],
  ['Chocolate Lacta Diamante Negro 80g', 'Doces & Balas', 4, 7],
  ['Chocolate Lacta Laka 80g', 'Doces & Balas', 4, 7],
  ['Chocolate Nestlé Alpino 85g', 'Doces & Balas', 4, 7],
  ['Bala Halls Menta 28g', 'Doces & Balas', 1, 2.5],
  ['Bala Halls Cereja 28g', 'Doces & Balas', 1, 2.5],
  ['Bala Halls Melancia 28g', 'Doces & Balas', 1, 2.5],
  ['Chiclete Trident Menta 8g', 'Doces & Balas', 1.5, 3],
  ['Chiclete Trident Morango 8g', 'Doces & Balas', 1.5, 3],
  ['Paçoca Paçoquita Rolha 15g', 'Doces & Balas', 0.5, 1],
  ['Biscoito Oreo Original 90g', 'Mercearia', 2, 4],
  ['Biscoito Passatempo Chocolate 130g', 'Mercearia', 2, 4],
  ['Biscoito Club Social Original 24g', 'Mercearia', 0.8, 2],
  ['Salgadinho Doritos Queijo Nacho 84g', 'Salgadinhos & Snacks', 4, 7],
  ['Batata Ruffles Original 68g', 'Salgadinhos & Snacks', 4, 7],
  ['Salgadinho Cheetos Requeijão 45g', 'Salgadinhos & Snacks', 2, 4],
  ['Amendoim Japonês Santa Helena 100g', 'Salgadinhos & Snacks', 2, 4],
  ['Macarrão Instantâneo Nissin Galinha 85g', 'Mercearia', 1.5, 3],
  ['Café Pilão Tradicional 250g', 'Mercearia', 8, 12],
  ['Açúcar União Refinado 1kg', 'Mercearia', 3, 5],
  ['Sal Cisne Refinado 1kg', 'Mercearia', 1.5, 3],
  ['Óleo de Soja Soya 900ml', 'Mercearia', 5, 8],
  ['Leite Integral Italac 1L', 'Mercearia', 4, 6]
];

export function getStandardCatalog(date = new Date().toISOString().slice(0, 10)): CatalogProduct[] {
  const extras: CatalogProduct[] = extraItems.map(([name, category, unitCost, basePrice]) => ({
    name, category, type: 'comum', stockUnit: 'unidade', purchaseForm: category === 'Bebidas' ? 'fardo' : 'unidade',
    unitsPerPackage: category === 'Bebidas' ? 12 : 1, unitCost, basePrice,
    stock: 0, initialStock: 0, initialStockDate: date, safetyStock: 2, maxStock: 24,
    dailyAverageSales: 0, replacementDays: 3
  }));
  const unique = new Map<string, CatalogProduct>();
  for (const original of [...PRELOADED_PRODUCTS, ...extras]) {
    const { suggestedQty, description, ...product } = original as typeof PRELOADED_PRODUCTS[number];
    const normalized = normalizeCigaretteStock({ ...product, stock: 0, initialStock: 0, initialStockDate: date });
    const clean = JSON.parse(JSON.stringify(normalized)) as CatalogProduct;
    unique.set(normalizeProductName(clean.name), clean);
  }
  return [...unique.values()];
}

export function selectMissingCatalog(catalog: CatalogProduct[], existing: Pick<Product, 'name'>[]) {
  const names = new Set(existing.map(product => normalizeProductName(product.name)));
  return catalog.filter(product => !names.has(normalizeProductName(product.name)));
}

export function catalogKey(name: string): string {
  return `standard_${normalizeProductName(name).replace(/ /g, '_')}`;
}

export function toSupabaseCatalogRows(products: CatalogProduct[], ownerId: string) {
  if (!ownerId) throw new Error('Entre na sua conta para importar o catálogo.');
  return products.map(product => ({
    catalog_owner_id: ownerId, catalog_key: catalogKey(product.name), catalog_data: product,
    nome: product.name, preco_venda: product.type === 'cigarro' ? product.priceCart : product.basePrice,
    preco_custo: product.unitCost, estoque_atual: 0
  }));
}

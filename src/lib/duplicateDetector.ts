import type { Product } from '../types';

/** Keep this stable: catalog document IDs also use this normalization. */
export function normalizeProductName(name: string): string {
  return (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}
function comparisonName(name: string) {
  const plain=normalizeProductName(name).replace(/\blong\s+neck\b/g,'longneck').replace(/\blong\b/g,'longneck').replace(/(\d)\s+(ml|kg|mg|cl|l|g)\b/g,'$1$2');
  const words=plain.split(' ').filter(w=>w && !(w==='neck' && plain.includes('longneck')));
  return {
    text:words.sort().join(''),
    numbers:(plain.match(/\d+/g) || []).sort().join('|'),
    formats:words.filter(w=>['latao','lata','longneck','garrafa','pet'].includes(w)).sort().join('|'),
    measures:(plain.match(/\d+\s*(?:ml|kg|mg|cl|l|g)\b/g) || []).map(s=>s.replace(/\s/g,'')).sort().join('|')
  };
}
export function productNameDistance(a: string,b: string): number {
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {
    const next=[i];
    for(let j=1;j<=b.length;j++) next[j]=Math.min(previous[j]+1,next[j-1]+1,previous[j-1]+Number(a[i-1]!==b[j-1]));
    previous=next;
  }
  return previous[b.length];
}
/** Suspicions only: no decision or write is made by the matcher. */
export function similarProductNames(a: string,b: string): boolean {
  const x=comparisonName(a),y=comparisonName(b);
  if (!x.text || !y.text || x.numbers!==y.numbers) return false;
  if (x.formats && y.formats && x.formats!==y.formats) return false;
  if (x.measures && y.measures && x.measures!==y.measures) return false;
  if (x.text===y.text) return true;
  if (Math.min(x.text.length,y.text.length)<3) return false;
  const max=Math.max(x.text.length,y.text.length);
  if (Math.abs(x.text.length-y.text.length)>Math.max(2,Math.ceil(max*0.15))) return false;
  const distance=productNameDistance(x.text,y.text);
  return distance<=2 || 1-distance/max>0.85;
}
export function normalizeBarcode(value?: string): string { return (value || '').replace(/\s+/g,'').trim(); }
export function isDuplicateProduct(candidate: Pick<Product,'name'|'barcode'>,product: Pick<Product,'name'|'barcode'>): boolean {
  const barcode=normalizeBarcode(candidate.barcode);
  return !!(barcode && barcode===normalizeBarcode(product.barcode)) || similarProductNames(candidate.name,product.name);
}
export function findDuplicateProducts(candidate: Pick<Product,'name'|'barcode'>,products: Product[],excludeId?: string): Product[] {
  return products.filter(p=>p.id!==excludeId && !p.mergedIntoId && isDuplicateProduct(candidate,p));
}
export function suspiciousProductPairs(products: Product[]): [Product,Product][] {
  const active=products.filter(p=>!p.mergedIntoId),pairs:[Product,Product][]=[];
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++)if(isDuplicateProduct(active[i],active[j]))pairs.push([active[i],active[j]]);
  return pairs;
}
export interface DuplicateAnalysis {
  duplicateIdSet:Set<string>;
  duplicateCountById:Map<string,number>;
  duplicateGroupKeyById:Map<string,string>;
  duplicateGroups:Map<string,Product[]>;
  totalDuplicates:number;
  uniqueDuplicateNamesCount:number;
}
export function analyzeDuplicates(products: Product[]): DuplicateAnalysis {
  const duplicateIdSet=new Set<string>(),duplicateCountById=new Map<string,number>(),duplicateGroupKeyById=new Map<string,string>(),duplicateGroups=new Map<string,Product[]>();
  suspiciousProductPairs(products).forEach((pair,index)=>{
    const key=`pair:${index}`;duplicateGroups.set(key,pair);
    for(const p of pair)if(p.id){duplicateIdSet.add(p.id);duplicateCountById.set(p.id,(duplicateCountById.get(p.id)||1)+1);duplicateGroupKeyById.set(p.id,key);}
  });
  return {duplicateIdSet,duplicateCountById,duplicateGroupKeyById,duplicateGroups,totalDuplicates:duplicateIdSet.size,uniqueDuplicateNamesCount:duplicateGroups.size};
}

/** Presentation order only: never alter the original stored names or input arrays. */
export function compareAlphabetical(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}
export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a,b)=>compareAlphabetical(a.name,b.name));
}
export function sortCategories(categories: readonly string[]): string[] {
  const isAll = (value:string)=>['Todas','Todas as categorias'].includes(value);
  return [...categories].sort((a,b)=>Number(isAll(b))-Number(isAll(a)) || compareAlphabetical(a,b));
}

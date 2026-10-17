export function categoryAppearance(category:string) {
 const normalized=category.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
 let hash=0;for(const char of normalized)hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;
 const palette=['bg-emerald-500/15 text-emerald-700 dark:text-emerald-300','bg-amber-500/15 text-amber-700 dark:text-amber-300','bg-violet-500/15 text-violet-700 dark:text-violet-300','bg-sky-500/15 text-sky-700 dark:text-sky-300','bg-rose-500/15 text-rose-700 dark:text-rose-300'];
 const icon=/bebida|cerveja|refrigerante/.test(normalized)?'drink':/cigarro|fumo|seda/.test(normalized)?'cigarette':/comida|doce|alimento/.test(normalized)?'food':'package';
 return {className:palette[hash%palette.length],icon};
}

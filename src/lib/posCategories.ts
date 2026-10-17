import type {Product} from '../types';
import {compareAlphabetical} from './alphabetical';
export interface PosCategory {name:string;count:number}
export function posCategories(products:readonly Pick<Product,'category'>[]):PosCategory[]{
 const counts=new Map<string,number>();
 for(const product of products)if(product.category?.trim())counts.set(product.category,(counts.get(product.category)||0)+1);
 return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>compareAlphabetical(a.name,b.name));
}

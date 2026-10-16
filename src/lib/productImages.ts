export const PRODUCT_IMAGE_MAX_BYTES = 30 * 1024;
export const PRODUCT_IMAGE_MAX_SIDE = 400;
export const PRODUCT_IMAGE_QUALITY = 0.7;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export function isEmbeddedProductImage(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\//i.test(value);
}

/** Fixed WebP quality; reduce dimensions further if a noisy photo still exceeds 30 KB. */
export async function compressProductImage(source: string): Promise<Blob> {
  if (!/^data:image\/(?:jpeg|jpg|png|webp|gif|avif);base64,[a-z0-9+/]+={0,2}$/i.test(source)) throw new Error('Escolha uma foto JPEG, PNG ou WebP válida.');
  if (source.length * 3 / 4 > MAX_INPUT_BYTES) throw new Error('Escolha uma foto de até 20 MB.');
  const image = await new Promise<HTMLImageElement>((resolve,reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a foto. Escolha outro arquivo.'));
    image.src = source;
  });
  if (!image.width || !image.height) throw new Error('A foto está vazia.');
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a foto.');
  let scale = Math.min(1, PRODUCT_IMAGE_MAX_SIDE / Math.max(image.width,image.height));
  for (let attempt=0;attempt<12;attempt++) {
    canvas.width = Math.max(1,Math.round(image.width*scale));
    canvas.height = Math.max(1,Math.round(image.height*scale));
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível comprimir a foto.')), 'image/webp', PRODUCT_IMAGE_QUALITY));
    if (blob.type !== 'image/webp') throw new Error('Este navegador não consegue salvar WebP. Atualize o navegador para enviar fotos.');
    if (blob.size > 0 && blob.size <= PRODUCT_IMAGE_MAX_BYTES) return blob;
    scale *= 0.8;
  }
  throw new Error('A foto ainda ultrapassa 30 KB. Recorte a imagem e tente novamente.');
}

/** Upload is completed before any database mutation; never fall back to saving Base64. */
export async function storeProductImage(imageUrl: string | undefined, ownerId: string): Promise<string | undefined> {
  if (!imageUrl) return imageUrl;
  if (!isEmbeddedProductImage(imageUrl)) {
    if (!/^https?:\/\//i.test(imageUrl)) throw new Error('Use uma foto ou um link válido de imagem.');
    return imageUrl;
  }
  const blob = await compressProductImage(imageUrl);
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const name = Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
  const path = `${ownerId}/${name}.webp`;
  const { supabase } = await import('./supabase');
  const bucket = supabase.storage.from('produtos');
  const { error } = await bucket.upload(path,blob,{contentType:'image/webp',cacheControl:'31536000',upsert:true});
  if (error) throw new Error('Não foi possível enviar a foto para a nuvem. Confira a conexão e a configuração do bucket produtos.');
  return bucket.getPublicUrl(path).data.publicUrl;
}


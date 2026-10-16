export type Language = 'pt-BR' | 'en' | 'es';
export function normalizeLanguage(value: unknown): Language {
  return value === 'en' || value === 'es' ? value : 'pt-BR';
}
export const languageLocales = {'pt-BR':'pt-BR',en:'en-US',es:'es-ES'} as const;
export function readDeviceLanguage(userId?: string): Language {
  try {
    if (!userId) return normalizeLanguage(localStorage.getItem('app_lang'));
    const scoped = localStorage.getItem('app_lang:'+userId);
    // Migrate the old device choice only once; never inherit another account's choice.
    return normalizeLanguage(scoped ?? (!localStorage.getItem('app_lang_user') ? localStorage.getItem('app_lang') : null));
  }
  catch { return 'pt-BR'; }
}
export function saveDeviceLanguage(language: Language, userId?: string) {
  try {
    localStorage.setItem('app_lang',language);
    if(userId){localStorage.setItem('app_lang:'+userId,language);localStorage.setItem('app_lang_user',userId);}
  } catch {}
}
export function formatDate(value: Date | string | number, language: Language, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleDateString(languageLocales[language],options);
}

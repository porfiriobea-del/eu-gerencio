export type ThemePreset = 'standard' | 'fun' | 'neon' | 'professional';

export interface ThemeStyle {
  id: ThemePreset;
  name: string;
  primary: string;
  darkPrimary: string;
  palette: [string, string, string, string, string];
  description: string;
}

export const THEME_STYLES: ThemeStyle[] = [
  {
    id: 'standard', name: 'Padrão / Comum',
    primary: '#374151', darkPrimary: '#E5E5E5',
    palette: ['#F8FAFC', '#FFFFFF', '#E4E4E7', '#374151', '#18181B'],
    description: 'Visual clean e neutro, com foco nos dados.'
  },
  {
    id: 'fun', name: 'Divertido',
    primary: '#BE185D', darkPrimary: '#F472B6',
    palette: ['#FFF7ED', '#FFFFFF', '#FBCFE8', '#BE185D', '#27272A'],
    description: 'Cores alegres, detalhes coloridos e formas arredondadas.'
  },
  {
    id: 'neon', name: 'Neon',
    primary: '#6D28D9', darkPrimary: '#B6FF00',
    palette: ['#FAF5FF', '#FFFFFF', '#A3E635', '#6D28D9', '#171717'],
    description: 'Acentos vibrantes e alto contraste; verde neon no modo escuro.'
  },
  {
    id: 'professional', name: 'Profissional',
    primary: '#1D4ED8', darkPrimary: '#60A5FA',
    palette: ['#F8FAFC', '#FFFFFF', '#DBEAFE', '#1D4ED8', '#0F172A'],
    description: 'Azul executivo e formas discretas para um visual sério.'
  }
];

export function normalizeThemePreset(value?: string | null): ThemePreset {
  if (THEME_STYLES.some(theme => theme.id === value)) return value as ThemePreset;
  if (['blue', 'classic-blue', 'deep-ocean', 'ocean'].includes(value || '')) return 'professional';
  if (['orange', 'warm-amber', 'royal-wine', 'wine', 'purple'].includes(value || '')) return 'fun';
  if (['modern-dark', 'dark'].includes(value || '')) return 'neon';
  return 'standard';
}

/** Resolve every color token together so switching modes cannot retain stale colors. */
export function getThemeTokens(preset: ThemePreset, dark: boolean): Record<string, string> {
  const selected = THEME_STYLES.find(theme => theme.id === preset) || THEME_STYLES[0];
  const palette = dark
    ? ['#202020', '#121212', '#333333', selected.darkPrimary, '#FAFAFA']
    : selected.palette;
  return {
    '--color-primary': dark ? selected.darkPrimary : selected.primary,
    '--color-primary-foreground': dark ? '#121212' : '#FFFFFF',
    '--color-background': dark ? '#121212' : selected.palette[0],
    '--color-surface': dark ? '#1E1E1E' : selected.palette[1],
    '--color-card': dark ? '#1E1E1E' : selected.palette[1],
    '--color-foreground': dark ? '#FAFAFA' : selected.palette[4],
    '--color-muted': dark ? '#262626' : '#F4F4F5',
    '--color-muted-foreground': dark ? '#BDBDBD' : '#52525B',
    '--color-border': dark ? '#404040' : selected.palette[2],
    ...Object.fromEntries(palette.map((color, index) => [`--color-palette-${index + 1}`, color]))
  };
}

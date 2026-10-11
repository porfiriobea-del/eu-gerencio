import { useState, useRef, useEffect } from 'react';
import { Palette, ChevronDown, Check, Sun, Moon, Sparkles, BookOpen, Layers } from 'lucide-react';
import { usePreferences, THEME_STYLES, ThemePreset, ThemeStyle } from '../lib/preferencesContext';

interface ThemeSelectorDropdownProps {
  onSaveTheme?: (themeId: ThemePreset) => void;
  onSaveDarkMode?: (darkMode: boolean) => void;
}

export function ThemeSelectorDropdown({ onSaveTheme, onSaveDarkMode }: ThemeSelectorDropdownProps) {
  const { themePreset, setThemePreset, darkMode, setDarkMode } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentTheme = THEME_STYLES.find(t => t.id === themePreset) || THEME_STYLES[0];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectTheme = (theme: ThemeStyle) => {
    setThemePreset(theme.id);
    if (onSaveTheme) {
      onSaveTheme(theme.id);
    }
    setIsOpen(false);
  };

  const handleToggleDark = (checked: boolean) => {
    setDarkMode(checked);
    if (onSaveDarkMode) {
      onSaveDarkMode(checked);
    }
  };

  return (
    <div id="theme-selector-dropdown-wrapper" className="space-y-4">
      {/* Informative Header / Visme Reference */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-palette-1 text-primary border border-primary/20">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Esquemas de Cores Profissionais
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Menu Suspenso
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Estilos harmonizados com base nas diretrizes de design e psicologia das cores (Referência Visme).
            </p>
          </div>
        </div>

        {/* Visme Guide Pill */}
        <a 
          href="https://visme.co/blog/pt-br/esquemas-de-cores/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 self-start sm:self-auto bg-palette-1 px-2.5 py-1 rounded-lg border border-primary/20"
          title="Ver artigo de referência sobre psicologia das cores e combinações Visme"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Guia de Cores Visme ↗</span>
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {/* Dropdown Menu Suspenso Selector */}
        <div className="md:col-span-2 relative" ref={dropdownRef}>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Selecione o Tema no Menu Suspenso:
          </label>

          {/* Trigger Button */}
          <button
            type="button"
            id="theme-dropdown-trigger"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full p-3.5 rounded-xl border border-border bg-surface hover:border-primary/50 text-left transition-all flex items-center justify-between shadow-2xs cursor-pointer group"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {/* Color swatch circle */}
              <div 
                className="w-7 h-7 rounded-lg shadow-2xs border border-black/10 shrink-0 flex items-center justify-center transition-transform group-hover:scale-105"
                style={{ backgroundColor: currentTheme.primary }}
              >
                <div className="w-2 h-2 rounded-full bg-white/80" />
              </div>

              <div className="truncate">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground truncate">
                    {currentTheme.name}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                    {currentTheme.category}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {currentTheme.vismeConcept} • {currentTheme.description}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              {/* Palette dots preview */}
              <div className="hidden sm:flex items-center gap-1">
                {currentTheme.palette.map((color, idx) => (
                  <span
                    key={idx}
                    className="w-3.5 h-3.5 rounded-md border border-black/10"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
            </div>
          </button>

          {/* Dropdown Menu Options */}
          {isOpen && (
            <div 
              id="theme-dropdown-menu"
              className="absolute left-0 right-0 top-full mt-2 bg-surface border border-border rounded-2xl shadow-xl z-50 overflow-hidden max-h-96 overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-150 p-2 space-y-1.5"
              role="listbox"
            >
              <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border/60 flex items-center justify-between">
                <span>8 Paletas Harmonizadas (Visme Color Schemas)</span>
                <span>Harmonia & Contraste</span>
              </div>

              {THEME_STYLES.map((theme) => {
                const isSelected = theme.id === themePreset;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleSelectTheme(theme)}
                    className={`w-full p-3 rounded-xl text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-palette-1 border border-primary/30 ring-1 ring-primary/20 text-foreground'
                        : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground border border-transparent'
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div 
                        className="w-6 h-6 rounded-lg shrink-0 shadow-2xs border border-black/10"
                        style={{ backgroundColor: theme.primary }}
                      />
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${isSelected ? 'text-foreground' : 'text-foreground/90'}`}>
                            {theme.name}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground">
                            {theme.category}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          <strong className="text-primary font-medium">{theme.vismeConcept}</strong> — {theme.description}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Swatches preview */}
                      <div className="flex items-center gap-1">
                        {theme.palette.map((color, idx) => (
                          <div
                            key={idx}
                            className="w-3.5 h-3.5 rounded-sm border border-black/10"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Modo Escuro / Claro Box */}
        <div className="p-3.5 rounded-xl border border-border bg-surface flex flex-col justify-between">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Modo Noturno (Pouca Luz)
          </label>

          <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl border border-border/80 bg-muted/40 hover:bg-muted/70 transition-colors select-none">
            <div className="flex items-center gap-2.5">
              {darkMode ? (
                <Moon className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <div>
                <span className="text-xs font-bold text-foreground block">
                  {darkMode ? 'Modo Escuro' : 'Modo Claro'}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {darkMode ? 'Proteção para os olhos' : 'Contraste diurno'}
                </span>
              </div>
            </div>

            <input
              type="checkbox"
              checked={darkMode}
              onChange={(e) => handleToggleDark(e.target.checked)}
              className="w-5 h-5 accent-primary rounded cursor-pointer transition-transform active:scale-95"
            />
          </label>
        </div>
      </div>

      {/* Visual Live Preview of Active Theme */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border/80">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-foreground">
              Amostra em Tempo Real: {currentTheme.name}
            </span>
            <span className="text-[10px] text-primary font-semibold px-2 py-0.5 rounded-full bg-palette-1 border border-primary/20">
              {currentTheme.vismeConcept}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Todas as telas se adaptam instantaneamente
          </span>
        </div>

        {/* Component Demos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-surface border border-border shadow-2xs space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Botão de Ação</span>
            <button
              type="button"
              className="w-full py-1.5 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-2xs hover:opacity-90"
            >
              Exemplo de Botão Principal
            </button>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-border shadow-2xs space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Badge & Destaque</span>
            <div className="py-1.5 px-3 bg-palette-1 text-primary text-xs font-bold rounded-lg border border-primary/20 text-center">
              R$ 1.450,00 Líquido
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-border shadow-2xs space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Paleta de 5 Tons</span>
            <div className="flex items-center gap-1.5 py-1">
              {currentTheme.palette.map((color, i) => (
                <div
                  key={i}
                  className="flex-1 h-6 rounded-md border border-black/10 shadow-2xs"
                  style={{ backgroundColor: color }}
                  title={`Tom ${i + 1}: ${color}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

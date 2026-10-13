import { Palette, Moon, Sun } from 'lucide-react';
import { usePreferences, THEME_STYLES, type ThemePreset } from '../lib/preferencesContext';

interface ThemeSelectorDropdownProps {
  onSaveTheme?: (themeId: ThemePreset) => void;
  onSaveDarkMode?: (darkMode: boolean) => void;
}

export function ThemeSelectorDropdown({ onSaveTheme, onSaveDarkMode }: ThemeSelectorDropdownProps) {
  const { themePreset, setThemePreset, darkMode, setDarkMode } = usePreferences();

  return (
    <div id="theme-selector-dropdown-wrapper" className="space-y-4">
      <fieldset>
        <legend className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
          <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
          Temas de Interface
        </legend>
        <p className="mb-4 text-xs text-muted-foreground">Escolha seu estilo. O tema e o modo escuro são salvos automaticamente.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEME_STYLES.map(theme => (
            <label
              key={theme.id}
              className={`cursor-pointer rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary ${themePreset === theme.id ? 'border-primary bg-palette-1' : 'border-border bg-surface hover:bg-muted'}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-foreground">{theme.name}</span>
                <input
                  type="radio"
                  name="interface-theme"
                  value={theme.id}
                  checked={themePreset === theme.id}
                  onChange={() => {
                    setThemePreset(theme.id);
                    onSaveTheme?.(theme.id);
                  }}
                  className="h-4 w-4 accent-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground">{theme.description}</p>
              <div className="mt-3 flex gap-1.5" aria-hidden="true">
                {theme.palette.map((color, index) => (
                  <span key={index} className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: index === 3 && darkMode ? theme.darkPrimary : color }} />
                ))}
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <span className="flex items-center gap-3">
          {darkMode ? <Moon className="h-5 w-5 text-primary" aria-hidden="true" /> : <Sun className="h-5 w-5 text-primary" aria-hidden="true" />}
          <span>
            <span className="block text-sm font-bold text-foreground">Modo Escuro</span>
            <span className="block text-xs text-muted-foreground">Fundo preto/cinza neutro em qualquer tema.</span>
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={darkMode}
          onChange={event => {
            setDarkMode(event.target.checked);
            onSaveDarkMode?.(event.target.checked);
          }}
          className="h-5 w-5 accent-primary"
        />
      </label>
    </div>
  );
}

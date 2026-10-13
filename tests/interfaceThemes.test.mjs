import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_STYLES, normalizeThemePreset, getThemeTokens } from '../src/lib/interfaceThemes.ts';

function luminance(hex) {
  const components = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = components.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('saved legacy preferences resolve to an available new theme', () => {
  assert.equal(THEME_STYLES.length, 4);
  for (const legacy of ['classic-blue', 'blue', 'emerald', 'warm-amber', 'modern-dark', 'deep-ocean', 'royal-wine', 'earth-forest', 'slate-titanium', 'unknown']) {
    assert.ok(THEME_STYLES.some(theme => theme.id === normalizeThemePreset(legacy)));
  }
  for (const theme of THEME_STYLES) assert.equal(normalizeThemePreset(theme.id), theme.id);
  assert.equal(normalizeThemePreset(), 'standard');
});

test('every dark theme uses a neutral foundation and readable action/text contrast', () => {
  for (const theme of THEME_STYLES) {
    const tokens = getThemeTokens(theme.id, true);
    assert.equal(tokens['--color-background'], '#121212');
    assert.equal(tokens['--color-surface'], '#1E1E1E');
    assert.ok(contrast(tokens['--color-primary'], tokens['--color-primary-foreground']) >= 4.5, theme.id);
    assert.ok(contrast(tokens['--color-foreground'], tokens['--color-background']) >= 4.5);
  }
});

test('returning to light mode restores all tokens with readable contrast', () => {
  for (const theme of THEME_STYLES) {
    const light = getThemeTokens(theme.id, false);
    const dark = getThemeTokens(theme.id, true);
    assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort());
    const applied = { ...light, ...dark, ...getThemeTokens(theme.id, false) };
    assert.deepEqual(applied, light);
    assert.ok(contrast(light['--color-primary'], light['--color-primary-foreground']) >= 4.5, theme.id);
    assert.ok(contrast(light['--color-foreground'], light['--color-background']) >= 4.5);
  }
});

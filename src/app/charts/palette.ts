/**
 * Categorical chart colours. A validated colour-blind-safe order (adjacent
 * pairs pass CVD and normal-vision separation), stepped separately for the
 * light (#ffffff) and dark (#0b1a2e) card surfaces. Use slots in this fixed
 * order and keep each entity on its slot; never cycle or generate extra hues.
 * Three light slots are below 3:1 contrast, so every chart also shows a
 * labelled legend with values (and its details page lists the items).
 */
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#008300'];
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#008300'];

export function seriesColors(dark: boolean): readonly string[] {
  return dark ? DARK : LIGHT;
}

/** Text and surface tokens read from the active theme, so chart text never wears a series colour. */
export function chartTokens(): { text: string; muted: string; surface: string; border: string } {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    text: v('--ion-text-color', '#0f172a'),
    muted: v('--ap-text-muted', '#475569'),
    surface: v('--ap-surface', '#ffffff'),
    border: v('--ap-border', '#e2e8f0'),
  };
}

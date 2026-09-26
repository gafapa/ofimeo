// Univer theme from the suite's tokens: the primary scale comes from the app
// color (or the accent in high contrast) and, in the dark and high-contrast
// themes, the gray scale from our surfaces, borders and text, so Univer's
// toolbar, footer, panels and grid follow data-a11y-theme on <html>.

import { defaultTheme, type FUniver, type Theme } from '@univerjs/presets'

type Rgb = [number, number, number]

const parse = (color: string): Rgb | null => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
  }
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color)
  return rgb ? ([1, 2, 3].map((i) => Math.round(Number(rgb[i]))) as Rgb) : null
}
const hex = (c: Rgb) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb
const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

export type ThemeMode = 'light' | 'dark' | 'contrast-dark' | 'contrast-light'

export const themeMode = (): ThemeMode => {
  const v = document.documentElement.getAttribute('data-a11y-theme')
  return v === 'dark' || v === 'contrast-dark' || v === 'contrast-light' ? v : 'light'
}

export const isDarkMode = (mode = themeMode()) => mode === 'dark' || mode === 'contrast-dark'

// A 50…900 scale with the given color at 600 (Univer's main shade).
function scale(base: Rgb): Theme['primary'] {
  return {
    50: hex(mix(base, WHITE, 0.92)),
    100: hex(mix(base, WHITE, 0.84)),
    200: hex(mix(base, WHITE, 0.68)),
    300: hex(mix(base, WHITE, 0.5)),
    400: hex(mix(base, WHITE, 0.3)),
    500: hex(mix(base, WHITE, 0.14)),
    600: hex(base),
    700: hex(mix(base, BLACK, 0.14)),
    800: hex(mix(base, BLACK, 0.28)),
    900: hex(mix(base, BLACK, 0.42)),
  }
}

export function buildTheme(host: HTMLElement): Theme {
  const css = getComputedStyle(host)
  const token = (name: string, fallback: string): Rgb => parse(css.getPropertyValue(name)) ?? parse(fallback)!
  const mode = themeMode()
  const contrast = mode === 'contrast-dark' || mode === 'contrast-light'
  const primary = scale(token(contrast ? '--accent' : '--app-color', '#188038'))
  let gray: Theme['gray'] = defaultTheme.gray
  if (mode === 'dark') {
    const surface = token('--surface', '#2b2c30')
    const alt = token('--surface-alt', '#303134')
    const hover = token('--hover', '#3a3c41')
    const border = token('--border', '#53575d')
    const muted = token('--muted', '#b4b8bd')
    const text = token('--text', '#e8eaed')
    // Univer's dark variants read the high end of the scale for surfaces and the low end for text.
    gray = {
      0: hex(text), 50: hex(mix(text, muted, 0.5)), 100: hex(muted), 200: hex(mix(muted, border, 0.5)),
      300: hex(mix(muted, border, 0.7)), 400: hex(border), 500: hex(mix(border, hover, 0.5)),
      600: hex(hover), 700: hex(alt), 800: hex(surface), 900: hex(mix(surface, BLACK, 0.12)), 1000: '#000000',
    }
  } else if (mode === 'contrast-dark') {
    gray = { 0: '#ffffff', 50: '#ffffff', 100: '#e6e6e6', 200: '#ffffff', 300: '#ffffff', 400: '#ffffff', 500: '#ffffff', 600: '#333333', 700: '#000000', 800: '#000000', 900: '#000000', 1000: '#000000' }
  } else if (mode === 'contrast-light') {
    gray = { 0: '#ffffff', 50: '#ffffff', 100: '#e0e0e0', 200: '#e0e0e0', 300: '#000000', 400: '#000000', 500: '#1f1f1f', 600: '#000000', 700: '#000000', 800: '#000000', 900: '#000000', 1000: '#000000' }
  }
  return { ...defaultTheme, primary, gray }
}

// Text colors of the themes applied so far (Univer's gray 900). Univer's cell
// editor gives typed text this color; it is the interface's, not the cell's.
const themeTextColors = new Set<string>(['#1b1c1f'])
export const isInterfaceTextColor = (rgb: unknown) => typeof rgb === 'string' && themeTextColors.has(rgb.trim().toLowerCase())

// Applies the theme now and whenever the accessibility theme changes.
export function followTheme(univerAPI: FUniver, host: HTMLElement, onChange?: () => void): void {
  const apply = () => {
    try {
      const theme = buildTheme(host)
      themeTextColors.add(String(theme.gray[900]).toLowerCase())
      univerAPI.setTheme(theme)
      univerAPI.toggleDarkMode(isDarkMode())
    } catch (err) {
      console.warn('Could not apply the Univer theme', err)
    }
    onChange?.()
  }
  apply()
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-a11y-theme'] })
}

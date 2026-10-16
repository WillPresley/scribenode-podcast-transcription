import { ThemeMode } from '../types';

export type { ThemeMode };

export const THEME_STORAGE_KEY = 'scribenode_theme';
export const THEME_CHANGE_EVENT = 'scribenode-theme-change';

export const LIGHT_THEME_COLOR = '#f8fafc';
export const DARK_THEME_COLOR = '#020617';

/**
 * Retrieves the stored theme preference from localStorage.
 * Defaults to 'system' if unspecified or running in a non-browser environment.
 */
export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'system';
  }
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch (err) {
    console.warn('[Theme] Failed to read from localStorage:', err);
  }
  return 'system';
}

/**
 * Persists the user's theme preference and applies the theme to the DOM.
 */
export function setStoredTheme(mode: ThemeMode): void {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (err) {
      console.warn('[Theme] Failed to persist theme to localStorage:', err);
    }
  }
  applyTheme(mode);
}

/**
 * Inspects system prefers-color-scheme to determine OS-level preference.
 */
export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Resolves whether the effective visual appearance should be light or dark.
 */
export function resolveEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
}

/**
 * Applies the given theme mode by toggling the `.dark` class on the <html> element,
 * updating the mobile viewport theme-color meta tag, and broadcasting a theme change event.
 */
export function applyTheme(mode: ThemeMode): 'light' | 'dark' {
  const effective = resolveEffectiveTheme(mode);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (effective === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Synchronize <meta name="theme-color"> for mobile browser frames and PWA shell
    let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', effective === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      const event = new CustomEvent(THEME_CHANGE_EVENT, {
        detail: { mode, effective }
      });
      window.dispatchEvent(event);
    } catch {
      // Ignore event dispatch errors in restricted or older runtimes
    }
  }

  return effective;
}

/**
 * Watches system theme changes and triggers a callback when in 'system' mode.
 * Returns an unsubscription function.
 */
export function watchSystemTheme(onChange: (effective: 'light' | 'dark') => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (event: MediaQueryListEvent | MediaQueryList) => {
    const effective = event.matches ? 'dark' : 'light';
    onChange(effective);
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
  } else if ('addListener' in mediaQuery && typeof (mediaQuery as any).addListener === 'function') {
    (mediaQuery as any).addListener(listener);
    return () => {
      (mediaQuery as any).removeListener(listener);
    };
  }

  return () => {};
}

/**
 * Initializes the theme on application bootstrap.
 */
export function initTheme(): ThemeMode {
  const mode = getStoredTheme();
  applyTheme(mode);
  return mode;
}

export default {
  getStoredTheme,
  setStoredTheme,
  getSystemTheme,
  resolveEffectiveTheme,
  applyTheme,
  watchSystemTheme,
  initTheme
};

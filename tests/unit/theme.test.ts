import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getStoredTheme,
  setStoredTheme,
  getSystemTheme,
  resolveEffectiveTheme,
  applyTheme,
  watchSystemTheme,
  initTheme,
  THEME_STORAGE_KEY,
  THEME_CHANGE_EVENT,
  LIGHT_THEME_COLOR,
  DARK_THEME_COLOR,
  type ThemeMode
} from '../../src/utils/theme';

describe('Theme Utility (Light / Dark / System)', () => {
  let mockStorage: Record<string, string>;
  let classListSet: Set<string>;
  let metaTags: Map<string, string>;
  let dispatchedEvents: CustomEvent[];
  let matchMediaListeners: Array<(e: { matches: boolean }) => void>;
  let systemPrefersDark: boolean;

  beforeEach(() => {
    mockStorage = {};
    classListSet = new Set<string>();
    metaTags = new Map<string, string>();
    dispatchedEvents = [];
    matchMediaListeners = [];
    systemPrefersDark = false;

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      })
    };

    // Mock document & documentElement
    const documentMock = {
      documentElement: {
        classList: {
          add: vi.fn((cls: string) => classListSet.add(cls)),
          remove: vi.fn((cls: string) => classListSet.delete(cls)),
          contains: vi.fn((cls: string) => classListSet.has(cls)),
          toggle: vi.fn((cls: string, force?: boolean) => {
            const has = force !== undefined ? force : !classListSet.has(cls);
            if (has) classListSet.add(cls);
            else classListSet.delete(cls);
            return has;
          })
        }
      },
      querySelector: vi.fn((selector: string) => {
        if (selector === 'meta[name="theme-color"]') {
          if (!metaTags.has('theme-color')) return null;
          return {
            setAttribute: (name: string, value: string) => {
              if (name === 'content') metaTags.set('theme-color', value);
            },
            getAttribute: (name: string) => metaTags.get(name) || null
          };
        }
        return null;
      }),
      createElement: vi.fn((tag: string) => {
        let contentVal = '';
        const el = {
          setAttribute: (name: string, value: string) => {
            if (name === 'content') {
              contentVal = value;
              metaTags.set('theme-color', value);
            }
          },
          getAttribute: (name: string) => contentVal
        };
        return el;
      }),
      head: {
        appendChild: vi.fn((el: any) => {
          metaTags.set('theme-color', el.getAttribute('content') || '');
        })
      }
    };

    // Mock matchMedia
    const matchMediaMock = vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? systemPrefersDark : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'change') matchMediaListeners.push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'change') {
          const idx = matchMediaListeners.indexOf(handler);
          if (idx !== -1) matchMediaListeners.splice(idx, 1);
        }
      }),
      addListener: vi.fn((handler: any) => matchMediaListeners.push(handler)),
      removeListener: vi.fn((handler: any) => {
        const idx = matchMediaListeners.indexOf(handler);
        if (idx !== -1) matchMediaListeners.splice(idx, 1);
      })
    }));

    // Mock window
    const windowMock = {
      localStorage: localStorageMock,
      matchMedia: matchMediaMock,
      dispatchEvent: vi.fn((event: CustomEvent) => {
        dispatchedEvents.push(event);
        return true;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('document', documentMock);
    vi.stubGlobal('window', windowMock);
    vi.stubGlobal('CustomEvent', class MockCustomEvent {
      type: string;
      detail: any;
      constructor(type: string, params?: { detail?: any }) {
        this.type = type;
        this.detail = params?.detail;
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('getStoredTheme', () => {
    it('defaults to "system" when nothing is stored', () => {
      expect(getStoredTheme()).toBe('system');
    });

    it('returns valid stored theme modes', () => {
      mockStorage[THEME_STORAGE_KEY] = 'light';
      expect(getStoredTheme()).toBe('light');

      mockStorage[THEME_STORAGE_KEY] = 'dark';
      expect(getStoredTheme()).toBe('dark');

      mockStorage[THEME_STORAGE_KEY] = 'system';
      expect(getStoredTheme()).toBe('system');
    });

    it('falls back to "system" when invalid value is in localStorage', () => {
      mockStorage[THEME_STORAGE_KEY] = 'neon-green';
      expect(getStoredTheme()).toBe('system');
    });
  });

  describe('setStoredTheme', () => {
    it('saves mode to localStorage and applies the theme', () => {
      setStoredTheme('dark');
      expect(mockStorage[THEME_STORAGE_KEY]).toBe('dark');
      expect(classListSet.has('dark')).toBe(true);

      setStoredTheme('light');
      expect(mockStorage[THEME_STORAGE_KEY]).toBe('light');
      expect(classListSet.has('dark')).toBe(false);
    });
  });

  describe('getSystemTheme & resolveEffectiveTheme', () => {
    it('detects light system theme when matchMedia dark matches is false', () => {
      systemPrefersDark = false;
      expect(getSystemTheme()).toBe('light');
      expect(resolveEffectiveTheme('system')).toBe('light');
    });

    it('detects dark system theme when matchMedia dark matches is true', () => {
      systemPrefersDark = true;
      expect(getSystemTheme()).toBe('dark');
      expect(resolveEffectiveTheme('system')).toBe('dark');
    });

    it('returns explicit mode directly regardless of system theme', () => {
      systemPrefersDark = true;
      expect(resolveEffectiveTheme('light')).toBe('light');

      systemPrefersDark = false;
      expect(resolveEffectiveTheme('dark')).toBe('dark');
    });
  });

  describe('applyTheme', () => {
    it('applies dark theme and updates meta theme-color', () => {
      const effective = applyTheme('dark');
      expect(effective).toBe('dark');
      expect(classListSet.has('dark')).toBe(true);
      expect(metaTags.get('theme-color')).toBe(DARK_THEME_COLOR);
      expect(dispatchedEvents.length).toBe(1);
      expect(dispatchedEvents[0].type).toBe(THEME_CHANGE_EVENT);
      expect(dispatchedEvents[0].detail).toEqual({ mode: 'dark', effective: 'dark' });
    });

    it('applies light theme and updates meta theme-color', () => {
      classListSet.add('dark');
      metaTags.set('theme-color', DARK_THEME_COLOR);

      const effective = applyTheme('light');
      expect(effective).toBe('light');
      expect(classListSet.has('dark')).toBe(false);
      expect(metaTags.get('theme-color')).toBe(LIGHT_THEME_COLOR);
      expect(dispatchedEvents.length).toBe(1);
      expect(dispatchedEvents[0].detail).toEqual({ mode: 'light', effective: 'light' });
    });

    it('resolves system mode dynamically based on matchMedia', () => {
      systemPrefersDark = true;
      const effective = applyTheme('system');
      expect(effective).toBe('dark');
      expect(classListSet.has('dark')).toBe(true);
      expect(dispatchedEvents[0].detail).toEqual({ mode: 'system', effective: 'dark' });
    });
  });

  describe('watchSystemTheme', () => {
    it('subscribes to media query changes and unregisters cleanly', () => {
      const listener = vi.fn();
      const unsubscribe = watchSystemTheme(listener);

      expect(matchMediaListeners.length).toBe(1);

      // Simulate OS switching to dark
      matchMediaListeners[0]({ matches: true });
      expect(listener).toHaveBeenCalledWith('dark');

      // Simulate OS switching to light
      matchMediaListeners[0]({ matches: false });
      expect(listener).toHaveBeenCalledWith('light');

      // Unsubscribe
      unsubscribe();
      expect(matchMediaListeners.length).toBe(0);
    });
  });

  describe('initTheme', () => {
    it('reads stored preference and applies it', () => {
      mockStorage[THEME_STORAGE_KEY] = 'dark';
      const mode = initTheme();
      expect(mode).toBe('dark');
      expect(classListSet.has('dark')).toBe(true);
    });
  });
});

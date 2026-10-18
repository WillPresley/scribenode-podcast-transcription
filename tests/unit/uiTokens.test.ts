import { describe, it, expect } from 'vitest';
import { HEADER_CONTROL_TOKENS } from '../../src/utils/uiTokens';

describe('UI Consistency Tokens (HEADER_CONTROL_TOKENS)', () => {
  it('enforces a uniform height across header controls', () => {
    expect(HEADER_CONTROL_TOKENS.height).toBe('h-8');
  });

  it('enforces a uniform shadow elevation across header controls', () => {
    expect(HEADER_CONTROL_TOKENS.shadow).toBe('shadow-xs');
  });

  it('enforces a uniform corner radius across header controls', () => {
    expect(HEADER_CONTROL_TOKENS.radius).toBe('rounded-lg');
  });

  it('enforces square dimensions for header icon buttons', () => {
    expect(HEADER_CONTROL_TOKENS.iconButtonSize).toBe('h-8 w-8');
  });

  it('provides composite classes that embed height, radius, and shadow', () => {
    expect(HEADER_CONTROL_TOKENS.baseControl).toContain('h-8');
    expect(HEADER_CONTROL_TOKENS.baseControl).toContain('rounded-lg');
    expect(HEADER_CONTROL_TOKENS.baseControl).toContain('shadow-xs');

    expect(HEADER_CONTROL_TOKENS.baseIconButton).toContain('h-8 w-8');
    expect(HEADER_CONTROL_TOKENS.baseIconButton).toContain('rounded-lg');
  });
});

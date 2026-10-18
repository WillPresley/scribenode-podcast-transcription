/**
 * Design Tokens for UI Consistency
 *
 * Enforces uniform dimensions, corner radii, elevation/shadows, and layout
 * metrics across header controls, toolbar items, and action buttons.
 */

export const HEADER_CONTROL_TOKENS = {
  /** Unified height for all main header controls (32px / 2rem) */
  height: 'h-8',
  /** Unified corner radius for header interactive items */
  radius: 'rounded-lg',
  /** Unified shadow elevation for header buttons and controls */
  shadow: 'shadow-xs',
  /** Unified square dimensions for icon-only header buttons (32px x 32px) */
  iconButtonSize: 'h-8 w-8',
  /** Composite class for header interactive controls */
  baseControl: 'h-8 rounded-lg shadow-xs',
  /** Composite class for header icon buttons */
  baseIconButton: 'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
} as const;

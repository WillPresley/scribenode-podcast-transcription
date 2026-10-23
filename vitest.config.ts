import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    isolate: false,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    onConsoleLog(log, type) {
      // Filter out expected test simulation noise and ffmpeg probe stderr
      if (
        type === 'stderr' &&
        (log.includes('[Gemini API]') ||
         log.includes('[RSS Preview Error]') ||
         log.includes('Remote Audio Download Error') ||
         log.includes('[Failover]') ||
         log.includes('[mp3 @') ||
         log.includes('Failed to read frame size') ||
         log.includes('Could not seek to') ||
         log.includes('Invalid data found') ||
         log.includes('Invalid argument'))
      ) {
        return false;
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'server/**/*.ts',
        'src/utils/**/*.ts'
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        'tests/**'
      ]
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
});

import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      // Pure modules importing theme/tokens pull react-native (PixelRatio) —
      // stub it, vitest has no RN runtime (see src/test/react-native-stub.ts).
      'react-native': path.resolve(process.cwd(), 'src/test/react-native-stub.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});

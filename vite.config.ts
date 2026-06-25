import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [preact(), tailwindcss()],
  resolve: {
    alias: {
      "react": "preact/compat",
      "react-dom/test-utils": "preact/test-utils",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime"
    }
  },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        ghost: './ghost.html'
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('shiki') || id.includes('wasm') || id.includes('cpp') || id.includes('typescript') || id.includes('python') || id.includes('java')) {
              return 'syntax-heavy';
            }
            return 'vendor';
          }
        }
      }
    }
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

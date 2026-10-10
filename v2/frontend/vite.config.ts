import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production the asset canister sets the `ic_env` cookie with the backend
// canister id and the network root key. For `npm run dev` against a local
// network, set VITE_BACKEND_CANISTER_ID and VITE_IC_HOST (see .env.example).
// Candid bindings in src/bindings are generated from backend.did by `npm run bindings`.
export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

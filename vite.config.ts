import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' → assets con rutas relativas, funciona bajo cualquier
// usuario.github.io/<repo>/ sin conocer el nombre del repo.
export default defineConfig({
  base: './',
  plugins: [react()],
});

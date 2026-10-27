import { defineConfig } from 'vite'

/* Painel do GM: /admin (com ou sem barra, e até o "//admin") abre admin/index.html. A página usa caminhos absolutos
   (/admin/admin.mjs, /data/...) porque, sem a barra no fim, o navegador resolveria "./" contra a raiz. */
const rotaAdmin = {
  name: 'rota-admin',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const mc = req.url && req.url.match(/^\/+admin\/cenario\/?(\?.*)?$/);
      if (mc) { req.url = '/admin/cenario.html' + (mc[1] || ''); return next(); }
      const m = req.url && req.url.match(/^\/+admin\/?(\?.*)?$/);
      if (m) req.url = '/admin/index.html' + (m[1] || '');
      next();
    });
  },
};

export default defineConfig({
  appType: 'mpa',
  plugins: [rotaAdmin],
  server: {
    port: 5300,
    host: true
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0
  }
})

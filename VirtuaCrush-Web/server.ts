import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";

async function startServer() {
  const app = express();
  const PORT = 3001;
  const ELIZA_PORT = 3000;

  app.use(express.json());

  // Proxy API requests to the ElizaOS backend
  app.use(
    '/api/chat',
    createProxyMiddleware({
      target: `http://127.0.0.1:${ELIZA_PORT}`,
      changeOrigin: true,
      pathRewrite: { '^/api/chat': '' },
    })
  );

  // Serve the frontend
  const vite = await createViteServer({ 
    server: { middlewareMode: true }, 
    appType: "spa" 
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Frontend server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
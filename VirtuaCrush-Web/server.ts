import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware"; 

async function startServer() {
  const app = express();
  const PORT = 3001; 
  const ELIZA_PORT = 3000; // The port your ElizaOS agents run on
  
  // STRIPE WEBHOOK MUST GO HERE
  // Stripe requires the raw, unparsed request body to verify webhook signatures.
  // We handle this before app.use(express.json()) parses everything.
  app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), (req, res) => {
    // Stripe event validation and subscription logic will go here
    res.status(200).send('Webhook received');
  });

  // Parse standard JSON requests for the rest of the app
  app.use(express.json());
  
  // CHAT PROXY
  // Routes frontend requests from http://localhost:3001/api/chat/...
  // directly to the ElizaOS backend at http://localhost:3000/...
  // This bypasses CORS issues during local testing.
  app.use(
    '/api/chat',
    createProxyMiddleware({
      target: `http://127.0.0.1:${ELIZA_PORT}`,
      changeOrigin: true,
      // If Eliza expects requests to '/[agentId]/message', you might need to rewrite the path:
      pathRewrite: {
        '^/api/chat': '', 
      },
    })
  );
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Frontend server running on http://localhost:${PORT}`);
  });
}

startServer();
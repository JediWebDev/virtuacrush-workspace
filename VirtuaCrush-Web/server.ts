import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

// ADD "as string" HERE
const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("FATAL ERROR: JWT_SECRET is not defined in the environment variables.");
}

async function startServer() {
// ... rest of your code

async function startServer() {
  const app = express();
  const PORT = 3001; 
  const ELIZA_PORT = 3000;

  // Stripe Webhook Placeholder (must be raw body)
  app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), (req, res) => {
    res.status(200).send('Webhook received');
  });
  
  app.use(express.json());
  
  // SIGNUP ROUTE
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password } = req.body;
      const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      
      if (userCheck.rows.length > 0) {
        return res.status(400).json({ error: "User already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const newUser = await pool.query(
        "INSERT INTO users (email, password_hash, tier) VALUES ($1, $2, 'free') RETURNING id, email, tier",
        [email, passwordHash]
      );

      const user = newUser.rows[0];
      const token = jwt.sign({ id: user.id, email: user.email, tier: user.tier }, JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({ token, user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error during signup" });
    }
  });

  // LOGIN ROUTE
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, email: user.email, tier: user.tier }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, email: user.email, tier: user.tier } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error during login" });
    }
  });

  // CHAT PROXY
  app.use(
    '/api/chat',
    createProxyMiddleware({
      target: `http://127.0.0.1:${ELIZA_PORT}`,
      changeOrigin: true,
      pathRewrite: { '^/api/chat': '' },
    })
  );
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Frontend server running on http://localhost:${PORT}`);
  });
}

startServer()};
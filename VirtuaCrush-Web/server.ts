import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function signToken(userId: string, tier: string): string {
  return jwt.sign({ userId, tier }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/auth/signup", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    if (!isValidEmail(email.trim())) {
      return res.status(400).json({ error: "Invalid email." });
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "Email already in use." });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, tier",
        [normalizedEmail, passwordHash]
      );

      const { id, tier } = result.rows[0] as { id: string; tier: string };
      const token = signToken(id, tier);

      return res.json({ token, tier });
    } catch (error) {
      console.error("Signup error:", error);
      return res.status(500).json({ error: "Failed to create account." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    console.log("DEBUG: server.ts is running. Incoming chat request...");
    const { message, agentId } = req.body;
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await pool.query(
        "SELECT id, password_hash, tier FROM users WHERE email = $1",
        [normalizedEmail]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const user = result.rows[0] as { id: string; password_hash: string; tier: string };
      const valid = await bcrypt.compare(password, user.password_hash);

      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const token = signToken(user.id, user.tier);

      return res.json({ token, tier: user.tier });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Login failed." });
    }
  });

  // AI Route - Handles logic for external agents or Gemini fallback
  app.post("/api/chat", async (req, res) => {
    const { message, agentId } = req.body;
    const externalEndpoint = process.env.AI_AGENT_ENDPOINT;

    if (!externalEndpoint) {
      return res.status(500).json({ error: "Configuration error: AI_AGENT_ENDPOINT missing." });
    }

    try {
      const url = `${externalEndpoint.replace(/\/$/, '')}/${agentId}/message`;
      console.log(`[DEBUG] Proxying to: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          user: "web_user",
          userId: "web_user",
          userName: "User",
          roomId: `default-room-${agentId}`,
        }),
      });

      // Grab raw text so we can see if it's an error page
      const rawText = await response.text();

      if (!response.ok) {
        console.error(`[DEBUG] Backend rejected request (${response.status}):`, rawText);
        return res.status(response.status).json({ error: `Backend error: ${rawText}` });
      }

      const data = JSON.parse(rawText);
      // Handle both array and object responses
      const responseText = Array.isArray(data) ? data[0]?.text : data?.text;

      return res.json({ text: responseText || "Empty response from agent." });
    } catch (error) {
      console.error("[DEBUG] Proxy Exception:", error);
      return res.status(500).json({ error: `Proxy failed: ${error instanceof Error ? error.message : 'Unknown'}` });
    }
  });

  // Health check
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

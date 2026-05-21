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
    const { agentId, message, characterPersona, rivalryContext } = req.body;
    const externalEndpoint = process.env.AI_AGENT_ENDPOINT;

    if (externalEndpoint) {
      try {
        const url = `${externalEndpoint}/${agentId}/message`;
        console.log(`Proxying to external agent: ${url}`);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            userId: "user",
            roomId: "default",
          }),
        });
        
        if (!response.ok) throw new Error(`External agent error: ${response.status}`);
        
        const data = await response.json();
        return res.json({
          text: data[0]?.text || "No response received.",
        });
      } catch (error) {
        console.error("External Agent Proxy Error:", error);
        return res.status(500).json({ error: "Neural link to external agent failed. Falling back to local core..." });
      }
    }

    // Default Fallback to Gemini if no external endpoint is configured
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      const rivalryBlock = rivalryContext
        ? `\n\n${rivalryContext}`
        : "";
      const prompt = `System: You are the character described below. Stay in character. Respond to the user's message appropriately.\n\nPersona: ${characterPersona}${rivalryBlock}\n\nUser: ${message}`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      res.json({ text: response.text });
    } catch (error) {
      console.error("Gemini Fallback Error:", error);
      res.status(500).json({ error: "AI core synchronization failed." });
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

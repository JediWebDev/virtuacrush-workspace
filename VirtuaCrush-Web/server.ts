import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AI Route - Handles logic for external agents or Gemini fallback
  app.post("/api/chat", async (req, res) => {
    const { message, characterPersona, rivalryContext } = req.body;
    const externalEndpoint = process.env.AI_AGENT_ENDPOINT;

    if (externalEndpoint) {
      try {
        console.log(`Proxying to external agent: ${externalEndpoint}`);
        const response = await fetch(externalEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt: message, 
            persona: characterPersona,
            rivalryContext: rivalryContext ?? "",
            user: "web_client" 
          })
        });
        
        if (!response.ok) throw new Error(`External agent error: ${response.status}`);
        
        const data = await response.json();
        return res.json({ 
          text: data.text || data.response || data.message || "Agent acknowledged command." 
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

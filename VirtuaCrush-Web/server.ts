import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
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

  // ─── ElizaOS v2 Agent Chat ───────────────────────────────────────────────
  //
  // ElizaOS v2 (1.x.x) removed the old /:agentId/message endpoint entirely.
  // The correct flow is:
  //   1. GET  /api/messaging/dm-channel?currentUserId=<webUser>&targetUserId=<agentId>
  //        → gets or creates a dedicated DM channel for this user↔agent pair
  //   2. POST /api/messaging/channels/:channelId/messages  (mode: "sync")
  //        → sends the message and waits for the agent reply in the same request
  //
  // Channel IDs are cached in memory so step 1 only runs once per agentId.
  // ─────────────────────────────────────────────────────────────────────────

  // Stable UUID that represents the anonymous web user on this server.
  // If you want per-account isolation, swap this for the userId from the JWT.
  const WEB_USER_ID = "00000000-0000-0000-0000-000000000002";

  // Default ElizaOS server ID (single-server deployments always use this).
  const ELIZA_SERVER_ID = "00000000-0000-0000-0000-000000000000";

  // In-memory cache: agentId → channelId  (survives restarts fine; Railway
  // redeploys are infrequent and the DM-channel lookup is cheap anyway).
  const dmChannelCache = new Map<string, string>();

  app.post("/api/chat", async (req, res) => {
    const { message, agentId } = req.body as { message?: string; agentId?: string };
    const base = (process.env.AI_AGENT_ENDPOINT ?? "").replace(/\/$/, "");

    if (!base) {
      return res.status(500).json({ error: "Configuration error: AI_AGENT_ENDPOINT missing." });
    }

    if (!message?.trim()) {
      return res.status(400).json({ error: "message is required." });
    }

    if (!agentId?.trim()) {
      return res.status(400).json({ error: "agentId is required." });
    }

    try {
      // ── Step 1: resolve the DM channel for this agent ──────────────────
      let channelId = dmChannelCache.get(agentId);

      if (!channelId) {
        const dmUrl = `${base}/api/messaging/dm-channel?currentUserId=${WEB_USER_ID}&targetUserId=${agentId}`;
        console.log(`[DEBUG] Fetching DM channel: ${dmUrl}`);

        const dmRes = await fetch(dmUrl);
        const dmRaw = await dmRes.text();

        if (!dmRes.ok) {
          console.error(`[DEBUG] DM channel lookup failed (${dmRes.status}):`, dmRaw);
          return res.status(502).json({ error: `Could not resolve agent channel: ${dmRaw}` });
        }

        let dmData: any;
        try {
          dmData = JSON.parse(dmRaw);
        } catch {
          console.error("[DEBUG] DM channel response is not JSON:", dmRaw);
          return res.status(502).json({ error: "Agent returned invalid JSON for DM channel." });
        }

        channelId = (dmData?.data?.channel?.id ?? dmData?.data?.id) as string | undefined;

        if (!channelId) {
          console.error("[DEBUG] No channel ID in DM response:", dmData);
          return res.status(502).json({ error: "No channel ID returned by agent service." });
        }

        dmChannelCache.set(agentId, channelId);
        console.log(`[DEBUG] Cached DM channel for agent ${agentId}: ${channelId}`);
      }

      // ── Step 2: snapshot existing messages before we send ─────────────────
      // We capture the current message IDs in the channel so we can detect
      // genuinely NEW messages after our send — avoiding clock-skew issues
      // between the two Railway containers.
      const pollUrl = `${base}/api/messaging/channels/${channelId}/messages?limit=100`;

      const snapshotRes = await fetch(pollUrl).catch(() => null);
      const knownIds = new Set<string>();
      if (snapshotRes?.ok) {
        try {
          const snapData = await snapshotRes.json();
          const snapMsgs: any[] = snapData?.data?.messages ?? snapData?.data ?? [];
          for (const m of snapMsgs) {
            if (m?.id) knownIds.add(String(m.id));
          }
        } catch { /* ignore */ }
      }
      console.log(`[DEBUG] Snapshot: ${knownIds.size} existing messages`);

      // ── Step 3: send the message ───────────────────────────────────────────
      const msgUrl = `${base}/api/messaging/channels/${channelId}/messages`;
      console.log(`[DEBUG] Posting message to: ${msgUrl}`);

      const msgRes = await fetch(msgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: WEB_USER_ID,
          content: message.trim(),
          message_server_id: ELIZA_SERVER_ID,
          source_type: "user_message",
          raw_message: { text: message.trim() },
          mode: "sync",
        }),
      });

      const msgRaw = await msgRes.text();

      if (!msgRes.ok) {
        console.error(`[DEBUG] Agent rejected message (${msgRes.status}):`, msgRaw);
        if (msgRes.status === 404 || msgRes.status === 403) {
          dmChannelCache.delete(agentId);
        }
        return res.status(msgRes.status).json({ error: `Agent error: ${msgRaw}` });
      }

      // Add our own sent message ID to the known set too (if returned)
      try {
        const sentData = JSON.parse(msgRaw);
        const sentId = sentData?.data?.id ?? sentData?.id;
        if (sentId) knownIds.add(String(sentId));
      } catch { /* ignore */ }

      console.log(`[DEBUG] Message sent, polling for agent reply...`);

      // ── Step 4: poll for the agent reply (max 20s, 750ms interval) ────────
      const deadline = Date.now() + 20_000;
      const interval = 750;

      let agentReply: string | undefined;

      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, interval));

        let pollRes: Response;
        try {
          pollRes = await fetch(pollUrl);
        } catch {
          continue;
        }

        if (!pollRes.ok) continue;

        let messages: any[];
        try {
          const pollData = await pollRes.json();
          messages = pollData?.data?.messages ?? pollData?.data ?? [];
          if (!Array.isArray(messages)) continue;
        } catch {
          continue;
        }

        for (const msg of messages) {
          // Skip messages we saw before sending
          if (!msg?.id || knownIds.has(String(msg.id))) continue;

          // Skip messages from the web user (our own)
          const authorId =
            msg.author_id ?? msg.authorId ?? msg.entityId ??
            msg.senderId ?? msg.userId ?? "";
          if (String(authorId) === WEB_USER_ID) continue;

          // Skip empty messages
          const text = msg.content ?? msg.text ?? msg.message ?? "";
          if (!text) continue;

          agentReply = text;
          break;
        }

        if (agentReply) break;
      }

      if (!agentReply) {
        console.error("[DEBUG] Agent timed out — no reply after 20s");
        return res.status(504).json({ error: "Agent did not reply in time. Please try again." });
      }

      console.log(`[DEBUG] Got agent reply: ${agentReply.slice(0, 80)}`);
      return res.json({ text: agentReply });

    } catch (error) {
      console.error("[DEBUG] Proxy Exception:", error);
      return res.status(500).json({
        error: `Proxy failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
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

# Recover the chat-app version of Virtua Crush

**Restore point:** commit `d624292` — _"tune chaos triggers"_ (June 21, 2026)
This is the last commit before the Phaser game-engine migration (the "Phase A/B/C"
and "Phase 1/2/3 Add Phaser" commits on June 22). It's a pure chat app:
`ChatInterface.tsx`, `ChatAvatar.tsx`, `useChat.ts`, no game/engine code.

Your `main` branch is **not changed** by any of this. The chat version is added
as a *separate branch* (`chat-app-version`) so both versions coexist.

---

## Step 1 — Create and push the branch

Run these from a terminal where you're signed in to GitHub (any folder):

```bash
git clone https://github.com/JediWebDev/virtuacrush-workspace.git
cd virtuacrush-workspace

# create the branch at the last chat-app commit
git branch chat-app-version d624292

# publish it to GitHub
git push -u origin chat-app-version
```

After this, GitHub shows a `chat-app-version` branch alongside `main`.

## Step 2 — Use it

```bash
git checkout chat-app-version
cd VirtuaCrush-Web
npm install      # or: bun install
npm run dev
```

---

## Notes

- Nothing here deletes or rewrites `main`. To go back to the 3D version any time:
  `git checkout main`.
- If you'd rather make `chat-app-version` your new default (so the deployed app
  reverts), change the default branch in GitHub → Settings → Branches. Don't do
  this unless you intend to take the live site back to the chat version.
- To compare what changed since the chat version:
  `git diff d624292..main -- VirtuaCrush-Web/`

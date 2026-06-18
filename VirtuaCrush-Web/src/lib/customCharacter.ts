import { Character } from "../types/character";
import { assetUrl, customCharacterRef, type StudioCharacter } from "./api";

/** Gradient initial avatar for custom characters without an uploaded image. */
export function customAvatar(name: string): string {
  const initial = (name.trim()[0] || "?").toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#c9717d"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>` +
    `<rect width="240" height="240" fill="url(#g)"/>` +
    `<text x="120" y="158" font-family="Georgia, serif" font-size="120" fill="white" text-anchor="middle">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Splits stored tone tags into display labels (e.g. "playful, warm" → "Playful", "Warm"). */
export function parseCharacterTags(tone: string | null | undefined): string[] {
  if (!tone?.trim()) return [];
  return tone
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) =>
      t
        .split(/[\s_]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
    );
}

/** Builds a frontend Character from a stored custom persona. */
export function studioToCharacter(c: StudioCharacter): Character {
  const tags = parseCharacterTags(c.tone);
  return {
    id: customCharacterRef(c.id),
    name: c.displayName,
    role: "Custom companion",
    bio: c.core,
    tags,
    image: c.imageKey ? assetUrl(c.imageKey) : customAvatar(c.displayName),
    premiumVideo: "",
    persona: c.core,
    currentAffinity: 0,
    rivalName: "",
    rivalAvatar: "",
    rivalSnarkComment: "",
    feedPosts: [],
  };
}

export function isCustomCharacterId(id: string): boolean {
  return id.startsWith("user:");
}

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

/** Builds a frontend Character from a stored custom persona. */
export function studioToCharacter(c: StudioCharacter): Character {
  return {
    id: customCharacterRef(c.id),
    name: c.displayName,
    role: c.tone ? `Your character · ${c.tone}` : "Your character",
    bio: c.core,
    tags: ["Custom"],
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

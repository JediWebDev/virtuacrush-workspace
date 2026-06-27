export type UserTier = "guest" | "free" | "pro";

export const FREE_CHARS = ["Mina", "Becca", "Serena", "Ash", "Bohdi", "Lexi"] as const;

export const SPOTLIGHT_CHARS = ["Mina", "Becca", "Serena", "Ash", "Bohdi", "Lexi"] as const;

export function matchesCharacterName(fullName: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => fullName.includes(token));
}

export function isFreeCharacter(fullName: string): boolean {
  return matchesCharacterName(fullName, FREE_CHARS);
}

export function hasPremiumAccess(tier: UserTier): boolean {
  return tier === 'pro';
}

export type UserTier = "guest" | "free" | "pro" | "vip";

export const FREE_CHARS = ["Mina", "Avery", "Madison", "Zander"] as const;

export const SPOTLIGHT_CHARS = ["Mina", "Avey", "Madison"] as const;

/** Match roster names like `Tiffany "Mina" Greer` or `Callie Spencer`. */
export function matchesCharacterName(fullName: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => fullName.includes(token));
}

export function isFreeCharacter(fullName: string): boolean {
  return matchesCharacterName(fullName, FREE_CHARS);
}

export function hasPremiumAccess(tier: UserTier): boolean {
  return tier === "pro" || tier === "vip";
}

import type { StudioNpcStance, StudioSceneNpcInput } from "./api";

/** In-form NPC row for Story Studio. */
export interface StudioNpcDraft {
  name: string;
  stance: StudioNpcStance;
  archetypeId: string;
  roleId: string;
  description: string;
}

export function emptyStudioNpcDraft(stance: StudioNpcStance = "bystander"): StudioNpcDraft {
  return { name: "", stance, archetypeId: "", roleId: "", description: "" };
}

export function studioNpcDraftToInput(draft: StudioNpcDraft): StudioSceneNpcInput | null {
  const name = draft.name.trim();
  if (!name) return null;
  return {
    name,
    stance: draft.stance,
    ...(draft.archetypeId ? { archetypeId: draft.archetypeId } : {}),
    ...(draft.roleId && draft.stance === "bystander" ? { roleId: draft.roleId as StudioSceneNpcInput["roleId"] } : {}),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
  };
}

export function studioNpcInputsFromDrafts(drafts: StudioNpcDraft[]): StudioSceneNpcInput[] {
  return drafts.map(studioNpcDraftToInput).filter((n): n is StudioSceneNpcInput => n != null);
}

export function studioNpcDraftsFromSpec(raw: unknown): StudioNpcDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : "";
      const stance = o.stance === "friend" || o.stance === "enemy" || o.stance === "bystander" ? o.stance : "bystander";
      return {
        name,
        stance,
        archetypeId: typeof o.archetypeId === "string" ? o.archetypeId : "",
        roleId: typeof o.roleId === "string" ? o.roleId : "",
        description: typeof o.description === "string" ? o.description : "",
      } satisfies StudioNpcDraft;
    })
    .filter((d): d is StudioNpcDraft => d != null && d.name.trim().length > 0);
}

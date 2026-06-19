import type { StudioPack, StudioPackSpec, StudioStory, StudioStoryAct } from "./api";
import { studioNpcDraftsFromSpec, type StudioNpcDraft } from "./studioNpc";

export interface ArcFormState {
  characterId: string;
  title: string;
  setting: string;
  situation: string;
  playerSituation: string;
  npcInstruction: string;
  beginningInstruction: string;
  middleInstruction: string;
  endInstruction: string;
  introNarrative: string;
  completionCriteria: string;
  coPresent: boolean;
  tone: "light" | "serious" | "romantic" | "dramatic";
}

export function arcFormFromStory(story: StudioStory): { form: ArcFormState; npcs: StudioNpcDraft[] } {
  const spec = story.spec as Record<string, unknown>;
  const tone =
    spec.tone === "light" || spec.tone === "serious" || spec.tone === "romantic" || spec.tone === "dramatic"
      ? spec.tone
      : "dramatic";

  return {
    form: {
      characterId: story.characterId,
      title: story.title,
      setting: typeof spec.setting === "string" ? spec.setting : "",
      situation: typeof spec.situation === "string" ? spec.situation : "",
      playerSituation: typeof spec.playerSituation === "string" ? spec.playerSituation : "",
      npcInstruction: typeof spec.npcInstruction === "string" ? spec.npcInstruction : "",
      beginningInstruction: typeof spec.beginningInstruction === "string" ? spec.beginningInstruction : "",
      middleInstruction: typeof spec.middleInstruction === "string" ? spec.middleInstruction : "",
      endInstruction: typeof spec.endInstruction === "string" ? spec.endInstruction : "",
      introNarrative: typeof spec.introNarrative === "string" ? spec.introNarrative : "",
      completionCriteria: typeof spec.completionCriteria === "string" ? spec.completionCriteria : "",
      coPresent: spec.coPresent !== false,
      tone,
    },
    npcs: studioNpcDraftsFromSpec(spec.npcs),
  };
}

export interface PackEditNode {
  id: string;
  npcInstruction: string;
  introNarrative: string;
  terminal: boolean;
  act: StudioStoryAct | "auto";
  choices: { label: string; userMessage: string; next: string }[];
}

export interface PackFormState {
  characterId: string;
  title: string;
  blurb: string;
  mood: StudioPackSpec["mood"];
  setting: string;
  situation: string;
  systemInstruction: string;
  coPresent: boolean;
  npcs: StudioNpcDraft[];
  nodes: PackEditNode[];
  seq: number;
}

function packNodesFromSpec(nodes: StudioPackSpec["nodes"]): { nodes: PackEditNode[]; seq: number } {
  let seq = 1;
  const editNodes: PackEditNode[] = Object.entries(nodes ?? {}).map(([id, n]) => {
    const match = /^node_(\d+)$/.exec(id);
    if (match) seq = Math.max(seq, Number(match[1]) + 1);

    const act: StudioStoryAct | "auto" =
      n.act === "beginning" || n.act === "middle" || n.act === "end"
        ? n.act
        : id === "start"
          ? "beginning"
          : "auto";

    return {
      id,
      npcInstruction: n.npcInstruction ?? "",
      introNarrative: n.introNarrative ?? "",
      terminal: n.choices == null,
      act,
      choices:
        n.choices == null
          ? []
          : (n.choices ?? []).map((c) => ({
              label: c.label ?? "",
              userMessage: c.userMessage ?? "",
              next: c.next ?? "end",
            })),
    };
  });

  editNodes.sort((a, b) => {
    if (a.id === "start") return -1;
    if (b.id === "start") return 1;
    return a.id.localeCompare(b.id);
  });

  return { nodes: editNodes, seq };
}

export function packFormFromPack(pack: StudioPack): PackFormState {
  const spec = pack.spec;
  const { nodes, seq } = packNodesFromSpec(spec.nodes);

  return {
    characterId: pack.characterId,
    title: spec.title || pack.title,
    blurb: spec.blurb || pack.blurb || "",
    mood: spec.mood ?? "dramatic",
    setting: spec.setting ?? "",
    situation: spec.situation ?? "",
    systemInstruction: spec.systemInstruction ?? "",
    coPresent: spec.coPresent !== false,
    npcs: studioNpcDraftsFromSpec(spec.npcs),
    nodes,
    seq,
  };
}

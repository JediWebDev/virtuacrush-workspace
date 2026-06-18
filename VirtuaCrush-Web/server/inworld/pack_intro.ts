/** User-facing opening narration for a CYOA story pack session. */
import type { StoryPack, PackNode } from './pack_types';

function capitalizeSentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function packOpeningIntro(pack: StoryPack, startNode?: PackNode | null): string | null {
  if (startNode?.introNarrative?.trim()) return startNode.introNarrative.trim();
  if (pack.blurb?.trim()) return pack.blurb.trim();
  const anchor = pack.sceneAnchor;
  if (!anchor) return null;
  const setting = anchor.setting.trim();
  const situation = anchor.situation.trim();
  if (setting && situation) {
    const settingPhrase = setting.replace(/^a\s+/i, '').replace(/^an\s+/i, '');
    return `You find yourself in ${settingPhrase}. ${capitalizeSentence(situation)}`;
  }
  if (situation) return capitalizeSentence(situation);
  if (setting) return `You arrive at ${setting}.`;
  return null;
}

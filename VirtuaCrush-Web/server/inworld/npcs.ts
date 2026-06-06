// Engine-decided NPC actors for the scene director. NPC PRESENCE is decided by
// the simulation (e.g. the venue authority steps in when a world event fires);
// these helpers just shape the actor the director will voice.
import type { Actor } from './director';

/** A short, readable name for a venue authority string ("a mall security guard" -> "Security"). */
export function authorityShortName(authority: string): string {
  const s = (authority || '').toLowerCase();
  if (s.includes('security')) return 'Security';
  if (s.includes('bouncer')) return 'Bouncer';
  if (s.includes('manager')) return 'Manager';
  if (s.includes('usher')) return 'Usher';
  if (s.includes('ranger')) return 'Ranger';
  if (s.includes('marshal')) return 'Marshal';
  if (s.includes('attendant')) return 'Attendant';
  if (s.includes('neighbor') || s.includes('neighbour')) return 'Neighbor';
  if (s.includes('guard')) return 'Security';
  return 'Staff';
}

/** Builds the authority NPC actor (the figure stepping in) with a turn brief. */
export function authorityActor(authority: string, brief: string): Actor {
  const name = authorityShortName(authority);
  return { tag: name.toUpperCase(), name, kind: 'npc', brief };
}

import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type State,
} from '@elizaos/core';
import { addExperience } from '../../backend/affinityManager.js';

const CLASSIFICATION_CATEGORIES = [
  'Empathetic',
  'Vulnerable',
  'Neutral',
  'Self-Interest',
  'Lust',
  'Angry',
  'Rude',
] as const;

type AffinityCategory = (typeof CLASSIFICATION_CATEGORIES)[number];

const CATEGORY_XP: Record<AffinityCategory, number> = {
  Empathetic: 15,
  Vulnerable: 15,
  Neutral: 5,
  'Self-Interest': 1,
  Lust: 1,
  Angry: -10,
  Rude: -10,
};

const CLASSIFICATION_PROMPT = `Classify the user's message into exactly ONE of these categories:
Empathetic, Vulnerable, Neutral, Self-Interest, Lust, Angry, Rude

Rules:
- Reply with ONLY the category name, no punctuation or explanation.
- Empathetic: warmth, support, care for others.
- Vulnerable: honest emotional openness or asking for support.
- Neutral: factual, casual, or low emotional charge.
- Self-Interest: transactional, self-focused without malice.
- Lust: sexual or explicit romantic pressure.
- Angry: hostility or frustration directed at someone.
- Rude: insults, dismissiveness, or deliberate disrespect.

User message:
`;

function parseCategory(raw: string): AffinityCategory | null {
  const cleaned = raw
    .trim()
    .replace(/[<>"'`]/g, '')
    .split(/\s+/)[0]
    ?.replace(/[^a-zA-Z-]/g, '');

  if (!cleaned) return null;

  const normalized = cleaned.toLowerCase();
  const match = CLASSIFICATION_CATEGORIES.find(
    (c) => c.toLowerCase().replace(/-/g, '') === normalized.replace(/-/g, '')
  );
  return match ?? null;
}

function extractCategoryFromLlmOutput(text: string): AffinityCategory | null {
  const direct = text.trim().match(
    /\b(Empathetic|Vulnerable|Neutral|Self-Interest|Lust|Angry|Rude)\b/i
  );
  if (direct?.[1]) {
    return parseCategory(direct[1]);
  }
  return parseCategory(text);
}

/**
 * Load current affinity row for user + character. Replace with your ORM/query layer.
 */
async function fetchAffinityProgress(
  _runtime: IAgentRuntime,
  _userId: string,
  _characterId: string
): Promise<{ currentLevel: number; currentXp: number }> {
  // TODO: SELECT current_level, current_xp FROM user_character_affinity
  //       WHERE user_id = $1 AND character_id = $2
  return { currentLevel: 1, currentXp: 0 };
}

/**
 * Persist affinity progression after XP is applied.
 */
async function updateAffinityInDatabase(
  _runtime: IAgentRuntime,
  _userId: string,
  _characterId: string,
  _newLevel: number,
  _newXp: number
): Promise<void> {
  // TODO: UPSERT into user_character_affinity
  // UPDATE user_character_affinity
  // SET current_level = $3, current_xp = $4, updated_at = NOW()
  // WHERE user_id = $1 AND character_id = $2;
  //
  // Or INSERT ... ON CONFLICT (user_id, character_id) DO UPDATE ...
}

export const psychologicalEvaluator: Evaluator = {
  name: 'PSYCHOLOGICAL_AFFINITY',
  similes: ['AFFINITY_SCORE', 'RELATIONSHIP_XP', 'MESSAGE_CLASSIFIER'],
  description:
    'Classifies user messages for psychological tone and updates RPG-style affinity XP in PostgreSQL.',
  alwaysRun: true,
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    if (!message.content?.text?.trim()) {
      return false;
    }
    return message.entityId !== runtime.agentId;
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    try {
      const userText = message.content.text?.trim() ?? '';
      if (!userText) return;

      const { text } = await runtime.generateText(CLASSIFICATION_PROMPT + userText, {
        modelType: ModelType.TEXT_SMALL,
        temperature: 0.1,
        maxTokens: 16,
      });

      const category = extractCategoryFromLlmOutput(text);
      if (!category) return;

      const xpDelta = CATEGORY_XP[category];
      const userId = message.entityId;
      const characterId = runtime.agentId;

      const { currentLevel, currentXp } = await fetchAffinityProgress(
        runtime,
        userId,
        characterId
      );

      const progression = addExperience(currentLevel, currentXp, xpDelta);

      await updateAffinityInDatabase(
        runtime,
        userId,
        characterId,
        progression.newLevel,
        progression.newXp
      );

      if (progression.hasLeveledUp) {
        runtime.logger.info(
          {
            src: 'plugin:affinity:evaluator',
            userId,
            characterId,
            category,
            xpDelta,
            newLevel: progression.newLevel,
            tier: progression.tier.tierName,
          },
          'Affinity level increased'
        );
      }
    } catch {
      // Fail silently on LLM timeout or transient errors
      return;
    }
  },
  examples: [
    {
      prompt: 'User shared they had a hard day and needed someone to listen.',
      messages: [
        { name: 'user', content: { text: 'I had a really hard day and just needed someone to listen.' } },
      ],
      outcome: 'Empathetic (+15 XP)',
    },
    {
      prompt: 'User sent a neutral logistics message.',
      messages: [{ name: 'user', content: { text: 'What time is the stream tomorrow?' } }],
      outcome: 'Neutral (+5 XP)',
    },
  ],
};

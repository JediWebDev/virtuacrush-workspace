import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import starterPlugin from './plugin.ts';
import { character as minaCharacter } from './mina.ts';
import { character as lexiCharacter } from './lexi.ts';

const initCharacter = ({ runtime, name }: { runtime: IAgentRuntime, name: string }) => {
  logger.info(`Initializing ${name}`);
};

export const minaAgent: ProjectAgent = {
  character: minaCharacter,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime, name: minaCharacter.name }),
};

export const lexiAgent: ProjectAgent = {
  character: lexiCharacter,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime, name: lexiCharacter.name }),
  // plugins: [starterPlugin], <-- Import custom plugins here
};

const project: Project = {
  agents: [minaAgent, lexiAgent],
};

export default project;

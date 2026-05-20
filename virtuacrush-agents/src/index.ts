import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import { character as minaCharacter } from './mina.ts';
import { character as lexiCharacter } from './lexi.ts';
import affinityPlugin from './plugins/affinity/index.ts';

const initCharacter = ({ runtime, name }: { runtime: IAgentRuntime, name: string }) => {
  logger.info(`Initializing ${name}`);
};

export const minaAgent: ProjectAgent = {
  character: minaCharacter,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime, name: minaCharacter.name }),
  plugins: [affinityPlugin],
};

export const lexiAgent: ProjectAgent = {
  character: lexiCharacter,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime, name: lexiCharacter.name }),
  plugins: [affinityPlugin],
};

const project: Project = {
  agents: [minaAgent, lexiAgent],
};

export default project;

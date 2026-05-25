import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import { Pool } from 'pg'; // <-- Add this import
import { character as minaCharacter } from './mina.ts';
import { character as lexiCharacter } from './lexi.ts';
import { character as madisonCharacter } from './madison.ts';
import { character as zanderCharacter } from './zander.ts';
import affinityPlugin from './plugins/affinity/index.ts';

// --- DEBUG POSTGRES CONNECTION ---
// This will test the connection before ElizaOS tries to, forcing the real error to print.
const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
pool.connect()
  .then(() => logger.success("✅ SUCCESS: Connected directly to PostgreSQL!"))
  .catch((err) => logger.error(`❌ POSTGRES CONNECTION ERROR: ${err.message}`));
// ---------------------------------

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

export const madisonAgent: ProjectAgent = {
  character: madisonCharacter,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime, name: madisonCharacter.name }),
  plugins: [affinityPlugin],
};

export const zanderAgent: ProjectAgent = {
  character: zanderCharacter,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime, name: zanderCharacter.name }),
  plugins: [affinityPlugin],
};

const project: Project = {
  agents: [minaAgent, lexiAgent, madisonAgent, zanderAgent],
};

export default project;
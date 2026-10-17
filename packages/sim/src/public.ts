/**
 * Browser-safe catalogue/constants surface. Does not import hashing or Node crypto.
 * Physics and scoring stay in ./index.ts (server / tests only).
 */
export { CATALOGUE } from "./catalogue.js";
export {
  DYS_ECOLOGY,
  DYS_ECONOMY,
  DYS_PREP_INFRA,
  DYS_WELFARE,
  ENGINE_VERSION,
  IDEAL_RESERVE,
  MAX_STARTS,
  PACK_A,
  ROUNDS,
  SECTORS,
  STARTING_RESERVE,
  WEIGHTS,
} from "./constants.js";
export type { Sector } from "./constants.js";
export type { Project } from "./types.js";

import type { AiProposal, AiTableRows } from '../../scripts/ai-content';

export type ProposalContext = { directory: string; sceneId: string; revision?: number };
export function matchesContext(expected: ProposalContext, current: ProposalContext): boolean;
export function applyProposal(
  source: AiTableRows,
  sceneId: string,
  proposal: Pick<AiProposal, 'scene' | 'art' | 'sound'>,
  assetPatch?: Record<string, string>,
): AiTableRows;

export function nextOrdinal(rows: Record<string, string>[], predicate: (row: Record<string, string>) => boolean): string;

export function nextId(prefix: string, rows: Record<string, string>[], key: string): string;

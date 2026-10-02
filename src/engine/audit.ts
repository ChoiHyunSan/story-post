import { advance, availableChoices, initialFlags, nodeAt, type Flags, type Story } from './story';

export interface EndingPath {
  endingId: string;
  nodeId: string;
  steps: number;
  choices: string[];
}

export interface StoryAudit {
  nodes: number;
  letters: number;
  endings: number;
  choices: number;
  flags: number;
  reachableStates: number;
  textCharacters: number;
  endingPaths: EndingPath[];
}

interface SearchState {
  nodeId: string;
  flags: Flags;
  choices: string[];
}

function stateKey(story: Story, state: SearchState): string {
  return JSON.stringify([state.nodeId, story.flags.map(flag => state.flags[flag.id])]);
}

export function auditStory(story: Story): StoryAudit {
  const queue: SearchState[] = [{ nodeId: story.startNodeId, flags: initialFlags(story), choices: [] }];
  const visited = new Set<string>();
  const endingPaths = new Map<string, EndingPath>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const state = queue[cursor];
    const key = stateKey(story, state);
    if (visited.has(key)) continue;
    visited.add(key);
    const node = nodeAt(story, state.nodeId);
    if (node.type === 'ending') {
      if (!endingPaths.has(node.endingId)) endingPaths.set(node.endingId, {
        endingId: node.endingId, nodeId: node.id, steps: state.choices.length, choices: state.choices,
      });
      continue;
    }
    for (const choice of availableChoices(node, state.flags)) {
      const next = advance(story, node.id, state.flags, choice.id);
      queue.push({ nodeId: next.node.id, flags: next.flags,
        choices: [...state.choices, `${node.id}:${choice.id}`] });
    }
  }
  const letters = story.nodes.filter(node => node.type === 'letter');
  const endings = story.nodes.filter(node => node.type === 'ending');
  const textCharacters = story.title.length + story.description.length + story.nodes.reduce((total, node) =>
    total + node.body.length + (node.type === 'letter'
      ? node.sender.length + node.choices.reduce((sum, choice) => sum + choice.text.length, 0)
      : 0), 0);
  return {
    nodes: story.nodes.length,
    letters: letters.length,
    endings: endings.length,
    choices: letters.reduce((total, node) => total + node.choices.length, 0),
    flags: story.flags.length,
    reachableStates: visited.size,
    textCharacters,
    endingPaths: [...endingPaths.values()].sort((a, b) => a.endingId.localeCompare(b.endingId)),
  };
}

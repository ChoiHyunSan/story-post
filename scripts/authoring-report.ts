import type { DatabaseSync } from 'node:sqlite';
import type { Story } from '../src/engine/story';
import { exportRuntimeStory, type WorkKey } from './authoring-store';

type SceneProductionRow = {
  scene_id: string;
  production_status: string;
  block_count: number;
  cue_count: number;
};
type AssetRow = {
  asset_id: string;
  asset_type: string;
  status: string;
  source_path: string;
  rights_holder: string;
  license: string;
};
type CueRow = {
  scene_id: string;
  trigger: string;
  channel: string;
  action: string;
  asset_id: string | null;
};

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\r', '').replaceAll('\n', '<br>');
}
function shorten(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

export function buildProductionReport(database: DatabaseSync, key: WorkKey): string {
  const story = exportRuntimeStory(database, key);
  const parameters = [key.storyId, key.workingVersion, key.locale] as const;
  const productionRows = database.prepare(`
    SELECT scene.scene_id, scene.production_status,
      (SELECT count(*) FROM content_block
       WHERE content_block.story_id = scene.story_id
         AND content_block.working_version = scene.working_version
         AND content_block.locale = scene.locale
         AND content_block.scene_id = scene.scene_id) AS block_count,
      (SELECT count(*) FROM cue
       WHERE cue.story_id = scene.story_id
         AND cue.working_version = scene.working_version
         AND cue.locale = scene.locale
         AND cue.scene_id = scene.scene_id) AS cue_count
    FROM scene
    WHERE story_id = ? AND working_version = ? AND locale = ?
    ORDER BY ordinal
  `).all(...parameters) as SceneProductionRow[];
  const productionByScene = new Map(productionRows.map(row => [row.scene_id, row]));
  const cues = database.prepare(`
    SELECT scene_id, trigger, channel, action, asset_id
    FROM cue
    WHERE story_id = ? AND working_version = ? AND locale = ?
    ORDER BY scene_id, trigger, ordinal
  `).all(...parameters) as CueRow[];
  const cuesByScene = new Map<string, CueRow[]>();
  for (const cue of cues) cuesByScene.set(cue.scene_id, [...(cuesByScene.get(cue.scene_id) ?? []), cue]);
  const assets = database.prepare(`
    SELECT asset_id, asset_type, status, source_path, rights_holder, license
    FROM asset ORDER BY asset_id
  `).all() as AssetRow[];
  const choiceCount = story.nodes.reduce(
    (total, node) => total + (node.type === 'letter' ? node.choices.length : 0), 0,
  );
  const endingCount = story.nodes.filter(node => node.type === 'ending').length;
  const lines = [
    `# ${story.title} v${story.version} 제작 리포트`, '',
    '> `pnpm authoring:inspect`로 생성한다. 직접 수정하지 않는다.', '',
    `- 작품: ${story.title}`,
    `- 식별자: \`${story.storyId}@${story.version}/${story.locale}\``,
    `- 장면 ${story.nodes.length}개 · 선택 ${choiceCount}개 · 결말 ${endingCount}개`,
    `- 상태값 ${story.flags.length}개 · 에셋 ${assets.length}개 · 연출 큐 ${cues.length}개`, '',
    '## 장면 제작표', '',
    '| 순서 | 장면 | 유형/보낸 이 | 본문 | 선택 | 연출 | 상태 |',
    '| ---: | --- | --- | ---: | --- | --- | --- |',
  ];
  story.nodes.forEach((node, index) => {
    const production = productionByScene.get(node.id);
    const choices = node.type === 'letter'
      ? node.choices.map(choice => `${choice.id} → ${choice.nextNodeId}`).join('<br>')
      : `결말: ${node.endingId}`;
    const sceneCues = (cuesByScene.get(node.id) ?? []).map(cue =>
      `${cue.trigger}: ${cue.channel}.${cue.action}${cue.asset_id ? `(${cue.asset_id})` : ''}`).join('<br>');
    lines.push(`| ${index + 1} | \`${node.id}\` | ${markdownCell(node.type === 'letter' ? node.sender : 'ending')} | ${production?.block_count ?? 0} | ${markdownCell(choices)} | ${markdownCell(sceneCues || '—')} | ${production?.production_status ?? 'missing'} |`);
  });
  lines.push('', '## 에셋 현황', '', '| ID | 유형 | 상태 | 파일 | 권리/라이선스 |', '| --- | --- | --- | --- | --- |');
  if (assets.length === 0) lines.push('| — | — | — | — | — |');
  for (const asset of assets) {
    lines.push(`| \`${asset.asset_id}\` | ${asset.asset_type} | ${asset.status} | \`${asset.source_path}\` | ${markdownCell(`${asset.rights_holder} / ${asset.license}`)} |`);
  }
  lines.push('', '## 상태값', '');
  for (const flag of story.flags) lines.push(`- \`${flag.id}\`: 기본값 ${flag.defaultValue}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function mermaidLabel(value: string): string {
  return shorten(value, 48).replaceAll('"', "'").replaceAll('\n', ' ');
}

export function buildBranchGraph(story: Story): string {
  const identifiers = new Map(story.nodes.map((node, index) => [node.id, `scene${index}`]));
  const lines = ['flowchart TD', `  %% Generated from ${story.storyId}@${story.version}/${story.locale}`];
  for (const node of story.nodes) {
    const identifier = identifiers.get(node.id)!;
    const label = mermaidLabel(node.type === 'letter' ? `${node.id} · ${node.sender}` : `${node.id} · 결말`);
    lines.push(node.type === 'ending' ? `  ${identifier}(["${label}"])` : `  ${identifier}["${label}"]`);
  }
  for (const node of story.nodes) {
    if (node.type === 'ending') continue;
    for (const choice of node.choices) {
      const conditions = choice.requires.map(condition => `${condition.flagId}=${condition.equals}`).join(', ');
      const label = mermaidLabel(`${choice.text}${conditions ? ` [${conditions}]` : ''}`);
      lines.push(`  ${identifiers.get(node.id)} -->|"${label}"| ${identifiers.get(choice.nextNodeId)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

import { advance, availableChoices, initialFlags, nodeAt, type Story } from '../src/engine/story';
import { sceneBackgroundAsset, type PresentationPackage } from '../src/content/presentation-package';
import { endingLabel } from '../src/content/presentation';

export function previewStory(story: Story, presentation: PresentationPackage, choiceIds: readonly string[]) {
  if (choiceIds.length > 200) throw new Error('미리보기 경로가 너무 깁니다. 처음부터 다시 시작하세요.');
  let node = nodeAt(story, story.startNodeId);
  let flags = initialFlags(story);
  const history: { sceneId: string; sender: string; choiceId: string; choiceText: string }[] = [];
  for (const choiceId of choiceIds) {
    if (node.type !== 'letter' || !availableChoices(node, flags).some(choice => choice.id === choiceId)) {
      throw new Error(`이 경로에서 '${choiceId}' 선택을 사용할 수 없습니다. 이전 선택으로 돌아가 확인하세요.`);
    }
    const next = advance(story, node.id, flags, choiceId);
    history.push({ sceneId: node.id, sender: node.sender, choiceId, choiceText: next.choice.text });
    node = next.node;
    flags = next.flags;
  }
  const background = sceneBackgroundAsset(presentation, node.id);
  return {
    title: story.title, storyId: story.storyId, version: story.version,
    node: { id: node.id, type: node.type, body: node.body,
      sender: node.type === 'letter' ? node.sender : endingLabel(story, node.endingId),
      endingId: node.type === 'ending' ? node.endingId : null },
    choices: availableChoices(node, flags).map(choice => ({ id: choice.id, text: choice.text })),
    flags, history,
    background: background ? { id: background.id, altText: background.altText,
      url: `/api/asset-preview?path=${encodeURIComponent(background.bundlePath)}&hash=${background.hash}` } : null,
  };
}

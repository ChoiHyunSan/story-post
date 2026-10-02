import { beforeEach, afterEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import LibraryScreen from '../../src/features/reader/LibraryScreen';
import { getGame } from '../../src/storage/native';
import { createCatalog, latestReleases } from '../../src/content/catalog';
import { advance, GameError, initialFlags } from '../../src/engine/story';
import type { Repository, Snapshot } from '../../src/storage/repository';

jest.mock('../../src/storage/native', () => ({ getGame: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const catalog = createCatalog(true).map(item => item.story.storyId === 'foundation-check'
  ? { ...item, showInLibrary: true }
  : item);
const release = catalog[0];
const openLabel = `${release.story.title} 이야기 열기`;
const mockRepository: jest.Mocked<Repository> = {
  register: jest.fn(), load: jest.fn(), start: jest.fn(), choose: jest.fn(),
  endings: jest.fn(), summary: jest.fn(), settings: jest.fn(), saveSettings: jest.fn(), reset: jest.fn(), inspect: jest.fn(),
};
function initial(target = release): Snapshot {
  return { release: target, flags: initialFlags(target.story), history: [], run: {
    playthrough_id: `ui-run-${target.story.storyId}`, story_id: target.story.storyId,
    content_version: target.story.version,
    current_node_id: target.story.startNodeId, status: 'active', revision: 0,
    created_at_ms: 1000, updated_at_ms: 1000, finished_at_ms: null,
  } };
}
function next(current: Snapshot, choiceId: string): Snapshot {
  const result = advance(current.release.story, current.run.current_node_id, current.flags, choiceId);
  return { ...current, flags: result.flags,
    run: { ...current.run, current_node_id: result.node.id, revision: current.run.revision + 1,
      status: result.node.type === 'ending' ? 'completed' : 'active' },
    history: [...current.history, { sequence: current.run.revision + 1,
      from_node_id: current.run.current_node_id, choice_id: choiceId, to_node_id: result.node.id }],
  };
}
async function openStory() {
  await render(<LibraryScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: openLabel }));
  await screen.findByRole('button', { name: '첫 편지 읽기' });
}
async function startStory() {
  await openStory();
  await fireEvent.press(screen.getByRole('button', { name: '첫 편지 읽기' }));
  await screen.findByRole('button', { name: '봉투를 열어 본다' });
}
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getGame).mockResolvedValue({ repository: mockRepository, catalog });
  mockRepository.settings.mockResolvedValue({ text_scale: 1, reduce_motion: 0 });
  mockRepository.load.mockResolvedValue(null);
  mockRepository.start.mockResolvedValue(initial());
  mockRepository.endings.mockResolvedValue([]);
  mockRepository.summary.mockResolvedValue({ run: null, endingIds: [] });
  mockRepository.saveSettings.mockResolvedValue(undefined);
  mockRepository.reset.mockResolvedValue(undefined);
  mockRepository.inspect.mockResolvedValue({ version: 1, counts: { playthrough: 1 } });
});
afterEach(() => { jest.restoreAllMocks(); });

test('first letter, conditional choice, ending and history form a complete reader flow', async () => {
  const middle = next(initial(), 'open'); const end = next(middle, 'read');
  mockRepository.choose.mockResolvedValueOnce(middle).mockResolvedValueOnce(end);
  await startStory();
  await fireEvent.press(screen.getByRole('button', { name: '봉투를 열어 본다' }));
  expect(await screen.findByRole('button', { name: '편지를 읽고 마친다' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '봉투를 간직하고 마친다' })).toBeNull();
  mockRepository.endings.mockResolvedValue([{ ending_id: 'letter-read', unlocked_at_ms: 1100 }]);
  await fireEvent.press(screen.getByRole('button', { name: '편지를 읽고 마친다' }));
  expect(await screen.findByText('엔딩을 보관했습니다.')).toBeOnTheScreen();
  expect(screen.getByText('수집한 엔딩 1개 · 선택 2회')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '수집한 결말 보기' }));
  expect(screen.getByRole('button', { name: '수집한 결말 닫기' }).props.accessibilityState)
    .toMatchObject({ expanded: true });
  expect(screen.getAllByText('편지를 읽었습니다. 첫 번째 기록이 보관함에 남았습니다.')).toHaveLength(2);
  await fireEvent.press(screen.getByRole('button', { name: '받은 편지 보기' }));
  expect(screen.getByText('1번째 기록')).toBeOnTheScreen();
  expect(screen.getByText('3번째 기록')).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: '수집한 결말' })).toBeNull();
});

test('latest little post office plays from its library card through the returned-letters ending', async () => {
  const little = latestReleases(catalog).find(item => item.story.storyId === 'little-post-office')!;
  expect(little.story.version).toBe(3);
  mockRepository.start.mockResolvedValue(initial(little));
  mockRepository.choose.mockImplementation(async (current, choiceId) => next(current, choiceId));
  await render(<LibraryScreen />);
  await fireEvent.press(await screen.findByRole('button',
    { name: `${little.story.title} 이야기 열기` }));
  await fireEvent.press(screen.getByRole('button', { name: '첫 편지 읽기' }));
  const openingBackground = screen.getByTestId('scene-background');
  expect(openingBackground.props.source).toBeTruthy();
  for (const choice of [
    '우선 내 이름이 적힌 편지를 받는다',
    '소라에게 편지를 보여 주고 함께 책방으로 간다',
    '소라와 함께 책방 안의 기록을 찾는다',
    '배달하지 못한 주소가 표시된 지도책을 읽는다',
    '답을 기다리지 않고 바닷길로 향한다',
    '소라와 보폭을 맞춰 등대 문을 연다',
    '지도와 우편함을 맞춰 배달하지 못한 주소를 정리한다',
    '편지를 열지 않고 수신인에게 돌려주기로 한다',
    '소라와 함께 열쇠를 돌린다',
    '소라와 함께 마지막 봉투를 꺼낸다',
    '장부와 마지막 편지를 우체국으로 가져간다',
  ]) {
    await fireEvent.press(await screen.findByRole('button', { name: choice }));
  }
  expect(await screen.findByText(/엔딩 · 다시 시작된 배달/)).toBeOnTheScreen();
  expect(screen.getByText('엔딩을 보관했습니다.')).toBeOnTheScreen();
  expect(mockRepository.choose).toHaveBeenCalledTimes(11);
});

test('restored progress opens the saved letter without starting another run', async () => {
  mockRepository.load.mockResolvedValue(next(initial(), 'wait'));
  await render(<LibraryScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: openLabel }));
  expect(await screen.findByRole('button', { name: '봉투를 간직하고 마친다' })).toBeOnTheScreen();
  expect(mockRepository.start).not.toHaveBeenCalled();
});

test('reader returns to the library without changing saved progress', async () => {
  await openStory();
  await fireEvent.press(screen.getByRole('button', { name: '이야기 목록으로' }));
  expect(await screen.findByRole('button', { name: openLabel })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '첫 편지 읽기' })).toBeNull();
  expect(mockRepository.start).not.toHaveBeenCalled();
});

test('library card identifies an active save and collected endings', async () => {
  mockRepository.summary.mockImplementation(async storyId => storyId === release.story.storyId
    ? { run: { content_version: 1, status: 'active', revision: 1, updated_at_ms: 1001 }, endingIds: ['letter-read'] }
    : { run: null, endingIds: [] });
  await render(<LibraryScreen />);
  expect(await screen.findByText('진행 중 · 선택 1회')).toBeOnTheScreen();
  expect(screen.getByText('약 1분')).toBeOnTheScreen();
  expect(screen.getByText('결말 1/2')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: `${release.story.title} 이어 읽기` })).toBeOnTheScreen();
});

test('library card identifies the latest completed run', async () => {
  mockRepository.summary.mockImplementation(async storyId => storyId === release.story.storyId
    ? { run: { content_version: 1, status: 'completed', revision: 2, updated_at_ms: 1002 },
      endingIds: ['letter-kept', 'letter-read'] }
    : { run: null, endingIds: [] });
  await render(<LibraryScreen />);
  expect(await screen.findByText('한 번 완주함')).toBeOnTheScreen();
  expect(screen.getByText('약 1분')).toBeOnTheScreen();
  expect(screen.getByText('결말 2/2')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: `${release.story.title} 마지막 결말 다시 보기` })).toBeOnTheScreen();
});

test('library card counts only endings that exist in the visible release', async () => {
  mockRepository.summary.mockImplementation(async storyId => storyId === release.story.storyId
    ? { run: null, endingIds: ['retired-ending', 'letter-read'] }
    : { run: null, endingIds: [] });
  await render(<LibraryScreen />);
  expect(await screen.findByText('약 1분')).toBeOnTheScreen();
  expect(screen.getByText('결말 1/2')).toBeOnTheScreen();
});

test('hidden technical content is omitted from the real development library', async () => {
  const developmentCatalog = createCatalog(true);
  const fixture = developmentCatalog.find(item => item.story.storyId === 'foundation-check')!;
  const visible = developmentCatalog.find(item => item.story.storyId === 'little-post-office' && item.story.version === 3)!;
  jest.mocked(getGame).mockResolvedValue({ repository: mockRepository, catalog: developmentCatalog });
  await render(<LibraryScreen />);
  expect(await screen.findByRole('button', { name: `${visible.story.title} 이야기 열기` })).toBeOnTheScreen();
  expect(screen.queryByText(fixture.story.title)).toBeNull();
  expect(mockRepository.summary).toHaveBeenCalledTimes(1);
});

test('an empty production catalog shows a useful empty state without summary queries', async () => {
  jest.mocked(getGame).mockResolvedValue({ repository: mockRepository, catalog: [] });
  await render(<LibraryScreen />);
  expect(await screen.findByRole('header', { name: '이야기를 준비하고 있어요.' })).toBeOnTheScreen();
  expect(screen.getByText('새로운 이야기가 도착하면 이곳에서 만날 수 있습니다.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '읽기 설정' })).toBeOnTheScreen();
  expect(mockRepository.summary).not.toHaveBeenCalled();
});

test('save in flight disables choices and does not advance until the commit resolves', async () => {
  let finish!: (value: Snapshot) => void;
  mockRepository.choose.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await startStory();
  await fireEvent.press(screen.getByRole('button', { name: '봉투를 열어 본다' }));
  expect(screen.getByRole('button', { name: '봉투를 열어 본다' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '봉투를 그대로 둔다' }));
  expect(mockRepository.choose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: '편지를 읽고 마친다' })).toBeNull();
  await act(async () => { finish(next(initial(), 'open')); });
  expect(await screen.findByRole('button', { name: '편지를 읽고 마친다' })).toBeEnabled();
});

test('save failure preserves the current letter and offers reloading saved progress', async () => {
  mockRepository.choose.mockRejectedValueOnce(new GameError('storage_failure'));
  await startStory();
  await fireEvent.press(screen.getByRole('button', { name: '봉투를 열어 본다' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/기록을 읽거나 저장하지 못했습니다/);
  expect(screen.getByRole('button', { name: '봉투를 열어 본다' })).toBeEnabled();
  mockRepository.load.mockResolvedValue(initial());
  await fireEvent.press(screen.getByRole('button', { name: '저장 기록 다시 불러오기' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: '봉투를 열어 본다' })).toBeEnabled();
});

test('invalid saves show recovery controls without overwriting the original automatically', async () => {
  mockRepository.load.mockRejectedValue(new GameError('invalid_save'));
  await render(<LibraryScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: openLabel }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/원본은 유지됩니다/);
  expect(screen.getByRole('button', { name: '저장 기록 다시 불러오기' })).toBeOnTheScreen();
  expect(mockRepository.start).not.toHaveBeenCalled();
});

test('invalid save recovery starts clean only after confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  mockRepository.load.mockRejectedValue(new GameError('invalid_save'));
  await render(<LibraryScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: openLabel }));
  await fireEvent.press(await screen.findByRole('button', { name: '새 기록으로 시작' }));
  expect(mockRepository.start).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => { buttons.find(button => button.text === '새로 시작')?.onPress?.(); });
  await waitFor(() => expect(mockRepository.start).toHaveBeenCalledWith(release, true));
  expect(await screen.findByRole('button', { name: '봉투를 열어 본다' })).toBeOnTheScreen();
});

test('startup failure can be retried', async () => {
  jest.mocked(getGame).mockRejectedValueOnce(new Error('database unavailable'));
  await render(<LibraryScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('button', { name: openLabel })).toBeOnTheScreen();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('font scale is saved before applying it to the letter', async () => {
  await startStory();
  await fireEvent.press(screen.getByRole('button', { name: '읽기 설정' }));
  expect(screen.getByRole('button', { name: '설정 닫기' }).props.accessibilityState)
    .toMatchObject({ expanded: true });
  expect(screen.getByRole('button', { name: '기본 크기' }).props.accessibilityState)
    .toMatchObject({ selected: true });
  await fireEvent.press(screen.getByRole('button', { name: '아주 크게 읽기' }));
  expect(mockRepository.saveSettings).toHaveBeenCalledWith({ text_scale: 1.5, reduce_motion: 0 });
  expect(screen.getByRole('button', { name: '아주 크게 읽기' }).props.accessibilityState)
    .toMatchObject({ selected: true });
  expect(screen.getByText(release.story.nodes[0].body)).toHaveStyle({ fontSize: 28.5, lineHeight: 48 });
});

test('failed font scale save keeps the previous rendered size', async () => {
  mockRepository.saveSettings.mockRejectedValueOnce(new GameError('storage_failure'));
  await startStory();
  await fireEvent.press(screen.getByRole('button', { name: '읽기 설정' }));
  await fireEvent.press(screen.getByRole('button', { name: '아주 크게 읽기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/기록을 읽거나 저장하지 못했습니다/);
  expect(screen.getByText(release.story.nodes[0].body)).toHaveStyle({ fontSize: 19, lineHeight: 32 });
});

test('reduce motion preference is saved before changing transition behavior', async () => {
  await render(<LibraryScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: '읽기 설정' }));
  await fireEvent.press(screen.getByRole('button', { name: '화면 움직임 줄이기 켜기' }));
  expect(mockRepository.saveSettings).toHaveBeenCalledWith(
    { text_scale: 1, reduce_motion: 1 });
  expect(await screen.findByText(/화면 전환 움직임 · 줄임/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '화면 움직임 줄이기 끄기' })).toBeOnTheScreen();
});

test('failed reduce motion save keeps the previous transition preference', async () => {
  mockRepository.saveSettings.mockRejectedValueOnce(new GameError('storage_failure'));
  await render(<LibraryScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: '읽기 설정' }));
  await fireEvent.press(screen.getByRole('button', { name: '화면 움직임 줄이기 켜기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/기록을 읽거나 저장하지 못했습니다/);
  expect(screen.getByText(/화면 전환 움직임 · 기본/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '화면 움직임 줄이기 켜기' })).toBeOnTheScreen();
});

test('reset is performed only after explicit confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await startStory();
  await fireEvent.press(screen.getByRole('button', { name: '읽기 설정' }));
  await fireEvent.press(screen.getByRole('button', { name: '이 기기의 모든 기록 지우기' }));
  expect(mockRepository.reset).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons.find(button => button.text === '취소')?.style).toBe('cancel');
  await act(async () => { buttons.find(button => button.text === '모두 지우기')?.onPress?.(); });
  await waitFor(() => expect(mockRepository.reset).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('button', { name: openLabel })).toBeOnTheScreen();
});

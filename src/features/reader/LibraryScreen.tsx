import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ImageBackground, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { libraryReleases, sceneBackgroundSource, type Release } from '../../content/catalog';
import { endingLabel, readingTimeLabel, storyPresentation } from '../../content/presentation';
import { availableChoices, GameError, nodeAt } from '../../engine/story';
import { getGame } from '../../storage/native';
import type { EndingUnlock, Settings, Snapshot, StorySummary } from '../../storage/repository';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';

type Game = Awaited<ReturnType<typeof getGame>>;
const storyTypeface = Platform.select({ ios: 'New York', android: 'serif' });
const errors = {
  invalid_save: '저장 기록을 확인할 수 없습니다. 원본은 유지됩니다. 다시 불러오거나 새로 시작해주세요.',
  invalid_content: '작품 데이터를 읽을 수 없습니다.',
  incompatible_content: '이 기록에 필요한 작품 버전을 찾을 수 없습니다. 기록은 보존되어 있습니다.',
  invalid_choice: '지금 선택할 수 없는 항목입니다.',
  stale_revision: '저장된 진행이 바뀌었습니다. 작품을 다시 열어 이어주세요.',
  storage_failure: '기록을 읽거나 저장하지 못했습니다. 다시 불러와 확인해주세요.',
};
export default function LibraryScreen() {
  const [game, setGame] = useState<Game | null>(null);
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<Release | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endings, setEndings] = useState<EndingUnlock[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showEndings, setShowEndings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, StorySummary>>({});
  const locked = useRef(false);
  const scroll = useRef<ScrollView>(null);

  async function perform(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { await work(); }
    catch (error: unknown) { setError(error instanceof GameError ? errors[error.code] : errors.storage_failure); }
    finally { locked.current = false; setBusy(false); }
  }
  async function initialize() {
    await perform(async () => {
      const next = await getGame();
      const preferences = await next.repository.settings();
      const entries = await Promise.all(libraryReleases(next.catalog).map(async release =>
        [release.story.storyId, await next.repository.summary(release.story.storyId)] as const));
      setGame(next); setSettings(preferences); setSummaries(Object.fromEntries(entries));
    });
  }
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const next = await getGame();
        const preferences = await next.repository.settings();
        const entries = await Promise.all(libraryReleases(next.catalog).map(async release =>
          [release.story.storyId, await next.repository.summary(release.story.storyId)] as const));
        if (!cancelled) { setGame(next); setSettings(preferences); setSummaries(Object.fromEntries(entries)); }
      } catch (error: unknown) {
        if (!cancelled) setError(error instanceof GameError ? errors[error.code] : errors.storage_failure);
      } finally { if (!cancelled) setBusy(false); }
    }
    void boot();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: settings?.reduce_motion !== 1 }); },
    [current?.run.current_node_id, selected, settings?.reduce_motion]);

  async function open(release: Release) {
    if (!game) return;
    await perform(async () => {
      setSelected(release); setCurrent(null); setShowHistory(false); setShowEndings(false); setReport(null);
      const saved = await game.repository.load(release.story.storyId);
      setCurrent(saved);
      setEndings(await game.repository.endings(release.story.storyId));
    });
  }
  async function start(restart: boolean) {
    if (!game || !selected) return;
    await perform(async () => {
      const next = await game.repository.start(selected, restart);
      setCurrent(next); setShowHistory(false); setShowEndings(false);
      setSummaries(value => ({ ...value, [selected.story.storyId]: {
        run: { content_version: next.run.content_version, status: next.run.status,
          revision: next.run.revision, updated_at_ms: next.run.updated_at_ms },
        endingIds: value[selected.story.storyId]?.endingIds ?? [],
      } }));
    });
  }
  function restart() {
    Alert.alert('처음부터 시작할까요?', '현재 진행을 마치고 새 기록을 만듭니다. 수집한 엔딩은 유지됩니다.', [
      { text: '취소', style: 'cancel' }, { text: '새로 시작', onPress: () => { void start(true); } },
    ]);
  }
  async function choose(choiceId: string) {
    if (!game || !current) return;
    await perform(async () => {
      const next = await game.repository.choose(current, choiceId);
      setCurrent(next);
      const endingRows = await game.repository.endings(next.run.story_id);
      setEndings(endingRows);
      setSummaries(value => ({ ...value, [next.run.story_id]: {
        run: { content_version: next.run.content_version, status: next.run.status,
          revision: next.run.revision, updated_at_ms: next.run.updated_at_ms },
        endingIds: endingRows.map(ending => ending.ending_id),
      } }));
    });
  }
  async function changeScale(value: number) {
    if (!game || !settings) return;
    await perform(async () => {
      const next = { ...settings, text_scale: value };
      await game.repository.saveSettings(next); setSettings(next);
    });
  }
  async function changeReduceMotion(value: number) {
    if (!game || !settings) return;
    await perform(async () => {
      const next = { ...settings, reduce_motion: value };
      await game.repository.saveSettings(next); setSettings(next);
    });
  }
  function reset() {
    Alert.alert('모든 기록을 지울까요?', '이 기기의 플레이·수집한 엔딩·설정이 삭제됩니다. 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' }, { text: '모두 지우기', style: 'destructive', onPress: () => {
        void perform(async () => {
          if (!game) return;
          await game.repository.reset(); setCurrent(null); setSelected(null); setEndings([]); setReport(null); setSummaries({});
          setSettings(await game.repository.settings());
        });
      } },
    ]);
  }
  const node = current ? nodeAt(current.release.story, current.run.current_node_id) : null;
  const sceneBackground = current && node ? sceneBackgroundSource(current.release, node.id) : undefined;
  const scale = settings?.text_scale ?? 1;
  return <SafeAreaView style={styles.safe}>
    <ScrollView ref={scroll} contentContainerStyle={styles.container}>
      <View style={styles.top}>
        <View style={styles.postmark}><Text style={styles.postmarkText}>우</Text></View>
        <View style={styles.brandCopy}><Text style={styles.brand}>이야기 우편함</Text><Text style={styles.topCaption}>당신의 선택이 남는 곳</Text></View>
      </View>
      {busy && <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.primary} /><Text>기록을 처리하는 중…</Text></View>}
      {error && <View style={styles.error}><Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text>
        {!game && <Button title="다시 시도" disabled={busy} onPress={() => { void initialize(); }} />}
      </View>}
      {!selected ? <>
        <View style={styles.intro}><Text accessibilityRole="header" style={styles.title}>도착한 이야기</Text>
          <Text style={styles.subtitle}>봉투를 열면 이야기가 시작됩니다. 선택은 이 기기에만 남습니다.</Text>
        </View>
        {game && libraryReleases(game.catalog).map(release => {
          const presentation = storyPresentation(release.story);
          const summary = summaries[release.story.storyId];
          const currentEndingIds = new Set(release.story.nodes
            .filter(node => node.type === 'ending').map(node => node.endingId));
          const collectedEndingCount = summary?.endingIds.filter(endingId => currentEndingIds.has(endingId)).length ?? 0;
          const action = summary?.run?.status === 'active' ? '이어 읽기'
            : summary?.run?.status === 'completed' ? '마지막 결말 다시 보기' : '이야기 열기';
          const progress = summary?.run?.status === 'active' ? `진행 중 · 선택 ${summary.run.revision}회`
            : summary?.run?.status === 'completed' ? '한 번 완주함' : '아직 시작하지 않음';
          const coverImage = sceneBackgroundSource(release, release.story.startNodeId);
          return <ImageBackground key={release.story.storyId} source={coverImage} accessible={false}
            imageStyle={styles.coverImage} style={styles.cover} resizeMode="cover">
            <View style={styles.coverTop}><Text style={styles.coverKicker}>{release.developmentOnly ? '원고 검토 중' : '새 이야기'}</Text>
              <View style={styles.chapterMark}><Text style={styles.chapterMarkText}>첫 번째 편지</Text></View>
            </View>
            <View style={styles.coverCopy}>
              <Text accessibilityRole="header" style={styles.coverTitle}>{release.story.title}</Text>
              <Text style={styles.coverDescription}>{release.story.description}</Text>
              <View style={styles.coverMetaRow}><Text style={styles.coverMeta}>{readingTimeLabel(presentation)}</Text>
                <Text style={styles.coverMeta}>결말 {collectedEndingCount}/{presentation.endingCount}</Text>
                <Text accessibilityLiveRegion="polite" style={styles.coverProgress}>{progress}</Text></View>
              <Button title={action} accessibilityLabel={`${release.story.title} ${action}`}
                disabled={busy} onPress={() => { void open(release); }} />
            </View>
          </ImageBackground>;
        })}
        {game && libraryReleases(game.catalog).length === 0 && <View style={styles.panel}><Text accessibilityRole="header" style={styles.cardTitle}>이야기를 준비하고 있어요.</Text><Text style={styles.description}>새로운 이야기가 도착하면 이곳에서 만날 수 있습니다.</Text></View>}
      </> : <>
        <Button title="이야기 목록으로" secondary disabled={busy} onPress={() => {
          setSelected(null); setCurrent(null); setError(null); setShowHistory(false); setShowEndings(false);
        }} />
        <View style={styles.readerHeading}><Text style={styles.readerKicker}>받은 편지</Text>
          <Text accessibilityRole="header" style={styles.readerTitle}>{current?.release.story.title ?? selected.story.title}</Text></View>
        {node ? <ImageBackground source={sceneBackground} accessible={false} resizeMode="cover"
          testID={sceneBackground ? 'scene-background' : undefined}
          imageStyle={styles.sceneImage}
          style={[styles.sceneFrame, sceneBackground ? styles.sceneFrameWithArtwork : undefined]}>
          <View style={styles.letter}>
          <View style={styles.letterHeader}><Text style={styles.paperLabel}>{node.type === 'letter' ? `보낸 이  ${node.sender}` : '이야기의 끝'}</Text>
            <View style={styles.stamp}><Text style={styles.stampText}>{node.type === 'ending' ? '완료' : `${current ? current.run.revision + 1 : 1}`}</Text></View></View>
          <Text selectable style={[styles.body, { fontSize: 19 * scale, lineHeight: 32 * scale }]}>{node.body}</Text>
          {current && availableChoices(node, current.flags).map(choice => <Button key={choice.id} title={choice.text}
            choice disabled={busy} onPress={() => { void choose(choice.id); }} />)}
          <Text style={styles.paperCaption}>{current?.run.status === 'completed' ? '엔딩을 보관했습니다.' : '여기까지 자동 저장되었습니다.'}</Text>
          </View>
        </ImageBackground> : <View style={styles.panel}><Text style={styles.description}>편지를 읽고 답을 고르세요. 언제든 멈췄다가 이어갈 수 있습니다.</Text>
          <Button title={error ? '새 기록으로 시작' : '첫 편지 읽기'} disabled={busy} onPress={() => { if (error) restart(); else void start(false); }} />
          {error && <Button title="저장 기록 다시 불러오기" secondary disabled={busy} onPress={() => { void open(selected); }} />}
        </View>}
        {current && <>
          {error && <Button title="저장 기록 다시 불러오기" secondary disabled={busy} onPress={() => { void open(selected); }} />}
          <Text style={styles.small}>수집한 엔딩 {endings.length}개 · 선택 {current.run.revision}회</Text>
          <Button title={showEndings ? '수집한 결말 닫기' : '수집한 결말 보기'} secondary disabled={busy}
            expanded={showEndings}
            onPress={() => { setShowEndings(value => !value); setShowHistory(false); }} />
          {showEndings && <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.cardTitle}>수집한 결말</Text>
            {endings.length === 0
              ? <Text style={styles.description}>아직 수집한 결말이 없습니다.</Text>
              : endings.map((ending, index) => <View key={ending.ending_id} style={styles.endingRow}>
                <Text style={styles.label}>결말 {index + 1}</Text>
                <Text style={styles.description}>{endingLabel(current.release.story, ending.ending_id)}</Text>
              </View>)}
          </View>}
          <Button title={showHistory ? '편지 기록 닫기' : '받은 편지 보기'} secondary disabled={busy}
            expanded={showHistory}
            onPress={() => { setShowHistory(value => !value); setShowEndings(false); }} />
          {showHistory && [current.release.story.startNodeId, ...current.history.map(item => item.to_node_id)].map((nodeId, index) => {
            const savedNode = nodeAt(current.release.story, nodeId);
            return <View key={`${nodeId}-${index}`} style={styles.historyLetter}><Text style={styles.paperLabel}>{index + 1}번째 기록</Text>
              <Text style={[styles.paperDescription, { fontSize: 16 * scale, lineHeight: 26 * scale }]}>{savedNode.body}</Text></View>;
          })}
          <Button title="처음부터 다시 시작" secondary disabled={busy} onPress={restart} />
        </>}
      </>}
      {game && <>
        <Button title={showSettings ? '설정 닫기' : '읽기 설정'} secondary disabled={busy} expanded={showSettings}
          onPress={() => setShowSettings(!showSettings)} />
        {showSettings && <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.cardTitle}>읽기 설정</Text>
          <Text style={styles.description}>본문 크기 · {Math.round(scale * 100)}%
기기의 글자 크기 설정도 함께 적용됩니다.
화면 전환 움직임 · {settings?.reduce_motion === 1 ? '줄임' : '기본'}</Text>
          <Button title="기본 크기" secondary selected={scale === 1} disabled={busy || scale === 1} onPress={() => { void changeScale(1); }} />
          <Button title="크게 읽기" secondary selected={scale === 1.25} disabled={busy || scale === 1.25} onPress={() => { void changeScale(1.25); }} />
          <Button title="아주 크게 읽기" secondary selected={scale === 1.5} disabled={busy || scale === 1.5} onPress={() => { void changeScale(1.5); }} />
          <Button title={settings?.reduce_motion === 1 ? '화면 움직임 줄이기 끄기' : '화면 움직임 줄이기 켜기'}
            secondary disabled={busy} onPress={() => { void changeReduceMotion(settings?.reduce_motion === 1 ? 0 : 1); }} />
          <Button title="이 기기의 모든 기록 지우기" secondary disabled={busy} onPress={reset} />
        </View>}
        {__DEV__ && <>
          <Button title={report ? '개발 데이터 닫기' : '개발 데이터 확인'} secondary disabled={busy}
            expanded={Boolean(report)} onPress={() => {
            if (report) setReport(null);
            else void perform(async () => {
              const data = await game.repository.inspect();
              setReport(`DB 스키마 v${data.version}\n` + Object.entries(data.counts).map(([name, count]) => `${name}: ${count}행`).join('\n'));
            });
          }} />
          {report && <View style={styles.panel}><Text selectable style={styles.description}>{report}</Text><Text style={styles.small}>개발 빌드에서만 표시되는 읽기 전용 정보입니다.</Text></View>}
        </>}
      </>}
      <Text style={styles.footer}>기록은 이 기기에만 보관됩니다.
앱 삭제 또는 기기 변경 시 복원을 지원하지 않습니다.</Text>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 52, gap: 18, width: '100%', maxWidth: 680, alignSelf: 'center' },
  top: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: colors.divider },
  postmark: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-7deg' }] },
  postmarkText: { color: colors.primary, fontSize: 19, fontWeight: '700', fontFamily: storyTypeface },
  brandCopy: { gap: 2 },
  brand: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.heading },
  topCaption: { fontSize: 12, lineHeight: 18, color: colors.muted },
  intro: { gap: 9, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 34, lineHeight: 43, fontWeight: '700', color: colors.heading, fontFamily: storyTypeface },
  subtitle: { maxWidth: 430, fontSize: 15, lineHeight: 24, color: colors.body },
  cover: { minHeight: 548, justifyContent: 'space-between', overflow: 'hidden', borderRadius: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  coverImage: { borderRadius: 4 },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 18, backgroundColor: 'rgba(7,22,31,0.34)' },
  coverKicker: { color: colors.heading, fontSize: 13, lineHeight: 20, fontWeight: '700', textShadowColor: colors.canvas, textShadowRadius: 6 },
  chapterMark: { borderWidth: 1, borderColor: 'rgba(243,235,221,0.72)', paddingHorizontal: 10, paddingVertical: 5 },
  chapterMarkText: { color: colors.heading, fontSize: 11, lineHeight: 16 },
  coverCopy: { gap: 14, padding: 22, paddingTop: 72, backgroundColor: 'rgba(7,22,31,0.90)' },
  coverTitle: { color: colors.heading, fontSize: 29, lineHeight: 39, fontWeight: '700', fontFamily: storyTypeface },
  coverDescription: { color: colors.body, fontSize: 15, lineHeight: 24 },
  coverMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  coverMeta: { color: colors.primary, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  coverProgress: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  readerHeading: { gap: 7, paddingVertical: 10 },
  readerKicker: { color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  readerTitle: { color: colors.heading, fontSize: 27, lineHeight: 37, fontWeight: '700', fontFamily: storyTypeface },
  panel: { backgroundColor: colors.surface, padding: 20, borderRadius: 4, gap: 15, borderWidth: 1, borderColor: colors.border },
  letter: { backgroundColor: colors.paper, paddingHorizontal: 22, paddingVertical: 25, borderRadius: 2, gap: 20, borderWidth: 1, borderColor: colors.paperBorder },
  sceneFrame: { borderRadius: 4, overflow: 'hidden' },
  sceneFrameWithArtwork: { paddingTop: 180, backgroundColor: colors.surface },
  sceneImage: { borderRadius: 4 },
  letterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.paperBorder, paddingBottom: 16 },
  stamp: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#8F5548', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '7deg' }] },
  stampText: { color: '#7B4339', fontSize: 11, fontWeight: '700' },
  paperLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.paperMuted, lineHeight: 21 },
  paperCaption: { fontSize: 12, lineHeight: 19, color: colors.paperMuted, textAlign: 'right' },
  historyLetter: { backgroundColor: colors.paper, padding: 20, borderRadius: 2, gap: 12, borderWidth: 1, borderColor: colors.paperBorder },
  label: { fontSize: 13, fontWeight: '700', color: colors.label, lineHeight: 21 },
  cardTitle: { fontSize: 22, lineHeight: 31, fontWeight: '700', color: colors.heading, fontFamily: storyTypeface },
  description: { fontSize: 16, lineHeight: 26, color: colors.body },
  paperDescription: { fontSize: 16, lineHeight: 26, color: colors.readingText, fontFamily: storyTypeface },
  endingRow: { gap: 4, paddingVertical: 4 },
  body: { color: colors.readingText, paddingVertical: 6, fontFamily: storyTypeface },
  small: { fontSize: 13, lineHeight: 21, color: colors.muted },
  footer: { fontSize: 12, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: 16 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  error: { backgroundColor: colors.errorSurface, borderRadius: 4, padding: 16, gap: 12, borderWidth: 1, borderColor: '#744149' },
  errorText: { color: colors.errorText, fontSize: 15, lineHeight: 24 },
});

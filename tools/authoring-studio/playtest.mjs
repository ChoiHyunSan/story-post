export function createPlaytestSession() {
  return { run:null,snapshot:null,context:null,choiceIds:[],wasUnsaved:false,busy:false,sequence:0,error:'' };
}

export function isPlaytestCurrent(session, playtest) {
  const context = playtest.context;
  return !!context && !!session.current && !session.isLoading && !session.isRestoring &&
    context.directory === session.current.entry.directory && context.revision === session.revision &&
    context.loadSequence === session.loadSequence;
}

export async function previewDocument(session, playtest, choiceIds, restart, preview) {
  if (!session.current || playtest.busy || session.isLoading || session.isRestoring) return 'skipped';
  if (restart) {
    Object.assign(playtest,{ run:null,choiceIds:[],snapshot:structuredClone(session.current.tables),wasUnsaved:session.dirty,
      context:{directory:session.current.entry.directory,revision:session.revision,loadSequence:session.loadSequence} });
  }
  if (!isPlaytestCurrent(session,playtest)) return 'skipped';
  const context = playtest.context;
  const sequence = ++playtest.sequence;
  const path = [...choiceIds];
  const isCurrent = () => sequence === playtest.sequence && isPlaytestCurrent(session,playtest);
  playtest.busy = true;
  playtest.error = '';
  try {
    const run = await preview(context.directory,playtest.snapshot,path);
    if (!isCurrent()) return 'stale';
    playtest.run = structuredClone(run);
    playtest.choiceIds = path;
    return 'previewed';
  } catch (error) {
    if (!isCurrent()) return 'stale';
    playtest.error = error instanceof Error ? error.message : '원고 미리보기를 만들지 못했습니다.';
    throw error;
  } finally {
    if (sequence === playtest.sequence) playtest.busy = false;
  }
}

export function exportPlaytest(session, playtest) {
  if (!playtest.run || playtest.busy || !isPlaytestCurrent(session,playtest)) {
    throw new Error('현재 원고로 미리보기를 시작한 뒤 플레이 경로를 내보내세요.');
  }
  const work = playtest.snapshot.story_work[0];
  return JSON.stringify({ format:'story-post-playtest',version:1,
    work:{storyId:work.story_id,workingVersion:Number(work.working_version),locale:work.locale},
    wasUnsaved:playtest.wasUnsaved,revision:playtest.run.revision,previewedAt:playtest.run.previewedAt,
    choiceIds:playtest.choiceIds,node:playtest.run.node,flags:playtest.run.flags,history:playtest.run.history,
    tables:playtest.snapshot },null,2);
}

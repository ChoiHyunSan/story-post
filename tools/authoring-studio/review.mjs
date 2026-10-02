export function createReviewSession() {
  return { result:null, busy:false, sequence:0, error:'' };
}

export function isReviewCurrent(session, review) {
  const context = review.result?.context;
  return !!context && !!session.current && !session.isLoading &&
    context.directory === session.current.entry.directory && context.revision === session.revision &&
    context.loadSequence === session.loadSequence;
}

export async function validateReview(session, review, validate) {
  if (!session.current || review.busy || session.isLoading || session.isRestoring) return 'skipped';
  const current = session.current;
  const context = { directory:current.entry.directory, revision:session.revision, loadSequence:session.loadSequence };
  const tables = structuredClone(current.tables);
  const wasUnsaved = session.dirty;
  const sequence = ++review.sequence;
  const isCurrent = () => session.current === current && session.revision === context.revision &&
    session.loadSequence === context.loadSequence && sequence === review.sequence;
  review.busy = true;
  review.error = '';
  try {
    const validation = await validate(context.directory,tables);
    if (!isCurrent()) return 'stale';
    review.result = { context,tables,wasUnsaved,validation };
    return 'validated';
  } catch (error) {
    if (!isCurrent()) return 'stale';
    review.error = error.message;
    throw error;
  } finally {
    if (sequence === review.sequence) review.busy = false;
  }
}

export function exportReview(session, review) {
  if (!isReviewCurrent(session,review) || review.busy) throw new Error('현재 원고를 검사한 뒤 검수 기록을 내보내세요.');
  const { tables,wasUnsaved,validation } = review.result;
  const work = tables.story_work[0];
  return JSON.stringify({ format:'story-post-review',version:1,
    work:{ storyId:work.story_id,workingVersion:Number(work.working_version),locale:work.locale },
    wasUnsaved, ...validation,tables },null,2);
}

export async function cloneAndRefresh(payload, publish, refresh) {
  const entry = await publish(payload);
  try {
    await refresh(entry);
    return {entry,refreshError:null};
  } catch (error) {
    return {entry,refreshError:error instanceof Error ? error.message : '작품 목록을 갱신하지 못했습니다.'};
  }
}


export function canOpenClone(session, context) {
  return !!session.current && session.current === context.current && session.revision === context.revision &&
    session.loadSequence === context.loadSequence && !session.dirty && !session.isLoading && !session.isRestoring;
}

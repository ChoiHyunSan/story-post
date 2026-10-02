export function createConnectionSession() {
  return {settings:null,error:'',sequence:0,isLoading:false,isWriting:false};
}

export async function requestConnection(session, request, isWriting = false) {
  if (session.isWriting) return 'skipped';
  const sequence = ++session.sequence;
  session.isLoading = !isWriting;
  session.isWriting = isWriting;
  session.error = '';
  try {
    const settings = await request();
    if (sequence !== session.sequence) return 'stale';
    session.settings = settings;
    return 'applied';
  } catch (error) {
    if (sequence !== session.sequence) return 'stale';
    session.error = error instanceof Error ? error.message : 'AI 연결 설정을 확인하지 못했습니다. 다시 시도하세요.';
    return 'failed';
  } finally {
    if (sequence === session.sequence) {
      session.isLoading = false;
      session.isWriting = false;
    }
  }
}

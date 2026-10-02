const storyErrors: Record<string,string> = {
  Cycle: '장면 연결이 순환합니다. 앞선 장면으로 되돌아가는 연결을 바꾸세요.',
  'Unused flag': '어느 선택에서도 사용하지 않는 상태값이 있습니다. 조건·효과와 상태값 정의를 확인하세요.',
  'Conditions make nodes unreachable': '선택 조건 때문에 도달할 수 없는 장면이 있습니다. 상태값의 기본값과 선택 효과를 확인하세요.',
  'Conditions make choices unreachable': '어떤 경로에서도 고를 수 없는 선택지가 있습니다. 조건과 상태값 변화를 확인하세요.',
  'State budget exceeded; simplify branches': '검사할 분기 조합이 너무 많습니다. 상태값과 조건을 단순하게 정리하세요.',
};
const presentationErrors = [
  ['Ready asset lacks hash or rights: ', '에셋의 파일 해시와 권리자·이용 권리를 입력하세요.'],
  ['Asset hash differs: ', '실제 파일과 에셋 SHA-256이 다릅니다. 파일을 확인하고 해시를 갱신하세요.'],
  ['Asset file is missing or unreadable: ', '에셋 파일을 찾거나 읽을 수 없습니다. 파일 위치를 확인하세요.'],
  ['Presentation cue channel differs from asset type: ', '연출 종류와 에셋 종류가 다릅니다.'],
  ['Presentation action is invalid for channel: ', '연출 종류에 맞지 않는 동작입니다.'],
  ['Visual presentation cue cannot use volume or loop: ', '이미지 연출에는 음량이나 반복 재생을 사용할 수 없습니다.'],
] as const;

export function studioErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '제작실 요청을 처리하지 못했습니다.';
  if (Object.hasOwn(storyErrors,message)) return storyErrors[message];
  if (message.startsWith('Dead end: ')) return `진행할 수 있는 선택지가 없는 장면입니다: ${message.slice('Dead end: '.length)}. 선택 조건을 확인하세요.`;
  for (const [prefix, description] of presentationErrors) {
    if (message.startsWith(prefix)) return `${description} 대상 ${message.slice(prefix.length)}의 설정을 확인하세요.`;
  }
  return message;
}

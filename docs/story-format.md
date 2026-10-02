# 스토리 규격 v1과 콘텐츠 패키지 v2

실행되는 단일 기준은 src/engine/story.ts의 Zod 스키마와 검증기다.
예시는 content/fixtures/foundation.json, 등록 목록은 content/manifest.json이다.
편집기용 content/story.schema.json은 같은 Zod 계약에서 생성하며 직접 수정하지 않는다.

현재 단계에서는 JSON을 직접 작성하지만, 제작 파이프라인을 도입하면 JSON은 편집 원본이 아니라
[콘텐츠 제작 원장](content-authoring-plan.md)에서 생성하는 런타임 산출물이 된다. 작가와 기획자는
장면·본문 블록·선택·에셋·연출 큐를 테이블로 관리하고, 앱은 검증과 승인을 통과한 고정 패키지만 읽는다.
v1 규격은 원장을 도입하는 동안에도 현재 게임 진행 엔진의 출력 계약으로 유지한다.

콘텐츠 패키지 v2는 스토리 규격 v1과 presentation 규격 v1을 한 manifest 항목으로 묶는다.
`content/presentation.schema.json`은 `src/content/presentation-package.ts`의 Zod 계약에서 생성한다.
presentation은 다음을 포함한다.

- `assets`: 안정적인 asset ID, background/portrait/overlay/bgm/sfx/voice 유형, 번들 경로,
  SHA-256, 대체 설명과 선택적인 재생 시간.
- `cues`: scene과 선택적인 block/choice 대상, 실행 trigger, channel/action, 실행 순서,
  fade·volume·loop·duration 값.
- 빌드 검증: 없는 장면·선택·에셋, 중복 cue 순서, channel과 asset 유형 불일치,
  action의 에셋 유무 오류, 파일 누락과 hash 불일치를 거부한다.
- 런타임: 현재 `scene_enter`의 background 표시를 지원한다. BGM·SFX·voice 계약은 파싱하지만
  실제 오디오 재생은 음원과 설정·앱 중단 정책을 함께 도입할 때 연결한다.

presentation 파일은 `content/presentations.lock.json`에 별도로 잠근다. 개발 전용 작품의
정적 require는 개발 에셋 모듈에만 생성하며 프로덕션 Hermes 번들에서 파일까지 제외한다.

- storyId: 소문자 kebab-case ID. 표시 제목이 바뀌어도 유지한다.
- version: 작품의 불변 양의 정수 버전. 원문 바이트가 바뀌면 증가시킨다.
- schemaVersion / engineContractVersion: 현재 모두 1만 지원한다.
- locale: 초기에는 ko. title/description은 목록 화면에 사용한다.
- startNodeId: letter 노드 하나를 가리킨다.
- flags: id와 defaultValue(boolean) 목록. 최대 12개.
- nodes: letter/ending 노드 2~200개. body는 일반 텍스트다.
- letter: sender, body, choices(1~8개).
- choice: id, text, nextNodeId, requires, effects. 빈 조건/효과도 배열로 명시한다.
- requires: {flagId, equals} 배열. 모든 조건이 일치해야 선택 가능하다.
- effects: {flagId, setValue} 배열. 선택이 저장될 때만 적용한다.
- ending: endingId, body. 선택지가 없으며 종료를 뜻한다.

ID는 [a-z][a-z0-9-]{0,63}. 정의되지 않은 속성/flag, 조건·효과에서 한 번도 사용하지 않은 flag, 중복 ID, 없는 대상,
순환, 분기 조건상 도달 불가능한 노드/엔딩/선택지, 선택 불가능한 도달 상태는 거부한다.
제목·설명·보낸 이·본문·선택지는 공백·제어·제로폭 문자가 아닌 표시 문자를 포함해야 한다. 같은 장면의 선택지는
Unicode NFKC 정규화 후 공백·제어·제로폭 문자를 정리한 표시 문구가 서로 달라야 스크린리더와 화면에서 구분할 수 있다.
상태 탐색은 최대 50,000개로 제한하며 초과하면 분기를 단순화해야 한다.

`pnpm content:inspect`는 작품별 노드·편지·선택·엔딩·상태·글자 수·경로 기반 예상 시간을 요약하고,
각 엔딩에 도달하는 최소 선택 경로를 `nodeId:choiceId` 순서로 출력한다. 원고 연결 전
의도한 결말이 모두 나오고 최단 경로가 지나치게 짧거나 잘못된 분기를 타지 않는지 확인한다.

content/drafts/little-post-office/opening.concept.json은 이전 기획 샘플이다.
현재 v1 실행 규격이 아니며 manifest에 등록하거나 앱 번들에 포함하지 않는다.
[제작 원장](content-authoring-plan.md), [관리 절차](data-management.md)와
[저장 계약](data-design.md)을 함께 따른다.

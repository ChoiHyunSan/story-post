# AI 콘텐츠 제작 파이프라인

## 범위

AI는 플레이 중인 사용자와 실시간으로 대화하지 않는다. 로컬 콘텐츠 제작실에서 작가가 명시적으로
요청할 때만 원고·선택지·이미지 방향·사운드 cue·연속성 검수 제안을 만든다. 결과는 draft 제안이며
`AI 제안 만들기 → 내용 검토 → 초안에 적용 → 전체 원장 검증 → 저장`을 모두 거쳐야 제작 원장에
들어간다.

```text
현재 작업본 + 선택 장면 + 작가 요청
  → 서버 전용 AI 어댑터
  → 버전이 고정된 프롬프트
  → Structured Outputs 계약
  → 읽기 전용 제안
  → 작가가 초안에 적용
  → 기존 SQLite/분기/에셋 검사
  → CSV 작업 원장 저장
```

이미지 작업은 연출안을 바로 파일로 확정하지 않고 다음 단계를 추가로 거친다.

```text
구조화된 이미지 연출안
  → 비주얼 바이블 + 에셋 유형 preset으로 최종 프롬프트 조합
  → 빠른 시안(low) 또는 고품질 후보(high) 생성
  → .authoring/image-runs에서 구도·여백·문자·연속성 검수
  → 선택한 결과만 assets/generated로 채택
  → SHA-256·모델·품질·run ID를 asset 원장에 기록
  → 전체 presentation/asset 검증 후 저장
```

## 보안과 데이터 경계

- 제작실 상단 `AI 설정`에서 입력한 Platform 프로젝트 API 키는 localhost Node 서버가 macOS 로그인
  Keychain의 `story-post.authoring.openai` 서비스에 저장한다. 브라우저 저장소와 프로젝트 파일에는
  저장하지 않으며, API 응답은 저장 위치와 마스킹된 끝 네 자리만 반환한다.
- `OPENAI_API_KEY` 환경변수도 지원하며 Keychain보다 우선한다. 환경변수 키는 설정 화면에서 삭제하지 않는다.
- ChatGPT·Codex 로그인 세션과 Codex 로컬 access token은 일반 OpenAI API 인증으로 재사용하지 않는다.
- `EXPO_PUBLIC_*` 환경변수에 API 키를 넣지 않는다.
- AI 버튼을 누를 때 작품 제목·설명, 선택 장면, 앞뒤 장면, 플래그, 연결된 에셋과 cue가 제공자에게
  전송된다. 연속성 검수는 전체 장면을 전송한다.
- 사용자 입력과 원고는 `<author_request>`, `<story_context>` 경계 안의 참고 자료로 표시한다.
  그 안의 명령문은 프롬프트 지침으로 따르지 않게 명시한다.
- API 응답은 `.authoring/ai-runs`에 모델·프롬프트 버전·작업·결과와 함께 기록한다. 이 디렉터리는
  Git에서 제외된다.
- 이미지 바이너리와 생성 기록은 `.authoring/image-runs`에 먼저 저장하며 UUID로 발급한 run ID로만
  미리보기를 읽는다. 임의 파일 경로는 API로 받지 않는다.
- 에셋 채택은 기존 파일을 덮어쓰지 않고 `asset-id-runid` 파일을 만든다. 생성 프롬프트·모델·품질과
  SHA-256을 남겨 나중에 어떤 결과를 선택했는지 추적한다.
- released 원장에서는 AI 호출과 적용을 막는다. 새 working version을 만든 뒤 사용한다.

## 생성 계약

`scripts/ai-content.ts`의 Zod 스키마가 원고, 이미지, 사운드, 검수 결과를 하나의 제안 구조로
고정한다. OpenAI Responses API의 Structured Outputs와 같은 Zod 스키마를 사용해 런타임 타입과
JSON Schema가 어긋나지 않게 한다.

| 작업 | 제안 결과 | 적용 방식 |
| --- | --- | --- |
| 장면 다시 쓰기 | 기존 scene ID, 본문 블록, 선택지 | 같은 ID는 갱신하고 새 ID만 추가 |
| 선택지 확장 | 의도와 비용이 다른 선택지 | 존재하는 next scene만 허용 |
| 이미지 연출안 | 목적, 주체, 구도, 빛, 팔레트, continuity anchor, 피할 요소, alt text, cue | 연출안 적용 시 planned asset/cue, 이미지 채택 시 ready asset으로 갱신 |
| 사운드 연출안 | BGM/SFX/voice 프롬프트, 음량, loop, cue | planned asset/cue로 추가 |
| 연속성 검수 | 심각도·분류·장면·수정 제안 | 자동 적용하지 않고 검토만 표시 |

사운드 연출안과 아직 생성하지 않은 이미지 연출안은 source path와 권리 상태가 `planned`,
`pending review`로 시작한다. 이미지 생성 버튼은 OpenAI Image API를 서버에서만 호출한다. 생성된
결과를 눈으로 확인해 `이 이미지를 에셋으로 채택`해야 `ready`와 실제 source path, hash가 들어간다.
채택 후에도 원장을 저장해야 콘텐츠 변경이 확정된다.

## 이미지 프롬프트와 비주얼 일관성

`content/ai/visual-bible.json`은 작품 전체의 화풍 설명, 세계 고정 요소, 팔레트, 카메라, 재질,
금지 요소와 background/portrait/overlay preset을 한곳에 둔다. 장면 연출안은 다음 필드를 분리해
모델이 장식적인 한 문장에 의존하지 않게 한다.

- `purpose`: 게임에서 이 이미지가 해야 할 일
- `subject`: 인물·사물·장소·시간·날씨
- `composition`: 카메라 거리, 시선 흐름, 모바일 UI 여백
- `lighting`, `palette`: 장면별 빛과 색
- `continuityAnchors`: 다음 장면에서도 반복해야 할 인물·공간·소품 특징
- `avoid`: 이 결과에서 특별히 피할 요소

`scripts/ai-image.ts`가 위 필드와 비주얼 바이블, `image-direction-v1.md`를 결합한다. 최종 프롬프트는
목적 → 주체/장면 → 구도 → 빛/색 → 재질 → 연속성 → 제약 순서다. 이미지 안의 읽을 수 있는 문자,
로고, 워터마크와 UI를 금지하고, 실존 작가의 고유 화풍 대신 붓결·명암·재질 같은 시각 속성을 쓴다.

`draft`는 `low` 품질로 구도, 실루엣, UI 여백을 빠르게 비교한다. `final`은 `high` 품질로 손·얼굴,
소품, 재질과 continuity anchor를 확인할 후보를 만든다. 수정은 한 번에 한 항목만 바꾸고 유지할
요소를 프롬프트에 반복한다. 기본 모델은 `gpt-image-2`이며 `OPENAI_IMAGE_MODEL`로 교체할 수 있다.
투명 배경은 모델별 지원이 다르므로 기본 모델에서 암묵적으로 요청하지 않는다.

## 프롬프트 튜닝

활성 프롬프트는 `content/ai/prompt-registry.json`이 가리키는
`content/ai/prompts/story-craft-v1.md`다. 다음 자료를 바탕으로 프로젝트 원칙에 맞게 다시
작성했다.

- OpenAI의 Prompt engineering 및 Structured Outputs 공식 가이드.
- OpenAI의 Image generation 및 이미지 프롬프트 공식 가이드. 사용 목적을 먼저 밝히고 주체·구도·
  스타일·제약을 명시하며, 수정 시 바꿀 것과 유지할 것을 구분하는 원칙을 적용했다.
- skills.sh의 `creative-writing-craft`: 설치 당시 639 installs, GitHub 486 stars. 장면 진입,
  대사 이중 기능, 서브텍스트, 화자 구분, 시점 거리, 문장 리듬, 감각 단서 원칙을 사용했다.

외부 스킬 문장을 프롬프트에 복사하지 않고 작품에 필요한 검수 규칙으로 재작성했다. 검색 결과에
있던 `key-moments`는 현재 원본 저장소에서 설치 대상을 찾을 수 없어 사용하지 않았다.

`content/ai/evals/story-craft-v1.json`은 다섯 작업을 한 사례씩 고정한다. `pnpm ai:prompt:check`가
프롬프트 필수 섹션, 출처, 작업별 평가 범위를 검사한다. 실제 모델 품질은 모델이나 프롬프트를
바꿀 때 이 사례로 수동 비교하고, 통과 결과를 확인한 뒤 `activeProfile`을 승격한다.

## 실행

```sh
pnpm authoring:studio
# http://127.0.0.1:4179 → AI 설정 → Platform 프로젝트 API 키 등록
```

CI나 환경변수 기반 실행은 `OPENAI_API_KEY`를 주입한다. `.env.example`은 필요한 변수명만 문서화하며
실제 키를 저장하거나 커밋하지 않는다. 키 생성과 사용량·지출 한도 관리는 OpenAI Platform 프로젝트에서
수행한다.

기본 텍스트 모델은 `OPENAI_STORY_MODEL=gpt-6-astra`, 이미지 모델은
`OPENAI_IMAGE_MODEL=gpt-image-2`이며 환경변수로 바꿀 수 있다. API 키가 없으면 AI 패널은 설정
방법만 표시한다. UI와 테스트 흐름은 외부 호출을 하지 않는
`STORY_AI_PROVIDER=mock STORY_IMAGE_PROVIDER=mock pnpm authoring:studio`로 확인할 수 있다. mock은
기존 개발 표지를 미리보기로 복사하므로 실제 원고·이미지 품질 평가나 릴리스에 사용하면 안 된다.

실제 이미지 API 호출은 비용과 조직 검증 요구가 있을 수 있다. 키가 설정된 로컬 제작실에서 작가가
각 시안 버튼을 눌렀을 때만 호출하며, 앱 플레이 중에는 호출하지 않는다.

인증과 운영 기준은 OpenAI 공식 문서의
[Production best practices](https://developers.openai.com/api/docs/guides/production-best-practices)를 따른다.
API 호출은 Platform 프로젝트 키로 인증하고, 키는 코드나 저장소 대신 환경변수 또는 보안 저장소에
둔다. Codex에서 현재 계정으로 프로젝트 키를 만들고 연결하는 방법은
[OpenAI Developers plugin 안내](https://developers.openai.com/learn/developers-codex-plugin)에 설명되어 있다.

## 제안의 안전한 적용과 연속성 검수

제작실은 요청 당시 작품 디렉터리·장면·수정 revision을 묶어 보관한다. 응답 대기 중 원고를 수정하거나
작품/장면을 바꾸면 해당 응답·이미지를 현재 원장에 적용하지 않는다. 자기 제안을 적용한 뒤에는
context를 갱신해 같은 제안의 이미지 제작을 이어 갈 수 있다.
공유 순수 적용 함수는 원장 복사본에서 ID 충돌·다음 장면·연출 대상을 검사한다. 실패하면 원본을 유지하고,
기존 ready 에셋은 계획 재적용만으로 planned로 되돌리지 않는다.

story/image 프롬프트에 날짜와 이동, 소품 소유권, 합류 장면의 분기별 지식, 스포일러 노출 계약을 추가했다.
두 엔딩의 대가를 행동으로 준비하며 일방적인 정답 프레이밍을 피한다. 프롬프트 검사는 구조·입력 경계의
계약 검사이며 실제 모델의 원고·이미지 품질 개선 수치를 뜻하지 않는다.


## 설정 요청의 순서와 복구

연결 상태 조회와 키 저장/삭제는 공유 설정 세션에서 응답 순서를 대조한다. 저장/삭제 중에는
입력·중복 요청·닫기를 잠그고 이전 GET은 최신 설정을 덮지 않는다. 읽기 실패는 원고 편집을
막지 않으며 설정 dialog에서 다시 열어 확인한다. 실패는 기존 연결 메타데이터를 유지한다.
dialog를 닫으면 키 입력을 비운다. 자동 검사와 mock UI 검증은 실제 API 키·Keychain 쓰기·
유료 API 호출의 검증을 대체하지 않는다.

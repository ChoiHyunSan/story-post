# 기술 스택과 구조 제안

검토일: 2026-10-02. 앱 스택을 설치하고 기반 구현을 추가했다. Expo SDK 57.0.25 / React Native 0.86.3 / React 19.2.3 기준이다.
데이터 구조와 저장 규칙의 기준은 [초기 데이터 설계](data-design.md)다.

## 권장 스택

| 영역 | 제안 | 이유 |
| --- | --- | --- |
| 모바일 | React Native + Expo | iOS/Android 공통 개발, 편지·대화·목록 같은 UI 중심 경험 |
| 언어 | TypeScript strict | 이야기 규격과 상태 전이를 명시적으로 관리 |
| 화면 이동 | Expo Router | 작품 목록·플레이·보관함·설정 경로 관리 |
| UI | React Native StyleSheet + 디자인 토큰 | 초기 스타일 의존성을 줄이고 작품별 테마 적용 |
| 진행 엔진 | 순수 TypeScript 함수 | 조건 평가·선택 결과·엔딩 판정을 UI 없이 테스트 |
| 상태 | React 로컬 state + repository | 현재 단일 읽기 흐름에 충분; SQLite commit 후에만 화면 상태를 갱신 |
| 로컬 저장 | expo-sqlite | 선택과 진행 위치를 트랜잭션으로 저장, 앱 재실행 후 복원 |
| 콘텐츠 | CSV/SQLite 제작 원장 → story + presentation JSON | 오프라인 플레이, 분기와 에셋·연출을 화면 코드에서 분리 |
| 제작 AI | 로컬 Node 서버 + macOS Keychain + OpenAI Responses API/Image API + Zod Structured Outputs | API 키를 앱·브라우저 저장소에서 분리하고 원고 제안·이미지 시안·검수 가능한 에셋만 생성 |
| 오디오 | expo-audio, 사운드 단계에서 추가 | 배경음·짧은 효과음, 음소거/앱 중단 처리 |
| 검사 | TypeScript, ESLint, Node/SQLite, RNTL, 플랫폼 스모크 | 순수 엔진·파일 저장·양 플랫폼 UI 계약과 네이티브 SQLite 검증 |
| 배포 | 로컬 development build 우선, EAS는 선택 | 기기에서 네이티브 동작 확인; 클라우드 서비스는 필요 시 |

버전 번호를 추정해 고정하지 않는다. 앱 생성 시 공식 안정 템플릿과 SDK에 맞는
React Native/React 버전을 확인하고 `pnpm exec expo install`로 호환 모듈을 설치한다.
알파·베타 기능은 초기 기반에서 제외한다.

## 대안 판단

Unity/Godot은 장면 이동·물리·복잡한 2D/3D 연출이 중심일 때 재검토한다.
현재 범위는 읽기, 선택, 저장이 중심이므로 일반 모바일 UI 프레임워크가 적합하다는 설계 판단이다.
Flutter도 가능하지만 현재 프로젝트 맥락의 TypeScript/React 경험을 활용할 수 있어 Expo를 우선한다.

## 구현 시 목표 구조

아래 기본 디렉터리와 scripts/, src/generated/를 생성했다. assets/에는 출처·권리·hash를 원장과 함께 기록한다.

- app/: 작품 목록, 작품 소개, 플레이, 기록, 설정의 라우팅
- src/engine/: Story/Node/Choice 타입, 조건 검사, 상태 전이
- src/storage/: SQLite 스키마, 저장/복원, 마이그레이션
- src/features/reader/: 편지 표현과 선택 UI
- src/ui/: 공통 접근성 컴포넌트와 디자인 토큰
- content/stories/: 작품별 원고와 분기 데이터
- content/presentations/: 작품 버전별 에셋 manifest와 연출 cue
- content/authoring/: 제작 SQLite 계약, CSV 템플릿과 작품별 원장
- content/ai/: 버전이 고정된 원고·이미지 프롬프트, 비주얼 바이블, 출처와 평가 사례
- tools/authoring-studio/: 한국어 원장 폼, AI 제안 검토, 백업·검증 복원과 실제 엔진 플레이 미리보기 UI
- tests/: 엔진, 콘텐츠 그래프, 저장, 사용자 흐름

## 저장과 콘텐츠 변경

세이브는 playthrough와 flag/history 관계로 저장하고 엔딩 수집은 플레이와 분리한다.
DB 스키마 버전은 PRAGMA user_version, 콘텐츠/엔진 규격 버전은 story_release에서 관리한다. 선택의 효과와 다음 노드 기록을 한 트랜잭션으로 처리한다.
저장 실패 시 다음 장면으로 넘어가지 않고 재시도 가능한 안내를 제공한다.
빠른 중복 탭을 막고 엔진에서도 현재 노드에 없는 선택을 거부한다.
콘텐츠 변경 시 노드 ID를 함부로 바꾸지 않으며 마이그레이션 또는 이전 버전 유지 정책이 필요하다.
로컬 저장만으로 시작하므로 삭제/기기 교체 후 복원을 보장하지 않는다. 출시 안내에 이를 설명한다.

## 후속 도입 조건

로그인/서버: 여러 기기 동기화 요구가 확인될 때.
알림: 실제 시간 진행이 재미에 필요할 때 권한·거절 경로와 함께 도입.
작품 다운로드: 앱 용량이 문제가 될 때 버전/무결성/저장 호환을 포함해 설계.
인앱 결제: 유료 작품 출시 범위가 정해지면 당시 플랫폼 정책과 구매 복원 방식을 검토.
어느 항목도 현재 가입·결제·클라우드 설정을 요구하지 않는다.

제작 AI는 선택 기능이다. 키가 없으면 원장 편집 기능은 그대로 작동한다. 플레이어 앱에는 OpenAI
클라이언트나 키를 포함하지 않고, 게임 진행도 네트워크에 의존하지 않는다. 모델 변경은 환경변수와
프롬프트 profile과 비주얼 바이블 버전으로 관리하며 released 콘텐츠를 AI가 직접 수정할 수 없다.
Codex/ChatGPT 로그인 토큰은 제작실에 복사하거나 읽지 않는다. 제작실의 `AI 설정`은 Platform 프로젝트
API 키를 localhost로 받아 macOS 로그인 Keychain의 `story-post.authoring.openai` 서비스에 저장한다.
키는 stdin으로 Keychain 도구에 전달하고 API 응답에는 저장 위치, 연결 여부와 끝 네 자리만 반환한다.
환경변수 `OPENAI_API_KEY`가 있으면 Keychain보다 우선하며 설정 화면에서 삭제하지 않는다.
이미지는 저품질 시안과 고품질 후보를 구분해 생성하고 `.authoring/image-runs`에서 먼저 검수한다.
채택한 파일만 `assets/generated`로 복사해 hash·모델·품질·실행 ID를 원장에 남긴다.

## 공식 참고 자료

- [Expo 프로젝트 생성](https://docs.expo.dev/get-started/create-a-project/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [로컬 빌드](https://docs.expo.dev/guides/local-app-overview/)
- [SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Audio](https://docs.expo.dev/versions/latest/sdk/audio/)
- [Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)

## 제작실 보강 — 2026-10-01

`tools/authoring-studio/proposal.mjs`의 순수 적용 함수를 브라우저와 Node 회귀 테스트에서 공유한다.
원장을 복제해 장면/ID/연결을 검증한 뒤 교체해 부분 적용을 막고 이미지·사운드 중복 코드를 줄였다.
비동기 응답은 directory·scene·revision context로 격리한다. 저장은 스냅샷과 revision을 사용해
대기 중 추가 수정을 보존하고, 로딩 순번으로 이전 작품 응답을 무시한다.
수동/AI 행 추가 모두 실제 최대 ordinal 다음 값을 사용한다. 런타임 의존성은 추가하지 않았다.

제작실 세션은 읽기/저장/복원의 요청 순번과 편집 revision을 대조한다. 늦게 도착한 응답은 이후 편집 또는 다른 작품을 덮어쓰지 않는다. CSV 저장은 서버 원장의 SHA-256 revision이 일치할 때만 수행하고 파일 사본 전체를 교체한다. 관련 회귀 계약은 [문제 해결 이력](problem-resolution-history.md)의 SP-012·SP-013에서 관리한다.

제작 검수는 공유 순수 review 세션 모듈을 사용한다. 서버는 동일 테이블 사본을 검증한 뒤
canonical 원장 SHA256과 UTC 시각을 반환한다. 편집 revision/작품/불러오기 순번이 일치해야
검수 결과를 적용·내보낼 수 있다. 앱과 제작실의 진입 배경도 동일 순수 해석기를 사용한다.

제작실 원고의 선택지에는 조건·효과 폼과 한국어 상태 의미를 제공한다. 규칙 사본을 전체 분기
검사한 뒤 적용하고 저장은 별도로 수행한다. 후속 편집 전에는1단계 구조 취소가 가능하다.

로컬 이미지의 실경로·20MB 제한·파일 signature·SHA-256 검사는 `authoring-assets.ts`를
미리보기와 해시 확인에서 공유한다. 외부 URL/assets 밖 symlink는 받지 않는다. 전체 디코딩이나
업로드 서비스가 아니며 플레이어 앱에 이 서버 코드를 포함하지 않는다.

플레이 미리보기의 성공/오류/내보내기는 공유 `playtest.mjs`에서 편집 revision·로딩 순번·
요청 순번을 대조한다. 경로JSON에는 당시 원장/현재 상태를 포함하지만 모바일 저장소는 건드리지 않는다.

# Story Post (가칭)

여러 세계관의 짧은 선택형 스토리를 경험하는 오프라인 iOS·Android 게임 앱.
캠툴과 독립된 프로젝트다. 제품명과 첫 정식 작품은 아직 확정하지 않았다.

## 현재 구현

- Expo SDK 57 / React Native / TypeScript / Expo Router 앱 골격.
- 작품 목록, 편지와 조건부 선택, 자동 저장, 이어하기, 받은 편지 기록, 수집한 결말 보관함.
- 작품별 예상 읽기 시간·결말 수·진행 상태, 글자 크기와 화면 움직임 줄이기 설정.
- 밤바다 포스터형 작품 목록과 종이 편지형 읽기 화면, 개발 표지의 프로덕션 번들 제외.
- 확인 후 새 시작/전체 기록 초기화.
- 순수 진행 엔진, 콘텐츠 구조/분기 검사, 불변 콘텐츠 버전 해시 잠금.
- 엔딩별 최소 경로·분량 감사와 Zod에서 생성하는 원고 작성용 JSON Schema.
- CSV/SQLite 제작 원장에서 story와 presentation 패키지를 생성하고 불변 hash로 잠그는 콘텐츠 파이프라인.
- 장면·본문·선택지·에셋·연출 cue를 편집하고 저장 즉시 전체 관계를 검사하는 로컬 콘텐츠 제작실.
- Structured Outputs로 원고·선택지·이미지·사운드 연출·연속성 검수 제안을 만드는 서버 전용 AI 조력 계층.
- 비주얼 바이블 기반의 빠른 이미지 시안·고품질 후보 생성, 로컬 미리보기, hash·출처를 포함한 에셋 채택 흐름.
- 장면 진입 background cue를 작품 표지와 읽기 화면에 연결하는 정적 에셋 런타임.
- SQLite 스키마 마이그레이션, 불변 migration 해시, 직렬 트랜잭션, 중복 선택과 저장 오류 rollback.
- 손상된 선택 기록은 번들 콘텐츠로 재검증하고 원본 저장을 보존한 채 복구 흐름 제공.
- 공통 색상 토큰과 핵심 텍스트·버튼의 WCAG AA 대비 회귀 검사.
- 개발 빌드의 읽기 전용 테이블 현황 화면.

현재 콘텐츠는 기술 fixture, 9개 노드/2개 엔딩의 5분 수직 시제품 v1,
18개 노드/2개 엔딩의 「작은 세계 우체국: 내일의 소인」 확장 원고 v2와
분기 서술 연속성을 바로잡은 v3다. 앱 목록에는 최신 v3만 표시하고 기존 v1·v2 저장은
계속 복원한다. 네 릴리스 모두 개발 번들에만 포함되며, 기술 fixture와 v1·v2는 목록에서 숨긴다. 프로덕션 바이트코드에서는 개발 원고를 제외하고
아직 작품 준비 중 화면만 보여 준다.
실기기 및 플랫폼별 검증 상태는 [구현 검증 기록](docs/implementation-validation.md)을 확인한다.

## 실행

Node 24, pnpm 11.19.0, Python 3(SQLite 3.37+) 기준.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm start
```

`pnpm check`는 소스·콘텐츠·DB·테스트만 빠르게 확인하고, `pnpm verify`는 여기에
양 플랫폼 프로덕션 번들과 Expo SDK·peer 의존성·Doctor 검사를 더한 최종 기반 검사다.

Expo Go에서 SDK 57을 지원하는 클라이언트로 연결한다. 네이티브 커스텀 모듈은 아직 없다.
macOS에서 Xcode 도구 경로를 전역 변경하지 않고 iOS 시뮬레이터로 실행하려면:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer pnpm ios
```

현재 개발 머신에는 JDK 17, Android SDK와 `small_phone` 에뮬레이터가 준비되어 있다.
`pnpm build`는 iOS/Android JavaScript/Hermes 번들을 생성하고 개발 원고가 프로덕션
바이트코드에 남지 않았는지 검사한다. 앱 서명/스토어 바이너리 빌드와 다르다.

플랫폼별 UI 계약과 네이티브 SQLite 검사는 다음 명령으로 실행한다.

```sh
pnpm test:ui
pnpm android:smoke
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer pnpm ios:smoke
```

스모크 검사는 개발 전용 임시 DB를 사용하고 완료 후 삭제한다. 실행 로그의
`NATIVE_STORAGE_CHECK_PASS checkpoints=8`이 전체 통과 기준이다.

## 데이터 관리

```sh
pnpm content:check     # 구조·도달 가능성·불변 릴리스·생성 파일 검사
pnpm content:inspect   # 작품 통계·엔딩 최소 경로·배포 범위 목록
pnpm content:build     # 새 버전 등록 및 생성 파일 갱신
pnpm authoring:check   # 제작 원장 SQL·외래 키·CSV 템플릿 계약 검사
pnpm authoring:build   # v3 원장에서 에셋·cue presentation 패키지 생성
pnpm authoring:import content/stories/little-post-office/episode-01-v3.json .authoring/little-post-office-v3.sqlite
pnpm authoring:export .authoring/little-post-office-v3.sqlite little-post-office 3 ko .authoring/little-post-office-v3.json
pnpm authoring:inspect # 장면·선택·연출 제작표와 분기 그래프 갱신
pnpm authoring:studio  # 브라우저에서 로컬 콘텐츠 제작실 실행
pnpm ai:prompt:check  # AI 프롬프트 버전·출처·작업별 평가 사례 검사
pnpm db:check          # 마이그레이션 불변 hash/생성 코드 동기화 검사
pnpm db:build          # 신규 SQL hash 등록과 번들용 코드 생성
```

제작실은 `http://127.0.0.1:4179`에서 이 컴퓨터에만 열린다. 배포된 v3 원장은 읽기
전용이며, 화면의 `새 버전 만들기`로 생성한 v4 작업본에서 원고와 연출을 편집한다.
저장할 때 CSV 관계, 분기, 에셋과 cue 계약을 함께 검사한다. 작업본의 런타임 미리보기는
`.authoring/previews`에 생성되고 승인·배포 전까지 앱 콘텐츠를 덮어쓰지 않는다.

AI 조력을 사용하려면 제작실 상단의 `AI 설정`에서 같은 OpenAI Platform 계정의 프로젝트 API 키를
등록한다. macOS에서는 로그인 Keychain에 저장되며 키 원문은 다시 화면에 표시하지 않는다.
환경변수 운영이 필요하면 `OPENAI_API_KEY`를 설정할 수 있고 이 값이 Keychain보다 우선한다.
ChatGPT·Codex 로그인 세션은 일반 OpenAI API 호출의 인증으로 재사용하지 않는다.
키는 제작실 서버에서만 읽으며 Expo 앱과 브라우저 저장소에는 전달되지 않는다. AI 결과는 바로 저장되지
않고 제안 미리보기 → 이미지 시안/확정 후보 생성 → 에셋 채택 → 전체 원장 검증을 거친다. 자세한 경계와 프롬프트 튜닝 기준은
[AI 콘텐츠 제작 파이프라인](docs/ai-content-pipeline.md)에 정리했다.

- [테이블·콘텐츠 관리 방법](docs/data-management.md)
- [콘텐츠 제작 원장과 에셋·연출 테이블](docs/content-authoring-plan.md)
- [AI 콘텐츠 제작 파이프라인](docs/ai-content-pipeline.md)
- [초기 ERD·데이터 설계](docs/data-design.md)
- [기반 개발 진행 상태](docs/foundation-plan.md)
- [제품 기획과 첫 작품](docs/product-plan.md)
- [작은 세계 우체국 수직 시제품](docs/little-post-office-vertical-slice.md)
- [작은 세계 우체국 확장 원고](docs/little-post-office-expanded-draft.md)
- [시각 방향과 UI 원칙](docs/visual-direction.md)
- [기술 스택과 구조](docs/technical-plan.md)
- [개발 환경](docs/development-readiness.md)
- [콘텐츠 규격](docs/story-format.md)

## 설계 도구

`pnpm design:check`, `pnpm design:render`, `pnpm design:render:content`로 SQL 설계 계약과
다이어그램을 검사/재생성한다. Mermaid CLI는 고정 버전을 `pnpm dlx`로 필요할 때만
실행하므로 모바일 앱 의존성과 번들에 포함되지 않는다.

## 작업 원고 현황

v4에서 날짜·열쇠 전달·책 선택·후반 인물 위치와 두 결말의 책임을 다듬었다.
[서사 검토](docs/little-post-office-expanded-draft.md)와 [검증 기록](docs/implementation-validation.md)에
현재 상태를 남긴다. 앱의 불변 v3와 기존 진행 기록은 유지하며 v4는 제작실 draft다.
바닷길 배경은 자체 생성한 `little-post-office-tide-road-v2.png`를 asset/cue로 연결했다.
프롬프트·출처는 [에셋 기록](assets/README.md)에 있다. v4의 실제 기기/사람 대상 검증은 남아 있다.

## 제작실에서 편집하기

원고·에셋·연출은 한국어 폼과 참조 목록으로 편집한다. 다음 장면은 제목으로, cue의 본문/선택은
해당 장면에서, 에셋은 해당 종류에서 고른다. 연결이 잘못되면 자동 교체하지 않고 ‘등록되지 않은 값’을
남긴다. **전체 테이블**은 원래 CSV 식별자를 사용하는 고급 편집이다.

### 장면과 분기

**장면 추가**에서 갈라지는 기존 편지·선택 문장·새 본문을 입력한다. 편지는 다음 장면/이어가는 선택,
결말은 고유 결말 ID를 지정한다. 전체 연결·순환·도달 조건을 검사해 편집기에만 반영하고 저장은 별도다.
**장면 찾기**는 제목·본문·화자·메모·안정 ID를 검색한다. 검색만으로 원고나 선택 장면을 바꾸지 않는다.

각 선택의 **조건·효과 편집**에서 등록된 상태를 고른다. 노출 조건은 모두 일치해야 하고 선택 효과는
다음 장면 진입 전에 적용한다. 규칙 사본 전체를 검사하며 다른 선택과 전역 상태 정의를 유지한다.

### 구조 편집 보호

기본 폼의 삭제는 확인과 전체 검증을 거친다. 마지막 본문/선택과 사용 중 에셋을 보호하고 선택에 붙은
조건·효과·cue를 함께 정리한다. 실제 파일은 지우지 않는다. 장면 추가·검증된 삭제·선택 규칙 적용 뒤
**직전 구조 변경 취소**를 사용할 수 있다. 다음 편집/다른 작품 열기 이후에는 이 1단계 취소가 사라진다.

### 오류 원고와 이미지

CSV 형식·작품 identity가 맞으면 분기/에셋 오류가 있어도 안내와 함께 열어 수정한다. 저장·검수·플레이
시작은 전체 검증을 요구한다. ready/approved 이미지는 파일/hash를 대조해 실제 미리보기를 표시한다.
**파일 해시 가져오기**로 로컬 PNG·JPEG·WebP의 SHA-256을 입력한다. 같으면 dirty를 만들지 않는다.
파일·이미지·권리를 검토한 뒤 상태를 바꾸고 저장한다. 파일 업로드/오디오 해시 자동 입력은 없다.

planned는 예약 경로만으로 계획을 저장할 수 있지만 실행에서 제외한다. ready는 실제 파일·해시·권리가
필요하다. AI 제안도 복사본을 검증해 적용하며 요청 뒤 원고/장면이 바뀌면 이전 응답을 반영하지 않는다.

## 저장과 버전 복제

저장 요청의 원장 revision이 최신 CSV와 다르면 거부하고 현재 편집은 남긴다. 저장 중 추가 수정도
미저장으로 유지한다. CSV 교체 실패는 원본을 복원하며 복원 실패 시 backup 위치를 안내한다.
동시 편집 자동 병합과 강제 프로세스 종료 뒤 자동 복구는 제공하지 않는다.

새 버전 복제는 미저장 변경이 없고 원본 revision이 맞을 때만 진행한다. 폴더/목록 게시 실패는 정리해
재시도한다. 게시 성공 후 목록만 실패하면 **작품 목록 다시 읽기**로 복구한다. 기존 편집을 유지하고
복제를 다시 요청하지 않는다. 목록에 반영된 새 원고 열기만 실패해도 지속 안내와
**원고 다시 열기**를 제공한다. 현재 편집을 유지하며 미저장 변경이 있으면 버리기 확인을 거친다.
요청 중 원고를 수정하거나 다른 원고를 열면 clone 자동 열기를 생략한다.

### 원고 백업과 복원

**원고 백업**은 미저장 테이블을 포함한 JSON이다. 실제 이미지/사운드 파일과 API 연결 정보는 제외한다.
**백업 불러오기**는 같은 작품·버전·언어의 작업본만 검사해 확인 후 편집기에 가져온다. CSV 반영은
**변경사항 저장**으로 수행한다. 배포본은 덮어쓰지 않는다. 충돌 시 먼저 백업하고 최신 원고와 비교한다.

## 읽고 검수하기

**플레이 미리보기 → 원고로 시작**으로 현재 문장을 읽고 선택한다. **이전 선택으로**와
**처음부터 다시 읽기**로 분기를 비교한다. 모바일 앱과 같은 엔진을 사용하며 게임 기록/CSV를 쓰지 않는다.
사운드·시간에 따른 연출과 네이티브 접근성까지 재현하는 도구는 아니다.

**플레이 경로 내보내기**는 선택 순서·상태·도착 장면과 당시 원고를 JSON으로 보관한다.
원고 수정 후에는 다시 시작해야 한다. 같은 분기 검수/문제 재현에 쓰며 게임 저장·원고 복원 파일과 구분한다.

검수 탭의 **현재 원고 검사**는 미저장 원고도 검사한다. 시각·원장 식별값·제작표·분기·테이블 사본을
JSON으로 내보내고 검수 후 수정하면 다시 검사한다. CSV 저장이나 출시 승인은 수행하지 않는다.
자세한 계약은 [콘텐츠 제작](docs/content-authoring-plan.md)을 참고한다.

## 저장소 작업 지침

[프로젝트 작업 지침](docs/project-guide.md)과 [초기 이전 기록](docs/import/README.md)을 참고한다.

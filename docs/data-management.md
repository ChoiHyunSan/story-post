# 게임 데이터와 테이블 관리

## 지금 필요한 관리 방식

기기 플레이 상태와 원고의 관리 주기가 다르므로 한 관리자 DB에 합치지 않는다.
현재 실행 원고는 개발자가 Git으로 변경을 검토하며 로컬 CLI와 앱 개발 화면을 사용한다.
[콘텐츠 제작 원장](content-authoring-plan.md)을 도입해 v3의 장면·본문·에셋·연출 시점을
테이블로 관리하고, 원장과 런타임 JSON의 동일성을 자동 검사한다.
별도 관리자 서버, 로그인, 원격 SQL 실행, 운영 DB는 현재 필요하지 않다.

| 대상 | 원본 | 변경 방법 | 확인 방법 |
| --- | --- | --- | --- |
| 제작 중 원고·연출 | 제작 원장 테이블과 CSV | 장면·본문 블록·선택·asset·cue별 편집 | import/분기/누락 에셋 검사 |
| 현재 실행 원고·조건·효과 | content/manifest.json에 등록한 JSON | 기존 버전을 보존하고 새 version 파일 추가 | content:check / content:inspect |
| 원장 등록된 실행 원고 | 제작 원장에서 생성한 `story.json` | 생성 명령으로 갱신 | 원장 import/export 및 기존 출력 비교 |
| 원고 작성 Schema | content/story.schema.json | content:build가 Zod 계약에서 생성 | content:check에서 생성 결과 비교 |
| 배포된 콘텐츠 hash | content/releases.lock.json | content:build가 새 버전만 추가 | 변경/삭제된 기존 버전은 검사 실패 |
| 테이블 정의 | src/storage/migrations/NNN_name.sql | 이미 적용한 파일 수정 대신 새 번호 추가 | db:check + 저장 회귀 테스트 |
| 적용된 migration hash | src/storage/migrations.lock.json | db:build가 새 번호만 추가 | 변경/삭제된 기존 SQL은 검사 실패 |
| 번들용 데이터·SQL | src/generated/*.ts | 직접 편집 금지, build 명령으로 생성 | check 시 원본과 비교 |
| 플레이 기록 | 기기의 story-post.db | 앱의 정상 선택/재시작/초기화로만 변경 | 개발 데이터 확인 화면 |
| ERD | docs/erd.mmd | migration과 같은 변경에서 수정 | design:render |

## 콘텐츠 작업 흐름

1. 새 작품은 `content/authoring/templates`를 복사해 작품별 CSV 원장을 만들고 장면, 본문 블록,
   선택, 상태값, 에셋과 cue를 작성한다. 기존 JSON을 이관할 때는 `authoring:import`와
   `authoring:csv:export`를 사용한다.
   fixtures 항목은 반드시 `developmentOnly=true`, `showInLibrary=false`이며 프로덕션 등록과
   작품 목록 노출을 검사에서 거부한다.
2. 원장을 SQLite로 가져오고 `authoring:export`로 런타임 JSON을 생성한다. JSON Schema를 지원하는
   편집기에서는 `content/story.schema.json`으로 생성 결과를 확인한다. manifest에 path,
   developmentOnly, showInLibrary를 등록한다. 기존 버전 파일은 그대로 둔다.
   새 플레이에 제공할 최신 개발 원고만 showInLibrary=true로 두고, 저장 복원용 구버전은 false로 유지한다.
3. content:build는 스키마, ID, 조건/효과 선언, 순환, 막힌 상태, 불가능한 엔딩을 검사한다.
4. releases.lock.json에 기존 버전이 있으면 바이트 해시가 같아야 한다. 오탈자도 새 버전으로 낸다.
5. `authoring:inspect`로 제작표와 분기 그래프를 갱신한다. content:inspect로 개발/정식 범위,
   글자 수·상태 수와 각 엔딩의 최소 선택 경로를 확인하고 pnpm check/build를 통과시킨다.
6. 이전 버전 저장 파일로 이어하기를 검증한 뒤 출시한다.

생성 모듈은 정식 콘텐츠와 개발 콘텐츠를 분리한다. 개발 원고 배열은 `__DEV__`
조건 안에만 존재해 Metro 프로덕션 번들에서 제거된다. 목록 노출을 결정하는
`showInLibrary`와 바이트코드 포함 여부를 결정하는 `developmentOnly`를 혼동하지 않는다.

잠금 파일은 Git에 함께 보관한다. 잠금 파일을 손으로 바꾸면 보호를 우회하므로 하지 않는다.
이 검사는 원본의 우발적인 덮어쓰기를 막는 장치이며 디지털 서명이나 배포 보안 시스템은 아니다.
fixtures/stories 아래의 모든 JSON은 manifest 등록이 필수이며 누락 시 검사가 실패한다.
초기 opening concept는 content/drafts에 분리한 기획 샘플로 앱 번들에 사용하지 않는다.

## 저장 테이블 변경 흐름

초기 스키마는 001_initial.sql이고, design/schema.sql은 모든 migration을 적용한 현재 스키마 계약이다.
현재 002에서 오디오 기능 없이 미리 추가된 sound_enabled 컬럼을 제거했다. 실행기는 한 트랜잭션에서 필요한 SQL과
PRAGMA user_version을 함께 갱신한다. 실패하면 기존 버전/데이터를 보존한다.
앱보다 새로운 DB 버전은 초기화하지 않고 호환 오류로 중단한다.

- 테이블/컬럼을 바꾸면 데이터 이관 SQL과 구버전 fixture 테스트를 같이 작성한다.
- SQL의 실제 사용자 데이터는 Git에 저장하지 않는다.
- 기존 migration은 배포 후 불변으로 취급한다. db:build는 번들용 코드를 갱신하는 명령이지 기기 DB를 초기화하는 명령이 아니다.
- migrations.lock.json은 기존 SQL 파일의 SHA-256을 보존한다. 잠금 파일을 손으로 바꿔 기존 migration 수정을 승인하지 않는다.
- ERD, 관련 코드와 문서를 같은 변경에서 갱신한다.

## 앱에서 확인

개발 모드 목록/플레이 화면 아래의 **개발 데이터 확인**에서 DB 스키마 버전과 7개 테이블 행 수를 본다.
읽기 전용이며 원고 본문이나 플레이어 입력을 외부로 보내지 않는다. 임의 SQL 입력 기능은 없다.
개발 중 저장 계층 코드를 바꾼 후에는 Fast Refresh 대신 앱 전체 reload를 사용한다.

플레이 내용을 확인하려면 받은 편지 보기, 엔딩 개수, 선택 횟수로 확인한다.
초기화가 필요하면 읽기 설정의 모든 기록 지우기를 사용한다. 확인창 뒤에만 삭제된다.

## 로컬 편집 도구와 협업 범위

CSV/SQLite 계약을 사용하는 브라우저 제작실을 구현했다. 한국어 폼·참조 선택, AI 제안 검토,
실제 진행 엔진의 원고 미리보기와 테이블 백업을 제공한다. 앱의 기기 DB는 바꾸지 않는다.
작업본 저장은 expectedRevision으로 다른 탭·외부 파일 변경을 차단하고, 전체 CSV 사본 교체로
중간 파일 오류의 rollback을 처리한다. 충돌은 자동 병합하지 않으며 현재 편집을 백업해 비교한다.
프로세스가 강제 종료되는 순간의 디렉터리 교체 복구는 별도 운영 검증이 필요하다.
계정·권한, 여러 작가의 원격 동시 편집, 원격 게시와 다운로드 배포는 별도 범위다.

## 작업본과 완성 에셋 검사

`authoring:build`와 제작실 저장은 draft에서만 미완성 에셋 참조를 허용한다. 계획의 구조를 검증한 후
실행 presentation에서는 planned 에셋·참조 cue를 제외한다. 원장은 삭제하거나 ready로 승격하지 않는다.
review 이상과 기본 presentation export는 참조 에셋의 ready/approved 상태를 요구한다.
ready/approved 에셋은 안전한 번들 경로 검증 후 실제 파일 SHA-256과 권리 필드도 대조한다.
검수 전 작업본의 결과는 `.authoring/previews`에만 생성한다.

검수 기록은 현재 편집 원고 사본을 별도로 검사해 SHA256/시각/제작표/분기와 함께 내보낸다.
CSV 저장, 출시 후보 승인과 플레이어 SQLite 변경은 수행하지 않는다. 검수 중/이후 수정은
편집 revision으로 감지하며 이전 결과의 현재 원고 내보내기를 차단한다.

새 버전 복제는 원본 원장의 읽기 revision을 비교한다. 최종 폴더 작성 전 전체 CSV를
임시 폴더에 준비하고 제작 manifest 게시 실패는 미등록 사본을 정리한다.
기존 원본/이미지 파일은 변경하지 않는다. 원본·목록의 외부 변경은 재조회 후 다시 확인해야 한다.

원장 읽기는 CSV 형식/작품 identity를 확인한 뒤 분기·에셋 오류를 안내하며 편집을 허용한다.
저장과 실행 export는 전체 검증을 계속 요구한다. ready 에셋은 cue 연결 여부와 무관하게
파일/hash/권리가 필요하고 planned 계획은 실행에서 제외한다. 기기 DB 스키마는 변경하지 않았다.

이미지 파일 검사 POST는 로컬 path/hash/크기/MIME만 반환한다. 파일·CSV를 쓰지 않으며
검사 결과를 편집기에 반영해도 실제 원장 저장은 expectedRevision과 전체 검증을 거친다.

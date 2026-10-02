# Story Post 프로젝트 작업 지침

캠툴의 공통 개발 절차를 가져오되 Story Post의 기존 모바일 제품·기술 기준을 유지한다.

## 작업 순서

1. AGENTS.md, README와 해당 영역 문서를 읽고 Git 변경 상태를 확인한다.
2. 요청 범위와 관련 코드·콘텐츠·테스트·문서를 함께 식별한다.
3. 기존 ID와 저장 호환성을 유지한다. 기능 후보는 제품 기획에 기록하고 요청 범위 밖 구현은 하지 않는다.
4. 구현 변경은 `pnpm typecheck`, `pnpm lint`, 엔진·저장 관련 `pnpm test`로 검증한다. UI 변경은 `pnpm test:ui`와 iOS/Android의 작은 화면·글자 확대·이어하기를 확인한다. 출시 번들 변경은 `pnpm build`로 확인한다.
5. 파일 이전만 수행할 때는 파일 목록·SHA-256·누락 여부를 검증한다. 실행하지 않은 앱·기기 검사를 완료로 보고하지 않는다.
6. 결과와 제한을 기록한다. 회귀 수정은 기존 문제 해결 이력에 원인과 재발 방지를 남긴다.

## 기준 문서

- 제품과 후보: [제품 기획](product-plan.md)
- 구현 진행: [기반 계획](foundation-plan.md)
- 구조와 의존 방향: [기술 계획](technical-plan.md)
- 용어·저장 모델: [데이터 설계](data-design.md), [콘텐츠 규격](story-format.md)
- 콘텐츠 제작: [제작 원장](content-authoring-plan.md)
- 검증과 회귀: [검증 기록](implementation-validation.md), [문제 해결 이력](problem-resolution-history.md)

## 커밋

`<type>(<scope>): <summary>` 형식과 하나의 의도 단위를 사용한다. scope는 engine, storage, reader, content, authoring, ui, repo, deps 등 실제 변경 영역으로 정한다. staged diff를 검토하고 기능에 필요한 문서·테스트를 함께 포함한다. Paperclip에서 커밋할 때는 `Co-Authored-By: Paperclip <noreply@paperclip.ing>` footer를 붙인다.

## 이전한 규칙의 경계

캠툴의 사전 확인, 문서 동기화, 범위 관리, 회귀 기록, 입력 검증, 커밋 규칙을 채택했다. SEO·AdSense·Cloudflare·한영 동시 출시·웹 라우팅 규칙은 적용하지 않는다. Expo/React Native, 한국어 우선, 오프라인 플레이와 SQLite 저장 구조를 유지한다.

캠툴 원문은 [참고 사본](import/camtool/AGENTS.md), 기존 Story Post 지침은 [원본 사본](import/story-post-agents.original.md)에 보존했다.

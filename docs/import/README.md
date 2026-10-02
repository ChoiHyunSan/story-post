# 초기 이전 기록

작업: HSL-2 / 2026-10-02

## 가져온 내용

- 게임 원본: `/Users/air/Documents/ChatGPT/story-post`
- 지침 원본: `/Users/air/Documents/ChatGPT/캠툴`
- 게임 원본의 Git 추적 대상과 ignore되지 않은 파일 193개를 복사했다. 아직 커밋되지 않은 원본 파일도 포함했다.
- 앱 코드, 콘텐츠 원장과 v4 초안, 채택한 이미지, 제작실, 테스트, 설계 문서, 패키지 설정과 lockfile을 유지했다.
- 원본 경로는 변경하지 않았으며 대상 작업 공간의 `.git`도 유지했다. 원본 Git 이력은 가져오지 않았다.
- 캠툴 AGENTS, 커밋 규칙, 기획 절차, 기능 제안·문제 해결 템플릿 원문을 `camtool/`에 보존했다.
- 공통 규칙을 루트 AGENTS와 `docs/project-guide.md`에 반영했다. 모바일 제품 기준은 유지했다.

## 제외 범위

원본 `.gitignore`에 따라 node_modules, dist, .expo, .authoring의 임시 AI 생성 결과·미리보기, 로컬 DB, 환경 비밀값과 OS 캐시는 복사하지 않았다. 채택된 에셋과 `content/authoring`의 원고는 포함했다. `.env.example`은 포함했다. 의존성은 README의 `pnpm install --frozen-lockfile`로 설치한다.

## 검증

- `source-manifest.json`에 원본 193개 파일의 SHA-256을 기록했다.
- 193개 모두 존재하며 190개가 원본과 동일하다. AGENTS.md와 README.md에는 지침·링크를 추가했고, `.gitignore`에는 pnpm·Expo/EAS 캐시와 추가 서명 파일 제외 규칙을 보강했다. 원본 AGENTS는 별도 보존했다.
- `python3 -m unittest discover -s tests/design -v`: 14개 통과.
- 앱 코드 변경은 없다. 현재 실행 환경에 pnpm이 없어 의존성 설치·타입 검사·앱 빌드·기기 실행은 수행하지 않았다. 원본 문서의 기존 검증 결과는 이번 작업의 실행 결과가 아니다.

이 작업은 소스와 지침 이전으로 완료했다. 앱 실행 준비와 제품 변경은 별도 작업 범위다.

# Git 커밋 컨벤션

캠툴의 커밋은 Conventional Commits 형식을 사용한다. 커밋 기록만 읽어도 어떤
기능이 추가·수정·정리됐는지 알 수 있어야 한다.

## 기본 형식

```text
<type>(<scope>): <summary>

[optional body]

[optional footer]
```

예시:

```text
feat(timer): add custom focus duration
fix(picker): keep game result stable after rerender
refactor(citation): extract citation formatter
docs(repo): define domain glossary workflow
test(report): cover speech duration estimates
```

## Type

| Type | 사용 시점 |
| --- | --- |
| `feat` | 사용자가 사용할 수 있는 새 기능이나 기능 확장 |
| `fix` | 잘못된 동작, 오류, 회귀 문제 수정 |
| `refactor` | 동작 변경 없이 코드 구조 개선 |
| `perf` | 측정 가능한 성능 개선 |
| `test` | 테스트 추가·수정 또는 테스트 구조 개선 |
| `docs` | README, 가이드, 사전 등 문서만 변경 |
| `style` | 동작에 영향 없는 코드 포맷·표현 정리 |
| `build` | 빌드 도구, 패키지, 번들 설정 변경 |
| `ci` | 자동화·배포 파이프라인 변경 |
| `chore` | 위 항목에 속하지 않는 저장소 유지보수 |
| `revert` | 이전 커밋 되돌리기 |

`feat`와 `fix`를 단순한 파일 추가·수정의 의미로 사용하지 않는다. 사용자 동작이
달라질 때만 선택한다.

## Scope

scope는 변경의 주된 도메인 또는 구조 영역을 사용한다.

### 기능 scope

- `timer`
- `picker`
- `team-generator`
- `report`
- `citation`
- `gpa`
- `image-converter`
- `mini-games`

### 공통 scope

- `home`: 홈 화면
- `layout`: 헤더, 푸터, 공통 페이지 셸
- `ads`: AdSense 설정과 광고 슬롯
- `content`: 도구 카탈로그와 공통 문구
- `i18n`: 언어, 번역 문구, 현지화 경로와 언어별 메타데이터
- `config`: 실행 설정과 환경변수 해석
- `auth`: 인증 도우미
- `tests`: 여러 도메인에 걸친 테스트 기반
- `repo`: README, AGENTS, 저장소 운영 규칙
- `deps`: 패키지와 lockfile
- `hosting`: Sites·Cloudflare 배포 설정

한 도메인에 속하는 변경이면 scope를 반드시 작성한다. 저장소 전체에 걸쳐 하나의
scope로 설명하기 어려운 경우에만 생략할 수 있다. 새로운 제품 도메인이 생기면
먼저 `docs/domain-glossary.md`에 등록하고 이 목록에도 추가한다.

## Summary 작성법

- 영어 명령형 현재 시제를 사용한다: `add`, `fix`, `extract`, `remove`, `update`.
- 무엇을 했는지가 아니라 어떤 결과를 만들었는지 구체적으로 작성한다.
- 첫 글자는 소문자로 쓰고 끝에 마침표를 붙이지 않는다.
- 전체 제목은 가능하면 72자 이내로 작성한다.
- `update files`, `fix bug`, `work in progress`처럼 의미가 불분명한 표현을 쓰지
  않는다.

## 기능 단위 커밋 원칙

- 한 커밋은 독립적으로 설명하고 검토할 수 있는 하나의 기능 또는 하나의 수정
  의도를 가진다.
- 서로 관계없는 두 도구의 변경을 한 커밋에 섞지 않는다.
- 기능에 직접 필요한 UI, 계산 로직, 테스트, 콘텐츠, 도메인 사전 갱신은 같은
  커밋에 포함한다.
- 선행 리팩터링이 별도로 의미 있고 기존 동작을 유지한다면 `refactor` 커밋으로
  먼저 분리한다.
- 단순 파일별로 커밋을 쪼개지 않는다. 컴포넌트와 그 테스트가 함께 하나의 기능을
  완성한다면 같은 커밋에 둔다.
- 각 커밋은 빌드 가능한 상태여야 하며 main 브랜치에 `WIP` 커밋을 남기지 않는다.
- 대규모 작업은 다음과 같이 검토 가능한 순서로 나눈다.

```text
refactor(report): extract text statistics model
feat(report): add byte limit progress
test(report): cover multibyte text limits
```

마지막 `test`가 기능의 안전성에 필수라면 별도 커밋 대신 `feat` 커밋에 포함한다.

## Body와 Footer

제목만으로 이유나 제약이 드러나지 않을 때 body를 작성한다.

```text
fix(picker): keep winner visible after animation

Separate the visual stage from the selected result so reduced-motion
preferences cannot clear the winner early.
```

- body에는 구현을 나열하기보다 변경 이유와 중요한 제약을 적는다.
- 이슈가 있으면 footer에 `Refs: #123`, 해결하면 `Closes: #123`을 사용한다.
- 호환성이 깨지는 변경은 type 뒤에 `!`를 붙이고 footer에 설명한다.

```text
feat(content)!: replace legacy tool keys

BREAKING CHANGE: bookmarked legacy routes no longer resolve.
```

## 커밋 전 절차

1. `git status --short`로 변경 범위를 확인한다.
2. 관계없는 변경이 섞였으면 기능 단위로 나눈다.
3. `git add -p` 또는 명시적인 경로로 해당 단위만 stage한다.
4. `git diff --cached --check`와 `git diff --cached`로 커밋 내용을 검토한다.
5. 필요한 build, lint, test를 실행한다.
6. `<type>(<scope>): <summary>` 형식으로 커밋한다.
7. `git log -1 --stat`으로 커밋 결과를 확인한다.

## 피해야 할 예시

```text
update
fix bug
WIP
feat: various changes
chore(repo): add timer feature
feat(timer): add timer and redesign citation and update README
```

여러 작업이 제목에 `and`로 길게 연결되면 커밋을 나눠야 한다는 신호로 본다.

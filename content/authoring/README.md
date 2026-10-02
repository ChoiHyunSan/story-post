# 제작 원장

이 디렉터리는 플레이어 기기의 저장 DB와 분리된 콘텐츠 제작 계약이다. `schema.sql`은 장면,
본문 블록, 선택, 상태값, 에셋과 연출 큐의 관계를 정의한다. `templates`의 CSV는 스프레드시트
시트와 일대일로 대응하며 UTF-8, 쉼표 구분, 첫 행 헤더를 사용한다.

```sh
pnpm authoring:check
pnpm authoring:build
pnpm authoring:studio
```

검사는 SQL을 메모리 DB에 적용하고 필수 테이블, 외래 키, CSV 헤더가 설계 계약과 일치하는지
확인한다. 템플릿은 헤더만 제공한다. 실제 작품은 작품별 디렉터리에 복사한 뒤 작성하고,
검증된 원장에서 런타임 `content/stories` JSON을 생성한다.

`asset.csv`에는 파일 출처와 이용 권리를 기록하고, `cue.csv`에는 재생 시점과 동작을 기록한다.
본문 셀의 줄바꿈과 쉼표는 RFC 4180 방식으로 큰따옴표를 사용해 보존한다.

현재 런타임 JSON을 로컬 제작 DB로 가져오고 다시 내보낼 수 있다. 출력 DB와 임시 결과는 Git에
추가하지 않는다.

```sh
mkdir -p .authoring
pnpm authoring:import content/stories/little-post-office/episode-01-v3.json .authoring/little-post-office-v3.sqlite
pnpm authoring:export .authoring/little-post-office-v3.sqlite little-post-office 3 ko .authoring/little-post-office-v3.json
pnpm authoring:csv:export .authoring/little-post-office-v3.sqlite .authoring/little-post-office-v3-csv
pnpm authoring:csv:import .authoring/little-post-office-v3-csv .authoring/little-post-office-v3-edited.sqlite
pnpm authoring:inspect
```

`authoring:check`는 v3 원고 전체를 메모리 DB로 가져온 뒤 다시 내보내 구조와 내용이 동일한지도
검사한다. SQLite에서 내보낸 CSV 묶음을 새 DB로 다시 가져오는 왕복도 같은 검사에 포함한다.
가져오기는 기존 DB를 덮어쓰지 않으며, 같은 작품 버전을 수정할 때는 새 작업 DB나 새
`working_version`을 사용한다.

`works/little-post-office-v3`는 현재 v3의 실제 제작 원장이다. 원고 표를 바꾸면 여기서 생성되는
런타임 JSON도 함께 갱신해야 한다. 검사에서는 원장과 현재 JSON의 구조·내용, 준비된 에셋 파일의
존재·SHA-256·권리 필드, 필수 오프닝 cue를 확인한다.
`authoring:inspect`는 장면별 제작표와 Mermaid 분기 그래프를 갱신한다.
`authoring:build`는 원장의 asset/cue를 `content/presentations` 런타임 패키지로 생성한다. released
상태인 v3 원고가 기존 story JSON과 달라지면 덮어쓰지 않고 실패하므로 다음 버전 원장을 만들어야 한다.

새 작품 또는 새 버전은 `templates`를 복사해 `works/<작품-버전>` 디렉터리를 만들고
`content/authoring/manifest.json`에 원장 키, story/presentation 출력, 제작표와 그래프 경로를
등록한다. 등록되지 않은 works 디렉터리와 존재하지 않는 등록 경로는 검사에서 거부한다.

## 로컬 콘텐츠 제작실

`pnpm authoring:studio`를 실행하고 `http://127.0.0.1:4179`를 열면 CSV를 직접 수정하지
않고 제작 원장을 관리할 수 있다. 제작실은 외부 네트워크에 공개되지 않는다.

- **원고:** 장면을 골라 발신자·제작 상태·본문 블록·선택지와 다음 장면을 편집한다.
- **에셋·연출:** 이미지·사운드의 경로와 권리를 기록하고 scene/block/choice cue를 배치한다.
- **AI 조력:** 선택 장면을 기준으로 원고·선택지·이미지·사운드 연출안을 제안받고 검토 후 초안에 적용한다.
- **전체 테이블:** 플래그, 조건, 효과와 출시 후보를 포함한 원본 테이블을 편집한다.
- **검수:** 저장에 성공한 원고의 통계, 제작표와 Mermaid 분기 소스를 확인한다.

`released` 원장은 읽기 전용이다. `새 버전 만들기`는 원고를 다음 `working_version`의
`draft`로 복제하고 manifest에 등록하며, 출시 후보 행은 복사하지 않는다. 저장 요청은 임시
SQLite DB에서 story/presentation 내보내기까지 성공한 뒤에만 CSV에 반영된다. draft·review·approved
작업본은 `pnpm authoring:build` 실행 시 `.authoring/previews/<작품>-v<버전>`에 미리보기를
생성하며, 승인·릴리스 절차 전에는 앱이 읽는 불변 JSON을 변경하지 않는다.

AI 조력은 `.env`에 `OPENAI_API_KEY`가 있을 때만 활성화된다. 키는 제작실 서버 밖으로 전달하지
않는다. 버튼을 누르면 작가 요청과 선택 장면의 원고가 AI 제공자에게 전송되므로 제작실에 전송
범위를 표시한다. 결과를 적용해도 아직 브라우저 작업본일 뿐이며 `변경사항 저장`을 눌러 전체
원장 검사를 통과해야 CSV에 기록된다. 상세 계약은 [`docs/ai-content-pipeline.md`](../../docs/ai-content-pipeline.md)를 참고한다.

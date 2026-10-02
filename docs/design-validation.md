# 초기 설계 검증 기록

- 날짜: 2026-09-21
- 대상: story-post, main, 아직 최초 커밋 없음. 기존 준비 파일을 유지하며 설계 파일 추가.
- 범위: ERD·SQL 제약·저장 계약·개발 도구. 실제 게임 원고 연결 없음.
- 환경: macOS, Node 24.19.0, pnpm 11.19.0, Python SQLite 3.51.0.

| 항목 | 결과 |
| --- | --- |
| pnpm install --frozen-lockfile | 통과; lockfile 기반 설치 |
| pnpm design:check | 14/14 통과 |
| pnpm design:render | 통과; docs/erd.svg |
| pnpm design:render:content | 통과; docs/content-model.svg |
| 물리 ERD 시각 확인 | 표·속성·관계선 표시 확인 |
| SQL 적용 | 인메모리 DB에 생성, FK 활성 및 현재 user_version=2 확인 |
| 데이터 정합성 | 없는 버전 참조·중복 활성 플레이·잘못된 상태·boolean·설정 범위 거부 |
| 저장 실패 | flag/현재 노드 갱신 rollback, 결말 저장 실패 시 완료 상태 rollback |
| 재시작/삭제 | 과거 플레이·엔딩 유지, 플레이 삭제 시 flag/history만 삭제 |
| 중복 입력 | revision 조건부 갱신으로 이전 revision 재사용 거부 |
| 앱 빌드·lint·모바일 동작 | 해당 없음: 앱 소스/런타임 구현 전 |
| 실제 기기 영속성·OS 중단·콘텐츠 검증기 | 미검증: 후속 구현 필요 |

인메모리 SQL 테스트는 실제 expo-sqlite 어댑터의 트랜잭션 경계나 기기 강제 종료 복원을
검증하지 않는다. 다음 구현에서 파일 기반 저장과 모바일 재실행 테스트를 추가해야 한다.
실제 콘텐츠 조건 탐색과 엔딩 도달 검증도 아직 구현되지 않았다.

이 문서는 2026-09-21 초기 설계 시점의 기록이다. 이후 앱·콘텐츠 검증 결과는
[기반 구현 검증](implementation-validation.md)에서 관리한다.

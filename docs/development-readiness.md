# 개발 준비 현황

2026-09-22 로컬 확인. ERD 도구, Xcode 시뮬레이터, Android SDK와 에뮬레이터 설치 완료.
시스템 전역 Xcode 선택은 바꾸지 않고 명령별 `DEVELOPER_DIR`를 사용한다.

| 항목 | 확인 결과 |
| --- | --- |
| Node | v24.19.0 |
| pnpm | 11.19.0 |
| Git | /usr/bin/git 사용 가능 |
| Xcode | DEVELOPER_DIR 지정으로 Xcode 26.6 / Build 17F113 확인 |
| 현재 개발 도구 경로 | /Library/Developer/CommandLineTools; 전체 Xcode 경로 미선택 |
| Java | Homebrew OpenJDK 17 설치 |
| Android Studio | 설치하지 않음; command-line tools 사용 |
| Android SDK | platform-tools, emulator, Android 36.1 시스템 이미지 설치 |
| Android 에뮬레이터 | `small_phone`, adb 연결과 Expo Go 실행 확인 |
| iOS 시뮬레이터 | iOS 26.5 iPhone 17e, Expo Go 57.0.9 실행 확인 |
| 실제 기기 | 연결·검증하지 않음 |
| Mermaid CLI | 11.17.0을 `pnpm dlx`에서 고정 실행; 앱 의존성에서 분리 |
| Python SQLite | 3.51.0 확인, 추가 DB 서버 설치 불필요 |

## 다음 구현 작업 순서

1. 시뮬레이터와 실제 기기에서 VoiceOver/TalkBack 음성 탐색을 확인한다.
2. 실제 iOS·Android 기기에서 앱 중단/복귀와 오프라인 실행을 확인한다.
3. 작성된 첫 작품 확장 원고를 플레이테스트하고 퇴고한다.
4. 앱 이름·식별자·아이콘을 확정한 뒤 개발 빌드와 서명 환경을 준비한다.

Xcode 도구는 필요하면 명령별 DEVELOPER_DIR로 지정하여 시스템 전역 설정 변경을 줄인다.
모바일 빌드에는 Xcode/Android SDK 추가 설정과 다운로드가 필요할 수 있다.
스토어 공개 단계에는 Apple/Google 개발자 등록, 앱 식별자, 서명, 등급·개인정보 자료가 필요하다.
계정 가입이나 스토어 등록은 아직 수행하지 않았다.

## 구현 후 검증 계약

- 첫 실행, 정상 선택, 조건 미충족 선택, 마지막 노드, 다시 시작.
- 저장 후 강제 종료/재실행, 저장 실패, 이전 버전 저장, 중복 탭.
- 모든 연결 대상 존재, 도달 불가 노드, 막힌 경로, 각 엔딩 도달 가능성.
- 오프라인 실행, 작은 화면, 긴 편지 스크롤, 큰 글자, 스크린리더 버튼 라벨.
- 화면 움직임 줄이기 적용. 오디오를 도입하는 버전에서는 백그라운드 중단/복귀와 음소거 정책을 함께 검증한다.
- iOS/Android별 테스트 기기·OS·커밋·결과를 기록한다.

초기 설계 검증: SQL 계약 테스트 14개 통과, 물리 ERD와 콘텐츠 모델 SVG 생성 성공.
상세 결과는 [설계 검증 기록](design-validation.md)을 참조한다.
앱 빌드·린트·자동 테스트와 양 플랫폼 네이티브 SQLite 스모크 검사를 통과했다.

## 설치 기록

Mermaid CLI를 앱 개발 의존성으로 설치했을 때 렌더러의 React 19.3 의존성이 Expo의
React 19.2와 중복됐다. CLI를 제거하고 `pnpm dlx @mermaid-js/mermaid-cli@11.17.0`으로
격리해 Expo Doctor 21개 검사를 모두 통과했다. 렌더링 브라우저 캐시는 Git에 포함하지 않는다.
[공식 pnpm 11 변경 안내](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/11.0.md)


## 기반 구현 후 갱신

Expo SDK 57.0.25, React Native 0.86.3, React 19.2.3, TypeScript 6.0.3을 설치했다.
SDK에 맞춰 expo-router, expo-sqlite, expo-crypto, safe-area-context, screens,
react-native-worklets 0.10.1, react-native-reanimated 4.5.1을 사용한다.
개발 검사에는 Zod, tsx/Node test, ESLint/Expo config를 사용한다.
이전 표의 미설치 상태는 초기 설계 시점 기록이다.

Xcode 공식 명령으로 iOS 26.5 Simulator(23F77, arm64)를 설치했고 iPhone 17e를 부팅했다.
Expo CLI가 Expo Go를 설치했다. 최초 openurl 타임아웃 후 준비 상태 확인/재실행으로
개발 서버를 연결했다. 실제 선택, 프로세스 종료 후 이어하기와 앱 내부 150% 본문 스크롤을 확인했다.
JDK 17, Android command-line tools, SDK와 `small_phone` 에뮬레이터를 설치했다.
iOS와 Android 모두 Expo Go에서 네이티브 SQLite 검사 8개 체크포인트를 통과했다.

`pnpm peers check`는 충돌 없음. Expo install --check는 SDK 권장 버전과 일치하며,
Expo Doctor 21개 검사도 모두 통과했다.

전체 상태는 `pnpm verify`로 재현한다. 이 명령은 소스·콘텐츠·DB·자동 테스트,
iOS/Android 번들, peer·SDK 권장 버전과 고정된 Expo Doctor 1.20.4를 순서대로 검사한다.
SDK 검사만 다시 실행할 때는 pnpm의 내장 `doctor`와 이름이 겹치지 않는 `pnpm sdk:check`를 사용한다.
ESLint는 Expo config의 peer 호환 범위인 9를 사용한다. 이후 Expo config가 10을
지원하면 함께 갱신한다. 단독으로 올려 peer 충돌을 만들지 않는다.

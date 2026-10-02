# 작은 세계 우체국: 내일의 소인 v4 제작 리포트

> `pnpm authoring:inspect`로 생성한다. 직접 수정하지 않는다.

- 작품: 작은 세계 우체국: 내일의 소인
- 식별자: `little-post-office@4/ko`
- 장면 18개 · 선택 25개 · 결말 2개
- 상태값 3개 · 에셋 2개 · 연출 큐 2개

## 장면 제작표

| 순서 | 장면 | 유형/보낸 이 | 본문 | 선택 | 연출 | 상태 |
| ---: | --- | --- | ---: | --- | --- | --- |
| 1 | `ten-year-mail` | 작은 세계 우체국의 소라 | 1 | accept-first-letter → first-letter<br>ask-sender → sora-answer | scene_enter: background.show(little-post-office-cover) | draft |
| 2 | `sora-answer` | 답을 고르는 소라 | 1 | open-after-answer → first-letter | — | draft |
| 3 | `first-letter` | 내일의 연우 | 1 | show-warning → shared-route<br>hide-warning → private-route | — | draft |
| 4 | `shared-route` | 닫힌 책방 앞 | 1 | enter-bookshop-together → bookshop-archive | — | draft |
| 5 | `private-route` | 책방 창문 안쪽 | 1 | call-sora → bookshop-archive<br>enter-bookshop-alone → bookshop-archive | — | draft |
| 6 | `bookshop-archive` | 파도 사이 책방의 대출 장부 | 1 | read-address-book → haejin-letter<br>read-personal-diary → haejin-letter | — | draft |
| 7 | `haejin-letter` | 등대지기 해진 | 1 | write-haejin → haejin-answer<br>leave-before-answer → tide-road | — | draft |
| 8 | `haejin-answer` | 문 아래로 돌아온 빈 봉투 | 1 | follow-haejin-map → tide-road | — | draft |
| 9 | `tide-road` | 썰물 위의 바닷길 | 1 | walk-with-sora → lighthouse-room<br>walk-alone → lighthouse-room | scene_enter: background.show(little-post-office-tide-road-v2) | draft |
| 10 | `lighthouse-room` | 불이 꺼진 등대의 분류실 | 1 | sort-undelivered-mail → undelivered-addresses<br>read-yeonwoo-confession → yeonwoo-confession | — | draft |
| 11 | `undelivered-addresses` | 배달되지 못한 일곱 주소 | 1 | leave-sealed → haejin-truth | — | draft |
| 12 | `yeonwoo-confession` | 연우가 보내지 못한 고백 | 1 | keep-confession-complete → haejin-truth | — | draft |
| 13 | `haejin-truth` | 등대 계단의 해진 | 1 | let-sora-turn-key → shared-vigil<br>turn-key-alone → solitary-vigil | — | draft |
| 14 | `shared-vigil` | 소라와 연우가 남긴 시간 | 1 | take-final-mail-together → last-delivery | — | draft |
| 15 | `solitary-vigil` | 혼자 돌린 마지막 열쇠 | 1 | take-final-mail-alone → last-delivery | — | draft |
| 16 | `last-delivery` | 십 년 전의 연우 | 1 | return-ledger → returned-ending<br>keep-last-letter → kept-ending | — | draft |
| 17 | `returned-ending` | ending | 1 | 결말: letters-returned | — | draft |
| 18 | `kept-ending` | ending | 1 | 결말: last-letter-kept | — | draft |

## 에셋 현황

| ID | 유형 | 상태 | 파일 | 권리/라이선스 |
| --- | --- | --- | --- | --- |
| `little-post-office-cover` | background | ready | `assets/little-post-office-cover.jpg` | Story Post project / project use under OpenAI terms |
| `little-post-office-tide-road-v2` | background | ready | `assets/little-post-office-tide-road-v2.png` | Story Post project / project use under OpenAI terms |

## 상태값

- `with-sora`: 기본값 false
- `follow-addresses`: 기본값 false
- `read-personal-note`: 기본값 false


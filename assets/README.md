# 에셋 기록

## little-post-office-cover.jpg

- 생성일: 2026-09-25
- 도구: OpenAI 내장 ImageGen
- 용도: 개발용 작품 목록 표지와 배경
- 외부 참조: 없음
- 후처리: PNG 1024×1536을 JPEG 품질 82로 변환

프롬프트:

> A tall 2:3 portrait cover for a Korean mobile narrative game set on a small island at night.
> Show an old post office by the shore, a bicycle, a narrow tidal path to a distant lighthouse,
> and sealed letters in the sea breeze. Refined hand-painted editorial illustration with paper
> grain and ink-wash edges; contemporary Korean indie visual-novel mood. Midnight blue,
> desaturated teal, fog gray, parchment white, and one restrained amber window. No text, logo,
> watermark, people, neon, UI mockup, decorative border, or generic purple gradient.



## little-post-office-tide-road-v2.png

- 생성일: 2026-10-02
- 도구: OpenAI 내장 ImageGen. 제작실의 외부 API 키는 사용하지 않았다.
- 용도: v4 작업 원고의 `tide-road` 진입 배경. 네이티브 출시 등록은 아직 하지 않았다.
- 크기: 1536×1024 PNG. 원본을 그대로 복사했으며 후처리 없음.
- 외부 참조: 없음. 2차 생성에는 프로젝트 자체 표지만 화풍 참조로 사용.
- 검수: 연속된 돌길, 젖은 표면, 읽을 수 없는 우표 모양, 불 꺼진 등대와 아래층의 흰 창문 확인.
  처음 결과의 사진에 가까운 표면을 2차 생성에서 붓결과 종이 질감으로 수정했다.
- 이용 기록: `Story Post project / project use under OpenAI terms`.
  최종 파일의 SHA256은 v4 `asset.csv`에 보관한다.

생성 프롬프트:

```text
Use case: illustration-story
Asset type: landscape background for a Korean mobile narrative game, 1536x1024 composition.
Scene/backdrop: At eleven at night on a remote island, the low tide has revealed a narrow wet stone causeway across the black sea to an old lighthouse. There is no beam from the lighthouse: it has been dark for years. Thin coastal mist softens the horizon.
Subject: A continuous walkable tidal path, reflective tide pools on either side, and the silhouette of the unlit lighthouse at its far end. A few tiny weathered postage-stamp shapes float in nearby pools; they have abstract faded marks, never legible text.
Style/medium: Restrained hand-painted cinematic digital illustration, fine paper grain and ink-wash edges, believable depth, tactile wet stone. Quiet contemporary indie visual-novel atmosphere, a little unease.
Composition/framing: Landscape environment, observer at walking height facing along the path. Make the lighthouse and path legible at mobile size. Keep the middle and lower center calm, dark, low contrast, with room for a separate paper reading interface; the background itself contains no UI. Avoid a bright moon or prominent foreground objects.
Lighting/mood: Dim reflected night light on water and wet stone, gentle atmospheric depth, no light beam, no luminous magic.
Color palette: Ink black, midnight navy, desaturated mist teal, weathered gray. Subtle natural highlights only.
Constraints: No people, readable letters, text, numbers, signage, captions, logo, watermark, decorative frame, game interface, neon, glossy 3D, fantasy particles, or recognizable copyrighted characters. No lit lighthouse beacon. Produce one finished background illustration.
```

최종 수정 프롬프트:

```text
Use case: style-transfer.
Image 1 is the EDIT TARGET: the generated unlit-lighthouse tidal path background. Image 2 is ONLY a style reference: the project's illustrated night-post-office cover.
Change only the rendering style of Image 1: match the visibly hand-painted watercolor/gouache-like paper texture, simplified brush-shaped stones, ink edges, restrained blue-teal palette and softly illustrated skies of Image 2. It should read as a painted narrative-game environment, not a photograph or a realistic 3D render.
Preserve Image 1's landscape framing, continuous low-tide walkway, mist, water pools, tiny illegible floating postage-stamp shapes, lighthouse position and completely UNLIT lighthouse. Do not copy Image 2's moon, beacon beam, lit windows, post office, bicycle, flowers, envelopes, or extra objects. Keep the central and lower reading area quiet and dark. No people, text, numbers, logo, watermark, interface, border, neon or luminous particles. One finished landscape background.
```

창문 연속성 최종 수정 프롬프트:

```text
Use case: lighting-weather. Edit only the lighthouse's lowest-storey window in this painted background: give ONE small rectangular window near the base of the tower a faint parchment-white glow. This reflects a single strange white window described in the manuscript. Keep the lighthouse lantern at the top completely dark, with no rotating beam, no additional windows or lights. Preserve the entire illustration, landscape framing, stone causeway, stamp shapes, water, cloudy sky, mist, painterly paper texture and blue-teal palette unchanged. The new light is restrained, off-white, not amber, neon or a large halo. No people, text, logo, watermark, interface or new objects.
```

v1은 창문 보강 전 중간 시안이며 원장에 연결하지 않는다. 중간 시안은 `.authoring/art-runs/little-post-office-tide-road-v1.png`에 보관하며 Git·앱 에셋에 포함하지 않는다.

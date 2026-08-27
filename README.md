# Doro Live2D — 웹 뷰어

Live2D Cubism 모델을 브라우저에 띄우고 클릭·드래그로 상호작용하는 뷰어입니다.
빌드 단계가 없고, 런타임 라이브러리는 전부 로컬에 포함되어 있어 인터넷 없이도 동작합니다.

기본 대상 모델은 **Dororong**(by **0x4682B4**)이며, 다른 Cubism 4/5 모델도 올릴 수 있습니다
(→ [다른 모델 쓰기](#다른-모델-쓰기)).

## 모델 준비

**모델 파일은 이 저장소에 포함되어 있지 않습니다.** 저작권은 원작자에게 있고, 재배포 조건을
따로 확인하지 않았기 때문에 직접 받아서 넣는 방식으로 두었습니다.

### 1. 모델 내려받기

`【Live2D model】Dororong` — 제작자 **0x4682B4**, 무료 배포입니다.

- BOOTH — <https://booth.pm/en/items/5867617>
- Ko-fi — <https://ko-fi.com/s/acedd75ed5>
- 제작자 공지 — <https://x.com/0x4682B4/status/1807781316395725123>

내려받기 전에 배포처에 적힌 이용 약관을 확인하세요. 이 저장소는 뷰어 코드만 제공합니다.

### 2. 설치

받은 zip(또는 압축을 푼 `Doro` 폴더) 경로를 넘기면 됩니다.

```
npm run setup-model -- ./Dororong_Meme_Live2D_Model__By_0x4682B4_.zip
# 또는
node tools/setup-model.js ~/Downloads/Doro
```

스크립트가 하는 일:

1. 모델 파일을 `public/models/Doro/` 로 풀어 넣습니다 (zip 해제는 `zlib` 만 씁니다 — 외부 명령 불필요).
2. 원본을 `Doro.model3.json.orig` 로 보관하고, `Doro.model3.json` 에 뷰어가 쓰는 항목을 채웁니다.

원본 `model3.json` 에는 `Expressions` / `Motions` / `HitAreas` 항목이 **아예 없어서**
그대로는 표정도 달리기 모션도 잡히지 않습니다. 스크립트가 추가하는 내용:

- `FileReferences.Expressions` — `Expressions/` 안의 exp3 파일 10개
- `FileReferences.Motions.Idle` — `Idle.motion3.json` (달리기 루프)
- `HitAreas` — 다른 도구와의 호환용. **뷰어 자체는 이걸 쓰지 않습니다** (아래 [구현 메모](#구현-메모) 참고)
- `Groups.LipSync` — `ParamMouthOpenY`

`Groups.EyeBlink` 는 일부러 비워 둡니다. pixi-live2d-display 는 모션이 재생 중이 아닐 때만
내장 눈깜빡임을 돌리는데 달리기 모션이 계속 루프하므로 절대 동작하지 않습니다.
그래서 `app.js` 가 직접 깜빡임을 처리합니다.

## 실행

정적 서버가 필요합니다. `file://` 로 열면 모델 파일을 읽을 수 없습니다.

**Windows**

```
start.bat
```

**Linux / macOS**

```
chmod +x start.sh   # 최초 1회 (권한 오류가 날 때만)
./start.sh          # 포트를 바꾸려면 ./start.sh 8080
```

**직접 실행**

```
npm start           # = node server.js  (포트 8012)
node server.js 8080 # 포트 지정
```

그다음 <http://localhost:8012/> 로 접속합니다.
node 가 없으면 `start.sh` 가 `python3 -m http.server` 로 자동 대체합니다.

## 조작

| 동작 | 결과 |
|---|---|
| **캐릭터 클릭** | 부위별로 또잉또잉 튕김 (리본 / 머리카락 / 얼굴 / 몸통) |
| **캐릭터 드래그** | 잡은 부위가 커서 쪽으로 쭉 늘어나고, 놓으면 출렁이며 복귀 |
| **배경 드래그** | 모델 위치 이동 |
| **마우스 이동** | 얼굴·눈이 커서를 따라감 (시선 추적 토글) |
| **휠** | 확대 / 축소 |
| **숫자키 `1`~`0`** | 표정 토글 (여러 개 동시에 켤 수 있음) |
| **`C` / `R` / `Space` / `H`** | 표정 초기화 / 위치 초기화 / 랜덤 리액션 / 패널 접기 |

패널에서 표정, 달리기 모션, 배경, 크기, PNG 저장(투명 배경)을 조작할 수 있습니다.

## 구조

```
public/
  index.html          UI 껍데기
  app.js              뷰어 로직 전부
  style.css
  vendor/             pixi.js 6.5.10 / pixi-live2d-display 0.4.0 (cubism4) / Cubism Core 5.1
  models/             ← 모델을 여기에 넣습니다 (git 에는 올라가지 않음)
tools/setup-model.js  모델 설치 + model3.json 패치
server.js             의존성 없는 정적 서버
```

## 다른 모델 쓰기

로더는 Cubism 4/5 `model3.json` 이면 무엇이든 읽습니다. 다만 상호작용 레이어는 Doro 리그를
전제로 만들어져 있어서, 다른 모델에서는 `public/app.js` 맨 위 설정 블록을 손봐야 합니다.

| 상수 | 하는 일 | 다른 모델일 때 |
|---|---|---|
| `MODEL_DIR` / `MODEL_URL` | 모델 경로 | **반드시 수정** |
| `EXPRESSIONS` | 패널 표정 버튼 ↔ exp3 파일 | 모델의 exp3 목록으로 교체 |
| `REGIONS` | 부위별 클릭 판정에 쓸 **아트메시 이름** 묶음 | 모델마다 다름 — 교체 필요 |
| `HIT_LABEL` | 부위 표시 이름 | `REGIONS` 에 맞춰 수정 |
| `MOTION_PARAMS` | Idle 모션이 직접 제어하는 파라미터 | 모델에 맞게 수정 |
| `BASE_MANAGED` | 뷰어가 절대값으로 덮어쓰는 파라미터 | 표준 `Param*` 이름이면 대체로 그대로 |

아트메시 이름은 `Doro.cdi3.json`(DisplayInfo) 이나 Cubism Editor 의 파트 목록에서 확인할 수 있습니다.
`REGIONS` 를 비워 두면 클릭·드래그 상호작용만 빠지고 나머지는 정상 동작합니다.

또잉또잉 스쿼시는 리그에 `PhyBounce` 파라미터가 있을 때만 켜집니다 (`hasParam('PhyBounce')` 로
확인 후 적용). 없는 모델에서는 조용히 건너뜁니다.

`tools/setup-model.js` 의 패치 내용도 Doro 전용이므로, 다른 모델은 스크립트를 거치지 말고
`public/models/<이름>/` 에 그대로 넣은 뒤 `MODEL_DIR` 만 바꾸는 편이 낫습니다.
(대부분의 배포 모델은 `model3.json` 에 `Expressions`/`Motions` 가 이미 채워져 있습니다.)

## 구현 메모

- **클릭 판정** — `model3.json` 의 `HitAreas` 는 아트메시의 *바운딩 박스* 판정이라 이 모델처럼
  부위가 겹치는 치비 체형에서는 거의 쓸모가 없습니다. `app.js` 는 아트메시 이름을 부위별로 묶고
  삼각형 단위로 정밀 판정합니다 (`REGIONS`, `pointInDrawable`).
- **파라미터 쓰기** — `Cubism4InternalModel.update()` 는 `afterMotionUpdate` 직후에
  `saveParameters()` 를 부르고, 프레임 끝에서 `loadParameters()` 로 그 스냅샷을 되돌립니다.
  즉 이 훅에서 쓴 값은 다음 프레임의 시작 상태로 이어집니다. 그래서 `add*` 가 아니라
  **기본값 + 델타를 절대값으로 `set`** 해서 프레임 간 누적을 막습니다.
- **또잉또잉** — 모델 리그에 `PhyBounce` 스쿼시/스트레치 디포머(−1 납작 / +1 길쭉)가 있습니다.
  이건 physics 의 *출력* 파라미터라 물리 계산 이후인 `beforeModelUpdate` 에서 덮어씁니다.
  이 시점의 쓰기는 `saveParameters()` 이후라 누적되지 않습니다.
- **잡아당기기** — 코어의 정점 버퍼(`coreModel._model.drawables.vertexPositions`)에 draw 직전에
  직접 씁니다. 코어가 매 프레임 정점을 다시 계산하므로 누적되지 않습니다.
  잡은 지점 기준 반경 안의 정점을 부드러운 감쇠 가중치로 밀어냅니다.
- **달리기 루프** — pixi-live2d-display 0.4.0 은 `motion3.json` 의 `Meta.Loop` 를 파싱해 두고도
  `setIsLoop` 를 한 번도 호출하지 않습니다. 그대로 두면 `getDuration()` 이 0.983초를 돌려주어
  매 바퀴 페이드아웃 → 종료 → 비동기 재시작이 일어나고, 달리기 진폭이 1초마다 20 → 3.5 로 주저앉습니다.
  `enableIdleLoop()` 에서 모션 인스턴스에 직접 루프를 켭니다.
- **PNG 저장** — `extract.canvas()` 를 인자 없이 부르면 pixi 가 `renderer.width`(이미 디바이스 픽셀)에
  `resolution` 을 한 번 더 곱해서 DPR 2 에서 2배 큰 캔버스가 나옵니다. CSS 픽셀 프레임(`app.screen`)을
  명시해야 합니다.

## 라이선스 · 크레딧

- **모델** — 【Live2D model】Dororong © **0x4682B4**
  ([BOOTH](https://booth.pm/en/items/5867617) · [Ko-fi](https://ko-fi.com/s/acedd75ed5) ·
  [@0x4682B4](https://x.com/0x4682B4)).
  이 저장소에 포함되어 있지 않으며, 이용 조건은 원본 배포처를 따릅니다.
  캐릭터 Dororong 은 《승리의 여신: 니케》의 도로시에서 파생된 팬메이드 밈 캐릭터입니다.
- **Live2D Cubism Core** — © Live2D Inc.
  [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)
- **pixi-live2d-display** — MIT / **PixiJS** — MIT
- 그 외 이 저장소의 코드(`public/app.js`, `server.js`, `tools/`) — MIT

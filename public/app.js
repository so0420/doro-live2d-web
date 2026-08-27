/*
 * Doro Live2D web viewer
 * PixiJS 6 + pixi-live2d-display (cubism4) + Live2D Cubism Core 5
 */
(function () {
'use strict';

/* ------------------------------------------------------------------ config */

const MODEL_DIR = 'models/Doro/';
const MODEL_URL = MODEL_DIR + 'Doro.model3.json';

/* 표정 파일 목록. label 은 UI 버튼 텍스트. */
const EXPRESSIONS = [
  { id: 'exp1',   label: '표정 1', file: 'Expressions/Exp1.exp3.json' },
  { id: 'exp2',   label: '표정 2', file: 'Expressions/Exp2.exp3.json' },
  { id: 'exp3',   label: '표정 3', file: 'Expressions/Exp3.exp3.json' },
  { id: 'exp4',   label: '표정 4', file: 'Expressions/Exp4.exp3.json' },
  { id: 'exp5',   label: '표정 5', file: 'Expressions/Exp5.exp3.json' },
  { id: 'exp6',   label: '표정 6', file: 'Expressions/Exp6.exp3.json' },
  { id: 'exp7',   label: '표정 7', file: 'Expressions/Exp7.exp3.json' },
  { id: 'star',   label: '⭐ 별눈', file: 'Expressions/Exp8.exp3.json' },
  { id: 'nohl',   label: '🌑 하이라이트 OFF', file: 'Expressions/Highlight OFF.exp3.json' },
  { id: 'tongue', label: '😛 메롱', file: 'Expressions/TongueOut.exp3.json' }
];

/*
 * 클릭 판정 영역. 위에서부터 먼저 검사하므로 배열 순서가 곧 우선순위다.
 * model3.json 의 HitAreas 는 바운딩 박스 판정이라 부위가 심하게 겹쳐서,
 * 여기서는 아트메시 이름을 직접 묶고 삼각형 단위로 정밀 판정한다.
 */
const REGIONS = [
  { name: 'Bow',  ids: ['Bow_M', 'Bow_L1', 'Bow_R1', 'Bow_L2', 'Bow_R2', 'Ribbon1', 'Ribbon2', 'Ribbon3'] },
  { name: 'Hair', ids: ['Hair_top', 'Hair_front_L', 'Hair_front_R', 'Hair_front_M1', 'Hair_front_M2',
                        'Hair_side_L', 'Hair_side_L2', 'Hair_side_R', 'Hair_base', 'Hair_back', 'Hair_pattern'] },
  { name: 'Head', ids: ['Eye_color_L', 'Eye_color_R', 'Eye_outline_L', 'Eye_outline_R',
                        'Mouth_inner', 'Lip_Upper', 'Blush_R', 'Face', 'Face_outline'] },
  /* 다리 메시가 흰 몸통을 거의 다 덮어서 따로 나누면 오히려 헷갈린다 — 하나로 묶는다 */
  { name: 'Body', ids: ['Body', 'Body_outline', 'Leg_front_L', 'Leg_front_R', 'Leg_back_L'] }
];
const HIT_LABEL = { Bow: '리본', Head: '얼굴', Body: '몸통', Hair: '머리카락' };

/* 모션이 직접 제어하는 파라미터 — 달리기를 껐을 때만 기본값으로 되돌린다. */
const MOTION_PARAMS = ['ParamStep', 'AnimLine', 'AnimLoading1', 'AnimLoading2'];

/* 항상 우리가 절대값으로 덮어쓰는 파라미터 (표정 파일에 등장하는 것은 자동 추가) */
const BASE_MANAGED = [
  'ParamEyeLOpen', 'ParamEyeROpen', 'ParamEyeSmile',
  'ParamAngleX', 'ParamAngleZ',
  'ParamBodyAngleY', 'ParamBodyAngleZ',
  'ParamBrowLY', 'ParamBrowRY',
  'ParamMouthOpenY', 'ParamMouthForm', 'ParamTongueOut'
];

/* --------------------------------------------------------------------- dom */

const $ = (sel) => document.querySelector(sel);
const canvas      = $('#stage');
const loaderEl    = $('#loader');
const loaderText  = $('#loader-text');
const toastEl     = $('#toast');
const hintEl      = $('#hint');
const panelEl     = $('#panel');
const panelToggle = $('#panel-toggle');
const expWrap     = $('#expression-buttons');
const scaleRange  = $('#scale-range');
const scaleOut    = $('#scale-out');
const lastHitEl   = $('#last-hit');

let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 1400);
}

function fatal(msg, err) {
  if (err) console.error(err);
  loaderEl.classList.remove('is-hidden');
  loaderEl.classList.add('is-error');
  loaderText.textContent = msg;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ------------------------------------------------------------------- boot */

boot().catch((err) => fatal('초기화 중 오류가 발생했습니다: ' + (err && err.message), err));

async function boot() {
  if (location.protocol === 'file:') {
    return fatal('file:// 로는 모델 파일을 읽을 수 없습니다. start.bat 또는 "npm start" 로 로컬 서버를 띄운 뒤 http://localhost:8012 으로 접속하세요.');
  }
  if (!window.Live2DCubismCore) {
    return fatal('Live2D Cubism Core 를 불러오지 못했습니다. vendor/live2dcubismcore.min.js 를 확인하세요.');
  }
  if (!window.PIXI || !window.PIXI.live2d) {
    return fatal('PixiJS / pixi-live2d-display 를 불러오지 못했습니다. vendor 폴더를 확인하세요.');
  }

  const Live2DModel = PIXI.live2d.Live2DModel;
  Live2DModel.registerTicker(PIXI.Ticker);

  const app = new PIXI.Application({
    view: canvas,
    backgroundAlpha: 0,
    antialias: true,
    autoStart: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    width: window.innerWidth,
    height: window.innerHeight
  });

  loaderText.textContent = '모델을 불러오는 중… (Doro.moc3)';

  let model;
  try {
    model = await Live2DModel.from(MODEL_URL, {
      autoInteract: false,
      idleMotionGroup: 'Idle',
      motionPreload: 'ALL'
    });
  } catch (err) {
    return fatal(
      '모델을 불러오지 못했습니다. 모델 파일은 저장소에 포함되어 있지 않습니다 — ' +
      'README 의 "모델 준비" 를 따라 `npm run setup-model -- <내려받은.zip>` 을 먼저 실행하세요. ' +
      '(찾는 경로: ' + MODEL_URL + ')', err);
  }

  model.anchor.set(0.5, 0.5);
  app.stage.addChild(model);

  const core = model.internalModel.coreModel;

  /* ---------------------------------------------------- 표정 데이터 로드 */

  const expressions = EXPRESSIONS.map((def) => ({ def: def, data: null, target: 0, weight: 0 }));
  await Promise.all(expressions.map(async (e) => {
    try {
      const res = await fetch(encodeURI(MODEL_DIR + e.def.file));
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const json = await res.json();
      if (!json || !Array.isArray(json.Parameters)) throw new Error('Parameters 배열이 없습니다');
      e.data = json;
    } catch (err) {
      console.warn('[expression] 로드 실패:', e.def.file, err);
    }
  }));

  /* 모델이 실제로 가진 파라미터 ID 집합 (없는 ID 에 쓰면 엉뚱한 값이 들어갈 수 있음) */
  const existingIds = (function () {
    const set = Object.create(null);
    try {
      const ids = core._model.parameters.ids;
      for (let i = 0; i < ids.length; i++) set[ids[i]] = true;
    } catch (err) {
      console.warn('[live2d] 파라미터 ID 목록을 읽지 못해 검증을 건너뜁니다.', err);
      return null;
    }
    return set;
  })();
  const hasParam = (id) => (existingIds ? !!existingIds[id] : true);

  /* 우리가 절대값으로 관리할 파라미터 목록 = 기본 목록 + 표정에 등장하는 파라미터 */
  const managed = BASE_MANAGED.filter(hasParam);
  for (const e of expressions) {
    if (!e.data || !Array.isArray(e.data.Parameters)) continue;
    for (const p of e.data.Parameters) {
      if (hasParam(p.Id) && managed.indexOf(p.Id) === -1) managed.push(p.Id);
    }
  }
  const motionParams = MOTION_PARAMS.filter(hasParam);

  /* 파라미터 기본값 스냅샷 */
  const defaults = Object.create(null);
  for (const id of managed.concat(motionParams)) {
    let dv = 0;
    try {
      const idx = core.getParameterIndex(id);
      if (idx >= 0) dv = core.getParameterDefaultValue(idx);
    } catch (err) { dv = 0; }
    defaults[id] = (typeof dv === 'number' && isFinite(dv)) ? dv : 0;
  }

  /* ------------------------------------------------------------- 상태값 */

  const view = { userScale: 1, offsetX: 0, offsetY: 0, baseScale: 1 };
  const state = { running: true, tracking: true };

  const blink = { phase: 0, t: 0, next: 1.5 + Math.random() * 3, value: 1 };
  const fx = {
    angleZ: { x: 0, v: 0 },
    angleX: { x: 0, v: 0 },
    bodyZ:  { x: 0, v: 0 },
    bodyY:  { x: 0, v: 0 },
    /* 또잉또잉: 약하게 감쇠하는 진동자. -1 납작 / +1 길쭉 (PhyBounce 디포머) */
    boing:  { x: 0, v: 0 },
    smile: 0,
    brow: 0,
    mouth: 0,
    talkT: -1
  };

  /* 진동 주파수 ≈ 3.5Hz, 감쇠비 ≈ 0.12 → 클릭 후 서너 번 통통 튀고 잦아든다 */
  const BOING_STIFFNESS = 480;
  const BOING_DAMPING = 5.4;

  function springStep(s, dt, stiffness, damping) {
    s.v += (-stiffness * s.x - damping * s.v) * dt;
    s.x += s.v * dt;
    if (!isFinite(s.x) || !isFinite(s.v)) { s.x = 0; s.v = 0; return; }
    if (Math.abs(s.x) < 1e-4 && Math.abs(s.v) < 1e-4) { s.x = 0; s.v = 0; }
  }

  /*
   * 반음시적 오일러라 dt 가 크면 발산한다 (강성 480 기준 dt≈0.09 부터 터짐).
   * 프레임이 길어져도 1/120 초 이하로 잘게 나눠 적분해 안정성을 보장한다.
   */
  const SPRING_MAX_STEP = 1 / 120;
  function stepAllSprings(dt) {
    const steps = Math.min(8, Math.max(1, Math.ceil(dt / SPRING_MAX_STEP)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      springStep(fx.angleZ, h, 260, 12);
      springStep(fx.angleX, h, 190, 9);
      springStep(fx.bodyZ,  h, 200, 11);
      springStep(fx.bodyY,  h, 220, 12);
      springStep(fx.boing,  h, BOING_STIFFNESS, BOING_DAMPING);
      updatePull(h);
    }
  }

  /*
   * 잡아당기기(taffy pull).
   * 잡은 지점 주변의 아트메시 정점을 커서 쪽으로 밀어내고, 놓으면 스프링으로 되돌아온다.
   * 좌표는 Cubism 원시 모델 단위(y-up, 중심 원점).
   */
  const canvasUnits = (model.internalModel.originalWidth || 1) / (model.internalModel.pixelsPerUnit || 1);
  const PULL_RADIUS = canvasUnits * 0.32;   /* 영향 반경 */
  const PULL_MAX    = canvasUnits * 0.20;   /* 최대 늘어나는 거리 */
  const PULL_K = 420;                       /* 되돌아올 때 탄성 */
  const PULL_C = 9;                         /* 되돌아올 때 감쇠 (ζ≈0.22 → 두세 번 출렁) */

  const pull = {
    active: false,
    ox: 0, oy: 0,     /* 잡은 지점 */
    dx: 0, dy: 0,     /* 현재 변위 */
    vx: 0, vy: 0,     /* 속도 */
    tx: 0, ty: 0      /* 목표 변위 */
  };

  let vertexPositions = null;
  try { vertexPositions = core._model.drawables.vertexPositions; } catch (err) { vertexPositions = null; }
  if (!vertexPositions) console.warn('[live2d] 정점 버퍼에 접근할 수 없어 잡아당기기를 비활성화합니다.');

  function updatePull(dt) {
    if (pull.active) {
      const k = Math.min(1, dt * 20);
      const nx = pull.dx + (pull.tx - pull.dx) * k;
      const ny = pull.dy + (pull.ty - pull.dy) * k;
      /* 놓는 순간 관성을 이어받도록 속도를 기록해 둔다 */
      pull.vx = (nx - pull.dx) / dt;
      pull.vy = (ny - pull.dy) / dt;
      pull.dx = nx;
      pull.dy = ny;
      return;
    }
    if (pull.dx === 0 && pull.dy === 0 && pull.vx === 0 && pull.vy === 0) return;
    pull.vx += (-PULL_K * pull.dx - PULL_C * pull.vx) * dt;
    pull.vy += (-PULL_K * pull.dy - PULL_C * pull.vy) * dt;
    pull.dx += pull.vx * dt;
    pull.dy += pull.vy * dt;
    if (Math.abs(pull.dx) < 1e-5 && Math.abs(pull.vx) < 1e-3) { pull.dx = 0; pull.vx = 0; }
    if (Math.abs(pull.dy) < 1e-5 && Math.abs(pull.vy) < 1e-3) { pull.dy = 0; pull.vy = 0; }
  }

  /* 정점 변형은 물리/파라미터 계산이 모두 끝난 draw 직전에 적용해야 한다.
     코어가 매 프레임 정점을 다시 계산하므로 여기서 쓴 값은 누적되지 않는다. */
  if (vertexPositions) {
    const internal = model.internalModel;
    const originalDraw = internal.draw.bind(internal);
    internal.draw = function (gl) {
      applyPull();
      originalDraw(gl);
    };
  }

  function applyPull() {
    const dx = pull.dx;
    const dy = pull.dy;
    if (Math.abs(dx) < 1e-5 && Math.abs(dy) < 1e-5) return;
    const ox = pull.ox;
    const oy = pull.oy;
    const r2 = PULL_RADIUS * PULL_RADIUS;
    for (let d = 0; d < vertexPositions.length; d++) {
      const v = vertexPositions[d];
      if (!v) continue;
      for (let i = 0; i < v.length; i += 2) {
        const ax = v[i] - ox;
        const ay = v[i + 1] - oy;
        const t = (ax * ax + ay * ay) / r2;
        if (t >= 1) continue;
        const w = (1 - t) * (1 - t);   /* 가장자리로 갈수록 부드럽게 0 */
        v[i] += dx * w;
        v[i + 1] += dy * w;
      }
    }
  }

  /* power 1 ≈ 살짝, 2 ≈ 세게 */
  function boing(power) {
    fx.boing.v -= 16 * power;   /* 먼저 눌렸다가(납작) 튀어오른다 */
    fx.bodyY.v -= 34 * power;   /* 몸이 같이 내려앉으며 머리카락 물리가 따라 흔들림 */
  }

  /* ------------------------------------------------------- 파라미터 훅 */

  let lastTick = performance.now();

  model.internalModel.on('afterMotionUpdate', function () {
    const now = performance.now();
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 15);

    /* 눈 깜빡임 */
    blink.t += dt;
    if (blink.phase === 0) {
      blink.value = 1;
      if (blink.t >= blink.next) { blink.phase = 1; blink.t = 0; }
    } else if (blink.phase === 1) {
      blink.value = clamp(1 - blink.t / 0.06, 0, 1);
      if (blink.t >= 0.06) { blink.phase = 2; blink.t = 0; }
    } else if (blink.phase === 2) {
      blink.value = 0;
      if (blink.t >= 0.05) { blink.phase = 3; blink.t = 0; }
    } else {
      blink.value = clamp(blink.t / 0.16, 0, 1);
      if (blink.t >= 0.16) {
        blink.phase = 0; blink.t = 0; blink.value = 1;
        blink.next = 1.6 + Math.random() * 4;
      }
    }

    /* 표정 가중치 페이드 */
    const k = Math.min(1, dt * 9);
    for (const e of expressions) e.weight += (e.target - e.weight) * k;

    /* 스프링 / 감쇠 */
    stepAllSprings(dt);
    fx.smile += (0 - fx.smile) * Math.min(1, dt * 3);
    fx.brow  += (0 - fx.brow)  * Math.min(1, dt * 3);

    /* 말하기 */
    if (fx.talkT >= 0) {
      fx.talkT += dt;
      fx.mouth = Math.max(0, Math.sin(fx.talkT * 16) * 0.5 + 0.5) * clamp(1 - fx.talkT / 1.6, 0, 1);
      if (fx.talkT > 1.6) { fx.talkT = -1; fx.mouth = 0; }
    } else {
      fx.mouth += (0 - fx.mouth) * Math.min(1, dt * 8);
    }

    /* 누적값 계산 (절대값으로 덮어써서 프레임 간 누적을 막는다) */
    const acc = Object.create(null);
    for (const id of managed) acc[id] = defaults[id];

    for (const e of expressions) {
      if (!e.data || e.weight < 0.002) continue;
      for (const p of e.data.Parameters) {
        if (!(p.Id in acc)) continue;
        if (p.Blend === 'Multiply') {
          acc[p.Id] *= 1 + (p.Value - 1) * e.weight;
        } else if (p.Blend === 'Overwrite') {
          acc[p.Id] += (p.Value - acc[p.Id]) * e.weight;
        } else {
          acc[p.Id] += p.Value * e.weight;
        }
      }
    }

    const bump = (id, d) => { if (id in acc) acc[id] += d; };
    const mul  = (id, f) => { if (id in acc) acc[id] *= f; };

    mul('ParamEyeLOpen', blink.value);
    mul('ParamEyeROpen', blink.value);
    bump('ParamEyeSmile',   fx.smile);
    bump('ParamAngleZ',     fx.angleZ.x);
    bump('ParamAngleX',     fx.angleX.x);
    bump('ParamBodyAngleZ', fx.bodyZ.x);
    bump('ParamBodyAngleY', fx.bodyY.x);
    bump('ParamBrowLY',     fx.brow);
    bump('ParamBrowRY',     fx.brow);
    bump('ParamMouthOpenY', fx.mouth);

    for (const id of managed) core.setParameterValueById(id, acc[id]);

    /* 달리기 OFF 일 때 모션 파라미터를 기본값으로 고정 */
    if (!state.running) {
      for (const id of motionParams) core.setParameterValueById(id, defaults[id]);
    }
  });

  /*
   * PhyBounce 는 physics3.json 의 출력 파라미터라 물리 계산 뒤에 덮어써야 한다.
   * beforeModelUpdate 는 saveParameters() 이후라서 여기 쓴 값은 다음 프레임으로 누적되지 않는다.
   */
  const hasBounce = hasParam('PhyBounce');
  model.internalModel.on('beforeModelUpdate', function () {
    if (!hasBounce) return;
    if (Math.abs(fx.boing.x) < 5e-4) return;
    core.addParameterValueById('PhyBounce', clamp(fx.boing.x, -1, 1));
  });

  /* ----------------------------------------------------------- 레이아웃 */

  function applyTransform() {
    const s = view.baseScale * view.userScale;
    /* 스프라이트 단위의 스쿼시&스트레치를 살짝 얹어 탄력을 강조 */
    const b = clamp(fx.boing.x, -1.2, 1.2) * 0.07;
    model.scale.set(s * (1 - b), s * (1 + b));
    model.position.set(
      app.screen.width / 2 + view.offsetX,
      app.screen.height / 2 + view.offsetY
    );
  }

  function layout() {
    const w = app.screen.width;
    const h = app.screen.height;
    const mw = model.internalModel.width || 1;
    const mh = model.internalModel.height || 1;
    view.baseScale = Math.min(w / mw, h / mh) * 0.82;
    applyTransform();
  }

  function onResize() {
    /* 브라우저 확대/모니터 이동으로 DPR 이 바뀌면 해상도도 따라가야 흐려지지 않는다 */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(app.renderer.resolution - dpr) > 0.01) {
      app.renderer.resolution = dpr;
    }
    app.renderer.resize(window.innerWidth, window.innerHeight);
    layout();
  }
  window.addEventListener('resize', onResize);
  layout();

  app.ticker.add(applyTransform);

  /* --------------------------------------------------------- 표정 제어 */

  function findExp(id) {
    for (const e of expressions) if (e.def.id === id) return e;
    return null;
  }
  function toggleExpression(id) {
    const e = findExp(id);
    if (!e) return false;
    e.target = e.target > 0.5 ? 0 : 1;
    syncExpressionButtons();
    return e.target > 0.5;
  }
  function clearExpressions() {
    for (const e of expressions) e.target = 0;
    syncExpressionButtons();
  }

  /* --------------------------------------------------------- 모션 제어 */

  /*
   * pixi-live2d-display 0.4.0 은 motion3.json 의 Meta.Loop 를 파싱해 놓고도 setIsLoop 를 호출하지 않는다
   * (createMotion 은 setFadeInTime/setFadeOutTime/setEffectIds 만 부른다).
   * 그대로 두면 getDuration() 이 0.983초를 돌려주어 매 바퀴 페이드아웃 → 종료 → 비동기 재시작이 일어나고,
   * 달리기 진폭이 1초에 한 번씩 눈에 띄게 주저앉는다. 인스턴스에 직접 루프를 켜 준다.
   */
  async function enableIdleLoop() {
    const mm = model.internalModel.motionManager;
    let motion = mm.motionGroups.Idle && mm.motionGroups.Idle[0];
    if (!motion) {
      try { motion = await mm.loadMotion('Idle', 0); } catch (err) { motion = null; }
    }
    if (!motion || typeof motion.setIsLoop !== 'function') {
      console.warn('[live2d] Idle 모션 루프를 켜지 못했습니다 — 1초마다 끊길 수 있습니다.');
      return false;
    }
    motion.setIsLoop(true);
    /* 루프마다 페이드인을 다시 걸지 않도록 */
    if (typeof motion.setIsLoopFadeIn === 'function') motion.setIsLoopFadeIn(false);
    return true;
  }

  function setRunning(on) {
    state.running = on;
    const mm = model.internalModel.motionManager;
    if (on) {
      mm.groups.idle = 'Idle';
      model.motion('Idle', 0, 3);
    } else {
      mm.groups.idle = '__stopped__';
      mm.stopAllMotions();
    }
    syncToggleButtons();
  }

  /* ----------------------------------------------------------- 리액션 */

  /* 클릭 반응은 물리(또잉또잉·흔들림)만 담당한다. 표정은 패널/숫자키로만 바꾼다. */
  const REACTIONS = {
    Bow: function () {
      boing(0.9);
      fx.angleZ.v += 26;
      fx.bodyZ.v += 10;
      toast('리본 콕!');
    },
    Head: function () {
      boing(1.1);
      fx.angleZ.v += (Math.random() < 0.5 ? -1 : 1) * 30;
      fx.brow = 0.4;
      toast('또잉!');
    },
    Hair: function () {
      boing(0.55);
      fx.angleX.v += (Math.random() < 0.5 ? -1 : 1) * 46;
      fx.angleZ.v += 12;
      fx.smile = 1;
      toast('쓰다듬 쓰다듬 ✨');
    },
    Body: function () {
      boing(1.6);
      fx.bodyZ.v += (Math.random() < 0.5 ? -1 : 1) * 22;
      fx.angleZ.v -= 12;
      toast('또잉또잉!');
    }
  };

  function randomReaction() {
    const keys = ['Bow', 'Head', 'Hair', 'Body'];
    const k = keys[Math.floor(Math.random() * keys.length)];
    REACTIONS[k]();
    lastHitEl.textContent = HIT_LABEL[k];
  }

  /*
   * 시선. Live2DModel.focus() 는 커서 방향만 쓰고 거리를 버려서 항상 최대 각도로 꺾이고,
   * 정확히 중앙을 넘기면 atan2(0,0)=0 이라 시선이 오른쪽 끝으로 튄다.
   * 거리를 보존하도록 focusController 를 직접 호출한다.
   */
  function lookAt(x, y) {
    const im = model.internalModel;
    try {
      _pt.set(x, y);
      const p = model.toModelPosition(_pt, _pt, true);
      im.focusController.focus(
        clamp(p.x / im.originalWidth * 2 - 1, -1, 1),
        clamp(-(p.y / im.originalHeight * 2 - 1), -1, 1)
      );
    } catch (err) { /* noop */ }
  }
  function lookForward() {
    try { model.internalModel.focusController.focus(0, 0); } catch (err) { /* noop */ }
  }

  /* ------------------------------------------------- 정밀 클릭 판정 */

  /* 영역별 아트메시 인덱스 (모델에 없는 이름은 조용히 버린다) */
  const regions = REGIONS.map(function (r) {
    const parts = [];
    for (const id of r.ids) {
      let idx = -1;
      try { idx = model.internalModel.getDrawableIndex(id); } catch (err) { idx = -1; }
      if (idx >= 0 && parts.indexOf(idx) === -1) parts.push(idx);
    }
    return { name: r.name, parts: parts };
  }).filter(function (r) { return r.parts.length > 0; });

  /* 아트메시 삼각형 인덱스. 없으면 바운딩 박스 판정으로 자동 폴백. */
  let triIndices = null;
  try { triIndices = core._model.drawables.indices; } catch (err) { triIndices = null; }
  if (!triIndices) console.warn('[live2d] 삼각형 인덱스를 읽지 못해 바운딩 박스로 판정합니다.');

  const _pt = new PIXI.Point();

  function isDrawableVisible(idx) {
    try { return core.getDrawableDynamicFlagIsVisible(idx); } catch (err) { return true; }
  }

  function sign(px, py, ax, ay, bx, by) {
    return (px - bx) * (ay - by) - (ax - bx) * (py - by);
  }

  function pointInDrawable(idx, mx, my) {
    let v;
    try { v = model.internalModel.getDrawableVertices(idx); } catch (err) { return false; }
    if (!v || v.length < 6) return false;

    /* 1차: 바운딩 박스로 빠르게 걸러낸다 */
    let minX = v[0], maxX = v[0], minY = v[1], maxY = v[1];
    for (let i = 2; i < v.length; i += 2) {
      const x = v[i], y = v[i + 1];
      if (x < minX) minX = x; else if (x > maxX) maxX = x;
      if (y < minY) minY = y; else if (y > maxY) maxY = y;
    }
    if (mx < minX || mx > maxX || my < minY || my > maxY) return false;

    const tri = triIndices && triIndices[idx];
    if (!tri || !tri.length) return true;   /* 폴백: 박스 안이면 히트 */

    /* 2차: 삼각형 단위 정밀 판정 */
    for (let i = 0; i + 2 < tri.length; i += 3) {
      const a = tri[i] * 2, b = tri[i + 1] * 2, c = tri[i + 2] * 2;
      const d1 = sign(mx, my, v[a], v[a + 1], v[b], v[b + 1]);
      const d2 = sign(mx, my, v[b], v[b + 1], v[c], v[c + 1]);
      const d3 = sign(mx, my, v[c], v[c + 1], v[a], v[a + 1]);
      const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      if (!(neg && pos)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ 포인터 */

  let pointerId = null;
  let downX = 0, downY = 0, movedFar = false;
  let dragOX = 0, dragOY = 0;
  let dragMode = null;      /* 'pan' = 배경 드래그로 이동, 'grab' = 모델을 잡아당기기 */
  let grabHit = null;
  let hoverName = null;
  let lastHoverTest = 0;

  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  /* 화면 좌표 → Cubism 원시 모델 단위 */
  function toRawPoint(x, y) {
    const im = model.internalModel;
    const ppu = im.pixelsPerUnit || 1;
    _pt.set(x, y);
    const p = model.toModelPosition(_pt, _pt);
    return {
      x: (p.x - im.originalWidth / 2) / ppu,
      y: (im.originalHeight / 2 - p.y) / ppu
    };
  }

  function pickHit(x, y) {
    let p;
    try {
      _pt.set(x, y);
      p = model.toModelPosition(_pt, _pt);
    } catch (err) {
      return null;
    }
    for (const r of regions) {
      for (const idx of r.parts) {
        if (!isDrawableVisible(idx)) continue;
        if (pointInDrawable(idx, p.x, p.y)) return r.name;
      }
    }
    return null;
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (pointerId !== null) return;
    if (ev.button !== 0) return;            /* 좌클릭(및 터치/펜)만 */
    pointerId = ev.pointerId;
    try { canvas.setPointerCapture(ev.pointerId); } catch (err) { /* noop */ }
    const p = canvasPoint(ev);
    downX = p.x; downY = p.y;
    movedFar = false;
    dragOX = view.offsetX; dragOY = view.offsetY;

    grabHit = vertexPositions ? pickHit(p.x, p.y) : null;
    dragMode = grabHit ? 'grab' : 'pan';
    if (dragMode === 'grab') {
      const r = toRawPoint(p.x, p.y);
      pull.ox = r.x; pull.oy = r.y;
      pull.dx = 0; pull.dy = 0; pull.vx = 0; pull.vy = 0;
      pull.tx = 0; pull.ty = 0;
      canvas.classList.add('is-grabbing');
    }
    dismissHint();
  });

  canvas.addEventListener('pointermove', function (ev) {
    /* 드래그 중이면 그 포인터만 처리한다 (두 번째 손가락이 끼어들지 않도록) */
    if (pointerId !== null && pointerId !== ev.pointerId) return;
    const p = canvasPoint(ev);

    if (pointerId === ev.pointerId) {
      const dx = p.x - downX;
      const dy = p.y - downY;
      if (!movedFar && Math.sqrt(dx * dx + dy * dy) > 5) {
        movedFar = true;
        canvas.classList.add('is-dragging');
        if (dragMode === 'grab') pull.active = true;
      }
      if (movedFar) {
        if (dragMode === 'pan') {
          const prevX = view.offsetX;
          view.offsetX = dragOX + dx;
          view.offsetY = dragOY + dy;
          fx.bodyZ.v += clamp((prevX - view.offsetX) * 0.5, -40, 40);
        } else {
          const r = toRawPoint(p.x, p.y);
          let tx = r.x - pull.ox;
          let ty = r.y - pull.oy;
          const dist = Math.sqrt(tx * tx + ty * ty);
          if (dist > 1e-6) {
            /* 멀리 끌수록 저항이 커지도록 tanh 로 부드럽게 제한 */
            const capped = PULL_MAX * Math.tanh(dist / PULL_MAX);
            tx = tx / dist * capped;
            ty = ty / dist * capped;
          }
          pull.tx = tx;
          pull.ty = ty;
        }
        return;
      }
    }

    if (state.tracking) lookAt(p.x, p.y);

    /* 정밀 판정은 비싸므로 커서 모양 갱신은 60ms 간격으로만 */
    const t = performance.now();
    if (t - lastHoverTest < 60) return;
    lastHoverTest = t;

    const name = pickHit(p.x, p.y);
    if (name !== hoverName) {
      hoverName = name;
      canvas.classList.toggle('is-over', !!name);
    }
  });

  function releasePointer() {
    pointerId = null;
    movedFar = false;
    dragMode = null;
    grabHit = null;
    pull.active = false;
    canvas.classList.remove('is-dragging', 'is-grabbing');
  }

  canvas.addEventListener('pointerup', function (ev) {
    if (pointerId !== ev.pointerId) return;
    const wasDragging = movedFar;
    const mode = dragMode;
    const hit = grabHit;
    releasePointer();

    if (wasDragging) {
      /* 잡아당기다 놓으면 남은 관성으로 출렁이며 되돌아온다 */
      if (mode === 'grab') boing(0.4);
      return;
    }
    if (!hit) { lastHitEl.textContent = '—'; return; }
    lastHitEl.textContent = HIT_LABEL[hit] || hit;
    (REACTIONS[hit] || REACTIONS.Body)();
  });

  canvas.addEventListener('pointercancel', function (ev) {
    if (pointerId !== ev.pointerId) return;
    releasePointer();
  });

  canvas.addEventListener('pointerleave', function () {
    canvas.classList.remove('is-over');
    hoverName = null;
    if (state.tracking) lookForward();
  });

  canvas.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    view.userScale = clamp(view.userScale * Math.exp(-ev.deltaY * 0.0012), 0.3, 2.5);
    syncScaleUI();
  }, { passive: false });

  /* --------------------------------------------------------------- UI */

  function syncScaleUI() {
    scaleRange.value = String(view.userScale);
    scaleOut.textContent = Math.round(view.userScale * 100) + '%';
  }

  function syncExpressionButtons() {
    const kids = expWrap.children;
    for (let i = 0; i < kids.length; i++) {
      const btn = kids[i];
      const e = findExp(btn.dataset.exp);
      const on = !!e && e.target > 0.5;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  function syncToggleButtons() {
    const r = document.querySelector('[data-toggle="running"]');
    const t = document.querySelector('[data-toggle="tracking"]');
    if (r) { r.classList.toggle('is-on', state.running); r.setAttribute('aria-pressed', String(state.running)); }
    if (t) { t.classList.toggle('is-on', state.tracking); t.setAttribute('aria-pressed', String(state.tracking)); }
  }

  expressions.forEach(function (e) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = e.def.label;
    btn.dataset.exp = e.def.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      const on = toggleExpression(e.def.id);
      toast(e.def.label + (on ? ' ON' : ' OFF'));
    });
    expWrap.appendChild(btn);
  });

  scaleRange.addEventListener('input', function () {
    view.userScale = parseFloat(scaleRange.value) || 1;
    scaleOut.textContent = Math.round(view.userScale * 100) + '%';
  });

  document.addEventListener('click', function (ev) {
    const btn = ev.target.closest ? ev.target.closest('[data-action],[data-toggle],[data-bg]') : null;
    if (!btn) return;

    if (btn.dataset.toggle === 'running') { setRunning(!state.running); return; }
    if (btn.dataset.toggle === 'tracking') {
      state.tracking = !state.tracking;
      if (!state.tracking) lookForward();
      syncToggleButtons();
      toast('시선 추적 ' + (state.tracking ? 'ON' : 'OFF'));
      return;
    }
    if (btn.dataset.bg) {
      document.body.className = btn.dataset.bg;
      const bgs = document.querySelectorAll('[data-bg]');
      for (let i = 0; i < bgs.length; i++) bgs[i].classList.toggle('is-on', bgs[i] === btn);
      return;
    }
    switch (btn.dataset.action) {
      case 'wave': randomReaction(); return;
      case 'talk': fx.talkT = 0; toast('말하는 중… 💬'); return;
      case 'reset': resetView(); return;
      case 'shot': screenshot(); return;
    }
  });

  function resetView() {
    view.userScale = 1;
    view.offsetX = 0;
    view.offsetY = 0;
    syncScaleUI();
    layout();
    toast('위치 초기화');
  }

  function setPanelCollapsed(collapsed) {
    panelEl.classList.toggle('is-collapsed', collapsed);
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    /* 접힌 패널의 버튼들이 Tab 순서에 남지 않도록 */
    if ('inert' in panelEl) panelEl.inert = collapsed;
    else panelEl.setAttribute('aria-hidden', String(collapsed));
  }
  panelToggle.addEventListener('click', function () {
    setPanelCollapsed(!panelEl.classList.contains('is-collapsed'));
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
    const tag = ev.target ? ev.target.tagName : '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    /* 버튼에 포커스가 있을 때는 Space/Enter 를 가로채지 않는다 (버튼 활성화가 우선) */
    if (tag === 'BUTTON' && (ev.key === ' ' || ev.key === 'Enter')) return;
    const num = '1234567890'.indexOf(ev.key);
    if (num !== -1 && expressions[num]) {
      toggleExpression(expressions[num].def.id);
      return;
    }
    const k = ev.key.toLowerCase();
    if (k === 'r') resetView();
    else if (k === 'c') { clearExpressions(); toast('표정 초기화'); }
    else if (k === ' ') { ev.preventDefault(); randomReaction(); }
    else if (k === 'h') panelToggle.click();
  });

  function screenshot() {
    try {
      app.render();   /* 최신 프레임을 백버퍼에 확실히 올린 뒤 읽는다 */
      /*
       * 인자를 모두 생략하면 pixi 가 renderer.width(이미 디바이스 픽셀)에 resolution 을 한 번 더 곱해서
       * DPR 2 에서 2배 큰 캔버스에 3/4 이 빈 이미지가 나온다. CSS 픽셀 기준 프레임을 명시해야 한다.
       */
      const out = app.renderer.plugins.extract.canvas(null, app.screen);
      out.toBlob(function (blob) {
        if (!blob) { toast('저장 실패'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'doro-live2d.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        toast('PNG 저장 완료 📸');
      });
    } catch (err) {
      console.error(err);
      toast('저장 실패');
    }
  }

  let hintDismissed = false;
  function dismissHint() {
    if (hintDismissed) return;
    hintDismissed = true;
    hintEl.classList.add('is-fading');
    setTimeout(function () { hintEl.hidden = true; }, 600);
  }
  setTimeout(dismissHint, 9000);

  /* --------------------------------------------------------- 시작 상태 */

  syncScaleUI();
  syncToggleButtons();
  syncExpressionButtons();
  const defaultBg = document.querySelector('[data-bg="bg-grid"]');
  if (defaultBg) defaultBg.classList.add('is-on');
  panelToggle.classList.add('is-visible');
  /* 좁은 화면에서는 패널이 캐릭터를 거의 다 가리므로 접은 상태로 시작한다 */
  setPanelCollapsed(window.matchMedia('(max-width: 720px)').matches);
  hintEl.hidden = false;
  loaderEl.classList.add('is-hidden');
  lookForward();

  /* 큐에 이미 들어간 항목이 endTime = -1 을 다시 읽도록 모션을 걸어 준다 */
  if (await enableIdleLoop()) {
    model.internalModel.motionManager.stopAllMotions();
    model.motion('Idle', 0, 3);
  }

  /* 콘솔 디버그용 */
  window.__doro = {
    app: app, model: model, expressions: expressions, state: state, view: view,
    fx: fx, pull: pull, defaults: defaults, managed: managed, regions: regions, pickHit: pickHit
  };
}
})();

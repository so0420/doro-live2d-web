#!/usr/bin/env node
/*
 * Doro 모델을 public/models/Doro/ 에 설치한다.
 *
 *   node tools/setup-model.js <다운로드한.zip>
 *   node tools/setup-model.js <압축을 푼 Doro 폴더>
 *
 * 모델은 저작권 문제로 이 저장소에 포함되어 있지 않다. 배포처에서 직접 받아야 한다.
 * (README 의 "모델 준비" 참고)
 *
 * zip 해제는 외부 명령 없이 zlib 만으로 처리한다. 이 프로젝트는 의존성이 없다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DEST = path.join(__dirname, '..', 'public', 'models', 'Doro');

/* model3.json 에 뷰어가 쓰는 항목을 채워 넣는다. 원본에는 아래가 전부 비어 있다. */
const EXPRESSIONS = [
  ['Exp1', 'Expressions/Exp1.exp3.json'],
  ['Exp2', 'Expressions/Exp2.exp3.json'],
  ['Exp3', 'Expressions/Exp3.exp3.json'],
  ['Exp4', 'Expressions/Exp4.exp3.json'],
  ['Exp5', 'Expressions/Exp5.exp3.json'],
  ['Exp6', 'Expressions/Exp6.exp3.json'],
  ['Exp7', 'Expressions/Exp7.exp3.json'],
  ['Exp8', 'Expressions/Exp8.exp3.json'],
  ['HighlightOff', 'Expressions/Highlight OFF.exp3.json'],
  ['TongueOut', 'Expressions/TongueOut.exp3.json']
];

const HIT_AREAS = [
  { Id: 'Bow_M', Name: 'Bow' },
  { Id: 'Face_outline', Name: 'Head' },
  { Id: 'Leg_front_L', Name: 'Legs' },
  { Id: 'Body_outline', Name: 'Body' },
  { Id: 'Hair_base_outline', Name: 'Hair' }
];

const REQUIRED = ['Doro.moc3', 'Doro.model3.json', 'Doro.physics3.json', 'Doro.2048/texture_00.png'];

function die(msg) {
  console.error('\n  ✗ ' + msg + '\n');
  process.exit(1);
}

/* ---------------------------------------------------------------- zip 해제 */

/*
 * 중앙 디렉터리를 읽어 엔트리 목록을 만든다. deflate(8) 와 stored(0) 만 지원하지만
 * 일반적인 배포 zip 은 전부 이 둘 중 하나다.
 */
function unzip(zipPath, outDir) {
  const buf = fs.readFileSync(zipPath);

  // EOCD 는 파일 끝에서 최대 64KB 안쪽에 있다 (주석 길이 상한).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) die('zip 형식이 아닙니다: ' + zipPath);

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // 중앙 디렉터리 시작 오프셋

  const written = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) die('중앙 디렉터리가 손상되었습니다.');

    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;

    // 로컬 헤더의 name/extra 길이는 중앙 디렉터리와 다를 수 있어 다시 읽는다.
    if (buf.readUInt32LE(localOff) !== 0x04034b50) die('로컬 헤더가 손상되었습니다: ' + name);
    const dataOff = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.subarray(dataOff, dataOff + compSize);

    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else die('지원하지 않는 압축 방식(' + method + ')입니다: ' + name);

    // zip 안의 경로가 상위로 탈출하지 못하게 막는다.
    const rel = path.normalize(name).replace(/^(\.\.[\\/])+/, '');
    const target = path.join(outDir, rel);
    if (!target.startsWith(outDir + path.sep)) die('경로가 수상합니다: ' + name);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    written.push(rel);
  }
  return written;
}

/* ------------------------------------------------------------ 폴더 복사 */

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

/*
 * 배포 zip 은 `Doro/` 한 겹으로 감싸여 있다. 모델 파일이 들어 있는 실제 폴더를 찾는다.
 */
function findModelRoot(dir) {
  if (fs.existsSync(path.join(dir, 'Doro.model3.json'))) return dir;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findModelRoot(path.join(dir, entry.name));
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------- model3.json 패치 */

/*
 * Expressions / Motions.Idle / HitAreas / LipSync 를 채운다.
 * 원본은 Doro.model3.json.orig 로 남겨 둔다.
 */
function patchModelJson(dir) {
  const file = path.join(dir, 'Doro.model3.json');
  const orig = path.join(dir, 'Doro.model3.json.orig');
  if (!fs.existsSync(orig)) fs.copyFileSync(file, orig);

  const model = JSON.parse(fs.readFileSync(orig, 'utf8'));
  const refs = model.FileReferences || (model.FileReferences = {});

  refs.Expressions = EXPRESSIONS
    .filter(([, rel]) => fs.existsSync(path.join(dir, rel)))
    .map(([Name, File]) => ({ Name, File }));

  if (fs.existsSync(path.join(dir, 'Idle.motion3.json'))) {
    refs.Motions = { Idle: [{ File: 'Idle.motion3.json', FadeInTime: 0.4, FadeOutTime: 0.4 }] };
  }

  // 뷰어는 아트메시 단위로 직접 판정하지만, 다른 도구와의 호환을 위해 남겨 둔다.
  model.HitAreas = HIT_AREAS;

  // EyeBlink 는 일부러 비워 둔다 (app.js 가 직접 처리한다. README 참고).
  const groups = model.Groups || (model.Groups = []);
  const lipSync = groups.find((g) => g.Name === 'LipSync');
  if (lipSync) lipSync.Ids = ['ParamMouthOpenY'];
  else groups.push({ Target: 'Parameter', Name: 'LipSync', Ids: ['ParamMouthOpenY'] });

  fs.writeFileSync(file, JSON.stringify(model, null, '\t') + '\n');
  return refs.Expressions.length;
}

/* ---------------------------------------------------------------- main */

const arg = process.argv[2];
if (!arg) {
  console.error([
    '',
    '  사용법:',
    '    node tools/setup-model.js <다운로드한.zip>',
    '    node tools/setup-model.js <압축을 푼 Doro 폴더>',
    '',
    '  모델은 저장소에 포함되어 있지 않습니다. 아래에서 무료로 받으세요.',
    '    BOOTH  https://booth.pm/en/items/5867617',
    '    Ko-fi  https://ko-fi.com/s/acedd75ed5',
    ''
  ].join('\n'));
  process.exit(1);
}

const src = path.resolve(arg);
if (!fs.existsSync(src)) die('경로를 찾을 수 없습니다: ' + src);

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

const stat = fs.statSync(src);
if (stat.isFile()) {
  console.log('  zip 해제 중: ' + path.basename(src));
  const staging = path.join(DEST, '.staging');
  unzip(src, staging);
  const root = findModelRoot(staging);
  if (!root) die('zip 안에서 Doro.model3.json 을 찾지 못했습니다.');
  copyDir(root, DEST);
  fs.rmSync(staging, { recursive: true, force: true });
} else {
  const root = findModelRoot(src);
  if (!root) die('폴더 안에서 Doro.model3.json 을 찾지 못했습니다: ' + src);
  console.log('  복사 중: ' + root);
  copyDir(root, DEST);
}

const missing = REQUIRED.filter((rel) => !fs.existsSync(path.join(DEST, rel)));
if (missing.length) die('모델 파일이 빠졌습니다: ' + missing.join(', '));

const expCount = patchModelJson(DEST);

console.log('');
console.log('  ✓ public/models/Doro/ 설치 완료 (표정 ' + expCount + '개, model3.json 패치됨)');
console.log('    이제 `npm start` 후 http://localhost:8012/ 로 접속하세요.');
console.log('');

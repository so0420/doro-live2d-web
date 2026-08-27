#!/usr/bin/env node
/*
 * 의존성 없는 정적 파일 서버.
 *   node server.js [포트]
 * Live2D 모델(.moc3 등)은 file:// 로는 읽을 수 없어서 로컬 서버가 필요하다.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, 'public');
const NUL = String.fromCharCode(0);
const CRLF = String.fromCharCode(13, 10);
const PORT = Number(process.argv[2] || process.env.PORT || 8012);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.moc3': 'application/octet-stream',
  '.exp3': 'application/json; charset=utf-8',
  '.motion3': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let pathname;
  let filePath;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname || '/');
    if (pathname.endsWith('/')) pathname += 'index.html';
    // 널 바이트가 섞이면 path/fs 호출이 동기 예외로 프로세스를 죽인다
    if (pathname.indexOf(NUL) !== -1) throw new Error('null byte in path');
    filePath = path.join(ROOT, path.normalize(pathname));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('400 Bad Request');
    return;
  }

  // 경로 탈출 방지
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + pathname);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

// 요청 하나가 서버 전체를 죽이지 않도록
server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request' + CRLF + CRLF);
});
process.on('uncaughtException', (err) => {
  console.error('[server] 처리되지 않은 오류:', err && err.message);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Doro Live2D viewer');
  console.log('  ▶  http://localhost:' + PORT + '/');
  console.log('  (종료: Ctrl+C)');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('포트 ' + PORT + ' 가 이미 사용 중입니다. `node server.js 5174` 처럼 다른 포트를 지정하세요.');
    process.exit(1);
  }
  throw err;
});

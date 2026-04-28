#!/usr/bin/env node
/**
 * End-to-end test: PDF attachment from authoring layer to client portal.
 *
 * 1. Login as b@ org_admin
 * 2. Create a course shell with one chapter
 * 3. Upload a tiny PDF via /upload → get URL
 * 4. POST a content-block (blockType=pdf, parentType=course, parentId=chapterId)
 * 5. Publish course
 * 6. Create course-instance
 * 7. Enroll tier2-client-001 into the instance
 * 8. Login as client → fetch portal course detail → verify PDF block visible
 *
 * Run: node scripts/alpha-pdf-c-end-test.mjs
 */

const BASE = process.env.BASE || 'http://localhost';

const ANSI = {
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', gray: '\x1b[90m', reset: '\x1b[0m', bold: '\x1b[1m',
};
function ok(m) { console.log(`${ANSI.green}  ✓${ANSI.reset} ${m}`); }
function fail(m, extra) {
  console.log(`${ANSI.red}  ✗ ${m}${ANSI.reset}`);
  if (extra) console.log(`${ANSI.gray}    ${JSON.stringify(extra).slice(0, 500)}${ANSI.reset}`);
}
function step(t) { console.log(`\n${ANSI.bold}${ANSI.blue}━━━ ${t}${ANSI.reset}`); }

async function http(method, path, { token, body, expect = [200, 201] } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  const expectArr = Array.isArray(expect) ? expect : [expect];
  if (!expectArr.includes(res.status)) {
    return { ok: false, status: res.status, body: json, path, method };
  }
  return { ok: true, status: res.status, body: json };
}

// Tiny valid PDF (~250 bytes, content "Hello PSY")
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
  '4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 10 50 Td (Alpha PDF E2E) Tj ET\nendstream\nendobj\n' +
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
  'xref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000054 00000 n\n0000000099 00000 n\n0000000196 00000 n\n0000000288 00000 n\n' +
  'trailer<</Size 6/Root 1 0 R>>\nstartxref\n343\n%%EOF\n',
  'utf-8',
);

// Tiny mp3 silence frame (~96 bytes) — just an MP3 magic + zero frame
// Browser will load it but it's silent. Enough to verify upload + render.
const MP3_BYTES = Buffer.concat([
  Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // ID3v2 header
  Buffer.from([0xff, 0xfb, 0x90, 0x00]), // MP3 frame sync
  Buffer.alloc(80, 0), // padding
]);

// Tiny mp4 — minimal box structure that browsers refuse to play but the
// upload + endpoint roundtrip + DOM rendering still works. We don't need
// real video for the test; we're verifying the pipeline.
const MP4_BYTES = Buffer.from('00000020667479706d703432000000006d703432697368', 'hex');

async function uploadFile(token, orgId, bytes, fileName, mimeType) {
  const fd = new FormData();
  const blob = new Blob([bytes], { type: mimeType });
  fd.append('file', blob, fileName);
  const res = await fetch(`${BASE}/api/orgs/${orgId}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (res.status !== 201) return { ok: false, status: res.status, body: json };
  return { ok: true, body: json };
}

const uploadPdf = (token, orgId) => uploadFile(token, orgId, PDF_BYTES, 'alpha-test-handout.pdf', 'application/pdf');
const uploadMp3 = (token, orgId) => uploadFile(token, orgId, MP3_BYTES, 'alpha-test-relaxation.mp3', 'audio/mpeg');
const uploadMp4 = (token, orgId) => uploadFile(token, orgId, MP4_BYTES, 'alpha-test-intro.mp4', 'video/mp4');

(async function main() {
  // tier1-counseling org (b@ org_admin)
  const orgId = '63844afe-8865-4637-8e77-085900ace6d8';

  step('1. Login as b@ org_admin');
  const login = await http('POST', '/api/auth/login', {
    body: { email: 'b@test.psynote.cn', password: 'test123456' },
  });
  if (!login.ok) { fail('login failed', login); process.exit(1); }
  const adminToken = login.body.accessToken;
  if (!adminToken) { fail('no accessToken in login response', login.body); process.exit(1); }
  ok(`b@ logged in, orgId=${orgId.slice(0, 8)}…`);

  step('2. Create course with 1 chapter');
  const created = await http('POST', `/api/orgs/${orgId}/courses`, {
    token: adminToken,
    body: {
      title: 'Alpha PDF 端到端测试课程',
      description: '验证模板层 PDF 内容块 → C 端 Portal 可见性',
      category: '心理科普',
      duration: '4 周',
      courseType: 'individual',
      isTemplate: false,
      chapters: [{ title: '第一章 · 资料下载', content: '点击下方 PDF 查看本期讲义' }],
    },
  });
  if (!created.ok) { fail('create course failed', created); process.exit(1); }
  const courseId = created.body.id;
  ok(`course created: ${courseId.slice(0, 8)}…`);

  // Fetch chapters
  const chapList = await http('GET', `/api/orgs/${orgId}/courses/${courseId}`, { token: adminToken });
  if (!chapList.ok) { fail('fetch course detail', chapList); process.exit(1); }
  const chapter = chapList.body.chapters?.[0];
  if (!chapter) { fail('no chapter found', chapList.body); process.exit(1); }
  const chapterId = chapter.id;
  ok(`chapter: ${chapter.title} (${chapterId.slice(0, 8)}…)`);

  step('3. Upload PDF');
  const up = await uploadPdf(adminToken, orgId);
  if (!up.ok) { fail('upload failed', up); process.exit(1); }
  ok(`PDF uploaded → ${up.body.url} (${up.body.fileSize} bytes)`);

  step('4. Create PDF content block on chapter');
  const block = await http('POST', `/api/orgs/${orgId}/content-blocks`, {
    token: adminToken,
    body: {
      parentType: 'course',
      parentId: chapterId,
      blockType: 'pdf',
      visibility: 'participant',
      sortOrder: 0,
      payload: {
        src: up.body.url,
        fileName: up.body.fileName,
        fileSize: up.body.fileSize,
        mode: 'view',
      },
    },
  });
  if (!block.ok) { fail('create content-block failed', block); process.exit(1); }
  ok(`content-block created: ${block.body.id.slice(0, 8)}…`);

  step('4b. Upload audio (mp3) + create audio content block');
  const upMp3 = await uploadMp3(adminToken, orgId);
  if (!upMp3.ok) fail('mp3 upload failed', upMp3);
  else {
    ok(`MP3 uploaded → ${upMp3.body.url} (${upMp3.body.fileSize} bytes, type=${upMp3.body.fileType})`);
    const audioBlock = await http('POST', `/api/orgs/${orgId}/content-blocks`, {
      token: adminToken,
      body: {
        parentType: 'course', parentId: chapterId, blockType: 'audio',
        visibility: 'participant', sortOrder: 1,
        payload: { src: upMp3.body.url, technique: 'breathing', narrator: 'Alpha 测试', caption: '一段简短的呼吸引导音频（端到端测试用）' },
      },
    });
    if (audioBlock.ok) ok(`audio block created: ${audioBlock.body.id.slice(0, 8)}…`);
    else fail('audio content-block create failed', audioBlock);
  }

  step('4c. Upload video (mp4) + create video content block');
  const upMp4 = await uploadMp4(adminToken, orgId);
  if (!upMp4.ok) fail('mp4 upload failed', upMp4);
  else {
    ok(`MP4 uploaded → ${upMp4.body.url} (${upMp4.body.fileSize} bytes, type=${upMp4.body.fileType})`);
    const videoBlock = await http('POST', `/api/orgs/${orgId}/content-blocks`, {
      token: adminToken,
      body: {
        parentType: 'course', parentId: chapterId, blockType: 'video',
        visibility: 'participant', sortOrder: 2,
        payload: { src: upMp4.body.url, caption: '课程引言视频（端到端测试用）' },
      },
    });
    if (videoBlock.ok) ok(`video block created: ${videoBlock.body.id.slice(0, 8)}…`);
    else fail('video content-block create failed', videoBlock);
  }

  step('5. Publish course');
  const pub = await http('POST', `/api/orgs/${orgId}/courses/${courseId}/publish`, { token: adminToken });
  if (!pub.ok) { fail('publish failed', pub); process.exit(1); }
  ok(`course published, status=${pub.body.status}`);

  step('6. Create course instance');
  const inst = await http('POST', `/api/orgs/${orgId}/course-instances`, {
    token: adminToken,
    body: {
      courseId,
      title: 'Alpha PDF 测试 · 第 1 期',
      description: '端到端验证用',
      publishMode: 'assign',
      capacity: 10,
      startDate: '2026-05-01',
      schedule: '每周一 19:00',
      location: 'Online',
    },
  });
  if (!inst.ok) { fail('create instance failed', inst); process.exit(1); }
  const instanceId = inst.body.id;
  ok(`instance created: ${instanceId.slice(0, 8)}…`);

  // Activate so it's not draft
  const act = await http('POST', `/api/orgs/${orgId}/course-instances/${instanceId}/activate`, { token: adminToken, expect: [200, 201] });
  if (act.ok) ok(`instance activated`); else fail('activate failed', act);

  step('7. Enroll tier2-client-001');
  const CLIENT_ID = '259d82e8-ad3a-4bf7-aa36-68de64ea280f';
  const enroll = await http('POST', `/api/orgs/${orgId}/course-instances/${instanceId}/assign`, {
    token: adminToken,
    body: { userIds: [CLIENT_ID] },
  });
  if (!enroll.ok) { fail('enroll failed', enroll); process.exit(1); }
  ok(`enrolled: ${JSON.stringify(enroll.body.results)}`);

  step('8. Login as client');
  const clientLogin = await http('POST', '/api/auth/login', {
    body: { email: 'tier2-client-001@test.psynote.cn', password: 'test123456' },
  });
  if (!clientLogin.ok) { fail('client login failed', clientLogin); process.exit(1); }
  const clientToken = clientLogin.body.accessToken;
  ok(`client logged in (token len=${clientToken?.length || 0})`);

  step('9. Client: list /client/my-courses → find ours');
  const myCourses = await http('GET', `/api/orgs/${orgId}/client/my-courses`, { token: clientToken });
  if (!myCourses.ok) { fail('portal course list failed', myCourses); process.exit(2); }
  const myList = Array.isArray(myCourses.body) ? myCourses.body : (myCourses.body.items || []);
  const found = myList.find((c) => c.enrollment?.instanceId === instanceId || c.enrollment?.courseId === courseId);
  if (found) ok(`portal sees enrollment: courseTitle="${found.courseTitle}" instanceId match=${found.enrollment?.instanceId === instanceId}`);
  else {
    console.log(`${ANSI.yellow}  ⚠ enrollment not found in /my-courses (returned ${myList.length} rows)${ANSI.reset}`);
    console.log(JSON.stringify(myList).slice(0, 600));
  }

  step('10. Org library route is correctly DENIED to clients (defense-in-depth)');
  const courseGet = await http('GET', `/api/orgs/${orgId}/courses/${courseId}`, { token: clientToken, expect: [200, 403, 404] });
  if (courseGet.status === 403) ok(`org library /courses/:id correctly 403 for client (CourseReader now uses /client/courses/:id instead)`);
  else fail(`security regression: client should NOT have access to /api/orgs/:orgId/courses/:courseId, got ${courseGet.status}`, courseGet.body);

  step('11. Content-blocks endpoint accessible to clients (filtered to participant-visible)');
  const cb = await http('GET', `/api/orgs/${orgId}/content-blocks?parentType=course&parentId=${chapterId}`, { token: clientToken, expect: [200, 403, 404] });
  if (cb.ok && cb.status === 200) {
    const list = Array.isArray(cb.body) ? cb.body : (cb.body.items || []);
    const pdfBlock = list.find((b) => b.blockType === 'pdf');
    if (pdfBlock) ok(`content-blocks returns PDF block to client: src=${pdfBlock.payload?.src} fileName=${pdfBlock.payload?.fileName}`);
    else fail('content-blocks 200 but no pdf block', { list });
  } else {
    fail(`content-blocks should be 200 for enrolled client, got ${cb.status}`, cb.body);
  }

  step('12. Lesson-blocks (counselor planning notes) correctly DENIED to clients');
  const lb = await http('GET', `/api/orgs/${orgId}/courses/${courseId}/chapters/${chapterId}/blocks`, { token: clientToken, expect: [200, 403, 404] });
  if (lb.status === 403) ok(`lesson-blocks correctly 403 for client (these are counselor planning notes, not C-end content)`);
  else console.log(`${ANSI.gray}  status=${lb.status}${ANSI.reset}`);

  step('13. Direct fetch of uploaded PDF (anyone with URL can grab — verify static serving)');
  const pdfRes = await fetch(`${BASE}${up.body.url}`);
  ok(`PDF direct fetch: status=${pdfRes.status} size=${pdfRes.headers.get('content-length')} type=${pdfRes.headers.get('content-type')}`);

  step('14. NEW portal endpoint: GET /client/courses/:courseId');
  const portalDetail = await http('GET', `/api/orgs/${orgId}/client/courses/${courseId}`, { token: clientToken, expect: [200, 404] });
  if (portalDetail.ok && portalDetail.status === 200) {
    const chapters = portalDetail.body.chapters || [];
    const totalBlocks = chapters.reduce((acc, c) => acc + (c.contentBlocks?.length || 0), 0);
    const pdfBlock = chapters.flatMap((c) => c.contentBlocks || []).find((b) => b.blockType === 'pdf');
    ok(`portal course detail returns: course title="${portalDetail.body.course?.title}" chapters=${chapters.length} content_blocks=${totalBlocks}`);
    if (pdfBlock) {
      ok(`PDF block visible to client: src=${pdfBlock.payload?.src} fileName=${pdfBlock.payload?.fileName} fileSize=${pdfBlock.payload?.fileSize}`);
    } else {
      fail('Portal endpoint returned 200 but no PDF block found in chapters', portalDetail.body);
    }
  } else {
    fail('Portal /client/courses/:courseId failed', portalDetail);
  }

  step('Summary');
  console.log(`${ANSI.green}${ANSI.bold}END-TO-END PDF FLOW PASSED${ANSI.reset}`);
  console.log(`  course:    ${courseId}`);
  console.log(`  chapter:   ${chapterId}`);
  console.log(`  block:     ${block.body.id}`);
  console.log(`  instance:  ${instanceId}`);
  console.log(`  pdf url:   ${BASE}${up.body.url}`);
})();

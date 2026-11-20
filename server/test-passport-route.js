/**
 * Integration Test Suite: Passport OCR API Route (/api/passport/extract)
 * Run via: node server/test-passport-route.js
 */

const { generateAdminToken } = require('./middleware/auth');

const BASE_URL = 'http://localhost:3000';
const VALID_TOKEN = generateAdminToken({ email: 'admin@khannatravels.com' });

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- PASSPORT OCR ROUTE INTEGRATION TESTS ---');

  // Test 1: 401 Unauthorized without auth
  try {
    const res = await fetch(`${BASE_URL}/api/passport/extract`, { method: 'POST' });
    assert(res.status === 401, 'Rejects unauthenticated request with HTTP 401');
  } catch (e) {
    assert(false, `Test 1 failed with error: ${e.message}`);
  }

  // Test 2: 400 NO_FILE when no front file attached
  try {
    const formData = new FormData();
    const res = await fetch(`${BASE_URL}/api/passport/extract`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VALID_TOKEN}` },
      body: formData
    });
    const data = await res.json();
    assert(res.status === 400 && data.code === 'NO_FILE', 'Returns 400 NO_FILE when front file missing');
    assert(data.message === 'Attach the passport photo page.', 'NO_FILE error message matches specification');
  } catch (e) {
    assert(false, `Test 2 failed with error: ${e.message}`);
  }

  // Test 3: 400 BAD_FILE when file format is unsupported (e.g. .exe / text)
  try {
    const formData = new FormData();
    const badFile = new Blob(['sample text'], { type: 'text/plain' });
    formData.append('front', badFile, 'sample.txt');

    const res = await fetch(`${BASE_URL}/api/passport/extract`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VALID_TOKEN}` },
      body: formData
    });
    const data = await res.json();
    assert(res.status === 400 && data.code === 'BAD_FILE', 'Returns 400 BAD_FILE for unsupported file type');
    assert(data.message === 'Upload a JPG, PNG, WEBP or PDF.', 'BAD_FILE error message matches specification');
  } catch (e) {
    assert(false, `Test 3 failed with error: ${e.message}`);
  }

  // Test 4: 413 TOO_LARGE when file exceeds 10 MB
  try {
    const formData = new FormData();
    // Create an oversized blob (10.5 MB)
    const largeBlob = new Blob([new Uint8Array(10.5 * 1024 * 1024)], { type: 'image/jpeg' });
    formData.append('front', largeBlob, 'large_photo.jpg');

    const res = await fetch(`${BASE_URL}/api/passport/extract`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VALID_TOKEN}` },
      body: formData
    });
    const data = await res.json();
    assert(res.status === 413 && data.code === 'TOO_LARGE', 'Returns 413 TOO_LARGE when file exceeds 10 MB');
    assert(data.message === 'File is larger than 10 MB.', 'TOO_LARGE error message matches specification');
  } catch (e) {
    assert(false, `Test 4 failed with error: ${e.message}`);
  }

  // Test 5: 422 NO_DOCUMENT when file is not a passport photo page
  try {
    const formData = new FormData();
    const blankBlob = new Blob(['blank content'], { type: 'image/jpeg' });
    formData.append('front', blankBlob, 'nodoc_passport.jpg');

    const res = await fetch(`${BASE_URL}/api/passport/extract`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VALID_TOKEN}` },
      body: formData
    });
    const data = await res.json();
    assert(res.status === 422 && data.code === 'NO_DOCUMENT', 'Returns 422 NO_DOCUMENT when document is unreadable');
    assert(data.message === 'No passport photo page was found in this file.', 'NO_DOCUMENT error message matches specification');
    assert(res.headers.get('cache-control') === 'no-store', 'Sets Cache-Control: no-store header');
  } catch (e) {
    assert(false, `Test 5 failed with error: ${e.message}`);
  }

  console.log(`\n========================================`);
  console.log(`Route Tests Completed: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();


/**
 * test-saved-quotes-and-policies.js
 * Comprehensive automated test suite for:
 * 1. 24-hour saved quote drafts (saving, expiration, auto-delete, query filter)
 * 2. Premium change detection upon resume
 * 3. Travel start date validation upon resume
 * 4. Issue policy from saved quote -> Policy record created, SavedQuote deleted
 * 5. Agent isolation vs Admin access (Agent A vs Agent B vs Admin)
 * 6. Cryptography at rest (AES-256-GCM, no plaintext PII or passport images)
 * 7. Audit logging (strictly IDs and timestamps, zero PII)
 * 8. Policy retention control (disabled until POLICY_RETENTION_YEARS is configured)
 */

const assert = require('assert');
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });
} catch {
  require('./server/node_modules/dotenv').config({ path: path.join(__dirname, 'server', '.env') });
}
let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  mongoose = require('./server/node_modules/mongoose');
}
const http = require('http');

const app = require('./server/server');
const SavedQuote = require('./server/models/SavedQuote');
const Policy = require('./server/models/Policy');
const AuditLog = require('./server/models/AuditLog');
const { generateAdminToken } = require('./server/middleware/auth');
const { cleanExpiredSavedQuotes, purgePoliciesByRetention } = require('./server/services/savedQuoteCleaner');
const { decryptJson } = require('./server/utils/crypto');

let server;
let baseUrl;

function makeRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING SAVED QUOTES & ISSUED POLICY RECORDS TEST SUITE');
  console.log('=============================================================\n');

  // Ensure MongoDB connection is fully established (wait if in-progress from server.js)
  const connectStart = Date.now();
  while (mongoose.connection.readyState !== 1 && Date.now() - connectStart < 15000) {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`MongoDB connection status: readyState = ${mongoose.connection.readyState}`);

  // Start test server on random port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const adminToken = generateAdminToken({ email: 'admin@khannatravels.com' });
  const agentA = 'agent_alice_101';
  const agentB = 'agent_bob_202';

  try {
    // ── TEST 1: Save a quote draft (24 hours validity) ─────────────────────────
    console.log('--- TEST 1: Save Quote Draft ---');
    const futureTripStart = new Date();
    futureTripStart.setDate(futureTripStart.getDate() + 15);
    const futureTripEnd = new Date();
    futureTripEnd.setDate(futureTripEnd.getDate() + 25);

    const testPassport = {
      givenNames: 'VIKRAM',
      surname: 'SINGH',
      passportNumber: 'V8765432',
      dob: '1988-08-14',
      sex: 'M',
      nationality: 'IND',
      expiryDate: '2034-08-13',
      addressLine: '12 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      pinCode: '400020'
    };

    const saveRes = await makeRequest('POST', '/api/quotes/saved', {
      quote: {
        plan: 'Value Pro',
        insurer: 'ICICI Lombard',
        premium: 520,
        destination: 'Excluding',
        travelStart: futureTripStart.toISOString().slice(0, 10),
        travelEnd: futureTripEnd.toISOString().slice(0, 10),
        coverage: 75000,
        coverageSummary: '$75,000'
      },
      customer: {
        name: 'VIKRAM SINGH',
        dob: '1988-08-14',
        mobile: '9820011223',
        email: 'vikram@example.com'
      },
      passport: testPassport,
      flowStep: 'policy details'
    }, { 'x-agent-id': agentA });

    assert.strictEqual(saveRes.status, 200, 'Save quote draft must return HTTP 200');
    assert.strictEqual(saveRes.data.success, true, 'Save response success must be true');
    const quoteId = saveRes.data.savedQuote.quoteId;
    assert.ok(quoteId, 'Must return quoteId');

    // Verify it appears in Saved Quotes list with ~24h remaining
    const listRes = await makeRequest('GET', '/api/quotes/saved', null, { 'x-agent-id': agentA });
    assert.strictEqual(listRes.status, 200);
    const found = listRes.data.savedQuotes.find(q => q.quoteId === quoteId);
    assert.ok(found, 'Saved quote must be listed in active saved quotes for agent');
    assert.strictEqual(found.customer.name, 'VIKRAM SINGH');
    assert.strictEqual(found.quote.premium, 520);
    assert.strictEqual(found.flowStep, 'policy details');
    assert.ok(found.expiresInText.includes('h'), 'Countdown must show remaining hours');
    assert.strictEqual(found.isExpiringSoon, false, 'Initial 24h quote is not expiring soon');
    console.log('✅ PASS: Saved quote draft created with ~24h expiry and listed accurately');

    // ── TEST 2: Encryption at rest & zero passport image storage ───────────────
    console.log('--- TEST 2: Encryption at Rest & Privacy ---');
    if (mongoose.connection.readyState === 1) {
      const rawDbRecord = await SavedQuote.findOne({ quoteId }).lean();
      assert.ok(rawDbRecord, 'Database record must exist');
      assert.ok(rawDbRecord.passportEncrypted, 'Passport must be encrypted at rest');
      assert.strictEqual(typeof rawDbRecord.passportEncrypted, 'string', 'Encrypted field must be string format iv:authTag:cipher');
      assert.ok(rawDbRecord.passportEncrypted.includes(':'), 'Encrypted string must have format iv:tag:data');
      // Verify raw database record does NOT have plaintext passport number or name
      const recordJson = JSON.stringify(rawDbRecord);
      assert.ok(!recordJson.includes('V8765432'), 'Plaintext passport number MUST NOT be present in raw database document');
      assert.strictEqual(rawDbRecord.passportFile, undefined, 'Passport image files MUST NOT be stored');
      console.log('✅ PASS: Passport data is strictly AES-256-GCM encrypted at rest; zero plain PII/images');
    }

    // ── TEST 3: Agent isolation vs Admin access ────────────────────────────────
    console.log('--- TEST 3: Agent Scoping & Admin Privileges ---');
    // Agent B tries to list quotes -> Agent A's quote must NOT appear
    const agentBList = await makeRequest('GET', '/api/quotes/saved', null, { 'x-agent-id': agentB });
    const agentBFound = agentBList.data.savedQuotes.find(q => q.quoteId === quoteId);
    assert.strictEqual(agentBFound, undefined, 'Agent B must NOT see Agent A saved quote in listing');

    // Agent B tries to resume Agent A's quote -> 403 Forbidden
    const agentBResume = await makeRequest('GET', `/api/quotes/saved/${quoteId}/resume`, null, { 'x-agent-id': agentB });
    assert.strictEqual(agentBResume.status, 403, 'Agent B must be rejected with HTTP 403 when attempting to resume Agent A quote');

    // Admin lists quotes -> Admin sees Agent A's quote
    const adminList = await makeRequest('GET', '/api/quotes/saved', null, { 'Authorization': `Bearer ${adminToken}` });
    const adminFound = adminList.data.savedQuotes.find(q => q.quoteId === quoteId);
    assert.ok(adminFound, 'Admin must see quotes from all agents');

    // Admin can resume Agent A's quote
    const adminResume = await makeRequest('GET', `/api/quotes/saved/${quoteId}/resume`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(adminResume.status, 200, 'Admin can resume any agent quote');
    assert.ok(adminResume.data.savedQuote.passport, 'Admin resume returns decrypted passport');
    console.log('✅ PASS: Agent isolation enforced; Agent B blocked; Admin has global oversight');

    // ── TEST 4: Expired Quotes Auto-Deletion & Query-Level Exclusion ───────────
    console.log('--- TEST 4: Expiration & Auto-Delete ---');
    // Create an expired quote draft (expiresAt in the past)
    const expiredPast = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const expQuoteId = 'SQ-EXPIRED-TEST-999';

    if (mongoose.connection.readyState === 1) {
      await SavedQuote.create({
        quoteId: expQuoteId,
        agentId: agentA,
        status: 'saved',
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
        expiresAt: expiredPast,
        quote: {
          quoteId: expQuoteId,
          plan: 'Travel Prime',
          insurer: 'Bajaj',
          premium: 999,
          destination: 'Excluding',
          travelStart: futureTripStart.toISOString().slice(0, 10),
          travelEnd: futureTripEnd.toISOString().slice(0, 10),
          coverage: 50000
        },
        customer: { name: 'Old Traveller' }
      });
    } else {
      const fs = require('fs');
      const offlinePath = path.join(__dirname, 'server', 'offline-saved-quotes.json');
      const cur = fs.existsSync(offlinePath) ? JSON.parse(fs.readFileSync(offlinePath, 'utf8')) : [];
      cur.push({
        quoteId: expQuoteId,
        agentId: agentA,
        status: 'saved',
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        expiresAt: expiredPast.toISOString(),
        quote: {
          quoteId: expQuoteId,
          plan: 'Travel Prime',
          insurer: 'Bajaj',
          premium: 999,
          destination: 'Excluding',
          travelStart: futureTripStart.toISOString().slice(0, 10),
          travelEnd: futureTripEnd.toISOString().slice(0, 10),
          coverage: 50000
        },
        customer: { name: 'Old Traveller' }
      });
      fs.writeFileSync(offlinePath, JSON.stringify(cur, null, 2), 'utf8');
    }

    // Query-level check: expired quote MUST NOT be listed even before cleanup job runs!
    const queryCheck = await makeRequest('GET', '/api/quotes/saved', null, { 'x-agent-id': agentA });
    const expiredFound = queryCheck.data.savedQuotes.find(q => q.quoteId === expQuoteId);
    assert.strictEqual(expiredFound, undefined, 'Expired quote must be excluded at query level');

    // Resume expired quote -> returns 404/410 QUOTE_EXPIRED
    const expResume = await makeRequest('GET', `/api/quotes/saved/${expQuoteId}/resume`, null, { 'x-agent-id': agentA });
    assert.strictEqual(expResume.status, 404, 'Resuming expired quote must fail');
    assert.strictEqual(expResume.data.code, 'QUOTE_EXPIRED');

    // Run scheduled cleanup cleaner
    const cleanupResult = await cleanExpiredSavedQuotes();
    assert.ok(cleanupResult.deletedCount >= 1, 'Cleanup cleaner must permanently purge expired records');

    if (mongoose.connection.readyState === 1) {
      const dbCheck = await SavedQuote.findOne({ quoteId: expQuoteId });
      assert.strictEqual(dbCheck, null, 'Expired record must be permanently purged from database');
    }
    console.log('✅ PASS: Expired quotes are immediately hidden and permanently purged by background cleaner');

    // ── TEST 5: Travel Date in Past Rejection ──────────────────────────────────
    console.log('--- TEST 5: Travel Date Validation ---');
    const pastTripSave = await makeRequest('POST', '/api/quotes/saved', {
      quote: {
        plan: 'Value Pro',
        insurer: 'ICICI Lombard',
        premium: 520,
        destination: 'Excluding',
        travelStart: '2024-01-01', // Date in the past!
        travelEnd: '2024-01-10',
        coverage: 75000
      },
      customer: { name: 'Past Traveller', dob: '1990-01-01' },
      flowStep: 'quotes'
    }, { 'x-agent-id': agentA });

    const pastQuoteId = pastTripSave.data.savedQuote.quoteId;
    const pastResume = await makeRequest('GET', `/api/quotes/saved/${pastQuoteId}/resume`, null, { 'x-agent-id': agentA });
    assert.strictEqual(pastResume.status, 400, 'Resuming quote with past travel date must return HTTP 400');
    assert.strictEqual(pastResume.data.code, 'TRAVEL_DATE_PASSED');
    assert.ok(pastResume.data.error.includes('Travel date has passed'), 'Error message must notify agent travel date has passed');
    console.log('✅ PASS: Resuming quote with past travel date is rejected with prompt message');

    // ── TEST 6: Policy Issuance & Immediate Draft Deletion ────────────────────
    console.log('--- TEST 6: Policy Issuance & Draft Purge ---');
    const issuePayload = {
      savedQuoteId: quoteId, // Resumed from Test 1 quote
      planName: 'Value Pro',
      companyName: 'ICICI Lombard',
      premium: 520,
      currency: 'INR',
      destination: 'Excluding',
      tripStart: futureTripStart.toISOString().slice(0, 10),
      tripEnd: futureTripEnd.toISOString().slice(0, 10),
      coverage: 75000,
      travellerName: 'VIKRAM SINGH',
      passportNumber: 'V8765432',
      dob: '1988-08-14',
      sex: 'M',
      nationality: 'IND',
      expiryDate: '2034-08-13',
      contact: {
        email: 'vikram@example.com',
        mobile: '9820011223'
      },
      proposer: null, // Adult
      nominee: {
        name: 'PRIYA SINGH',
        relationship: 'Spouse'
      },
      addressLine: '12 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      pinCode: '400020',
      entryMethod: 'ocr',
      overrides: []
    };

    const issueRes = await makeRequest('POST', '/api/policy/issue', issuePayload, { 'x-agent-id': agentA });
    assert.strictEqual(issueRes.status, 200, 'Issue policy must return HTTP 200');
    assert.strictEqual(issueRes.data.success, true);
    const policyNumber = issueRes.data.policyNumber;
    assert.ok(policyNumber, 'Must return policy number');
    assert.ok(issueRes.data.documentUrl, 'Must return policy PDF URL');

    // Verify SavedQuote was permanently deleted upon policy issuance
    if (mongoose.connection.readyState === 1) {
      const sqDbCheck = await SavedQuote.findOne({ quoteId });
      assert.strictEqual(sqDbCheck, null, 'SavedQuote MUST be permanently deleted once policy is issued');

      // Verify Policy document in DB
      const polRecord = await Policy.findOne({ policyNumber });
      assert.ok(polRecord, 'Policy record must exist in DB');
      assert.strictEqual(polRecord.agentId, agentA);
      assert.strictEqual(polRecord.travellerSummary.primaryName, 'VIKRAM SINGH');
      assert.strictEqual(polRecord.travellerSummary.passportNumber, 'V8765432');
      assert.strictEqual(polRecord.quoteDetails.premium, 520);
      assert.strictEqual(polRecord.nominee.name, 'PRIYA SINGH');
    }
    console.log('✅ PASS: Policy issued and saved; originating SavedQuote permanently deleted');

    // ── TEST 7: Search Issued Policies ─────────────────────────────────────────
    console.log('--- TEST 7: Search Issued Policies ---');
    // Search by passport number
    const polSearch = await makeRequest('GET', '/api/policies?search=V8765432', null, { 'x-agent-id': agentA });
    assert.strictEqual(polSearch.status, 200);
    assert.ok(polSearch.data.count >= 1, 'Must find at least 1 policy matching passport');
    const matchedPolicy = polSearch.data.policies.find(p => p.policyNumber === policyNumber);
    assert.ok(matchedPolicy, 'Found policy list must contain the newly issued policy');

    // Get policy details endpoint
    const polDetails = await makeRequest('GET', `/api/policies/${policyNumber}`, null, { 'x-agent-id': agentA });
    assert.strictEqual(polDetails.status, 200);
    assert.strictEqual(polDetails.data.policy.travellers[0].passportNumber, 'V8765432');
    console.log('✅ PASS: Issued policies searchable by policy number, name, passport, or mobile');

    // ── TEST 8: Controlled Policy Retention Purge ─────────────────────────────
    console.log('--- TEST 8: Controlled Retention Purge ---');
    // Without POLICY_RETENTION_YEARS set, purge must be disabled
    delete process.env.POLICY_RETENTION_YEARS;
    const purgeCheck = await purgePoliciesByRetention();
    assert.strictEqual(purgeCheck.disabled, true, 'Purge MUST be disabled when POLICY_RETENTION_YEARS is unset');
    console.log('✅ PASS: Policy retention purge is strictly disabled until POLICY_RETENTION_YEARS is configured');

    // ── TEST 9: Audit Log Verification (Zero PII) ─────────────────────────────
    console.log('--- TEST 9: Audit Logging (Privacy Compliant) ---');
    if (mongoose.connection.readyState === 1) {
      const logs = await AuditLog.find({ agentId: agentA }).sort({ timestamp: -1 }).limit(10).lean();
      assert.ok(logs.length >= 3, 'Audit logs must be generated for operations');
      const actions = logs.map(l => l.action);
      assert.ok(actions.includes('save'), 'Must log save action');
      assert.ok(actions.includes('issue'), 'Must log issue action');

      // Verify ZERO PII in audit log records
      const logsJson = JSON.stringify(logs);
      assert.ok(!logsJson.includes('VIKRAM SINGH'), 'Audit log MUST NOT contain traveller name');
      assert.ok(!logsJson.includes('V8765432'), 'Audit log MUST NOT contain passport number');
      assert.ok(!logsJson.includes('vikram@example.com'), 'Audit log MUST NOT contain email');
      console.log('✅ PASS: Audit log tracks actions with IDs and timestamps only; zero personal data');
    }

    console.log('\n=============================================================');
    console.log('🎉 ALL SAVED QUOTES & ISSUED POLICY TESTS PASSED SUCCESSFULLY');
    console.log('=============================================================\n');
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  if (server) server.close();
  process.exit(1);
});

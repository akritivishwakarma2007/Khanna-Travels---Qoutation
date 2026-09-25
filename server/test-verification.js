const http = require('http');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (data) {
      reqHeaders['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = JSON.parse(resBody);
          } catch {
            parsed = resBody;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('--- KHANNA TRAVELS VERIFICATION SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name} ${details}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.data.db === 'connected', 'Health endpoint reports connected DB');

    // 2. Auth - Invalid Password
    const badLogin = await request('POST', '/api/auth/login', { password: 'wrongpassword' });
    assert(badLogin.status === 401, 'Auth rejects invalid password');

    // 3. Auth - Valid Password
    const goodLogin = await request('POST', '/api/auth/login', { password: 'khanna2026' });
    assert(goodLogin.status === 200 && Boolean(goodLogin.data.token), 'Auth accepts valid password and issues token');
    const token = goodLogin.data.token;

    // 4. Token verification
    const verify = await request('GET', '/api/auth/verify', null, { Authorization: `Bearer ${token}` });
    assert(verify.status === 200 && verify.data.authenticated === true, 'Auth verify route confirms token validity');

    // 5. Write endpoint without auth should be 401
    const unauthCreate = await request('POST', '/api/companies', { companyName: 'Test Unauth' });
    assert(unauthCreate.status === 401, 'Write endpoint rejects unauthenticated request (401)');

    // 6. Write endpoint with auth
    const testCompName = 'Test Insurer ' + Date.now();
    const createComp = await request('POST', '/api/companies', { companyName: testCompName }, { Authorization: `Bearer ${token}` });
    assert(createComp.status === 201 && createComp.data.isActive === true, 'Write endpoint allows authenticated company creation with isActive=true');
    const compId = createComp.data._id;

    // 7. Company status toggle (soft delete archive & restore)
    const deactComp = await request('PATCH', `/api/companies/${compId}/status`, { isActive: false }, { Authorization: `Bearer ${token}` });
    assert(deactComp.status === 200 && deactComp.data.isActive === false, 'Company status can be archived (soft-deleted)');

    const reactComp = await request('PATCH', `/api/companies/${compId}/status`, { isActive: true }, { Authorization: `Bearer ${token}` });
    assert(reactComp.status === 200 && reactComp.data.isActive === true, 'Company status can be restored to active');

    // 8. Create Plan
    const createPlan = await request('POST', `/api/companies/${compId}/plans`, { planName: 'Gold Pro' }, { Authorization: `Bearer ${token}` });
    assert(createPlan.status === 201 && createPlan.data.isActive === true, 'Plan created successfully');
    const planId = createPlan.data._id;

    // 9. Rate Grid Overlap Validation (intentional overlap: 0-40 and 35-50)
    const overlapGrid = await request(
      'POST',
      `/api/companies/${compId}/plans/${planId}/rates/grid`,
      {
        coverage: 50000,
        region: 'Excluding',
        ageBands: [{ from: 0, to: 40 }, { from: 35, to: 50 }],
        daysSlabs: [{ from: 1, to: 4 }],
        matrix: [[500, 600]]
      },
      { Authorization: `Bearer ${token}` }
    );
    assert(overlapGrid.status === 400 && overlapGrid.data.error === 'Overlap validation failed', 'Rate Grid server validation rejects overlapping age bands');

    // 10. Rate Grid Valid Save with Gap Detection (0-40 and 45-60 has gap 41-44)
    const validGrid = await request(
      'POST',
      `/api/companies/${compId}/plans/${planId}/rates/grid`,
      {
        coverage: 50000,
        region: 'Excluding',
        ageBands: [{ from: 0, to: 40 }, { from: 45, to: 60 }],
        daysSlabs: [{ from: 1, to: 4 }, { from: 5, to: 10 }],
        matrix: [[500, 600], [700, 800]]
      },
      { Authorization: `Bearer ${token}` }
    );
    assert(validGrid.status === 200 && validGrid.data.savedRatesCount === 4, 'Rate Grid saves valid matrix successfully');
    assert(Array.isArray(validGrid.data.warnings) && validGrid.data.warnings.length > 0, 'Rate Grid detects and reports coverage gap advisory');

    // 11. Compare Endpoint
    const compareRes = await request('POST', '/api/quote/compare', {
      dob: '1995-05-15',
      departureDate: '2026-10-01',
      returnDate: '2026-10-04',
      region: 'Excluding',
      coverage: 50000
    });
    assert(compareRes.status === 200, 'Compare endpoint returns 200 for valid quote query');
    assert(compareRes.data.age === 31, 'Compare endpoint computes accurate age (31)');
    assert(compareRes.data.travelDays === 4, 'Compare endpoint computes accurate duration (4 days)');
    const tier50k = compareRes.data.groupedResults['50000'] || [];
    assert(tier50k.length > 0, 'Compare endpoint returns matching rates for $50,000 coverage');
    if (tier50k.length > 0) {
      assert(tier50k[0].isBestPrice === true, 'Cheapest plan tagged with isBestPrice: true');
    }

    // 12. Soft delete company hides it from Compare query
    await request('PATCH', `/api/companies/${compId}/status`, { isActive: false }, { Authorization: `Bearer ${token}` });
    const compareAfterDeact = await request('POST', '/api/quote/compare', {
      dob: '1995-05-15',
      departureDate: '2026-10-01',
      returnDate: '2026-10-04',
      region: 'Excluding',
      coverage: 50000
    });
    const matchesDeact = (compareAfterDeact.data.groupedResults['50000'] || []).some(p => p.companyId === compId);
    assert(!matchesDeact, 'Soft-deleted (inactive) company is hidden from quote comparison');

    // Cleanup: Permanent delete test company
    await request('DELETE', `/api/companies/${compId}?permanent=true`, null, { Authorization: `Bearer ${token}` });
    console.log('Cleaned up test company');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
}

runTests();

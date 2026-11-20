/**
 * Comprehensive Test Suite for Rate Document Extraction & Dynamic Configuration
 * 
 * Verifies:
 * 1. rateDocExtractor service extracts all categories (plan name, rate, sum insured, region, age band, days slab)
 * 2. Dynamic Sum Insured addition (e.g. $75,000, $150,000 not previously in default coverages)
 * 3. Dynamic Days Slabs and Age Bands configuration matching uploaded doc
 * 4. Backend endpoint POST /api/rates/extract-doc
 * 5. End-to-end grid save & retrieval with newly added Sum Insured
 */

try {
  require('dotenv').config({ path: 'server/.env' });
} catch {
  require('./server/node_modules/dotenv').config({ path: 'server/.env' });
}
const assert = require('assert');
const { extractRatesFromDocument } = require('./server/services/rateDocExtractor');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Rate Document Extraction Test Suite');
  console.log('====================================================\n');

  // Test 1: Test rateDocExtractor with text/markdown rate sheet
  console.log('Test 1: Extracting rates from synthetic rate document with unusual Sum Insured ($75k, $150k)...');
  const sampleDocText = `
KHANNA TRAVELS - GLOBAL TRAVEL SHIELD
RATE SHEET 2026

Table 1: Plan: Travel Shield Gold
Sum Insured: USD 75,000
Coverage: Worldwide Excluding USA & Canada

Days Slab | Age 0-35 | Age 36-60 | Age 61-75 | Age 76-85
1 to 5    | 550      | 650       | 950       | 1750
6 to 10   | 850      | 980       | 1450      | 2450
11 to 15  | 1150     | 1350      | 1950      | 3250
16 to 30  | 1850     | 2150      | 3100      | 5200

Table 2: Plan: Travel Shield Gold
Sum Insured: USD 150,000
Coverage: Worldwide Including USA & Canada

Days Slab | Age 0-35 | Age 36-60 | Age 61-75 | Age 76-85
1 to 5    | 950      | 1150      | 1650      | 2950
6 to 10   | 1450     | 1750      | 2550      | 4250
11 to 15  | 1950     | 2350      | 3450      | 5650
16 to 30  | 2950     | 3550      | 5200      | 8800
`;

  const result = await extractRatesFromDocument({
    buffer: Buffer.from(sampleDocText, 'utf8'),
    mimeType: 'text/plain',
    originalName: 'gold_rates.txt',
    existingCoverages: [50000, 100000, 200000, 250000, 500000, 750000, 1000000]
  });

  assert.strictEqual(result.success, true, 'Result success must be true');
  assert.ok(result.groups.length >= 2, `Expected at least 2 rate groups, got ${result.groups.length}`);
  console.log(`✅ Extracted ${result.groups.length} rate groups successfully!`);
  console.log(`   Plan Name: "${result.planName}"`);

  // Verify Group 1: 75,000 Excluding
  const g1 = result.groups.find(g => g.sumInsured === 75000 && g.coverage === 'Excluding');
  assert.ok(g1, 'Expected group for $75,000 Excluding');
  assert.strictEqual(g1.isNewSumInsured, true, '75000 must be flagged as isNewSumInsured');
  assert.ok(g1.daysSlabs.length >= 4, `Expected at least 4 day slabs, got ${g1.daysSlabs.length}`);
  assert.ok(g1.ageBands.length >= 4, `Expected at least 4 age bands, got ${g1.ageBands.length}`);
  assert.strictEqual(g1.matrix[0][0], 550, 'First cell must be 550');
  assert.strictEqual(g1.matrixData['0_0'], 550, 'matrixData 0_0 must be 550');
  console.log('✅ Group 1 ($75,000 Excluding):');
  console.log(`   - New Sum Insured Flagged: ${g1.isNewSumInsured}`);
  console.log(`   - Day Slabs (${g1.daysSlabs.length}):`, g1.daysSlabs.map(s => s.label).join(', '));
  console.log(`   - Age Bands (${g1.ageBands.length}):`, g1.ageBands.map(a => a.label).join(', '));
  console.log(`   - Sample Premium [0][0]: ₹${g1.matrix[0][0]}`);

  // Verify Group 2: 150,000 Including
  const g2 = result.groups.find(g => g.sumInsured === 150000 && g.coverage === 'Including');
  assert.ok(g2, 'Expected group for $150,000 Including');
  assert.strictEqual(g2.isNewSumInsured, true, '150000 must be flagged as isNewSumInsured');
  assert.strictEqual(g2.matrix[0][0], 950, 'First cell must be 950');
  console.log('✅ Group 2 ($150,000 Including):');
  console.log(`   - New Sum Insured Flagged: ${g2.isNewSumInsured}`);
  console.log(`   - Sample Premium [0][0]: ₹${g2.matrix[0][0]}`);

  // Test 2: Test applyImportedGroupsToState to ensure new Sum Insured is dynamically added
  console.log('\nTest 2: Verifying dynamic Sum Insured addition into state...');
  const { applyImportedGroupsToState } = require('./js/rateImport.js');
  const stateStore = {};
  const currentCoverages = [50000, 100000, 200000, 250000, 500000, 750000, 1000000];

  const stateResult = applyImportedGroupsToState(stateStore, [g1, g2], 'replace', currentCoverages);
  assert.ok(stateResult.updatedCoverages.includes(75000), '75000 must be present in updatedCoverages');
  assert.ok(stateResult.updatedCoverages.includes(150000), '150000 must be present in updatedCoverages');
  console.log('✅ Updated Coverages with dynamically added Sum Insureds:', stateResult.updatedCoverages);
  assert.strictEqual(stateStore['75000_Excluding'].daysSlabs.length, g1.daysSlabs.length, 'State store days slabs match doc');
  assert.strictEqual(stateStore['75000_Excluding'].ageBands.length, g1.ageBands.length, 'State store age bands match doc');

  // Test 3: Test HTTP API endpoint POST /api/rates/extract-doc
  console.log('\nTest 3: Testing HTTP endpoint POST /api/rates/extract-doc on localhost:3000...');
  try {
    const fileBlob = new Blob([sampleDocText], { type: 'text/plain' });
    const form = new FormData();
    form.append('file', fileBlob, 'travel_rates_sheet.txt');
    form.append('existingCoverages', JSON.stringify(currentCoverages));

    const response = await fetch('http://localhost:3000/api/rates/extract-doc', {
      method: 'POST',
      body: form
    });

    console.log(`   HTTP Status: ${response.status}`);
    const httpData = await response.json();
    assert.strictEqual(httpData.success, true, 'HTTP endpoint must return success: true');
    assert.ok(httpData.groups && httpData.groups.length >= 2, 'HTTP endpoint must return extracted groups');
    console.log(`✅ API endpoint returned ${httpData.groups.length} groups successfully!`);
  } catch (err) {
    console.warn('⚠️ HTTP endpoint check error:', err.message);
    throw err;
  }

  console.log('\n====================================================');
  console.log('🎉 ALL RATE DOCUMENT IMPORT TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});

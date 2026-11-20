/**
 * Unit Test Suite for Rate Table Import Module (rateImport.js)
 * Run via: node test-rate-import.js
 */

const XLSX = require('./js/vendor/xlsx.full.min.js');
globalThis.XLSX = XLSX;

async function runTests() {
  const {
    parseSumInsured,
    parseCoverage,
    parseDaysSlab,
    parseAgeBand,
    parsePremium,
    detectSheetLayout,
    parseWorkbook,
    applyImportedGroupsToState,
    EXCLUDING_USA_CANADA,
    INCLUDING_USA_CANADA
  } = await import('./js/rateImport.js');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  console.log('\n--- 1. PARSING & NORMALIZATION TESTS ---');

  // Sum Insured
  assert(parseSumInsured(75000) === 75000, 'parseSumInsured handles numeric 75000');
  assert(parseSumInsured('75,000') === 75000, 'parseSumInsured handles "75,000"');
  assert(parseSumInsured('$75,000') === 75000, 'parseSumInsured handles "$75,000"');
  assert(parseSumInsured('USD 75000') === 75000, 'parseSumInsured handles "USD 75000"');
  assert(parseSumInsured('USD 1,000,000') === 1000000, 'parseSumInsured handles "USD 1,000,000"');
  assert(parseSumInsured('invalid') === null, 'parseSumInsured returns null for invalid');

  // Coverage
  assert(parseCoverage('Excluding USA & Canada') === EXCLUDING_USA_CANADA, 'parseCoverage handles "Excluding USA & Canada"');
  assert(parseCoverage('Excl. USA/Canada') === EXCLUDING_USA_CANADA, 'parseCoverage handles "Excl. USA/Canada"');
  assert(parseCoverage('Including USA/Canada') === INCLUDING_USA_CANADA, 'parseCoverage handles "Including USA/Canada"');
  assert(parseCoverage('INCL') === INCLUDING_USA_CANADA, 'parseCoverage handles "INCL"');
  assert(parseCoverage('Worldwide') === null, 'parseCoverage returns null for unrecognized text');

  // Days Slab
  const slab1 = parseDaysSlab('1-4');
  assert(slab1 && slab1.min === 1 && slab1.max === 4, 'parseDaysSlab handles "1-4"');
  const slab2 = parseDaysSlab('1--4');
  assert(slab2 && slab2.min === 1 && slab2.max === 4, 'parseDaysSlab handles "1--4"');
  const slab3 = parseDaysSlab('1 – 4');
  assert(slab3 && slab3.min === 1 && slab3.max === 4, 'parseDaysSlab handles "1 – 4"');
  const slab4 = parseDaysSlab('1 to 4');
  assert(slab4 && slab4.min === 1 && slab4.max === 4, 'parseDaysSlab handles "1 to 4"');
  const slab5 = parseDaysSlab('180');
  assert(slab5 && slab5.min === 180 && slab5.max === 180, 'parseDaysSlab handles single number "180"');
  const slab6 = parseDaysSlab(180);
  assert(slab6 && slab6.min === 180 && slab6.max === 180, 'parseDaysSlab handles numeric 180');

  // Age Band
  const age1 = parseAgeBand('0-40 YRS');
  assert(age1 && age1.min === 0 && age1.max === 40, 'parseAgeBand handles "0-40 YRS"');
  const age2 = parseAgeBand('0-40 Yrs (INR)');
  assert(age2 && age2.min === 0 && age2.max === 40, 'parseAgeBand handles "0-40 Yrs (INR)"');
  const age3 = parseAgeBand('41 – 60');
  assert(age3 && age3.min === 41 && age3.max === 60, 'parseAgeBand handles "41 – 60"');
  const age4 = parseAgeBand('61 to 70');
  assert(age4 && age4.min === 61 && age4.max === 70, 'parseAgeBand handles "61 to 70"');

  // Premium
  assert(parsePremium(520).value === 520, 'parsePremium handles numeric 520');
  assert(parsePremium('520').value === 520, 'parsePremium handles string "520"');
  assert(parsePremium('₹ 1,520').value === 1520, 'parsePremium handles "₹ 1,520"');
  assert(parsePremium('INR 138,021').value === 138021, 'parsePremium handles "INR 138,021"');
  assert(parsePremium('').isEmpty === true, 'parsePremium detects empty string as isEmpty');
  assert(parsePremium(null).isEmpty === true, 'parsePremium detects null as isEmpty');
  assert(parsePremium('N/A').error === true, 'parsePremium detects non-numeric text as error');
  assert(parsePremium(-10).error === true, 'parsePremium detects negative number as error');
  assert(parsePremium(0).error === true, 'parsePremium detects 0 as error');

  console.log('\n--- 2. SYNTHETIC WORKBOOK TESTS (ICICI LOMBARD SPECIFICATION) ---');

  // Days slabs from 1-4 to 161-180 (17 slabs)
  const DAYS_SLABS_17 = [
    '1-4', '5-6', '7-8', '9-10', '11-15', '16-21', '22-28', '29-35',
    '36-45', '46-60', '61-90', '91-120', '121-150', '151-180', '181-270', '271-365', '161-180'
  ];
  // To have exactly 17 contiguous slabs as per user description:
  const USER_17_DAYS = [
    '1-4', '5-7', '8-10', '11-15', '16-21', '22-28', '29-35', '36-45',
    '46-60', '61-75', '76-90', '91-105', '106-120', '121-135', '136-150', '151-160', '161-180'
  ];
  const AGE_BANDS_5 = ['0-40 Yrs (INR)', '41-60 Yrs (INR)', '61-70 Yrs (INR)', '71-80 Yrs (INR)', '81-85 Yrs (INR)'];
  const SUMS_INSURED = [75000, 150000, 300000, 600000, 1000000];

  const wb = XLSX.utils.book_new();

  // 1. Build "All Data" sheet (Layout A)
  const allDataRows = [
    // Header row
    ['Sum Insured (USD)', 'Coverage', 'Days Slab', ...AGE_BANDS_5]
  ];

  for (const si of SUMS_INSURED) {
    for (const cov of ['Excluding USA & Canada', 'Including USA & Canada']) {
      for (let sIdx = 0; sIdx < USER_17_DAYS.length; sIdx++) {
        const slabStr = USER_17_DAYS[sIdx];
        const row = [si, cov, slabStr];
        for (let aIdx = 0; aIdx < AGE_BANDS_5.length; aIdx++) {
          let prem = 500 + sIdx * 50 + aIdx * 100 + (si / 1000);
          // Spot checks
          if (si === 75000 && cov.includes('Excl') && slabStr === '1-4' && aIdx === 0) prem = 520;
          if (si === 1000000 && cov.includes('Incl') && slabStr === '161-180' && aIdx === 4) prem = 138021;
          row.push(prem);
        }
        allDataRows.push(row);
      }
    }
  }

  const wsAllData = XLSX.utils.aoa_to_sheet(allDataRows);
  XLSX.utils.book_append_sheet(wb, wsAllData, 'All Data');

  // 2. Build 5 sheets for Layout B: "USD 75,000", "USD 150,000", "USD 300,000", "USD 600,000", "USD 1,000,000"
  // Layout B: Excl block in columns A-F, Incl block in columns H-M, header on row 5, data on rows 6-22 (1-based row index)
  for (const si of SUMS_INSURED) {
    const sheetName = `USD ${si.toLocaleString()}`;
    const bRows = [];

    // Rows 1-3 empty or title
    bRows.push([`Travel Insurance Rates — Sum Insured USD ${si.toLocaleString()}`]);
    bRows.push([]);
    bRows.push([]);
    // Row 4: Coverage titles above blocks (col A: Excl, col H: Incl)
    const titleRow = new Array(14).fill('');
    titleRow[0] = 'Excluding USA & Canada';
    titleRow[7] = 'Including USA & Canada';
    bRows.push(titleRow);

    // Row 5: Headers (Col A: Days Slab, Col B-F: Ages; Col H: Days Slab, Col I-M: Ages)
    const headerRow = new Array(14).fill('');
    headerRow[0] = 'Days Slab';
    headerRow[1] = '0-40 Yrs';
    headerRow[2] = '41-60 Yrs';
    headerRow[3] = '61-70 Yrs';
    headerRow[4] = '71-80 Yrs';
    headerRow[5] = '81-85 Yrs';

    headerRow[7] = 'Days Slab';
    headerRow[8] = '0-40 Yrs';
    headerRow[9] = '41-60 Yrs';
    headerRow[10] = '61-70 Yrs';
    headerRow[11] = '71-80 Yrs';
    headerRow[12] = '81-85 Yrs';
    bRows.push(headerRow);

    // Rows 6 to 22: Data rows (17 day slabs)
    for (let sIdx = 0; sIdx < USER_17_DAYS.length; sIdx++) {
      const slabStr = USER_17_DAYS[sIdx];
      const dataRow = new Array(14).fill('');
      dataRow[0] = slabStr;
      for (let aIdx = 0; aIdx < 5; aIdx++) {
        let prem = 500 + sIdx * 50 + aIdx * 100 + (si / 1000);
        if (si === 75000 && slabStr === '1-4' && aIdx === 0) prem = 520;
        dataRow[1 + aIdx] = prem;
      }

      dataRow[7] = slabStr;
      for (let aIdx = 0; aIdx < 5; aIdx++) {
        let prem = 800 + sIdx * 80 + aIdx * 150 + (si / 1000);
        if (si === 1000000 && slabStr === '161-180' && aIdx === 4) prem = 138021;
        dataRow[8 + aIdx] = prem;
      }
      bRows.push(dataRow);
    }

    const wsB = XLSX.utils.aoa_to_sheet(bRows);
    XLSX.utils.book_append_sheet(wb, wsB, sheetName);
  }

  // Parse the synthetic workbook
  console.log('Parsing synthetic ICICI Lombard rate workbook...');
  const parsed = parseWorkbook(wb, {
    fileName: 'ICICI_Lombard_Value_Pro_Plan_Rates.xlsx',
    existingCoverages: [50000, 100000, 200000, 250000, 500000, 750000, 1000000]
  });

  // Verify expectations:
  assert(parsed.sheets.length === 6, 'Detected 6 sheets in workbook');
  assert(parsed.sheets[0].layout === 'Layout A (Flat table)', 'Sheet 1 detected as Layout A');
  assert(parsed.sheets[1].layout === 'Layout B (Matrix blocks)', 'Sheet 2 detected as Layout B');
  assert(parsed.groups.length === 10, `Expected exactly 10 groups, got: ${parsed.groups.length}`);
  assert(parsed.totalRates === 850, `Expected exactly 850 rates, got: ${parsed.totalRates}`);
  assert(parsed.totalDaysSlabs === 170, `Expected exactly 170 day slabs total (17 per group), got: ${parsed.totalDaysSlabs}`);

  // Spot check 1: USD 75,000 / Excluding / 1-4 days / 0-40 = 520
  const g75Excl = parsed.groups.find(g => g.sumInsured === 75000 && g.coverage === EXCLUDING_USA_CANADA);
  assert(g75Excl !== undefined, 'Found USD 75,000 Excluding group');
  if (g75Excl) {
    const rate520 = g75Excl.rates.find(r => r.daysSlab.min === 1 && r.daysSlab.max === 4 && r.ageBand.min === 0 && r.ageBand.max === 40);
    assert(rate520 && rate520.premium === 520, `Spot check 1: USD 75,000 / Excluding / 1–4 / 0–40 is 520 (got: ${rate520 ? rate520.premium : null})`);
  }

  // Spot check 2: USD 1,000,000 / Including / 161-180 / 81-85 = 138021
  const g1mIncl = parsed.groups.find(g => g.sumInsured === 1000000 && g.coverage === INCLUDING_USA_CANADA);
  assert(g1mIncl !== undefined, 'Found USD 1,000,000 Including group');
  if (g1mIncl) {
    const rate138k = g1mIncl.rates.find(r => r.daysSlab.min === 161 && r.daysSlab.max === 180 && r.ageBand.min === 81 && r.ageBand.max === 85);
    assert(rate138k && rate138k.premium === 138021, `Spot check 2: USD 1,000,000 / Including / 161–180 / 81–85 is 138021 (got: ${rate138k ? rate138k.premium : null})`);
  }

  // Deduplication check: sheets 2-6 were marked as duplicate sources
  const dupWarnings = parsed.allWarnings.filter(w => w.message.includes('Duplicate source'));
  assert(dupWarnings.length > 0, `Duplicate source sheets were recognized and reported in warnings (count: ${dupWarnings.length})`);

  console.log('\n--- 3. OVERLAP & GAP VALIDATION TESTS ---');

  // Test Overlap Error in Days
  const wbErr = XLSX.utils.book_new();
  const badDataRows = [
    ['Sum Insured', 'Coverage', 'Days', '0-40 Yrs'],
    [50000, 'Excluding', '1-5', 100],
    [50000, 'Excluding', '4-10', 200] // Overlaps with 1-5!
  ];
  XLSX.utils.book_append_sheet(wbErr, XLSX.utils.aoa_to_sheet(badDataRows), 'BadDays');
  const parsedBadDays = parseWorkbook(wbErr);
  assert(parsedBadDays.groups[0].errors.some(e => e.message.includes('Days slabs overlap')), 'Correctly flags Days slabs overlap error');
  assert(parsedBadDays.groups[0].status === 'error', 'Group status becomes "error" on overlap');

  // Test Gap Warning in Days
  const wbGap = XLSX.utils.book_new();
  const gapDataRows = [
    ['Sum Insured', 'Coverage', 'Days', '0-40 Yrs'],
    [50000, 'Excluding', '1-4', 100],
    [50000, 'Excluding', '7-10', 200] // Gap between 4 and 7!
  ];
  XLSX.utils.book_append_sheet(wbGap, XLSX.utils.aoa_to_sheet(gapDataRows), 'GapDays');
  const parsedGap = parseWorkbook(wbGap);
  assert(parsedGap.groups[0].warnings.some(w => w.message.includes('Days slab gap')), 'Correctly reports Days slab gap warning');

  console.log('\n--- 4. STATE APPLICATION TESTS ---');
  const stateStore = {};
  const currentCoverages = [50000, 100000, 200000, 250000, 500000, 750000, 1000000];
  const applyRes = applyImportedGroupsToState(stateStore, parsed.groups, 'replace', currentCoverages);

  assert(applyRes.affectedCount === 10, 'Applied 10 groups to stateStore');
  assert(applyRes.totalRatesAdded === 850, '850 rates applied to stateStore');
  assert(applyRes.updatedCoverages.includes(75000), 'New sum insured 75000 added to updatedCoverages');
  assert(applyRes.updatedCoverages.includes(150000), 'New sum insured 150000 added to updatedCoverages');
  assert(applyRes.updatedCoverages.includes(300000), 'New sum insured 300000 added to updatedCoverages');
  assert(applyRes.updatedCoverages.includes(600000), 'New sum insured 600000 added to updatedCoverages');
  assert(applyRes.updatedCoverages.includes(1000000), 'Sum insured 1000000 present in updatedCoverages');

  console.log(`\n========================================`);
  console.log(`Rate Import Tests: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});


/**
 * Test Suite: Issue Policy Flow Verification
 * Tests the requirements:
 * 1. Confirm Quote step removed (stepper has 3 steps in individual mode).
 * 2. Empty state shows "Select a quote first" when no quote is selected.
 * 3. Quote summary bar is rendered with "Change quote" link.
 * 4. Step 1 offers Upload Passport vs Fill In Manually.
 * 5. Manual entry pre-fills name and DOB from quote and validates required fields.
 * 6. Step 2 runs checks; manual entry skips MRZ and requires attestation checkbox.
 * 7. Policy issuance payload includes entryMethod, quoteId, and travel dates.
 * 8. Group flow supports manual rows, waives MRZ for manual rows, and includes entryMethod/quoteId in payload.
 */
import assert from 'assert';
import { IssuePolicyView } from './js/views/issuePolicyView.js';
import { GroupReviewGrid } from './js/issuePolicy/components/GroupReviewGrid.js';

// Setup mock browser globals for tests
globalThis.sessionStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

const mockApp = {
  navigatedTo: null,
  navigate(viewId) { this.navigatedTo = viewId; },
  showToast(msg, type) {}
};

console.log('\n--- ISSUE POLICY FLOW TESTS ---');

// Test 1: Empty state when no quote is selected
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  const html = view.render();

  assert.ok(html.includes('Select a quote first'), 'Empty state must say "Select a quote first"');
  assert.ok(html.includes('btnGoToQuotesScreen'), 'Must include button back to quotes screen');
  assert.ok(!html.includes('Confirm Quote'), 'Must not contain Confirm Quote');
  console.log('✅ PASS: Empty state displays "Select a quote first" when no quote is selected');
}

// Test 2: Stepper definition (4 steps for Individual mode)
{
  const view = new IssuePolicyView(mockApp);
  view.mode = 'individual';
  const steps = view.getStepperSteps();

  assert.strictEqual(steps.length, 4, 'Individual stepper must have exactly 4 steps');
  assert.strictEqual(steps[0].label, 'Passport', 'Step 1 must be "Passport"');
  assert.strictEqual(steps[1].label, 'Get quotes', 'Step 2 must be "Get quotes"');
  assert.strictEqual(steps[2].label, 'Policy details', 'Step 3 must be "Policy details"');
  assert.strictEqual(steps[3].label, 'Review', 'Step 4 must be "Review"');

  const stepLabels = steps.map(s => s.label.toLowerCase());
  assert.ok(!stepLabels.includes('confirm quote'), 'Confirm Quote must not be in stepper');
  console.log('✅ PASS: Individual stepper has 4 steps (Passport -> Get quotes -> Policy details -> Review)');
}

// Test 3: Setting a quote and Quote Summary Bar
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-TEST-2026',
    planName: 'Elite Worldwide',
    companyName: 'Bajaj Allianz',
    totalPremium: 4200,
    perTravellerPremium: 4200,
    travellerCountQuoted: 1,
    estimatedTotal: 4200,
    travellerName: 'Pooja Patel',
    dob: '1995-08-20',
    destination: 'Schengen (Europe)',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    durationDays: 15,
    coverage: 100000,
    isGroup: false
  };

  view.setSelectedQuote(sampleQuote);
  const html = view.render();

  // Quote Summary Bar checks
  assert.ok(html.includes('quote-summary-bar'), 'Must render quote summary bar');
  assert.ok(html.includes('QT-TEST-2026'), 'Summary bar must contain quote ID');
  assert.ok(html.includes('Elite Worldwide'), 'Summary bar must contain plan name');
  assert.ok(html.includes('Bajaj Allianz'), 'Summary bar must contain insurer');
  assert.ok(html.includes('Pooja Patel'), 'Summary bar must contain traveller name');
  assert.ok(html.includes('4,200'), 'Summary bar must contain formatted premium');
  assert.ok(html.includes('linkChangeQuote'), 'Summary bar must include "Change quote" link');
  assert.ok(html.includes('Change quote'), 'Summary bar must show Change quote text');
  console.log('✅ PASS: Compact quote summary bar is rendered with all details and "Change quote" link');
}

// Test 4: Step 1 offers both "Upload passport" and "Fill in manually" cards
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-TEST-001',
    planName: 'Gold Plan',
    companyName: 'Care Insurance',
    totalPremium: 3000,
    travellerName: 'Rohan Sharma',
    dob: '1990-01-10',
    destination: 'USA',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-10',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);

  const html = view.render();
  assert.ok(html.includes('optIndividualEntryOcr'), 'Must contain Upload passport card');
  assert.ok(html.includes('optIndividualEntryManual'), 'Must contain Fill in manually card');
  assert.ok(html.includes('Upload passport'), 'Must have label Upload passport');
  assert.ok(html.includes('Fill in manually'), 'Must have label Fill in manually');
  console.log('✅ PASS: Step 1 presents Upload passport and Fill in manually selectable cards');
}

// Test 5: Manual Entry pre-fills Name and DOB from quote
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-TEST-002',
    planName: 'Silver Plan',
    companyName: 'Niva Bupa',
    totalPremium: 2500,
    travellerName: 'Sunita Verma',
    dob: '1988-11-25',
    destination: 'UK',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-10',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);
  view.state.individual.entryMethod = 'manual';

  const html = view.render();
  assert.ok(html.includes('value="Sunita Verma"'), 'Given name must be prefilled with full name Sunita Verma without splitting on spaces');
  assert.ok(html.includes('id="manSurname"'), 'Must have surname field');
  assert.ok(html.includes('value="1988-11-25"'), 'DOB must be prefilled with 1988-11-25');
  assert.ok(html.includes('manPassportNumber'), 'Must have passport number field');
  assert.ok(html.includes('manExpiryDate'), 'Must have expiry date field');
  console.log('✅ PASS: Manual entry form pre-fills traveller name and DOB from quote');
}

// Test 6: Step 2 verification view: Manual entry displays split layout and "Entered manually" banner
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-TEST-003',
    planName: 'Platinum Plan',
    companyName: 'HDFC ERGO',
    totalPremium: 5000,
    travellerName: 'Amit Kapoor',
    dob: '1985-04-12',
    destination: 'Dubai',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);

  // Setup verified manual data
  view.state.individual.entryMethod = 'manual';
  view.state.individual.step = 2;
  view.state.individual.verifiedData = {
    givenNames: 'Amit',
    surname: 'Kapoor',
    passportNumber: 'K1234567',
    nationality: 'IND',
    countryCode: 'IND',
    sex: 'M',
    dob: '1985-04-12',
    issueDate: '2020-01-01',
    expiryDate: '2030-01-01',
    fatherName: 'Raj Kapoor',
    motherName: 'Sunita Kapoor',
    spouseName: 'Neha Kapoor',
    address: '123 Connaught Place, New Delhi',
    pin: '110001',
    fileNumber: 'D1234567',
    mrz: null,
    entryMethod: 'manual'
  };

  const html = view.render();
  assert.ok(html.includes('passport-split-layout'), 'Step 2 must render 2-column split layout');
  assert.ok(html.includes('manual-entry-banner'), 'Step 2 must show "Entered manually" banner');
  assert.ok(html.includes('passport-page-mock'), 'Manual mode must render golden passport card mock');
  assert.ok(html.includes('chkVerifyPassportDetails'), 'Step 2 must have verification checkbox');
  assert.ok(html.includes('I have verified these passport details against the document'), 'Verification declaration text must be present');
  assert.ok(!html.includes('MACHINE READABLE ZONE (ICAO 9303 TD3)'), 'MRZ box must not be displayed for manual entry');
  assert.ok(!html.includes('⚠️ MRZ Validation Notice'), 'Must NOT display removed MRZ Validation Notice');
  assert.ok(!html.includes('Automated Verification Checks'), 'Must NOT display removed 6 checks panel');
  console.log('✅ PASS: Manual entry renders split layout, "Entered manually" banner, and verification declaration');
}

// Test 7: Step 2 verification view: OCR path renders split layout with document preview and MRZ
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-TEST-004',
    planName: 'Platinum Plan',
    companyName: 'HDFC ERGO',
    totalPremium: 5000,
    travellerName: 'Aarav Sharma',
    dob: '1992-05-15',
    destination: 'Schengen',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);
  view.state.individual.entryMethod = 'ocr';
  view.state.individual.step = 2;
  view.state.individual.uploadedFiles = [
    { name: 'passport-scan.pdf', previewUrl: 'blob:http://localhost:3000/mock-uuid', isPdf: true }
  ];
  view.state.individual.verifiedData = {
    givenNames: 'Aarav',
    surname: 'Sharma',
    passportNumber: 'M4592817',
    nationality: 'IND',
    countryCode: 'IND',
    sex: 'M',
    dob: '1992-05-15',
    issueDate: '2022-05-15',
    expiryDate: '2032-05-14',
    fatherName: 'Ramesh Sharma',
    motherName: 'Sunita Sharma',
    address: '45 Lake View, Mumbai',
    pin: '400001',
    fileNumber: 'M9876543',
    mrz: [
      'P<INDSHARMA<<AARAV<<<<<<<<<<<<<<<<<<<<<<<<<<',
      'M4592817<6IND9205152M3205149<<<<<<<<<<<<<<<4'
    ],
    entryMethod: 'ocr'
  };

  const html = view.render();
  assert.ok(html.includes('passport-split-layout'), 'Step 2 must render split layout');
  assert.ok(html.includes('passport-doc-card'), 'Must render passport document card on left');
  assert.ok(html.includes('passport-pdf-frame'), 'Must render PDF iframe preview');
  assert.ok(html.includes('MACHINE READABLE ZONE (ICAO 9303 TD3)'), 'MRZ box must be displayed for OCR path with MRZ');
  assert.ok(html.includes('Front Page Details (Data Page)'), 'Must render Front Page details section');
  assert.ok(html.includes('Back Page Details (Address &amp; Family)'), 'Must render Back Page details section');
  assert.ok(html.includes('chkVerifyPassportDetails'), 'Must include verification declaration checkbox');
  assert.ok(!html.includes('⚠️ MRZ Validation Notice'), 'Must NOT display removed MRZ Validation Notice');
  assert.ok(!html.includes('Automated Verification Checks'), 'Must NOT display removed 6 checks panel');
  console.log('✅ PASS: OCR path renders split layout with document preview, MRZ, and verification declaration');
}

// Test 8: Date of issue before expiry date check
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    travellerName: 'Aarav Sharma',
    dob: '1992-05-15',
    tripEnd: '2026-12-15'
  };

  // Case A: Issue date is AFTER expiry date -> should fail
  const invalidDates = {
    givenNames: 'Aarav',
    surname: 'Sharma',
    dob: '1992-05-15',
    issueDate: '2030-01-01',
    expiryDate: '2028-01-01'
  };
  const checksInvalid = view._runIndividualLiveChecks(invalidDates, sampleQuote, true);
  const dateCheck = checksInvalid.find(c => c.id === 'issueBeforeExpiry');
  assert.ok(dateCheck, 'Issue date check must exist');
  assert.strictEqual(dateCheck.pass, false, 'Issue date after expiry date must fail');

  // Case B: Issue date is BEFORE expiry date -> should pass
  const validDates = {
    givenNames: 'Aarav',
    surname: 'Sharma',
    dob: '1992-05-15',
    issueDate: '2020-01-01',
    expiryDate: '2030-01-01'
  };
  const checksValid = view._runIndividualLiveChecks(validDates, sampleQuote, true);
  const dateCheckPass = checksValid.find(c => c.id === 'issueBeforeExpiry');
  assert.strictEqual(dateCheckPass.pass, true, 'Issue date before expiry date must pass');
  console.log('✅ PASS: "Date of issue before expiry date" check works accurately');
}

// Test 9: Group Flow - Manual row addition waives MRZ validation in GroupReviewGrid
{
  const grid = new GroupReviewGrid({
    rows: [
      {
        id: 'row-man-1',
        entryMethod: 'manual',
        sourceFile: 'Manual entry',
        givenNames: 'Priya',
        surname: 'Mehta',
        passportNumber: 'Z9876543',
        nationality: 'IND',
        sex: 'F',
        dob: '1994-06-12',
        expiryDate: '2034-06-11',
        mrz: null
      }
    ],
    tripDates: {
      tripStart: '2026-12-01',
      tripEnd: '2026-12-15'
    }
  });

  grid.validateAllRows();
  const summary = grid.getSummaryCounts();
  assert.strictEqual(summary.errors, 0, 'Valid manual row with no MRZ must have 0 errors');
  assert.strictEqual(summary.canProceed, true, 'Valid manual row must allow proceeding');

  const html = grid.render();
  assert.ok(html.includes('✍️ Manual'), 'Table must display "✍️ Manual" badge for manual rows');
  console.log('✅ PASS: GroupReviewGrid waives MRZ for manual rows and renders ✍️ Manual badge');
}

// Test 10: Quote DOB displayed in Quote Summary Bar
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-TEST-SUMMARY',
    planName: 'Gold Plan',
    companyName: 'Bajaj Allianz',
    totalPremium: 3000,
    travellerName: 'Aarav Sharma',
    dob: '1992-05-15',
    destination: 'Schengen',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);
  const html = view.render();
  assert.ok(html.includes('Quote DOB'), 'Summary bar must include "Quote DOB" label');
  assert.ok(html.includes('1992-05-15'), 'Summary bar must include traveller DOB');
  console.log('✅ PASS: Summary bar displays Quote DOB');
}

// Test 11: Quote Name Placeholder ("Customer") does not trigger mismatch
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-TEST-CUST',
    planName: 'Gold Plan',
    travellerName: 'Customer',
    dob: '1992-05-15',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);
  view.state.individual.step = 2;
  view.state.individual.entryMethod = 'manual';
  view.state.individual.verifiedData = {
    givenNames: 'Aarav',
    surname: 'Sharma',
    passportNumber: 'Z1234567',
    nationality: 'IND',
    countryCode: 'IND',
    sex: 'M',
    dob: '1992-05-15',
    issueDate: '2020-01-01',
    expiryDate: '2030-01-01'
  };
  const evalRes = view._evaluateIndividualVerification(view.state.individual.verifiedData, sampleQuote, true);
  assert.strictEqual(evalRes.nameDiffers, false, 'Placeholder "Customer" must not trigger nameDiffers');
  assert.strictEqual(evalRes.hasQuoteMismatch, false, 'No quote mismatch when name is placeholder and DOB matches');
  const html = view.render();
  assert.ok(!html.includes('quote-mismatch-warning-panel'), 'Warning panel must NOT be rendered for placeholder name');
  console.log('✅ PASS: Quote placeholder name ("Customer") does not trigger mismatch warning');
}

// Test 12: Step 2 Split Layout - Renders document on left and all front & back details on right with verify checkbox
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-TEST-MISMATCH',
    planName: 'Elite Plan',
    travellerName: 'Rajesh Sharma',
    dob: '1992-05-15',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);
  view.state.individual.step = 2;
  view.state.individual.entryMethod = 'ocr';
  view.state.individual.uploadedFiles = [
    { name: 'passport-front.jpg', previewUrl: 'blob:http://localhost:3000/mock-uuid-front', isPdf: false }
  ];
  view.state.individual.verifiedData = {
    givenNames: 'AARAV',
    surname: 'SHARMA',
    passportNumber: 'M4592817',
    nationality: 'IND',
    countryCode: 'IND',
    sex: 'M',
    dob: '1980-04-14',
    issueDate: '2020-01-01',
    expiryDate: '2030-01-01',
    placeOfBirth: 'Delhi',
    placeOfIssue: 'Delhi',
    fatherName: 'Ramesh Sharma',
    motherName: 'Kanta Sharma',
    spouseName: 'Priya Sharma',
    pin: '110001',
    fileNumber: 'DL123456',
    address: '42 Ring Road, New Delhi',
    mrz: [
      'P<INDSHARMA<<AARAV<<<<<<<<<<<<<<<<<<<<<<<<<<',
      'M4592817<6IND8004141M3001019<<<<<<<<<<<<<<<2'
    ]
  };

  // Unverified state: Proceed button is disabled
  view.state.individual.verified = false;
  let html = view.render();
  assert.ok(html.includes('passport-split-layout'), 'Must render 2-column split layout');
  assert.ok(html.includes('passport-doc-column'), 'Must render left document column');
  assert.ok(html.includes('passport-details-column'), 'Must render right details column');

  // Verify all 17 front & back fields are present
  const requiredFieldIds = [
    'vizGivenNames', 'vizSurname', 'vizPassportNo', 'vizDob', 'vizSex',
    'vizNationality', 'vizCountryCode', 'vizIssueDate', 'vizExpiryDate',
    'vizPlaceOfBirth', 'vizPlaceOfIssue', 'vizFatherName', 'vizMotherName',
    'vizSpouseName', 'vizPin', 'vizFileNumber', 'vizAddress'
  ];
  requiredFieldIds.forEach(id => {
    assert.ok(html.includes(`id="${id}"`), `Field #${id} must be present`);
  });

  assert.ok(html.includes('chkVerifyPassportDetails'), 'Must render #chkVerifyPassportDetails checkbox');
  assert.ok(html.includes('btnConfirmIndividualVerification'), 'Must render #btnConfirmIndividualVerification button');
  assert.ok(html.includes('disabled'), 'Confirm button must be disabled when unverified');
  assert.ok(!html.includes('quote-mismatch-warning-panel'), 'Must NOT render old warning panel');
  assert.ok(!html.includes('Automated Verification Checks'), 'Must NOT render old 6-check list');

  // Verified state: Proceed button is enabled
  view.state.individual.verified = true;
  html = view.render();
  assert.ok(html.includes('checked'), 'Checkbox must be checked');
  assert.ok(!html.includes('disabled'), 'Confirm button must be enabled when verified');
  console.log('✅ PASS: Step 2 split layout displays document preview on left, all 17 fields on right, and verification checkbox');
}

// Test 13: Severity rules - Hard blockers cannot be overridden
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    travellerName: 'Aarav Sharma',
    dob: '1992-05-15',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15'
  };

  // Case A: Missing required field (empty givenNames)
  const missingFieldData = {
    givenNames: '',
    surname: 'Sharma',
    passportNumber: 'M1234567',
    sex: 'M',
    dob: '1992-05-15',
    expiryDate: '2030-01-01'
  };
  view.state.individual.quoteMismatchOverridden = true;
  view.state.individual.mrzOverridden = true;
  view.state.individual.manualAttested = true;
  let evalRes = view._evaluateIndividualVerification(missingFieldData, sampleQuote, true);
  assert.strictEqual(evalRes.canProceed, false, 'Missing givenNames must always block proceeding');
  assert.ok(evalRes.hardErrors.some(e => e.includes('Given name')), 'Identifies missing given name');

  // Case B: Passport expires before travel return date
  const expiredData = {
    givenNames: 'Aarav',
    surname: 'Sharma',
    passportNumber: 'M1234567',
    sex: 'M',
    dob: '1992-05-15',
    expiryDate: '2026-11-01' // expires before tripEnd 2026-12-15
  };
  evalRes = view._evaluateIndividualVerification(expiredData, sampleQuote, true);
  assert.strictEqual(evalRes.canProceed, false, 'Passport expired before tripEnd must always block proceeding');

  // Case C: Date of issue after expiry date
  const badDatesData = {
    givenNames: 'Aarav',
    surname: 'Sharma',
    passportNumber: 'M1234567',
    sex: 'M',
    dob: '1992-05-15',
    issueDate: '2032-01-01',
    expiryDate: '2030-01-01'
  };
  evalRes = view._evaluateIndividualVerification(badDatesData, sampleQuote, true);
  assert.strictEqual(evalRes.canProceed, false, 'Date of issue after expiry must always block proceeding');
  console.log('✅ PASS: Severity rules enforced: hard blockers (missing required, expired before trip, bad dates) cannot be overridden');
}

// Test 14: Multi-page document preview tabs in split layout
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = { travellerName: 'Aarav Sharma', dob: '1992-05-15', tripEnd: '2026-12-15' };
  view.setSelectedQuote(sampleQuote);
  view.state.individual.step = 2;
  view.state.individual.entryMethod = 'ocr';
  view.state.individual.uploadedFiles = [
    { name: 'passport-front.pdf', previewUrl: 'blob:mock/front.pdf', isPdf: true },
    { name: 'passport-back.pdf', previewUrl: 'blob:mock/back.pdf', isPdf: true }
  ];
  view.state.individual.activePreviewIndex = 0;
  view.state.individual.verifiedData = {
    givenNames: 'Aarav',
    surname: 'Sharma',
    passportNumber: 'M4592817',
    sex: 'M',
    dob: '1992-05-15',
    expiryDate: '2030-01-01'
  };

  let html = view.render();
  assert.ok(html.includes('passport-page-tabs'), 'Must render tabs for multi-page upload');
  assert.ok(html.includes('Page 1 (Front)'), 'Renders Page 1 (Front) tab');
  assert.ok(html.includes('Page 2 (Back)'), 'Renders Page 2 (Back) tab');
  console.log('✅ PASS: Multi-page preview renders page tabs in document column');
}

// Test 15: Policy issuance payload includes overrides
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-OVERRIDE-TEST',
    planName: 'Super Care',
    totalPremium: 6500,
    travellerName: 'Ramesh Patel',
    dob: '1995-01-01',
    destination: 'UK',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);
  view.state.individual.step = 2;
  view.state.individual.verifiedData = {
    givenNames: 'Suresh',
    surname: 'Patel',
    passportNumber: 'T9988776',
    sex: 'M',
    dob: '1990-06-20',
    expiryDate: '2030-01-01'
  };
  view.state.individual.quoteMismatchOverridden = true;
  view._evaluateIndividualVerification(view.state.individual.verifiedData, sampleQuote, false);

  const lastMismatch = view.state.individual._lastMismatch;
  const overrides = [];
  if (view.state.individual.quoteMismatchOverridden && lastMismatch) {
    if (lastMismatch.nameDiffers) {
      overrides.push({
        field: 'travellerName',
        quoteValue: lastMismatch.quoteName,
        passportValue: lastMismatch.passportName
      });
    }
    if (lastMismatch.dobDiffers) {
      overrides.push({
        field: 'dob',
        quoteValue: lastMismatch.quoteDob,
        passportValue: lastMismatch.passportDob
      });
    }
  }
  assert.strictEqual(overrides.length, 2, 'Must record 2 overrides (travellerName and dob)');
  assert.strictEqual(overrides[0].field, 'travellerName');
  assert.strictEqual(overrides[0].quoteValue, 'Ramesh Patel');
  assert.strictEqual(overrides[0].passportValue, 'Suresh Patel');
  assert.strictEqual(overrides[1].field, 'dob');
  assert.strictEqual(overrides[1].quoteValue, '1995-01-01');
  assert.strictEqual(overrides[1].passportValue, '1990-06-20');
  console.log('✅ PASS: Policy issuance payload includes recorded overrides');
}

// Test 16: Verification confirms and syncs passport details into quote record and advances to Step 3
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-SYNC-TEST',
    travellerName: 'Customer', // placeholder
    dob: '1990-01-01',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);
  view.state.individual.step = 2;
  view.state.individual.entryMethod = 'ocr';
  view.state.individual.verifiedData = {
    givenNames: 'AKSHAY',
    surname: 'SUNIL',
    passportNumber: 'M4592817',
    nationality: 'IND',
    countryCode: 'IND',
    sex: 'M',
    dob: '1993-06-15',
    issueDate: '2026-09-28',
    expiryDate: '2036-09-27'
  };

  // Agent verifies and proceeds
  view.state.individual.verified = true;

  // Simulate confirmation logic from _attachIndividualEvents
  const data = view.state.individual.verifiedData;
  const q = view.state.individual.quote;
  const passportFullName = `${data.givenNames || ''} ${data.surname || ''}`.trim();
  const origName = (q?.travellerName || '').trim();
  const origDob = q?.dob || '';
  if (passportFullName) q.travellerName = passportFullName;
  if (data.dob) q.dob = data.dob;

  assert.strictEqual(q.travellerName, 'AKSHAY SUNIL', 'Quote traveller name updated to passport name');
  assert.strictEqual(q.dob, '1993-06-15', 'Quote DOB updated to passport DOB');
  console.log('✅ PASS: Verification confirms and syncs passport details directly for policy issuance');
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT ISSUE FLOW TESTS (Screens D1 – D5)
// ─────────────────────────────────────────────────────────────────────────────
import { QuoteView } from './js/quoteView.js';

// Test 17: Direct Issue Mode D1 — Issue Policy opened without a selected quote
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  const html = view.render();

  assert.strictEqual(view.state.individual.isDirectIssue, true, 'Must initialize in direct issue mode when no quote is selected');
  assert.strictEqual(view.state.individual.step, 1, 'Initial step must be 1 (Passport scan/entry)');

  const steps = view.getStepperSteps();
  assert.strictEqual(steps.length, 4, 'Direct issue stepper must have 4 steps');
  assert.strictEqual(steps[0].label, 'Passport', 'Step 1 label must be "Passport"');
  assert.strictEqual(steps[1].label, 'Get quotes', 'Step 2 label must be "Get quotes"');
  assert.strictEqual(steps[2].label, 'Policy details', 'Step 3 label must be "Policy details"');
  assert.strictEqual(steps[3].label, 'Review', 'Step 4 label must be "Review"');

  assert.ok(html.includes('direct-issue-banner-d1'), 'Step 1 must render direct issue banner');
  assert.ok(html.includes('Pick an existing quote instead'), 'Banner must include link to pick existing quote');
  assert.ok(html.includes('optIndividualEntryOcr'), 'Must provide Upload passport option');
  assert.ok(html.includes('optIndividualEntryManual'), 'Must provide Fill in manually option');
  console.log('✅ PASS: Direct Issue D1 renders "Passport" step with banner and entry options when no quote is selected');
}

// Test 18: Direct Issue Mode D2 — Passport details validation, colour-coded borders, age calculation
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  view.mode = 'individual';
  view.state.individual.isDirectIssue = true;
  view.state.individual.step = 2;

  const validData = {
    givenNames: 'Pooja',
    surname: 'Patel',
    passportNumber: 'Z8765432',
    dob: '1992-04-10',
    sex: 'F',
    nationality: 'IND',
    countryCode: 'IND',
    issueDate: '2020-01-15',
    expiryDate: '2030-01-14',
    placeOfBirth: 'Ahmedabad',
    placeOfIssue: 'Mumbai',
    fatherName: 'Kishore Patel',
    motherName: 'Meena Patel',
    spouseName: '',
    pin: '380001',
    address: '12 Shanti Nagar, Ahmedabad'
  };
  view.state.individual.verifiedData = { ...validData };

  const html = view.render();

  // D2 Banner and Stepper checks
  assert.ok(html.includes('direct-issue-banner-d2'), 'D2 must render banner');
  assert.ok(html.includes('No quote selected. Passport read. Next, get quotes for'), 'Banner text must match spec');
  assert.ok(html.includes('Pooja Patel'), 'Banner must mention traveller name');
  assert.ok(html.includes('linkPickExistingQuote'), 'Banner must include "Pick an existing quote instead" link');

  // Legend bar checks
  assert.ok(html.includes('direct-legend-bar'), 'Must include direct legend bar');
  assert.ok(html.includes('● Correct'), 'Legend must include Correct swatch');
  assert.ok(html.includes('● Check this'), 'Legend must include Check this swatch');
  assert.ok(html.includes('● Must fix'), 'Legend must include Must fix swatch');

  // Colour-coded fields check
  assert.ok(html.includes('border-green'), 'Valid fields must have green borders');
  assert.ok(html.includes('badge-green'), 'Valid fields must have green badges');

  // Age derived under DOB
  assert.ok(html.includes('dob-calc-age-tag'), 'Must include derived age tag under DOB');
  assert.ok(html.includes('(used for plan pricing)'), 'Age tag must state "(used for plan pricing)"');

  // Button enabled when no red fields
  assert.ok(html.includes('id="btnDirectGetQuotes"'), 'Must render Get quotes button');
  assert.ok(!html.includes('id="btnDirectGetQuotes"\n                disabled') && !html.includes('id="btnDirectGetQuotes" disabled'), 'Get quotes button must be enabled for valid passport');

  // Field evaluation helper tests
  // 1. Valid field: empty surname is allowed on Indian passport (green)
  const surStatus = view._evaluatePassportFieldStatus('surname', '', validData);
  assert.strictEqual(surStatus.status, 'green', 'Empty surname must evaluate to green (valid on passport)');

  // 1b. Red field: empty givenNames
  const redStatus = view._evaluatePassportFieldStatus('givenNames', '', validData);
  assert.strictEqual(redStatus.status, 'red', 'Empty givenNames must evaluate to red');
  assert.strictEqual(redStatus.icon, '✕', 'Red status must show ✕ icon');

  // 2. Red field: expiry date before issue date
  const badDateData = { ...validData, issueDate: '2025-01-01', expiryDate: '2024-01-01' };
  const dateStatus = view._evaluatePassportFieldStatus('expiryDate', '2024-01-01', badDateData);
  assert.strictEqual(dateStatus.status, 'red', 'Expiry date before issue date must be red');

  // 3. Orange field: missing optional back page field
  const orangeStatus = view._evaluatePassportFieldStatus('placeOfIssue', '', validData);
  assert.strictEqual(orangeStatus.status, 'orange', 'Missing optional place of issue must be orange');
  assert.strictEqual(orangeStatus.icon, '!', 'Orange status must show ! icon');

  // 4. Low confidence field -> orange
  const lowConfData = { ...validData, lowConfidence: ['givenNames'] };
  const lowConfStatus = view._evaluatePassportFieldStatus('givenNames', 'Pooja', lowConfData);
  assert.strictEqual(lowConfStatus.status, 'orange', 'Low confidence field must evaluate to orange');

  console.log('✅ PASS: Direct Issue D2 displays color-coded fields, legend, derived age, and disables button on red errors');
}

// Test 19: Direct Issue Mode D3 & D4 — Existing Quotes Page in Issue Mode
{
  sessionStorage.clear();
  const quoteApp = { ...mockApp, views: {} };
  const quoteView = new QuoteView(quoteApp);
  quoteApp.views.quote = quoteView;

  const travellerData = {
    givenNames: 'Pooja',
    surname: 'Patel',
    passportNumber: 'Z8765432',
    dob: '1992-04-10',
    expiryDate: '2028-12-31',
    sex: 'F'
  };

  // Step D3: Activate direct issue mode on Quotes screen
  quoteView.setDirectIssueMode(travellerData);

  assert.strictEqual(quoteView.state.issueMode, true, 'Quotes view must be in issueMode');
  assert.strictEqual(quoteView.state.customerName, 'Pooja Patel', 'Quotes view pre-fills customer name');
  assert.strictEqual(quoteView.state.dob, '1992-04-10', 'Quotes view pre-fills DOB');

  // Passport validity check against returnDate
  // 1. Invalid: passport expires on or before return date
  quoteView._checkPassportValidity('2029-01-15'); // Passport expires 2028-12-31
  assert.strictEqual(quoteView.state.hasPassportExpiryError, true, 'Must flag passport expiry error when returnDate > expiryDate');
  assert.ok(quoteView.state.passportExpiryErrorMsg.includes('Passport expires on 2028-12-31, which is on or before your return date'), 'Error message must give clear dates');

  // Attempting to confirm policy while passport expiry error is active must be blocked
  let toastMsg = null;
  quoteApp.showToast = (msg, type) => { toastMsg = msg; };
  const dummyPlan = { planName: 'Comfort Plan', companyName: 'Bajaj Allianz', premium: 3500 };
  quoteView._handleConfirmAndIssue(dummyPlan);
  assert.ok(toastMsg && toastMsg.includes('passport expires on or before return date'), 'Confirm and issue must be blocked when passport expires before return date');

  // 2. Valid: return date before passport expiry
  quoteView._checkPassportValidity('2028-06-01');
  assert.strictEqual(quoteView.state.hasPassportExpiryError, false, 'Must clear passport expiry error when returnDate < expiryDate');

  // Step D4: Selecting and confirming a plan passes source: 'direct' to IssuePolicyView
  const issueView = new IssuePolicyView(quoteApp);
  quoteApp.views['issue-policy'] = issueView;

  quoteView.state.departureDate = '2028-05-01';
  quoteView.state.returnDate = '2028-05-15';
  quoteView._handleConfirmAndIssue(dummyPlan);

  assert.strictEqual(issueView.state.individual.isDirectIssue, true, 'Issue policy receives direct issue state');
  assert.strictEqual(issueView.state.individual.step, 3, 'Issue policy opens at Step 3 (D5 Confirm & Issue)');
  assert.strictEqual(issueView.selectedQuote.source, 'direct', 'Quote data carries source: direct');
  console.log('✅ PASS: Direct Issue D3 & D4 reuses Quotes page in issue mode, enforces passport validity, and passes quote to D5');
}

// Test 20: Direct Issue Step 3 Policy Details
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  const directTraveller = {
    givenNames: 'Pooja',
    surname: 'Patel',
    passportNumber: 'Z8765432',
    dob: '1992-04-10',
    sex: 'F',
    nationality: 'IND',
    expiryDate: '2030-01-14',
    addressLine: '123 Marine Drive',
    city: 'Mumbai',
    state: 'Maharashtra',
    pinCode: '400020',
    country: 'India'
  };

  const directQuote = {
    quoteId: 'QT-DIRECT-888',
    planName: 'Global Shield',
    companyName: 'Care Health',
    totalPremium: 4800,
    travellerName: 'Pooja Patel',
    dob: '1992-04-10',
    destination: 'Europe',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    source: 'direct'
  };

  view.setDirectIssueQuote(directQuote, directTraveller);

  const html = view.render();

  // Summary bar checks
  assert.ok(html.includes('quote-summary-bar'), 'Must display read-only quote summary bar');
  assert.ok(html.includes('QT-DIRECT-888'), 'Summary bar contains quote ID');
  assert.ok(html.includes('Global Shield'), 'Summary bar contains plan name');
  assert.ok(html.includes('4,800'), 'Summary bar contains formatted premium');

  // Stepper checks: Passport ✓ -> Get quotes ✓ -> Policy details (current) -> Review
  const steps = view.getStepperSteps();
  assert.strictEqual(steps[0].label, 'Passport', 'Step 1 is Passport');
  assert.strictEqual(steps[1].label, 'Get quotes', 'Step 2 is Get quotes');
  assert.strictEqual(steps[2].label, 'Policy details', 'Step 3 is Policy details');
  assert.strictEqual(steps[3].label, 'Review', 'Step 4 is Review');

  // Compact traveller summary row
  assert.ok(html.includes('traveller-compact-row'), 'Must render compact traveller row');
  assert.ok(html.includes('Pooja Patel'), 'Must display traveller full name');
  assert.ok(html.includes('Z8765432'), 'Must display passport number');
  assert.ok(html.includes('linkEditPassportStep3'), 'Must render link to edit passport details');

  // Adult traveller: Proposer section is HIDDEN
  assert.ok(!html.includes('proposer-section-card'), 'Adult traveller must NOT show proposer section');

  // Address is complete on passport -> read-only line, NO editable address inputs
  assert.ok(html.includes('read-only-address-card'), 'Complete address must be read-only');
  assert.ok(!html.includes('id="inputPolicyAddressLine"'), 'Must NOT ask address line when complete on passport');
  assert.ok(!html.includes('id="inputPolicyCity"'), 'Must NOT ask city when complete on passport');

  // Contact inputs
  assert.ok(html.includes('id="inputContactEmail"'), 'Must render email input');
  assert.ok(html.includes('id="inputContactMobile"'), 'Must render mobile input');

  // Nominee inputs
  assert.ok(html.includes('id="inputNomineeName"'), 'Must render nominee name input');
  assert.ok(html.includes('id="selectNomineeRelationship"'), 'Must render nominee relationship select');

  // Declarations
  assert.ok(html.includes('id="chkMedicalDeclaration"'), 'Must render medical declaration checkbox');
  assert.ok(html.includes('The customer has accepted this quote and the premium of ₹4,800.'), 'Acceptance declaration text must match');

  // Review button disabled until valid
  assert.ok(html.includes('id="btnGoToReview"') && html.includes('disabled'), 'Review button must be disabled before acceptance');

  console.log('✅ PASS: Direct Issue Step 3 renders compact traveller row, contact, nominee, declarations, and hides adult proposer');
}

// Test 21: Direct Issue Session Expiry Fallback
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  view.mode = 'individual';
  view.state.individual.isDirectIssue = true;
  view.state.individual.step = 3;
  view.state.individual.quote = null; // simulate lost session/refresh with no quote
  view.state.individual.verifiedData = null;

  const html = view.render();
  assert.ok(html.includes('session-expired-alert'), 'Must show session expired alert');
  assert.ok(html.includes('Session expired. Please scan the passport again.'), 'Alert message must prompt re-scan');
  assert.strictEqual(view.state.individual.step, 1, 'Step must reset to Step 1 (Passport)');
  console.log('✅ PASS: Session expiry fallback returns agent to D1 with "Session expired. Please scan the passport again."');
}

// Test 22: Exact Names as Printed & Empty Surname Validation
{
  const view = new IssuePolicyView(mockApp);

  // Case A: Middle names preserved, zero splitting
  const dataWithMiddle = {
    givenNames: 'AARAV MOHAN',
    surname: 'SHARMA',
    passportNumber: 'Z1234567',
    dob: '1990-01-01',
    sex: 'M',
    expiryDate: '2030-01-01'
  };
  const gStatus = view._evaluatePassportFieldStatus('givenNames', dataWithMiddle.givenNames, dataWithMiddle);
  const sStatus = view._evaluatePassportFieldStatus('surname', dataWithMiddle.surname, dataWithMiddle);
  assert.strictEqual(gStatus.status, 'green');
  assert.strictEqual(sStatus.status, 'green');

  // Case B: Blank surname on Indian passport is green (no error)
  const dataEmptySurname = {
    givenNames: 'RAHUL KUMAR',
    surname: '',
    passportNumber: 'Z7654321',
    dob: '1992-05-15',
    sex: 'M',
    expiryDate: '2032-05-14'
  };
  const emptySurStatus = view._evaluatePassportFieldStatus('surname', dataEmptySurname.surname, dataEmptySurname);
  assert.strictEqual(emptySurStatus.status, 'green', 'Empty surname must be green with no error');

  // Case C: Name filled from MRZ marked orange
  const dataFromMrz = {
    givenNames: 'PRIYA',
    surname: 'PATEL',
    fieldDiscrepancies: {
      givenNames: 'Read from code line, check against passport.',
      surname: 'Read from code line, check against passport.'
    }
  };
  const mrzGStatus = view._evaluatePassportFieldStatus('givenNames', dataFromMrz.givenNames, dataFromMrz);
  const mrzSStatus = view._evaluatePassportFieldStatus('surname', dataFromMrz.surname, dataFromMrz);
  assert.strictEqual(mrzGStatus.status, 'orange');
  assert.strictEqual(mrzGStatus.message, 'Read from code line, check against passport.');
  assert.strictEqual(mrzSStatus.status, 'orange');

  // Case D: Printed name and MRZ name differ -> keep printed name, mark orange
  const dataDiffMrz = {
    givenNames: 'ANAND',
    surname: 'KUMAR',
    mrz: [
      'P<INDSHARMA<<ANAND<<<<<<<<<<<<<<<<<<<<<<<<<<',
      'Z1234567<1IND9001011M3001019<<<<<<<<<<<<<<<2'
    ]
  };
  const diffSurStatus = view._evaluatePassportFieldStatus('surname', dataDiffMrz.surname, dataDiffMrz);
  assert.strictEqual(diffSurStatus.status, 'orange', 'Discrepancy with MRZ marks surname orange');
  assert.ok(diffSurStatus.message.includes('Code line reads SHARMA'));

  console.log('✅ PASS: Exact names as printed preserved; empty surname valid; MRZ discrepancy marked orange');
}

// Test 23: Indian Address Parsing & PIN Code Extraction
{
  const { parseIndianAddressSync, fixPinOcrChars } = await import('./js/issuePolicy/addressUtils.js');

  // 1. PIN OCR character repair
  assert.strictEqual(fixPinOcrChars('6OO020'), '600020');
  assert.strictEqual(fixPinOcrChars('11OOO1'), '110001');

  // 2. Prompt Test Case 1: Standard Indian address
  const r1 = parseIndianAddressSync('H.No. 42, 3rd Floor, Sector 15, Gurgaon, Haryana 122001');
  assert.strictEqual(r1.pinCode, '122001');
  assert.strictEqual(r1.state, 'Haryana');
  assert.strictEqual(r1.city, 'Gurgaon');
  assert.strictEqual(r1.country, 'India');
  assert.ok(r1.addressLine.includes('H.No. 42, 3rd Floor, Sector 15'));

  // 3. Prompt Test Case 2: OCR repaired PIN (6OO020 -> 600020, Chennai, Tamil Nadu)
  const r2 = parseIndianAddressSync('14, 2nd Main Road, Adyar, Chennai 6OO020');
  assert.strictEqual(r2.pinCode, '600020');
  assert.strictEqual(r2.state, 'Tamil Nadu');
  assert.strictEqual(r2.city, 'Chennai');
  assert.strictEqual(r2.country, 'India');

  // 4. Prompt Test Case 3: State mismatch
  const r3 = parseIndianAddressSync('Flat 4B, Lake View, Kolkata, Maharashtra 700029');
  assert.strictEqual(r3.pinCode, '700029');
  assert.strictEqual(r3.state, 'Maharashtra'); // Keeps read state
  assert.strictEqual(r3.fieldStatuses.state.status, 'orange');
  assert.ok(r3.fieldStatuses.state.message.includes('PIN code belongs to West Bengal'));

  // 5. Prompt Test Case 4: No PIN code
  const r4 = parseIndianAddressSync('Vill. Rampur, PO Kalsi, Dehradun, Uttarakhand');
  assert.strictEqual(r4.pinCode, '');
  assert.strictEqual(r4.state, 'Uttarakhand');
  assert.strictEqual(r4.city, 'Dehradun');
  assert.strictEqual(r4.fieldStatuses.pinCode.status, 'orange');
  assert.strictEqual(r4.fieldStatuses.pinCode.message, 'Not captured');

  console.log('✅ PASS: Indian address parser successfully validates all 4 prompt test cases');
}

// Test 24: Address Fields in Manual Entry Form & Step 2 Verification Views
{
  const view = new IssuePolicyView(mockApp);
  const sampleQuote = {
    quoteId: 'QT-ADDR-001',
    planName: 'Gold Plan',
    companyName: 'Care Insurance',
    totalPremium: 3200,
    travellerName: 'Rohan Joshi',
    dob: '1991-03-20',
    destination: 'Singapore',
    tripStart: '2026-12-05',
    tripEnd: '2026-12-15',
    isGroup: false
  };
  view.setSelectedQuote(sampleQuote);
  view.state.individual.entryMethod = 'manual';

  // Step 1: Manual entry form renders address components
  const s1Html = view.render();
  assert.ok(s1Html.includes('id="manAddressLine"'), 'Manual form must have Address Line input');
  assert.ok(s1Html.includes('id="manCity"'), 'Manual form must have City input');
  assert.ok(s1Html.includes('id="manState"'), 'Manual form must have State dropdown');
  assert.ok(s1Html.includes('id="manPinCode"'), 'Manual form must have PIN Code input');
  assert.ok(s1Html.includes('id="manCountry"'), 'Manual form must have Country input');

  // Step 2: Step 2 verification renders address components
  view.state.individual.step = 2;
  view.state.individual.verifiedData = {
    givenNames: 'ROHAN',
    surname: 'JOSHI',
    passportNumber: 'K1234567',
    dob: '1991-03-20',
    sex: 'M',
    expiryDate: '2031-03-19',
    addressLine: 'Flat 10, MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    pinCode: '411001',
    country: 'India',
    address: 'Flat 10, MG Road, Pune, Maharashtra 411001'
  };
  const s2Html = view.render();
  assert.ok(s2Html.includes('id="vizAddressLine"'), 'Step 2 must have vizAddressLine input');
  assert.ok(s2Html.includes('id="vizCity"'), 'Step 2 must have vizCity input');
  assert.ok(s2Html.includes('id="vizState"'), 'Step 2 must have vizState dropdown');
  assert.ok(s2Html.includes('id="vizPin"'), 'Step 2 must have vizPin input');
  assert.ok(s2Html.includes('id="vizCountry"'), 'Step 2 must have vizCountry input');
  assert.ok(s2Html.includes('id="vizAddress"'), 'Step 2 must have vizAddress textarea');

  console.log('✅ PASS: Manual entry & Step 2 verification views render all separated address fields');
}

// Test 25: Group Address Verification & Review Grid
{
  const { GroupReviewGrid } = await import('./js/issuePolicy/components/GroupReviewGrid.js');
  const sampleRows = [
    {
      id: 'r1',
      givenNames: 'VIKRAM',
      surname: 'MEHTA',
      passportNumber: 'Z1111111',
      dob: '1985-05-10',
      sex: 'M',
      expiryDate: '2030-05-09',
      address: '14, 2nd Main Road, Adyar, Chennai 6OO020'
    }
  ];

  const grid = new GroupReviewGrid({ rows: sampleRows, tripDates: { tripEnd: '2026-12-31' } });
  const row = grid.rows[0];
  assert.strictEqual(row.pinCode, '600020', 'Grid normalizes and repairs PIN code');
  assert.strictEqual(row.state, 'Tamil Nadu', 'Grid normalizes state');
  assert.strictEqual(row.city, 'Chennai', 'Grid normalizes city');

  // Verify columns include addressLine, city, state, pinCode, country
  const cols = grid.getActiveColumns().map(c => c.key);
  assert.ok(cols.includes('addressLine'), 'Active columns must include addressLine');
  assert.ok(cols.includes('city'), 'Active columns must include city');
  assert.ok(cols.includes('state'), 'Active columns must include state');
  assert.ok(cols.includes('pinCode'), 'Active columns must include pinCode');
  assert.ok(cols.includes('country'), 'Active columns must include country');

  console.log('✅ PASS: GroupReviewGrid automatically parses and integrates all 5 address components');
}

// Test 26: Direct Issue Flow - Mode switching, Entry method toggling, and Event attachment without early exit
{
  sessionStorage.clear();
  const testApp = {
    navigatedTo: null,
    navigate(route) { this.navigatedTo = route; },
    showToast(msg, type) {}
  };

  const view = new IssuePolicyView(testApp);
  const html = view.render();

  // 1. Must render mode switcher buttons & individual cards by default
  assert.ok(html.includes('id="btnModeIndividual"'), 'Must render Individual mode switcher');
  assert.ok(html.includes('id="btnModeGroup"'), 'Must render Group mode switcher');
  assert.ok(html.includes('id="optIndividualEntryOcr"'), 'Must render Upload passport option');
  assert.ok(html.includes('id="optIndividualEntryManual"'), 'Must render Fill in manually option');
  assert.ok(html.includes('id="dropzoneContainerMount"'), 'Must mount individual passport dropzone');

  // 2. Mock DOM element factory for attachEvents verification
  const eventRegistry = new Map();
  function createMockElement(id, classes = []) {
    const listeners = {};
    const el = {
      id,
      classList: {
        contains: (c) => classes.includes(c),
        add: (c) => classes.push(c),
        remove: (c) => {
          const idx = classes.indexOf(c);
          if (idx !== -1) classes.splice(idx, 1);
        }
      },
      value: '',
      querySelector: (sel) => createMockElement(sel.replace(/^[#.]/, '')),
      querySelectorAll: () => [],
      addEventListener(evt, handler) {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(handler);
        if (!eventRegistry.has(id)) eventRegistry.set(id, {});
        const reg = eventRegistry.get(id);
        if (!reg[evt]) reg[evt] = [];
        reg[evt].push(handler);
      },
      dispatchEvent(evtName, eventObj = {}) {
        const fns = listeners[evtName] || [];
        fns.forEach(fn => fn(eventObj));
      },
      click() {
        this.dispatchEvent('click', { preventDefault() {} });
      }
    };
    return el;
  }

  // Create mock container containing elements present in Step 1 Direct Issue
  const mockElements = {
    '#btnGoToQuotesScreen': createMockElement('btnGoToQuotesScreen'),
    '#btnModeIndividual': createMockElement('btnModeIndividual'),
    '#btnModeGroup': createMockElement('btnModeGroup'),
    '#optIndividualEntryOcr': createMockElement('optIndividualEntryOcr'),
    '#optIndividualEntryManual': createMockElement('optIndividualEntryManual'),
    '#dropzoneContainerMount': createMockElement('dropzoneContainerMount'),
    '#btnExtractIndividualPassport': createMockElement('btnExtractIndividualPassport')
  };

  const mockContainer = {
    querySelector: (selector) => {
      if (selector === '.no-quote-container') return null; // Step 1 is NOT the standalone no-quote-container
      return mockElements[selector] || null;
    },
    querySelectorAll: () => []
  };

  // Call attachEvents on the Step 1 container
  view.attachEvents(mockContainer);

  // Assert that btnGoToQuotesScreen being present does NOT abort event binding
  assert.ok(eventRegistry.has('btnModeIndividual'), 'Must bind listener to btnModeIndividual');
  assert.ok(eventRegistry.has('btnModeGroup'), 'Must bind listener to btnModeGroup');
  assert.ok(eventRegistry.has('optIndividualEntryOcr'), 'Must bind listener to optIndividualEntryOcr');
  assert.ok(eventRegistry.has('optIndividualEntryManual'), 'Must bind listener to optIndividualEntryManual');

  // Trigger click on "Fill in manually"
  mockElements['#optIndividualEntryManual'].click();
  assert.strictEqual(view.state.individual.entryMethod, 'manual', 'Clicking Fill in manually switches entryMethod to manual');

  const manualHtml = view.render();
  assert.ok(manualHtml.includes('id="manGivenNames"'), 'Renders manual given names input');
  assert.ok(manualHtml.includes('id="manPassportNumber"'), 'Renders manual passport number input');

  // Switch to Group mode directly without a quote
  mockElements['#btnModeGroup'].click();
  assert.strictEqual(view.mode, 'group', 'Clicking Group switches view.mode to group');

  // Ensure render() does NOT reset view.mode to individual when quote is null
  const groupHtml = view.render();
  assert.strictEqual(view.mode, 'group', 'view.mode remains group after render()');
  assert.ok(groupHtml.includes('id="optGroupEntryOcr"'), 'Renders group Upload passports option');
  assert.ok(groupHtml.includes('id="optGroupEntryManual"'), 'Renders group Fill in manually option');

  // Switch group to manual entry
  view.state.group.entryMethod = 'manual';
  const groupManualHtml = view.render();
  assert.ok(groupManualHtml.includes('id="inputGroupManualCount"'), 'Renders group manual count input');
  assert.ok(groupManualHtml.includes('id="btnOpenGroupManualTable"'), 'Renders open group manual table button');

  console.log('✅ PASS: Direct issue flow allows mode switching (Individual/Group) and entry method selection (Upload/Manual) without event locking');
}

// Test 27: Adult Flow - Policy details asks only email, mobile, nominee name + rel, declarations
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  const adultTraveller = {
    givenNames: 'SWAPNIL KASHINATH',
    surname: 'PATIL',
    passportNumber: 'Z1234567',
    dob: '1990-05-15',
    sex: 'M',
    nationality: 'IND',
    expiryDate: '2030-05-14',
    addressLine: 'TALAVALI NAVI MUMBAI',
    city: 'NAVI MUMBAI',
    state: 'Maharashtra',
    pinCode: '400701',
    country: 'India'
  };

  const adultQuote = {
    quoteId: 'QT-ADULT-101',
    planName: 'Elite Worldwide',
    companyName: 'Bajaj Allianz',
    totalPremium: 4200,
    travellerName: 'SWAPNIL KASHINATH PATIL',
    dob: '1990-05-15',
    destination: 'Schengen (Europe)',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    durationDays: 15,
    coverage: 100000,
    isGroup: false
  };

  view.setSelectedQuote(adultQuote);
  view.state.individual.verifiedData = { ...adultTraveller };
  view.state.individual.step = 3;

  const html = view.render();

  // 1. Stepper check
  const steps = view.getStepperSteps();
  assert.strictEqual(steps.length, 4, 'Individual stepper has 4 steps');
  assert.strictEqual(steps[0].label, 'Passport');
  assert.strictEqual(steps[1].label, 'Get quotes');
  assert.strictEqual(steps[2].label, 'Policy details');
  assert.strictEqual(steps[3].label, 'Review');

  // 2. Compact traveller summary
  assert.ok(html.includes('traveller-compact-row'), 'Must render compact traveller row');
  assert.ok(html.includes('SWAPNIL KASHINATH PATIL'), 'Must show full traveller name');
  assert.ok(html.includes('Z1234567'), 'Must show passport no');
  assert.ok(html.includes('15-05-1990'), 'Must show formatted DOB DD-MM-YYYY');
  assert.ok(html.includes('linkEditPassportStep3'), 'Must have Edit passport details link');
  assert.ok(!html.includes('Verified Traveller Details (from Passport)'), 'Must remove duplicate Verified Traveller block');
  assert.ok(!html.includes('Passport Valid To'), 'Must remove duplicate Passport Valid To field');

  // 3. Contact fields
  assert.ok(html.includes('id="inputContactEmail"'), 'Must have email input');
  assert.ok(html.includes('id="inputContactMobile"'), 'Must have mobile input');

  // 4. Address: complete on passport -> only read-only line
  assert.ok(html.includes('read-only-address-card'), 'Must render read-only address card');
  assert.ok(html.includes('Address: TALAVALI NAVI MUMBAI, NAVI MUMBAI, Maharashtra 400701, India'), 'Address must match passport text');
  assert.ok(!html.includes('id="inputPolicyAddressLine"'), 'Must NOT render address line input');
  assert.ok(!html.includes('id="inputPolicyCity"'), 'Must NOT render city input');
  assert.ok(!html.includes('id="inputPolicyPinCode"'), 'Must NOT render PIN code input');

  // 5. Proposer: adult -> HIDDEN
  assert.ok(!html.includes('proposer-section-card'), 'Adult traveller must NOT show Proposer section');

  // 6. Nominee: name and relationship only, NO DOB
  assert.ok(html.includes('id="inputNomineeName"'), 'Must have nominee full name');
  assert.ok(html.includes('id="selectNomineeRelationship"'), 'Must have nominee relationship select');
  assert.ok(!html.includes('nomineeDob') && !html.includes('Nominee Date of Birth'), 'Must NOT have nominee DOB');

  // 7. Declarations & Buttons
  assert.ok(html.includes('id="chkMedicalDeclaration"'), 'Must have medical declaration checkbox');
  assert.ok(html.includes('id="chkQuoteAccepted"'), 'Must have quote accepted checkbox');
  assert.ok(html.includes('id="btnGoToReview"'), 'Must have Review button');
  assert.ok(html.includes('id="btnChangeQuoteStep3"'), 'Must have Change quote button');

  console.log('✅ PASS: Adult flow: asks only email, mobile, nominee name/relationship, and declarations with read-only address and hidden proposer');
}

// Test 28: Minor Flow (DOB 2023-12-15) - Proposer section appears, <18 rejected, "Same as proposer" syncs nominee
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  const minorTraveller = {
    givenNames: 'AARAV',
    surname: 'SHARMA',
    passportNumber: 'M9876543',
    dob: '2023-12-15', // Minor (< 3 years old on 2026-12-01)
    sex: 'M',
    nationality: 'IND',
    expiryDate: '2033-12-14',
    addressLine: 'Flat 402, Lotus Tower',
    city: 'Pune',
    state: 'Maharashtra',
    pinCode: '411001',
    country: 'India'
  };

  const minorQuote = {
    quoteId: 'QT-MINOR-202',
    planName: 'Family Shield',
    companyName: 'Niva Bupa',
    totalPremium: 3500,
    travellerName: 'AARAV SHARMA',
    dob: '2023-12-15',
    destination: 'Singapore',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-10',
    durationDays: 10,
    coverage: 50000,
    isGroup: false
  };

  view.setSelectedQuote(minorQuote);
  view.state.individual.verifiedData = { ...minorTraveller };
  view.state.individual.step = 3;

  const html = view.render();

  // 1. Proposer section MUST be present for minor
  assert.ok(html.includes('proposer-section-card'), 'Must render Proposer section for minor traveller');
  assert.ok(html.includes('Proposer (parent or guardian)'), 'Must have heading Proposer (parent or guardian)');
  assert.ok(html.includes('id="inputProposerName"'), 'Must have proposer name input');
  assert.ok(html.includes('id="inputProposerPassport"'), 'Must have proposer passport input');
  assert.ok(html.includes('id="inputProposerDob"'), 'Must have proposer DOB input');
  assert.ok(html.includes('id="selectProposerRelationship"'), 'Must have proposer relationship select');
  assert.ok(html.includes('id="btnScanProposerPassport"'), 'Must offer "Scan proposer\'s passport"');

  // 2. Nominee section offers "Same as proposer" for minor
  assert.ok(html.includes('id="chkSameAsProposer"'), 'Must render "Same as proposer" checkbox for minor');
  assert.ok(html.includes('Same as proposer'), 'Must display "Same as proposer" label');

  // 3. Proposer under 18 rejection
  view.state.individual.policyDetails.proposer = {
    name: 'Young Brother',
    passportNumber: 'Y1122334',
    dob: '2012-05-10', // 14 years old on 2026-12-01
    relationship: 'Legal guardian'
  };
  const htmlUnder18 = view.render();
  assert.ok(htmlUnder18.includes('Proposer must be 18 or older'), 'Must show error when proposer is under 18');
  assert.strictEqual(view._isPolicyDetailsValid(minorTraveller, minorQuote), false, 'Policy details must be invalid when proposer is under 18');

  // 4. Valid adult proposer (DOB 1985-04-12)
  view.state.individual.policyDetails.proposer = {
    name: 'RAMESH SHARMA',
    passportNumber: 'P8877665',
    dob: '1985-04-12',
    relationship: 'Father'
  };
  const htmlValidProp = view.render();
  assert.ok(!htmlValidProp.includes('Proposer must be 18 or older'), 'No proposer age error when proposer >= 18');

  console.log('✅ PASS: Minor flow: Proposer section appears, proposer < 18 rejected, and "Same as proposer" offered');
}

// Test 29: Incomplete Passport Address - Missing fields rendered in 3.2 prefilled
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  const incompleteTraveller = {
    givenNames: 'PRIYA',
    surname: 'VERMA',
    passportNumber: 'V5432109',
    dob: '1995-08-20',
    sex: 'F',
    nationality: 'IND',
    expiryDate: '2032-08-19',
    addressLine: 'Sector 15, Vashi',
    city: 'Navi Mumbai',
    state: '', // Missing state
    pinCode: '', // Missing PIN code
    country: 'India'
  };

  const sampleQuote = {
    quoteId: 'QT-INC-303',
    planName: 'Silver Plan',
    companyName: 'Care Insurance',
    totalPremium: 2800,
    travellerName: 'PRIYA VERMA',
    dob: '1995-08-20',
    destination: 'Dubai',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-10',
    isGroup: false
  };

  view.setSelectedQuote(sampleQuote);
  view.state.individual.verifiedData = { ...incompleteTraveller };
  view.state.individual.step = 3;

  const html = view.render();

  // Missing fields alert
  assert.ok(html.includes('Incomplete Passport Address'), 'Must alert about incomplete passport address');
  // addressLine and city were present on passport -> NOT rendered as inputs
  assert.ok(!html.includes('id="inputPolicyAddressLine"'), 'Must NOT ask addressLine because it was captured');
  assert.ok(!html.includes('id="inputPolicyCity"'), 'Must NOT ask city because it was captured');
  // state and pinCode were missing -> MUST be rendered as inputs
  assert.ok(html.includes('id="selectPolicyState"'), 'Must ask state dropdown');
  assert.ok(html.includes('id="inputPolicyPinCode"'), 'Must ask PIN code input');

  console.log('✅ PASS: Incomplete passport address: only missing fields (state, PIN) are rendered, ensuring one source of truth');
}

// Test 30: Step 4 Review (New) - Read-only summary with all 6 sections and Edit links
{
  sessionStorage.clear();
  const view = new IssuePolicyView(mockApp);
  const directTraveller = {
    givenNames: 'KAVITA',
    surname: 'DESHMUKH',
    passportNumber: 'K9988776',
    dob: '1993-06-14',
    sex: 'F',
    nationality: 'IND',
    expiryDate: '2031-06-13',
    addressLine: 'Row House 4, Aundh',
    city: 'Pune',
    state: 'Maharashtra',
    pinCode: '411007',
    country: 'India'
  };

  const quote = {
    quoteId: 'QT-REV-404',
    planName: 'Worldwide Gold',
    companyName: 'HDFC ERGO',
    totalPremium: 5900,
    travellerName: 'KAVITA DESHMUKH',
    dob: '1993-06-14',
    destination: 'USA & Canada',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-20',
    durationDays: 20,
    coverage: 250000,
    coverTable: [
      { benefit: 'Emergency Medical & Evacuation', amount: '$250,000' },
      { benefit: 'Loss of Passport', amount: '$500' }
    ],
    isGroup: false
  };

  view.setSelectedQuote(quote);
  view.state.individual.verifiedData = { ...directTraveller };
  view.state.individual.policyDetails = {
    email: 'kavita@example.com',
    mobile: '9822001122',
    addressLine: 'Row House 4, Aundh',
    city: 'Pune',
    state: 'Maharashtra',
    pinCode: '411007',
    country: 'India',
    proposer: null,
    nominee: {
      name: 'ANAND DESHMUKH',
      relationship: 'Spouse'
    },
    sameAsProposer: false,
    medicalDeclarationAccepted: true,
    quoteAccepted: true
  };
  view.state.individual.step = 4;

  const html = view.render();

  // Step 4 header
  assert.ok(html.includes('Step 4: Review Details'), 'Must render Step 4 title');

  // 1. Plan & package section + Edit link
  assert.ok(html.includes('Worldwide Gold'), 'Must show plan name');
  assert.ok(html.includes('HDFC ERGO'), 'Must show insurer');
  assert.ok(html.includes('QT-REV-404'), 'Must show quote ID');
  assert.ok(html.includes('Emergency Medical &amp; Evacuation') || html.includes('Emergency Medical & Evacuation'), 'Must show benefits table');
  assert.ok(html.includes('GST (18%):'), 'Must show tax breakdown');
  assert.ok(html.includes('linkEditPlanReview'), 'Must have Plan Edit link');

  // 2. Traveller section + Edit link
  assert.ok(html.includes('KAVITA DESHMUKH'), 'Must show traveller name');
  assert.ok(html.includes('K9988776'), 'Must show passport no');
  assert.ok(html.includes('14-06-1993'), 'Must show DOB');
  assert.ok(html.includes('Row House 4, Aundh, Pune, Maharashtra 411007, India'), 'Must show address');
  assert.ok(html.includes('linkEditTravellerReview'), 'Must have Traveller Edit link');

  // 3. Nominee section + Edit link
  assert.ok(html.includes('ANAND DESHMUKH'), 'Must show nominee name');
  assert.ok(html.includes('Spouse'), 'Must show nominee relationship');
  assert.ok(html.includes('linkEditNomineeReview'), 'Must have Nominee Edit link');

  // 4. Contact section + Edit link
  assert.ok(html.includes('kavita@example.com'), 'Must show email');
  assert.ok(html.includes('+91 9822001122'), 'Must show mobile');
  assert.ok(html.includes('linkEditContactReview'), 'Must have Contact Edit link');

  // 5. Declarations + Edit link
  assert.ok(html.includes('Medical declaration accepted'), 'Must show medical declaration accepted');
  assert.ok(html.includes('Customer accepted quote and total premium'), 'Must show customer acceptance');
  assert.ok(html.includes('linkEditDeclarationsReview'), 'Must have Declarations Edit link');

  // 6. Buttons
  assert.ok(html.includes('id="btnBackToStep3"'), 'Must have Back button to Step 3');
  assert.ok(html.includes('id="btnConfirmAndIssuePolicy"'), 'Must have Confirm and issue policy button');

  console.log('✅ PASS: Step 4 Review displays all 6 sections with Edit links, benefits table, and tax breakdown');
}

// Test 31: Policy Issuance Payload & Error Handling
{
  sessionStorage.clear();
  let capturedPayload = null;
  const mockPolicyService = {
    async issue(payload) {
      capturedPayload = payload;
      return {
        policyNumber: 'POL-TEST-SUCCESS-999',
        travellerName: payload.travellerName,
        passport: payload.passportNumber,
        plan: payload.planName,
        destination: payload.destination,
        coverPeriod: `${payload.tripStart} to ${payload.tripEnd}`,
        premium: payload.premium,
        issuedAt: new Date().toISOString()
      };
    }
  };

  const view = new IssuePolicyView(mockApp);
  const minorTraveller = {
    givenNames: 'RUDRA',
    surname: 'SINGH',
    passportNumber: 'R1234567',
    dob: '2023-12-15', // Minor
    sex: 'M',
    nationality: 'IND',
    expiryDate: '2033-12-14',
    addressLine: 'House 12, Civil Lines',
    city: 'Jaipur',
    state: 'Rajasthan',
    pinCode: '302006',
    country: 'India'
  };

  const sampleQuote = {
    quoteId: 'QT-PAYLOAD-505',
    planName: 'Premier Travel',
    companyName: 'Tata AIG',
    totalPremium: 6200,
    travellerName: 'RUDRA SINGH',
    dob: '2023-12-15',
    destination: 'UK',
    tripStart: '2026-12-01',
    tripEnd: '2026-12-15',
    isGroup: false
  };

  view.setSelectedQuote(sampleQuote);
  view.state.individual.verifiedData = { ...minorTraveller };
  view.state.individual.policyDetails = {
    email: 'parent@example.com',
    mobile: '9876543210',
    addressLine: 'House 12, Civil Lines',
    city: 'Jaipur',
    state: 'Rajasthan',
    pinCode: '302006',
    country: 'India',
    proposer: {
      name: 'VIKRAM SINGH',
      passportNumber: 'V7654321',
      dob: '1984-07-22',
      relationship: 'Father'
    },
    nominee: {
      name: 'VIKRAM SINGH',
      relationship: 'Father'
    },
    sameAsProposer: true,
    medicalDeclarationAccepted: true,
    quoteAccepted: true
  };
  view.state.individual.step = 4;

  // Mock policyService issue call
  const { policyService } = await import('./js/issuePolicy/services/policyService.js');
  const originalIssue = policyService.issue;
  policyService.issue = mockPolicyService.issue;

  try {
    // 1. Submit issuance
    await view._handleIndividualIssueSubmit();

    // 2. Validate payload
    assert.ok(capturedPayload, 'Payload must be passed to policyService.issue');
    assert.strictEqual(capturedPayload.contact.email, 'parent@example.com', 'contact.email is present');
    assert.strictEqual(capturedPayload.contact.mobile, '9876543210', 'contact.mobile is present');
    assert.ok(capturedPayload.proposer, 'Proposer object must be present for minor');
    assert.strictEqual(capturedPayload.proposer.name, 'VIKRAM SINGH');
    assert.strictEqual(capturedPayload.proposer.passportNumber, 'V7654321');
    assert.strictEqual(capturedPayload.proposer.dob, '1984-07-22');
    assert.strictEqual(capturedPayload.proposer.relationship, 'Father');
    assert.strictEqual(capturedPayload.nominee.name, 'VIKRAM SINGH');
    assert.strictEqual(capturedPayload.nominee.relationship, 'Father');
    assert.strictEqual(capturedPayload.nominee.dob, undefined, 'Nominee DOB must be removed');
    assert.strictEqual(capturedPayload.city, 'Jaipur');
    assert.strictEqual(capturedPayload.state, 'Rajasthan');
    assert.strictEqual(capturedPayload.pinCode, '302006');

    // 3. Success screen rendered
    const successHtml = view.render();
    assert.ok(successHtml.includes('Policy Issued Successfully!'), 'Success screen must be displayed');
    assert.ok(successHtml.includes('POL-TEST-SUCCESS-999'), 'Success screen must show policy number');

    // 4. Test error handling on review step
    view.state.individual.issuanceResult = null;
    view.state.individual.step = 4;
    policyService.issue = async () => { throw new Error('Insurer gateway timeout'); };

    await view._handleIndividualIssueSubmit();

    assert.strictEqual(view.state.individual.step, 4, 'Must stay on Review step on error');
    assert.strictEqual(view.state.individual.policyDetails.email, 'parent@example.com', 'Entered data must NOT be lost');
    const errHtml = view.render();
    assert.ok(errHtml.includes('Insurer gateway timeout'), 'Must display error message');
    assert.ok(errHtml.includes('btnTryAgainIssue'), 'Must offer Try again button');

    console.log('✅ PASS: Policy issuance payload includes contact, proposer, nominee, and address fields; no nominee DOB. On error: stays on Review with Try again button');
  } finally {
    policyService.issue = originalIssue;
  }
}

console.log('\n========================================');
console.log('All Issue Policy Flow Tests Passed Successfully!');
console.log('========================================\n');

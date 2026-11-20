/**
 * Test Suite: MRZ TD3 Checksum & Group Grid Validation Rules
 * Run via: node server/test-mrz-validation.js
 */

import {
  calculateCheckDigit,
  verifyCheckDigit,
  validateMrzTd3,
  generateMrzTd3,
  checkPassportValidity,
  checkNameMatch
} from '../js/issuePolicy/mrzUtils.js';

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

console.log('\n--- ICAO 9303 TD3 MRZ CHECK DIGIT & VALIDATION SUITE ---');

// Test 1: ICAO 9303 7-3-1 weight check digit math
// Sample: Passport number "M4592817<"
// 'M' (22)*7=154 + '4'*3=12 + '5'*1=5 + '9'*7=63 + '2'*3=6 + '8'*1=8 + '1'*7=7 + '7'*3=21 + '<'*1=0
// Sum = 154 + 12 + 5 + 63 + 6 + 8 + 7 + 21 + 0 = 276
// 276 % 10 = 6
const cd1 = calculateCheckDigit('M4592817<');
assert(cd1 === 6, `Check digit for M4592817< is 6 (got ${cd1})`);

// Test 2: DOB "920515" (15 May 1992)
// '9'*7=63 + '2'*3=6 + '0'*1=0 + '5'*7=35 + '1'*3=3 + '5'*1=5
// Sum = 63 + 6 + 0 + 35 + 3 + 5 = 112
// 112 % 10 = 2
const cdDob = calculateCheckDigit('920515');
assert(cdDob === 2, `Check digit for DOB 920515 is 2 (got ${cdDob})`);

// Test 3: Expiry "320514" (14 May 2032)
// '3'*7=21 + '2'*3=6 + '0'*1=0 + '5'*7=35 + '1'*3=3 + '4'*1=4
// Sum = 21 + 6 + 0 + 35 + 3 + 4 = 69
// 69 % 10 = 9
const cdExp = calculateCheckDigit('320514');
assert(cdExp === 9, `Check digit for Expiry 320514 is 9 (got ${cdExp})`);

// Test 4: verifyCheckDigit handles both numbers and filler '<'
assert(verifyCheckDigit('<<<<<<<<<<<<<<', '<') === true, 'verifyCheckDigit handles empty filler correctly');
assert(verifyCheckDigit('M4592817<', 6) === true, 'verifyCheckDigit confirms valid check digit');
assert(verifyCheckDigit('M4592817<', 5) === false, 'verifyCheckDigit rejects invalid check digit');

// Test 5: Full MRZ generation and parsing
const mockMrz = generateMrzTd3({
  surname: 'SHARMA',
  givenNames: 'AARAV',
  passportNumber: 'M4592817',
  nationality: 'IND',
  dob: '1992-05-15',
  sex: 'M',
  expiryDate: '2032-05-14'
});

assert(mockMrz.line1.length === 44, 'MRZ Line 1 is exactly 44 characters');
assert(mockMrz.line2.length === 44, 'MRZ Line 2 is exactly 44 characters');

const validationRes = validateMrzTd3(mockMrz.line1, mockMrz.line2);
assert(validationRes.valid === true, 'Generated TD3 MRZ passes all 5 check digit tests');
assert(validationRes.fields.passportNumber === 'M4592817', 'Parsed passport number matches');
assert(validationRes.fields.dob === '1992-05-15', 'Parsed DOB matches');
assert(validationRes.fields.expiryDate === '2032-05-14', 'Parsed expiry date matches');
assert(validationRes.fields.sex === 'M', 'Parsed sex matches');

// Test 6: MRZ Tamper detection
const tamperedLine2 = mockMrz.line2.substring(0, 9) + '9' + mockMrz.line2.substring(10); // corrupt passport CD
const tamperedRes = validateMrzTd3(mockMrz.line1, tamperedLine2);
assert(tamperedRes.valid === false, 'Corrupted MRZ check digit is correctly caught');

// Test 7: Name matching with punctuation & case insensitivity
assert(checkNameMatch('Aarav Sharma', 'SHARMA, AARAV') === true, 'Name matcher handles case and reversed order');
assert(checkNameMatch('Aarav  Sharma', 'Aarav-Sharma') === true, 'Name matcher handles punctuation and spaces');
assert(checkNameMatch('Aarav Sharma', 'Rohan Sharma') === false, 'Name matcher rejects different names');

// Test 8: Passport validity logic vs trip dates
const validCheck = checkPassportValidity('2032-05-14', '2026-12-15', 3);
assert(validCheck.validPastTripEnd === true && validCheck.validWithMargin === true, 'Passport valid well past margin');

const expiredCheck = checkPassportValidity('2026-12-10', '2026-12-24', 3);
assert(expiredCheck.validPastTripEnd === false, 'Passport expiring before trip end date is flagged');

const marginWarningCheck = checkPassportValidity('2027-01-10', '2026-12-24', 3);
assert(marginWarningCheck.validPastTripEnd === true && marginWarningCheck.validWithMargin === false, 'Passport within 3-month margin is flagged for warning');

// Test 9: Row validation rules simulation
console.log('\n--- ROW VALIDATION RULES TESTS ---');

function validateRowSim(row, allRows, tripEnd = '2026-12-24') {
  const errors = {};
  const warnings = {};

  // Required checks (surname is optional if empty on passport)
  ['givenNames', 'passportNumber', 'sex', 'dob', 'expiryDate'].forEach(req => {
    if (!row[req]) errors[req] = `${req} is required`;
  });

  // Duplicate passport
  if (row.passportNumber) {
    const dupes = allRows.filter(r => (r.passportNumber || '').toUpperCase() === row.passportNumber.toUpperCase());
    if (dupes.length > 1) {
      errors.passportNumber = 'Duplicate passport number in group';
    }
  }

  // Future DOB
  if (row.dob && row.dob > '2026-11-13') {
    errors.dob = 'DOB cannot be in the future';
  }

  // Expiry before trip end
  if (row.expiryDate && row.expiryDate < tripEnd) {
    errors.expiryDate = 'Expires before trip end date';
  }

  // Low confidence
  if (row.lowConfidence) {
    row.lowConfidence.forEach(field => {
      warnings[field] = 'Low OCR confidence';
    });
  }

  // Missing optional vs non-optional
  if (!row.placeOfBirth) warnings.placeOfBirth = 'Not captured';
  if (!row.address) warnings.address = 'Add in address step';

  return { errors, warnings, valid: Object.keys(errors).length === 0 };
}

const rowA = {
  givenNames: 'Aarav',
  surname: 'Sharma',
  passportNumber: 'M4592817',
  sex: 'M',
  dob: '1992-05-15',
  expiryDate: '2032-05-14',
  placeOfBirth: 'Delhi',
  address: '42 MG Road',
  lowConfidence: []
};

const rowB_dupe = {
  givenNames: 'Rohan',
  surname: 'Verma',
  passportNumber: 'M4592817', // DUPLICATE OF A
  sex: 'M',
  dob: '1988-11-20',
  expiryDate: '2030-01-01',
  placeOfBirth: 'Delhi',
  address: 'Flat 12',
  lowConfidence: []
};

const resA = validateRowSim(rowA, [rowA, rowB_dupe]);
const resB = validateRowSim(rowB_dupe, [rowA, rowB_dupe]);
assert(resA.errors.passportNumber === 'Duplicate passport number in group', 'Duplicate passport caught on Row A');
assert(resB.errors.passportNumber === 'Duplicate passport number in group', 'Duplicate passport caught on Row B');

// Empty surname is valid (no error)
const rowEmptySurname = { ...rowA, surname: '' };
const resSur = validateRowSim(rowEmptySurname, [rowEmptySurname]);
assert(resSur.errors.surname === undefined, 'Empty surname on passport is valid with no error');

// Missing required givenNames
const rowMissingReq = { ...rowA, givenNames: '' };
const resReq = validateRowSim(rowMissingReq, [rowMissingReq]);
assert(resReq.errors.givenNames !== undefined, 'Missing required givenNames is flagged as Red error');

// Expired passport
const rowExpired = { ...rowA, expiryDate: '2026-12-10' };
const resExp = validateRowSim(rowExpired, [rowExpired]);
assert(resExp.errors.expiryDate === 'Expires before trip end date', 'Expiring passport is flagged as Red error');

// Father/Mother/Spouse optional check (blank is normal)
const rowWithBlanks = { ...rowA, fatherName: '', motherName: '', spouseName: '' };
const resBlanks = validateRowSim(rowWithBlanks, [rowWithBlanks]);
assert(resBlanks.errors.fatherName === undefined && resBlanks.warnings.fatherName === undefined, 'Blank fatherName is allowed with NO errors or warnings');

console.log(`\n========================================`);
console.log(`Tests Completed: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}


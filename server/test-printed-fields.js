/**
 * Test Suite: Printed Fields Reader Verification
 * Tests all 10 required prompt test cases.
 * Run via: node server/test-printed-fields.js
 */

const {
  extractFieldsFromLines,
  compareAndPickField,
  resolveNames,
  parsePrintedPassportPage
} = require('./services/ocr/printedFieldsReader');

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

console.log('\n--- 10 PROMPT TEST CASES FOR PRINTED FIELDS ---');

// Case 1: Standard Indian passport
// Printed: Surname = PATIL, Given = SWAPNIL KASHINATH
// MRZ: P<INDPATIL<<SWAPNIL<KASHINATH<<<<<<<<<<<<<<<<<
// Result: Surname = PATIL (green), Given name = SWAPNIL KASHINATH (green)
const res1 = resolveNames({
  rawSurname: 'PATIL',
  rawGiven: 'SWAPNIL KASHINATH',
  mrzLine1: 'P<INDPATIL<<SWAPNIL<KASHINATH<<<<<<<<<<<<<<<<<'
});
assert(res1.surname === 'PATIL', 'Case 1: Surname is PATIL');
assert(res1.surnameStatus === 'green', 'Case 1: Surname is green');
assert(res1.givenNames === 'SWAPNIL KASHINATH', 'Case 1: Given name is SWAPNIL KASHINATH');
assert(res1.givenStatus === 'green', 'Case 1: Given name is green');

// Case 2: Truncated API response
// API returns name = "SWAPNIL PATIL", raw text has "SWAPNIL KASHINATH" under Given Name(s).
// Result: Surname = PATIL (green), Given name = SWAPNIL KASHINATH (green). API's "name" field ignored.
const rawLines2 = [
  'उपनाम / Surname',
  'PATIL',
  'दिया गया नाम / Given Name(s)',
  'SWAPNIL KASHINATH',
  'P<INDPATIL<<SWAPNIL<KASHINATH<<<<<<<<<<<<<<<<<'
];
const apiFields2 = {
  name: 'SWAPNIL PATIL',
  id_name: 'SWAPNIL PATIL'
};
const res2 = parsePrintedPassportPage(rawLines2, apiFields2);
assert(res2.fields.surname === 'PATIL', 'Case 2: Surname is PATIL');
assert(!res2.lowConfidence.includes('surname'), 'Case 2: Surname is green');
assert(res2.fields.givenNames === 'SWAPNIL KASHINATH', 'Case 2: Given name is SWAPNIL KASHINATH (API name ignored)');
assert(!res2.lowConfidence.includes('givenNames'), 'Case 2: Given name is green');

// Case 3: Missing printed surname
// Printed surname unreadable, Given = SWAPNIL KASHINATH, MRZ has PATIL.
// Result: Surname = PATIL (orange, "Read from code line"), Given name = SWAPNIL KASHINATH (green).
const res3 = resolveNames({
  rawSurname: null,
  rawGiven: 'SWAPNIL KASHINATH',
  mrzLine1: 'P<INDPATIL<<SWAPNIL<KASHINATH<<<<<<<<<<<<<<<<<'
});
assert(res3.surname === 'PATIL', 'Case 3: Surname filled from MRZ as PATIL');
assert(res3.surnameStatus === 'orange', 'Case 3: Surname is orange');
assert(res3.surnameReason.includes('Read from code line'), 'Case 3: Surname reason is Read from code line');
assert(res3.givenNames === 'SWAPNIL KASHINATH', 'Case 3: Given name is SWAPNIL KASHINATH');
assert(res3.givenStatus === 'green', 'Case 3: Given name is green');

// Case 4: Three given names
// Printed: Surname = PATEL, Given = RAVI KUMAR BHAI
// Result: Given name = RAVI KUMAR BHAI (all three words kept, green).
const res4 = resolveNames({
  rawSurname: 'PATEL',
  rawGiven: 'RAVI KUMAR BHAI',
  mrzLine1: 'P<INDPATEL<<RAVI<KUMAR<BHAI<<<<<<<<<<<<<<<<<<'
});
assert(res4.givenNames === 'RAVI KUMAR BHAI', 'Case 4: Given name is RAVI KUMAR BHAI (all three words kept)');
assert(res4.givenStatus === 'green', 'Case 4: Given name is green');

// Case 5: No surname on passport
// Printed: Given = PRIYANKA, Surname = (blank)
// MRZ: P<IND<<PRIYANKA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
// Result: Surname = empty (green), Given name = PRIYANKA (green).
const res5 = resolveNames({
  rawSurname: '',
  rawGiven: 'PRIYANKA',
  mrzLine1: 'P<IND<<PRIYANKA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<'
});
assert(res5.surname === '', 'Case 5: Surname is empty');
assert(res5.surnameStatus === 'green', 'Case 5: Surname is green');
assert(res5.givenNames === 'PRIYANKA', 'Case 5: Given name is PRIYANKA');
assert(res5.givenStatus === 'green', 'Case 5: Given name is green');

// Case 6: Place of birth with comma and space
// Printed: TALAVALI NAVI MUMBAI,MAHARASHTRA
// Result: Place of birth = TALAVALI NAVI MUMBAI,MAHARASHTRA (green, not cut to TALAVALI).
const rawLines6 = [
  'जन्म स्थान / Place of Birth',
  'TALAVALI NAVI MUMBAI,MAHARASHTRA',
  'जारी करने का स्थान / Place of Issue',
  'NAVI MUMBAI'
];
const res6 = parsePrintedPassportPage(rawLines6);
assert(res6.fields.placeOfBirth === 'TALAVALI NAVI MUMBAI,MAHARASHTRA', 'Case 6: Place of birth is TALAVALI NAVI MUMBAI,MAHARASHTRA');
assert(!res6.lowConfidence.includes('placeOfBirth'), 'Case 6: Place of birth is green');

// Case 7: Place of issue with space
// Printed: NAVI MUMBAI
// Result: Place of issue = NAVI MUMBAI (green, not cut to NAVI).
assert(res6.fields.placeOfIssue === 'NAVI MUMBAI', 'Case 7: Place of issue is NAVI MUMBAI (not cut to NAVI)');
assert(!res6.lowConfidence.includes('placeOfIssue'), 'Case 7: Place of issue is green');

// Case 8: Place of birth wrapped across two lines
// Printed:
//   TALAVALI NAVI MUMBAI,
//   MAHARASHTRA
// Result: Place of birth = TALAVALI NAVI MUMBAI, MAHARASHTRA (green).
const rawLines8 = [
  'जन्म स्थान / Place of Birth',
  'TALAVALI NAVI MUMBAI,',
  'MAHARASHTRA',
  'जारी करने का स्थान / Place of Issue',
  'NAVI MUMBAI'
];
const res8 = parsePrintedPassportPage(rawLines8);
assert(res8.fields.placeOfBirth === 'TALAVALI NAVI MUMBAI, MAHARASHTRA', 'Case 8: Wrapped Place of birth is TALAVALI NAVI MUMBAI, MAHARASHTRA');
assert(!res8.lowConfidence.includes('placeOfBirth'), 'Case 8: Wrapped Place of birth is green');

// Case 9: Father's name with three words
// Printed: KASHINATH DATTATRAY PATIL
// Result: Father's name = KASHINATH DATTATRAY PATIL (all words kept, not just first word).
const rawLines9 = [
  'पिता / कानूनी अभिभावक का नाम / Name of Father / Legal Guardian',
  'KASHINATH DATTATRAY PATIL',
  'माता का नाम / Name of Mother',
  'SANGITA PATIL'
];
const res9 = parsePrintedPassportPage(rawLines9);
assert(res9.fields.fatherName === 'KASHINATH DATTATRAY PATIL', 'Case 9: Father name has all three words');
assert(!res9.lowConfidence.includes('fatherName'), 'Case 9: Father name is green');

// Case 10: API returns truncated place of birth ("TALAVALI"), raw line has "TALAVALI NAVI MUMBAI,MAHARASHTRA":
// Result: Place of birth = TALAVALI NAVI MUMBAI,MAHARASHTRA (orange, "Value was cut short, check against passport").
const rawLines10 = [
  'जन्म स्थान / Place of Birth',
  'TALAVALI NAVI MUMBAI,MAHARASHTRA'
];
const apiFields10 = {
  id_place_of_birth: 'TALAVALI'
};
const res10 = parsePrintedPassportPage(rawLines10, apiFields10);
assert(res10.fields.placeOfBirth === 'TALAVALI NAVI MUMBAI,MAHARASHTRA', 'Case 10: Place of birth uses longer raw line');
assert(res10.lowConfidence.includes('placeOfBirth'), 'Case 10: Place of birth is marked orange');
assert(res10.fieldReasons.placeOfBirth.includes('cut short'), 'Case 10: Reason is Value was cut short');

console.log(`\n========================================`);
console.log(`Printed Fields Tests: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);

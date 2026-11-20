/**
 * Test Suite: OCR Normalizer & Single OCR API Client
 * Run via: node server/test-ocr-normalizer.js
 */

const {
  normalize,
  mergeSides,
  normalizeDate,
  normalizeSex,
  normalizeUpper,
  normalizeAddress,
  normalizePassportNumber,
  normalizeMrz,
  VALID_FIELD_KEYS
} = require('./services/ocr/normalizer');
const { mapOcrResponse, extractPassport } = require('./services/ocr');

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

console.log('\n--- OCR NORMALIZER UNIT TESTS ---');

// 1. Date normalization across all required formats
assert(normalizeDate('1990-04-14') === '1990-04-14', 'normalizeDate handles YYYY-MM-DD');
assert(normalizeDate('14/04/1990') === '1990-04-14', 'normalizeDate handles DD/MM/YYYY');
assert(normalizeDate('14-04-1990') === '1990-04-14', 'normalizeDate handles DD-MM-YYYY');
assert(normalizeDate('14.04.1990') === '1990-04-14', 'normalizeDate handles DD.MM.YYYY');
assert(normalizeDate('14 APR 1990') === '1990-04-14', 'normalizeDate handles "14 APR 1990"');
assert(normalizeDate('14/APR/1990') === '1990-04-14', 'normalizeDate handles "14/APR/1990"');
assert(normalizeDate('14-APR-1990') === '1990-04-14', 'normalizeDate handles "14-APR-1990"');
assert(normalizeDate('APR 14 1990') === '1990-04-14', 'normalizeDate handles "APR 14 1990"');
assert(normalizeDate('invalid date string') === null, 'normalizeDate returns null for invalid input');
assert(normalizeDate(null) === null, 'normalizeDate returns null for null/undefined');

// 2. Sex normalization
assert(normalizeSex('FEMALE') === 'F', 'normalizeSex maps FEMALE -> F');
assert(normalizeSex('f') === 'F', 'normalizeSex maps f -> F');
assert(normalizeSex('MALE') === 'M', 'normalizeSex maps MALE -> M');
assert(normalizeSex('m') === 'M', 'normalizeSex maps m -> M');
assert(normalizeSex('X') === 'X', 'normalizeSex maps X -> X');
assert(normalizeSex('T') === 'X', 'normalizeSex maps T -> X');
assert(normalizeSex('<') === 'X', 'normalizeSex maps < -> X');
assert(normalizeSex('unknown') === null, 'normalizeSex returns null for unrecognized values');

// 3. String & text cleanup
assert(normalizePassportNumber(' M 459 2817 ') === 'M4592817', 'normalizePassportNumber strips internal spaces');
assert(normalizePassportNumber('null') === null, 'normalizePassportNumber strips literal string "null"');
assert(normalizeUpper('  aarav   kumar  ') === 'AARAV KUMAR', 'normalizeUpper trims and collapses spaces to uppercase');
assert(normalizeUpper('null') === null, 'normalizeUpper converts string "null" to null');
assert(normalizeUpper('undefined') === null, 'normalizeUpper converts string "undefined" to null');
assert(normalizeAddress('  42 MG Road, Flat 3B  ') === '42 MG Road, Flat 3B', 'normalizeAddress preserves original case');
assert(normalizeAddress('null') === null, 'normalizeAddress converts string "null" to null');
assert(normalizeDate('null') === null, 'normalizeDate converts string "null" to null');

// 4. MRZ cleanup & validation
const rawMrzWithChevrons = [
  'P«INDSHARMA««AARAV««««««««««««««««««««««««««',
  'M4592817<6IND9205152M3205149<<<<<<<<<<<<<<<4'
];
const cleanedMrz = normalizeMrz(rawMrzWithChevrons);
assert(cleanedMrz !== null && cleanedMrz.length === 2, 'normalizeMrz accepts array of 2 lines');
assert(cleanedMrz[0].includes('<') && !cleanedMrz[0].includes('«'), 'normalizeMrz converts french chevrons « to <');
assert(normalizeMrz('Short line') === null, 'normalizeMrz rejects short lines');
assert(normalizeMrz(null) === null, 'normalizeMrz returns null for missing MRZ');

// 5. Full normalize contract
const testRaw = {
  givenNames: '  aarav  ',
  surname: ' sharma ',
  passportNumber: 'm459 2817',
  nationality: ' ind ',
  sex: 'male',
  dob: '15/MAY/1992',
  placeOfBirth: 'delhi',
  issueDate: '15-05-2022',
  expiryDate: '14.05.2032',
  mrz: ['P<INDSHARMA<<AARAV<<<<<<<<<<<<<<<<<<<<<<<<<<', 'M4592817<6IND9205152M3205149<<<<<<<<<<<<<<<4'],
  lowConfidence: ['placeOfBirth', 'nonExistentField', 'address'] // address is null, so should be filtered out
};

const normalized = normalize(testRaw);
const expectedKeys = [
  'givenNames', 'surname', 'passportNumber', 'nationality', 'countryCode',
  'sex', 'dob', 'placeOfBirth', 'placeOfIssue', 'issueDate', 'expiryDate',
  'fatherName', 'motherName', 'spouseName', 'address', 'pin', 'fileNumber',
  'issuingCountry', 'mrz', 'lowConfidence'
];
const allKeysPresent = expectedKeys.every(k => k in normalized);
assert(allKeysPresent, 'All normalized schema keys are present in output');

assert(normalized.givenNames === 'AARAV', 'givenNames normalized to uppercase');
assert(normalized.sex === 'M', 'sex normalized to M');
assert(normalized.dob === '1992-05-15', 'dob normalized to YYYY-MM-DD');
assert(normalized.fatherName === null, 'Uncaptured fields strictly evaluate to null (not empty string)');
assert(normalized.address === null, 'Unprovided address is null');
assert(normalized.lowConfidence.includes('placeOfBirth'), 'Valid lowConfidence key with value is retained');
assert(!normalized.lowConfidence.includes('address'), 'lowConfidence key whose value is null is dropped');
assert(!normalized.lowConfidence.includes('nonExistentField'), 'Invalid lowConfidence key is dropped');

// 6. mergeSides logic
console.log('\n--- MERGESIDES TESTS ---');
const frontPage = {
  givenNames: 'AARAV',
  surname: 'SHARMA',
  passportNumber: 'M4592817',
  nationality: 'IND',
  sex: 'M',
  dob: '1992-05-15',
  placeOfBirth: 'DELHI',
  fatherName: null,
  address: null,
  mrz: ['FRONT_LINE1_OF_44_CHARS_SAMPLE_VALID_AAAA', 'FRONT_LINE2_OF_44_CHARS_SAMPLE_VALID_BBBB'],
  lowConfidence: ['placeOfBirth']
};

const backPage = {
  givenNames: 'SHOULD_NOT_OVERWRITE',
  fatherName: 'RAJESH SHARMA',
  motherName: 'SUNITA SHARMA',
  address: '42 MG Road, New Delhi',
  fileNumber: 'DL106789',
  mrz: ['BACK_MRZ_LINE_1_WHICH_SHOULD_BE_IGNORED_AA', 'BACK_MRZ_LINE_2_WHICH_SHOULD_BE_IGNORED_BB'],
  lowConfidence: ['address']
};

const merged = mergeSides(frontPage, backPage);
assert(merged.givenNames === 'AARAV', 'Front page primary field is preserved');
assert(merged.fatherName === 'RAJESH SHARMA', 'Back page populates null fatherName');
assert(merged.motherName === 'SUNITA SHARMA', 'Back page populates null motherName');
assert(merged.address === '42 MG Road, New Delhi', 'Back page populates null address');
assert(merged.mrz[0].startsWith('FRONTLINE1'), 'Front page MRZ wins over back page MRZ');
assert(merged.lowConfidence.includes('placeOfBirth') && merged.lowConfidence.includes('address'), 'lowConfidence keys from both sides are merged');

// 7. mapOcrResponse centralized mapping tests (AZAPI schema)
console.log('\n--- MAP_OCR_RESPONSE UNIT TESTS ---');

const sampleAzapiJson = {
  status: 'Success',
  output: {
    id_name: 'PRIYA VERMA',
    id_number: 'Z9876543',
    id_country_code: 'IND',
    id_nationality: 'INDIAN',
    id_gender: 'F',
    id_dob: '20/11/1995',
    id_doi: '10/01/2020',
    id_doe: '09/01/2030',
    id_address: 'Flat 101, Bandra West, Mumbai 400050',
    id_pin: '400050',
    id_caretaker_name: 'RAMESH VERMA'
  }
};

const mapped = mapOcrResponse(sampleAzapiJson);
assert(mapped.givenNames === 'PRIYA VERMA', 'mapOcrResponse puts full id_name into givenNames without guessing split');
assert(!mapped.surname, 'mapOcrResponse leaves surname empty when OCR returns only one full-name string');
assert(mapped.lowConfidence.includes('givenNames') && mapped.lowConfidence.includes('surname'), 'both givenNames and surname marked orange');
assert(mapped.passportNumber === 'Z9876543', 'mapOcrResponse maps id_number');
assert(mapped.nationality === 'IND', 'mapOcrResponse maps nationality');
assert(mapped.countryCode === 'IND', 'mapOcrResponse maps countryCode');
assert(mapped.sex === 'F', 'mapOcrResponse maps id_gender');
assert(mapped.dob === '20/11/1995', 'mapOcrResponse maps id_dob');
assert(mapped.issueDate === '10/01/2020', 'mapOcrResponse maps id_doi');
assert(mapped.expiryDate === '09/01/2030', 'mapOcrResponse maps id_doe');
assert(mapped.pin === '400050', 'mapOcrResponse maps id_pin');
assert(mapped.fatherName === 'RAMESH VERMA', 'mapOcrResponse maps id_caretaker_name');
assert(Array.isArray(mapped.mrz) && mapped.mrz.length === 2, 'mapOcrResponse synthesizes TD3 MRZ lines when not in upstream response');

const normFinal = normalize(mapped);
assert(normFinal.dob === '1995-11-20', 'normalize converts AZAPI DOB to YYYY-MM-DD');
assert(normFinal.issueDate === '2020-01-10', 'normalize converts AZAPI issueDate to YYYY-MM-DD');
assert(normFinal.expiryDate === '2030-01-09', 'normalize converts AZAPI expiryDate to YYYY-MM-DD');
assert(normFinal.pin === '400050', 'normalize preserves valid 6-digit Indian PIN');

// 8. extractPassport service test (Validation & Error handling)
console.log('\n--- EXTRACT_PASSPORT SERVICE TESTS ---');
async function testService() {
  // Test NO_FILE error handling
  let caughtNoFile = false;
  try {
    await extractPassport({});
  } catch (err) {
    caughtNoFile = err.code === 'NO_FILE';
  }
  assert(caughtNoFile, 'extractPassport raises NO_FILE when front file buffer is missing');

  console.log(`\n========================================`);
  console.log(`Normalizer & OCR Client Tests: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

testService();

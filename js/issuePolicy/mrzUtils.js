/**
 * ICAO 9303 TD3 Machine Readable Zone (MRZ) Parser & Check Digit Validator
 * Standard: ICAO 9303 Part 4 (Passports, 2 lines of 44 characters)
 *
 * Weighted check digit algorithm: weights [7, 3, 1] repeating, modulo 10.
 * Character mapping: 0-9 = 0-9, A-Z = 10-35, '<' = 0.
 */

const WEIGHTS = [7, 3, 1];

/**
 * Maps a single MRZ character to its numeric value.
 * @param {string} char
 * @returns {number}
 */
export function getCharValue(char) {
  if (!char || char === '<') return 0;
  const upper = char.toUpperCase();
  const code = upper.charCodeAt(0);
  if (code >= 48 && code <= 57) {
    return code - 48; // '0'-'9' -> 0-9
  }
  if (code >= 65 && code <= 90) {
    return code - 65 + 10; // 'A'-'Z' -> 10-35
  }
  return 0;
}

/**
 * Calculates the ICAO 9303 check digit for a string using 7-3-1 weights.
 * @param {string} input
 * @returns {number} 0-9
 */
export function calculateCheckDigit(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const val = getCharValue(input[i]);
    const weight = WEIGHTS[i % 3];
    sum += val * weight;
  }
  return sum % 10;
}

/**
 * Validates an ICAO 9303 check digit.
 * @param {string} input Data string
 * @param {string|number} expectedDigit Check digit to verify against
 * @returns {boolean}
 */
export function verifyCheckDigit(input, expectedDigit) {
  const calc = calculateCheckDigit(input);
  const expStr = String(expectedDigit);
  // If expected is filler '<', check if calculated is 0
  if (expStr === '<') return calc === 0;
  return calc === parseInt(expStr, 10);
}

/**
 * Converts YYMMDD MRZ date to YYYY-MM-DD.
 * @param {string} yymmdd 6-digit string
 * @param {'dob'|'expiry'} type
 * @returns {string|null} YYYY-MM-DD or null if invalid
 */
export function parseMrzDate(yymmdd, type = 'dob') {
  if (!yymmdd || yymmdd.length !== 6 || !/^\d{6}$/.test(yymmdd)) {
    return null;
  }
  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);

  const currentYear = new Date().getFullYear();
  const currentYY = currentYear % 100;

  let yyyy;
  if (type === 'expiry') {
    // Passports expire in the future or very recent past:
    // If yy >= currentYY - 10, assume 20YY, else 21YY
    yyyy = yy >= (currentYY - 10) ? 2000 + yy : 1900 + yy;
  } else {
    // DOB: if 20YY would be in the future, it must be 19YY
    yyyy = (2000 + yy > currentYear) ? 1900 + yy : 2000 + yy;
  }

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts YYYY-MM-DD date to YYMMDD for MRZ generation/verification.
 * @param {string} yyyymmdd
 * @returns {string}
 */
export function toMrzDate(yyyymmdd) {
  if (!yyyymmdd || typeof yyyymmdd !== 'string') return '<<<<<<';
  const clean = yyyymmdd.replace(/\D/g, '');
  if (clean.length === 8) {
    return clean.substring(2); // take YYMMDD
  }
  return clean.padEnd(6, '<').substring(0, 6);
}

/**
 * Generates an ICAO 9303 TD3 compliant Line 2 and Line 1 for mock data or testing.
 * @param {Object} data
 * @returns {{ line1: string, line2: string }}
 */
export function generateMrzTd3({
  issuingCountry = 'IND',
  surname = '',
  givenNames = '',
  passportNumber = '',
  nationality = 'IND',
  dob = '',
  sex = 'M',
  expiryDate = '',
  optionalData = ''
}) {
  // Line 1: P<IND<SURNAME<<GIVEN<NAMES<<<<... (44 chars)
  const cleanSurname = surname.toUpperCase().replace(/[^A-Z]/g, '<');
  const cleanGiven = givenNames.toUpperCase().replace(/[^A-Z]/g, '<');
  let nameField = `${cleanSurname}<<${cleanGiven}`;
  nameField = nameField.replace(/<+/g, '<').replace(/<<+/g, '<<');
  const line1Base = `P<${issuingCountry.toUpperCase().padEnd(3, '<')}${nameField}`;
  const line1 = line1Base.padEnd(44, '<').substring(0, 44);

  // Line 2:
  // 0-8: Passport number (9 chars)
  const pNum = passportNumber.toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(9, '<').substring(0, 9);
  const pNumCd = calculateCheckDigit(pNum);

  // 10-12: Nationality
  const nat = nationality.toUpperCase().padEnd(3, '<').substring(0, 3);

  // 13-18: DOB (YYMMDD)
  const dobStr = toMrzDate(dob);
  const dobCd = calculateCheckDigit(dobStr);

  // 20: Sex
  const sexChar = ['M', 'F', 'X'].includes(sex?.toUpperCase()) ? sex.toUpperCase() : '<';

  // 21-26: Expiry (YYMMDD)
  const expStr = toMrzDate(expiryDate);
  const expCd = calculateCheckDigit(expStr);

  // 28-41: Optional data (14 chars)
  const opt = optionalData.toUpperCase().replace(/[^A-Z0-9]/g, '<').padEnd(14, '<').substring(0, 14);
  const optCd = opt.replace(/</g, '') ? calculateCheckDigit(opt) : '<';

  // 43: Composite check digit
  // Calculated over: chars 0-9, chars 13-19, chars 21-42
  const compositeInput = `${pNum}${pNumCd}${dobStr}${dobCd}${expStr}${expCd}${opt}${optCd}`;
  const compositeCd = calculateCheckDigit(compositeInput);

  const line2 = `${pNum}${pNumCd}${nat}${dobStr}${dobCd}${sexChar}${expStr}${expCd}${opt}${optCd}${compositeCd}`;

  return { line1, line2 };
}

/**
 * Validates an ICAO 9303 TD3 MRZ (2 lines of 44 chars) and extracts fields.
 * Performs all 7-3-1 check digit validations:
 * - Passport number CD
 * - DOB CD
 * - Expiry CD
 * - Optional data CD
 * - Composite CD
 *
 * @param {string} line1
 * @param {string} line2
 * @returns {{
 *   valid: boolean,
 *   errors: string[],
 *   fields: Object
 * }}
 */
export function validateMrzTd3(line1, line2) {
  const errors = [];
  const fields = {
    documentCode: '',
    issuingCountry: '',
    surname: '',
    givenNames: '',
    passportNumber: '',
    nationality: '',
    dob: null,
    sex: '',
    expiryDate: null,
    optionalData: '',
    checkDigits: {
      passportNumber: { expected: null, calculated: null, valid: false },
      dob: { expected: null, calculated: null, valid: false },
      expiryDate: { expected: null, calculated: null, valid: false },
      optionalData: { expected: null, calculated: null, valid: false },
      composite: { expected: null, calculated: null, valid: false }
    }
  };

  const l1 = (line1 || '').trim().toUpperCase();
  const l2 = (line2 || '').trim().toUpperCase();

  if (l1.length !== 44) {
    errors.push(`MRZ Line 1 must be exactly 44 characters (received ${l1.length})`);
  }
  if (l2.length !== 44) {
    errors.push(`MRZ Line 2 must be exactly 44 characters (received ${l2.length})`);
  }

  if (errors.length > 0) {
    return { valid: false, errors, fields };
  }

  // Parse Line 1
  fields.documentCode = l1.substring(0, 2).replace(/</g, '');
  fields.issuingCountry = l1.substring(2, 5).replace(/</g, '');

  const namesPart = l1.substring(5);
  const nameParts = namesPart.split('<<');
  fields.surname = (nameParts[0] || '').replace(/</g, ' ').trim();
  fields.givenNames = (nameParts.slice(1).join(' ') || '').replace(/</g, ' ').trim();

  // Parse Line 2
  const pNumStr = l2.substring(0, 9);
  const pNumCd = l2.substring(9, 10);
  fields.passportNumber = pNumStr.replace(/</g, '');

  fields.nationality = l2.substring(10, 13).replace(/</g, '');

  const dobStr = l2.substring(13, 19);
  const dobCd = l2.substring(19, 20);
  fields.dob = parseMrzDate(dobStr, 'dob');

  const sexChar = l2.substring(20, 21);
  fields.sex = sexChar === '<' ? 'X' : sexChar;

  const expStr = l2.substring(21, 27);
  const expCd = l2.substring(27, 28);
  fields.expiryDate = parseMrzDate(expStr, 'expiry');

  const optStr = l2.substring(28, 42);
  const optCd = l2.substring(42, 43);
  fields.optionalData = optStr.replace(/</g, '');

  const compositeCd = l2.substring(43, 44);

  // Check 1: Passport Number Check Digit
  const calcPNumCd = calculateCheckDigit(pNumStr);
  const validPNum = verifyCheckDigit(pNumStr, pNumCd);
  fields.checkDigits.passportNumber = {
    expected: pNumCd,
    calculated: String(calcPNumCd),
    valid: validPNum
  };
  if (!validPNum) {
    errors.push(`Passport number check digit failed (MRZ has '${pNumCd}', calculated '${calcPNumCd}')`);
  }

  // Check 2: DOB Check Digit
  const calcDobCd = calculateCheckDigit(dobStr);
  const validDob = verifyCheckDigit(dobStr, dobCd);
  fields.checkDigits.dob = {
    expected: dobCd,
    calculated: String(calcDobCd),
    valid: validDob
  };
  if (!validDob) {
    errors.push(`DOB check digit failed (MRZ has '${dobCd}', calculated '${calcDobCd}')`);
  }

  // Check 3: Expiry Check Digit
  const calcExpCd = calculateCheckDigit(expStr);
  const validExp = verifyCheckDigit(expStr, expCd);
  fields.checkDigits.expiryDate = {
    expected: expCd,
    calculated: String(calcExpCd),
    valid: validExp
  };
  if (!validExp) {
    errors.push(`Expiry date check digit failed (MRZ has '${expCd}', calculated '${calcExpCd}')`);
  }

  // Check 4: Optional Data Check Digit (if optional data is non-empty)
  let validOpt = true;
  const calcOptCd = calculateCheckDigit(optStr);
  if (optStr.replace(/</g, '').length > 0 || optCd !== '<') {
    validOpt = verifyCheckDigit(optStr, optCd);
    if (!validOpt) {
      errors.push(`Optional data check digit failed (MRZ has '${optCd}', calculated '${calcOptCd}')`);
    }
  }
  fields.checkDigits.optionalData = {
    expected: optCd,
    calculated: String(calcOptCd),
    valid: validOpt
  };

  // Check 5: Composite Check Digit
  // Composite input = chars 0-9 (10), chars 13-19 (7), chars 21-42 (22)
  const compositeInput = `${l2.substring(0, 10)}${l2.substring(13, 20)}${l2.substring(21, 43)}`;
  const calcCompositeCd = calculateCheckDigit(compositeInput);
  const validComposite = verifyCheckDigit(compositeInput, compositeCd);
  fields.checkDigits.composite = {
    expected: compositeCd,
    calculated: String(calcCompositeCd),
    valid: validComposite
  };
  if (!validComposite) {
    errors.push(`Composite check digit failed (MRZ has '${compositeCd}', calculated '${calcCompositeCd}')`);
  }

  return {
    valid: errors.length === 0,
    errors,
    fields
  };
}

/**
 * Normalizes a name string for comparison (strips punctuation, extra spaces, uppercase).
 * @param {string} str
 * @returns {string}
 */
export function normalizeName(str) {
  if (!str) return '';
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if two names match (case, punctuation, and order tolerant).
 * @param {string} name1
 * @param {string} name2
 * @returns {boolean}
 */
export function checkNameMatch(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;

  // Check if tokens match regardless of order (e.g. "John Doe" vs "Doe John")
  const tokens1 = n1.split(' ').filter(Boolean).sort().join(' ');
  const tokens2 = n2.split(' ').filter(Boolean).sort().join(' ');
  return tokens1 === tokens2;
}

/**
 * Checks if a passport is valid past the trip end date by safetyMarginMonths.
 * @param {string} expiryDateStr YYYY-MM-DD
 * @param {string} tripEndDateStr YYYY-MM-DD
 * @param {number} safetyMarginMonths default 3
 * @returns {{
 *   validPastTripEnd: boolean,
 *   validWithMargin: boolean,
 *   monthsDiff: number,
 *   message: string
 * }}
 */
export function checkPassportValidity(expiryDateStr, tripEndDateStr, safetyMarginMonths = 3) {
  if (!expiryDateStr || !tripEndDateStr) {
    return {
      validPastTripEnd: false,
      validWithMargin: false,
      monthsDiff: 0,
      message: 'Expiry or trip date missing'
    };
  }

  const expiry = new Date(expiryDateStr + 'T00:00:00');
  const tripEnd = new Date(tripEndDateStr + 'T00:00:00');

  if (isNaN(expiry.getTime()) || isNaN(tripEnd.getTime())) {
    return {
      validPastTripEnd: false,
      validWithMargin: false,
      monthsDiff: 0,
      message: 'Invalid date format'
    };
  }

  const validPastTripEnd = expiry.getTime() >= tripEnd.getTime();

  // Calculate margin date: tripEnd + safetyMarginMonths
  const marginDate = new Date(tripEnd);
  marginDate.setMonth(marginDate.getMonth() + safetyMarginMonths);

  const validWithMargin = expiry.getTime() >= marginDate.getTime();

  // Approximate difference in months
  const monthsDiff = (expiry.getFullYear() - tripEnd.getFullYear()) * 12 +
    (expiry.getMonth() - tripEnd.getMonth()) +
    (expiry.getDate() - tripEnd.getDate()) / 30;

  let message = 'Passport is valid past trip end date with safety margin.';
  if (!validPastTripEnd) {
    message = 'Passport expires before trip end date!';
  } else if (!validWithMargin) {
    message = `Passport expires within ${safetyMarginMonths} months of return date.`;
  }

  return {
    validPastTripEnd,
    validWithMargin,
    monthsDiff: Math.round(monthsDiff * 10) / 10,
    message
  };
}


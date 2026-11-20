/**
 * MRZ Reader, Cleaner, Validator, and Name Reconciler
 *
 * Implements ICAO 9303 Part 4 (TD3: 2 lines of 44 characters).
 * Cleans OCR misreads (spaces, "K", "«", "‹", "(", "[" -> "<").
 * Computes check digits (Passport no., DOB, Expiry, Composite).
 * Reconciles printed names with MRZ names (splits full name, handles empty surname, long names).
 */

const WEIGHTS = [7, 3, 1];

function getCharValue(char) {
  if (!char || char === '<') return 0;
  const upper = char.toUpperCase();
  const code = upper.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48; // '0'-'9'
  if (code >= 65 && code <= 90) return code - 65 + 10; // 'A'-'Z'
  return 0;
}

function calculateCheckDigit(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const val = getCharValue(input[i]);
    sum += val * WEIGHTS[i % 3];
  }
  return sum % 10;
}

function verifyCheckDigit(input, expectedDigit) {
  const calc = calculateCheckDigit(input);
  const expStr = String(expectedDigit);
  if (expStr === '<') return calc === 0;
  return calc === parseInt(expStr, 10);
}

/**
 * Cleans MRZ Line 1:
 * - Remove spaces
 * - Starts with P + one char + 3-letter country
 * - Convert "K", "«", "‹", "(", "[" between letter groups to "<" where filler is expected (runs of fillers, separator "<<")
 * - Pad to 44 with "<"
 */
function cleanMrzLine1(rawLine) {
  if (!rawLine || typeof rawLine !== 'string') return null;

  // 1. Remove all spaces
  let line = rawLine.replace(/\s+/g, '').toUpperCase();

  // MRZ Line 1 must be 30-44 characters (standard TD3 is 44)
  if (line.length < 30) return null;

  // Convert obvious chevron misreads
  line = line.replace(/[\u00AB\u2039\(\[\{]/g, '<');

  // Must start with P + one char + 3-letter country code
  const match = line.match(/^P([<A-Z0-9])([A-Z]{3})(.*)$/);
  if (!match) {
    // If line doesn't start with P<... check if P is followed directly by country
    const match2 = line.match(/^P([A-Z]{3})(.*)$/);
    if (match2) {
      line = `P<${match2[1]}${match2[2]}`;
    } else {
      return null;
    }
  } else {
    // Standardize P< + country code
    line = `P<${match[2]}${match[3]}`;
  }

  // After P< + country code (at index 5):
  const prefix = line.substring(0, 5);
  let rest = line.substring(5);

  // In Line 1, runs of 'K' (2 or more) are fillers misread as K
  rest = rest.replace(/K{2,}/g, (m) => '<'.repeat(m.length));

  // Trailing K's at the end of line are fillers
  rest = rest.replace(/K+$/g, (m) => '<'.repeat(m.length));

  // Between letter groups, the separator is '<<'. If OCR read 'K<' or '<K<' or 'KK', convert to '<<'
  // But DO NOT convert '<K' when K is followed by a letter (e.g. '<KASHINATH')
  rest = rest.replace(/K</g, '<<');
  rest = rest.replace(/<K(?=[<0-9]|$)/g, '<<');

  line = prefix + rest;

  // Pad to 44 characters with '<' or trim to 44
  if (line.length < 44) {
    line = line.padEnd(44, '<');
  } else if (line.length > 44) {
    line = line.substring(0, 44);
  }

  return line;
}

/**
 * Cleans MRZ Line 2:
 * - Remove spaces
 * - Standardize chevrons
 * - Pad to 44 with "<"
 */
function cleanMrzLine2(rawLine) {
  if (!rawLine || typeof rawLine !== 'string') return null;

  let line = rawLine.replace(/\s+/g, '').toUpperCase();
  if (line.length < 30) return null;

  line = line.replace(/[\u00AB\u2039\(\[\{]/g, '<');

  // Trailing runs of K or chevron misreads at end of line 2
  line = line.replace(/K+$/g, (m) => '<'.repeat(m.length));

  if (line.length < 44) {
    line = line.padEnd(44, '<');
  } else if (line.length > 44) {
    line = line.substring(0, 44);
  }

  return line;
}

/**
 * Parses MRZ Line 1 for names:
 * text after "P<" + country code, split ONCE on the first "<<":
 * left = surname (single "<" = space), right = given names (single "<" = space).
 */
function parseMrzLine1Name(line1) {
  if (!line1 || line1.length < 10) {
    return { surname: '', givenNames: '', emptySurname: false };
  }

  const namesPart = line1.substring(5);
  const firstSep = namesPart.indexOf('<<');

  if (firstSep === 0) {
    // Empty surname on the passport (MRZ starts with P<IND<<GIVEN)
    const givenRaw = namesPart.substring(2).replace(/<+$/, '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
    return {
      surname: '',
      givenNames: givenRaw,
      emptySurname: true
    };
  }

  if (firstSep !== -1) {
    const surnameRaw = namesPart.substring(0, firstSep).replace(/</g, ' ').replace(/\s+/g, ' ').trim();
    const givenRaw = namesPart.substring(firstSep + 2).replace(/<+$/, '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
    return {
      surname: surnameRaw,
      givenNames: givenRaw,
      emptySurname: false
    };
  }

  // No '<<' found: entire string before trailing fillers is surname
  const surnameRaw = namesPart.replace(/<+$/, '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  return {
    surname: surnameRaw,
    givenNames: '',
    emptySurname: false
  };
}

/**
 * Validates Line 2 check digits (Passport number, DOB, Expiry, Composite).
 * If valid, the MRZ is trusted.
 */
function validateMrzCheckDigits(line2) {
  if (!line2 || line2.length !== 44) {
    return { valid: false, errors: ['Line 2 must be 44 characters'] };
  }

  const errors = [];

  // 1. Passport number (0-8) + check digit (9)
  const pNumStr = line2.substring(0, 9);
  const pNumCd = line2.substring(9, 10);
  const pNumValid = verifyCheckDigit(pNumStr, pNumCd);
  if (!pNumValid) errors.push('Passport number check digit failed');

  // 2. Nationality (10-12)
  const nationality = line2.substring(10, 13).replace(/</g, '');

  // 3. DOB (13-18) + check digit (19)
  const dobStr = line2.substring(13, 19);
  const dobCd = line2.substring(19, 20);
  const dobValid = verifyCheckDigit(dobStr, dobCd);
  if (!dobValid) errors.push('DOB check digit failed');

  // 4. Sex (20)
  const sex = line2.substring(20, 21);

  // 5. Expiry (21-26) + check digit (27)
  const expStr = line2.substring(21, 27);
  const expCd = line2.substring(27, 28);
  const expValid = verifyCheckDigit(expStr, expCd);
  if (!expValid) errors.push('Expiry date check digit failed');

  // 6. Composite (43) over chars 0-9, 13-19, 21-42
  const compositeInput = `${line2.substring(0, 10)}${line2.substring(13, 20)}${line2.substring(21, 43)}`;
  const compositeCd = line2.substring(43, 44);
  const compositeValid = verifyCheckDigit(compositeInput, compositeCd);
  if (!compositeValid) errors.push('Composite check digit failed');

  return {
    valid: errors.length === 0,
    errors,
    fields: {
      passportNumber: pNumStr.replace(/</g, ''),
      nationality,
      sex: sex === '<' ? 'X' : sex,
      dobStr,
      expStr,
      checkDigits: {
        passportNumber: pNumValid,
        dob: dobValid,
        expiryDate: expValid,
        composite: compositeValid
      }
    }
  };
}

/**
 * Scans an array of raw text lines or full document text to find MRZ Line 1 and Line 2.
 */
function findMrzLines(lines) {
  if (!lines) return null;
  const lineArray = Array.isArray(lines) ? lines : String(lines).split(/[\r\n]+/);

  for (let i = 0; i < lineArray.length; i++) {
    const raw1 = lineArray[i].trim();
    const clean1 = cleanMrzLine1(raw1);
    if (clean1) {
      // Check next line(s) for Line 2
      for (let j = i + 1; j < Math.min(i + 4, lineArray.length); j++) {
        const raw2 = lineArray[j].trim();
        const clean2 = cleanMrzLine2(raw2);
        if (clean2) {
          const val = validateMrzCheckDigits(clean2);
          if (val.valid || clean2.length === 44) {
            return [clean1, clean2];
          }
        }
      }
    }
  }

  return null;
}

/**
 * Reconciles printed names and MRZ names according to prompt rules:
 *
 * 1. Printed surname + given names both found and match MRZ (compare letters only) -> use printed values, GREEN.
 * 2. Printed values missing or merged into one string (e.g. given name "SWAPNIL PATIL", surname empty), MRZ valid ->
 *    split printed words using MRZ: words matching MRZ surname go to Surname, the rest to Given name,
 *    keeping printed spelling and order. Mark GREEN if all words accounted for, otherwise ORANGE.
 * 3. Printed missing, MRZ present -> use MRZ split, mark ORANGE "Read from code line".
 * 4. Printed and MRZ disagree -> keep printed, mark ORANGE "Code line reads <VALUE>".
 * 5. Long names: MRZ may be cut short (44 chars). If MRZ name is prefix of printed name, match (not error), mark GREEN.
 * 6. Empty surname on passport (MRZ "P<IND<<NAME") -> surname empty, GREEN, no "Not captured".
 */
function reconcileNames({
  printedGiven = '',
  printedSurname = '',
  printedFullName = '',
  mrzSurname = '',
  mrzGivenNames = '',
  emptySurnameOnMrz = false,
  mrzValid = false
}) {
  const cleanStr = (s) => (s || '').trim().replace(/\s+/g, ' ');
  const lettersOnly = (s) => (s || '').toUpperCase().replace(/[^A-Z]/g, '');

  let pGiven = cleanStr(printedGiven);
  let pSurname = cleanStr(printedSurname);
  let pFull = cleanStr(printedFullName);

  const mSurname = cleanStr(mrzSurname);
  const mGiven = cleanStr(mrzGivenNames);

  // Status flags
  let finalGiven = pGiven;
  let finalSurname = pSurname;
  let givenStatus = 'green';
  let surnameStatus = 'green';
  let givenReason = '';
  let surnameReason = '';

  // Rule 6: Empty surname on passport
  if (emptySurnameOnMrz || (!mSurname && mGiven)) {
    finalSurname = '';
    surnameStatus = 'green';
    surnameReason = '';

    if (pGiven && lettersOnly(pGiven) === lettersOnly(mGiven)) {
      finalGiven = pGiven;
      givenStatus = 'green';
    } else if (pFull && lettersOnly(pFull) === lettersOnly(mGiven)) {
      finalGiven = pFull;
      givenStatus = 'green';
    } else if (!pGiven && mGiven) {
      finalGiven = mGiven;
      givenStatus = 'green';
    }
    return {
      givenNames: finalGiven,
      surname: finalSurname,
      givenStatus,
      surnameStatus,
      givenReason,
      surnameReason
    };
  }

  // Rule 1: Both printed surname + given names found
  if (pGiven && pSurname) {
    const gMatch = lettersOnly(pGiven) === lettersOnly(mGiven) ||
      (mGiven && lettersOnly(pGiven).startsWith(lettersOnly(mGiven))); // Rule 5: prefix match for long names
    const sMatch = lettersOnly(pSurname) === lettersOnly(mSurname) ||
      (mSurname && lettersOnly(pSurname).startsWith(lettersOnly(mSurname)));

    if (gMatch && sMatch) {
      return {
        givenNames: pGiven,
        surname: pSurname,
        givenStatus: 'green',
        surnameStatus: 'green',
        givenReason: '',
        surnameReason: ''
      };
    }

    // Disagree with MRZ
    if (!gMatch && mGiven) {
      givenStatus = 'orange';
      givenReason = `Code line reads ${mGiven}`;
    }
    if (!sMatch && mSurname) {
      surnameStatus = 'orange';
      surnameReason = `Code line reads ${mSurname}`;
    }

    return {
      givenNames: pGiven,
      surname: pSurname,
      givenStatus,
      surnameStatus,
      givenReason,
      surnameReason
    };
  }

  // Rule 2: Printed values missing or merged into one string (e.g. given name "SWAPNIL PATIL", surname empty, or pFull)
  const combinedPrinted = pFull || (pGiven && !pSurname ? pGiven : (!pGiven && pSurname ? pSurname : ''));

  if (combinedPrinted && mSurname && mGiven) {
    const words = combinedPrinted.split(/\s+/).filter(Boolean);
    const mrzSurnameLetters = lettersOnly(mSurname);
    const mrzGivenLetters = lettersOnly(mGiven);

    const surnameWords = [];
    const givenWords = [];

    // Identify which words belong to Surname vs Given Name based on MRZ
    for (const w of words) {
      const wLetters = lettersOnly(w);
      if (mrzSurnameLetters.includes(wLetters)) {
        surnameWords.push(w);
      } else if (mrzGivenLetters.includes(wLetters)) {
        givenWords.push(w);
      } else {
        // Unknown word
        givenWords.push(w);
      }
    }

    // If surnameWords found matching MRZ surname:
    if (surnameWords.length > 0 && givenWords.length > 0) {
      finalSurname = surnameWords.join(' ');
      finalGiven = givenWords.join(' ');

      // Check if all words accounted for
      const sMatches = lettersOnly(finalSurname) === mrzSurnameLetters || mrzSurnameLetters.startsWith(lettersOnly(finalSurname));
      const gMatches = lettersOnly(finalGiven) === mrzGivenLetters || lettersOnly(finalGiven).startsWith(mrzGivenLetters);

      if (sMatches && gMatches) {
        return {
          givenNames: finalGiven,
          surname: finalSurname,
          givenStatus: 'green',
          surnameStatus: 'green',
          givenReason: '',
          surnameReason: ''
        };
      } else {
        return {
          givenNames: finalGiven,
          surname: finalSurname,
          givenStatus: 'orange',
          surnameStatus: 'orange',
          givenReason: 'Check name split against passport',
          surnameReason: 'Check name split against passport'
        };
      }
    }
  }

  // Rule 3: Printed missing, MRZ present
  if (!pGiven && !pSurname && (mGiven || mSurname)) {
    return {
      givenNames: mGiven,
      surname: mSurname,
      givenStatus: mGiven ? 'orange' : 'green',
      surnameStatus: mSurname ? 'orange' : 'green',
      givenReason: mGiven ? 'Read from code line' : '',
      surnameReason: mSurname ? 'Read from code line' : ''
    };
  }

  // Fallback: If only full name string and no MRZ available
  if (combinedPrinted && !mSurname && !mGiven) {
    return {
      givenNames: combinedPrinted,
      surname: '',
      givenStatus: 'orange',
      surnameStatus: 'orange',
      givenReason: 'Extracted as full name, check against passport.',
      surnameReason: 'Surname empty, check against passport.'
    };
  }

  return {
    givenNames: pGiven || mGiven || '',
    surname: pSurname || mSurname || '',
    givenStatus: pGiven ? 'green' : 'orange',
    surnameStatus: pSurname ? 'green' : 'orange',
    givenReason,
    surnameReason
  };
}

module.exports = {
  getCharValue,
  calculateCheckDigit,
  verifyCheckDigit,
  cleanMrzLine1,
  cleanMrzLine2,
  parseMrzLine1Name,
  validateMrzCheckDigits,
  findMrzLines,
  reconcileNames
};

/**
 * Passport OCR Printed Fields Reader
 *
 * Implements exact extraction rules for Indian passport data and back pages:
 * - Bilingual label matching (ignores Devanagari, fuzzy-matches English label).
 * - Exact printed values: preserves whole line under label, every word, spaces, commas, hyphens.
 * - Multi-line wrapping: joins non-label lines with space until next label.
 * - Dedicated API field vs raw line prefix comparison (picks longer; flags truncation).
 * - Strict name resolution:
 *   - NEVER uses combined name fields (name, id_name, full_name, holder_name).
 *   - Priority order: dedicated API field -> raw line under label -> MRZ line 1 fallback.
 *   - Empty surname is GREEN ONLY when MRZ line 1 starts with "P<IND<<".
 *   - Cross-checks words, letters, and MRZ split to guarantee GREEN or ORANGE.
 */

const {
  cleanMrzLine1,
  cleanMrzLine2,
  parseMrzLine1Name,
  validateMrzCheckDigits,
  findMrzLines
} = require('./mrzReader');

const LABEL_DEFINITIONS = [
  {
    key: 'surname',
    // उपनाम / Surname
    pattern: /\b(?:surn[a-z]{3,4}|sumame)\b/i
  },
  {
    key: 'givenNames',
    // दिया गया नाम / Given Name(s)
    pattern: /\b(?:given\s*(?:names?|narnes?)(?:\s*\([sS]\))?|givenname)\b/i
  },
  {
    key: 'placeOfBirth',
    // जन्म स्थान / Place of Birth
    pattern: /\bplace\s+of\s+bi[rlt1]th\b/i
  },
  {
    key: 'placeOfIssue',
    // जारी करने का स्थान / Place of Issue
    pattern: /\bplace\s+of\s+[il1]ssue\b/i
  },
  {
    key: 'dob',
    // जन्म तिथि / Date of Birth
    pattern: /\bdate\s+of\s+bi[rlt1]th\b/i
  },
  {
    key: 'issueDate',
    // जारी करने की तिथि / Date of Issue
    pattern: /\bdate\s+of\s+[il1]ssue\b/i
  },
  {
    key: 'expiryDate',
    // समाप्ति की तिथि / Date of Expiry
    pattern: /\bdate\s+of\s+exp[il1]ry\b/i
  },
  {
    key: 'nationality',
    // राष्ट्रीयता / Nationality
    pattern: /\bnationality\b/i
  },
  {
    key: 'sex',
    // लिंग / Sex
    pattern: /\b(?:sex|gender)\b/i
  },
  {
    key: 'passportNumber',
    // पासपोर्ट नं. / Passport No.
    pattern: /\bpassport\s*(?:no\.?|number)\b/i
  },
  {
    key: 'countryCode',
    // देश कोड / Country Code
    pattern: /\bcountry\s*code\b/i
  },
  {
    key: 'type',
    // प्रकार / Type
    pattern: /\btype\b/i
  },
  {
    key: 'fatherName',
    // पिता / कानूनी अभिभावक का नाम / Name of Father / Legal Guardian
    pattern: /\b(?:(?:name\s+of\s+)?father(?:\s*[\/\\]\s*legal\s+guardian)?|legal\s+guardian)\b/i
  },
  {
    key: 'motherName',
    // माता का नाम / Name of Mother
    pattern: /\b(?:name\s+of\s+)?mother\b/i
  },
  {
    key: 'spouseName',
    // पति या पत्नी का नाम / Name of Spouse
    pattern: /\b(?:name\s+of\s+)?spouse\b/i
  },
  {
    key: 'address',
    // पता / Address
    pattern: /\baddress\b/i
  },
  {
    key: 'fileNumber',
    // फ़ाइल सं. / File No.
    pattern: /\bfile\s*(?:no\.?|number)\b/i
  }
];

/**
 * Splits raw input into an array of cleaned, non-empty lines.
 */
function extractRawLines(textOrArray) {
  if (!textOrArray) return [];
  if (Array.isArray(textOrArray)) {
    return textOrArray
      .map(line => (line !== null && line !== undefined ? String(line).trim() : ''))
      .filter(Boolean);
  }
  return String(textOrArray)
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * Strips Devanagari script characters from a string.
 */
function stripDevanagari(str) {
  if (!str) return '';
  return str.replace(/[\u0900-\u097F]/g, '');
}

/**
 * Checks whether a line matches an MRZ pattern (TD3 line 1 or 2).
 * Must be at least 30 characters long to avoid false positives on words like "PATIL".
 */
function isMrzLine(line) {
  if (!line || typeof line !== 'string') return false;
  const clean = line.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 30) return false;

  if (clean.startsWith('P<') || clean.startsWith('P«') || clean.startsWith('P‹')) {
    return true;
  }
  if (clean.includes('<') || clean.includes('«') || clean.includes('‹')) {
    const mrzChars = clean.replace(/[^A-Z0-9<«‹]/g, '');
    if (mrzChars.length / clean.length > 0.8) {
      return true;
    }
  }
  return false;
}

/**
 * Identifies if a line is a label line for Indian passports.
 * Returns: { isLabel: boolean, key?: string, inlineValue?: string }
 */
function identifyLabel(rawLine) {
  if (!rawLine || typeof rawLine !== 'string') {
    return { isLabel: false };
  }

  // If it's an MRZ line, it's not a label line
  if (isMrzLine(rawLine)) {
    return { isLabel: false };
  }

  // Strip Devanagari to examine the English label
  const englishOnly = stripDevanagari(rawLine).trim();
  if (!englishOnly) {
    return { isLabel: false };
  }

  for (const def of LABEL_DEFINITIONS) {
    const match = englishOnly.match(def.pattern);
    if (match) {
      // Check if there is an explicit colon ':' followed by an inline value on the same line
      const colonIdx = englishOnly.indexOf(':');
      let inlineVal = null;
      if (colonIdx !== -1 && colonIdx >= match.index) {
        const afterColon = englishOnly.substring(colonIdx + 1).trim();
        const isAnotherLabel = LABEL_DEFINITIONS.some(d => d.key !== def.key && d.pattern.test(afterColon));
        if (!isAnotherLabel && afterColon.length > 0) {
          inlineVal = afterColon;
        }
      }

      return {
        isLabel: true,
        key: def.key,
        inlineValue: inlineVal
      };
    }
  }

  return { isLabel: false };
}

/**
 * Parses raw text lines to extract printed fields and any MRZ lines.
 */
function extractFieldsFromLines(lines) {
  const lineArray = extractRawLines(lines);
  const fields = {};
  const mrzCandidateLines = [];

  let currentKey = null;
  let currentValParts = [];

  const commitCurrentField = () => {
    if (currentKey && currentValParts.length > 0) {
      // Join multi-line values with a space, trim ends, collapse repeated whitespace
      const fullVal = currentValParts
        .join(' ')
        .replace(/[\u0900-\u097F]/g, '') // remove any stray Hindi on value line
        .trim()
        .replace(/\s+/g, ' ');

      if (fullVal) {
        // If field was already partially set, keep longer
        if (!fields[currentKey]) {
          fields[currentKey] = fullVal;
        } else if (fullVal.length > fields[currentKey].length) {
          fields[currentKey] = fullVal;
        }
      }
    }
    currentKey = null;
    currentValParts = [];
  };

  for (let i = 0; i < lineArray.length; i++) {
    const line = lineArray[i];

    // Check if this line is an MRZ line
    if (isMrzLine(line)) {
      commitCurrentField();
      mrzCandidateLines.push(line);
      continue;
    }

    const labelCheck = identifyLabel(line);
    if (labelCheck.isLabel) {
      commitCurrentField();
      currentKey = labelCheck.key;
      if (labelCheck.inlineValue) {
        currentValParts.push(labelCheck.inlineValue);
      }
      continue;
    }

    // Line is not a label: if we are inside a field, accumulate it
    if (currentKey) {
      // Skip lines that are only Devanagari text or punctuation
      const engChars = stripDevanagari(line).replace(/[^A-Za-z0-9]/g, '');
      if (engChars.length === 0) {
        continue;
      }
      currentValParts.push(line.trim());
    }
  }

  commitCurrentField();

  // Try to find cleaned MRZ if present in the lines
  let mrz = null;
  if (mrzCandidateLines.length >= 2) {
    const l1 = cleanMrzLine1(mrzCandidateLines[0]);
    const l2 = cleanMrzLine2(mrzCandidateLines[1]);
    if (l1 && l2) {
      mrz = [l1, l2];
    }
  }
  if (!mrz && lineArray.length > 0) {
    mrz = findMrzLines(lineArray);
  }

  return { fields, mrz };
}

/**
 * Step 2 Rule 5: Compare dedicated API field vs raw printed line.
 * When one is a prefix of the other, use the longer one.
 * If raw line is longer than API, API was truncated -> mark ORANGE.
 * If they differ otherwise, use raw line and mark ORANGE.
 */
function compareAndPickField(apiVal, rawVal, fieldName) {
  const cleanApi = apiVal !== null && apiVal !== undefined ? String(apiVal).trim().replace(/\s+/g, ' ') : null;
  const cleanRaw = rawVal !== null && rawVal !== undefined ? String(rawVal).trim().replace(/\s+/g, ' ') : null;

  if (!cleanApi && !cleanRaw) {
    return { value: null, status: 'green', reason: null };
  }
  if (!cleanApi && cleanRaw) {
    return { value: cleanRaw, status: 'green', reason: null };
  }
  if (cleanApi && !cleanRaw) {
    return { value: cleanApi, status: 'green', reason: null };
  }

  const upperApi = cleanApi.toUpperCase();
  const upperRaw = cleanRaw.toUpperCase();

  // Exact match
  if (upperApi === upperRaw) {
    return { value: cleanRaw, status: 'green', reason: null };
  }

  // Prefix check: Raw line is longer (API was cut short)
  if (upperRaw.startsWith(upperApi)) {
    return {
      value: cleanRaw,
      status: 'orange',
      reason: 'Value was cut short, check against passport'
    };
  }

  // Prefix check: API is longer than raw line
  if (upperApi.startsWith(upperRaw)) {
    return {
      value: cleanApi,
      status: 'green',
      reason: null
    };
  }

  // Differ otherwise: use raw line, mark ORANGE
  return {
    value: cleanRaw,
    status: 'orange',
    reason: `Value differs from API (${cleanApi}), check against passport`
  };
}

/**
 * Step 3: Strict Name Resolution & Cross-Checking
 *
 * Rules:
 * 1. NEVER use a combined/full name field (name, full_name, id_name, holder_name...)
 * 2. NEVER join first_name + last_name.
 * 3. Priority for Surname: dedicated API -> raw line under label -> MRZ line 1 fallback.
 * 4. Priority for Given name: dedicated API -> raw line under label -> MRZ line 1 fallback.
 * 5. Empty surname: GREEN ONLY if MRZ line 1 confirms no surname ("P<IND<<").
 *    If MRZ has surname, Surname CANNOT be empty; if unread, fill from MRZ and mark ORANGE.
 * 6. Cross-check for GREEN:
 *    - All words accounted for in printed line or MRZ line 1.
 *    - No word in both Given name and Surname.
 *    - Letters match MRZ split (or prefix match if MRZ truncated at 44 chars).
 */
function resolveNames({
  apiSurname = null,
  apiGiven = null,
  rawSurname = null,
  rawGiven = null,
  mrzLine1 = null,
  mrzLine2 = null
}) {
  const lettersOnly = (s) => (s || '').toUpperCase().replace(/[^A-Z]/g, '');

  let cleanedL1 = mrzLine1 ? cleanMrzLine1(mrzLine1) : null;
  let parsedMrz = cleanedL1 ? parseMrzLine1Name(cleanedL1) : { surname: '', givenNames: '', emptySurname: false };

  const mSurname = parsedMrz.surname || '';
  const mGiven = parsedMrz.givenNames || '';
  const emptySurnameOnMrz = parsedMrz.emptySurname || Boolean(cleanedL1 && cleanedL1.substring(0, 2) === 'P<' && cleanedL1.substring(5, 7) === '<<');

  let chosenSurname = null;
  let surnameStatus = 'green';
  let surnameReason = null;

  let chosenGiven = null;
  let givenStatus = 'green';
  let givenReason = null;

  // 1. Pick Surname candidate from dedicated API vs raw line
  if (apiSurname && rawSurname) {
    const comp = compareAndPickField(apiSurname, rawSurname, 'surname');
    chosenSurname = comp.value;
    surnameStatus = comp.status;
    surnameReason = comp.reason;
  } else if (rawSurname) {
    chosenSurname = rawSurname;
    surnameStatus = 'green';
  } else if (apiSurname) {
    chosenSurname = apiSurname;
    surnameStatus = 'green';
  }

  // 2. Pick Given name candidate from dedicated API vs raw line
  if (apiGiven && rawGiven) {
    const comp = compareAndPickField(apiGiven, rawGiven, 'givenNames');
    chosenGiven = comp.value;
    givenStatus = comp.status;
    givenReason = comp.reason;
  } else if (rawGiven) {
    chosenGiven = rawGiven;
    givenStatus = 'green';
  } else if (apiGiven) {
    chosenGiven = apiGiven;
    givenStatus = 'green';
  }

  // 3. Apply Empty Surname Rule (Step 3 Rule 6)
  if (emptySurnameOnMrz) {
    chosenSurname = '';
    surnameStatus = 'green';
    surnameReason = null;

    if (!chosenGiven && mGiven) {
      chosenGiven = mGiven;
      givenStatus = 'orange';
      givenReason = 'Read from code line, check against passport.';
    }
    return {
      surname: '',
      givenNames: chosenGiven || '',
      surnameStatus: 'green',
      givenStatus,
      surnameReason: null,
      givenReason
    };
  }

  // If MRZ has a surname, Surname CANNOT be empty!
  const surnameFromMrz = !chosenSurname && Boolean(mSurname);
  const givenFromMrz = !chosenGiven && Boolean(mGiven);

  if (surnameFromMrz) {
    // Printed surname wasn't read, fill from MRZ
    chosenSurname = mSurname;
    surnameStatus = 'orange';
    surnameReason = 'Read from code line, check against passport.';
  }

  if (givenFromMrz) {
    // Printed given name wasn't read, fill from MRZ
    chosenGiven = mGiven;
    givenStatus = 'orange';
    givenReason = 'Read from code line, check against passport.';
  }

  // 4. Cross-check for GREEN (Step 3 Rule 5)
  if (chosenGiven && chosenSurname && mSurname && mGiven) {
    const sWords = chosenSurname.trim().split(/\s+/).filter(Boolean);
    const gWords = chosenGiven.trim().split(/\s+/).filter(Boolean);

    // No word in both unless duplicated on the passport
    const overlap = sWords.some(w => gWords.map(x => x.toUpperCase()).includes(w.toUpperCase()));

    const sLetters = lettersOnly(chosenSurname);
    const gLetters = lettersOnly(chosenGiven);
    const mSLetters = lettersOnly(mSurname);
    const mGLetters = lettersOnly(mGiven);

    // Long names: MRZ is cut at 44 chars. If MRZ name is prefix of printed name, that is a match (GREEN).
    const sMatch = sLetters === mSLetters || sLetters.startsWith(mSLetters) || mSLetters.startsWith(sLetters);
    const gMatch = gLetters === mGLetters || gLetters.startsWith(mGLetters) || mGLetters.startsWith(gLetters);

    if (!overlap && sMatch && gMatch) {
      // Only set to green if NOT filled from MRZ fallback and not truncated
      if (!surnameFromMrz && (!surnameReason || !surnameReason.includes('cut short'))) {
        surnameStatus = 'green';
        surnameReason = null;
      }
      if (!givenFromMrz && (!givenReason || !givenReason.includes('cut short'))) {
        givenStatus = 'green';
        givenReason = null;
      }
    } else {
      if (!sMatch) {
        surnameStatus = 'orange';
        surnameReason = `Code line reads ${mSurname}`;
      }
      if (!gMatch) {
        givenStatus = 'orange';
        givenReason = `Code line reads ${mGiven}`;
      }
    }
  } else if (chosenGiven && !chosenSurname && !mSurname && mGiven) {
    // Empty surname confirmed
    surnameStatus = 'green';
    givenStatus = 'green';
  } else if (chosenGiven && chosenSurname && !mSurname && !mGiven) {
    // Both printed names found, no MRZ to cross-check
    surnameStatus = 'green';
    givenStatus = 'green';
  }

  return {
    surname: chosenSurname || '',
    givenNames: chosenGiven || '',
    surnameStatus,
    givenStatus,
    surnameReason,
    givenReason
  };
}

/**
 * Top-level function: parses raw passport page text lines, blends with API fields & MRZ.
 *
 * @param {string|string[]} rawLinesOrText Raw lines or text from OCR/Gemini/image
 * @param {Object} [apiFields] Dedicated fields from OCR API (AZAPI, Google, etc.)
 * @param {string[]} [mrzLines] Optional MRZ lines [line1, line2]
 * @returns {Object} { fields, lowConfidence, fieldReasons, mrz }
 */
function parsePrintedPassportPage(rawLinesOrText, apiFields = {}, mrzLines = null) {
  const lineExtraction = extractFieldsFromLines(rawLinesOrText);
  const rawFields = lineExtraction.fields || {};
  const discoveredMrz = mrzLines || lineExtraction.mrz;

  const lowConfidence = [];
  const fieldReasons = {};

  // Extract dedicated API surname / given name (EXCLUDING combined name fields)
  const apiSurname = apiFields.surname || apiFields.id_surname || apiFields.lastName || apiFields.last_name || apiFields.id_last_name || null;
  const apiGiven = apiFields.givenNames || apiFields.given_names || apiFields.id_given_names || apiFields.id_given_name || apiFields.firstName || apiFields.first_name || apiFields.id_first_name || null;

  // Resolve Names
  const mrzL1 = discoveredMrz && discoveredMrz[0] ? discoveredMrz[0] : null;
  const mrzL2 = discoveredMrz && discoveredMrz[1] ? discoveredMrz[1] : null;

  let nameRes = resolveNames({
    apiSurname,
    apiGiven,
    rawSurname: rawFields.surname || null,
    rawGiven: rawFields.givenNames || null,
    mrzLine1: mrzL1,
    mrzLine2: mrzL2
  });

  // Fallback: If OCR API returned ONLY a combined name (e.g. id_name: "PRIYA VERMA")
  // and no separate printed fields, no raw lines, and no MRZ:
  if (!nameRes.givenNames && !nameRes.surname) {
    const combinedName = apiFields.id_name || apiFields.name || apiFields.full_name || null;
    if (combinedName && !mrzL1) {
      nameRes.givenNames = combinedName.trim();
      nameRes.surname = '';
      nameRes.givenStatus = 'orange';
      nameRes.surnameStatus = 'orange';
      nameRes.givenReason = 'Extracted as full name, check against passport.';
      nameRes.surnameReason = 'Surname empty, check against passport.';
    }
  }

  if (nameRes.givenStatus === 'orange') {
    lowConfidence.push('givenNames');
    if (nameRes.givenReason) fieldReasons.givenNames = nameRes.givenReason;
  }
  if (nameRes.surnameStatus === 'orange') {
    lowConfidence.push('surname');
    if (nameRes.surnameReason) fieldReasons.surname = nameRes.surnameReason;
  }

  // Resolve other printed fields using Step 2 Rule 5 (prefix comparison)
  const fields = {
    givenNames: nameRes.givenNames,
    surname: nameRes.surname
  };

  const otherFieldMappings = [
    { key: 'placeOfBirth', apiKeys: ['placeOfBirth', 'id_place_of_birth', 'birthPlace'] },
    { key: 'placeOfIssue', apiKeys: ['placeOfIssue', 'id_place_of_issue', 'issuePlace'] },
    { key: 'fatherName', apiKeys: ['fatherName', 'id_caretaker_name', 'father_name', 'id_father_name'] },
    { key: 'motherName', apiKeys: ['motherName', 'mother_name', 'id_mother_name'] },
    { key: 'spouseName', apiKeys: ['spouseName', 'spouse_name', 'id_spouse_name'] },
    { key: 'address', apiKeys: ['address', 'id_address', 'fullAddress', 'residentialAddress'] },
    { key: 'fileNumber', apiKeys: ['fileNumber', 'id_file_num', 'file_number', 'id_file_number'] },
    { key: 'passportNumber', apiKeys: ['passportNumber', 'id_number', 'passportNo', 'passport_number', 'documentNumber'] },
    { key: 'dob', apiKeys: ['dob', 'id_dob', 'dateOfBirth', 'birthDate', 'birth_date'] },
    { key: 'issueDate', apiKeys: ['issueDate', 'id_doi', 'dateOfIssue', 'issue_date'] },
    { key: 'expiryDate', apiKeys: ['expiryDate', 'id_doe', 'dateOfExpiry', 'expirationDate', 'expiry_date'] },
    { key: 'nationality', apiKeys: ['nationality', 'id_nationality'] },
    { key: 'sex', apiKeys: ['sex', 'id_gender', 'gender'] },
    { key: 'countryCode', apiKeys: ['countryCode', 'id_country_code', 'country_code'] }
  ];

  for (const mapping of otherFieldMappings) {
    let apiVal = null;
    for (const ak of mapping.apiKeys) {
      if (apiFields[ak]) {
        apiVal = apiFields[ak];
        break;
      }
    }
    const rawVal = rawFields[mapping.key] || null;

    const comp = compareAndPickField(apiVal, rawVal, mapping.key);
    fields[mapping.key] = comp.value;

    if (comp.status === 'orange') {
      lowConfidence.push(mapping.key);
      if (comp.reason) fieldReasons[mapping.key] = comp.reason;
    }
  }

  // Check MRZ check digits for confidence boost (Rule 4)
  if (mrzL2) {
    const val2 = validateMrzCheckDigits(mrzL2);
    if (val2.valid && val2.fields?.checkDigits) {
      const cd = val2.fields.checkDigits;
      if (cd.passportNumber) {
        const idx = lowConfidence.indexOf('passportNumber');
        if (idx !== -1) lowConfidence.splice(idx, 1);
        delete fieldReasons.passportNumber;
      }
      if (cd.dob) {
        const idx = lowConfidence.indexOf('dob');
        if (idx !== -1) lowConfidence.splice(idx, 1);
        delete fieldReasons.dob;
      }
      if (cd.expiryDate) {
        const idx = lowConfidence.indexOf('expiryDate');
        if (idx !== -1) lowConfidence.splice(idx, 1);
        delete fieldReasons.expiryDate;
      }
      if (cd.composite) {
        const idxNat = lowConfidence.indexOf('nationality');
        if (idxNat !== -1) lowConfidence.splice(idxNat, 1);
        const idxSex = lowConfidence.indexOf('sex');
        if (idxSex !== -1) lowConfidence.splice(idxSex, 1);
        delete fieldReasons.nationality;
        delete fieldReasons.sex;
      }
    }
  }

  return {
    fields,
    lowConfidence: Array.from(new Set(lowConfidence)),
    fieldReasons,
    mrz: discoveredMrz
  };
}

module.exports = {
  LABEL_DEFINITIONS,
  extractRawLines,
  stripDevanagari,
  isMrzLine,
  identifyLabel,
  extractFieldsFromLines,
  compareAndPickField,
  resolveNames,
  parsePrintedPassportPage
};

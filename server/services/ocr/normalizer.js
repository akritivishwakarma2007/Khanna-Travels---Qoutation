/**
 * Passport OCR Normalizer & Side Merger
 *
 * Guarantees every key in the normalized schema is always present.
 * Unread/missing fields are strictly null (never empty strings or guesses).
 */

const MONTH_MAP = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

const VALID_FIELD_KEYS = [
  'givenNames',
  'surname',
  'passportNumber',
  'nationality',
  'countryCode',
  'sex',
  'dob',
  'placeOfBirth',
  'placeOfIssue',
  'issueDate',
  'expiryDate',
  'fatherName',
  'motherName',
  'spouseName',
  'address',
  'pin',
  'fileNumber',
  'issuingCountry',
  'addressLine',
  'city',
  'state',
  'pinCode',
  'country'
];

/**
 * Normalizes any recognized date string to YYYY-MM-DD, or null if unparseable.
 * Supports:
 * - YYYY-MM-DD, YYYY/MM/DD
 * - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - "14 APR 1990", "14/APR/1990", "14-APR-1990"
 * - "APR 14, 1990", "14 APR 90" (assuming 19XX/20XX context)
 *
 * @param {any} val
 * @returns {string|null} YYYY-MM-DD or null
 */
function normalizeDate(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim().toUpperCase().replace(/[,\.]/g, ' ');
  if (['NULL', 'UNDEFINED', 'NONE', 'N/A', 'NA', 'NIL'].includes(clean)) return null;

  // 1. YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = clean.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    if (_isValidDateParts(y, m, d)) return `${y}-${m}-${d}`;
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY or DD MM YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-\/\s](\d{1,2})[-\/\s](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    if (_isValidDateParts(y, m, d)) return `${y}-${m}-${d}`;
  }

  // 3. Named month formats, e.g. "14 APR 1990", "14/APR/1990", "14-APR-1990"
  const textMonthMatch = clean.match(/^(\d{1,2})[-\/\s]([A-Z]{3,9})[-\/\s](\d{2,4})$/);
  if (textMonthMatch) {
    const d = textMonthMatch[1].padStart(2, '0');
    const mText = textMonthMatch[2].substring(0, 3);
    const m = MONTH_MAP[mText];
    let y = textMonthMatch[3];
    if (y.length === 2) {
      const yy = parseInt(y, 10);
      const currentYY = new Date().getFullYear() % 100;
      y = yy > currentYY ? String(1900 + yy) : String(2000 + yy);
    }
    if (m && _isValidDateParts(y, m, d)) {
      return `${y}-${m}-${d}`;
    }
  }

  // 4. Month first, e.g. "APR 14 1990"
  const monthFirstMatch = clean.match(/^([A-Z]{3,9})[-\/\s](\d{1,2})[-\/\s](\d{2,4})$/);
  if (monthFirstMatch) {
    const mText = monthFirstMatch[1].substring(0, 3);
    const m = MONTH_MAP[mText];
    const d = monthFirstMatch[2].padStart(2, '0');
    let y = monthFirstMatch[3];
    if (y.length === 2) {
      const yy = parseInt(y, 10);
      const currentYY = new Date().getFullYear() % 100;
      y = yy > currentYY ? String(1900 + yy) : String(2000 + yy);
    }
    if (m && _isValidDateParts(y, m, d)) {
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

function _isValidDateParts(y, m, d) {
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  return true;
}

/**
 * Normalizes sex string to 'F', 'M', 'X', or null.
 * @param {any} val
 * @returns {'F'|'M'|'X'|null}
 */
function normalizeSex(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim().toUpperCase();
  if (clean === 'F' || clean === 'FEMALE') return 'F';
  if (clean === 'M' || clean === 'MALE') return 'M';
  if (clean === 'X' || clean === 'T' || clean === '<') return 'X';
  return null;
}

/**
 * Normalizes text for names, places, and codes (uppercased, collapsed spaces).
 * @param {any} val
 * @returns {string|null}
 */
function normalizeUpper(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim().replace(/\s+/g, ' ').toUpperCase();
  if (['NULL', 'UNDEFINED', 'NONE', 'N/A', 'NA', 'NIL'].includes(clean)) return null;
  return clean || null;
}

/**
 * Normalizes address (preserves original casing, collapses internal spaces).
 * @param {any} val
 * @returns {string|null}
 */
function normalizeAddress(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim().replace(/\s+/g, ' ');
  if (/^(null|undefined|none|n\/a|nil)$/i.test(clean)) return null;
  return clean || null;
}

/**
 * Normalizes passport number (spaces removed, uppercased).
 * @param {any} val
 * @returns {string|null}
 */
function normalizePassportNumber(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (['NULL', 'NONE', 'NA', 'UNDEFINED', 'NIL'].includes(clean)) return null;
  return clean || null;
}

/**
 * Normalizes MRZ lines into [line1, line2] or null.
 * Accepts array of strings or single string with newlines.
 * Replaces « and ‹ with <, removes whitespace, converts to uppercase.
 * Requires exactly 2 lines of 30+ chars.
 *
 * @param {any} val
 * @returns {[string, string]|null}
 */
function normalizeMrz(val) {
  if (!val) return null;
  let lines = [];

  if (Array.isArray(val)) {
    lines = val.map(l => String(l || ''));
  } else if (typeof val === 'string') {
    lines = val.split(/[\r\n]+/);
  } else {
    return null;
  }

  const { cleanMrzLine1, cleanMrzLine2 } = require('./mrzReader');
  if (lines.length >= 2) {
    const l1 = cleanMrzLine1(lines[0]);
    const l2 = cleanMrzLine2(lines[1]);
    if (l1 && l2 && l1.length === 44 && l2.length === 44) {
      return [l1, l2];
    }
  }

  const cleanedLines = lines
    .map(line => line
      .toUpperCase()
      .replace(/[\u00AB\u2039]/g, '<') // replace « and ‹ with <
      .replace(/[^A-Z0-9<]/g, '') // remove spaces and other punctuation
      .trim()
    )
    .filter(line => line.length > 0);

  if (cleanedLines.length === 2 && cleanedLines[0].length >= 30 && cleanedLines[1].length >= 30) {
    return [cleanedLines[0], cleanedLines[1]];
  }

  return null;
}

/**
 * Normalizes raw OCR results from any provider into the strict normalized response shape.
 *
 * @param {Object} raw
 * @returns {Object} Normalized passport object
 */
function normalize(raw = {}) {
  const r = raw || {};

  const passportNumber = normalizePassportNumber(r.passportNumber);
  const givenNames = normalizeUpper(r.givenNames);
  const surname = normalizeUpper(r.surname);
  const nationality = normalizeUpper(r.nationality);
  const sex = normalizeSex(r.sex);
  const dob = normalizeDate(r.dob);
  const placeOfBirth = normalizeUpper(r.placeOfBirth);
  const placeOfIssue = normalizeUpper(r.placeOfIssue);
  const issueDate = normalizeDate(r.issueDate);
  const expiryDate = normalizeDate(r.expiryDate);
  const fatherName = normalizeUpper(r.fatherName);
  const motherName = normalizeUpper(r.motherName);
  const spouseName = normalizeUpper(r.spouseName);
  const address = normalizeAddress(r.address);
  const fileNumber = normalizeUpper(r.fileNumber);
  const issuingCountry = normalizeUpper(r.issuingCountry || r.countryCode);
  const countryCode = normalizeUpper(r.countryCode || r.issuingCountry || r.nationality);

  const { parseIndianAddressSync, cleanCity, cleanState, cleanCountry } = require('./addressParser');

  let addressLine = normalizeAddress(r.addressLine);
  let city = cleanCity(r.city);
  let state = cleanState(r.state);
  let pinCode = normalizeUpper(r.pinCode || r.pin);
  let country = cleanCountry(r.country || 'India');

  // Check if City has a 6-digit PIN code and pinCode is empty
  if (city) {
    const pinInCity = String(city).match(/\b([1-9]\d{5})\b/);
    if (pinInCity && !pinCode) {
      pinCode = pinInCity[1];
    }
    city = cleanCity(city);
  }

  if (address && (!addressLine || !city || !state || !pinCode)) {
    const parsed = parseIndianAddressSync(address, { nationality: nationality || 'IND' });
    if (!addressLine && parsed.addressLine) addressLine = parsed.addressLine;
    if (!city && parsed.city) city = cleanCity(parsed.city);
    if (!state && parsed.state) state = cleanState(parsed.state);
    if (!pinCode && parsed.pinCode) pinCode = parsed.pinCode;
    if (!country && parsed.country) country = cleanCountry(parsed.country);
  }

  city = normalizeUpper(city);
  state = normalizeUpper(state);
  country = normalizeUpper(country);

  let pin = pinCode || normalizeUpper(r.pin);
  if (!pin && address) {
    const pinMatch = address.match(/\b([1-9]\d{5})\b/);
    if (pinMatch) pin = pinMatch[1];
  }

  const mrz = normalizeMrz(r.mrz);

  // Filter lowConfidence: only keep valid field keys whose normalized value is NOT null
  const rawLowConf = Array.isArray(r.lowConfidence) ? r.lowConfidence : [];
  const lowConfidenceSet = new Set();

  rawLowConf.forEach(k => {
    if (VALID_FIELD_KEYS.includes(k)) {
      // Check if field actually has a value
      const val = {
        givenNames, surname, passportNumber, nationality, countryCode, sex, dob,
        placeOfBirth, placeOfIssue, issueDate, expiryDate, fatherName,
        motherName, spouseName, address, pin, fileNumber, issuingCountry,
        addressLine, city, state, pinCode, country
      }[k];
      if (val !== null && val !== undefined) {
        lowConfidenceSet.add(k);
      }
    }
  });

  const fieldReasons = { ...(r.fieldReasons || {}), ...(r.fieldDiscrepancies || {}) };
  const fieldDiscrepancies = { ...(r.fieldDiscrepancies || {}), ...(r.fieldReasons || {}) };

  return {
    givenNames,
    surname,
    passportNumber,
    nationality,
    countryCode,
    sex,
    dob,
    placeOfBirth,
    placeOfIssue,
    issueDate,
    expiryDate,
    fatherName,
    motherName,
    spouseName,
    address,
    pin,
    fileNumber,
    issuingCountry,
    addressLine,
    city,
    state,
    pinCode,
    country,
    mrz,
    lowConfidence: Array.from(lowConfidenceSet),
    fieldReasons,
    fieldDiscrepancies,
    previewImage: r.previewImage || null,
    pagesFound: raw.pagesFound || {
      front: Boolean(passportNumber || mrz),
      back: Boolean(address || fatherName || motherName || spouseName || fileNumber)
    }
  };
}

/**
 * Merges front and back passport extraction results.
 * Front page is primary. Back page only populates fields that are null on front page.
 * Front page MRZ always wins.
 *
 * @param {Object} front Normalized or raw front page object
 * @param {Object} [back] Normalized or raw back page object
 * @returns {Object} Fully normalized merged passport object
 */
function mergeSides(front = {}, back = null) {
  const normFront = normalize(front);
  if (!back) return normFront;

  const normBack = normalize(back);

  const merged = { ...normFront };

  // Fill in any null fields from the back page
  VALID_FIELD_KEYS.forEach(key => {
    if (merged[key] === null && normBack[key] !== null) {
      merged[key] = normBack[key];
    }
  });

  // Front page MRZ always wins
  merged.mrz = normFront.mrz || normBack.mrz;

  // Merge lowConfidence sets
  const combinedLowConf = new Set([
    ...normFront.lowConfidence,
    ...normBack.lowConfidence.filter(k => merged[k] !== null)
  ]);
  merged.lowConfidence = Array.from(combinedLowConf);

  merged.fieldReasons = { ...(normFront.fieldReasons || {}), ...(normBack.fieldReasons || {}) };
  merged.fieldDiscrepancies = { ...(normFront.fieldDiscrepancies || {}), ...(normBack.fieldDiscrepancies || {}) };
  merged.previewImage = front.previewImage || normFront.previewImage || null;

  merged.pagesFound = {
    front: Boolean(normFront.pagesFound?.front || normFront.passportNumber),
    back: Boolean(normBack.pagesFound?.back || normBack.address || normBack.fatherName || normFront.pagesFound?.back)
  };

  return merged;
}

module.exports = {
  normalize,
  mergeSides,
  normalizeDate,
  normalizeSex,
  normalizeUpper,
  normalizeAddress,
  normalizePassportNumber,
  normalizeMrz,
  VALID_FIELD_KEYS
};


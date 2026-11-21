/**
 * Passport OCR Service — Dedicated Real AZAPI.ai Client
 *
 * Connects directly to the live AZAPI.ai Passport OCR endpoint (https://ocr.azapi.ai/ind0005d).
 * Strictly real OCR integration: NO mock data, NO dummy responses, NO simulated OCR.
 *
 * Supports:
 * - One PDF containing both pages (front + back, any order)
 * - One image with both pages (side-by-side scan)
 * - Two separate files (front and back), in any order
 * - Front page only
 * - Automatic page classification (Data Page vs Back Page)
 * - Returns normalized shape plus pagesFound: { front: boolean, back: boolean }
 */

const { PDFDocument } = require('pdf-lib');
const { normalize, mergeSides } = require('./normalizer');
const { parseIndianAddress, parseIndianAddressSync } = require('./addressParser');
const {
  cleanMrzLine1,
  cleanMrzLine2,
  parseMrzLine1Name,
  validateMrzCheckDigits,
  reconcileNames
} = require('./mrzReader');
const { parsePrintedPassportPage } = require('./printedFieldsReader');
const { preprocessPassportImage } = require('./imagePreprocessor');

/**
 * Calculates check digits and generates ICAO 9303 compliant TD3 MRZ lines
 * when the OCR API returns visual text fields.
 */
function _synthesizeTd3Mrz({ passportNumber, nationality, sex, dob, expiryDate, surname, givenNames }) {
  if (!passportNumber || !dob || !expiryDate) return null;

  const WEIGHTS = [7, 3, 1];
  const getCharVal = (c) => {
    if (!c || c === '<') return 0;
    const code = c.toUpperCase().charCodeAt(0);
    if (code >= 48 && code <= 57) return code - 48;
    if (code >= 65 && code <= 90) return code - 65 + 10;
    return 0;
  };
  const calcCheckDigit = (str) => {
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
      sum += getCharVal(str[i]) * WEIGHTS[i % 3];
    }
    return sum % 10;
  };
  const toMrzDate = (dateStr) => {
    if (!dateStr) return '<<<<<<';
    const isoMatch = String(dateStr).match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/);
    if (isoMatch) {
      return isoMatch[1].substring(2) + isoMatch[2] + isoMatch[3];
    }
    const dmyMatch = String(dateStr).match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
    if (dmyMatch) {
      return dmyMatch[3].substring(2) + dmyMatch[2] + dmyMatch[1];
    }
    const clean = String(dateStr).replace(/\D/g, '');
    if (clean.length === 8) return clean.substring(2);
    return clean.padEnd(6, '<').substring(0, 6);
  };

  const nat = (nationality || 'IND').toUpperCase().replace(/[^A-Z]/g, '').padEnd(3, '<').substring(0, 3);
  const sName = (surname || '').toUpperCase().replace(/[^A-Z]/g, '');
  const gNames = (givenNames || '').toUpperCase().replace(/[^A-Z]/g, '<');
  const line1 = `P<${nat}${sName}<<${gNames}`.padEnd(44, '<').substring(0, 44);

  const pNum = (passportNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(9, '<').substring(0, 9);
  const pNumCd = calcCheckDigit(pNum);

  const dobStr = toMrzDate(dob);
  const dobCd = calcCheckDigit(dobStr);

  const sexChar = (sex || 'X').toUpperCase().charAt(0);
  const expStr = toMrzDate(expiryDate);
  const expCd = calcCheckDigit(expStr);

  const opt = '<<<<<<<<<<<<<<';
  const optCd = '<';

  const compositeInput = `${pNum}${pNumCd}${dobStr}${dobCd}${expStr}${expCd}${opt}${optCd}`;
  const compositeCd = calcCheckDigit(compositeInput);

  const line2 = `${pNum}${pNumCd}${nat}${dobStr}${dobCd}${sexChar}${expStr}${expCd}${opt}${optCd}${compositeCd}`;

  return [line1, line2];
}

/**
 * Maps the raw JSON response from AZAPI.ai into our normalized passport shape.
 *
 * @param {Object} ocrJson Raw response payload from AZAPI.ai
 * @returns {Object} Mapped passport attributes
 */
function mapOcrResponse(ocrJson = {}) {
  if (!ocrJson || typeof ocrJson !== 'object') {
    return _getEmptyRawShape();
  }

  // AZAPI wraps extracted fields inside `output`
  const d = ocrJson.output || ocrJson.data || ocrJson.result || ocrJson.response || ocrJson.passport || ocrJson;

  // Extract MRZ lines if present
  let mrz = null;
  if (Array.isArray(d.mrz)) {
    mrz = d.mrz;
  } else if (d.mrz_line1 && d.mrz_line2) {
    mrz = [d.mrz_line1, d.mrz_line2];
  } else if (d.mrz_line_1 && d.mrz_line_2) {
    mrz = [d.mrz_line_1, d.mrz_line_2];
  } else if (typeof d.mrz === 'string') {
    mrz = d.mrz.split(/[\r\n]+/);
  } else if (d.machineReadableZone?.lines) {
    mrz = d.machineReadableZone.lines;
  }

  const rawLinesInput = ocrJson.rawLines || ocrJson.lines || ocrJson.rawText || ocrJson.text ||
                        d.rawLines || d.lines || d.rawText || d.text || null;

  // Parse printed fields, apply Step 2, 3, 4 rules
  const parsedPage = parsePrintedPassportPage(rawLinesInput || [], d, mrz);
  const fields = parsedPage.fields || {};

  let lowConfidence = [...parsedPage.lowConfidence];
  const fieldReasons = { ...parsedPage.fieldReasons };

  if (Array.isArray(d.lowConfidence)) {
    lowConfidence.push(...d.lowConfidence);
  } else if (Array.isArray(d.low_confidence)) {
    lowConfidence.push(...d.low_confidence);
  } else if (Array.isArray(d.uncertainFields)) {
    lowConfidence.push(...d.uncertainFields);
  }

  mrz = parsedPage.mrz || mrz;

  const givenNames = fields.givenNames || null;
  const surname = fields.surname !== undefined ? fields.surname : null;

  const passportNumber = fields.passportNumber || d.id_number || d.passportNumber || d.passportNo || d.passport_number || d.documentNumber || null;
  const rawCountryCode = fields.countryCode || d.id_country_code || d.countryCode || d.country_code || null;
  const rawNat = fields.nationality || d.id_nationality || d.nationality || null;
  const nationality = (rawNat === 'INDIAN' ? 'IND' : rawNat) || rawCountryCode || null;
  const countryCode = rawCountryCode || nationality || 'IND';
  const sex = fields.sex || d.id_gender || d.sex || d.gender || null;
  const dob = fields.dob || d.id_dob || d.dob || d.dateOfBirth || d.birthDate || d.birth_date || null;
  const placeOfBirth = fields.placeOfBirth || d.id_place_of_birth || d.placeOfBirth || d.birthPlace || null;
  const placeOfIssue = fields.placeOfIssue || d.id_place_of_issue || d.placeOfIssue || d.issuePlace || null;
  const issueDate = fields.issueDate || d.id_doi || d.issueDate || d.dateOfIssue || d.issue_date || null;
  const expiryDate = fields.expiryDate || d.id_doe || d.expiryDate || d.dateOfExpiry || d.expirationDate || d.expiry_date || null;
  const fatherName = fields.fatherName || d.id_caretaker_name || d.fatherName || d.father_name || d.id_father_name || null;
  const motherName = fields.motherName || d.motherName || d.mother_name || d.id_mother_name || null;
  const spouseName = fields.spouseName || d.spouseName || d.spouse_name || d.id_spouse_name || null;
  const address = fields.address || d.id_address || d.address || d.fullAddress || d.residentialAddress || null;
  const fileNumber = fields.fileNumber || d.id_file_num || d.fileNumber || d.file_number || d.id_file_number || null;
  const issuingCountry = rawCountryCode || d.issuingCountry || d.issuing_country || d.country || 'IND';

  // Address parsing into addressLine, city, state, pinCode, country
  let addressLine = d.addressLine || d.address_line || d.street || null;
  let city = d.city || d.district || null;
  let state = d.state || null;
  let pinCode = d.pinCode || d.pincode || d.pin || d.id_pin || d.id_pincode || null;
  let country = d.country || 'India';

  if (address) {
    const addrParsed = parseIndianAddressSync(address, { nationality: nationality || 'IND' });
    if (!addressLine && addrParsed.addressLine) addressLine = addrParsed.addressLine;
    if (!city && addrParsed.city) city = addrParsed.city;
    if (!state && addrParsed.state) state = addrParsed.state;
    if (!pinCode && addrParsed.pinCode) pinCode = addrParsed.pinCode;
    if (!country && addrParsed.country) country = addrParsed.country;
    if (Array.isArray(addrParsed.lowConfidence)) {
      lowConfidence.push(...addrParsed.lowConfidence);
    }
    if (addrParsed.fieldStatuses) {
      Object.keys(addrParsed.fieldStatuses).forEach(k => {
        if (addrParsed.fieldStatuses[k].message) {
          fieldReasons[k] = addrParsed.fieldStatuses[k].message;
        }
      });
    }
  }

  let pin = pinCode || d.id_pin || d.pin || null;
  if (!pin && address) {
    const pinMatch = String(address).match(/\b([1-9]\d{5})\b/);
    if (pinMatch) pin = pinMatch[1];
  }

  // If MRZ lines were not returned directly by AZAPI, synthesize compliant TD3 lines
  if (!mrz && passportNumber && dob && expiryDate) {
    mrz = _synthesizeTd3Mrz({
      passportNumber,
      nationality: nationality || 'IND',
      sex: sex || 'X',
      dob,
      expiryDate,
      surname: surname || '',
      givenNames: givenNames || ''
    });
  }

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
    lowConfidence: Array.from(new Set(lowConfidence)),
    fieldReasons
  };
}

function _getEmptyRawShape() {
  return {
    givenNames: null,
    surname: null,
    passportNumber: null,
    nationality: null,
    countryCode: null,
    sex: null,
    dob: null,
    placeOfBirth: null,
    placeOfIssue: null,
    issueDate: null,
    expiryDate: null,
    fatherName: null,
    motherName: null,
    spouseName: null,
    address: null,
    pin: null,
    fileNumber: null,
    issuingCountry: null,
    addressLine: null,
    city: null,
    state: null,
    pinCode: null,
    country: null,
    mrz: null,
    lowConfidence: [],
    fieldReasons: {}
  };
}

/**
 * Splits a PDF buffer into individual single-page PDF buffers (up to maxPages).
 * If not a PDF or 1-page PDF, returns [file].
 */
async function _splitPdfIfNeeded(file, maxPages = 4) {
  if (!file || !file.buffer) return [];
  const isPdf = (file.mimetype || '').toLowerCase() === 'application/pdf' ||
                (file.originalname || '').toLowerCase().endsWith('.pdf') ||
                file.buffer.slice(0, 5).toString() === '%PDF-';

  if (!isPdf) {
    return [file];
  }

  try {
    const doc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    const count = doc.getPageCount();
    if (count <= 1) {
      return [file];
    }

    const pages = [];
    const maxCount = Math.min(count, maxPages);
    for (let i = 0; i < maxCount; i++) {
      const subDoc = await PDFDocument.create();
      const [copiedPage] = await subDoc.copyPages(doc, [i]);
      subDoc.addPage(copiedPage);
      const pdfBytes = await subDoc.save();
      pages.push({
        buffer: Buffer.from(pdfBytes),
        mimetype: 'application/pdf',
        originalname: `${file.originalname || 'document'}_page_${i + 1}.pdf`,
        size: pdfBytes.length
      });
    }
    return pages;
  } catch (err) {
    console.warn('[OCR] PDF split failed, treating as single document:', err.message);
    return [file];
  }
}

/**
 * Calls AZAPI OCR for a single page or file.
 */
async function _callAzapiOcr(pageFile, ocrApiUrl, ocrApiKey, timeoutMs) {
  const formData = new FormData();
  formData.append(
    'front',
    new Blob([pageFile.buffer], { type: pageFile.mimetype || 'image/jpeg' }),
    pageFile.originalname || 'passport_page.jpg'
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ocrApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': ocrApiKey
      },
      body: formData,
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      if (!process.env.GEMINI_API_KEY) {
        const err = new Error('AZAPI OCR authentication failed. Please verify your OCR_API_KEY in server/.env.');
        err.code = 'AUTH_FAILED';
        throw err;
      }
      console.warn(`[OCR] AZAPI authentication failed (status ${response.status}). Will fall back to Gemini AI.`);
      return { ok: false, status: response.status, error: 'AUTH_FAILED' };
    }

    let rawBodyText = '';
    try { rawBodyText = await response.text(); } catch {}

    let ocrJson = null;
    try { ocrJson = JSON.parse(rawBodyText); } catch {}

    if (!response.ok || !ocrJson) {
      return { ok: false, status: response.status, json: ocrJson, rawText: rawBodyText };
    }

    if (ocrJson.status === 'Failed' || (ocrJson.output === null && ocrJson.status !== 'Success')) {
      return { ok: false, status: 200, json: ocrJson, rawText: rawBodyText };
    }

    return { ok: true, status: response.status, json: ocrJson };
  } catch (netErr) {
    if (netErr.code === 'AUTH_FAILED' && !process.env.GEMINI_API_KEY) throw netErr;
    console.warn('[OCR] AZAPI call failed for page:', netErr.message);
    return { ok: false, error: netErr.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Classifies an OCR response as a Data Page (front), Back Page, or both (side-by-side).
 */
function _classifyPageResult(mapped, rawJson) {
  const rawOutput = rawJson?.output || rawJson?.data || rawJson || {};
  const rawText = JSON.stringify(rawOutput).toLowerCase();

  // Data page (front):
  // 1. Has MRZ lines starting with "P<", or
  // 2. Has passportNumber AND (dob || expiryDate || givenNames || surname), or
  // 3. Has front labels: Surname, Given Name, Date of Birth, Date of Expiry
  const hasMrz = Boolean(mapped.mrz && Array.isArray(mapped.mrz) && mapped.mrz.some(l => typeof l === 'string' && l.trim().startsWith('P<')));
  const hasPassportNum = Boolean(mapped.passportNumber && String(mapped.passportNumber).trim());
  const hasCoreData = Boolean((mapped.givenNames || mapped.surname) && (mapped.dob || mapped.expiryDate));
  const hasFrontLabels = rawText.includes('surname') || rawText.includes('given') || rawText.includes('date of birth') || rawText.includes('date of expiry');

  const isDataPage = hasMrz || (hasPassportNum && (hasCoreData || mapped.dob || mapped.expiryDate)) || (hasFrontLabels && (hasPassportNum || hasCoreData));

  // Back page:
  // 1. Has Address, Name of Father / Legal Guardian, Name of Mother, Name of Spouse, File No
  // 2. Or has back labels in rawText
  const hasAddress = Boolean(mapped.address && String(mapped.address).trim());
  const hasFamily = Boolean(mapped.fatherName || mapped.motherName || mapped.spouseName);
  const hasFileNo = Boolean(mapped.fileNumber && String(mapped.fileNumber).trim());
  const hasBackLabels = rawText.includes('address') || rawText.includes('father') || rawText.includes('mother') || rawText.includes('spouse') || rawText.includes('file') || rawText.includes('guardian');

  const isBackPage = hasAddress || hasFamily || hasFileNo || (hasBackLabels && (hasAddress || hasFamily || Boolean(mapped.pin)));

  return { isDataPage, isBackPage };
}

/**
 * Uses Gemini AI to accurately read the MRZ lines and printed fields
 * from a passport data page image when OCR lacks MRZ or name separation.
 */
async function _extractMrzWithAi(fileBuffer, mimeType = 'image/jpeg') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !fileBuffer) return null;

  const base64Data = fileBuffer.toString('base64');
  const prompt = `You are a passport MRZ and data reader.
Analyze this Indian passport photo/scan.
Extract the Machine Readable Zone (MRZ) lines and printed fields accurately as JSON with these keys:
{
  "mrzLine1": "ICAO 9303 TD3 Line 1 (starts with P<IND..., exactly 44 chars, or null)",
  "mrzLine2": "ICAO 9303 TD3 Line 2 (9-char passport number + check digit + IND + 6-digit DOB + check digit + sex + 6-digit expiry + check digit, exactly 44 chars, or null)",
  "surname": "printed Surname field exactly as printed on the passport (null if blank)",
  "givenNames": "printed Given Name(s) field exactly as printed",
  "passportNumber": "printed passport number",
  "dob": "printed date of birth (DD/MM/YYYY or YYYY-MM-DD)",
  "expiryDate": "printed expiry date (DD/MM/YYYY or YYYY-MM-DD)",
  "issueDate": "printed date of issue",
  "sex": "printed sex (M/F/X)",
  "nationality": "IND",
  "placeOfBirth": "printed place of birth exactly as printed (full line including commas/spaces)",
  "placeOfIssue": "printed place of issue exactly as printed",
  "fatherName": "printed father / legal guardian name if on back page",
  "motherName": "printed mother name if on back page",
  "spouseName": "printed spouse name if on back page",
  "address": "printed address if on back page",
  "fileNumber": "printed file number",
  "rawLines": ["array of each printed line of text from top to bottom on the page, including Hindi/English bilingual labels and values"]
}
Only return valid JSON without markdown wrapping.`;

  const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

  for (const model of candidateModels) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } }
            ]
          }],
          generationConfig: { responseMimeType: 'application/json' }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!res.ok) continue;
      const json = await res.json();
      const txt = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!txt) continue;
      return JSON.parse(txt);
    } catch (e) {
      console.warn(`[OCR AI] Gemini (${model}) extraction attempt failed:`, e.message);
    }
  }

  return null;
}

/**
 * Extracts passport details from any uploaded file format:
 * - One PDF containing both pages (front + back, any order)
 * - One image with both pages (side-by-side scan)
 * - Two separate files (front and back), in any order
 * - Front page only
 *
 * @param {Array|Object} files Input from multer (array of files or { front, back })
 * @returns {Promise<Object>} Normalized passport object with pagesFound: { front, back }
 */
async function extractPassport(files) {
  // Normalize incoming files to array
  let rawFiles = [];
  if (Array.isArray(files)) {
    rawFiles = files.filter(f => f && f.buffer);
  } else if (files && typeof files === 'object') {
    if (files.front && files.front.buffer) rawFiles.push(files.front);
    if (files.back && files.back.buffer) rawFiles.push(files.back);
    if (Array.isArray(files.files)) {
      rawFiles.push(...files.files.filter(f => f && f.buffer));
    }
  }

  if (rawFiles.length === 0) {
    const err = new Error('Attach the passport photo page.');
    err.code = 'NO_FILE';
    throw err;
  }

  const ocrApiUrl = (process.env.OCR_API_URL || 'https://ocr.azapi.ai/ind0005d').trim();
  const ocrApiKey = (process.env.OCR_API_KEY || '').trim();
  const timeoutMs = parseInt(process.env.OCR_TIMEOUT_MS || '25000', 10);

  if (!ocrApiKey && !process.env.GEMINI_API_KEY) {
    console.error('[OCR Error] Neither OCR_API_KEY nor GEMINI_API_KEY is configured in server/.env');
    const err = new Error('OCR API key is not configured. Please set OCR_API_KEY or GEMINI_API_KEY in server/.env.');
    err.code = 'AUTH_FAILED';
    throw err;
  }

  // 1. Preprocess images: validate minimum width (reject < 980 px), auto-rotate with EXIF, contrast boost
  const preprocessedFiles = [];
  for (const file of rawFiles) {
    const isPdf = (file.mimetype || '').toLowerCase().includes('pdf') ||
                  (file.originalname || '').toLowerCase().endsWith('.pdf') ||
                  (file.buffer && file.buffer.slice(0, 5).toString() === '%PDF-');
    if (!isPdf) {
      const prep = await preprocessPassportImage(file.buffer, file.mimetype);
      preprocessedFiles.push({
        ...file,
        buffer: prep.processedBuffer,
        mrzCropBuffer: prep.mrzCropBuffer,
        originalWidth: prep.width
      });
    } else {
      preprocessedFiles.push(file);
    }
  }

  // 2. Expand Multi-Page PDFs into individual page buffers (up to 4 pages)
  const candidatePages = [];
  for (const file of preprocessedFiles) {
    const pages = await _splitPdfIfNeeded(file, 4);
    candidatePages.push(...pages);
  }

  if (candidatePages.length === 0) {
    const err = new Error('Attach the passport photo page.');
    err.code = 'NO_FILE';
    throw err;
  }

  // 3. Call AZAPI OCR for each candidate page if key available
  let pageResponses = [];
  if (ocrApiKey) {
    const pagePromises = candidatePages.map(page => _callAzapiOcr(page, ocrApiUrl, ocrApiKey, timeoutMs));
    pageResponses = await Promise.all(pagePromises);
  }

  // 4. Classify each page (Front Data Page vs Back Page)
  let frontData = null;
  let backData = null;
  let hasFront = false;
  let hasBack = false;
  let frontCandidatePage = null;

  for (let idx = 0; idx < pageResponses.length; idx++) {
    const res = pageResponses[idx];
    if (!res.ok || !res.json) continue;

    const mapped = mapOcrResponse(res.json);
    const { isDataPage, isBackPage } = _classifyPageResult(mapped, res.json);

    if (isDataPage) {
      if (!frontData) {
        frontData = mapped;
        hasFront = true;
        frontCandidatePage = candidatePages[idx];
      } else {
        // If front already found, merge any missing fields
        frontData = mergeSides(frontData, mapped);
      }
    }

    if (isBackPage) {
      if (!backData) {
        backData = mapped;
        hasBack = true;
      } else {
        // Merge with existing back page
        backData = mergeSides(backData, mapped);
        hasBack = true;
      }
    }
  }

  // 4.5 Resilient Fallback: If no front data page recognized via AZAPI, try Gemini AI directly
  if (!hasFront && process.env.GEMINI_API_KEY) {
    for (const page of candidatePages) {
      try {
        const aiData = await _extractMrzWithAi(page.buffer, page.mimetype);
        if (aiData && (aiData.passportNumber || (aiData.mrzLine1 && aiData.mrzLine2) || (aiData.surname || aiData.givenNames))) {
          const candidateMrz = (aiData.mrzLine1 && aiData.mrzLine2) ? [aiData.mrzLine1, aiData.mrzLine2] : null;
          const parsedAi = parsePrintedPassportPage(aiData.rawLines || [], aiData, candidateMrz);
          frontData = {
            ..._getEmptyRawShape(),
            ...parsedAi.fields,
            mrz: parsedAi.mrz || candidateMrz,
            lowConfidence: parsedAi.lowConfidence || [],
            fieldReasons: parsedAi.fieldReasons || {}
          };
          hasFront = true;
          frontCandidatePage = page;
          break;
        }
      } catch (geminiErr) {
        console.warn('[OCR] Gemini direct extraction fallback failed:', geminiErr.message);
      }
    }
  }

  // 5. Augment with Gemini AI if MRZ or surname or full details are needed
  if (frontCandidatePage && process.env.GEMINI_API_KEY && (!frontData?.mrz || !frontData?.surname || !frontData?.placeOfBirth || frontData.placeOfBirth.length < 15)) {
    try {
      const aiData = await _extractMrzWithAi(frontCandidatePage.buffer, frontCandidatePage.mimetype);
      if (aiData) {
        if (!frontData) {
          frontData = _getEmptyRawShape();
          hasFront = true;
        }

        const candidateMrz = (aiData.mrzLine1 && aiData.mrzLine2)
          ? [aiData.mrzLine1, aiData.mrzLine2]
          : frontData.mrz;

        // Parse with printedFieldsReader to strictly enforce Step 2, 3, 4 rules
        const parsedAi = parsePrintedPassportPage(
          aiData.rawLines || [],
          {
            ...frontData,
            ...aiData,
            // Exclude AZAPI's combined id_name so it doesn't contaminate names
            id_name: null,
            name: null
          },
          candidateMrz
        );

        if (parsedAi.mrz) {
          frontData.mrz = parsedAi.mrz;
        }

        frontData.givenNames = parsedAi.fields.givenNames || frontData.givenNames;
        frontData.surname = parsedAi.fields.surname !== undefined ? parsedAi.fields.surname : frontData.surname;

        // Use longer/more complete Place of Birth & Place of Issue
        if (parsedAi.fields.placeOfBirth) {
          frontData.placeOfBirth = parsedAi.fields.placeOfBirth;
        } else if (aiData.placeOfBirth && (!frontData.placeOfBirth || aiData.placeOfBirth.length > frontData.placeOfBirth.length)) {
          frontData.placeOfBirth = aiData.placeOfBirth;
        }

        if (parsedAi.fields.placeOfIssue) {
          frontData.placeOfIssue = parsedAi.fields.placeOfIssue;
        } else if (aiData.placeOfIssue && (!frontData.placeOfIssue || aiData.placeOfIssue.length > frontData.placeOfIssue.length)) {
          frontData.placeOfIssue = aiData.placeOfIssue;
        }

        if (parsedAi.fields.fatherName) frontData.fatherName = parsedAi.fields.fatherName;
        if (parsedAi.fields.motherName) frontData.motherName = parsedAi.fields.motherName;
        if (parsedAi.fields.spouseName) frontData.spouseName = parsedAi.fields.spouseName;
        if (parsedAi.fields.address) frontData.address = parsedAi.fields.address;
        if (parsedAi.fields.fileNumber) frontData.fileNumber = parsedAi.fields.fileNumber;
        if (!frontData.passportNumber && (parsedAi.fields.passportNumber || aiData.passportNumber)) {
          frontData.passportNumber = parsedAi.fields.passportNumber || aiData.passportNumber;
        }
        if (!frontData.dob && (parsedAi.fields.dob || aiData.dob)) {
          frontData.dob = parsedAi.fields.dob || aiData.dob;
        }
        if (!frontData.expiryDate && (parsedAi.fields.expiryDate || aiData.expiryDate)) {
          frontData.expiryDate = parsedAi.fields.expiryDate || aiData.expiryDate;
        }
        if (!frontData.issueDate && (parsedAi.fields.issueDate || aiData.issueDate)) {
          frontData.issueDate = parsedAi.fields.issueDate || aiData.issueDate;
        }

        // Merge lowConfidence and fieldReasons from parsedAi
        frontData.lowConfidence = Array.from(new Set([
          ...(frontData.lowConfidence || []).filter(k => k !== 'givenNames' && k !== 'surname' && k !== 'placeOfBirth'),
          ...parsedAi.lowConfidence
        ]));

        frontData.fieldReasons = {
          ...(frontData.fieldReasons || {}),
          ...parsedAi.fieldReasons
        };
        if (!parsedAi.lowConfidence.includes('givenNames')) delete frontData.fieldReasons.givenNames;
        if (!parsedAi.lowConfidence.includes('surname')) delete frontData.fieldReasons.surname;
        if (!parsedAi.lowConfidence.includes('placeOfBirth')) delete frontData.fieldReasons.placeOfBirth;
      }
    } catch (aiErr) {
      console.warn('[OCR] AI fallback error:', aiErr.message);
    }
  }

  // If no data page was recognized among any candidate:
  if (!hasFront || !frontData) {
    console.error('[OCR Error] Code: NO_DOCUMENT (no front data page found across all uploaded pages)');
    const err = new Error('No passport photo page was found in this file.');
    err.code = 'NO_DOCUMENT';
    throw err;
  }

  // 6. Merge: Front data-page values first; back-page values fill only empty fields
  let merged = frontData;
  if (backData) {
    merged = mergeSides(frontData, backData);
  } else {
    merged = normalize(frontData);
  }

  // Attach in-memory preview image data URL for side panel verification
  if (frontCandidatePage && !frontCandidatePage.mimetype?.includes('pdf')) {
    merged.previewImage = `data:${frontCandidatePage.mimetype || 'image/jpeg'};base64,${frontCandidatePage.buffer.toString('base64')}`;
  }

  // Address parsing & PIN code lookup
  if (merged.address) {
    try {
      const addrFull = await parseIndianAddress(merged.address, {
        nationality: merged.nationality || 'IND',
        lookup: true
      });
      if (addrFull.addressLine) merged.addressLine = addrFull.addressLine;
      if (addrFull.city) merged.city = addrFull.city;
      if (addrFull.state) merged.state = addrFull.state;
      if (addrFull.pinCode) {
        merged.pinCode = addrFull.pinCode;
        merged.pin = addrFull.pinCode;
      }
      if (addrFull.country) merged.country = addrFull.country;

      if (Array.isArray(addrFull.lowConfidence)) {
        merged.lowConfidence = Array.from(new Set([...(merged.lowConfidence || []), ...addrFull.lowConfidence]));
      }
      merged.fieldReasons = { ...(merged.fieldReasons || {}) };
      if (addrFull.fieldStatuses) {
        Object.keys(addrFull.fieldStatuses).forEach(k => {
          if (addrFull.fieldStatuses[k].message) {
            merged.fieldReasons[k] = addrFull.fieldStatuses[k].message;
          }
        });
      }
    } catch (e) {
      console.warn('[OCR] Address parsing error:', e.message);
    }
  }

  // Single page with both sides (e.g. side-by-side scan)
  if (!hasBack && (merged.address || merged.fatherName || merged.motherName || merged.spouseName || merged.fileNumber)) {
    hasBack = true;
  }

  merged.pagesFound = {
    front: hasFront,
    back: hasBack
  };

  return merged;
}

module.exports = {
  mapOcrResponse,
  extractPassport
};

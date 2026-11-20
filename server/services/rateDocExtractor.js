/**
 * Rate Document Extraction Service (Gemini 3.5 Flash Multimodal)
 * 
 * Supports:
 * - PDF documents (.pdf)
 * - Images (.png, .jpg, .jpeg, .webp)
 * - Spreadsheets (.xlsx, .xls, .csv)
 * - Word documents (.docx, .doc)
 * - Text files (.txt, .md)
 * 
 * Extracts:
 * - Plan Name
 * - Sum Insured (dynamically handles any sum insured, e.g. $75k, $150k, $300k, $600k)
 * - Region ("Excluding" or "Including" USA/Canada)
 * - Age Bands (exact bands from document, e.g. 0-40, 41-60, 61-70, 71-80, 81-85)
 * - Days Slabs (exact slabs from document, e.g. 1-4, 5-7, 8-10, 11-15, ..., 180, 365+)
 * - 2D Rate Matrix (INR premiums)
 */

const XLSX = require('xlsx');

const STANDARD_COVERAGES = [50000, 75000, 100000, 150000, 200000, 250000, 300000, 500000, 600000, 750000, 1000000];

/**
 * Extract plain text & tables from a .docx buffer without external dependencies.
 */
function extractTextFromDocx(buffer) {
  try {
    const CFB = require('cfb');
    const zip = CFB.read(buffer, { type: 'buffer' });
    const docEntry = CFB.find(zip, 'word/document.xml');
    if (!docEntry || !docEntry.content) return '';

    const xml = Buffer.from(docEntry.content).toString('utf8');
    // Extract text paragraphs and table cells
    return xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tc>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
  } catch (err) {
    console.warn('[rateDocExtractor] DOCX text extraction fallback:', err.message);
    return '';
  }
}

/**
 * Format Excel / CSV workbook into clean structured text representation for Gemini
 */
function formatWorkbookToText(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const parts = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv && csv.trim()) {
        parts.push(`=== Sheet: "${sheetName}" ===\n${csv.trim()}\n`);
      }
    }
    return parts.join('\n\n');
  } catch (err) {
    console.warn('[rateDocExtractor] SheetJS text conversion error:', err.message);
    return '';
  }
}

/**
 * Main entry point: Extracts rate tables from an uploaded document buffer.
 */
async function extractRatesFromDocument({
  buffer,
  mimeType = '',
  originalName = 'rates_document',
  existingCoverages = STANDARD_COVERAGES
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server/.env');
  }

  const ext = (originalName.split('.').pop() || '').toLowerCase();
  let normalizedMime = mimeType.toLowerCase();

  // Determine file kind and prepare content parts for Gemini
  let contentParts = [];
  const promptInstruction = `You are an expert insurance rate table extraction AI.
Analyze the provided document (which may be an insurance rate chart, brochure, policy schedule, or rate sheet).

Your mission is to extract EVERY rate table and category with 100% precision:
1. "planName": The name of the insurance plan if indicated (e.g. "Travel Elite", "Global Travel Shield", "Standard Plan", etc.), or null if not explicitly named.
2. "groups": An array of rate table groups. Documents often contain multiple tables for different Sum Insured values and/or Regions.
For each rate table group, extract:
- "sumInsured": Numeric integer amount of coverage (e.g. 50000, 75000, 100000, 150000, 200000, 250000, 300000, 500000, 1000000).
  * Extract the EXACT sum insured from the document, even if unusual (e.g. 75000, 150000, 300000, 600000).
  * Convert notations like "$50k" -> 50000, "USD 100,000" -> 100000, "USD 1,000,000" -> 1000000.
- "coverage": String, MUST be either "Excluding" or "Including":
  * "Excluding": Worldwide excluding USA & Canada / Non-USA / Asia / Schengen / Excl US/CA.
  * "Including": Worldwide including USA & Canada / Worldwide / Incl US/CA / USA/Canada.
- "daysSlabs": Array of day slab objects in the exact row order they appear in the table:
  * Each object MUST have:
    - "from": integer (e.g. 1)
    - "to": integer (e.g. 4)
    - "label": string (e.g. "1-4" or "1 to 4" or "365+")
  * For open-ended slabs like "85+" or "365+", set "to": 9999.
  * For single days like "180", set "from": 180, "to": 180.
- "ageBands": Array of age band objects in the exact column order they appear in the table:
  * Each object MUST have:
    - "from": integer (e.g. 0)
    - "to": integer (e.g. 40)
    - "label": string (e.g. "0-40" or "41-60" or "85+")
  * For open-ended age bands like "85+", set "to": 120.
- "matrix": A 2-dimensional array of numbers representing premiums (INR):
  * matrix[r][c] corresponds to daysSlabs[r] and ageBands[c].
  * Numbers should be clean integers (e.g. 520, 610, 1450).
  * If a cell is blank or not covered, use null.
  * Strip any currency symbols (₹, $, Rs), commas, or whitespace.

CRITICAL INSTRUCTIONS:
- Extract EVERY rate table present in the document. If there are tables for $50,000, $100,000, $250,000, etc., extract a separate group for each Sum Insured and Region combination.
- Ensure matrix rows match daysSlabs length and matrix columns match ageBands length.
- Preserve the exact days slabs and age bands as printed in the document.`;

  // 1. PDF
  if (ext === 'pdf' || normalizedMime.includes('pdf')) {
    contentParts = [
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: buffer.toString('base64')
        }
      },
      { text: promptInstruction }
    ];
  }
  // 2. Images (PNG, JPG, JPEG, WEBP, GIF, BMP)
  else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) || normalizedMime.startsWith('image/')) {
    let imgMime = 'image/jpeg';
    if (ext === 'png' || normalizedMime.includes('png')) imgMime = 'image/png';
    else if (ext === 'webp' || normalizedMime.includes('webp')) imgMime = 'image/webp';

    contentParts = [
      {
        inlineData: {
          mimeType: imgMime,
          data: buffer.toString('base64')
        }
      },
      { text: promptInstruction }
    ];
  }
  // 3. Word Document (.docx, .doc)
  else if (ext === 'docx' || ext === 'doc' || normalizedMime.includes('word') || normalizedMime.includes('officedocument.wordprocessingml')) {
    const docText = extractTextFromDocx(buffer);
    if (!docText) {
      throw new Error('Could not read text from Word document. Please ensure the file is not corrupted or export as PDF.');
    }
    contentParts = [
      { text: `${promptInstruction}\n\nDOCUMENT CONTENT (Word .docx):\n\n${docText}` }
    ];
  }
  // 4. Excel / CSV (.xlsx, .xls, .csv)
  else if (['xlsx', 'xls', 'csv'].includes(ext) || normalizedMime.includes('spreadsheet') || normalizedMime.includes('csv')) {
    const sheetText = formatWorkbookToText(buffer);
    if (!sheetText) {
      throw new Error('Could not read sheets from workbook. Please ensure the file is valid.');
    }
    contentParts = [
      { text: `${promptInstruction}\n\nSPREADSHEET TABLES (CSV Format):\n\n${sheetText}` }
    ];
  }
  // 5. Plain text or markdown
  else {
    const textContent = buffer.toString('utf8');
    contentParts = [
      { text: `${promptInstruction}\n\nDOCUMENT TEXT:\n\n${textContent}` }
    ];
  }

  // Define JSON Schema for Gemini 3.5 Flash
  const responseSchema = {
    type: "OBJECT",
    properties: {
      planName: { type: "STRING" },
      groups: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            sumInsured: { type: "INTEGER" },
            coverage: { type: "STRING", enum: ["Excluding", "Including"] },
            daysSlabs: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  from: { type: "INTEGER" },
                  to: { type: "INTEGER" },
                  label: { type: "STRING" }
                },
                required: ["from", "to", "label"]
              }
            },
            ageBands: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  from: { type: "INTEGER" },
                  to: { type: "INTEGER" },
                  label: { type: "STRING" }
                },
                required: ["from", "to", "label"]
              }
            },
            matrix: {
              type: "ARRAY",
              items: {
                type: "ARRAY",
                items: { type: "NUMBER" }
              }
            }
          },
          required: ["sumInsured", "coverage", "daysSlabs", "ageBands", "matrix"]
        }
      }
    },
    required: ["groups"]
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        parts: contentParts
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[rateDocExtractor] Gemini API error:', response.status, errText);
    throw new Error(`Gemini AI extraction failed (${response.status}): ${errText}`);
  }

  const resData = await response.json();
  const rawJsonText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJsonText) {
    throw new Error('Gemini AI returned empty content for the document.');
  }

  let extractedData;
  try {
    extractedData = JSON.parse(rawJsonText);
  } catch (parseErr) {
    throw new Error('Failed to parse Gemini AI response as JSON: ' + parseErr.message);
  }

  const rawGroups = Array.isArray(extractedData.groups) ? extractedData.groups : [];
  const planName = extractedData.planName || null;

  if (rawGroups.length === 0) {
    throw new Error('No insurance rate tables could be detected in the uploaded document.');
  }

  // Post-process and normalize groups into the frontend standard format
  const normalizedGroups = [];
  const allErrors = [];
  const allWarnings = [];
  let totalRatesCount = 0;
  let totalDaysSlabsCount = 0;

  const knownCoverages = new Set(existingCoverages.map(Number));

  rawGroups.forEach((g, idx) => {
    let sumInsured = Number(g.sumInsured);
    if (!Number.isFinite(sumInsured) || sumInsured <= 0) {
      sumInsured = 50000;
    }

    const coverage = (g.coverage && String(g.coverage).toLowerCase().includes('incl')) ? 'Including' : 'Excluding';
    const coverageLabel = coverage === 'Including' ? 'Incl USA/Canada' : 'Excl USA/Canada';

    // Normalize Days Slabs
    const daysSlabs = (Array.isArray(g.daysSlabs) ? g.daysSlabs : []).map(s => {
      let f = Number(s.from) || 1;
      let t = Number(s.to) || f;
      if (f > t) [f, t] = [t, f];
      const label = s.label || (t >= 9999 ? `${f}+` : (f === t ? `${f}` : `${f}–${t}`));
      return {
        from: f,
        to: t,
        min: f,
        max: t,
        label: label
      };
    });

    // Normalize Age Bands
    const ageBands = (Array.isArray(g.ageBands) ? g.ageBands : []).map(a => {
      let f = Number(a.from) || 0;
      let t = Number(a.to) || f;
      if (f > t) [f, t] = [t, f];
      const label = a.label || (t >= 120 ? `${f}+` : (f === t ? `${f}` : `${f}–${t}`));
      return {
        from: f,
        to: t,
        min: f,
        max: t,
        label: label
      };
    });

    // Normalize 2D Matrix
    const matrix = [];
    const matrixData = {};
    const ratesList = [];
    let groupRatesCount = 0;

    const rawMatrix = Array.isArray(g.matrix) ? g.matrix : [];

    for (let r = 0; r < daysSlabs.length; r++) {
      const row = [];
      const slab = daysSlabs[r];
      const rawRow = Array.isArray(rawMatrix[r]) ? rawMatrix[r] : [];

      for (let c = 0; c < ageBands.length; c++) {
        const band = ageBands[c];
        const rawVal = rawRow[c];

        let numVal = null;
        if (rawVal !== undefined && rawVal !== null && rawVal !== '' && !isNaN(rawVal)) {
          numVal = Math.round(Number(rawVal));
          if (numVal > 0) {
            matrixData[`${r}_${c}`] = numVal;
            ratesList.push({
              daysFrom: slab.from,
              daysTo: slab.to,
              ageFrom: band.from,
              ageTo: band.to,
              premium: numVal,
              currency: 'INR'
            });
            groupRatesCount++;
          } else {
            numVal = null;
          }
        }
        row.push(numVal);
      }
      matrix.push(row);
    }

    const isNewSumInsured = !knownCoverages.has(sumInsured);
    const groupWarnings = [];

    if (isNewSumInsured) {
      groupWarnings.push({
        message: `New Sum Insured ($${sumInsured.toLocaleString()}) detected from document. It will be added to the website plan.`,
        cellRef: 'Header'
      });
    }

    const groupObj = {
      id: `${sumInsured}_${coverage}_${idx}`,
      sumInsured,
      coverage,
      coverageLabel,
      sheetName: originalName,
      layout: 'Gemini AI Vision Extracted',
      daysSlabs,
      ageBands,
      rates: ratesList,
      ratesCount: groupRatesCount,
      matrix,
      matrixData,
      isNewSumInsured,
      errors: [],
      warnings: groupWarnings,
      selected: groupRatesCount > 0,
      status: groupRatesCount > 0 ? (groupWarnings.length > 0 ? 'warning' : 'ok') : 'error'
    };

    normalizedGroups.push(groupObj);
    totalRatesCount += groupRatesCount;
    totalDaysSlabsCount += daysSlabs.length;

    groupWarnings.forEach(w => allWarnings.push(w));
  });

  return {
    success: true,
    fileName: originalName,
    planName,
    groups: normalizedGroups,
    sheets: [
      {
        name: originalName,
        layout: `Gemini AI (${normalizedGroups.length} rate tables detected)`
      }
    ],
    allErrors,
    allWarnings,
    totalRates: totalRatesCount,
    totalDaysSlabs: totalDaysSlabsCount
  };
}

module.exports = {
  extractRatesFromDocument,
  extractTextFromDocx,
  formatWorkbookToText,
  STANDARD_COVERAGES
};

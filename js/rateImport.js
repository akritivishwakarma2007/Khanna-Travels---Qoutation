/**
 * Rate Table Import Module — Pure Parsing, Layout Detection, Normalization & Validation
 * No UI code. Fully testable in browser and Node.js.
 */

// Universal reference to XLSX (browser window or Node global)
const getXLSX = () => {
  if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
  if (typeof globalThis !== 'undefined' && globalThis.XLSX) return globalThis.XLSX;
  try {
    return require('./vendor/xlsx.full.min.js');
  } catch {
    return null;
  }
};

export const EXCLUDING_USA_CANADA = 'Excluding';
export const INCLUDING_USA_CANADA = 'Including';

/**
 * Normalizes Sum Insured to integer.
 * Examples: 75000, "75,000", "$75,000", "USD 75000", "USD 1,000,000" => 75000, 1000000
 */
export function parseSumInsured(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) && val > 0 ? Math.round(val) : null;
  }
  const clean = String(val).replace(/[\$,\s]/g, '');
  const m = clean.match(/(?:USD)?\s*(\d+)/i);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Normalizes Coverage string.
 * Any text containing "excl" maps to 'Excluding' (EXCLUDING_USA_CANADA).
 * Any text containing "incl" maps to 'Including' (INCLUDING_USA_CANADA).
 * Anything else returns null.
 */
export function parseCoverage(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().toLowerCase();
  if (s.includes('excl')) return EXCLUDING_USA_CANADA;
  if (s.includes('incl')) return INCLUDING_USA_CANADA;
  return null;
}

/**
 * Normalizes Days Slab string to { min, max, from, to, label }.
 * Accepts "1-4", "1--4", "1 – 4", "1 to 4", "180".
 */
export function parseDaysSlab(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val <= 0) return null;
    const n = Math.round(val);
    return { min: n, max: n, from: n, to: n, label: String(n) };
  }
  const s = String(val).trim();
  if (!s) return null;

  // Single number
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return { min: n, max: n, from: n, to: n, label: String(n) };
  }

  // Plus notation: "365+" or "> 365"
  const plusMatch = s.match(/^(\d+)\s*\+$/) || s.match(/^>\s*(\d+)$/);
  if (plusMatch) {
    const n = parseInt(plusMatch[1], 10);
    return { min: n, max: 9999, from: n, to: 9999, label: `${n}+` };
  }

  // Range: "1-4", "1--4", "1 – 4", "1 to 4", "1 - 4 days"
  const m = s.match(/(\d+)\s*(?:--|-|–|—|to)\s*(\d+)/i);
  if (m) {
    const min = parseInt(m[1], 10);
    const max = parseInt(m[2], 10);
    if (min <= max) {
      return { min, max, from: min, to: max, label: `${min}–${max}` };
    }
    return { min: max, max: min, from: max, to: min, label: `${max}–${min}` };
  }

  return null;
}

/**
 * Normalizes Age Band header string to { min, max, from, to, label }.
 * Examples: "0-40 YRS", "0-40 Yrs (INR)", "41 – 60", "61-70", "0 to 40"
 */
export function parseAgeBand(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;

  // Match range: "0-40", "41 – 60", "0 to 40"
  const m = s.match(/(\d+)\s*(?:--|-|–|—|to)\s*(\d+)/i);
  if (m) {
    const min = parseInt(m[1], 10);
    const max = parseInt(m[2], 10);
    if (min <= max) {
      return { min, max, from: min, to: max, label: `${min}–${max}` };
    }
    return { min: max, max: min, from: max, to: min, label: `${max}–${min}` };
  }

  // Plus notation: "85+"
  const plusMatch = s.match(/(\d+)\s*\+/);
  if (plusMatch) {
    const min = parseInt(plusMatch[1], 10);
    return { min, max: 120, from: min, to: 120, label: `${min}+` };
  }

  return null;
}

/**
 * Normalizes Premium value.
 * Parse as number, strip commas and "₹".
 * Blank cells -> { isEmpty: true }
 * Text / negative / zero -> { error: true, message: string }
 * Valid number -> { value: number }
 */
export function parsePremium(val) {
  if (val === null || val === undefined || val === '') {
    return { isEmpty: true };
  }
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) {
      return { error: true, message: `Invalid premium: ${val}. Must be greater than 0.` };
    }
    return { value: Math.round(val) };
  }
  const clean = String(val).replace(/[\u20B9₹,INR\sRs\.]/gi, '').trim();
  if (clean === '') {
    return { isEmpty: true };
  }
  const num = Number(clean);
  if (isNaN(num) || num <= 0) {
    return { error: true, message: `Invalid premium text: "${val}". Must be a number greater than 0.` };
  }
  return { value: Math.round(num) };
}

/**
 * Gets cell value considering merged cells and "look left / look up" for titles.
 */
export function getCellValue(sheet, r, c) {
  const XLSX = getXLSX();
  if (!XLSX || !sheet) return undefined;

  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
    return cell.v;
  }

  // Check SheetJS '!merges'
  if (Array.isArray(sheet['!merges'])) {
    for (const merge of sheet['!merges']) {
      if (r >= merge.s.r && r <= merge.e.r && c >= merge.s.c && c <= merge.e.c) {
        const originAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
        const originCell = sheet[originAddr];
        if (originCell && originCell.v !== undefined) {
          return originCell.v;
        }
      }
    }
  }

  return undefined;
}

/**
 * Looks for text near (r, c) looking left or up (up to 3 cells).
 * Useful when titles are not merged or slightly offset.
 */
export function findNearbyText(sheet, r, c, maxSteps = 3) {
  // Check same cell first
  let val = getCellValue(sheet, r, c);
  if (val !== undefined && String(val).trim() !== '') return String(val).trim();

  // Look up 1-2 rows
  for (let dr = 1; dr <= 2 && r - dr >= 0; dr++) {
    val = getCellValue(sheet, r - dr, c);
    if (val !== undefined && String(val).trim() !== '') return String(val).trim();
  }

  // Look left
  for (let dc = 1; dc <= maxSteps && c - dc >= 0; dc++) {
    val = getCellValue(sheet, r, c - dc);
    if (val !== undefined && String(val).trim() !== '') return String(val).trim();
  }

  return null;
}

/**
 * Detects sheet layout:
 * - 'Layout A' (Flat table: sum insured, coverage, days slab, age columns)
 * - 'Layout B' (Matrix blocks: Days Slab + age columns with coverage titles above)
 * - null (unrecognized)
 */
export function detectSheetLayout(sheet, sheetName = '') {
  const XLSX = getXLSX();
  if (!XLSX || !sheet || !sheet['!ref']) return null;

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const maxScanRows = Math.min(range.e.r, 15);

  // 1. Scan for Layout A:
  // First 10 rows: contains a "days" column AND at least one age-band column
  // AND has "sum insured" or "coverage" columns.
  for (let r = range.s.r; r <= maxScanRows; r++) {
    let hasDaysCol = false;
    let hasSumInsuredCol = false;
    let hasCoverageCol = false;
    let ageBandsFound = 0;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const val = getCellValue(sheet, r, c);
      if (val === undefined || val === null) continue;
      const s = String(val).trim().toLowerCase();

      if (/days?\s*slab|duration|days/i.test(s) && !parseAgeBand(s)) {
        hasDaysCol = true;
      } else if (/sum\s*insured|suminsured|\bsi\b/i.test(s)) {
        hasSumInsuredCol = true;
      } else if (/coverage|region|scope/i.test(s)) {
        hasCoverageCol = true;
      } else if (parseAgeBand(s)) {
        ageBandsFound++;
      }
    }

    if (hasDaysCol && ageBandsFound >= 1 && (hasSumInsuredCol || hasCoverageCol)) {
      return {
        layout: 'Layout A',
        headerRow: r
      };
    }
  }

  // 2. Scan for Layout B:
  // Matrix blocks: search for "Days Slab" header cells with age band columns next to them
  // and coverage titles above them.
  const daysSlabCells = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const val = getCellValue(sheet, r, c);
      if (val === undefined || val === null) continue;
      const s = String(val).trim().toLowerCase();

      if (/days?\s*slab|days/i.test(s) && !parseAgeBand(s)) {
        // Check if next column has an age band
        const nextVal = getCellValue(sheet, r, c + 1);
        if (nextVal && parseAgeBand(nextVal)) {
          daysSlabCells.push({ r, c });
        }
      }
    }
  }

  if (daysSlabCells.length > 0) {
    return {
      layout: 'Layout B',
      blocks: daysSlabCells
    };
  }

  return null;
}

/**
 * Parses Layout A (Flat table).
 */
export function parseLayoutA(sheet, sheetName, seenGroups = new Map(), options = {}) {
  const XLSX = getXLSX();
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const maxScanRows = Math.min(range.e.r, 15);

  let headerRow = -1;
  let sumInsuredCol = -1;
  let coverageCol = -1;
  let daysCol = -1;
  const ageCols = [];

  // Find header row
  for (let r = range.s.r; r <= maxScanRows; r++) {
    let fDays = -1;
    let fSum = -1;
    let fCov = -1;
    const fAges = [];

    for (let c = range.s.c; c <= range.e.c; c++) {
      const val = getCellValue(sheet, r, c);
      if (val === undefined || val === null) continue;
      const s = String(val).trim();

      if (/days?\s*slab|duration|days/i.test(s) && !parseAgeBand(s)) {
        fDays = c;
      } else if (/sum\s*insured|suminsured|\bsi\b/i.test(s)) {
        fSum = c;
      } else if (/coverage|region|scope/i.test(s)) {
        fCov = c;
      } else {
        const band = parseAgeBand(s);
        if (band) {
          fAges.push({ col: c, band, header: s });
        }
      }
    }

    if (fDays !== -1 && fAges.length > 0) {
      headerRow = r;
      daysCol = fDays;
      sumInsuredCol = fSum;
      coverageCol = fCov;
      ageCols.push(...fAges);
      break;
    }
  }

  if (headerRow === -1 || ageCols.length === 0) {
    return { groups: [], errors: [{ sheet: sheetName, cellRef: `${sheetName}!A1`, message: 'Could not detect header row for Layout A.' }], warnings: [] };
  }

  const groupsMap = new Map(); // key `${sumInsured}_${coverage}`
  const errors = [];
  const warnings = [];

  // Read data rows
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const rawDays = getCellValue(sheet, r, daysCol);
    if (rawDays === undefined || rawDays === null || String(rawDays).trim() === '') {
      // Check if entire row is empty; if so continue or stop
      continue;
    }

    const daysSlab = parseDaysSlab(rawDays);
    const daysCellRef = `${sheetName}!${XLSX.utils.encode_cell({ r, c: daysCol })}`;
    if (!daysSlab) {
      errors.push({
        sheet: sheetName,
        cellRef: daysCellRef,
        message: `Invalid days slab "${rawDays}".`
      });
      continue;
    }

    // Sum Insured
    const rawSI = sumInsuredCol !== -1 ? getCellValue(sheet, r, sumInsuredCol) : null;
    const sumInsured = parseSumInsured(rawSI);
    const siCellRef = `${sheetName}!${XLSX.utils.encode_cell({ r, c: sumInsuredCol !== -1 ? sumInsuredCol : 0 })}`;
    if (!sumInsured) {
      errors.push({
        sheet: sheetName,
        cellRef: siCellRef,
        message: `Invalid or missing Sum Insured "${rawSI}".`
      });
      continue;
    }

    // Coverage
    const rawCov = coverageCol !== -1 ? getCellValue(sheet, r, coverageCol) : null;
    const coverage = parseCoverage(rawCov);
    const covCellRef = `${sheetName}!${XLSX.utils.encode_cell({ r, c: coverageCol !== -1 ? coverageCol : 0 })}`;
    if (!coverage) {
      errors.push({
        sheet: sheetName,
        cellRef: covCellRef,
        message: `Invalid coverage "${rawCov}". Must contain "excl" or "incl".`
      });
      continue;
    }

    const groupKey = `${sumInsured}_${coverage}`;

    // Deduplication across sheets
    if (seenGroups.has(groupKey) && seenGroups.get(groupKey) !== sheetName) {
      warnings.push({
        sheet: sheetName,
        cellRef: `${sheetName}!A${r + 1}`,
        message: `Duplicate source for USD ${sumInsured.toLocaleString()} (${coverage}) in sheet "${sheetName}", ignored.`
      });
      continue;
    }
    seenGroups.set(groupKey, sheetName);

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        id: groupKey,
        sumInsured,
        coverage,
        coverageLabel: coverage === EXCLUDING_USA_CANADA ? 'Excluding USA/Canada' : 'Including USA/Canada',
        sheetName,
        layout: 'Layout A',
        daysSlabsMap: new Map(),
        ageBandsMap: new Map(),
        ratesMap: new Map(), // key `${daysFrom}-${daysTo}_${ageFrom}-${ageTo}`
        ratesList: [],
        errors: [],
        warnings: []
      });
    }

    const group = groupsMap.get(groupKey);

    // Register Days Slab
    const slabKey = `${daysSlab.from}_${daysSlab.to}`;
    if (!group.daysSlabsMap.has(slabKey)) {
      group.daysSlabsMap.set(slabKey, daysSlab);
    }

    // Parse each age column
    for (const ageCol of ageCols) {
      const ageBand = ageCol.band;
      const bandKey = `${ageBand.from}_${ageBand.to}`;
      if (!group.ageBandsMap.has(bandKey)) {
        group.ageBandsMap.set(bandKey, ageBand);
      }

      const rawPrem = getCellValue(sheet, r, ageCol.col);
      const cellRef = `${sheetName}!${XLSX.utils.encode_cell({ r, c: ageCol.col })}`;
      const prem = parsePremium(rawPrem);

      if (prem.isEmpty) continue;

      if (prem.error) {
        group.errors.push({
          sheet: sheetName,
          cellRef,
          message: prem.message
        });
        errors.push({
          sheet: sheetName,
          cellRef,
          message: prem.message
        });
        continue;
      }

      const rateKey = `${slabKey}__${bandKey}`;
      if (group.ratesMap.has(rateKey)) {
        const dupErr = `Duplicate rate entry for days ${daysSlab.label} and age ${ageBand.label}.`;
        group.errors.push({ sheet: sheetName, cellRef, message: dupErr });
        errors.push({ sheet: sheetName, cellRef, message: dupErr });
        continue;
      }

      group.ratesMap.set(rateKey, {
        daysSlab,
        ageBand,
        premium: prem.value,
        cellRef
      });
      group.ratesList.push({
        daysSlab,
        ageBand,
        premium: prem.value,
        cellRef
      });
    }
  }

  // Convert groupsMap to array and format
  const groups = Array.from(groupsMap.values()).map(g => _finalizeGroup(g));
  return { groups, errors, warnings };
}

/**
 * Parses Layout B (Matrix blocks: one sheet per sum insured, side-by-side blocks).
 */
export function parseLayoutB(sheet, sheetName, seenGroups = new Map(), options = {}) {
  const XLSX = getXLSX();
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const errors = [];
  const warnings = [];

  // 1. Detect Sum Insured from sheet name or title cells in top 5 rows
  let sumInsured = parseSumInsured(sheetName);
  if (!sumInsured) {
    for (let r = 0; r <= Math.min(5, range.e.r); r++) {
      for (let c = 0; c <= Math.min(10, range.e.c); c++) {
        const val = getCellValue(sheet, r, c);
        if (val && /sum\s*insured/i.test(String(val))) {
          sumInsured = parseSumInsured(val);
          if (sumInsured) break;
        }
      }
      if (sumInsured) break;
    }
  }

  if (!sumInsured) {
    errors.push({
      sheet: sheetName,
      cellRef: `${sheetName}!A1`,
      message: `Could not determine Sum Insured for sheet "${sheetName}". Sheet name or title cell must specify sum insured.`
    });
    return { groups: [], errors, warnings };
  }

  // 2. Find all "Days Slab" header blocks
  const blocks = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const val = getCellValue(sheet, r, c);
      if (val === undefined || val === null) continue;
      const s = String(val).trim().toLowerCase();

      if (/days?\s*slab|days/i.test(s) && !parseAgeBand(s)) {
        // Collect consecutive age band columns to the right
        const ageCols = [];
        let nextC = c + 1;
        while (nextC <= range.e.c) {
          const hVal = getCellValue(sheet, r, nextC);
          const band = parseAgeBand(hVal);
          if (!band) break;
          ageCols.push({ col: nextC, band, header: String(hVal).trim() });
          nextC++;
        }

        if (ageCols.length > 0) {
          // Look 1–2 rows above to find Coverage title
          let coverage = null;
          let covCellRef = `${sheetName}!${XLSX.utils.encode_cell({ r: Math.max(0, r - 1), c })}`;

          for (let dr = 1; dr <= 2 && r - dr >= 0; dr++) {
            // Check along columns c through nextC - 1
            for (let checkC = c; checkC < nextC; checkC++) {
              const aboveVal = getCellValue(sheet, r - dr, checkC);
              const detected = parseCoverage(aboveVal);
              if (detected) {
                coverage = detected;
                covCellRef = `${sheetName}!${XLSX.utils.encode_cell({ r: r - dr, c: checkC })}`;
                break;
              }
            }
            if (coverage) break;
          }

          blocks.push({
            headerRow: r,
            daysCol: c,
            ageCols,
            coverage,
            covCellRef
          });

          // Skip columns already in this block
          c = nextC - 1;
        }
      }
    }
  }

  if (blocks.length === 0) {
    errors.push({
      sheet: sheetName,
      cellRef: `${sheetName}!A1`,
      message: `No matrix blocks with "Days Slab" and age columns found in sheet "${sheetName}".`
    });
    return { groups: [], errors, warnings };
  }

  const groups = [];

  for (const block of blocks) {
    if (!block.coverage) {
      errors.push({
        sheet: sheetName,
        cellRef: block.covCellRef,
        message: `Missing coverage title above block at column ${XLSX.utils.encode_col(block.daysCol)} (expected "Excluding USA & Canada" or "Including USA & Canada").`
      });
      continue;
    }

    const groupKey = `${sumInsured}_${block.coverage}`;

    // Deduplication across sheets
    if (seenGroups.has(groupKey) && seenGroups.get(groupKey) !== sheetName) {
      warnings.push({
        sheet: sheetName,
        cellRef: block.covCellRef,
        message: `Duplicate source for USD ${sumInsured.toLocaleString()} (${block.coverage}) in sheet "${sheetName}", ignored.`
      });
      continue;
    }
    seenGroups.set(groupKey, sheetName);

    const group = {
      id: groupKey,
      sumInsured,
      coverage: block.coverage,
      coverageLabel: block.coverage === EXCLUDING_USA_CANADA ? 'Excluding USA/Canada' : 'Including USA/Canada',
      sheetName,
      layout: 'Layout B',
      daysSlabsMap: new Map(),
      ageBandsMap: new Map(),
      ratesMap: new Map(),
      ratesList: [],
      errors: [],
      warnings: []
    };

    block.ageCols.forEach(ac => {
      group.ageBandsMap.set(`${ac.band.from}_${ac.band.to}`, ac.band);
    });

    // Read data rows starting from headerRow + 1 until first empty row in daysCol
    for (let r = block.headerRow + 1; r <= range.e.r; r++) {
      const rawDays = getCellValue(sheet, r, block.daysCol);
      if (rawDays === undefined || rawDays === null || String(rawDays).trim() === '') {
        // First empty row marks end of block data
        break;
      }

      const daysSlab = parseDaysSlab(rawDays);
      const daysCellRef = `${sheetName}!${XLSX.utils.encode_cell({ r, c: block.daysCol })}`;
      if (!daysSlab) {
        group.errors.push({ sheet: sheetName, cellRef: daysCellRef, message: `Invalid days slab "${rawDays}".` });
        errors.push({ sheet: sheetName, cellRef: daysCellRef, message: `Invalid days slab "${rawDays}".` });
        continue;
      }

      const slabKey = `${daysSlab.from}_${daysSlab.to}`;
      if (!group.daysSlabsMap.has(slabKey)) {
        group.daysSlabsMap.set(slabKey, daysSlab);
      }

      for (const ageCol of block.ageCols) {
        const ageBand = ageCol.band;
        const bandKey = `${ageBand.from}_${ageBand.to}`;
        const rawPrem = getCellValue(sheet, r, ageCol.col);
        const cellRef = `${sheetName}!${XLSX.utils.encode_cell({ r, c: ageCol.col })}`;
        const prem = parsePremium(rawPrem);

        if (prem.isEmpty) continue;

        if (prem.error) {
          group.errors.push({ sheet: sheetName, cellRef, message: prem.message });
          errors.push({ sheet: sheetName, cellRef, message: prem.message });
          continue;
        }

        const rateKey = `${slabKey}__${bandKey}`;
        if (group.ratesMap.has(rateKey)) {
          const dupErr = `Duplicate rate entry for days ${daysSlab.label} and age ${ageBand.label}.`;
          group.errors.push({ sheet: sheetName, cellRef, message: dupErr });
          errors.push({ sheet: sheetName, cellRef, message: dupErr });
          continue;
        }

        group.ratesMap.set(rateKey, {
          daysSlab,
          ageBand,
          premium: prem.value,
          cellRef
        });
        group.ratesList.push({
          daysSlab,
          ageBand,
          premium: prem.value,
          cellRef
        });
      }
    }

    groups.push(_finalizeGroup(group));
  }

  return { groups, errors, warnings };
}

/**
 * Builds sorted slabs, bands, 2D matrix and status for a group.
 */
function _finalizeGroup(g) {
  const sortedDays = Array.from(g.daysSlabsMap.values()).sort((a, b) => a.from - b.from);
  const sortedAges = Array.from(g.ageBandsMap.values()).sort((a, b) => a.from - b.from);

  // Build matrixData object and 2D matrix
  const matrixData = {};
  const matrix = [];

  for (let r = 0; r < sortedDays.length; r++) {
    const row = [];
    const slab = sortedDays[r];
    for (let c = 0; c < sortedAges.length; c++) {
      const band = sortedAges[c];
      const rateKey = `${slab.from}_${slab.to}__${band.from}_${band.to}`;
      const rateObj = g.ratesMap.get(rateKey);
      const val = rateObj ? rateObj.premium : null;
      row.push(val);
      if (val !== null) {
        matrixData[`${r}_${c}`] = val;
      }
    }
    matrix.push(row);
  }

  return {
    id: g.id,
    sumInsured: g.sumInsured,
    coverage: g.coverage,
    coverageLabel: g.coverageLabel,
    sheetName: g.sheetName,
    layout: g.layout,
    daysSlabs: sortedDays,
    ageBands: sortedAges,
    rates: g.ratesList,
    ratesCount: g.ratesList.length,
    matrix,
    matrixData,
    errors: g.errors || [],
    warnings: g.warnings || [],
    selected: (g.errors || []).length === 0,
    status: (g.errors || []).length > 0 ? 'error' : (g.warnings || []).length > 0 ? 'warning' : 'ok'
  };
}

/**
 * Validates groups:
 * - Checks days slabs for overlaps and gaps
 * - Checks age bands for overlaps and gaps
 * - Checks if sum insured is new compared to existingCoverages
 * - Checks if days/ages differ from current grid
 */
export function validateGroups(groups, options = {}) {
  const existingCoverages = options.existingCoverages || [50000, 100000, 200000, 250000, 500000, 750000, 1000000];
  const currentDaysSlabs = options.currentDaysSlabs || [];
  const currentAgeBands = options.currentAgeBands || [];

  for (const group of groups) {
    // 1. Days slabs overlap & gap check
    const slabs = group.daysSlabs;
    for (let i = 0; i < slabs.length - 1; i++) {
      const cur = slabs[i];
      const next = slabs[i + 1];

      if (cur.max >= next.min) {
        const errMsg = `Days slabs overlap: ${cur.label} and ${next.label}.`;
        group.errors.push({ sheet: group.sheetName, cellRef: `${group.sheetName}!Days`, message: errMsg });
      } else if (cur.max + 1 < next.min) {
        const warnMsg = `Days slab gap: days between ${cur.max} and ${next.min} (${cur.max + 1} to ${next.min - 1}) are unpriced.`;
        group.warnings.push({ sheet: group.sheetName, cellRef: `${group.sheetName}!Days`, message: warnMsg });
      }
    }

    // 2. Age bands overlap & gap check
    const bands = group.ageBands;
    for (let i = 0; i < bands.length - 1; i++) {
      const cur = bands[i];
      const next = bands[i + 1];

      if (cur.max >= next.min) {
        const errMsg = `Age bands overlap: ${cur.label} and ${next.label}.`;
        group.errors.push({ sheet: group.sheetName, cellRef: `${group.sheetName}!Ages`, message: errMsg });
      } else if (cur.max + 1 < next.min) {
        const warnMsg = `Age band gap: ages between ${cur.max} and ${next.min} (${cur.max + 1} to ${next.min - 1}) are unpriced.`;
        group.warnings.push({ sheet: group.sheetName, cellRef: `${group.sheetName}!Ages`, message: warnMsg });
      }
    }

    // 3. New Sum Insured check
    const isNew = !existingCoverages.includes(group.sumInsured);
    group.isNewSumInsured = isNew;
    if (isNew) {
      group.warnings.push({
        sheet: group.sheetName,
        cellRef: `${group.sheetName}`,
        message: `New sum insured USD ${group.sumInsured.toLocaleString()} — will be added to buttons.`
      });
    }

    // 4. Differ from current grid slabs/bands
    let differs = false;
    if (currentDaysSlabs.length > 0 && slabs.length > 0) {
      if (slabs.length !== currentDaysSlabs.length || slabs.some((s, i) => s.from !== currentDaysSlabs[i].from || s.to !== currentDaysSlabs[i].to)) {
        differs = true;
      }
    }
    if (currentAgeBands.length > 0 && bands.length > 0) {
      if (bands.length !== currentAgeBands.length || bands.some((b, i) => b.from !== currentAgeBands[i].from || b.to !== currentAgeBands[i].to)) {
        differs = true;
      }
    }
    group.differsFromCurrent = differs;
    if (differs) {
      group.warnings.push({
        sheet: group.sheetName,
        cellRef: `${group.sheetName}`,
        message: `Slabs/bands differ from current grid — will replace current slabs/bands for this group.`
      });
    }

    // Final status
    if (group.errors.length > 0) {
      group.status = 'error';
      group.selected = false;
    } else if (group.warnings.length > 0) {
      group.status = 'warning';
    } else {
      group.status = 'ok';
    }
  }

  return groups;
}

/**
 * Parses an entire workbook across EVERY sheet.
 *
 * @param {Object} workbook SheetJS workbook
 * @param {Object} options { existingCoverages, currentDaysSlabs, currentAgeBands }
 * @returns {Object} Parse summary with sheets, groups, errors, warnings, totals
 */
export function parseWorkbook(workbook, options = {}) {
  const XLSX = getXLSX();
  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    return {
      fileName: options.fileName || 'rates.xlsx',
      sheets: [],
      groups: [],
      allErrors: [{ sheet: '', cellRef: '', message: 'Workbook contains no sheets.' }],
      allWarnings: [],
      totalRates: 0,
      totalDaysSlabs: 0,
      totalGroups: 0
    };
  }

  const sheetsMeta = [];
  const allGroups = [];
  const allErrors = [];
  const allWarnings = [];
  const seenGroups = new Map(); // `${sumInsured}_${coverage}` => sheetName

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) {
      sheetsMeta.push({ name: sheetName, layout: 'Empty sheet', status: 'skipped' });
      continue;
    }

    const detected = detectSheetLayout(sheet, sheetName);
    if (!detected) {
      sheetsMeta.push({ name: sheetName, layout: 'Unrecognized layout', status: 'skipped' });
      continue;
    }

    sheetsMeta.push({
      name: sheetName,
      layout: detected.layout === 'Layout A' ? 'Layout A (Flat table)' : 'Layout B (Matrix blocks)',
      status: 'detected'
    });

    let result;
    if (detected.layout === 'Layout A') {
      result = parseLayoutA(sheet, sheetName, seenGroups, options);
    } else {
      result = parseLayoutB(sheet, sheetName, seenGroups, options);
    }

    if (result.groups) allGroups.push(...result.groups);
    if (result.errors) allErrors.push(...result.errors);
    if (result.warnings) allWarnings.push(...result.warnings);
  }

  // Validate all collected groups
  validateGroups(allGroups, options);

  // Collect overall errors & warnings from groups
  for (const g of allGroups) {
    for (const e of g.errors) {
      if (!allErrors.some(x => x.cellRef === e.cellRef && x.message === e.message)) {
        allErrors.push(e);
      }
    }
    for (const w of g.warnings) {
      if (!allWarnings.some(x => x.cellRef === w.cellRef && x.message === w.message)) {
        allWarnings.push(w);
      }
    }
  }

  const totalRates = allGroups.reduce((acc, g) => acc + g.ratesCount, 0);
  const totalDaysSlabs = allGroups.reduce((acc, g) => acc + g.daysSlabs.length, 0);

  return {
    fileName: options.fileName || 'workbook.xlsx',
    sheets: sheetsMeta,
    groups: allGroups,
    allErrors,
    allWarnings,
    totalRates,
    totalDaysSlabs,
    totalGroups: allGroups.length
  };
}

/**
 * Applies imported groups to plan state.
 *
 * @param {Object} existingPlan Target plan object
 * @param {Array} selectedGroups Groups selected by the user to import
 * @param {string} mode 'replace' (default) or 'merge'
 * @param {Array} currentAvailableCoverages List of existing sum insured numbers
 * @returns {Object} { updatedCoverages, firstGroup, affectedCount, totalRatesAdded }
 */
export function applyImportedGroupsToState(stateStore, selectedGroups, mode = 'replace', availableCoverages = []) {
  if (!Array.isArray(selectedGroups) || selectedGroups.length === 0) {
    return { updatedCoverages: availableCoverages, firstGroup: null, affectedCount: 0, totalRatesAdded: 0 };
  }

  const newCoveragesSet = new Set(availableCoverages);
  let totalRatesAdded = 0;
  let totalDaysSlabs = 0;

  for (const group of selectedGroups) {
    newCoveragesSet.add(group.sumInsured);
    const key = `${group.sumInsured}_${group.coverage}`;

    totalRatesAdded += group.ratesCount;
    totalDaysSlabs += group.daysSlabs.length;

    if (mode === 'replace' || !stateStore[key]) {
      stateStore[key] = {
        sumInsured: group.sumInsured,
        coverage: group.coverage,
        daysSlabs: group.daysSlabs.map(s => ({ ...s })),
        ageBands: group.ageBands.map(a => ({ ...a })),
        matrix: group.matrix.map(row => [...row]),
        matrixData: { ...group.matrixData }
      };
    } else {
      // Merge mode: update matching cells only, keep existing non-matching cells
      const existing = stateStore[key];
      // Ensure day slabs and age bands cover both existing and new
      const mergedDaysMap = new Map();
      existing.daysSlabs.forEach(s => mergedDaysMap.set(`${s.from}_${s.to}`, s));
      group.daysSlabs.forEach(s => mergedDaysMap.set(`${s.from}_${s.to}`, s));
      const mergedDays = Array.from(mergedDaysMap.values()).sort((a, b) => a.from - b.from);

      const mergedAgesMap = new Map();
      existing.ageBands.forEach(a => mergedAgesMap.set(`${a.from}_${a.to}`, a));
      group.ageBands.forEach(a => mergedAgesMap.set(`${a.from}_${a.to}`, a));
      const mergedAges = Array.from(mergedAgesMap.values()).sort((a, b) => a.from - b.from);

      // Rebuild matrix
      const newMatrixData = {};
      const newMatrix = [];

      for (let r = 0; r < mergedDays.length; r++) {
        const row = [];
        const slab = mergedDays[r];
        for (let c = 0; c < mergedAges.length; c++) {
          const band = mergedAges[c];
          // Check imported group first
          const importedSlabIdx = group.daysSlabs.findIndex(s => s.from === slab.from && s.to === slab.to);
          const importedAgeIdx = group.ageBands.findIndex(a => a.from === band.from && a.to === band.to);
          let val = null;

          if (importedSlabIdx !== -1 && importedAgeIdx !== -1) {
            val = group.matrixData[`${importedSlabIdx}_${importedAgeIdx}`];
          }

          // If not in imported group, check existing
          if (val === undefined || val === null) {
            const exSlabIdx = existing.daysSlabs.findIndex(s => s.from === slab.from && s.to === slab.to);
            const exAgeIdx = existing.ageBands.findIndex(a => a.from === band.from && a.to === band.to);
            if (exSlabIdx !== -1 && exAgeIdx !== -1) {
              val = existing.matrixData[`${exSlabIdx}_${exAgeIdx}`];
            }
          }

          const numVal = val !== undefined && val !== null && val !== '' ? Number(val) : null;
          row.push(numVal);
          if (numVal !== null) {
            newMatrixData[`${r}_${c}`] = numVal;
          }
        }
        newMatrix.push(row);
      }

      stateStore[key] = {
        sumInsured: group.sumInsured,
        coverage: group.coverage,
        daysSlabs: mergedDays,
        ageBands: mergedAges,
        matrix: newMatrix,
        matrixData: newMatrixData
      };
    }
  }

  const updatedCoverages = Array.from(newCoveragesSet).sort((a, b) => a - b);
  const firstGroup = selectedGroups[0] || null;

  return {
    updatedCoverages,
    firstGroup,
    affectedCount: selectedGroups.length,
    totalRatesAdded,
    totalDaysSlabs
  };
}


/**
 * Group Review Table (Editable Data Grid)
 * Component: Review table grid with live inline cell editing, Red/Amber validation,
 * column management panel, custom columns, summary counters, and multi-sheet Excel export.
 */
import { ISSUE_POLICY_CONFIG } from '../config.js';
import { validateMrzTd3, checkPassportValidity } from '../mrzUtils.js';
import { parseIndianAddressSync, lookupPinCode, cleanCity, cleanState, cleanCountry } from '../addressUtils.js';

export class GroupReviewGrid {
  /**
   * @param {Object} options
   * @param {Array<Object>} options.rows Initial rows extracted from passports
   * @param {Object} options.tripDates { tripStart: 'YYYY-MM-DD', tripEnd: 'YYYY-MM-DD' }
   * @param {string} options.quoteId Quote ID for export file naming
   * @param {Function} options.onRowsChanged Callback when rows or validation status changes
   * @param {Function} options.onUploadMore Callback to go back to upload step
   * @param {Function} options.onShowToast Callback to display toast notifications
   */
  constructor({
    rows = [],
    tripDates = { tripStart: '', tripEnd: '' },
    quoteId = '',
    onRowsChanged = null,
    onUploadMore = null,
    onShowToast = null
  } = {}) {
    this.tripDates = tripDates;
    this.quoteId = quoteId;
    this.onRowsChanged = onRowsChanged;
    this.onUploadMore = onUploadMore;
    this.onShowToast = onShowToast;

    this.rows = rows.map((r, i) => this._normalizeRow(r, i));

    // Kept columns map: key -> boolean
    this.keptColumns = {};
    ISSUE_POLICY_CONFIG.COLUMNS.forEach(col => {
      this.keptColumns[col.key] = true;
    });

    // Custom columns created by user: [{ key, label, type: 'text', canRemove: true, custom: true }]
    this.customColumns = [];

    // Filter toggles
    this.onlyShowIssues = false;
    this.isColumnPanelOpen = false;
    this.selectedRowIds = new Set();

    // Side verification drawer state
    this.activeDrawerField = null; // { rowId, colKey }
    this.drawerZoom = 1;

    this._container = null;

    // Initial validation
    this.validateAllRows();
  }

  _normalizeRow(raw, index) {
    const id = raw.id || `row-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`;
    const cleanDate = (d) => {
      if (!d || d === 'null' || d === 'undefined') return '';
      const s = String(d).trim();
      if (s === 'null' || s === 'undefined' || s === 'None' || s === 'N/A') return '';
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    };
    const cleanStr = (v, fallback = '') => {
      if (v === null || v === undefined || v === 'null' || v === 'undefined') return fallback;
      const s = String(v).trim();
      return (s === 'null' || s === 'undefined') ? fallback : s;
    };

    let addrLine = cleanStr(raw.addressLine);
    let city = cleanStr(raw.city);
    let state = cleanStr(raw.state);
    let pinCode = cleanStr(raw.pinCode || raw.pin || raw.pincode);
    let country = cleanStr(raw.country, 'India');
    const fullAddress = cleanStr(raw.address);

    if ((!addrLine || !city || !state || !pinCode) && fullAddress) {
      try {
        const parsed = parseIndianAddressSync(fullAddress);
        if (!addrLine) addrLine = parsed.addressLine;
        if (!city) city = parsed.city;
        if (!state) state = parsed.state;
        if (!pinCode) pinCode = parsed.pinCode;
        if (!country) country = parsed.country || 'India';
      } catch (e) {}
    }

    // Clean city, state, country and auto-move 6-digit PIN from City if present
    if (city) {
      const pinInCity = String(city).match(/\b([1-9]\d{5})\b/);
      if (pinInCity) {
        if (!pinCode) pinCode = pinInCity[1];
        city = cleanCity(city);
      } else {
        city = cleanCity(city);
      }
    }
    state = cleanState(state);
    country = cleanCountry(country);
    if (pinCode && !/^[1-9]\d{5}$/.test(pinCode)) {
      pinCode = '';
    }

    return {
      id,
      givenNames: cleanStr(raw.givenNames),
      surname: cleanStr(raw.surname),
      passportNumber: cleanStr(raw.passportNumber),
      sex: cleanStr(raw.sex, 'M'),
      dob: cleanDate(raw.dob),
      nationality: cleanStr(raw.nationality, 'IND'),
      countryCode: cleanStr(raw.countryCode || raw.issuingCountry, 'IND'),
      placeOfBirth: cleanStr(raw.placeOfBirth),
      placeOfIssue: cleanStr(raw.placeOfIssue),
      issueDate: cleanDate(raw.issueDate),
      expiryDate: cleanDate(raw.expiryDate),
      fatherName: cleanStr(raw.fatherName),
      motherName: cleanStr(raw.motherName),
      spouseName: cleanStr(raw.spouseName),
      address: fullAddress || [addrLine, city, state, pinCode, country].filter(Boolean).join(', '),
      addressLine: addrLine,
      city: city,
      state: state,
      pinCode: pinCode,
      country: country,
      pin: pinCode,
      sourceFile: cleanStr(raw.sourceFile || raw.file?.name, 'Manual entry'),
      previewImage: raw.previewImage || (raw.file ? URL.createObjectURL(raw.file) : null),
      entryMethod: raw.entryMethod || (raw.sourceFile === 'Manual entry' || raw.sourceFile === 'Manual row' ? 'manual' : 'ocr'),
      mrz: raw.mrz || null,
      lowConfidence: Array.isArray(raw.lowConfidence) ? [...raw.lowConfidence] : [],
      checkedByAgent: raw.checkedByAgent ? { ...raw.checkedByAgent } : {},
      // Validation state
      errors: {}, // { [colKey]: 'Red error message' }
      warnings: {}, // { [colKey]: 'Amber warning message' }
      status: 'ready' // 'ready', 'check', 'error'
    };
  }

  getAllColumns() {
    return [...ISSUE_POLICY_CONFIG.COLUMNS, ...this.customColumns];
  }

  getActiveColumns() {
    return this.getAllColumns().filter(col => this.keptColumns[col.key] !== false);
  }

  /**
   * Re-validates every row in the grid.
   * Duplicate passport number detection spans all rows.
   */
  validateAllRows() {
    // 1. Build passport frequency map
    const pNumCounts = {};
    this.rows.forEach(row => {
      const pNum = (row.passportNumber || '').trim().toUpperCase();
      if (pNum) {
        pNumCounts[pNum] = (pNumCounts[pNum] || 0) + 1;
      }
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const tripEndStr = this.tripDates?.tripEnd || '';
    const safetyMargin = ISSUE_POLICY_CONFIG.EXPIRY_SAFETY_MARGIN_MONTHS || 3;

    // 2. Validate each row
    this.rows.forEach(row => {
      const errors = {};
      const warnings = {};

      const activeCols = this.getActiveColumns();

      // Check each active column
      activeCols.forEach(col => {
        const val = row[col.key];
        const valStr = (val === null || val === undefined || val === 'null' || val === 'undefined') ? '' : String(val).trim();

        // Required check
        if (col.required && !valStr) {
          errors[col.key] = `${col.label} is required`;
          return;
        }

        // Low confidence warning
        if (row.lowConfidence && row.lowConfidence.includes(col.key)) {
          warnings[col.key] = 'Low OCR confidence';
        }

        // Column-specific rules
        if (col.key === 'passportNumber') {
          const cleanP = valStr.toUpperCase();
          if (cleanP && pNumCounts[cleanP] > 1) {
            errors[col.key] = 'Duplicate passport number in group';
          }
        }

        if (col.key === 'dob' && valStr) {
          if (valStr > todayStr) {
            errors[col.key] = 'DOB cannot be in the future';
          }
        }

        if (col.key === 'issueDate' && valStr) {
          if (valStr > todayStr) {
            errors[col.key] = 'Issue date cannot be in future';
          }
          if (row.expiryDate && valStr > row.expiryDate) {
            errors[col.key] = 'Issue date is after expiry date';
          }
        }

        if (col.key === 'expiryDate' && valStr) {
          if (row.issueDate && valStr < row.issueDate) {
            errors[col.key] = 'Expiry date is before issue date';
          }
          if (tripEndStr) {
            const check = checkPassportValidity(valStr, tripEndStr, safetyMargin);
            if (!check.validPastTripEnd) {
              errors[col.key] = 'Expires before trip end date';
            } else if (!check.validWithMargin) {
              warnings[col.key] = `Expires within ${safetyMargin} mos of return`;
            }
          }
        }

        // Missing field warnings for non-required, non-optional fields
        if (!col.required && !col.optional && !valStr) {
          if (col.key === 'surname') {
            // Prompt rule: Empty surname is GREEN ONLY when MRZ line 1 confirms no surname ("P<IND<<")
            const mrzL1 = Array.isArray(row.mrz) && row.mrz[0] ? String(row.mrz[0]).trim().toUpperCase() : '';
            if (mrzL1 && mrzL1.length >= 10) {
              const emptySurnameOnMrz = mrzL1.startsWith('P<') && mrzL1.substring(5).startsWith('<<');
              if (!emptySurnameOnMrz) {
                warnings[col.key] = 'Not captured';
              }
            }
          } else if (col.key === 'address') {
            warnings[col.key] = 'Add in address step';
          } else {
            warnings[col.key] = 'Not captured';
          }
        }
      });

      // Clear any errors/warnings for fields explicitly checked & saved by agent
      if (row.checkedByAgent) {
        Object.keys(row.checkedByAgent).forEach(k => {
          if (row.checkedByAgent[k]) {
            delete errors[k];
            delete warnings[k];
          }
        });
      }

      // MRZ cross checks if MRZ data is available (Upload/OCR only)
      if (row.entryMethod !== 'manual' && row.mrz && Array.isArray(row.mrz) && row.mrz.length === 2) {
        const mrzRes = validateMrzTd3(row.mrz[0], row.mrz[1]);
        if (!mrzRes.valid) {
          errors.passportNumber = errors.passportNumber || 'MRZ check digits failed';
        } else {
          const mrzFields = mrzRes.fields;
          // Check printed passport number vs MRZ
          const pClean = (row.passportNumber || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
          const mrzPClean = (mrzFields.passportNumber || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
          if (pClean && mrzPClean && pClean !== mrzPClean) {
            errors.passportNumber = `Differs from MRZ (${mrzPClean})`;
          }

          // Check DOB vs MRZ
          if (row.dob && mrzFields.dob && row.dob !== mrzFields.dob) {
            errors.dob = `Differs from MRZ (${mrzFields.dob})`;
          }

          // Check Sex vs MRZ
          if (row.sex && mrzFields.sex && row.sex.toUpperCase() !== mrzFields.sex.toUpperCase()) {
            errors.sex = `Differs from MRZ (${mrzFields.sex})`;
          }
        }
      }

      row.errors = errors;
      row.warnings = warnings;

      const errCount = Object.keys(errors).length;
      const warnCount = Object.keys(warnings).length;

      if (errCount > 0) {
        row.status = 'error';
      } else if (warnCount > 0) {
        row.status = 'check';
      } else {
        row.status = 'ready';
      }
    });

    if (typeof this.onRowsChanged === 'function') {
      this.onRowsChanged(this.rows, this.getSummaryCounts());
    }
  }

  getSummaryCounts() {
    let ready = 0;
    let errors = 0;
    let notCaptured = 0;
    let lowConfidence = 0;

    this.rows.forEach(r => {
      const errCount = Object.keys(r.errors).length;
      if (errCount > 0) {
        errors += errCount;
      } else if (Object.keys(r.warnings).length === 0) {
        ready++;
      }

      Object.entries(r.warnings).forEach(([k, msg]) => {
        if (msg === 'Low OCR confidence') {
          lowConfidence++;
        } else if (msg.includes('Not captured') || msg.includes('Add in address')) {
          notCaptured++;
        }
      });
    });

    return {
      total: this.rows.length,
      ready,
      errors,
      notCaptured,
      lowConfidence,
      canProceed: this.rows.length > 0 && errors === 0
    };
  }

  addBlankRow() {
    const newRow = this._normalizeRow({
      givenNames: '',
      surname: '',
      passportNumber: '',
      sex: 'M',
      dob: '',
      expiryDate: '',
      sourceFile: 'Manual row',
      entryMethod: 'manual'
    }, this.rows.length);

    this.rows.push(newRow);
    this.validateAllRows();
    this.updateDom();
    if (this.onShowToast) this.onShowToast('Added blank traveller row', 'info');
  }

  removeRow(rowId) {
    this.rows = this.rows.filter(r => r.id !== rowId);
    this.selectedRowIds.delete(rowId);
    this.validateAllRows();
    this.updateDom();
  }

  removeSelectedRows() {
    if (this.selectedRowIds.size === 0) return;
    const count = this.selectedRowIds.size;
    this.rows = this.rows.filter(r => !this.selectedRowIds.has(r.id));
    this.selectedRowIds.clear();
    this.validateAllRows();
    this.updateDom();
    if (this.onShowToast) this.onShowToast(`Removed ${count} selected traveller${count > 1 ? 's' : ''}`, 'info');
  }

  addCustomColumn(label) {
    const cleanLabel = (label || '').trim();
    if (!cleanLabel) return;

    const key = 'custom_' + cleanLabel.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);
    const newCol = {
      key,
      label: cleanLabel,
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      custom: true,
      placeholder: cleanLabel
    };

    this.customColumns.push(newCol);
    this.keptColumns[key] = true;

    // Initialize in all rows
    this.rows.forEach(r => {
      r[key] = '';
    });

    this.validateAllRows();
    this.updateDom();
    if (this.onShowToast) this.onShowToast(`Added custom column "${cleanLabel}"`, 'success');
  }

  removeColumn(colKey) {
    const col = this.getAllColumns().find(c => c.key === colKey);
    if (!col || col.canRemove === false) return;

    if (col.custom) {
      this.customColumns = this.customColumns.filter(c => c.key !== colKey);
      delete this.keptColumns[colKey];
    } else {
      this.keptColumns[colKey] = false;
    }

    this.validateAllRows();
    this.updateDom();

    if (this.onShowToast) {
      this.onShowToast(`Removed column "${col.label}". You can restore it in "Choose columns".`, 'info');
    }
  }

  restoreColumn(colKey) {
    this.keptColumns[colKey] = true;
    this.validateAllRows();
    this.updateDom();
  }

  /**
   * Data-only Excel Export (Single sheet: "Travellers", # + active grid columns only)
   * Filename: travellers-<QUOTE ID>-<DD-MM-YYYY>.xlsx
   */
  exportExcel() {
    const activeCols = this.getActiveColumns();
    const XLSX = window.XLSX;

    const formatDmy = (dateStr) => {
      if (!dateStr) return '';
      const s = String(dateStr).trim();
      const iso = s.match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/);
      if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
      const dmy = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
      if (dmy) return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;
      return s;
    };

    const todayDate = new Date();
    const dStr = String(todayDate.getDate()).padStart(2, '0');
    const mStr = String(todayDate.getMonth() + 1).padStart(2, '0');
    const yStr = todayDate.getFullYear();
    const todayFormatted = `${dStr}-${mStr}-${yStr}`;

    const quoteIdClean = (this.quoteId || 'DRAFT').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `travellers-${quoteIdClean}-${todayFormatted}.xlsx`;

    if (XLSX) {
      const wb = XLSX.utils.book_new();

      // Single Sheet: Travellers
      // Columns: "#" then ONLY the columns currently shown in the grid, in grid order
      const sheetData = this.rows.map((row, idx) => {
        const item = { '#': idx + 1 };
        activeCols.forEach(col => {
          let val = row[col.key] || '';
          if (col.type === 'date' || col.key === 'dob' || col.key === 'issueDate' || col.key === 'expiryDate') {
            val = formatDmy(val);
          }
          item[col.label] = val;
        });
        return item;
      });

      const ws = XLSX.utils.json_to_sheet(sheetData);

      // Format PIN code and Passport number as text cells (cell.t = 's') so leading zeros are preserved
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        activeCols.forEach((col, cIdx) => {
          const colIndex = cIdx + 1; // 1-based, after '#' at 0
          if (col.key === 'passportNumber' || col.key === 'pinCode' || col.key === 'pin') {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: colIndex });
            if (ws[cellRef]) {
              ws[cellRef].t = 's';
              ws[cellRef].v = String(ws[cellRef].v || '');
            }
          }
        });
      }

      // Column widths
      const colWidths = [{ wch: 5 }];
      activeCols.forEach(c => colWidths.push({ wch: Math.max(c.label.length + 3, 14) }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Travellers');
      XLSX.writeFile(wb, filename);

      if (this.onShowToast) this.onShowToast(`Exported ${filename} successfully`, 'success');
    } else {
      // Fallback CSV export: "#" then only active columns
      const headers = ['#', ...activeCols.map(c => `"${c.label}"`)];
      const lines = [headers.join(',')];

      this.rows.forEach((row, idx) => {
        const rowVals = [
          idx + 1,
          ...activeCols.map(col => {
            let val = row[col.key] || '';
            if (col.type === 'date' || col.key === 'dob' || col.key === 'issueDate' || col.key === 'expiryDate') {
              val = formatDmy(val);
            }
            return `"${String(val).replace(/"/g, '""')}"`;
          })
        ];
        lines.push(rowVals.join(','));
      });

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `travellers-${quoteIdClean}-${todayFormatted}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      if (this.onShowToast) this.onShowToast(`Exported travellers-${quoteIdClean}-${todayFormatted}.csv`, 'info');
    }
  }

  /**
   * HTML Render
   */
  render() {
    const summary = this.getSummaryCounts();
    const activeCols = this.getActiveColumns();
    const allCols = this.getAllColumns();

    const displayRows = this.onlyShowIssues
      ? this.rows.filter(r => r.status !== 'ready')
      : this.rows;

    return `
      <div class="grid-container" id="groupGridContainer">
        <!-- Summary Counters Banner -->
        <div class="grid-counters-banner" role="region" aria-label="Review counters">
          <div class="counter-item">
            <span class="counter-val">${summary.total}</span>
            <span class="counter-label">Travellers</span>
          </div>
          <div class="counter-item counter-ready">
            <span class="counter-val">${summary.ready}</span>
            <span class="counter-label">Ready</span>
          </div>
          <div class="counter-item ${summary.errors > 0 ? 'counter-danger' : ''}">
            <span class="counter-val">${summary.errors}</span>
            <span class="counter-label">Errors to fix</span>
          </div>
          <div class="counter-item">
            <span class="counter-val">${summary.notCaptured}</span>
            <span class="counter-label">Details not captured</span>
          </div>
          <div class="counter-item">
            <span class="counter-val">${summary.lowConfidence}</span>
            <span class="counter-label">Low confidence</span>
          </div>
        </div>

        <!-- Red Alert Banner if errors exist -->
        ${summary.errors > 0 ? `
          <div class="grid-error-banner" role="alert">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <div class="banner-text">
              <strong>${summary.errors} critical error${summary.errors > 1 ? 's' : ''} must be resolved</strong>
              <span>Review highlighted red cells before confirming travellers. Passport dates, MRZ checks, and required fields must pass.</span>
            </div>
          </div>
        ` : ''}

        <!-- Toolbar -->
        <div class="grid-toolbar">
          <div class="toolbar-left">
            <button type="button" class="btn-tool" id="btnToggleColPanel" aria-expanded="${this.isColumnPanelOpen}">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z"/>
              </svg>
              <span>Choose columns</span>
            </button>
            <button type="button" class="btn-tool" id="btnAddTraveller">
              <span>+ Add traveller</span>
            </button>
            ${this.selectedRowIds.size > 0 ? `
              <button type="button" class="btn-tool btn-tool-danger" id="btnRemoveSelected">
                <span>Remove selected (${this.selectedRowIds.size})</span>
              </button>
            ` : ''}
            <label class="toolbar-toggle">
              <input type="checkbox" id="chkOnlyIssues" ${this.onlyShowIssues ? 'checked' : ''} />
              <span>Only show travellers with issues</span>
            </label>
          </div>

          <div class="toolbar-right">
            <button type="button" class="btn-tool" id="btnUploadMore">
              <span>Upload more passports</span>
            </button>
            <button type="button" class="btn-tool btn-tool-excel" id="btnDownloadExcel">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
              <span>Download Excel</span>
            </button>
          </div>
        </div>

        <!-- Column Management Panel (Drawer / Dropdown) -->
        ${this.isColumnPanelOpen ? `
          <div class="col-panel-drawer" id="colPanelDrawer">
            <div class="col-panel-header">
              <h4>Manage Grid Columns</h4>
              <button type="button" class="btn-close-sm" id="btnCloseColPanel">✕</button>
            </div>
            <div class="col-chips-group">
              ${allCols.map(col => {
                const isKept = this.keptColumns[col.key] !== false;
                const isLocked = col.canRemove === false;
                return `
                  <div class="col-chip ${isLocked ? 'locked' : ''}">
                    <label>
                      <input
                        type="checkbox"
                        class="chk-col-toggle"
                        data-key="${col.key}"
                        ${isKept ? 'checked' : ''}
                        ${isLocked ? 'disabled' : ''}
                      />
                      <span>${col.label}${col.required ? ' *' : ''}</span>
                    </label>
                    ${col.custom ? `
                      <button type="button" class="btn-delete-col" data-key="${col.key}" title="Delete custom column">×</button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>

            <div class="add-custom-col-form">
              <input type="text" id="inputNewColName" placeholder="e.g. Employee ID, Department" />
              <button type="button" class="btn-sm btn-primary" id="btnAddCustomCol">Add column</button>
            </div>
          </div>
        ` : ''}

        <!-- Table Responsive Wrapper -->
        <div class="table-scroll-container">
          <table class="grid-table" aria-label="Traveller Passport Review Grid">
            <thead>
              <tr>
                <th class="th-check">
                  <input type="checkbox" id="chkSelectAllRows" ${this.selectedRowIds.size === this.rows.length && this.rows.length > 0 ? 'checked' : ''} aria-label="Select all rows" />
                </th>
                <th class="th-num">#</th>
                <th class="th-status">Status</th>
                ${activeCols.map(col => `
                  <th class="th-data ${col.wide ? 'th-wide' : ''}">
                    <div class="th-content">
                      <span>${col.label}${col.required ? ' <span class="required-star">*</span>' : ''}</span>
                      ${col.canRemove !== false ? `
                        <button type="button" class="btn-th-remove" data-key="${col.key}" title="Hide ${col.label} column">✕</button>
                      ` : ''}
                    </div>
                  </th>
                `).join('')}
                <th class="th-file">Source File</th>
                <th class="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${displayRows.length === 0 ? `
                <tr>
                  <td colspan="${activeCols.length + 5}" class="td-empty">
                    ${this.onlyShowIssues ? 'No travellers with issues found.' : 'No travellers in list. Click "Add traveller" or "Upload more passports".'}
                  </td>
                </tr>
              ` : displayRows.map((row, index) => {
                const isSelected = this.selectedRowIds.has(row.id);
                const errCount = Object.keys(row.errors).length;
                const warnCount = Object.keys(row.warnings).length;

                let pillClass = 'status-pill-ready';
                let pillText = 'Ready';
                if (errCount > 0) {
                  pillClass = 'status-pill-error';
                  pillText = `${errCount} error${errCount > 1 ? 's' : ''}`;
                } else if (warnCount > 0) {
                  pillClass = 'status-pill-check';
                  pillText = `${warnCount} to check`;
                }

                return `
                  <tr class="grid-row ${row.status} ${isSelected ? 'row-selected' : ''}" data-row-id="${row.id}">
                    <td class="td-check">
                      <input type="checkbox" class="chk-row" data-id="${row.id}" ${isSelected ? 'checked' : ''} aria-label="Select row ${index + 1}" />
                    </td>
                    <td class="td-num">${index + 1}</td>
                    <td class="td-status">
                      <span class="grid-status-pill ${pillClass}">${pillText}</span>
                    </td>
                    ${activeCols.map(col => {
                      const rawVal = row[col.key];
                      const val = (rawVal === null || rawVal === undefined || rawVal === 'null' || rawVal === 'undefined') ? '' : rawVal;
                      const err = row.errors[col.key];
                      const warn = row.warnings[col.key];

                      let cellClass = '';
                      let issueMsg = '';
                      const isChecked = Boolean(row.checkedByAgent && row.checkedByAgent[col.key]);

                      if (err) {
                        cellClass = 'cell-error';
                        issueMsg = `<span class="cell-msg cell-msg-error" data-row-id="${row.id}" data-col="${col.key}" title="Click to inspect in side panel">${err} <button type="button" class="btn-inspect-field" data-row-id="${row.id}" data-col="${col.key}" title="Inspect in side panel">🔍</button></span>`;
                      } else if (warn) {
                        cellClass = 'cell-warning';
                        issueMsg = `<span class="cell-msg cell-msg-warning" data-row-id="${row.id}" data-col="${col.key}" title="Click to inspect in side panel">${warn} <button type="button" class="btn-inspect-field" data-row-id="${row.id}" data-col="${col.key}" title="Inspect in side panel">🔍</button></span>`;
                      } else if (isChecked) {
                        cellClass = 'cell-verified-agent';
                        issueMsg = `<span class="cell-msg cell-msg-verified">✓ Checked by agent</span>`;
                      }

                      return `
                        <td class="td-cell ${cellClass}" data-col="${col.key}">
                          <div class="cell-editor-wrap">
                            ${this._renderCellInput(col, val, row.id)}
                            ${issueMsg}
                          </div>
                        </td>
                      `;
                    }).join('')}
                    <td class="td-file" title="${row.sourceFile}">
                      ${row.entryMethod === 'manual' ? '<span class="badge-source-manual" style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:3px;">✍️ Manual</span>' : row.sourceFile}
                    </td>
                    <td class="td-actions">
                      <button type="button" class="btn-row-del" data-id="${row.id}" title="Remove traveller">✕</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Verification Side Panel Drawer -->
        <div class="verification-drawer" id="verificationDrawer" aria-hidden="true">
          <div class="drawer-header">
            <div class="drawer-title-group">
              <span class="drawer-icon">🛂</span>
              <h3 class="drawer-title" id="drawerTitle">Verify Field</h3>
            </div>
            <button type="button" class="drawer-close-btn" id="btnDrawerClose" title="Close drawer">✕</button>
          </div>
          <div class="drawer-body">
            <div class="drawer-zoom-toolbar">
              <span class="toolbar-label" style="font-weight:700; font-size:0.85rem; color:#334155;">Passport Document</span>
              <div class="zoom-btn-group">
                <button type="button" class="btn-zoom" id="btnZoomOut" title="Zoom Out">-</button>
                <span class="zoom-level-text" id="zoomLevelText">100%</span>
                <button type="button" class="btn-zoom" id="btnZoomIn" title="Zoom In">+</button>
                <button type="button" class="btn-zoom-reset" id="btnZoomReset" title="Reset Zoom">Reset</button>
              </div>
            </div>
            <div class="drawer-image-viewport" id="drawerImageViewport">
              <img id="drawerPassportImg" class="drawer-passport-img" src="" alt="Passport page scan" />
              <div id="drawerNoImageNotice" class="drawer-no-image-notice" style="display:none;">
                <span>📄</span>
                <p>No document preview image available for this row.</p>
              </div>
            </div>

            <div class="drawer-mrz-box" id="drawerMrzBox">
              <div class="drawer-mrz-header">MACHINE READABLE ZONE (ICAO 9303 TD3)</div>
              <code class="drawer-mrz-line" id="drawerMrzLine1"></code>
              <code class="drawer-mrz-line" id="drawerMrzLine2"></code>
            </div>

            <div class="drawer-editor-section">
              <label class="drawer-field-label" id="drawerFieldLabel">Field Name</label>
              <div class="drawer-issue-reason" id="drawerIssueReason"></div>
              <div class="drawer-input-wrap">
                <input type="text" id="drawerInputVal" class="drawer-input" />
              </div>
              <div class="drawer-actions">
                <button type="button" class="btn-primary btn-drawer-save" id="btnDrawerSave">
                  ✓ Save &amp; Mark Verified
                </button>
                <button type="button" class="btn-secondary btn-drawer-cancel" id="btnDrawerCancel">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderCellInput(col, val, rowId) {
    if (col.type === 'select') {
      const opts = (col.options || []).map(opt => {
        const oVal = typeof opt === 'object' ? opt.value : opt;
        const oLbl = typeof opt === 'object' ? opt.label : opt;
        const sel = String(val).toUpperCase() === String(oVal).toUpperCase() ? 'selected' : '';
        return `<option value="${oVal}" ${sel}>${oLbl}</option>`;
      }).join('');
      return `
        <select class="grid-cell-input grid-cell-select" data-row-id="${rowId}" data-col="${col.key}">
          ${opts}
        </select>
      `;
    }

    if (col.type === 'date') {
      const cleanDateVal = (val && val !== 'null' && val !== 'undefined' && /^\d{4}-\d{2}-\d{2}$/.test(String(val).trim()))
        ? String(val).trim()
        : '';
      return `
        <input
          type="date"
          class="grid-cell-input"
          value="${cleanDateVal}"
          data-row-id="${rowId}"
          data-col="${col.key}"
        />
      `;
    }

    const cleanTextVal = (val === null || val === undefined || val === 'null' || val === 'undefined') ? '' : String(val);
    return `
      <input
        type="text"
        class="grid-cell-input"
        value="${cleanTextVal.replace(/"/g, '&quot;')}"
        placeholder="${col.placeholder || ''}"
        data-row-id="${rowId}"
        data-col="${col.key}"
      />
    `;
  }

  attachEvents(container) {
    this._container = container;
    const gridEl = container.querySelector('#groupGridContainer');
    if (!gridEl) return;

    // Fast inline edits without destroying input focus
    gridEl.addEventListener('input', (e) => {
      const input = e.target.closest('.grid-cell-input');
      if (!input) return;
      this._handleCellChange(input.dataset.rowId, input.dataset.col, input.value, input);
    });

    gridEl.addEventListener('change', (e) => {
      const input = e.target.closest('.grid-cell-input');
      if (input) {
        this._handleCellChange(input.dataset.rowId, input.dataset.col, input.value, input);
        return;
      }

      // Checkbox selections
      if (e.target.id === 'chkSelectAllRows') {
        const checked = e.target.checked;
        if (checked) {
          this.rows.forEach(r => this.selectedRowIds.add(r.id));
        } else {
          this.selectedRowIds.clear();
        }
        this.updateDom();
        return;
      }

      if (e.target.classList.contains('chk-row')) {
        const rowId = e.target.dataset.id;
        if (e.target.checked) {
          this.selectedRowIds.add(rowId);
        } else {
          this.selectedRowIds.delete(rowId);
        }
        this.updateDom();
        return;
      }

      if (e.target.id === 'chkOnlyIssues') {
        this.onlyShowIssues = e.target.checked;
        this.updateDom();
        return;
      }

      if (e.target.classList.contains('chk-col-toggle')) {
        const colKey = e.target.dataset.key;
        if (e.target.checked) {
          this.restoreColumn(colKey);
        } else {
          this.removeColumn(colKey);
        }
        return;
      }
    });

    // Clicks on buttons
    gridEl.addEventListener('click', (e) => {
      if (e.target.closest('#btnToggleColPanel')) {
        this.isColumnPanelOpen = !this.isColumnPanelOpen;
        this.updateDom();
        return;
      }

      if (e.target.closest('#btnCloseColPanel')) {
        this.isColumnPanelOpen = false;
        this.updateDom();
        return;
      }

      if (e.target.closest('#btnAddTraveller')) {
        this.addBlankRow();
        return;
      }

      if (e.target.closest('#btnRemoveSelected')) {
        this.removeSelectedRows();
        return;
      }

      if (e.target.closest('#btnUploadMore')) {
        if (typeof this.onUploadMore === 'function') {
          this.onUploadMore();
        }
        return;
      }

      if (e.target.closest('#btnDownloadExcel')) {
        this.exportExcel();
        return;
      }

      const thRem = e.target.closest('.btn-th-remove');
      if (thRem) {
        this.removeColumn(thRem.dataset.key);
        return;
      }

      const delCustom = e.target.closest('.btn-delete-col');
      if (delCustom) {
        this.removeColumn(delCustom.dataset.key);
        return;
      }

      const rowDel = e.target.closest('.btn-row-del');
      if (rowDel) {
        this.removeRow(rowDel.dataset.id);
        return;
      }

      if (e.target.closest('#btnAddCustomCol')) {
        const input = gridEl.querySelector('#inputNewColName');
        if (input && input.value.trim()) {
          this.addCustomColumn(input.value.trim());
          input.value = '';
        }
        return;
      }

      // Verification Drawer Events
      const inspectBtn = e.target.closest('.btn-inspect-field');
      if (inspectBtn) {
        this.openVerificationDrawer(inspectBtn.dataset.rowId, inspectBtn.dataset.col);
        return;
      }

      const cellMsg = e.target.closest('.cell-msg-error, .cell-msg-warning');
      if (cellMsg && cellMsg.dataset.rowId && cellMsg.dataset.col) {
        this.openVerificationDrawer(cellMsg.dataset.rowId, cellMsg.dataset.col);
        return;
      }

      if (e.target.closest('#btnDrawerClose') || e.target.closest('#btnDrawerCancel')) {
        this.closeVerificationDrawer();
        return;
      }

      if (e.target.closest('#btnZoomIn')) {
        this.setDrawerZoom(0.25);
        return;
      }

      if (e.target.closest('#btnZoomOut')) {
        this.setDrawerZoom(-0.25);
        return;
      }

      if (e.target.closest('#btnZoomReset')) {
        this.setDrawerZoom(0);
        return;
      }

      if (e.target.closest('#btnDrawerSave')) {
        this.saveVerificationDrawer();
        return;
      }
    });
  }

  openVerificationDrawer(rowId, colKey) {
    const row = this.rows.find(r => r.id === rowId);
    if (!row) return;
    const col = this.getAllColumns().find(c => c.key === colKey) || { key: colKey, label: colKey };

    this.activeDrawerField = { rowId, colKey };
    this.drawerZoom = 1;

    const drawer = this._container?.querySelector('#verificationDrawer');
    if (!drawer) return;

    const titleEl = drawer.querySelector('#drawerTitle');
    const imgEl = drawer.querySelector('#drawerPassportImg');
    const noImgEl = drawer.querySelector('#drawerNoImageNotice');
    const mrz1El = drawer.querySelector('#drawerMrzLine1');
    const mrz2El = drawer.querySelector('#drawerMrzLine2');
    const mrzBox = drawer.querySelector('#drawerMrzBox');
    const fieldLabelEl = drawer.querySelector('#drawerFieldLabel');
    const issueReasonEl = drawer.querySelector('#drawerIssueReason');
    const inputValEl = drawer.querySelector('#drawerInputVal');
    const zoomTextEl = drawer.querySelector('#zoomLevelText');

    if (titleEl) titleEl.textContent = `Verify ${col.label} (${row.givenNames || 'Traveller'})`;
    if (fieldLabelEl) fieldLabelEl.textContent = col.label;

    const reason = row.errors[colKey] || row.warnings[colKey] || (row.checkedByAgent?.[colKey] ? 'Checked by agent' : '');
    if (issueReasonEl) {
      issueReasonEl.textContent = reason;
      issueReasonEl.className = `drawer-issue-reason ${row.checkedByAgent?.[colKey] ? 'reason-green' : ''}`;
    }

    if (inputValEl) {
      inputValEl.value = (row[colKey] === null || row[colKey] === undefined) ? '' : row[colKey];
    }

    // Image preview
    const imgSrc = row.previewImage || '';
    if (imgEl && noImgEl) {
      if (imgSrc) {
        imgEl.src = imgSrc;
        imgEl.style.display = 'block';
        imgEl.style.transform = 'scale(1)';
        noImgEl.style.display = 'none';
      } else {
        imgEl.style.display = 'none';
        noImgEl.style.display = 'block';
      }
    }

    if (zoomTextEl) zoomTextEl.textContent = '100%';

    // MRZ code lines
    if (row.mrz && Array.isArray(row.mrz) && row.mrz.length >= 2) {
      if (mrzBox) mrzBox.style.display = 'block';
      if (mrz1El) mrz1El.textContent = row.mrz[0];
      if (mrz2El) mrz2El.textContent = row.mrz[1];
    } else if (mrzBox) {
      mrzBox.style.display = 'none';
    }

    drawer.classList.add('drawer-open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  closeVerificationDrawer() {
    this.activeDrawerField = null;
    const drawer = this._container?.querySelector('#verificationDrawer');
    if (drawer) {
      drawer.classList.remove('drawer-open');
      drawer.setAttribute('aria-hidden', 'true');
    }
  }

  setDrawerZoom(factor) {
    if (factor === 0) {
      this.drawerZoom = 1;
    } else {
      this.drawerZoom = Math.min(Math.max(0.5, this.drawerZoom + factor), 3.0);
    }
    const drawer = this._container?.querySelector('#verificationDrawer');
    if (!drawer) return;
    const imgEl = drawer.querySelector('#drawerPassportImg');
    const zoomTextEl = drawer.querySelector('#zoomLevelText');
    if (imgEl) {
      imgEl.style.transform = `scale(${this.drawerZoom})`;
    }
    if (zoomTextEl) {
      zoomTextEl.textContent = `${Math.round(this.drawerZoom * 100)}%`;
    }
  }

  saveVerificationDrawer() {
    if (!this.activeDrawerField) return;
    const { rowId, colKey } = this.activeDrawerField;
    const row = this.rows.find(r => r.id === rowId);
    if (!row) return;

    const drawer = this._container?.querySelector('#verificationDrawer');
    const inputValEl = drawer?.querySelector('#drawerInputVal');
    const newVal = inputValEl ? inputValEl.value : row[colKey];

    row[colKey] = newVal;

    if (colKey === 'city') {
      const cityStr = String(row.city || '');
      const pinMatch = cityStr.match(/\b([1-9]\d{5})\b/);
      if (pinMatch) {
        if (!row.pinCode) {
          row.pinCode = pinMatch[1];
          row.pin = pinMatch[1];
        }
        row.city = cleanCity(cityStr);
      } else {
        row.city = cleanCity(cityStr);
      }
    }

    row.checkedByAgent = { ...(row.checkedByAgent || {}), [colKey]: true };
    delete row.errors[colKey];
    delete row.warnings[colKey];
    row.lowConfidence = (row.lowConfidence || []).filter(k => k !== colKey);

    this.validateAllRows();
    this._patchRowAndCounterDom(rowId);

    // Update active cell in DOM
    const tr = this._container?.querySelector(`tr[data-row-id="${row.id}"]`);
    if (tr) {
      const input = tr.querySelector(`input[data-col="${colKey}"], select[data-col="${colKey}"]`);
      if (input) input.value = row[colKey];
      const td = tr.querySelector(`td[data-col="${colKey}"]`);
      if (td) {
        td.classList.remove('cell-error', 'cell-warning');
        td.classList.add('cell-verified-agent');
        let msg = td.querySelector('.cell-msg');
        if (!msg) {
          msg = document.createElement('span');
          td.querySelector('.cell-editor-wrap')?.appendChild(msg);
        }
        msg.className = 'cell-msg cell-msg-verified';
        msg.textContent = '✓ Checked by agent';
      }
    }

    const colObj = this.getAllColumns().find(c => c.key === colKey);
    if (this.onShowToast) {
      this.onShowToast(`${colObj?.label || colKey} verified (Checked by agent)`, 'success');
    }

    this.closeVerificationDrawer();
  }

  _handleCellChange(rowId, colKey, val, inputEl) {
    const row = this.rows.find(r => r.id === rowId);
    if (!row) return;

    row[colKey] = (val === 'null' || val === 'undefined' || val === null || val === undefined) ? '' : val;

    // Editing a cell clears its low-confidence flag
    if (row.lowConfidence && row.lowConfidence.includes(colKey)) {
      row.lowConfidence = row.lowConfidence.filter(k => k !== colKey);
    }

    // Auto-move 6-digit PIN if typed into City
    if (colKey === 'city') {
      const cityStr = String(row.city || '');
      const pinMatch = cityStr.match(/\b([1-9]\d{5})\b/);
      if (pinMatch) {
        const foundPin = pinMatch[1];
        if (!row.pinCode) {
          row.pinCode = foundPin;
          row.pin = foundPin;
        }
        row.city = cleanCity(cityStr);
        if (inputEl) inputEl.value = row.city;
        if (this._container) {
          const tr = this._container.querySelector(`tr[data-row-id="${row.id}"]`);
          if (tr) {
            const pinInput = tr.querySelector(`input[data-col="pinCode"]`);
            if (pinInput && row.pinCode) pinInput.value = row.pinCode;
          }
        }
      } else {
        row.city = cleanCity(cityStr);
      }
    }

    // Auto-fill city and state when a 6-digit PIN code is typed and city/state are empty
    if (colKey === 'pinCode' || colKey === 'pin') {
      row.pin = row[colKey];
      row.pinCode = row[colKey];
      const pinVal = String(row[colKey] || '').trim();
      if (/^\d{6}$/.test(pinVal)) {
        lookupPinCode(pinVal).then(info => {
          if (info) {
            let changed = false;
            if (!row.city && info.city) {
              row.city = info.city;
              changed = true;
            }
            if (!row.state && info.state) {
              row.state = info.state;
              changed = true;
            }
            if (changed) {
              this.validateAllRows();
              this._patchRowAndCounterDom(rowId);
              if (this._container) {
                const tr = this._container.querySelector(`tr[data-row-id="${row.id}"]`);
                if (tr) {
                  const cityInput = tr.querySelector(`input[data-col="city"]`);
                  if (cityInput && row.city) cityInput.value = row.city;
                  const stateInput = tr.querySelector(`input[data-col="state"], select[data-col="state"]`);
                  if (stateInput && row.state) stateInput.value = row.state;
                }
              }
            }
          }
        }).catch(() => {});
      }
    }

    // Re-validate all rows (duplicates depend on other rows)
    this.validateAllRows();

    // Dynamically patch DOM around the active input to prevent losing focus
    this._patchRowAndCounterDom(rowId);
  }

  /**
   * Updates cell error messages, row status pills, and counter numbers without destroying DOM focus.
   */
  _patchRowAndCounterDom(activeRowId) {
    if (!this._container) return;

    // 1. Update top summary counters
    const summary = this.getSummaryCounts();
    const banner = this._container.querySelector('.grid-counters-banner');
    if (banner) {
      const vals = banner.querySelectorAll('.counter-val');
      if (vals.length >= 5) {
        vals[0].textContent = summary.total;
        vals[1].textContent = summary.ready;
        vals[2].textContent = summary.errors;
        vals[3].textContent = summary.notCaptured;
        vals[4].textContent = summary.lowConfidence;
      }
    }

    // 2. Update each row's status pill and cell error classes
    this.rows.forEach(row => {
      const tr = this._container.querySelector(`tr[data-row-id="${row.id}"]`);
      if (!tr) return;

      // Update row class
      tr.className = `grid-row ${row.status} ${this.selectedRowIds.has(row.id) ? 'row-selected' : ''}`;

      // Update status pill
      const pill = tr.querySelector('.grid-status-pill');
      if (pill) {
        const errCount = Object.keys(row.errors).length;
        const warnCount = Object.keys(row.warnings).length;
        if (errCount > 0) {
          pill.className = 'grid-status-pill status-pill-error';
          pill.textContent = `${errCount} error${errCount > 1 ? 's' : ''}`;
        } else if (warnCount > 0) {
          pill.className = 'grid-status-pill status-pill-check';
          pill.textContent = `${warnCount} to check`;
        } else {
          pill.className = 'grid-status-pill status-pill-ready';
          pill.textContent = 'Ready';
        }
      }

      // Update cell error/warning indicators
      const activeCols = this.getActiveColumns();
      activeCols.forEach(col => {
        const td = tr.querySelector(`td[data-col="${col.key}"]`);
        if (!td) return;

        const err = row.errors[col.key];
        const warn = row.warnings[col.key];
        const isChecked = Boolean(row.checkedByAgent && row.checkedByAgent[col.key]);

        td.classList.remove('cell-error', 'cell-warning', 'cell-verified-agent');
        if (err) td.classList.add('cell-error');
        else if (warn) td.classList.add('cell-warning');
        else if (isChecked) td.classList.add('cell-verified-agent');

        let msgEl = td.querySelector('.cell-msg');
        if (err) {
          if (!msgEl) {
            msgEl = document.createElement('span');
            td.querySelector('.cell-editor-wrap')?.appendChild(msgEl);
          }
          msgEl.className = 'cell-msg cell-msg-error';
          msgEl.dataset.rowId = row.id;
          msgEl.dataset.col = col.key;
          msgEl.innerHTML = `${err} <button type="button" class="btn-inspect-field" data-row-id="${row.id}" data-col="${col.key}" title="Inspect in side panel">🔍</button>`;
        } else if (warn) {
          if (!msgEl) {
            msgEl = document.createElement('span');
            td.querySelector('.cell-editor-wrap')?.appendChild(msgEl);
          }
          msgEl.className = 'cell-msg cell-msg-warning';
          msgEl.dataset.rowId = row.id;
          msgEl.dataset.col = col.key;
          msgEl.innerHTML = `${warn} <button type="button" class="btn-inspect-field" data-row-id="${row.id}" data-col="${col.key}" title="Inspect in side panel">🔍</button>`;
        } else if (isChecked) {
          if (!msgEl) {
            msgEl = document.createElement('span');
            td.querySelector('.cell-editor-wrap')?.appendChild(msgEl);
          }
          msgEl.className = 'cell-msg cell-msg-verified';
          msgEl.textContent = '✓ Checked by agent';
        } else if (msgEl) {
          msgEl.remove();
        }
      });
    });
  }

  updateDom() {
    if (!this._container) return;
    const gridEl = this._container.querySelector('#groupGridContainer');
    if (gridEl) {
      gridEl.outerHTML = this.render();
      this.attachEvents(this._container);
    }
  }
}


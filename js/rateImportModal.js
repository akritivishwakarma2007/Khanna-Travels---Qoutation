/**
 * Rate Table Import Preview Modal Component
 * 
 * Displays:
 * - File name, sheet count, layout detected per sheet
 * - Summary table: Sum Insured | Coverage | # Day slabs | # Age bands | # Rates | Status
 * - Dynamic Sum Insured indicator ("✨ New sum insured — will be added")
 * - Expandable row to eyeball the parsed grid
 * - Errors and warnings with sheet name + cell reference (e.g. "USD 75,000!C9")
 * - Import mode radio: Replace (default) / Merge
 * - Cancel and "Import N groups" buttons
 * - Gemini AI Multimodal Vision extraction for PDFs, Images, Word Docs, and Complex Sheets
 */

import { parseWorkbook } from './rateImport.js';
import { extractDocRates } from './api.js';

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function openRateImportModal(options = {}) {
  const {
    file,
    plan,
    existingCoverages = [50000, 100000, 200000, 250000, 500000, 750000, 1000000],
    currentDaysSlabs = [],
    currentAgeBands = [],
    onApply = () => {},
    onCancel = () => {}
  } = options;

  if (!file) return;

  const fileName = file.name || '';
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const fileType = (file.type || '').toLowerCase();

  const isDocOrImageOrPdf = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'doc', 'docx'].includes(ext) ||
                            fileType.startsWith('image/') ||
                            fileType.includes('pdf') ||
                            fileType.includes('word');

  // Create modal container
  const backdrop = document.createElement('div');
  backdrop.className = 'pr-modal-backdrop rim-backdrop';
  backdrop.style.zIndex = '9999';

  document.body.appendChild(backdrop);

  // Close helper
  const closeModal = () => {
    backdrop.remove();
    onCancel();
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  // If PDF, Image, Word document -> Run Gemini Multimodal AI extraction directly
  if (isDocOrImageOrPdf) {
    _runGeminiExtraction(backdrop, file, existingCoverages, plan, onApply, closeModal);
    return;
  }

  // Otherwise, spreadsheet (.xlsx, .xls, .csv) -> Run SheetJS parse with fallback to Gemini
  _runSpreadsheetParse(backdrop, file, existingCoverages, currentDaysSlabs, currentAgeBands, plan, onApply, closeModal);
}

function _showLoadingState(backdrop, fileName, title, subtitle) {
  backdrop.innerHTML = `
    <div class="pr-modal-box rim-modal-box" style="max-width: 960px; width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
      <div class="pr-modal-header" style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 class="pr-modal-title" style="margin:0; font-size:18px; font-weight:700; color:#0f172a;">${esc(title)}</h3>
          <div style="font-size:13px; color:#64748b; margin-top:2px;">Analyzing "${esc(fileName)}"...</div>
        </div>
        <button type="button" class="pr-modal-close rim-btn-close" style="font-size:20px; background:none; border:none; cursor:pointer; color:#94a3b8;">&times;</button>
      </div>
      <div class="pr-modal-body" style="padding: 48px 24px; text-align: center; color: #475569;">
        <div class="rim-spinner" style="margin: 0 auto 18px auto; width: 44px; height: 44px; border: 4px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: rimSpin 0.8s linear infinite;"></div>
        <div style="font-weight: 700; font-size: 16px; color: #1e293b;">${esc(title)}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 6px; max-width: 520px; margin-left: auto; margin-right: auto; line-height: 1.5;">
          ${esc(subtitle)}
        </div>
      </div>
    </div>
  `;
  backdrop.querySelector('.rim-btn-close')?.addEventListener('click', () => backdrop.remove());
}

async function _runGeminiExtraction(backdrop, file, existingCoverages, plan, onApply, closeModal) {
  _showLoadingState(
    backdrop,
    file.name,
    'Gemini AI Document Rate Extraction',
    'Scanning document with Gemini 3.5 Flash vision. Identifying plan rates, sum insured, region, age bands, and days slabs dynamically...'
  );

  try {
    const result = await extractDocRates(file, existingCoverages);

    if (!result.groups || result.groups.length === 0) {
      throw new Error('Gemini AI could not identify any rate tables in this document.');
    }

    _renderParsedPreview(backdrop, result, plan, onApply, closeModal, {
      file,
      existingCoverages
    });
  } catch (err) {
    _renderError(backdrop, err.message, closeModal, () => {
      _runGeminiExtraction(backdrop, file, existingCoverages, plan, onApply, closeModal);
    });
  }
}

function _runSpreadsheetParse(backdrop, file, existingCoverages, currentDaysSlabs, currentAgeBands, plan, onApply, closeModal) {
  _showLoadingState(
    backdrop,
    file.name,
    'Reading Spreadsheet Sheets',
    'Detecting table layouts, validating slabs, and extracting rate matrices...'
  );

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const XLSX = window.XLSX;
      if (!XLSX) {
        throw new Error('SheetJS (XLSX) library is not loaded. Please refresh the page.');
      }

      setTimeout(() => {
        try {
          const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellStyles: true });
          const parsedResult = parseWorkbook(workbook, {
            fileName: file.name,
            existingCoverages,
            currentDaysSlabs,
            currentAgeBands
          });

          // If SheetJS found 0 groups, offer or auto-fallback to Gemini
          if (!parsedResult.groups || parsedResult.groups.length === 0) {
            _runGeminiExtraction(backdrop, file, existingCoverages, plan, onApply, closeModal);
            return;
          }

          _renderParsedPreview(backdrop, parsedResult, plan, onApply, closeModal, {
            file,
            existingCoverages
          });
        } catch (parseErr) {
          // If workbook parse failed, fallback to Gemini AI extraction
          _runGeminiExtraction(backdrop, file, existingCoverages, plan, onApply, closeModal);
        }
      }, 50);
    } catch (err) {
      _runGeminiExtraction(backdrop, file, existingCoverages, plan, onApply, closeModal);
    }
  };

  reader.onerror = () => {
    _renderError(backdrop, 'Failed to read the selected file from disk.', closeModal);
  };

  reader.readAsArrayBuffer(file);
}

function _renderError(backdrop, errorMessage, closeModal, retryFn = null) {
  const modalBox = backdrop.querySelector('.rim-modal-box');
  if (!modalBox) return;

  modalBox.innerHTML = `
    <div class="pr-modal-header" style="padding: 16px 20px; border-bottom: 1px solid #fee2e2; background:#fef2f2; display:flex; justify-content:space-between; align-items:center;">
      <h3 class="pr-modal-title" style="margin:0; font-size:18px; font-weight:700; color:#991b1b;">Import Error</h3>
      <button type="button" class="pr-modal-close rim-btn-close" style="font-size:20px; background:none; border:none; cursor:pointer; color:#991b1b;">&times;</button>
    </div>
    <div class="pr-modal-body" style="padding: 24px; color: #475569;">
      <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:16px; color:#b91c1c; font-size:14px; margin-bottom:16px;">
        <strong>Could not parse rate document:</strong><br/>
        ${esc(errorMessage)}
      </div>
      <p style="font-size:13px; color:#64748b; margin:0;">
        Make sure the file is a clear rate sheet document (PDF, Excel, Word, or Image).
      </p>
    </div>
    <div class="pr-modal-footer" style="padding: 12px 20px; border-top: 1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:8px;">
      <button type="button" class="btn btn-outline rim-btn-close">Close</button>
      ${retryFn ? `<button type="button" class="btn btn-primary rim-btn-retry">Try Again with Gemini AI</button>` : ''}
    </div>
  `;
  modalBox.querySelectorAll('.rim-btn-close').forEach(btn => btn.addEventListener('click', closeModal));
  if (retryFn) {
    modalBox.querySelector('.rim-btn-retry')?.addEventListener('click', retryFn);
  }
}

function _renderParsedPreview(backdrop, parsedResult, plan, onApply, closeModal, extra = {}) {
  const modalBox = backdrop.querySelector('.rim-modal-box');
  if (!modalBox) return;

  const {
    fileName,
    sheets = [],
    groups = [],
    planName = null,
    allErrors = [],
    allWarnings = [],
    totalRates = 0,
    totalDaysSlabs = 0
  } = parsedResult;

  let importMode = 'replace'; // 'replace' | 'merge'
  const expandedGroupIds = new Set();

  const renderContent = () => {
    const selectedGroups = groups.filter(g => g.selected);
    const hasSelectedErrors = selectedGroups.some(g => g.status === 'error');
    const canImport = selectedGroups.length > 0 && !hasSelectedErrors;

    const totalSelectedRates = selectedGroups.reduce((acc, g) => acc + (g.ratesCount || 0), 0);
    const totalSelectedSlabs = selectedGroups.reduce((acc, g) => acc + (g.daysSlabs ? g.daysSlabs.length : 0), 0);
    const hasNewSumInsured = selectedGroups.some(g => g.isNewSumInsured);

    modalBox.innerHTML = `
      <style>
        .rim-table th { background: #f8fafc; font-weight: 600; font-size: 12px; color: #475569; text-transform: uppercase; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; text-align: left; }
        .rim-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .rim-row:hover { background: #f8fafc; cursor: pointer; }
        .rim-badge-ok { background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 9999px; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
        .rim-badge-warn { background: #fef3c7; color: #b45309; padding: 3px 8px; border-radius: 9999px; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
        .rim-badge-err { background: #fee2e2; color: #b91c1c; padding: 3px 8px; border-radius: 9999px; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
        .rim-grid-preview table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .rim-grid-preview th { background: #edf2f7; color: #1a202c; padding: 6px 8px; border: 1px solid #cbd5e0; text-align: right; }
        .rim-grid-preview th:first-child { text-align: left; }
        .rim-grid-preview td { padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-variant-numeric: tabular-nums; }
        .rim-grid-preview td:first-child { text-align: left; font-weight: 600; background: #f7fafc; }
      </style>

      <!-- Header -->
      <div class="pr-modal-header" style="padding: 16px 22px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <h3 class="pr-modal-title" style="margin:0; font-size:18px; font-weight:700; color:#0f172a;">Rate Table Preview</h3>
            <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:6px; font-size:12px; font-weight:600;">
              📄 ${esc(fileName)}
            </span>
            ${planName ? `<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:6px; font-size:12px; font-weight:600;">Plan: ${esc(planName)}</span>` : ''}
            ${plan ? `<span style="font-size:13px; color:#64748b;">Target Plan: <strong style="color:#0f172a;">${esc(plan.planName)}</strong></span>` : ''}
          </div>
          <div style="font-size:12px; color:#64748b; margin-top:4px; display:flex; flex-wrap:wrap; gap:6px;">
            ${sheets.map(s => `
              <span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; border:1px solid #e2e8f0;">
                <strong>${esc(s.name)}</strong>: ${esc(s.layout)}
              </span>
            `).join('')}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${extra.file ? `
            <button type="button" class="btn btn-outline btn-sm rim-btn-reextract-ai" title="Re-analyze entire document with Gemini 3.5 Flash Multimodal AI" style="font-size:12px; padding:4px 10px;">
              ✨ Re-extract with Gemini AI
            </button>
          ` : ''}
          <button type="button" class="pr-modal-close rim-btn-close" style="font-size:20px; background:none; border:none; cursor:pointer; color:#94a3b8;">&times;</button>
        </div>
      </div>

      <!-- Scrollable Body -->
      <div class="pr-modal-body" style="padding: 18px 22px; overflow-y: auto; flex: 1;">

        <!-- Summary Bar -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:18px;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
            <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:#64748b;">Detected Tables</div>
            <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:2px;">
              ${groups.length} <span style="font-size:13px; font-weight:500; color:#64748b;">(${selectedGroups.length} selected)</span>
            </div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
            <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:#64748b;">Total Rates</div>
            <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:2px;">
              ${totalRates.toLocaleString()} <span style="font-size:13px; font-weight:500; color:#64748b;">(${totalSelectedRates.toLocaleString()} selected)</span>
            </div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
            <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:#64748b;">Day Slabs</div>
            <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:2px;">
              ${totalDaysSlabs} <span style="font-size:13px; font-weight:500; color:#64748b;">(${totalSelectedSlabs} selected)</span>
            </div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
            <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:#64748b;">Status</div>
            <div style="margin-top:4px;">
              ${hasSelectedErrors
                ? `<span class="rim-badge-err">❌ Selected contains errors</span>`
                : (allWarnings.length > 0 ? `<span class="rim-badge-warn">⚠️ Ready with notices</span>` : `<span class="rim-badge-ok">✅ All OK</span>`)
              }
            </div>
          </div>
        </div>

        ${hasNewSumInsured ? `
          <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:12px 16px; margin-bottom:16px; display:flex; align-items:center; gap:10px;">
            <span style="font-size:20px;">✨</span>
            <div style="font-size:13px; color:#0369a1;">
              <strong>New Sum Insured Detected:</strong> This document contains coverage amount(s) not currently in the website's default list. 
              The website will automatically add them as new clickable Sum Insured buttons!
            </div>
          </div>
        ` : ''}

        <!-- Groups Table -->
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; margin-bottom:18px;">
          <table class="rim-table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="width:40px; text-align:center;">
                  <input type="checkbox" id="rimSelectAll" ${groups.every(g => g.selected) ? 'checked' : ''} style="cursor:pointer;" />
                </th>
                <th>Sum Insured</th>
                <th>Coverage (Region)</th>
                <th>Day Slabs</th>
                <th>Age Bands</th>
                <th>Rates</th>
                <th>Status</th>
                <th style="text-align:right;">Preview</th>
              </tr>
            </thead>
            <tbody>
              ${groups.length === 0 ? `
                <tr>
                  <td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">
                    No rate groups detected in this document.
                  </td>
                </tr>
              ` : groups.map((g) => {
                const isExpanded = expandedGroupIds.has(g.id);
                const statusBadge = g.status === 'ok'
                  ? `<span class="rim-badge-ok">✅ OK</span>`
                  : (g.status === 'warning'
                    ? `<span class="rim-badge-warn">⚠️ Notice</span>`
                    : `<span class="rim-badge-err">❌ Error</span>`);

                const formattedSI = `$${g.sumInsured.toLocaleString()}`;

                return `
                  <tr class="rim-row" data-group-id="${esc(g.id)}">
                    <td style="text-align:center;" onclick="event.stopPropagation();">
                      <input
                        type="checkbox"
                        class="rim-group-checkbox"
                        data-group-id="${esc(g.id)}"
                        ${g.selected ? 'checked' : ''}
                        ${g.status === 'error' ? 'disabled' : ''}
                        style="cursor:pointer;"
                      />
                    </td>
                    <td>
                      <strong style="font-size:14px; color:#0f172a;">${formattedSI}</strong>
                      ${g.isNewSumInsured ? `
                        <div style="font-size:11px; color:#0284c7; font-weight:600; margin-top:2px;">
                          ✨ New sum insured — will be added
                        </div>
                      ` : ''}
                    </td>
                    <td>
                      <span style="font-weight:600; color:#334155;">${esc(g.coverageLabel)}</span>
                      <div style="font-size:11px; color:#64748b;">Source: ${esc(g.sheetName)}</div>
                    </td>
                    <td>
                      <strong>${g.daysSlabs.length}</strong> slabs
                      <div style="font-size:11px; color:#64748b;">${g.daysSlabs[0]?.label || ''} … ${g.daysSlabs[g.daysSlabs.length - 1]?.label || ''}</div>
                    </td>
                    <td>
                      <strong>${g.ageBands.length}</strong> bands
                      <div style="font-size:11px; color:#64748b;">${g.ageBands[0]?.label || ''} … ${g.ageBands[g.ageBands.length - 1]?.label || ''}</div>
                    </td>
                    <td>
                      <strong>${g.ratesCount}</strong>
                    </td>
                    <td>
                      ${statusBadge}
                    </td>
                    <td style="text-align:right;">
                      <button type="button" class="btn btn-outline btn-sm rim-btn-toggle-grid" data-group-id="${esc(g.id)}" style="font-size:11px; padding:4px 8px;">
                        ${isExpanded ? '▲ Hide Grid' : '▼ View Grid'}
                      </button>
                    </td>
                  </tr>
                  ${isExpanded ? `
                    <tr style="background:#f8fafc;">
                      <td colspan="8" style="padding:16px 20px;">
                        <div style="font-weight:700; font-size:13px; color:#1e293b; margin-bottom:8px;">
                          Grid Eyeball: ${formattedSI} · ${esc(g.coverageLabel)} (${g.daysSlabs.length} Days Slabs × ${g.ageBands.length} Age Bands)
                        </div>
                        <div class="rim-grid-preview" style="max-height:280px; overflow:auto; border:1px solid #cbd5e0; border-radius:6px; background:#fff;">
                          <table>
                            <thead>
                              <tr>
                                <th>Days Slab</th>
                                ${g.ageBands.map(a => `<th>${esc(a.label)}</th>`).join('')}
                              </tr>
                            </thead>
                            <tbody>
                              ${g.daysSlabs.map((slab, r) => `
                                <tr>
                                  <td>${esc(slab.label)}</td>
                                  ${g.ageBands.map((band, c) => {
                                    const val = g.matrix[r] ? g.matrix[r][c] : null;
                                    return `<td>${val !== null && val !== undefined ? `₹${Number(val).toLocaleString()}` : '<span style="color:#cbd5e0;">—</span>'}</td>`;
                                  }).join('')}
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ` : ''}
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Import Mode Radio Selection -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-weight:700; font-size:13px; color:#1e293b;">Import Mode</div>
            <div style="font-size:12px; color:#64748b;">Choose how rates are applied to the active plan in state</div>
          </div>
          <div style="display:flex; align-items:center; gap:20px;">
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:#334155; cursor:pointer;">
              <input type="radio" name="rimImportMode" value="replace" ${importMode === 'replace' ? 'checked' : ''} style="cursor:pointer;" />
              Replace (default)
              <span style="font-size:11px; font-weight:400; color:#64748b;">— update matching groups with new rates & slabs</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:#334155; cursor:pointer;">
              <input type="radio" name="rimImportMode" value="merge" ${importMode === 'merge' ? 'checked' : ''} style="cursor:pointer;" />
              Merge
              <span style="font-size:11px; font-weight:400; color:#64748b;">— update matching cells only, keep others</span>
            </label>
          </div>
        </div>

      </div>

      <!-- Footer Buttons -->
      <div class="pr-modal-footer" style="padding: 14px 22px; border-top: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
        <div style="font-size:12px; color:#64748b;">
          ${canImport
            ? `Ready to import <strong>${selectedGroups.length}</strong> group(s) with <strong>${totalSelectedRates.toLocaleString()}</strong> rate values.`
            : (selectedGroups.length === 0
              ? 'Select at least one group to import.'
              : '<span style="color:#b91c1c; font-weight:600;">Resolve or uncheck groups with errors before importing.</span>')
          }
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button type="button" class="btn btn-outline rim-btn-close">Cancel</button>
          <button
            type="button"
            class="btn btn-primary rim-btn-apply"
            ${!canImport ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}
          >
            Import ${selectedGroups.length} group${selectedGroups.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    `;

    _attachEvents();
  };

  const _attachEvents = () => {
    // Close
    modalBox.querySelectorAll('.rim-btn-close').forEach(btn => btn.addEventListener('click', closeModal));

    // Re-extract with Gemini AI button
    const btnReextract = modalBox.querySelector('.rim-btn-reextract-ai');
    if (btnReextract && extra.file) {
      btnReextract.addEventListener('click', () => {
        _runGeminiExtraction(backdrop, extra.file, extra.existingCoverages, plan, onApply, closeModal);
      });
    }

    // Select all checkbox
    const selectAll = modalBox.querySelector('#rimSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const checked = e.target.checked;
        groups.forEach(g => {
          if (g.status !== 'error') {
            g.selected = checked;
          }
        });
        renderContent();
      });
    }

    // Group checkboxes
    modalBox.querySelectorAll('.rim-group-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const gid = cb.dataset.groupId;
        const g = groups.find(x => x.id === gid);
        if (g && g.status !== 'error') {
          g.selected = cb.checked;
        }
        renderContent();
      });
    });

    // Expand/collapse grid preview
    modalBox.querySelectorAll('.rim-btn-toggle-grid').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gid = btn.dataset.groupId;
        if (expandedGroupIds.has(gid)) {
          expandedGroupIds.delete(gid);
        } else {
          expandedGroupIds.add(gid);
        }
        renderContent();
      });
    });

    // Row click expands preview
    modalBox.querySelectorAll('.rim-row').forEach(row => {
      row.addEventListener('click', () => {
        const gid = row.dataset.groupId;
        if (expandedGroupIds.has(gid)) {
          expandedGroupIds.delete(gid);
        } else {
          expandedGroupIds.add(gid);
        }
        renderContent();
      });
    });

    // Mode radio
    modalBox.querySelectorAll('input[name="rimImportMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        importMode = e.target.value;
      });
    });

    // Apply button
    const btnApply = modalBox.querySelector('.rim-btn-apply');
    if (btnApply) {
      btnApply.addEventListener('click', () => {
        const selectedGroups = groups.filter(g => g.selected && g.status !== 'error');
        if (selectedGroups.length === 0) return;

        closeModal();
        onApply({
          selectedGroups,
          mode: importMode,
          totalRates: selectedGroups.reduce((acc, g) => acc + (g.ratesCount || 0), 0),
          totalDaysSlabs: selectedGroups.reduce((acc, g) => acc + (g.daysSlabs ? g.daysSlabs.length : 0), 0),
          planName: planName || null
        });
      });
    }
  };

  renderContent();
}

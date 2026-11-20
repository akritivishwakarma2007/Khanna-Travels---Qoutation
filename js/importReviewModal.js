/**
 * Khanna Travels — Rate Table Import with Real-Time Clash Checks & Resolution Stepper
 * 
 * Stepper:
 *   Step 1: File (done) — file selected directly from OS file picker (CSV, Excel, Image)
 *   Step 2: Review — in-memory clash checks (client & server), red banner, legend, per-row resolution
 *   Step 3: Save — commits to database only on final Save
 */

import { checkImportClashesApi, commitImportRatesApi } from './api.js';

function cleanStr(s) {
  return String(s || '').trim().toLowerCase();
}

function isOverlap(a1, a2, b1, b2) {
  return Math.max(a1, b1) <= Math.min(a2, b2);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class RateImportReviewController {
  constructor(options) {
    this.company = options.company;
    this.plan = options.plan;
    this.file = options.file;
    this.onSaved = options.onSaved || (() => {});
    this.app = options.app;

    this.mode = 'merge'; // 'merge' or 'replace'
    this.rows = [];
    this.savedRates = this.plan.rates || [];
    this.imageUrl = null;
    this.modalEl = null;

    if (this.file && this.file.type && this.file.type.startsWith('image/')) {
      this.imageUrl = URL.createObjectURL(this.file);
    }
  }

  async start() {
    try {
      this.app.showToast('Analyzing imported rate data & running clash checks...', 'info');

      // Call server-side clash check API
      const serverResult = await checkImportClashesApi(
        this.company._id,
        this.plan._id,
        this.file,
        this.mode
      );

      this.rows = (serverResult.rows || []).map(r => ({
        ...r,
        action: null, // 'keep_saved', 'use_imported', 'confirmed', 'skip'
        confirmed: false
      }));

      // Re-run in-memory evaluation
      this.reEvaluateClashes();
      this.render();
    } catch (err) {
      this.app.showToast('Import analysis failed: ' + err.message, 'error');
    }
  }

  // ── Client-side Clash Check Evaluation ──────────────────────────────────
  reEvaluateClashes() {
    const saved = this.savedRates || [];
    const mode = this.mode;

    // 1. Evaluate against saved table
    this.rows.forEach(r => {
      if (r.isDeleted) return;

      const numCov = Number(r.coverage);
      const numPrem = Number(r.premium);
      const aFrom = Number(r.ageFrom);
      const aTo = Number(r.ageTo);
      const dFrom = Number(r.daysFrom);
      const dTo = Number(r.daysTo);

      const isInvalid = (
        isNaN(numCov) || isNaN(numPrem) || numPrem <= 0 ||
        isNaN(aFrom) || isNaN(aTo) || aFrom > aTo ||
        isNaN(dFrom) || isNaN(dTo) || dFrom > dTo ||
        !r.region
      );

      if (isInvalid) {
        r.tag = 'Clash';
        r.status = 'Error';
        r.isInvalid = true;
        r.note = 'Missing or invalid numbers/boundaries';
        return;
      }

      r.isInvalid = false;

      // In "Replace the whole table" mode: skip checks against saved rows
      if (mode === 'replace') {
        r.tag = 'New';
        r.status = 'OK';
        r.note = 'Will replace table';
        return;
      }

      // If user chose "keep_saved", resolve as skipped
      if (r.action === 'keep_saved') {
        r.status = 'OK';
        r.note = 'Resolved: Keep saved (this row will be skipped)';
        return;
      }

      // If user chose "use_imported", resolve as OK (will replace conflicting saved band)
      if (r.action === 'use_imported') {
        r.status = 'OK';
        r.note = 'Resolved: Use imported (replaces saved band)';
        return;
      }

      // Exact match check
      const exact = saved.find(s =>
        s.coverage === numCov &&
        cleanStr(s.region) === cleanStr(r.region) &&
        s.ageFrom === aFrom && s.ageTo === aTo &&
        s.daysFrom === dFrom && s.daysTo === dTo
      );

      if (exact) {
        if (exact.premium === numPrem) {
          r.tag = 'Same';
          r.status = 'OK';
          r.note = 'Exact match with saved table (no write needed)';
          r.savedId = exact._id;
        } else {
          r.tag = 'Changed';
          r.oldPremium = exact.premium;
          const pct = Math.abs(numPrem - exact.premium) / exact.premium * 100;
          r.pctChange = Math.round(pct);
          r.savedId = exact._id;

          if (pct > 30 && !r.confirmed) {
            r.status = 'Check';
            r.isLargeChange = true;
            r.note = 'Large change. Check the digits.';
          } else {
            r.status = 'OK';
            r.note = `Was ₹${exact.premium}`;
          }
        }
        return;
      }

      // Overlap with saved table (Clash)
      const overlap = saved.find(s =>
        s.coverage === numCov &&
        cleanStr(s.region) === cleanStr(r.region) &&
        isOverlap(aFrom, aTo, s.ageFrom, s.ageTo) &&
        isOverlap(dFrom, dTo, s.daysFrom, s.daysTo)
      );

      if (overlap) {
        r.tag = 'Clash';
        r.status = 'Error';
        r.clashType = 'saved_table';
        r.savedBand = {
          ageFrom: overlap.ageFrom,
          ageTo: overlap.ageTo,
          daysFrom: overlap.daysFrom,
          daysTo: overlap.daysTo,
          premium: overlap.premium,
          id: overlap._id
        };
        r.note = `Clashes with saved band: Days ${overlap.daysFrom}-${overlap.daysTo}, Age ${overlap.ageFrom}-${overlap.ageTo} (₹${overlap.premium})`;
        return;
      }

      // New key
      r.tag = 'New';
      r.status = 'OK';
      r.note = 'New rate record';
    });

    // 2. Internal checks inside import (both merge & replace)
    const activeRows = this.rows.filter(r => !r.isDeleted && r.action !== 'keep_saved');
    for (let i = 0; i < activeRows.length; i++) {
      for (let j = i + 1; j < activeRows.length; j++) {
        const r1 = activeRows[i];
        const r2 = activeRows[j];
        if (r1.isInvalid || r2.isInvalid) continue;

        if (r1.coverage === r2.coverage && cleanStr(r1.region) === cleanStr(r2.region)) {
          if (r1.ageFrom === r2.ageFrom && r1.ageTo === r2.ageTo && r1.daysFrom === r2.daysFrom && r1.daysTo === r2.daysTo) {
            r1.tag = 'Clash';
            r1.status = 'Error';
            r1.clashType = 'import_duplicate';
            r1.note = `Appears twice (rows ${r1.rowNum} and ${r2.rowNum})`;

            r2.tag = 'Clash';
            r2.status = 'Error';
            r2.clashType = 'import_duplicate';
            r2.note = `Appears twice (rows ${r1.rowNum} and ${r2.rowNum})`;
          } else if (isOverlap(r1.ageFrom, r1.ageTo, r2.ageFrom, r2.ageTo) && isOverlap(r1.daysFrom, r1.daysTo, r2.daysFrom, r2.daysTo)) {
            r1.tag = 'Clash';
            r1.status = 'Error';
            r1.clashType = 'import_overlap';
            r1.note = `Overlaps row ${r2.rowNum}`;

            r2.tag = 'Clash';
            r2.status = 'Error';
            r2.note = `Overlaps row ${r1.rowNum}`;
          }
        }
      }
    }
  }

  getCounts() {
    const counts = {
      total: 0,
      new: 0,
      changed: 0,
      same: 0,
      clash: 0,
      check: 0,
      error: 0,
      missing: 0,
      toWrite: 0,
      unresolved: 0
    };

    this.rows.forEach(r => {
      if (r.isDeleted) return;
      counts.total++;

      if (r.tag === 'New') counts.new++;
      else if (r.tag === 'Changed') counts.changed++;
      else if (r.tag === 'Same') counts.same++;
      else if (r.tag === 'Clash') counts.clash++;

      if (r.isInvalid) counts.missing++;

      if (r.status === 'Check') {
        counts.check++;
        counts.unresolved++;
      } else if (r.status === 'Error') {
        counts.error++;
        counts.unresolved++;
      }

      if (r.status === 'OK' && r.tag !== 'Same' && r.action !== 'keep_saved') {
        counts.toWrite++;
      }
    });

    return counts;
  }

  // ── Render Modal UI ────────────────────────────────────────────────────────
  render() {
    const existing = document.getElementById('rateImportReviewModal');
    if (existing) existing.remove();

    const counts = this.getCounts();
    const fileName = this.file ? this.file.name : 'Uploaded File';
    const fileSizeStr = this.file && this.file.size ? `(${(this.file.size / 1024).toFixed(1)} KB)` : '';

    const modalHtml = `
      <div class="modal-backdrop" id="rateImportReviewModal" style="display:flex; align-items:center; justify-content:center; position:fixed; inset:0; background:rgba(15,23,42,0.7); z-index:99999; backdrop-filter:blur(4px); overflow-y:auto; padding:20px;">
        <div class="modal-card import-review-card" style="background:#ffffff; border-radius:14px; width:98%; max-width:1160px; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); overflow:hidden; border:1px solid #e2e8f0;">
          
          <!-- Modal Header with Stepper -->
          <div class="import-modal-header" style="padding:16px 24px; border-bottom:1px solid #e2e8f0; background:#f8fafc; display:flex; flex-direction:column; gap:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h2 style="margin:0; font-size:1.25rem; font-weight:800; color:#1e293b; display:flex; align-items:center; gap:8px;">
                  <span>📂 Import Rates</span>
                  <span style="font-size:0.875rem; font-weight:600; color:#64748b; background:#e2e8f0; padding:2px 10px; border-radius:999px;">${esc(this.company.companyName)} — ${esc(this.plan.planName)}</span>
                </h2>
              </div>
              <button type="button" class="modal-close" id="btnCloseReviewModal" style="background:none; border:none; font-size:1.25rem; cursor:pointer; color:#64748b; padding:4px 8px;">✕</button>
            </div>

            <!-- Stepper: File (done) -> Review (active) -> Save (pending) -->
            <div class="import-stepper-wrap" style="display:flex; align-items:center; justify-content:center; gap:12px; margin:4px 0;">
              <!-- Step 1: File (done) -->
              <div class="stepper-step step-done" style="display:flex; align-items:center; gap:8px; color:#16a34a; font-weight:700; font-size:0.875rem;">
                <span style="display:flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:#dcfce7; color:#16a34a; font-size:0.85rem;">✓</span>
                <span>File (done): <strong style="color:#0f172a;">${esc(fileName)}</strong> ${fileSizeStr}</span>
              </div>
              <div style="width:36px; height:2px; background:#cbd5e1;"></div>
              <!-- Step 2: Review (active) -->
              <div class="stepper-step step-active" style="display:flex; align-items:center; gap:8px; color:#2563eb; font-weight:800; font-size:0.875rem;">
                <span style="display:flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:#dbeafe; color:#2563eb; font-size:0.85rem;">2</span>
                <span>Review & Resolve</span>
              </div>
              <div style="width:36px; height:2px; background:#cbd5e1;"></div>
              <!-- Step 3: Save (pending) -->
              <div class="stepper-step step-pending" style="display:flex; align-items:center; gap:8px; color:#94a3b8; font-weight:600; font-size:0.875rem;">
                <span style="display:flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:#f1f5f9; color:#94a3b8; font-size:0.85rem;">3</span>
                <span>Save</span>
              </div>
            </div>
          </div>

          <!-- Modal Body (Scrollable) -->
          <div class="import-modal-body" style="padding:16px 24px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px;">
            
            <!-- Red Banner (counts clashes and missing values, explains what a clash means) -->
            ${(counts.clash > 0 || counts.missing > 0) ? `
              <div class="clash-alert-banner" style="background:#fef2f2; border:1px solid #fecaca; border-left:5px solid #dc2626; border-radius:8px; padding:12px 16px; display:flex; gap:12px; align-items:flex-start;">
                <span style="font-size:1.4rem; line-height:1;">⚠️</span>
                <div style="flex:1;">
                  <strong style="color:#991b1b; font-size:0.95rem; display:block; margin-bottom:3px;">
                    ${counts.clash} Clash${counts.clash !== 1 ? 'es' : ''} ${counts.missing > 0 ? `and ${counts.missing} Missing/Invalid Value(s)` : ''} detected
                  </strong>
                  <p style="margin:0; font-size:0.825rem; color:#7f1d1d; line-height:1.45;">
                    A <strong>clash</strong> means an imported age range or days slab overlaps with an existing saved range or duplicate imported rows instead of matching exact boundaries. 
                    Choose <strong>"Keep saved"</strong> (skip imported row), <strong>"Use imported"</strong> (replace saved row), or edit the row. All clashes and checks must be resolved before saving.
                  </p>
                </div>
              </div>
            ` : counts.check > 0 ? `
              <div class="check-alert-banner" style="background:#fffbeb; border:1px solid #fde68a; border-left:5px solid #d97706; border-radius:8px; padding:12px 16px; display:flex; gap:12px; align-items:flex-start;">
                <span style="font-size:1.4rem; line-height:1;">⚠️</span>
                <div style="flex:1;">
                  <strong style="color:#92400e; font-size:0.95rem; display:block; margin-bottom:3px;">
                    ${counts.check} Row(s) with Large Price Changes (>30%)
                  </strong>
                  <p style="margin:0; font-size:0.825rem; color:#78350f; line-height:1.45;">
                    Please check the marked digits and click <strong>"Confirm"</strong> or edit the cell if correct.
                  </p>
                </div>
              </div>
            ` : `
              <div class="ok-alert-banner" style="background:#f0fdf4; border:1px solid #bbf7d0; border-left:5px solid #16a34a; border-radius:8px; padding:10px 16px; display:flex; gap:10px; align-items:center;">
                <span style="font-size:1.2rem; color:#16a34a;">✓</span>
                <span style="font-size:0.875rem; color:#166534; font-weight:600;">
                  All ${counts.total} imported rows verified and ready to save.
                </span>
              </div>
            `}

            <!-- Controls & Legend Bar -->
            <div class="import-controls-legend-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:#f8fafc; padding:10px 16px; border-radius:8px; border:1px solid #e2e8f0;">
              
              <!-- Mode Switcher -->
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.825rem; font-weight:700; color:#475569;">Import Mode:</span>
                <div class="segmented-control" id="importModeToggle" style="display:inline-flex; background:#e2e8f0; border-radius:6px; padding:2px;">
                  <button type="button" class="mode-btn ${this.mode === 'merge' ? 'active' : ''}" data-mode="merge" style="border:none; background:${this.mode === 'merge' ? '#ffffff' : 'transparent'}; color:${this.mode === 'merge' ? '#0f172a' : '#64748b'}; font-weight:${this.mode === 'merge' ? '700' : '500'}; padding:4px 12px; border-radius:4px; font-size:0.8rem; cursor:pointer;">
                    Merge with saved table
                  </button>
                  <button type="button" class="mode-btn ${this.mode === 'replace' ? 'active' : ''}" data-mode="replace" style="border:none; background:${this.mode === 'replace' ? '#ffffff' : 'transparent'}; color:${this.mode === 'replace' ? '#0f172a' : '#64748b'}; font-weight:${this.mode === 'replace' ? '700' : '500'}; padding:4px 12px; border-radius:4px; font-size:0.8rem; cursor:pointer;">
                    Replace the whole table
                  </button>
                </div>
              </div>

              <!-- Legend of Tags -->
              <div class="import-legend" style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-size:0.8rem;">
                <span style="font-weight:700; color:#475569;">Legend:</span>
                <span style="display:inline-flex; align-items:center; gap:4px; color:#15803d; font-weight:700;"><span style="width:8px; height:8px; border-radius:50%; background:#22c55e;"></span> New</span>
                <span style="display:inline-flex; align-items:center; gap:4px; color:#64748b; font-weight:700;"><span style="width:8px; height:8px; border-radius:50%; background:#94a3b8;"></span> Same</span>
                <span style="display:inline-flex; align-items:center; gap:4px; color:#1d4ed8; font-weight:700;"><span style="width:8px; height:8px; border-radius:50%; background:#3b82f6;"></span> Changed</span>
                <span style="display:inline-flex; align-items:center; gap:4px; color:#b91c1c; font-weight:700;"><span style="width:8px; height:8px; border-radius:50%; background:#ef4444;"></span> Clash</span>
                <span style="border-left:1px solid #cbd5e1; height:14px; margin:0 2px;"></span>
                <span style="display:inline-flex; align-items:center; gap:3px; background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; font-weight:700; font-size:0.75rem;">⚠️ Check (>30%)</span>
                <span style="display:inline-flex; align-items:center; gap:3px; background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-weight:700; font-size:0.75rem;">✕ Error</span>
              </div>
            </div>

            <!-- Optional Image Preview Section if image file uploaded -->
            ${this.imageUrl ? `
              <div style="border:1px solid #cbd5e1; border-radius:8px; padding:10px; background:#f1f5f9; display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong style="font-size:0.85rem; color:#334155;">🖼️ Uploaded Rate Table Image Preview:</strong>
                  <button type="button" class="btn btn-xs btn-outline" id="btnToggleImagePreview">Hide Image</button>
                </div>
                <div id="imagePreviewContainer" style="max-height:220px; overflow:auto; text-align:center; background:#fff; border-radius:6px; padding:6px;">
                  <img src="${this.imageUrl}" alt="Rate sheet image" style="max-width:100%; height:auto;" />
                </div>
              </div>
            ` : ''}

            <!-- Review Rates Table -->
            <div class="import-table-wrapper" style="border:1px solid #e2e8f0; border-radius:8px; overflow-x:auto; max-height:460px; background:#fff;">
              <table class="import-review-table" style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
                <thead style="background:#f1f5f9; position:sticky; top:0; z-index:10; border-bottom:2px solid #cbd5e1;">
                  <tr>
                    <th style="padding:10px 12px; width:44px;">#</th>
                    <th style="padding:10px 12px; min-width:90px;">Coverage</th>
                    <th style="padding:10px 12px; min-width:90px;">Region</th>
                    <th style="padding:10px 12px; min-width:110px;">Age Band</th>
                    <th style="padding:10px 12px; min-width:110px;">Days Slab</th>
                    <th style="padding:10px 12px; min-width:110px;">Premium (₹)</th>
                    <th style="padding:10px 12px; min-width:180px;">Vs saved table</th>
                    <th style="padding:10px 12px; min-width:140px; text-align:right;">Status / Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.rows.map((row, idx) => {
                    if (row.isDeleted) return '';

                    const isCheck = row.status === 'Check';
                    const isError = row.status === 'Error';
                    const isSame = row.tag === 'Same';
                    const isClash = row.tag === 'Clash';
                    const isChanged = row.tag === 'Changed';
                    const isNew = row.tag === 'New';

                    let rowBg = '#ffffff';
                    if (isError) rowBg = '#fff5f5';
                    else if (isCheck) rowBg = '#fffdf0';
                    else if (isSame) rowBg = '#f8fafc';

                    return `
                      <tr data-row-idx="${idx}" style="background:${rowBg}; border-bottom:1px solid #f1f5f9; transition:background 0.15s ease;">
                        
                        <!-- Row Num -->
                        <td style="padding:8px 12px; font-weight:600; color:#64748b;">${row.rowNum}</td>

                        <!-- Coverage -->
                        <td style="padding:8px 12px;">
                          <strong style="color:#0f172a;">$${Number(row.coverage || 0).toLocaleString()}</strong>
                        </td>

                        <!-- Region -->
                        <td style="padding:8px 12px;">
                          <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:600; font-size:0.75rem;">
                            ${esc(row.region)}
                          </span>
                        </td>

                        <!-- Age Band -->
                        <td style="padding:8px 12px;">
                          <div style="display:inline-flex; align-items:center; gap:4px;">
                            <input type="number" class="mini-range-input" data-field="ageFrom" data-row-idx="${idx}" value="${row.ageFrom}" min="0" max="120" style="width:48px; padding:3px 6px; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:4px; text-align:center;" />
                            <span>–</span>
                            <input type="number" class="mini-range-input" data-field="ageTo" data-row-idx="${idx}" value="${row.ageTo}" min="0" max="120" style="width:48px; padding:3px 6px; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:4px; text-align:center;" />
                            <span style="font-size:0.75rem; color:#64748b;">yrs</span>
                          </div>
                        </td>

                        <!-- Days Slab -->
                        <td style="padding:8px 12px;">
                          <div style="display:inline-flex; align-items:center; gap:4px;">
                            <input type="number" class="mini-range-input" data-field="daysFrom" data-row-idx="${idx}" value="${row.daysFrom}" min="1" max="365" style="width:48px; padding:3px 6px; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:4px; text-align:center;" />
                            <span>–</span>
                            <input type="number" class="mini-range-input" data-field="daysTo" data-row-idx="${idx}" value="${row.daysTo}" min="1" max="365" style="width:48px; padding:3px 6px; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:4px; text-align:center;" />
                            <span style="font-size:0.75rem; color:#64748b;">days</span>
                          </div>
                        </td>

                        <!-- Premium (Editable) -->
                        <td style="padding:8px 12px;">
                          <div style="display:inline-flex; align-items:center; gap:4px;">
                            <span style="color:#64748b; font-weight:700;">₹</span>
                            <input type="number" class="mini-prem-input" data-field="premium" data-row-idx="${idx}" value="${row.premium}" min="1" style="width:84px; padding:4px 8px; font-size:0.85rem; font-weight:700; border:1px solid ${isCheck ? '#f59e0b' : '#cbd5e1'}; border-radius:4px;" />
                          </div>
                        </td>

                        <!-- Vs saved table column -->
                        <td style="padding:8px 12px;">
                          <div style="display:flex; flex-direction:column; gap:3px;">
                            <!-- Tag Badge -->
                            <div>
                              ${isNew ? `
                                <span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem; display:inline-block;">New</span>
                              ` : isSame ? `
                                <span style="background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem; display:inline-block;">Same</span>
                              ` : isChanged ? `
                                <span style="background:#dbeafe; color:#1d4ed8; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem; display:inline-block;">Changed</span>
                              ` : `
                                <span style="background:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem; display:inline-block;">Clash</span>
                              `}
                            </div>

                            <!-- Details / Note -->
                            <span style="font-size:0.775rem; color:${isError ? '#dc2626' : isCheck ? '#d97706' : '#64748b'}; line-height:1.3;">
                              ${isChanged ? `Was ₹${row.oldPremium} → Now ₹${row.premium} (${row.premium > row.oldPremium ? '+' : '-'}${row.pctChange}%)` : esc(row.note)}
                            </span>
                          </div>
                        </td>

                        <!-- Status / Actions -->
                        <td style="padding:8px 12px; text-align:right;">
                          <div style="display:inline-flex; align-items:center; gap:6px; justify-content:flex-end;">
                            
                            <!-- If Large Change (>30%): Confirm button -->
                            ${isCheck ? `
                              <button type="button" class="btn btn-xs btn-outline btn-confirm-check" data-row-idx="${idx}" title="Confirm this price digit change" style="color:#d97706; border-color:#fde68a; background:#fffbeb; font-weight:700; font-size:0.75rem; padding:3px 8px; border-radius:4px; cursor:pointer;">
                                ✓ Confirm
                              </button>
                            ` : ''}

                            <!-- If Clash with saved table: Keep saved or Use imported -->
                            ${(isClash && row.clashType === 'saved_table' && !row.action) ? `
                              <button type="button" class="btn btn-xs btn-outline btn-keep-saved" data-row-idx="${idx}" title="Skip this imported row, keep existing database record" style="font-size:0.725rem; padding:3px 6px; border-radius:4px; border:1px solid #cbd5e1; cursor:pointer;">
                                Keep saved
                              </button>
                              <button type="button" class="btn btn-xs btn-outline btn-use-imported" data-row-idx="${idx}" title="Replace the overlapping saved band with this row" style="font-size:0.725rem; padding:3px 6px; border-radius:4px; border:1px solid #3b82f6; color:#1d4ed8; background:#eff6ff; font-weight:700; cursor:pointer;">
                                Use imported
                              </button>
                            ` : ''}

                            <!-- Status Chip -->
                            ${row.action === 'keep_saved' ? `
                              <span style="font-size:0.75rem; color:#64748b; font-weight:600;">Skipped</span>
                            ` : row.action === 'use_imported' ? `
                              <span style="font-size:0.75rem; color:#1d4ed8; font-weight:700;">Replaces saved</span>
                            ` : row.status === 'OK' ? `
                              <span style="color:#16a34a; font-weight:700; font-size:0.8rem;">✓ OK</span>
                            ` : row.status === 'Check' ? `
                              <span style="color:#d97706; font-weight:700; font-size:0.8rem;">⚠️ Check</span>
                            ` : `
                              <span style="color:#dc2626; font-weight:700; font-size:0.8rem;">✕ Error</span>
                            `}

                            <!-- Delete Row button -->
                            <button type="button" class="btn-del-import-row" data-row-idx="${idx}" title="Remove this row from import" style="background:none; border:none; cursor:pointer; color:#94a3b8; font-size:0.85rem; padding:2px 4px;">
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Bar under the table (shows mode and counts: new, changed, same, clash) -->
            <div class="import-bottom-summary-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:10px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:0.85rem;">
              <div>
                <span style="color:#64748b;">Mode:</span>
                <strong style="color:#1e293b; margin-left:4px;">
                  ${this.mode === 'replace' ? 'Replace the whole table' : 'Merge with existing table'}
                </strong>
              </div>
              <div style="display:flex; align-items:center; gap:14px; font-weight:600;">
                <span style="color:#15803d;">${counts.new} new</span>
                <span style="color:#1d4ed8;">${counts.changed} changed</span>
                <span style="color:#64748b;">${counts.same} same</span>
                <span style="color:#b91c1c;">${counts.clash} clash</span>
              </div>
            </div>

          </div>

          <!-- Modal Footer -->
          <div class="import-modal-footer" style="padding:14px 24px; border-top:1px solid #e2e8f0; background:#ffffff; display:flex; justify-content:space-between; align-items:center;">
            <button type="button" class="btn btn-outline" id="btnCancelImportFooter" style="border:1px solid #cbd5e1; padding:8px 16px; border-radius:6px; cursor:pointer;">
              Cancel
            </button>
            <div style="display:flex; align-items:center; gap:12px;">
              ${counts.unresolved > 0 ? `
                <span style="font-size:0.825rem; color:#dc2626; font-weight:600;">
                  ⚠️ Resolve all Check and Error rows to enable save
                </span>
              ` : `
                <span style="font-size:0.825rem; color:#16a34a; font-weight:600;">
                  ✓ Ready to commit ${counts.toWrite} rates
                </span>
              `}
              <button
                type="button"
                class="btn btn-primary"
                id="btnSaveImportToDb"
                ${counts.unresolved > 0 ? 'disabled style="background:#cbd5e1 !important; color:#94a3b8 !important; border:none; cursor:not-allowed; padding:9px 20px; border-radius:6px; font-weight:700;"' : 'style="background:#1e3a8a !important; color:#ffffff !important; border:none; cursor:pointer; padding:9px 20px; border-radius:6px; font-weight:700;"'}
              >
                ${counts.unresolved > 0 ? `Resolve ${counts.unresolved} row${counts.unresolved > 1 ? 's' : ''} to save` : `Save Rates (${counts.toWrite} to write)`}
              </button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.modalEl = document.getElementById('rateImportReviewModal');
    this.attachEvents();
  }

  // ── Events within Modal ───────────────────────────────────────────────────
  attachEvents() {
    if (!this.modalEl) return;

    const cleanup = () => {
      window.removeEventListener('keydown', handleKey);
      if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
      if (this.modalEl) this.modalEl.remove();
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') cleanup();
    };
    window.addEventListener('keydown', handleKey);

    // Close buttons
    const btnClose = this.modalEl.querySelector('#btnCloseReviewModal');
    const btnCancel = this.modalEl.querySelector('#btnCancelImportFooter');
    if (btnClose) btnClose.onclick = cleanup;
    if (btnCancel) btnCancel.onclick = cleanup;
    this.modalEl.onclick = (e) => { if (e.target === this.modalEl) cleanup(); };

    // Toggle image preview
    const btnToggleImg = this.modalEl.querySelector('#btnToggleImagePreview');
    const imgContainer = this.modalEl.querySelector('#imagePreviewContainer');
    if (btnToggleImg && imgContainer) {
      btnToggleImg.onclick = () => {
        const isHidden = imgContainer.style.display === 'none';
        imgContainer.style.display = isHidden ? 'block' : 'none';
        btnToggleImg.textContent = isHidden ? 'Hide Image' : 'Show Image';
      };
    }

    // Mode Toggle (Merge vs Replace)
    this.modalEl.querySelectorAll('#importModeToggle .mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetMode = btn.dataset.mode;
        if (this.mode === targetMode) return;
        this.mode = targetMode;
        this.reEvaluateClashes();
        this.render();
      });
    });

    // Inline Range & Premium Inputs
    this.modalEl.querySelectorAll('.mini-range-input, .mini-prem-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.rowIdx);
        const field = input.dataset.field;
        const val = Number(input.value);
        if (!isNaN(val) && this.rows[idx]) {
          this.rows[idx][field] = val;
          // Reset action/confirmation when user modifies numbers
          this.rows[idx].action = null;
          this.rows[idx].confirmed = false;
          this.reEvaluateClashes();
          this.render();
        }
      });
    });

    // Confirm Large Change button
    this.modalEl.querySelectorAll('.btn-confirm-check').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.rowIdx);
        if (this.rows[idx]) {
          this.rows[idx].confirmed = true;
          this.reEvaluateClashes();
          this.render();
          this.app.showToast(`Row ${this.rows[idx].rowNum} confirmed`, 'info');
        }
      });
    });

    // Keep Saved button
    this.modalEl.querySelectorAll('.btn-keep-saved').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.rowIdx);
        if (this.rows[idx]) {
          this.rows[idx].action = 'keep_saved';
          this.reEvaluateClashes();
          this.render();
          this.app.showToast(`Row ${this.rows[idx].rowNum}: Keep saved selected (will skip imported row)`, 'info');
        }
      });
    });

    // Use Imported button
    this.modalEl.querySelectorAll('.btn-use-imported').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.rowIdx);
        if (this.rows[idx]) {
          this.rows[idx].action = 'use_imported';
          this.reEvaluateClashes();
          this.render();
          this.app.showToast(`Row ${this.rows[idx].rowNum}: Use imported selected (will replace saved row)`, 'info');
        }
      });
    });

    // Delete Row button
    this.modalEl.querySelectorAll('.btn-del-import-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.rowIdx);
        if (this.rows[idx]) {
          this.rows[idx].isDeleted = true;
          this.reEvaluateClashes();
          this.render();
          this.app.showToast('Row removed from import', 'info');
        }
      });
    });

    // Final Commit Save Button
    const btnSave = this.modalEl.querySelector('#btnSaveImportToDb');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        const counts = this.getCounts();
        if (counts.unresolved > 0) {
          this.app.showToast(`Please resolve all ${counts.unresolved} check/error rows first`, 'warning');
          return;
        }

        const validRows = this.rows.filter(r => !r.isDeleted);
        if (validRows.length === 0) {
          this.app.showToast('No valid rates to save', 'warning');
          return;
        }

        btnSave.disabled = true;
        btnSave.textContent = 'Saving to database...';

        try {
          const res = await commitImportRatesApi(this.company._id, this.plan._id, {
            mode: this.mode,
            rows: validRows
          });

          this.app.showToast(res.message || 'Rates successfully committed to database!', 'success');
          cleanup();
          this.onSaved();
        } catch (err) {
          this.app.showToast('Failed to save rates: ' + err.message, 'error');
          btnSave.disabled = false;
          btnSave.textContent = `Save Rates (${counts.toWrite} to write)`;
        }
      });
    }
  }
}

/**
 * Convenience entry point to open Rate Import Review directly from a file picker
 */
export async function openRateImportReviewModal(options) {
  const controller = new RateImportReviewController(options);
  await controller.start();
}


/**
 * Khanna Travels — Admin View (3-Tier Hierarchical Flow + Auth + Inline Validation)
 * Level 1: Companies (/admin/companies)
 * Level 2: Plans (/admin/companies/:companyId/plans)
 * Level 3: Rate Table Matrix (/admin/companies/:companyId/plans/:planId/rates)
 */

import {
  getCompanies, getCompany, addCompany, renameCompany, toggleCompanyStatus, deleteCompany,
  getCompanyPlans, addPlan, renamePlan, togglePlanStatus, duplicatePlan, deletePlan,
  getRates, saveRateGrid, bulkEditRates, previewImportCsv, importRatesCsv, exportRatesCsvUrl, downloadTemplateUrl,
  loginAdmin, logoutAdmin, isAdminAuthenticated
} from './api.js';

// Default standard templates for Age Bands × Days Slabs
const DEFAULT_TEMPLATES = {
  'standard_5x17': {
    name: 'Standard (5 Ages × 17 Days)',
    ageBands: [
      { from: 0, to: 40 },
      { from: 41, to: 60 },
      { from: 61, to: 70 },
      { from: 71, to: 80 },
      { from: 81, to: 85 }
    ],
    daysSlabs: [
      { from: 1, to: 4 },
      { from: 5, to: 6 },
      { from: 7, to: 8 },
      { from: 9, to: 10 },
      { from: 11, to: 15 },
      { from: 16, to: 21 },
      { from: 22, to: 28 },
      { from: 29, to: 35 },
      { from: 36, to: 45 },
      { from: 46, to: 60 },
      { from: 61, to: 90 },
      { from: 91, to: 120 },
      { from: 121, to: 150 },
      { from: 151, to: 180 },
      { from: 181, to: 270 },
      { from: 271, to: 365 }
    ]
  },
  'quick_3x6': {
    name: 'Quick Compact (3 Ages × 6 Days)',
    ageBands: [
      { from: 0, to: 50 },
      { from: 51, to: 70 },
      { from: 71, to: 85 }
    ],
    daysSlabs: [
      { from: 1, to: 7 },
      { from: 8, to: 15 },
      { from: 16, to: 30 },
      { from: 31, to: 60 },
      { from: 61, to: 90 },
      { from: 91, to: 180 }
    ]
  }
};

export class AdminView {
  constructor(app) {
    this.app = app;
    this.state = {
      level: 'companies', // 'companies' | 'plans' | 'rates'
      companies: [],
      companyFilter: 'all', // 'all' | 'active' | 'archived'
      selectedCompany: null,
      selectedPlan: null,

      // Rates Grid state
      currentCoverage: 50000,
      currentRegion: 'Excluding',
      ageBands: [],
      daysSlabs: [],
      matrixData: {}, // key `${dayIdx}_${ageIdx}` => premium
      overlapErrors: [],
      gapWarnings: [],
      savedTemplates: { ...DEFAULT_TEMPLATES }
    };

    this._loadSavedTemplates();
  }

  _loadSavedTemplates() {
    try {
      const stored = localStorage.getItem('khanna_rate_templates');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state.savedTemplates = { ...DEFAULT_TEMPLATES, ...parsed };
      }
    } catch {
      // ignore
    }
  }

  _persistSavedTemplates() {
    try {
      localStorage.setItem('khanna_rate_templates', JSON.stringify(this.state.savedTemplates));
    } catch {
      // ignore
    }
  }

  // ── Render Entry ──────────────────────────────────────────────────────────
  render() {
    if (!isAdminAuthenticated()) {
      return this._renderLoginScreen();
    }

    return `
      <div class="admin-wrapper" id="adminWrapper">
        ${this._renderBreadcrumbs()}
        <div id="adminContent">
          ${this._renderCurrentLevel()}
        </div>
      </div>
    `;
  }

  // ── Login Screen ──────────────────────────────────────────────────────────
  _renderLoginScreen() {
    return `
      <div class="admin-login-wrapper">
        <div class="admin-login-card">
          <div class="admin-login-header">
            <div style="text-align:center; margin-bottom:1.25rem;">
              <img src="logo.png" alt="Khanna Travels" style="height:48px; max-height:52px; width:auto; object-fit:contain;" />
            </div>
            <h1 class="admin-login-title">Admin Portal Authentication</h1>
            <p class="admin-login-subtitle">
              Enter the administrator password to manage insurers, plans, and rate tables.
            </p>
          </div>

          <form id="adminLoginForm" class="admin-login-form" novalidate>
            <div class="form-group" style="margin-bottom:1.25rem;">
              <label class="form-label" for="adminPasswordInput">
                Administrator Password <span class="required">*</span>
              </label>
              <div class="password-input-wrapper" style="position:relative;">
                <input
                  type="password"
                  id="adminPasswordInput"
                  class="form-input"
                  placeholder="Enter admin password"
                  required
                  autocomplete="current-password"
                  autofocus
                />
                <button type="button" class="btn-toggle-pwd" id="btnTogglePassword" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--gray-500); cursor:pointer; font-size:1rem;" title="Toggle show password">👁️</button>
              </div>
            </div>

            <div class="login-options-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; font-size:0.875rem;">
              <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--gray-700);">
                <input type="checkbox" id="rememberAdmin" checked />
                <span>Keep me signed in</span>
              </label>
            </div>

            <div id="adminLoginError" class="login-error-box" style="display:none; margin-bottom:1.25rem;"></div>

            <button type="submit" class="btn btn-primary btn-lg" id="btnAdminLoginSubmit" style="width:100%; justify-content:center; background:var(--red); border-color:var(--red);">
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10 2a8 8 0 100 16A8 8 0 0010 2zm1 5a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V7z" clip-rule="evenodd"/></svg>
              Sign In to Admin
            </button>
          </form>

          <div class="admin-login-footer">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style="color:var(--navy); flex-shrink:0;"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>
            <span>Live agency pricing protection — rate modification is restricted to authorized administrative staff.</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Breadcrumbs ───────────────────────────────────────────────────────────
  _renderBreadcrumbs() {
    const { level, selectedCompany, selectedPlan } = this.state;

    return `
      <div class="admin-breadcrumb-bar">
        <ul class="admin-breadcrumbs">
          <li class="breadcrumb-item ${level === 'companies' ? 'active' : ''}">
            ${level === 'companies' 
              ? '<span>Companies</span>' 
              : '<button class="crumb-btn" data-nav-to="companies">Companies</button>'
            }
          </li>
          ${selectedCompany ? `
            <li class="breadcrumb-separator">›</li>
            <li class="breadcrumb-item ${level === 'plans' ? 'active' : ''}">
              ${level === 'plans'
                ? `<span>${selectedCompany.companyName}</span>`
                : `<button class="crumb-btn" data-nav-to="plans">${selectedCompany.companyName}</button>`
              }
            </li>
          ` : ''}
          ${selectedPlan && level === 'rates' ? `
            <li class="breadcrumb-separator">›</li>
            <li class="breadcrumb-item active">
              <span>${selectedPlan.planName} (Rates)</span>
            </li>
          ` : ''}
        </ul>

        <div class="admin-auth-indicator">
          <span class="admin-auth-badge">🛡️ Admin Authenticated</span>
          <button class="crumb-btn btn-admin-logout" id="btnAdminLogout" title="Sign out of admin portal">Sign Out</button>
        </div>
      </div>
    `;
  }

  // ── Level Router ──────────────────────────────────────────────────────────
  _renderCurrentLevel() {
    switch (this.state.level) {
      case 'rates':
        return this._renderRateGridPage();
      case 'plans':
        return this._renderPlansPage();
      case 'companies':
      default:
        return this._renderCompaniesPage();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 1: COMPANIES PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  _renderCompaniesPage() {
    const allCompanies = this.state.companies || [];
    const filter = this.state.companyFilter || 'all';

    const activeCount = allCompanies.filter(c => c.isActive !== false).length;
    const archivedCount = allCompanies.filter(c => c.isActive === false).length;

    const displayedCompanies = allCompanies.filter(c => {
      if (filter === 'active') return c.isActive !== false;
      if (filter === 'archived') return c.isActive === false;
      return true;
    });

    return `
      <div class="admin-page-container">
        <div class="admin-page-header">
          <div class="admin-page-title-group">
            <h1 class="admin-page-title">Insurance Companies</h1>
            <span class="admin-badge-count">${displayedCompanies.length}</span>
          </div>
          <div class="admin-page-actions" style="display:flex; align-items:center; gap:0.75rem;">
            <!-- Filter Tabs -->
            <div class="company-filter-tabs">
              <button class="filter-tab ${filter === 'all' ? 'active' : ''}" data-comp-filter="all">All (${allCompanies.length})</button>
              <button class="filter-tab ${filter === 'active' ? 'active' : ''}" data-comp-filter="active">Active (${activeCount})</button>
              <button class="filter-tab ${filter === 'archived' ? 'active' : ''}" data-comp-filter="archived">Archived (${archivedCount})</button>
            </div>

            <button class="btn btn-primary btn-sm" id="btnAddCompany">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
              Add Company
            </button>
          </div>
        </div>

        ${displayedCompanies.length === 0 ? `
          <div class="guided-empty-state">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            </div>
            <div class="empty-state-title">No companies found</div>
            <div class="empty-state-desc">${filter === 'all' ? 'Add your first insurance company to begin configuring plans and rates.' : `No ${filter} companies currently.`}</div>
            ${filter === 'all' ? '<button class="btn btn-primary" id="btnEmptyAddCompany">+ Add Company</button>' : ''}
          </div>
        ` : `
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Company Name &amp; Status</th>
                  <th># of Plans</th>
                  <th>Date Added</th>
                  <th class="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${displayedCompanies.map(c => `
                  <tr class="clickable-row ${c.isActive === false ? 'row-archived' : ''}" data-company-id="${c._id}">
                    <td class="col-name">
                      <div style="display:flex; align-items:center; gap:0.6rem;">
                        <strong>${c.companyName}</strong>
                        <span class="status-badge ${c.isActive !== false ? 'status-active' : 'status-archived'}">
                          ${c.isActive !== false ? 'Active' : 'Archived'}
                        </span>
                      </div>
                    </td>
                    <td><span class="admin-badge-count">${(c.plans || []).length} Plans</span></td>
                    <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
                    <td class="col-actions">
                      <div class="actions-cell">
                        <button class="btn-action btn-action-primary" data-view-plans="${c._id}">View Plans</button>
                        <button class="btn-action" data-edit-company="${c._id}" title="Rename">Edit</button>
                        ${c.isActive !== false ? `
                          <button class="btn-action btn-action-archive" data-toggle-company-status="${c._id}" data-current-status="true" title="Deactivate / Soft delete company">Deactivate</button>
                        ` : `
                          <button class="btn-action btn-action-restore" data-toggle-company-status="${c._id}" data-current-status="false" title="Restore company to active">Restore</button>
                        `}
                        <button class="btn-action btn-action-danger" data-delete-company="${c._id}" title="Delete options">Delete</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 2: PLANS PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  _renderPlansPage() {
    const comp = this.state.selectedCompany;
    if (!comp) return `<div class="guided-empty-state"><div class="empty-state-title">No company selected</div></div>`;

    const plans = comp.plans || [];

    return `
      <div class="admin-page-container">
        <div class="admin-page-header">
          <div class="admin-page-title-group">
            <h1 class="admin-page-title">${comp.companyName} — Plans</h1>
            <span class="admin-badge-count">${plans.length}</span>
          </div>
          <div class="admin-page-actions">
            <button class="btn btn-secondary btn-sm" id="btnBackToCompanies">← Back to Companies</button>
            <button class="btn btn-primary btn-sm" id="btnAddPlan">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
              Add Plan
            </button>
          </div>
        </div>

        ${plans.length === 0 ? `
          <div class="guided-empty-state">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <div class="empty-state-title">No plans yet</div>
            <div class="empty-state-desc">Add a plan under <strong>${comp.companyName}</strong> (e.g., Value Pro, Prime Silver, Executive) to configure its rates.</div>
            <button class="btn btn-primary" id="btnEmptyAddPlan">+ Add Plan</button>
          </div>
        ` : `
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Plan Name</th>
                  <th>Status</th>
                  <th>Rate Records</th>
                  <th class="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${plans.map(p => `
                  <tr class="clickable-row ${p.isActive === false ? 'row-archived' : ''}" data-plan-id="${p._id}">
                    <td class="col-name"><strong>${p.planName}</strong></td>
                    <td>
                      <button class="status-toggle-pill ${p.isActive !== false ? 'active' : 'inactive'}" data-toggle-plan="${p._id}" data-status="${p.isActive !== false}" title="Click to toggle status">
                        ${p.isActive !== false ? '● Active' : '○ Inactive'}
                      </button>
                    </td>
                    <td><span class="admin-badge-count">${(p.rates || []).length} Rates</span></td>
                    <td class="col-actions">
                      <div class="actions-cell">
                        <button class="btn-action btn-action-primary" data-view-rates="${p._id}">Edit Rates Grid</button>
                        <button class="btn-action" data-duplicate-plan="${p._id}" title="Clone plan & rates">Clone</button>
                        <button class="btn-action" data-rename-plan="${p._id}" title="Rename">Rename</button>
                        <button class="btn-action btn-action-danger" data-delete-plan="${p._id}" title="Delete">Delete</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 3: RATES MATRIX GRID PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  _renderRateGridPage() {
    const comp = this.state.selectedCompany;
    const plan = this.state.selectedPlan;
    if (!comp || !plan) return `<div class="guided-empty-state"><div class="empty-state-title">No plan selected</div></div>`;

    const { currentCoverage, currentRegion, ageBands, daysSlabs, overlapErrors, gapWarnings } = this.state;

    return `
      <div class="admin-page-container">
        <div class="admin-page-header">
          <div class="admin-page-title-group">
            <h1 class="admin-page-title">${plan.planName} — Rate Grid</h1>
            <span class="admin-badge-count">${comp.companyName}</span>
          </div>
          <div class="admin-page-actions">
            <button class="btn btn-secondary btn-sm" id="btnBackToPlans">← Back to Plans</button>
            <button class="btn btn-primary btn-sm" id="btnSaveGrid" ${overlapErrors.length > 0 ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
              Save Grid
            </button>
          </div>
        </div>

        <!-- Matrix Controls Bar -->
        <div class="grid-control-panel">
          <div class="grid-selectors-row">
            <!-- Coverage Selector -->
            <div class="grid-selector-item">
              <span class="grid-selector-label">Step 1 — Coverage Amount</span>
              <select class="form-select" id="gridCoverageSelect" style="font-weight:700;">
                <option value="50000" ${currentCoverage === 50000 ? 'selected' : ''}>$50,000</option>
                <option value="100000" ${currentCoverage === 100000 ? 'selected' : ''}>$100,000</option>
                <option value="200000" ${currentCoverage === 200000 ? 'selected' : ''}>$200,000</option>
                <option value="250000" ${currentCoverage === 250000 ? 'selected' : ''}>$250,000</option>
                <option value="500000" ${currentCoverage === 500000 ? 'selected' : ''}>$500,000</option>
                <option value="750000" ${currentCoverage === 750000 ? 'selected' : ''}>$750,000</option>
                <option value="1000000" ${currentCoverage === 1000000 ? 'selected' : ''}>$1,000,000</option>
              </select>
            </div>

            <!-- Region Segmented Control -->
            <div class="grid-selector-item">
              <span class="grid-selector-label">Step 1 — Region</span>
              <div class="segmented-control" id="regionSegmentControl">
                <button class="segment-btn ${currentRegion === 'Excluding' ? 'active' : ''}" data-region="Excluding">Excluding USA & Canada</button>
                <button class="segment-btn ${currentRegion === 'Including' ? 'active' : ''}" data-region="Including">Including USA & Canada</button>
              </div>
            </div>

            <!-- Templates Dropdown -->
            <div class="grid-selector-item">
              <span class="grid-selector-label">Step 2 — Band Template</span>
              <div class="template-select-wrapper">
                <select class="form-select" id="selectTemplate">
                  <option value="">Load Preset Template...</option>
                  ${Object.entries(this.state.savedTemplates).map(([k, t]) => `
                    <option value="${k}">${t.name}</option>
                  `).join('')}
                </select>
                <button class="btn-action" id="btnSaveTemplate" title="Save current band structure as custom template">Save As...</button>
              </div>
            </div>
          </div>

          <!-- Speed Tools -->
          <div class="speed-tools-bar">
            <div class="speed-tools-group">
              <button class="btn-action" id="btnCopyStructureToOtherRegion">
                📋 Copy Structure to ${currentRegion === 'Excluding' ? 'Including' : 'Excluding'}
              </button>
              <button class="btn-action" id="btnBulkEdit">
                ⚡ Bulk Adjust Premiums (±%)
              </button>
            </div>
            <div class="speed-tools-group">
              <input type="file" id="csvFileInput" accept=".csv" style="display:none;" />
              <button class="btn-action" id="btnDownloadTemplate" title="Download sample CSV template with standard column headers">
                📄 CSV Template
              </button>
              <button class="btn-action" id="btnImportCsv">📂 Import CSV</button>
              <button class="btn-action" id="btnExportCsv">📥 Export CSV</button>
            </div>
          </div>
        </div>

        <!-- Overlap Alert Warning (Fatal: blocks save) -->
        ${overlapErrors.length > 0 ? `
          <div style="padding: 1rem 1.5rem 0 1.5rem;">
            <div class="overlap-alert">
              <div class="overlap-alert-title">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                Range Overlap Error (Must be resolved before saving)
              </div>
              <ul class="overlap-alert-list">
                ${overlapErrors.map(e => `<li>${e}</li>`).join('')}
              </ul>
            </div>
          </div>
        ` : ''}

        <!-- Gap Alert Notice (Informational) -->
        ${gapWarnings.length > 0 ? `
          <div style="padding: 0.75rem 1.5rem 0 1.5rem;">
            <div class="gap-alert">
              <div class="gap-alert-title">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
                Coverage Gap Advisory (Unpriced ranges detected)
              </div>
              <ul class="gap-alert-list">
                ${gapWarnings.map(g => `<li>${g}</li>`).join('')}
              </ul>
            </div>
          </div>
        ` : ''}

        <!-- Matrix Table -->
        <div class="matrix-container">
          <div class="matrix-header-info">
            <span class="matrix-tip">
              💡 <strong>Tip:</strong> You can copy a block of numbers from Excel / Google Sheets and press <code>Ctrl+V</code> inside any cell to paste!
            </span>
          </div>

          <table class="matrix-table" id="rateMatrixTable">
            <thead>
              <tr>
                <th class="matrix-corner-cell">Days \\ Age</th>
                ${ageBands.map((band, colIdx) => `
                  <th class="matrix-col-header" data-col="${colIdx}">
                    <div class="band-header-inner">
                      <div class="band-range-inputs">
                        <input type="number" class="range-mini-input" data-band-type="age" data-field="from" data-idx="${colIdx}" value="${band.from}" min="0" max="120" />
                        <span>–</span>
                        <input type="number" class="range-mini-input" data-band-type="age" data-field="to" data-idx="${colIdx}" value="${band.to}" min="0" max="120" />
                        <button class="btn-remove-band" data-remove-age="${colIdx}" title="Remove Column">✕</button>
                      </div>
                    </div>
                  </th>
                `).join('')}
                <th class="matrix-add-col-th">
                  <button class="btn-add-dimension" id="btnAddAgeBand">+ Age</button>
                </th>
              </tr>
            </thead>
            <tbody>
              ${daysSlabs.map((slab, rowIdx) => `
                <tr data-row="${rowIdx}">
                  <th class="matrix-row-header">
                    <div class="slab-header-inner">
                      <div class="band-range-inputs">
                        <input type="number" class="range-mini-input" data-band-type="days" data-field="from" data-idx="${rowIdx}" value="${slab.from}" min="1" max="365" />
                        <span>–</span>
                        <input type="number" class="range-mini-input" data-band-type="days" data-field="to" data-idx="${rowIdx}" value="${slab.to}" min="1" max="365" />
                      </div>
                      <button class="btn-remove-band" data-remove-days="${rowIdx}" title="Remove Row">✕</button>
                    </div>
                  </th>
                  ${ageBands.map((band, colIdx) => {
                    const cellKey = `${rowIdx}_${colIdx}`;
                    const val = this.state.matrixData[cellKey] !== undefined ? this.state.matrixData[cellKey] : '';
                    return `
                      <td class="matrix-data-cell" data-row="${rowIdx}" data-col="${colIdx}">
                        <input type="text"
                               class="matrix-input ${val ? 'filled' : ''}"
                               data-row="${rowIdx}"
                               data-col="${colIdx}"
                               value="${val}"
                               placeholder="—"
                               autocomplete="off" />
                      </td>
                    `;
                  }).join('')}
                  <td></td>
                </tr>
              `).join('')}
              <tr class="matrix-add-row-tr">
                <td>
                  <button class="btn-add-dimension" id="btnAddDaysSlab">+ Days Slab</button>
                </td>
                <td colspan="${ageBands.length + 1}"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── Events Attachment ─────────────────────────────────────────────────────
  async attachEvents(container) {
    this.container = container;

    if (isAdminAuthenticated()) {
      await this._loadCompanies();
    }

    if (this._eventsAttached) return;
    this._eventsAttached = true;

    // 1. Delegated Admin Login Submit Handler
    container.addEventListener('submit', async (e) => {
      if (e.target.id === 'adminLoginForm') {
        e.preventDefault();
        const pwdInput = container.querySelector('#adminPasswordInput');
        const pwd = pwdInput ? pwdInput.value : '';
        const remember = container.querySelector('#rememberAdmin')?.checked || false;
        const errBox = container.querySelector('#adminLoginError');
        const submitBtn = container.querySelector('#btnAdminLoginSubmit');

        if (!pwd) {
          if (errBox) {
            errBox.textContent = 'Please enter the administrator password';
            errBox.style.display = 'block';
          }
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Verifying...';
          }
          if (errBox) errBox.style.display = 'none';

          await loginAdmin(pwd, remember);
          this.app.showToast('Admin authenticated successfully', 'success');

          await this._loadCompanies();
          this.container.innerHTML = this.render();
          this._refresh();
        } catch (err) {
          if (errBox) {
            errBox.textContent = err.message || 'Invalid administrator credentials';
            errBox.style.display = 'block';
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Sign In to Admin';
          }
        }
      }
    });

    // 2. Global Click Handler
    container.addEventListener('click', (e) => this._handleClick(e));

    // 3. Coverage select & template changes
    container.addEventListener('change', (e) => {
      if (e.target.id === 'gridCoverageSelect') {
        this.state.currentCoverage = Number(e.target.value);
        this._loadMatrixForCurrentSelection();
      } else if (e.target.id === 'selectTemplate') {
        if (e.target.value) {
          this._applyTemplate(e.target.value);
        }
      } else if (e.target.dataset.bandType) {
        this._handleBandInputChange(e.target);
      }
    });

    // 4. Matrix cell input handler
    container.addEventListener('input', (e) => {
      if (e.target.classList.contains('matrix-input')) {
        const row = e.target.dataset.row;
        const col = e.target.dataset.col;
        const val = e.target.value.trim().replace(/[^0-9.]/g, '');
        e.target.value = val;
        this.state.matrixData[`${row}_${col}`] = val;
        e.target.classList.toggle('filled', !!val);
      }
    });

    // 5. Excel / Google Sheets Clipboard Paste Handler
    container.addEventListener('paste', (e) => {
      if (e.target.classList.contains('matrix-input')) {
        this._handleMatrixPaste(e);
      }
    });
  }

  // ── Click Router ──────────────────────────────────────────────────────────
  async _handleClick(e) {
    // Password visibility toggle on login form
    if (e.target.closest('#btnTogglePassword')) {
      const pwdInput = this.container.querySelector('#adminPasswordInput');
      if (pwdInput) {
        pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
      }
      return;
    }

    // Admin Logout
    if (e.target.closest('#btnAdminLogout')) {
      logoutAdmin();
      this.app.showToast('Logged out of Admin Portal', 'info');
      this.container.innerHTML = this.render();
      return;
    }

    // Breadcrumb navigation
    const navBtn = e.target.closest('[data-nav-to]');
    if (navBtn) {
      const target = navBtn.dataset.navTo;
      this.state.level = target;
      if (target === 'companies') {
        this.state.selectedPlan = null;
      }
      this._refresh();
      return;
    }

    // Company Filter Tabs
    const filterBtn = e.target.closest('[data-comp-filter]');
    if (filterBtn) {
      this.state.companyFilter = filterBtn.dataset.compFilter;
      this._refresh();
      return;
    }

    // Company Status Toggle (Deactivate / Restore)
    const toggleStatusBtn = e.target.closest('[data-toggle-company-status]');
    if (toggleStatusBtn) {
      const companyId = toggleStatusBtn.dataset.toggleCompanyStatus;
      const currentStatus = toggleStatusBtn.dataset.currentStatus === 'true';
      await this._toggleCompanyStatus(companyId, !currentStatus);
      return;
    }

    // Level 1: Companies
    if (e.target.closest('#btnAddCompany') || e.target.closest('#btnEmptyAddCompany')) {
      await this._promptAddCompany();
      return;
    }

    const viewPlansBtn = e.target.closest('[data-view-plans]');
    if (viewPlansBtn) {
      await this._openCompanyPlans(viewPlansBtn.dataset.viewPlans);
      return;
    }

    const editCompBtn = e.target.closest('[data-edit-company]');
    if (editCompBtn) {
      await this._promptEditCompany(editCompBtn.dataset.editCompany);
      return;
    }

    const delCompBtn = e.target.closest('[data-delete-company]');
    if (delCompBtn) {
      await this._promptDeleteCompany(delCompBtn.dataset.deleteCompany);
      return;
    }

    const rowComp = e.target.closest('[data-company-id]');
    if (rowComp && !e.target.closest('button') && !e.target.closest('.actions-cell')) {
      const companyId = rowComp.dataset.companyId;
      await this._openCompanyPlans(companyId);
      return;
    }

    // Level 2: Plans
    if (e.target.closest('#btnBackToCompanies')) {
      this.state.level = 'companies';
      this.state.selectedPlan = null;
      this._refresh();
      return;
    }

    if (e.target.closest('#btnAddPlan') || e.target.closest('#btnEmptyAddPlan')) {
      await this._promptAddPlan();
      return;
    }

    const viewRatesBtn = e.target.closest('[data-view-rates]');
    if (viewRatesBtn) {
      await this._openPlanRates(viewRatesBtn.dataset.viewRates);
      return;
    }

    const togglePlanBtn = e.target.closest('[data-toggle-plan]');
    if (togglePlanBtn) {
      const planId = togglePlanBtn.dataset.togglePlan;
      const cur = togglePlanBtn.dataset.status === 'true';
      await this._togglePlan(planId, !cur);
      return;
    }

    const dupPlanBtn = e.target.closest('[data-duplicate-plan]');
    if (dupPlanBtn) {
      await this._promptDuplicatePlan(dupPlanBtn.dataset.duplicatePlan);
      return;
    }

    const renamePlanBtn = e.target.closest('[data-rename-plan]');
    if (renamePlanBtn) {
      await this._promptRenamePlan(renamePlanBtn.dataset.renamePlan);
      return;
    }

    const delPlanBtn = e.target.closest('[data-delete-plan]');
    if (delPlanBtn) {
      await this._promptDeletePlan(delPlanBtn.dataset.deletePlan);
      return;
    }

    // Level 3: Rates Grid
    if (e.target.closest('#btnBackToPlans')) {
      this.state.level = 'plans';
      this.state.selectedPlan = null;
      this._refresh();
      return;
    }

    const regionBtn = e.target.closest('.segmented-control button');
    if (regionBtn) {
      this.state.currentRegion = regionBtn.dataset.region;
      this._loadMatrixForCurrentSelection();
      return;
    }

    if (e.target.closest('#btnAddAgeBand')) {
      this._addAgeBandColumn();
      return;
    }

    if (e.target.closest('#btnAddDaysSlab')) {
      this._addDaysSlabRow();
      return;
    }

    const removeAgeBtn = e.target.closest('[data-remove-age]');
    if (removeAgeBtn) {
      this._removeAgeBandColumn(Number(removeAgeBtn.dataset.removeAge));
      return;
    }

    const removeDaysBtn = e.target.closest('[data-remove-days]');
    if (removeDaysBtn) {
      this._removeDaysSlabRow(Number(removeDaysBtn.dataset.removeDays));
      return;
    }

    if (e.target.closest('#btnCopyStructureToOtherRegion')) {
      this._copyStructureToOtherRegion();
      return;
    }

    if (e.target.closest('#btnSaveTemplate')) {
      await this._promptSaveTemplate();
      return;
    }

    if (e.target.closest('#btnSaveGrid')) {
      await this._saveMatrix();
      return;
    }

    if (e.target.closest('#btnBulkEdit')) {
      await this._promptBulkEdit();
      return;
    }

    if (e.target.closest('#btnDownloadTemplate')) {
      this._downloadTemplate();
      return;
    }

    if (e.target.closest('#btnImportCsv')) {
      const fileInput = document.getElementById('csvFileInput');
      if (fileInput) fileInput.click();
      return;
    }

    if (e.target.closest('#btnExportCsv')) {
      this._exportCsv();
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 1: COMPANIES LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  async _loadCompanies() {
    try {
      this.state.companies = await getCompanies();
    } catch (err) {
      if (err.requiresAuth) {
        logoutAdmin();
        const appEl = document.getElementById('app');
        appEl.innerHTML = this.render();
        await this.attachEvents(appEl);
        return;
      }
      this.app.showToast('Failed to load companies: ' + err.message, 'error');
    }
  }

  async _promptAddCompany() {
    const name = await this._showInputModal('Add Insurance Company', 'Company Name', 'e.g. Care Health Insurance, Reliance General');
    if (!name || !name.trim()) return;

    try {
      await addCompany(name.trim());
      this.app.showToast(`Company "${name.trim()}" added successfully`, 'success');
      await this._loadCompanies();
      this._refresh();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async _promptEditCompany(companyId) {
    const comp = this.state.companies.find(c => c._id === companyId);
    if (!comp) return;

    const newName = await this._showInputModal('Rename Company', 'Company Name', '', comp.companyName);
    if (!newName || newName.trim() === comp.companyName) return;

    try {
      await renameCompany(companyId, newName.trim());
      this.app.showToast('Company renamed successfully', 'success');
      await this._loadCompanies();
      this._refresh();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async _toggleCompanyStatus(companyId, targetStatus) {
    const comp = this.state.companies.find(c => c._id === companyId);
    if (!comp) return;

    try {
      await toggleCompanyStatus(companyId, targetStatus);
      this.app.showToast(`Company "${comp.companyName}" is now ${targetStatus ? 'Active' : 'Archived'}`, 'success');
      await this._loadCompanies();
      this._refresh();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async _promptDeleteCompany(companyId) {
    const comp = this.state.companies.find(c => c._id === companyId);
    if (!comp) return;

    // Show modal offering soft delete (recommended) or permanent deletion
    const modalHtml = `
      <div class="modal-backdrop" id="deleteCompanyModal">
        <div class="modal-card" style="max-width: 480px;">
          <div class="modal-header">
            <h2 class="modal-title">Delete or Deactivate Company</h2>
            <button class="modal-close" id="btnCancelDelComp">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.925rem; color:var(--gray-700); line-height:1.5; margin-bottom:1rem;">
              Choose how you want to handle <strong>"${this._esc(comp.companyName)}"</strong>:
            </p>
            <div style="background:#f8fafc; border:1px solid var(--gray-200); border-radius:var(--radius-md); padding:1rem; margin-bottom:1rem;">
              <h3 style="font-size:0.875rem; color:var(--navy); font-weight:700; margin-bottom:0.25rem;">1. Deactivate / Archive (Soft Delete)</h3>
              <p style="font-size:0.8rem; color:var(--gray-600); margin:0;">
                Hides this insurer from active quote comparisons, but preserves all historical plans, rate tables, and quote records intact. Can be restored anytime.
              </p>
            </div>
            <div style="background:#fff5f5; border:1px solid #fed7d7; border-radius:var(--radius-md); padding:1rem;">
              <h3 style="font-size:0.875rem; color:#c53030; font-weight:700; margin-bottom:0.25rem;">2. Permanent Delete</h3>
              <p style="font-size:0.8rem; color:#742a2a; margin:0;">
                Irreversibly removes this company and all nested rate tables from the database.
              </p>
            </div>
          </div>
          <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:0.6rem;">
            <button class="btn btn-secondary" id="btnCancelDelComp2">Cancel</button>
            <button class="btn btn-action-archive" id="btnDeactivateCompany">Deactivate (Soft Delete)</button>
            <button class="btn btn-action-danger" id="btnPermanentDeleteCompany">Permanent Delete</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById('deleteCompanyModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('deleteCompanyModal');

    const handleEsc = (e) => {
      if (e.key === 'Escape') cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('keydown', handleEsc);
      modalEl.remove();
    };

    window.addEventListener('keydown', handleEsc);
    modalEl.querySelector('#btnCancelDelComp').addEventListener('click', cleanup);
    modalEl.querySelector('#btnCancelDelComp2').addEventListener('click', cleanup);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) cleanup();
    });

    modalEl.querySelector('#btnDeactivateCompany').addEventListener('click', async () => {
      cleanup();
      try {
        await toggleCompanyStatus(companyId, false);
        this.app.showToast(`Company "${comp.companyName}" deactivated (soft deleted)`, 'success');
        await this._loadCompanies();
        this._refresh();
      } catch (err) {
        this.app.showToast(err.message, 'error');
      }
    });

    modalEl.querySelector('#btnPermanentDeleteCompany').addEventListener('click', async () => {
      cleanup();
      try {
        await deleteCompany(companyId, true);
        this.app.showToast(`Company "${comp.companyName}" permanently deleted`, 'success');
        await this._loadCompanies();
        this._refresh();
      } catch (err) {
        this.app.showToast(err.message, 'error');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 2: PLANS LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  async _openCompanyPlans(companyId) {
    try {
      this.state.selectedCompany = await getCompany(companyId);
      this.state.level = 'plans';
      this.state.selectedPlan = null;
      this._refresh();
    } catch (err) {
      this.app.showToast('Failed to load company plans: ' + err.message, 'error');
    }
  }

  async _promptAddPlan() {
    const comp = this.state.selectedCompany;
    if (!comp) return;

    const name = await this._showInputModal(
      `Add Plan to ${comp.companyName}`,
      'Plan Name',
      'e.g. Value Pro, Ace, Explore'
    );
    if (!name || !name.trim()) return;

    try {
      await addPlan(comp._id, name.trim());
      this.app.showToast(`Plan "${name.trim()}" created`, 'success');
      await this._reloadCompanyDetails();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async _togglePlan(planId, isActive) {
    const comp = this.state.selectedCompany;
    if (!comp) return;

    try {
      await togglePlanStatus(comp._id, planId, isActive);
      this.app.showToast(`Plan status updated to ${isActive ? 'Active' : 'Inactive'}`, 'success');
      await this._reloadCompanyDetails();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async _promptDuplicatePlan(planId) {
    const comp = this.state.selectedCompany;
    if (!comp) return;

    const plan = (comp.plans || []).find(p => p._id === planId);
    if (!plan) return;

    const newName = await this._showInputModal(
      'Duplicate Plan',
      'New Plan Name',
      '',
      `${plan.planName} (Copy)`
    );
    if (!newName || !newName.trim()) return;

    try {
      const duplicated = await duplicatePlan(comp._id, planId, newName.trim());
      this.app.showToast(`Plan duplicated as "${duplicated.planName}"`, 'success');
      await this._reloadCompanyDetails();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async _promptRenamePlan(planId) {
    const comp = this.state.selectedCompany;
    if (!comp) return;

    const plan = (comp.plans || []).find(p => p._id === planId);
    if (!plan) return;

    const newName = await this._showInputModal('Rename Plan', 'New Plan Name', '', plan.planName);
    if (!newName || newName.trim() === plan.planName) return;

    try {
      await renamePlan(comp._id, planId, newName.trim());
      this.app.showToast('Plan renamed', 'success');
      await this._reloadCompanyDetails();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async _promptDeletePlan(planId) {
    const comp = this.state.selectedCompany;
    if (!comp) return;

    const plan = (comp.plans || []).find(p => p._id === planId);
    if (!plan) return;

    const confirmed = await this._showConfirmModal(
      'Delete Plan',
      `Delete plan <strong>"${this._esc(plan.planName)}"</strong> and all of its rate rows?`,
      'Delete Plan',
      true
    );
    if (!confirmed) return;

    try {
      await deletePlan(comp._id, planId);
      this.app.showToast(`Plan "${plan.planName}" deleted`, 'success');
      await this._reloadCompanyDetails();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async _reloadCompanyDetails() {
    if (!this.state.selectedCompany) return;
    try {
      this.state.selectedCompany = await getCompany(this.state.selectedCompany._id);
      this._refresh();
    } catch {
      // ignore
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 3: MATRIX GRID LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  async _openPlanRates(planId) {
    const comp = this.state.selectedCompany;
    if (!comp) return;

    const plan = (comp.plans || []).find(p => p._id === planId);
    if (!plan) return;

    this.state.selectedPlan = plan;
    this.state.level = 'rates';

    // Load existing rates for currently selected coverage & region
    this._loadMatrixForCurrentSelection();
  }

  _loadMatrixForCurrentSelection() {
    const plan = this.state.selectedPlan;
    if (!plan) return;

    const cov = this.state.currentCoverage;
    const reg = this.state.currentRegion;

    // Filter rates for current coverage & region
    const matchingRates = (plan.rates || []).filter(
      r => r.coverage === cov && r.region.toLowerCase() === reg.toLowerCase()
    );

    if (matchingRates.length > 0) {
      // Extract unique sorted age bands and days slabs from existing data
      const ageMap = new Map();
      const daysMap = new Map();

      matchingRates.forEach(r => {
        const ageKey = `${r.ageFrom}-${r.ageTo}`;
        if (!ageMap.has(ageKey)) ageMap.set(ageKey, { from: r.ageFrom, to: r.ageTo });

        const daysKey = `${r.daysFrom}-${r.daysTo}`;
        if (!daysMap.has(daysKey)) daysMap.set(daysKey, { from: r.daysFrom, to: r.daysTo });
      });

      this.state.ageBands = Array.from(ageMap.values()).sort((a, b) => a.from - b.from);
      this.state.daysSlabs = Array.from(daysMap.values()).sort((a, b) => a.from - b.from);

      // Populate matrix
      this.state.matrixData = {};
      matchingRates.forEach(r => {
        const rowIdx = this.state.daysSlabs.findIndex(d => d.from === r.daysFrom && d.to === r.daysTo);
        const colIdx = this.state.ageBands.findIndex(a => a.from === r.ageFrom && a.to === r.ageTo);
        if (rowIdx !== -1 && colIdx !== -1) {
          this.state.matrixData[`${rowIdx}_${colIdx}`] = r.premium;
        }
      });
    } else {
      // If no rates yet, initialize with standard template if empty
      if (this.state.ageBands.length === 0 || this.state.daysSlabs.length === 0) {
        const def = DEFAULT_TEMPLATES.standard_5x17;
        this.state.ageBands = JSON.parse(JSON.stringify(def.ageBands));
        this.state.daysSlabs = JSON.parse(JSON.stringify(def.daysSlabs));
      }
      this.state.matrixData = {};
    }

    this._validateOverlapsAndGaps();
    this._refresh();
  }

  _validateOverlapsAndGaps() {
    const { ageBands, daysSlabs } = this.state;
    const errors = [];
    const gaps = [];

    // Overlap helper: [a1, a2] & [b1, b2]
    const isOverlap = (a1, a2, b1, b2) => Math.max(a1, b1) <= Math.min(a2, b2);

    // 1. Age band overlaps
    for (let i = 0; i < ageBands.length; i++) {
      for (let j = i + 1; j < ageBands.length; j++) {
        if (isOverlap(ageBands[i].from, ageBands[i].to, ageBands[j].from, ageBands[j].to)) {
          errors.push(`Age Band column ${i + 1} (${ageBands[i].from}–${ageBands[i].to}) overlaps with column ${j + 1} (${ageBands[j].from}–${ageBands[j].to})`);
        }
      }
    }

    // 2. Days slab overlaps
    for (let i = 0; i < daysSlabs.length; i++) {
      for (let j = i + 1; j < daysSlabs.length; j++) {
        if (isOverlap(daysSlabs[i].from, daysSlabs[i].to, daysSlabs[j].from, daysSlabs[j].to)) {
          errors.push(`Days Slab row ${i + 1} (${daysSlabs[i].from}–${daysSlabs[i].to}) overlaps with row ${j + 1} (${daysSlabs[j].from}–${daysSlabs[j].to})`);
        }
      }
    }

    // 3. Age band gaps (sorted)
    const sortedAges = [...ageBands].sort((a, b) => Number(a.from) - Number(b.from));
    for (let i = 0; i < sortedAges.length - 1; i++) {
      const curTo = Number(sortedAges[i].to);
      const nextFrom = Number(sortedAges[i + 1].from);
      if (curTo + 1 < nextFrom) {
        gaps.push(`Age gap between ${curTo} and ${nextFrom} (ages ${curTo + 1} to ${nextFrom - 1} unpriced)`);
      }
    }

    // 4. Days slab gaps (sorted)
    const sortedDays = [...daysSlabs].sort((a, b) => Number(a.from) - Number(b.from));
    for (let i = 0; i < sortedDays.length - 1; i++) {
      const curTo = Number(sortedDays[i].to);
      const nextFrom = Number(sortedDays[i + 1].from);
      if (curTo + 1 < nextFrom) {
        gaps.push(`Days gap between ${curTo} and ${nextFrom} (days ${curTo + 1} to ${nextFrom - 1} unpriced)`);
      }
    }

    this.state.overlapErrors = errors;
    this.state.gapWarnings = gaps;
  }

  _handleBandInputChange(input) {
    const type = input.dataset.bandType; // 'age' | 'days'
    const field = input.dataset.field;   // 'from' | 'to'
    const idx = Number(input.dataset.idx);
    const val = Number(input.value);

    if (isNaN(val)) return;

    if (type === 'age' && this.state.ageBands[idx]) {
      this.state.ageBands[idx][field] = val;
    } else if (type === 'days' && this.state.daysSlabs[idx]) {
      this.state.daysSlabs[idx][field] = val;
    }

    this._validateOverlapsAndGaps();
    this._refresh();
  }

  _addAgeBandColumn() {
    const last = this.state.ageBands[this.state.ageBands.length - 1];
    const from = last ? Number(last.to) + 1 : 0;
    const to = from + 10;
    this.state.ageBands.push({ from, to });
    this._validateOverlapsAndGaps();
    this._refresh();
  }

  _removeAgeBandColumn(idx) {
    if (this.state.ageBands.length <= 1) {
      this.app.showToast('You must maintain at least one age band', 'warning');
      return;
    }
    this.state.ageBands.splice(idx, 1);
    this._validateOverlapsAndGaps();
    this._refresh();
  }

  _addDaysSlabRow() {
    const last = this.state.daysSlabs[this.state.daysSlabs.length - 1];
    const from = last ? Number(last.to) + 1 : 1;
    const to = from + 14;
    this.state.daysSlabs.push({ from, to });
    this._validateOverlapsAndGaps();
    this._refresh();
  }

  _removeDaysSlabRow(idx) {
    if (this.state.daysSlabs.length <= 1) {
      this.app.showToast('You must maintain at least one days slab', 'warning');
      return;
    }
    this.state.daysSlabs.splice(idx, 1);
    this._validateOverlapsAndGaps();
    this._refresh();
  }

  _applyTemplate(templateKey) {
    const t = this.state.savedTemplates[templateKey];
    if (!t) return;

    this.state.ageBands = JSON.parse(JSON.stringify(t.ageBands));
    this.state.daysSlabs = JSON.parse(JSON.stringify(t.daysSlabs));
    this.state.matrixData = {};
    this._validateOverlapsAndGaps();
    this._refresh();
    this.app.showToast(`Loaded "${t.name}" template`, 'info');
  }

  async _promptSaveTemplate() {
    const name = await this._showInputModal('Save Custom Template', 'Template Name', 'e.g. My Agency 5-Band Standard');
    if (!name || !name.trim()) return;

    const key = 'custom_' + Date.now();
    this.state.savedTemplates[key] = {
      name: name.trim(),
      ageBands: JSON.parse(JSON.stringify(this.state.ageBands)),
      daysSlabs: JSON.parse(JSON.stringify(this.state.daysSlabs))
    };
    this._persistSavedTemplates();
    this.app.showToast(`Template "${name.trim()}" saved!`, 'success');
    this._refresh();
  }

  _copyStructureToOtherRegion() {
    const otherRegion = this.state.currentRegion === 'Excluding' ? 'Including' : 'Excluding';
    this.state.currentRegion = otherRegion;
    this.state.matrixData = {}; // Clear matrix values for target region, retain slab/band structure
    this._refresh();
    this.app.showToast(`Copied structure to ${otherRegion}. Enter prices or paste from spreadsheet.`, 'info');
  }

  // ── Save Rate Matrix Grid ──────────────────────────────────────────────────
  async _saveMatrix() {
    const comp = this.state.selectedCompany;
    const plan = this.state.selectedPlan;
    if (!comp || !plan) return;

    this._validateOverlapsAndGaps();
    if (this.state.overlapErrors.length > 0) {
      this.app.showToast('Cannot save grid: please resolve range overlaps first', 'error');
      this._refresh();
      return;
    }

    // Build 2D matrix array matching daysSlabs × ageBands
    const matrix = [];
    for (let r = 0; r < this.state.daysSlabs.length; r++) {
      const row = [];
      for (let c = 0; c < this.state.ageBands.length; c++) {
        const val = this.state.matrixData[`${r}_${c}`];
        row.push(val ? Number(val) : null);
      }
      matrix.push(row);
    }

    const payload = {
      coverage: this.state.currentCoverage,
      region: this.state.currentRegion,
      ageBands: this.state.ageBands,
      daysSlabs: this.state.daysSlabs,
      matrix,
      currency: 'INR'
    };

    try {
      const result = await saveRateGrid(comp._id, plan._id, payload);
      let successMsg = result.message || 'Rate matrix saved successfully!';
      if (result.warnings && result.warnings.length > 0) {
        successMsg += ` (Note: ${result.warnings.length} coverage gaps detected)`;
      }
      this.app.showToast(successMsg, 'success');

      // Reload fresh company & plan data
      await this._reloadCompanyDetails();
      const updatedPlan = this.state.selectedCompany?.plans?.find(p => p._id === plan._id);
      if (updatedPlan) this.state.selectedPlan = updatedPlan;
      this._refresh();
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  // ── Bulk Edit Premiums ────────────────────────────────────────────────────
  async _promptBulkEdit() {
    const comp = this.state.selectedCompany;
    const plan = this.state.selectedPlan;
    if (!comp || !plan) return;

    const modalHtml = `
      <div class="modal-backdrop" id="bulkEditModal">
        <div class="modal-card">
          <div class="modal-header">
            <h2 class="modal-title">⚡ Bulk Adjust Premiums</h2>
            <button class="modal-close" id="btnCancelBulkEdit">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.875rem; color:var(--gray-600); margin-bottom:1.25rem;">
              Quickly revise rates across this plan (e.g. annual +5% inflation revision).
            </p>
            <div class="form-group" style="margin-bottom:1rem;">
              <label class="form-label">Scope</label>
              <select class="form-select" id="bulkScope">
                <option value="current">Current Grid (${this.state.currentCoverage.toLocaleString()} — ${this.state.currentRegion})</option>
                <option value="coverage">All Regions for Coverage ${this.state.currentCoverage.toLocaleString()}</option>
                <option value="all">Entire Plan (All Coverages & Regions)</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:1rem;">
              <label class="form-label">Adjustment Type</label>
              <select class="form-select" id="bulkType">
                <option value="percent">Percentage Change (%) — e.g. +5 or -10</option>
                <option value="fixed">Fixed Amount (₹) — e.g. +100 or -50</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Adjustment Value</label>
              <input type="number" step="any" class="form-input" id="bulkValue" placeholder="e.g. 5 or -10" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelBulkEdit2">Cancel</button>
            <button class="btn btn-primary" id="btnApplyBulkEdit">Apply Adjustment</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById('bulkEditModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('bulkEditModal');

    const handleEsc = (e) => {
      if (e.key === 'Escape') cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('keydown', handleEsc);
      modalEl.remove();
    };

    window.addEventListener('keydown', handleEsc);
    modalEl.querySelector('#btnCancelBulkEdit').addEventListener('click', cleanup);
    modalEl.querySelector('#btnCancelBulkEdit2').addEventListener('click', cleanup);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) cleanup();
    });

    modalEl.querySelector('#btnApplyBulkEdit').addEventListener('click', async () => {
      const scope = modalEl.querySelector('#bulkScope').value;
      const type = modalEl.querySelector('#bulkType').value;
      const valStr = modalEl.querySelector('#bulkValue').value;
      const value = Number(valStr);

      if (isNaN(value)) {
        this.app.showToast('Please enter a valid numeric adjustment value', 'error');
        return;
      }

      cleanup();

      const payload = {
        type,
        value,
        coverage: scope === 'current' || scope === 'coverage' ? this.state.currentCoverage : undefined,
        region: scope === 'current' ? this.state.currentRegion : undefined,
        round: true
      };

      try {
        const res = await bulkEditRates(comp._id, plan._id, payload);
        this.app.showToast(res.message || 'Bulk edit applied successfully', 'success');
        await this._reloadCompanyDetails();
        this._loadMatrixForCurrentSelection();
      } catch (err) {
        this.app.showToast(err.message, 'error');
      }
    });
  }

  // ── Excel / Sheets Paste Handler ──────────────────────────────────────────
  _handleMatrixPaste(e) {
    e.preventDefault();
    const clipData = (e.clipboardData || window.clipboardData).getData('text');
    if (!clipData) return;

    const startRow = Number(e.target.dataset.row);
    const startCol = Number(e.target.dataset.col);

    const rows = clipData.split(/\r?\n/).map(r => r.split('\t'));
    let pastedCount = 0;

    for (let r = 0; r < rows.length; r++) {
      const rowData = rows[r];
      const targetRow = startRow + r;
      if (targetRow >= this.state.daysSlabs.length) break;

      for (let c = 0; c < rowData.length; c++) {
        const targetCol = startCol + c;
        if (targetCol >= this.state.ageBands.length) break;

        const val = rowData[c].trim().replace(/[^0-9.]/g, '');
        if (val) {
          this.state.matrixData[`${targetRow}_${targetCol}`] = val;
          pastedCount++;
        }
      }
    }

    this._refresh();
    this.app.showToast(`Pasted ${pastedCount} cell(s) from spreadsheet!`, 'success');
  }

  // ── CSV Template Download ─────────────────────────────────────────────────
  _downloadTemplate() {
    const comp = this.state.selectedCompany;
    const plan = this.state.selectedPlan;
    if (!comp || !plan) return;

    const url = downloadTemplateUrl(comp._id, plan._id);
    window.location.href = url;
  }

  // ── CSV Import Handler with Preview & Per-Row Error Reporting ─────────────
  async _handleCsvFileSelect(file) {
    const comp = this.state.selectedCompany;
    const plan = this.state.selectedPlan;
    if (!comp || !plan) return;

    try {
      this.app.showToast('Analyzing CSV file...', 'info');
      const preview = await previewImportCsv(comp._id, plan._id, file);

      // Render Preview Modal
      const modalHtml = `
        <div class="modal-backdrop" id="importPreviewModal">
          <div class="modal-card modal-large">
            <div class="modal-header">
              <h2 class="modal-title">📂 CSV Import Preview</h2>
              <button class="modal-close" id="btnCancelImport">✕</button>
            </div>
            <div class="modal-body">
              <div class="import-preview-stats">
                <div class="import-stat-card">
                  <div class="import-stat-val">${preview.total}</div>
                  <div class="import-stat-label">Total Rows</div>
                </div>
                <div class="import-stat-card">
                  <div class="import-stat-val" style="color:#16a34a;">${preview.validCount}</div>
                  <div class="import-stat-label">Valid Rows</div>
                </div>
                <div class="import-stat-card">
                  <div class="import-stat-val" style="color:${preview.invalidCount ? '#dc2626' : '#64748b'};">${preview.invalidCount}</div>
                  <div class="import-stat-label">Invalid Rows</div>
                </div>
              </div>

              <div class="import-preview-table-wrapper">
                <table class="import-preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Coverage</th>
                      <th>Region</th>
                      <th>Age Band</th>
                      <th>Days Slab</th>
                      <th>Premium</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${preview.preview.map(row => `
                      <tr class="${row.isValid ? '' : 'invalid-row'}">
                        <td>${row.rowNum}</td>
                        <td>${row.coverage ? '$' + Number(row.coverage).toLocaleString() : '—'}</td>
                        <td>${row.region || '—'}</td>
                        <td>${row.ageBand} yrs</td>
                        <td>${row.daysSlab} days</td>
                        <td><strong>₹${row.premium || 0}</strong></td>
                        <td>${row.isValid ? '<span style="color:#16a34a; font-weight:700;">✓ Valid</span>' : '<span style="color:#dc2626; font-weight:700;">✕ Invalid</span>'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              ${preview.hasMore ? `<p style="font-size:0.75rem; color:var(--gray-500); text-align:center;">Showing first 50 rows of ${preview.total}...</p>` : ''}
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnCancelImport2">Cancel</button>
              <button class="btn btn-primary" id="btnConfirmImport">
                Confirm & Import ${preview.validCount} Rates
              </button>
            </div>
          </div>
        </div>
      `;

      const existing = document.getElementById('importPreviewModal');
      if (existing) existing.remove();

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modalEl = document.getElementById('importPreviewModal');

      const handleEsc = (e) => {
        if (e.key === 'Escape') cleanup();
      };
      const cleanup = () => {
        window.removeEventListener('keydown', handleEsc);
        modalEl.remove();
      };

      window.addEventListener('keydown', handleEsc);
      modalEl.querySelector('#btnCancelImport').addEventListener('click', cleanup);
      modalEl.querySelector('#btnCancelImport2').addEventListener('click', cleanup);
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) cleanup();
      });

      modalEl.querySelector('#btnConfirmImport').addEventListener('click', async () => {
        cleanup();
        try {
          const res = await importRatesCsv(comp._id, plan._id, file);

          if (res.errors && res.errors.length > 0) {
            this._showImportErrorReport(res);
          } else {
            this.app.showToast(`Import completed: ${res.added} added, ${res.updated} updated!`, 'success');
          }

          await this._reloadCompanyDetails();
          this._loadMatrixForCurrentSelection();
        } catch (err) {
          this.app.showToast(err.message, 'error');
        }
      });
    } catch (err) {
      this.app.showToast('Import preview failed: ' + err.message, 'error');
    }
  }

  // ── Per-Row Error Report Modal ────────────────────────────────────────────
  _showImportErrorReport(res) {
    const existing = document.getElementById('importErrorReportModal');
    if (existing) existing.remove();

    const modalHtml = `
      <div class="modal-backdrop" id="importErrorReportModal">
        <div class="modal-card import-error-modal">
          <div class="modal-header">
            <h2 class="modal-title" style="color:#b91c1c;">📋 CSV Import Report (${res.errors.length} Issues)</h2>
            <button class="modal-close" id="btnCloseErrorReport" title="Close">✕</button>
          </div>
          <div class="modal-body">
            <div class="error-summary-bar">
              <div class="error-summary-pill pill-success">
                <div class="pill-val">${res.added || 0}</div>
                <div class="pill-label">New Added</div>
              </div>
              <div class="error-summary-pill pill-info">
                <div class="pill-val">${res.updated || 0}</div>
                <div class="pill-label">Updated</div>
              </div>
              <div class="error-summary-pill pill-danger">
                <div class="pill-val">${res.skipped || res.errors.length}</div>
                <div class="pill-label">Skipped (Errors)</div>
              </div>
            </div>

            <p style="font-size:0.875rem; color:var(--gray-700); margin-bottom:1rem;">
              <strong>Note:</strong> All valid rate rows were imported. The rows listed below contained invalid values and were safely skipped:
            </p>

            <div class="import-error-table-container">
              <table class="import-error-table">
                <thead>
                  <tr>
                    <th style="width:70px;">Row #</th>
                    <th>Failure Reason</th>
                    <th>Row Raw Data</th>
                  </tr>
                </thead>
                <tbody>
                  ${res.errors.map(err => `
                    <tr>
                      <td><span style="font-weight:700; color:#b91c1c;">Line ${err.row}</span></td>
                      <td style="color:#991b1b; font-weight:500;">${this._esc(err.reason)}</td>
                      <td><code style="font-size:0.75rem; color:var(--gray-600);">${this._esc(err.data || '—')}</code></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" id="btnCloseErrorReport2">Close Report</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('importErrorReportModal');

    const handleEsc = (e) => {
      if (e.key === 'Escape') cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('keydown', handleEsc);
      modalEl.remove();
    };

    window.addEventListener('keydown', handleEsc);
    modalEl.querySelector('#btnCloseErrorReport').addEventListener('click', cleanup);
    modalEl.querySelector('#btnCloseErrorReport2').addEventListener('click', cleanup);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) cleanup();
    });
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  _exportCsv() {
    const comp = this.state.selectedCompany;
    const plan = this.state.selectedPlan;
    if (!comp || !plan) return;

    const url = exportRatesCsvUrl(comp._id, plan._id);
    window.location.href = url;
  }

  // ── Modal Helpers ─────────────────────────────────────────────────────────
  _showInputModal(title, label, placeholder = '', initialValue = '') {
    return new Promise((resolve) => {
      const existing = document.getElementById('inputModal');
      if (existing) existing.remove();

      const modalHtml = `
        <div class="modal-backdrop" id="inputModal">
          <div class="modal-card">
            <div class="modal-header">
              <h2 class="modal-title">${title}</h2>
              <button class="modal-close" id="btnInputModalClose" title="Close">✕</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">${label}</label>
                <input type="text" class="form-input" id="inputModalField" placeholder="${placeholder}" value="${initialValue}" autofocus />
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnInputModalCancel">Cancel</button>
              <button class="btn btn-primary" id="btnInputModalSave">Save</button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modalEl = document.getElementById('inputModal');
      const inputEl = document.getElementById('inputModalField');
      inputEl.focus();
      inputEl.select();

      const handleEsc = (e) => {
        if (e.key === 'Escape') close(null);
      };
      const close = (val) => {
        window.removeEventListener('keydown', handleEsc);
        modalEl.remove();
        resolve(val);
      };

      window.addEventListener('keydown', handleEsc);
      modalEl.querySelector('#btnInputModalClose').addEventListener('click', () => close(null));
      modalEl.querySelector('#btnInputModalCancel').addEventListener('click', () => close(null));
      modalEl.querySelector('#btnInputModalSave').addEventListener('click', () => close(inputEl.value.trim()));
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) close(null);
      });

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(inputEl.value.trim());
      });
    });
  }

  _showConfirmModal(title, message, confirmText = 'Confirm', isDanger = true) {
    return new Promise((resolve) => {
      const existing = document.getElementById('confirmModal');
      if (existing) existing.remove();

      const modalHtml = `
        <div class="modal-backdrop" id="confirmModal">
          <div class="modal-card" style="max-width: 440px;">
            <div class="modal-header">
              <h2 class="modal-title">${title}</h2>
              <button class="modal-close" id="btnConfirmModalClose" title="Close">✕</button>
            </div>
            <div class="modal-body">
              <p style="font-size:0.925rem; color:var(--gray-700); line-height:1.5;">${message}</p>
            </div>
            <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:0.75rem;">
              <button class="btn btn-secondary" id="btnConfirmModalCancel">Cancel</button>
              <button class="btn" id="btnConfirmModalProceed" style="${isDanger ? 'background:var(--red); color:#fff; border-color:var(--red);' : 'background:var(--navy); color:#fff;'}">${confirmText}</button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modalEl = document.getElementById('confirmModal');

      const handleKey = (e) => {
        if (e.key === 'Escape') close(false);
      };
      const close = (val) => {
        window.removeEventListener('keydown', handleKey);
        modalEl.remove();
        resolve(val);
      };

      window.addEventListener('keydown', handleKey);
      modalEl.querySelector('#btnConfirmModalClose').addEventListener('click', () => close(false));
      modalEl.querySelector('#btnConfirmModalCancel').addEventListener('click', () => close(false));
      modalEl.querySelector('#btnConfirmModalProceed').addEventListener('click', () => close(true));
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) close(false);
      });
    });
  }

  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Refresh DOM View ──────────────────────────────────────────────────────
  _refresh() {
    if (!this.container) return;
    const content = this.container.querySelector('#adminContent');
    const breadcrumbs = this.container.querySelector('.admin-breadcrumb-bar');

    if (breadcrumbs) {
      breadcrumbs.outerHTML = this._renderBreadcrumbs();
    }
    if (content) {
      content.innerHTML = this._renderCurrentLevel();
    }

    // Attach file input change listener if in rates level
    const fileInput = this.container.querySelector('#csvFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this._handleCsvFileSelect(e.target.files[0]);
          e.target.value = '';
        }
      });
    }
  }
}

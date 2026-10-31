/**
 * Khanna Travels — Insurance Plans & Rates View (Admin Only)
 * Updated Specification: Direct 2-Tier Navigation (Companies & Plans -> Rate Table)
 * 
 * Flows:
 *   - Tab 1: Companies
 *       - Level 1: Companies list with direct plan rows, actions (Edit, Archive, + Add Plan), and direct "Rate Table" button per plan
 *       - Level 3: Plan page (Breadcrumb "← Back to Companies", Plan settings card, Rate table card with matrix editor)
 *   - Tab 2: Rate Tables (Shortcut)
 *       - Dropdowns: Company, then Plan -> opens the same Plan page
 *       - Empty message before selection: "Select a company and a plan to edit its rate table."
 *
 * Real MongoDB data via REST API. Never shows fake data.
 * Unreachable DB shows: "Cannot reach the database. Check MONGODB_URI in server/.env." with Retry button.
 */

import {
  isAdminAuthenticated,
  getCompanies,
  getCompany,
  addCompany,
  renameCompany,
  toggleCompanyStatus,
  addPlan,
  updatePlan,
  getRates,
  saveRateGrid
} from '../api.js';

const TABS = [
  { id: 'companies', label: 'Companies' },
  { id: 'rate-tables', label: 'Rate Tables' }
];

const DEFAULT_AGE_BANDS = [
  { from: 0, to: 40 },
  { from: 41, to: 60 },
  { from: 61, to: 70 },
  { from: 71, to: 80 },
  { from: 81, to: 85 }
];

const DEFAULT_DAYS_SLABS = [
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
];

const PRESET_TEMPLATES = {
  'standard_5x17': {
    name: 'Standard (5 Ages × 17 Days)',
    ageBands: DEFAULT_AGE_BANDS,
    daysSlabs: DEFAULT_DAYS_SLABS
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

const COVERAGE_OPTIONS = [50000, 100000, 200000, 250000, 500000, 750000, 1000000];

export class PlansRatesView {
  constructor(app) {
    this.app = app;
    this.container = null;

    // Navigation state
    this.activeTab = 'companies'; // 'companies' | 'rate-tables'
    this.level = 'companies';     // 'companies' | 'company' | 'plan'

    // Data state
    this.companies = [];
    this.selectedCompany = null;
    this.selectedPlan = null;
    this.companyFilter = 'all';   // 'all' | 'active' | 'archived'
    this.loading = false;
    this.dbError = null;

    // Rate Table state
    this.currentCoverage = 50000;
    this.currentRegion = 'Excluding';
    this.ageBands = [...DEFAULT_AGE_BANDS];
    this.daysSlabs = [...DEFAULT_DAYS_SLABS];
    this.matrixData = {};         // key `${rowIdx}_${colIdx}` => number/string
    this.originalMatrixData = {}; // baseline for dirty tracking & cancel
    this.isRateDirty = false;
    this.ratesLoading = false;

    // Plan Settings Card Editing state
    this.isEditingPlanSettings = false;
    this.planSettingsDraft = {
      planName: '',
      productLine: 'Excl. USA/Canada',
      medicalCover: 'none',
      isActive: true
    };

    // Shortcut state (Rate Tables tab)
    this.shortcutCompanyId = '';
    this.shortcutPlanId = '';

    // Auto-fetch data on start
    this._dataFetched = false;
  }

  // ─── Data Fetching ──────────────────────────────────────────────────────────
  async _loadData() {
    this.loading = true;
    this.dbError = null;
    try {
      const data = await getCompanies();
      this.companies = Array.isArray(data) ? data : [];
      this.dbError = null;

      // If viewing a selected company, refresh it from current list
      if (this.selectedCompany) {
        const found = this.companies.find(c => String(c._id) === String(this.selectedCompany._id));
        if (found) {
          this.selectedCompany = found;
          if (this.selectedPlan) {
            const foundPlan = (found.plans || []).find(p => String(p._id) === String(this.selectedPlan._id));
            if (foundPlan) {
              this.selectedPlan = foundPlan;
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching companies from MongoDB:', err);
      this.dbError = 'Cannot reach the database. Check MONGODB_URI in server/.env.';
      this.companies = [];
    } finally {
      this.loading = false;
      this._dataFetched = true;
    }
  }

  async _loadRatesForCurrentPlan() {
    if (!this.selectedCompany || !this.selectedPlan) return;
    this.ratesLoading = true;
    this.isRateDirty = false;
    this.matrixData = {};
    this.originalMatrixData = {};

    try {
      const rates = await getRates(this.selectedCompany._id, this.selectedPlan._id, {
        coverage: this.currentCoverage,
        region: this.currentRegion
      });

      if (Array.isArray(rates) && rates.length > 0) {
        // Extract distinct Age Bands
        const ageBandMap = new Map();
        rates.forEach(r => {
          const key = `${r.ageFrom}_${r.ageTo}`;
          if (!ageBandMap.has(key)) {
            ageBandMap.set(key, { from: r.ageFrom, to: r.ageTo });
          }
        });
        const extractedAgeBands = Array.from(ageBandMap.values()).sort((a, b) => a.from - b.from);

        // Extract distinct Days Slabs
        const slabMap = new Map();
        rates.forEach(r => {
          const key = `${r.daysFrom}_${r.daysTo}`;
          if (!slabMap.has(key)) {
            slabMap.set(key, { from: r.daysFrom, to: r.daysTo });
          }
        });
        const extractedDaysSlabs = Array.from(slabMap.values()).sort((a, b) => a.from - b.from);

        this.ageBands = extractedAgeBands.length > 0 ? extractedAgeBands : [...DEFAULT_AGE_BANDS];
        this.daysSlabs = extractedDaysSlabs.length > 0 ? extractedDaysSlabs : [...DEFAULT_DAYS_SLABS];

        // Fill matrix
        rates.forEach(r => {
          const rowIdx = this.daysSlabs.findIndex(s => s.from === r.daysFrom && s.to === r.daysTo);
          const colIdx = this.ageBands.findIndex(a => a.from === r.ageFrom && a.to === r.ageTo);
          if (rowIdx !== -1 && colIdx !== -1) {
            this.matrixData[`${rowIdx}_${colIdx}`] = r.premium;
          }
        });
      } else {
        // If plan has no rates for this coverage & region, provide standard empty matrix
        this.ageBands = [...DEFAULT_AGE_BANDS];
        this.daysSlabs = [...DEFAULT_DAYS_SLABS];
        this.matrixData = {};
      }

      this.originalMatrixData = { ...this.matrixData };
      this.isRateDirty = false;
    } catch (err) {
      console.error('Failed to load rates for plan:', err);
      this.app.showToast('Could not load rates: ' + err.message, 'error');
    } finally {
      this.ratesLoading = false;
    }
  }

  // ─── Render Entry ──────────────────────────────────────────────────────────
  render() {
    if (!isAdminAuthenticated()) {
      return '';
    }

    return `
      <div class="pr-page-wrapper">
        <!-- Main Top Bar -->
        <div class="pr-top-bar">
          <div class="pr-title-group">
            <h1 class="pr-main-title">Insurance Plans &amp; Rates</h1>
            <p class="pr-subtitle">Admin only. Manage insurers, plans and rate tables.</p>
          </div>
        </div>

        <!-- 2-Tab Navigation Row: Companies | Rate Tables -->
        <div class="pr-tabs-container" role="tablist" aria-label="Plans &amp; Rates Navigation">
          <div class="pr-tabs-track">
            ${TABS.map(tab => {
              const isActive = this.activeTab === tab.id;
              return `
                <button
                  type="button"
                  class="pr-tab-btn ${isActive ? 'active' : ''}"
                  data-pr-tab="${tab.id}"
                  role="tab"
                  aria-selected="${isActive ? 'true' : 'false'}"
                  id="tabBtn_${tab.id}"
                >
                  ${tab.label}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Main Workspace Area -->
        <div class="pr-workspace-area" id="prWorkspaceArea">
          ${this._renderContent()}
        </div>
      </div>
    `;
  }

  // ─── Content Router ────────────────────────────────────────────────────────
  _renderContent() {
    // 1. Database Error State
    if (this.dbError) {
      return `
        <div class="pr-card pr-error-card">
          <div class="pr-error-icon">⚠️</div>
          <div class="pr-error-body">
            <h3 class="pr-error-heading">Cannot reach the database. Check MONGODB_URI in server/.env.</h3>
            <p class="pr-error-desc">The application could not establish a connection to MongoDB Atlas. Check your database credentials and internet access.</p>
            <button class="btn btn-primary pr-btn-retry" id="btnRetryDb">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg>
              Retry
            </button>
          </div>
        </div>
      `;
    }

    // 2. Initial Loading State
    if (this.loading && !this._dataFetched) {
      return `
        <div class="pr-card pr-loading-card">
          <div class="pr-spinner"></div>
          <div class="pr-loading-text">Loading insurance data from MongoDB...</div>
        </div>
      `;
    }

    // 3. Tab: Rate Tables (Shortcut)
    if (this.activeTab === 'rate-tables') {
      return this._renderRateTablesTab();
    }

    // 4. Tab: Companies
    return this._renderCompaniesTab();
  }

  // ─── TAB 1: COMPANIES & PLANS FLOW ─────────────────────────────────────────
  _renderCompaniesTab() {
    if (this.level === 'plan') {
      return `
        ${this._renderBreadcrumbs()}
        ${this._renderPlanPage()}
      `;
    }
    if (this.level === 'company') {
      return `
        ${this._renderBreadcrumbs()}
        ${this._renderCompanyPlansPage()}
      `;
    }
    return this._renderCompaniesList();
  }

  // ─── BREADCRUMBS ────────────────────────────────────────────────────────────
  _renderBreadcrumbs() {
    const compName = this.selectedCompany ? this.selectedCompany.companyName : '';
    const planName = this.selectedPlan ? this.selectedPlan.planName : '';

    if (this.level === 'plan') {
      return `
        <nav class="pr-breadcrumbs" aria-label="Breadcrumb">
          <button type="button" class="pr-crumb-link" data-crumb="companies">Companies</button>
          <span class="pr-crumb-sep">›</span>
          <button type="button" class="pr-crumb-link" data-crumb="company">${this._esc(compName)}</button>
          <span class="pr-crumb-sep">›</span>
          <span class="pr-crumb-current">${this._esc(planName)}</span>
        </nav>
      `;
    }

    if (this.level === 'company') {
      return `
        <nav class="pr-breadcrumbs" aria-label="Breadcrumb">
          <button type="button" class="pr-crumb-link" data-crumb="companies">Companies</button>
          <span class="pr-crumb-sep">›</span>
          <span class="pr-crumb-current">${this._esc(compName)}</span>
        </nav>
      `;
    }

    return '';
  }

  // ─── LEVEL 1: COMPANIES LIST ───────────────────────────────────────────────
  _renderCompaniesList() {
    const all = this.companies;
    const activeCount = all.filter(c => c.isActive !== false).length;
    const archivedCount = all.filter(c => c.isActive === false).length;

    let filtered = all;
    if (this.companyFilter === 'active') {
      filtered = all.filter(c => c.isActive !== false);
    } else if (this.companyFilter === 'archived') {
      filtered = all.filter(c => c.isActive === false);
    }

    return `
      <div class="pr-companies-list-view">
        <!-- List Header Bar -->
        <div class="pr-section-header">
          <div class="pr-section-title-wrap">
            <h2 class="pr-section-title">Insurance Companies</h2>
            <span class="pr-count-chip">${filtered.length}</span>
          </div>

          <div class="pr-section-controls">
            <!-- Filter Toggle: All (n), Active (n), Archived (n) -->
            <div class="pr-toggle-pill-group" role="group" aria-label="Filter companies">
              <button
                type="button"
                class="pr-toggle-btn ${this.companyFilter === 'all' ? 'active' : ''}"
                data-filter="all"
              >
                All (${all.length})
              </button>
              <button
                type="button"
                class="pr-toggle-btn ${this.companyFilter === 'active' ? 'active' : ''}"
                data-filter="active"
              >
                Active (${activeCount})
              </button>
              <button
                type="button"
                class="pr-toggle-btn ${this.companyFilter === 'archived' ? 'active' : ''}"
                data-filter="archived"
              >
                Archived (${archivedCount})
              </button>
            </div>

            <!-- Add Company Button -->
            <button type="button" class="btn btn-primary pr-btn-add" id="btnAddCompany">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
              Add Company
            </button>
          </div>
        </div>

        <!-- Empty State -->
        ${filtered.length === 0 ? `
          <div class="pr-card pr-empty-card">
            <div class="pr-empty-icon">🏢</div>
            <div class="pr-empty-text">No companies found. Add your first company to begin.</div>
            <button type="button" class="btn btn-primary" id="btnEmptyAddCompany" style="margin-top: 14px;">
              + Add Company
            </button>
          </div>
        ` : `
          <!-- Companies Table (PC >= 768px) -->
          <div class="pr-card pr-pc-table-card">
            <table class="pr-table pr-companies-table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Status</th>
                  <th>Plans</th>
                  <th>Added Date</th>
                  <th class="pr-col-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(c => {
                  const plans = c.plans || [];
                  const isActive = c.isActive !== false;
                  const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                  return `
                    <tr class="pr-row-clickable" data-select-company="${c._id}">
                      <td>
                        <div class="pr-company-cell">
                          <span class="pr-company-icon">🏢</span>
                          <div>
                            <strong class="pr-company-name">${this._esc(c.companyName)}</strong>
                            <div class="pr-company-subtext">Click to view plans (${plans.length})</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="pr-status-badge ${isActive ? 'status-active' : 'status-archived'}">
                          ${isActive ? 'Active' : 'Archived'}
                        </span>
                      </td>
                      <td>
                        <span class="pr-plans-pill">${plans.length} ${plans.length === 1 ? 'Plan' : 'Plans'}</span>
                      </td>
                      <td>
                        <span class="pr-date-cell">${dateStr}</span>
                      </td>
                      <td class="pr-col-right" onclick="event.stopPropagation()">
                        <div class="pr-row-actions">
                          <button type="button" class="btn btn-primary btn-sm pr-btn-view-plans" data-select-company="${c._id}">
                            View Plans →
                          </button>
                          <button type="button" class="btn btn-outline btn-sm" data-edit-company="${c._id}" title="Rename Company">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                            Edit
                          </button>
                          ${isActive ? `
                            <button type="button" class="btn btn-outline btn-sm pr-btn-archive" data-toggle-archive="${c._id}" data-action="archive">
                              Archive
                            </button>
                          ` : `
                            <button type="button" class="btn btn-outline btn-sm pr-btn-activate" data-toggle-archive="${c._id}" data-action="activate">
                              Activate
                            </button>
                          `}
                          <button type="button" class="btn btn-outline btn-sm" data-add-plan="${c._id}">
                            + Plan
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Companies Mobile Cards (< 768px) -->
          <div class="pr-mobile-cards-list">
            ${filtered.map(c => {
              const plans = c.plans || [];
              const isActive = c.isActive !== false;
              const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
              return `
                <div class="pr-card pr-mobile-company-card" data-select-company="${c._id}">
                  <div class="pr-mcc-header">
                    <strong class="pr-mcc-title">${this._esc(c.companyName)}</strong>
                    <span class="pr-status-badge ${isActive ? 'status-active' : 'status-archived'}">
                      ${isActive ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  <div class="pr-mcc-meta">
                    <span class="pr-plans-pill">${plans.length} ${plans.length === 1 ? 'Plan' : 'Plans'}</span>
                    <span>Added ${dateStr}</span>
                  </div>
                  <div class="pr-mcc-actions" onclick="event.stopPropagation()" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                    <button type="button" class="btn btn-primary btn-sm pr-btn-view-plans" data-select-company="${c._id}" style="width:100%; justify-content:center;">
                      View Plans →
                    </button>
                    <div style="display:flex; gap:6px;">
                      <button type="button" class="btn btn-outline btn-sm" data-edit-company="${c._id}" style="flex:1;">Edit</button>
                      ${isActive ? `
                        <button type="button" class="btn btn-outline btn-sm pr-btn-archive" data-toggle-archive="${c._id}" data-action="archive" style="flex:1;">Archive</button>
                      ` : `
                        <button type="button" class="btn btn-outline btn-sm pr-btn-activate" data-toggle-archive="${c._id}" data-action="activate" style="flex:1;">Activate</button>
                      `}
                      <button type="button" class="btn btn-outline btn-sm" data-add-plan="${c._id}" style="flex:1;">+ Plan</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  // ─── LEVEL 2: COMPANY PLANS PAGE ───────────────────────────────────────────
  _renderCompanyPlansPage() {
    if (!this.selectedCompany) {
      return `
        <div class="pr-card pr-empty-card">
          <div class="pr-empty-icon">🏢</div>
          <div class="pr-empty-text">No company selected.</div>
          <button type="button" class="btn btn-primary" data-crumb="companies" style="margin-top: 14px;">
            ← Back to Companies
          </button>
        </div>
      `;
    }

    const c = this.selectedCompany;
    const plans = c.plans || [];
    const isActive = c.isActive !== false;
    const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    return `
      <div class="pr-company-plans-view">
        <!-- Company Header Card -->
        <div class="pr-card pr-company-detail-header-card" style="margin-bottom: 20px;">
          <div class="pr-comp-header-bar" style="background: transparent; border-bottom: none; padding: 0;">
            <div class="pr-comp-info-group">
              <h2 class="pr-comp-title" style="font-size: 22px;">${this._esc(c.companyName)}</h2>
              <span class="pr-status-badge ${isActive ? 'status-active' : 'status-archived'}">
                ${isActive ? 'Active' : 'Archived'}
              </span>
              <span class="pr-plans-pill">${plans.length} ${plans.length === 1 ? 'Plan' : 'Plans'}</span>
              <span class="pr-date-cell">Added ${dateStr}</span>
            </div>

            <div class="pr-comp-actions-group">
              <button type="button" class="btn btn-outline btn-sm" data-edit-company="${c._id}" title="Rename Company">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                Edit Company
              </button>
              ${isActive ? `
                <button type="button" class="btn btn-outline btn-sm pr-btn-archive" data-toggle-archive="${c._id}" data-action="archive">
                  Archive
                </button>
              ` : `
                <button type="button" class="btn btn-outline btn-sm pr-btn-activate" data-toggle-archive="${c._id}" data-action="activate">
                  Activate
                </button>
              `}
              <button type="button" class="btn btn-primary btn-sm" data-add-plan="${c._id}">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
                + Add Plan
              </button>
            </div>
          </div>
        </div>

        <!-- Plans Section Card -->
        <div class="pr-card pr-company-plans-card" style="padding: 0; overflow: hidden;">
          <div class="pr-section-header" style="padding: 16px 20px; border-bottom: 1px solid var(--line); margin-bottom: 0;">
            <div class="pr-section-title-wrap">
              <h3 class="pr-card-title" style="margin: 0; font-size: 16px;">Plans under ${this._esc(c.companyName)}</h3>
              <span class="pr-count-chip">${plans.length}</span>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-add-plan="${c._id}">
              + Add Plan
            </button>
          </div>

          <!-- Plans Table (PC >= 768px) -->
          <div class="pr-pc-table-card" style="border:none; border-radius:0; box-shadow:none; margin:0;">
            ${plans.length === 0 ? `
              <div class="pr-company-plans-empty" style="padding: 36px 20px;">
                <span>No plans created yet for ${this._esc(c.companyName)}.</span>
                <button type="button" class="btn btn-primary btn-sm" data-add-plan="${c._id}">+ Add First Plan</button>
              </div>
            ` : `
              <table class="pr-plans-subtable">
                <thead>
                  <tr>
                    <th>Plan Name</th>
                    <th>Region</th>
                    <th>Medical Type</th>
                    <th>Status</th>
                    <th class="pr-col-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${plans.map(p => {
                    const isPlanActive = p.isActive !== false;
                    const regionLabel = this._formatRegion(p.productLine);
                    const medicalLabel = this._formatMedical(p.medicalCover);
                    return `
                      <tr class="pr-row-clickable" data-open-rate-table="${c._id}:${p._id}">
                        <td>
                          <strong class="pr-plan-name" style="font-size: 15px; color: var(--navy);">${this._esc(p.planName)}</strong>
                        </td>
                        <td>
                          <span class="pr-region-tag">${regionLabel}</span>
                        </td>
                        <td>
                          <span class="pr-medical-tag">${medicalLabel}</span>
                        </td>
                        <td>
                          <span class="pr-status-badge ${isPlanActive ? 'status-active' : 'status-archived'}">
                            ${isPlanActive ? 'Active' : 'Archived'}
                          </span>
                        </td>
                        <td class="pr-col-right">
                          <button type="button" class="pr-btn-rate-table" data-open-rate-table="${c._id}:${p._id}">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true"><path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z"/></svg>
                            Rate Table
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `}
          </div>

          <!-- Plans Mobile Cards (< 768px) -->
          <div class="pr-mobile-cards-list" style="padding: 14px;">
            ${plans.length === 0 ? `
              <div class="pr-company-plans-empty" style="padding: 16px 0;">
                <span>No plans created yet.</span>
                <button type="button" class="btn btn-outline btn-sm" data-add-plan="${c._id}">+ Add Plan</button>
              </div>
            ` : plans.map(p => {
              const isPlanActive = p.isActive !== false;
              const regionLabel = this._formatRegion(p.productLine);
              const medicalLabel = this._formatMedical(p.medicalCover);
              return `
                <div class="pr-card pr-mobile-plan-card" style="box-shadow: 0 1px 2px rgba(20,35,63,0.06);" data-open-rate-table="${c._id}:${p._id}">
                  <div class="pr-mpc-header">
                    <strong class="pr-mpc-title">${this._esc(p.planName)}</strong>
                    <span class="pr-status-badge ${isPlanActive ? 'status-active' : 'status-archived'}">
                      ${isPlanActive ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  <div class="pr-mpc-tags">
                    <span class="pr-region-tag">Region: ${regionLabel}</span>
                    <span class="pr-medical-tag">Medical: ${medicalLabel}</span>
                  </div>
                  <button type="button" class="pr-btn-rate-table pr-btn-full" data-open-rate-table="${c._id}:${p._id}">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true"><path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z"/></svg>
                    Rate Table
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ─── LEVEL 3: PLAN PAGE (Settings and Rate Table) ──────────────────────────
  _renderPlanPage() {
    if (!this.selectedCompany || !this.selectedPlan) {
      return `<div class="pr-card pr-empty-card">No plan selected.</div>`;
    }

    const comp = this.selectedCompany;
    const plan = this.selectedPlan;

    return `
      <div class="pr-plan-page-view">
        <!-- 1. Plan Settings Card -->
        <div class="pr-card pr-settings-card" id="planSettingsCard">
          ${this._renderPlanSettingsCardContent(plan)}
        </div>

        <!-- 2. Rate Table Card -->
        <div class="pr-card pr-rate-matrix-card" id="rateMatrixCard">
          ${this._renderRateMatrixCardContent(comp, plan)}
        </div>
      </div>
    `;
  }

  // ── Plan Settings Card Content ──────────────────────────────────────────────
  _renderPlanSettingsCardContent(plan) {
    const isPlanActive = plan.isActive !== false;
    const regionDisplay = this._formatRegion(plan.productLine);
    const medicalDisplay = this._formatMedical(plan.medicalCover);

    if (this.isEditingPlanSettings) {
      // Edit Mode
      return `
        <div class="pr-card-header-row">
          <div>
            <h3 class="pr-card-title">Edit Plan Settings</h3>
            <p class="pr-card-subtitle">Update plan identity, geographical scope, and medical coverage option.</p>
          </div>
        </div>

        <form id="formPlanSettings" class="pr-settings-form" novalidate>
          <div class="pr-form-grid">
            <div class="pr-form-field">
              <label class="pr-form-label" for="settingPlanName">Plan Name *</label>
              <input
                type="text"
                id="settingPlanName"
                class="pr-input"
                value="${this._esc(this.planSettingsDraft.planName)}"
                required
              />
            </div>

            <div class="pr-form-field">
              <label class="pr-form-label" for="settingPlanRegion">Region Scope</label>
              <select id="settingPlanRegion" class="pr-select">
                <option value="Excl. USA/Canada" ${this.planSettingsDraft.productLine === 'Excl. USA/Canada' ? 'selected' : ''}>Excl. USA/Canada</option>
                <option value="Incl. USA/Canada" ${this.planSettingsDraft.productLine === 'Incl. USA/Canada' ? 'selected' : ''}>Incl. USA/Canada</option>
                <option value="Worldwide" ${this.planSettingsDraft.productLine === 'Worldwide' ? 'selected' : ''}>Worldwide</option>
                <option value="Asia" ${this.planSettingsDraft.productLine === 'Asia' ? 'selected' : ''}>Asia</option>
                <option value="Schengen" ${this.planSettingsDraft.productLine === 'Schengen' ? 'selected' : ''}>Schengen</option>
              </select>
            </div>

            <div class="pr-form-field">
              <label class="pr-form-label" for="settingPlanMedical">Medical Type</label>
              <select id="settingPlanMedical" class="pr-select">
                <option value="with" ${this.planSettingsDraft.medicalCover === 'with' ? 'selected' : ''}>With Medical</option>
                <option value="without" ${this.planSettingsDraft.medicalCover === 'without' ? 'selected' : ''}>Without Medical</option>
                <option value="none" ${this.planSettingsDraft.medicalCover === 'none' ? 'selected' : ''}>None / Not Applicable</option>
              </select>
            </div>

            <div class="pr-form-field">
              <label class="pr-form-label" for="settingPlanStatus">Status</label>
              <select id="settingPlanStatus" class="pr-select">
                <option value="active" ${this.planSettingsDraft.isActive ? 'selected' : ''}>Active</option>
                <option value="archived" ${!this.planSettingsDraft.isActive ? 'selected' : ''}>Archived</option>
              </select>
            </div>
          </div>

          <div class="pr-form-actions-row">
            <button type="submit" class="btn btn-primary" id="btnSavePlanSettings">
              Save Plan
            </button>
            <button type="button" class="btn btn-outline" id="btnCancelPlanSettings">
              Cancel
            </button>
          </div>
        </form>
      `;
    }

    // View Mode
    return `
      <div class="pr-card-header-row">
        <div>
          <h3 class="pr-card-title">Plan Settings</h3>
          <p class="pr-card-subtitle">Configuration settings and metadata for this policy plan.</p>
        </div>
        <button type="button" class="btn btn-outline" id="btnEditPlanSettings">
          Edit
        </button>
      </div>

      <div class="pr-settings-grid-view">
        <div class="pr-sg-item">
          <span class="pr-sg-label">Plan Name</span>
          <strong class="pr-sg-value">${this._esc(plan.planName)}</strong>
        </div>

        <div class="pr-sg-item">
          <span class="pr-sg-label">Region</span>
          <span class="pr-sg-value">
            <span class="pr-region-tag">${regionDisplay}</span>
          </span>
        </div>

        <div class="pr-sg-item">
          <span class="pr-sg-label">Medical Type</span>
          <span class="pr-sg-value">
            <span class="pr-medical-tag">${medicalDisplay}</span>
          </span>
        </div>

        <div class="pr-sg-item">
          <span class="pr-sg-label">Status</span>
          <span class="pr-sg-value">
            <span class="pr-status-badge ${isPlanActive ? 'status-active' : 'status-archived'}">
              ${isPlanActive ? 'Active' : 'Archived'}
            </span>
          </span>
        </div>
      </div>
    `;
  }

  // ── Rate Table Card Content ────────────────────────────────────────────────
  _renderRateMatrixCardContent(comp, plan) {
    const { currentCoverage, currentRegion, ageBands, daysSlabs, isRateDirty, ratesLoading } = this;

    return `
      <div class="pr-matrix-header-row">
        <div>
          <h3 class="pr-card-title">Rate Table</h3>
          <p class="pr-card-subtitle">Dynamic pricing matrix for ${this._esc(comp.companyName)} — ${this._esc(plan.planName)}.</p>
        </div>

        <div class="pr-matrix-save-actions">
          <button
            type="button"
            class="btn btn-outline"
            id="btnCancelRateGrid"
            ${!isRateDirty ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary pr-btn-save-rates"
            id="btnSaveRateGrid"
            ${!isRateDirty ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}
          >
            Save Changes
          </button>
        </div>
      </div>

      <!-- Sum Insured & Region Controls Bar -->
      <div class="pr-matrix-toolbar">
        <!-- Sum Insured Pills -->
        <div class="pr-toolbar-group">
          <span class="pr-toolbar-label">Sum Insured:</span>
          <div class="pr-pills-row" id="coveragePills">
            ${COVERAGE_OPTIONS.map(cov => {
              const active = Number(currentCoverage) === cov;
              const formatted = cov >= 1000000 ? '$1,000,000' : `$${cov.toLocaleString()}`;
              return `
                <button
                  type="button"
                  class="pr-pill-btn ${active ? 'active' : ''}"
                  data-coverage="${cov}"
                >
                  ${formatted}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Region Scope -->
        <div class="pr-toolbar-group">
          <span class="pr-toolbar-label">Region:</span>
          <div class="pr-segmented-ctrl" id="regionSegments">
            <button
              type="button"
              class="pr-seg-btn ${currentRegion === 'Excluding' ? 'active' : ''}"
              data-region="Excluding"
            >
              Excluding USA/Canada
            </button>
            <button
              type="button"
              class="pr-seg-btn ${currentRegion === 'Including' ? 'active' : ''}"
              data-region="Including"
            >
              Including USA/Canada
            </button>
          </div>
        </div>

        <!-- Template & Fast Tools -->
        <div class="pr-toolbar-group pr-tools-right">
          <select id="selectPresetTemplate" class="pr-select pr-select-sm">
            <option value="">Load Preset Template...</option>
            ${Object.entries(PRESET_TEMPLATES).map(([key, t]) => `
              <option value="${key}">${t.name}</option>
            `).join('')}
          </select>
          <button type="button" class="btn btn-outline btn-sm" id="btnAddAgeBand">+ Age</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnAddDaysSlab">+ Days</button>
        </div>
      </div>

      <!-- Matrix Grid Wrapper: Mobile scrolls horizontally inside container with sticky first column -->
      <div class="pr-matrix-scroll-wrapper" id="matrixScrollWrapper">
        ${ratesLoading ? `
          <div class="pr-matrix-loading-overlay">
            <div class="pr-spinner"></div>
            <span>Loading pricing grid...</span>
          </div>
        ` : ''}

        <table class="pr-matrix-table" id="rateMatrixTable">
          <thead>
            <tr>
              <th class="pr-matrix-corner-cell">Days \\ Age</th>
              ${ageBands.map((band, colIdx) => `
                <th class="pr-matrix-col-header" data-col="${colIdx}">
                  <div class="pr-band-inputs">
                    <input
                      type="number"
                      class="pr-mini-num-input"
                      data-type="age"
                      data-field="from"
                      data-idx="${colIdx}"
                      value="${band.from}"
                      min="0"
                      max="120"
                    />
                    <span>–</span>
                    <input
                      type="number"
                      class="pr-mini-num-input"
                      data-type="age"
                      data-field="to"
                      data-idx="${colIdx}"
                      value="${band.to}"
                      min="0"
                      max="120"
                    />
                    <button type="button" class="pr-btn-del-band" data-del-age="${colIdx}" title="Remove Column">✕</button>
                  </div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${daysSlabs.map((slab, rowIdx) => `
              <tr data-row="${rowIdx}">
                <th class="pr-matrix-row-header">
                  <div class="pr-slab-inputs">
                    <input
                      type="number"
                      class="pr-mini-num-input"
                      data-type="days"
                      data-field="from"
                      data-idx="${rowIdx}"
                      value="${slab.from}"
                      min="1"
                      max="365"
                    />
                    <span>–</span>
                    <input
                      type="number"
                      class="pr-mini-num-input"
                      data-type="days"
                      data-field="to"
                      data-idx="${rowIdx}"
                      value="${slab.to}"
                      min="1"
                      max="365"
                    />
                    <button type="button" class="pr-btn-del-band" data-del-days="${rowIdx}" title="Remove Row">✕</button>
                  </div>
                </th>
                ${ageBands.map((band, colIdx) => {
                  const cellKey = `${rowIdx}_${colIdx}`;
                  const val = this.matrixData[cellKey] !== undefined ? this.matrixData[cellKey] : '';
                  return `
                    <td class="pr-matrix-cell">
                      <input
                        type="text"
                        class="pr-cell-input ${val !== '' ? 'has-val' : ''}"
                        data-row="${rowIdx}"
                        data-col="${colIdx}"
                        value="${val}"
                        placeholder="—"
                        inputmode="numeric"
                      />
                    </td>
                  `;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ─── TAB 2: RATE TABLES (SHORTCUT) ─────────────────────────────────────────
  _renderRateTablesTab() {
    return `
      <div class="pr-rate-tables-tab-view">
        <!-- 2 Dropdowns Bar: Company, then Plan -->
        <div class="pr-card pr-shortcut-selector-card">
          <div class="pr-shortcut-header">
            <h2 class="pr-section-title">Rate Tables Shortcut</h2>
            <p class="pr-section-subtitle">Quickly jump directly to any company's plan rate table.</p>
          </div>

          <div class="pr-shortcut-dropdowns-row">
            <div class="pr-shortcut-field">
              <label class="pr-form-label" for="shortcutCompanySelect">Company</label>
              <select id="shortcutCompanySelect" class="pr-select">
                <option value="">Select a company...</option>
                ${this.companies.map(c => `
                  <option value="${c._id}" ${String(this.shortcutCompanyId) === String(c._id) ? 'selected' : ''}>
                    ${this._esc(c.companyName)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="pr-shortcut-field">
              <label class="pr-form-label" for="shortcutPlanSelect">Plan</label>
              <select id="shortcutPlanSelect" class="pr-select" ${!this.shortcutCompanyId ? 'disabled' : ''}>
                <option value="">${this.shortcutCompanyId ? 'Select a plan...' : 'Select company first...'}</option>
                ${this._getShortcutPlansList().map(p => `
                  <option value="${p._id}" ${String(this.shortcutPlanId) === String(p._id) ? 'selected' : ''}>
                    ${this._esc(p.planName)}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Before a plan is chosen, show required instruction -->
        ${!this.selectedPlan ? `
          <div class="pr-card pr-empty-card" style="margin-top: 20px;">
            <div class="pr-empty-icon">📊</div>
            <div class="pr-empty-text" style="font-size: 16px; font-weight: 700; color: var(--ink);">
              Select a company and a plan to edit its rate table.
            </div>
            <p style="margin-top: 8px; color: var(--muted); font-size: 14px;">
              Choose an insurance company and one of its plans above to inspect and edit age bands, duration slabs, and premiums.
            </p>
          </div>
        ` : `
          <!-- When a plan is chosen, opens the SAME plan page -->
          <div style="margin-top: 24px;">
            ${this._renderPlanPage()}
          </div>
        `}
      </div>
    `;
  }

  _getShortcutPlansList() {
    if (!this.shortcutCompanyId) return [];
    const comp = this.companies.find(c => String(c._id) === String(this.shortcutCompanyId));
    return comp && Array.isArray(comp.plans) ? comp.plans : [];
  }

  // ─── Events Attachment ─────────────────────────────────────────────────────
  async attachEvents(container) {
    this.container = container;

    // Load MongoDB data once on initial display
    if (!this._dataFetched && !this.loading) {
      await this._loadData();
      this._refreshDOM();
      return;
    }

    if (!isAdminAuthenticated()) return;

    // 1. Retry DB connection button
    const btnRetry = container.querySelector('#btnRetryDb');
    if (btnRetry) {
      btnRetry.addEventListener('click', async () => {
        btnRetry.disabled = true;
        btnRetry.textContent = 'Connecting...';
        await this._loadData();
        this._refreshDOM();
      });
    }

    // 2. Tab Navigation Buttons
    container.querySelectorAll('[data-pr-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const nextTab = btn.dataset.prTab;
        if (this.activeTab === nextTab) return;

        // Guard: unsaved rate changes confirmation
        if (this.isRateDirty) {
          if (!confirm('You have unsaved changes in the rate table. Do you want to discard them?')) {
            return;
          }
        }

        this.isRateDirty = false;
        this.activeTab = nextTab;
        if (nextTab === 'companies') {
          // Reset to list if no company was active
          if (!this.selectedCompany) {
            this.level = 'companies';
          }
        }
        this._refreshDOM();
      });
    });

    // 3. Breadcrumb navigation
    container.querySelectorAll('[data-crumb]').forEach(crumb => {
      crumb.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.isRateDirty) {
          if (!confirm('You have unsaved changes in the rate table. Do you want to discard them?')) {
            return;
          }
        }

        const target = crumb.dataset.crumb;
        this.isRateDirty = false;
        if (target === 'company' && this.selectedCompany) {
          // Return to Level 2 (Company Plans)
          this.level = 'company';
          this.selectedPlan = null;
        } else {
          // Return to Level 1 (Companies List)
          this.level = 'companies';
          this.selectedCompany = null;
          this.selectedPlan = null;
        }
        this._refreshDOM();
      });
    });

    // 4. Company Filter Toggle (All, Active, Archived)
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        if (this.companyFilter === f) return;
        this.companyFilter = f;
        this._refreshDOM();
      });
    });

    // 5. Select Company -> Level 2 (Company Plans)
    container.querySelectorAll('[data-select-company]').forEach(el => {
      el.addEventListener('click', (e) => {
        // Prevent selection if clicking inside action buttons (Edit, Archive, +Plan)
        if (e.target.closest('[data-edit-company], [data-toggle-archive], [data-add-plan]')) {
          return;
        }

        const compId = el.dataset.selectCompany;
        if (!compId) return;
        const comp = this.companies.find(c => String(c._id) === String(compId));
        if (!comp) return;

        if (this.isRateDirty) {
          if (!confirm('You have unsaved changes in the rate table. Do you want to discard them?')) return;
        }
        this.isRateDirty = false;

        this.selectedCompany = comp;
        this.selectedPlan = null;
        this.level = 'company';
        this._refreshDOM();
      });
    });

    // 6. Open Rate Table (Directly from Level 2 plan row/card or button to Level 3)
    container.querySelectorAll('[data-open-rate-table]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const key = el.dataset.openRateTable;
        if (!key) return;
        const [compId, planId] = key.split(':');
        const foundComp = this.companies.find(c => String(c._id) === String(compId));
        if (!foundComp) return;
        const foundPlan = (foundComp.plans || []).find(p => String(p._id) === String(planId));
        if (!foundPlan) return;

        if (this.isRateDirty) {
          if (!confirm('You have unsaved changes in the rate table. Do you want to discard them?')) return;
        }
        this.isRateDirty = false;

        this.selectedCompany = foundComp;
        this.selectedPlan = foundPlan;
        this.level = 'plan';
        this.isEditingPlanSettings = false;
        this._initPlanSettingsDraft(foundPlan);
        await this._loadRatesForCurrentPlan();
        this._refreshDOM();
      });
    });

    // 6. Add Company Button (Top bar or empty state)
    const btnAddComp = container.querySelector('#btnAddCompany');
    const btnEmptyAddComp = container.querySelector('#btnEmptyAddCompany');
    const handleAddCompany = async () => {
      const name = await this._promptInput('Add Insurance Company', 'Company Name', 'e.g. Care Health Insurance, Reliance General');
      if (!name || !name.trim()) return;

      try {
        await addCompany(name.trim());
        this.app.showToast(`Company "${name.trim()}" added to database`, 'success');
        await this._loadData();
        this._refreshDOM();
      } catch (err) {
        this.app.showToast(err.message, 'error');
      }
    };
    if (btnAddComp) btnAddComp.addEventListener('click', handleAddCompany);
    if (btnEmptyAddComp) btnEmptyAddComp.addEventListener('click', handleAddCompany);

    // 7. Edit Company Buttons on Level 1
    container.querySelectorAll('[data-edit-company]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const compId = btn.dataset.editCompany;
        const comp = this.companies.find(c => String(c._id) === String(compId));
        if (!comp) return;

        const oldName = comp.companyName;
        const newName = await this._promptInput('Rename Company', 'Company Name', '', oldName);
        if (!newName || newName.trim() === oldName) return;

        try {
          await renameCompany(comp._id, newName.trim());
          this.app.showToast('Company renamed successfully', 'success');
          await this._loadData();
          this._refreshDOM();
        } catch (err) {
          this.app.showToast(err.message, 'error');
        }
      });
    });

    // 8. Archive / Activate Company Buttons on Level 1
    container.querySelectorAll('[data-toggle-archive]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const compId = btn.dataset.toggleArchive;
        const action = btn.dataset.action;
        const comp = this.companies.find(c => String(c._id) === String(compId));
        if (!comp) return;

        if (action === 'archive') {
          if (!confirm(`Are you sure you want to archive "${comp.companyName}"? This company will be hidden from new quotes.`)) {
            return;
          }
          try {
            await toggleCompanyStatus(comp._id, false);
            this.app.showToast(`Company "${comp.companyName}" archived`, 'info');
            await this._loadData();
            this._refreshDOM();
          } catch (err) {
            this.app.showToast(err.message, 'error');
          }
        } else {
          try {
            await toggleCompanyStatus(comp._id, true);
            this.app.showToast(`Company "${comp.companyName}" activated`, 'success');
            await this._loadData();
            this._refreshDOM();
          } catch (err) {
            this.app.showToast(err.message, 'error');
          }
        }
      });
    });

    // 9. Add Plan Button for a specific company on Level 1
    container.querySelectorAll('[data-add-plan]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const compId = btn.dataset.addPlan;
        const comp = this.companies.find(c => String(c._id) === String(compId));
        if (!comp) return;

        const planData = await this._promptPlanModal(comp.companyName);
        if (!planData || !planData.planName) return;

        try {
          await addPlan(comp._id, planData);
          this.app.showToast(`Plan "${planData.planName}" created for ${comp.companyName}`, 'success');
          await this._loadData();
          this._refreshDOM();
        } catch (err) {
          this.app.showToast(err.message, 'error');
        }
      });
    });

    // 11. Plan Settings Card Editing
    const btnEditSettings = container.querySelector('#btnEditPlanSettings');
    if (btnEditSettings && this.selectedPlan) {
      btnEditSettings.addEventListener('click', () => {
        this.isEditingPlanSettings = true;
        this._initPlanSettingsDraft(this.selectedPlan);
        this._refreshDOM();
      });
    }

    const btnCancelSettings = container.querySelector('#btnCancelPlanSettings');
    if (btnCancelSettings) {
      btnCancelSettings.addEventListener('click', () => {
        this.isEditingPlanSettings = false;
        this._refreshDOM();
      });
    }

    const formSettings = container.querySelector('#formPlanSettings');
    if (formSettings) {
      formSettings.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = formSettings.querySelector('#settingPlanName');
        const regionSelect = formSettings.querySelector('#settingPlanRegion');
        const medSelect = formSettings.querySelector('#settingPlanMedical');
        const statusSelect = formSettings.querySelector('#settingPlanStatus');

        const planName = nameInput ? nameInput.value.trim() : '';
        if (!planName) {
          this.app.showToast('Please enter a plan name', 'warning');
          return;
        }

        const productLine = regionSelect ? regionSelect.value : 'Excl. USA/Canada';
        const medicalCover = medSelect ? (medSelect.value === 'with') : false;
        const isActive = statusSelect ? (statusSelect.value === 'active') : true;

        try {
          await updatePlan(this.selectedCompany._id, this.selectedPlan._id, {
            planName,
            productLine,
            region: productLine,
            medicalCover,
            isActive
          });
          this.app.showToast('Plan settings saved to database', 'success');
          this.isEditingPlanSettings = false;
          await this._loadData();
          this._refreshDOM();
        } catch (err) {
          this.app.showToast('Failed to update plan: ' + err.message, 'error');
        }
      });
    }

    // 12. Rate Table Controls: Sum Insured Pills
    container.querySelectorAll('[data-coverage]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cov = Number(btn.dataset.coverage);
        if (this.currentCoverage === cov) return;

        if (this.isRateDirty) {
          if (!confirm('You have unsaved changes in the rate table. Do you want to discard them?')) return;
        }

        this.currentCoverage = cov;
        await this._loadRatesForCurrentPlan();
        this._refreshDOM();
      });
    });

    // 13. Rate Table Controls: Region Segmented Control
    container.querySelectorAll('[data-region]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reg = btn.dataset.region;
        if (this.currentRegion === reg) return;

        if (this.isRateDirty) {
          if (!confirm('You have unsaved changes in the rate table. Do you want to discard them?')) return;
        }

        this.currentRegion = reg;
        await this._loadRatesForCurrentPlan();
        this._refreshDOM();
      });
    });

    // 14. Rate Table Controls: Preset Templates
    const selectTemplate = container.querySelector('#selectPresetTemplate');
    if (selectTemplate) {
      selectTemplate.addEventListener('change', () => {
        const key = selectTemplate.value;
        if (!key || !PRESET_TEMPLATES[key]) return;

        const tmpl = PRESET_TEMPLATES[key];
        this.ageBands = tmpl.ageBands.map(a => ({ ...a }));
        this.daysSlabs = tmpl.daysSlabs.map(s => ({ ...s }));
        this.isRateDirty = true;
        this._refreshDOM();
      });
    }

    // 15. Rate Table: Add Age Band & Days Slab
    const btnAddAge = container.querySelector('#btnAddAgeBand');
    if (btnAddAge) {
      btnAddAge.addEventListener('click', () => {
        const last = this.ageBands[this.ageBands.length - 1];
        const from = last ? last.to + 1 : 0;
        const to = from + 10;
        this.ageBands.push({ from, to });
        this.isRateDirty = true;
        this._refreshDOM();
      });
    }

    const btnAddDays = container.querySelector('#btnAddDaysSlab');
    if (btnAddDays) {
      btnAddDays.addEventListener('click', () => {
        const last = this.daysSlabs[this.daysSlabs.length - 1];
        const from = last ? last.to + 1 : 1;
        const to = from + 7;
        this.daysSlabs.push({ from, to });
        this.isRateDirty = true;
        this._refreshDOM();
      });
    }

    // 16. Rate Table: Remove Age Band / Days Slab
    container.querySelectorAll('[data-del-age]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.delAge);
        if (this.ageBands.length <= 1) {
          this.app.showToast('At least one age band is required', 'warning');
          return;
        }
        this.ageBands.splice(idx, 1);
        this.isRateDirty = true;
        this._refreshDOM();
      });
    });

    container.querySelectorAll('[data-del-days]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.delDays);
        if (this.daysSlabs.length <= 1) {
          this.app.showToast('At least one days slab is required', 'warning');
          return;
        }
        this.daysSlabs.splice(idx, 1);
        this.isRateDirty = true;
        this._refreshDOM();
      });
    });

    // 17. Rate Table: Edit Cells & Range Inputs (Marks Dirty and Enables Save Changes)
    container.querySelectorAll('.pr-cell-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const row = input.dataset.row;
        const col = input.dataset.col;
        const val = input.value.trim();
        this.matrixData[`${row}_${col}`] = val;

        this.isRateDirty = true;
        input.classList.toggle('has-val', val !== '');
        this._updateSaveButtonsState();
      });
    });

    container.querySelectorAll('.pr-mini-num-input').forEach(input => {
      input.addEventListener('change', () => {
        const type = input.dataset.type;
        const field = input.dataset.field;
        const idx = Number(input.dataset.idx);
        const val = Number(input.value) || 0;

        if (type === 'age' && this.ageBands[idx]) {
          this.ageBands[idx][field] = val;
        } else if (type === 'days' && this.daysSlabs[idx]) {
          this.daysSlabs[idx][field] = val;
        }
        this.isRateDirty = true;
        this._updateSaveButtonsState();
      });
    });

    // 18. Rate Table: Cancel Button
    const btnCancelRate = container.querySelector('#btnCancelRateGrid');
    if (btnCancelRate) {
      btnCancelRate.addEventListener('click', () => {
        this.matrixData = { ...this.originalMatrixData };
        this.isRateDirty = false;
        this.app.showToast('Changes discarded', 'info');
        this._refreshDOM();
      });
    }

    // 19. Rate Table: Save Changes Button
    const btnSaveRate = container.querySelector('#btnSaveRateGrid');
    if (btnSaveRate) {
      btnSaveRate.addEventListener('click', async () => {
        await this._handleSaveRateGrid();
      });
    }

    // 20. Shortcut Dropdowns (Rate Tables Tab)
    const companySelect = container.querySelector('#shortcutCompanySelect');
    const planSelect = container.querySelector('#shortcutPlanSelect');

    if (companySelect) {
      companySelect.addEventListener('change', () => {
        const compId = companySelect.value;
        if (this.isRateDirty) {
          if (!confirm('You have unsaved changes in the rate table. Do you want to discard them?')) {
            companySelect.value = this.shortcutCompanyId || '';
            return;
          }
        }
        this.isRateDirty = false;
        this.shortcutCompanyId = compId;
        this.shortcutPlanId = '';
        this.selectedCompany = this.companies.find(c => String(c._id) === String(compId)) || null;
        this.selectedPlan = null;
        this._refreshDOM();
      });
    }

    if (planSelect) {
      planSelect.addEventListener('change', async () => {
        const planId = planSelect.value;
        if (!planId) return;

        if (this.isRateDirty) {
          if (!confirm('You have unsaved changes in the rate table. Do you want to discard them?')) {
            planSelect.value = this.shortcutPlanId || '';
            return;
          }
        }

        this.shortcutPlanId = planId;
        const plans = this._getShortcutPlansList();
        const found = plans.find(p => String(p._id) === String(planId));
        if (found) {
          this.selectedPlan = found;
          this.isEditingPlanSettings = false;
          this._initPlanSettingsDraft(found);
          await this._loadRatesForCurrentPlan();
          this._refreshDOM();
        }
      });
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  _initPlanSettingsDraft(plan) {
    this.planSettingsDraft = {
      planName: plan.planName || '',
      productLine: plan.productLine || 'Excl. USA/Canada',
      medicalCover: plan.medicalCover ? 'with' : 'without',
      isActive: plan.isActive !== false
    };
  }

  _updateSaveButtonsState() {
    const btnSave = this.container ? this.container.querySelector('#btnSaveRateGrid') : null;
    const btnCancel = this.container ? this.container.querySelector('#btnCancelRateGrid') : null;

    if (btnSave) {
      btnSave.disabled = !this.isRateDirty;
      btnSave.style.opacity = this.isRateDirty ? '1' : '0.5';
      btnSave.style.cursor = this.isRateDirty ? 'pointer' : 'not-allowed';
    }
    if (btnCancel) {
      btnCancel.disabled = !this.isRateDirty;
      btnCancel.style.opacity = this.isRateDirty ? '1' : '0.5';
      btnCancel.style.cursor = this.isRateDirty ? 'pointer' : 'not-allowed';
    }
  }

  async _handleSaveRateGrid() {
    if (!this.selectedCompany || !this.selectedPlan) return;

    const btnSave = this.container ? this.container.querySelector('#btnSaveRateGrid') : null;
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = 'Saving...';
    }

    // Build 2D matrix
    const matrix = [];
    for (let r = 0; r < this.daysSlabs.length; r++) {
      const row = [];
      for (let c = 0; c < this.ageBands.length; c++) {
        const key = `${r}_${c}`;
        const raw = this.matrixData[key];
        const num = raw !== undefined && raw !== '' ? Number(raw) : null;
        row.push(num);
      }
      matrix.push(row);
    }

    try {
      await saveRateGrid(this.selectedCompany._id, this.selectedPlan._id, {
        coverage: this.currentCoverage,
        region: this.currentRegion,
        ageBands: this.ageBands,
        daysSlabs: this.daysSlabs,
        matrix
      });

      this.app.showToast('Rate table saved to database successfully', 'success');
      this.originalMatrixData = { ...this.matrixData };
      this.isRateDirty = false;
      await this._loadData();
      this._refreshDOM();
    } catch (err) {
      this.app.showToast('Failed to save rate table: ' + err.message, 'error');
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.textContent = 'Save Changes';
      }
    }
  }

  _refreshDOM() {
    if (!this.container) return;
    this.container.innerHTML = this.render();
    this.attachEvents(this.container);
  }

  _formatRegion(productLine) {
    if (!productLine) return 'Excl. USA/Canada';
    const s = String(productLine).toLowerCase();
    if (s.includes('incl')) return 'Incl. USA/Canada';
    if (s.includes('excl')) return 'Excl. USA/Canada';
    return productLine;
  }

  _formatMedical(medicalCover) {
    if (medicalCover === true || medicalCover === 'with' || medicalCover === 'With') return 'With';
    if (medicalCover === false || medicalCover === 'without' || medicalCover === 'Without') return 'Without';
    return 'none';
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

  // ─── Modal Dialogs ─────────────────────────────────────────────────────────
  _promptInput(title, label, placeholder = '', initialValue = '') {
    return new Promise((resolve) => {
      const existing = document.getElementById('prModal');
      if (existing) existing.remove();

      const html = `
        <div class="pr-modal-backdrop" id="prModal">
          <div class="pr-modal-box">
            <div class="pr-modal-header">
              <h3 class="pr-modal-title">${this._esc(title)}</h3>
              <button type="button" class="pr-modal-close" id="btnModalClose">✕</button>
            </div>
            <div class="pr-modal-body">
              <div class="pr-form-field">
                <label class="pr-form-label">${this._esc(label)}</label>
                <input type="text" id="modalInput" class="pr-input" placeholder="${this._esc(placeholder)}" value="${this._esc(initialValue)}" autofocus />
              </div>
            </div>
            <div class="pr-modal-footer">
              <button type="button" class="btn btn-outline" id="btnModalCancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="btnModalOk">Save</button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);
      const modal = document.getElementById('prModal');
      const input = document.getElementById('modalInput');
      input.focus();
      input.select();

      const close = (val) => {
        window.removeEventListener('keydown', onKey);
        modal.remove();
        resolve(val);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') close(input.value.trim());
      };

      window.addEventListener('keydown', onKey);
      modal.querySelector('#btnModalClose').onclick = () => close(null);
      modal.querySelector('#btnModalCancel').onclick = () => close(null);
      modal.querySelector('#btnModalOk').onclick = () => close(input.value.trim());
      modal.onclick = (e) => { if (e.target === modal) close(null); };
    });
  }

  _promptPlanModal(companyName) {
    return new Promise((resolve) => {
      const existing = document.getElementById('prPlanModal');
      if (existing) existing.remove();

      const html = `
        <div class="pr-modal-backdrop" id="prPlanModal">
          <div class="pr-modal-box">
            <div class="pr-modal-header">
              <h3 class="pr-modal-title">Add Plan to ${this._esc(companyName)}</h3>
              <button type="button" class="pr-modal-close" id="btnPlanModalClose">✕</button>
            </div>
            <div class="pr-modal-body">
              <div class="pr-form-field">
                <label class="pr-form-label">Plan Name *</label>
                <input type="text" id="modalPlanName" class="pr-input" placeholder="e.g. Value Pro, Travel Prime, Executive" autofocus />
              </div>
              <div class="pr-form-field" style="margin-top: 14px;">
                <label class="pr-form-label">Region Scope</label>
                <select id="modalPlanRegion" class="pr-select">
                  <option value="Excl. USA/Canada" selected>Excl. USA/Canada</option>
                  <option value="Incl. USA/Canada">Incl. USA/Canada</option>
                  <option value="Worldwide">Worldwide</option>
                  <option value="Asia">Asia</option>
                  <option value="Schengen">Schengen</option>
                </select>
              </div>
              <div class="pr-form-field" style="margin-top: 14px;">
                <label class="pr-form-label">Medical Type</label>
                <select id="modalPlanMedical" class="pr-select">
                  <option value="without" selected>Without Medical</option>
                  <option value="with">With Medical</option>
                  <option value="none">None / Not Applicable</option>
                </select>
              </div>
            </div>
            <div class="pr-modal-footer">
              <button type="button" class="btn btn-outline" id="btnPlanModalCancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="btnPlanModalOk">Create Plan</button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);
      const modal = document.getElementById('prPlanModal');
      const input = document.getElementById('modalPlanName');
      const regSelect = document.getElementById('modalPlanRegion');
      const medSelect = document.getElementById('modalPlanMedical');
      input.focus();

      const close = (val) => {
        window.removeEventListener('keydown', onKey);
        modal.remove();
        resolve(val);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
      };

      window.addEventListener('keydown', onKey);
      modal.querySelector('#btnPlanModalClose').onclick = () => close(null);
      modal.querySelector('#btnPlanModalCancel').onclick = () => close(null);
      modal.querySelector('#btnPlanModalOk').onclick = () => {
        const name = input.value.trim();
        if (!name) {
          alert('Please enter a plan name');
          return;
        }
        close({
          planName: name,
          productLine: regSelect.value,
          region: regSelect.value,
          medicalCover: medSelect.value === 'with'
        });
      };
      modal.onclick = (e) => { if (e.target === modal) close(null); };
    });
  }
}

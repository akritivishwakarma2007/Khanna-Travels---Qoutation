/**
 * Khanna Travels — Unified Single Page: Quote Form + Comparison Results
 * Form & Results live on the same screen. Clicking Compare reveals results below the form.
 */

import { compareQuotes, saveQuote, selectPlan } from './api.js';

export const STANDARD_COVERAGES = [
  { value: 50000, label: '50k', sublabel: '$50,000' },
  { value: 100000, label: '100k', sublabel: '$100,000' },
  { value: 200000, label: '200k', sublabel: '$200,000' },
  { value: 250000, label: '250k', sublabel: '$250,000' },
  { value: 500000, label: '500k', sublabel: '$500,000' },
  { value: 750000, label: '750k', sublabel: '$750,000' },
  { value: 1000000, label: '1M', sublabel: '$1,000,000' }
];

export class QuoteView {
  constructor(app) {
    this.app = app;
    this.state = {
      // Form inputs
      customerName: '',
      dob: '',
      travellingCountry: '',
      departureCountry: 'India',
      arrivalCountry: '',
      departureDate: '',
      returnDate: '',
      region: '', // 'Excluding' | 'Including' (no pre-selection)

      // Live computed
      age: null,
      travelDays: null,

      // Results state (null until Compare is clicked)
      hasResults: false,
      savedQuote: null,
      groupedResults: {},
      coverageStats: {},
      resultsSummary: {},
      activeCoverageTab: 50000,
      sortBy: 'lowest', // 'lowest' | 'highest' | 'name'
      selectedCompanyFilter: 'all', // 'all' | companyName
      superAgeMedical: 'all', // 'all' | 'with_medical' | 'without_medical'
      superAgeDuration: 'all', // 'all' | 'less_than_30' | 'more_than_30'
      superAgeMedicalFilter: 'all',
      superAgeDurationFilter: 'all',
      selectedForCompare: new Set(),
      selectedPlans: [] // Multi-plan selection for forwarding to customer
    };
    this.currentPlanMap = new Map();
  }

  _getPlanKey(p) {
    return `${p.companyName}__${p.planName}__${p.coverage}__${p.region}`;
  }

  _isPlanSelected(p) {
    const key = this._getPlanKey(p);
    return this.state.selectedPlans.some(sp => this._getPlanKey(sp) === key);
  }

  _getSelectedPlanIndex(p) {
    const key = this._getPlanKey(p);
    return this.state.selectedPlans.findIndex(sp => this._getPlanKey(sp) === key);
  }

  // ── Render Entry: Always renders Form + (if active) Results on the Same Page ──
  render() {
    return `
      <div class="quote-single-page">
        <!-- TOP SECTION: QUOTE FORM -->
        ${this._renderQuoteFormSection()}

        <!-- BOTTOM SECTION: COMPARISON RESULTS (Revealed after clicking Compare) -->
        ${this.state.hasResults && this.state.savedQuote ? this._renderResultsSection() : ''}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. QUOTE FORM SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  _renderQuoteFormSection() {
    const {
      customerName, dob, travellingCountry,
      departureDate, returnDate, region
    } = this.state;

    const age = this._computeAge(dob, departureDate);
    const days = this._computeDays(departureDate, returnDate);
    const isSuperAge = age !== null && age > 70;

    return `
      <div class="quote-page-container" id="quoteFormContainer">
        <div class="quote-page-header">
          <h1 class="page-title">Travel Insurance Quote &amp; Comparison</h1>
          <p class="page-subtitle">Enter travel details to compare plans instantly across all insurers across every coverage tier.</p>
        </div>

        <div class="quote-form-card" id="quoteFormCard">
          <div class="quote-form-header">
            <div class="quote-form-header-icon">✈️</div>
            <div class="quote-form-header-text">
              <h2>Traveller &amp; Trip Details</h2>
              <p>Fields marked with <span style="color:#fecaca; font-weight:700;">*</span> are mandatory to drive rate matching.</p>
            </div>
          </div>

          <div class="quote-form-body">
            <form id="quoteCompareForm" novalidate>
              <div class="form-grid">

                <!-- 1. Customer Name -->
                <div class="form-group">
                  <label class="form-label" for="qCustomerName">
                    Customer Name
                  </label>
                  <input type="text" id="qCustomerName" class="form-input" placeholder="e.g. Rahul Sharma"
                         value="${this._esc(customerName)}" autocomplete="off" />
                </div>

                <!-- 2. Date of Birth (Mandatory) → Live Age -->
                <div class="form-group">
                  <label class="form-label" for="qDob">
                    Date of Birth <span class="required">*</span>
                  </label>
                  <div class="dob-row">
                    <input type="date" id="qDob" class="form-input"
                           value="${this._esc(dob)}"
                           max="${new Date().toISOString().split('T')[0]}" required />
                    <div class="age-display" title="Computed Age as of departure date">
                      <div class="age-display-num" id="liveAgeNum">${age !== null ? age : '—'}</div>
                      <div class="age-display-label">yrs</div>
                    </div>
                  </div>
                </div>

                <!-- 3. Departure Date (Mandatory) -->
                <div class="form-group">
                  <label class="form-label" for="qDepartureDate">
                    Departure Date <span class="required">*</span>
                  </label>
                  <input type="date" id="qDepartureDate" class="form-input"
                         value="${this._esc(departureDate)}" required />
                </div>

                <!-- 4. Return / Arrival Date (Mandatory) → Live Travel Days -->
                <div class="form-group">
                  <label class="form-label" for="qReturnDate">
                    Return / Arrival Date <span class="required">*</span>
                  </label>
                  <div class="dob-row">
                    <input type="date" id="qReturnDate" class="form-input"
                           value="${this._esc(returnDate)}" required />
                    <div class="age-display" title="Computed Travel Days (inclusive)">
                      <div class="age-display-num" id="liveDaysNum">${days !== null ? days : '—'}</div>
                      <div class="age-display-label">days</div>
                    </div>
                  </div>
                </div>

                <!-- 5. Travelling Country  -->
                <div class="form-group full-width">
                  <label class="form-label" for="qTravellingCountry">
                    Travelling Country
                  </label>
                  <input type="text" id="qTravellingCountry" class="form-input" placeholder="e.g. Thailand, UAE, Singapore, Europe, USA"
                         value="${this._esc(travellingCountry)}" />
                </div>

                <!-- 7. Region (Mandatory: Excluding / Including USA & Canada) -->
                <div class="form-group full-width">
                  <label class="form-label">
                    Destination Region <span class="required">*</span>
                  </label>
                  <div class="region-toggle">
                    <div class="region-option">
                      <input type="radio" name="qRegion" id="regExcluding" value="Excluding"
                             ${region === 'Excluding' ? 'checked' : ''} />
                      <label for="regExcluding">
                        <span class="region-name">🌍 Excluding USA &amp; Canada</span>
                        <span class="region-desc">Worldwide travel excluding United States &amp; Canada</span>
                      </label>
                    </div>
                    <div class="region-option">
                      <input type="radio" name="qRegion" id="regIncluding" value="Including"
                             ${region === 'Including' ? 'checked' : ''} />
                      <label for="regIncluding">
                        <span class="region-name">🗽 Including USA &amp; Canada</span>
                        <span class="region-desc">Worldwide travel including United States &amp; Canada</span>
                      </label>
                    </div>
                  </div>
                </div>

              </div><!-- /form-grid -->

              <!-- Validation Error Box -->
              <div id="formErrorBox" style="display:none; margin-top:1.25rem;">
                <div id="formErrorList" style="background:#fef2f2; border:1px solid #fecaca; border-radius:var(--radius-md); padding:0.85rem 1.25rem; font-size:0.875rem; color:#991b1b;"></div>
              </div>

              <!-- Submit Actions -->
              <div class="quote-form-actions">
                <button type="button" class="btn btn-secondary" id="btnResetQuoteForm">
                  Reset Form
                </button>
                <button type="submit" class="btn btn-primary btn-lg" id="btnSubmitCompare">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10 2a8 8 0 100 16A8 8 0 0010 2zm.75 5a.75.75 0 00-1.5 0v4.25H5a.75.75 0 000 1.5h5a.75.75 0 00.75-.75V7z" clip-rule="evenodd"/></svg>
                  Compare Quotes
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. COMPARISON RESULTS SECTION (Appears on the same page below form)
  // ═══════════════════════════════════════════════════════════════════════════
  _renderResultsSection() {
    const q = this.state.savedQuote;
    const activeCoverage = this.state.activeCoverageTab || 50000;
    const allPlansForTab = this.state.groupedResults[activeCoverage] || [];
    const statsForTab = (this.state.coverageStats && this.state.coverageStats[activeCoverage]) || {
      matchedPlansCount: allPlansForTab.length,
      unmatchedCompaniesCount: 0
    };

    const availableCompanies = this._getAvailableCompanies();
    const selectedCompanyFilter = this.state.selectedCompanyFilter || 'all';

    // Apply company filter if selected
    let filteredPlans = [...allPlansForTab];
    if (selectedCompanyFilter !== 'all') {
      filteredPlans = filteredPlans.filter(p => p.companyName === selectedCompanyFilter);
    }

    // Apply Super Age 70+ filters ONLY IF age > 70
    if (q && q.age > 70) {
      const medFilter = this.state.superAgeMedicalFilter || 'all';

      // 1. Automatically analyze travel duration from dates/days (<= 30 vs > 30 days)
      const isWithin30 = (q.travelDays || 0) <= 30;
      if (isWithin30) {
        filteredPlans = filteredPlans.filter(p => {
          const name = (p.planName || '').toLowerCase();
          return !name.includes('more than 30');
        });
      } else {
        filteredPlans = filteredPlans.filter(p => {
          const name = (p.planName || '').toLowerCase();
          return !name.includes('within 30') && !name.includes('less than 30');
        });
      }

      // 2. Medical option filter: all / with_medical / without_medical
      if (medFilter === 'with_medical') {
        filteredPlans = filteredPlans.filter(p => {
          if (p.medicalCover === true) return true;
          const name = (p.planName || '').toLowerCase();
          return name.includes('with medical') && !name.includes('without medical');
        });
      } else if (medFilter === 'without_medical') {
        filteredPlans = filteredPlans.filter(p => {
          if (p.medicalCover === false) return true;
          const name = (p.planName || '').toLowerCase();
          return name.includes('without medical');
        });
      }
    }

    // Apply sorting
    const sortedPlans = [...filteredPlans];
    if (this.state.sortBy === 'lowest') {
      sortedPlans.sort((a, b) => {
        if (a.premium !== b.premium) return a.premium - b.premium;
        return (a.companyName || '').localeCompare(b.companyName || '');
      });
    } else if (this.state.sortBy === 'highest') {
      sortedPlans.sort((a, b) => {
        if (a.premium !== b.premium) return b.premium - a.premium;
        return (a.companyName || '').localeCompare(b.companyName || '');
      });
    } else if (this.state.sortBy === 'name') {
      sortedPlans.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
    }

    const selectedCount = this.state.selectedForCompare.size;

    return `
      <div class="comparison-results-section" id="comparisonResultsSection">

        <!-- STICKY HEADER (Customer Summary Strip + Coverage Navigation) -->
        <div class="sticky-comparison-header">
          <!-- 1. SUMMARY STRIP -->
          <div class="sticky-summary-bar">
            <div class="summary-meta-left">
              <div class="quote-ref-badge" title="Saved Quote Reference">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>
                ${q.quoteReference}
              </div>
              <span class="summary-cust-name">${this._esc(q.customerName || 'Customer')}</span>
              <div class="summary-details-pills">
                <span class="summary-pill">${q.age} yrs</span>
                <span class="summary-pill">${q.travelDays} days</span>
                <span class="summary-pill">${q.departureDate} → ${q.returnDate}</span>
                <span class="summary-pill">📍 ${this._esc(q.departureCountry || 'India')} → ${this._esc(q.arrivalCountry || q.travellingCountry || 'Worldwide')}</span>
                <span class="summary-pill">${q.region === 'Including' ? 'Incl. USA/Canada' : 'Excl. USA/Canada'}</span>
                ${q.age > 70 ? `
                  <span class="summary-pill" style="background:#eff6ff; color:#1B3A6B; border:1px solid #bfdbfe; font-weight:700;">👴 Senior (70+)</span>
                  <span class="summary-pill" style="background:#fef2f2; color:#E03A3A; border:1px solid #fecaca; font-weight:700;">⚡ ${q.travelDays <= 30 ? 'Within 30 Days' : 'More Than 30 Days'}</span>
                  ${this.state.superAgeMedicalFilter !== 'all' ? `<span class="summary-pill" style="background:#eff6ff; color:#1B3A6B; border:1px solid #bfdbfe; font-weight:700;">${this.state.superAgeMedicalFilter === 'with_medical' ? '🩺 With Medical' : '📋 Without Medical'}</span>` : ''}
                ` : ''}
              </div>
            </div>
            <div class="summary-actions">
              <button class="btn-action" id="btnEditThisQuote" title="Scroll up to edit parameters">
                ✏️ Edit Details
              </button>
              <button class="btn-action btn-action-primary" id="btnNewQuote" title="Clear and start fresh quote">
                ＋ New Quote
              </button>
            </div>
          </div>

          <!-- 2. COVERAGE AMOUNT NAVIGATION (Tabs: 50k to 1M) -->
          <div class="coverage-nav-bar" id="coverageNavBar">
            <div class="coverage-nav-grid-7">
              ${STANDARD_COVERAGES.map(c => {
                const list = this.state.groupedResults[c.value] || [];
                const count = list.length;
                const isActive = c.value === activeCoverage;
                return `
                  <button class="cov-nav-btn ${isActive ? 'active' : ''}" data-coverage-tab="${c.value}" title="${c.sublabel} Coverage (${count} plan${count !== 1 ? 's' : ''})">
                    <span class="cov-nav-amount">${c.label}</span>
                    <span class="cov-nav-sublabel">${c.sublabel}</span>
                    <span class="cov-nav-badge">
                      <span class="cov-badge-count">${count}</span><span class="cov-badge-text"> plan${count !== 1 ? 's' : ''}</span>
                    </span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- 3. RESULTS TOOLBAR -->
        <div class="results-toolbar">
          <div class="results-stats-note">
            ${selectedCompanyFilter === 'all'
              ? `Showing <strong>${sortedPlans.length}</strong> matching plan${sortedPlans.length !== 1 ? 's' : ''} for <strong>$${activeCoverage.toLocaleString()}</strong> coverage`
              : `Showing <strong>${sortedPlans.length}</strong> matching plan${sortedPlans.length !== 1 ? 's' : ''} for <strong style="color:var(--navy); font-weight:800;">${this._esc(selectedCompanyFilter)}</strong> at <strong>$${activeCoverage.toLocaleString()}</strong> coverage`
            }
            ${statsForTab.unmatchedCompaniesCount > 0 ? `• <span class="unmatched-note">(${statsForTab.unmatchedCompaniesCount} insurer(s) had no matching rate)</span>` : ''}
          </div>

          <div class="results-sort-group">
            ${selectedCount >= 2 ? `
              <button class="btn btn-primary btn-sm" id="btnOpenCompareSelected">
                Compare Selected (${selectedCount})
              </button>
            ` : ''}

            <!-- COMPANY FILTER DROPDOWN -->
            <div class="company-filter-wrapper" title="Filter to view plans from a specific company only">
              <label for="filterCompanySelect" class="company-filter-label">🏢 Company:</label>
              <select class="form-select company-filter-select ${selectedCompanyFilter !== 'all' ? 'has-filter' : ''}" id="filterCompanySelect">
                <option value="all" ${selectedCompanyFilter === 'all' ? 'selected' : ''}>All Companies (${allPlansForTab.length})</option>
                ${availableCompanies.map(comp => {
                  const compCountInTab = allPlansForTab.filter(p => p.companyName === comp).length;
                  return `
                    <option value="${this._esc(comp)}" ${selectedCompanyFilter === comp ? 'selected' : ''}>
                      ${this._esc(comp)} (${compCountInTab} plan${compCountInTab !== 1 ? 's' : ''})
                    </option>
                  `;
                }).join('')}
              </select>
            </div>

            <!-- SORT DROPDOWN -->
            <select class="form-select" id="sortResultsSelect" style="padding:0.4rem 0.8rem; font-size:0.825rem; font-weight:600;">
              <option value="lowest" ${this.state.sortBy === 'lowest' ? 'selected' : ''}>Sort: Lowest Premium</option>
              <option value="highest" ${this.state.sortBy === 'highest' ? 'selected' : ''}>Sort: Highest Premium</option>
              <option value="name" ${this.state.sortBy === 'name' ? 'selected' : ''}>Sort: Company Name A-Z</option>
            </select>
          </div>
        </div>

        <!-- QUICK COMPANY SELECTOR (Select All per Company or All Companies) -->
        <div class="company-quick-select-bar" id="companyQuickSelectBar">
          ${this._renderCompanyQuickSelectBarHtml()}
        </div>

        <!-- SMALL SUPER AGE 70+ BOX (ONLY IF AGE > 70) -->
        ${this._renderSuperAgeSmallBox(q)}

        <!-- 4. RESULTS CARDS GRID -->
        ${sortedPlans.length === 0 ? `
          <div class="guided-empty-state" style="border-radius:var(--radius-lg); border:1px solid var(--gray-200); margin-bottom:2rem; padding: 2.5rem 1.5rem; text-align: center;">
            <div class="empty-state-icon" style="font-size: 2.2rem; margin-bottom: 0.5rem;">${selectedCompanyFilter !== 'all' ? '🏢' : '🔍'}</div>
            <div class="empty-state-title" style="font-size: 1.1rem; font-weight: 700; color: var(--navy);">
              ${selectedCompanyFilter !== 'all'
                ? `No plans from ${this._esc(selectedCompanyFilter)} for $${activeCoverage.toLocaleString()} coverage`
                : `No plans available for this coverage amount`
              }
            </div>
            <div class="empty-state-desc" style="max-width: 600px; margin: 0.5rem auto 1rem; color: var(--gray-500); font-size: 0.875rem;">
              ${selectedCompanyFilter !== 'all'
                ? `${this._esc(selectedCompanyFilter)} does not offer plans for ${q.age} yrs, ${q.travelDays} days under $${activeCoverage.toLocaleString()} sum insured.`
                : `None of the active insurance companies offer a plan matching this exact age (${q.age} yrs), duration (${q.travelDays} days), and region for <strong>$${activeCoverage.toLocaleString()}</strong> coverage.`
              }
            </div>
            ${selectedCompanyFilter !== 'all' ? `
              <button class="btn btn-outline btn-sm" id="btnResetCompanyFilter" style="font-weight: 700; margin-top: 0.5rem;">
                ✕ Clear Company Filter (Show All Companies)
              </button>
            ` : `
              <p style="font-size:0.85rem; color:var(--navy); font-weight:700; margin-top:0.5rem;">Click one of the other coverage tabs above to view available plans.</p>
            `}
          </div>
        ` : `
          <div class="results-grid">
            ${sortedPlans.map((plan, idx) => this._renderPlanQuoteCard(plan, idx)).join('')}
          </div>
        `}

        <!-- 5. FLOATING BOTTOM DOCK: FORWARD SELECTED PLANS TO CUSTOMER (ALWAYS MOUNTED) -->
        ${this._renderSelectedPlansDock()}

      </div>
    `;
  }

  _renderPlanQuoteCard(p, idx) {
    const planKey = this._getPlanKey(p);
    if (!this.currentPlanMap) this.currentPlanMap = new Map();
    this.currentPlanMap.set(planKey, p);

    const selIndex = this._getSelectedPlanIndex(p);
    const isSelectedPlan = selIndex !== -1;
    const isChecked = this.state.selectedForCompare.has(`${p.companyName}_${p.planName}`);

    return `
      <div class="quote-result-card ${p.isBestPrice ? 'best-price' : ''} ${isSelectedPlan ? 'is-selected-plan' : ''}">
        ${p.isBestPrice ? '<div class="best-price-badge">⭐ Best Price</div>' : ''}
        ${isSelectedPlan ? `<div class="selected-badge">✓ Selected Option #${selIndex + 1}</div>` : ''}

        <div class="qrc-top-row">
          <div>
            <div class="qrc-company-title">${this._esc(p.companyName)}</div>
            <div class="qrc-plan-subtitle">${this._esc(p.planName)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <label class="qrc-select-checkbox" title="Select this plan for customer forwarding" style="${isSelectedPlan ? 'color:#1B3A6B; font-weight:800;' : ''}">
              <input type="checkbox" data-select-plan-key="${this._esc(planKey)}" ${isSelectedPlan ? 'checked' : ''} />
              <span>Select</span>
            </label>
            <label class="qrc-select-checkbox" title="Select to compare side by side">
              <input type="checkbox" data-compare-check="${p.companyName}_${p.planName}" ${isChecked ? 'checked' : ''} />
              <span>Compare</span>
            </label>
          </div>
        </div>

        <!-- Premium Display -->
        <div class="qrc-premium-box">
          <div class="qrc-premium-val">₹${p.premium.toLocaleString('en-IN')}</div>
          <div class="qrc-premium-unit">/ traveller</div>
        </div>

        <!-- Specs breakdown -->
        <div class="qrc-specs-list">
          <div class="qrc-spec-item">
            <span class="qrc-spec-label">Coverage</span>
            <span class="qrc-spec-val">$${Number(p.coverage).toLocaleString()} USD</span>
          </div>
          <div class="qrc-spec-item">
            <span class="qrc-spec-label">Region</span>
            <span class="qrc-spec-val">${p.region === 'Including' ? 'Incl. USA/Canada' : 'Excl. USA/Canada'}</span>
          </div>
          <div class="qrc-spec-item">
            <span class="qrc-spec-label">Matched Age Band</span>
            <span class="qrc-spec-val">${p.ageFrom}–${p.ageTo} yrs</span>
          </div>
          <div class="qrc-spec-item">
            <span class="qrc-spec-label">Matched Days Slab</span>
            <span class="qrc-spec-val">${p.daysFrom}–${p.daysTo} days</span>
          </div>
        </div>

        <!-- Card Actions -->
        <div class="qrc-card-actions">
          <button class="btn-select-plan ${isSelectedPlan ? 'selected' : ''}" data-select-plan-key="${this._esc(planKey)}">
            ${isSelectedPlan ? `✓ Selected (#${selIndex + 1})` : '＋ Select Plan'}
          </button>
          <button class="btn-view-details" data-view-plan-key="${this._esc(planKey)}">
            View Details
          </button>
        </div>
      </div>
    `;
  }

  _getAllMatchingPlans() {
    const all = [];
    const seenKeys = new Set();
    const q = this.state.savedQuote;
    const medFilter = this.state.superAgeMedicalFilter || 'all';

    Object.values(this.state.groupedResults || {}).forEach(plansList => {
      if (Array.isArray(plansList)) {
        plansList.forEach(p => {
          // If Age > 70, apply duration and medical filter
          if (q && q.age > 70) {
            const isWithin30 = (q.travelDays || 0) <= 30;
            const name = (p.planName || '').toLowerCase();
            if (isWithin30 && name.includes('more than 30')) return;
            if (!isWithin30 && (name.includes('within 30') || name.includes('less than 30'))) return;

            if (medFilter === 'with_medical') {
              const hasMed = p.medicalCover === true || (name.includes('with medical') && !name.includes('without medical'));
              if (!hasMed) return;
            } else if (medFilter === 'without_medical') {
              const isWithout = p.medicalCover === false || name.includes('without medical');
              if (!isWithout) return;
            }
          }

          const key = this._getPlanKey(p);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            all.push(p);
          }
        });
      }
    });
    return all;
  }

  _getAllPlansForCompany(companyName) {
    return this._getAllMatchingPlans().filter(p => p.companyName === companyName);
  }

  _getAvailableCompanies() {
    const all = this._getAllMatchingPlans();
    return Array.from(new Set(all.map(p => p.companyName)));
  }

  _renderCompanyQuickSelectBarHtml() {
    const availableCompanies = this._getAvailableCompanies();
    if (availableCompanies.length === 0) return '';

    const allPlans = this._getAllMatchingPlans();
    const areAllSelected = allPlans.length > 0 && allPlans.every(p => this._isPlanSelected(p));

    return `
      <div class="cqs-label">
        <span>⚡ Quick Select:</span>
      </div>
      <div class="cqs-buttons">
        <button class="btn-cqs-all ${areAllSelected ? 'active' : ''}" id="btnToggleAllCompanies" title="${areAllSelected ? 'Deselect all plans & rates across all companies' : 'Select all plans & rates across all companies in 1 click'}">
          ${areAllSelected ? '✓ All Companies Selected' : '⚡ Select All Companies'}
        </button>
        ${availableCompanies.map(compName => {
          const compPlans = this._getAllPlansForCompany(compName);
          const selectedForComp = this.state.selectedPlans.filter(sp => sp.companyName === compName);
          const isAllSelected = compPlans.length > 0 && compPlans.every(p => this._isPlanSelected(p));
          const isPartSelected = selectedForComp.length > 0 && !isAllSelected;
          return `
            <button class="btn-cqs-company ${isAllSelected ? 'all-selected' : (isPartSelected ? 'part-selected' : '')}"
                    data-toggle-company="${this._esc(compName)}"
                    title="${isAllSelected ? `Deselect all ${compName} rates` : `Select all ${compName} plans & rates (${compPlans.length} rates)`}">
              ${isAllSelected ? '✓' : (isPartSelected ? '◑' : '＋')} ${this._esc(compName)} (${compPlans.length} rate${compPlans.length !== 1 ? 's' : ''})
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  // ── Small Super Age 70+ Box (Rendered ONLY IF age > 70 after Compare is clicked) ──
  _renderSuperAgeSmallBox(q) {
    if (!q || q.age <= 70) return '';

    const isWithin30 = (q.travelDays || 0) <= 30;
    const durationLabel = isWithin30 ? 'Within 30 Days (≤ 30d)' : 'More Than 30 Days (> 30d)';
    const medFilter = this.state.superAgeMedicalFilter || 'all';

    return `
      <div class="super-age-small-box" id="superAgeSmallBox">
        <div class="super-age-small-box-left">
          <span class="super-age-tag-badge">👴 Senior (70+)</span>
          <span class="super-age-analyzed-note">
            Age: <strong>${q.age} yrs</strong> • Travel: <strong>${q.travelDays} days</strong>
          </span>
          <span class="super-age-analyzed-tag" title="Auto-analyzed from travel dates / days">
            ⚡ Duration: <strong>${durationLabel}</strong>
          </span>
        </div>
        <div class="super-age-small-box-right">
          <div class="super-age-pill-group" role="group" aria-label="Medical Cover Option">
            <button type="button" class="sa-pill-btn ${medFilter === 'all' ? 'active' : ''}" data-super-medical="all" title="Show all plans (with &amp; without medical)">
              Show Both
            </button>
            <button type="button" class="sa-pill-btn ${medFilter === 'with_medical' ? 'active' : ''}" data-super-medical="with_medical" title="Filter to plans with medical cover">
              🩺 With Medical
            </button>
            <button type="button" class="sa-pill-btn ${medFilter === 'without_medical' ? 'active' : ''}" data-super-medical="without_medical" title="Filter to plans without medical cover">
              📋 Without Medical
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _buildDockCompanySummaryHtml() {
    const compCounts = new Map();
    this.state.selectedPlans.forEach(p => {
      compCounts.set(p.companyName, (compCounts.get(p.companyName) || 0) + 1);
    });

    if (compCounts.size === 0) return '';

    return Array.from(compCounts.entries()).map(([comp, count]) => `
      <span class="dock-company-badge" title="${this._esc(comp)}: ${count} rate option${count !== 1 ? 's' : ''} selected">
        🏢 ${this._esc(comp)} (${count})
      </span>
    `).join('');
  }

  _buildDockActionsHtml() {
    const plans = this.state.selectedPlans;
    const count = plans.length;
    const uniqueCompanies = Array.from(new Set(plans.map(p => p.companyName)));

    let copyButtonsHtml = '';
    if (uniqueCompanies.length === 1) {
      const comp = uniqueCompanies[0];
      copyButtonsHtml = `
        <button class="btn-dock-copy-company" data-dock-company="${this._esc(comp)}" title="Copy ${this._esc(comp)} quote image directly to clipboard">
          📸 Copy ${this._esc(comp)} Image
        </button>
      `;
    } else if (uniqueCompanies.length >= 2 && uniqueCompanies.length <= 3) {
      copyButtonsHtml = uniqueCompanies.map(comp => `
        <button class="btn-dock-copy-company" data-dock-company="${this._esc(comp)}" title="Copy only ${this._esc(comp)} quote image">
          📸 ${this._esc(comp)}
        </button>
      `).join('') + `
        <button class="btn-dock-copy-image" id="btnQuickCopyQuotationImage" style="background:#1B3A6B;" title="Copy all companies combined into a single image">
          📸 All
        </button>
      `;
    } else if (uniqueCompanies.length > 3) {
      copyButtonsHtml = `
        <button class="btn-dock-copy-image" id="btnQuickCopyQuotationImage" style="background:#1B3A6B;" title="Copy all companies combined into a single image">
          📸 Copy All Images
        </button>
      `;
    }

    return `
      <button class="btn-dock-clear" id="btnClearSelectedPlans" title="Clear all selected plans">Clear</button>
      ${copyButtonsHtml}
      <button class="btn-dock-forward" id="btnViewPrintQuotation" title="View &amp; Print Quotations / Copy Individual Images">
        🖨️ View / Print (${count})
      </button>
    `;
  }

  _renderSelectedPlansDock() {
    const plans = this.state.selectedPlans;
    const count = plans.length;

    return `
      <div class="selected-plans-dock ${count > 0 ? 'visible' : ''}" id="selectedPlansDock">
        <div class="dock-container">
          <div class="dock-left">
            <div class="dock-header">
              <span class="dock-counter" id="dockLiveCounter">${count}</span>
              <div class="dock-main-title" id="dockLiveTitle">${count} Rate Option${count !== 1 ? 's' : ''} Selected</div>
            </div>
            <div class="dock-company-summary" id="dockCompanySummary">
              ${this._buildDockCompanySummaryHtml()}
            </div>
          </div>

          <div class="dock-actions">
            ${this._buildDockActionsHtml()}
          </div>
        </div>
      </div>
    `;
  }

  // ── Events Attachment (Delegated on container with singleton guard) ────────
  attachEvents(container) {
    this.container = container;
    if (this._eventsAttached) return;
    this._eventsAttached = true;

    // Live calculations helper
    const updateLiveCalcs = () => {
      const dobVal = this.container.querySelector('#qDob')?.value || this.state.dob;
      const depVal = this.container.querySelector('#qDepartureDate')?.value || this.state.departureDate;
      const retVal = this.container.querySelector('#qReturnDate')?.value || this.state.returnDate;

      const age = this._computeAge(dobVal, depVal);
      const days = this._computeDays(depVal, retVal);

      const ageNumEl = this.container.querySelector('#liveAgeNum');
      const daysNumEl = this.container.querySelector('#liveDaysNum');

      if (ageNumEl) ageNumEl.textContent = age !== null ? age : '—';
      if (daysNumEl) daysNumEl.textContent = days !== null ? days : '—';

      this.state.dob = dobVal;
      this.state.departureDate = depVal;
      this.state.returnDate = retVal;
      this.state.age = age;
      this.state.travelDays = days;
    };

    // Input events (customer name, countries, dates)
    container.addEventListener('input', (e) => {
      if (e.target.id === 'qCustomerName') {
        this.state.customerName = e.target.value;
      } else if (e.target.id === 'qTravellingCountry' || e.target.id === 'qArrivalCountry') {
        this.state.travellingCountry = e.target.value;
        this.state.arrivalCountry = e.target.value;
      } else if (e.target.id === 'qDob' || e.target.id === 'qDepartureDate' || e.target.id === 'qReturnDate') {
        updateLiveCalcs();
      }
    });

    // Change events (dates, region radio, sort dropdown, rate checkboxes)
    container.addEventListener('change', async (e) => {
      if (e.target.id === 'qDob' || e.target.id === 'qDepartureDate' || e.target.id === 'qReturnDate') {
        updateLiveCalcs();
        return;
      }

      if (e.target.name === 'qRegion') {
        this.state.region = e.target.value;
        return;
      }

      if (e.target.id === 'filterCompanySelect') {
        this.state.selectedCompanyFilter = e.target.value;
        this._refresh();
        return;
      }

      if (e.target.id === 'sortResultsSelect') {
        this.state.sortBy = e.target.value;
        this._refresh();
        return;
      }

      // Checkbox selection on rate rows (Explicit state set prevents double-toggle)
      if (e.target.matches('input[data-select-plan-key]')) {
        const key = e.target.dataset.selectPlanKey;
        const plan = this.currentPlanMap?.get(key);
        if (plan) {
          await this._setPlanSelected(plan, e.target.checked);
        }
        return;
      }

      // Compare side-by-side checkbox
      if (e.target.matches('input[data-compare-check]')) {
        const key = e.target.dataset.compareCheck;
        if (e.target.checked) {
          if (this.state.selectedForCompare.size >= 3) {
            e.target.checked = false;
            this.app.showToast('You can compare up to 3 plans side by side', 'warning');
            return;
          }
          this.state.selectedForCompare.add(key);
        } else {
          this.state.selectedForCompare.delete(key);
        }
        this._refresh();
        return;
      }
    });

    // Form submit delegation
    container.addEventListener('submit', async (e) => {
      if (e.target.id === 'quoteCompareForm') {
        e.preventDefault();
        await this._handleCompareSubmit();
      }
    });

    // Global Click Router in Results View
    container.addEventListener('click', (e) => this._handleResultsClick(e));
  }

  // ── Results Clicks Handler ────────────────────────────────────────────────
  async _handleResultsClick(e) {
    // Super Age 70+ Medical filter pill buttons (Show Both, With Medical, Without Medical)
    const superMedBtn = e.target.closest('[data-super-medical]');
    if (superMedBtn) {
      const mode = superMedBtn.dataset.superMedical;
      this.state.superAgeMedicalFilter = mode;
      this._refresh();
      return;
    }

    // Reset Form button or New Quote
    if (e.target.closest('#btnResetQuoteForm') || e.target.closest('#btnNewQuote')) {
      this._resetForm();
      return;
    }

    // Reset Company Filter button (from empty state)
    if (e.target.closest('#btnResetCompanyFilter')) {
      this.state.selectedCompanyFilter = 'all';
      this._refresh();
      return;
    }

    // Edit Details: Smooth scroll back to form
    if (e.target.closest('#btnEditThisQuote')) {
      const formCard = this.container.querySelector('#quoteFormCard');
      if (formCard) {
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    // Coverage Navigation Tabs Click (50k, 100k, 200k, 250k, 500k, 750k, 1M)
    const tab = e.target.closest('[data-coverage-tab]');
    if (tab) {
      const selectedCov = Number(tab.dataset.coverageTab);
      if (this.state.activeCoverageTab !== selectedCov) {
        this.state.activeCoverageTab = selectedCov;
        this._refresh();
      }
      return;
    }

    // Select / Deselect Plan action button (BUTTON ONLY — NOT input checkbox!)
    const selectBtn = e.target.closest('button[data-select-plan-key]');
    if (selectBtn) {
      const key = selectBtn.dataset.selectPlanKey;
      const plan = this.currentPlanMap?.get(key);
      if (plan) {
        await this._handleTogglePlanSelection(plan);
      }
      return;
    }

    // Remove single plan from dock (✕ button on chip)
    const removeBtn = e.target.closest('[data-remove-plan-key]');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = removeBtn.dataset.removePlanKey;
      const removedPlan = this.state.selectedPlans.find(sp => this._getPlanKey(sp) === key);
      this.state.selectedPlans = this.state.selectedPlans.filter(sp => this._getPlanKey(sp) !== key);
      if (removedPlan) {
        this._updateSelectionDom(removedPlan);
      } else {
        this._updateSelectionDom({ companyName: '', planName: '', coverage: '', region: '' });
      }
      this._syncSelectedPlansWithBackend();
      return;
    }

    // Clear all selected plans in dock
    if (e.target.closest('#btnClearSelectedPlans')) {
      this.state.selectedPlans = [];
      this._clearAllSelectionDom();
      this._syncSelectedPlansWithBackend();
      return;
    }

    // Quick Company Selector: Select / Deselect All Companies in 1 click
    if (e.target.closest('#btnToggleAllCompanies')) {
      const allPlans = this._getAllMatchingPlans();
      const areAllSelected = allPlans.length > 0 && allPlans.every(p => this._isPlanSelected(p));

      if (areAllSelected) {
        this.state.selectedPlans = [];
        this.app.showToast('Cleared all selected rate plans', 'info');
      } else {
        this.state.selectedPlans = [...allPlans];
        this.app.showToast(`✓ Selected all ${allPlans.length} rates across all companies! Ready to copy images or print.`, 'success');
      }

      this._updateSelectionDom();
      this._syncSelectedPlansWithBackend();
      return;
    }

    // Quick Company Selector: Select / Deselect All Rates for a single Company
    const compToggleBtn = e.target.closest('[data-toggle-company]');
    if (compToggleBtn) {
      const compName = compToggleBtn.dataset.toggleCompany;
      const compPlans = this._getAllPlansForCompany(compName);
      const isAllSelected = compPlans.length > 0 && compPlans.every(p => this._isPlanSelected(p));

      if (isAllSelected) {
        this.state.selectedPlans = this.state.selectedPlans.filter(p => p.companyName !== compName);
        this.app.showToast(`Deselected all ${compName} rates`, 'info');
      } else {
        const existingKeys = new Set(this.state.selectedPlans.map(p => this._getPlanKey(p)));
        compPlans.forEach(p => {
          if (!existingKeys.has(this._getPlanKey(p))) {
            this.state.selectedPlans.push(p);
          }
        });
        this.app.showToast(`✓ Selected all ${compPlans.length} rates for ${compName}! Ready to copy image or print.`, 'success');
      }

      this._updateSelectionDom();
      this._syncSelectedPlansWithBackend();
      return;
    }

    // Quick Copy specific company image from dock button
    const dockCompBtn = e.target.closest('.btn-dock-copy-company');
    if (dockCompBtn) {
      const comp = dockCompBtn.dataset.dockCompany;
      await this._copySingleCompanyImage(comp);
      return;
    }

    // Quick Copy Quotation Image directly from dock (All combined)
    if (e.target.closest('#btnQuickCopyQuotationImage')) {
      await this._copyQuoteImageFromDock();
      return;
    }

    // Quick Copy Quotation
    if (e.target.closest('#btnQuickCopyQuotation')) {
      const text = this._generateCustomerQuotationText();
      try {
        await navigator.clipboard.writeText(text);
        this.app.showToast('Quotation copied to clipboard! Ready to paste.', 'success');
      } catch {
        this._showPrintPreviewModal();
      }
      return;
    }

    // Open View / Print Modal
    if (e.target.closest('#btnViewPrintQuotation') || e.target.closest('#btnOpenForwardModal')) {
      this._showPrintPreviewModal();
      return;
    }

    // View Details modal
    const viewDetailsBtn = e.target.closest('[data-view-plan-key]');
    if (viewDetailsBtn) {
      const key = viewDetailsBtn.dataset.viewPlanKey;
      const plan = this.currentPlanMap?.get(key);
      if (plan) {
        this._showPlanDetailsModal(plan);
      }
      return;
    }

    // Compare Selected modal
    if (e.target.closest('#btnOpenCompareSelected')) {
      this._showSideBySideModal();
      return;
    }
  }

  // ── Form Submit & Auto-save Logic ─────────────────────────────────────────
  async _handleCompareSubmit() {
    const {
      customerName, dob, departureCountry, arrivalCountry, travellingCountry,
      departureDate, returnDate, region
    } = this.state;

    const errors = [];
    if (!dob) errors.push('Date of Birth is mandatory.');
    if (!departureDate) errors.push('Departure Date is mandatory.');
    if (!returnDate) errors.push('Return / Arrival Date is mandatory.');
    if (!region) errors.push('Destination Region (Excluding / Including USA & Canada) is mandatory.');

    const age = this._computeAge(dob, departureDate);
    if (dob && (age === null || age < 0 || age > 120)) {
      errors.push('Age must fall within 0 to 120 years.');
    }

    const days = this._computeDays(departureDate, returnDate);
    if (departureDate && returnDate && (days === null || days <= 0)) {
      errors.push('Return Date must be on or after Departure Date.');
    } else if (days > 180) {
      errors.push('Travel duration exceeds maximum limit of 180 days.');
    }

    const errBox = this.container.querySelector('#formErrorBox');
    const errList = this.container.querySelector('#formErrorList');

    if (errors.length > 0) {
      if (errBox && errList) {
        errList.innerHTML = errors.map(e => `<div>• ${e}</div>`).join('');
        errBox.style.display = 'block';
      }
      this.app.showToast('Please fill all mandatory fields correctly before comparing', 'error');
      return;
    }

    if (errBox) errBox.style.display = 'none';

    // Call Compare API & Auto-save
    try {
      this.app.showToast('Calculating quotes across all insurers…', 'info');

      const compareRes = await compareQuotes({
        customerName: (customerName && customerName.trim()) || 'Customer',
        dob,
        departureCountry: (departureCountry && departureCountry.trim()) || 'India',
        arrivalCountry: (arrivalCountry && arrivalCountry.trim()) || travellingCountry || '',
        travellingCountry: (travellingCountry && travellingCountry.trim()) || arrivalCountry || '',
        departureDate,
        returnDate,
        region,
        medicalOption: 'all',
        durationOption: 'all'
      });

      // Auto-save to quotes collection
      const savedQuote = await saveQuote({
        customerName: (customerName && customerName.trim()) || 'Customer',
        dob,
        age: compareRes.age,
        departureCountry: (departureCountry && departureCountry.trim()) || 'India',
        arrivalCountry: (arrivalCountry && arrivalCountry.trim()) || '',
        travellingCountry: (arrivalCountry && arrivalCountry.trim()) || 'Worldwide',
        departureDate,
        returnDate,
        travelDays: compareRes.travelDays,
        coverageRequested: compareRes.defaultActiveCoverage || 50000,
        region: compareRes.region,
        medicalOption: 'all',
        durationOption: 'all',
        resultsSummary: compareRes.resultsSummary || {}
      });

      this.state.hasResults = true;
      this.state.savedQuote = savedQuote;
      this.state.groupedResults = compareRes.groupedResults || {};
      this.state.coverageStats = compareRes.coverageStats || {};
      this.state.resultsSummary = compareRes.resultsSummary || {};
      this.state.activeCoverageTab = compareRes.defaultActiveCoverage || 50000;
      this.state.superAgeMedicalFilter = 'all';
      this.state.selectedForCompare.clear();

      this.app.showToast(`Saved quote: ${savedQuote.quoteReference}`, 'success');
      this._refresh();

      // Smooth scroll down to comparison results
      setTimeout(() => {
        const resultsEl = this.container.querySelector('#comparisonResultsSection');
        if (resultsEl) {
          resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    } catch (err) {
      this.app.showToast('Failed to compare quotes: ' + err.message, 'error');
    }
  }

  async _handleTogglePlanSelection(plan) {
    const isSelected = this._isPlanSelected(plan);
    await this._setPlanSelected(plan, !isSelected);
  }

  async _setPlanSelected(plan, shouldBeSelected) {
    const key = this._getPlanKey(plan);
    const existingIdx = this.state.selectedPlans.findIndex(sp => this._getPlanKey(sp) === key);

    if (shouldBeSelected) {
      if (existingIdx === -1) {
        this.state.selectedPlans.push(plan);
      }
    } else {
      if (existingIdx !== -1) {
        this.state.selectedPlans.splice(existingIdx, 1);
      }
    }

    // Update DOM in-place with ZERO remounting or re-rendering delay
    this._updateSelectionDom(plan);

    // Sync selected plans to server silently in the background
    this._syncSelectedPlansWithBackend();
  }

  _updateSelectionDom(plan = null) {
    if (!this.container) return;

    if (plan) {
      const planKey = this._getPlanKey(plan);
      const isSelected = this._isPlanSelected(plan);
      const selIdx = this._getSelectedPlanIndex(plan);

      // 1. Update Checkboxes matching this rate plan
      const checkboxes = this.container.querySelectorAll(`input[data-select-plan-key="${planKey}"]`);
      checkboxes.forEach(cb => {
        cb.checked = isSelected;
        const label = cb.closest('label');
        if (label) {
          label.style.color = isSelected ? '#1B3A6B' : '';
          label.style.fontWeight = isSelected ? '800' : '';
        }
      });

      // 2. Update Select Buttons matching this rate plan
      const buttons = this.container.querySelectorAll(`button[data-select-plan-key="${planKey}"]`);
      buttons.forEach(btn => {
        if (isSelected) {
          btn.classList.add('selected');
          btn.textContent = `✓ Selected (#${selIdx + 1})`;
        } else {
          btn.classList.remove('selected');
          btn.textContent = '＋ Select Plan';
        }
      });
    } else {
      // Update ALL Checkboxes and Buttons across visible cards
      const allCheckboxes = this.container.querySelectorAll('input[data-select-plan-key]');
      allCheckboxes.forEach(cb => {
        const key = cb.dataset.selectPlanKey;
        const p = this.currentPlanMap?.get(key);
        const isSel = p ? this._isPlanSelected(p) : false;
        cb.checked = isSel;
        const label = cb.closest('label');
        if (label) {
          label.style.color = isSel ? '#1B3A6B' : '';
          label.style.fontWeight = isSel ? '800' : '';
        }
      });

      const allButtons = this.container.querySelectorAll('button[data-select-plan-key]');
      allButtons.forEach(btn => {
        const key = btn.dataset.selectPlanKey;
        const p = this.currentPlanMap?.get(key);
        const isSel = p ? this._isPlanSelected(p) : false;
        const selIdx = p ? this._getSelectedPlanIndex(p) : -1;
        if (isSel) {
          btn.classList.add('selected');
          btn.textContent = `✓ Selected (#${selIdx + 1})`;
        } else {
          btn.classList.remove('selected');
          btn.textContent = '＋ Select Plan';
        }
      });
    }

    // 3. Update parent Card styling & Selected Badges
    const cards = this.container.querySelectorAll('.quote-result-card');
    cards.forEach(card => {
      const selectBtn = card.querySelector('button[data-select-plan-key]');
      if (selectBtn) {
        const key = selectBtn.dataset.selectPlanKey;
        const p = this.currentPlanMap?.get(key);
        const isSel = p ? this._isPlanSelected(p) : false;
        const selIdx = p ? this._getSelectedPlanIndex(p) : -1;
        if (isSel) {
          card.classList.add('is-selected-plan');
          let badge = card.querySelector('.selected-badge');
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'selected-badge';
            card.prepend(badge);
          }
          badge.textContent = `✓ Selected Option #${selIdx + 1}`;
        } else {
          card.classList.remove('is-selected-plan');
          const badge = card.querySelector('.selected-badge');
          if (badge) badge.remove();
        }
      }
    });

    // 4. Refresh existing badge indices across all active cards on screen
    this.state.selectedPlans.forEach((sp, idx) => {
      const spKey = this._getPlanKey(sp);
      cards.forEach(c => {
        if (c.querySelector(`[data-select-plan-key="${spKey}"]`)) {
          const badge = c.querySelector('.selected-badge');
          if (badge) badge.textContent = `✓ Selected Option #${idx + 1}`;
          const btn = c.querySelector(`button[data-select-plan-key="${spKey}"]`);
          if (btn) btn.textContent = `✓ Selected (#${idx + 1})`;
        }
      });
    });

    // 5. Update Always-Mounted Bottom Dock in-place (Sleek & Non-Expanding)
    const count = this.state.selectedPlans.length;
    const dock = this.container.querySelector('#selectedPlansDock') || document.getElementById('selectedPlansDock');
    if (dock) {
      dock.classList.toggle('visible', count > 0);

      const counter = dock.querySelector('#dockLiveCounter');
      if (counter) counter.textContent = count;

      const title = dock.querySelector('#dockLiveTitle');
      if (title) title.textContent = `${count} Rate Option${count !== 1 ? 's' : ''} Selected`;

      const summary = dock.querySelector('#dockCompanySummary');
      if (summary) {
        summary.innerHTML = this._buildDockCompanySummaryHtml();
      }

      const dockActions = dock.querySelector('.dock-actions');
      if (dockActions) {
        dockActions.innerHTML = this._buildDockActionsHtml();
      }
    }

    // 6. Update Quick Company Selector Bar in-place
    const cqsBar = this.container.querySelector('#companyQuickSelectBar');
    if (cqsBar) {
      cqsBar.innerHTML = this._renderCompanyQuickSelectBarHtml();
    }
  }

  _clearAllSelectionDom() {
    this._updateSelectionDom(null);
  }

  async _syncSelectedPlansWithBackend() {
    if (!this.state.savedQuote || !this.state.savedQuote._id) return;
    try {
      const updated = await selectPlan(this.state.savedQuote._id, {
        selectedPlans: this.state.selectedPlans
      });
      this.state.savedQuote = updated;
    } catch (err) {
      console.warn('Could not sync selected plans to server:', err);
    }
  }

  _getCompaniesMap(plans = this.state.selectedPlans) {
    const companiesMap = new Map();
    for (const p of plans) {
      const companyKey = p.companyName;
      if (!companiesMap.has(companyKey)) {
        companiesMap.set(companyKey, {
          companyName: p.companyName,
          plans: new Map()
        });
      }
      const compGroup = companiesMap.get(companyKey);
      const planKey = p.planName;
      if (!compGroup.plans.has(planKey)) {
        compGroup.plans.set(planKey, {
          planName: p.planName,
          tiers: []
        });
      }
      compGroup.plans.get(planKey).tiers.push(p);
    }
    return companiesMap;
  }

  _generateCustomerQuotationText(filterCompanyName = null) {
    const q = this.state.savedQuote || {};
    const customerName = (this.container?.querySelector('#qCustomerName')?.value || q.customerName || this.state.customerName || 'Customer').trim();
    const age = q.age || this.state.age || '';
    const dob = this.container?.querySelector('#qDob')?.value || q.dob || this.state.dob || '';
    const depCountry = (this.container?.querySelector('#qDepartureCountry')?.value || q.departureCountry || this.state.departureCountry || 'India').trim();
    const arrCountry = (this.container?.querySelector('#qTravellingCountry')?.value || q.arrivalCountry || q.travellingCountry || this.state.travellingCountry || this.state.arrivalCountry || 'Worldwide').trim();
    const depDate = this.container?.querySelector('#qDepartureDate')?.value || q.departureDate || this.state.departureDate || '';
    const retDate = this.container?.querySelector('#qReturnDate')?.value || q.returnDate || this.state.returnDate || '';
    const days = q.travelDays || this.state.travelDays || '';
    const region = (q.region || this.state.region) === 'Including' ? 'Including USA & Canada' : 'Excluding USA & Canada';
    const quoteRef = q.quoteReference || `KT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-DRAFT`;

    let plans = this.state.selectedPlans;
    if (filterCompanyName) {
      plans = plans.filter(p => p.companyName === filterCompanyName);
    }

    let text = `🌟 *TRAVEL INSURANCE QUOTATION* 🌟\n`;
    text += `*Khanna Travels — Holidays Redefined*\n`;
    text += `Quote Ref: ${quoteRef}\n\n`;

    text += `👤 *Traveller Details:*\n`;
    text += `• Customer Name: ${customerName}\n`;
    if (age) text += `• Age: ${age} yrs ${dob ? `(DOB: ${dob})` : ''}\n`;
    text += `• Sector: ${depCountry} ➔ ${arrCountry}\n`;
    text += `• Duration: ${days} Days (${depDate} to ${retDate})\n`;
    text += `• Region Covered: ${region}\n\n`;

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📋 *RECOMMENDED PLAN OPTIONS${filterCompanyName ? ` (${filterCompanyName.toUpperCase()})` : ''}:*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Group text by company, with nested plans
    const companiesMap = this._getCompaniesMap(plans);

    let optIdx = 1;
    companiesMap.forEach((compGroup, companyName) => {
      text += `*Option ${optIdx++}: ${companyName}*\n`;
      compGroup.plans.forEach((plan, planName) => {
        text += `• *Plan: ${planName}*\n`;
        plan.tiers.sort((a, b) => Number(a.coverage) - Number(b.coverage)).forEach(t => {
          text += `  - Sum Insured: USD $${Number(t.coverage).toLocaleString()} ➔ Premium: ₹${t.premium.toLocaleString('en-IN')} (incl. taxes)\n`;
        });
      });
      text += `\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💡 *Why Book with Khanna Travels:*\n`;
    text += `✓ Instant Policy Issuance on WhatsApp & Email\n`;
    text += `✓ Cashless Hospitalization Network Worldwide\n`;
    text += `✓ 24/7 Global Emergency Assistance\n\n`;
    text += `📞 Reply to this message to confirm your preferred option and issue the policy!`;

    return text;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELECTION → PRINT & IMAGE FLOW
  // 1. One self-contained table block per Company
  // 2. Multiple plans from the same company rendered within the SAME table
  // 3. Independent cards so each company can be copied / downloaded as an image
  // ═══════════════════════════════════════════════════════════════════════════
  _buildSingleCompanyTableHtml(compGroup) {
    const q = this.state.savedQuote || {};
    const country = (this.container?.querySelector('#qTravellingCountry')?.value || q.travellingCountry || q.arrivalCountry || this.state.travellingCountry || 'Worldwide').trim();
    const days = q.travelDays || this.state.travelDays || '';
    const depDate = q.departureDate || this.state.departureDate || '';
    const retDate = q.returnDate || this.state.returnDate || '';

    // Build HTML for each plan under this company
    const plansHtml = Array.from(compGroup.plans.values()).map(plan => {
      // Sort tiers by coverage amount ascending
      plan.tiers.sort((a, b) => Number(a.coverage) - Number(b.coverage));

      const ratesRowsHtml = plan.tiers.map((tier, idx) => `
        <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding:7px 14px; border:1px solid #cbd5e1; font-weight:700; color:#1e293b; font-size:13px;">
            USD ${Number(tier.coverage).toLocaleString()}
          </td>
          <td style="padding:7px 14px; border:1px solid #cbd5e1; font-weight:900; font-size:13.5px; text-align:right; color:#1B3A6B;">
            ₹${Number(tier.premium).toLocaleString('en-IN')}
          </td>
        </tr>
      `).join('');

      return `
        <tr class="plan-highlight-band" style="background:#EFF6FF; border-top:2px solid #1B3A6B; border-bottom:2px solid #1B3A6B;">
          <td colspan="2" style="padding:7px 14px; border:1px solid #cbd5e1; font-weight:800; font-size:13px; text-align:center; color:#1B3A6B; letter-spacing:0.03em; text-transform:uppercase;">
            Plan: ${this._esc(plan.planName)}
          </td>
        </tr>
        <tr style="background:#1B3A6B;">
          <td colspan="2" style="padding:6px 14px; border:1px solid #cbd5e1; font-weight:800; font-size:12px; text-align:center; color:#FFFFFF;">
            Sum Insured &amp; Premium Options —
          </td>
        </tr>
        ${ratesRowsHtml}
      `;
    }).join('');

    return `
      <div class="print-quote-block" style="page-break-inside:avoid; break-inside:avoid; border:1.5px solid #1B3A6B; border-radius:6px; overflow:hidden; background:#ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <table class="print-quote-table" style="width:100%; border-collapse:collapse; font-size:13px; font-family:Arial,sans-serif;">
          <tbody>
            <tr style="background:#1B3A6B;">
              <td colspan="2" style="padding:8px 14px; border:1px solid #cbd5e1; font-weight:900; font-size:13px; text-align:center; color:#FFFFFF; letter-spacing:0.02em;">
                Travel Insurance Quote —
              </td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:6px 14px; border:1px solid #cbd5e1; font-weight:700; width:38%; color:#1e293b;">Insurance from</td>
              <td style="padding:6px 14px; border:1px solid #cbd5e1; font-weight:800; color:#1B3A6B;">${this._esc(compGroup.companyName)}</td>
            </tr>
            <tr style="background:#ffffff;">
              <td style="padding:6px 14px; border:1px solid #cbd5e1; font-weight:700; color:#1e293b;">Country</td>
              <td style="padding:6px 14px; border:1px solid #cbd5e1; color:#1e293b;">${this._esc(country)}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:6px 14px; border:1px solid #cbd5e1; font-weight:700; color:#1e293b;">No. of Days</td>
              <td style="padding:6px 14px; border:1px solid #cbd5e1; color:#1e293b;">${days} days${depDate ? ` (${depDate} to ${retDate})` : ''}</td>
            </tr>
            ${plansHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  _buildPrintQuotationBlocksHtml() {
    const companiesMap = this._getCompaniesMap(this.state.selectedPlans);

    return Array.from(companiesMap.values()).map(compGroup => {
      const slug = compGroup.companyName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      let totalTiers = 0;
      compGroup.plans.forEach(p => totalTiers += p.tiers.length);
      const tableHtml = this._buildSingleCompanyTableHtml(compGroup);

      return `
        <div class="company-quote-card" style="margin-bottom:20px; background:#ffffff; border-radius:10px; border:1.5px solid #cbd5e1; overflow:hidden; box-shadow:0 3px 12px rgba(0,0,0,0.06);">
          <!-- Company Card Header Toolbar (Non-printable) -->
          <div class="no-print" style="
            display:flex; align-items:center; justify-content:space-between;
            padding:9px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0;
            flex-wrap:wrap; gap:8px;
          ">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:1.15rem;">🏢</span>
              <span style="font-weight:800; color:#1B3A6B; font-size:14.5px;">${this._esc(compGroup.companyName)}</span>
              <span style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:800; padding:2px 8px; border-radius:12px;">
                ${totalTiers} option${totalTiers !== 1 ? 's' : ''}
              </span>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-copy-company-img" data-company-name="${this._esc(compGroup.companyName)}" data-target-id="companyQuoteBlock_${slug}" style="
                background:#1B3A6B; border:none; color:#fff;
                font-weight:800; font-size:0.82rem; padding:0.4rem 0.9rem;
                border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:0.35rem;
                box-shadow:0 2px 5px rgba(27,58,107,0.3);
              " title="Copy only ${this._esc(compGroup.companyName)} quote image to clipboard">
                📸 Copy ${this._esc(compGroup.companyName)} Image
              </button>
              <button class="btn btn-save-company-img" data-company-name="${this._esc(compGroup.companyName)}" data-target-id="companyQuoteBlock_${slug}" style="
                background:#ffffff; border:1px solid #cbd5e1; color:#334155;
                font-weight:700; font-size:0.82rem; padding:0.4rem 0.75rem;
                border-radius:6px; cursor:pointer;
              " title="Save ${this._esc(compGroup.companyName)} PNG image file">
                💾 Save PNG
              </button>
              <button class="btn btn-copy-company-text" data-company-name="${this._esc(compGroup.companyName)}" style="
                background:#1B3A6B; border:none; color:#fff;
                font-weight:700; font-size:0.82rem; padding:0.4rem 0.75rem;
                border-radius:6px; cursor:pointer;
              " title="Copy text quote for ${this._esc(compGroup.companyName)}">
                📋 Text
              </button>
            </div>
          </div>

          <!-- Isolated Image Capture & Print Target for this Company -->
          <div id="companyQuoteBlock_${slug}" class="company-quote-render-target" style="background:#ffffff; padding:14px;">
            ${tableHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  _showPrintPreviewModal() {
    if (this.state.selectedPlans.length === 0) {
      this.app.showToast('Please select at least 1 rate plan first', 'warning');
      return;
    }

    const uniqueCompanies = Array.from(new Set(this.state.selectedPlans.map(p => p.companyName)));
    const blocksHtml = this._buildPrintQuotationBlocksHtml();

    // Clean up any existing modal element
    const existing = document.getElementById('quotationPrintPreviewModal');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="quotationPrintPreviewModal" style="
        position:fixed; inset:0; z-index:1050;
        background:rgba(15,23,42,0.65); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; padding:1.25rem;
      ">
        <div id="quotationPrintPreviewCard" style="
          background:#ffffff; border-radius:12px;
          box-shadow:0 25px 65px rgba(0,0,0,0.30);
          width:100%; max-width:680px;
          display:flex; flex-direction:column;
          max-height:92vh; overflow:hidden;
        ">
          <!-- Non-printable Top Toolbar -->
          <div class="no-print" style="
            display:flex; align-items:center; justify-content:space-between;
            padding:0.9rem 1.4rem; border-bottom:1px solid #e2e8f0;
            background:#f8fafc; border-radius:12px 12px 0 0; flex-shrink:0; flex-wrap:wrap; gap:0.5rem;
          ">
            <div>
              <div style="font-size:1.05rem; font-weight:800; color:#1B3A6B; margin:0;">📋 Travel Insurance Quotation Cards</div>
              <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">
                ${this.state.selectedPlans.length} plan option${this.state.selectedPlans.length !== 1 ? 's' : ''} across ${uniqueCompanies.length} compan${uniqueCompanies.length === 1 ? 'y' : 'ies'} &bull; Ready to copy individually or combined
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <button id="btnCopyQuotationImageNow" class="btn" style="
                background:#1B3A6B; border:none; color:#fff;
                font-weight:800; font-size:0.82rem; padding:0.45rem 0.95rem;
                border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:0.4rem;
                box-shadow:0 2px 6px rgba(27,58,107,0.3);
              " title="Copy all companies combined into a single image">📸 Copy All Combined</button>
              <button id="btnDownloadQuotationImageNow" class="btn btn-secondary" style="
                background:#ffffff; border:1px solid #cbd5e1; color:#334155;
                font-weight:700; font-size:0.82rem; padding:0.45rem 0.85rem;
                border-radius:6px; cursor:pointer;
              " title="Save all companies combined as PNG image">💾 Save All</button>
              <button id="btnPrintQuotationDocNow" class="btn btn-primary" style="
                background:#E03A3A; border-color:#E03A3A; color:#fff;
                font-weight:800; font-size:0.82rem; padding:0.45rem 0.9rem;
                border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:0.4rem;
                box-shadow:0 2px 6px rgba(224,58,58,0.35);
              ">🖨️ Print All</button>
              <button id="btnCopyQuotationTextNow" class="btn btn-secondary" style="
                background:#1B3A6B; border:none; color:#fff;
                font-weight:700; font-size:0.82rem; padding:0.45rem 0.85rem;
                border-radius:6px; cursor:pointer;
              ">📋 Copy All Text</button>
              <button id="btnClosePrintPreviewModal" class="modal-close" style="
                background:none; border:none; font-size:1.35rem; cursor:pointer;
                color:#64748b; padding:2px 8px; border-radius:6px; font-weight:700;
              " title="Close Preview">✕</button>
            </div>
          </div>

          <!-- Printable / Image Document Container (Separated Company Cards) -->
          <div style="padding:1.5rem; overflow-y:auto; flex:1; background:#f1f5f9;" id="printQuotationDocWrapper">
            <div id="printQuotationDoc" style="background:transparent; max-width:600px; margin:0 auto;">
              ${blocksHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('quotationPrintPreviewModal');

    const handleEsc = (e) => {
      if (e.key === 'Escape') cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('keydown', handleEsc);
      modalEl.remove();
    };

    window.addEventListener('keydown', handleEsc);
    document.getElementById('btnClosePrintPreviewModal').addEventListener('click', cleanup);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) cleanup();
    });

    // Individual Company Action Buttons Click Delegation inside the modal
    modalEl.addEventListener('click', async (e) => {
      // 1. Copy Single Company Image
      const copyCompBtn = e.target.closest('.btn-copy-company-img');
      if (copyCompBtn) {
        const compName = copyCompBtn.dataset.companyName;
        const targetId = copyCompBtn.dataset.targetId;
        const origText = copyCompBtn.innerHTML;
        copyCompBtn.disabled = true;
        copyCompBtn.innerHTML = '⏳ Copying…';
        try {
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            const res = await this._copyQuoteImage(targetEl);
            if (res.method === 'clipboard') {
              this.app.showToast(`✓ ${compName} quote image copied to clipboard! Ready to paste into WhatsApp.`, 'success');
            } else {
              this.app.showToast(`✓ ${compName} quote image downloaded as PNG!`, 'success');
            }
          } else {
            await this._copySingleCompanyImage(compName);
          }
        } catch (err) {
          this.app.showToast(`Could not copy ${compName} image: ${err.message}`, 'error');
        } finally {
          copyCompBtn.disabled = false;
          copyCompBtn.innerHTML = origText;
        }
        return;
      }

      // 2. Save Single Company PNG
      const saveCompBtn = e.target.closest('.btn-save-company-img');
      if (saveCompBtn) {
        const compName = saveCompBtn.dataset.companyName;
        const targetId = saveCompBtn.dataset.targetId;
        const origText = saveCompBtn.innerHTML;
        saveCompBtn.disabled = true;
        saveCompBtn.innerHTML = '⏳ Saving…';
        try {
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            const canvas = await this._generateQuoteCanvas(targetEl);
            canvas.toBlob((blob) => {
              if (!blob) throw new Error('Failed to create PNG blob');
              const cleanName = compName.replace(/[^a-zA-Z0-9]/g, '-');
              this._triggerDownloadBlob(blob, `Khanna-Travels-Quote-${cleanName}.png`);
              this.app.showToast(`✓ ${compName} quote image downloaded!`, 'success');
            }, 'image/png');
          } else {
            await this._saveSingleCompanyImage(compName);
          }
        } catch (err) {
          this.app.showToast(`Could not save ${compName} image: ${err.message}`, 'error');
        } finally {
          saveCompBtn.disabled = false;
          saveCompBtn.innerHTML = origText;
        }
        return;
      }

      // 3. Copy Single Company Text
      const textCompBtn = e.target.closest('.btn-copy-company-text');
      if (textCompBtn) {
        const compName = textCompBtn.dataset.companyName;
        await this._copySingleCompanyText(compName);
        return;
      }
    });

    // Copy All Combined Quote Image button
    document.getElementById('btnCopyQuotationImageNow').addEventListener('click', async () => {
      const btn = document.getElementById('btnCopyQuotationImageNow');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ Copying…';
      try {
        const target = document.getElementById('printQuotationDoc');
        const res = await this._copyQuoteImage(target);
        if (res.method === 'clipboard') {
          this.app.showToast('✓ All combined quote images copied to clipboard! Paste (Ctrl+V) directly into WhatsApp or Email.', 'success');
        } else {
          this.app.showToast('✓ Combined quote images downloaded as PNG!', 'success');
        }
      } catch (err) {
        this.app.showToast('Could not copy images: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });

    // Save All Combined Quote Images button
    document.getElementById('btnDownloadQuotationImageNow').addEventListener('click', async () => {
      const btn = document.getElementById('btnDownloadQuotationImageNow');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ Saving…';
      try {
        const target = document.getElementById('printQuotationDoc');
        const canvas = await this._generateQuoteCanvas(target);
        canvas.toBlob((blob) => {
          if (!blob) throw new Error('Failed to create PNG blob');
          this._triggerDownloadBlob(blob, `Khanna-Travels-Quotes-Combined.png`);
          this.app.showToast('✓ Combined quote images downloaded as PNG!', 'success');
        }, 'image/png');
      } catch (err) {
        this.app.showToast('Could not save images: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });

    // Copy All Text button
    document.getElementById('btnCopyQuotationTextNow').addEventListener('click', async () => {
      const text = this._generateCustomerQuotationText();
      try {
        await navigator.clipboard.writeText(text);
        this.app.showToast('✓ Complete quotation text copied to clipboard!', 'success');
      } catch {
        this.app.showToast('Please copy text manually', 'warning');
      }
    });

    // Print button
    document.getElementById('btnPrintQuotationDocNow').addEventListener('click', () => {
      window.print();
    });
  }

  // ── Image Export Helpers ──────────────────────────────────────────────────
  async _loadHtml2Canvas() {
    if (window.html2canvas) return window.html2canvas;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = () => resolve(window.html2canvas);
      script.onerror = () => reject(new Error('Could not load html2canvas library.'));
      document.head.appendChild(script);
    });
  }

  async _generateQuoteCanvas(targetEl) {
    await this._loadHtml2Canvas();
    return await window.html2canvas(targetEl, {
      scale: 2, // 2x crisp retina clarity
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      scrollY: 0,
      scrollX: 0
    });
  }

  async _copyQuoteImage(targetEl) {
    const canvas = await this._generateQuoteCanvas(targetEl);
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('Failed to create image blob'));
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            resolve({ method: 'clipboard' });
          } else {
            this._triggerDownloadBlob(blob);
            resolve({ method: 'download' });
          }
        } catch (err) {
          this._triggerDownloadBlob(blob);
          resolve({ method: 'download' });
        }
      }, 'image/png');
    });
  }

  async _copySingleCompanyImage(companyName) {
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const existingTarget = document.getElementById(`companyQuoteBlock_${slug}`);

    let targetEl = existingTarget;
    let tempEl = null;

    if (!targetEl) {
      // Build an offscreen element for this company
      const companiesMap = this._getCompaniesMap(this.state.selectedPlans);
      const compGroup = companiesMap.get(companyName);
      if (!compGroup) {
        this.app.showToast(`No selected plans found for ${companyName}`, 'warning');
        return;
      }
      tempEl = document.createElement('div');
      tempEl.style.position = 'fixed';
      tempEl.style.left = '-9999px';
      tempEl.style.top = '0';
      tempEl.style.width = '580px';
      tempEl.style.background = '#ffffff';
      tempEl.style.padding = '14px';
      tempEl.style.borderRadius = '8px';
      tempEl.style.zIndex = '-1';
      tempEl.innerHTML = this._buildSingleCompanyTableHtml(compGroup);
      document.body.appendChild(tempEl);
      targetEl = tempEl;
    }

    try {
      this.app.showToast(`Generating ${companyName} quote image…`, 'info');
      const res = await this._copyQuoteImage(targetEl);
      if (res.method === 'clipboard') {
        this.app.showToast(`✓ ${companyName} quote image copied to clipboard! Paste (Ctrl+V) directly into WhatsApp or Email.`, 'success');
      } else {
        this.app.showToast(`✓ ${companyName} quote image downloaded as PNG!`, 'success');
      }
    } catch (err) {
      this.app.showToast(`Could not copy image for ${companyName}: ${err.message}`, 'error');
    } finally {
      if (tempEl) tempEl.remove();
    }
  }

  async _saveSingleCompanyImage(companyName) {
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const existingTarget = document.getElementById(`companyQuoteBlock_${slug}`);

    let targetEl = existingTarget;
    let tempEl = null;

    if (!targetEl) {
      const companiesMap = this._getCompaniesMap(this.state.selectedPlans);
      const compGroup = companiesMap.get(companyName);
      if (!compGroup) {
        this.app.showToast(`No selected plans found for ${companyName}`, 'warning');
        return;
      }
      tempEl = document.createElement('div');
      tempEl.style.position = 'fixed';
      tempEl.style.left = '-9999px';
      tempEl.style.top = '0';
      tempEl.style.width = '580px';
      tempEl.style.background = '#ffffff';
      tempEl.style.padding = '14px';
      tempEl.style.borderRadius = '8px';
      tempEl.style.zIndex = '-1';
      tempEl.innerHTML = this._buildSingleCompanyTableHtml(compGroup);
      document.body.appendChild(tempEl);
      targetEl = tempEl;
    }

    try {
      this.app.showToast(`Saving ${companyName} quote image…`, 'info');
      const canvas = await this._generateQuoteCanvas(targetEl);
      canvas.toBlob((blob) => {
        if (!blob) throw new Error('Failed to create PNG blob');
        const cleanName = companyName.replace(/[^a-zA-Z0-9]/g, '-');
        this._triggerDownloadBlob(blob, `Khanna-Travels-Quote-${cleanName}.png`);
        this.app.showToast(`✓ ${companyName} quote image downloaded!`, 'success');
      }, 'image/png');
    } catch (err) {
      this.app.showToast(`Could not save image: ${err.message}`, 'error');
    } finally {
      if (tempEl) tempEl.remove();
    }
  }

  async _copySingleCompanyText(companyName) {
    const text = this._generateCustomerQuotationText(companyName);
    try {
      await navigator.clipboard.writeText(text);
      this.app.showToast(`✓ ${companyName} quote text copied to clipboard!`, 'success');
    } catch {
      this.app.showToast('Please copy text manually', 'warning');
    }
  }

  async _copyQuoteImageFromDock() {
    if (this.state.selectedPlans.length === 0) {
      this.app.showToast('Please select at least 1 rate plan first', 'warning');
      return;
    }

    this.app.showToast('Generating quote image for clipboard…', 'info');

    // Create an off-screen render container
    const tempEl = document.createElement('div');
    tempEl.style.position = 'fixed';
    tempEl.style.left = '-9999px';
    tempEl.style.top = '0';
    tempEl.style.width = '580px';
    tempEl.style.background = '#ffffff';
    tempEl.style.padding = '16px';
    tempEl.style.borderRadius = '8px';
    tempEl.style.boxShadow = 'none';
    tempEl.style.zIndex = '-1';
    tempEl.innerHTML = this._buildPrintQuotationBlocksHtml();
    document.body.appendChild(tempEl);

    try {
      const res = await this._copyQuoteImage(tempEl);
      if (res.method === 'clipboard') {
        this.app.showToast('✓ Quote images copied to clipboard! Paste (Ctrl+V) directly into WhatsApp or Email.', 'success');
      } else {
        this.app.showToast('✓ Quote images downloaded as PNG!', 'success');
      }
    } catch (err) {
      this.app.showToast('Failed to copy image: ' + err.message, 'error');
    } finally {
      tempEl.remove();
    }
  }

  _triggerDownloadBlob(blob, filename = null) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `Khanna-Travels-Quote-${this.state.savedQuote?.quoteReference || 'quote'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  _showForwardModal() {
    this._showPrintPreviewModal();
  }

  _showPlanDetailsModal(p) {
    const existing = document.getElementById('planDetailsModal');
    if (existing) existing.remove();

    const modalHtml = `
      <div class="modal-backdrop" id="planDetailsModal">
        <div class="modal-card">
          <div class="modal-header">
            <h2 class="modal-title">${this._esc(p.companyName)} — ${this._esc(p.planName)}</h2>
            <button class="modal-close" id="btnCloseDetailsModal" title="Close">✕</button>
          </div>
          <div class="modal-body">
            <div style="background:#f8fafc; padding:1.25rem; border-radius:var(--radius-md); margin-bottom:1.25rem; border:1px solid var(--gray-200);">
              <div style="font-size:0.75rem; font-weight:700; color:var(--gray-500); text-transform:uppercase;">Calculated Premium</div>
              <div style="font-size:1.75rem; font-weight:900; color:var(--navy);">₹${p.premium.toLocaleString('en-IN')} <span style="font-size:0.8rem; font-weight:600; color:var(--gray-500);">/ traveller</span></div>
            </div>

            <div style="display:flex; flex-direction:column; gap:0.6rem; font-size:0.875rem;">
              <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--gray-100); padding-bottom:0.4rem;">
                <span style="color:var(--gray-500);">Coverage Limit:</span>
                <strong>$${Number(p.coverage).toLocaleString()}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--gray-100); padding-bottom:0.4rem;">
                <span style="color:var(--gray-500);">Destination Region:</span>
                <strong>${p.region === 'Including' ? 'Including USA & Canada' : 'Excluding USA & Canada'}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--gray-100); padding-bottom:0.4rem;">
                <span style="color:var(--gray-500);">Matched Age Range:</span>
                <strong>${p.ageFrom} to ${p.ageTo} years</strong>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--gray-500);">Matched Duration Slab:</span>
                <strong>${p.daysFrom} to ${p.daysTo} days</strong>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCloseDetailsModal2">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('planDetailsModal');

    const handleEsc = (e) => {
      if (e.key === 'Escape') cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('keydown', handleEsc);
      modalEl.remove();
    };

    window.addEventListener('keydown', handleEsc);
    modalEl.querySelector('#btnCloseDetailsModal').addEventListener('click', cleanup);
    modalEl.querySelector('#btnCloseDetailsModal2').addEventListener('click', cleanup);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) cleanup();
    });
  }

  _showSideBySideModal() {
    const activeCov = this.state.activeCoverageTab;
    const allPlans = this.state.groupedResults[activeCov] || [];
    const selectedPlans = allPlans.filter(p => this.state.selectedForCompare.has(`${p.companyName}_${p.planName}`));

    if (selectedPlans.length < 2) return;

    const existing = document.getElementById('sideBySideModal');
    if (existing) existing.remove();

    const modalHtml = `
      <div class="modal-backdrop" id="sideBySideModal">
        <div class="modal-card modal-large">
          <div class="modal-header">
            <h2 class="modal-title">⚖️ Compare Selected Plans Side-by-Side</h2>
            <button class="modal-close" id="btnCloseCompareModal" title="Close">✕</button>
          </div>
          <div class="modal-body" style="overflow-x:auto;">
            <table class="compare-modal-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  ${selectedPlans.map(p => `
                    <th class="${p.isBestPrice ? 'highlight-col' : ''}">
                      ${this._esc(p.companyName)}<br>
                      <small style="color:var(--gray-500);">${this._esc(p.planName)}</small>
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Premium (INR)</strong></td>
                  ${selectedPlans.map(p => `
                    <td class="premium-row-cell ${p.isBestPrice ? 'best-price-cell' : ''}">
                      ₹${p.premium.toLocaleString('en-IN')}
                      ${p.isBestPrice ? '<div style="font-size:0.7rem; color:var(--red); font-weight:800;">⭐ BEST PRICE</div>' : ''}
                    </td>
                  `).join('')}
                </tr>
                <tr>
                  <td>Coverage Amount</td>
                  ${selectedPlans.map(p => `<td>$${Number(p.coverage).toLocaleString()}</td>`).join('')}
                </tr>
                <tr>
                  <td>Region</td>
                  ${selectedPlans.map(p => `<td>${p.region === 'Including' ? 'Incl. USA/Canada' : 'Excl. USA/Canada'}</td>`).join('')}
                </tr>
                <tr>
                  <td>Matched Age Band</td>
                  ${selectedPlans.map(p => `<td>${p.ageFrom}–${p.ageTo} yrs</td>`).join('')}
                </tr>
                <tr>
                  <td>Matched Duration Slab</td>
                  ${selectedPlans.map(p => `<td>${p.daysFrom}–${p.daysTo} days</td>`).join('')}
                </tr>
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCloseCompareModal2">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('sideBySideModal');

    const handleEsc = (e) => {
      if (e.key === 'Escape') cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('keydown', handleEsc);
      modalEl.remove();
    };

    window.addEventListener('keydown', handleEsc);
    modalEl.querySelector('#btnCloseCompareModal').addEventListener('click', cleanup);
    modalEl.querySelector('#btnCloseCompareModal2').addEventListener('click', cleanup);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) cleanup();
    });
  }

  _resetForm() {
    this.state = {
      customerName: '',
      dob: '',
      travellingCountry: '',
      departureCountry: 'India',
      arrivalCountry: '',
      departureDate: '',
      returnDate: '',
      region: '',
      age: null,
      travelDays: null,
      hasResults: false,
      savedQuote: null,
      groupedResults: {},
      coverageStats: {},
      resultsSummary: {},
      activeCoverageTab: 50000,
      sortBy: 'lowest',
      selectedCompanyFilter: 'all',
      superAgeMedical: 'all',
      superAgeDuration: 'all',
      superAgeMedicalFilter: 'all',
      superAgeDurationFilter: 'all',
      selectedForCompare: new Set(),
      selectedPlans: []
    };
    this.currentPlanMap = new Map();
    this._refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Helper Math Functions ─────────────────────────────────────────────────
  _computeAge(dob, asOfDate) {
    if (!dob || !asOfDate) return null;
    const b = new Date(dob);
    const d = new Date(asOfDate);
    if (isNaN(b) || isNaN(d)) return null;
    let age = d.getFullYear() - b.getFullYear();
    const m = d.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
    return age < 0 ? null : age;
  }

  _computeDays(dep, ret) {
    if (!dep || !ret) return null;
    const d = new Date(dep), r = new Date(ret);
    if (isNaN(d) || isNaN(r) || r < d) return null;
    return Math.floor((r - d) / (1000 * 60 * 60 * 24)) + 1;
  }

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _refresh() {
    if (!this.container) return;
    const scrollY = window.scrollY;
    this.container.innerHTML = this.render();
    this.attachEvents(this.container);
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  }
}

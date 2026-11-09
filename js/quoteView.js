/**
 * Khanna Travels — Unified Single Page: Quote Form + Comparison Results
 * Form & Results live on the same screen. Clicking Compare reveals results below the form.
 */

import { compareQuotes, saveQuote, selectPlan } from './api.js';
import { QuotationExporter } from './pdf-export.js';

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
      selectedCompanies: null, // null (defaults to all) | Set of company names
      isCompanyDropdownOpen: false,
      superAgeMedical: 'all', // 'all' | 'with_medical' | 'without_medical'
      superAgeDuration: 'all', // 'all' | 'less_than_30' | 'more_than_30'
      superAgeMedicalFilter: 'all',
      superAgeDurationFilter: 'all',
      selectedForCompare: new Set(),
      selectedPlans: [], // Multi-plan selection for forwarding to customer
      // Step 3: Issue details state (Public & Admin)
      showIssueDetails: false,
      issuePreviewMode: 'formatted', // 'formatted' | 'raw'
      issuePlan: null,
      issueForm: {
        country: '',
        travelDate: '',
        sumInsured: '',
        planName: '',
        issueFor: '',
        nominee: '',
        travellers: [''],
        phone: '8657461001',
        email: 'customercare@khannatravels.com',
        format: 'format2',
        groupSuffix: '',
        customSubject: null,
        hideEmptyLines: false,
        includeGreetingSignature: false,
        customPreviewText: null
      }
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

  _getSelectedCompaniesSet(availableCompanies = this._getAvailableCompanies()) {
    if (!this.state.selectedCompanies || this.state.selectedCompanies === 'all') {
      return new Set(availableCompanies);
    }
    if (this.state.selectedCompanies instanceof Set) return this.state.selectedCompanies;
    if (Array.isArray(this.state.selectedCompanies)) return new Set(this.state.selectedCompanies);
    return new Set([this.state.selectedCompanies]);
  }

  _formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = parseInt(parts[2], 10);
        const month = months[parseInt(parts[1], 10) - 1];
        const year = parts[0];
        if (day && month && year) {
          return `${day} ${month} ${year}`;
        }
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  // ── Render Entry: Always renders Form + (if active) Results on the Same Page ──
  render() {
    return `
      <div class="quote-single-page ${this.state.hasResults ? 'has-results' : ''}">
        <!-- TOP SECTION: QUOTE FORM -->
        ${this._renderQuoteFormSection()}

        <!-- BOTTOM SECTION: COMPARISON RESULTS (Revealed after clicking Compare) -->
        ${this.state.hasResults && this.state.savedQuote ? this._renderResultsSection() : ''}

        <!-- STEP 3: ISSUE DETAILS (Public & Admin, revealed after Select Plan) -->
        <div id="step3Mount">
          ${this._shouldRenderIssueStep() ? this._renderIssueStepSection() : ''}
        </div>
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
          <h1 class="page-title">Travel Insurance Quotation &amp; Comparison</h1>
          <p class="page-subtitle">Enter travel details to compare plans instantly across all insurers across every coverage tier.</p>
        </div>

        <div class="step-header">
          <div class="step-num">1</div>
          <h2 class="step-title">Enter trip details</h2>
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
    const selectedCompaniesSet = this._getSelectedCompaniesSet(availableCompanies);
    const allSelected = availableCompanies.length > 0 && selectedCompaniesSet.size === availableCompanies.length;

    // Apply company filter if selected
    let filteredPlans = [...allPlansForTab];
    if (selectedCompaniesSet.size < availableCompanies.length) {
      filteredPlans = filteredPlans.filter(p => selectedCompaniesSet.has(p.companyName));
    }

    // Apply Super Age 70+ duration filter (<= 30 vs > 30 days)
    if (q && q.age > 70) {
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
    }

    // Apply Medical filter: all / with_medical / without_medical
    const medFilter = this.state.superAgeMedicalFilter || 'all';
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

    // Lowest premium in the sorted set
    const minPremium = sortedPlans.length > 0 ? Math.min(...sortedPlans.map(p => p.premium)) : null;

    // Quick select all status
    const allPlans = this._getAllMatchingPlans();
    const areAllSelected = allPlans.length > 0 && allPlans.every(p => this._isPlanSelected(p));

    // Dynamic button label for company dropdown
    let companyBtnLabel = `Company: All (${availableCompanies.length})`;
    if (selectedCompaniesSet.size === 0) {
      companyBtnLabel = 'Company: None (0)';
    } else if (selectedCompaniesSet.size === 1) {
      const singleComp = Array.from(selectedCompaniesSet)[0];
      const singleCount = allPlansForTab.filter(p => p.companyName === singleComp).length;
      companyBtnLabel = `Company: ${singleComp} (${singleCount})`;
    } else if (selectedCompaniesSet.size < availableCompanies.length) {
      companyBtnLabel = `Company: ${selectedCompaniesSet.size} Selected`;
    }

    return `
      <div class="comparison-results-section" id="comparisonResultsSection">

        <!-- 3. SUM INSURED SELECTOR -->
        <div class="sum-insured-section">
          <div class="sum-insured-label">SUM INSURED</div>
          <div class="sum-insured-row" role="tablist" aria-label="Coverage Amounts">
            ${STANDARD_COVERAGES.map(c => {
              const list = this.state.groupedResults[c.value] || [];
              const count = list.length;
              const isActive = c.value === activeCoverage;
              const isZero = count === 0;
              return `
                <button type="button"
                        class="si-pill ${isActive ? 'active' : ''} ${isZero ? 'zero-plans' : ''}"
                        data-coverage-tab="${c.value}"
                        role="tab"
                        aria-selected="${isActive ? 'true' : 'false'}"
                        title="${c.sublabel} Coverage (${count} plan${count !== 1 ? 's' : ''})">
                  <span class="si-pill-amount">${c.label}</span>
                  <span class="si-pill-count">${count} plan${count !== 1 ? 's' : ''}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 4. FILTER TOOLBAR -->
        <div class="filter-card fc-toolbar-card">
          <!-- Company Dropdown (Multi-select) -->
          <div class="fc-dropdown-wrap fc-company-dropdown-wrap ${this.state.isCompanyDropdownOpen ? 'open' : ''}" id="companyDropdownWrap">
            <button type="button" class="fc-compact-dropdown-btn" id="btnCompanyDropdown" aria-haspopup="true" aria-expanded="${this.state.isCompanyDropdownOpen ? 'true' : 'false'}">
              <span>${this._esc(companyBtnLabel)}</span>
              <svg class="fc-dropdown-arrow" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
            <div class="fc-dropdown-popover" id="companyDropdownPopover">
              <label class="fc-popover-item fc-popover-all">
                <input type="checkbox" id="chkCompanySelectAll" ${allSelected ? 'checked' : ''} />
                <span class="fc-popover-item-text">Select all</span>
                <span class="fc-popover-item-count">(${availableCompanies.length})</span>
              </label>
              <div class="fc-popover-divider"></div>
              <div class="fc-popover-list">
                ${availableCompanies.map(comp => {
                  const compCountInTab = allPlansForTab.filter(p => p.companyName === comp).length;
                  const isChecked = selectedCompaniesSet.has(comp);
                  return `
                    <label class="fc-popover-item">
                      <input type="checkbox" class="chk-company-filter-item" data-company-name="${this._esc(comp)}" ${isChecked ? 'checked' : ''} />
                      <span class="fc-popover-item-text">${this._esc(comp)}</span>
                      <span class="fc-popover-item-count">(${compCountInTab} rate${compCountInTab !== 1 ? 's' : ''})</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Sort Dropdown -->
          <div class="fc-dropdown-wrap">
            <div class="fc-compact-select-box">
              <select class="fc-compact-select" id="sortResultsSelect" aria-label="Sort plans">
                <option value="lowest" ${this.state.sortBy === 'lowest' ? 'selected' : ''}>Sort: Lowest Premium</option>
                <option value="highest" ${this.state.sortBy === 'highest' ? 'selected' : ''}>Sort: Highest Premium</option>
                <option value="name" ${this.state.sortBy === 'name' ? 'selected' : ''}>Sort: Company Name A-Z</option>
              </select>
              <svg class="fc-dropdown-arrow" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </div>
          </div>

          <!-- Medical Segmented Control -->
          <div class="fc-compact-toggle" role="group" aria-label="Medical Cover Option">
            <button type="button" class="fc-toggle-btn ${medFilter === 'all' ? 'active' : ''}" data-super-medical="all">
              Both
            </button>
            <button type="button" class="fc-toggle-btn ${medFilter === 'with_medical' ? 'active' : ''}" data-super-medical="with_medical">
              With Medical
            </button>
            <button type="button" class="fc-toggle-btn ${medFilter === 'without_medical' ? 'active' : ''}" data-super-medical="without_medical">
              Without Medical
            </button>
          </div>

          <!-- Vertical Divider -->
          <div class="fc-toolbar-divider"></div>

          <!-- Quick Company Selection Pills (Small Bars) -->
          <div class="fc-company-pills-wrap" id="fcCompanyPillsWrap">
            <span class="fc-pills-label">Select:</span>
            ${this._renderCompactCompanyPillsHtml()}
          </div>
        </div>

        <!-- 5. RESULT SUMMARY LINE -->
        <div class="result-summary-block">
          <div class="rs-header-row">
            <div class="rs-title">${sortedPlans.length} plan${sortedPlans.length !== 1 ? 's' : ''} for $${activeCoverage.toLocaleString()} coverage</div>
            ${selectedCount >= 2 ? `
              <button type="button" class="btn btn-primary btn-sm" id="btnOpenCompareSelected">
                Compare Selected (${selectedCount})
              </button>
            ` : ''}
          </div>
          ${statsForTab.unmatchedCompaniesCount > 0 ? `
            <div class="rs-unmatched">${statsForTab.unmatchedCompaniesCount} insurer${statsForTab.unmatchedCompaniesCount !== 1 ? 's' : ''} had no matching rate for this trip.</div>
          ` : ''}
        </div>

        <!-- 6. PLAN CARDS GRID -->
        ${sortedPlans.length === 0 ? `
          <div class="guided-empty-state" style="background:#fff; border-radius:16px; border:1px solid var(--line); margin-bottom:2rem; padding: 2.5rem 1.5rem; text-align: center;">
            <div class="empty-state-icon" style="font-size: 2.2rem; margin-bottom: 0.5rem;">${selectedCompaniesSet.size < availableCompanies.length ? '🏢' : '🔍'}</div>
            <div class="empty-state-title" style="font-size: 1.1rem; font-weight: 700; color: var(--navy);">
              ${selectedCompaniesSet.size === 0
                ? 'No companies selected'
                : selectedCompaniesSet.size < availableCompanies.length
                  ? `No plans from selected companies for $${activeCoverage.toLocaleString()} coverage`
                  : `No plans available for this coverage amount`
              }
            </div>
            <div class="empty-state-desc" style="max-width: 600px; margin: 0.5rem auto 1rem; color: var(--muted); font-size: 0.875rem;">
              ${selectedCompaniesSet.size === 0
                ? 'Please select at least one insurance company from the Company dropdown to view plans.'
                : selectedCompaniesSet.size < availableCompanies.length
                  ? `The selected insurers do not offer plans for ${q.age} yrs, ${q.travelDays} days under $${activeCoverage.toLocaleString()} sum insured.`
                  : `None of the active insurance companies offer a plan matching this exact age (${q.age} yrs), duration (${q.travelDays} days), and region for <strong>$${activeCoverage.toLocaleString()}</strong> coverage.`
              }
            </div>
            ${selectedCompaniesSet.size < availableCompanies.length ? `
              <button type="button" class="btn btn-outline btn-sm" id="btnResetCompanyFilter" style="font-weight: 700; margin-top: 0.5rem;">
                ✕ Clear Company Filter (Show All Companies)
              </button>
            ` : `
              <p style="font-size:0.85rem; color:var(--navy); font-weight:700; margin-top:0.5rem;">Click one of the other coverage tabs above to view available plans.</p>
            `}
          </div>
        ` : `
          <div class="results-grid">
            ${sortedPlans.map((plan, idx) => this._renderPlanQuoteCard(plan, idx, minPremium)).join('')}
          </div>
        `}

        <!-- FLOATING BOTTOM DOCK: FORWARD SELECTED PLANS TO CUSTOMER -->
        ${this._renderSelectedPlansDock()}

      </div>
    `;
  }

  _renderPlanQuoteCard(p, idx, minPremium = null) {
    const planKey = this._getPlanKey(p);
    if (!this.currentPlanMap) this.currentPlanMap = new Map();
    this.currentPlanMap.set(planKey, p);

    const selIndex = this._getSelectedPlanIndex(p);
    const isSelectedPlan = selIndex !== -1;
    const isChecked = this.state.selectedForCompare.has(`${p.companyName}_${p.planName}`);
    const isBestPrice = minPremium !== null ? p.premium === minPremium : Boolean(p.isBestPrice);

    // Determine medical tag
    const planNameLower = (p.planName || '').toLowerCase();
    let medTagHtml = '';
    if (p.medicalCover === true || (planNameLower.includes('with medical') && !planNameLower.includes('without medical'))) {
      medTagHtml = '<span class="qrc-med-tag med-with">With Medical</span>';
    } else if (p.medicalCover === false || planNameLower.includes('without medical')) {
      medTagHtml = '<span class="qrc-med-tag med-without">Without Medical</span>';
    } else {
      medTagHtml = '<span class="qrc-med-tag med-standard">Standard</span>';
    }

    return `
      <div class="quote-result-card ${isBestPrice ? 'best-price' : ''} ${isSelectedPlan ? 'is-selected-plan' : ''}">
        ${isBestPrice ? `
          <div class="qrc-best-price-strip">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <span>✓ BEST PRICE • LOWEST PREMIUM</span>
          </div>
        ` : ''}

        <div class="qrc-card-inner">
          <!-- Header Row -->
          <div class="qrc-header-row">
            <div class="qrc-header-left">
              <div class="qrc-rank">#${idx + 1}</div>
              <div class="qrc-company-name">${this._esc(p.companyName)}</div>
              <div class="qrc-plan-title">${this._esc(p.planName)}</div>
            </div>
            <label class="qrc-compare-label">
              <input type="checkbox" data-compare-check="${p.companyName}_${p.planName}" ${isChecked ? 'checked' : ''} class="qrc-compare-input">
              <span class="qrc-compare-text">Compare</span>
            </label>
          </div>

          <!-- Premium Box -->
          <div class="qrc-premium-box">
            <div class="qrc-premium-left">
              <div class="qrc-price">₹${p.premium.toLocaleString('en-IN')}</div>
              <div class="qrc-per-traveller">per traveller</div>
            </div>
            <div class="qrc-premium-right">
              ${medTagHtml}
            </div>
          </div>

          <!-- Details Row: 3 equal cols -->
          <div class="qrc-details-row">
            <div class="qrc-detail-col">
              <div class="qrc-detail-label">COVERAGE</div>
              <div class="qrc-detail-val">$${Number(p.coverage).toLocaleString()}</div>
            </div>
            <div class="qrc-detail-col">
              <div class="qrc-detail-label">AGE BAND</div>
              <div class="qrc-detail-val">${p.ageFrom}–${p.ageTo} yrs</div>
            </div>
            <div class="qrc-detail-col">
              <div class="qrc-detail-label">DAYS SLAB</div>
              <div class="qrc-detail-val">${p.daysFrom}–${p.daysTo} days</div>
            </div>
          </div>

          <!-- Buttons Row -->
          <div class="qrc-buttons-row">
            <button type="button" class="btn-select-plan ${isSelectedPlan ? 'selected' : ''}" data-select-plan-key="${this._esc(planKey)}" title="${isSelectedPlan ? 'Click to deselect this plan' : 'Click to select this plan and open issue details'}">
              ${isSelectedPlan ? `✓ Selected (#${selIndex + 1})` : 'Select Plan'}
            </button>
            <button type="button" class="btn-view-details" data-view-plan-key="${this._esc(planKey)}">
              Details
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _getAllMatchingPlans() {
    const all = [];
    const seenKeys = new Set();
    const q = this.state.savedQuote;
    const medFilter = this.state.superAgeMedicalFilter || 'all';

    if (!this.currentPlanMap) this.currentPlanMap = new Map();

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
          this.currentPlanMap.set(key, p);
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

  // ── Quick Company Selection Pills (Small Bars in Toolbar) ───────────────
  _renderCompactCompanyPillsHtml() {
    const availableCompanies = this._getAvailableCompanies();
    if (availableCompanies.length === 0) return '';

    const allPlans = this._getAllMatchingPlans();
    const areAllSelected = allPlans.length > 0 && allPlans.every(p => this._isPlanSelected(p));

    const allPill = `
      <button type="button" 
              class="fc-company-pill btn-pill-all ${areAllSelected ? 'all-selected' : ''}" 
              id="btnSelectAllAnyCompany"
              title="${areAllSelected ? 'Click to deselect all plans' : `Click to select all ${allPlans.length} plans across all companies`}">
        <span class="fcp-icon">${areAllSelected ? '✓' : '⚡'}</span>
        <span class="fcp-name">All</span>
        <span class="fcp-count">(${allPlans.length})</span>
      </button>
    `;

    const companyPills = availableCompanies.map(comp => {
      const compPlans = this._getAllPlansForCompany(comp);
      const selectedCompPlans = compPlans.filter(p => this._isPlanSelected(p));
      const isAllSelected = compPlans.length > 0 && selectedCompPlans.length === compPlans.length;
      const isPartSelected = selectedCompPlans.length > 0 && !isAllSelected;

      let statusClass = '';
      let icon = '🏢';
      let countText = `(${compPlans.length})`;

      if (isAllSelected) {
        statusClass = 'all-selected';
        icon = '✓';
        countText = `(${compPlans.length})`;
      } else if (isPartSelected) {
        statusClass = 'part-selected';
        icon = '◐';
        countText = `(${selectedCompPlans.length}/${compPlans.length})`;
      }

      return `
        <button type="button" 
                class="fc-company-pill ${statusClass}" 
                data-select-company-name="${this._esc(comp)}"
                title="${isAllSelected ? `Click to deselect all ${compPlans.length} plans of ${this._esc(comp)}` : `Click to select all ${compPlans.length} plans of ${this._esc(comp)}`}">
          <span class="fcp-icon">${icon}</span>
          <span class="fcp-name">${this._esc(comp)}</span>
          <span class="fcp-count">${countText}</span>
        </button>
      `;
    }).join('');

    return allPill + companyPills;
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
      <button type="button" class="dock-company-badge" data-select-company-name="${this._esc(comp)}" title="Click to toggle or deselect all ${this._esc(comp)} plans">
        🏢 ${this._esc(comp)} (${count}) ✕
      </button>
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
      <button class="btn-dock-issue" id="btnDockOpenIssue" title="Go to Issue details to prepare and share policy request" style="background:#0d6b46; color:#ffffff; border:none; border-radius:8px; padding:6px 12px; font-weight:700; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s ease;">
        📝 Issue Details
      </button>
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

    // Input events (customer name, countries, dates, and Step 3 details)
    container.addEventListener('input', (e) => {
      if (e.target.id === 'qCustomerName') {
        const prevCust = this.state.customerName;
        this.state.customerName = e.target.value;
        // If Step 3 is currently open and issueFor was empty or matching old customerName, auto-sync
        if (this.state.showIssueDetails && this.state.issueForm) {
          if (!this.state.issueForm.issueFor || this.state.issueForm.issueFor === prevCust) {
            this.state.issueForm.issueFor = e.target.value;
            const ifInp = this.container?.querySelector('#issueIssueFor');
            if (ifInp) ifInp.value = e.target.value;
          }
          const tr0 = this.state.issueForm.travellers ? this.state.issueForm.travellers[0] : '';
          if (!tr0 || tr0 === prevCust) {
            if (!this.state.issueForm.travellers) this.state.issueForm.travellers = [];
            this.state.issueForm.travellers[0] = e.target.value;
            const tr1Inp = this.container?.querySelector('.issue-traveller-input');
            if (tr1Inp) tr1Inp.value = e.target.value;
          }
          this._updateIssuePreview();
        }
      } else if (e.target.id === 'qTravellingCountry' || e.target.id === 'qArrivalCountry') {
        this.state.travellingCountry = e.target.value;
        this.state.arrivalCountry = e.target.value;
      } else if (e.target.id === 'qDob' || e.target.id === 'qDepartureDate' || e.target.id === 'qReturnDate') {
        updateLiveCalcs();
      } else if (e.target.id === 'issueCountry') {
        this.state.issueForm.country = e.target.value;
        this._clearFieldError('issueCountry');
        this._updateIssuePreview();
      } else if (e.target.id === 'issueTravelDate') {
        this.state.issueForm.travelDate = e.target.value;
        this._clearFieldError('issueTravelDate');
        this._updateIssuePreview();
      } else if (e.target.id === 'issueSumInsured') {
        this.state.issueForm.sumInsured = e.target.value;
        this._clearFieldError('issueSumInsured');
        this._updateIssuePreview();
      } else if (e.target.id === 'issuePlanName') {
        this.state.issueForm.planName = e.target.value;
        this._clearFieldError('issuePlanName');
        this._updateIssuePreview();
      } else if (e.target.id === 'issueIssueFor') {
        const val = e.target.value;
        const prevIssueFor = this.state.issueForm.issueFor;
        this.state.issueForm.issueFor = val;

        // Auto-sync Traveller 1 if it is empty or was matching previous issueFor
        const firstTraveller = (this.state.issueForm.travellers && this.state.issueForm.travellers[0]) ? this.state.issueForm.travellers[0] : '';
        if (!firstTraveller.trim() || firstTraveller === prevIssueFor) {
          if (!this.state.issueForm.travellers || this.state.issueForm.travellers.length === 0) {
            this.state.issueForm.travellers = [val];
          } else {
            this.state.issueForm.travellers[0] = val;
          }
          const tr1Input = this.container?.querySelector('.issue-traveller-input');
          if (tr1Input) tr1Input.value = val;
        }

        this._clearFieldError('issueIssueFor');
        this._updateIssuePreview();
      } else if (e.target.id === 'issueNominee') {
        this.state.issueForm.nominee = e.target.value;
        this._clearFieldError('issueNominee');
        this._updateIssuePreview();
      } else if (e.target.id === 'issuePhone') {
        this.state.issueForm.phone = e.target.value;
        this._clearFieldError('issuePhone');
        this._updateIssuePreview();
      } else if (e.target.id === 'issueEmail') {
        this.state.issueForm.email = e.target.value;
        this._clearFieldError('issueEmail');
        this._updateIssuePreview();
      } else if (e.target.classList.contains('issue-traveller-input')) {
        this._syncTravellersFromDom();
        // If Traveller 1 was edited, auto-sync Issue for if it was empty
        const row = e.target.closest('.traveller-row-item');
        const trIdx = row ? parseInt(row.dataset.travellerIdx, 10) : 0;
        if (trIdx === 0 && (!this.state.issueForm.issueFor || !this.state.issueForm.issueFor.trim())) {
          this.state.issueForm.issueFor = e.target.value;
          const issueForInp = this.container?.querySelector('#issueIssueFor');
          if (issueForInp) issueForInp.value = e.target.value;
        }
        this._clearFieldError('issueTravellers');
        this._updateIssuePreview();
      } else if (e.target.id === 'issueMessagePreview') {
        this.state.issueForm.customPreviewText = e.target.value;
      } else if (e.target.id === 'issueSubjectInput') {
        this.state.issueForm.customSubject = e.target.value;
      }
    });

    // Change events (dates, region radio, sort dropdown, rate checkboxes, Step 3 toggles)
    container.addEventListener('change', async (e) => {
      if (e.target.id === 'chkHideEmptyLines') {
        this.state.issueForm.hideEmptyLines = e.target.checked;
        this._updateIssuePreview();
        return;
      }
      if (e.target.id === 'chkIncludeGreetingSignature') {
        this.state.issueForm.includeGreetingSignature = e.target.checked;
        this._updateIssuePreview();
        return;
      }

      if (e.target.id === 'qDob' || e.target.id === 'qDepartureDate' || e.target.id === 'qReturnDate') {
        updateLiveCalcs();
        return;
      }

      if (e.target.name === 'qRegion') {
        this.state.region = e.target.value;
        return;
      }

      if (e.target.id === 'chkCompanySelectAll') {
        const availableCompanies = this._getAvailableCompanies();
        if (e.target.checked) {
          this.state.selectedCompanies = new Set(availableCompanies);
        } else {
          this.state.selectedCompanies = new Set();
        }
        this.state.isCompanyDropdownOpen = true;
        this._refresh();
        return;
      }

      if (e.target.classList.contains('chk-company-filter-item')) {
        const comp = e.target.dataset.companyName;
        const availableCompanies = this._getAvailableCompanies();
        const set = this._getSelectedCompaniesSet(availableCompanies);
        if (e.target.checked) {
          set.add(comp);
        } else {
          set.delete(comp);
        }
        this.state.selectedCompanies = set;
        this.state.isCompanyDropdownOpen = true;
        this._refresh();
        return;
      }

      if (e.target.id === 'sortResultsSelect') {
        this.state.sortBy = e.target.value;
        this.state.isCompanyDropdownOpen = false;
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

    // Close company dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container) return;
      if (!e.target.closest('#companyDropdownWrap')) {
        const wrap = this.container.querySelector('#companyDropdownWrap');
        if (wrap && wrap.classList.contains('open')) {
          wrap.classList.remove('open');
          this.state.isCompanyDropdownOpen = false;
        }
      }
    });

    // Global Click Router in Results View
    container.addEventListener('click', (e) => this._handleResultsClick(e));
  }

  // ── Results Clicks Handler ────────────────────────────────────────────────
  async _handleResultsClick(e) {
    // Toggle Company dropdown popover
    if (e.target.closest('#btnCompanyDropdown')) {
      const wrap = this.container.querySelector('#companyDropdownWrap');
      if (wrap) {
        wrap.classList.toggle('open');
        this.state.isCompanyDropdownOpen = wrap.classList.contains('open');
      }
      return;
    }

    // Medical filter buttons (Both, With Medical, Without Medical)
    const superMedBtn = e.target.closest('[data-super-medical]');
    if (superMedBtn) {
      const mode = superMedBtn.dataset.superMedical;
      this.state.superAgeMedicalFilter = mode;
      this.state.isCompanyDropdownOpen = false;
      this._refresh();
      return;
    }

    // Reset Form button
    if (e.target.closest('#btnResetQuoteForm')) {
      this._resetForm();
      return;
    }

    // Reset Company Filter button (from empty state)
    if (e.target.closest('#btnResetCompanyFilter')) {
      this.state.selectedCompanies = new Set(this._getAvailableCompanies());
      this.state.isCompanyDropdownOpen = false;
      this._refresh();
      return;
    }

    // Coverage Navigation Tabs Click (50k, 100k, 200k, 250k, 500k, 750k, 1M)
    const tab = e.target.closest('[data-coverage-tab]');
    if (tab) {
      const selectedCov = Number(tab.dataset.coverageTab);
      if (this.state.activeCoverageTab !== selectedCov) {
        this.state.activeCoverageTab = selectedCov;
        this.state.isCompanyDropdownOpen = false;
        this._refresh();
      }
      return;
    }

    // Select / Deselect Plan action button (Available for ALL — Public & Admin)
    const selectBtn = e.target.closest('button[data-select-plan-key]');
    if (selectBtn) {
      const key = selectBtn.dataset.selectPlanKey;
      const plan = this.currentPlanMap?.get(key);
      if (plan) {
        await this._handleAdminSelectPlan(plan);
      }
      return;
    }

    // Select all plans of a company button (from bottom bar OR from bottom dock)
    const compBtn = e.target.closest('[data-select-company-name]');
    if (compBtn) {
      const compName = compBtn.dataset.selectCompanyName;
      await this._toggleAllPlansForCompany(compName);
      return;
    }

    // Select all matching plans across all companies
    if (e.target.closest('#btnSelectAllAnyCompany')) {
      await this._toggleSelectAllMatchingPlans();
      return;
    }

    // Clear all from companies bottom bar
    if (e.target.closest('#btnClearFromCompaniesBar')) {
      this.state.selectedPlans = [];
      this.state.showIssueDetails = false;
      this.state.issuePlan = null;
      const mountEl = this.container?.querySelector('#step3Mount');
      if (mountEl) mountEl.innerHTML = '';
      this._clearAllSelectionDom();
      this._syncSelectedPlansWithBackend();
      this.app.showToast('Cleared all selected plans', 'info');
      return;
    }

    // Go to Issue Details button from dock
    if (e.target.closest('#btnDockOpenIssue')) {
      if (this.state.issuePlan && this.container?.querySelector('#step3IssueSection')) {
        this.container.querySelector('#step3IssueSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (this.state.selectedPlans.length > 0) {
        await this._activateIssueForPlan(this.state.selectedPlans[0], true);
      } else if (this.currentPlanMap && this.currentPlanMap.size > 0) {
        const firstPlan = Array.from(this.currentPlanMap.values())[0];
        await this._handleAdminSelectPlan(firstPlan);
      }
      return;
    }

    // Step 3: Change plan button -> scroll back to results
    if (e.target.closest('#btnChangePlan')) {
      const resultsEl = this.container.querySelector('#comparisonResultsSection');
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    // Step 3: Nominee suggestion chips
    const nomineeChip = e.target.closest('[data-nominee]');
    if (nomineeChip) {
      const val = nomineeChip.dataset.nominee;
      this.state.issueForm.nominee = val;
      const nomineeInput = this.container.querySelector('#issueNominee');
      if (nomineeInput) {
        nomineeInput.value = val;
      }
      if (!this.state.issueForm.groupSuffix) {
        this.state.issueForm.customSubject = null;
      }
      this._clearFieldError('issueNominee');
      this._updateIssuePreview();
      return;
    }

    // Step 3: Copy subject button
    if (e.target.closest('#btnCopySubject')) {
      await this._handleCopyIssueSubject();
      return;
    }

    // Step 3: Subject quick suffix chips (& FAMILY, & GROUP, Single)
    const suffixChip = e.target.closest('[data-subject-suffix]');
    if (suffixChip) {
      const sfx = suffixChip.dataset.subjectSuffix;
      this.state.issueForm.groupSuffix = sfx;
      this.state.issueForm.customSubject = null;
      this._updateIssuePreview();
      const allChips = this.container.querySelectorAll('[data-subject-suffix]');
      allChips.forEach(c => c.classList.toggle('active', c.dataset.subjectSuffix === sfx));
      return;
    }

    // Step 3: Preview view mode tabs (Formatted vs Raw)
    if (e.target.closest('#btnViewFormattedPreview')) {
      this._setPreviewViewMode('formatted');
      return;
    }
    if (e.target.closest('#btnViewRawPreview')) {
      this._setPreviewViewMode('raw');
      return;
    }

    // Step 3: Format toggle segment buttons
    const formatBtn = e.target.closest('[data-format-select]');
    if (formatBtn) {
      const fmt = formatBtn.dataset.formatSelect;
      this.state.issueForm.format = fmt;
      const allSegments = this.container.querySelectorAll('.format-segmented-control .segment-btn');
      allSegments.forEach(btn => {
        const isActive = btn.dataset.formatSelect === fmt;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      this._clearValidationErrors();
      this._updateIssuePreview();
      return;
    }

    // Step 3: Add traveller button
    if (e.target.closest('#btnAddTraveller')) {
      const listEl = this.container.querySelector('#travellersInputList');
      if (listEl) {
        const currentInputs = listEl.querySelectorAll('.issue-traveller-input');
        const newIdx = currentInputs.length;
        const row = document.createElement('div');
        row.className = 'traveller-row-item';
        row.dataset.travellerIdx = newIdx;
        row.innerHTML = `
          <input type="text" class="form-input issue-traveller-input" placeholder="Traveller ${newIdx + 1} name" />
          <button type="button" class="btn-remove-traveller" title="Remove traveller">✕</button>
        `;
        listEl.appendChild(row);
        row.querySelector('input')?.focus();
        this._syncTravellersFromDom();
      }
      return;
    }

    // Step 3: Remove traveller button
    const removeTravellerBtn = e.target.closest('.btn-remove-traveller');
    if (removeTravellerBtn) {
      const row = removeTravellerBtn.closest('.traveller-row-item');
      if (row) {
        row.remove();
        this._syncTravellersFromDom();
        this._updateIssuePreview();
      }
      return;
    }

    // Step 3: Copy message button
    if (e.target.closest('#btnCopyIssueMsg')) {
      await this._handleCopyIssueMessage();
      return;
    }

    // Step 3: Share on WhatsApp button
    if (e.target.closest('#btnShareWhatsApp')) {
      await this._handleShareWhatsApp();
      return;
    }

    // Step 3: Outlook Email button (direct launch if preferred, or modal)
    if (e.target.closest('#btnSendIssueEmail')) {
      await this._handleSendIssueEmail(false);
      return;
    }

    // Step 3: Outlook Email options dropdown arrow (always force modal)
    if (e.target.closest('#btnEmailOptionsDropdown')) {
      await this._handleSendIssueEmail(true);
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
      this.state.showIssueDetails = false;
      this.state.issuePlan = null;
      const mountEl = this.container?.querySelector('#step3Mount');
      if (mountEl) mountEl.innerHTML = '';
      this._clearAllSelectionDom();
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
      this.state.sortBy = 'lowest';
      this.state.selectedCompanies = null;
      this.state.isCompanyDropdownOpen = false;
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
    await this._handleAdminSelectPlan(plan);
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
      // If the deselected plan was currently open in Step 3
      if (this.state.issuePlan && this._getPlanKey(this.state.issuePlan) === key) {
        if (this.state.selectedPlans.length > 0) {
          const nextPlan = this.state.selectedPlans[this.state.selectedPlans.length - 1];
          await this._activateIssueForPlan(nextPlan, false);
        } else {
          this.state.showIssueDetails = false;
          this.state.issuePlan = null;
          const mountEl = this.container?.querySelector('#step3Mount');
          if (mountEl) {
            mountEl.innerHTML = '';
          }
        }
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
          btn.title = 'Click to deselect this plan';
        } else {
          btn.classList.remove('selected');
          btn.textContent = 'Select Plan';
          btn.title = 'Click to select this plan and open issue details';
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
          btn.title = 'Click to deselect this plan';
        } else {
          btn.classList.remove('selected');
          btn.textContent = 'Select Plan';
          btn.title = 'Click to select this plan and open issue details';
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
          if (btn) {
            btn.textContent = `✓ Selected (#${idx + 1})`;
            btn.title = 'Click to deselect this plan';
          }
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

    // 6. Update Compact Company Pills in Toolbar
    this._updateCompactCompanyPillsDom();
  }

  _updateCompactCompanyPillsDom() {
    if (!this.container) return;
    const wrap = this.container.querySelector('#fcCompanyPillsWrap');
    if (wrap) {
      wrap.innerHTML = `
        <span class="fc-pills-label">Select:</span>
        ${this._renderCompactCompanyPillsHtml()}
      `;
    }
  }

  async _toggleAllPlansForCompany(companyName) {
    if (!companyName) return;

    const compPlans = this._getAllPlansForCompany(companyName);
    if (!compPlans || compPlans.length === 0) {
      this.app.showToast(`No available plans found for ${companyName}`, 'warning');
      return;
    }

    const selectedCompPlans = compPlans.filter(p => this._isPlanSelected(p));
    const isAllSelected = selectedCompPlans.length === compPlans.length;

    if (isAllSelected) {
      // DESELECT ALL plans of this company
      const compKeys = new Set(compPlans.map(p => this._getPlanKey(p)));
      this.state.selectedPlans = this.state.selectedPlans.filter(p => !compKeys.has(this._getPlanKey(p)));

      // If active Step 3 issue plan was from this company
      if (this.state.issuePlan && this.state.issuePlan.companyName === companyName) {
        if (this.state.selectedPlans.length > 0) {
          const nextPlan = this.state.selectedPlans[this.state.selectedPlans.length - 1];
          await this._activateIssueForPlan(nextPlan, false);
        } else {
          this.state.showIssueDetails = false;
          this.state.issuePlan = null;
          const mountEl = this.container?.querySelector('#step3Mount');
          if (mountEl) mountEl.innerHTML = '';
        }
      }

      this._updateSelectionDom(null);
      this._syncSelectedPlansWithBackend();
      this.app.showToast(`Deselected all plans for ${companyName}`, 'info');
    } else {
      // SELECT ALL plans of this company
      const existingKeys = new Set(this.state.selectedPlans.map(p => this._getPlanKey(p)));
      for (const p of compPlans) {
        const key = this._getPlanKey(p);
        if (!existingKeys.has(key)) {
          this.state.selectedPlans.push(p);
          existingKeys.add(key);
        }
      }

      // If Step 3 is not open or not set, activate the first plan of this company
      if (!this.state.issuePlan) {
        await this._activateIssueForPlan(compPlans[0], true);
      } else {
        this._updateIssuePreview();
      }

      this._updateSelectionDom(null);
      this._syncSelectedPlansWithBackend();
      this.app.showToast(`Selected all ${compPlans.length} plans for ${companyName}`, 'success');
    }
  }

  async _toggleSelectAllMatchingPlans() {
    const allPlans = this._getAllMatchingPlans();
    if (!allPlans || allPlans.length === 0) return;

    const areAllSelected = allPlans.length > 0 && allPlans.every(p => this._isPlanSelected(p));

    if (areAllSelected) {
      this.state.selectedPlans = [];
      this.state.showIssueDetails = false;
      this.state.issuePlan = null;
      const mountEl = this.container?.querySelector('#step3Mount');
      if (mountEl) mountEl.innerHTML = '';
      this._clearAllSelectionDom();
      this._syncSelectedPlansWithBackend();
      this.app.showToast('Deselected all plans', 'info');
    } else {
      this.state.selectedPlans = [...allPlans];
      if (!this.state.issuePlan && allPlans.length > 0) {
        await this._activateIssueForPlan(allPlans[0], false);
      } else {
        this._updateIssuePreview();
      }
      this._updateSelectionDom(null);
      this._syncSelectedPlansWithBackend();
      this.app.showToast(`Selected all ${allPlans.length} matching plans`, 'success');
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
        const blocks = this._getAllInsurersQuoteBlocks();
        if (blocks.length === 0) throw new Error('No quote tables available to export.');
        const res = await QuotationExporter.copyAllInsurersImage(blocks);
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
        const blocks = this._getAllInsurersQuoteBlocks();
        if (blocks.length === 0) throw new Error('No quote tables available to export.');
        await QuotationExporter.downloadAllInsurersImage(blocks, 'Khanna-Travels-Quotes-Combined.png');
        this.app.showToast('✓ Combined quote images downloaded as PNG!', 'success');
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
      script.src = 'js/vendor/html2canvas.min.js';
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

  _getAllInsurersQuoteBlocks() {
    // 1. If modal is open in DOM with company cards, clone only the quote table block from each
    const modalCards = document.querySelectorAll('#printQuotationDoc .company-quote-card');
    if (modalCards.length > 0) {
      const blocks = [];
      modalCards.forEach(card => {
        const tableBlock = card.querySelector('.print-quote-block') || card.querySelector('.print-quote-table');
        if (tableBlock) {
          blocks.push(tableBlock.cloneNode(true));
        }
      });
      if (blocks.length > 0) return blocks;
    }

    // 2. Otherwise generate from selected plans
    const companiesMap = this._getCompaniesMap(this.state.selectedPlans);
    const blocks = [];
    for (const compGroup of companiesMap.values()) {
      const temp = document.createElement('div');
      temp.innerHTML = this._buildSingleCompanyTableHtml(compGroup);
      const tableBlock = temp.querySelector('.print-quote-block') || temp.querySelector('.print-quote-table');
      if (tableBlock) blocks.push(tableBlock);
    }
    return blocks;
  }

  async _copyQuoteImageFromDock() {
    if (this.state.selectedPlans.length === 0) {
      this.app.showToast('Please select at least 1 rate plan first', 'warning');
      return;
    }

    this.app.showToast('Generating quote image for clipboard…', 'info');

    try {
      const blocks = this._getAllInsurersQuoteBlocks();
      if (blocks.length === 0) throw new Error('No quote tables available to export.');
      const res = await QuotationExporter.copyAllInsurersImage(blocks);
      if (res.method === 'clipboard') {
        this.app.showToast('✓ Quote images copied to clipboard! Paste (Ctrl+V) directly into WhatsApp or Email.', 'success');
      } else {
        this.app.showToast('✓ Quote images downloaded as PNG!', 'success');
      }
    } catch (err) {
      this.app.showToast('Failed to copy image: ' + err.message, 'error');
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
      selectedCompanies: null,
      isCompanyDropdownOpen: false,
      superAgeMedical: 'all',
      superAgeDuration: 'all',
      superAgeMedicalFilter: 'all',
      superAgeDurationFilter: 'all',
      selectedForCompare: new Set(),
      selectedPlans: [],
      // Step 3: Issue details state (Public & Admin)
      showIssueDetails: false,
      issuePreviewMode: 'formatted', // 'formatted' | 'raw'
      issuePlan: null,
      issueForm: {
        country: '',
        travelDate: '',
        sumInsured: '',
        planName: '',
        issueFor: '',
        nominee: '',
        travellers: [''],
        phone: '8657461001',
        email: 'customercare@khannatravels.com',
        format: 'format2',
        groupSuffix: '',
        customSubject: null,
        hideEmptyLines: false,
        includeGreetingSignature: false,
        customPreviewText: null
      }
    };
    this.currentPlanMap = new Map();
    this._refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: ISSUE DETAILS METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _shouldRenderIssueStep() {
    return Boolean(this.state.showIssueDetails && this.state.issuePlan);
  }

  _getOrdinalDay(n) {
    const num = parseInt(n, 10);
    if (isNaN(num)) return '';
    const rem100 = num % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  _parseDatePartsSafe(dateStr) {
    if (!dateStr) return null;
    const parts = String(dateStr).trim().split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
        return { year: y, monthIdx: m, day: d };
      }
    }
    const dObj = new Date(dateStr);
    if (!isNaN(dObj.getTime())) {
      return {
        year: dObj.getFullYear(),
        monthIdx: dObj.getMonth(),
        day: dObj.getDate()
      };
    }
    return null;
  }

  _formatTravelDates(depStr, retStr) {
    const dep = this._parseDatePartsSafe(depStr);
    const ret = this._parseDatePartsSafe(retStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!dep && !ret) return '';
    if (dep && !ret) return `${this._getOrdinalDay(dep.day)} ${months[dep.monthIdx]} ${dep.year}`;
    if (!dep && ret) return `${this._getOrdinalDay(ret.day)} ${months[ret.monthIdx]} ${ret.year}`;

    const depDay = this._getOrdinalDay(dep.day);
    const retDay = this._getOrdinalDay(ret.day);
    const depMonth = months[dep.monthIdx];
    const retMonth = months[ret.monthIdx];

    if (dep.year === ret.year) {
      return `${depDay} ${depMonth} to ${retDay} ${retMonth} ${dep.year}`;
    } else {
      return `${depDay} ${depMonth} ${dep.year} to ${retDay} ${retMonth} ${ret.year}`;
    }
  }

  _formatSumInsured(coverage) {
    if (!coverage && coverage !== 0) return '';
    if (typeof coverage === 'string' && /^usd\s+/i.test(coverage.trim())) {
      return coverage.trim();
    }
    const cleanStr = String(coverage).replace(/[^0-9.]/g, '');
    const num = parseFloat(cleanStr);
    if (isNaN(num)) return String(coverage);

    if (num >= 1000000) {
      const m = num / 1000000;
      return `USD ${Number.isInteger(m) ? m : m.toFixed(1)}M`;
    }
    if (num >= 1000) {
      const k = num / 1000;
      return `USD ${Number.isInteger(k) ? k : k.toFixed(1)}K`;
    }
    return `USD ${num}`;
  }

  _formatSumInsuredUpperK(sumInsuredStr) {
    if (!sumInsuredStr) return '';
    return sumInsuredStr.replace(/(\d+)\s*k\b/gi, (match, p1) => `${p1}K`).replace(/\bk\b/g, 'K');
  }

  _extractShortPlanName(planName) {
    if (!planName) return '';
    let name = String(planName).trim();
    name = name.replace(/\s*-\s*Without Medical.*$/i, '');
    name = name.replace(/\s*-\s*With Medical.*$/i, '');
    name = name.replace(/\s*-\s*Revised.*$/i, '');
    name = name.replace(/\s*Super Age.*$/i, '');
    name = name.replace(/\s*Age\s*\([^)]*\)/i, '');
    name = name.replace(/\s*\([^)]*\)/g, '');
    name = name.replace(/^Travel\s+/i, '');
    name = name.replace(/^Care\s+/i, '');
    name = name.trim();
    return name || String(planName).trim();
  }

  _buildIssueSubject(formData = this.state.issueForm) {
    const f = formData || {};
    if (f.customSubject && f.customSubject.trim()) {
      return f.customSubject.trim();
    }

    let primaryName = '';
    if (f.issueFor && f.issueFor.trim()) {
      primaryName = f.issueFor.trim();
    } else if (Array.isArray(f.travellers) && f.travellers.length > 0 && f.travellers[0].trim()) {
      primaryName = f.travellers[0].trim();
    } else if (this.state.customerName && this.state.customerName.trim() && this.state.customerName.trim().toLowerCase() !== 'customer') {
      primaryName = this.state.customerName.trim();
    } else {
      primaryName = 'CUSTOMER';
    }

    primaryName = primaryName.toUpperCase();

    const travellers = Array.isArray(f.travellers) ? f.travellers.map(t => (t || '').trim()).filter(Boolean) : [];
    const count = travellers.length > 0 ? travellers.length : 1;
    const nominee = (f.nominee || '').trim().toLowerCase();

    let suffix = '';
    if (f.groupSuffix === 'none') {
      suffix = '';
    } else if (f.groupSuffix === 'family') {
      suffix = ' & FAMILY';
    } else if (f.groupSuffix === 'group') {
      suffix = ' & GROUP';
    } else if (count > 1) {
      if (nominee.includes('family') || nominee.includes('spouse') || nominee.includes('children') || nominee.includes('interchange') || nominee.includes('parent')) {
        suffix = ' & FAMILY';
      } else {
        suffix = ' & GROUP';
      }
    }

    return `ISSUE TRAVEL INSURANCE POLICY OF ${primaryName}${suffix}`;
  }

  _buildIssueMessage(formData = this.state.issueForm, mode = 'plain') {
    const f = formData || {};
    const format = f.format || 'format2';
    const hideEmpty = Boolean(f.hideEmptyLines);

    const b = (val) => {
      if (!val) return '';
      if (mode === 'whatsapp') return `*${val}*`;
      if (mode === 'html') return `<strong>${this._esc(val)}</strong>`;
      return val;
    };

    const formatEmail = (emailStr) => {
      if (!emailStr) return '';
      if (mode === 'html') return `<a href="mailto:${this._esc(emailStr)}" style="color: #0284c7; text-decoration: underline;">${this._esc(emailStr)}</a>`;
      return emailStr;
    };

    const issueFor = f.issueFor || '';
    const country = f.country || '';
    const travelDate = f.travelDate || '';
    const sumInsured = f.sumInsured || '';
    const planName = f.planName || '';
    const nominee = f.nominee || '';
    const travellers = Array.isArray(f.travellers) ? f.travellers.map(t => (t || '').trim()).filter(Boolean).join(' // ') : (f.travellers || '');
    const phone = f.phone || '';
    const email = f.email || '';

    const sumInsuredUpperK = this._formatSumInsuredUpperK(sumInsured);

    if (format === 'format1') {
      if (!hideEmpty) {
        return [
          `Issue for ${b(issueFor)} -`,
          ``,
          `Country - ${b(country)}`,
          `Travel Date - ${b(travelDate)}`,
          ``,
          `Sum Insured- ${b(sumInsured)}`,
          ``,
          `Nominee- ${b(nominee)}`,
          ``,
          `${phone}`,
          `${formatEmail(email)}`
        ].join('\n');
      } else {
        const blocks = [];
        if (issueFor.trim()) blocks.push([`Issue for ${b(issueFor.trim())} -`]);
        const trip = [];
        if (country.trim()) trip.push(`Country - ${b(country.trim())}`);
        if (travelDate.trim()) trip.push(`Travel Date - ${b(travelDate.trim())}`);
        if (trip.length > 0) blocks.push(trip);
        if (sumInsured.trim()) blocks.push([`Sum Insured- ${b(sumInsured.trim())}`]);
        if (nominee.trim()) blocks.push([`Nominee- ${b(nominee.trim())}`]);
        const contact = [];
        if (phone.trim()) contact.push(phone.trim());
        if (email.trim()) contact.push(formatEmail(email.trim()));
        if (contact.length > 0) blocks.push(contact);

        return blocks.map(b => b.join('\n')).join('\n\n');
      }
    } else {
      // Format 2: Official / Letter Format (Khanna)
      const includeGreetingSignature = Boolean(f.includeGreetingSignature);

      let premStr = 'Premium';
      if (planName.trim() && sumInsuredUpperK.trim()) {
        premStr = `Premium - ${b(planName.trim())} - ${sumInsuredUpperK.trim()}`;
      } else if (planName.trim()) {
        premStr = `Premium - ${b(planName.trim())}`;
      } else if (sumInsuredUpperK.trim()) {
        premStr = `Premium - ${b(sumInsuredUpperK.trim())}`;
      }

      let detailsText = '';
      if (!hideEmpty) {
        detailsText = [
          `Country- ${b(country)}`,
          ``,
          `Travel Date- ${b(travelDate)}`,
          ``,
          premStr,
          ``,
          `Nominee - ${b(nominee)}`,
          ``,
          `Travelers - ${b(travellers)}`,
          ``,
          `Phone No- ${phone}`,
          `Email id - ${formatEmail(email)}`
        ].join('\n');
      } else {
        const blocks = [];
        if (country.trim()) blocks.push([`Country- ${b(country.trim())}`]);
        if (travelDate.trim()) blocks.push([`Travel Date- ${b(travelDate.trim())}`]);
        if (planName.trim() || sumInsuredUpperK.trim()) blocks.push([premStr]);
        if (nominee.trim()) blocks.push([`Nominee - ${b(nominee.trim())}`]);
        if (travellers.trim()) blocks.push([`Travelers - ${b(travellers.trim())}`]);

        const contact = [];
        if (phone.trim()) contact.push(`Phone No- ${phone.trim()}`);
        if (email.trim()) contact.push(`Email id - ${formatEmail(email.trim())}`);
        if (contact.length > 0) blocks.push(contact);

        detailsText = blocks.map(b => b.join('\n')).join('\n\n');
      }

      if (!includeGreetingSignature) {
        return detailsText;
      }

      const greeting = [
        "Dear Sir/Ma'am,",
        "",
        b("Greetings From Khannaholidays.com !!")
      ].join('\n');

      const closing = [
        b("Do not hesitate to contact us for any further assistance."),
        "",
        "",
        "Regards,",
        b("Ms. Dhvani // Ms. Akriti"),
        `${b("Mobile No. :")} +91 86574 61001`,
        `${b("Email:")} ${formatEmail('customercare@khannatravels.com')}`,
        `${b("Tel Board:")} + 91 22 41555555`,
        `${b("GST NO :")} 27AAFCK5236J2ZB`,
        `${b("Company Name :")} Khanna Holidays Pvt Ltd`
      ].join('\n');

      return [greeting, '', detailsText, '', closing].join('\n');
    }
  }

  _renderIssueStepSection() {
    const plan = this.state.issuePlan;
    if (!plan) return '';
    const f = this.state.issueForm;
    const previewMsg = f.customPreviewText !== null ? f.customPreviewText : this._buildIssueMessage(f, 'plain');
    const currentSubject = this._buildIssueSubject(f);
    const formattedHtml = this._buildIssueMessage(f, 'html').split('\n\n').map(p => `<div class="preview-formatted-block">${p.replace(/\n/g, '<br>')}</div>`).join('');

    const savedEmailPref = localStorage.getItem('kt_preferred_email_client');
    let emailBtnLabel = 'Outlook Email';
    if (savedEmailPref === 'web') emailBtnLabel = 'Outlook Web';
    else if (savedEmailPref === 'desktop') emailBtnLabel = 'Outlook App';

    return `
      <div class="step-3-issue-section" id="step3IssueSection">
        <!-- Header -->
        <div class="step-header">
          <div class="step-num">3</div>
          <div>
            <h2 class="step-title">Issue details</h2>
            <p class="step-help-line">Opens after you tap Select Plan. Fill the missing details, then copy or share.</p>
          </div>
        </div>

        <!-- Selected Plan Strip -->
        <div class="selected-plan-strip" id="selectedPlanStrip">
          <div class="sps-left">
            <div class="sps-icon">
              <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="sps-content">
              <div class="sps-badge-row">
                <span class="sps-badge">SELECTED PLAN</span>
              </div>
              <div class="sps-plan-title">
                <strong>${this._esc(plan.companyName)}</strong> — ${this._esc(plan.planName)}
              </div>
              <div class="sps-meta-row">
                <span class="sps-meta-pill">🌍 Country: <strong>${this._esc(f.country || this.state.travellingCountry || this.state.arrivalCountry || 'Worldwide')}</strong></span>
                <span class="sps-meta-pill">🛡️ Sum Insured: <strong>${this._esc(f.sumInsured || this._formatSumInsured(plan.coverage))}</strong></span>
                <span class="sps-meta-pill">💰 Premium: <strong>₹${Number(plan.premium || 0).toLocaleString('en-IN')}</strong> / traveller</span>
              </div>
            </div>
          </div>
          <div class="sps-right">
            <button type="button" class="btn-change-plan" id="btnChangePlan" title="Return to comparison results to select another plan">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
              </svg>
              <span>Change plan</span>
            </button>
          </div>
        </div>

        <!-- Two Columns Grid: Left Details Form, Right Message to share -->
        <div class="issue-details-grid">

          <!-- Left Card: Details Form -->
          <div class="issue-card issue-details-card">
            <div class="issue-card-header">
              <h3 class="issue-card-title">Details</h3>
              <span class="issue-card-subtitle">Auto-filled from quote &amp; editable customer details</span>
            </div>

            <div class="issue-form-grid">
              <!-- Country -->
              <div class="issue-form-group">
                <div class="issue-label-row">
                  <label class="issue-label" for="issueCountry">Country <span class="req-star">*</span></label>
                  <span class="badge-from-quote">From quote</span>
                </div>
                <input type="text" id="issueCountry" class="form-input form-input-autofill"
                       value="${this._esc(f.country)}" placeholder="e.g. Thailand" />
                <div class="field-error-msg" id="err-issueCountry"></div>
              </div>

              <!-- Travel date -->
              <div class="issue-form-group">
                <div class="issue-label-row">
                  <label class="issue-label" for="issueTravelDate">Travel date <span class="req-star">*</span></label>
                  <span class="badge-from-quote">From quote</span>
                </div>
                <input type="text" id="issueTravelDate" class="form-input form-input-autofill"
                       value="${this._esc(f.travelDate)}" placeholder="e.g. 10th Nov to 30th Nov 2026" />
                <div class="field-error-msg" id="err-issueTravelDate"></div>
              </div>

              <!-- Sum insured -->
              <div class="issue-form-group">
                <div class="issue-label-row">
                  <label class="issue-label" for="issueSumInsured">Sum insured <span class="req-star">*</span></label>
                  <span class="badge-from-quote">From quote</span>
                </div>
                <input type="text" id="issueSumInsured" class="form-input form-input-autofill"
                       value="${this._esc(f.sumInsured)}" placeholder="e.g. USD 75k" />
                <div class="field-error-msg" id="err-issueSumInsured"></div>
              </div>

              <!-- Plan name -->
              <div class="issue-form-group">
                <div class="issue-label-row">
                  <label class="issue-label" for="issuePlanName">Plan name</label>
                  <span class="badge-from-quote">From quote</span>
                </div>
                <input type="text" id="issuePlanName" class="form-input form-input-autofill"
                       value="${this._esc(f.planName)}" placeholder="e.g. Prime" />
                <div class="field-error-msg" id="err-issuePlanName"></div>
              </div>

              <!-- Issue for -->
              <div class="issue-form-group">
                <div class="issue-label-row">
                  <label class="issue-label" for="issueIssueFor">Issue for <span class="req-star">*</span></label>
                  <span class="badge-from-quote">From quote</span>
                </div>
                <input type="text" id="issueIssueFor" class="form-input"
                       value="${this._esc(f.issueFor)}" placeholder="e.g. Mr. and Mrs. Bhasin" />
                <div class="field-error-msg" id="err-issueIssueFor"></div>
                <span class="field-helper-text">1st customer name (auto-syncs with Traveller 1)</span>
              </div>

              <!-- Nominee -->
              <div class="issue-form-group">
                <label class="issue-label" for="issueNominee">Nominee <span class="req-star">*</span></label>
                <input type="text" id="issueNominee" class="form-input"
                       value="${this._esc(f.nominee)}" placeholder="e.g. Spouse" />
                <div class="field-error-msg" id="err-issueNominee"></div>
                <div class="nominee-suggestions">
                  <span class="nominee-suggest-label">Suggestions:</span>
                  <button type="button" class="btn-nominee-chip" data-nominee="Spouse">Spouse</button>
                  <button type="button" class="btn-nominee-chip" data-nominee="Interchange">Interchange</button>
                  <button type="button" class="btn-nominee-chip" data-nominee="Parents">Parents</button>
                  <button type="button" class="btn-nominee-chip" data-nominee="Children">Children</button>
                </div>
              </div>

              <!-- Traveller name(s) -->
              <div class="issue-form-group">
                <div class="issue-label-row">
                  <label class="issue-label">Traveller name(s) <span class="req-star">*</span></label>
                  <span class="badge-from-quote">From quote</span>
                </div>
                <div class="travellers-input-list" id="travellersInputList">
                  ${(f.travellers && f.travellers.length > 0 ? f.travellers : ['']).map((tr, i) => `
                    <div class="traveller-row-item" data-traveller-idx="${i}">
                      <input type="text" class="form-input issue-traveller-input"
                             placeholder="Traveller ${i + 1} name" value="${this._esc(tr)}" />
                      ${i > 0 ? `<button type="button" class="btn-remove-traveller" title="Remove traveller">✕</button>` : ''}
                    </div>
                  `).join('')}
                </div>
                <button type="button" class="btn-add-traveller" id="btnAddTraveller">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                    <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
                  </svg>
                  <span>Add traveller</span>
                </button>
                <div class="field-error-msg" id="err-issueTravellers"></div>
                <span class="field-helper-text">Multiple travellers will be joined with " // "</span>
              </div>

              <!-- Contact phone / Phone no. -->
              <div class="issue-form-group">
                <div class="issue-label-row">
                  <label class="issue-label" for="issuePhone">Contact phone / Phone no. <span class="req-star">*</span></label>
                  <span class="badge-from-quote">Default</span>
                </div>
                <input type="tel" id="issuePhone" class="form-input"
                       value="${this._esc(f.phone || '8657461001')}" placeholder="10-digit mobile number" maxlength="15" />
                <div class="field-error-msg" id="err-issuePhone"></div>
              </div>

              <!-- Email -->
              <div class="issue-form-group">
                <div class="issue-label-row">
                  <label class="issue-label" for="issueEmail">Email</label>
                  <span class="badge-from-quote">Default</span>
                </div>
                <input type="email" id="issueEmail" class="form-input"
                       value="${this._esc(f.email || 'customercare@khannatravels.com')}" placeholder="customercare@khannatravels.com" />
                <div class="field-error-msg" id="err-issueEmail"></div>
              </div>
            </div>
          </div>

          <!-- Right Card: Message to Share -->
          <div class="issue-card issue-message-card">
            <div class="issue-card-header issue-message-header">
              <div>
                <h3 class="issue-card-title">Message to share</h3>
                <span class="issue-card-subtitle">Live preview of policy details to copy or send</span>
              </div>
              <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
                <label class="hide-empty-label" title="Toggle full email with greeting & signature or between details only">
                  <input type="checkbox" id="chkIncludeGreetingSignature" ${f.includeGreetingSignature ? 'checked' : ''} />
                  <span>Full Email (with Signature)</span>
                </label>
                <label class="hide-empty-label" title="Hide lines with empty values from the final message">
                  <input type="checkbox" id="chkHideEmptyLines" ${f.hideEmptyLines ? 'checked' : ''} />
                  <span>Hide empty lines</span>
                </label>
              </div>
            </div>

            <!-- Standardized Policy Issue Subject Line -->
            <div class="issue-subject-box">
              <div class="issue-subject-header">
                <label class="issue-subject-label" for="issueSubjectInput">
                  <span>EMAIL / REQUEST SUBJECT</span>
                  <span class="subject-caps-hint">(Auto in ALL CAPS)</span>
                </label>
                <button type="button" class="btn-copy-subject" id="btnCopySubject" title="Copy subject line to clipboard">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
                    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                  </svg>
                  <span id="copySubjectBtnText">Copy Sub</span>
                </button>
              </div>
              <input type="text" id="issueSubjectInput" class="form-input issue-subject-input"
                     value="${this._esc(currentSubject)}"
                     placeholder="ISSUE TRAVEL INSURANCE POLICY OF..." />
              <div class="subject-quick-chips">
                <span class="chips-label">Quick suffix:</span>
                <button type="button" class="btn-subject-chip ${f.groupSuffix === 'family' ? 'active' : ''}" data-subject-suffix="family">&amp; FAMILY</button>
                <button type="button" class="btn-subject-chip ${f.groupSuffix === 'group' ? 'active' : ''}" data-subject-suffix="group">&amp; GROUP</button>
                <button type="button" class="btn-subject-chip ${f.groupSuffix === 'none' ? 'active' : ''}" data-subject-suffix="none">Single (No Suffix)</button>
              </div>
            </div>

            <!-- Segmented Control Format Toggle -->
            <div class="format-segmented-control" role="tablist" aria-label="Message Formats">
              <button type="button"
                      class="segment-btn ${f.format === 'format1' ? 'active' : ''}"
                      data-format-select="format1"
                      role="tab"
                      aria-selected="${f.format === 'format1'}">
                Format 1: Issue for
              </button>
              <button type="button"
                      class="segment-btn ${f.format === 'format2' ? 'active' : ''}"
                      data-format-select="format2"
                      role="tab"
                      aria-selected="${f.format === 'format2'}">
                Format 2: Between Details (Email &amp; WhatsApp)
              </button>
            </div>

            <!-- View Mode Toolbar (Formatted vs Raw) -->
            <div class="preview-mode-toolbar">
              <div class="preview-view-tabs">
                <button type="button" class="preview-tab-btn ${this.state.issuePreviewMode !== 'raw' ? 'active' : ''}" id="btnViewFormattedPreview">
                  ✨ Formatted (Bold)
                </button>
                <button type="button" class="preview-tab-btn ${this.state.issuePreviewMode === 'raw' ? 'active' : ''}" id="btnViewRawPreview">
                  ✏️ Edit Text
                </button>
              </div>
              <div class="preview-hint-tag" id="previewModeHint">
                ${this.state.issuePreviewMode === 'raw' ? 'Direct text editing mode' : 'Highlighted &amp; bold values'}
              </div>
            </div>

            <!-- Preview Display Container -->
            <div class="preview-display-container">
              <!-- Rich Formatted View (Default) -->
              <div id="issueFormattedPreview"
                   class="message-preview-formatted"
                   style="${this.state.issuePreviewMode === 'raw' ? 'display: none;' : 'display: block;'}"
                   aria-label="Formatted message preview">
                ${formattedHtml}
              </div>

              <!-- Raw Textarea View (Editable) -->
              <textarea id="issueMessagePreview"
                        class="message-preview-textarea"
                        spellcheck="false"
                        rows="13"
                        style="${this.state.issuePreviewMode === 'raw' ? 'display: block;' : 'display: none;'}"
                        aria-label="Message preview">${this._esc(previewMsg)}</textarea>
            </div>
            <div class="preview-direct-edit-note">
              💡 Preview updates live as you type. Switching to Edit Text allows modifying message text directly.
            </div>

            <!-- Buttons Row -->
            <div class="issue-actions-row">
              <button type="button" class="btn-issue-copy" id="btnCopyIssueMsg">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                </svg>
                <span class="btn-copy-label">Copy message</span>
              </button>

              <button type="button" class="btn-issue-whatsapp" id="btnShareWhatsApp">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.78 14.12c-.24.68-1.39 1.3-1.92 1.38-.5.08-1.15.11-3.69-.94-2.22-.92-3.67-3.18-3.78-3.33-.11-.15-.9-1.2-1.04-2.29-.14-1.09.43-1.63.66-1.87.23-.24.5-.3.67-.3.17 0 .34 0 .49.01.16.01.37-.06.58.44.22.52.75 1.83.82 1.96.07.14.11.3.02.48-.09.18-.14.3-.28.46-.14.16-.3.35-.43.47-.14.14-.29.29-.12.58.17.29.74 1.23 1.59 1.99 1.09.98 2.01 1.28 2.3 1.42.29.14.46.12.63-.07.17-.19.74-.86.94-1.16.2-.3.4-.25.68-.15.28.1.78.37 1.83.89 1.05.52 1.25.63 1.32.74.07.11.07.64-.17 1.32z"/>
                </svg>
                <span>Share on WhatsApp</span>
              </button>

              <div class="btn-issue-email-group" id="btnIssueEmailGroup">
                <button type="button" class="btn-issue-email" id="btnSendIssueEmail" title="Send policy issue request via Outlook (${f.email || 'customercare@khannatravels.com'})">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <span id="labelIssueEmailBtn">${emailBtnLabel}</span>
                </button>
                <button type="button" class="btn-issue-email-dropdown" id="btnEmailOptionsDropdown" title="Choose Outlook Web (Office 365) or Desktop App">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
                    <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  _updateIssuePreview() {
    if (!this.container) return;

    // 1. Update Subject Line input (unless user has custom edit)
    const subjectEl = this.container.querySelector('#issueSubjectInput');
    if (subjectEl) {
      if (this.state.issueForm.customSubject === null) {
        subjectEl.value = this._buildIssueSubject(this.state.issueForm);
      }
    }

    // 2. Update Raw Preview Textarea
    const previewEl = this.container.querySelector('#issueMessagePreview');
    const plainMsg = this._buildIssueMessage(this.state.issueForm, 'plain');
    if (previewEl) {
      if (this.state.issueForm.customPreviewText === null) {
        previewEl.value = plainMsg;
      }
    }

    // 3. Update Formatted Rich Preview Box
    const formattedEl = this.container.querySelector('#issueFormattedPreview');
    if (formattedEl) {
      const htmlMsg = this._buildIssueMessage(this.state.issueForm, 'html');
      const paragraphs = htmlMsg.split('\n\n').map(p => {
        return `<div class="preview-formatted-block">${p.replace(/\n/g, '<br>')}</div>`;
      }).join('');
      formattedEl.innerHTML = paragraphs;
    }
  }

  _setPreviewViewMode(mode) {
    this.state.issuePreviewMode = mode;
    const formattedEl = this.container?.querySelector('#issueFormattedPreview');
    const rawEl = this.container?.querySelector('#issueMessagePreview');
    const btnFormatted = this.container?.querySelector('#btnViewFormattedPreview');
    const btnRaw = this.container?.querySelector('#btnViewRawPreview');
    const hintEl = this.container?.querySelector('#previewModeHint');

    if (mode === 'formatted') {
      if (formattedEl) formattedEl.style.display = 'block';
      if (rawEl) rawEl.style.display = 'none';
      if (btnFormatted) btnFormatted.classList.add('active');
      if (btnRaw) btnRaw.classList.remove('active');
      if (hintEl) hintEl.textContent = 'Highlighted & bold values';
    } else {
      if (formattedEl) formattedEl.style.display = 'none';
      if (rawEl) rawEl.style.display = 'block';
      if (btnFormatted) btnFormatted.classList.remove('active');
      if (btnRaw) btnRaw.classList.add('active');
      if (hintEl) hintEl.textContent = 'Direct text editing mode';
      if (rawEl) rawEl.focus();
    }
  }

  async _handleCopyIssueSubject() {
    const subjectEl = this.container?.querySelector('#issueSubjectInput');
    const subject = subjectEl ? subjectEl.value.trim() : this._buildIssueSubject(this.state.issueForm);

    try {
      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(subject);
          copied = true;
        } catch (clipErr) {
          console.warn('Clipboard writeText failed:', clipErr);
        }
      }
      if (!copied) {
        const temp = document.createElement('textarea');
        temp.value = subject;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        copied = document.execCommand('copy');
        document.body.removeChild(temp);
      }

      const btn = this.container?.querySelector('#btnCopySubject');
      const label = btn?.querySelector('#copySubjectBtnText');
      if (label) {
        const prevText = label.textContent;
        label.textContent = '✓ Copied!';
        btn.classList.add('btn-copied-state');
        setTimeout(() => {
          label.textContent = prevText;
          btn.classList.remove('btn-copied-state');
        }, 2000);
      }

      this.app.showToast('✓ Subject copied to clipboard!', 'success');
    } catch (err) {
      this.app.showToast('Failed to copy subject: ' + err.message, 'error');
    }
  }

  _syncTravellersFromDom() {
    if (!this.container) return;
    const inputs = this.container.querySelectorAll('.issue-traveller-input');
    const values = Array.from(inputs).map(inp => inp.value);
    this.state.issueForm.travellers = values.length > 0 ? values : [''];
  }

  _clearFieldError(fieldId) {
    if (!this.container) return;
    const inputEl = this.container.querySelector(`#${fieldId}`) || (fieldId === 'issueTravellers' ? this.container.querySelector('.issue-traveller-input') : null);
    if (inputEl) {
      inputEl.classList.remove('has-error');
    }
    const errEl = this.container.querySelector(`#err-${fieldId}`);
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.remove('visible');
    }
  }

  _clearValidationErrors() {
    if (!this.container) return;
    const errorInputs = this.container.querySelectorAll('.form-input.has-error');
    errorInputs.forEach(el => el.classList.remove('has-error'));
    const errorMsgs = this.container.querySelectorAll('.field-error-msg');
    errorMsgs.forEach(el => {
      el.textContent = '';
      el.classList.remove('visible');
    });
  }

  _displayValidationErrors(errors) {
    let firstInvalid = null;
    for (const [fieldId, msg] of Object.entries(errors)) {
      let inputEl;
      if (fieldId === 'issueTravellers') {
        inputEl = this.container?.querySelector('.issue-traveller-input');
      } else {
        inputEl = this.container?.querySelector(`#${fieldId}`);
      }
      if (inputEl) {
        inputEl.classList.add('has-error');
        if (!firstInvalid) firstInvalid = inputEl;
      }
      const errEl = this.container?.querySelector(`#err-${fieldId}`);
      if (errEl) {
        errEl.textContent = msg;
        errEl.classList.add('visible');
      }
    }
    if (firstInvalid) {
      firstInvalid.focus();
    }
  }

  _validateIssueForm(format = this.state.issueForm.format) {
    let isValid = true;
    const errors = {};
    const f = this.state.issueForm;

    this._clearValidationErrors();

    // 1. Country (Required)
    if (!f.country || !f.country.trim()) {
      errors.issueCountry = 'Country is required';
      isValid = false;
    }

    // 2. Travel date (Required)
    if (!f.travelDate || !f.travelDate.trim()) {
      errors.issueTravelDate = 'Travel date is required';
      isValid = false;
    }

    // 3. Sum insured (Required)
    if (!f.sumInsured || !f.sumInsured.trim()) {
      errors.issueSumInsured = 'Sum insured is required';
      isValid = false;
    }

    // 4. Nominee (Required)
    if (!f.nominee || !f.nominee.trim()) {
      errors.issueNominee = 'Nominee is required';
      isValid = false;
    }

    // Phone cleanup & check
    const rawPhone = (f.phone || '').trim();
    const cleanPhone = rawPhone.replace(/[\s\-+()]/g, '');

    if (format === 'format1') {
      if (!f.issueFor || !f.issueFor.trim()) {
        errors.issueIssueFor = 'Issue for is required for Format 1';
        isValid = false;
      }
      if (!rawPhone) {
        errors.issuePhone = 'Contact phone is required';
        isValid = false;
      } else if (!/^\d{10}$/.test(cleanPhone)) {
        errors.issuePhone = 'Phone number must be 10 digits';
        isValid = false;
      }
    } else {
      const hasTraveller = Array.isArray(f.travellers) && f.travellers.some(t => t && t.trim().length > 0);
      if (!hasTraveller) {
        errors.issueTravellers = 'At least one traveller name is required for Format 2';
        isValid = false;
      }
      if (!rawPhone) {
        errors.issuePhone = 'Phone number is required';
        isValid = false;
      } else if (!/^\d{10}$/.test(cleanPhone)) {
        errors.issuePhone = 'Phone number must be 10 digits';
        isValid = false;
      }
    }

    // Email format check
    const rawEmail = (f.email || '').trim();
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      errors.issueEmail = 'Please enter a valid email address';
      isValid = false;
    }

    if (!isValid) {
      this._displayValidationErrors(errors);
      this.app.showToast('Please fill in all required fields correctly before copying/sharing.', 'warning');
    }

    return isValid;
  }

  async _handleAdminSelectPlan(plan) {
    const isAlreadySelected = this._isPlanSelected(plan);

    if (isAlreadySelected) {
      // User clicked on an already-selected plan -> Deselect it!
      await this._setPlanSelected(plan, false);
      this.app.showToast(`Deselected ${plan.companyName} (${plan.planName})`, 'info');
      return;
    }

    // Plan is not yet selected -> Select and open Step 3
    await this._setPlanSelected(plan, true);
    await this._activateIssueForPlan(plan, true);

    this.app.showToast(`Step 3: Issue details opened for ${plan.companyName} (${plan.planName})`, 'info');
  }

  async _activateIssueForPlan(plan, shouldScroll = true) {
    this.state.issuePlan = plan;
    this.state.showIssueDetails = true;

    // Pull customer name from quote (Step 1)
    const rawCustomer = (this.container?.querySelector('#qCustomerName')?.value || this.state.customerName || '').trim();
    const customerFromQuote = (rawCustomer && rawCustomer.toLowerCase() !== 'customer') ? rawCustomer : '';

    const countryFromQuote = this.state.travellingCountry || this.state.arrivalCountry || '';
    const travelDateFromQuote = this._formatTravelDates(this.state.departureDate, this.state.returnDate);
    const sumInsuredFromQuote = this._formatSumInsured(plan.coverage);
    const planNameFromQuote = this._extractShortPlanName(plan.planName);
    const defaultPhone = '8657461001';
    const defaultEmail = 'customercare@khannatravels.com';

    if (!this.state.issueForm) {
      this.state.issueForm = {
        country: countryFromQuote,
        travelDate: travelDateFromQuote,
        sumInsured: sumInsuredFromQuote,
        planName: planNameFromQuote,
        issueFor: customerFromQuote,
        nominee: '',
        travellers: customerFromQuote ? [customerFromQuote] : [''],
        phone: defaultPhone,
        email: defaultEmail,
        format: 'format2',
        groupSuffix: '',
        customSubject: null,
        hideEmptyLines: false,
        includeGreetingSignature: false,
        customPreviewText: null
      };
    } else {
      this.state.issueForm.sumInsured = sumInsuredFromQuote;
      this.state.issueForm.planName = planNameFromQuote;
      if (!this.state.issueForm.format) {
        this.state.issueForm.format = 'format2';
      }
      if (!this.state.issueForm.country) {
        this.state.issueForm.country = countryFromQuote;
      }
      if (!this.state.issueForm.travelDate) {
        this.state.issueForm.travelDate = travelDateFromQuote;
      }
      if (!this.state.issueForm.issueFor && customerFromQuote) {
        this.state.issueForm.issueFor = customerFromQuote;
      }
      if ((!this.state.issueForm.travellers || !this.state.issueForm.travellers[0] || !this.state.issueForm.travellers[0].trim()) && customerFromQuote) {
        this.state.issueForm.travellers = [customerFromQuote];
      }
      if (!this.state.issueForm.phone) {
        this.state.issueForm.phone = defaultPhone;
      }
      if (!this.state.issueForm.email) {
        this.state.issueForm.email = defaultEmail;
      }
      this.state.issueForm.customSubject = null;
      this.state.issueForm.customPreviewText = null;
    }

    const mountEl = this.container?.querySelector('#step3Mount');
    if (mountEl) {
      mountEl.innerHTML = this._renderIssueStepSection();
      this._updateIssuePreview();
    } else {
      this._refresh();
    }

    if (shouldScroll) {
      setTimeout(() => {
        const step3El = this.container?.querySelector('#step3IssueSection');
        if (step3El) {
          step3El.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    }
  }

  async _copyRichFormattedToClipboardSilently() {
    const isCustom = this.state.issueForm.customPreviewText !== null;
    const previewEl = this.container?.querySelector('#issueMessagePreview');
    const plainText = isCustom ? (previewEl?.value || '') : this._buildIssueMessage(this.state.issueForm, 'plain');
    const htmlText = isCustom
      ? (previewEl?.value || '').replace(/\n/g, '<br>')
      : this._buildIssueMessage(this.state.issueForm, 'html').split('\n\n').map(p => `<p style="margin: 0 0 10pt 0; font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000000;">${p.replace(/\n/g, '<br>')}</p>`).join('');

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlText], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob
          })
        ]);
        return true;
      }
    } catch (err) {
      console.warn('Silent rich copy error:', err);
    }
    return false;
  }

  async _handleCopyIssueMessage() {
    if (!this._validateIssueForm()) {
      return;
    }

    const previewEl = this.container?.querySelector('#issueMessagePreview');
    const isCustom = this.state.issueForm.customPreviewText !== null;
    const plainText = isCustom ? (previewEl?.value || '') : this._buildIssueMessage(this.state.issueForm, 'plain');
    const htmlText = isCustom
      ? (previewEl?.value || '').replace(/\n/g, '<br>')
      : this._buildIssueMessage(this.state.issueForm, 'html').split('\n\n').map(p => `<p style="margin: 0 0 10pt 0; font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000000;">${p.replace(/\n/g, '<br>')}</p>`).join('');

    try {
      let copied = false;
      if (navigator.clipboard && window.ClipboardItem && !isCustom) {
        try {
          const textBlob = new Blob([plainText], { type: 'text/plain' });
          const htmlBlob = new Blob([htmlText], { type: 'text/html' });
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/plain': textBlob,
              'text/html': htmlBlob
            })
          ]);
          copied = true;
        } catch (clipErr) {
          console.warn('Rich clipboard write failed, fallback to writeText:', clipErr);
        }
      }

      if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(plainText);
          copied = true;
        } catch (clipErr) {
          console.warn('Clipboard writeText failed, fallback to execCommand:', clipErr);
        }
      }

      if (!copied) {
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = plainText;
        tempTextarea.style.position = 'fixed';
        tempTextarea.style.opacity = '0';
        document.body.appendChild(tempTextarea);
        tempTextarea.focus();
        tempTextarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(tempTextarea);
      }

      const btn = this.container?.querySelector('#btnCopyIssueMsg');
      const labelSpan = btn?.querySelector('.btn-copy-label');
      if (labelSpan) {
        labelSpan.textContent = '✓ Copied!';
        btn.classList.add('btn-copied-state');
        setTimeout(() => {
          labelSpan.textContent = 'Copy message';
          btn.classList.remove('btn-copied-state');
        }, 2000);
      }

      this.app.showToast('✓ Bold formatted details copied! (Ready to paste in Outlook or Word)', 'success');
    } catch (err) {
      this.app.showToast('Failed to copy: ' + err.message, 'error');
    }
  }

  async _handleShareWhatsApp() {
    if (!this._validateIssueForm()) {
      return;
    }

    const previewEl = this.container?.querySelector('#issueMessagePreview');
    const isCustom = this.state.issueForm.customPreviewText !== null;
    const bodyMsg = isCustom ? (previewEl?.value || '') : this._buildIssueMessage(this.state.issueForm, 'whatsapp');

    // Include standardized subject line in uppercase at top for WhatsApp
    const subject = this._buildIssueSubject(this.state.issueForm);
    const textToShare = `*${subject}*\n\n${bodyMsg}`;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.innerWidth <= 768 && !!navigator.share);

    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: subject,
          text: textToShare
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('navigator.share failed, fallback to WhatsApp:', err);
      }
    }

    const waUrl = `https://wa.me/?text=${encodeURIComponent(textToShare)}`;
    window.open(waUrl, '_blank');
  }

  async _handleSendIssueEmail(forceModal = false) {
    if (!this._validateIssueForm()) {
      return;
    }

    // Automatically copy the rich bold HTML to clipboard so the user can paste (Ctrl+V) with bold styling!
    await this._copyRichFormattedToClipboardSilently();

    const savedPref = localStorage.getItem('kt_preferred_email_client');
    if (!forceModal && savedPref) {
      if (savedPref === 'web') {
        this._launchOutlookWeb();
        return;
      }
      if (savedPref === 'desktop') {
        this._launchOutlookDesktop();
        return;
      }
      if (savedPref === 'default') {
        this._launchDefaultMail();
        return;
      }
    }

    this._showOutlookEmailModal();
  }

  _getEmailPayload() {
    const previewEl = this.container?.querySelector('#issueMessagePreview');
    const textToShare = previewEl ? previewEl.value : this._buildIssueMessage(this.state.issueForm, 'plain');
    const f = this.state.issueForm || {};

    // Standardized uppercase subject line: ISSUE TRAVEL INSURANCE POLICY OF <NAME> & FAMILY / & GROUP
    const subject = this._buildIssueSubject(f);

    // Default sender account login_hint for Microsoft 365 / Outlook on the Web
    const loginHint = 'customercare@khannatravels.com';
    // If a recipient distinct from customercare@khannatravels.com was typed in, use it as To:
    const recipient = (f.email && f.email.toLowerCase() !== 'customercare@khannatravels.com') ? f.email.trim() : '';

    return {
      to: recipient,
      subject,
      body: textToShare,
      loginHint
    };
  }

  _launchOutlookWeb(customRecipient = null) {
    const { to, subject, body, loginHint } = this._getEmailPayload();
    const finalTo = customRecipient !== null ? customRecipient : to;

    let url = `https://outlook.office.com/mail/deeplink/compose?login_hint=${encodeURIComponent(loginHint)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (finalTo) {
      url += `&to=${encodeURIComponent(finalTo)}`;
    }

    window.open(url, '_blank');
    this.app.showToast('Opened Outlook Web! Bold details copied to clipboard (press Ctrl+V to paste with bold)', 'success');
  }

  _launchOutlookDesktop(customRecipient = null) {
    const { to, subject, body } = this._getEmailPayload();
    const finalTo = customRecipient !== null ? customRecipient : to;

    const mailtoUrl = `mailto:${encodeURIComponent(finalTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    this.app.showToast('Opening Outlook app... Bold details copied to clipboard (press Ctrl+V to paste with bold)', 'success');
  }

  _launchDefaultMail(customRecipient = null) {
    const { to, subject, body } = this._getEmailPayload();
    const finalTo = customRecipient !== null ? customRecipient : to;

    const mailtoUrl = `mailto:${encodeURIComponent(finalTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    this.app.showToast('Opening email application... Bold details copied to clipboard (press Ctrl+V to paste with bold)', 'success');
  }

  _showOutlookEmailModal() {
    const existing = document.getElementById('outlookEmailModal');
    if (existing) existing.remove();

    const payload = this._getEmailPayload();
    const savedPref = localStorage.getItem('kt_preferred_email_client') || '';

    const modalHtml = `
      <div id="outlookEmailModal" style="
        position: fixed; inset: 0; z-index: 1060;
        background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center; padding: 20px;
      ">
        <div style="
          background: #ffffff; border-radius: 16px;
          box-shadow: 0 25px 60px rgba(0,0,0,0.25);
          width: 100%; max-width: 490px; overflow: hidden;
          border: 1px solid #dbe3ee; font-family: inherit;
        ">
          <!-- Header -->
          <div style="
            padding: 18px 22px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
            display: flex; align-items: center; justify-content: space-between;
          ">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 22px;">📧</span>
              <div>
                <div style="font-size: 16px; font-weight: 800; color: #17325f;">Send via Outlook</div>
                <div style="font-size: 12px; color: #64748b;">Account: <strong>customercare@khannatravels.com</strong></div>
              </div>
            </div>
            <button type="button" id="btnCloseOutlookModal" aria-label="Close" style="background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
          </div>

          <!-- Body -->
          <div style="padding: 22px 24px;">
            <!-- Subject Preview Banner -->
            <div style="margin-bottom: 12px; padding: 10px 12px; background: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12px; color: #334155; word-break: break-word;">
              <span style="font-weight: 800; color: #17325f;">Subject:</span> ${this._esc(payload.subject)}
            </div>

            <!-- Bold Formatting Tip -->
            <div style="margin-bottom: 14px; padding: 10px 12px; background: #e0f2fe; border-radius: 8px; border: 1px solid #bae6fd; font-size: 12px; color: #0369a1; line-height: 1.4;">
              ✨ <strong>Bold Details Copied:</strong> The bold formatted details are on your clipboard. When Outlook opens, press <strong>Ctrl+V</strong> to paste with bold highlights!
            </div>

            <!-- Recipient input -->
            <div style="margin-bottom: 18px;">
              <label for="omRecipientEmail" style="display: block; font-size: 12.5px; font-weight: 700; color: #14233f; margin-bottom: 6px;">
                Send To (Recipient Email) <span style="font-weight: 500; color: #64748b;">(Optional)</span>
              </label>
              <input type="email" id="omRecipientEmail" placeholder="e.g. insurer / underwriter email or leave blank"
                     value="${this._esc(payload.to)}"
                     style="width: 100%; height: 42px; padding: 0 14px; border: 1px solid #dbe3ee; border-radius: 8px; font-size: 13.5px; box-sizing: border-box; font-family: inherit;" />
              <span style="display: block; font-size: 11.5px; color: #64748b; margin-top: 4px;">You can also enter or select the recipient in Outlook once it opens.</span>
            </div>

            <!-- Choice Options -->
            <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px;">
              <!-- Option 1: Outlook on the Web -->
              <button type="button" id="btnOptOutlookWeb" style="
                display: flex; align-items: center; gap: 14px; padding: 14px 16px;
                border: 2px solid ${savedPref === 'web' ? '#0078d4' : '#dbe3ee'};
                border-radius: 10px; background: ${savedPref === 'web' ? '#f0f7ff' : '#ffffff'};
                text-align: left; cursor: pointer; transition: all 0.15s ease;
              ">
                <div style="font-size: 24px; flex-shrink: 0;">🌐</div>
                <div style="flex: 1;">
                  <div style="font-size: 14px; font-weight: 800; color: #0078d4;">Outlook on the Web (Office 365)</div>
                  <div style="font-size: 11.5px; color: #475569; margin-top: 2px;">
                    Opens in browser &bull; Uses logged-in <strong>customercare@khannatravels.com</strong>
                  </div>
                </div>
                <div style="color: #0078d4; font-weight: 800; font-size: 16px;">→</div>
              </button>

              <!-- Option 2: Outlook Desktop App -->
              <button type="button" id="btnOptOutlookDesktop" style="
                display: flex; align-items: center; gap: 14px; padding: 14px 16px;
                border: 2px solid ${savedPref === 'desktop' ? '#17325f' : '#dbe3ee'};
                border-radius: 10px; background: ${savedPref === 'desktop' ? '#f3f6fb' : '#ffffff'};
                text-align: left; cursor: pointer; transition: all 0.15s ease;
              ">
                <div style="font-size: 24px; flex-shrink: 0;">💻</div>
                <div style="flex: 1;">
                  <div style="font-size: 14px; font-weight: 800; color: #17325f;">Outlook Desktop App</div>
                  <div style="font-size: 11.5px; color: #475569; margin-top: 2px;">
                    Launches Microsoft Outlook application installed on this PC
                  </div>
                </div>
                <div style="color: #17325f; font-weight: 800; font-size: 16px;">→</div>
              </button>

              <!-- Option 3: Default Mail (mailto) -->
              <button type="button" id="btnOptDefaultMail" style="
                display: flex; align-items: center; gap: 14px; padding: 10px 16px;
                border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;
                text-align: left; cursor: pointer;
              ">
                <div style="font-size: 18px; flex-shrink: 0;">✉️</div>
                <div style="flex: 1; font-size: 12.5px; font-weight: 700; color: #334155;">
                  Other / System Default Email App
                </div>
              </button>
            </div>

            <!-- Remember Choice Checkbox -->
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #475569; cursor: pointer; user-select: none;">
              <input type="checkbox" id="chkRememberOutlookPref" ${savedPref ? 'checked' : ''} />
              <span>Remember my choice for 1-click send (use ▾ to change anytime)</span>
            </label>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('outlookEmailModal');

    const closeModal = () => modalEl?.remove();

    modalEl.querySelector('#btnCloseOutlookModal')?.addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });

    const getRecipientInput = () => {
      const inp = modalEl.querySelector('#omRecipientEmail');
      return inp ? inp.value.trim() : '';
    };

    const handlePrefSave = (pref) => {
      const remember = modalEl.querySelector('#chkRememberOutlookPref')?.checked;
      if (remember) {
        localStorage.setItem('kt_preferred_email_client', pref);
      } else {
        localStorage.removeItem('kt_preferred_email_client');
      }
      this._updateEmailButtonLabel();
    };

    modalEl.querySelector('#btnOptOutlookWeb')?.addEventListener('click', () => {
      handlePrefSave('web');
      const rec = getRecipientInput();
      closeModal();
      this._launchOutlookWeb(rec);
    });

    modalEl.querySelector('#btnOptOutlookDesktop')?.addEventListener('click', () => {
      handlePrefSave('desktop');
      const rec = getRecipientInput();
      closeModal();
      this._launchOutlookDesktop(rec);
    });

    modalEl.querySelector('#btnOptDefaultMail')?.addEventListener('click', () => {
      handlePrefSave('default');
      const rec = getRecipientInput();
      closeModal();
      this._launchDefaultMail(rec);
    });
  }

  _updateEmailButtonLabel() {
    const savedPref = localStorage.getItem('kt_preferred_email_client');
    const labelSpan = this.container?.querySelector('#labelIssueEmailBtn');
    if (labelSpan) {
      if (savedPref === 'web') labelSpan.textContent = 'Outlook Web';
      else if (savedPref === 'desktop') labelSpan.textContent = 'Outlook App';
      else labelSpan.textContent = 'Outlook Email';
    }
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

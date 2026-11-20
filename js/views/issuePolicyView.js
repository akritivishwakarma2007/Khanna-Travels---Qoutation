/**
 * Issue Policy View Controller
 * Routes: #issue-policy
 *
 * Implements:
 * - Individual Flow (3 steps: Traveller details -> Verify details -> Dynamic form & Issue)
 * - Group Flow (Traveller details -> Review grid -> [Address] -> Group details -> Issue master policy)
 * - Two entry options: "Upload passport (OCR)" vs "Fill in manually"
 * - Compact quote summary bar on every step with "Change quote" link
 * - Direct URL / refresh with no quote displays "Select a quote first"
 * - Strict in-memory state (privacy-compliant: no personal/passport data in storage)
 */
import { ISSUE_POLICY_CONFIG } from '../issuePolicy/config.js';
import { quoteService } from '../issuePolicy/services/quoteService.js';
import { passportService } from '../issuePolicy/services/passportService.js';
import { policyService } from '../issuePolicy/services/policyService.js';
import { DynamicForm } from '../issuePolicy/components/DynamicForm.js';
import { PassportDropzone } from '../issuePolicy/components/PassportDropzone.js';
import { GroupReviewGrid } from '../issuePolicy/components/GroupReviewGrid.js';
import {
  validateMrzTd3,
  checkNameMatch,
  checkPassportValidity,
  generateMrzTd3
} from '../issuePolicy/mrzUtils.js';
import {
  INDIAN_STATES,
  lookupPinCode,
  parseIndianAddressSync
} from '../issuePolicy/addressUtils.js';

export class IssuePolicyView {
  constructor(app) {
    this.app = app;

    // Active mode: 'individual' | 'group'
    this.mode = 'individual';

    // Currently selected quotation passed from Quotes screen or restored from session
    this.selectedQuote = null;

    // State is maintained in-memory and kept strictly separate between modes
    this.state = {
      individual: {
        step: 1, // 1: Traveller details, 2: Verify details, 3: Issue policy
        entryMethod: 'ocr', // 'ocr' | 'manual'
        quote: null,
        isDirectIssue: false,
        sessionExpired: false,
        directAcceptedQuote: false,
        directMismatchAccepted: false,
        passportFile: null,
        passportBackFile: null,
        extractedData: null,
        verifiedData: null,
        verified: false,
        uploadedFiles: [],
        activePreviewIndex: 0,
        quoteMismatchOverridden: false,
        mrzOverridden: false,
        _lastMismatch: null,
        manualForm: {
          givenNames: '',
          surname: '',
          passportNumber: '',
          nationality: 'IND',
          countryCode: 'IND',
          sex: 'M',
          dob: '',
          placeOfBirth: '',
          placeOfIssue: '',
          issueDate: '',
          expiryDate: '',
          fatherName: '',
          motherName: '',
          spouseName: '',
          address: '',
          pin: ''
        },
        manualErrors: {},
        manualAttested: false,
        policyDetails: {
          email: '',
          mobile: '',
          addressLine: '',
          city: '',
          state: '',
          pinCode: '',
          country: 'India',
          proposer: {
            name: '',
            passportNumber: '',
            dob: '',
            relationship: 'Father'
          },
          proposerErrors: {},
          nominee: {
            name: '',
            relationship: ''
          },
          sameAsProposer: false,
          medicalDeclarationAccepted: false,
          quoteAccepted: false
        },
        formSchema: null,
        formValues: {},
        formErrors: {},
        issuanceResult: null,
        isIssuing: false,
        issuanceError: null
      },
      group: {
        step: 1, // 1: Traveller details, 2: Review travellers, 3: Addresses (if active), 4: Group details, 5: Issue master policy
        entryMethod: 'ocr', // 'ocr' | 'manual'
        manualCount: 6,
        quote: null,
        uploadedFiles: [],
        extractedRows: [],
        addressMode: 'same', // 'same' | 'each'
        sharedAddress: {
          addressLine: '',
          city: '',
          state: '',
          pincode: '',
          country: 'India'
        },
        individualAddresses: {}, // { [rowId]: string }
        formSchema: null,
        formValues: {},
        formErrors: {},
        issuanceResult: null,
        isIssuing: false,
        issuanceError: null,
        gridInstance: null
      }
    };

    this._container = null;
    this.dropzoneInstance = null;
    this.dynamicFormInstance = null;

    // Attempt to restore selected quote from sessionStorage on initial load
    this._ensureSelectedQuote();

    // Pre-initialize dropzone component so file picker is ready on step 1
    this._initIndividualDropzone();
  }

  /**
   * Sets the active selected quote from QuoteView.
   * @param {Object} quoteData
   */
  setSelectedQuote(quoteData) {
    this.selectedQuote = quoteData;
    if (quoteData) {
      this.mode = quoteData.isGroup ? 'group' : 'individual';
      if (this.mode === 'individual') {
        this.state.individual.quote = quoteData;
        this.state.individual.isDirectIssue = (quoteData.source === 'direct');
        this.state.individual.step = (quoteData.source === 'direct') ? 3 : 1;
        this.state.individual.entryMethod = 'ocr';
        this._initManualFormFromQuote(quoteData);
      } else {
        this.state.group.quote = quoteData;
        this.state.group.step = 1;
        this.state.group.entryMethod = 'ocr';
        this.state.group.manualCount = quoteData.travellerCountQuoted || 6;
      }

      try {
        sessionStorage.setItem('kt_selected_quote_for_issue', JSON.stringify(quoteData));
      } catch (e) {
        console.warn('Could not save quote to sessionStorage:', e);
      }
    }
    this.renderView();
  }

  async setDirectIssueQuote(quoteData, issueTraveller) {
    this.selectedQuote = quoteData;
    this.mode = 'individual';
    this.state.individual.quote = quoteData;
    this.state.individual.isDirectIssue = true;
    this.state.individual.step = 3;
    if (issueTraveller) {
      this.state.individual.verifiedData = issueTraveller;
      this.state.individual.extractedData = issueTraveller;
    } else {
      this._ensureDirectIssueDraft();
    }
    try {
      sessionStorage.setItem('kt_selected_quote_for_issue', JSON.stringify(quoteData));
    } catch (e) {
      console.warn('Could not save quote to sessionStorage:', e);
    }
    await this._initIndividualDynamicForm();
    this.renderView();
  }

  returnToDirectD2() {
    this.mode = 'individual';
    this.state.individual.isDirectIssue = true;
    this.state.individual.step = 2;
    this._ensureDirectIssueDraft();
    this.renderView();
  }

  _ensureDirectIssueDraft() {
    if (this.state.individual.verifiedData && this.state.individual.verifiedData.passportNumber) {
      return this.state.individual.verifiedData;
    }
    try {
      const raw = sessionStorage.getItem('kt_direct_issue_draft');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.passportNumber || parsed.givenNames)) {
          this.state.individual.verifiedData = parsed;
          this.state.individual.extractedData = parsed;
          if (parsed.entryMethod) this.state.individual.entryMethod = parsed.entryMethod;
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read direct issue draft:', e);
    }
    return null;
  }

  /**
   * Reads selected quote from memory or sessionStorage.
   * @returns {Object|null}
   */
  _ensureSelectedQuote() {
    if (this.selectedQuote) {
      if (this.mode === 'individual' && !this.state.individual.quote) {
        this.state.individual.quote = this.selectedQuote;
      } else if (this.mode === 'group' && !this.state.group.quote) {
        this.state.group.quote = this.selectedQuote;
      }
      return this.selectedQuote;
    }

    try {
      const saved = sessionStorage.getItem('kt_selected_quote_for_issue');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.quoteId) {
          this.selectedQuote = parsed;
          this.mode = parsed.isGroup ? 'group' : 'individual';
          if (this.mode === 'individual') {
            this.state.individual.quote = parsed;
            this._initManualFormFromQuote(parsed);
          } else {
            this.state.group.quote = parsed;
            this.state.group.manualCount = parsed.travellerCountQuoted || 6;
          }
          return this.selectedQuote;
        }
      }
    } catch (e) {
      console.warn('Error reading stored quote:', e);
    }

    return null;
  }

  /**
   * Clears in-memory data for Individual mode.
   */
  resetIndividualState() {
    const currentQuote = this.selectedQuote;
    this.state.individual = {
      step: 1,
      entryMethod: 'ocr',
      quote: currentQuote,
      isDirectIssue: !currentQuote,
      sessionExpired: false,
      directAcceptedQuote: false,
      directMismatchAccepted: false,
      passportFile: null,
      passportBackFile: null,
      extractedData: null,
      verifiedData: null,
      verified: false,
      uploadedFiles: [],
      activePreviewIndex: 0,
      quoteMismatchOverridden: false,
      mrzOverridden: false,
      _lastMismatch: null,
      manualForm: {
        givenNames: '',
        surname: '',
        passportNumber: '',
        nationality: 'IND',
        countryCode: 'IND',
        sex: 'M',
        dob: '',
        placeOfBirth: '',
        placeOfIssue: '',
        issueDate: '',
        expiryDate: '',
        fatherName: '',
        motherName: '',
        spouseName: '',
        address: '',
        pin: ''
      },
      manualErrors: {},
      manualAttested: false,
      policyDetails: {
        email: '',
        mobile: '',
        addressLine: '',
        city: '',
        state: '',
        pinCode: '',
        country: 'India',
        proposer: {
          name: '',
          passportNumber: '',
          dob: '',
          relationship: 'Father'
        },
        proposerErrors: {},
        nominee: {
          name: '',
          relationship: ''
        },
        sameAsProposer: false,
        medicalDeclarationAccepted: false,
        quoteAccepted: false
      },
      formSchema: null,
      formValues: {},
      formErrors: {},
      issuanceResult: null,
      isIssuing: false,
      issuanceError: null
    };

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('kt_direct_issue_draft');
      }
    } catch {}

    if (currentQuote) {
      this._initManualFormFromQuote(currentQuote);
    }
    this._initIndividualDropzone();
    passportService.resetMockCursor();
    this.renderView();
  }

  /**
   * Clears in-memory data for Group mode.
   */
  resetGroupState() {
    const currentQuote = this.selectedQuote;
    this.state.group = {
      step: 1,
      entryMethod: 'ocr',
      manualCount: currentQuote?.travellerCountQuoted || 6,
      quote: currentQuote,
      uploadedFiles: [],
      extractedRows: [],
      addressMode: 'same',
      sharedAddress: {
        addressLine: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India'
      },
      individualAddresses: {},
      formSchema: null,
      formValues: {},
      formErrors: {},
      issuanceResult: null,
      isIssuing: false,
      issuanceError: null,
      gridInstance: null
    };
    passportService.resetMockCursor();
    this.renderView();
  }

  _initManualFormFromQuote(quote) {
    if (!quote) return;
    const rawName = (quote.travellerName || '').trim();
    let given = '';
    let sur = '';
    if (rawName && rawName.toLowerCase() !== 'customer') {
      // Prompt: "Never split, merge, reorder or move words between the two fields."
      // If only one full name string: put in Given name, leave Surname empty.
      given = rawName;
      sur = '';
    }

    this.state.individual.manualForm = {
      givenNames: given,
      surname: sur,
      passportNumber: '',
      nationality: 'IND',
      countryCode: 'IND',
      sex: 'M',
      dob: quote.dob || '',
      placeOfBirth: '',
      placeOfIssue: '',
      issueDate: '',
      expiryDate: '',
      fatherName: '',
      motherName: '',
      spouseName: '',
      addressLine: '',
      city: '',
      state: '',
      pinCode: '',
      country: 'India',
      address: '',
      pin: ''
    };
    this.state.individual.manualErrors = {};
    this.state.individual.manualAttested = false;
  }

  /**
   * Stepper steps for current mode.
   * Individual: 3 steps (Traveller details -> Verify details -> Issue policy)
   * Group: 5 steps (Traveller details -> Review travellers -> Addresses -> Group details -> Issue master policy)
   */
  getStepperSteps() {
    if (this.mode === 'individual') {
      return [
        { num: 1, label: 'Passport' },
        { num: 2, label: 'Get quotes' },
        { num: 3, label: 'Policy details' },
        { num: 4, label: 'Review' }
      ];
    } else {
      // Group mode
      const hasAddressStep = this._isAddressStepActive();
      const steps = [
        { num: 1, id: 'travellers', label: 'Traveller details' },
        { num: 2, id: 'review', label: 'Review travellers' }
      ];

      if (hasAddressStep) {
        steps.push({ num: 3, id: 'address', label: 'Addresses' });
      }

      steps.push(
        { num: hasAddressStep ? 4 : 3, id: 'details', label: 'Group details' },
        { num: hasAddressStep ? 5 : 4, id: 'issue', label: 'Issue master policy' }
      );

      return steps;
    }
  }

  _isAddressStepActive() {
    const grid = this.state.group.gridInstance;
    if (grid && grid.keptColumns && grid.keptColumns.address === false) {
      return false; // Address column removed in review grid
    }
    return true;
  }

  /**
   * Main view HTML template
   */
  render() {
    const quote = this._ensureSelectedQuote();
    const isDirectIssue = !quote || Boolean(this.state.individual.isDirectIssue);
    this.state.individual.isDirectIssue = isDirectIssue;
    if (!this.mode) {
      this.mode = (quote && quote.isGroup) ? 'group' : 'individual';
    }

    const isInd = this.mode === 'individual';
    const currentStep = isInd ? this.state.individual.step : this.state.group.step;
    const steps = this.getStepperSteps();

    return `
      <div class="issue-policy-app" id="issuePolicyApp">
        <!-- Top Header & Mode Toggle -->
        <header class="issue-header">
          <div class="issue-title-group">
            <h1 class="issue-main-title">Issue Insurance Policy</h1>
            <p class="issue-subtitle">${isDirectIssue && !quote ? 'Scan passport first, get quotes, compare, and issue' : 'Complete passport extraction, data verification, and policy issuance'}</p>
          </div>

          <!-- Mode Switcher -->
          <div class="mode-switch-wrapper" role="radiogroup" aria-label="Policy issuance mode">
            <button
              type="button"
              class="btn-mode ${isInd ? 'active' : ''}"
              id="btnModeIndividual"
              role="radio"
              aria-checked="${isInd}"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
              </svg>
              <span>Individual Policy</span>
            </button>
            <button
              type="button"
              class="btn-mode ${!isInd ? 'active' : ''}"
              id="btnModeGroup"
              role="radio"
              aria-checked="${!isInd}"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
              </svg>
              <span>Group Policy</span>
            </button>
          </div>
        </header>

        <!-- Compact Read-Only Quote Summary Bar (Always visible at top of every step when quote is present) -->
        ${this._renderQuoteSummaryBar(quote)}

        <!-- 3-Step Individual / 5-Step Group Flow Stepper -->
        <nav class="flow-stepper" aria-label="Progress steps">
          <ol class="stepper-list">
            ${steps.map(s => {
              const isCompleted = s.num < currentStep;
              const isCurrent = s.num === currentStep;
              let stepClass = 'stepper-step';
              if (isCompleted) stepClass += ' step-completed';
              if (isCurrent) stepClass += ' step-current';

              return `
                <li class="${stepClass}" ${isCurrent ? 'aria-current="step"' : ''}>
                  <div class="step-indicator">
                    <span class="step-badge">${isCompleted ? '✓' : s.num}</span>
                    <span class="step-name">${s.label}</span>
                  </div>
                </li>
              `;
            }).join('')}
          </ol>
        </nav>

        <!-- Dynamic Step Content Body -->
        <main class="flow-content-area" id="flowContentArea">
          ${isInd ? this._renderIndividualStep(currentStep) : this._renderGroupStep(currentStep)}
        </main>
      </div>
    `;
  }

  /**
   * Render screen when no quote has been selected yet.
   */
  _renderNoQuoteScreen() {
    return `
      <div class="issue-policy-app" id="issuePolicyApp">
        <header class="issue-header">
          <div class="issue-title-group">
            <h1 class="issue-main-title">Issue Insurance Policy</h1>
            <p class="issue-subtitle">Complete passport extraction, data verification, and policy issuance</p>
          </div>
        </header>

        <div class="no-quote-container" role="region" aria-label="No quotation selected">
          <div class="no-quote-card">
            <div class="no-quote-icon-badge" aria-hidden="true">📋</div>
            <h2 class="no-quote-title">Select a quote first</h2>
            <p class="no-quote-desc">
              To issue an insurance policy, please first compare plans and select a quote on the Quotations screen.
            </p>
            <div class="no-quote-actions">
              <button type="button" class="btn-primary btn-go-quote" id="btnGoToQuotesScreen">
                ← Go to Quotes Screen
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Compact read-only quote summary bar.
   * Visible at top of every step with a "Change quote" link back to #quote.
   */
  _renderQuoteSummaryBar(q) {
    if (!q) return '';
    const isGroup = this.mode === 'group' || q.isGroup;
    const premiumFormatted = Number(q.totalPremium || q.estimatedTotal || 0).toLocaleString('en-IN');
    const travellerDisplay = isGroup
      ? `${q.travellerCountQuoted || 6} travellers (${q.travellerName || 'Corporate'})`
      : (q.travellerName || 'Traveller');

    return `
      <div class="quote-summary-bar" role="region" aria-label="Selected quotation summary">
        <div class="qsb-items">
          <div class="qsb-item">
            <span class="qsb-label">Quote ID</span>
            <span class="qsb-val font-mono">${this._esc(q.quoteId || 'QT-PENDING')}</span>
          </div>
          <div class="qsb-item">
            <span class="qsb-label">Plan & Insurer</span>
            <span class="qsb-val font-medium highlight-plan">${this._esc(q.planName || '')} (${this._esc(q.companyName || '')})</span>
          </div>
          <div class="qsb-item">
            <span class="qsb-label">Total Premium</span>
            <span class="qsb-val highlight-price">₹${premiumFormatted} <small class="tax-note">incl. taxes</small></span>
          </div>
          <div class="qsb-item">
            <span class="qsb-label">${isGroup ? 'Group / Travellers' : 'Traveller'}</span>
            <span class="qsb-val">${this._esc(travellerDisplay)}</span>
          </div>
          ${!isGroup ? `
            <div class="qsb-item">
              <span class="qsb-label">Quote DOB</span>
              <span class="qsb-val font-mono">${this._cleanDate(q.dob) || 'Not specified'}</span>
            </div>
          ` : ''}
          <div class="qsb-item">
            <span class="qsb-label">Destination</span>
            <span class="qsb-val">${this._esc(q.destination || 'Worldwide')}</span>
          </div>
          <div class="qsb-item">
            <span class="qsb-label">Travel Dates</span>
            <span class="qsb-val">${this._esc(q.tripStart || 'TBD')} to ${this._esc(q.tripEnd || 'TBD')}</span>
          </div>
        </div>
        <div class="qsb-actions">
          <a href="#quote" class="qsb-change-link" id="linkChangeQuote" title="Return to Quotes screen to choose a different plan">
            Change quote
          </a>
        </div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * INDIVIDUAL FLOW RENDERING (4 STEPS)
   * ───────────────────────────────────────────────────────────────────────── */
  _renderIndividualStep(step) {
    if (this.state.individual.issuanceResult) {
      return this._renderIndividualIssuedScreen();
    }
    const isDirect = Boolean(this.state.individual.isDirectIssue);
    switch (step) {
      case 1:
        return this._renderIndividualStep1();
      case 2:
        return isDirect ? this._renderIndividualDirectStep2() : this._renderIndividualStep2();
      case 3:
        return this._renderIndividualStep3PolicyDetails();
      case 4:
        return this._renderIndividualStep4Review();
      default:
        return `<div class="error-box">Unknown individual step ${step}</div>`;
    }
  }

  /**
   * Step 1: Traveller details
   * Offers 2 large selectable cards: "Upload passport" vs "Fill in manually"
   */
  _renderIndividualStep1() {
    if (!this.dropzoneInstance || this.dropzoneInstance.mode !== 'single') {
      this._initIndividualDropzone();
    }
    const entryMethod = this.state.individual.entryMethod || 'ocr';
    const isOcr = entryMethod === 'ocr';
    const isManual = entryMethod === 'manual';

    const m = this.state.individual.manualForm;
    const errors = this.state.individual.manualErrors || {};

    return `
      <section class="step-card" aria-labelledby="step1Title">
        <div class="step-card-header">
          <div>
            <h2 id="step1Title" class="step-title">Step 1: Traveller Details</h2>
            <p class="step-desc">Choose your preferred entry method. You can upload a passport scan for automated extraction or fill in the details manually.</p>
          </div>
        </div>

        ${this.state.individual.sessionExpired ? `
          <div class="session-expired-alert" role="alert">
            <span>⚠️</span>
            <span>Session expired. Please scan the passport again.</span>
          </div>
        ` : ''}

        ${this.state.individual.isDirectIssue ? `
          <div class="direct-issue-banner-d1" role="status">
            <span class="dib-text">
              No quote selected. Scan passport to start direct issue, or
              <a href="#quote" class="link-pick-quote" id="btnGoToQuotesScreen">Pick an existing quote instead</a>
              <span style="font-size:0.8rem; color:#64748b; margin-left:8px;">(or Select a quote first)</span>.
            </span>
          </div>
        ` : ''}

        <!-- Two Large Selectable Entry Method Cards -->
        <div class="entry-method-grid" role="radiogroup" aria-label="Passport entry method">
          <!-- Card 1: Upload Passport (OCR) -->
          <div
            class="entry-method-card ${isOcr ? 'active' : ''}"
            id="optIndividualEntryOcr"
            role="radio"
            aria-checked="${isOcr}"
            tabindex="0"
          >
            <div class="emc-header">
              <span class="emc-radio"><span class="emc-radio-dot"></span></span>
              <span class="emc-icon" aria-hidden="true">📷</span>
              <div class="emc-titles">
                <h3 class="emc-title">Upload passport</h3>
                <span class="emc-badge emc-badge-rec">Fast OCR Extraction</span>
              </div>
            </div>
            <p class="emc-desc">Upload front page photo or PDF (back page optional). Passport details and MRZ codes are extracted automatically.</p>
          </div>

          <!-- Card 2: Fill In Manually -->
          <div
            class="entry-method-card ${isManual ? 'active' : ''}"
            id="optIndividualEntryManual"
            role="radio"
            aria-checked="${isManual}"
            tabindex="0"
          >
            <div class="emc-header">
              <span class="emc-radio"><span class="emc-radio-dot"></span></span>
              <span class="emc-icon" aria-hidden="true">✍️</span>
              <div class="emc-titles">
                <h3 class="emc-title">Fill in manually</h3>
                <span class="emc-badge emc-badge-manual">Form Entry</span>
              </div>
            </div>
            <p class="emc-desc">Directly type traveller passport details without uploading document files. Pre-fills traveller name and DOB from the quote.</p>
          </div>
        </div>

        <!-- Subview Area: OCR Dropzone or Manual Form -->
        <div class="entry-method-content">
          ${isOcr ? `
            <!-- OCR Path: Passport Document Dropzone -->
            <div class="subview-header">
              <h3 class="subview-title">Upload Passport Document</h3>
              <p class="subview-desc">Upload the front page, or a PDF/photo with both pages. Back page adds address and parents' names.</p>
            </div>

            <div id="dropzoneContainerMount">
              ${this.dropzoneInstance ? this.dropzoneInstance.render() : ''}
            </div>

            <div class="step-action-bar flex-end" style="margin-top:20px;">
              <button
                type="button"
                class="btn-primary"
                id="btnExtractIndividualPassport"
                ${!this.dropzoneInstance || this.dropzoneInstance.files.length === 0 ? 'disabled' : ''}
              >
                Extract details →
              </button>
            </div>
          ` : `
            <!-- Manual Entry Form -->
            <div class="subview-header">
              <h3 class="subview-title">Enter Traveller & Passport Details Manually</h3>
              <p class="subview-desc">Name and date of birth have been pre-filled from your quote. Mandatory fields are marked with an asterisk (*).</p>
            </div>

            <form id="formManualIndividual" class="form-grid-3col" novalidate onsubmit="return false;">
              <!-- 1. Given Name(s) * -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manGivenNames">Given Name(s) <span class="req-star">*</span></label>
                <input
                  type="text"
                  id="manGivenNames"
                  class="dyn-input ${errors.givenNames ? 'field-input-error' : ''}"
                  value="${this._esc(m.givenNames)}"
                  placeholder="e.g. Aarav"
                  required
                />
                ${errors.givenNames ? `<span class="field-error-text">${errors.givenNames}</span>` : ''}
              </div>

              <!-- 2. Surname -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manSurname">Surname</label>
                <input
                  type="text"
                  id="manSurname"
                  class="dyn-input ${errors.surname ? 'field-input-error' : ''}"
                  value="${this._esc(m.surname)}"
                  placeholder="e.g. Sharma (optional if blank on passport)"
                />
                ${errors.surname ? `<span class="field-error-text">${errors.surname}</span>` : ''}
              </div>

              <!-- 3. Passport Number * -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manPassportNumber">Passport Number <span class="req-star">*</span></label>
                <input
                  type="text"
                  id="manPassportNumber"
                  class="dyn-input font-mono ${errors.passportNumber ? 'field-input-error' : ''}"
                  value="${this._esc(m.passportNumber)}"
                  placeholder="e.g. Z1234567"
                  maxlength="9"
                  style="text-transform: uppercase;"
                  required
                />
                ${errors.passportNumber ? `<span class="field-error-text">${errors.passportNumber}</span>` : ''}
              </div>

              <!-- 4. Gender / Sex * -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manSex">Sex <span class="req-star">*</span></label>
                <select id="manSex" class="dyn-input ${errors.sex ? 'field-input-error' : ''}" required>
                  <option value="M" ${m.sex === 'M' ? 'selected' : ''}>M (Male)</option>
                  <option value="F" ${m.sex === 'F' ? 'selected' : ''}>F (Female)</option>
                  <option value="X" ${m.sex === 'X' ? 'selected' : ''}>X (Other)</option>
                </select>
                ${errors.sex ? `<span class="field-error-text">${errors.sex}</span>` : ''}
              </div>

              <!-- 5. Date of Birth * -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manDob">Date of Birth <span class="req-star">*</span></label>
                <input
                  type="date"
                  id="manDob"
                  class="dyn-input ${errors.dob ? 'field-input-error' : ''}"
                  value="${this._esc(m.dob)}"
                  required
                />
                ${errors.dob ? `<span class="field-error-text">${errors.dob}</span>` : ''}
              </div>

              <!-- 6. Date of Expiry * -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manExpiryDate">Date of Expiry <span class="req-star">*</span></label>
                <input
                  type="date"
                  id="manExpiryDate"
                  class="dyn-input ${errors.expiryDate ? 'field-input-error' : ''}"
                  value="${this._esc(m.expiryDate)}"
                  required
                />
                ${errors.expiryDate ? `<span class="field-error-text">${errors.expiryDate}</span>` : ''}
              </div>

              <!-- 7. Nationality -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manNationality">Nationality / Country Code</label>
                <input
                  type="text"
                  id="manNationality"
                  class="dyn-input"
                  value="${this._esc(m.nationality || 'IND')}"
                  placeholder="IND"
                  maxlength="3"
                  style="text-transform: uppercase;"
                />
              </div>

              <!-- 8. Date of Issue -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manIssueDate">Date of Issue</label>
                <input
                  type="date"
                  id="manIssueDate"
                  class="dyn-input ${errors.issueDate ? 'field-input-error' : ''}"
                  value="${this._esc(m.issueDate)}"
                />
                ${errors.issueDate ? `<span class="field-error-text">${errors.issueDate}</span>` : ''}
              </div>

              <!-- 9. Place of Issue -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manPlaceOfIssue">Place of Issue</label>
                <input
                  type="text"
                  id="manPlaceOfIssue"
                  class="dyn-input"
                  value="${this._esc(m.placeOfIssue)}"
                  placeholder="e.g. Delhi"
                />
              </div>

              <!-- 10. Place of Birth -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manPlaceOfBirth">Place of Birth</label>
                <input
                  type="text"
                  id="manPlaceOfBirth"
                  class="dyn-input"
                  value="${this._esc(m.placeOfBirth)}"
                  placeholder="e.g. New Delhi"
                />
              </div>

              <!-- 11. Father's Name -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manFatherName">Father's Name</label>
                <input
                  type="text"
                  id="manFatherName"
                  class="dyn-input"
                  value="${this._esc(m.fatherName)}"
                  placeholder="Father's full name"
                />
              </div>

              <!-- 12. Mother's Name -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manMotherName">Mother's Name</label>
                <input
                  type="text"
                  id="manMotherName"
                  class="dyn-input"
                  value="${this._esc(m.motherName)}"
                  placeholder="Mother's full name"
                />
              </div>

              <!-- 13. Spouse's Name -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manSpouseName">Spouse's Name</label>
                <input
                  type="text"
                  id="manSpouseName"
                  class="dyn-input"
                  value="${this._esc(m.spouseName)}"
                  placeholder="Spouse full name (if married)"
                />
              </div>

              <!-- 14. Address Line -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manAddressLine">Address Line</label>
                <input
                  type="text"
                  id="manAddressLine"
                  class="dyn-input"
                  value="${this._esc(m.addressLine)}"
                  placeholder="House, street, area"
                />
              </div>

              <!-- 15. City -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manCity">City</label>
                <input
                  type="text"
                  id="manCity"
                  class="dyn-input"
                  value="${this._esc(m.city)}"
                  placeholder="City"
                />
              </div>

              <!-- 16. State -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manState">State</label>
                <select id="manState" class="dyn-input">
                  <option value="">Select state...</option>
                  ${INDIAN_STATES.map(s => `<option value="${this._esc(s)}" ${String(m.state || '').toLowerCase() === s.toLowerCase() ? 'selected' : ''}>${this._esc(s)}</option>`).join('')}
                </select>
              </div>

              <!-- 17. PIN Code -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manPinCode">PIN Code (6 digits)</label>
                <input
                  type="text"
                  id="manPinCode"
                  class="dyn-input"
                  value="${this._esc(m.pinCode || m.pin)}"
                  placeholder="e.g. 110001"
                  maxlength="6"
                />
              </div>

              <!-- 18. Country -->
              <div class="dyn-field-group">
                <label class="dyn-label" for="manCountry">Country</label>
                <input
                  type="text"
                  id="manCountry"
                  class="dyn-input"
                  value="${this._esc(m.country || 'India')}"
                  placeholder="India"
                />
              </div>
            </form>

            <div class="step-action-bar flex-end" style="margin-top:20px;">
              <button
                type="button"
                class="btn-primary"
                id="btnContinueManualEntry"
              >
                Continue to Verification →
              </button>
            </div>
          `}
        </div>
      </section>
    `;
  }

  _capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  _evaluatePassportFieldStatus(fieldKey, value, data) {
    const val = (value !== null && value !== undefined) ? String(value).trim() : '';
    const mrzLines = data.mrz || [];
    let mrzData = null;
    if (Array.isArray(mrzLines) && mrzLines.length === 2 && mrzLines[0] && mrzLines[1]) {
      try {
        const l1 = String(mrzLines[0]).trim().padEnd(44, '<').substring(0, 44);
        const l2 = String(mrzLines[1]).trim().padEnd(44, '<').substring(0, 44);
        mrzData = validateMrzTd3(l1, l2);
      } catch (e) {}
    }
    const isLowConfidence = Array.isArray(data.lowConfidence) && data.lowConfidence.includes(fieldKey);

    // If explicitly checked & saved by agent
    if (data.checkedByAgent && data.checkedByAgent[fieldKey]) {
      return { status: 'green', message: 'Checked by agent', icon: '✓' };
    }

    // If backend or parser flagged a specific discrepancy reason for this field
    if (data.fieldDiscrepancies && data.fieldDiscrepancies[fieldKey]) {
      return { status: 'orange', message: data.fieldDiscrepancies[fieldKey], icon: '!' };
    }

    switch (fieldKey) {
      case 'givenNames':
        if (!val) return { status: 'red', message: 'Given name is required and cannot be empty.', icon: '✕' };
        if (mrzData && mrzData.fields?.givenNames) {
          const mGiven = mrzData.fields.givenNames.toUpperCase();
          const pGiven = val.toUpperCase();
          // Long names: the MRZ may be cut short (44 chars). If MRZ name is prefix of printed name, match (not error)
          if (pGiven !== mGiven && !pGiven.startsWith(mGiven)) {
            return { status: 'orange', message: `Code line reads ${mrzData.fields.givenNames}`, icon: '!' };
          }
        }
        if (isLowConfidence) return { status: 'orange', message: 'Low OCR confidence, please check spelling.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'surname':
        if (!val) {
          // If MRZ exists and contains a surname, empty surname is a discrepancy
          if (mrzData && mrzData.fields?.surname) {
            return { status: 'orange', message: `Code line reads ${mrzData.fields.surname}`, icon: '!' };
          }
          if (Array.isArray(mrzLines) && mrzLines[0]) {
            const mrzL1 = String(mrzLines[0]).trim().toUpperCase();
            const emptySurnameOnMrz = mrzL1.startsWith('P<') && mrzL1.substring(5).startsWith('<<');
            if (!emptySurnameOnMrz && mrzL1.length >= 10) {
              return { status: 'orange', message: 'Surname empty, check against passport.', icon: '!' };
            }
          }
          // If MRZ confirms no surname (or no MRZ present, e.g. manual entry): valid and green
          return { status: 'green', message: '', icon: '✓' };
        }
        if (mrzData && mrzData.fields?.surname) {
          const mSurname = mrzData.fields.surname.toUpperCase();
          const pSurname = val.toUpperCase();
          if (pSurname !== mSurname && !pSurname.startsWith(mSurname)) {
            return { status: 'orange', message: `Code line reads ${mrzData.fields.surname}`, icon: '!' };
          }
        }
        if (isLowConfidence) return { status: 'orange', message: 'Low OCR confidence, please check spelling.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'passportNumber':
        if (!val) return { status: 'red', message: 'Passport number is required.', icon: '✕' };
        if (mrzData && mrzData.fields?.checkDigits?.passportNumber && !mrzData.fields.checkDigits.passportNumber.valid) {
          return { status: 'red', message: 'MRZ check digit failed for passport number.', icon: '✕' };
        }
        if (mrzData && mrzData.fields?.passportNumber && val.toUpperCase() !== mrzData.fields.passportNumber.toUpperCase()) {
          return { status: 'red', message: `Printed passport no (${val}) differs from MRZ (${mrzData.fields.passportNumber}).`, icon: '✕' };
        }
        if (isLowConfidence) return { status: 'orange', message: 'Low confidence, verify with document.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'dob':
        if (!val) return { status: 'red', message: 'Date of birth is required.', icon: '✕' };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return { status: 'red', message: 'Invalid date format (YYYY-MM-DD required).', icon: '✕' };
        if (new Date(val) > new Date()) return { status: 'red', message: 'Date of birth cannot be in the future.', icon: '✕' };
        if (mrzData && mrzData.fields?.checkDigits?.dob && !mrzData.fields.checkDigits.dob.valid) {
          return { status: 'red', message: 'MRZ check digit failed for date of birth.', icon: '✕' };
        }
        if (mrzData && mrzData.fields?.dob && val !== mrzData.fields.dob) {
          return { status: 'red', message: `Printed DOB (${val}) differs from MRZ (${mrzData.fields.dob}).`, icon: '✕' };
        }
        if (isLowConfidence) return { status: 'orange', message: 'Low confidence, verify DOB.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'sex':
        if (!val) return { status: 'red', message: 'Gender / Sex is required.', icon: '✕' };
        if (!['M', 'F', 'X'].includes(val.toUpperCase())) return { status: 'red', message: 'Must be M, F, or X.', icon: '✕' };
        return { status: 'green', message: '', icon: '✓' };

      case 'expiryDate':
        if (!val) return { status: 'red', message: 'Date of expiry is required.', icon: '✕' };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return { status: 'red', message: 'Invalid date format (YYYY-MM-DD required).', icon: '✕' };
        if (new Date(val) < new Date()) return { status: 'red', message: 'Passport has expired.', icon: '✕' };
        if (data.issueDate && val <= data.issueDate) return { status: 'red', message: 'Date of expiry must be after date of issue.', icon: '✕' };
        if (mrzData && mrzData.fields?.checkDigits?.expiryDate && !mrzData.fields.checkDigits.expiryDate.valid) {
          return { status: 'red', message: 'MRZ check digit failed for expiry date.', icon: '✕' };
        }
        if (isLowConfidence) return { status: 'orange', message: 'Low confidence, verify expiry date.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'issueDate':
        if (!val) return { status: 'orange', message: 'Date of issue not captured from document.', icon: '!' };
        if (data.expiryDate && val >= data.expiryDate) return { status: 'red', message: 'Date of issue must precede expiry date.', icon: '✕' };
        if (isLowConfidence) return { status: 'orange', message: 'Low confidence, verify issue date.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'nationality':
      case 'countryCode':
        if (!val) return { status: 'orange', message: 'Not captured from document.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'placeOfBirth':
      case 'placeOfIssue':
        if (!val) return { status: 'orange', message: 'Not captured from front page.', icon: '!' };
        if (isLowConfidence) {
          const reason = (data.fieldDiscrepancies && data.fieldDiscrepancies[fieldKey]) ||
                         (data.fieldReasons && data.fieldReasons[fieldKey]) ||
                         'Value was cut short, check against passport';
          return { status: 'orange', message: reason, icon: '!' };
        }
        return { status: 'green', message: '', icon: '✓' };

      case 'fatherName':
        if (!val) return { status: 'orange', message: "Father's name not captured from back page.", icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'motherName':
        if (!val) return { status: 'orange', message: "Mother's name not captured from back page.", icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'spouseName':
        if (!val) return { status: 'orange', message: 'Not captured (optional).', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'addressLine':
        if (!val) return { status: 'orange', message: 'Not captured from back page.', icon: '!' };
        if (isLowConfidence) return { status: 'orange', message: 'Low confidence, verify address.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'city':
        if (!val) return { status: 'orange', message: 'Not captured.', icon: '!' };
        if (data.cityFromLookup) return { status: 'orange', message: 'Filled from PIN lookup, verify.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'state':
        if (!val) return { status: 'orange', message: 'Not captured; select state.', icon: '!' };
        if (data.stateMismatchMessage) return { status: 'orange', message: data.stateMismatchMessage, icon: '!' };
        if (data.stateFromLookup) return { status: 'orange', message: 'Filled from PIN lookup, verify.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'pinCode':
      case 'pin':
        if (!val) return { status: 'orange', message: 'Postal PIN not captured.', icon: '!' };
        if (!/^\d{6}$/.test(val)) return { status: 'orange', message: 'PIN code should be 6 digits.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'country':
        if (!val) return { status: 'orange', message: 'Not captured; default is India.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'fileNumber':
        if (!val) return { status: 'orange', message: 'File number not captured.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      case 'address':
        if (!val) return { status: 'orange', message: 'Address not captured from back page.', icon: '!' };
        return { status: 'green', message: '', icon: '✓' };

      default:
        return val ? { status: 'green', message: '', icon: '✓' } : { status: 'orange', message: 'Not captured.', icon: '!' };
    }
  }

  /**
   * Screen D2: Direct Issue Passport details (no quote selected yet)
   */
  _renderIndividualDirectStep2() {
    const data = this._ensureDirectIssueDraft() || this.state.individual.verifiedData || this.state.individual.extractedData;
    if (!data) {
      this.state.individual.sessionExpired = true;
      this.state.individual.step = 1;
      return this._renderIndividualStep1();
    }

    const uploadedFiles = this.state.individual.uploadedFiles || [];
    const activeIdx = this.state.individual.activePreviewIndex || 0;
    const activeFile = uploadedFiles[activeIdx] || uploadedFiles[0] || null;
    const isManual = this.state.individual.entryMethod === 'manual';
    const fullName = `${data.givenNames || ''} ${data.surname || ''}`.trim();
    const age = this._calculateAge(data.dob);

    // Document found statuses
    const foundStatus = {
      front: Boolean(data.givenNames || data.passportNumber),
      back: Boolean(data.fatherName || data.motherName || data.address || data.pin),
      codeLines: Boolean(data.mrz && data.mrz.length === 2 && data.mrz[0].length === 44 && data.mrz[1].length === 44)
    };

    // Calculate red count for button disabled state
    const allFieldKeys = [
      'givenNames', 'surname', 'passportNumber', 'dob', 'sex', 'nationality',
      'countryCode', 'issueDate', 'expiryDate', 'placeOfBirth', 'placeOfIssue',
      'fatherName', 'motherName', 'spouseName', 'pinCode', 'addressLine', 'city', 'state', 'country', 'fileNumber', 'address'
    ];
    let hasRedFields = false;
    allFieldKeys.forEach(k => {
      const evalRes = this._evaluatePassportFieldStatus(k, data[k], data);
      if (evalRes.status === 'red') hasRedFields = true;
    });

    // Left Column Preview HTML
    let leftPreviewHtml = '';
    if (activeFile && activeFile.previewUrl) {
      const isPdf = activeFile.isPdf;
      const hasMultipleFiles = uploadedFiles.length > 1;

      leftPreviewHtml = `
        <div class="passport-doc-card">
          <div class="passport-doc-header">
            <h3 class="passport-doc-title">
              <span>📄</span>
              <span>Passport Document</span>
            </h3>
            <span class="passport-doc-badge">${isPdf ? 'PDF Document' : 'Passport Image'}</span>
          </div>

          ${hasMultipleFiles ? `
            <div class="passport-page-tabs" role="tablist">
              ${uploadedFiles.map((f, i) => `
                <button
                  type="button"
                  class="btn-page-tab ${i === activeIdx ? 'active' : ''}"
                  data-preview-idx="${i}"
                  role="tab"
                  aria-selected="${i === activeIdx}"
                >
                  ${i === 0 ? 'Page 1 (Front)' : (i === 1 ? 'Page 2 (Back)' : `Page ${i + 1}`)}
                </button>
              `).join('')}
            </div>
          ` : ''}

          ${isPdf ? `
            <iframe src="${activeFile.previewUrl}#toolbar=0" class="passport-pdf-frame" title="Passport PDF Preview"></iframe>
          ` : `
            <div class="passport-preview-viewport">
              <img src="${activeFile.previewUrl}" alt="Passport document scan" class="passport-doc-img" />
            </div>
          `}

          <div class="passport-doc-footer">
            <span style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;" title="${this._esc(activeFile.name)}">
              ${this._esc(activeFile.name)}
            </span>
            <a href="${activeFile.previewUrl}" target="_blank" rel="noopener noreferrer" class="btn-preview-link">
              ↗ Open full document
            </a>
          </div>
        </div>
      `;
    } else {
      leftPreviewHtml = `
        <div class="passport-page-mock" style="margin-bottom:0;">
          <div class="passport-page-header">
            <span class="flag-icon">🇮🇳</span>
            <span class="passport-title">PASSPORT DATA PAGE</span>
            <span class="country-name">${this._esc(data.countryCode || data.nationality || 'IND')}</span>
          </div>
          <div style="text-align: center; padding: 28px 14px; color: #5c4e38;">
            <div style="font-size: 3rem; margin-bottom: 8px;">🛂</div>
            <div style="font-weight: 800; font-size: 1.15rem; letter-spacing: 0.05em;">PASSPORT OF INDIA</div>
            <div style="font-size: 0.85rem; color: #78684d; margin-top: 4px;">REPUBLIC OF INDIA</div>
            <div style="margin-top: 20px; font-family: monospace; font-weight: 700; font-size: 1.05rem; color: #1e293b;">
              ${this._cleanStr(data.passportNumber) || 'PASSPORT NUMBER'}
            </div>
          </div>
        </div>
      `;
    }

    const renderDirectField = (key, label, type = 'text', req = false, extraAttrs = '', isTextarea = false, isSelect = false, options = []) => {
      const val = data[key] || '';
      const evalRes = this._evaluatePassportFieldStatus(key, val, data);
      return `
        <div class="field-group" data-field-group="${key}">
          <label for="viz${this._capitalize(key)}" class="field-label">
            <span>${label} ${req ? '<span class="req-star">*</span>' : ''}</span>
            <span class="field-badge-icon badge-${evalRes.status}">${evalRes.icon}</span>
          </label>
          ${isSelect ? `
            <select
              id="viz${this._capitalize(key)}"
              class="field-input border-${evalRes.status}"
              ${extraAttrs}
            >
              <option value="">Select state...</option>
              ${options.map(opt => `<option value="${this._cleanStr(opt)}" ${String(val).toLowerCase() === String(opt).toLowerCase() ? 'selected' : ''}>${this._cleanStr(opt)}</option>`).join('')}
            </select>
          ` : (isTextarea ? `
            <textarea
              id="viz${this._capitalize(key)}"
              class="field-input field-textarea border-${evalRes.status}"
              rows="2"
              ${extraAttrs}
            >${this._cleanStr(val)}</textarea>
          ` : `
            <input
              type="${type}"
              id="viz${this._capitalize(key)}"
              class="field-input border-${evalRes.status}"
              value="${this._cleanStr(val)}"
              ${extraAttrs}
            />
          `)}
          ${evalRes.message ? `<div class="field-reason-text field-reason-${evalRes.status}">${evalRes.message}</div>` : ''}
          ${key === 'dob' ? `<div class="dob-calc-age-tag">Age: <strong>${age !== null ? age + ' years' : '—'}</strong> (used for plan pricing)</div>` : ''}
        </div>
      `;
    };

    return `
      <section class="step-card" aria-labelledby="step2Title">
        <!-- Direct Issue Top Banner -->
        <div class="direct-issue-banner-d2" role="status">
          <span class="dib-d2-text">
            No quote selected. Passport read. Next, get quotes for <strong>${this._esc(fullName || 'Traveller')}</strong>.
          </span>
          <a href="#quote" class="dib-d2-link" id="linkPickExistingQuote">Pick an existing quote instead</a>
        </div>

        <div class="step-card-header">
          <div class="header-left">
            <h2 id="step2Title" class="step-title">Step 2: Passport Details</h2>
            <p class="step-desc">All passport fields are validated below. Correct any red fields, then proceed to get live quotes.</p>
          </div>
        </div>

        <!-- Small Legend Bar -->
        <div class="direct-legend-bar" role="region" aria-label="Field status legend">
          <div class="legend-swatches">
            <span class="legend-swatch swatch-green">● Correct</span>
            <span class="legend-swatch swatch-orange">● Check this</span>
            <span class="legend-swatch swatch-red">● Must fix</span>
          </div>
          <div class="legend-found-chips">
            <span class="found-chip ${foundStatus.front ? 'chip-found' : 'chip-missing'}">Front page ${foundStatus.front ? '✓' : '✕'}</span>
            <span class="found-chip ${foundStatus.back ? 'chip-found' : 'chip-missing'}">Back page ${foundStatus.back ? '✓' : '✕'}</span>
            <span class="found-chip ${foundStatus.codeLines ? 'chip-found' : 'chip-missing'}">Code lines ${foundStatus.codeLines ? '✓' : '✕'}</span>
          </div>
        </div>

        <!-- 2-Column Split Layout -->
        <div class="passport-split-layout">
          <!-- LEFT COLUMN: Preview & MRZ -->
          <div class="passport-doc-column">
            ${leftPreviewHtml}
            ${!isManual && data.mrz ? `
              <div class="mrz-display-box" style="margin-top: 14px;" aria-label="Machine Readable Zone code lines">
                <div class="mrz-label">MACHINE READABLE ZONE (ICAO 9303 TD3)</div>
                <code class="mrz-line" id="mrzLine1">${data.mrz[0] || ''}</code>
                <code class="mrz-line" id="mrzLine2">${data.mrz[1] || ''}</code>
              </div>
            ` : ''}
          </div>

          <!-- RIGHT COLUMN: All Fields (Front & Back) -->
          <div class="passport-details-column">
            ${isManual ? `
              <div class="manual-entry-banner" role="status" style="margin-bottom: 0;">
                <span class="manual-badge-pill">✍️ ENTERED MANUALLY</span>
                <span>Passport details were entered manually.</span>
              </div>
            ` : ''}

            <!-- 1. Front Page Details (Data Page) -->
            <div class="details-card-section">
              <div class="details-section-header">
                <h3 class="details-section-title">
                  <span>👤</span>
                  <span>Front Page Details (Data Page)</span>
                </h3>
                <span class="details-section-tag">Front Page</span>
              </div>

              <div class="details-grid">
                ${renderDirectField('givenNames', 'Given Name(s)', 'text', true, 'placeholder="Given Names"')}
                ${renderDirectField('surname', 'Surname', 'text', false, 'placeholder="Surname (leave blank if empty on passport)"')}
                ${renderDirectField('passportNumber', 'Passport No.', 'text', true, 'placeholder="Z1234567" style="text-transform: uppercase;" class="font-mono"')}
                ${renderDirectField('dob', 'Date of Birth', 'date', true)}
                ${renderDirectField('sex', 'Sex / Gender', 'text', true, 'maxlength="1" style="text-transform: uppercase;" placeholder="M, F, or X"')}
                ${renderDirectField('nationality', 'Nationality', 'text', false, 'placeholder="IND" maxlength="3" style="text-transform: uppercase;"')}
                ${renderDirectField('countryCode', 'Country Code', 'text', false, 'placeholder="IND" maxlength="3" style="text-transform: uppercase;"')}
                ${renderDirectField('issueDate', 'Date of Issue', 'date', false)}
                ${renderDirectField('expiryDate', 'Date of Expiry', 'date', true)}
                ${renderDirectField('placeOfBirth', 'Place of Birth', 'text', false, 'placeholder="Place of birth"')}
                ${renderDirectField('placeOfIssue', 'Place of Issue', 'text', false, 'placeholder="Place of issue"')}
              </div>
            </div>

            <!-- 2. Back Page Details (Address & Parents) -->
            <div class="details-card-section">
              <div class="details-section-header">
                <h3 class="details-section-title">
                  <span>🏠</span>
                  <span>Back Page Details (Address &amp; Family)</span>
                </h3>
                <span class="details-section-tag">Back Page / PDF</span>
              </div>

              <div class="details-grid">
                ${renderDirectField('fatherName', "Father's / Guardian's Name", 'text', false, 'placeholder="Father\'s full name"')}
                ${renderDirectField('motherName', "Mother's Name", 'text', false, 'placeholder="Mother\'s full name"')}
                ${renderDirectField('spouseName', "Spouse's Name", 'text', false, 'placeholder="Spouse\'s name (if married)"')}
                ${renderDirectField('fileNumber', 'File Number', 'text', false, 'placeholder="D0123456"')}
                ${renderDirectField('addressLine', 'Address Line', 'text', false, 'placeholder="House/Street/Area"')}
                ${renderDirectField('city', 'City', 'text', false, 'placeholder="City"')}
                ${renderDirectField('state', 'State', 'text', false, '', false, true, INDIAN_STATES)}
                ${renderDirectField('pinCode', 'PIN Code', 'text', false, 'placeholder="110001" maxlength="6"')}
                ${renderDirectField('country', 'Country', 'text', false, 'placeholder="India"')}
                <div class="form-group-full">
                  ${renderDirectField('address', 'Full Residential Address', 'text', false, 'placeholder="House/Flat No., Street, Landmark, City, State"', true)}
                </div>
              </div>
            </div>

            <!-- Navigation Buttons -->
            <div class="step-action-bar space-between" style="margin-top: 10px;">
              <button type="button" class="btn-secondary" id="btnDirectBackToScan">
                ← Scan a Different Passport
              </button>
              <button
                type="button"
                class="btn-primary btn-verify-proceed"
                id="btnDirectGetQuotes"
                ${hasRedFields ? 'disabled' : ''}
              >
                Get quotes for this traveller →
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Screen D5: Confirm and issue (delegates to Step 3 Policy details)
   */
  _renderIndividualDirectStep5() {
    return this._renderIndividualStep3PolicyDetails();
  }

  /**
   * Step 2: Verify details
   * Same verification screen with editable fields for both paths.
   * If manual: skips MRZ checks, displays "Entered manually" banner, and requires attestation checkbox.
   * If upload: runs full MRZ checks.
   */
  _renderIndividualStep2() {
    const data = this.state.individual.verifiedData || this.state.individual.extractedData;
    const q = this.state.individual.quote;
    const isManual = this.state.individual.entryMethod === 'manual';

    if (!data) {
      return `
        <div class="error-box">
          <p>No traveller details available. Please return to Step 1.</p>
          <button type="button" class="btn-secondary" id="btnBackToStep1">← Back to Traveller Details</button>
        </div>
      `;
    }

    const uploadedFiles = this.state.individual.uploadedFiles || [];
    const activeIdx = this.state.individual.activePreviewIndex || 0;
    const activeFile = uploadedFiles[activeIdx] || uploadedFiles[0] || null;

    const isVerified = Boolean(this.state.individual.verified);

    // Build Left Column: Passport Preview
    let leftPreviewHtml = '';
    if (activeFile && activeFile.previewUrl) {
      const isPdf = activeFile.isPdf;
      const hasMultipleFiles = uploadedFiles.length > 1;

      leftPreviewHtml = `
        <div class="passport-doc-card">
          <div class="passport-doc-header">
            <h3 class="passport-doc-title">
              <span>📄</span>
              <span>Passport Document</span>
            </h3>
            <span class="passport-doc-badge">${isPdf ? 'PDF Document' : 'Passport Image'}</span>
          </div>

          ${hasMultipleFiles ? `
            <div class="passport-page-tabs" role="tablist">
              ${uploadedFiles.map((f, i) => `
                <button
                  type="button"
                  class="btn-page-tab ${i === activeIdx ? 'active' : ''}"
                  data-preview-idx="${i}"
                  role="tab"
                  aria-selected="${i === activeIdx}"
                >
                  ${i === 0 ? 'Page 1 (Front)' : (i === 1 ? 'Page 2 (Back)' : `Page ${i + 1}`)}
                </button>
              `).join('')}
            </div>
          ` : ''}

          ${isPdf ? `
            <iframe src="${activeFile.previewUrl}#toolbar=0" class="passport-pdf-frame" title="Passport PDF Preview"></iframe>
          ` : `
            <div class="passport-preview-viewport">
              <img src="${activeFile.previewUrl}" alt="Passport document scan" class="passport-doc-img" />
            </div>
          `}

          <div class="passport-doc-footer">
            <span style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;" title="${this._esc(activeFile.name)}">
              ${this._esc(activeFile.name)}
            </span>
            <a href="${activeFile.previewUrl}" target="_blank" rel="noopener noreferrer" class="btn-preview-link">
              ↗ Open full document
            </a>
          </div>
        </div>
      `;
    } else {
      // Manual entry or fallback: Golden Indian Passport Card Simulation
      leftPreviewHtml = `
        <div class="passport-page-mock" style="margin-bottom:0;">
          <div class="passport-page-header">
            <span class="flag-icon">🇮🇳</span>
            <span class="passport-title">PASSPORT DATA PAGE</span>
            <span class="country-name">${this._esc(data.countryCode || data.nationality || 'IND')}</span>
          </div>
          <div style="text-align: center; padding: 28px 14px; color: #5c4e38;">
            <div style="font-size: 3rem; margin-bottom: 8px;">🛂</div>
            <div style="font-weight: 800; font-size: 1.15rem; letter-spacing: 0.05em;">PASSPORT OF INDIA</div>
            <div style="font-size: 0.85rem; color: #78684d; margin-top: 4px;">REPUBLIC OF INDIA</div>
            <div style="margin-top: 20px; font-family: monospace; font-weight: 700; font-size: 1.05rem; color: #1e293b;">
              ${this._cleanStr(data.passportNumber) || 'PASSPORT NUMBER'}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <section class="step-card" aria-labelledby="step2Title">
        <div class="step-card-header">
          <div class="header-left">
            <h2 id="step2Title" class="step-title">Step 2: Verify Details</h2>
            <p class="step-desc">Inspect your uploaded passport on the left and review all extracted details on the right. Edit any field if needed, then confirm to proceed.</p>
          </div>
        </div>

        <!-- 2-Column Split Layout: Left Passport Document / Right All Details -->
        <div class="passport-split-layout">
          <!-- LEFT COLUMN: Passport Document Preview -->
          <div class="passport-doc-column">
            ${leftPreviewHtml}
            ${!isManual && data.mrz ? `
              <div class="mrz-display-box" style="margin-top: 14px;" aria-label="Machine Readable Zone code lines">
                <div class="mrz-label">MACHINE READABLE ZONE (ICAO 9303 TD3)</div>
                <code class="mrz-line" id="mrzLine1">${data.mrz[0] || ''}</code>
                <code class="mrz-line" id="mrzLine2">${data.mrz[1] || ''}</code>
              </div>
            ` : ''}
          </div>

          <!-- RIGHT COLUMN: All Details (Front & Back) -->
          <div class="passport-details-column">
            ${isManual ? `
              <div class="manual-entry-banner" role="status" style="margin-bottom: 0;">
                <span class="manual-badge-pill">✍️ ENTERED MANUALLY</span>
                <span>Passport details were entered manually.</span>
              </div>
            ` : ''}
            <!-- 1. Front Page Details (Data Page) -->
            <div class="details-card-section">
              <div class="details-section-header">
                <h3 class="details-section-title">
                  <span>👤</span>
                  <span>Front Page Details (Data Page)</span>
                </h3>
                <span class="details-section-tag">Front Page</span>
              </div>

              <div class="details-grid">
                <!-- Given Names -->
                <div class="field-group">
                  <label for="vizGivenNames" class="field-label">
                    <span>Given Name(s) <span class="req-star">*</span></span>
                  </label>
                  <input type="text" id="vizGivenNames" class="field-input" value="${this._cleanStr(data.givenNames)}" placeholder="Given Names" />
                </div>

                <!-- Surname -->
                <div class="field-group">
                  <label for="vizSurname" class="field-label">
                    <span>Surname</span>
                  </label>
                  <input type="text" id="vizSurname" class="field-input" value="${this._cleanStr(data.surname)}" placeholder="Surname (optional if blank on passport)" />
                </div>

                <!-- Passport Number -->
                <div class="field-group">
                  <label for="vizPassportNo" class="field-label">
                    <span>Passport No. <span class="req-star">*</span></span>
                  </label>
                  <input type="text" id="vizPassportNo" class="field-input font-mono" value="${this._cleanStr(data.passportNumber)}" placeholder="e.g. Z1234567" style="text-transform: uppercase;" />
                </div>

                <!-- Date of Birth -->
                <div class="field-group">
                  <label for="vizDob" class="field-label">
                    <span>Date of Birth <span class="req-star">*</span></span>
                  </label>
                  <input type="date" id="vizDob" class="field-input" value="${this._cleanDate(data.dob)}" />
                </div>

                <!-- Sex / Gender -->
                <div class="field-group">
                  <label for="vizSex" class="field-label">
                    <span>Sex / Gender <span class="req-star">*</span></span>
                  </label>
                  <select id="vizSex" class="field-input">
                    <option value="M" ${data.sex === 'M' ? 'selected' : ''}>M (Male)</option>
                    <option value="F" ${data.sex === 'F' ? 'selected' : ''}>F (Female)</option>
                    <option value="X" ${data.sex === 'X' ? 'selected' : ''}>X (Other)</option>
                  </select>
                </div>

                <!-- Nationality -->
                <div class="field-group">
                  <label for="vizNationality" class="field-label">
                    <span>Nationality</span>
                  </label>
                  <input type="text" id="vizNationality" class="field-input" value="${this._cleanStr(data.nationality || 'IND')}" placeholder="IND" />
                </div>

                <!-- Country Code -->
                <div class="field-group">
                  <label for="vizCountryCode" class="field-label">
                    <span>Country Code</span>
                  </label>
                  <input type="text" id="vizCountryCode" class="field-input" value="${this._cleanStr(data.countryCode || data.issuingCountry || 'IND')}" placeholder="IND" />
                </div>

                <!-- Date of Issue -->
                <div class="field-group">
                  <label for="vizIssueDate" class="field-label">
                    <span>Date of Issue</span>
                  </label>
                  <input type="date" id="vizIssueDate" class="field-input" value="${this._cleanDate(data.issueDate)}" />
                </div>

                <!-- Date of Expiry -->
                <div class="field-group">
                  <label for="vizExpiryDate" class="field-label">
                    <span>Date of Expiry <span class="req-star">*</span></span>
                  </label>
                  <input type="date" id="vizExpiryDate" class="field-input" value="${this._cleanDate(data.expiryDate)}" />
                </div>

                <!-- Place of Birth -->
                <div class="field-group">
                  <label for="vizPlaceOfBirth" class="field-label">
                    <span>Place of Birth</span>
                  </label>
                  <input type="text" id="vizPlaceOfBirth" class="field-input" value="${this._cleanStr(data.placeOfBirth)}" placeholder="Place of birth" />
                </div>

                <!-- Place of Issue -->
                <div class="field-group">
                  <label for="vizPlaceOfIssue" class="field-label">
                    <span>Place of Issue</span>
                  </label>
                  <input type="text" id="vizPlaceOfIssue" class="field-input" value="${this._cleanStr(data.placeOfIssue)}" placeholder="Place of issue" />
                </div>
              </div>
            </div>

            <!-- 2. Back Page Details (Address & Parents) -->
            <div class="details-card-section">
              <div class="details-section-header">
                <h3 class="details-section-title">
                  <span>🏠</span>
                  <span>Back Page Details (Address &amp; Family)</span>
                </h3>
                <span class="details-section-tag">Back Page / PDF</span>
              </div>

              <div class="details-grid">
                <!-- Father's Name -->
                <div class="field-group">
                  <label for="vizFatherName" class="field-label">
                    <span>Father's / Guardian's Name</span>
                  </label>
                  <input type="text" id="vizFatherName" class="field-input" value="${this._cleanStr(data.fatherName)}" placeholder="Father's full name" />
                </div>

                <!-- Mother's Name -->
                <div class="field-group">
                  <label for="vizMotherName" class="field-label">
                    <span>Mother's Name</span>
                  </label>
                  <input type="text" id="vizMotherName" class="field-input" value="${this._cleanStr(data.motherName)}" placeholder="Mother's full name" />
                </div>

                <!-- Spouse's Name -->
                <div class="field-group">
                  <label for="vizSpouseName" class="field-label">
                    <span>Spouse's Name</span>
                  </label>
                  <input type="text" id="vizSpouseName" class="field-input" value="${this._cleanStr(data.spouseName)}" placeholder="Spouse's name (if married)" />
                </div>

                <!-- File Number -->
                <div class="field-group">
                  <label for="vizFileNumber" class="field-label">
                    <span>File Number</span>
                  </label>
                  <input type="text" id="vizFileNumber" class="field-input" value="${this._cleanStr(data.fileNumber)}" placeholder="e.g. D0123456" />
                </div>

                <!-- Address Line -->
                <div class="field-group">
                  <label for="vizAddressLine" class="field-label">
                    <span>Address Line</span>
                  </label>
                  <input type="text" id="vizAddressLine" class="field-input" value="${this._cleanStr(data.addressLine)}" placeholder="House/Flat No., Street, Area" />
                </div>

                <!-- City -->
                <div class="field-group">
                  <label for="vizCity" class="field-label">
                    <span>City</span>
                  </label>
                  <input type="text" id="vizCity" class="field-input" value="${this._cleanStr(data.city)}" placeholder="City" />
                </div>

                <!-- State -->
                <div class="field-group">
                  <label for="vizState" class="field-label">
                    <span>State</span>
                  </label>
                  <select id="vizState" class="field-input">
                    <option value="">Select state...</option>
                    ${INDIAN_STATES.map(s => `<option value="${this._cleanStr(s)}" ${String(data.state || '').toLowerCase() === s.toLowerCase() ? 'selected' : ''}>${this._cleanStr(s)}</option>`).join('')}
                  </select>
                </div>

                <!-- PIN Code -->
                <div class="field-group">
                  <label for="vizPin" class="field-label">
                    <span>Postal Code / PIN</span>
                  </label>
                  <input type="text" id="vizPin" class="field-input" value="${this._cleanStr(data.pinCode || data.pin)}" placeholder="e.g. 110001" maxlength="6" />
                </div>

                <!-- Country -->
                <div class="field-group">
                  <label for="vizCountry" class="field-label">
                    <span>Country</span>
                  </label>
                  <input type="text" id="vizCountry" class="field-input" value="${this._cleanStr(data.country || 'India')}" placeholder="India" />
                </div>

                <!-- Full Residential Address -->
                <div class="field-group form-group-full">
                  <label for="vizAddress" class="field-label">
                    <span>Full Residential Address</span>
                  </label>
                  <textarea id="vizAddress" class="field-input field-textarea" rows="2" placeholder="House/Flat No., Street, Landmark, City, State">${this._cleanStr(data.address)}</textarea>
                </div>
              </div>
            </div>

            <!-- 3. Simple Verification & Proceed Action Card -->
            <div class="verify-declaration-card">
              <label class="verify-checkbox-row" for="chkVerifyPassportDetails">
                <input type="checkbox" id="chkVerifyPassportDetails" ${isVerified ? 'checked' : ''} />
                <span class="verify-checkbox-text">
                  I have verified these passport details against the document.
                </span>
              </label>
              <p class="verify-quote-sync-note">
                <span>✓</span>
                <span>Passport details will be used directly for policy issuance.</span>
              </p>
            </div>

            <!-- Navigation Buttons -->
            <div class="step-action-bar space-between" style="margin-top: 10px;">
              <button type="button" class="btn-secondary" id="btnBackToStep1">
                ← Back to Traveller Details
              </button>
              <button
                type="button"
                class="btn-primary btn-verify-proceed"
                id="btnConfirmIndividualVerification"
                ${!isVerified ? 'disabled' : ''}
              >
                Verify &amp; Proceed to Issue →
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Evaluates individual verification checks and returns detailed status.
   */
  _evaluateIndividualVerification(data, q, isManual = false) {
    const checks = [];
    const fullName = `${data.givenNames || ''} ${data.surname || ''}`.trim();

    // 1. Placeholder check for quote traveller name
    const quoteName = (q?.travellerName || '').trim();
    const isPlaceholder = !quoteName || /^(customer|traveller|traveller\s*\d+|tbd|na|n\/a)$/i.test(quoteName);

    // 2. Name diff check
    let nameDiffers = false;
    if (!isPlaceholder) {
      nameDiffers = !checkNameMatch(fullName, quoteName);
    }

    // 3. DOB diff check
    const cleanQuoteDob = this._cleanDate(q?.dob);
    const cleanPassportDob = this._cleanDate(data.dob);
    const dobDiffers = Boolean(cleanQuoteDob && cleanPassportDob && cleanQuoteDob !== cleanPassportDob);

    // 4. Age Band Change check (if DOB differs)
    let ageNotice = '';
    let ageQuote = null;
    let agePassport = null;
    if (dobDiffers) {
      ageQuote = this._calculateAge(cleanQuoteDob, q?.tripStart);
      agePassport = this._calculateAge(cleanPassportDob, q?.tripStart);
      if (ageQuote !== null && agePassport !== null) {
        const bandQuote = this._getAgeBand(ageQuote);
        const bandPassport = this._getAgeBand(agePassport);
        if (bandQuote.label !== bandPassport.label) {
          ageNotice = `Age changes from ${ageQuote} to ${agePassport}. The premium may change; the insurer will confirm it at issue.`;
        }
      }
    }

    const hasQuoteMismatch = nameDiffers || dobDiffers;
    const isMismatchOverridden = this.state.individual.quoteMismatchOverridden;

    this.state.individual._lastMismatch = {
      nameDiffers,
      dobDiffers,
      quoteName: q?.travellerName || '',
      passportName: fullName,
      quoteDob: q?.dob || '',
      passportDob: data.dob || '',
      ageNotice
    };

    // Check 1: Name match
    checks.push({
      id: 'name',
      title: '1. Traveller Name Match',
      pass: isPlaceholder || !nameDiffers || isMismatchOverridden,
      isMismatch: nameDiffers,
      explanation: isPlaceholder
        ? `Quote record has placeholder name ("${quoteName || 'Customer'}"). Passport name ("${fullName}") will be used.`
        : (!nameDiffers
          ? `Name matches quote record ("${quoteName}").`
          : (isMismatchOverridden
            ? `Discrepancy overridden: proceeding with passport name ("${fullName}").`
            : `Extracted name ("${fullName || 'None'}") does not match quote record ("${quoteName}").`))
    });

    // Check 2: DOB match
    checks.push({
      id: 'dob',
      title: '2. Date of Birth Match',
      pass: !dobDiffers || isMismatchOverridden,
      isMismatch: dobDiffers,
      explanation: !dobDiffers
        ? (cleanQuoteDob ? `DOB (${cleanPassportDob}) matches quote records.` : `DOB (${cleanPassportDob}) recorded from passport.`)
        : (isMismatchOverridden
          ? `Discrepancy overridden: proceeding with passport DOB (${cleanPassportDob}).`
          : `Entered DOB (${cleanPassportDob || 'None'}) differs from quote (${cleanQuoteDob || 'None'}).`)
    });

    // Check 3: Passport validity past trip end date
    const safetyMargin = ISSUE_POLICY_CONFIG.EXPIRY_SAFETY_MARGIN_MONTHS || 3;
    const validity = checkPassportValidity(data.expiryDate, q?.tripEnd, safetyMargin);
    const expiredBeforeTripEnd = Boolean(data.expiryDate && q?.tripEnd && data.expiryDate < q.tripEnd);
    checks.push({
      id: 'validity',
      title: '3. Passport Expiry vs Trip Return',
      pass: validity.validPastTripEnd && validity.validWithMargin,
      isHardBlocker: expiredBeforeTripEnd,
      explanation: validity.message
    });

    // Check 4: Date of issue before expiry date
    let issueBeforeExpiry = true;
    let issueMsg = 'Date of issue precedes expiry date.';
    if (data.issueDate && data.expiryDate) {
      if (data.issueDate >= data.expiryDate) {
        issueBeforeExpiry = false;
        issueMsg = `Date of issue (${data.issueDate}) must precede expiry date (${data.expiryDate}).`;
      } else {
        issueMsg = `Date of issue (${data.issueDate}) precedes expiry date (${data.expiryDate}).`;
      }
    } else if (!data.issueDate) {
      issueBeforeExpiry = true;
      issueMsg = 'Date of issue not specified (valid).';
    }
    checks.push({
      id: 'issueBeforeExpiry',
      title: '4. Date of Issue Precedes Expiry',
      pass: issueBeforeExpiry,
      isHardBlocker: !issueBeforeExpiry,
      explanation: issueMsg
    });

    // Checks 5 & 6 (OCR only)
    let mrzResult = { valid: true, errors: [] };
    let mrzMatchPass = true;
    let mrzMatchMsg = 'Waived for manual entry';

    if (!isManual) {
      const mrzLines = data.mrz || [];
      if (mrzLines.length === 2) {
        mrzResult = validateMrzTd3(mrzLines[0], mrzLines[1]);
      } else {
        mrzResult = { valid: false, errors: ['No MRZ lines detected'] };
      }

      checks.push({
        id: 'mrzCheckDigits',
        title: '5. ICAO 9303 TD3 Check Digits',
        pass: mrzResult.valid || this.state.individual.mrzOverridden,
        isOverridden: this.state.individual.mrzOverridden,
        explanation: mrzResult.valid
          ? 'All MRZ check digits (passport no, DOB, expiry, composite) are mathematically valid (7-3-1 weight).'
          : (this.state.individual.mrzOverridden
            ? `MRZ check digits overridden by agent (${mrzResult.errors.join('; ')}).`
            : `MRZ validation failed: ${mrzResult.errors.join('; ')}`)
      });

      if (mrzResult.valid && mrzResult.fields) {
        const pPrint = (data.passportNumber || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const pMrz = (mrzResult.fields.passportNumber || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const pMatch = pPrint === pMrz;

        const dPrint = (data.dob || '');
        const dMrz = (mrzResult.fields.dob || '');
        const dMatch = dPrint === dMrz;

        mrzMatchPass = pMatch && dMatch;
        if (mrzMatchPass) {
          mrzMatchMsg = 'Printed passport number and DOB align perfectly with MRZ code lines.';
        } else {
          const mismatches = [];
          if (!pMatch) mismatches.push(`Passport number (Printed: ${pPrint}, MRZ: ${pMrz})`);
          if (!dMatch) mismatches.push(`DOB (Printed: ${dPrint}, MRZ: ${dMrz})`);
          mrzMatchMsg = `Discrepancy detected between printed data and MRZ: ${mismatches.join(', ')}`;
        }
      } else {
        mrzMatchPass = false;
        mrzMatchMsg = 'MRZ lines missing or invalid';
      }

      checks.push({
        id: 'mrzMatch',
        title: '6. Printed Data vs MRZ Consistency',
        pass: mrzMatchPass || this.state.individual.mrzOverridden,
        isOverridden: this.state.individual.mrzOverridden,
        explanation: mrzMatchPass
          ? mrzMatchMsg
          : (this.state.individual.mrzOverridden
            ? `Printed vs MRZ discrepancy overridden by agent.`
            : mrzMatchMsg)
      });
    }

    // Evaluate Hard Blockers (Never Overridable)
    const hardErrors = [];
    if (!data.givenNames || !data.givenNames.trim()) hardErrors.push('Given name is required');
    if (!data.surname || !data.surname.trim()) hardErrors.push('Surname is required');
    if (!data.passportNumber || !data.passportNumber.trim()) hardErrors.push('Passport number is required');
    if (!data.sex) hardErrors.push('Sex is required');
    if (!data.dob || !data.dob.trim()) hardErrors.push('Date of birth is required');
    if (!data.expiryDate || !data.expiryDate.trim()) hardErrors.push('Date of expiry is required');
    if (expiredBeforeTripEnd) hardErrors.push('Passport expires before travel return date');
    if (!issueBeforeExpiry) hardErrors.push('Date of issue must precede expiry date');

    const hasHardBlockers = hardErrors.length > 0;
    const hasMrzFailure = !isManual && (!mrzResult.valid || !mrzMatchPass);
    const mrzResolved = isManual || !hasMrzFailure || this.state.individual.mrzOverridden;
    const quoteMismatchResolved = !hasQuoteMismatch || isMismatchOverridden;
    const manualAttested = !isManual || this.state.individual.manualAttested;

    const canProceed = !hasHardBlockers && quoteMismatchResolved && mrzResolved && manualAttested;

    return {
      checks,
      nameDiffers,
      dobDiffers,
      hasQuoteMismatch,
      ageNotice,
      isMismatchOverridden,
      hasHardBlockers,
      hardErrors,
      hasMrzFailure,
      mrzResolved,
      manualAttested,
      canProceed,
      fullName
    };
  }

  _runIndividualLiveChecks(data, quote, isManual = false) {
    return this._evaluateIndividualVerification(data, quote, isManual).checks;
  }

  _calculateAge(dobStr, refDateStr = null) {
    if (!dobStr) return null;
    const clean = this._cleanDate(dobStr);
    if (!clean) return null;
    const parts = clean.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const [y, m, d] = parts;
    const ref = refDateStr ? new Date(refDateStr) : new Date();
    if (isNaN(ref.getTime())) return null;

    let age = ref.getFullYear() - y;
    const refMonth = ref.getMonth() + 1;
    const refDay = ref.getDate();
    if (refMonth < m || (refMonth === m && refDay < d)) {
      age--;
    }
    return age >= 0 ? age : 0;
  }

  _getAgeBand(age) {
    if (age === null || age === undefined || isNaN(age)) return { label: 'Unknown', min: 0, max: 85 };
    const bands = [
      { label: '0–40 Years', min: 0, max: 40 },
      { label: '41–60 Years', min: 41, max: 60 },
      { label: '61–70 Years', min: 61, max: 70 },
      { label: '71–80 Years', min: 71, max: 80 },
      { label: '81–85 Years', min: 81, max: 85 }
    ];
    return bands.find(b => age >= b.min && age <= b.max) || { label: `${age} Years`, min: age, max: age };
  }

  _formatDateDMY(dateStr) {
    if (!dateStr) return '';
    const clean = this._cleanDate(dateStr);
    if (!clean) return String(dateStr);
    const parts = clean.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
    }
    return clean;
  }

  _isTravellerMinor(dobStr, tripStartStr = null) {
    if (!dobStr) return false;
    const age = this._calculateAge(dobStr, tripStartStr);
    return age !== null && age < 18;
  }

  _checkPassportHasIssues(data) {
    if (!data) return true;
    const primaryKeys = ['givenNames', 'surname', 'passportNumber', 'dob', 'sex', 'nationality', 'expiryDate'];
    for (const k of primaryKeys) {
      const res = this._evaluatePassportFieldStatus(k, data[k], data);
      if (res.status === 'red' || res.status === 'orange') {
        return true;
      }
    }
    if (Array.isArray(data.lowConfidence) && data.lowConfidence.length > 0) {
      return true;
    }
    if (data.fieldDiscrepancies && Object.keys(data.fieldDiscrepancies).length > 0) {
      return true;
    }
    return false;
  }

  _syncAddressData(data) {
    if (!this.state.individual.policyDetails) return;
    const pd = this.state.individual.policyDetails;
    if (!pd.addressLine && data.addressLine) pd.addressLine = data.addressLine;
    if (!pd.city && data.city) pd.city = data.city;
    if (!pd.state && data.state) pd.state = data.state;
    if (!pd.pinCode && (data.pinCode || data.pin)) pd.pinCode = data.pinCode || data.pin;
    if (!pd.country && data.country) pd.country = data.country || 'India';
  }

  _isPolicyDetailsValid(data, q) {
    if (!data || !q) return false;
    if (this._checkPassportHasIssues(data)) return false;

    const pd = this.state.individual.policyDetails || {};

    // 1. Contact: email and mobile
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!pd.email || !emailRegex.test(pd.email.trim())) return false;
    const cleanMobile = String(pd.mobile || '').replace(/[^0-9]/g, '');
    if (cleanMobile.length !== 10 && !(cleanMobile.length === 12 && cleanMobile.startsWith('91'))) return false;

    // 2. Address: must be complete
    const addrLine = (pd.addressLine || data.addressLine || '').trim();
    const city = (pd.city || data.city || '').trim();
    const state = (pd.state || data.state || '').trim();
    const pin = (pd.pinCode || data.pinCode || data.pin || '').toString().trim();
    if (!addrLine || !city || !state || !pin) return false;

    // 3. Proposer (if minor < 18 on tripStart)
    const tripStart = q?.tripStart || new Date().toISOString().slice(0, 10);
    const isMinor = this._isTravellerMinor(data.dob, tripStart);
    if (isMinor) {
      const prop = pd.proposer || {};
      if (!prop.name || !prop.name.trim()) return false;
      if (!prop.passportNumber || !prop.passportNumber.trim()) return false;
      if (!prop.dob || !prop.dob.trim()) return false;
      const propAge = this._calculateAge(prop.dob, tripStart);
      if (propAge === null || propAge < 18) return false;
      if (!prop.relationship || !prop.relationship.trim()) return false;
    }

    // 4. Nominee: name and relationship
    const nom = pd.nominee || {};
    if (!nom.name || !nom.name.trim()) return false;
    if (!nom.relationship || !nom.relationship.trim()) return false;

    // 5. Declarations
    if (!pd.medicalDeclarationAccepted) return false;
    if (!pd.quoteAccepted) return false;

    return true;
  }

  /**
   * Step 3: Policy details (Simplified page asking ONLY what we don't already have)
   */
  _renderIndividualStep3PolicyDetails() {
    const q = this.state.individual.quote;
    const data = this._ensureDirectIssueDraft() || this.state.individual.verifiedData || this.state.individual.extractedData;

    if (!q || !data) {
      this.state.individual.sessionExpired = true;
      this.state.individual.step = 1;
      return this._renderIndividualStep1();
    }

    this._syncAddressData(data);
    const pd = this.state.individual.policyDetails;

    // Traveller compact summary
    const given = (data.givenNames || '').trim();
    const sur = (data.surname || '').trim();
    const fullName = `${given} ${sur}`.trim();
    const passNo = data.passportNumber || '—';
    const dobFormatted = this._formatDateDMY(data.dob);
    const tripStart = q?.tripStart || new Date().toISOString().slice(0, 10);
    const travellerAge = this._calculateAge(data.dob, tripStart);
    const ageDisplay = travellerAge !== null ? `(age ${travellerAge})` : '';
    const sexDisplay = (data.sex || 'M').toUpperCase();
    const natDisplay = (data.nationality || 'IND').toUpperCase();

    // Check if any passport field is orange or red
    const hasPassportIssues = this._checkPassportHasIssues(data);

    // Address verification: check if complete
    const addrLine = (pd.addressLine || data.addressLine || '').trim();
    const city = (pd.city || data.city || '').trim();
    const state = (pd.state || data.state || '').trim();
    const pin = (pd.pinCode || data.pinCode || data.pin || '').toString().trim();
    const country = (pd.country || data.country || 'India').trim();
    const hasCompleteAddress = Boolean(addrLine && city && state && pin);

    // Minor proposer check
    const isMinor = this._isTravellerMinor(data.dob, tripStart);
    const prop = pd.proposer || {};
    const propAge = prop.dob ? this._calculateAge(prop.dob, tripStart) : null;
    const isPropUnder18 = Boolean(prop.dob && propAge !== null && propAge < 18);

    // Nominee
    const nom = pd.nominee || {};

    // Premium formatted
    const totalPremiumFormatted = Number(q.totalPremium || q.estimatedTotal || 0).toLocaleString('en-IN');

    // Validation
    const canProceed = this._isPolicyDetailsValid(data, q);

    return `
      <section class="step-card policy-details-card-view" aria-labelledby="step3PolicyDetailsTitle">
        <div class="step-card-header">
          <div>
            <h2 id="step3PolicyDetailsTitle" class="step-title">Step 3: Policy details</h2>
            <p class="step-desc">Provide contact and nominee information to complete the policy. Verified passport information is kept locked.</p>
          </div>
        </div>

        <!-- 3.1 Traveller (Read-Only Summary) -->
        <div class="traveller-compact-row" role="region" aria-label="Traveller summary">
          <div class="traveller-compact-info">
            <span class="traveller-compact-icon" aria-hidden="true">👤</span>
            <span class="traveller-compact-text">
              <strong>${this._esc(fullName)}</strong> · Passport <strong>${this._esc(passNo)}</strong> · DOB <strong>${this._esc(dobFormatted)}</strong> ${ageDisplay} · <strong>${this._esc(sexDisplay)}</strong> · <strong>${this._esc(natDisplay)}</strong>
            </span>
          </div>
          <a href="#" class="edit-passport-link" id="linkEditPassportStep3">Edit passport details</a>
        </div>

        ${hasPassportIssues ? `
          <div class="passport-checking-alert" role="alert">
            <span class="alert-icon">⚠️</span>
            <span class="alert-text">Some passport details need checking</span>
            <a href="#" class="edit-passport-link" id="linkEditPassportNotice">Edit passport details</a>
          </div>
        ` : ''}

        <!-- 3.2 Contact & Address Section -->
        <div class="details-card-section" style="margin-top: 20px;">
          <div class="details-section-header">
            <h3 class="details-section-title">
              <span>📞</span>
              <span>Contact</span>
            </h3>
          </div>

          <div class="form-row-2col">
            <div class="field-group">
              <label class="field-label" for="inputContactEmail">
                <span>Email address*</span>
              </label>
              <input
                type="email"
                id="inputContactEmail"
                class="field-input"
                placeholder="traveller@example.com"
                value="${this._esc(pd.email || '')}"
                required
              />
            </div>
            <div class="field-group">
              <label class="field-label" for="inputContactMobile">
                <span>Mobile phone* (10 digits)</span>
              </label>
              <div class="input-prefix-wrapper">
                <span class="input-prefix">+91</span>
                <input
                  type="tel"
                  id="inputContactMobile"
                  class="field-input prefix-padded"
                  placeholder="9876543210"
                  maxlength="10"
                  value="${this._esc(pd.mobile || '')}"
                  required
                />
              </div>
            </div>
          </div>

          <!-- Address Display: Read-only if complete, missing fields if incomplete -->
          <div class="address-display-wrapper" style="margin-top: 14px;">
            ${hasCompleteAddress ? `
              <div class="read-only-address-card" role="region" aria-label="Residential address from passport">
                <div class="ro-addr-header">
                  <span class="ro-addr-val">Address: ${this._esc(addrLine)}, ${this._esc(city)}, ${this._esc(state)} ${this._esc(pin)}, ${this._esc(country)}</span>
                </div>
              </div>
            ` : `
              <div class="missing-address-card">
                <div class="missing-address-header">
                  <span class="missing-addr-badge">ℹ️ Incomplete Passport Address</span>
                  <span class="missing-addr-desc">Please fill the missing address fields below (one source of truth):</span>
                </div>
                <div class="details-grid" style="margin-top: 10px;">
                  ${!addrLine ? `
                    <div class="field-group form-group-full">
                      <label class="field-label" for="inputPolicyAddressLine"><span>Address Line*</span></label>
                      <input type="text" id="inputPolicyAddressLine" class="field-input" placeholder="House/Flat No., Street, Area" value="${this._esc(pd.addressLine || '')}" />
                    </div>
                  ` : ''}
                  ${!city ? `
                    <div class="field-group">
                      <label class="field-label" for="inputPolicyCity"><span>City*</span></label>
                      <input type="text" id="inputPolicyCity" class="field-input" placeholder="City" value="${this._esc(pd.city || '')}" />
                    </div>
                  ` : ''}
                  ${!state ? `
                    <div class="field-group">
                      <label class="field-label" for="selectPolicyState"><span>State*</span></label>
                      <select id="selectPolicyState" class="field-input">
                        <option value="">Select State</option>
                        ${INDIAN_STATES.map(s => `<option value="${s}" ${pd.state === s ? 'selected' : ''}>${s}</option>`).join('')}
                      </select>
                    </div>
                  ` : ''}
                  ${!pin ? `
                    <div class="field-group">
                      <label class="field-label" for="inputPolicyPinCode"><span>PIN Code* (6 digits)</span></label>
                      <input type="text" id="inputPolicyPinCode" class="field-input font-mono" maxlength="6" placeholder="110001" value="${this._esc(pd.pinCode || '')}" />
                    </div>
                  ` : ''}
                </div>
              </div>
            `}
          </div>
        </div>

        <!-- 3.3 Proposer Section (Only when Traveller is Minor < 18 on travel start date) -->
        ${isMinor ? `
          <div class="details-card-section proposer-section-card" style="margin-top: 20px;">
            <div class="details-section-header">
              <h3 class="details-section-title">
                <span>🛡️</span>
                <span>Proposer (parent or guardian)</span>
              </h3>
              <div class="proposer-scan-action">
                <button type="button" class="btn-secondary btn-sm" id="btnScanProposerPassport">
                  📷 Scan proposer's passport
                </button>
                <input type="file" id="fileProposerPassport" accept="image/*,application/pdf" style="display:none;" />
              </div>
            </div>
            <p class="section-subtext">Traveller is a minor (${travellerAge} years old). A parent or legal guardian (18+) must be specified as proposer.</p>

            <div class="details-grid" style="margin-top: 12px;">
              <div class="field-group">
                <label class="field-label" for="inputProposerName"><span>Proposer name*</span></label>
                <input type="text" id="inputProposerName" class="field-input" placeholder="Full name of parent/guardian" value="${this._esc(prop.name || '')}" required />
              </div>
              <div class="field-group">
                <label class="field-label" for="inputProposerPassport"><span>Passport no.*</span></label>
                <input type="text" id="inputProposerPassport" class="field-input font-mono" style="text-transform:uppercase;" placeholder="Z1234567" value="${this._esc(prop.passportNumber || '')}" required />
              </div>
              <div class="field-group">
                <label class="field-label" for="inputProposerDob"><span>Date of birth*</span></label>
                <input type="date" id="inputProposerDob" class="field-input ${isPropUnder18 ? 'border-red' : ''}" value="${this._esc(prop.dob || '')}" required />
                ${isPropUnder18 ? `
                  <div class="field-reason-text field-reason-red">Proposer must be 18 or older (currently ${propAge} years old).</div>
                ` : ''}
              </div>
              <div class="field-group">
                <label class="field-label" for="selectProposerRelationship"><span>Relationship to traveller*</span></label>
                <select id="selectProposerRelationship" class="field-input" required>
                  <option value="Father" ${prop.relationship === 'Father' ? 'selected' : ''}>Father</option>
                  <option value="Mother" ${prop.relationship === 'Mother' ? 'selected' : ''}>Mother</option>
                  <option value="Legal guardian" ${prop.relationship === 'Legal guardian' ? 'selected' : ''}>Legal guardian</option>
                </select>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- 3.4 Nominee Section -->
        <div class="details-card-section nominee-section-card" style="margin-top: 20px;">
          <div class="details-section-header">
            <h3 class="details-section-title">
              <span>🎯</span>
              <span>Nominee</span>
            </h3>
            ${isMinor ? `
              <label class="same-as-proposer-label" for="chkSameAsProposer">
                <input type="checkbox" id="chkSameAsProposer" ${pd.sameAsProposer ? 'checked' : ''} />
                <span>Same as proposer</span>
              </label>
            ` : ''}
          </div>

          <div class="details-grid" style="margin-top: 12px;">
            <div class="field-group">
              <label class="field-label" for="inputNomineeName"><span>Nominee full name*</span></label>
              <input
                type="text"
                id="inputNomineeName"
                class="field-input"
                placeholder="Full name of nominee"
                value="${this._esc(nom.name || '')}"
                ${pd.sameAsProposer ? 'readonly' : ''}
                required
              />
            </div>
            <div class="field-group">
              <label class="field-label" for="selectNomineeRelationship"><span>Relationship to traveller*</span></label>
              <select id="selectNomineeRelationship" class="field-input" ${pd.sameAsProposer ? 'disabled' : ''} required>
                <option value="">Select Relationship</option>
                <option value="Spouse" ${nom.relationship === 'Spouse' ? 'selected' : ''}>Spouse</option>
                <option value="Father" ${nom.relationship === 'Father' ? 'selected' : ''}>Father</option>
                <option value="Mother" ${nom.relationship === 'Mother' ? 'selected' : ''}>Mother</option>
                <option value="Child" ${nom.relationship === 'Child' ? 'selected' : ''}>Child</option>
                <option value="Brother" ${nom.relationship === 'Brother' ? 'selected' : ''}>Brother</option>
                <option value="Sister" ${nom.relationship === 'Sister' ? 'selected' : ''}>Sister</option>
                <option value="Legal guardian" ${nom.relationship === 'Legal guardian' ? 'selected' : ''}>Legal guardian</option>
                <option value="Other" ${nom.relationship === 'Other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 3.5 Declarations -->
        <div class="details-card-section declarations-card" style="margin-top: 20px;">
          <div class="details-section-header">
            <h3 class="details-section-title">
              <span>📝</span>
              <span>Declarations</span>
            </h3>
          </div>

          <div class="declarations-list" style="margin-top: 10px; display: flex; flex-direction: column; gap: 12px;">
            <label class="declaration-checkbox-row" for="chkMedicalDeclaration">
              <input type="checkbox" id="chkMedicalDeclaration" ${pd.medicalDeclarationAccepted ? 'checked' : ''} />
              <span>The traveller is not traveling against medical advice and does not have any terminal conditions.*</span>
            </label>
            <label class="declaration-checkbox-row" for="chkQuoteAccepted">
              <input type="checkbox" id="chkQuoteAccepted" name="chkCustomerAcceptedQuote" class="chkCustomerAcceptedQuote" ${pd.quoteAccepted ? 'checked' : ''} />
              <span>The customer has accepted this quote and the premium of ₹${totalPremiumFormatted}.*</span>
            </label>
          </div>
        </div>

        <!-- 3.6 Navigation Actions -->
        <div class="step-action-bar space-between" style="margin-top: 24px;">
          <button type="button" class="btn-secondary" id="btnChangeQuoteStep3">
            ← Change quote / select another plan
          </button>
          <button
            type="button"
            class="btn-primary btn-proceed-review"
            id="btnGoToReview"
            ${!canProceed ? 'disabled' : ''}
          >
            Review →
          </button>
        </div>
      </section>
    `;
  }

  /**
   * Step 4: Review (new)
   * Read-only summary on one page, each section with an "Edit" link back to where it was entered.
   */
  _renderIndividualStep4Review() {
    const q = this.state.individual.quote;
    const data = this._ensureDirectIssueDraft() || this.state.individual.verifiedData || this.state.individual.extractedData;
    const pd = this.state.individual.policyDetails || {};

    if (!q || !data) {
      this.state.individual.sessionExpired = true;
      this.state.individual.step = 1;
      return this._renderIndividualStep1();
    }

    const tripStart = q?.tripStart || new Date().toISOString().slice(0, 10);
    const travellerAge = this._calculateAge(data.dob, tripStart);
    const isMinor = this._isTravellerMinor(data.dob, tripStart);

    const isIssuing = Boolean(this.state.individual.isIssuing);
    const error = this.state.individual.issuanceError;

    // Plan & package calculations
    const totalPremiumNum = Number(q.totalPremium || q.estimatedTotal || 0);
    const basePremiumNum = Math.round(totalPremiumNum / 1.18);
    const gstNum = totalPremiumNum - basePremiumNum;

    // Benefits table
    const benefits = q.coverTable || [
      { benefit: 'Emergency Medical & Evacuation', amount: `$${Number(q.coverage || 100000).toLocaleString()}` },
      { benefit: 'Baggage Loss / Delay', amount: '$1,000' },
      { benefit: 'Trip Cancellation / Interruption', amount: '$2,500' },
      { benefit: 'Loss of Passport', amount: '$300' },
      { benefit: 'Personal Accident', amount: '$25,000' }
    ];

    const given = (data.givenNames || '').trim();
    const sur = (data.surname || '').trim();
    const travellerFullName = `${given} ${sur}`.trim();
    const passNo = data.passportNumber || '—';
    const dobFormatted = this._formatDateDMY(data.dob);
    const expiryFormatted = this._formatDateDMY(data.expiryDate);
    const addrLine = (pd.addressLine || data.addressLine || '').trim();
    const city = (pd.city || data.city || '').trim();
    const state = (pd.state || data.state || '').trim();
    const pin = (pd.pinCode || data.pinCode || data.pin || '').toString().trim();
    const country = (pd.country || data.country || 'India').trim();
    const statePin = [state, pin].filter(Boolean).join(' ');
    const fullAddress = [addrLine, city, statePin, country].filter(Boolean).join(', ');

    const prop = pd.proposer || {};
    const propDobFormatted = prop.dob ? this._formatDateDMY(prop.dob) : '';
    const propAge = prop.dob ? this._calculateAge(prop.dob, tripStart) : '';

    const nom = pd.nominee || {};

    return `
      <section class="step-card review-step-card" aria-labelledby="step4ReviewTitle">
        <div class="step-card-header">
          <div>
            <h2 id="step4ReviewTitle" class="step-title">Step 4: Review Details</h2>
            <p class="step-desc">Please review all information carefully before confirming and issuing the policy.</p>
          </div>
        </div>

        ${error ? `
          <div class="review-error-banner" role="alert">
            <div class="review-err-content">
              <strong>Issuance failed:</strong> ${this._esc(error)}
            </div>
            <button type="button" class="btn-primary btn-sm btn-try-again" id="btnTryAgainIssue">
              Try again
            </button>
          </div>
        ` : ''}

        <div class="review-sections-grid">
          <!-- 1. Plan & Package Summary -->
          <div class="review-section-card" role="region" aria-label="Plan and package review">
            <div class="review-section-header">
              <div class="rsh-left">
                <span class="rsh-icon">🛡️</span>
                <h3 class="rsh-title">Plan &amp; Package</h3>
              </div>
              <a href="#quote" class="review-edit-link" id="linkEditPlanReview">Edit</a>
            </div>
            <div class="review-card-body">
              <div class="review-fields-row">
                <div class="review-field"><span class="rf-label">Plan Name</span><span class="rf-value font-medium">${this._esc(q.planName || 'Standard')}</span></div>
                <div class="review-field"><span class="rf-label">Insurer</span><span class="rf-value">${this._esc(q.companyName || 'Insurer')}</span></div>
                <div class="review-field"><span class="rf-label">Quote ID</span><span class="rf-value font-mono">${this._esc(q.quoteId || 'QT-PENDING')}</span></div>
                <div class="review-field"><span class="rf-label">Destination</span><span class="rf-value">${this._esc(q.destination || 'Worldwide')}</span></div>
                <div class="review-field"><span class="rf-label">Travel Dates</span><span class="rf-value">${this._esc(q.tripStart || 'TBD')} to ${this._esc(q.tripEnd || 'TBD')} (${q.durationDays || '—'} days)</span></div>
                <div class="review-field"><span class="rf-label">Sum Insured</span><span class="rf-value font-medium">$${Number(q.coverage || 100000).toLocaleString()}</span></div>
              </div>

              <!-- Benefits Table -->
              <div class="review-table-wrapper" style="margin-top: 14px;">
                <table class="review-benefits-table">
                  <thead>
                    <tr><th>Coverage Benefit</th><th style="text-align:right;">Limit</th></tr>
                  </thead>
                  <tbody>
                    ${benefits.map(b => `
                      <tr><td>${this._esc(b.benefit)}</td><td style="text-align:right; font-weight:600;">${this._esc(b.amount)}</td></tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>

              <!-- Premium & Tax Breakdown -->
              <div class="review-tax-box" style="margin-top: 14px;">
                <div class="tax-row"><span class="tax-label">Net Premium:</span><span class="tax-val">₹${basePremiumNum.toLocaleString('en-IN')}</span></div>
                <div class="tax-row"><span class="tax-label">GST (18%):</span><span class="tax-val">₹${gstNum.toLocaleString('en-IN')}</span></div>
                <div class="tax-row tax-row-total"><span class="tax-label">Total Premium (incl. taxes):</span><span class="tax-val highlight-price">₹${totalPremiumNum.toLocaleString('en-IN')}</span></div>
              </div>
            </div>
          </div>

          <!-- 2. Traveller Details Summary -->
          <div class="review-section-card" role="region" aria-label="Traveller review">
            <div class="review-section-header">
              <div class="rsh-left">
                <span class="rsh-icon">👤</span>
                <h3 class="rsh-title">Traveller</h3>
              </div>
              <a href="#" class="review-edit-link" id="linkEditTravellerReview">Edit</a>
            </div>
            <div class="review-card-body">
              <div class="review-grid-2col">
                <div class="review-field"><span class="rf-label">Full Name</span><span class="rf-value font-medium">${this._esc(travellerFullName)}</span></div>
                <div class="review-field"><span class="rf-label">Passport No.</span><span class="rf-value font-mono">${this._esc(passNo)}</span></div>
                <div class="review-field"><span class="rf-label">Date of Birth</span><span class="rf-value">${this._esc(dobFormatted)} (age ${travellerAge})</span></div>
                <div class="review-field"><span class="rf-label">Gender / Sex</span><span class="rf-value">${this._esc(data.sex || 'M')}</span></div>
                <div class="review-field"><span class="rf-label">Nationality</span><span class="rf-value">${this._esc(data.nationality || 'IND')}</span></div>
                <div class="review-field"><span class="rf-label">Passport Expiry</span><span class="rf-value font-mono">${this._esc(expiryFormatted)}</span></div>
                <div class="review-field form-group-full"><span class="rf-label">Address</span><span class="rf-value">${this._esc(fullAddress)}</span></div>
              </div>
            </div>
          </div>

          <!-- 3. Proposer (Only for Minors) -->
          ${isMinor ? `
            <div class="review-section-card" role="region" aria-label="Proposer review">
              <div class="review-section-header">
                <div class="rsh-left">
                  <span class="rsh-icon">🛡️</span>
                  <h3 class="rsh-title">Proposer (Parent / Guardian)</h3>
                </div>
                <a href="#" class="review-edit-link" id="linkEditProposerReview">Edit</a>
              </div>
              <div class="review-card-body">
                <div class="review-grid-2col">
                  <div class="review-field"><span class="rf-label">Proposer Name</span><span class="rf-value font-medium">${this._esc(prop.name || '—')}</span></div>
                  <div class="review-field"><span class="rf-label">Passport No.</span><span class="rf-value font-mono">${this._esc(prop.passportNumber || '—')}</span></div>
                  <div class="review-field"><span class="rf-label">Date of Birth</span><span class="rf-value">${this._esc(propDobFormatted)} ${propAge ? `(age ${propAge})` : ''}</span></div>
                  <div class="review-field"><span class="rf-label">Relationship to Traveller</span><span class="rf-value">${this._esc(prop.relationship || '—')}</span></div>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- 4. Nominee Summary -->
          <div class="review-section-card" role="region" aria-label="Nominee review">
            <div class="review-section-header">
              <div class="rsh-left">
                <span class="rsh-icon">🎯</span>
                <h3 class="rsh-title">Nominee</h3>
              </div>
              <a href="#" class="review-edit-link" id="linkEditNomineeReview">Edit</a>
            </div>
            <div class="review-card-body">
              <div class="review-grid-2col">
                <div class="review-field"><span class="rf-label">Nominee Name</span><span class="rf-value font-medium">${this._esc(nom.name || '—')}</span></div>
                <div class="review-field"><span class="rf-label">Relationship to Traveller</span><span class="rf-value">${this._esc(nom.relationship || '—')}</span></div>
              </div>
            </div>
          </div>

          <!-- 5. Contact Summary -->
          <div class="review-section-card" role="region" aria-label="Contact review">
            <div class="review-section-header">
              <div class="rsh-left">
                <span class="rsh-icon">📞</span>
                <h3 class="rsh-title">Contact</h3>
              </div>
              <a href="#" class="review-edit-link" id="linkEditContactReview">Edit</a>
            </div>
            <div class="review-card-body">
              <div class="review-grid-2col">
                <div class="review-field"><span class="rf-label">Email Address</span><span class="rf-value font-medium">${this._esc(pd.email || '—')}</span></div>
                <div class="review-field"><span class="rf-label">Mobile Phone</span><span class="rf-value font-mono">+91 ${this._esc(pd.mobile || '—')}</span></div>
              </div>
            </div>
          </div>

          <!-- 6. Declarations Summary -->
          <div class="review-section-card" role="region" aria-label="Declarations review">
            <div class="review-section-header">
              <div class="rsh-left">
                <span class="rsh-icon">📝</span>
                <h3 class="rsh-title">Declarations</h3>
              </div>
              <a href="#" class="review-edit-link" id="linkEditDeclarationsReview">Edit</a>
            </div>
            <div class="review-card-body">
              <div class="review-declarations-list">
                <div class="review-declaration-item">
                  <span class="badge-check">✓</span>
                  <span>Medical declaration accepted (traveller not traveling against medical advice).</span>
                </div>
                <div class="review-declaration-item">
                  <span class="badge-check">✓</span>
                  <span>Customer accepted quote and total premium of ₹${Number(q.totalPremium || q.estimatedTotal || 0).toLocaleString('en-IN')}.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="step-action-bar space-between" style="margin-top: 28px;">
          <button type="button" class="btn-secondary" id="btnBackToStep3" ${isIssuing ? 'disabled' : ''}>
            ← Back
          </button>
          <button
            type="button"
            class="btn-primary btn-confirm-issue"
            id="btnConfirmAndIssuePolicy"
            ${isIssuing ? 'disabled' : ''}
          >
            ${isIssuing ? '<span class="spinner-inline"></span> Issuing…' : 'Confirm and issue policy'}
          </button>
        </div>
      </section>
    `;
  }

  /**
   * Dedicated Policy Issued Success Confirmation Screen
   */
  _renderIndividualIssuedScreen() {
    const result = this.state.individual.issuanceResult;
    if (!result) return '';

    return `
      <section class="step-card success-card" role="region" aria-labelledby="successTitle">
        <div class="success-header">
          <div class="success-icon-badge">✓</div>
          <h2 id="successTitle" class="success-title">Policy Issued Successfully!</h2>
          <p class="success-sub">The insurance policy is active and confirmed with the insurer.</p>
        </div>

        <div class="policy-details-card">
          <div class="detail-row">
            <span class="detail-key">Policy Number</span>
            <span class="detail-val font-mono highlight-policy">${result.policyNumber}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Insured Traveller</span>
            <span class="detail-val">${result.travellerName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Passport Number</span>
            <span class="detail-val font-mono">${result.passport}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Plan</span>
            <span class="detail-val">${result.plan}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Destination</span>
            <span class="detail-val">${result.destination}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Coverage Period</span>
            <span class="detail-val">${result.coverPeriod}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Total Premium</span>
            <span class="detail-val highlight-price">₹${result.premium.toLocaleString('en-IN')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Issued At</span>
            <span class="detail-val">${new Date(result.issuedAt).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div class="success-actions-row">
          ${result.documentUrl ? `
            <a href="${result.documentUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary btn-doc">
              Open Policy Document (PDF)
            </a>
          ` : ''}
          <button type="button" class="btn-secondary" id="btnStartNewIndividual">
            Start a new quote
          </button>
        </div>
      </section>
    `;
  }

  /**
   * Step 3: Dynamic form & Policy Issuance (Delegates to new Step 3 Policy details)
   */
  _renderIndividualStep3() {
    return this._renderIndividualStep3PolicyDetails();
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * GROUP FLOW RENDERING
   * ───────────────────────────────────────────────────────────────────────── */
  _renderGroupStep(step) {
    const hasAddressStep = this._isAddressStepActive();

    if (step === 1) return this._renderGroupStep1();
    if (step === 2) return this._renderGroupStep2();

    if (hasAddressStep) {
      if (step === 3) return this._renderGroupStep3Address();
      if (step === 4) return this._renderGroupStep4Details();
      if (step === 5) return this._renderGroupStep5Issue();
    } else {
      if (step === 3) return this._renderGroupStep4Details();
      if (step === 4) return this._renderGroupStep5Issue();
    }

    return `<div class="error-box">Unknown group step ${step}</div>`;
  }

  /**
   * Group Step 1: Traveller details
   * Offers 2 large selectable cards: "Upload passports (batch OCR)" vs "Fill in manually"
   */
  _renderGroupStep1() {
    if (!this.dropzoneInstance || this.dropzoneInstance.mode !== 'multiple') {
      this._initGroupDropzone();
    }
    const entryMethod = this.state.group.entryMethod || 'ocr';
    const isOcr = entryMethod === 'ocr';
    const isManual = entryMethod === 'manual';
    const q = this.state.group.quote;
    const initialCount = this.state.group.manualCount || q?.travellerCountQuoted || 6;
    const extractedCount = this.state.group.extractedRows.length;

    return `
      <section class="step-card" aria-labelledby="groupStep1Title">
        <div class="step-card-header">
          <div>
            <h2 id="groupStep1Title" class="step-title">Step 1: Traveller Details</h2>
            <p class="step-desc">Choose how to add travellers for this group policy: batch upload passport scans or populate rows manually.</p>
          </div>
        </div>

        ${!q ? `
          <div class="direct-issue-banner-d1" role="status" style="margin-bottom:18px;">
            <span class="dib-text">
              No group quote selected. Add group travellers via batch passport OCR or manual entry, or
              <a href="#quote" class="link-pick-quote" id="linkGroupPickQuote">Pick an existing quote instead</a>.
            </span>
          </div>
        ` : ''}

        <!-- Two Selectable Entry Method Cards -->
        <div class="entry-method-grid" role="radiogroup" aria-label="Group traveller entry method">
          <!-- Card 1: Batch Upload Passports -->
          <div
            class="entry-method-card ${isOcr ? 'active' : ''}"
            id="optGroupEntryOcr"
            role="radio"
            aria-checked="${isOcr}"
            tabindex="0"
          >
            <div class="emc-header">
              <span class="emc-radio"><span class="emc-radio-dot"></span></span>
              <span class="emc-icon" aria-hidden="true">📂</span>
              <div class="emc-titles">
                <h3 class="emc-title">Upload passports</h3>
                <span class="emc-badge emc-badge-rec">Batch OCR Extraction</span>
              </div>
            </div>
            <p class="emc-desc">Upload multiple passport scans or photos. Automated OCR extracts all traveller details simultaneously.</p>
          </div>

          <!-- Card 2: Fill in Manually -->
          <div
            class="entry-method-card ${isManual ? 'active' : ''}"
            id="optGroupEntryManual"
            role="radio"
            aria-checked="${isManual}"
            tabindex="0"
          >
            <div class="emc-header">
              <span class="emc-radio"><span class="emc-radio-dot"></span></span>
              <span class="emc-icon" aria-hidden="true">✍️</span>
              <div class="emc-titles">
                <h3 class="emc-title">Fill in manually</h3>
                <span class="emc-badge emc-badge-manual">Direct Table Entry</span>
              </div>
            </div>
            <p class="emc-desc">Open the review table pre-populated with blank rows to enter travellers directly without uploading files.</p>
          </div>
        </div>

        <!-- Subview Area -->
        <div class="entry-method-content">
          ${isOcr ? `
            <div class="subview-header">
              <h3 class="subview-title">Upload Group Passports (Multiple)</h3>
              <p class="subview-desc">Drop passport scans or photos for all travellers. Back pages can be attached to fill missing addresses.</p>
            </div>

            <div id="groupDropzoneMount">
              ${this.dropzoneInstance ? this.dropzoneInstance.render() : ''}
            </div>

            <div class="step-action-bar flex-end" style="margin-top:20px;">
              <button
                type="button"
                class="btn-primary"
                id="btnContinueToReviewTable"
                ${extractedCount === 0 ? 'disabled' : ''}
              >
                Continue to Review Table (${extractedCount} Extracted) →
              </button>
            </div>
          ` : `
            <div class="group-manual-init-box">
              <div style="font-size: 2rem; margin-bottom: 8px;">📋</div>
              <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0 0 6px; color: #0f172a;">Manual Traveller Grid Setup</h3>
              <p style="font-size: 0.88rem; color: #475569; margin: 0 0 16px;">
                Specify how many blank traveller rows to create in the Review Table:
              </p>

              <div style="display: inline-flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                <label for="inputGroupManualCount" style="font-weight: 600; font-size: 0.9rem; color: #1e293b;">Number of Travellers:</label>
                <input
                  type="number"
                  id="inputGroupManualCount"
                  min="1"
                  max="50"
                  value="${initialCount}"
                  style="width: 80px; padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 1rem; font-weight: 700; text-align: center;"
                />
              </div>

              <div>
                <button
                  type="button"
                  class="btn-primary"
                  id="btnOpenGroupManualTable"
                  style="padding: 10px 24px; font-size: 0.95rem; font-weight: 700;"
                >
                  Create &amp; Open Review Table →
                </button>
              </div>
            </div>
          `}
        </div>
      </section>
    `;
  }

  /**
   * Group Step 2: Review Table (Data Grid)
   */
  _renderGroupStep2() {
    const grid = this.state.group.gridInstance;
    const summary = grid ? grid.getSummaryCounts() : { canProceed: false, errors: 0 };

    return `
      <section class="step-card step-card-wide" aria-labelledby="groupStep2Title">
        <div class="step-card-header">
          <div class="header-left">
            <h2 id="groupStep2Title" class="step-title">Step 2: Review Travellers (Data Grid)</h2>
            <p class="step-desc">Inline editable data grid. Resolves duplicates, dates, and column configurations. Manually entered rows are marked with ✍️ Manual.</p>
          </div>
        </div>

        <div id="groupReviewGridMount">
          ${grid ? grid.render() : '<div class="spinner-large"></div>'}
        </div>

        <div class="step-action-bar space-between" style="margin-top:24px;">
          <button type="button" class="btn-secondary" id="btnBackToGroupStep1">
            ← Back to Traveller Details
          </button>
          <div class="action-hint-group">
            ${!summary.canProceed ? `
              <span class="btn-disabled-hint">
                ${summary.errors > 0
                  ? `Fix ${summary.errors} red error${summary.errors > 1 ? 's' : ''} to proceed`
                  : 'Add at least one traveller to proceed'}
              </span>
            ` : ''}
            <button
              type="button"
              class="btn-primary"
              id="btnConfirmTravellers"
              ${!summary.canProceed ? 'disabled' : ''}
            >
              Confirm travellers &amp; Continue →
            </button>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Group Step 3: Address Verification (if active)
   */
  _renderGroupStep3Address() {
    const mode = this.state.group.addressMode;
    const shared = this.state.group.sharedAddress;
    const rows = this.state.group.extractedRows;

    return `
      <section class="step-card" aria-labelledby="groupStep3Title">
        <div class="step-card-header">
          <h2 id="groupStep3Title" class="step-title">Step 3: Address Verification</h2>
          <p class="step-desc">Choose whether travellers share an organisation/corporate address or have individual residential addresses.</p>
        </div>

        <!-- Mode Selector -->
        <div class="address-mode-selector" role="radiogroup" aria-label="Address mode selection">
          <label class="addr-radio-card ${mode === 'same' ? 'selected' : ''}">
            <input type="radio" name="addressMode" value="same" ${mode === 'same' ? 'checked' : ''} />
            <div class="card-body">
              <strong class="mode-title">Same address for everyone</strong>
              <span class="mode-desc">Use a single company or group address for all travellers.</span>
            </div>
          </label>

          <label class="addr-radio-card ${mode === 'each' ? 'selected' : ''}">
            <input type="radio" name="addressMode" value="each" ${mode === 'each' ? 'checked' : ''} />
            <div class="card-body">
              <strong class="mode-title">Different address for each</strong>
              <span class="mode-desc">Review and provide individual residential addresses per traveller.</span>
            </div>
          </label>
        </div>

        <!-- Same Address Form -->
        ${mode === 'same' ? `
          <div class="shared-address-form">
            <h3 class="form-subheading">Shared Group Address</h3>
            <div class="dyn-fields-grid">
              <div class="dyn-field-group field-full">
                <label class="dyn-label" for="sharedAddrLine">Address Line *</label>
                <input type="text" id="sharedAddrLine" class="dyn-input" value="${this._esc(shared.addressLine || '')}" placeholder="Street, Building, Suite" required />
              </div>
              <div class="dyn-field-group field-half">
                <label class="dyn-label" for="sharedCity">City *</label>
                <input type="text" id="sharedCity" class="dyn-input" value="${this._esc(shared.city || '')}" placeholder="City" required />
              </div>
              <div class="dyn-field-group field-half">
                <label class="dyn-label" for="sharedState">State *</label>
                <select id="sharedState" class="dyn-input" required>
                  <option value="">Select state...</option>
                  ${INDIAN_STATES.map(s => `<option value="${this._esc(s)}" ${String(shared.state || '').toLowerCase() === s.toLowerCase() ? 'selected' : ''}>${this._esc(s)}</option>`).join('')}
                </select>
              </div>
              <div class="dyn-field-group field-half">
                <label class="dyn-label" for="sharedPincode">PIN Code (6 digits) *</label>
                <input type="text" id="sharedPincode" class="dyn-input" value="${this._esc(shared.pincode || '')}" placeholder="e.g. 110001" maxlength="6" required />
              </div>
              <div class="dyn-field-group field-half">
                <label class="dyn-label" for="sharedCountry">Country</label>
                <input type="text" id="sharedCountry" class="dyn-input" value="${this._esc(shared.country || 'India')}" readonly />
              </div>
            </div>
          </div>
        ` : `
          <!-- Different Address per traveller -->
          <div class="individual-addresses-form">
            <h3 class="form-subheading">Individual Addresses (${rows.length} travellers)</h3>
            <div class="traveller-addr-list">
              ${rows.map((r, i) => {
                const addrLine = r.addressLine || '';
                const city = r.city || '';
                const state = r.state || '';
                const pin = r.pinCode || r.pin || '';
                const country = r.country || 'India';
                const isEmpty = !r.address && !addrLine;

                return `
                  <div class="traveller-addr-item ${isEmpty ? 'addr-item-empty' : ''}" data-row-id="${r.id}">
                    <div class="traveller-info">
                      <strong>#${i + 1} ${this._esc(r.givenNames)} ${this._esc(r.surname)}</strong>
                      <span class="font-mono text-muted">Passport: ${this._esc(r.passportNumber)}</span>
                      ${isEmpty ? '<span class="badge-missing">Address missing</span>' : ''}
                    </div>
                    <div class="dyn-fields-grid" style="margin-top:10px;">
                      <div class="dyn-field-group field-full">
                        <label class="dyn-label">Address Line</label>
                        <input type="text" class="dyn-input row-addr-line" data-row-id="${r.id}" value="${this._esc(addrLine)}" placeholder="House/Street/Area" />
                      </div>
                      <div class="dyn-field-group field-half">
                        <label class="dyn-label">City</label>
                        <input type="text" class="dyn-input row-addr-city" data-row-id="${r.id}" value="${this._esc(city)}" placeholder="City" />
                      </div>
                      <div class="dyn-field-group field-half">
                        <label class="dyn-label">State</label>
                        <select class="dyn-input row-addr-state" data-row-id="${r.id}">
                          <option value="">Select state...</option>
                          ${INDIAN_STATES.map(s => `<option value="${this._esc(s)}" ${String(state).toLowerCase() === s.toLowerCase() ? 'selected' : ''}>${this._esc(s)}</option>`).join('')}
                        </select>
                      </div>
                      <div class="dyn-field-group field-half">
                        <label class="dyn-label">PIN Code (6 digits)</label>
                        <input type="text" class="dyn-input row-addr-pin" data-row-id="${r.id}" value="${this._esc(pin)}" placeholder="e.g. 110001" maxlength="6" />
                      </div>
                      <div class="dyn-field-group field-half">
                        <label class="dyn-label">Country</label>
                        <input type="text" class="dyn-input row-addr-country" data-row-id="${r.id}" value="${this._esc(country)}" placeholder="India" />
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `}

        <div class="step-action-bar space-between" style="margin-top:24px;">
          <button type="button" class="btn-secondary" id="btnBackToGroupStep2">
            ← Back to Review Table
          </button>
          <button type="button" class="btn-primary" id="btnConfirmAddresses">
            Confirm addresses &amp; Continue →
          </button>
        </div>
      </section>
    `;
  }

  /**
   * Group Step 4: Group Details & Dynamic Form
   */
  _renderGroupStep4Details() {
    return `
      <section class="step-card" aria-labelledby="groupStep4Title">
        <div class="step-card-header">
          <h2 id="groupStep4Title" class="step-title">Step 4: Group Details &amp; Schedule</h2>
          <p class="step-desc">Enter organizational and contact details. Dynamic cross-check verifies all passports against travel return dates.</p>
        </div>

        <div id="groupDynamicFormMount">
          ${this.dynamicFormInstance ? this.dynamicFormInstance.render() : '<div class="spinner-large"></div>'}
        </div>

        <div class="step-action-bar space-between" style="margin-top:24px;">
          <button type="button" class="btn-secondary" id="btnBackFromGroupDetails">
            ← Back
          </button>
          <button type="button" class="btn-primary" id="btnProceedToGroupIssue">
            Continue to Issue Master Policy →
          </button>
        </div>
      </section>
    `;
  }

  /**
   * Group Step 5: Confirm & Issue Master Group Policy
   */
  _renderGroupStep5Issue() {
    const isIssuing = this.state.group.isIssuing;
    const result = this.state.group.issuanceResult;
    const error = this.state.group.issuanceError;
    const travellers = this.state.group.extractedRows;
    const quote = this.state.group.quote;

    if (result) {
      return `
        <section class="step-card success-card" role="region" aria-labelledby="groupSuccessTitle">
          <div class="success-header">
            <div class="success-icon-badge">✓</div>
            <h2 id="groupSuccessTitle" class="success-title">Group Master Policy Issued!</h2>
            <p class="success-sub">The master policy is active and individual certificates have been generated.</p>
          </div>

          <div class="policy-details-card">
            <div class="detail-row">
              <span class="detail-key">Master Policy Number</span>
              <span class="detail-val font-mono highlight-policy">${result.masterPolicyNumber}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Organization</span>
              <span class="detail-val">${result.contact?.groupName || 'Corporate Group'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Plan</span>
              <span class="detail-val">${result.plan}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Destination</span>
              <span class="detail-val">${result.destination}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Coverage Period</span>
              <span class="detail-val">${result.coverPeriod}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Total Premium</span>
              <span class="detail-val highlight-price">₹${result.totalPremium.toLocaleString('en-IN')} (${travellers.length} travellers)</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Contact Person</span>
              <span class="detail-val">${result.contact?.name} (${result.contact?.email})</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Issued At</span>
              <span class="detail-val">${new Date(result.issuedAt).toLocaleString('en-IN')}</span>
            </div>
          </div>

          <!-- Individual Certificates Table -->
          <div class="certificates-section">
            <h3 class="certificates-title">Traveller Certificates (${(result.certificates || []).length})</h3>
            <table class="certificates-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Traveller Name</th>
                  <th>Passport No.</th>
                  <th>Certificate Number</th>
                </tr>
              </thead>
              <tbody>
                ${(result.certificates || []).map((c, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${c.travellerName}</td>
                    <td class="font-mono">${c.passportNumber}</td>
                    <td class="font-mono highlight-policy">${c.certificateNumber}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="success-actions-row">
            <button type="button" class="btn-tool btn-tool-excel" id="btnDownloadCertificatesExcel">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
              <span>Download Certificates (Excel)</span>
            </button>
            ${result.documentUrl ? `
              <a href="${result.documentUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary btn-doc">
                Open Policy Document (PDF)
              </a>
            ` : ''}
            <button type="button" class="btn-secondary" id="btnStartNewGroup">
              Start a new group
            </button>
          </div>
        </section>
      `;
    }

    return `
      <section class="step-card" aria-labelledby="groupStep5Title">
        <div class="step-card-header">
          <h2 id="groupStep5Title" class="step-title">Step 5: Confirm &amp; Issue Master Group Policy</h2>
          <p class="step-desc">Final review before transmitting data to the insurer API.</p>
        </div>

        ${error ? `
          <div class="issue-error-banner" role="alert">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <div class="err-text">
              <strong>Group issuance failed:</strong> ${error}
            </div>
          </div>
        ` : ''}

        <div class="quote-summary-grid">
          <div class="quote-prop">
            <span class="prop-label">Corporate Group</span>
            <span class="prop-val">${this.state.group.formValues?.groupName || 'Corporate Group'}</span>
          </div>
          <div class="quote-prop">
            <span class="prop-label">Contact Person</span>
            <span class="prop-val">${this.state.group.formValues?.contactPerson || 'Authorized Contact'}</span>
          </div>
          <div class="quote-prop">
            <span class="prop-label">Total Travellers</span>
            <span class="prop-val font-medium">${travellers.length} verified travellers</span>
          </div>
          <div class="quote-prop">
            <span class="prop-label">Total Group Premium</span>
            <span class="prop-val highlight-price">₹${((quote?.perTravellerPremium || 2850) * travellers.length).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div class="step-action-bar space-between" style="margin-top:24px;">
          <button type="button" class="btn-secondary" id="btnBackFromGroupIssue" ${isIssuing ? 'disabled' : ''}>
            ← Back to Details
          </button>
          <button
            type="button"
            class="btn-primary"
            id="btnExecuteGroupIssue"
            ${isIssuing ? 'disabled' : ''}
          >
            ${isIssuing ? '<span class="spinner-inline"></span> Sending travellers to insurer…' : `Issue Master Policy for ${travellers.length} Travellers`}
          </button>
        </div>
      </section>
    `;
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * EVENT ATTACHMENT & LOGIC
   * ───────────────────────────────────────────────────────────────────────── */
  attachEvents(container) {
    this._container = container;

    // Handle "Go to Quotes Screen" when on standalone no-quote screen or direct-issue link
    const btnGoQuotes = container.querySelector('#btnGoToQuotesScreen');
    if (btnGoQuotes) {
      btnGoQuotes.addEventListener('click', (e) => {
        e.preventDefault();
        this.app.navigate('quote');
      });
      if (container.querySelector('.no-quote-container')) {
        return;
      }
    }

    const linkGrpPickQuote = container.querySelector('#linkGroupPickQuote');
    if (linkGrpPickQuote) {
      linkGrpPickQuote.addEventListener('click', (e) => {
        e.preventDefault();
        this.app.navigate('quote');
      });
    }

    // "Change quote" link in quote summary bar
    const linkChange = container.querySelector('#linkChangeQuote');
    if (linkChange) {
      linkChange.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.state.individual.isDirectIssue) {
          const draft = this._ensureDirectIssueDraft() || this.state.individual.verifiedData;
          if (this.app?.views?.quote && draft) {
            this.app.views.quote.setDirectIssueMode(draft);
          }
        }
        this.app.navigate('quote');
      });
    }

    // Mode Toggle (Individual vs Group)
    const btnInd = container.querySelector('#btnModeIndividual');
    const btnGrp = container.querySelector('#btnModeGroup');
    if (btnInd && btnGrp) {
      const selectInd = () => {
        if (this.mode !== 'individual') {
          this.mode = 'individual';
          this._initIndividualDropzone();
          this.renderView();
        }
      };

      const selectGrp = () => {
        if (this.mode !== 'group') {
          this.mode = 'group';
          this._initGroupDropzone();
          this.renderView();
        }
      };

      btnInd.addEventListener('click', selectInd);
      btnInd.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectInd();
        }
      });

      btnGrp.addEventListener('click', selectGrp);
      btnGrp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectGrp();
        }
      });
    }

    if (this.mode === 'individual') {
      this._attachIndividualEvents(container);
    } else {
      this._attachGroupEvents(container);
    }
  }

  _attachIndividualEvents(container) {
    const step = this.state.individual.step;

    // STEP 1: Traveller details (OCR vs Manual)
    if (step === 1) {
      const linkSelectQuote = container.querySelector('#linkSelectQuoteFirst');
      if (linkSelectQuote) {
        linkSelectQuote.addEventListener('click', (e) => {
          e.preventDefault();
          this.app?.navigate('quote');
        });
      }

      const optOcr = container.querySelector('#optIndividualEntryOcr');
      const optManual = container.querySelector('#optIndividualEntryManual');

      const selectOcr = () => {
        if (this.state.individual.entryMethod !== 'ocr') {
          this.state.individual.entryMethod = 'ocr';
          this._initIndividualDropzone();
          this.renderView();
        }
      };

      const selectManual = () => {
        if (this.state.individual.entryMethod !== 'manual') {
          this.state.individual.entryMethod = 'manual';
          this.renderView();
        }
      };

      if (optOcr) {
        optOcr.addEventListener('click', selectOcr);
        optOcr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectOcr();
          }
        });
      }

      if (optManual) {
        optManual.addEventListener('click', selectManual);
        optManual.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectManual();
          }
        });
      }

      // OCR subview handling
      if (this.state.individual.entryMethod === 'ocr') {
        if (!this.dropzoneInstance || this.dropzoneInstance.mode !== 'single') {
          this._initIndividualDropzone();
        }
        const mount = container.querySelector('#dropzoneContainerMount');
        if (mount && this.dropzoneInstance) {
          this.dropzoneInstance.attachEvents(mount);
        }

        const btnExtract = container.querySelector('#btnExtractIndividualPassport');
        if (btnExtract) {
          btnExtract.addEventListener('click', async () => {
            const fileObjs = this.dropzoneInstance?.files || [];
            const files = fileObjs.map(f => f.file).filter(Boolean);
            if (files.length === 0) return;

            btnExtract.disabled = true;
            this.dropzoneInstance.updateFileStatus(0, { status: 'reading', stage: 'Uploading document…' });

            // Store preview items in state for Step 2
            this.state.individual.uploadedFiles = fileObjs.map((f, i) => {
              let pUrl = f.thumbnail;
              if (!pUrl && f.file) {
                try { pUrl = URL.createObjectURL(f.file); } catch {}
              }
              const isPdf = (f.type || '').toLowerCase() === 'application/pdf' || (f.name && f.name.toLowerCase().endsWith('.pdf'));
              return {
                id: f.id || `file-${i}`,
                name: f.name || `Passport Document ${i + 1}`,
                size: f.size || 0,
                type: f.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
                isPdf,
                previewUrl: pUrl,
                file: f.file
              };
            });
            this.state.individual.activePreviewIndex = 0;

            try {
              const data = await passportService.extract(files, {
                mode: 'individual',
                onProgress: (prog) => {
                  this.dropzoneInstance.updateFileStatus(0, {
                    status: 'reading',
                    stage: prog.stage,
                    percent: prog.percent
                  });
                }
              });

              this.state.individual.extractedData = data;
              this.state.individual.verifiedData = { ...data };
              this.state.individual.verified = false;
              this.state.individual.entryMethod = 'ocr';
              if (this.state.individual.isDirectIssue) {
                try {
                  sessionStorage.setItem('kt_direct_issue_draft', JSON.stringify({ ...data, entryMethod: 'ocr' }));
                } catch {}
              }
              this.state.individual.step = 2;
              this.renderView();
            } catch (err) {
              this.dropzoneInstance.updateFileStatus(0, {
                status: 'failed',
                error: err.message || "The passport couldn't be read. Upload a sharper photo with the code lines visible."
              });
              btnExtract.disabled = false;
            }
          });
        }
      } else {
        // Manual form handling
        const m = this.state.individual.manualForm;
        const bindInput = (id, prop) => {
          const el = container.querySelector('#' + id);
          if (el) {
            el.addEventListener('input', () => {
              m[prop] = el.value;
              if (this.state.individual.manualErrors[prop]) {
                delete this.state.individual.manualErrors[prop];
              }
            });
          }
        };

        bindInput('manGivenNames', 'givenNames');
        bindInput('manSurname', 'surname');
        bindInput('manPassportNumber', 'passportNumber');
        bindInput('manSex', 'sex');
        bindInput('manDob', 'dob');
        bindInput('manExpiryDate', 'expiryDate');
        bindInput('manNationality', 'nationality');
        bindInput('manIssueDate', 'issueDate');
        bindInput('manPlaceOfIssue', 'placeOfIssue');
        bindInput('manPlaceOfBirth', 'placeOfBirth');
        bindInput('manFatherName', 'fatherName');
        bindInput('manMotherName', 'motherName');
        bindInput('manSpouseName', 'spouseName');
        bindInput('manAddressLine', 'addressLine');
        bindInput('manCity', 'city');
        bindInput('manState', 'state');
        bindInput('manPinCode', 'pinCode');
        bindInput('manCountry', 'country');

        // Auto-fill city and state when valid PIN code is typed
        const manPinEl = container.querySelector('#manPinCode');
        if (manPinEl) {
          manPinEl.addEventListener('input', () => {
            const pinVal = manPinEl.value.trim();
            m.pinCode = pinVal;
            m.pin = pinVal;
            if (/^\d{6}$/.test(pinVal)) {
              lookupPinCode(pinVal).then(info => {
                if (info) {
                  const cityEl = container.querySelector('#manCity');
                  const stateEl = container.querySelector('#manState');
                  if (!m.city && info.city) {
                    m.city = info.city;
                    if (cityEl) cityEl.value = info.city;
                  }
                  if (!m.state && info.state) {
                    m.state = info.state;
                    if (stateEl) stateEl.value = info.state;
                  }
                }
              }).catch(() => {});
            }
          });
        }

        const btnContinueManual = container.querySelector('#btnContinueManualEntry');
        if (btnContinueManual) {
          btnContinueManual.addEventListener('click', () => {
            const errors = {};
            if (!m.givenNames || !m.givenNames.trim()) {
              errors.givenNames = 'Given name is required';
            }
            // Surname is optional on passport: no error if empty
            if (!m.passportNumber || !m.passportNumber.trim()) {
              errors.passportNumber = 'Passport number is required';
            }
            if (!m.sex) {
              errors.sex = 'Sex is required';
            }
            if (!m.dob || !m.dob.trim()) {
              errors.dob = 'Date of birth is required';
            }
            if (!m.expiryDate || !m.expiryDate.trim()) {
              errors.expiryDate = 'Expiry date is required';
            }
            if (m.issueDate && m.expiryDate && m.issueDate >= m.expiryDate) {
              errors.issueDate = 'Date of issue must precede expiry date';
            }

            this.state.individual.manualErrors = errors;

            if (Object.keys(errors).length > 0) {
              this.app?.showToast('Please correct required fields in the traveller form', 'error');
              this.renderView();
              return;
            }

            const fullAddr = [m.addressLine, m.city, m.state, m.pinCode, m.country].filter(Boolean).join(', ');

            // Package manual data into verifiedData
            const manualData = {
              givenNames: m.givenNames.trim(),
              surname: m.surname ? m.surname.trim() : '',
              passportNumber: m.passportNumber.trim().toUpperCase(),
              nationality: (m.nationality || 'IND').trim().toUpperCase(),
              countryCode: (m.nationality || 'IND').trim().toUpperCase(),
              issuingCountry: (m.nationality || 'IND').trim().toUpperCase(),
              sex: m.sex,
              dob: m.dob.trim(),
              placeOfBirth: m.placeOfBirth ? m.placeOfBirth.trim() : null,
              placeOfIssue: m.placeOfIssue ? m.placeOfIssue.trim() : null,
              issueDate: m.issueDate ? m.issueDate.trim() : null,
              expiryDate: m.expiryDate.trim(),
              fatherName: m.fatherName ? m.fatherName.trim() : null,
              motherName: m.motherName ? m.motherName.trim() : null,
              spouseName: m.spouseName ? m.spouseName.trim() : null,
              addressLine: m.addressLine ? m.addressLine.trim() : null,
              city: m.city ? m.city.trim() : null,
              state: m.state ? m.state.trim() : null,
              pinCode: m.pinCode ? m.pinCode.trim() : null,
              country: m.country ? m.country.trim() : 'India',
              address: fullAddr || (m.address ? m.address.trim() : null),
              pin: m.pinCode ? m.pinCode.trim() : (m.pin ? m.pin.trim() : null),
              fileNumber: null,
              mrz: null,
              lowConfidence: false,
              entryMethod: 'manual'
            };

            this.state.individual.entryMethod = 'manual';
            this.state.individual.extractedData = manualData;
            this.state.individual.verifiedData = { ...manualData };
            this.state.individual.manualAttested = false;
            if (this.state.individual.isDirectIssue) {
              try {
                sessionStorage.setItem('kt_direct_issue_draft', JSON.stringify({ ...manualData, entryMethod: 'manual' }));
              } catch {}
            }
            this.state.individual.step = 2;
            this.renderView();
          });
        }
      }
    }

    // STEP 2: Verify details
    if (step === 2) {
      if (this.state.individual.isDirectIssue) {
        const data = this._ensureDirectIssueDraft() || this.state.individual.verifiedData || this.state.individual.extractedData || {};

        // Tab switcher for left preview (if multi-file)
        const tabBtns = container.querySelectorAll('.btn-page-tab');
        tabBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-preview-idx'), 10);
            if (!isNaN(idx)) {
              this.state.individual.activePreviewIndex = idx;
              this.renderView();
            }
          });
        });

        const btnDirectBack = container.querySelector('#btnDirectBackToScan');
        if (btnDirectBack) {
          btnDirectBack.addEventListener('click', () => {
            this.state.individual.step = 1;
            this.renderView();
          });
        }

        const linkPickQuote = container.querySelector('#linkPickExistingQuote');
        if (linkPickQuote) {
          linkPickQuote.addEventListener('click', (e) => {
            e.preventDefault();
            this.app?.navigate('quote');
          });
        }

        const fieldKeys = [
          'givenNames', 'surname', 'passportNumber', 'dob', 'sex',
          'nationality', 'countryCode', 'issueDate', 'expiryDate',
          'placeOfBirth', 'placeOfIssue', 'fatherName', 'motherName',
          'spouseName', 'fileNumber', 'addressLine', 'city', 'state', 'pinCode', 'country', 'address'
        ];

        const updateDirectGetQuotesBtn = () => {
          const hasRed = fieldKeys.some(k => {
            const res = this._evaluatePassportFieldStatus(k, data[k], data);
            return res.status === 'red';
          });
          const btnGetQuotes = container.querySelector('#btnDirectGetQuotes');
          if (btnGetQuotes) {
            btnGetQuotes.disabled = hasRed;
          }
        };

        fieldKeys.forEach(k => {
          const input = container.querySelector('#viz' + this._capitalize(k));
          if (input) {
            input.addEventListener('input', () => {
              data[k] = input.value;
              if (k === 'pinCode') data.pin = input.value;
              if (k === 'state') {
                delete data.stateMismatchMessage;
                delete data.stateFromLookup;
              }
              this.state.individual.verifiedData = data;
              try {
                sessionStorage.setItem('kt_direct_issue_draft', JSON.stringify({
                  ...data,
                  entryMethod: this.state.individual.entryMethod || 'ocr'
                }));
              } catch {}

              const evalRes = this._evaluatePassportFieldStatus(k, input.value, data);
              input.classList.remove('border-green', 'border-orange', 'border-red');
              input.classList.add(`border-${evalRes.status}`);

              const group = input.closest('.field-group') || input.parentElement;
              if (group) {
                const badge = group.querySelector('.field-badge-icon');
                if (badge) {
                  badge.className = `field-badge-icon badge-${evalRes.status}`;
                  badge.textContent = evalRes.icon;
                }
                let reasonEl = group.querySelector('.field-reason-text');
                if (evalRes.message) {
                  if (!reasonEl) {
                    reasonEl = document.createElement('div');
                    group.appendChild(reasonEl);
                  }
                  reasonEl.className = `field-reason-text field-reason-${evalRes.status}`;
                  reasonEl.textContent = evalRes.message;
                } else if (reasonEl) {
                  reasonEl.remove();
                }

                if (k === 'dob') {
                  const age = this._calcAge(input.value);
                  const ageTag = group.querySelector('.dob-calc-age-tag');
                  if (ageTag) {
                    ageTag.innerHTML = `Age: <strong>${age !== null ? age + ' years' : '—'}</strong> (used for plan pricing)`;
                  }
                }
              }

              // PIN code auto-fill and state validation
              if (k === 'pinCode') {
                const cleanPin = String(input.value || '').trim();
                if (/^\d{6}$/.test(cleanPin)) {
                  lookupPinCode(cleanPin).then(info => {
                    if (info) {
                      if (!data.city && info.city) {
                        data.city = info.city;
                        data.cityFromLookup = true;
                        const cityInput = container.querySelector('#vizCity');
                        if (cityInput) {
                          cityInput.value = info.city;
                          const cEval = this._evaluatePassportFieldStatus('city', info.city, data);
                          cityInput.classList.remove('border-green', 'border-orange', 'border-red');
                          cityInput.classList.add(`border-${cEval.status}`);
                          const cGrp = cityInput.closest('.field-group');
                          if (cGrp) {
                            const cBdg = cGrp.querySelector('.field-badge-icon');
                            if (cBdg) { cBdg.className = `field-badge-icon badge-${cEval.status}`; cBdg.textContent = cEval.icon; }
                            let cRsn = cGrp.querySelector('.field-reason-text');
                            if (cEval.message) {
                              if (!cRsn) { cRsn = document.createElement('div'); cGrp.appendChild(cRsn); }
                              cRsn.className = `field-reason-text field-reason-${cEval.status}`;
                              cRsn.textContent = cEval.message;
                            } else if (cRsn) cRsn.remove();
                          }
                        }
                      }
                      if (!data.state && info.state) {
                        data.state = info.state;
                        data.stateFromLookup = true;
                        const stateInput = container.querySelector('#vizState');
                        if (stateInput) {
                          stateInput.value = info.state;
                          const sEval = this._evaluatePassportFieldStatus('state', info.state, data);
                          stateInput.classList.remove('border-green', 'border-orange', 'border-red');
                          stateInput.classList.add(`border-${sEval.status}`);
                          const sGrp = stateInput.closest('.field-group');
                          if (sGrp) {
                            const sBdg = sGrp.querySelector('.field-badge-icon');
                            if (sBdg) { sBdg.className = `field-badge-icon badge-${sEval.status}`; sBdg.textContent = sEval.icon; }
                            let sRsn = sGrp.querySelector('.field-reason-text');
                            if (sEval.message) {
                              if (!sRsn) { sRsn = document.createElement('div'); sGrp.appendChild(sRsn); }
                              sRsn.className = `field-reason-text field-reason-${sEval.status}`;
                              sRsn.textContent = sEval.message;
                            } else if (sRsn) sRsn.remove();
                          }
                        }
                      } else if (data.state && info.state && data.state.toLowerCase() !== info.state.toLowerCase()) {
                        data.stateMismatchMessage = `PIN code belongs to ${info.state}`;
                        const stateInput = container.querySelector('#vizState');
                        if (stateInput) {
                          const sEval = this._evaluatePassportFieldStatus('state', data.state, data);
                          stateInput.classList.remove('border-green', 'border-orange', 'border-red');
                          stateInput.classList.add(`border-${sEval.status}`);
                          const sGrp = stateInput.closest('.field-group');
                          if (sGrp) {
                            const sBdg = sGrp.querySelector('.field-badge-icon');
                            if (sBdg) { sBdg.className = `field-badge-icon badge-${sEval.status}`; sBdg.textContent = sEval.icon; }
                            let sRsn = sGrp.querySelector('.field-reason-text');
                            if (sEval.message) {
                              if (!sRsn) { sRsn = document.createElement('div'); sGrp.appendChild(sRsn); }
                              sRsn.className = `field-reason-text field-reason-${sEval.status}`;
                              sRsn.textContent = sEval.message;
                            } else if (sRsn) sRsn.remove();
                          }
                        }
                      }
                      updateDirectGetQuotesBtn();
                    }
                  }).catch(() => {});
                }
              }

              // Cross-validation for dates
              if (k === 'issueDate' || k === 'expiryDate') {
                const otherKey = (k === 'issueDate') ? 'expiryDate' : 'issueDate';
                const otherInput = container.querySelector('#viz' + this._capitalize(otherKey));
                if (otherInput) {
                  const otherRes = this._evaluatePassportFieldStatus(otherKey, data[otherKey], data);
                  otherInput.classList.remove('border-green', 'border-orange', 'border-red');
                  otherInput.classList.add(`border-${otherRes.status}`);
                  const otherGroup = otherInput.closest('.field-group') || otherInput.parentElement;
                  if (otherGroup) {
                    const otherBadge = otherGroup.querySelector('.field-badge-icon');
                    if (otherBadge) {
                      otherBadge.className = `field-badge-icon badge-${otherRes.status}`;
                      otherBadge.textContent = otherRes.icon;
                    }
                    let otherReason = otherGroup.querySelector('.field-reason-text');
                    if (otherRes.message) {
                      if (!otherReason) {
                        otherReason = document.createElement('div');
                        otherGroup.appendChild(otherReason);
                      }
                      otherReason.className = `field-reason-text field-reason-${otherRes.status}`;
                      otherReason.textContent = otherRes.message;
                    } else if (otherReason) {
                      otherReason.remove();
                    }
                  }
                }
              }

              updateDirectGetQuotesBtn();
            });
          }
        });

        const btnGetQuotes = container.querySelector('#btnDirectGetQuotes');
        if (btnGetQuotes) {
          btnGetQuotes.addEventListener('click', () => {
            const hasRed = fieldKeys.some(k => {
              const res = this._evaluatePassportFieldStatus(k, data[k], data);
              return res.status === 'red';
            });
            if (hasRed) {
              this.app?.showToast('Please fix all red fields before getting quotes', 'error');
              return;
            }

            const travellerData = {
              ...data,
              entryMethod: this.state.individual.entryMethod || 'ocr'
            };
            this.state.individual.verifiedData = travellerData;
            try {
              sessionStorage.setItem('kt_direct_issue_draft', JSON.stringify(travellerData));
            } catch {}

            if (this.app?.views?.quote) {
              this.app.views.quote.setDirectIssueMode(travellerData);
            }
            this.app?.navigate('quote');
          });
        }

        return;
      }

      const data = this.state.individual.verifiedData || this.state.individual.extractedData;
      const q = this.state.individual.quote;

      // Tab switcher for left preview (if multi-file)
      const tabBtns = container.querySelectorAll('.btn-page-tab');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-preview-idx'), 10);
          if (!isNaN(idx)) {
            this.state.individual.activePreviewIndex = idx;
            this.renderView();
          }
        });
      });

      // Bind all inputs across Front and Back details
      const fieldBindings = [
        ['vizGivenNames', 'givenNames'],
        ['vizSurname', 'surname'],
        ['vizPassportNo', 'passportNumber'],
        ['vizDob', 'dob'],
        ['vizSex', 'sex'],
        ['vizNationality', 'nationality'],
        ['vizCountryCode', 'countryCode'],
        ['vizIssueDate', 'issueDate'],
        ['vizExpiryDate', 'expiryDate'],
        ['vizPlaceOfBirth', 'placeOfBirth'],
        ['vizPlaceOfIssue', 'placeOfIssue'],
        ['vizFatherName', 'fatherName'],
        ['vizMotherName', 'motherName'],
        ['vizSpouseName', 'spouseName'],
        ['vizAddressLine', 'addressLine'],
        ['vizCity', 'city'],
        ['vizState', 'state'],
        ['vizPinCode', 'pinCode'],
        ['vizCountry', 'country'],
        ['vizPin', 'pin'],
        ['vizFileNumber', 'fileNumber'],
        ['vizAddress', 'address']
      ];

      fieldBindings.forEach(([id, prop]) => {
        const input = container.querySelector('#' + id);
        if (input && data) {
          input.addEventListener('input', () => {
            data[prop] = input.value;
            if (prop === 'pinCode') data.pin = input.value;
          });
        }
      });

      // PIN code auto-fill
      const vizPinInput = container.querySelector('#vizPinCode') || container.querySelector('#vizPin');
      if (vizPinInput && data) {
        vizPinInput.addEventListener('input', () => {
          const pinVal = String(vizPinInput.value || '').trim();
          data.pinCode = pinVal;
          data.pin = pinVal;
          if (/^\d{6}$/.test(pinVal)) {
            lookupPinCode(pinVal).then(info => {
              if (info) {
                if (!data.city && info.city) {
                  data.city = info.city;
                  const cInput = container.querySelector('#vizCity');
                  if (cInput) cInput.value = info.city;
                }
                if (!data.state && info.state) {
                  data.state = info.state;
                  const sInput = container.querySelector('#vizState');
                  if (sInput) sInput.value = info.state;
                }
              }
            }).catch(() => {});
          }
        });
      }

      // Verification checkbox
      const chkVerify = container.querySelector('#chkVerifyPassportDetails');
      const btnConfirm = container.querySelector('#btnConfirmIndividualVerification');
      if (chkVerify) {
        chkVerify.addEventListener('change', () => {
          this.state.individual.verified = chkVerify.checked;
          if (btnConfirm) {
            btnConfirm.disabled = !chkVerify.checked;
          }
        });
      }

      const btnBack = container.querySelector('#btnBackToStep1');
      if (btnBack) {
        btnBack.addEventListener('click', () => {
          this.state.individual.step = 1;
          this.renderView();
        });
      }

      if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
          if (!this.state.individual.verified) return;

          // Replace quote traveller name and DOB with verified passport details
          const passportFullName = `${data.givenNames || ''} ${data.surname || ''}`.trim();
          const origName = (q?.travellerName || '').trim();
          const origDob = q?.dob || '';

          if (passportFullName) q.travellerName = passportFullName;
          if (data.dob) q.dob = data.dob;

          // Record overrides for policy issue payload
          const overrides = [];
          const isCustPlaceholder = !origName || /^(customer|traveller|traveller\s*\d+|tbd|na|n\/a)$/i.test(origName);
          if (!isCustPlaceholder && passportFullName && passportFullName.toUpperCase() !== origName.toUpperCase()) {
            overrides.push({ field: 'travellerName', quoteValue: origName, passportValue: passportFullName });
          }
          if (origDob && data.dob && origDob !== data.dob) {
            overrides.push({ field: 'dob', quoteValue: origDob, passportValue: data.dob });
          }
          this.state.individual.overrides = overrides;

          this.state.individual.step = 3;
          await this._initIndividualDynamicForm();
          this.renderView();
        });
      }
    }

    // STEP 3: Policy details
    if (step === 3) {
      const q = this.state.individual.quote;
      const data = this._ensureDirectIssueDraft() || this.state.individual.verifiedData || this.state.individual.extractedData || {};
      const pd = this.state.individual.policyDetails;

      const btnGoToReview = container.querySelector('#btnGoToReview');
      const updateReviewBtn = () => {
        if (!btnGoToReview) return;
        btnGoToReview.disabled = !this._isPolicyDetailsValid(data, q);
      };

      // Edit passport links
      const linkEditP1 = container.querySelector('#linkEditPassportStep3');
      const linkEditP2 = container.querySelector('#linkEditPassportNotice');
      [linkEditP1, linkEditP2].forEach(link => {
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            this.state.individual.step = 1;
            this.renderView();
          });
        }
      });

      // Contact inputs
      const inEmail = container.querySelector('#inputContactEmail');
      if (inEmail) {
        inEmail.addEventListener('input', () => {
          pd.email = inEmail.value.trim();
          updateReviewBtn();
        });
      }

      const inMobile = container.querySelector('#inputContactMobile');
      if (inMobile) {
        inMobile.addEventListener('input', () => {
          pd.mobile = inMobile.value.replace(/[^0-9]/g, '');
          updateReviewBtn();
        });
      }

      // Address inputs (if missing from passport)
      const inAddrLine = container.querySelector('#inputPolicyAddressLine');
      if (inAddrLine) {
        inAddrLine.addEventListener('input', () => {
          pd.addressLine = inAddrLine.value;
          data.addressLine = inAddrLine.value;
          updateReviewBtn();
        });
      }

      const inCity = container.querySelector('#inputPolicyCity');
      if (inCity) {
        inCity.addEventListener('input', () => {
          pd.city = inCity.value;
          data.city = inCity.value;
          updateReviewBtn();
        });
      }

      const selState = container.querySelector('#selectPolicyState');
      if (selState) {
        selState.addEventListener('change', () => {
          pd.state = selState.value;
          data.state = selState.value;
          updateReviewBtn();
        });
      }

      const inPin = container.querySelector('#inputPolicyPinCode');
      if (inPin) {
        inPin.addEventListener('input', () => {
          const val = inPin.value.trim();
          pd.pinCode = val;
          data.pinCode = val;
          data.pin = val;
          if (val.length === 6 && /^\d{6}$/.test(val)) {
            lookupPinCode(val).then(info => {
              if (info) {
                if (!pd.city || !data.city) {
                  pd.city = info.city;
                  data.city = info.city;
                  if (inCity) inCity.value = info.city;
                }
                if (!pd.state || !data.state) {
                  pd.state = info.state;
                  data.state = info.state;
                  if (selState) selState.value = info.state;
                }
                updateReviewBtn();
              }
            }).catch(() => {});
          }
          updateReviewBtn();
        });
      }

      // Proposer inputs (minor traveller)
      const inPropName = container.querySelector('#inputProposerName');
      if (inPropName) {
        inPropName.addEventListener('input', () => {
          pd.proposer.name = inPropName.value;
          if (pd.sameAsProposer) {
            pd.nominee.name = inPropName.value;
            const inNom = container.querySelector('#inputNomineeName');
            if (inNom) inNom.value = inPropName.value;
          }
          updateReviewBtn();
        });
      }

      const inPropPassport = container.querySelector('#inputProposerPassport');
      if (inPropPassport) {
        inPropPassport.addEventListener('input', () => {
          pd.proposer.passportNumber = inPropPassport.value.toUpperCase();
          updateReviewBtn();
        });
      }

      const inPropDob = container.querySelector('#inputProposerDob');
      if (inPropDob) {
        const handlePropDob = () => {
          pd.proposer.dob = inPropDob.value;
          updateReviewBtn();
        };
        inPropDob.addEventListener('input', handlePropDob);
        inPropDob.addEventListener('change', handlePropDob);
      }

      const selPropRel = container.querySelector('#selectProposerRelationship');
      if (selPropRel) {
        selPropRel.addEventListener('change', () => {
          pd.proposer.relationship = selPropRel.value;
          if (pd.sameAsProposer) {
            pd.nominee.relationship = selPropRel.value;
            const selNom = container.querySelector('#selectNomineeRelationship');
            if (selNom) selNom.value = selPropRel.value;
          }
          updateReviewBtn();
        });
      }

      // Proposer Passport Scan
      const btnScanProp = container.querySelector('#btnScanProposerPassport');
      const fileScanProp = container.querySelector('#fileProposerPassport');
      if (btnScanProp && fileScanProp) {
        btnScanProp.addEventListener('click', () => {
          fileScanProp.click();
        });

        fileScanProp.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            this.app?.showToast('Extracting proposer passport details…', 'info');
            const extracted = await passportService.extractPassport(file);
            if (extracted) {
              const pGiven = extracted.givenNames || '';
              const pSur = extracted.surname || '';
              pd.proposer.name = `${pGiven} ${pSur}`.trim();
              pd.proposer.passportNumber = extracted.passportNumber || '';
              pd.proposer.dob = extracted.dob || '';
              if (pd.sameAsProposer) {
                pd.nominee.name = pd.proposer.name;
              }
              this.app?.showToast('Proposer passport details extracted successfully!', 'success');
              this.renderView();
            }
          } catch (err) {
            console.error('Proposer passport scan error:', err);
            this.app?.showToast('Failed to scan proposer passport: ' + (err.message || 'Error'), 'error');
          }
        });
      }

      // Nominee inputs
      const chkSameAsProp = container.querySelector('#chkSameAsProposer');
      if (chkSameAsProp) {
        chkSameAsProp.addEventListener('change', () => {
          pd.sameAsProposer = chkSameAsProp.checked;
          if (pd.sameAsProposer) {
            pd.nominee.name = pd.proposer.name || '';
            pd.nominee.relationship = pd.proposer.relationship || '';
          }
          this.renderView();
        });
      }

      const inNomName = container.querySelector('#inputNomineeName');
      if (inNomName) {
        inNomName.addEventListener('input', () => {
          pd.nominee.name = inNomName.value;
          updateReviewBtn();
        });
      }

      const selNomRel = container.querySelector('#selectNomineeRelationship');
      if (selNomRel) {
        selNomRel.addEventListener('change', () => {
          pd.nominee.relationship = selNomRel.value;
          updateReviewBtn();
        });
      }

      // Declarations
      const chkMed = container.querySelector('#chkMedicalDeclaration');
      if (chkMed) {
        chkMed.addEventListener('change', () => {
          pd.medicalDeclarationAccepted = chkMed.checked;
          updateReviewBtn();
        });
      }

      const chkQuote = container.querySelector('#chkQuoteAccepted');
      if (chkQuote) {
        chkQuote.addEventListener('change', () => {
          pd.quoteAccepted = chkQuote.checked;
          updateReviewBtn();
        });
      }

      // Actions
      const btnChangeQuote = container.querySelector('#btnChangeQuoteStep3');
      if (btnChangeQuote) {
        btnChangeQuote.addEventListener('click', () => {
          const draft = this._ensureDirectIssueDraft() || this.state.individual.verifiedData;
          if (this.app?.views?.quote && draft) {
            this.app.views.quote.setDirectIssueMode(draft);
          }
          this.app?.navigate('quote');
        });
      }

      if (btnGoToReview) {
        btnGoToReview.addEventListener('click', () => {
          if (!this._isPolicyDetailsValid(data, q)) return;
          this.state.individual.step = 4;
          this.renderView();
        });
      }
    }

    // STEP 4: Review
    if (step === 4) {
      const btnBack = container.querySelector('#btnBackToStep3');
      if (btnBack) {
        btnBack.addEventListener('click', () => {
          this.state.individual.step = 3;
          this.renderView();
        });
      }

      // Edit links
      const linkEditPlan = container.querySelector('#linkEditPlanReview');
      if (linkEditPlan) {
        linkEditPlan.addEventListener('click', (e) => {
          e.preventDefault();
          this.app?.navigate('quote');
        });
      }

      const linkEditTraveller = container.querySelector('#linkEditTravellerReview');
      if (linkEditTraveller) {
        linkEditTraveller.addEventListener('click', (e) => {
          e.preventDefault();
          this.state.individual.step = 1;
          this.renderView();
        });
      }

      const editStep3Links = [
        '#linkEditProposerReview',
        '#linkEditNomineeReview',
        '#linkEditContactReview',
        '#linkEditDeclarationsReview'
      ];
      editStep3Links.forEach(sel => {
        const el = container.querySelector(sel);
        if (el) {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            this.state.individual.step = 3;
            this.renderView();
          });
        }
      });

      // Confirm & Issue button
      const btnIssue = container.querySelector('#btnConfirmAndIssuePolicy');
      if (btnIssue) {
        btnIssue.addEventListener('click', async () => {
          if (this.state.individual.isIssuing) return;
          await this._handleIndividualIssueSubmit();
        });
      }

      // Try again on error
      const btnTryAgain = container.querySelector('#btnTryAgainIssue');
      if (btnTryAgain) {
        btnTryAgain.addEventListener('click', async () => {
          if (this.state.individual.isIssuing) return;
          await this._handleIndividualIssueSubmit();
        });
      }
    }

    // Success Screen actions
    const btnStartNew = container.querySelector('#btnStartNewIndividual');
    if (btnStartNew) {
      btnStartNew.addEventListener('click', () => {
        this.resetIndividualState();
        this.app?.navigate('quote');
      });
    }
  }

  _patchIndividualChecksDom(container, data, q, isManual) {
    const evalResult = this._evaluateIndividualVerification(data, q, isManual);
    const {
      checks,
      nameDiffers,
      dobDiffers,
      hasQuoteMismatch,
      ageNotice,
      isMismatchOverridden,
      canProceed,
      hasMrzFailure
    } = evalResult;

    // Update check list items
    const checkItems = container.querySelectorAll('.checks-list .check-item');
    checks.forEach((c, i) => {
      if (checkItems[i]) {
        checkItems[i].className = `check-item ${c.pass ? 'check-pass' : 'check-fail'}`;
        const icon = checkItems[i].querySelector('.check-status-icon');
        if (icon) icon.textContent = c.pass ? '✓' : '✕';
        const expl = checkItems[i].querySelector('.check-explanation');
        if (expl) expl.textContent = c.explanation;
      }
    });

    // Update field highlighting (amber for quote mismatch, error for hard blockers)
    const isReqEmpty = (val) => !val || !String(val).trim();
    const surnameEl = container.querySelector('#vizSurname')?.closest('.viz-field');
    const givenEl = container.querySelector('#vizGivenNames')?.closest('.viz-field');
    const pnumEl = container.querySelector('#vizPassportNo')?.closest('.viz-field');
    const dobEl = container.querySelector('#vizDob')?.closest('.viz-field');
    const issueEl = container.querySelector('#vizIssueDate')?.closest('.viz-field');
    const expiryEl = container.querySelector('#vizExpiryDate')?.closest('.viz-field');

    const updateFieldClass = (el, isError, isAmber) => {
      if (!el) return;
      el.classList.remove('viz-field-error', 'viz-field-amber', 'viz-field-warning');
      if (isError) {
        el.classList.add('viz-field-error');
      } else if (isAmber) {
        el.classList.add('viz-field-amber');
      }
    };

    const nameAmber = nameDiffers && !isMismatchOverridden;
    const dobAmber = dobDiffers && !isMismatchOverridden;
    const issueBlocker = data.issueDate && data.expiryDate && data.issueDate >= data.expiryDate;
    const expiryBlocker = isReqEmpty(data.expiryDate) || (data.expiryDate && q?.tripEnd && data.expiryDate < q.tripEnd) || issueBlocker;

    updateFieldClass(surnameEl, isReqEmpty(data.surname), nameAmber);
    updateFieldClass(givenEl, isReqEmpty(data.givenNames), nameAmber);
    updateFieldClass(pnumEl, isReqEmpty(data.passportNumber), !isManual && !this.state.individual.mrzOverridden && hasMrzFailure);
    updateFieldClass(dobEl, isReqEmpty(data.dob), dobAmber);
    updateFieldClass(issueEl, issueBlocker, false);
    updateFieldClass(expiryEl, expiryBlocker, false);

    // Update Quote Mismatch Warning Panel if present
    const panel = container.querySelector('#quoteMismatchWarningPanel');
    if (panel) {
      if (isMismatchOverridden) {
        panel.classList.add('mismatch-accepted');
        let note = panel.querySelector('.mismatch-accepted-note');
        if (!note) {
          note = document.createElement('div');
          note.className = 'mismatch-accepted-note';
          note.style.marginBottom = '8px';
          note.innerHTML = '<span aria-hidden="true">✓</span><span>Using passport details</span>';
          const confirmBox = panel.querySelector('.mismatch-confirm-box');
          if (confirmBox) confirmBox.insertBefore(note, confirmBox.firstChild);
        }
      } else {
        panel.classList.remove('mismatch-accepted');
        const note = panel.querySelector('.mismatch-accepted-note');
        if (note) note.remove();
      }
    }

    // Update verified stamp
    const stamp = container.querySelector('.verified-stamp-badge');
    const header = container.querySelector('.step-card-header');
    if (canProceed && !stamp && header) {
      const badge = document.createElement('div');
      badge.className = 'verified-stamp-badge';
      badge.setAttribute('role', 'status');
      badge.innerHTML = '<span class="stamp-icon">✓</span><span>VERIFIED</span>';
      header.appendChild(badge);
    } else if (!canProceed && stamp) {
      stamp.remove();
    }

    // Toggle confirm button
    const btn = container.querySelector('#btnConfirmIndividualVerification');
    if (btn) btn.disabled = !canProceed;
  }

  _initIndividualDropzone() {
    this.dropzoneInstance = new PassportDropzone({
      mode: 'single',
      initialFiles: this.state.individual.passportFile ? [this.state.individual.passportFile] : [],
      initialBackFile: this.state.individual.passportBackFile || null,
      onFilesChanged: (files, skipped, backFile) => {
        this.state.individual.passportFile = files[0] || null;
        this.state.individual.passportBackFile = backFile || null;
        const btnExtract = this._container?.querySelector('#btnExtractIndividualPassport');
        if (btnExtract) {
          btnExtract.disabled = (!this.dropzoneInstance || this.dropzoneInstance.files.length === 0);
        }
      }
    });
  }

  async _initIndividualDynamicForm() {
    try {
      const schema = await policyService.getFormSchema({
        mode: 'individual',
        quoteId: this.state.individual.quote?.quoteId
      });
      this.state.individual.formSchema = schema;

      const contextData = {
        quote: this.state.individual.quote,
        passport: this.state.individual.verifiedData
      };

      this.dynamicFormInstance = new DynamicForm({
        schema,
        values: this.state.individual.formValues,
        contextData,
        onChange: (k, v, allVals) => {
          this.state.individual.formValues = allVals;
        }
      });
    } catch (e) {
      console.error('Failed to load dynamic form schema:', e);
    }
  }

  async _handleIndividualIssueSubmit() {
    const schema = this.state.individual.formSchema;
    const values = this.state.individual.formValues;

    // Validate form schema if present
    if (schema) {
      const valResult = DynamicForm.validate(schema, values);
      if (!valResult.valid) {
        this.dynamicFormInstance?.setErrors(valResult.errors);
        this.app?.showToast('Please complete all required fields on the form', 'error');
        return;
      }
    }

    this.state.individual.isIssuing = true;
    this.state.individual.issuanceError = null;
    this.renderView();

    try {
      const q = this.state.individual.quote;
      const p = this.state.individual.verifiedData || this._ensureDirectIssueDraft() || this.state.individual.extractedData;
      const isDirect = Boolean(this.state.individual.isDirectIssue);

      const overrides = [];
      if (Array.isArray(this.state.individual.overrides)) {
        overrides.push(...this.state.individual.overrides);
      }

      const passportFullName = `${p?.givenNames || ''} ${p?.surname || ''}`.trim();
      const origName = (q?.travellerName || '').trim();
      const origDob = q?.dob || '';
      const isCustPlaceholder = !origName || /^(customer|traveller|traveller\s*\d+|tbd|na|n\/a)$/i.test(origName);

      if (isDirect) {
        if (!isCustPlaceholder && passportFullName && origName && passportFullName.toUpperCase() !== origName.toUpperCase()) {
          overrides.push({
            field: 'travellerName',
            quoteValue: origName,
            passportValue: passportFullName
          });
        }
        if (origDob && p?.dob && origDob !== p.dob) {
          overrides.push({
            field: 'dob',
            quoteValue: origDob,
            passportValue: p.dob
          });
        }
      } else {
        const lastMismatch = this.state.individual._lastMismatch;
        if (this.state.individual.quoteMismatchOverridden && lastMismatch) {
          if (lastMismatch.nameDiffers && !overrides.some(o => o.field === 'travellerName')) {
            overrides.push({
              field: 'travellerName',
              quoteValue: lastMismatch.quoteName,
              passportValue: lastMismatch.passportName
            });
          }
          if (lastMismatch.dobDiffers && !overrides.some(o => o.field === 'dob')) {
            overrides.push({
              field: 'dob',
              quoteValue: lastMismatch.quoteDob,
              passportValue: lastMismatch.passportDob
            });
          }
        }
        if (this.state.individual.mrzOverridden && !overrides.some(o => o.field === 'mrz')) {
          overrides.push({
            field: 'mrz',
            quoteValue: 'valid',
            passportValue: 'overridden_by_agent'
          });
        }
      }

      const loggedInAgent = (typeof localStorage !== 'undefined' ? (localStorage.getItem('kt_agent_id') || localStorage.getItem('kt_agent_email')) : null) || 'agent-001';

      // Update quote with passport values for this policy
      if (passportFullName && q) q.travellerName = passportFullName;
      if (p?.dob && q) q.dob = p.dob;

      const pd = this.state.individual.policyDetails || {};
      const tripStart = q?.tripStart || new Date().toISOString().slice(0, 10);
      const isMinor = this._isTravellerMinor(p?.dob, tripStart);

      // Address fields: prefer verifiedData/passport, fallback to policyDetails from 3.2
      const addrLine = p?.addressLine || pd.addressLine || null;
      const city = p?.city || pd.city || null;
      const state = p?.state || pd.state || null;
      const pinCode = p?.pinCode || p?.pin || pd.pinCode || null;
      const country = p?.country || pd.country || 'India';
      const fullAddress = p?.address || [addrLine, city, state, pinCode, country].filter(Boolean).join(', ') || null;

      // Payload includes contact, proposer (null for adults), nominee, and address fields (no nominee DOB)
      const payload = {
        mode: 'individual',
        entryMethod: this.state.individual.entryMethod || p?.entryMethod || 'ocr',
        source: isDirect ? 'direct' : 'quote',
        quoteId: q?.quoteId,
        planName: q?.planName,
        premium: q?.totalPremium || q?.estimatedTotal || 0,
        travellerName: passportFullName,
        dob: p?.dob,
        passportNumber: p?.passportNumber,
        address: fullAddress,
        addressLine: addrLine,
        city: city,
        state: state,
        pinCode: pinCode,
        country: country,
        contact: {
          email: pd.email || '',
          mobile: pd.mobile || ''
        },
        proposer: isMinor ? {
          name: pd.proposer?.name || '',
          passportNumber: pd.proposer?.passportNumber || '',
          dob: pd.proposer?.dob || '',
          relationship: pd.proposer?.relationship || ''
        } : null,
        nominee: {
          name: pd.nominee?.name || '',
          relationship: pd.nominee?.relationship || ''
        },
        destination: q?.destination,
        tripStart: q?.tripStart,
        tripEnd: q?.tripEnd,
        overrides: overrides,
        overrideConfirmedBy: overrides.length > 0 ? loggedInAgent : null,
        overrideConfirmedAt: overrides.length > 0 ? new Date().toISOString() : null,
        dynamicFormValues: values,
        verifiedAt: new Date().toISOString()
      };

      const result = await policyService.issue(payload);
      this.state.individual.issuanceResult = result;

      // Clear direct issue draft from sessionStorage on successful issue
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('kt_direct_issue_draft');
        }
      } catch {}

      this.app?.showToast('Individual policy successfully issued!', 'success');
    } catch (err) {
      this.state.individual.issuanceError = err.message || 'Issuance failed. Please try again.';
      this.state.individual.step = 4;
      this.app?.showToast('Issuance failed: ' + this.state.individual.issuanceError, 'error');
    } finally {
      this.state.individual.isIssuing = false;
      this.renderView();
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * GROUP EVENTS & ORCHESTRATION
   * ───────────────────────────────────────────────────────────────────────── */
  _attachGroupEvents(container) {
    const step = this.state.group.step;
    const hasAddressStep = this._isAddressStepActive();

    // STEP 1: Group Traveller Details (OCR vs Manual)
    if (step === 1) {
      const optOcr = container.querySelector('#optGroupEntryOcr');
      const optManual = container.querySelector('#optGroupEntryManual');

      const selectGroupOcr = () => {
        if (this.state.group.entryMethod !== 'ocr') {
          this.state.group.entryMethod = 'ocr';
          this._initGroupDropzone();
          this.renderView();
        }
      };

      const selectGroupManual = () => {
        if (this.state.group.entryMethod !== 'manual') {
          this.state.group.entryMethod = 'manual';
          this.renderView();
        }
      };

      if (optOcr) {
        optOcr.addEventListener('click', selectGroupOcr);
        optOcr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectGroupOcr();
          }
        });
      }

      if (optManual) {
        optManual.addEventListener('click', selectGroupManual);
        optManual.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectGroupManual();
          }
        });
      }

      if (this.state.group.entryMethod === 'ocr') {
        if (!this.dropzoneInstance || this.dropzoneInstance.mode !== 'multiple') {
          this._initGroupDropzone();
        }
        const mount = container.querySelector('#groupDropzoneMount');
        if (mount && this.dropzoneInstance) {
          this.dropzoneInstance.attachEvents(mount);
        }

        const btnContinue = container.querySelector('#btnContinueToReviewTable');
        if (btnContinue) {
          btnContinue.addEventListener('click', () => {
            this.state.group.step = 2;
            this._initGroupReviewGrid();
            this.renderView();
          });
        }
      } else {
        // Manual group initialization
        const inputCount = container.querySelector('#inputGroupManualCount');
        if (inputCount) {
          inputCount.addEventListener('input', () => {
            const count = parseInt(inputCount.value, 10);
            if (!isNaN(count) && count > 0) {
              this.state.group.manualCount = count;
            }
          });
        }

        const btnOpenTable = container.querySelector('#btnOpenGroupManualTable');
        if (btnOpenTable) {
          btnOpenTable.addEventListener('click', () => {
            const count = Math.max(1, Math.min(50, this.state.group.manualCount || 6));
            // Generate count blank rows with entryMethod: 'manual'
            const blankRows = [];
            for (let i = 0; i < count; i++) {
              blankRows.push({
                id: 'grp_man_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6),
                entryMethod: 'manual',
                sourceFile: 'Manual entry',
                givenNames: '',
                surname: '',
                passportNumber: '',
                nationality: 'IND',
                sex: 'M',
                dob: '',
                placeOfBirth: '',
                placeOfIssue: '',
                issueDate: '',
                expiryDate: '',
                fatherName: '',
                motherName: '',
                spouseName: '',
                address: '',
                fileNumber: '',
                mrz: null,
                lowConfidence: false,
                warnings: {},
                errors: {},
                status: 'error'
              });
            }

            this.state.group.extractedRows = blankRows;
            this.state.group.entryMethod = 'manual';
            this.state.group.step = 2;
            this._initGroupReviewGrid();
            this.renderView();
          });
        }
      }
    }

    // STEP 2: Review Table
    if (step === 2) {
      const mount = container.querySelector('#groupReviewGridMount');
      if (mount && this.state.group.gridInstance) {
        this.state.group.gridInstance.attachEvents(mount);
      }

      const btnBack = container.querySelector('#btnBackToGroupStep1');
      if (btnBack) {
        btnBack.addEventListener('click', () => {
          this.state.group.step = 1;
          this.renderView();
        });
      }

      const btnConfirm = container.querySelector('#btnConfirmTravellers');
      if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
          this.state.group.step = hasAddressStep ? 3 : 4;
          if (!hasAddressStep) {
            this._initGroupDynamicForm();
          }
          this.renderView();
        });
      }
    }

    // STEP 3: Addresses (if active)
    if (step === 3 && hasAddressStep) {
      const modeRadios = container.querySelectorAll('input[name="addressMode"]');
      modeRadios.forEach(r => {
        r.addEventListener('change', () => {
          this.state.group.addressMode = r.value;
          this.renderView();
        });
      });

      // PIN code lookup for shared address
      const sharedPinEl = container.querySelector('#sharedPincode');
      if (sharedPinEl) {
        sharedPinEl.addEventListener('input', () => {
          const pinVal = sharedPinEl.value.trim();
          this.state.group.sharedAddress.pincode = pinVal;
          if (/^\d{6}$/.test(pinVal)) {
            lookupPinCode(pinVal).then(info => {
              if (info) {
                const cityEl = container.querySelector('#sharedCity');
                const stateEl = container.querySelector('#sharedState');
                if (!cityEl?.value && info.city) {
                  if (cityEl) cityEl.value = info.city;
                  this.state.group.sharedAddress.city = info.city;
                }
                if (!stateEl?.value && info.state) {
                  if (stateEl) stateEl.value = info.state;
                  this.state.group.sharedAddress.state = info.state;
                }
              }
            }).catch(() => {});
          }
        });
      }

      // PIN code lookup for individual rows
      const rowPinEls = container.querySelectorAll('.row-addr-pin');
      rowPinEls.forEach(pEl => {
        pEl.addEventListener('input', () => {
          const pinVal = pEl.value.trim();
          const rowItem = pEl.closest('.traveller-addr-item');
          if (rowItem && /^\d{6}$/.test(pinVal)) {
            lookupPinCode(pinVal).then(info => {
              if (info) {
                const cityEl = rowItem.querySelector('.row-addr-city');
                const stateEl = rowItem.querySelector('.row-addr-state');
                if (cityEl && !cityEl.value && info.city) {
                  cityEl.value = info.city;
                }
                if (stateEl && !stateEl.value && info.state) {
                  stateEl.value = info.state;
                }
              }
            }).catch(() => {});
          }
        });
      });

      const btnBack = container.querySelector('#btnBackToGroupStep2');
      if (btnBack) {
        btnBack.addEventListener('click', () => {
          this.state.group.step = 2;
          this.renderView();
        });
      }

      const btnConfirm = container.querySelector('#btnConfirmAddresses');
      if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
          this._handleGroupAddressConfirm(container);
        });
      }
    }

    // STEP 4: Group Details (or Step 3 if address skipped)
    const isDetailsStep = (hasAddressStep && step === 4) || (!hasAddressStep && step === 3);
    if (isDetailsStep) {
      const mount = container.querySelector('#groupDynamicFormMount');
      if (mount && this.dynamicFormInstance) {
        this.dynamicFormInstance.attachEvents(mount);
      }

      const btnBack = container.querySelector('#btnBackFromGroupDetails');
      if (btnBack) {
        btnBack.addEventListener('click', () => {
          this.state.group.step = hasAddressStep ? 3 : 2;
          this.renderView();
        });
      }

      const btnProceed = container.querySelector('#btnProceedToGroupIssue');
      if (btnProceed) {
        btnProceed.addEventListener('click', () => {
          this._handleGroupDetailsProceed();
        });
      }
    }

    // STEP 5: Issue Master Policy (or Step 4 if address skipped)
    const isIssueStep = (hasAddressStep && step === 5) || (!hasAddressStep && step === 4);
    if (isIssueStep) {
      const btnBack = container.querySelector('#btnBackFromGroupIssue');
      if (btnBack) {
        btnBack.addEventListener('click', () => {
          this.state.group.step = hasAddressStep ? 4 : 3;
          this.renderView();
        });
      }

      const btnExecute = container.querySelector('#btnExecuteGroupIssue');
      if (btnExecute) {
        btnExecute.addEventListener('click', async () => {
          await this._handleGroupIssueSubmit();
        });
      }

      const btnDownloadCert = container.querySelector('#btnDownloadCertificatesExcel');
      if (btnDownloadCert) {
        btnDownloadCert.addEventListener('click', () => {
          this._exportGroupCertificatesExcel();
        });
      }

      const btnStartNew = container.querySelector('#btnStartNewGroup');
      if (btnStartNew) {
        btnStartNew.addEventListener('click', () => {
          this.resetGroupState();
          this.app?.navigate('quote');
        });
      }
    }
  }

  _initGroupDropzone() {
    this.dropzoneInstance = new PassportDropzone({
      mode: 'multiple',
      initialFiles: this.state.group.uploadedFiles,
      onFilesChanged: (files, skipped) => {
        this.state.group.uploadedFiles = files;
        if (skipped && skipped.length > 0) {
          const names = skipped.map(s => `${s.name} (${s.reason})`).join(', ');
          this.app?.showToast(`Skipped ${skipped.length} invalid file(s): ${names}`, 'error');
        }
      },
      onExtractRequested: async () => {
        const pending = this.dropzoneInstance.files.filter(f => f.status === 'ready' || f.status === 'failed');
        if (pending.length === 0) return;

        this.dropzoneInstance.isExtracting = true;
        this.dropzoneInstance.updateDom();

        const pendingItems = pending.map(p => ({
          id: p.id,
          front: p.file,
          back: p.back?.file || null,
          name: p.name
        }));

        await passportService.extractMany(pendingItems, {
          concurrency: ISSUE_POLICY_CONFIG.OCR_CONCURRENCY || 2,
          onItem: (idx, prog) => {
            const targetItem = pending[idx];
            if (targetItem) {
              this.dropzoneInstance.updateFileStatus(targetItem.id, prog);
              if (prog.status === 'extracted' && prog.data) {
                const dataWithMethod = {
                  ...prog.data,
                  entryMethod: 'ocr'
                };
                const existingIdx = this.state.group.extractedRows.findIndex(r => r.sourceFile === targetItem.name);
                if (existingIdx === -1) {
                  this.state.group.extractedRows.push(dataWithMethod);
                } else {
                  this.state.group.extractedRows[existingIdx] = dataWithMethod;
                }
              }
            }
          }
        });

        this.dropzoneInstance.isExtracting = false;
        this.renderView();
        this.app?.showToast(`Extraction complete for ${pendingItems.length} passports`, 'info');
      }
    });
  }

  _initGroupReviewGrid() {
    const quote = this.state.group.quote;
    this.state.group.gridInstance = new GroupReviewGrid({
      rows: this.state.group.extractedRows,
      tripDates: {
        tripStart: quote?.tripStart || '',
        tripEnd: quote?.tripEnd || ''
      },
      quoteId: quote?.quoteId || '',
      onRowsChanged: (rows, summary) => {
        this.state.group.extractedRows = rows;
        const btnConfirm = this._container?.querySelector('#btnConfirmTravellers');
        if (btnConfirm) btnConfirm.disabled = !summary.canProceed;
      },
      onUploadMore: () => {
        this.state.group.step = 1;
        this.state.group.entryMethod = 'ocr';
        this.renderView();
      },
      onShowToast: (msg, type) => {
        this.app?.showToast(msg, type);
      }
    });
  }

  _handleGroupAddressConfirm(container) {
    const mode = this.state.group.addressMode;
    const rows = this.state.group.extractedRows;

    if (mode === 'same') {
      const line = container.querySelector('#sharedAddrLine')?.value.trim();
      const city = container.querySelector('#sharedCity')?.value.trim();
      const state = container.querySelector('#sharedState')?.value.trim();
      const pin = container.querySelector('#sharedPincode')?.value.trim();
      const country = container.querySelector('#sharedCountry')?.value.trim() || 'India';

      if (!line || !city || !state || !pin) {
        this.app?.showToast('Please fill in all address fields', 'error');
        return;
      }
      if (!/^\d{6}$/.test(pin)) {
        this.app?.showToast('PIN code must be exactly 6 digits', 'error');
        return;
      }

      this.state.group.sharedAddress = { addressLine: line, city, state, pincode: pin, country };
      const formatted = `${line}, ${city}, ${state} ${pin}, ${country}`;

      rows.forEach(r => {
        r.address = formatted;
        r.addressLine = line;
        r.city = city;
        r.state = state;
        r.pinCode = pin;
        r.pin = pin;
        r.country = country;
        delete r.warnings.address;
        delete r.warnings.addressLine;
        delete r.warnings.city;
        delete r.warnings.state;
        delete r.warnings.pinCode;
      });
    } else {
      const items = container.querySelectorAll('.traveller-addr-item');
      let missingCount = 0;
      items.forEach(item => {
        const rowId = item.dataset.rowId;
        const targetRow = rows.find(r => r.id === rowId);
        if (!targetRow) return;

        const line = item.querySelector('.row-addr-line')?.value.trim() || '';
        const city = item.querySelector('.row-addr-city')?.value.trim() || '';
        const state = item.querySelector('.row-addr-state')?.value.trim() || '';
        const pin = item.querySelector('.row-addr-pin')?.value.trim() || '';
        const country = item.querySelector('.row-addr-country')?.value.trim() || 'India';

        targetRow.addressLine = line;
        targetRow.city = city;
        targetRow.state = state;
        targetRow.pinCode = pin;
        targetRow.pin = pin;
        targetRow.country = country;

        const fullAddr = [line, city, state, pin, country].filter(Boolean).join(', ');
        targetRow.address = fullAddr;
        this.state.group.individualAddresses[rowId] = fullAddr;

        if (!fullAddr) {
          targetRow.warnings.address = 'Add in address step';
          missingCount++;
        } else {
          delete targetRow.warnings.address;
        }
      });

      if (missingCount > 0) {
        this.app?.showToast(`Note: ${missingCount} traveller(s) have an empty address`, 'warning');
      }
    }

    this.state.group.gridInstance?.validateAllRows();

    // Proceed to Step 4 (Group Details)
    this.state.group.step = 4;
    this._initGroupDynamicForm();
    this.renderView();
  }

  async _initGroupDynamicForm() {
    try {
      const schema = await policyService.getFormSchema({
        mode: 'group',
        quoteId: this.state.group.quote?.quoteId
      });
      this.state.group.formSchema = schema;

      const contextData = {
        quote: this.state.group.quote
      };

      this.dynamicFormInstance = new DynamicForm({
        schema,
        values: this.state.group.formValues,
        contextData,
        onChange: (k, v, allVals) => {
          this.state.group.formValues = allVals;
        }
      });
    } catch (e) {
      console.error('Failed to load group schema:', e);
    }
  }

  _handleGroupDetailsProceed() {
    const schema = this.state.group.formSchema;
    const values = this.state.group.formValues;

    const valResult = DynamicForm.validate(schema, values);
    if (!valResult.valid) {
      this.dynamicFormInstance?.setErrors(valResult.errors);
      this.app?.showToast('Please fix required fields in the form', 'error');
      return;
    }

    // Cross-check: If travel end date changed, verify every traveller's passport expiry
    const newEnd = values.tripEnd;
    if (newEnd) {
      const expiringTravellers = [];
      this.state.group.extractedRows.forEach(row => {
        if (row.expiryDate && row.expiryDate < newEnd) {
          expiringTravellers.push(`${row.givenNames} ${row.surname} (Expires: ${row.expiryDate})`);
        }
      });

      if (expiringTravellers.length > 0) {
        this.app?.showToast(
          `Cannot proceed: The following traveller passport(s) expire before trip end (${newEnd}): ${expiringTravellers.join('; ')}`,
          'error'
        );
        return;
      }
    }

    // Proceed to final Step
    const hasAddressStep = this._isAddressStepActive();
    this.state.group.step = hasAddressStep ? 5 : 4;
    this.renderView();
  }

  async _handleGroupIssueSubmit() {
    this.state.group.isIssuing = true;
    this.state.group.issuanceError = null;
    this.renderView();

    try {
      const q = this.state.group.quote;
      const grid = this.state.group.gridInstance;
      const activeCols = grid ? grid.getActiveColumns() : [];

      // Filter rows to kept columns only; custom columns keyed by their label
      const cleanTravellers = this.state.group.extractedRows.map(r => {
        const item = {
          entryMethod: r.entryMethod || 'ocr'
        };
        activeCols.forEach(col => {
          const key = col.custom ? col.label : col.key;
          item[key] = r[col.key];
        });
        return item;
      });

      // Master policy payload includes entryMethod, quoteId, and travel dates from quote
      const payload = {
        mode: 'group',
        entryMethod: this.state.group.entryMethod || 'ocr',
        quoteId: q.quoteId,
        planName: q.planName,
        destination: q.destination,
        tripStart: this.state.group.formValues.tripStart || q.tripStart,
        tripEnd: this.state.group.formValues.tripEnd || q.tripEnd,
        perTravellerPremium: q.perTravellerPremium,
        travellers: cleanTravellers,
        dynamicFormValues: this.state.group.formValues,
        addressMode: this.state.group.addressMode,
        verifiedAt: new Date().toISOString()
      };

      const result = await policyService.issueGroup(payload);
      this.state.group.issuanceResult = result;
      this.app?.showToast('Group master policy successfully issued!', 'success');
    } catch (err) {
      this.state.group.issuanceError = err.message || 'Group issuance failed.';
      this.app?.showToast('Issuance failed: ' + this.state.group.issuanceError, 'error');
    } finally {
      this.state.group.isIssuing = false;
      this.renderView();
    }
  }

  _exportGroupCertificatesExcel() {
    const res = this.state.group.issuanceResult;
    if (!res) return;

    const XLSX = window.XLSX;
    if (XLSX) {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Certificates
      const certData = (res.certificates || []).map((c, i) => ({
        '#': i + 1,
        'Traveller Name': c.travellerName,
        'Passport No.': c.passportNumber,
        'Certificate Number': c.certificateNumber,
        'Master Policy No.': res.masterPolicyNumber,
        'Plan': res.plan,
        'Coverage Period': res.coverPeriod,
        'Destination': res.destination
      }));
      const ws1 = XLSX.utils.json_to_sheet(certData);
      ws1['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 15 }, { wch: 22 }, { wch: 20 }, { wch: 30 }, { wch: 25 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Certificates');

      // Sheet 2: Policy Summary
      const summaryData = [
        { 'Property': 'Master Policy Number', 'Value': res.masterPolicyNumber },
        { 'Property': 'Group / Organization', 'Value': res.contact?.groupName || 'Corporate Group' },
        { 'Property': 'Contact Person', 'Value': res.contact?.name || '' },
        { 'Property': 'Contact Email', 'Value': res.contact?.email || '' },
        { 'Property': 'Plan Name', 'Value': res.plan },
        { 'Property': 'Destination', 'Value': res.destination },
        { 'Property': 'Coverage Period', 'Value': res.coverPeriod },
        { 'Property': 'Total Travellers', 'Value': (res.certificates || []).length },
        { 'Property': 'Total Premium (INR)', 'Value': res.totalPremium },
        { 'Property': 'Issued Timestamp', 'Value': res.issuedAt }
      ];
      const ws2 = XLSX.utils.json_to_sheet(summaryData);
      ws2['!cols'] = [{ wch: 25 }, { wch: 45 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Policy Summary');

      XLSX.writeFile(wb, `Khanna_Travels_Certificates_${res.masterPolicyNumber}.xlsx`);
      this.app?.showToast('Downloaded certificates Excel successfully', 'success');
    } else {
      let csv = ['#,Traveller Name,Passport No.,Certificate Number,Master Policy\n'];
      (res.certificates || []).forEach((c, i) => {
        csv += `${i + 1},"${c.travellerName}","${c.passportNumber}","${c.certificateNumber}","${res.masterPolicyNumber}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificates_${res.masterPolicyNumber}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  renderView() {
    if (this._container) {
      this._container.innerHTML = this.render();
      this.attachEvents(this._container);
    }
  }

  _cleanStr(val) {
    if (!val || val === 'null' || val === 'undefined') return '';
    return this._esc(String(val).trim());
  }

  _cleanDate(val) {
    if (!val || val === 'null' || val === 'undefined') return '';
    const str = String(val).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : '';
  }

  _esc(str) {
    if (!str || str === 'null' || str === 'undefined') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

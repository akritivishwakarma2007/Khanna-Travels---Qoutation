/**
 * Admin Rate Table Management View
 * Spreadsheet-like editable pricing grid, CSV import/export, new insurer/plan onboarding
 */
import { DAY_SLABS, AGE_BANDS, COVERAGE_AMOUNTS, REGIONS } from '../data.js';
import { StorageManager } from '../storage.js';

export class RateTablesView {
  constructor(app) {
    this.app = app;
    this.state = {
      selectedCompanyId: 'trawelltag-valuepro',
      selectedCoverage: 250000,
      selectedRegion: 'including',
      hasUnsavedChanges: false,
      modifiedCells: {} // key: `${slabId}_${ageBandId}` -> newPremium
    };
  }

  render() {
    const companies = StorageManager.getCompanies();
    const rates = StorageManager.getRates();
    const currentCompany = companies.find(c => c.id === this.state.selectedCompanyId) || companies[0];

    // Filter rates matching current matrix criteria
    const currentMatrixRates = rates.filter(r => 
      r.companyId === this.state.selectedCompanyId &&
      Number(r.coverageAmount) === Number(this.state.selectedCoverage) &&
      r.region === this.state.selectedRegion
    );

    // Build lookup table: slabId + ageBandId -> premium
    const rateLookup = {};
    currentMatrixRates.forEach(r => {
      rateLookup[`${r.slabId}_${r.ageBandId}`] = r.premium;
    });

    return `
      <div class="rate-tables-page-container">
        <!-- Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Rate Table Management (Pricing Matrix)</h1>
            <p class="page-subtitle">Spreadsheet-style rate grid editor, dynamic tariff adjustments, and bulk CSV import/export</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-outline" id="btnExportCSV">📥 Export to CSV</button>
            <button class="btn btn-outline" id="btnOpenImportModal">📤 Import CSV / Excel</button>
            <button class="btn btn-secondary" id="btnOpenAddCompanyModal">➕ Add Insurer</button>
            <button class="btn btn-primary btn-orange" id="btnSaveAllRates">💾 Save Rate Table Changes</button>
          </div>
        </div>

        <!-- Filter & Matrix Selector Bar -->
        <div class="matrix-filter-card">
          <div class="filter-group-grid">
            <!-- Insurer & Plan -->
            <div class="filter-item">
              <label class="filter-label" for="matrixCompanySelect">Underwriter / Insurer</label>
              <select id="matrixCompanySelect" class="form-control">
                ${companies.map(c => `
                  <option value="${c.id}" ${this.state.selectedCompanyId === c.id ? 'selected' : ''}>
                    ${c.name} — ${c.planName}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Coverage Amount (Sum Insured) -->
            <div class="filter-item">
              <label class="filter-label" for="matrixCoverageSelect">Sum Insured (Coverage)</label>
              <select id="matrixCoverageSelect" class="form-control">
                ${COVERAGE_AMOUNTS.map(c => `
                  <option value="${c.value}" ${this.state.selectedCoverage === c.value ? 'selected' : ''}>
                    ${c.label}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Region Scope -->
            <div class="filter-item">
              <label class="filter-label" for="matrixRegionSelect">Geographical Region</label>
              <select id="matrixRegionSelect" class="form-control">
                ${REGIONS.map(r => `
                  <option value="${r.id}" ${this.state.selectedRegion === r.id ? 'selected' : ''}>
                    ${r.label}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Fast Adjustment Tool -->
            <div class="filter-item batch-tool">
              <label class="filter-label">Quick Inflation Tool</label>
              <div class="batch-adjust-row">
                <input type="number" id="batchPercentageInput" class="form-control-sm" placeholder="± %" style="width: 70px;">
                <button class="btn btn-sm btn-outline" id="btnApplyBatchPercent">Apply %</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Active Matrix Breadcrumb Info -->
        <div class="matrix-info-strip">
          <div class="info-left">
            <span class="active-tag">${currentCompany ? currentCompany.logo : '🛡️'} <strong>${currentCompany ? currentCompany.name : 'Value Pro'}</strong></span>
            <span class="active-tag">Plan: <strong>${currentCompany ? currentCompany.planName : 'Value Pro'}</strong></span>
            <span class="active-tag">Sum Insured: <strong>USD $${Number(this.state.selectedCoverage).toLocaleString()}</strong></span>
            <span class="active-tag">${this.state.selectedRegion === 'including' ? '🗽 Including USA & Canada' : '🌍 Excluding USA & Canada'}</span>
          </div>
          <div class="info-right">
            <span class="cells-count">Showing <strong>${DAY_SLABS.length} Slabs × ${AGE_BANDS.length} Age Bands = ${DAY_SLABS.length * AGE_BANDS.length} Cells</strong></span>
          </div>
        </div>

        <!-- Spreadsheet Editable Grid Container -->
        <div class="spreadsheet-container-card">
          <div class="table-scroll-wrapper">
            <table class="spreadsheet-table" id="ratesSpreadsheetTable">
              <thead>
                <tr>
                  <th class="col-sticky-slab">
                    <div class="th-content">
                      <span>Trip Duration (Days Slab)</span>
                      <span class="th-sub">Row Header</span>
                    </div>
                  </th>
                  ${AGE_BANDS.map(band => `
                    <th class="col-age-band">
                      <div class="th-content">
                        <span>${band.label}</span>
                        <span class="th-sub">(${band.min}–${band.max} Years)</span>
                      </div>
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${DAY_SLABS.map(slab => `
                  <tr>
                    <td class="col-sticky-slab">
                      <div class="slab-label-cell">
                        <span class="slab-pill">${slab.label}</span>
                        <span class="slab-range">${slab.min}–${slab.max} days</span>
                      </div>
                    </td>
                    ${AGE_BANDS.map(band => {
                      const cellKey = `${slab.id}_${band.id}`;
                      const currentVal = this.state.modifiedCells[cellKey] !== undefined 
                        ? this.state.modifiedCells[cellKey] 
                        : (rateLookup[cellKey] !== undefined ? rateLookup[cellKey] : 0);
                      const isModified = this.state.modifiedCells[cellKey] !== undefined;

                      return `
                        <td class="rate-cell ${isModified ? 'cell-modified' : ''}">
                          <div class="cell-input-wrapper">
                            <span class="cell-currency">$</span>
                            <input 
                              type="number" 
                              class="rate-input" 
                              data-slab-id="${slab.id}" 
                              data-age-band-id="${band.id}" 
                              value="${currentVal}"
                              min="1"
                              step="1"
                            >
                          </div>
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Modals placeholder -->
        <div id="rateTablesModalPlaceholder"></div>
      </div>
    `;
  }

  attachEvents() {
    const compSelect = document.getElementById('matrixCompanySelect');
    const covSelect = document.getElementById('matrixCoverageSelect');
    const regSelect = document.getElementById('matrixRegionSelect');
    const btnSave = document.getElementById('btnSaveAllRates');
    const btnExport = document.getElementById('btnExportCSV');
    const btnImport = document.getElementById('btnOpenImportModal');
    const btnAddCompany = document.getElementById('btnOpenAddCompanyModal');
    const btnApplyBatch = document.getElementById('btnApplyBatchPercent');

    // Matrix filter changes
    compSelect?.addEventListener('change', (e) => {
      this.state.selectedCompanyId = e.target.value;
      this.state.modifiedCells = {};
      this.app.render();
    });

    covSelect?.addEventListener('change', (e) => {
      this.state.selectedCoverage = Number(e.target.value);
      this.state.modifiedCells = {};
      this.app.render();
    });

    regSelect?.addEventListener('change', (e) => {
      this.state.selectedRegion = e.target.value;
      this.state.modifiedCells = {};
      this.app.render();
    });

    // Cell input changes
    document.querySelectorAll('.rate-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const slabId = e.target.getAttribute('data-slab-id');
        const bandId = e.target.getAttribute('data-age-band-id');
        const val = Number(e.target.value);

        if (isNaN(val) || val < 0) {
          this.app.showToast('Please enter a valid positive premium number.', 'error');
          return;
        }

        const cellKey = `${slabId}_${bandId}`;
        this.state.modifiedCells[cellKey] = val;
        this.state.hasUnsavedChanges = true;
        e.target.closest('.rate-cell')?.classList.add('cell-modified');
      });
    });

    // Quick % adjustment tool
    btnApplyBatch?.addEventListener('click', () => {
      const pctInput = document.getElementById('batchPercentageInput');
      const pct = parseFloat(pctInput.value);
      if (isNaN(pct) || pct === 0) {
        this.app.showToast('Please enter a percentage (e.g. 5 for +5% or -5 for -5%).', 'warning');
        return;
      }

      const multiplier = 1 + (pct / 100);
      document.querySelectorAll('.rate-input').forEach(input => {
        const current = Number(input.value);
        const updated = Math.round(current * multiplier);
        input.value = updated;
        const slabId = input.getAttribute('data-slab-id');
        const bandId = input.getAttribute('data-age-band-id');
        this.state.modifiedCells[`${slabId}_${bandId}`] = updated;
        input.closest('.rate-cell')?.classList.add('cell-modified');
      });

      this.state.hasUnsavedChanges = true;
      this.app.showToast(`Applied ${pct > 0 ? '+' : ''}${pct}% adjustment to current table. Remember to click "Save Rate Table Changes"!`, 'info');
    });

    // Save All Rates
    btnSave?.addEventListener('click', () => {
      const cellKeys = Object.keys(this.state.modifiedCells);
      if (cellKeys.length === 0) {
        this.app.showToast('No modifications made to save.', 'info');
        return;
      }

      cellKeys.forEach(key => {
        const [slabId, ageBandId] = key.split('_');
        const newPremium = this.state.modifiedCells[key];

        StorageManager.updateSingleRate(
          this.state.selectedCompanyId,
          this.state.selectedCoverage,
          this.state.selectedRegion,
          slabId,
          ageBandId,
          newPremium
        );
      });

      const count = cellKeys.length;
      this.state.modifiedCells = {};
      this.state.hasUnsavedChanges = false;
      this.app.showToast(`Successfully saved ${count} rate entries to the database!`, 'success');
      this.app.render();
    });

    // Export CSV
    btnExport?.addEventListener('click', () => {
      const csvContent = StorageManager.exportRatesToCSV(
        this.state.selectedCompanyId,
        this.state.selectedCoverage,
        this.state.selectedRegion
      );

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `rates_${this.state.selectedCompanyId}_${this.state.selectedCoverage}_${this.state.selectedRegion}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.app.showToast('Downloaded rate table CSV successfully!', 'success');
    });

    // Import CSV Modal
    btnImport?.addEventListener('click', () => {
      this.openImportModal();
    });

    // Add Company Modal
    btnAddCompany?.addEventListener('click', () => {
      this.openAddCompanyModal();
    });
  }

  openImportModal() {
    const placeholder = document.getElementById('rateTablesModalPlaceholder');
    if (!placeholder) return;

    placeholder.innerHTML = `
      <div class="modal-backdrop" id="importModalBackdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">Import Rate Table from CSV / Excel</h3>
            <button class="modal-close" id="btnCloseImportModal">&times;</button>
          </div>
          <div class="modal-body">
            <p class="text-muted">
              Select or paste a CSV file with columns: <code>Company ID, Plan, Coverage, Region, Slab, DaysFrom, DaysTo, AgeBand, AgeFrom, AgeTo, Premium, Currency</code>
            </p>
            <div class="form-group" style="margin-top: 1rem;">
              <label class="form-label">Upload CSV File</label>
              <input type="file" id="csvFileInput" class="form-control" accept=".csv,text/csv">
            </div>
            <div class="form-group" style="margin-top: 1rem;">
              <label class="form-label">Or Paste CSV Raw Text</label>
              <textarea id="csvRawTextarea" class="form-control" rows="8" placeholder="Paste CSV text here..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelImportModal">Cancel</button>
            <button class="btn btn-primary" id="btnExecuteImportAction">Upload & Process Rates</button>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      placeholder.innerHTML = '';
    };

    document.getElementById('btnCloseImportModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelImportModal')?.addEventListener('click', closeModal);

    // File input reader
    const fileInput = document.getElementById('csvFileInput');
    const textarea = document.getElementById('csvRawTextarea');

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (textarea) textarea.value = evt.target.result;
        };
        reader.readAsText(file);
      }
    });

    document.getElementById('btnExecuteImportAction')?.addEventListener('click', () => {
      const text = textarea?.value?.trim();
      if (!text) {
        this.app.showToast('Please provide CSV data to import.', 'error');
        return;
      }

      try {
        const result = StorageManager.importRatesFromCSV(text);
        this.app.showToast(`Import finished! Updated ${result.updatedCount} rates, Added ${result.addedCount} rates.`, 'success');
        closeModal();
        this.app.render();
      } catch (err) {
        this.app.showToast(`Import failed: ${err.message}`, 'error');
      }
    });
  }

  openAddCompanyModal() {
    const placeholder = document.getElementById('rateTablesModalPlaceholder');
    if (!placeholder) return;

    placeholder.innerHTML = `
      <div class="modal-backdrop" id="addCompModalBackdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">Add New Insurance Company & Plan</h3>
            <button class="modal-close" id="btnCloseAddCompModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Insurance Company Name <span class="req">*</span></label>
              <input type="text" id="newCompName" class="form-control" placeholder="e.g. Liberty Mutual International" required>
            </div>
            <div class="form-group">
              <label class="form-label">Plan Name <span class="req">*</span></label>
              <input type="text" id="newPlanName" class="form-control" placeholder="e.g. Global Voyager Shield" required>
            </div>
            <div class="form-row grid-2">
              <div class="form-group">
                <label class="form-label">Company Icon / Emoji</label>
                <input type="text" id="newCompLogo" class="form-control" value="🌟" style="width: 80px;">
              </div>
              <div class="form-group">
                <label class="form-label">Claim Settlement Ratio</label>
                <input type="text" id="newCompClaimRatio" class="form-control" value="98.5%">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Standard Policy Deductible</label>
              <input type="text" id="newCompDeductible" class="form-control" value="USD 100 per claim">
            </div>
            <div class="form-group">
              <label class="form-label">24/7 Global Emergency Hotline</label>
              <input type="text" id="newCompPhone" class="form-control" value="+1-800-555-0199">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelAddCompModal">Cancel</button>
            <button class="btn btn-primary btn-orange" id="btnSaveNewCompanyAction">Register Company & Generate Tariff</button>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      placeholder.innerHTML = '';
    };

    document.getElementById('btnCloseAddCompModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelAddCompModal')?.addEventListener('click', closeModal);

    document.getElementById('btnSaveNewCompanyAction')?.addEventListener('click', () => {
      const name = document.getElementById('newCompName')?.value?.trim();
      const plan = document.getElementById('newPlanName')?.value?.trim();
      const logo = document.getElementById('newCompLogo')?.value?.trim() || '🛡️';
      const claimRatio = document.getElementById('newCompClaimRatio')?.value?.trim() || '98.5%';
      const deductible = document.getElementById('newCompDeductible')?.value?.trim() || 'USD 100';
      const phone = document.getElementById('newCompPhone')?.value?.trim() || '+1-800-555-0199';

      if (!name || !plan) {
        this.app.showToast('Please fill in both Company Name and Plan Name.', 'error');
        return;
      }

      const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(100 + Math.random() * 900);

      const newCompany = {
        id,
        name,
        planName: plan,
        logo,
        rating: 4.8,
        reviewsCount: 120,
        claimRatio,
        color: '#0d9488',
        deductible,
        supportPhone: phone,
        emergencyEmail: `claims@${id}.com`,
        keyBenefits: [
          'Emergency Medical & Hospitalization up to Sum Insured',
          'Medical Evacuation and Repatriation included',
          'Checked Luggage Loss & Baggage Delay protection',
          '24/7 Global Emergency Assistance'
        ],
        terms: 'Standard international travel insurance policy underwritten by authorized insurer.'
      };

      StorageManager.addCompany(newCompany);
      this.state.selectedCompanyId = id;
      this.app.showToast(`Insurance Company "${name}" added with auto-generated baseline rate tables!`, 'success');
      closeModal();
      this.app.render();
    });
  }
}

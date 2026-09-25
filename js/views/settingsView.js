/**
 * Broker & Application Settings View
 */
import { StorageManager, DEFAULT_SETTINGS } from '../storage.js';

export class SettingsView {
  constructor(app) {
    this.app = app;
  }

  render() {
    const settings = StorageManager.getSettings();

    return `
      <div class="settings-page-container">
        <!-- Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Agency & Underwriting Settings</h1>
            <p class="page-subtitle">Configure brokerage branding on quotation PDFs, default currency, commission margins, and database resets</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary btn-orange" id="btnSaveAllSettings">💾 Save Configuration</button>
          </div>
        </div>

        <div class="settings-grid">
          <!-- Card 1: Brokerage Profile -->
          <div class="form-card">
            <div class="form-card-header">
              <h3 class="card-title">🏢 Brokerage & Agency Identity</h3>
              <p class="card-subtitle">Appears on official PDF proposals and email signatures</p>
            </div>
            <div class="form-card-body">
              <div class="form-group">
                <label class="form-label" for="settingAgencyName">Agency / Brokerage Name</label>
                <input type="text" id="settingAgencyName" class="form-control" value="${settings.brokerAgencyName}">
              </div>
              <div class="form-group">
                <label class="form-label" for="settingAgentName">Default Preparing Agent</label>
                <input type="text" id="settingAgentName" class="form-control" value="${settings.brokerAgentName}">
              </div>
              <div class="form-row grid-2">
                <div class="form-group">
                  <label class="form-label" for="settingPhone">Direct Phone / Hotline</label>
                  <input type="text" id="settingPhone" class="form-control" value="${settings.brokerPhone}">
                </div>
                <div class="form-group">
                  <label class="form-label" for="settingEmail">Official Inquiries Email</label>
                  <input type="email" id="settingEmail" class="form-control" value="${settings.brokerEmail}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="settingAddress">Office Address</label>
                <input type="text" id="settingAddress" class="form-control" value="${settings.brokerAddress}">
              </div>
            </div>
          </div>

          <!-- Card 2: Financial & Taxation Rules -->
          <div class="form-card">
            <div class="form-card-header">
              <h3 class="card-title">💵 Financial, Currency & Margin Rules</h3>
              <p class="card-subtitle">Currency display rules, GST/tax calculation, and broker commission</p>
            </div>
            <div class="form-card-body">
              <div class="form-group">
                <label class="form-label" for="settingCurrency">Default Base Currency</label>
                <select id="settingCurrency" class="form-control">
                  <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>USD ($) — United States Dollar</option>
                  <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>EUR (€) — Euro</option>
                  <option value="GBP" ${settings.currency === 'GBP' ? 'selected' : ''}>GBP (£) — British Pound</option>
                  <option value="INR" ${settings.currency === 'INR' ? 'selected' : ''}>INR (₹) — Indian Rupee</option>
                </select>
              </div>
              <div class="form-row grid-2">
                <div class="form-group">
                  <label class="form-label" for="settingTax">Applicable Tax / GST (%)</label>
                  <input type="number" id="settingTax" class="form-control" value="${settings.taxRatePercent}" min="0" max="30">
                  <span class="input-hint">Set to 0% for tax-inclusive tariffs, or 18% for GST</span>
                </div>
                <div class="form-group">
                  <label class="form-label" for="settingCommission">Broker Commission Margin (%)</label>
                  <input type="number" id="settingCommission" class="form-control" value="${settings.brokerCommissionPercent}" min="0" max="50">
                  <span class="input-hint">Internal broker margin tracker</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Database Maintenance Card -->
        <div class="form-card danger-zone-card">
          <div class="form-card-header">
            <h3 class="card-title">⚠️ Database Maintenance & Baseline Reset</h3>
            <p class="card-subtitle">Restore initial Value Pro tariff matrices and seed companies</p>
          </div>
          <div class="form-card-body">
            <p>If you wish to reset all modified rates, custom companies, and test quotations back to the pristine default <strong>Value Pro rate tables</strong>, click below.</p>
            <button class="btn btn-outline" id="btnResetAllData" style="color: #b91c1c; border-color: #fca5a5;">
              🔄 Reset Entire Database to Initial Value Pro Tables
            </button>
          </div>
        </div>
      </div>
    `;
  }

  attachEvents() {
    document.getElementById('btnSaveAllSettings')?.addEventListener('click', () => {
      const updated = {
        brokerAgencyName: document.getElementById('settingAgencyName')?.value || '',
        brokerAgentName: document.getElementById('settingAgentName')?.value || '',
        brokerPhone: document.getElementById('settingPhone')?.value || '',
        brokerEmail: document.getElementById('settingEmail')?.value || '',
        brokerAddress: document.getElementById('settingAddress')?.value || '',
        currency: document.getElementById('settingCurrency')?.value || 'USD',
        taxRatePercent: Number(document.getElementById('settingTax')?.value) || 0,
        brokerCommissionPercent: Number(document.getElementById('settingCommission')?.value) || 12,
        exchangeRates: DEFAULT_SETTINGS.exchangeRates
      };

      StorageManager.saveSettings(updated);
      this.app.showToast('Settings saved successfully!', 'success');
      this.app.updateTopBar();
    });

    document.getElementById('btnResetAllData')?.addEventListener('click', () => {
      if (confirm('WARNING: This will reset all rate tables, companies, and quotations to the default factory state. Proceed?')) {
        StorageManager.resetToDefaults();
        this.app.showToast('System reset to initial Value Pro baseline rate data!', 'success');
        this.app.render();
      }
    });
  }
}

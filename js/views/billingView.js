/**
 * Khanna Travels — Billing & Invoices View
 * Admin-only view for subscription status, agency billing details, and generated invoices.
 */
import { isAdminAuthenticated } from '../api.js';

export class BillingView {
  constructor(app) {
    this.app = app;
  }

  render() {
    return `
      <div class="admin-page-container billing-page">
        <div class="admin-page-header">
          <div class="admin-page-title-group">
            <h1 class="admin-page-title">
              <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22" aria-hidden="true">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                <path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h3a1 1 0 100-2H9z" clip-rule="evenodd"/>
              </svg>
              Billing &amp; Subscriptions
            </h1>
            <span class="badge badge-success" style="background:#e6f4ed; color:#0d6b46; font-weight:700; padding:4px 10px; border-radius:999px; font-size:12px;">Active Plan</span>
          </div>
          <div class="admin-header-actions">
            <button type="button" class="btn btn-outline" id="btnDownloadInvoiceStatement">Download Statement</button>
          </div>
        </div>

        <div style="padding: 24px;">
          <div class="settings-two-col-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-bottom: 24px;">
            <div class="settings-card" style="background:var(--white); border:1px solid var(--line); border-radius:12px; padding:20px;">
              <h3 style="font-size:16px; font-weight:700; color:var(--navy); margin-bottom:8px;">Khanna Travels Agency License</h3>
              <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">Enterprise quotation comparison and partner underwriting access.</p>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--tint); border-radius:8px; font-size:14px;">
                <span style="font-weight:600;">Renewal Date:</span>
                <span style="font-weight:700; color:var(--navy);">31 Dec 2026</span>
              </div>
            </div>

            <div class="settings-card" style="background:var(--white); border:1px solid var(--line); border-radius:12px; padding:20px;">
              <h3 style="font-size:16px; font-weight:700; color:var(--navy); margin-bottom:8px;">Payment Method</h3>
              <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">Direct agency corporate account billing.</p>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--tint); border-radius:8px; font-size:14px;">
                <span style="font-weight:600;">Status:</span>
                <span style="color:#0d6b46; font-weight:700;">Verified &amp; Current</span>
              </div>
            </div>
          </div>

          <div class="settings-card" style="background:var(--white); border:1px solid var(--line); border-radius:12px; padding:20px;">
            <h3 style="font-size:16px; font-weight:700; color:var(--navy); margin-bottom:16px;">Recent Transactions &amp; Invoices</h3>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                  <tr style="border-bottom:1px solid var(--line); text-align:left; color:var(--muted);">
                    <th style="padding:10px 8px;">Invoice #</th>
                    <th style="padding:10px 8px;">Description</th>
                    <th style="padding:10px 8px;">Date</th>
                    <th style="padding:10px 8px;">Status</th>
                    <th style="padding:10px 8px; text-align:right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid var(--line);">
                    <td style="padding:12px 8px; font-weight:600;">KT-INV-2026-001</td>
                    <td style="padding:12px 8px;">Annual Agency Enterprise Underwriting License</td>
                    <td style="padding:12px 8px;">01 Jan 2026</td>
                    <td style="padding:12px 8px;"><span style="color:#0d6b46; font-weight:700;">Paid</span></td>
                    <td style="padding:12px 8px; text-align:right; font-weight:700;">₹0 (Partner Account)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachEvents(container) {
    container.querySelector('#btnDownloadInvoiceStatement')?.addEventListener('click', () => {
      this.app.showToast('Statement downloaded successfully.', 'success');
    });
  }
}

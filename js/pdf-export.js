/**
 * Quotation PDF & Print Formatter & Email Dispatcher
 */
import { StorageManager } from './storage.js';

export class QuotationExporter {
  /**
   * Generates formatted printable HTML for official Travel Insurance Quotation
   */
  static renderQuotationDocument(quoteData) {
    const settings = StorageManager.getSettings();
    const company = StorageManager.getCompanyById(quoteData.selectedCompanyId || quoteData.companyId);
    const dateFormatted = new Date(quoteData.date || Date.now()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const validityFormatted = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const curr = quoteData.currency || 'USD';
    const currSymbol = curr === 'USD' ? '$' : curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : '₹';
    const coverageAmt = Number(quoteData.coverageAmount).toLocaleString();
    const unitPrem = quoteData.unitPremium || quoteData.premium;
    const travelers = quoteData.travelersCount || 1;
    const totalPrem = (quoteData.totalPremium || unitPrem * travelers);
    const tax = Math.round(totalPrem * (settings.taxRatePercent / 100));
    const grandTotal = totalPrem + tax;

    const benefits = (company && company.keyBenefits) ? company.keyBenefits : [
      'Emergency Medical & Hospitalization up to policy limit',
      'Medical Evacuation and Repatriation of Remains',
      'Checked Baggage Loss & Baggage Delay protection',
      'Flight Delay, Missed Connection & Trip Cancellation',
      'Cashless hospital admission network across 140+ countries',
      '24/7 Worldwide Emergency Assistance'
    ];

    return `
      <div class="quote-document" id="quoteDocToPrint">
        <!-- Document Header -->
        <div class="quote-doc-header">
          <div class="broker-info">
            <div class="broker-logo-mark">🛡️ ${settings.brokerAgencyName}</div>
            <div class="broker-sub">${settings.brokerAddress}</div>
            <div class="broker-contact">Tel: ${settings.brokerPhone} | Email: ${settings.brokerEmail}</div>
            <div class="broker-rep">Prepared by: <strong>${settings.brokerAgentName}</strong></div>
          </div>
          <div class="quote-doc-meta">
            <div class="meta-badge">TRAVEL INSURANCE QUOTATION</div>
            <div class="quote-ref">Quote Ref: <strong>${quoteData.id || 'QT-2026-DRAFT'}</strong></div>
            <div class="quote-date">Date: ${dateFormatted}</div>
            <div class="quote-validity">Valid until: ${validityFormatted} (30 Days)</div>
          </div>
        </div>

        <div class="quote-doc-divider"></div>

        <!-- Insured & Trip Summary Grid -->
        <div class="quote-doc-grid">
          <div class="doc-card">
            <h4>👤 Primary Insured & Travelers</h4>
            <table class="doc-meta-table">
              <tr>
                <td>Customer Name:</td>
                <td><strong>${quoteData.customerName}</strong></td>
              </tr>
              <tr>
                <td>Age / Age Band:</td>
                <td><strong>${quoteData.customerAge} yrs</strong> (${quoteData.ageBand ? quoteData.ageBand.label : 'Standard'})</td>
              </tr>
              <tr>
                <td>Number of Travelers:</td>
                <td><strong>${travelers} Person(s)</strong></td>
              </tr>
              <tr>
                <td>Departure Country:</td>
                <td>${quoteData.departureCountry || 'International'}</td>
              </tr>
            </table>
          </div>

          <div class="doc-card">
            <h4>✈️ Trip & Itinerary Details</h4>
            <table class="doc-meta-table">
              <tr>
                <td>Destination:</td>
                <td><strong>${quoteData.destinationCountry || 'Worldwide'}</strong></td>
              </tr>
              <tr>
                <td>Travel Dates:</td>
                <td><strong>${quoteData.departureDate}</strong> to <strong>${quoteData.returnDate}</strong></td>
              </tr>
              <tr>
                <td>Duration / Days Slab:</td>
                <td><strong>${quoteData.durationDays} Days</strong> (${quoteData.slabId || quoteData.daySlab?.label || 'Standard Slab'})</td>
              </tr>
              <tr>
                <td>Geographic Scope:</td>
                <td><span class="pill-scope ${quoteData.region}">${quoteData.region === 'including' ? 'Including USA & Canada' : 'Excluding USA & Canada'}</span></td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Selected Insurance Policy -->
        <div class="doc-section">
          <h4>🏛️ Underwriting Insurance Provider & Plan</h4>
          <div class="insurer-banner-card">
            <div class="insurer-brand-left">
              <span class="brand-icon">${company ? company.logo : '🛡️'}</span>
              <div>
                <div class="brand-name">${company ? company.name : 'Value Pro Partner'}</div>
                <div class="brand-plan">Plan: <strong>${quoteData.planName || (company ? company.planName : 'Value Pro')}</strong></div>
                <div class="brand-rating">⭐ ${company ? company.rating : 4.8} / 5.0 Rating • Claim Settlement Ratio: <strong>${company ? company.claimRatio : '98.6%'}</strong></div>
              </div>
            </div>
            <div class="insurer-sum-insured">
              <div class="si-title">SUM INSURED (COVERAGE)</div>
              <div class="si-amount">USD $${coverageAmt}</div>
              <div class="si-deductible">Deductible: ${company ? company.deductible : 'USD 100'}</div>
            </div>
          </div>
        </div>

        <!-- Key Benefits Table -->
        <div class="doc-section">
          <h4>📋 Summary of Covered Benefits</h4>
          <div class="benefits-grid-doc">
            ${benefits.map(b => `
              <div class="benefit-doc-item">
                <span class="check-icon">✓</span>
                <span>${b}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Financial Breakdown -->
        <div class="doc-section">
          <h4>💵 Premium Breakdown</h4>
          <table class="financial-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Units</th>
                <th>Rate / Person</th>
                <th style="text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Overseas Travel Insurance (${quoteData.planName})</strong>
                  <div class="small-desc">Duration: ${quoteData.durationDays} Days | Age Band: ${quoteData.ageBand?.label || quoteData.customerAge + ' yrs'} | Sum Insured: USD $${coverageAmt}</div>
                </td>
                <td>${travelers}</td>
                <td>${currSymbol}${unitPrem}</td>
                <td style="text-align:right;"><strong>${currSymbol}${totalPrem}</strong></td>
              </tr>
              ${settings.taxRatePercent > 0 ? `
                <tr>
                  <td>Applicable Tax / GST (${settings.taxRatePercent}%)</td>
                  <td>1</td>
                  <td>${currSymbol}${tax}</td>
                  <td style="text-align:right;">${currSymbol}${tax}</td>
                </tr>
              ` : ''}
              <tr class="total-row">
                <td colspan="3"><strong>Total Premium Payable</strong></td>
                <td style="text-align:right;"><span class="grand-total">${currSymbol}${grandTotal}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Support & Terms -->
        <div class="doc-section terms-section">
          <div class="hotline-box">
            <strong>📞 24/7 Global Emergency Assistance:</strong> ${company ? company.supportPhone : '+1-800-456-8290'} | <strong>Email:</strong> ${company ? company.emergencyEmail : 'claims@insurance.com'}
          </div>
          <div class="disclaimer-text">
            <strong>Important Conditions:</strong> ${company ? company.terms : 'Covers sudden unforeseen medical emergencies during the travel period. Excludes elective treatments and undisclosed pre-existing conditions beyond emergency stabilization limits.'}
          </div>
        </div>

        <!-- Document Footer -->
        <div class="doc-footer">
          <div>This quotation is generated electronically by ${settings.brokerAgencyName} and is subject to underwriter confirmation upon policy issuance.</div>
          <div class="doc-stamp">APPROVED FOR CLIENT PRESENTATION</div>
        </div>
      </div>
    `;
  }

  /**
   * Opens print dialog with the clean quotation document
   */
  static printQuotation(quoteData) {
    const htmlContent = this.renderQuotationDocument(quoteData);
    
    // Create print iframe or print window
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Pop-up blocked! Please allow pop-ups to print or save the PDF quotation.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Travel Insurance Quote - ${quoteData.id || 'Quotation'}</title>
        <link rel="stylesheet" href="css/main.css">
        <link rel="stylesheet" href="css/print.css">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
      </head>
      <body class="print-mode" onload="window.print(); setTimeout(function(){ window.close(); }, 500);">
        ${htmlContent}
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * Generates email preview text
   */
  static getEmailContent(quoteData) {
    const settings = StorageManager.getSettings();
    const company = StorageManager.getCompanyById(quoteData.selectedCompanyId || quoteData.companyId);
    const plan = quoteData.planName || (company ? company.planName : 'Value Pro');
    const curr = quoteData.currency || 'USD';
    const currSymbol = curr === 'USD' ? '$' : curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : '₹';

    return {
      to: `${quoteData.customerName.toLowerCase().replace(/\s+/g, '.')}@clientmail.com`,
      subject: `Your Travel Insurance Quotation (${quoteData.id || 'Ref'}) - ${quoteData.destinationCountry}`,
      body: `Dear ${quoteData.customerName},

Thank you for requesting a travel insurance quotation for your upcoming trip to ${quoteData.destinationCountry}.

Here is the summary of your customized quotation:
-----------------------------------------------------------
• Quotation Reference: ${quoteData.id || 'QT-2026-DRAFT'}
• Insurance Provider: ${company ? company.name : 'Value Pro'}
• Plan: ${plan}
• Trip Duration: ${quoteData.durationDays} Days (${quoteData.departureDate} to ${quoteData.returnDate})
• Coverage Amount (Sum Insured): USD $${Number(quoteData.coverageAmount).toLocaleString()}
• Region: ${quoteData.region === 'including' ? 'Including USA & Canada' : 'Excluding USA & Canada'}
• Total Premium: ${currSymbol}${quoteData.totalPremium || quoteData.premium} (${quoteData.travelersCount || 1} traveler)
• Policy Deductible: ${company ? company.deductible : 'USD 100'}

Key Benefits Included:
- Emergency Medical & Hospitalization up to $${Number(quoteData.coverageAmount).toLocaleString()}
- 24/7 Global Cashless Medical Assistance
- Checked Baggage Loss & Flight Delay protection
- Trip Interruption & Emergency Medical Evacuation

This quote is valid for 30 days. To proceed with binding the coverage or if you need any adjustments, please reply to this email or call us at ${settings.brokerPhone}.

Warm regards,

${settings.brokerAgentName}
${settings.brokerAgencyName}
${settings.brokerAddress}`
    };
  }
}

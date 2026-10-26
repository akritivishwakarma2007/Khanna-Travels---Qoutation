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

  // ── High-Resolution HTML2Canvas Quote Card Exporter ───────────────────────

  /**
   * Lazily loads html2canvas library if not already present on window
   */
  static async loadHtml2Canvas() {
    if (typeof window !== 'undefined' && window.html2canvas) {
      return window.html2canvas;
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/vendor/html2canvas.min.js';
      script.onload = () => resolve(window.html2canvas);
      script.onerror = () => reject(new Error('Could not load html2canvas library.'));
      document.head.appendChild(script);
    });
  }

  /**
   * Renders any target DOM element to a sharp 2x retina canvas via html2canvas
   */
  static async generateQuoteCanvas(targetEl, options = {}) {
    await QuotationExporter.loadHtml2Canvas();
    return await window.html2canvas(targetEl, {
      scale: 2, // 2x crisp retina clarity
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      scrollY: 0,
      scrollX: 0,
      ...options
    });
  }

  /**
   * Triggers download of a Blob as a PNG image
   */
  static triggerDownloadBlob(blob, filename = 'Khanna-Travels-Quote.png') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Writes canvas PNG blob to OS clipboard (with fallback download)
   */
  static async copyCanvasToClipboard(canvas, fallbackFilename = 'Khanna-Travels-Quotes-Combined.png') {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('Failed to create PNG blob from canvas'));
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            resolve({ method: 'clipboard', blob });
          } else {
            QuotationExporter.triggerDownloadBlob(blob, fallbackFilename);
            resolve({ method: 'download', blob });
          }
        } catch (err) {
          QuotationExporter.triggerDownloadBlob(blob, fallbackFilename);
          resolve({ method: 'download', blob });
        }
      }, 'image/png');
    });
  }

  /**
   * Builds an off-screen container for exporting multiple insurer quote tables:
   * 1. Extracts only the quote table (.print-quote-block / table) from each insurer card.
   * 2. Excludes UI controls (header strip, building icon, 'N options' badge, Copy/Save/Text buttons).
   * 3. Arranges cards in a clean 2-column grid (564px each + 24px gap + 24px outer padding = 1200px width).
   * 4. Equal height per row: stretches the shorter card so bottoms line up, absorbing space in premium rows.
   * 5. If an odd number of cards, the last card stays at 564px width and aligns to the left.
   * 6. Fixed 1200px width with white background.
   */
  static buildCombinedQuotesExportContainer(tableBlocks) {
    const container = document.createElement('div');
    container.id = 'khannaCombinedQuotesExportContainer';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1200px';
    container.style.background = '#ffffff';
    container.style.padding = '24px';
    container.style.boxSizing = 'border-box';
    container.style.fontFamily = 'Arial, sans-serif';

    const normalizedCards = [];
    tableBlocks.forEach(item => {
      let cardEl = null;
      if (typeof item === 'string') {
        const temp = document.createElement('div');
        temp.innerHTML = item;
        cardEl = temp.querySelector('.print-quote-block') || temp.querySelector('.print-quote-table') || temp.firstElementChild;
      } else if (item instanceof HTMLElement) {
        // Clone only the quote block / table, never the company header toolbar
        const block = item.querySelector('.print-quote-block');
        if (block) {
          cardEl = block.cloneNode(true);
        } else if (item.matches('.print-quote-block')) {
          cardEl = item.cloneNode(true);
        } else {
          const tbl = item.querySelector('.print-quote-table') || item.querySelector('table');
          if (tbl) {
            const blockWrap = document.createElement('div');
            blockWrap.className = 'print-quote-block';
            blockWrap.style.cssText = 'border:1.5px solid #1B3A6B; border-radius:6px; overflow:hidden; background:#ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.08);';
            blockWrap.appendChild(tbl.cloneNode(true));
            cardEl = blockWrap;
          } else {
            cardEl = item.cloneNode(true);
          }
        }
      }

      if (!cardEl) return;

      // Ensure standard card styling
      cardEl.style.width = '100%';
      cardEl.style.height = '100%';
      cardEl.style.boxSizing = 'border-box';
      cardEl.style.display = 'block';
      cardEl.style.margin = '0';
      cardEl.style.background = '#ffffff';
      cardEl.style.border = '1.5px solid #1B3A6B';
      cardEl.style.borderRadius = '6px';
      cardEl.style.overflow = 'hidden';
      cardEl.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';

      // Strip any accidental .no-print controls inside if present
      cardEl.querySelectorAll('.no-print').forEach(el => el.remove());

      // Prepare table and rows
      const table = cardEl.matches('table') ? cardEl : cardEl.querySelector('table');
      if (table) {
        table.style.width = '100%';
        table.style.height = '100%';
        table.style.borderCollapse = 'collapse';

        // Keep title and header rows at natural content height by locking height: 1px
        const rows = table.querySelectorAll('tr');
        rows.forEach(tr => {
          const text = (tr.textContent || '').trim();
          const isTitleRow = text.includes('Travel Insurance Quote');
          const isInsurerRow = text.includes('Insurance from');
          const isCountryRow = text.includes('Country');
          const isDaysRow = text.includes('No. of Days');
          const isPlanRow = tr.classList.contains('plan-highlight-band') || text.startsWith('Plan:');
          const isSumInsuredHeader = text.includes('Sum Insured & Premium Options');

          if (isTitleRow || isInsurerRow || isCountryRow || isDaysRow || isPlanRow || isSumInsuredHeader) {
            tr.style.height = '1px';
            tr.querySelectorAll('td, th').forEach(cell => {
              cell.style.height = '1px';
            });
          } else {
            // Premium row: absorbs extra height in stretched cards
            tr.style.height = 'auto';
          }
        });
      }

      normalizedCards.push(cardEl);
    });

    if (normalizedCards.length === 0) {
      container.remove();
      throw new Error('No valid insurer quote tables found to export.');
    }

    // Two-column layout: 1200px container - 48px padding (24px each side) = 1152px
    // 1152px - 24px gap = 1128px / 2 = 564px per card column
    const colWidth = 564;
    const gap = 24;

    const rowPairs = [];
    for (let i = 0; i < normalizedCards.length; i += 2) {
      const rowEl = document.createElement('div');
      rowEl.className = 'quote-export-row';
      rowEl.style.display = 'flex';
      rowEl.style.gap = `${gap}px`;
      rowEl.style.width = '100%';
      rowEl.style.boxSizing = 'border-box';
      if (i + 2 < normalizedCards.length) {
        rowEl.style.marginBottom = `${gap}px`;
      }

      const cardA = normalizedCards[i];
      const colA = document.createElement('div');
      colA.className = 'quote-export-col';
      colA.style.width = `${colWidth}px`;
      colA.style.flex = `0 0 ${colWidth}px`;
      colA.style.boxSizing = 'border-box';
      colA.style.display = 'flex';
      colA.style.flexDirection = 'column';
      colA.appendChild(cardA);
      rowEl.appendChild(colA);

      let cardB = null;
      let colB = null;
      if (i + 1 < normalizedCards.length) {
        cardB = normalizedCards[i + 1];
        colB = document.createElement('div');
        colB.className = 'quote-export-col';
        colB.style.width = `${colWidth}px`;
        colB.style.flex = `0 0 ${colWidth}px`;
        colB.style.boxSizing = 'border-box';
        colB.style.display = 'flex';
        colB.style.flexDirection = 'column';
        colB.appendChild(cardB);
        rowEl.appendChild(colB);
      }

      container.appendChild(rowEl);
      rowPairs.push({ colA, colB, cardA, cardB });
    }

    // Append to DOM to calculate natural geometry
    document.body.appendChild(container);

    // Make the two boxes in each row the same height by matching to the taller box
    rowPairs.forEach(({ colA, colB, cardA, cardB }) => {
      if (cardA && cardB && colB) {
        const hA = cardA.offsetHeight;
        const hB = cardB.offsetHeight;
        const maxH = Math.max(hA, hB);

        colA.style.height = `${maxH}px`;
        colB.style.height = `${maxH}px`;
        cardA.style.height = `${maxH}px`;
        cardB.style.height = `${maxH}px`;
      }
    });

    return {
      container,
      cleanup: () => {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    };
  }

  /**
   * Generates a sharp canvas of all insurer quote tables in a clean 2-column grid
   */
  static async exportAllInsurersCanvas(tableBlocks) {
    const { container, cleanup } = QuotationExporter.buildCombinedQuotesExportContainer(tableBlocks);
    try {
      // Allow browser layout and font rendering reflow
      await new Promise(resolve => setTimeout(resolve, 50));
      return await QuotationExporter.generateQuoteCanvas(container, {
        scale: 2,
        backgroundColor: '#ffffff'
      });
    } finally {
      cleanup();
    }
  }

  /**
   * Copies all combined insurer quote tables to clipboard
   */
  static async copyAllInsurersImage(tableBlocks) {
    const canvas = await QuotationExporter.exportAllInsurersCanvas(tableBlocks);
    return await QuotationExporter.copyCanvasToClipboard(canvas, 'Khanna-Travels-Quotes-Combined.png');
  }

  /**
   * Downloads all combined insurer quote tables as PNG image
   */
  static async downloadAllInsurersImage(tableBlocks, filename = 'Khanna-Travels-Quotes-Combined.png') {
    const canvas = await QuotationExporter.exportAllInsurersCanvas(tableBlocks);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Failed to create PNG blob'));
        QuotationExporter.triggerDownloadBlob(blob, filename);
        resolve({ method: 'download', blob });
      }, 'image/png');
    });
  }
}


/**
 * Quote Service
 * Handles loading quote details for Individual and Group policy issuance.
 *
 * // TODO(API): Replace mock implementations with live endpoint calls to your quotation backend.
 */
import { ISSUE_POLICY_CONFIG } from '../config.js';
import { getBaseUrl } from '../../api.js';

export const quoteService = {
  /**
   * Loads an Individual quote by ID.
   * @param {string} quoteId
   * @returns {Promise<Object>}
   */
  async getQuote(quoteId = 'QT-2026-IND-001') {
    // // TODO(API): Once live quotation endpoint is connected, set USE_LIVE_QUOTE_API: true in config.js
    if (ISSUE_POLICY_CONFIG.USE_LIVE_QUOTE_API) {
      try {
        const response = await fetch(`${getBaseUrl()}/api/quotes/${encodeURIComponent(quoteId)}`);
        if (response.ok) {
          const q = await response.json();
          return this._mapBackendQuote(q, quoteId);
        }
      } catch (err) {
        console.warn('Backend quote lookup failed, falling back to scaffold quote:', err.message);
      }
    }

    // Scaffold mock delay
    await new Promise(resolve => setTimeout(resolve, 150));

    // // TODO(FORMAT): Adapt mock quote structure to match your actual quote format
    return {
      quoteId: quoteId || 'QT-2026-IND-001',
      planName: 'Bajaj Allianz Travel Elite - Gold',
      companyName: 'Bajaj Allianz',
      totalPremium: 3450,
      currency: 'INR',
      travellerName: 'Aarav Sharma',
      dob: '1992-05-15',
      destination: 'Schengen (Europe)',
      tripStart: '2026-12-01',
      tripEnd: '2026-12-15',
      durationDays: 15,
      coverTable: [
        { benefit: 'Emergency Medical & Evacuation', amount: '$100,000' },
        { benefit: 'Trip Cancellation & Curtailment', amount: '$2,500' },
        { benefit: 'Baggage Loss / Delay', amount: '$1,000' },
        { benefit: 'Personal Accident', amount: '$25,000' },
        { benefit: 'Passport Loss Assistance', amount: '$500' },
        { benefit: 'Personal Liability', amount: '$50,000' }
      ]
    };
  },

  /**
   * Loads a Group quote by ID.
   * @param {string} quoteId
   * @returns {Promise<Object>}
   */
  async getGroupQuote(quoteId = 'QT-2026-GRP-002') {
    // // TODO(API): Once live group quotation endpoint is connected, set USE_LIVE_QUOTE_API: true in config.js
    if (ISSUE_POLICY_CONFIG.USE_LIVE_QUOTE_API) {
      try {
        const response = await fetch(`${getBaseUrl()}/api/quotes/group/${encodeURIComponent(quoteId)}`);
        if (response.ok) {
          return await response.json();
        }
      } catch (err) {
        console.warn('Backend group quote lookup failed, falling back to scaffold quote:', err.message);
      }
    }

    // Scaffold mock delay
    await new Promise(resolve => setTimeout(resolve, 150));

    const travellerCount = 6;
    const perTravellerPremium = 2850;

    // // TODO(FORMAT): Adapt mock group quote structure to match your actual quote format
    return {
      quoteId: quoteId || 'QT-2026-GRP-002',
      planName: 'ICICI Lombard Corporate Travel Comprehensive',
      companyName: 'ICICI Lombard',
      perTravellerPremium,
      travellerCountQuoted: travellerCount,
      estimatedTotal: travellerCount * perTravellerPremium,
      currency: 'INR',
      destination: 'United Arab Emirates & Schengen',
      tripStart: '2026-12-10',
      tripEnd: '2026-12-24',
      durationDays: 15,
      coverTable: [
        { benefit: 'Medical Expenses including Evacuation', amount: '$150,000' },
        { benefit: 'Hospital Daily Cash', amount: '$50 / day' },
        { benefit: 'Total Loss of Checked Baggage', amount: '$1,200' },
        { benefit: 'Flight Delay (over 6 hours)', amount: '$200' },
        { benefit: 'Emergency Financial Assistance', amount: '$1,000' },
        { benefit: 'Accidental Death & Dismemberment', amount: '$50,000' }
      ]
    };
  },

  /**
   * Helper to map backend Quote document to the Issue Policy quote view shape
   */
  _mapBackendQuote(q, quoteId) {
    if (!q) return null;
    const plan = q.selectedPlan || (Array.isArray(q.selectedPlans) && q.selectedPlans[0]) || {};
    return {
      quoteId: q.quoteReference || quoteId,
      planName: plan.planName || 'Standard Travel Plan',
      companyName: plan.companyName || 'Insurance Provider',
      totalPremium: plan.premium || 3450,
      currency: 'INR',
      travellerName: q.customerName || 'Customer',
      dob: q.dob || '1992-05-15',
      destination: q.arrivalCountry || q.travellingCountry || 'Worldwide',
      tripStart: q.departureDate || '2026-12-01',
      tripEnd: q.returnDate || '2026-12-15',
      durationDays: q.travelDays || 15,
      coverTable: [
        { benefit: 'Emergency Medical & Evacuation', amount: `$${(q.coverageRequested || 100000).toLocaleString()}` },
        { benefit: 'Trip Cancellation & Curtailment', amount: '$2,500' },
        { benefit: 'Baggage Loss / Delay', amount: '$1,000' },
        { benefit: 'Personal Accident', amount: '$25,000' },
        { benefit: 'Passport Loss Assistance', amount: '$500' },
        { benefit: 'Personal Liability', amount: '$50,000' }
      ]
    };
  }
};

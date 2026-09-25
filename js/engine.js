/**
 * Quotation Engine - Core Business Logic & Calculation Rules
 */
import { DAY_SLABS, AGE_BANDS } from './data.js';

export class QuotationEngine {
  /**
   * Calculate travel duration in days (inclusive of departure & return day)
   */
  static calculateDuration(departureDateStr, returnDateStr) {
    if (!departureDateStr || !returnDateStr) return 0;
    const dep = new Date(departureDateStr);
    const ret = new Date(returnDateStr);
    
    // Normalize to midnight UTC for clean date diff
    const utcDep = Date.UTC(dep.getFullYear(), dep.getMonth(), dep.getDate());
    const utcRet = Date.UTC(ret.getFullYear(), ret.getMonth(), ret.getDate());
    
    if (isNaN(utcDep) || isNaN(utcRet)) return 0;
    if (utcRet < utcDep) return -1; // invalid
    
    const diffTime = utcRet - utcDep;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }

  /**
   * Match duration days to standard Days Slab
   */
  static matchDaySlab(days) {
    if (!days || days < 1 || days > 180) return null;
    return DAY_SLABS.find(slab => days >= slab.min && days <= slab.max) || null;
  }

  /**
   * Match traveler age to standard Age Band
   */
  static matchAgeBand(age) {
    if (age === null || age === undefined || age === '' || isNaN(age)) return null;
    const numericAge = parseInt(age, 10);
    if (numericAge < 0 || numericAge > 85) return null;
    return AGE_BANDS.find(band => numericAge >= band.min && numericAge <= band.max) || null;
  }

  /**
   * Comprehensive form validation
   */
  static validateCriteria(criteria) {
    const errors = [];
    const warnings = [];

    // Customer validation
    if (!criteria.customerName || criteria.customerName.trim() === '') {
      errors.push('Customer Name is required.');
    }

    if (criteria.age === undefined || criteria.age === null || criteria.age === '') {
      errors.push('Customer Age is required.');
    } else {
      const age = parseInt(criteria.age, 10);
      if (isNaN(age) || age < 0) {
        errors.push('Please enter a valid age (0 or greater).');
      } else if (age > 85) {
        errors.push('Traveler age exceeds maximum eligible insurable limit (85 years).');
      }
    }

    const travelers = parseInt(criteria.travelersCount, 10);
    if (isNaN(travelers) || travelers < 1) {
      errors.push('Number of travelers must be at least 1.');
    } else if (travelers > 10) {
      warnings.push('For groups of more than 10 travelers, group corporate rates may be more cost-effective.');
    }

    // Dates validation
    if (!criteria.departureDate) {
      errors.push('Departure date is required.');
    }
    if (!criteria.returnDate) {
      errors.push('Return / arrival date is required.');
    }

    if (criteria.departureDate && criteria.returnDate) {
      const duration = this.calculateDuration(criteria.departureDate, criteria.returnDate);
      if (duration === -1) {
        errors.push('Return date cannot be earlier than Departure date.');
      } else if (duration === 0) {
        errors.push('Invalid trip dates entered.');
      } else if (duration > 180) {
        errors.push(`Trip duration of ${duration} days exceeds maximum standard single-trip coverage limit (180 days). Consider an Annual Multi-Trip policy.`);
      }
    }

    // Region & Destination validation
    if (!criteria.coverageAmount) {
      errors.push('Please select a coverage amount (Sum Insured).');
    }

    if (!criteria.region) {
      errors.push('Please specify USA & Canada coverage preference.');
    }

    // Region mismatch warning
    if (criteria.destinationCountry) {
      const destLower = criteria.destinationCountry.toLowerCase();
      const isUSACanada = destLower.includes('united states') || destLower.includes('usa') || destLower.includes('canada');
      if (isUSACanada && criteria.region === 'excluding') {
        warnings.push('Warning: Destination is USA/Canada, but "Excluding USA & Canada" is selected. Claims incurred in USA/Canada will not be honored under this selection.');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Dynamically query matching quotations across all companies
   */
  static getQuotations({ age, departureDate, returnDate, coverageAmount, region, travelersCount = 1, rates, companies }) {
    const durationDays = this.calculateDuration(departureDate, returnDate);
    const daySlab = this.matchDaySlab(durationDays);
    const ageBand = this.matchAgeBand(age);
    const travelers = Math.max(1, parseInt(travelersCount, 10) || 1);

    if (!daySlab || !ageBand) {
      return {
        success: false,
        durationDays,
        daySlab,
        ageBand,
        quotes: [],
        analytics: null,
        message: !daySlab ? 'Trip duration outside supported day slabs (1-180 days)' : 'Age outside supported bands (0-85 years)'
      };
    }

    const quotes = [];

    companies.forEach(company => {
      // Find matching rate in database
      const match = rates.find(r => 
        r.companyId === company.id &&
        Number(r.coverageAmount) === Number(coverageAmount) &&
        r.region === region &&
        r.ageBandId === ageBand.id &&
        r.slabId === daySlab.id
      );

      if (match) {
        const unitPremium = match.premium;
        const totalPremium = unitPremium * travelers;

        quotes.push({
          companyId: company.id,
          companyName: company.name,
          planName: company.planName,
          logo: company.logo,
          rating: company.rating,
          reviewsCount: company.reviewsCount,
          claimRatio: company.claimRatio,
          color: company.color,
          deductible: company.deductible,
          supportPhone: company.supportPhone,
          emergencyEmail: company.emergencyEmail,
          keyBenefits: company.keyBenefits,
          terms: company.terms,
          coverageAmount: Number(coverageAmount),
          region: region,
          unitPremium: unitPremium,
          travelersCount: travelers,
          totalPremium: totalPremium,
          currency: match.currency || 'USD',
          daySlab: daySlab,
          ageBand: ageBand,
          durationDays: durationDays
        });
      }
    });

    // Sort by lowest premium by default
    quotes.sort((a, b) => a.totalPremium - b.totalPremium);

    // Compute comparison analytics
    let analytics = null;
    if (quotes.length > 0) {
      const premiums = quotes.map(q => q.totalPremium);
      const lowestPremium = Math.min(...premiums);
      const highestPremium = Math.max(...premiums);
      const averagePremium = Math.round(premiums.reduce((acc, p) => acc + p, 0) / premiums.length);
      const premiumDifference = highestPremium - lowestPremium;

      // Identify Best Price
      quotes.forEach((q, idx) => {
        q.isCheapest = (q.totalPremium === lowestPremium);
        // Recommended logic: high rating, reasonable deductible, balanced price
        q.isRecommended = (idx === 0 && quotes.length <= 2) || (idx === 1 && quotes[idx].rating >= 4.8) || (q.isCheapest && q.rating >= 4.7);
      });

      // Ensure at least one recommended plan
      if (!quotes.some(q => q.isRecommended)) {
        quotes[0].isRecommended = true;
      }

      analytics = {
        lowestPremium,
        highestPremium,
        averagePremium,
        premiumDifference,
        cheapestQuote: quotes.find(q => q.isCheapest),
        recommendedQuote: quotes.find(q => q.isRecommended) || quotes[0],
        totalQuotesCount: quotes.length
      };
    }

    return {
      success: quotes.length > 0,
      durationDays,
      daySlab,
      ageBand,
      quotes,
      analytics
    };
  }
}

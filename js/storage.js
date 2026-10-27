/**
 * Storage & Data Repository Layer
 * Manages LocalStorage persistence, rate matrix updates, CSV export/import, and settings
 */
import { INITIAL_RATES, INSURANCE_COMPANIES, SAMPLE_QUOTATIONS, SAMPLE_CUSTOMERS, DAY_SLABS, AGE_BANDS, COVERAGE_AMOUNTS, REGIONS } from './data.js';

const STORAGE_KEYS = {
  RATES: 'ins_rates_v1',
  COMPANIES: 'ins_companies_v1',
  QUOTATIONS: 'ins_quotations_v1',
  CUSTOMERS: 'ins_customers_v1',
  SETTINGS: 'ins_settings_v1'
};

export const DEFAULT_SETTINGS = {
  brokerAgencyName: 'Khanna Travels',
  brokerAgentName: 'Khanna Agent',
  brokerPhone: '+91-9876543210',
  brokerEmail: 'quotes@khannatravels.com',
  brokerAddress: 'Khanna Travels, New Delhi, India',
  currency: 'INR',
  taxRatePercent: 18,
  brokerCommissionPercent: 12,
  exchangeRates: {
    USD: 83.50,
    EUR: 90.20,
    GBP: 106.00,
    INR: 1.0
  }
};

export class StorageManager {
  static init() {
    if (!localStorage.getItem(STORAGE_KEYS.RATES)) {
      this.set(STORAGE_KEYS.RATES, INITIAL_RATES);
    }
    if (!localStorage.getItem(STORAGE_KEYS.COMPANIES)) {
      this.set(STORAGE_KEYS.COMPANIES, INSURANCE_COMPANIES);
    }
    if (!localStorage.getItem(STORAGE_KEYS.QUOTATIONS)) {
      this.set(STORAGE_KEYS.QUOTATIONS, SAMPLE_QUOTATIONS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.CUSTOMERS)) {
      this.set(STORAGE_KEYS.CUSTOMERS, SAMPLE_CUSTOMERS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      this.set(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    }
    this.syncWithBackend();
  }

  static async syncWithBackend() {
    try {
      const [quotesRes, companiesRes] = await Promise.all([
        fetch('/api/quotes?limit=100').then(r => r.json()).catch(() => null),
        fetch('/api/companies').then(r => r.json()).catch(() => null)
      ]);

      if (Array.isArray(quotesRes) && quotesRes.length > 0) {
        const mappedQuotes = quotesRes.map(q => ({
          id: q.quoteReference || q._id,
          customerName: q.customerName || 'Customer',
          customerAge: q.age || 35,
          age: q.age || 35,
          travelDays: q.travelDays || 15,
          departureDate: q.departureDate || '',
          returnDate: q.returnDate || '',
          date: q.createdAt ? q.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
          destinationCountry: q.arrivalCountry || q.travellingCountry || 'Worldwide',
          planName: q.selectedPlan ? q.selectedPlan.planName : (q.selectedPlans && q.selectedPlans[0] ? q.selectedPlans[0].planName : 'Value Pro'),
          companyName: q.selectedPlan ? q.selectedPlan.companyName : (q.selectedPlans && q.selectedPlans[0] ? q.selectedPlans[0].companyName : 'ICICI Lombard'),
          coverageAmount: q.coverageRequested || (q.selectedPlan ? q.selectedPlan.coverage : 250000),
          premium: q.selectedPlan ? q.selectedPlan.premium : (q.selectedPlans && q.selectedPlans[0] ? q.selectedPlans[0].premium : 58),
          totalPremium: q.selectedPlan ? q.selectedPlan.premium : 58,
          status: q.status || 'Active'
        }));
        this.set(STORAGE_KEYS.QUOTATIONS, mappedQuotes);

        // Build customer profiles from real quotes
        const custMap = new Map();
        mappedQuotes.forEach(q => {
          const key = (q.customerName || '').toLowerCase().trim();
          if (!key) return;
          if (!custMap.has(key)) {
            custMap.set(key, {
              id: `CUST-${String(custMap.size + 1).padStart(3, '0')}`,
              name: q.customerName,
              email: `${q.customerName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@clientmail.com`,
              phone: '+91 98' + Math.floor(10000000 + Math.random() * 90000000),
              age: q.customerAge || q.age || 35,
              passportNumber: 'P' + Math.floor(1000000 + Math.random() * 9000000),
              totalQuotes: 1,
              lastActive: q.date
            });
          } else {
            const c = custMap.get(key);
            c.totalQuotes += 1;
            if (q.date > c.lastActive) c.lastActive = q.date;
          }
        });
        if (custMap.size > 0) {
          this.set(STORAGE_KEYS.CUSTOMERS, Array.from(custMap.values()));
        }
      }

      if (Array.isArray(companiesRes) && companiesRes.length > 0) {
        const mappedCompanies = companiesRes.map(c => {
          const firstPlan = (c.plans && c.plans[0]) || {};
          return {
            id: c._id || c.companyName.toLowerCase().replace(/\s+/g, '-'),
            name: c.companyName,
            planName: firstPlan.planName || 'Comprehensive',
            rating: 4.8,
            reviewsCount: 120,
            claimRatio: '98.4%',
            deductible: '$0 Deductible',
            logo: '🛡️',
            supportPhone: '1800-2666',
            keyBenefits: ['Emergency Evacuation', 'Trip Interruption', 'Baggage Loss']
          };
        });
        this.set(STORAGE_KEYS.COMPANIES, mappedCompanies);
      }
    } catch (err) {
      console.warn('Could not sync storage with real MongoDB data:', err.message);
    }
  }

  static get(key, fallback = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return fallback;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Error writing ${key} to localStorage:`, e);
      return false;
    }
  }

  // --- RATES ---
  static getRates() {
    return this.get(STORAGE_KEYS.RATES, INITIAL_RATES);
  }

  static saveRates(rates) {
    return this.set(STORAGE_KEYS.RATES, rates);
  }

  static updateSingleRate(companyId, coverageAmount, region, slabId, ageBandId, newPremium) {
    const rates = this.getRates();
    const idx = rates.findIndex(r => 
      r.companyId === companyId &&
      Number(r.coverageAmount) === Number(coverageAmount) &&
      r.region === region &&
      r.slabId === slabId &&
      r.ageBandId === ageBandId
    );

    if (idx !== -1) {
      rates[idx].premium = Number(newPremium);
    } else {
      // Find slab and age band details
      const slab = DAY_SLABS.find(s => s.id === slabId);
      const band = AGE_BANDS.find(b => b.id === ageBandId);
      const comp = this.getCompanyById(companyId);

      rates.push({
        companyId,
        planName: comp ? comp.planName : 'Standard',
        coverageAmount: Number(coverageAmount),
        region,
        ageBandId,
        ageFrom: band ? band.min : 0,
        ageTo: band ? band.max : 40,
        slabId,
        daysFrom: slab ? slab.min : 1,
        daysTo: slab ? slab.max : 4,
        premium: Number(newPremium),
        currency: 'USD'
      });
    }

    this.saveRates(rates);
    return rates;
  }

  // --- COMPANIES ---
  static getCompanies() {
    return this.get(STORAGE_KEYS.COMPANIES, INSURANCE_COMPANIES);
  }

  static getCompanyById(companyId) {
    const companies = this.getCompanies();
    return companies.find(c => c.id === companyId) || null;
  }

  static addCompany(company) {
    const companies = this.getCompanies();
    companies.push(company);
    this.set(STORAGE_KEYS.COMPANIES, companies);

    // Also generate baseline rate entries for the new company based on default multipliers
    const rates = this.getRates();
    const valueProRates = rates.filter(r => r.companyId === 'trawelltag-valuepro');
    
    // Scale slightly by random/default factor for new insurer
    const compMultiplier = 1.02;
    valueProRates.forEach(vRate => {
      rates.push({
        ...vRate,
        companyId: company.id,
        planName: company.planName,
        premium: Math.round(vRate.premium * compMultiplier)
      });
    });

    this.saveRates(rates);
    return company;
  }

  static deleteCompany(companyId) {
    let companies = this.getCompanies();
    companies = companies.filter(c => c.id !== companyId);
    this.set(STORAGE_KEYS.COMPANIES, companies);

    let rates = this.getRates();
    rates = rates.filter(r => r.companyId !== companyId);
    this.saveRates(rates);
  }

  // --- QUOTATIONS ---
  static getQuotations() {
    return this.get(STORAGE_KEYS.QUOTATIONS, SAMPLE_QUOTATIONS);
  }

  static saveQuotation(quote) {
    const quotes = this.getQuotations();
    const existingIdx = quotes.findIndex(q => q.id === quote.id);
    if (existingIdx !== -1) {
      quotes[existingIdx] = quote;
    } else {
      quotes.unshift(quote);
    }
    this.set(STORAGE_KEYS.QUOTATIONS, quotes);

    // Auto-update or add customer record
    this.recordCustomerActivity(quote.customerName, quote.customerAge);
    return quote;
  }

  static deleteQuotation(quoteId) {
    let quotes = this.getQuotations();
    quotes = quotes.filter(q => q.id !== quoteId);
    this.set(STORAGE_KEYS.QUOTATIONS, quotes);
    return quotes;
  }

  // --- CUSTOMERS ---
  static getCustomers() {
    return this.get(STORAGE_KEYS.CUSTOMERS, SAMPLE_CUSTOMERS);
  }

  static recordCustomerActivity(name, age) {
    if (!name) return;
    const customers = this.getCustomers();
    const existing = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    const today = new Date().toISOString().split('T')[0];

    if (existing) {
      existing.totalQuotes = (existing.totalQuotes || 1) + 1;
      existing.lastActive = today;
      if (age) existing.age = age;
    } else {
      customers.push({
        id: `CUST-${String(customers.length + 1).padStart(3, '0')}`,
        name: name,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@clientmail.com`,
        phone: '+1 (555) ' + Math.floor(100 + Math.random() * 900) + '-' + Math.floor(1000 + Math.random() * 9000),
        age: age || 35,
        passportNumber: 'PASS' + Math.floor(1000000 + Math.random() * 9000000),
        totalQuotes: 1,
        lastActive: today
      });
    }
    this.set(STORAGE_KEYS.CUSTOMERS, customers);
  }

  // --- SETTINGS ---
  static getSettings() {
    return this.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }

  static saveSettings(settings) {
    return this.set(STORAGE_KEYS.SETTINGS, settings);
  }

  // --- CSV EXPORT & IMPORT ---
  static exportRatesToCSV(companyId = null, coverage = null, region = null) {
    let rates = this.getRates();
    if (companyId) rates = rates.filter(r => r.companyId === companyId);
    if (coverage) rates = rates.filter(r => Number(r.coverageAmount) === Number(coverage));
    if (region) rates = rates.filter(r => r.region === region);

    const headers = [
      'Company ID',
      'Company Plan',
      'Coverage Amount (USD)',
      'Region',
      'Days Slab',
      'Days From',
      'Days To',
      'Age Band',
      'Age From',
      'Age To',
      'Premium (USD)',
      'Currency'
    ];

    const rows = rates.map(r => [
      `"${r.companyId}"`,
      `"${r.planName}"`,
      r.coverageAmount,
      `"${r.region}"`,
      `"${r.slabId}"`,
      r.daysFrom,
      r.daysTo,
      `"${r.ageBandId}"`,
      r.ageFrom,
      r.ageTo,
      r.premium,
      `"${r.currency || 'USD'}"`
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
  }

  static importRatesFromCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) {
      throw new Error('CSV file is empty or does not contain rate rows.');
    }

    const currentRates = [...this.getRates()];
    let updatedCount = 0;
    let addedCount = 0;

    // Start parsing from line 1 (skipping header)
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 11) continue;

      const [companyId, planName, coverageAmount, region, slabId, daysFrom, daysTo, ageBandId, ageFrom, ageTo, premium, currency] = cols;
      const numCoverage = Number(coverageAmount);
      const numPremium = Number(premium);

      if (isNaN(numCoverage) || isNaN(numPremium)) continue;

      const existingIdx = currentRates.findIndex(r => 
        r.companyId === companyId &&
        Number(r.coverageAmount) === numCoverage &&
        r.region === region &&
        r.slabId === slabId &&
        r.ageBandId === ageBandId
      );

      if (existingIdx !== -1) {
        currentRates[existingIdx].premium = numPremium;
        updatedCount++;
      } else {
        currentRates.push({
          companyId,
          planName: planName || 'Plan',
          coverageAmount: numCoverage,
          region,
          slabId,
          daysFrom: Number(daysFrom) || 1,
          daysTo: Number(daysTo) || 4,
          ageBandId,
          ageFrom: Number(ageFrom) || 0,
          ageTo: Number(ageTo) || 40,
          premium: numPremium,
          currency: currency || 'USD'
        });
        addedCount++;
      }
    }

    this.saveRates(currentRates);
    return { updatedCount, addedCount, totalRates: currentRates.length };
  }

  static resetToDefaults() {
    localStorage.removeItem(STORAGE_KEYS.RATES);
    localStorage.removeItem(STORAGE_KEYS.COMPANIES);
    localStorage.removeItem(STORAGE_KEYS.QUOTATIONS);
    localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    this.init();
  }
}

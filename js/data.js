/**
 * Travel Insurance Quotation Engine - Seed Database
 * Contains full rate tables for Value Pro (initial reference) and partner insurers
 */

export const DAY_SLABS = [
  { id: '1-4', label: '1–4 Days', min: 1, max: 4 },
  { id: '5-6', label: '5–6 Days', min: 5, max: 6 },
  { id: '7-8', label: '7–8 Days', min: 7, max: 8 },
  { id: '9-12', label: '9–12 Days', min: 9, max: 12 },
  { id: '13-14', label: '13–14 Days', min: 13, max: 14 },
  { id: '15-21', label: '15–21 Days', min: 15, max: 21 },
  { id: '22-28', label: '22–28 Days', min: 22, max: 28 },
  { id: '29-35', label: '29–35 Days', min: 29, max: 35 },
  { id: '36-47', label: '36–47 Days', min: 36, max: 47 },
  { id: '48-60', label: '48–60 Days', min: 48, max: 60 },
  { id: '61-75', label: '61–75 Days', min: 61, max: 75 },
  { id: '76-90', label: '76–90 Days', min: 76, max: 90 },
  { id: '91-105', label: '91–105 Days', min: 91, max: 105 },
  { id: '106-120', label: '106–120 Days', min: 106, max: 120 },
  { id: '121-140', label: '121–140 Days', min: 121, max: 140 },
  { id: '141-160', label: '141–160 Days', min: 141, max: 160 },
  { id: '161-180', label: '161–180 Days', min: 161, max: 180 },
];

export const AGE_BANDS = [
  { id: '0-40', label: '0–40 Years', min: 0, max: 40 },
  { id: '41-60', label: '41–60 Years', min: 41, max: 60 },
  { id: '61-70', label: '61–70 Years', min: 61, max: 70 },
  { id: '71-80', label: '71–80 Years', min: 71, max: 80 },
  { id: '81-85', label: '81–85 Years', min: 81, max: 85 },
];

export const COVERAGE_AMOUNTS = [
  { id: 50000, value: 50000, label: 'USD 50,000', shortLabel: '$50k' },
  { id: 250000, value: 250000, label: 'USD 250,000', shortLabel: '$250k' },
  { id: 500000, value: 500000, label: 'USD 500,000', shortLabel: '$500k' },
];

export const REGIONS = [
  { id: 'excluding', label: 'Excluding USA & Canada', description: 'Worldwide excluding USA & Canada' },
  { id: 'including', label: 'Including USA & Canada', description: 'Worldwide including USA & Canada' },
];

export const INSURANCE_COMPANIES = [
  {
    id: 'trawelltag-valuepro',
    name: 'TrawellTag Cover-More',
    planName: 'Value Pro',
    logo: '🛡️',
    rating: 4.8,
    reviewsCount: 1420,
    claimRatio: '98.6%',
    color: '#0d9488',
    deductible: 'USD 100 per claim',
    supportPhone: '+1-800-456-8290',
    emergencyEmail: 'assistance@trawelltag.com',
    keyBenefits: [
      'Emergency Medical & Hospitalization up to Sum Insured',
      'Medical Evacuation & Repatriation included',
      'Checked Baggage Loss up to $1,000',
      'Flight Delay & Cancellation compensation',
      'Cashless hospitalization in 140+ countries',
      '24x7 Global Emergency Assistance'
    ],
    terms: 'Covers sudden illnesses and accidents. Pre-existing ailments covered only under life-threatening emergency situations up to 10% of sum insured. Deductible of $100 per claim applies on outpatient and dental treatments.'
  },
  {
    id: 'allianz-global',
    name: 'Allianz Global Assistance',
    planName: 'Worldwide Elite Care',
    logo: '🌐',
    rating: 4.9,
    reviewsCount: 2890,
    claimRatio: '99.2%',
    color: '#1e40af',
    deductible: 'Zero Deductible (Medical)',
    supportPhone: '+1-800-284-8300',
    emergencyEmail: 'claims@allianz-assistance.com',
    keyBenefits: [
      'Zero deductible on all emergency medical treatment',
      'Emergency Medical Evacuation up to $1,000,000',
      'Baggage loss up to $2,500 ($500 per item)',
      'Trip Interruption & Missed Connection reimbursement',
      'Adventure sports & amateur winter sports rider included',
      'Direct billing with over 900,000 hospitals worldwide'
    ],
    terms: 'Comprehensive travel coverage. No deductible on in-hospital expenses. 24-hour concierge and medical advisory hotline. Requires 48-hour prior notification for elective hospital admission.'
  },
  {
    id: 'aig-travelguard',
    name: 'AIG Travel Guard',
    planName: 'Preferred Protection',
    logo: '🦅',
    rating: 4.7,
    reviewsCount: 1980,
    claimRatio: '97.9%',
    color: '#0369a1',
    deductible: 'USD 50 per illness',
    supportPhone: '+1-800-826-1300',
    emergencyEmail: 'assist@aigtravelguard.com',
    keyBenefits: [
      'Emergency Medical Treatment up to Sum Insured',
      'Pre-existing Medical Condition waiver available',
      'Trip Cancellation up to 100% of insured trip cost',
      'Lost & Delayed Luggage coverage up to $1,500',
      'Repatriation of Mortal Remains up to $50,000',
      'Identity theft and passport replacement support'
    ],
    terms: 'Subject to standard policy exclusions. Pre-existing condition coverage applies if purchased within 14 days of initial trip deposit. Out-of-pocket medical deductible $50 per sickness.'
  },
  {
    id: 'chubb-travelsafe',
    name: 'Chubb Insurance',
    planName: 'Travel Safe Premier',
    logo: '💠',
    rating: 4.8,
    reviewsCount: 1150,
    claimRatio: '98.9%',
    color: '#4338ca',
    deductible: 'USD 75 per claim',
    supportPhone: '+1-800-352-4462',
    emergencyEmail: 'claims@chubbtravel.com',
    keyBenefits: [
      'Extensive Inpatient & Outpatient medical coverage',
      'Compassionate visit cover for a family member',
      'Baggage Delay reimbursement after 6 hours ($300)',
      'Emergency dental treatment following acute pain ($500)',
      'Personal Liability coverage up to $200,000',
      'Fast-track digital claims within 48 hours'
    ],
    terms: 'Valid for international leisure and business travel. Excludes competitive hazardous sports unless declared. Claims must be submitted within 30 days of incident with original invoices.'
  },
  {
    id: 'axa-smarttravel',
    name: 'AXA Assistance',
    planName: 'SmartTravel Value',
    logo: '✨',
    rating: 4.6,
    reviewsCount: 1620,
    claimRatio: '97.2%',
    color: '#b91c1c',
    deductible: 'USD 100 per sickness',
    supportPhone: '+1-800-456-1188',
    emergencyEmail: 'travel@axa-assistance.com',
    keyBenefits: [
      'Emergency Medical Expenses up to policy limits',
      'Baggage loss and delay assistance',
      'Emergency financial transfer assistance up to $2,000',
      'Legal defense and bail bond assistance',
      'Multilingual assistance coordinators in 200+ countries',
      'Cost-effective budget rates for budget-conscious travelers'
    ],
    terms: 'Policy valid worldwide subject to region selection. Maximum consecutive stay 180 days. Medical treatment must be recommended by an authorized physician.'
  }
];

const BASE_50K_EXCLUDING = {
  '0-40':  [12, 15, 18, 22, 25, 32, 40, 48, 58, 70, 84, 98, 114, 130, 150, 172, 195],
  '41-60': [16, 20, 24, 29, 34, 44, 55, 66, 80, 96, 115, 136, 158, 182, 210, 242, 275],
  '61-70': [24, 30, 37, 45, 52, 68, 86, 104, 128, 154, 185, 218, 255, 294, 340, 392, 448],
  '71-80': [42, 52, 65, 78, 92, 120, 152, 186, 228, 275, 332, 394, 460, 532, 615, 708, 810],
  '81-85': [75, 94, 118, 142, 168, 218, 276, 338, 415, 502, 605, 718, 840, 970, 1120, 1290, 1475]
};

function generateInitialRates() {
  const rates = [];
  const slabIds = DAY_SLABS.map(s => s.id);
  
  const insurerMultipliers = {
    'trawelltag-valuepro': 1.00,
    'allianz-global': 1.14,
    'aig-travelguard': 1.06,
    'chubb-travelsafe': 0.97,
    'axa-smarttravel': 0.89
  };

  const coverageMultipliers = {
    50000: 1.00,
    250000: 1.38,
    500000: 1.76
  };

  const regionMultipliers = {
    'excluding': 1.00,
    'including': 1.64
  };

  INSURANCE_COMPANIES.forEach(company => {
    const compMult = insurerMultipliers[company.id] || 1.0;

    COVERAGE_AMOUNTS.forEach(cov => {
      const covMult = coverageMultipliers[cov.value] || 1.0;

      REGIONS.forEach(reg => {
        const regMult = regionMultipliers[reg.id] || 1.0;

        AGE_BANDS.forEach(ageBand => {
          const baseArray = BASE_50K_EXCLUDING[ageBand.id];

          slabIds.forEach((slabId, idx) => {
            const rawBase = baseArray[idx];
            const calculated = Math.round(rawBase * compMult * covMult * regMult);

            rates.push({
              companyId: company.id,
              planName: company.planName,
              coverageAmount: cov.value,
              region: reg.id,
              ageBandId: ageBand.id,
              ageFrom: ageBand.min,
              ageTo: ageBand.max,
              slabId: slabId,
              daysFrom: DAY_SLABS[idx].min,
              daysTo: DAY_SLABS[idx].max,
              premium: calculated,
              currency: 'USD'
            });
          });
        });
      });
    });
  });

  return rates;
}

export const INITIAL_RATES = generateInitialRates();

export const COUNTRIES = [
  { code: 'US', name: 'United States', region: 'including' },
  { code: 'CA', name: 'Canada', region: 'including' },
  { code: 'GB', name: 'United Kingdom', region: 'excluding' },
  { code: 'AE', name: 'United Arab Emirates', region: 'excluding' },
  { code: 'FR', name: 'France (Schengen)', region: 'excluding' },
  { code: 'DE', name: 'Germany (Schengen)', region: 'excluding' },
  { code: 'IT', name: 'Italy (Schengen)', region: 'excluding' },
  { code: 'CH', name: 'Switzerland (Schengen)', region: 'excluding' },
  { code: 'SG', name: 'Singapore', region: 'excluding' },
  { code: 'TH', name: 'Thailand', region: 'excluding' },
  { code: 'AU', name: 'Australia', region: 'excluding' },
  { code: 'NZ', name: 'New Zealand', region: 'excluding' },
  { code: 'JP', name: 'Japan', region: 'excluding' },
  { code: 'IN', name: 'India', region: 'excluding' },
  { code: 'MY', name: 'Malaysia', region: 'excluding' },
  { code: 'ES', name: 'Spain (Schengen)', region: 'excluding' },
  { code: 'NL', name: 'Netherlands', region: 'excluding' },
  { code: 'TR', name: 'Turkey', region: 'excluding' },
  { code: 'VN', name: 'Vietnam', region: 'excluding' },
  { code: 'ID', name: 'Indonesia (Bali)', region: 'excluding' },
  { code: 'SA', name: 'Saudi Arabia', region: 'excluding' },
  { code: 'QA', name: 'Qatar', region: 'excluding' },
  { code: 'ZA', name: 'South Africa', region: 'excluding' },
  { code: 'BR', name: 'Brazil', region: 'excluding' },
  { code: 'MX', name: 'Mexico', region: 'excluding' },
  { code: 'EG', name: 'Egypt', region: 'excluding' },
  { code: 'MV', name: 'Maldives', region: 'excluding' }
];

export const SAMPLE_QUOTATIONS = [
  {
    id: 'QT-2026-1042',
    date: '2026-09-14',
    customerName: 'Rohit Verma',
    customerAge: 34,
    travelersCount: 1,
    departureCountry: 'India',
    destinationCountry: 'United Kingdom',
    departureDate: '2026-09-20',
    returnDate: '2026-10-04',
    durationDays: 15,
    slabId: '15-21',
    coverageAmount: 250000,
    region: 'excluding',
    selectedCompanyId: 'trawelltag-valuepro',
    planName: 'Value Pro',
    premium: 44,
    status: 'Sent'
  },
  {
    id: 'QT-2026-1043',
    date: '2026-09-14',
    customerName: 'Ananya Deshmukh',
    customerAge: 52,
    travelersCount: 2,
    departureCountry: 'India',
    destinationCountry: 'United States',
    departureDate: '2026-10-01',
    returnDate: '2026-10-25',
    durationDays: 25,
    slabId: '22-28',
    coverageAmount: 500000,
    region: 'including',
    selectedCompanyId: 'allianz-global',
    planName: 'Worldwide Elite Care',
    premium: 248,
    status: 'Accepted'
  },
  {
    id: 'QT-2026-1045',
    date: '2026-09-15',
    customerName: 'Marcus Vance',
    customerAge: 68,
    travelersCount: 1,
    departureCountry: 'United States',
    destinationCountry: 'France (Schengen)',
    departureDate: '2026-09-28',
    returnDate: '2026-10-10',
    durationDays: 13,
    slabId: '13-14',
    coverageAmount: 50000,
    region: 'excluding',
    selectedCompanyId: 'chubb-travelsafe',
    planName: 'Travel Safe Premier',
    premium: 50,
    status: 'Draft'
  }
];

export const SAMPLE_CUSTOMERS = [
  {
    id: 'CUST-001',
    name: 'Rohit Verma',
    email: 'rohit.verma@example.com',
    phone: '+91 98201 44521',
    age: 34,
    passportNumber: 'Z5819024',
    totalQuotes: 3,
    lastActive: '2026-09-14'
  },
  {
    id: 'CUST-002',
    name: 'Ananya Deshmukh',
    email: 'ananya.deshmukh@gmail.com',
    phone: '+91 98112 33490',
    age: 52,
    passportNumber: 'K9102481',
    totalQuotes: 2,
    lastActive: '2026-09-14'
  },
  {
    id: 'CUST-003',
    name: 'Marcus Vance',
    email: 'm.vance@vancetech.io',
    phone: '+1 415 890 2210',
    age: 68,
    passportNumber: 'US8491023',
    totalQuotes: 1,
    lastActive: '2026-09-15'
  },
  {
    id: 'CUST-004',
    name: 'Priya Sundaram',
    email: 'priya.s@outlook.com',
    phone: '+91 97654 11209',
    age: 29,
    passportNumber: 'M3091823',
    totalQuotes: 4,
    lastActive: '2026-09-12'
  }
];

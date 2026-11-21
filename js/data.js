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

export const INSURANCE_COMPANIES = [];

export const INITIAL_RATES = [];

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

export const SAMPLE_QUOTATIONS = [];

export const SAMPLE_CUSTOMERS = [];


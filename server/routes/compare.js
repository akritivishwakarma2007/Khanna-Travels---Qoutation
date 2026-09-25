const express = require('express');
const router = express.Router();
const Company = require('../models/Company');

const ALL_COVERAGE_AMOUNTS = [50000, 100000, 200000, 250000, 500000, 750000, 1000000];

/**
 * POST /api/quote/compare & POST /api/compare
 * Body: { dob, departureDate, returnDate, region, coverage, customerName, departureCountry, arrivalCountry }
 *   OR  { age, travelDays, region, coverage }
 * Returns: results grouped by all coverage amounts, each sorted by premium ascending.
 */
router.post('/', async (req, res) => {
  try {
    const {
      dob,
      departureDate,
      returnDate,
      region,
      coverage,
      customerName,
      travellingCountry,
      arrivalCountry,
      medicalOption,
      durationOption
    } = req.body;

    const destCountry = (travellingCountry || arrivalCountry || 'Worldwide').trim();
    let { age, travelDays } = req.body;

    // ── Compute age and travelDays if dates are provided ──────────────────────
    if (departureDate && returnDate && dob) {
      const depDate = new Date(departureDate);
      const retDate = new Date(returnDate);
      const birthDate = new Date(dob);

      if (isNaN(depDate) || isNaN(retDate) || isNaN(birthDate)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }
      if (retDate < depDate) {
        return res.status(400).json({ error: 'Return date cannot be before departure date' });
      }

      age = depDate.getFullYear() - birthDate.getFullYear();
      const mDiff = depDate.getMonth() - birthDate.getMonth();
      if (mDiff < 0 || (mDiff === 0 && depDate.getDate() < birthDate.getDate())) {
        age--;
      }

      const msPerDay = 1000 * 60 * 60 * 24;
      travelDays = Math.floor((retDate - depDate) / msPerDay) + 1;
    }

    if (age === undefined || age === null || isNaN(age)) {
      return res.status(400).json({ error: 'Date of birth or age is required' });
    }
    if (travelDays === undefined || travelDays === null || isNaN(travelDays)) {
      return res.status(400).json({ error: 'Travel dates or travel days are required' });
    }
    if (!region) {
      return res.status(400).json({ error: 'Region is required' });
    }

    if (travelDays > 365) {
      return res.status(400).json({ error: 'Travel duration cannot exceed 365 days' });
    }

    const normalizedRegion = region.toLowerCase().includes('inc') ? 'Including' : 'Excluding';
    const numRequestedCoverage = coverage ? Number(coverage) : 50000;

    // ── Query all companies and active plans in MongoDB ───────────────────────
    const companies = await Company.find({});
    const totalCompaniesCount = companies.length;

    // Grouped results dictionary: { 50000: [...], 100000: [...], ... }
    const groupedResults = {};
    ALL_COVERAGE_AMOUNTS.forEach(amt => {
      groupedResults[amt] = [];
    });

    const allMatchedPremiums = [];
    const matchedCompaniesSet = new Set();

    for (const company of companies) {
      // Skip inactive companies (soft deleted)
      if (company.isActive === false) continue;

      for (const plan of company.plans) {
        // Skip inactive plans
        if (plan.isActive === false) continue;

        // Apply Super Age (Age > 70) filtering
        if (age > 70) {
          // 1. Automatically analyze travel duration: <= 30 days vs > 30 days
          if (travelDays <= 30) {
            // Exclude "More Than 30 Days" plan when trip is 30 days or less
            if (plan.planName && plan.planName.toLowerCase().includes('more than 30')) continue;
          } else {
            // Exclude "Within 30 Days" plan when trip exceeds 30 days
            if (plan.planName && (plan.planName.toLowerCase().includes('within 30') || plan.planName.toLowerCase().includes('less than 30'))) continue;
          }

          // 2. Medical option filter if requested (with_medical / without_medical)
          if (medicalOption === 'with_medical') {
            const hasMed = plan.medicalCover === true || (plan.planName && plan.planName.toLowerCase().includes('with medical') && !plan.planName.toLowerCase().includes('without medical'));
            if (!hasMed) continue;
          } else if (medicalOption === 'without_medical') {
            const isWithout = plan.medicalCover === false || (plan.planName && plan.planName.toLowerCase().includes('without medical'));
            if (!isWithout) continue;
          }
        }

        for (const rate of (plan.rates || [])) {
          const rateIsInc = (rate.region || '').toLowerCase().includes('inc');
          const reqIsInc = normalizedRegion.toLowerCase().includes('inc');
          const matchesRegion = rate.region && (
            rate.region.trim().toLowerCase() === normalizedRegion.toLowerCase() ||
            rateIsInc === reqIsInc
          );
          if (
            matchesRegion &&
            age >= rate.ageFrom &&
            age <= rate.ageTo &&
            travelDays >= rate.daysFrom &&
            travelDays <= rate.daysTo
          ) {
            const resultItem = {
              companyId: company._id,
              companyName: company.companyName,
              planId: plan._id,
              planName: plan.planName,
              productLine: plan.productLine || '',
              medicalCover: plan.medicalCover !== undefined ? plan.medicalCover : false,
              coverage: rate.coverage,
              region: rate.region,
              premium: rate.premium,
              currency: rate.currency || 'INR',
              ageFrom: rate.ageFrom,
              ageTo: rate.ageTo,
              daysFrom: rate.daysFrom,
              daysTo: rate.daysTo,
              travelDays,
              age
            };

            if (!groupedResults[rate.coverage]) {
              groupedResults[rate.coverage] = [];
            }
            groupedResults[rate.coverage].push(resultItem);

            allMatchedPremiums.push(rate.premium);
            matchedCompaniesSet.add(company._id.toString());
          }
        }
      }
    }

    // Sort each coverage tier by premium ascending with alphabetical company tie-break
    const coverageStats = {};
    ALL_COVERAGE_AMOUNTS.forEach(amt => {
      const list = groupedResults[amt] || [];
      list.sort((a, b) => {
        if (a.premium !== b.premium) {
          return a.premium - b.premium;
        }
        // Exact tie-break: alphabetical by company name
        return (a.companyName || '').localeCompare(b.companyName || '');
      });
      if (list.length > 0) {
        list[0].isBestPrice = true;
      }

      // Count distinct companies matched in this tier
      const companiesInTier = new Set(list.map(i => i.companyId.toString()));
      coverageStats[amt] = {
        matchedPlansCount: list.length,
        matchedCompaniesCount: companiesInTier.size,
        unmatchedCompaniesCount: Math.max(0, totalCompaniesCount - companiesInTier.size)
      };
    });

    // Compute overall resultsSummary
    const lowestPremium = allMatchedPremiums.length > 0 ? Math.min(...allMatchedPremiums) : null;
    const highestPremium = allMatchedPremiums.length > 0 ? Math.max(...allMatchedPremiums) : null;
    const averagePremium = allMatchedPremiums.length > 0
      ? Math.round(allMatchedPremiums.reduce((a, b) => a + b, 0) / allMatchedPremiums.length)
      : null;

    const resultsSummary = {
      totalCompaniesMatched: matchedCompaniesSet.size,
      totalCompaniesAvailable: totalCompaniesCount,
      lowestPremium,
      highestPremium,
      averagePremium
    };

    // Determine the first coverage tier with at least 1 matching plan
    const firstNonEmptyCoverage = ALL_COVERAGE_AMOUNTS.find(amt => (groupedResults[amt] || []).length > 0) || 50000;

    const origCountry = (req.body.departureCountry || 'India').trim();

    const primaryResults = (groupedResults[numRequestedCoverage] && groupedResults[numRequestedCoverage].length > 0)
      ? groupedResults[numRequestedCoverage]
      : (groupedResults[firstNonEmptyCoverage] || []);

    res.json({
      customerName: customerName || '',
      dob: dob || '',
      age,
      departureCountry: origCountry,
      arrivalCountry: destCountry,
      travellingCountry: destCountry,
      departureDate: departureDate || '',
      returnDate: returnDate || '',
      travelDays,
      defaultActiveCoverage: firstNonEmptyCoverage,
      coverageRequested: numRequestedCoverage,
      region: normalizedRegion,
      medicalOption: medicalOption || 'all',
      durationOption: durationOption || 'all',
      resultsSummary,
      coverageStats,
      groupedResults,
      results: primaryResults // for backwards compatibility
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

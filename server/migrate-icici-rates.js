/**
 * migrate-icici-rates.js
 * Ingests ICICI Lombard Value Pro rates (850 rate rows) into:
 * 1. Live MongoDB database
 * 2. server/khanna-travels-seed-data.json
 * 3. server/models/khanna-travels-seed-data.json (if exists)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

async function main() {
  const ratesJsonPath = path.join(__dirname, 'icici-value-pro-rates.json');
  if (!fs.existsSync(ratesJsonPath)) {
    throw new Error('Rates file not found: ' + ratesJsonPath);
  }

  const rawData = JSON.parse(fs.readFileSync(ratesJsonPath, 'utf8'));
  console.log(`Loaded raw rate groups: ${rawData.length}`);

  // Flatten into Rate documents
  const flattenedRates = [];
  for (const group of rawData) {
    const coverage = Number(group.coverageAmount);
    const region = group.region;
    for (const slab of (group.slabs || [])) {
      const daysFrom = Number(slab.daysFrom);
      const daysTo = Number(slab.daysTo);
      for (const p of (slab.premiums || [])) {
        flattenedRates.push({
          coverage,
          region,
          daysFrom,
          daysTo,
          ageFrom: Number(p.ageFrom),
          ageTo: Number(p.ageTo),
          premium: Number(p.premium),
          currency: 'INR',
          updatedAt: new Date()
        });
      }
    }
  }

  console.log(`Generated ${flattenedRates.length} flattened rate rows.`);
  if (flattenedRates.length !== 850) {
    throw new Error(`Expected 850 rate rows, got ${flattenedRates.length}`);
  }

  // 1. Update Live MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri) {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
    const Company = mongoose.model('Company', new mongoose.Schema({}, { strict: false }));

    // Find ICICI Lombard
    let icici = await Company.findOne({ companyName: /icici lombard/i });
    if (!icici) {
      console.log('ICICI Lombard not found in DB. Creating new company document...');
      icici = await Company.create({
        companyName: 'ICICI LOMBARD',
        isActive: true,
        plans: [
          {
            planName: 'Value Pro',
            productLine: 'Value Pro',
            medicalCover: true,
            policyType: 'new',
            isActive: true,
            rates: flattenedRates
          }
        ]
      });
      console.log('Created company with ID:', icici._id);
    } else {
      console.log('Found ICICI Lombard in DB:', icici._id);
      let plan = (icici.plans || []).find(p => p.planName && p.planName.toLowerCase() === 'value pro');
      if (plan) {
        console.log('Found existing plan "Value Pro":', plan._id);
        const result = await Company.updateOne(
          { _id: icici._id, 'plans._id': plan._id },
          {
            $set: {
              'plans.$.rates': flattenedRates,
              'plans.$.productLine': 'Value Pro',
              'plans.$.medicalCover': true,
              'plans.$.updatedAt': new Date(),
              updatedAt: new Date()
            }
          }
        );
        console.log('MongoDB update result:', result);
      } else {
        console.log('Plan "Value Pro" not found, pushing to plans array...');
        await Company.updateOne(
          { _id: icici._id },
          {
            $push: {
              plans: {
                planName: 'Value Pro',
                productLine: 'Value Pro',
                medicalCover: true,
                policyType: 'new',
                isActive: true,
                rates: flattenedRates
              }
            },
            $set: { updatedAt: new Date() }
          }
        );
      }
    }

    // Verify in DB
    const verified = await Company.findOne({ companyName: /icici lombard/i });
    const vpPlan = (verified.plans || []).find(p => p.planName.toLowerCase() === 'value pro');
    console.log(`Verified DB: Plan "${vpPlan.planName}" now has ${vpPlan.rates.length} rates.`);

    await mongoose.disconnect();
  } else {
    console.warn('No MONGODB_URI found, skipping live DB update.');
  }

  // 2. Update Seed Files
  const seedFiles = [
    path.join(__dirname, 'khanna-travels-seed-data.json'),
    path.join(__dirname, 'models', 'khanna-travels-seed-data.json')
  ];

  for (const sPath of seedFiles) {
    if (fs.existsSync(sPath)) {
      console.log(`Updating seed file: ${sPath}`);
      const seedData = JSON.parse(fs.readFileSync(sPath, 'utf8'));
      let company = seedData.find(c => c.companyName && c.companyName.toLowerCase().includes('icici'));
      if (!company) {
        company = {
          _id: '6b000ddf70735c09eaa685af',
          companyName: 'ICICI Lombard',
          isActive: true,
          plans: [
            {
              _id: '6b000e0070735c09eaa688c4',
              planName: 'Value Pro',
              productLine: 'Value Pro',
              medicalCover: true,
              policyType: 'new',
              isActive: true,
              rates: flattenedRates
            }
          ]
        };
        seedData.push(company);
      } else {
        let plan = (company.plans || []).find(p => p.planName && p.planName.toLowerCase() === 'value pro');
        if (plan) {
          plan.rates = flattenedRates;
          plan.productLine = 'Value Pro';
          plan.medicalCover = true;
          plan.isActive = true;
        } else {
          company.plans.push({
            _id: '6b000e0070735c09eaa688c4',
            planName: 'Value Pro',
            productLine: 'Value Pro',
            medicalCover: true,
            policyType: 'new',
            isActive: true,
            rates: flattenedRates
          });
        }
      }
      fs.writeFileSync(sPath, JSON.stringify(seedData, null, 2), 'utf8');
      console.log(`Successfully updated ${sPath} (Total companies: ${seedData.length})`);
    }
  }

  console.log('✅ Ingestion completed successfully!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

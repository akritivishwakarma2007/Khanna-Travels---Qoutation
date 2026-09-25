/**
 * seed.js
 * Inserts companies and rate rows from khanna-travels-seed-data.json into MongoDB.
 *
 * Usage:
 *   node seed.js          (skips existing companies)
 *   node seed.js --force  (replaces existing seed companies with fresh data)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoose = require("mongoose");
const fs = require("fs");

// Use existing Company model or define schema
let Company;
try {
  Company = require("./models/Company");
} catch {
  const RateSchema = new mongoose.Schema({
    coverage: { type: Number, required: true, enum: [50000, 100000, 200000, 250000, 500000, 750000, 1000000] },
    region: { type: String, required: true, enum: ["Excluding", "Including"] },
    ageFrom: { type: Number, required: true },
    ageTo: { type: Number, required: true },
    daysFrom: { type: Number, required: true },
    daysTo: { type: Number, required: true },
    premium: { type: Number, required: true },
    currency: { type: String, default: "INR" }
  });

  const PlanSchema = new mongoose.Schema({
    planName: { type: String, required: true },
    productLine: { type: String },
    medicalCover: { type: Boolean, default: false },
    policyType: { type: String, default: "new" },
    isActive: { type: Boolean, default: true },
    rates: [RateSchema]
  });

  const CompanySchema = new mongoose.Schema({
    companyName: { type: String, required: true, unique: true },
    plans: [PlanSchema]
  }, { timestamps: true });

  Company = mongoose.models.Company || mongoose.model("Company", CompanySchema);
}

async function seed() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to your .env file and try again.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const dataPath = path.join(__dirname, "khanna-travels-seed-data.json");
  if (!fs.existsSync(dataPath)) {
    console.error(`Seed data file not found at: ${dataPath}`);
    process.exit(1);
  }

  const companies = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const force = process.argv.includes("--force") || process.argv.includes("-f");

  for (const companyData of companies) {
    const existing = await Company.findOne({ companyName: companyData.companyName });
    if (existing) {
      if (force) {
        console.log(`"${companyData.companyName}" already exists — removing previous entry (--force)...`);
        await Company.deleteOne({ _id: existing._id });
      } else {
        console.log(`"${companyData.companyName}" already exists — skipping (run with --force or delete it first if you want to re-seed).`);
        continue;
      }
    }

    const company = new Company(companyData);
    await company.save();
    const totalRates = companyData.plans.reduce((sum, p) => sum + (p.rates ? p.rates.length : 0), 0);
    console.log(`✅ Inserted "${companyData.companyName}" with ${totalRates} rate rows across ${companyData.plans.length} plan(s).`);
  }

  await mongoose.disconnect();
  console.log("🌱 Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

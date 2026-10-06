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
let VisaLink;
try {
  Company = require("./models/Company");
  VisaLink = require("./models/VisaLink");
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

  const VisaLinkSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    country: { type: String, default: '', trim: true },
    category: { type: String, default: 'Official Portal', trim: true },
    notes: { type: String, default: '', trim: true }
  }, { timestamps: true });

  VisaLink = mongoose.models.VisaLink || mongoose.model("VisaLink", VisaLinkSchema);
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
  const force = process.argv.includes("--force") || process.argv.includes("-f");

  if (fs.existsSync(dataPath)) {
    const companies = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    for (const companyData of companies) {
      const existing = await Company.findOne({ companyName: companyData.companyName });
      if (existing) {
        if (force) {
          console.log(`"${companyData.companyName}" already exists — removing previous entry (--force)...`);
          await Company.deleteOne({ _id: existing._id });
        } else {
          console.log(`"${companyData.companyName}" already exists — skipping.`);
          continue;
        }
      }

      const company = new Company(companyData);
      await company.save();
      const totalRates = companyData.plans.reduce((sum, p) => sum + (p.rates ? p.rates.length : 0), 0);
      console.log(`✅ Inserted "${companyData.companyName}" with ${totalRates} rate rows across ${companyData.plans.length} plan(s).`);
    }
  }

  // ── Seed Visa Links ────────────────────────────────────────────────────────
  const possibleVisaFiles = [
    path.join(__dirname, "visa-links.json"),
    path.join(__dirname, "visa_links.json"),
    path.join(__dirname, "..", "visa-links.json"),
    path.join(__dirname, "..", "visa_links.json")
  ];

  let visaDataPath = possibleVisaFiles.find(p => fs.existsSync(p));
  if (visaDataPath) {
    console.log(`Loading visa links from: ${visaDataPath}`);
    try {
      const visaItems = JSON.parse(fs.readFileSync(visaDataPath, "utf-8"));
      let seededCount = 0;
      let skippedCount = 0;

      for (const item of visaItems) {
        const rawUrl = (item.url || '').trim();
        if (!rawUrl) {
          skippedCount++;
          continue; // Skip entries with empty URL
        }

        let cleanUrl = rawUrl;
        if (!/^https?:\/\//i.test(cleanUrl)) {
          cleanUrl = 'https://' + cleanUrl;
        }

        const title = (item.title || item.name || 'Visa Portal').trim();
        const country = (item.country || '').trim();
        const category = (item.type || item.category || 'Official Portal').trim();
        const notes = (item.description || item.notes || '').trim();

        // Check duplicate by url or title
        const existing = await VisaLink.findOne({
          $or: [{ url: cleanUrl }, { title: title }]
        });

        if (existing) {
          if (force) {
            await VisaLink.deleteOne({ _id: existing._id });
          } else {
            skippedCount++;
            continue;
          }
        }

        const link = new VisaLink({
          title,
          url: cleanUrl,
          country,
          category,
          notes
        });
        await link.save();
        seededCount++;
      }

      console.log(`🌐 Visa Links seeding complete: ${seededCount} inserted, ${skippedCount} skipped (empty URL or duplicates).`);
    } catch (vErr) {
      console.error("Error reading visa links JSON:", vErr);
    }
  }

  await mongoose.disconnect();
  console.log("🌱 Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});


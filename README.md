# Khanna Travels — Travel Insurance Quotation Engine

An enterprise travel insurance comparison platform, multi-insurer rate calculation engine, and high-resolution quote image generator built for **Khanna Travels**.

Runs as a unified Node.js application serving both the REST API backend and the Single Page Application (SPA) frontend.

---

## 🌟 Key Features

- **Multi-Insurer Quotation Engine**: Calculates instant premiums across multiple insurance providers based on destination, trip duration, traveler age bands, and sum insured.
- **Dynamic Frontend SPA**: Clean, responsive UI with view routing between Quote Generator, Visa Links Portal, and Admin Control Panel.
- **High-Resolution Quote Generator**: Built-in HTML2Canvas renderer to export customized quotation cards directly to high-res images for client sharing.
- **Admin Rate & Plan Matrix**: Comprehensive admin portal to update insurer rates, plan parameters, age slabs, coverage amounts, and database seeds.
- **Hybrid Backend/Offline Fallback**: Seamless REST API integration with MongoDB Atlas, featuring automatic client-side fallback engine if offline or server disconnected.
- **Visa Links Resource Hub**: Quick access database for international embassy requirements and visa application links.

---

## 📐 UI & View Navigation Structure

The application operates as a Single Page Application (SPA) structured around three primary views managed by `js/app.js`:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Khanna Travels App Header                         │
│  [ Logo ]  │  ( [New Quote]  |  [Visa Links]  |  [Admin] )  │  [Agent]  │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
      ┌──────────────────────────────┼──────────────────────────────┐
      ▼                              ▼                              ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│     New Quote View      │   │    Visa Links View      │   │       Admin View        │
│      (`data-view="quote"`)│   │      (`data-view="visa"`) │   │      (`data-view="admin"`)│
├─────────────────────────┤   ├─────────────────────────┤   ├─────────────────────────┤
│ • Trip Details Form     │   │ • Embassy Links         │   │ • Dashboard Overview    │
│ • Traveler Age Selector │   │ • Country Filter        │   │ • Rate Matrix Tables    │
│ • Medical Declarations  │   │ • Direct Visa Portals   │   │ • Insurer Plan Editor   │
│ • Premium Comparison    │   │ • Application Guides    │   │ • Quotation History     │
│ • Image/PDF Generator   │   │                         │   │ • Seed Import/Export    │
└─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

---

## 📁 Repository Structure

```text
c:\Akriti IMP\quatation\
├── index.html                  # Single Page Application HTML shell
├── logo.png                    # Khanna Travels branding logo
├── README.md                   # Project overview & documentation guide
├── PROJECT_DOCUMENTATION.md    # In-depth architectural & API specifications
│
├── css/                        # Modular CSS Design System
│   ├── main.css                # Base styles, CSS variables, typography, layout grid
│   ├── quote.css               # Quote calculator, comparison cards, and forms
│   ├── admin.css               # Admin control panel and management UI
│   ├── issuePolicy.css         # Multi-step policy issuance and OCR styling
│   ├── savedQuotesAndPolicies.css # 24h saved drafts & policy records styling
│   └── print.css               # Print & export stylesheet
│
├── js/                         # Frontend Application Modules
│   ├── app.js                  # Main entry point & SPA view router
│   ├── api.js                  # REST API client with offline fallback support
│   ├── data.js                 # Country lookups and destination regions
│   ├── storage.js              # LocalStorage state management
│   ├── quoteView.js            # Quote calculator UI component & interactions
│   ├── rateImport.js           # Excel & PDF rate table extractor
│   ├── rateImportModal.js      # Rate import preview and confirmation modal
│   ├── pdf-export.js           # HTML2Canvas quote card renderer & exporter
│   └── views/                  # Modular Admin & Flow Views
│       ├── plansRatesView.js   # Unified Insurance Plans & Rate Matrix editor
│       ├── settingsView.js     # System configurations & MongoDB Atlas health
│       ├── visaLinksView.js    # Official Visa Portal directories
│       ├── issuePolicyView.js  # Instant passport scan & policy issuance flow
│       ├── issuedPoliciesView.js # Issued policy records & search
│       ├── billingView.js      # Agency billing & transactions
│       ├── documentDetailsView.js # Document verification & details
│       └── loginView.js        # Admin authentication modal
│
└── server/                     # Backend Node.js & Express REST API
    ├── server.js               # Express app entry point & static server
    ├── db.js                   # Mongoose MongoDB connection handler
    ├── seed.js                 # Seeding script for rate matrix & data models
    ├── package.json            # Server dependencies & scripts
    ├── middleware/             # Request validation & authentication middleware
    ├── models/                 # Mongoose Database Schemas
    │   ├── Company.js          # Insurer profiles schema
    │   ├── Quote.js            # Generated quotations log schema
    │   └── VisaLink.js         # Visa links hub schema
    └── routes/                 # Express REST API Endpoints
        ├── compare.js          # Multi-insurer comparison endpoint
        ├── rates.js            # Rate calculation & matrix endpoints
        ├── plans.js            # Plan definitions endpoints
        ├── quotes.js           # Quote management endpoints
        ├── companies.js        # Insurer company management
        └── visaLinks.js        # Visa link directory endpoints
```

---

## ⚡ Quick Start (Local Development)

### 1. Install Server Dependencies
```bash
cd server
npm install
```

### 2. Configure Environment (`server/.env`)
Create or edit `server/.env` with your MongoDB connection URI:
```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/quotation_db?retryWrites=true&w=majority
```

### 3. Seed Database
Initialize insurer plans, rate matrices, and visa links:
```bash
cd server
node seed.js --force
```

### 4. Run Development Server
```bash
cd server
npm start
```
Access the application at `http://localhost:3000` in your web browser.

---

## 🌐 Production Deployment (Render / Railway / VPS)

The app deploys as a standard Node.js server where Express serves both API endpoints and the static SPA frontend:

- **Build Command**: `cd server && npm install`
- **Start Command**: `node server/server.js` (or `cd server && npm start`)
- **Environment Variables**:
  - `PORT`: (Injected by host provider, default `3000`)
  - `MONGODB_URI`: MongoDB connection string

---

## 🛡️ Issue Policy Module (Scaffold & Integration Guide)

The **Issue Policy** tab (`#issue-policy`) provides step-by-step flows for **Individual** (4 steps) and **Group** (6 steps) insurance policy issuance with live ICAO 9303 TD3 MRZ validation, passport OCR simulation, editable data grid with Red/Amber checks, dynamic form schema rendering, and multi-sheet Excel export.

### ⚙️ Central Configuration (`js/issuePolicy/config.js`)
All configurable parameters live in a single file:
- `USE_MOCK_API`: Toggle between in-memory mock responses (`true`) and live endpoints (`false`).
- `FILES`: Allowed MIME types (`JPG`, `PNG`, `WEBP`, `PDF`), file extensions, and max file size (`10 MB`).
- `EXPIRY_SAFETY_MARGIN_MONTHS`: Safety margin required beyond trip end date (default `3` months).
- `OCR_CONCURRENCY`: Parallel processing limit for batch passport OCR (default `2`).
- `COLUMNS`: Column schema for the Group Review table (`key`, `label`, `type`, `required`, `optional`, `canRemove`, `wide`).
- `CURRENCY` & `LOCALE`: Currency (`INR`) and regional locale (`en-IN`).

### 🔌 Service Layer & Endpoints

All external calls route through `js/issuePolicy/services/`. Every function includes `// TODO(API):` and `// TODO(FORMAT):` markers indicating where real backend calls and layout mappings plug in:

| Service Function | Expected Input | Expected Output / Response |
| :--- | :--- | :--- |
| `quoteService.getQuote(quoteId)` | `quoteId: string` | `{ quoteId, planName, companyName, totalPremium, currency, travellerName, dob, destination, tripStart, tripEnd, durationDays, coverTable: [{ benefit, amount }] }` |
| `quoteService.getGroupQuote(quoteId)` | `quoteId: string` | `{ quoteId, planName, companyName, perTravellerPremium, travellerCountQuoted, estimatedTotal, currency, destination, tripStart, tripEnd, durationDays, coverTable }` |
| `passportService.extract(file, onProgress?)` | `file: File`, `onProgress({ percent, stage })` | `{ givenNames, surname, passportNumber, nationality, sex, dob, placeOfBirth, placeOfIssue, issueDate, expiryDate, fatherName, motherName, spouseName, address, issuingCountry, mrz: [line1, line2], lowConfidence: string[] }` |
| `policyService.getFormSchema({ mode, quoteId })` | `{ mode: 'individual' \| 'group', quoteId: string }` | JSON Schema: `{ formId, title, sections: [{ id, title, fields: [{ key, label, type, required, options?, validation?, prefill?, visibleIf?, width? }] }] }` |
| `policyService.issue(payload)` | `{ mode, quoteId, planName, premium, travellerName, passportNumber, destination, tripStart, tripEnd, dynamicFormValues }` | `{ success: true, policyNumber, issuedAt, premium, plan, passport, travellerName, destination, coverPeriod, documentUrl }` |
| `policyService.issueGroup(payload)` | `{ mode, quoteId, planName, perTravellerPremium, destination, tripStart, tripEnd, travellers: [...], dynamicFormValues, addressMode }` | `{ success: true, masterPolicyNumber, issuedAt, totalPremium, plan, destination, coverPeriod, contact, certificates: [{ travellerName, passportNumber, certificateNumber }], documentUrl }` |

### 🔍 Passport OCR Backend Engine (`POST /api/passport/extract`)

The backend passport reader processes photo/data pages (`front`) and optional Indian passport last pages (`back`) in-memory via `multer.memoryStorage()`, ensuring zero disk persistence. It integrates exclusively with our internal passport OCR API.

#### Environment Variables (`server/.env`)
```env
# ── Passport OCR API Configuration ───────────────────────────────────────────
# TODO(OCR): Set your passport OCR API endpoint URL and API key
OCR_API_URL=https://your-ocr-api.example.com/extract
OCR_API_KEY=your_ocr_api_key_here
OCR_TIMEOUT_MS=60000
```
- When `OCR_API_URL` is configured, requests are securely forwarded to your OCR API backend.
- When `OCR_API_URL` is empty (initial setup/development mode), the service operates in placeholder mode returning a valid ICAO 9303 TD3 sample through `mapOcrResponse`.

#### Centralized Vendor Mapping (`server/services/ocr/index.js`)
All property mapping from your OCR API response is centralized in:
```javascript
function mapOcrResponse(ocrJson) { ... }
```
When your real OCR API is deployed, adjust `mapOcrResponse` to map any specific field names or response wrappers to the normalized shape. All downstream components (live MRZ verification, group review grid, warning highlights) consume this normalized shape directly.

#### Normalized Response Shape (200 OK)
```json
{
  "givenNames": "AARAV",
  "surname": "SHARMA",
  "passportNumber": "M4592817",
  "nationality": "IND",
  "sex": "M",
  "dob": "1992-05-15",
  "placeOfBirth": "DELHI",
  "placeOfIssue": "DELHI",
  "issueDate": "2022-05-15",
  "expiryDate": "2032-05-14",
  "fatherName": "RAJESH SHARMA",
  "motherName": "SUNITA SHARMA",
  "spouseName": "PRIYA SHARMA",
  "address": "42 MG ROAD, CONNAUGHT PLACE, NEW DELHI 110001",
  "fileNumber": "DL106789123422",
  "issuingCountry": "IND",
  "mrz": [
    "P<INDSHARMA<<AARAV<<<<<<<<<<<<<<<<<<<<<<<<<<",
    "M4592817<6IND9205152M3205149<<<<<<<<<<<<<<<4"
  ],
  "lowConfidence": []
}
```
*Every key is always present. Unread/missing fields are strictly `null` (never empty strings or guesses).*

#### Error Codes & Statuses
| HTTP Status | Code | Message | Cause |
| :--- | :--- | :--- | :--- |
| `400` | `NO_FILE` | `"Attach the passport photo page."` | Front file missing from multipart request |
| `400` | `BAD_FILE` | `"Upload a JPG, PNG, WEBP or PDF."` | Invalid MIME type or file extension |
| `413` | `TOO_LARGE` | `"File is larger than 10 MB."` | Upload exceeds 10 MB limit |
| `422` | `NO_DOCUMENT` | `"No passport photo page was found in this file."` | Upload is not a readable passport |
| `502` | `OCR_FAILED` | `"The passport reader didn't respond. Try again."` | Upstream provider error or timeout |
| `401` | `AUTH_REQUIRED` | `"Unauthorized: Admin authentication required..."` | Missing or invalid Bearer JWT |

### 🧪 Unit Tests
Run the standalone MRZ TD3 check digit algorithm & grid validation test suite:
```bash
node server/test-mrz-validation.js
```
Run the OCR normalizer, date parsing, and side-merger test suite:
```bash
node server/test-ocr-normalizer.js
```
Run the OCR API route integration test suite:
```bash
node server/test-passport-route.js
```

---

## 📖 Detailed Architectural Documentation

For full backend schemas, calculation formulas, and API endpoint details, refer to [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md).
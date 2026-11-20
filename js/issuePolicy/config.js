/**
 * Issue Policy Module — Central Configuration
 *
 * // TODO(FORMAT): Adjust file limits, expiry safety margins, column definitions,
 * // date formatting, or currency as required by the final product design.
 */

export const ISSUE_POLICY_CONFIG = {
  // OCR Service: Uses backend endpoint /api/passport/extract by default.
  // Set USE_MOCK_OCR to true only to test purely client-side without backend.
  USE_MOCK_OCR: false,
  USE_MOCK_API: false, // Backwards compatibility flag

  // Quote & Policy Services: Currently in scaffold/format mode awaiting insurer production APIs.
  // Set to true once live endpoints (/api/quotes/:id, /api/policy/*) are deployed.
  USE_LIVE_QUOTE_API: false,
  USE_LIVE_POLICY_API: false,

  // Customer verification consent statement
  CONSENT_TEXT: 'The customer agrees to their passport being scanned to verify their identity for this policy.',

  // OCR timeout in milliseconds
  OCR_TIMEOUT_MS: 60000,

  FILES: {
    acceptedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ],
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.pdf'],
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    maxSizeMB: 10
  },

  // Passport must be valid past the trip end date by at least this margin
  // // TODO(FORMAT): Configure according to specific insurer requirements (default 3 months)
  EXPIRY_SAFETY_MARGIN_MONTHS: 3,

  // Concurrency limit for multi-file passport OCR extraction
  OCR_CONCURRENCY: 2,

  // Regional formatting
  CURRENCY: 'INR',
  LOCALE: 'en-IN',
  DATE_DISPLAY_FORMAT: 'YYYY-MM-DD',

  // Column definitions for the Group Review editable data grid
  // Exact required list and order:
  // Required (locked): Given name*, Surname, Passport no.*, Gender*, Date of birth*, Date of expiry*
  // Optional: Nationality, Place of birth, Place of issue, Date of issue, Father's name, Mother's name, Spouse's name, Address line, City, State, PIN code, Country (address)
  COLUMNS: [
    {
      key: 'givenNames',
      label: 'Given name',
      type: 'text',
      required: true,
      canRemove: false,
      placeholder: 'First and middle names'
    },
    {
      key: 'surname',
      label: 'Surname',
      type: 'text',
      required: false,
      canRemove: false,
      placeholder: 'Last name / surname'
    },
    {
      key: 'passportNumber',
      label: 'Passport no.',
      type: 'text',
      required: true,
      canRemove: false,
      placeholder: 'e.g. Z1234567'
    },
    {
      key: 'sex',
      label: 'Gender',
      type: 'select',
      options: [
        { value: 'M', label: 'M (Male)' },
        { value: 'F', label: 'F (Female)' },
        { value: 'X', label: 'X (Other)' }
      ],
      required: true,
      canRemove: false
    },
    {
      key: 'dob',
      label: 'Date of birth',
      type: 'date',
      required: true,
      canRemove: false
    },
    {
      key: 'expiryDate',
      label: 'Date of expiry',
      type: 'date',
      required: true,
      canRemove: false
    },
    {
      key: 'nationality',
      label: 'Nationality',
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'e.g. IND'
    },
    {
      key: 'placeOfBirth',
      label: 'Place of birth',
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'City, State'
    },
    {
      key: 'placeOfIssue',
      label: 'Place of issue',
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'e.g. Delhi'
    },
    {
      key: 'issueDate',
      label: 'Date of issue',
      type: 'date',
      required: false,
      optional: true,
      canRemove: true
    },
    {
      key: 'fatherName',
      label: "Father's name",
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'Optional'
    },
    {
      key: 'motherName',
      label: "Mother's name",
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'Optional'
    },
    {
      key: 'spouseName',
      label: "Spouse's name",
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'Optional'
    },
    {
      key: 'addressLine',
      label: 'Address line',
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'House/Street/Area'
    },
    {
      key: 'city',
      label: 'City',
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'City'
    },
    {
      key: 'state',
      label: 'State',
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'State'
    },
    {
      key: 'pinCode',
      label: 'PIN code',
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'PIN code'
    },
    {
      key: 'country',
      label: 'Country (address)',
      type: 'text',
      required: false,
      optional: true,
      canRemove: true,
      placeholder: 'India'
    }
  ]
};


/**
 * Policy Service
 * Handles fetching dynamic form schemas and issuing Individual & Group policies.
 *
 * // TODO(API): Connect getFormSchema(), issue(), and issueGroup() to your backend insurance provider or aggregation gateway.
 */
import { ISSUE_POLICY_CONFIG } from '../config.js';

export const policyService = {
  /**
   * Retrieves the dynamic form schema for the specified mode.
   *
   * @param {{ mode: 'individual'|'group', quoteId: string }} params
   * @returns {Promise<Object>} Form schema object
   */
  async getFormSchema({ mode = 'individual', quoteId = '' } = {}) {
    // // TODO(API): Fetch real schema from backend when endpoint is live
    if (ISSUE_POLICY_CONFIG.USE_LIVE_POLICY_API) {
      try {
        const res = await fetch(`/api/policy/schema?mode=${mode}&quoteId=${encodeURIComponent(quoteId)}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Live policy form schema fetch failed, using scaffold schema:', e.message);
      }
    }

    // Mock network delay
    await new Promise(resolve => setTimeout(resolve, 150));

    if (mode === 'group') {
      // // TODO(FORMAT): Adapt group form schema when the insurer's official schema format arrives
      return {
        formId: 'group-policy-v1',
        title: 'Group Policy & Organization Details',
        sections: [
          {
            id: 'organization',
            title: 'Organization & Group Details',
            fields: [
              {
                key: 'groupName',
                label: 'Group or company name',
                type: 'text',
                required: true,
                placeholder: 'e.g. Acme Technologies Pvt Ltd',
                width: 'full'
              },
              {
                key: 'groupType',
                label: 'Group type',
                type: 'select',
                required: true,
                options: [
                  { value: 'company', label: 'Company or employer' },
                  { value: 'school', label: 'School or college' },
                  { value: 'tour', label: 'Tour group' },
                  { value: 'family', label: 'Family' },
                  { value: 'other', label: 'Other' }
                ],
                width: 'half'
              },
              {
                key: 'travelPurpose',
                label: 'Purpose of travel',
                type: 'select',
                required: true,
                options: [
                  { value: 'business', label: 'Business' },
                  { value: 'leisure', label: 'Leisure' },
                  { value: 'study', label: 'Study' },
                  { value: 'conference', label: 'Conference or event' }
                ],
                width: 'half'
              },
              {
                key: 'contactPerson',
                label: 'Contact person',
                type: 'text',
                required: true,
                placeholder: 'Authorised representative name',
                width: 'half'
              },
              {
                key: 'email',
                label: 'Contact email',
                type: 'email',
                required: true,
                placeholder: 'admin@organization.com',
                width: 'half'
              },
              {
                key: 'phone',
                label: 'Contact phone',
                type: 'tel',
                required: true,
                placeholder: '10-digit mobile number',
                validation: {
                  pattern: '^[6-9]\\d{9}$',
                  message: 'Enter a valid 10-digit mobile number'
                },
                width: 'half'
              },
              {
                key: 'gstin',
                label: 'GSTIN (Optional)',
                type: 'text',
                required: false,
                placeholder: 'e.g. 07AAAAA0000A1Z5',
                validation: {
                  pattern: '^\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',
                  message: 'Enter a valid 15-character GSTIN'
                },
                width: 'half'
              }
            ]
          },
          {
            id: 'trip',
            title: 'Trip & Coverage Schedule',
            fields: [
              {
                key: 'destination',
                label: 'Destination',
                type: 'text',
                readOnly: true,
                prefill: 'quote.destination',
                width: 'full'
              },
              {
                key: 'tripStart',
                label: 'Travel start',
                type: 'date',
                required: true,
                prefill: 'quote.tripStart',
                width: 'half'
              },
              {
                key: 'tripEnd',
                label: 'Travel end',
                type: 'date',
                required: true,
                prefill: 'quote.tripEnd',
                validation: {
                  after: 'tripStart',
                  message: 'End date must be after the start date'
                },
                width: 'half'
              },
              {
                key: 'medicalDeclaration',
                label: 'Pre-existing medical conditions have been declared for all members',
                type: 'checkbox',
                required: true,
                width: 'full'
              }
            ]
          }
        ]
      };
    }

    // Individual mode schema
    // // TODO(FORMAT): Adapt individual form schema when official insurer fields arrive
    return {
      formId: 'individual-policy-v1',
      title: 'Policyholder & Nominee Details',
      sections: [
        {
          id: 'contact',
          title: 'Contact Information',
          fields: [
            {
              key: 'email',
              label: 'Email address',
              type: 'email',
              required: true,
              placeholder: 'name@example.com',
              width: 'half'
            },
            {
              key: 'phone',
              label: 'Mobile phone',
              type: 'tel',
              required: true,
              placeholder: '10-digit mobile',
              validation: {
                pattern: '^[6-9]\\d{9}$',
                message: 'Enter a valid 10-digit mobile number'
              },
              width: 'half'
            },
            {
              key: 'addressLine',
              label: 'Residential address',
              type: 'textarea',
              required: true,
              prefill: 'passport.address',
              placeholder: 'House / Flat, Street, Locality',
              width: 'full'
            },
            {
              key: 'city',
              label: 'City',
              type: 'text',
              required: true,
              prefill: 'passport.placeOfIssue',
              placeholder: 'City',
              width: 'half'
            },
            {
              key: 'pincode',
              label: 'PIN Code',
              type: 'text',
              required: true,
              placeholder: '6-digit PIN code',
              validation: {
                pattern: '^\\d{6}$',
                message: 'Enter a valid 6-digit PIN code'
              },
              width: 'half'
            }
          ]
        },
        {
          id: 'nominee',
          title: 'Nominee Information',
          fields: [
            {
              key: 'nomineeName',
              label: 'Nominee full name',
              type: 'text',
              required: true,
              prefill: 'passport.spouseName',
              placeholder: 'Nominee name',
              width: 'half'
            },
            {
              key: 'nomineeRelation',
              label: 'Relationship to traveller',
              type: 'select',
              required: true,
              options: [
                { value: 'spouse', label: 'Spouse' },
                { value: 'parent', label: 'Parent' },
                { value: 'child', label: 'Child' },
                { value: 'sibling', label: 'Sibling' },
                { value: 'other', label: 'Other' }
              ],
              width: 'half'
            },
            {
              key: 'nomineeDob',
              label: 'Nominee date of birth',
              type: 'date',
              required: true,
              width: 'half'
            }
          ]
        },
        {
          id: 'declaration',
          title: 'Medical Declaration',
          fields: [
            {
              key: 'medicalDeclaration',
              label: 'The insured traveller confirms no undisclosed pre-existing chronic conditions',
              type: 'checkbox',
              required: true,
              width: 'full'
            }
          ]
        }
      ]
    };
  },

  /**
   * Issues an Individual policy.
   *
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async issue(payload) {
    // // TODO(API): Call real policy issuance endpoint when endpoint is live
    if (ISSUE_POLICY_CONFIG.USE_LIVE_POLICY_API) {
      try {
        const res = await fetch('/api/policy/issue/individual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Live policy issuance failed, using simulated response:', e.message);
      }
    }

    // Mock network latency
    await new Promise(resolve => setTimeout(resolve, 800));

    const policyNumber = 'POL-IND-' + Math.floor(100000 + Math.random() * 900000);
    const issuedAt = new Date().toISOString();

    // // TODO(FORMAT): Structure response fields to match the insurer's confirmation packet
    return {
      success: true,
      policyNumber,
      issuedAt,
      premium: payload.premium || 3450,
      currency: ISSUE_POLICY_CONFIG.CURRENCY,
      plan: payload.planName || 'Bajaj Allianz Travel Elite - Gold',
      passport: payload.passportNumber || 'M4592817',
      travellerName: payload.travellerName || 'Aarav Sharma',
      destination: payload.destination || 'Schengen (Europe)',
      coverPeriod: `${payload.tripStart || '2026-12-01'} to ${payload.tripEnd || '2026-12-15'}`,
      documentUrl: `https://example.com/policies/${policyNumber}.pdf`
    };
  },

  /**
   * Issues a Group master policy with individual certificates.
   *
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async issueGroup(payload) {
    // // TODO(API): Call real group policy issuance endpoint when endpoint is live
    if (ISSUE_POLICY_CONFIG.USE_LIVE_POLICY_API) {
      try {
        const res = await fetch('/api/policy/issue/group', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Live group policy issuance failed, using simulated response:', e.message);
      }
    }

    // Mock processing latency
    await new Promise(resolve => setTimeout(resolve, 1200));

    const masterPolicyNumber = 'POL-GRP-' + Math.floor(100000 + Math.random() * 900000);
    const issuedAt = new Date().toISOString();

    const travellers = payload.travellers || [];
    const certificates = travellers.map((t, idx) => ({
      travellerName: `${t.givenNames || ''} ${t.surname || ''}`.trim() || `Traveller #${idx + 1}`,
      passportNumber: t.passportNumber || `UNKNOWN-${idx + 1}`,
      certificateNumber: `CERT-${masterPolicyNumber.replace('POL-GRP-', '')}-${String(idx + 1).padStart(3, '0')}`
    }));

    const perTraveller = payload.perTravellerPremium || 2850;
    const totalPremium = perTraveller * travellers.length;

    // // TODO(FORMAT): Structure response fields to match the insurer's group confirmation packet
    return {
      success: true,
      masterPolicyNumber,
      issuedAt,
      totalPremium,
      perTravellerPremium: perTraveller,
      currency: ISSUE_POLICY_CONFIG.CURRENCY,
      plan: payload.planName || 'ICICI Lombard Corporate Travel Comprehensive',
      destination: payload.destination || 'United Arab Emirates & Schengen',
      coverPeriod: `${payload.tripStart || '2026-12-10'} to ${payload.tripEnd || '2026-12-24'}`,
      contact: {
        name: payload.dynamicFormValues?.contactPerson || 'Authorised Contact',
        email: payload.dynamicFormValues?.email || 'admin@organization.com',
        groupName: payload.dynamicFormValues?.groupName || 'Corporate Group'
      },
      certificates,
      documentUrl: `https://example.com/policies/group/${masterPolicyNumber}.pdf`
    };
  }
};


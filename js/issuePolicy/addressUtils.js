/**
 * Client-Side Address Parsing & Indian PIN Code Lookup Utilities
 */
import { getBaseUrl } from '../api.js';

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

export const STATE_ALIASES = {
  'AP': 'Andhra Pradesh',
  'ANDHRA PRADESH': 'Andhra Pradesh',
  'AR': 'Arunachal Pradesh',
  'ARUNACHAL PRADESH': 'Arunachal Pradesh',
  'AS': 'Assam',
  'ASSAM': 'Assam',
  'BR': 'Bihar',
  'BIHAR': 'Bihar',
  'CG': 'Chhattisgarh',
  'CHHATTISGARH': 'Chhattisgarh',
  'CHATTISGARH': 'Chhattisgarh',
  'GA': 'Goa',
  'GOA': 'Goa',
  'GJ': 'Gujarat',
  'GUJ': 'Gujarat',
  'GUJARAT': 'Gujarat',
  'HR': 'Haryana',
  'HARYANA': 'Haryana',
  'HP': 'Himachal Pradesh',
  'HIMACHAL PRADESH': 'Himachal Pradesh',
  'JH': 'Jharkhand',
  'JHARKHAND': 'Jharkhand',
  'KA': 'Karnataka',
  'KARNATAKA': 'Karnataka',
  'KL': 'Kerala',
  'KERALA': 'Kerala',
  'MP': 'Madhya Pradesh',
  'MADHYA PRADESH': 'Madhya Pradesh',
  'MH': 'Maharashtra',
  'MAHARASHTRA': 'Maharashtra',
  'MN': 'Manipur',
  'MANIPUR': 'Manipur',
  'ML': 'Meghalaya',
  'MEGHALAYA': 'Meghalaya',
  'MZ': 'Mizoram',
  'MIZORAM': 'Mizoram',
  'NL': 'Nagaland',
  'NAGALAND': 'Nagaland',
  'OR': 'Odisha',
  'ODISHA': 'Odisha',
  'ORISSA': 'Odisha',
  'PB': 'Punjab',
  'PUNJAB': 'Punjab',
  'RJ': 'Rajasthan',
  'RAJ': 'Rajasthan',
  'RAJASTHAN': 'Rajasthan',
  'SK': 'Sikkim',
  'SIKKIM': 'Sikkim',
  'TN': 'Tamil Nadu',
  'TAMIL NADU': 'Tamil Nadu',
  'TAMILNADU': 'Tamil Nadu',
  'TS': 'Telangana',
  'TG': 'Telangana',
  'TELANGANA': 'Telangana',
  'TR': 'Tripura',
  'TRIPURA': 'Tripura',
  'UP': 'Uttar Pradesh',
  'UTTAR PRADESH': 'Uttar Pradesh',
  'UK': 'Uttarakhand',
  'UA': 'Uttarakhand',
  'UTTARAKHAND': 'Uttarakhand',
  'UTTARANCHAL': 'Uttarakhand',
  'WB': 'West Bengal',
  'WEST BENGAL': 'West Bengal',
  'BENGAL': 'West Bengal',
  'AN': 'Andaman and Nicobar Islands',
  'CHANDIGARH': 'Chandigarh',
  'CH': 'Chandigarh',
  'DNHDD': 'Dadra and Nagar Haveli and Daman and Diu',
  'DL': 'Delhi',
  'DELHI': 'Delhi',
  'NEW DELHI': 'Delhi',
  'JK': 'Jammu and Kashmir',
  'J&K': 'Jammu and Kashmir',
  'LA': 'Ladakh',
  'LADAKH': 'Ladakh',
  'LD': 'Lakshadweep',
  'PY': 'Puducherry',
  'PONDICHERRY': 'Puducherry'
};

export const LOCAL_PIN_MAP = {
  '110016': { city: 'New Delhi', district: 'South Delhi', state: 'Delhi' },
  '110001': { city: 'New Delhi', district: 'Central Delhi', state: 'Delhi' },
  '600020': { city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu' },
  '302006': { city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan' },
  '400050': { city: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra' },
  '400001': { city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra' },
  '560001': { city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka' },
  '500001': { city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana' },
  '700001': { city: 'Kolkata', district: 'Kolkata', state: 'West Bengal' },
  '380001': { city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat' },
  '411001': { city: 'Pune', district: 'Pune', state: 'Maharashtra' }
};

export const PIN_PREFIX_STATE_MAP = {
  '11': { state: 'Delhi', city: 'Delhi' },
  '12': { state: 'Haryana', city: 'Gurgaon' },
  '13': { state: 'Haryana', city: 'Ambala' },
  '14': { state: 'Punjab', city: 'Ludhiana' },
  '15': { state: 'Punjab', city: 'Bathinda' },
  '16': { state: 'Chandigarh', city: 'Chandigarh' },
  '17': { state: 'Himachal Pradesh', city: 'Shimla' },
  '18': { state: 'Jammu and Kashmir', city: 'Jammu' },
  '19': { state: 'Jammu and Kashmir', city: 'Srinagar' },
  '20': { state: 'Uttar Pradesh', city: 'Noida' },
  '21': { state: 'Uttar Pradesh', city: 'Allahabad' },
  '22': { state: 'Uttar Pradesh', city: 'Lucknow' },
  '23': { state: 'Uttar Pradesh', city: 'Varanasi' },
  '24': { state: 'Uttarakhand', city: 'Dehradun' },
  '25': { state: 'Uttar Pradesh', city: 'Meerut' },
  '26': { state: 'Uttarakhand', city: 'Nainital' },
  '27': { state: 'Uttar Pradesh', city: 'Gorakhpur' },
  '28': { state: 'Uttar Pradesh', city: 'Agra' },
  '30': { state: 'Rajasthan', city: 'Jaipur' },
  '31': { state: 'Rajasthan', city: 'Udaipur' },
  '32': { state: 'Rajasthan', city: 'Kota' },
  '33': { state: 'Rajasthan', city: 'Bikaner' },
  '34': { state: 'Rajasthan', city: 'Jodhpur' },
  '36': { state: 'Gujarat', city: 'Rajkot' },
  '37': { state: 'Gujarat', city: 'Jamnagar' },
  '38': { state: 'Gujarat', city: 'Ahmedabad' },
  '39': { state: 'Gujarat', city: 'Surat' },
  '40': { state: 'Maharashtra', city: 'Mumbai' },
  '41': { state: 'Maharashtra', city: 'Pune' },
  '42': { state: 'Maharashtra', city: 'Nashik' },
  '43': { state: 'Maharashtra', city: 'Aurangabad' },
  '44': { state: 'Maharashtra', city: 'Nagpur' },
  '45': { state: 'Madhya Pradesh', city: 'Indore' },
  '46': { state: 'Madhya Pradesh', city: 'Bhopal' },
  '47': { state: 'Madhya Pradesh', city: 'Gwalior' },
  '48': { state: 'Madhya Pradesh', city: 'Jabalpur' },
  '49': { state: 'Chhattisgarh', city: 'Raipur' },
  '50': { state: 'Telangana', city: 'Hyderabad' },
  '51': { state: 'Andhra Pradesh', city: 'Tirupati' },
  '52': { state: 'Andhra Pradesh', city: 'Vijayawada' },
  '53': { state: 'Andhra Pradesh', city: 'Visakhapatnam' },
  '56': { state: 'Karnataka', city: 'Bengaluru' },
  '57': { state: 'Karnataka', city: 'Mangalore' },
  '58': { state: 'Karnataka', city: 'Hubli' },
  '59': { state: 'Karnataka', city: 'Belgaum' },
  '60': { state: 'Tamil Nadu', city: 'Chennai' },
  '61': { state: 'Tamil Nadu', city: 'Thanjavur' },
  '62': { state: 'Tamil Nadu', city: 'Madurai' },
  '63': { state: 'Tamil Nadu', city: 'Salem' },
  '64': { state: 'Tamil Nadu', city: 'Coimbatore' },
  '67': { state: 'Kerala', city: 'Kozhikode' },
  '68': { state: 'Kerala', city: 'Kochi' },
  '69': { state: 'Kerala', city: 'Thiruvananthapuram' },
  '70': { state: 'West Bengal', city: 'Kolkata' },
  '71': { state: 'West Bengal', city: 'Howrah' },
  '72': { state: 'West Bengal', city: 'Midnapore' },
  '73': { state: 'West Bengal', city: 'Siliguri' },
  '74': { state: 'West Bengal', city: 'North 24 Parganas' },
  '75': { state: 'Odisha', city: 'Bhubaneswar' },
  '76': { state: 'Odisha', city: 'Cuttack' },
  '77': { state: 'Odisha', city: 'Sambalpur' },
  '78': { state: 'Assam', city: 'Guwahati' },
  '79': { state: 'Tripura', city: 'Agartala' },
  '80': { state: 'Bihar', city: 'Patna' },
  '81': { state: 'Bihar', city: 'Bhagalpur' },
  '82': { state: 'Bihar', city: 'Gaya' },
  '83': { state: 'Jharkhand', city: 'Ranchi' },
  '84': { state: 'Bihar', city: 'Muzaffarpur' },
  '85': { state: 'Bihar', city: 'Purnia' }
};

const clientPinCache = new Map();

export function fixPinOcrChars(str) {
  if (!str) return '';
  return str
    .replace(/[Oo]/g, '0')
    .replace(/[Il|i]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8');
}

export function cleanCity(city) {
  if (!city) return '';
  return String(city)
    .replace(/\d+/g, '') // City must never contain digits
    .replace(/\b(?:PIN|PIN\s*CODE|PINCODE|POSTAL\s*CODE)\b/gi, '')
    .replace(/[-–—_]/g, ' ')
    .replace(/^[,;\s-]+|[,;\s-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanState(state) {
  if (!state) return '';
  return String(state)
    .replace(/\d+/g, '')
    .replace(/\b(?:PIN|PIN\s*CODE|PINCODE|POSTAL\s*CODE)\b/gi, '')
    .replace(/[-–—_]/g, ' ')
    .replace(/^[,;\s-]+|[,;\s-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanCountry(country) {
  if (!country) return 'India';
  const cleaned = String(country)
    .replace(/\d+/g, '')
    .replace(/\b(?:PIN|PIN\s*CODE|PINCODE|POSTAL\s*CODE)\b/gi, '')
    .replace(/[-–—_]/g, ' ')
    .replace(/^[,;\s-]+|[,;\s-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'India';
}

export function extractPinCode(text) {
  if (!text) return null;
  const labeled = text.match(/(?:PIN|PINCODE|PIN\s*CODE|POSTAL\s*CODE)[:\s-]*([0-9A-Za-z]{6})\b/i);
  if (labeled) {
    const fixed = fixPinOcrChars(labeled[1]);
    if (/^[1-9]\d{5}$/.test(fixed)) return { pin: fixed, rawMatch: labeled[0] };
  }

  const tokens = text.split(/[\s,]+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const cleanToken = tokens[i].replace(/[^\w]/g, '');
    if (cleanToken.length === 6) {
      const fixed = fixPinOcrChars(cleanToken);
      if (/^[1-9]\d{5}$/.test(fixed)) return { pin: fixed, rawMatch: tokens[i] };
    }
  }

  const digitMatch = text.match(/\b([1-9]\d{5})\b/);
  if (digitMatch) return { pin: digitMatch[1], rawMatch: digitMatch[0] };
  return null;
}

export function extractState(text) {
  if (!text) return null;
  const clean = text.toUpperCase().replace(/[.,]/g, ' ');
  const sortedKeys = Object.keys(STATE_ALIASES).sort((a, b) => b.length - a.length);

  for (const alias of sortedKeys) {
    const pattern = new RegExp(`\\b${alias.replace(/&/g, '[&|AND]')}\\b`, 'i');
    const match = clean.match(pattern);
    if (match) {
      return {
        canonical: STATE_ALIASES[alias],
        rawMatch: match[0]
      };
    }
  }
  return null;
}

export async function lookupPinCode(pin) {
  if (!pin || !/^[1-9]\d{5}$/.test(pin)) return null;

  if (clientPinCache.has(pin)) {
    return clientPinCache.get(pin);
  }

  if (LOCAL_PIN_MAP[pin]) {
    const res = { ...LOCAL_PIN_MAP[pin] };
    clientPinCache.set(pin, res);
    return res;
  }

  // Call backend PIN lookup endpoint
  try {
    const resp = await fetch(`${getBaseUrl()}/api/passport/pincode/${pin}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.state) {
        clientPinCache.set(pin, data);
        return data;
      }
    }
  } catch (e) {}

  // Prefix fallback
  const prefix = pin.substring(0, 2);
  if (PIN_PREFIX_STATE_MAP[prefix]) {
    const res = { ...PIN_PREFIX_STATE_MAP[prefix], district: PIN_PREFIX_STATE_MAP[prefix].city, country: 'India' };
    clientPinCache.set(pin, res);
    return res;
  }

  return null;
}

export function parseIndianAddressSync(rawAddress) {
  const fullAddress = (rawAddress || '').trim().replace(/\s+/g, ' ');

  if (!fullAddress) {
    return {
      rawAddress: '',
      addressLine: '',
      city: '',
      state: '',
      pinCode: '',
      country: 'India',
      lowConfidence: ['addressLine', 'city', 'state', 'pinCode'],
      fieldStatuses: {
        addressLine: { status: 'orange', message: 'Not captured' },
        city: { status: 'orange', message: 'Not captured' },
        state: { status: 'orange', message: 'Not captured' },
        pinCode: { status: 'orange', message: 'Not captured' },
        country: { status: 'green', message: '' }
      }
    };
  }

  const pinObj = extractPinCode(fullAddress);
  const pinCode = pinObj ? pinObj.pin : '';

  // Remove PIN code from address text before finding city/state
  let textWithoutPin = fullAddress;
  if (pinObj) {
    textWithoutPin = textWithoutPin.replace(new RegExp(`\\b${pinObj.rawMatch}\\b`, 'gi'), ' ');
    textWithoutPin = textWithoutPin.replace(new RegExp(`\\b${pinObj.pin}\\b`, 'gi'), ' ');
  }
  textWithoutPin = textWithoutPin.replace(/(?:PIN|PIN\s*CODE|PINCODE|POSTAL\s*CODE)[:\s-]*\d*/gi, ' ').replace(/\s+/g, ' ').trim();

  const stateObj = extractState(textWithoutPin);
  let state = cleanState(stateObj ? stateObj.canonical : '');
  const stateRaw = stateObj ? stateObj.rawMatch : '';
  const country = cleanCountry('India');

  let city = '';
  const hasNewDelhi = /\bNEW\s+DELHI\b/i.test(fullAddress);

  const segments = textWithoutPin
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (segments.length > 1) {
    let targetIdx = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].toUpperCase();
      const hasStateInSeg = stateRaw && seg.includes(stateRaw.toUpperCase());
      if (hasStateInSeg) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx >= 0) {
      const targetSeg = segments[targetIdx];
      let segWithoutState = targetSeg;
      if (stateRaw) {
        segWithoutState = segWithoutState.replace(new RegExp(`\\b${stateRaw}\\b`, 'i'), '');
      }
      segWithoutState = segWithoutState.replace(/\b(INDIA|IND)\b/gi, '').trim();

      const candCityInSeg = cleanCity(segWithoutState);
      const isStateCand = candCityInSeg && extractState(candCityInSeg);

      if (candCityInSeg && !isStateCand) {
        city = candCityInSeg;
      } else if (targetIdx > 0) {
        let cand = cleanCity(segments[targetIdx - 1]);
        if (/\bNEW\s+DELHI\b/i.test(segments[targetIdx - 1])) {
          city = 'New Delhi';
        } else {
          cand = cand.replace(/\b(INDIA|IND)\b/gi, '').trim();
          city = cand;
        }
      }
    }
  }

  if (!city) {
    let textWithoutEnd = textWithoutPin;
    if (stateRaw) {
      textWithoutEnd = textWithoutEnd.replace(new RegExp(`\\b${stateRaw}\\b`, 'i'), '');
    }
    textWithoutEnd = textWithoutEnd.replace(/\b(INDIA|IND)\b/gi, '').trim();

    if (hasNewDelhi) {
      city = 'New Delhi';
    } else {
      const tokens = textWithoutEnd.split(/[\s,]+/).filter(Boolean);
      if (tokens.length > 0) {
        city = cleanCity(tokens[tokens.length - 1]);
      }
    }
  }

  if ((state === 'Delhi' || stateObj?.canonical === 'Delhi') && !city) {
    if (hasNewDelhi) {
      city = 'New Delhi';
    }
  }

  city = cleanCity(city);

  let lookupData = null;
  let stateMismatch = false;
  let stateFilledFromLookup = false;
  let cityFilledFromLookup = false;

  if (pinCode) {
    if (LOCAL_PIN_MAP[pinCode]) {
      lookupData = LOCAL_PIN_MAP[pinCode];
    } else if (PIN_PREFIX_STATE_MAP[pinCode.substring(0, 2)]) {
      lookupData = PIN_PREFIX_STATE_MAP[pinCode.substring(0, 2)];
    }

    if (lookupData) {
      if (!state && lookupData.state) {
        state = lookupData.state;
        stateFilledFromLookup = true;
      } else if (state && lookupData.state && state.toLowerCase() !== lookupData.state.toLowerCase()) {
        stateMismatch = true;
      }

      if (!city && (lookupData.city || lookupData.district)) {
        city = lookupData.city || lookupData.district;
        cityFilledFromLookup = true;
      }
    }
  }

  let rem = fullAddress;
  if (country) {
    rem = rem.replace(/\bINDIA\b/gi, '');
  }
  if (pinObj) {
    rem = rem.replace(new RegExp(`\\b${pinObj.rawMatch}\\b`, 'gi'), '');
    rem = rem.replace(new RegExp(`\\b${pinCode}\\b`, 'gi'), '');
  }
  if (stateRaw) {
    rem = rem.replace(new RegExp(`\\b${stateRaw}\\b`, 'gi'), '');
  }
  if (state) {
    rem = rem.replace(new RegExp(`\\b${state}\\b`, 'gi'), '');
  }
  if (city) {
    rem = rem.replace(new RegExp(`\\b${city}\\b`, 'gi'), '');
  }

  let addressLine = rem
    .replace(/[,\s-]+$/g, '')
    .replace(/^[,\s-]+/g, '')
    .replace(/,\s*,+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  if (!addressLine && city) {
    addressLine = city;
  }

  const lowConfidence = [];
  const fieldStatuses = {
    addressLine: { status: 'green', message: '' },
    city: { status: 'green', message: '' },
    state: { status: 'green', message: '' },
    pinCode: { status: 'green', message: '' },
    country: { status: 'green', message: '' }
  };

  if (!addressLine) {
    fieldStatuses.addressLine = { status: 'orange', message: 'Not captured' };
    lowConfidence.push('addressLine');
  }

  if (!city) {
    fieldStatuses.city = { status: 'orange', message: 'Not captured' };
    lowConfidence.push('city');
  } else if (cityFilledFromLookup) {
    fieldStatuses.city = { status: 'orange', message: 'Filled from PIN lookup, verify with document.' };
    lowConfidence.push('city');
  }

  if (!state) {
    fieldStatuses.state = { status: 'orange', message: 'Not captured' };
    lowConfidence.push('state');
  } else if (stateFilledFromLookup) {
    fieldStatuses.state = { status: 'orange', message: 'Filled from PIN lookup, verify with document.' };
    lowConfidence.push('state');
  } else if (stateMismatch && lookupData) {
    fieldStatuses.state = { status: 'orange', message: `PIN code belongs to ${lookupData.state}` };
    lowConfidence.push('state');
  }

  if (!pinCode) {
    fieldStatuses.pinCode = { status: 'orange', message: 'Not captured' };
    lowConfidence.push('pinCode');
  }

  return {
    rawAddress: fullAddress,
    addressLine,
    city,
    state,
    pinCode,
    country,
    lowConfidence,
    fieldStatuses
  };
}


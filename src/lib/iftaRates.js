// Official IFTA diesel ("Special Diesel") tax rates, US $/gallon, per quarter.
// Source: IFTA, Inc. tax rate matrix — https://www.iftach.org/taxmatrix4/Taxmatrix.php?QY=<n>Q<year>
// Update every quarter from that page. Keys ending in * are surcharges (KY, VA):
// charged on the gallons consumed in the state, with no credit for gallons bought there.
// OR has no IFTA diesel rate (Oregon uses its own weight-mile tax): $0, miles still reported.
export const IFTA_DIESEL_RATES = {
  '1Q2026': { AL: 0.31, AR: 0.285, AZ: 0.26, CA: 0.971, CO: 0.325, CT: 0.489, DE: 0.22, FL: 0.4027, GA: 0.371, IA: 0.325, ID: 0.32, IL: 0.738, IN: 0.61, KS: 0.26, KY: 0.22, 'KY*': 0.105, LA: 0.2, MA: 0.24, MD: 0.4675, ME: 0.312, MI: 0.524, MN: 0.326, MO: 0.295, MS: 0.21, MT: 0.2975, NC: 0.41, ND: 0.23, NE: 0.318, NH: 0.222, NJ: 0.561, NM: 0.21, NV: 0.27, NY: 0.3805, OH: 0.47, OK: 0.19, OR: 0, PA: 0.741, RI: 0.4, SC: 0.28, SD: 0.28, TN: 0.27, TX: 0.2, UT: 0.379, VA: 0.327, 'VA*': 0.143, VT: 0.31, WA: 0.584, WI: 0.329, WV: 0.357, WY: 0.24 },
  '2Q2026': { AL: 0.31, AR: 0.285, AZ: 0.26, CA: 0.971, CO: 0.325, CT: 0.489, DE: 0.22, FL: 0.4097, GA: 0.373, IA: 0.325, ID: 0.32, IL: 0.738, IN: 0.63, KS: 0.26, KY: 0.22, 'KY*': 0.105, LA: 0.2, MA: 0.24, MD: 0.4675, ME: 0.312, MI: 0.524, MN: 0.326, MO: 0.295, MS: 0.21, MT: 0.2975, NC: 0.41, ND: 0.23, NE: 0.318, NH: 0.222, NJ: 0.561, NM: 0.21, NV: 0.27, NY: 0.3805, OH: 0.47, OK: 0.19, OR: 0, PA: 0.741, RI: 0.4, SC: 0.28, SD: 0.28, TN: 0.27, TX: 0.2, UT: 0.379, VA: 0.327, 'VA*': 0.143, VT: 0.31, WA: 0.584, WI: 0.329, WV: 0.357, WY: 0.24 },
  '3Q2026': { AL: 0.31, AR: 0.285, AZ: 0.26, CA: 0.979, CO: 0.335, CT: 0.499, DE: 0.22, FL: 0.4097, GA: 0.373, IA: 0.325, ID: 0.32, IL: 0.738, IN: 0.63, KS: 0.26, KY: 0.22, 'KY*': 0.105, LA: 0.2, MA: 0.24, MD: 0.4745, ME: 0.312, MI: 0.524, MN: 0.326, MO: 0.295, MS: 0.24, MT: 0.2975, NC: 0.41, ND: 0.23, NE: 0.318, NH: 0.222, NJ: 0.561, NM: 0.21, NV: 0.27, NY: 0.3805, OH: 0.47, OK: 0.19, OR: 0, PA: 0.741, RI: 0.4, SC: 0.28, SD: 0.28, TN: 0.27, TX: 0.2, UT: 0.379, VA: 0.336, 'VA*': 0.143, VT: 0.31, WA: 0.595, WI: 0.329, WV: 0.357, WY: 0.24 },
  '4Q2026': { AL: 0.31, AR: 0.285, AZ: 0.26, CA: 0.979, CO: 0.335, CT: 0.499, DE: 0.22, FL: 0.4097, GA: 0.373, IA: 0.325, ID: 0.32, IL: 0.738, IN: 0.63, KS: 0.26, KY: 0.22, 'KY*': 0.105, LA: 0.2, MA: 0.24, MD: 0.4745, ME: 0.312, MI: 0.524, MN: 0.326, MO: 0.295, MS: 0.24, MT: 0.2975, NC: 0.41, ND: 0.23, NE: 0.318, NH: 0.222, NJ: 0.561, NM: 0.21, NV: 0.27, NY: 0.3805, OH: 0.47, OK: 0.19, OR: 0, PA: 0.741, RI: 0.4, SC: 0.28, SD: 0.28, TN: 0.27, TX: 0.2, UT: 0.379, VA: 0.336, 'VA*': 0.143, VT: 0.31, WA: 0.595, WI: 0.329, WV: 0.357, WY: 0.24 },
}

/** Rates for a quarter ('3Q2026'), or null if not loaded yet. */
export function ratesFor(year, quarter) {
  return IFTA_DIESEL_RATES[`${quarter}Q${year}`] || null
}

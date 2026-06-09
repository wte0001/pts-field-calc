// Motor full-load current lookup per NEC Table 430.250 (three-phase). NEC 2023.
// Pure functions only.

import table430250 from '../data/nec_430_250.json'

export const HP_LIST = table430250.horsepowers
export const VOLTAGE_LIST = table430250.voltages

/**
 * @param {string} hp - one of HP_LIST (e.g. "7-1/2")
 * @param {number} voltage - one of VOLTAGE_LIST
 */
export function motorFlc(hp, voltage) {
  const row = table430250.flc[hp]
  if (!row) return { error: 'Horsepower not in Table 430.250.' }
  const flc = row[String(voltage)]
  if (flc === undefined) return { error: 'Voltage not in Table 430.250.' }
  if (flc === null) {
    return {
      error: `The ${voltage}V value for ${hp} HP is not loaded in this app (unverified). Check the printed NEC 2023 Table 430.250.`,
      unverified: true
    }
  }
  return {
    table: 'NEC 2023 Table 430.250',
    hp,
    voltage,
    flc,
    // Derived values - NOT table values:
    minBranchAmpacity: Math.round(flc * 1.25 * 10) / 10, // 125% per NEC 430.22
    overloadReferenceFlc: flc
  }
}

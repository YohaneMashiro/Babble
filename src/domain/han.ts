/**
 * Keep recent encoded CJK characters usable on browsers with older Unicode
 * regex tables. Ranges follow Unicode 18.0.0 PropList.txt (Unicode-3.0 terms),
 * SHA256 f438f532e8737bb8a2702126cdf9c4af5e357c58c7acf9d9eb2fc7c1a1d955d6.
 * Script=Han retains the existing treatment of compatibility forms and radicals.
 * A recognized character is not a claim that a reading or code is available.
 */
const recentHanRanges: readonly (readonly [number, number])[] = [
  [0x2b740, 0x2b81e], [0x2b820, 0x2cead], [0x2ceb0, 0x2ebe0],
  [0x2ebf0, 0x2ee5d], [0x30000, 0x3134a], [0x31350, 0x33479],
]

export function isHanCharacter(value: string): boolean {
  if (Array.from(value).length !== 1) return false
  const point = value.codePointAt(0)!
  return /^\p{Script=Han}$/u.test(value) || recentHanRanges.some(([start, end]) => point >= start && point <= end)
}

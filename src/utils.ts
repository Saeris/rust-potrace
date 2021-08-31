export const isNumber = (val: number): boolean =>
  typeof val === `number` && !isNaN(val)

export const clamp = (val: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, val)) // $(255, 0, 128)

export const range = (min: number, max?: number, step = 1) => {
  const singleArg = max === undefined // eslint-disable-line no-undefined
  const [start, end] = singleArg ? [0, min] : [min, max as number]
  const length = Math.abs(end - start)

  return {
    length,
    *[Symbol.iterator]() {
      const [initial, condition] =
        step > 0
          ? [start, (i: number) => i < end]
          : [end - 1, (i: number) => i > start - 1]
      for (let i = initial, value = initial; condition(i); i++, value += step) {
        yield value
      }
    },
    /**
     * Returns true if value is contained in the range.
     */
    contains: (value: number): boolean => value >= start && value <= end
  }
}

const attrRegexps: { [key: string]: RegExp } = {}

export const getAttrRegexp = (attrName: string): RegExp => {
  if (attrRegexps[attrName]) {
    return attrRegexps[attrName]
  }

  attrRegexps[attrName] = new RegExp(
    ` ${attrName}="((?:\\\\(?=")"|[^"])+)"`,
    `i`
  )
  return attrRegexps[attrName]
}

export const setHtmlAttribute = (
  html: string,
  attrName: string,
  value: string
): string => {
  const attr = ` ${attrName}="${value}"`
  return html.indexOf(` ${attrName}="`) === -1
    ? html.replace(/<[a-z]+/i, (beginning: string) => `${beginning}${attr}`)
    : html.replace(getAttrRegexp(attrName), attr)
}

export const fixed = (number: number): string =>
  number.toFixed(3).replace(`.000`, ``) // $(255.456342)

export const mod = (a: number, n: number): number =>
  a >= n ? a % n : a >= 0 ? a : n - 1 - ((-1 - a) % n) // $(156, 25)

/* return true if a <= b < c < a, in a cyclic sense (mod n) */
export const cyclic = (a: number, b: number, c: number): boolean =>
  a <= c ? a <= b && b < c : a <= b || b < c // $(167, 128, 156)

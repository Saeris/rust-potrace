import { clamp, range } from "../utils"
import { Bitmap } from "./Bitmap"

const COLOR_DEPTH = 256
const COLOR_RANGE_END = COLOR_DEPTH - 1

/**
 * Calculates array index for pair of indexes. We multiple column (x) by 256 and then add row to it,
 * this way `(index(i, j) + 1) === index(i, j + i)` thus we can reuse `index(i, j)` we once calculated
 *
 * Note: this is different from how indexes calculated in {@link Bitmap} class, keep it in mind.
 */
const index = (column: number, row: number): number =>
  COLOR_DEPTH * column + row

/**
 * Shared parameter normalization for methods 'multilevelThresholding', 'autoThreshold', 'getDominantColor' and 'getStats'
 */
const normalizeMinMax = (
  levelMin: number = 0,
  levelMax: number = COLOR_RANGE_END
): number[] => {
  const min = clamp(Math.round(levelMin), 0, COLOR_RANGE_END)
  const max = clamp(Math.round(levelMax), 0, COLOR_RANGE_END)
  if (min > max) {
    throw new Error(`Invalid range "${levelMin}...${levelMax}"`)
  }

  return [min, max]
}

interface Stats {
  levels: { mean: number | any; median: any; stdDev: number; unique: number }
  pixelsPerLevel: { mean: number | any; median: number | any; peak: number }
  pixels: number
}

/**
 * 1D Histogram from Bitmap Luminance Data
 */
export class Histogram {
  data: Uint32Array
  pixelsTotal: number
  #sortedIndexes: Uint32Array | null = null
  #cachedStats: Record<string, Stats> = {}
  #lookupTableH: Float64Array | null = null

  constructor(bitmap: Bitmap) {
    this.pixelsTotal = bitmap.size
    this.data = new Uint32Array(COLOR_DEPTH)
    for (let val of bitmap.lum) {
      this.data[val]++
    }
  }

  /**
   * Returns array of color indexes in ascending order
   */
  #getSortedIndexes = (refresh: boolean = false): Uint32Array => {
    if (!refresh && this.#sortedIndexes) {
      return this.#sortedIndexes
    }

    const data = this.data!
    this.#sortedIndexes = Uint32Array.from(range(COLOR_DEPTH)).sort((a, b) =>
      data[a] > data[b] ? 1 : data[a] < data[b] ? -1 : 0
    )
    return this.#sortedIndexes
  }

  /**
   * Builds lookup table H from lookup tables P and S.
   * see {@link http://www.iis.sinica.edu.tw/page/jise/2001/200109_01.pdf |this paper} for more details
   */
  #generateLookupTable = (): Float64Array => {
    const P = new Float64Array(COLOR_DEPTH ** 2)
    const S = new Float64Array(COLOR_DEPTH ** 2)
    const H = new Float64Array(COLOR_DEPTH ** 2)
    const pixelsTotal = this.pixelsTotal
    // diagonal
    for (const col of range(1, COLOR_DEPTH)) {
      // 255..1
      const idx = index(col, col)
      const tmp = this.data![col] / pixelsTotal
      P[idx] = tmp
      S[idx] = col * tmp
    }

    // calculate first row (row 0 is all zero)
    for (const col of range(1, COLOR_DEPTH - 1)) {
      // 254..1
      const idx = index(1, col)
      const tmp = this.data![col + 1] / pixelsTotal
      P[idx + 1] = P[idx] + tmp
      S[idx + 1] = S[idx] + (col + 1) * tmp
    }

    // using row 1 to calculate others
    for (const col of range(2, COLOR_DEPTH)) {
      // 2..255
      for (const row of range(col + 1, COLOR_DEPTH)) {
        P[index(col, row)] = P[index(1, row)] - P[index(1, col - 1)]
        S[index(col, row)] = S[index(1, row)] - S[index(1, col - 1)]
      }
    }

    // now calculate H[col][row]
    for (const col of range(1, COLOR_DEPTH)) {
      for (const row of range(col + 1, COLOR_DEPTH)) {
        const idx = index(col, row)
        H[idx] = P[idx] === 0 ? 0 : (S[idx] * S[idx]) / P[idx]
      }
    }
    this.#lookupTableH = H
    return this.#lookupTableH
  }

  /**
   * Implements Algorithm For Multilevel Thresholding
   * Receives desired number of color stops, returns array of said size. Could be limited to a range levelMin..levelMax
   *
   * Regardless of levelMin and levelMax values it still relies on isBetween class variances for the entire histogram
   *
   * @param amount - how many thresholds should be calculated
   * @param [levelMin=0] - histogram segment start
   * @param [levelMax=255] - histogram segment end
   * @returns {number[]}
   */
  multilevelThresholding = (
    amount: number,
    levelMin?: number,
    levelMax?: number
  ): number[] => {
    const [min = 0, max = 255] = normalizeMinMax(levelMin, levelMax)
    const levels = Math.min(max - min - 2, Math.trunc(amount))

    if (levels < 1) return []

    if (levels > 4) {
      // eslint-disable-next-line
      console.warn(
        `[Warning]: Threshold computation for more than 5 levels may take a long time`
      )
    }

    const H = this.#lookupTableH
      ? this.#lookupTableH
      : this.#generateLookupTable()
    let colorStops: number[] = []
    let maxSig: number = 0

    const iterateRecursive = (
      startingPoint: number = 0,
      prevVariance: number = 0,
      indexes: number[] = new Array(levels),
      previousDepth: number = 0
    ) => {
      const start = startingPoint + 1
      const depth = previousDepth + 1
      let variance: number = 0
      const limit = max - levels + previousDepth

      for (const i of range(start, limit)) {
        variance = prevVariance + H[index(start, i)]
        indexes[depth - 1] = i

        if (depth + 1 < levels + 1) {
          iterateRecursive(i, variance, indexes, depth)
        } else {
          variance += H[index(i + 1, max)]
          if (maxSig < variance) {
            maxSig = variance
            colorStops = indexes.slice()
          }
        }
      }
    }

    iterateRecursive(min)

    return colorStops
  }

  /**
   * Automatically finds threshold value using Algorithm For Multilevel Thresholding
   */
  autoThreshold = (levelMin?: number, levelMax?: number): null | number => {
    const value = this.multilevelThresholding(1, levelMin, levelMax)
    return value.length ? value[0] : null
  }

  /**
   * Returns dominant color in given range. Returns -1 if not a single color from the range present on the image
   */
  getDominantColor = (
    levelMin: number,
    levelMax: number,
    tolerance: number = 1
  ): number => {
    const [min, max] = normalizeMinMax(levelMin, levelMax)
    const colors = this.data!
    let dominantIndex = -1
    let dominantValue = -1

    if (min === max) return colors[min] ? min : -1

    for (const i of range(min, max + 1)) {
      let tmp = 0

      for (const j of range(Math.trunc(tolerance / -2), tolerance)) {
        tmp += range(COLOR_RANGE_END).contains(i + j) ? colors[i + j] : 0
      }

      const sumIsBigger = tmp > dominantValue
      const sumEqualButMainColorIsBigger =
        dominantValue === tmp &&
        (dominantIndex < 0 || colors[i] > colors[dominantIndex])

      if (sumIsBigger || sumEqualButMainColorIsBigger) {
        dominantIndex = i
        dominantValue = tmp
      }
    }
    debugger
    return dominantValue <= 0 ? -1 : dominantIndex
  }

  /**
   * Returns stats for histogram or its segment.
   *
   * Returned object contains median, mean and standard deviation for pixel values;
   * peak, mean and median number of pixels per level and few other values
   *
   * If no pixels colors from specified range present on the image - most values will be NaN
   */
  getStats = (
    levelMin?: number,
    levelMax?: number,
    refresh: boolean = false
  ): Stats => {
    const [min, max] = normalizeMinMax(levelMin, levelMax)

    if (!refresh && this.#cachedStats[`${min}-${max}`]) {
      return this.#cachedStats[`${min}-${max}`]
    }

    const data = this.data!
    const sortedIndexes = this.#getSortedIndexes()
    let pixelsTotal = 0
    let medianValue = null
    let allPixelValuesCombined = 0
    let uniqueValues = 0 // counter for levels that's represented by at least one pixel
    let mostPixelsPerLevel = 0

    // Finding number of pixels and mean
    data.forEach((level, i) => {
      pixelsTotal += level
      allPixelValuesCombined += level * i
      uniqueValues += level === 0 ? 0 : 1
      if (mostPixelsPerLevel < level) {
        mostPixelsPerLevel = level
      }
    })

    const meanValue = allPixelValuesCombined / pixelsTotal
    const medianPixelIndex = Math.floor(pixelsTotal / 2)
    let tmpPixelsIterated = 0
    let tmpSumOfDeviations = 0

    // Finding median and standard deviation
    for (const i of range(0, COLOR_DEPTH)) {
      let tmpPixelValue = sortedIndexes[i]
      let tmpPixels = data[tmpPixelValue]
      // eslint-disable-next-line
      if (tmpPixelValue < min || tmpPixelValue > max) continue
      tmpPixelsIterated += tmpPixels
      tmpSumOfDeviations += Math.pow(tmpPixelValue - meanValue, 2) * tmpPixels
      if (medianValue === null && tmpPixelsIterated >= medianPixelIndex) {
        medianValue = tmpPixelValue
      }
    }

    this.#cachedStats[`${min}-${max}`] = {
      // various pixel counts for levels (0..255)
      levels: {
        mean: meanValue,
        median: medianValue,
        stdDev: Math.sqrt(tmpSumOfDeviations / pixelsTotal),
        unique: uniqueValues
      },
      // what's visually represented as bars
      pixelsPerLevel: {
        mean: pixelsTotal / (max - min),
        median: pixelsTotal / uniqueValues,
        peak: mostPixelsPerLevel
      },
      pixels: pixelsTotal
    }
    return this.#cachedStats[`${min}-${max}`]
  }
}

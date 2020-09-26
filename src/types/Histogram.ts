import Jimp from "jimp"
import { between, clamp, luminance } from "../utils"
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
 * 1D Histogram
 *
 * @param {Number|Bitmap|Jimp} imageSource - Image to collect pixel data from. Or integer to create empty histogram for image of specific size
 * @param [mode] Used only for Jimp images. {@link Bitmap} currently can only store 256 values per pixel, so it's assumed that it contains values we are looking for
 * @constructor
 * @protected
 */
export class Histogram {
  static MODE_LUMINANCE = `luminance` as const
  static MODE_R = `r` as const
  static MODE_G = `g` as const
  static MODE_B = `b` as const
  data: Uint8Array | Uint16Array | Uint32Array | null = null
  pixels = 0
  #sortedIndexes: number[] | null = null
  #cachedStats: Record<string, Stats> = {}
  #lookupTableH: Float64Array | null = null

  constructor(
    imageSource: number | Bitmap | Jimp,
    mode?: "luminance" | "r" | "g" | "b"
  ) {
    if (typeof imageSource === `number`) {
      this.#createArray(imageSource)
    } else if (imageSource instanceof Bitmap) {
      this.#collectValuesBitmap(imageSource)
    } else if (Jimp && imageSource instanceof Jimp) {
      this.#collectValuesJimp(imageSource, mode)
    } else {
      throw new Error(`Unsupported image source`)
    }
  }

  /**
   * Initializes data array for an image of given pixel size
   * @param imageSize
   * @returns {Uint8Array|Uint16Array|Uint32Array}
   * @private
   */
  #createArray = (
    imageSize: number
  ): Uint8Array | Uint16Array | Uint32Array => {
    const ArrayType =
      imageSize <= Math.pow(2, 8)
        ? Uint8Array
        : imageSize <= Math.pow(2, 16)
          ? Uint16Array
          : Uint32Array

    this.pixels = imageSize
    this.data = new ArrayType(COLOR_DEPTH)
    return this.data
  }

  /**
   * Aggregates color data from {@link Jimp} instance
   * @param {Jimp} source
   * @param mode
   * @private
   */
  #collectValuesJimp = (
    source: Jimp,
    mode: "luminance" | "r" | "g" | "b" = `luminance`
  ) => {
    const pixelData = source.bitmap.data
    const data = this.#createArray(source.bitmap.width * source.bitmap.height)

    source.scan(
      0,
      0,
      source.bitmap.width,
      source.bitmap.height,
      (_, __, idx: number) => {
        data[
          mode === Histogram.MODE_R
            ? pixelData[idx]
            : mode === Histogram.MODE_G
              ? pixelData[idx + 1]
              : mode === Histogram.MODE_B
                ? pixelData[idx + 2]
                : luminance(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2])
        ]++
      }
    )
  }

  /**
   * Aggregates color data from {@link Bitmap} instance
   * @param {Bitmap} source
   * @private
   */
  #collectValuesBitmap = (source: Bitmap) => {
    let data = this.#createArray(source.size)

    for (let i = 0; i < source.data.length; i++) {
      data[source.data[i]]++
    }
  }

  /**
   * Returns array of color indexes in ascending order
   */
  #getSortedIndexes = (refresh: boolean = false): number[] => {
    if (!refresh && this.#sortedIndexes) {
      return this.#sortedIndexes
    }

    const data = this.data!
    const indexes = new Array<number>(COLOR_DEPTH)

    for (let i = 0; i < COLOR_DEPTH; i++) {
      indexes[i] = i
    }

    indexes.sort((a, b) => (data[a] > data[b] ? 1 : data[a] < data[b] ? -1 : 0))

    this.#sortedIndexes = indexes
    return indexes
  }

  /**
   * Builds lookup table H from lookup tables P and S.
   * see {@link http://www.iis.sinica.edu.tw/page/jise/2001/200109_01.pdf|this paper} for more details
   */
  #thresholdingBuildLookupTable = (): Float64Array => {
    const P = new Float64Array(COLOR_DEPTH * COLOR_DEPTH)
    const S = new Float64Array(COLOR_DEPTH * COLOR_DEPTH)
    const H = new Float64Array(COLOR_DEPTH * COLOR_DEPTH)
    const pixelsTotal = this.pixels

    // diagonal
    for (let col = 1; col < COLOR_DEPTH; ++col) {
      const idx = index(col, col)
      const tmp = this.data![col] / pixelsTotal
      P[idx] = tmp
      S[idx] = col * tmp
    }

    // calculate first row (row 0 is all zero)
    for (let col = 1; col < COLOR_DEPTH - 1; ++col) {
      const idx = index(1, col)
      const tmp = this.data![col + 1] / pixelsTotal
      P[idx + 1] = P[idx] + tmp
      S[idx + 1] = S[idx] + (col + 1) * tmp
    }

    // using row 1 to calculate others
    for (let col = 2; col < COLOR_DEPTH; col++) {
      for (let row = col + 1; row < COLOR_DEPTH; row++) {
        P[index(col, row)] = P[index(1, row)] - P[index(1, col - 1)]
        S[index(col, row)] = S[index(1, row)] - S[index(1, col - 1)]
      }
    }

    // now calculate H[col][row]
    for (let col = 1; col < COLOR_DEPTH; ++col) {
      for (let row = col + 1; row < COLOR_DEPTH; row++) {
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
   * Regardless of levelMin and levelMax values it still relies on between class variances for the entire histogram
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
    const [min, max] = normalizeMinMax(levelMin, levelMax)
    const amt = Math.min(max - min - 2, Math.trunc(amount))

    if (amt < 1) return []

    if (amt > 4) {
      // eslint-disable-next-line
      console.warn(
        `[Warning]: Threshold computation for more than 5 levels may take a long time`
      )
    }

    const H = this.#lookupTableH
      ? this.#lookupTableH
      : this.#thresholdingBuildLookupTable()
    let colorStops: number[] = []
    let maxSig: number = 0

    const iterateRecursive = (
      startingPoint: number = 0,
      prevVariance: number = 0,
      indexes: number[] = new Array(amt),
      previousDepth: number = 0
    ) => {
      const start = startingPoint + 1
      const depth = previousDepth + 1 // t
      let variance: number = 0

      for (let i = start; i < max - amt + previousDepth; i++) {
        variance = prevVariance + H[index(start, i)]
        indexes[depth - 1] = i

        if (depth + 1 < amt + 1) {
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

    iterateRecursive(min || 0)

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

    for (let i = min; i <= max; i++) {
      let tmp = 0

      for (let j = Math.trunc(tolerance / -2); j < tolerance; j++) {
        tmp += between(i + j, 0, COLOR_RANGE_END) ? colors[i + j] : 0
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
    for (let i = min; i <= max; i++) {
      pixelsTotal += data[i]
      allPixelValuesCombined += data[i] * i
      uniqueValues += data[i] === 0 ? 0 : 1
      if (mostPixelsPerLevel < data[i]) {
        mostPixelsPerLevel = data[i]
      }
    }

    const meanValue = allPixelValuesCombined / pixelsTotal
    const medianPixelIndex = Math.floor(pixelsTotal / 2)
    let tmpPixelsIterated = 0
    let tmpSumOfDeviations = 0

    // Finding median and standard deviation
    for (let i = 0; i < COLOR_DEPTH; i++) {
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

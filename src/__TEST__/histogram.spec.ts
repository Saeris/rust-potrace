import { cloneDeepWith, isNumber, isInteger } from "lodash"
import { read } from "jimp"
import { Bitmap } from "../types/Bitmap"
import { PATH_TO_LENNA, blackImage, whiteImage } from "./sources"

describe(`Histogram class (private, responsible for auto thresholding)`, () => {
  let histogram = null
  const blackHistogram = new Bitmap(
    blackImage.bitmap.width,
    blackImage.bitmap.height,
    blackImage.bitmap.data
  ).histogram
  const whiteHistogram = new Bitmap(
    whiteImage.bitmap.width,
    whiteImage.bitmap.height,
    whiteImage.bitmap.data
  ).histogram

  beforeAll(async done => {
    try {
      const {
        bitmap: { width, height, data }
      } = await read(PATH_TO_LENNA)
      histogram = new Bitmap(width, height, data).histogram
      done()
    } catch (err) {
      if (err) throw err
    }
  })

  describe(`#getDominantColor`, () => {
    it(`gives different results with different tolerance values`, () => {
      expect(histogram.getDominantColor(0, 255)).toBe(149)
      expect(histogram.getDominantColor(0, 255, 10)).toBe(143)
    })

    it(`has default argument values of 0, 255 and 1`, () => {
      expect(histogram.getDominantColor()).toBe(
        histogram.getDominantColor(0, 255, 1)
      )
    })

    it(`works for a segment of histogram`, () => {
      expect(41).toBe(histogram.getDominantColor(20, 80))
    })

    it(`does not fail when min and max values are the same`, () => {
      expect(histogram.getDominantColor(42, 42)).toBe(42)
    })

    it(`returns -1 if colors from the range are not present on image`, () => {
      expect(histogram.getDominantColor(0, 15)).toBe(-1)
      expect(histogram.getDominantColor(7, 7, 1)).toBe(-1)
    })

    it(`throws error if range start is larger than range end`, () => {
      expect(() => {
        histogram.getDominantColor(80, 20)
      }).toThrow()
    })

    it(`behaves predictably in edge cases`, () => {
      expect(blackHistogram.getDominantColor(0, 255)).toBe(0)
      expect(whiteHistogram.getDominantColor(0, 255)).toBe(255)
      expect(whiteHistogram.getDominantColor(25, 235)).toBe(-1)
      // Tolerance should not affect returned value
      expect(blackHistogram.getDominantColor(0, 255, 15)).toBe(0)
      expect(whiteHistogram.getDominantColor(0, 255, 15)).toBe(255)
    })
  })

  describe(`#getStats`, () => {
    const toFixedDeep = <T extends object>(
      stats: T,
      fractionalDigits: number
    ): T =>
      cloneDeepWith(stats, (val: number) => {
        if (isNumber(val) && !isInteger(val)) {
          return parseFloat(val.toFixed(fractionalDigits))
        }
      })

    it(`produces expected stats object for entire histogram`, () => {
      const expectedValue = {
        levels: {
          mean: 116.7673568725586,
          median: 95,
          stdDev: 49.42205692905339,
          unique: 222
        },
        pixelsPerLevel: {
          mean: 1028.0156862745098,
          median: 1180.8288288288288,
          peak: 2495
        },
        pixels: 262144
      }

      expect(toFixedDeep(histogram.getStats(), 4)).toEqual(
        toFixedDeep(expectedValue, 4)
      )
    })

    it(`produces expected stats object for histogram segment`, () => {
      const expectedValue = {
        levels: {
          mean: 121.89677761754915,
          median: 93,
          stdDev: 30.2466970087377,
          unique: 121
        },
        pixelsPerLevel: {
          mean: 1554.4916666666666,
          median: 1541.6446280991736,
          peak: 2495
        },
        pixels: 186539
      }

      expect(toFixedDeep(histogram.getStats(60, 180), 4)).toEqual(
        toFixedDeep(expectedValue, 4)
      )
    })

    it(`throws error if range start is larger than range end`, () => {
      expect(() => {
        histogram.getStats(255, 123)
      }).toThrow()
    })

    it(`behaves predictably in edge cases`, () => {
      const blackImageStats = blackHistogram.getStats()
      const whiteImageStats = blackHistogram.getStats()
      expect(blackImageStats.levels.mean).toBe(blackImageStats.levels.median)
      expect(whiteImageStats.levels.mean).toBe(whiteImageStats.levels.median)
      expect(blackHistogram.getStats(25, 235)).toEqual(
        whiteHistogram.getStats(25, 235)
      )
    })
  })

  describe(`#multilevelThresholding`, () => {
    it(`calculates correct thresholds`, () => {
      expect(histogram.multilevelThresholding(1)).toEqual([111])
      expect(histogram.multilevelThresholding(2)).toEqual([92, 154])
      expect(histogram.multilevelThresholding(3)).toEqual([73, 121, 168])
    })

    it(`works for histogram segment`, () => {
      expect(histogram.multilevelThresholding(2, 60, 180)).toEqual([103, 138])
    })

    it(`calculates as many thresholds as can be fit in given range`, () => {
      expect(histogram.multilevelThresholding(2, 102, 106)).toEqual([103, 104])
      expect(histogram.multilevelThresholding(2, 103, 106)).toEqual([104])
    })

    it(`returns empty array if no colors from histogram segment is present on the image`, () => {
      expect(histogram.multilevelThresholding(3, 2, 14)).toEqual([])
    })

    it(`throws error if range start is larger than range end`, () => {
      expect(() => {
        histogram.multilevelThresholding(2, 180, 60)
      }).toThrow()
    })
  })
})

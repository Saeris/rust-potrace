// file.skip
import { readFileSync } from "fs"
import { read } from "jimp"
import { Posterizer } from "../Posterizer"
import { RANGES_EQUAL, RANGES_AUTO, THRESHOLD_AUTO } from "../Constants"
import {
  PATH_TO_POSTERIZED_YAO_BLACK_THRESHOLD_128,
  PATH_TO_POSTERIZED_YAO_BLACK_THRESHOLD_65,
  PATH_TO_POSTERIZED_YAO_BLACK_THRESHOLD_170,
  PATH_TO_POSTERIZED_CLOUDS_WHITE_40
} from "./snapshots"
import {
  PATH_TO_YAO,
  PATH_TO_BLACK_AND_WHITE_IMAGE,
  blackImage,
  whiteImage
} from "./sources"

describe(`Posterizer class`, () => {
  let jimpInstance = null
  const sharedPosterizerInstance = new Posterizer()
  jest.setTimeout(10000)

  beforeAll(async done => {
    try {
      const img = await read(PATH_TO_YAO)
      jimpInstance = img
      done()
    } catch (err) {
      done(err)
    }
  })

  describe(`#getRanges`, () => {
    const posterizer = new Posterizer()

    const getColorStops = () =>
      posterizer.getRanges().map((item: { value: number }) => item.value)

    beforeAll(async () => {
      await posterizer.loadImage(PATH_TO_YAO)
    })

    it(`returns correctly calculated color stops with "equally spread" distribution`, () => {
      posterizer.setParameters({
        rangeDistribution: RANGES_EQUAL,
        threshold: 200,
        steps: [4],
        blackOnWhite: true
      })

      expect(getColorStops()).toEqual([200, 150, 100, 50])

      posterizer.setParameters({
        rangeDistribution: RANGES_EQUAL,
        threshold: 155,
        steps: [4],
        blackOnWhite: false
      })

      expect(getColorStops()).toEqual([155, 180, 205, 230])

      posterizer.setParameters({
        rangeDistribution: RANGES_EQUAL,
        threshold: THRESHOLD_AUTO,
        steps: [4],
        blackOnWhite: true
      })

      expect(getColorStops()).toEqual([206, 154.5, 103, 51.5])
    })

    it(`returns correctly calculated color stops with "auto" distribution`, () => {
      posterizer.setParameters({
        rangeDistribution: RANGES_AUTO,
        threshold: THRESHOLD_AUTO,
        steps: [3],
        blackOnWhite: true
      })

      expect(getColorStops()).toEqual([219, 156, 71])

      posterizer.setParameters({
        rangeDistribution: RANGES_AUTO,
        threshold: THRESHOLD_AUTO,
        steps: [3],
        blackOnWhite: false
      })

      expect(getColorStops()).toEqual([71, 156, 219])

      // Now with predefined threshold

      posterizer.setParameters({
        rangeDistribution: RANGES_AUTO,
        threshold: 128,
        steps: [4],
        blackOnWhite: true
      })

      expect(getColorStops()).toEqual([128, 97, 62, 24])

      posterizer.setParameters({
        rangeDistribution: RANGES_AUTO,
        threshold: 128,
        steps: [4],
        blackOnWhite: false
      })

      expect(getColorStops()).toEqual([128, 166, 203, 237])
    })

    it(`correctly handles predefined array of color stops`, () => {
      posterizer.setParameters({
        steps: [20, 60, 80, 160],
        threshold: 120,
        blackOnWhite: true
      })

      expect(getColorStops()).toEqual([160, 80, 60, 20])

      posterizer.setParameters({
        steps: [20, 60, 80, 160],
        threshold: 180,
        blackOnWhite: true
      })

      expect(getColorStops()).toEqual([180, 160, 80, 60, 20])

      posterizer.setParameters({
        steps: [20, 60, 80, 160],
        threshold: 180,
        blackOnWhite: false
      })

      expect(getColorStops()).toEqual([20, 60, 80, 160, 180])

      posterizer.setParameters({
        steps: [212, 16, 26, 50, 212, 128, 211],
        threshold: 180,
        blackOnWhite: false
      })

      try {
        expect(getColorStops()).toEqual([16, 26, 50, 128, 211, 212])
      } catch {
        throw new Error(`Duplicated items should be present only once`)
      }

      posterizer.setParameters({
        steps: [15, 42, 200, 460, 0, -10],
        threshold: 180,
        blackOnWhite: false
      })

      try {
        expect(getColorStops()).toEqual([0, 15, 42, 200])
      } catch {
        throw new Error(`Values out of range should be ignored`)
      }
    })
  })

  describe(`#loadImage`, () => {
    it(`instance is being passed as promise return value`, () => {
      expect(sharedPosterizerInstance).toBeInstanceOf(Posterizer)
    })
  })

  describe(`#getSVG`, () => {
    const instanceYao = sharedPosterizerInstance

    it(`produces expected results with different thresholds`, () => {
      try {
        instanceYao.setParameters({ threshold: 128 })
        const expected = readFileSync(
          PATH_TO_POSTERIZED_YAO_BLACK_THRESHOLD_128,
          {
            encoding: `utf8`
          }
        )
        expect(instanceYao.getSVG()).toBe(expected)
      } catch {
        throw new Error(
          `Image with threshold 128 does not match with reference copy`
        )
      }

      try {
        instanceYao.setParameters({ threshold: 65 })
        const expected = readFileSync(
          PATH_TO_POSTERIZED_YAO_BLACK_THRESHOLD_65,
          {
            encoding: `utf8`
          }
        )
        expect(instanceYao.getSVG()).toBe(expected)
      } catch {
        throw new Error(
          `Image with threshold 65 does not match with reference copy`
        )
      }

      try {
        instanceYao.setParameters({ threshold: 170 })
        const expected = readFileSync(
          PATH_TO_POSTERIZED_YAO_BLACK_THRESHOLD_170,
          {
            encoding: `utf8`
          }
        )
        expect(instanceYao.getSVG()).toBe(expected)
      } catch {
        throw new Error(
          `Image with threshold 170 does not match with reference copy`
        )
      }
    })

    it(`produces expected white on black image with threshold 170`, async () => {
      const instance = new Posterizer({
        threshold: 40,
        blackOnWhite: false,
        steps: [3],
        color: `beige`,
        background: `#222`
      })

      await instance.loadImage(PATH_TO_BLACK_AND_WHITE_IMAGE)
      const expected = readFileSync(PATH_TO_POSTERIZED_CLOUDS_WHITE_40, {
        encoding: `utf8`
      })
      const actual = instance.getSVG()
      expect(actual).toBe(expected)
    })
  })

  describe(`#getSymbol`, () => {
    let instanceYao = new Posterizer()

    beforeAll(async done => {
      await instanceYao.loadImage(jimpInstance)
      done()
    })

    it(`should not have fill color or background`, () => {
      instanceYao.setParameters({
        color: `red`,
        background: `cyan`,
        steps: [3]
      })
      const symbol = instanceYao.getSymbol(`whatever`)
      expect(symbol).not.toMatch(/<rect/i)
      expect(symbol).toMatch(/<path[^>]+(?:fill="\s*"|fill='\s*'|)[^>]*>/i)
    })
  })

  describe(`edge cases`, () => {
    const instance = new Posterizer()

    it(`does not break on images filled with one color`, async () => {
      await instance.loadImage(blackImage)
      // black image should give us one black layer...
      instance.setParameters({ blackOnWhite: true, threshold: 128 })
      expect(instance.getSVG()).toMatch(/<path fill-opacity="1\.000"/)
      instance.setParameters({ blackOnWhite: false })
      expect(instance.getSVG()).not.toMatch(/<path/)
      await instance.loadImage(whiteImage)
      instance.setParameters({ blackOnWhite: true })
      expect(instance.getSVG()).not.toMatch(/<path/)
      // white image should give us one layer...
      instance.setParameters({ blackOnWhite: false })
      expect(instance.getSVG()).toMatch(/<path fill-opacity="1\.000"/)
    })

    it(`does not break when no thresholds can be found`, async () => {
      await instance.loadImage(whiteImage)
      instance.setParameters({ blackOnWhite: true })
      let svg1 = instance.getSVG()
      instance.setParameters({ blackOnWhite: true, steps: [3], threshold: 128 })
      let svg2 = instance.getSVG()
      instance.setParameters({
        blackOnWhite: true,
        steps: [],
        threshold: 128
      })
      const svg3 = instance.getSVG()
      instance.setParameters({
        blackOnWhite: true,
        steps: [0, 55, 128, 169, 210],
        threshold: 250
      })
      const svg4 = instance.getSVG()
      expect(svg1).toBe(svg2)
      expect(svg1).toBe(svg3)
      expect(svg1).toBe(svg4)
      expect(svg1).not.toMatch(/<path/)
      await instance.loadImage(blackImage)
      instance.setParameters({ blackOnWhite: false, threshold: 255 })
      svg1 = instance.getSVG()
      instance.setParameters({ blackOnWhite: false, threshold: 0 })
      svg2 = instance.getSVG()
      expect(svg1).toBe(svg2)
      expect(svg1).not.toMatch(/<path/)
    })
  })
})

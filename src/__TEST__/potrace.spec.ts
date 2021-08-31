// file.skip
import { readFileSync } from "fs"
import { read } from "jimp"
import { Potrace } from "../Potrace"
import {
  PATH_TO_POTRACE_BW_THRESHOLD_128,
  PATH_TO_POTRACE_BW_THRESHOLD_65,
  PATH_TO_POTRACE_BW_THRESHOLD_170,
  PATH_TO_POTRACE_WB_THRESHOLD_128,
  PATH_TO_POTRACE_BW_BLACK_THRESHOLD_0,
  PATH_TO_POTRACE_BW_BLACK_THRESHOLD_255,
  PATH_TO_POTRACE_BW_WHITE_THRESHOLD_0,
  PATH_TO_POTRACE_BW_WHITE_THRESHOLD_255,
  PATH_TO_POTRACE_WB_WHITE_THRESHOLD_0,
  PATH_TO_POTRACE_WB_WHITE_THRESHOLD_255,
  PATH_TO_POTRACE_WB_BLACK_THRESHOLD_0,
  PATH_TO_POTRACE_WB_BLACK_THRESHOLD_255
} from "./snapshots"
import {
  PATH_TO_BLACK_AND_WHITE_IMAGE,
  PATH_TO_LENNA,
  PATH_TO_YAO,
  blackImage,
  whiteImage
} from "./sources"

describe(`Potrace class`, () => {
  let jimpInstance = null
  jest.setTimeout(10000)

  beforeAll(async () => {
    jimpInstance = await read(PATH_TO_YAO)
  })

  describe(`#loadImage`, () => {
    it(`instance is being passed to callback function as context`, async () => {
      const instance = new Potrace()
      const image = await instance.loadImage(PATH_TO_YAO)
      expect(image).toBeInstanceOf(Potrace)
      expect(image).toBe(instance)
    })

    it(`supports Jimp instances provided as source image`, async () => {
      const instance = new Potrace()
      await instance.loadImage(jimpInstance)
    })

    it(`should throw error if called before previous image was loaded`, () => {
      const potraceInstance = new Potrace()
      try {
        potraceInstance.loadImage(PATH_TO_LENNA)
      } catch (err) {
        expect(err).toBe(/another.*instead/i)
      }
      try {
        potraceInstance.loadImage(PATH_TO_YAO)
      } catch (err) {
        expect(err).toBeUndefined()
      }
    })
  })

  describe(`#processPath`, () => {
    const instance = new Potrace()
    let processingSpy = jest.spyOn(instance, `getPathTag`)

    it(`should not execute until path is requested for the first time`, async () => {
      const img = await instance.loadImage(jimpInstance)
      expect(processingSpy).toHaveBeenCalledTimes(0)
      img.getSVG()
      expect(processingSpy).toHaveBeenCalledTimes(1)
    })

    it(`should not execute on repetitive SVG/Symbol export`, async () => {
      const img = await instance.loadImage(jimpInstance)
      const initialCallCount = processingSpy.mock.calls.length
      img.getSVG()
      img.getSVG()
      img.getPathTag()
      img.getPathTag(`red`)
      img.getSymbol(`symbol-id`)
      expect(processingSpy).toHaveBeenCalledTimes(initialCallCount)
    })

    it(`should not execute after change of foreground/background colors`, async () => {
      const img = await instance.loadImage(jimpInstance)
      const initialCallCount = processingSpy.mock.calls.length
      img.setParameters({ color: `red` })
      img.getSVG()
      img.setParameters({ background: `crimson` })
      img.getSVG()
      expect(processingSpy).toHaveBeenCalledTimes(initialCallCount)
    })
  })

  describe(`#getSVG`, () => {
    const instanceYao = new Potrace()

    beforeAll(async done => {
      await instanceYao.loadImage(jimpInstance)
      done()
    })

    it(`produces expected results with different thresholds`, () => {
      try {
        const expected = readFileSync(PATH_TO_POTRACE_BW_THRESHOLD_128, {
          encoding: `utf8`
        })
        instanceYao.setParameters({ threshold: 128 })
        expect(instanceYao.getSVG()).toBe(expected)
      } catch {
        throw new Error(
          `Image with threshold 128 does not match with reference copy`
        )
      }

      try {
        const expected = readFileSync(PATH_TO_POTRACE_BW_THRESHOLD_65, {
          encoding: `utf8`
        })
        instanceYao.setParameters({ threshold: 65 })
        expect(instanceYao.getSVG()).toBe(expected)
      } catch {
        throw new Error(
          `Image with threshold 65 does not match with reference copy`
        )
      }

      try {
        const expected = readFileSync(PATH_TO_POTRACE_BW_THRESHOLD_170, {
          encoding: `utf8`
        })
        instanceYao.setParameters({ threshold: 170 })
        expect(instanceYao.getSVG()).toBe(expected)
      } catch {
        throw new Error(
          `Image with threshold 170 does not match with reference copy`
        )
      }
    })

    it(`produces expected white on black image with threshold 170`, async () => {
      const instance = new Potrace({
        threshold: 128,
        blackOnWhite: false,
        color: `cyan`,
        background: `darkred`
      })

      await instance.loadImage(PATH_TO_BLACK_AND_WHITE_IMAGE)
      const expected = readFileSync(PATH_TO_POTRACE_WB_THRESHOLD_128, {
        encoding: `utf8`
      })
      const actual = instance.getSVG()
      expect(actual).toBe(expected)
    })
  })

  describe(`#getSymbol`, () => {
    const instanceYao = new Potrace()

    beforeAll(async () => {
      await instanceYao.loadImage(jimpInstance)
    })

    it(`should not have fill color or background`, () => {
      instanceYao.setParameters({
        color: `red`,
        background: `cyan`
      })
      const symbol = instanceYao.getSymbol(`whatever`)
      expect(symbol).not.toMatch(/<rect/i)
      expect(symbol).toMatch(/<path[^>]+(?:fill="\s*"|fill='\s*'|)[^>]*>/i)
    })
  })

  describe(`behaves predictably in edge cases`, () => {
    const instance = new Potrace()
    let bwBlackThreshold0: ReturnType<typeof readFileSync>
    let bwBlackThreshold255: ReturnType<typeof readFileSync>
    let bwWhiteThreshold0: ReturnType<typeof readFileSync>
    let bwWhiteThreshold255: ReturnType<typeof readFileSync>
    let wbWhiteThreshold0: ReturnType<typeof readFileSync>
    let wbWhiteThreshold255: ReturnType<typeof readFileSync>
    let wbBlackThreshold0: ReturnType<typeof readFileSync>
    let wbBlackThreshold255: ReturnType<typeof readFileSync>

    beforeAll(() => {
      bwBlackThreshold0 = readFileSync(PATH_TO_POTRACE_BW_BLACK_THRESHOLD_0, {
        encoding: `utf8`
      })
      bwBlackThreshold255 = readFileSync(
        PATH_TO_POTRACE_BW_BLACK_THRESHOLD_255,
        { encoding: `utf8` }
      )
      bwWhiteThreshold0 = readFileSync(PATH_TO_POTRACE_BW_WHITE_THRESHOLD_0, {
        encoding: `utf8`
      })
      bwWhiteThreshold255 = readFileSync(
        PATH_TO_POTRACE_BW_WHITE_THRESHOLD_255,
        { encoding: `utf8` }
      )
      wbWhiteThreshold0 = readFileSync(PATH_TO_POTRACE_WB_WHITE_THRESHOLD_0, {
        encoding: `utf8`
      })
      wbWhiteThreshold255 = readFileSync(
        PATH_TO_POTRACE_WB_WHITE_THRESHOLD_255,
        { encoding: `utf8` }
      )
      wbBlackThreshold0 = readFileSync(PATH_TO_POTRACE_WB_BLACK_THRESHOLD_0, {
        encoding: `utf8`
      })
      wbBlackThreshold255 = readFileSync(
        PATH_TO_POTRACE_WB_BLACK_THRESHOLD_255,
        { encoding: `utf8` }
      )
    })

    it(`compares colors against threshold in the same way as original tool`, async () => {
      await instance.loadImage(blackImage)
      instance.setParameters({ blackOnWhite: true, threshold: 0 })
      expect(instance.getSVG()).toBe(bwBlackThreshold0)
      instance.setParameters({ blackOnWhite: true, threshold: 255 })
      expect(instance.getSVG()).toBe(bwBlackThreshold255)
      await instance.loadImage(whiteImage)
      instance.setParameters({ blackOnWhite: true, threshold: 0 })
      expect(instance.getSVG()).toBe(bwWhiteThreshold0)
      instance.setParameters({ blackOnWhite: true, threshold: 255 })
      expect(instance.getSVG()).toBe(bwWhiteThreshold255)
    })

    it(`acts in the same way when colors are inverted`, async () => {
      await instance.loadImage(whiteImage)
      instance.setParameters({ blackOnWhite: false, threshold: 255 })
      expect(instance.getSVG()).toBe(wbWhiteThreshold255)
      instance.setParameters({ blackOnWhite: false, threshold: 0 })
      expect(instance.getSVG()).toBe(wbWhiteThreshold0)
      await instance.loadImage(blackImage)
      instance.setParameters({ blackOnWhite: false, threshold: 255 })
      expect(instance.getSVG()).toBe(wbBlackThreshold255)
      instance.setParameters({ blackOnWhite: false, threshold: 0 })
      expect(instance.getSVG()).toBe(wbBlackThreshold0)
    })
  })
})

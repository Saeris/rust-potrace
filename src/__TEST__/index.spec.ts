import { readFileSync } from "fs"
import { read } from "jimp"
import { trace, posterize, Potrace, Posterizer } from "../"
import {
  PATH_TO_OUTPUT,
  PATH_TO_OUTPUT_POSTERIZED,
  PATH_TO_POTRACE_BW_THRESHOLD_170,
  PATH_TO_POSTERIZED_BW_THRESHOLD_170
} from "./snapshots"
import { PATH_TO_YAO } from "./sources"

describe(`Shorthand methods`, () => {
  let jimpInstance = null

  beforeAll(async done => {
    try {
      jimpInstance = await read(PATH_TO_YAO)
      done()
    } catch (err) {
      done(err)
    }
  })

  describe(`#trace`, () => {
    let instance: Potrace = null

    it(`works with one argument`, async done => {
      const expected = readFileSync(PATH_TO_OUTPUT, {
        encoding: `utf8`
      })
      try {
        const svgContents = await trace(jimpInstance)
        expect(svgContents).toEqual(expected)
        done()
      } catch (err) {
        done(err)
      }
    })

    it(`works with a callback as the second argument`, async done => {
      const expected = readFileSync(PATH_TO_OUTPUT, {
        encoding: `utf8`
      })
      await trace(jimpInstance, (err, svgContents, inst) => {
        if (err) throw err
        instance = inst
        expect(svgContents).toEqual(expected)
        done()
      })
    })

    it(`works with an options object as the second argument`, async done => {
      const expected = readFileSync(PATH_TO_POTRACE_BW_THRESHOLD_170, {
        encoding: `utf8`
      })
      try {
        const svgContents = await trace(jimpInstance, { threshold: 170 })
        expect(svgContents).toEqual(expected)
        done()
      } catch (err) {
        done(err)
      }
    })

    it(`works with three arguments`, async done => {
      const expected = readFileSync(PATH_TO_POTRACE_BW_THRESHOLD_170, {
        encoding: `utf8`
      })
      await trace(jimpInstance, { threshold: 170 }, (err, svgContents) => {
        if (err) throw err
        expect(svgContents).toEqual(expected)
        done()
      })
    })

    it(`returns Potrace instance as third argument`, () => {
      expect(instance).toBeInstanceOf(Potrace)
    })
  })

  describe(`#posterize`, () => {
    let instance: Posterizer = null

    it(`works with one argument`, async done => {
      const expected = readFileSync(PATH_TO_OUTPUT_POSTERIZED, {
        encoding: `utf8`
      })
      try {
        const svgContents = await posterize(jimpInstance)
        expect(svgContents).toEqual(expected)
        done()
      } catch (err) {
        done(err)
      }
    })

    it(`works with a callback as the second argument`, async done => {
      const expected = readFileSync(PATH_TO_OUTPUT_POSTERIZED, {
        encoding: `utf8`
      })
      await posterize(jimpInstance, (err, svgContents, inst) => {
        if (err) throw err
        instance = inst
        expect(svgContents).toEqual(expected)
        done()
      })
    })

    it(`works with an options object as the second argument`, async done => {
      const expected = readFileSync(PATH_TO_POSTERIZED_BW_THRESHOLD_170, {
        encoding: `utf8`
      })
      try {
        const svgContents = await posterize(jimpInstance, { threshold: 170 })
        expect(svgContents).toEqual(expected)
        done()
      } catch (err) {
        done(err)
      }
    })

    it(`works with three arguments`, async done => {
      const expected = readFileSync(PATH_TO_POSTERIZED_BW_THRESHOLD_170, {
        encoding: `utf8`
      })
      await posterize(jimpInstance, { threshold: 170 }, (err, svgContents) => {
        if (err) throw err
        expect(svgContents).toEqual(expected)
        done()
      })
    })

    it(`returns Posterizer instance as third argument`, () => {
      expect(instance).toBeInstanceOf(Posterizer)
    })
  })
})

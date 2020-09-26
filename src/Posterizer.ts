import Jimp from "jimp/*"
import { Potrace, PotraceOptions } from "./Potrace"
import {
  COLOR_TRANSPARENT,
  THRESHOLD_AUTO,
  STEPS_AUTO,
  FILL_SPREAD,
  FILL_DOMINANT,
  FILL_MEDIAN,
  FILL_MEAN,
  RANGES_AUTO
} from "./Constants"
import { between, clamp, isNumber, setHtmlAttribute } from "./utils"
import { Histogram } from "./types/Histogram"

/**
 * Posterizer options
 *
 * @typedef {Potrace~Options} Posterizer~Options
 * @property {Number} [steps]   - Number of samples that needs to be taken (and number of layers in SVG). (default: STEPS_AUTO, which most likely will result in 3, sometimes 4)
 * @property {*} [fillStrategy] - How to select fill color for color ranges - equally spread or dominant. (default: Posterizer.FILL_DOMINANT)
 * @property {*} [rangeDistribution] - How to choose thresholds in-between - after equal intervals or automatically balanced. (default: Posterizer.RANGES_AUTO)
 */
export interface PosterizerOptions extends PotraceOptions {
  steps?: typeof STEPS_AUTO | number | number[]
  fillStrategy?: typeof FILL_DOMINANT | string
  rangeDistribution?: typeof RANGES_AUTO | string
}

interface ColorStop {
  value: number
  colorIntensity: number
}

/**
 * Takes multiple samples using {@link Potrace} with different threshold
 * settings and combines output into a single file.
 */
export class Posterizer {
  #potrace = new Potrace()
  #calculatedThreshold: number | null = null
  #params: Required<
    Omit<
      PosterizerOptions,
      | "turnPolicy"
      | "turdSize"
      | "alphaMax"
      | "optCurve"
      | "optTolerance"
      | "color"
    >
  > = {
    threshold: THRESHOLD_AUTO,
    blackOnWhite: true,
    background: COLOR_TRANSPARENT,
    steps: STEPS_AUTO,
    fillStrategy: FILL_DOMINANT,
    rangeDistribution: RANGES_AUTO
  }

  constructor(options?: PosterizerOptions) {
    if (options) {
      this.setParameters(options)
    }
  }

  /**
   * Sets parameters. Accepts same object as {Potrace}
   */
  setParameters = (params: PosterizerOptions) => {
    if (!params) return
    if (
      params.steps &&
      !Array.isArray(params.steps) &&
      (!isNumber(params.steps) || !between(params.steps, 1, 255))
    ) {
      throw new Error(`Bad 'steps' value`)
    }
    Object.assign(this.#params, params)
    this.#potrace.setParameters(params)
    this.#calculatedThreshold = null
  }

  /**
   * Fine tuning to color ranges.
   *
   * If last range (featuring most saturated color) is larger than 10% of color space (25 units)
   * then we want to add another color stop, that hopefully will include darkest pixels, improving presence of
   * shadows and line art
   */
  #addExtraColorStop = (ranges: ColorStop[]) => {
    let blackOnWhite = this.#params.blackOnWhite
    let lastColorStop = ranges[ranges.length - 1]
    let lastRangeFrom = blackOnWhite ? 0 : lastColorStop.value
    let lastRangeTo = blackOnWhite ? lastColorStop.value : 255

    if (
      lastRangeTo - lastRangeFrom > 25 &&
      lastColorStop.colorIntensity !== 1
    ) {
      let histogram = this.#getImageHistogram()
      let levels = histogram.getStats(lastRangeFrom, lastRangeTo).levels

      let newColorStop =
        levels.mean + levels.stdDev <= 25
          ? levels.mean + levels.stdDev
          : levels.mean - levels.stdDev <= 25
          ? levels.mean - levels.stdDev
          : 25

      let newStats = blackOnWhite
        ? histogram.getStats(0, newColorStop)
        : histogram.getStats(newColorStop, 255)
      let color = newStats.levels.mean

      ranges.push({
        value: Math.abs((blackOnWhite ? 0 : 255) - newColorStop),
        colorIntensity: isNaN(color)
          ? 0
          : (blackOnWhite ? 255 - color : color) / 255
      })
    }

    return ranges
  }

  /**
   * Calculates color intensity for each element of numeric array
   */
  #calcColorIntensity = (colorStops: number[]): ColorStop[] => {
    let blackOnWhite = this.#params.blackOnWhite
    let colorSelectionStrat = this.#params.fillStrategy
    let histogram =
      colorSelectionStrat === FILL_SPREAD ? null : this.#getImageHistogram()
    let fullRange = Math.abs(this.#paramThreshold() - (blackOnWhite ? 0 : 255))

    return colorStops.map((threshold, index) => {
      let nextValue =
        index + 1 === colorStops.length
          ? blackOnWhite
            ? -1
            : 256
          : colorStops[index + 1]
      let rangeStart = Math.round(blackOnWhite ? nextValue + 1 : threshold)
      let rangeEnd = Math.round(blackOnWhite ? threshold : nextValue - 1)
      let factor = index / (colorStops.length - 1)
      let intervalSize = rangeEnd - rangeStart
      let stats = histogram?.getStats(rangeStart, rangeEnd)
      let color = -1

      if (stats?.pixels === 0) {
        return {
          value: threshold,
          colorIntensity: 0
        }
      }

      switch (colorSelectionStrat) {
        case FILL_SPREAD:
          // We want it to be 0 (255 when white on black) at the most saturated end, so...
          color =
            (blackOnWhite ? rangeStart : rangeEnd) +
            (blackOnWhite ? 1 : -1) *
              intervalSize *
              Math.max(0.5, fullRange / 255) *
              factor
          break
        case FILL_DOMINANT:
          color = histogram!.getDominantColor(
            rangeStart,
            rangeEnd,
            clamp(intervalSize, 1, 5)
          )
          break
        case FILL_MEAN:
          color = stats!.levels.mean
          break
        case FILL_MEDIAN:
          color = stats!.levels.median
          break
        default:
          break
      }

      // We don't want colors to be too close to each other, so we introduce some spacing in between
      if (index !== 0) {
        color = blackOnWhite
          ? clamp(color, rangeStart, rangeEnd - Math.round(intervalSize * 0.1))
          : clamp(color, rangeStart + Math.round(intervalSize * 0.1), rangeEnd)
      }

      return {
        value: threshold,
        colorIntensity:
          color === -1 ? 0 : (blackOnWhite ? 255 - color : color) / 255
      }
    })
  }

  #getImageHistogram = (): Histogram => this.#potrace.luminanceData!.histogram()

  /**
   * Processes threshold, steps and rangeDistribution parameters and returns normalized array of color stops
   */
  getRanges = () => {
    const steps = this.#paramSteps()

    if (!Array.isArray(steps)) {
      return this.#params.rangeDistribution === RANGES_AUTO
        ? this.#getRangesAuto()
        : this.#getRangesEquallyDistributed()
    }

    // Steps is array of thresholds and we want to preprocess it

    let colorStops: number[] = []
    const threshold = this.#paramThreshold()
    const lookingForDarkPixels = this.#params.blackOnWhite

    steps.forEach(item => {
      if (colorStops.indexOf(item) === -1 && between(item, 0, 255)) {
        colorStops.push(item)
      }
    })

    if (!colorStops.length) {
      colorStops.push(threshold)
    }

    colorStops = colorStops.sort((a, b) =>
      a < b === lookingForDarkPixels ? 1 : -1
    )

    if (lookingForDarkPixels && colorStops[0] < threshold) {
      colorStops.unshift(threshold)
    } else if (
      !lookingForDarkPixels &&
      colorStops[colorStops.length - 1] < threshold
    ) {
      colorStops.push(threshold)
    }

    return this.#calcColorIntensity(colorStops)
  }

  /**
   * Calculates given (or lower) number of thresholds using automatic thresholding algorithm
   */
  #getRangesAuto = (): ColorStop[] => {
    const histogram = this.#getImageHistogram()
    const steps = this.#paramSteps(true)
    const { blackOnWhite } = this.#params
    let colorStops: number[]

    if (this.#params.threshold === THRESHOLD_AUTO) {
      colorStops = histogram.multilevelThresholding(steps)
    } else {
      const threshold = this.#paramThreshold()

      colorStops = blackOnWhite
        ? histogram.multilevelThresholding(steps - 1, 0, threshold)
        : histogram.multilevelThresholding(steps - 1, threshold, 255)

      if (blackOnWhite) {
        colorStops.push(threshold)
      } else {
        colorStops.unshift(threshold)
      }
    }

    if (blackOnWhite) {
      colorStops = colorStops.reverse()
    }

    return this.#calcColorIntensity(colorStops)
  }

  /**
   * Calculates color stops and color representing each segment, returning them
   * from least to most intense color (black or white, depending on blackOnWhite parameter)
   */
  #getRangesEquallyDistributed = () => {
    const blackOnWhite = this.#params.blackOnWhite
    const colorsToThreshold = blackOnWhite
      ? this.#paramThreshold()
      : 255 - this.#paramThreshold()
    const steps = this.#paramSteps()
    const stepSize = colorsToThreshold / steps
    const colorStops = []
    let i = steps - 1

    while (i >= 0) {
      let threshold = Math.min(colorsToThreshold, (i + 1) * stepSize)
      threshold = blackOnWhite ? threshold : 255 - threshold
      i--
      colorStops.push(threshold)
    }

    return this.#calcColorIntensity(colorStops)
  }

  /**
   * Returns valid steps value
   */
  #paramSteps = (count: boolean = false): number => {
    const { blackOnWhite, steps, threshold } = this.#params

    if (Array.isArray(steps) && count) {
      return steps.length
    }

    if (steps === STEPS_AUTO && threshold === THRESHOLD_AUTO) {
      return 4
    }

    const colorsCount = blackOnWhite
      ? this.#paramThreshold()
      : 255 - this.#paramThreshold()

    return steps === STEPS_AUTO
      ? colorsCount > 200
        ? 4
        : 3
      : Math.min(colorsCount, Math.max(2, steps as number))
  }

  /**
   * Returns valid threshold value
   */
  #paramThreshold = (): number => {
    if (this.#calculatedThreshold !== null) {
      return this.#calculatedThreshold
    }

    if (this.#params.threshold !== THRESHOLD_AUTO) {
      this.#calculatedThreshold = this.#params.threshold
      return this.#calculatedThreshold
    }

    const twoThresholds = this.#getImageHistogram().multilevelThresholding(2)
    this.#calculatedThreshold = this.#params.blackOnWhite
      ? twoThresholds[1]
      : twoThresholds[0]
    this.#calculatedThreshold = this.#calculatedThreshold || 128

    return this.#calculatedThreshold
  }

  /**
   * Running potrace on the image multiple times with different thresholds and returns an array
   * of path tags
   */
  #pathTags = (noFillColor: boolean): string[] => {
    let ranges = this.getRanges()
    const potrace = this.#potrace
    const blackOnWhite = this.#params.blackOnWhite

    if (ranges.length >= 10) {
      ranges = this.#addExtraColorStop(ranges)
    }

    potrace.setParameters({ blackOnWhite })

    let actualPrevLayersOpacity = 0

    return ranges.map(colorStop => {
      let thisLayerOpacity = colorStop.colorIntensity

      if (thisLayerOpacity === 0) return ``

      // NOTE: With big number of layers (something like 70) there will be noticeable math error on rendering side.
      // In Chromium at least image will end up looking brighter overall compared to the same layers painted in solid colors.
      // However it works fine with sane number of layers, and it's not like we can do much about it.

      let calculatedOpacity =
        !actualPrevLayersOpacity || thisLayerOpacity === 1
          ? thisLayerOpacity
          : (actualPrevLayersOpacity - thisLayerOpacity) /
            (actualPrevLayersOpacity - 1)

      calculatedOpacity = clamp(parseFloat(calculatedOpacity.toFixed(3)), 0, 1)
      actualPrevLayersOpacity +=
        (1 - actualPrevLayersOpacity) * calculatedOpacity

      potrace.setParameters({ threshold: colorStop.value })

      let element = noFillColor ? potrace.getPathTag(``) : potrace.getPathTag()
      element = setHtmlAttribute(
        element,
        `fill-opacity`,
        calculatedOpacity.toFixed(3)
      )

      const canBeIgnored =
        calculatedOpacity === 0 || element.indexOf(` d=""`) !== -1

      return canBeIgnored ? `` : element
    })
  }

  /**
   * Loads image.
   */
  loadImage = async (target: string | Buffer | Jimp): Promise<Posterizer> => {
    await this.#potrace.loadImage(target)
    this.#calculatedThreshold = null
    return this
  }

  /**
   * Returns image as <symbol> tag. Always has viewBox specified
   */
  getSymbol = (id: string): string => {
    const width = this.#potrace.luminanceData!.width
    const height = this.#potrace.luminanceData!.height
    const paths = this.#pathTags(true)
    return `<symbol viewBox="0 0 ${width} ${height}" id="${id}">${paths.join(
      ``
    )}</symbol>`
  }

  /**
   * Generates SVG image
   */
  getSVG = (): string => {
    const width = this.#potrace.luminanceData!.width
    const height = this.#potrace.luminanceData!.height
    const tags = this.#pathTags(false)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1">${this.getBG()}${tags}</svg>`
  }

  getBG = (): string =>
    this.#params.background === COLOR_TRANSPARENT
      ? ``
      : `<rect x="0" y="0" width="100%" height="100%" fill="${
          this.#params.background
        }" />`
}

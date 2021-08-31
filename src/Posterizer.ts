import Jimp from "jimp"
import {
  COLOR_TRANSPARENT,
  THRESHOLD_AUTO,
  STEPS_AUTO,
  FILL_STRATEGIES,
  RANGES_AUTO
} from "./Constants"
import { range, clamp, setHtmlAttribute } from "./utils"
import { PotraceImage, PotraceOptions } from "./PotraceImage"

/**
 * Posterizer options
 *
 * @typedef {Potrace~Options} Posterizer~Options
 * @property {Number} [steps]   - Number of samples that needs to be taken (and number of layers in SVG). (default: STEPS_AUTO, which most likely will result in 3, sometimes 4)
 * @property {*} [fillStrategy] - How to select fill color for color ranges - equally spread or dominant. (default: Posterizer.FILL_DOMINANT)
 * @property {*} [rangeDistribution] - How to choose thresholds in-isBetween - after equal intervals or automatically balanced. (default: Posterizer.RANGES_AUTO)
 */
export interface PosterizerOptions extends PotraceOptions {
  steps?: number[]
  fillStrategy?: typeof FILL_STRATEGIES[keyof typeof FILL_STRATEGIES]
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
export class Posterizer extends PotraceImage {
  #calculatedThreshold: number | null = null
  threshold = THRESHOLD_AUTO
  blackOnWhite = true
  background = COLOR_TRANSPARENT
  steps: number[] = [STEPS_AUTO]
  rangeDistribution: string = RANGES_AUTO
  fillStrategy: typeof FILL_STRATEGIES[keyof typeof FILL_STRATEGIES] =
    FILL_STRATEGIES.DOMINANT

  constructor(options?: PosterizerOptions) {
    super(options)
  }

  /**
   * Sets parameters. Accepts same object as {Potrace}
   */
  setParameters = (options: PosterizerOptions) => {
    super.setParameters(options)
    this.#calculatedThreshold = null
  }

  /**
   * Loads image.
   */
  loadImage = async (target: string | Buffer | Jimp): Promise<this> => {
    await super.loadImage(target)
    this.#calculatedThreshold = null
    return this
  }

  /**
   * Fine tuning to color ranges.
   *
   * If last range (featuring most saturated color) is larger than 10% of color space (25 units)
   * then we want to add another color stop, that hopefully will include darkest pixels, improving presence of
   * shadows and line art
   */
  #addExtraColorStop = (ranges: ColorStop[]) => {
    let blackOnWhite = this.blackOnWhite
    let lastColorStop = ranges[ranges.length - 1]
    let lastRangeFrom = blackOnWhite ? 0 : lastColorStop.value
    let lastRangeTo = blackOnWhite ? lastColorStop.value : 255

    if (
      lastRangeTo - lastRangeFrom > 25 &&
      lastColorStop.colorIntensity !== 1
    ) {
      let histogram = this.bitmap!.histogram
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
    let blackOnWhite = this.blackOnWhite
    let colorSelectionStrat = this.fillStrategy
    let histogram =
      colorSelectionStrat === FILL_STRATEGIES.SPREAD
        ? null
        : this.bitmap!.histogram
    let fullRange = Math.abs(this.#getThreshold() - (blackOnWhite ? 0 : 255))

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
        case FILL_STRATEGIES.SPREAD:
          // We want it to be 0 (255 when white on black) at the most saturated end, so...
          color =
            (blackOnWhite ? rangeStart : rangeEnd) +
            (blackOnWhite ? 1 : -1) *
              intervalSize *
              Math.max(0.5, fullRange / 255) *
              factor
          break
        case FILL_STRATEGIES.DOMINANT:
          color = histogram!.getDominantColor(
            rangeStart,
            rangeEnd,
            clamp(intervalSize, 1, 5)
          )
          break
        case FILL_STRATEGIES.MEAN:
          color = stats!.levels.mean
          break
        case FILL_STRATEGIES.MEDIAN:
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

  /**
   * Processes threshold, steps and rangeDistribution parameters and returns normalized array of color stops
   */
  getRanges = () => {
    const steps = this.#getSteps()

    if (!Array.isArray(steps)) {
      return this.rangeDistribution === RANGES_AUTO
        ? this.#getRangesAuto()
        : this.#getRangesEquallyDistributed()
    }

    // Steps is array of thresholds and we want to preprocess it

    let colorStops: number[] = []
    const threshold = this.#getThreshold()
    const lookingForDarkPixels = this.blackOnWhite

    steps.forEach(item => {
      if (colorStops.indexOf(item) === -1 && range(255).contains(item)) {
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
    const histogram = this.bitmap!.histogram
    const steps = this.#getSteps(true)
    const { blackOnWhite } = this
    let colorStops: number[]

    if (this.threshold === THRESHOLD_AUTO) {
      colorStops = histogram.multilevelThresholding(steps)
    } else {
      const threshold = this.#getThreshold()

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
    const { blackOnWhite } = this
    const colorsToThreshold = blackOnWhite
      ? this.#getThreshold()
      : 255 - this.#getThreshold()
    const steps = this.#getSteps()
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
  #getSteps = (count: boolean = false): number => {
    const { blackOnWhite, steps, threshold } = this

    if (steps[0] !== STEPS_AUTO && count) {
      return steps.length
    }

    if (steps[0] === STEPS_AUTO && threshold === THRESHOLD_AUTO) {
      return 4
    }

    const colorsCount = blackOnWhite
      ? this.#getThreshold()
      : 255 - this.#getThreshold()

    return steps[0] === STEPS_AUTO
      ? colorsCount > 200
        ? 4
        : 3
      : Math.min(colorsCount, Math.max(2, steps[0]))
  }

  /**
   * Returns valid threshold value
   */
  #getThreshold = (): number => {
    if (this.#calculatedThreshold !== null) {
      return this.#calculatedThreshold
    }

    if (this.threshold !== THRESHOLD_AUTO) {
      this.#calculatedThreshold = this.threshold
      return this.#calculatedThreshold
    }

    const [black, white] = this.bitmap!.histogram.multilevelThresholding(2)
    this.#calculatedThreshold = this.blackOnWhite ? white : black
    this.#calculatedThreshold = this.#calculatedThreshold || 128

    return this.#calculatedThreshold
  }

  /**
   * Running potrace on the image multiple times with different thresholds and returns an array
   * of path tags
   */
  #getPathTags = (noFillColor: boolean): string => {
    let ranges = this.getRanges()
    const blackOnWhite = this.blackOnWhite

    if (ranges.length >= 10) {
      ranges = this.#addExtraColorStop(ranges)
    }

    this.setParameters({ blackOnWhite })

    let actualPrevLayersOpacity = 0

    return ranges
      .map(colorStop => {
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

        calculatedOpacity = clamp(
          parseFloat(calculatedOpacity.toFixed(3)),
          0,
          1
        )
        actualPrevLayersOpacity +=
          (1 - actualPrevLayersOpacity) * calculatedOpacity

        this.setParameters({ threshold: colorStop.value })

        let element = noFillColor ? this.getPathTag(``) : this.getPathTag()
        element = setHtmlAttribute(
          element,
          `fill-opacity`,
          calculatedOpacity.toFixed(3)
        )

        const canBeIgnored =
          calculatedOpacity === 0 || element.indexOf(` d=""`) !== -1

        return canBeIgnored ? `` : element
      })
      .join(``)
  }

  /**
   * Returns image as <symbol> tag. Always has viewBox specified
   */
  getSymbol = (id: string): string =>
    this.symbolFromPaths(this.#getPathTags(true), id)

  /**
   * Generates SVG image
   */
  getSVG = (width?: number, height?: number): string => {
    const w = width || this.bitmap!.width
    const h = height || this.bitmap!.height
    return this.svgFromPaths(this.#getPathTags(false), w, h)
  }
}

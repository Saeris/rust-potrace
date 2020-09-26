import { default as Jimp } from "jimp"
import { Bitmap, Path, Point } from "./types"
import {
  COLOR_AUTO,
  COLOR_TRANSPARENT,
  THRESHOLD_AUTO,
  TURNPOLICY_MINORITY,
  SUPPORTED_TURNPOLICY_VALUES
} from "./Constants"
import { between, luminance, renderCurve } from "./utils"

export interface PotraceOptions {
  /** how to resolve ambiguities in path decomposition. (default: "minority") */
  turnPolicy?: typeof SUPPORTED_TURNPOLICY_VALUES[number]
  /** suppress speckles of up to this size (default: 2) */
  turdSize?: number
  /** corner threshold parameter (default: 1) */
  alphaMax?: number
  /** turn on/off curve optimization (default: true) */
  optCurve?: boolean
  /** curve optimization tolerance (default: 0.2) */
  optTolerance?: number
  threshold?: number
  blackOnWhite?: boolean
  color?: string
  background?: string
}

/**
 * Potrace class
 *
 * @param {Potrace~Options} [options]
 * @constructor
 */
export class Potrace {
  luminanceData: Bitmap | null = null
  #pathlist: Path[] = []
  #imageLoadingIdentifier: Object | null = null
  #imageLoaded = false
  #processed = false

  #params: Required<PotraceOptions> & {
    width: number | null
    height: number | null
  } = {
    turnPolicy: TURNPOLICY_MINORITY,
    turdSize: 2,
    alphaMax: 1,
    optCurve: true,
    optTolerance: 0.2,
    threshold: THRESHOLD_AUTO,
    blackOnWhite: true,
    color: COLOR_AUTO,
    background: COLOR_TRANSPARENT,
    width: null,
    height: null
  }

  constructor(options?: PotraceOptions) {
    if (options) {
      this.setParameters(options)
    }
  }

  /**
   * Sets algorithm parameters
   */
  setParameters = (newParams: PotraceOptions) => {
    if (!newParams) return
    this.#validateParameters(newParams)
    if (!Object.keys(newParams).some(key => [`color`, `background`].includes(key))) {
      this.#processed = false
    }
    Object.assign(this.#params, newParams)
  }

  /**
   * Validates some of parameters
   */
  #validateParameters = (params: PotraceOptions) => {
    if (
      params &&
      params.turnPolicy &&
      SUPPORTED_TURNPOLICY_VALUES.indexOf(params.turnPolicy) === -1
    ) {
      const goodVals = `'${SUPPORTED_TURNPOLICY_VALUES.join(`', '`)}'`
      throw new Error(`Bad turnPolicy value. Allowed values are: ${goodVals}`)
    }

    if (
      params &&
      params.threshold !== undefined && // eslint-disable-line
      params.threshold !== null &&
      params.threshold !== THRESHOLD_AUTO
    ) {
      if (
        typeof params.threshold !== `number` ||
        !between(params.threshold, 0, 255)
      ) {
        throw new Error(
          `Bad threshold value. Expected to be an integer in range 0..255`
        )
      }
    }

    if (
      params &&
      params.optCurve !== undefined && // eslint-disable-line
      params.optCurve !== null &&
      typeof params.optCurve !== `boolean`
    ) {
      throw new Error(`'optCurve' must be Boolean`)
    }
  }

  /**
   * Reads given image. Uses {@link Jimp} under the hood, so target can be whatever Jimp can take
   *
   * @param {string|Buffer|Jimp} target Image source. Could be anything that {@link Jimp} can read (buffer, local path or url). Supported formats are: PNG, JPEG or BMP
   * @param {Function} callback
   */
  loadImage = async (target: string | Buffer | Jimp): Promise<Potrace> => {
    let jobId = {}
    this.#imageLoadingIdentifier = jobId
    this.#imageLoaded = false
    if (target instanceof Jimp) {
      this.#imageLoadingIdentifier = null
      this.#imageLoaded = true
      this.#processLoadedImage(target as Jimp)
      return this
    }
    const img = await Jimp.read(target as string)
    let sourceChanged = this.#imageLoadingIdentifier !== jobId
    if (sourceChanged) {
      throw new Error(`Another image was loaded instead`)
    }
    this.#imageLoadingIdentifier = null
    this.#processLoadedImage(img)
    return this
  }

  #processLoadedImage = (image: Jimp) => {
    const bitmap = new Bitmap(image.bitmap.width, image.bitmap.height)
    const pixels = image.bitmap.data

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, (_, __, i) => {
      // We want background underneath non-opaque regions to be white
      const opacity = pixels[i + 3] / 255
      bitmap.data[i / 4] = luminance(
        255 + (pixels[i + 0] - 255) * opacity,
        255 + (pixels[i + 1] - 255) * opacity,
        255 + (pixels[i + 2] - 255) * opacity
      )
    })

    this.luminanceData = bitmap
    this.#imageLoaded = true
  }

  /**
   * Creating a new {@link Path} for every group of black pixels.
   */
  #bmToPathlist = () => {
    const threshold =
      this.#params.threshold === THRESHOLD_AUTO
        ? this.luminanceData!.histogram().autoThreshold()!
        : 128
    const blackOnWhite = this.#params.blackOnWhite
    const blackMap = this.luminanceData!.copy((lum: number) => {
      const pastTheThreshold = blackOnWhite ? lum > threshold : lum < threshold
      return pastTheThreshold ? 0 : 1
    })
    let currentPoint: Point | false = new Point(0, 0)

    // Clear path list
    this.#pathlist = []

    while ((currentPoint = blackMap.findNext(currentPoint))) {
      const path = blackMap.findPath(currentPoint, this.#params.turnPolicy)
      blackMap.xorPath(path)

      if (path.area > this.#params.turdSize) {
        this.#pathlist.push(path)
      }
    }
  }

  /**
   * Processes path list created by _bmToPathlist method creating and optimizing {@link Curve}'s
   * @private
   */
  processPath = () => {
    for (let i = 0; i < this.#pathlist.length; i++) {
      let path = this.#pathlist[i]
      const curve = path.calcSums().calcLon().bestPolygon().adjustVertices()
      if (path.sign === `-`) curve.reverse()
      curve.smooth(this.#params.alphaMax)
      if (this.#params.optCurve) {
        curve.optiCurve(this.#params.optTolerance)
      }
    }
  }

  /**
   * Generates just <path> tag without rest of the SVG file
   */
  getPathTag = (
    fillColor: string = this.#params.color,
    scale?: { x: number; y: number }
  ): string => {
    const fill =
      fillColor === COLOR_AUTO
        ? this.#params.blackOnWhite
          ? `black`
          : `white`
        : fillColor

    if (!this.#imageLoaded) {
      throw new Error(`Image should be loaded first`)
    }

    if (!this.#processed) {
      this.#bmToPathlist()
      this.processPath()
      this.#processed = true
    }

    return `<path d="${this.#pathlist
      .map((path: Path) => renderCurve(path.curve!, scale))
      .join(` `)}" stroke="none" fill="${fill}" fill-rule="evenodd"/>`
  }

  /**
   * Returns <symbol> tag. Always has viewBox specified and comes with no fill color,
   * so it could be changed with <use> tag
   */
  getSymbol = (id: string): string =>
    `<symbol viewBox="0 0 ${this.luminanceData!.width} ${
      this.luminanceData!.height
    }" id="${id}">${this.getPathTag(``)}</symbol>`

  /**
   * Generates SVG image
   */
  getSVG = (): string => {
    const width = this.#params.width || this.luminanceData!.width
    const height = this.#params.height || this.luminanceData!.height
    const scale = {
      x: this.#params.width
        ? this.#params.width / this.luminanceData!.width
        : 1,
      y: this.#params.height
        ? this.#params.height / this.luminanceData!.height
        : 1
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1"> ${this.getBG()}${this.getPathTag(
      this.#params.color,
      scale
    )}</svg>`
  }

  getBG = (): string =>
    this.#params.background === COLOR_TRANSPARENT
      ? ``
      : `<rect x="0" y="0" width="100%" height="100%" fill="${
          this.#params.background
        }" />`
}

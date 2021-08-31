import { default as Jimp } from "jimp"
import { Bitmap, Path } from "./types"
import {
  COLOR_AUTO,
  COLOR_TRANSPARENT,
  THRESHOLD_AUTO,
  TURNPOLICIES
} from "./Constants"
import { range } from "./utils"

export interface PotraceOptions {
  /** how to resolve ambiguities in path decomposition. (default: "minority") */
  turnPolicy?: typeof TURNPOLICIES[keyof typeof TURNPOLICIES]
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

export class PotraceImage {
  /** suppress speckles of up to this size (default: 2) */
  turdSize: number = 2
  /** corner threshold parameter (default: 1) */
  alphaMax: number = 1
  /** turn on/off curve optimization (default: true) */
  optCurve: boolean = true
  /** curve optimization tolerance (default: 0.2) */
  optTolerance: number = 0.2
  threshold: number = THRESHOLD_AUTO
  blackOnWhite: boolean = true
  color: string = COLOR_AUTO
  background: string = COLOR_TRANSPARENT
  bitmap: Bitmap | null = null
  pathlist: Path[] = []
  imageLoaded = false
  processed = false
  /** how to resolve ambiguities in path decomposition. (default: "minority") */
  turnPolicy: typeof TURNPOLICIES[keyof typeof TURNPOLICIES] =
    TURNPOLICIES.MINORITY

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
    if (
      !Object.keys(newParams).some(key => [`color`, `background`].includes(key))
    ) {
      this.processed = false
    }
    Object.assign(this, newParams)
  }

  /**
   * Validates some of parameters
   */
  #validateParameters = (params: PotraceOptions) => {
    if (
      params &&
      params.turnPolicy &&
      Object.values(TURNPOLICIES).includes(params.turnPolicy)
    ) {
      throw new Error(
        `Bad turnPolicy value. Allowed values are: '${Object.values(
          TURNPOLICIES
        ).join(`', '`)}'`
      )
    }

    if (
      params &&
      params.threshold !== undefined && // eslint-disable-line
      params.threshold !== null &&
      params.threshold !== THRESHOLD_AUTO
    ) {
      if (
        typeof params.threshold !== `number` ||
        !range(255).contains(params.threshold)
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
  loadImage = async (target: string | Buffer | Jimp): Promise<this> => {
    this.imageLoaded = false
    // Turn the target into a Jimp instance
    const image =
      target instanceof Jimp
        ? (target as Jimp)
        : await Jimp.read(target as string)

    const width = image.bitmap.width
    const height = image.bitmap.height
    this.bitmap = new Bitmap(width, height, image.bitmap.data)
    this.generatePathList()
    this.imageLoaded = true

    return this
  }

  /**
   * Generates a list of vector paths from the luminance map
   * This needs to be regenerated any time we change the parameters
   */
  generatePathList = () => {
    const threshold =
      this.threshold === THRESHOLD_AUTO
        ? this.bitmap!.histogram.autoThreshold()!
        : 128
    const blackOnWhite = this.blackOnWhite
    const blackMap = this.bitmap!.generateBinaryBitmap(blackOnWhite, threshold)

    this.pathlist = Array.from(
      blackMap.findNext(this.turnPolicy, this.turdSize)
    ).map(path => {
      const curve = path.calcSums().calcLon().bestPolygon().adjustVertices() //?.
      if (path.sign === `-`) curve.reverse()
      curve.smooth(this.alphaMax) //?.
      if (this.optCurve) {
        curve.optimize(this.optTolerance)
      }
      return path
    }) //?. $
    this.processed = true
  }

  /**
   * Generates just <path> tag without rest of the SVG file
   */
  getPathTag = (
    fillColor: string = this.color,
    scale?: { width: number; height: number }
  ): string => {
    const fill =
      fillColor === COLOR_AUTO
        ? this.blackOnWhite
          ? `black`
          : `white`
        : fillColor

    if (!this.imageLoaded) {
      throw new Error(`Image should be loaded first`)
    }

    if (!this.processed) {
      this.generatePathList()
    }

    const paths = this.pathlist
      .map((path: Path) => path.curve!.render(scale))
      .join(` `)

    return `<path d="${paths}" stroke="none" fill="${fill}" fill-rule="evenodd"/>`
  }

  /**
   * Returns <symbol> tag. Always has viewBox specified and comes with no fill color,
   * so it could be changed with <use> tag
   */
  symbolFromPaths = (paths: string, id: string): string => {
    const width = this.bitmap!.width
    const height = this.bitmap!.height
    return `<symbol viewBox="0 0 ${width} ${height}" id="${id}">${paths}</symbol>`
  }

  /**
   * Generates SVG image
   */
  svgFromPaths = (paths: string, width: number, height: number): string => {
    const fill = this.background
    const bg =
      fill === COLOR_TRANSPARENT
        ? ``
        : `<rect x="0" y="0" width="100%" height="100%" fill="${fill}" />`
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1">${bg}${paths}</svg>`
  }
}

/*
const img = new PotraceImage() // ?.
img.loadImage(
  `https://c1.wallpaperflare.com/preview/772/936/900/thunderstorm-flashes-night-weather.jpg`
) //?.
*/

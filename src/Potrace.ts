import { PotraceImage } from "./PotraceImage"

/**
 * Potrace class
 *
 * @param {Potrace~Options} [options]
 * @constructor
 */
export class Potrace extends PotraceImage {
  /**
   * Returns <symbol> tag. Always has viewBox specified and comes with no fill color,
   * so it could be changed with <use> tag
   */
  getSymbol = (id: string): string =>
    this.symbolFromPaths(this.getPathTag(``), id)

  /**
   * Generates SVG image
   */
  getSVG = (width?: number, height?: number): string => {
    const w = width || this.bitmap!.width
    const h = height || this.bitmap!.height
    const paths = this.getPathTag(this.color, {
      width: w ? w / this.bitmap!.width : 1,
      height: h ? h / this.bitmap!.height : 1
    })
    return this.svgFromPaths(paths, w, h)
  }
}

import { Histogram } from "./Histogram"
import { Point } from "./Point"
import { between } from "../utils"
import { Path } from "./Path"

/**
 * Represents a bitmap where each pixel can be a number in range of 0..255
 * Used internally to store luminance data.
 */
export class Bitmap {
  #histogram: Histogram | null = null
  width: number
  height: number
  size: number
  arrayBuffer: ArrayBuffer
  data: Uint8Array

  constructor(w: number, h: number) {
    this.width = w
    this.height = h
    this.size = w * h
    this.arrayBuffer = new ArrayBuffer(this.size)
    this.data = new Uint8Array(this.arrayBuffer)
  }

  /**
   * Returns pixel value
   *
   * @param {Number|Point} x - index, point or x
   * @param {Number} [y]
   */
  getValueAt = (x: number, y?: number) =>
    this.data[
      typeof x === `number` && typeof y !== `number`
        ? x
        : this.pointToIndex(x, y)
    ]

  indexToPoint = (index: number): Point => {
    const isBetween = between(index, 0, this.size)
    const y = isBetween ? Math.floor(index / this.width) : -1
    const x = isBetween ? index - y * this.width : -1
    return new Point(x, y)
  }

  /**
   * Calculates index for point or coordinate pair
   */
  pointToIndex = (x: Point | number, y?: number): number => {
    const _x = x instanceof Point ? x.x : x
    const _y = x instanceof Point ? x.y : y!
    return !between(_x, 0, this.width) || !between(_y, 0, this.height)
      ? -1
      : this.width * _y + _x
  }

  /**
   * Makes a copy of current bitmap
   */
  copy = (iterator?: (value: number, i: number) => number): Bitmap => {
    const bm = new Bitmap(this.width, this.height)
    for (let i = 0; i < this.size; i++) {
      bm.data[i] =
        typeof iterator === `function`
          ? iterator(this.data[i], i)
          : this.data[i]
    }
    return bm
  }

  histogram = () => {
    if (this.#histogram) {
      return this.#histogram
    }

    this.#histogram = new Histogram(this)
    return this.#histogram
  }

  /**
   * finds next black pixel of the image
   */
  findNext = (point: Point): false | Point => {
    let i = this.pointToIndex(point)
    while (i < this.size && this.data[i] !== 1) {
      i++
    }
    return i < this.size && this.indexToPoint(i)
  }

  /**
   * compute a path in the given pixmap, separating black from white.
   * Start path at the point (x0,x1), which must be an upper left corner
   * of the path. Also compute the area enclosed by the path. Return a
   * new path object, or NULL on error (note that a legitimate path
   * cannot have length 0). Sign is required for correct interpretation
   * of turnpolicies.
   */
  findPath = (point: Point, turnPolicy: String) => {
    const p = new Path()
    let x = point.x
    let y = point.y
    let dirx = 0
    let diry = 1

    p.sign = this.getValueAt(point.x, point.y) ? `+` : `-`
    let searching = true
    while (searching) {
      /* add point to path */
      p.pt.push(new Point(x, y))
      if (x > p.maxX) p.maxX = x
      if (x < p.minX) p.minX = x
      if (y > p.maxY) p.maxY = y
      if (y < p.minY) p.minY = y
      p.len++
      /* move to next point */
      x += dirx
      y += diry
      p.area -= x * diry
      if (x === point.x && y === point.y) searching = false

      /* determine next direction */
      const l = this.getValueAt(
        x + (dirx + diry - 1) / 2,
        y + (diry - dirx - 1) / 2
      )
      const r = this.getValueAt(
        x + (dirx - diry - 1) / 2,
        y + (diry + dirx - 1) / 2
      )

      if (r && !l) {
        /* ambiguous turn */
        if (
          turnPolicy === `right` ||
          (turnPolicy === `black` && p.sign === `+`) ||
          (turnPolicy === `white` && p.sign === `-`) ||
          (turnPolicy === `majority` && this.majority(x, y)) ||
          (turnPolicy === `minority` && !this.majority(x, y))
        ) {
          /* right turn */
          let tmp = dirx
          dirx = -diry
          diry = tmp
        } else {
          /* left turn */
          let tmp = dirx
          dirx = diry
          diry = -tmp
        }
      } else if (r) {
        /* right turn */
        let tmp = dirx
        dirx = -diry
        diry = tmp
      } else if (!l) {
        /* left turn */
        let tmp = dirx
        dirx = diry
        diry = -tmp
      }
    } /* while this path */
    return p
  }

  /**
   * return the "majority" value of bitmap bm at intersection (x,y). We
   * assume that the bitmap is balanced at "radius" 1.
   */
  majority = (x: number, y: number) => {
    for (let i = 2; i < 5; i++) {
      let ct = 0
      for (let a = -i + 1; a <= i - 1; a++) {
        ct += this.getValueAt(x + a, y + i - 1) ? 1 : -1
        ct += this.getValueAt(x + i - 1, y + a - 1) ? 1 : -1
        ct += this.getValueAt(x + a - 1, y - i) ? 1 : -1
        ct += this.getValueAt(x - i, y + a) ? 1 : -1
      }
      if (ct > 0) return 1
      if (ct < 0) return 0
    }
    return 0
  }

  /**
   * xor the given pixmap with the interior of the given path. Note: the
   * path must be within the dimensions of the pixmap.
   */
  xorPath = (p: Path) => {
    let y1 = p.pt[0].y
    let len = p.len
    let x
    let y
    let maxX
    let minY
    let i
    let j
    let indx

    for (i = 1; i < len; i++) {
      x = p.pt[i].x
      y = p.pt[i].y

      if (y !== y1) {
        minY = y1 < y ? y1 : y
        maxX = p.maxX
        for (j = x; j < maxX; j++) {
          indx = this.pointToIndex(j, minY)
          this.data[indx] = this.data[indx] ? 0 : 1
        }
        y1 = y
      }
    }
  }
}

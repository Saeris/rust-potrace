import { Histogram } from "./Histogram"
import { Path } from "./Path"
import { Point } from "./Point"
import { TURNPOLICIES } from "../Constants"
import { range } from "../utils"

const u32ToRGB = (u32: number): Uint8Array => {
  const opacity = (u32 & 0xff) / 255
  return new Uint8Array([
    255 + (((u32 >> 24) & 0xff) - 255) * opacity,
    255 + (((u32 >> 16) & 0xff) - 255) * opacity,
    255 + (((u32 >> 8) & 0xff) - 255) * opacity
  ])
}

const luminance = ([r, g, b]: Uint8Array): number =>
  Math.round(0.2126 * r + 0.7153 * g + 0.0721 * b) // $(128, 165, 97)

/**
 * Represents a bitmap where each pixel can be a number in range of 0..255
 * Used internally to store luminance data.
 */
export class Bitmap {
  histogram: Histogram
  width: number
  height: number
  size: number
  data: Readonly<Buffer>
  pixels: Uint32Array
  lum: Uint8Array

  constructor(width: number, height: number, raw: Readonly<Buffer>) {
    this.width = width
    this.height = height
    this.size = width * height
    this.data = raw
    this.pixels = new Uint32Array(new ArrayBuffer(this.size))
    this.lum = new Uint8Array(new ArrayBuffer(this.size)).map((_, i) => {
      const [r, g, b, a] = raw.slice(i, i + 4)
      const byte = r + g + b + a
      this.pixels[i] = byte
      return luminance(u32ToRGB(byte))
    })
    this.histogram = this.generateHistogram()
  }

  generateHistogram = (): Histogram => new Histogram(this)

  /**
   * Returns pixel value, for a thresholded image, this will either be 0 (black) or 1 (white)
   */
  getValueAt = (x: number, y: number) => this.lum[this.pointToIndex(x, y)]

  indexToPoint = (index: number): Point => {
    const between = range(this.size).contains(index)
    const y = between ? Math.floor(index / this.width) : -1
    const x = between ? index - y * this.width : -1
    return new Point(x, y)
  }

  /**
   * Calculates index for point or coordinate pair
   */
  pointToIndex = (x: number, y: number): number =>
    !range(this.width).contains(x) || !range(this.height).contains(y)
      ? -1
      : this.width * y + x

  /**
   * Makes a deep copy of current bitmap
   */
  clone = (): Bitmap => new Bitmap(this.width, this.height, this.data)

  /**
   * Generates a new thresholded bitmap by mapping all pixel values to 0 (black) or 1 (white)
   * determined by the given threshold value (0-255)
   */
  generateBinaryBitmap = (blackOnWhite: boolean, threshold: number): Bitmap => {
    const bm = this.clone() //?.
    const pastTheThreshold = blackOnWhite
      ? (lum: number) => (lum > threshold ? 0 : 1)
      : (lum: number) => (lum < threshold ? 0 : 1)
    bm.lum.map(pastTheThreshold) //?.
    bm.histogram = bm.generateHistogram() //?.
    return bm
  }

  /**
   * finds next black pixel of the image
   */
  findNext = (turnPolicy: String, turdSize: number) => {
    const self = this
    let currentPoint: Point = new Point(0, 0)
    return {
      *[Symbol.iterator]() {
        const { x, y } = currentPoint
        let i = self.pointToIndex(x, y)
        while (i < self.size && self.lum[i] !== 1) {
          i++
        }
        if (i < self.size) {
          currentPoint = self.indexToPoint(i)
          // Extract a new path from the bitmap
          const path = self.xorPath(self.findPath(currentPoint, turnPolicy))
          // Trash the path if it's area is too small (despeckle)
          if (path.area > turdSize) {
            yield path
          }
        }
      }
    }
  }

  /**
   * compute a path in the given pixmap, separating black from white.
   * Start path at the point (x0,x1), which must be an upper left corner
   * of the path. Also compute the area enclosed by the path. Return a
   * new path object, or NULL on error (note that a legitimate path
   * cannot have length 0). Sign is required for correct interpretation
   * of turnpolicies.
   */
  findPath = (point: Point, turnPolicy: String): Path => {
    const path = new Path()
    let x = point.x //?
    let y = point.y //?
    let dirx = 0
    let diry = 1

    // determine if the pixel is black or white (value is either 0 or 1)
    path.sign = this.getValueAt(point.x, point.y) ? `+` : `-`
    let searching = true
    while (searching) {
      /* add point to path */
      path.verticies.push(new Point(x, y)) //?
      if (x > path.maxX) path.maxX = x
      if (y > path.maxY) path.maxY = y
      if (x < path.minX) path.minX = x
      if (y < path.minY) path.minY = y
      path.len++
      /* move to next point */
      x += dirx
      y += diry
      path.area -= x * diry
      // exit loop if we retrun to the starting point
      if (x === point.x && y === point.y) searching = false

      /* determine next direction */
      const left = this.getValueAt(
        x + (dirx + diry - 1) / 2,
        y + (diry - dirx - 1) / 2
      )
      const right = this.getValueAt(
        x + (dirx - diry - 1) / 2,
        y + (diry + dirx - 1) / 2
      )

      if (right && !left) {
        /* ambiguous turn */
        if (
          turnPolicy === TURNPOLICIES.RIGHT ||
          (turnPolicy === TURNPOLICIES.BLACK && path.sign === `+`) ||
          (turnPolicy === TURNPOLICIES.WHITE && path.sign === `-`) ||
          (turnPolicy === TURNPOLICIES.MAJORITY && this.majority(x, y)) ||
          (turnPolicy === TURNPOLICIES.MINORITY && !this.majority(x, y))
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
      } else if (right) {
        /* right turn */
        let tmp = dirx
        dirx = -diry
        diry = tmp
      } else if (!left) {
        /* left turn */
        let tmp = dirx
        dirx = diry
        diry = -tmp
      }
    }
    return path //?
  }

  /**
   * return the "majority" value of bitmap bm at intersection (x,y). We
   * assume that the bitmap is balanced at "radius" 1.
   */
  majority = (x: number, y: number): boolean => {
    for (const i of range(2, 5)) {
      // 2..3..4
      let ct = 0
      for (const a of range(-i + 1, i)) {
        // -1..
        ct += this.getValueAt(x + a, y + i - 1) ? 1 : -1
        ct += this.getValueAt(x + i - 1, y + a - 1) ? 1 : -1
        ct += this.getValueAt(x + a - 1, y - i) ? 1 : -1
        ct += this.getValueAt(x - i, y + a) ? 1 : -1
      }
      if (ct > 0) return true
      if (ct < 0) return false
    }
    return false
  }

  /**
   * Takes the given path and removes it's interior from a
   * thresholded bitmap by flipping all black & white pixel values
   */
  xorPath = (path: Path): Path => {
    const len = path.len
    let y0 = path.verticies[0].y

    for (const vert of range(1, len)) {
      const minX = path.verticies[vert].x
      const y = path.verticies[vert].y

      if (y !== y0) {
        const minY = y0 < y ? y0 : y
        const maxX = path.maxX
        // flip all pixels in the row
        for (const x of range(minX, maxX)) {
          const indx = this.pointToIndex(x, minY)
          this.lum[indx] = Number(!this.lum[indx])
        }
        y0 = y
      }
    }

    return path
  }
}

/*
const Jimp = require(`jimp`)

const loadImg = async () => {
  const image = await Jimp.read(
    `https://upload.wikimedia.org/wikipedia/en/7/7d/Lenna_%28test_image%29.png`
  )
  const width = image.bitmap.width
  const height = image.bitmap.height
  const bitmap = new Bitmap(width, height, image.bitmap.data)
  bitmap.histogram //?.
  const { value: path } = bitmap
    .generateBinaryBitmap(true, 128)
    .findNext(`minority`, 2)
    [Symbol.iterator]()
    .next() //?. $
  path.calcSums().calcLon().bestPolygon().adjustVertices()
}

loadImg() //?.
/*
let x = 1
let y = 1

for (let i of range(2, 5)) {
  i //?
  for (let a of range(-i + 1, i)) {
    a // ?
    let [x1, y1] = [x + a, y + i - 1] //?
    let [x2, y2] = [x + i - 1, y + a - 1] //?
    let [x3, y3] = [x + a - 1, y - i] //?
    let [x4, y4] = [x - i, y + a] //?
  }
}
*/

import { Point } from "./Point"
import { range } from "../utils"

export class Quad {
  static scan = (fn: (x: number, y: number) => void, area: number = 3) => {
    for (const x of range(area)) {
      for (const y of range(area)) {
        fn(x, y)
      }
    }
  }

  data = [
    0,
    0,
    0, // 0 1 2
    0,
    0,
    0, // 3 4 5
    0,
    0,
    0 /// 6 7 8
  ]

  get = (x: number, y: number) => this.data[x * 3 + y]

  set = (x: number, y: number, val: number) => {
    this.data[x * 3 + y] = val
  }

  prod = (ux: number, uy: number, vx: number, vy: number) =>
    this.get(ux, uy) * this.get(vx, vy)

  /** Apply quadratic form Q to vector w = (w.x,w.y) */
  quadform = (w: Point): number => {
    const vec = [w.x, w.y, 1]
    let sum = 0.0
    Quad.scan((x, y) => {
      sum += vec[x] * this.get(x, y) * vec[y]
    })
    return sum
  }
}

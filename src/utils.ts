import { Point } from "./types/Point"
import { Quad } from "./types/Quad"

const attrRegexps: { [key: string]: RegExp } = {}

export const getAttrRegexp = (attrName: string): RegExp => {
  if (attrRegexps[attrName]) {
    return attrRegexps[attrName]
  }

  attrRegexps[attrName] = new RegExp(
    ` ${attrName}="((?:\\\\(?=")"|[^"])+)"`,
    `i`
  )
  return attrRegexps[attrName]
}

export const setHtmlAttribute = (
  html: string,
  attrName: string,
  value: string
): string => {
  const attr = ` ${attrName}="${value}"`
  return html.indexOf(` ${attrName}="`) === -1
    ? html.replace(/<[a-z]+/i, (beginning: string) => `${beginning}${attr}`)
    : html.replace(getAttrRegexp(attrName), attr)
}

export const fixed = (number: number): string =>
  number.toFixed(3).replace(`.000`, ``)

export const mod = (a: number, n: number): number =>
  a >= n ? a % n : a >= 0 ? a : n - 1 - ((-1 - a) % n)

/* calculate p1 x p2 */
export const xprod = (p1: Point, p2: Point): number => p1.x * p2.y - p1.y * p2.x

/* return 1 if a <= b < c < a, in a cyclic sense (mod n) */
export const cyclic = (a: number, b: number, c: number): boolean =>
  a <= c ? a <= b && b < c : a <= b || b < c

export const sign = (i: number): number => (i > 0 ? 1 : i < 0 ? -1 : 0)

/* Apply quadratic form Q to vector w = (w.x,w.y) */
export const quadform = (Q: Quad, w: Point): number => {
  const v = [w.x, w.y, 1]
  let sum = 0.0

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      sum += v[i] * Q.at(i, j) * v[j]
    }
  }
  return sum
}

export const interval = (lambda: number, a: Point, b: Point): Point =>
  new Point(a.x + lambda * (b.x - a.x), a.y + lambda * (b.y - a.y))

/**
 * return a direction that is 90 degrees counterclockwise from p2-p0,
 * but then restricted to one of the major wind directions (n, nw, w, etc)
 */
export const dorthInfty = (a: Point, b: Point): Point =>
  new Point(-sign(b.y - a.y), sign(b.x - a.x))

/* ddenom/dpara have the property that the square of radius 1 centered
   at p1 intersects the line p0p2 iff |dpara(p0,p1,p2)| <= ddenom(p0,p2) */
export const ddenom = (a: Point, b: Point): number => {
  const { x, y } = dorthInfty(a, b)
  return y * (b.x - a.x) - x * (b.y - a.y)
}

/* return (p1-p0)x(p2-p0), the area of the parallelogram */
export const dpara = (a: Point, b: Point, c: Point): number => {
  const [x1, y1, x2, y2] = [b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y]
  return x1 * y2 - x2 * y1
}

/* calculate (p1-p0)x(p3-p2) */
export const cprod = (a: Point, b: Point, c: Point, d: Point): number => {
  const [x1, y1, x2, y2] = [b.x - a.x, b.x - a.x, d.x - c.x, d.y - c.y]
  return x1 * y2 - x2 * y1
}

/** inner product calculate (p1-p0)*(p2-p0) */
export const iprod = (a: Point, b: Point, c: Point): number => {
  const [x1, y1, x2, y2] = [b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y]
  return x1 * x2 + y1 * y2
}

/* calculate (p1-p0)*(p3-p2) */
export const iprod1 = (a: Point, b: Point, c: Point, d: Point): number => {
  const [x1, y1, x2, y2] = [b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y]
  return x1 * x2 + y1 * y2
}

/* calculate distance between two points */
export const ddist = (p: Point, q: Point): number =>
  Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y))

export const luminance = (r: number, g: number, b: number): number =>
  Math.round(0.2126 * r + 0.7153 * g + 0.0721 * b)

export const between = (val: number, min: number, max: number): boolean =>
  val >= min && val <= max

export const clamp = (val: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, val))

export const isNumber = (val: number): boolean =>
  typeof val === `number` && !isNaN(val)

/** return a point on a 1-dimensional Bezier segment */
export const bezier = (
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point
): Point => {
  const s = 1 - t
  return new Point(
    s ** 3 * p0.x +
      3 * (s ** 2 * t) * p1.x +
      3 * (t ** 2 * s) * p2.x +
      t ** 3 * p3.x,
    s ** 3 * p0.y +
      3 * (s ** 2 * t) * p1.y +
      3 * (t ** 2 * s) * p2.y +
      t ** 3 * p3.y
  )
}

/* calculate the point t in [0..1] on the (convex) bezier curve
   (p0,p1,p2,p3) which is tangent to q1-q0. Return -1.0 if there is no
   solution in [0..1]. */
export const tangent = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  q0: Point,
  q1: Point
): number => {
  const A = cprod(p0, p1, q0, q1)
  const B = cprod(p1, p2, q0, q1)
  const C = cprod(p2, p3, q0, q1)
  const a = A - 2 * B + C
  const b = -2 * A + 2 * B
  const c = A
  const d = b * b - 4 * a * c

  if (a === 0 || d < 0) {
    return -1.0
  }

  const s = Math.sqrt(d)
  const r1 = (-b + s) / (2 * a)
  const r2 = (-b - s) / (2 * a)

  if (r1 >= 0 && r1 <= 1) {
    return r1
  } else if (r2 >= 0 && r2 <= 1) {
    return r2
  }
  return -1.0
}

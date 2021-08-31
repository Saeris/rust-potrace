import { fixed, mod, range } from "../utils"
import { Opti } from "./Opti"
import {
  Point,
  ddenom,
  dpara,
  distanceBetween,
  interval,
  cubicCrossProduct,
  cubicInnerProduct,
  quadraticInnerProduct
} from "./Point"

/** return a point on a 1-dimensional Bezier segment */
const bezier = (
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
const tangent = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  q0: Point,
  q1: Point
): number => {
  const A = cubicCrossProduct(p0, p1, q0, q1)
  const B = cubicCrossProduct(p1, p2, q0, q1)
  const C = cubicCrossProduct(p2, p3, q0, q1)
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

export class Curve {
  /** @type Represents the number of Segments in the Curve */
  segments: number
  /** @type  */
  tag: ("CORNER" | "CURVE")[]
  controlPoints: Point[]
  alphaCurve: number = 0
  vertex: Point[]
  alpha: number[]
  alpha0: number[]
  beta: number[]

  constructor(segments: number) {
    this.segments = segments
    this.tag = new Array(segments)
    this.controlPoints = new Array(segments * 3)
    this.vertex = new Array(segments)
    this.alpha = new Array(segments)
    this.alpha0 = new Array(segments)
    this.beta = new Array(segments)
  }

  reverse = () => {
    const { segments, vertex } = this
    let y = segments - 1
    for (let x = 0; x < y; x++) {
      let tmp = vertex[x]
      vertex[x] = vertex[y]
      vertex[y] = tmp
      y--
    }
    return this
  }

  smooth = (alphaMax: number) => {
    let { alpha, alpha0, beta, controlPoints, segments, tag, vertex } = this

    /* examine each vertex and find its best fit */
    for (let i of range(0, segments)) {
      const j = mod(i + 1, segments)
      const k = mod(i + 2, segments)
      let denom = ddenom(vertex[i], vertex[k])
      let newAlpha = 0
      if (denom === 0.0) {
        newAlpha = 4 / 3.0
      } else {
        const dd = Math.abs(dpara(vertex[i], vertex[j], vertex[k]) / denom)
        newAlpha = dd > 1 ? 1 - 1.0 / dd : 0
        newAlpha /= 0.75
      }
      alpha0[j] = newAlpha /* remember "original" value of alpha */
      tag[j] = newAlpha >= alphaMax ? `CORNER` : `CURVE`
      const p4 = interval(1 / 2.0, vertex[k], vertex[j])
      if (newAlpha >= alphaMax) {
        /* pointed corner */
        controlPoints[3 * j + 1] = vertex[j]
        controlPoints[3 * j + 2] = p4
      } else {
        if (newAlpha < 0.55) {
          newAlpha = 0.55
        } else if (newAlpha > 1) {
          newAlpha = 1
        }
        controlPoints[3 * j + 0] = interval(
          0.5 + 0.5 * newAlpha,
          vertex[i],
          vertex[j]
        )
        controlPoints[3 * j + 1] = interval(
          0.5 + 0.5 * newAlpha,
          vertex[k],
          vertex[j]
        )
        controlPoints[3 * j + 2] = p4
      }
      alpha[j] = newAlpha /* store the "cropped" value of alpha */
      beta[j] = 0.5
    }
    this.alphaCurve = 1

    return this
  }

  optimize = (tolerance: number) => {
    let segments = this.segments
    let vert = this.vertex

    let convexities = new Array(segments)
    /* pre-calculate convexity: +1 = right turn, -1 = left turn, 0 = corner */
    for (let i of range(0, segments)) {
      if (this.tag[i] === `CURVE`) {
        convexities[i] = Math.sign(
          dpara(vert[mod(i - 1, segments)], vert[i], vert[mod(i + 1, segments)])
        )
      } else {
        convexities[i] = 0
      }
    }

    /* pre-calculate areas */
    let area = 0.0
    let areaCache = new Array(segments + 1)
    areaCache[0] = 0.0
    for (let seg of range(0, segments)) {
      let idx = mod(seg + 1, segments)
      if (this.tag[idx] === `CURVE`) {
        let alpha = this.alpha[idx]
        area +=
          (0.3 *
            alpha *
            (4 - alpha) *
            dpara(
              this.controlPoints[seg * 3 + 2],
              vert[idx],
              this.controlPoints[idx * 3 + 2]
            )) /
          2
        area +=
          dpara(
            this.vertex[0], // origin
            this.controlPoints[seg * 3 + 2],
            this.controlPoints[idx * 3 + 2]
          ) / 2
      }
      areaCache[seg + 1] = area
    }

    let pt = new Array(segments + 1)
    pt[0] = -1
    let pen = new Array(segments + 1)
    pen[0] = 0
    let len = new Array(segments + 1)
    len[0] = 0
    let optimizationResult = new Opti()
    let opt = new Array(segments + 1)

    /* calculate best path from 0 to j */
    for (let seg of range(1, segments + 1)) {
      pt[seg] = seg - 1
      pen[seg] = pen[seg - 1]
      len[seg] = len[seg - 1] + 1

      for (let i of range(0, seg - 1)) {
        if (
          this.getPenalty(
            i,
            mod(seg, segments),
            optimizationResult,
            tolerance,
            convexities,
            areaCache
          )
        ) {
          break
        }
        if (
          len[seg] > len[i] + 1 ||
          (len[seg] === len[i] + 1 &&
            pen[seg] > pen[i] + optimizationResult.penalty)
        ) {
          pt[seg] = i
          pen[seg] = pen[i] + optimizationResult.penalty
          len[seg] = len[i] + 1
          opt[seg] = optimizationResult
          optimizationResult = new Opti()
        }
      }
    }
    let optimalNumSegments = len[segments]
    let ocurve = new Curve(optimalNumSegments)
    let s = new Array(optimalNumSegments)
    let t = new Array(optimalNumSegments)
    let seg = segments
    for (let optSeg of range(0, optimalNumSegments, -1)) {
      if (pt[seg] === seg - 1) {
        ocurve.tag[optSeg] = this.tag[mod(seg, segments)]
        ocurve.controlPoints[optSeg * 3 + 0] = this.controlPoints[
          mod(seg, segments) * 3 + 0
        ]
        ocurve.controlPoints[optSeg * 3 + 1] = this.controlPoints[
          mod(seg, segments) * 3 + 1
        ]
        ocurve.controlPoints[optSeg * 3 + 2] = this.controlPoints[
          mod(seg, segments) * 3 + 2
        ]
        ocurve.vertex[optSeg] = this.vertex[mod(seg, segments)]
        ocurve.alpha[optSeg] = this.alpha[mod(seg, segments)]
        ocurve.alpha0[optSeg] = this.alpha0[mod(seg, segments)]
        ocurve.beta[optSeg] = this.beta[mod(seg, segments)]
        s[optSeg] = 1
        t[optSeg] = 1
      } else {
        ocurve.tag[optSeg] = `CURVE`
        ocurve.controlPoints[optSeg * 3 + 0] = opt[seg].c[0]
        ocurve.controlPoints[optSeg * 3 + 1] = opt[seg].c[1]
        ocurve.controlPoints[optSeg * 3 + 2] = this.controlPoints[
          mod(seg, segments) * 3 + 2
        ]
        ocurve.vertex[optSeg] = interval(
          opt[seg].s,
          this.controlPoints[mod(seg, segments) * 3 + 2],
          vert[mod(seg, segments)]
        )
        ocurve.alpha[optSeg] = opt[seg].alpha
        ocurve.alpha0[optSeg] = opt[seg].alpha
        s[optSeg] = opt[seg].s
        t[optSeg] = opt[seg].t
      }
      seg = pt[seg]
    }

    /* calculate beta parameters */
    for (let i of range(0, optimalNumSegments)) {
      ocurve.beta[i] = s[i] / (s[i] + t[mod(i + 1, optimalNumSegments)])
    }

    ocurve.alphaCurve = 1
    Object.assign(this, ocurve)

    return this
  }

  getPenalty = (
    i: number,
    j: number,
    optimizationResult: Opti,
    tolerance: number,
    convexities: number[],
    areaCache: number[]
  ) => {
    const { segments, vertex } = this
    /* check convexity, corner-freeness, and maximum bend < 179 degrees */
    if (i === j) return 1 /* sanity - a full loop can never be an opticurve */

    let k = i
    const idx = mod(i + 1, segments)
    let k1 = mod(k + 1, segments)
    const convexity = convexities[k1]
    if (convexity === 0) {
      return 1
    }
    k = k1
    while (k !== j) {
      k1 = mod(k + 1, segments)
      let k2 = mod(k + 2, segments)
      let distance = distanceBetween(vertex[i], vertex[idx])
      if (convexities[k1] !== convexity) {
        return 1
      }
      if (
        Math.sign(
          cubicCrossProduct(vertex[i], vertex[idx], vertex[k1], vertex[k2])
        ) !== convexity
      ) {
        return 1
      }
      if (
        cubicInnerProduct(vertex[i], vertex[idx], vertex[k1], vertex[k2]) <
        distance * distanceBetween(vertex[k1], vertex[k2]) * -0.999847695156
      ) {
        return 1
      }
      k = k1
    }
    /* the curve we're working in: */
    const p0 = this.controlPoints[mod(i, segments) * 3 + 2].copy()
    let p1 = vertex[mod(i + 1, segments)].copy()
    let p2 = vertex[mod(j, segments)].copy()
    const p3 = this.controlPoints[mod(j, segments) * 3 + 2].copy()
    /* determine its area */
    let area = areaCache[j] - areaCache[i]
    area -=
      dpara(
        vertex[0],
        this.controlPoints[i * 3 + 2],
        this.controlPoints[j * 3 + 2]
      ) / 2
    if (i >= j) {
      area += areaCache[segments]
    }
    /* find intersection o of p0p1 and p2p3. Let t,s such that o =
      interval(t,p0,p1) = interval(s,p3,p2). Let A be the area of the
      triangle (p0,o,p3). */
    const A1 = dpara(p0, p1, p2)
    const A2 = dpara(p0, p1, p3)
    const A3 = dpara(p0, p2, p3)
    const A4 = A1 + A3 - A2

    if (A2 === A1) {
      /* this should never happen */
      return 1
    }

    let t = A3 / (A3 - A4)
    const s = A2 / (A2 - A1)
    const A = (A2 * t) / 2.0

    if (A === 0.0) {
      /* this should never happen */
      return 1
    }

    const relativeArea = area / A /* relative area */
    const alpha =
      2 -
      Math.sqrt(4 - relativeArea / 0.3) /* overall alpha for p0-o-p3 curve */

    optimizationResult.c[0] = interval(t * alpha, p0, p1)
    optimizationResult.c[1] = interval(s * alpha, p3, p2)
    optimizationResult.alpha = alpha
    optimizationResult.t = t
    optimizationResult.s = s

    p1 = optimizationResult.c[0].copy()
    p2 = optimizationResult.c[1].copy() /* the proposed curve is now (p0,p1,p2,p3) */

    optimizationResult.penalty = 0
    /* calculate penalty */
    /* check tangency with edges */
    for (k = mod(i + 1, segments); k !== j; k = k1) {
      k1 = mod(k + 1, segments)
      t = tangent(p0, p1, p2, p3, vertex[k], vertex[k1])
      if (t < -0.5) {
        return 1
      }
      let pt = bezier(t, p0, p1, p2, p3)
      let distance = distanceBetween(vertex[k], vertex[k1])
      if (distance === 0.0) {
        /* this should never happen */
        return 1
      }
      const d1 = dpara(vertex[k], vertex[k1], pt) / distance
      if (Math.abs(d1) > tolerance) {
        return 1
      }
      if (
        quadraticInnerProduct(vertex[k], vertex[k1], pt) < 0 ||
        quadraticInnerProduct(vertex[k1], vertex[k], pt) < 0
      ) {
        return 1
      }
      optimizationResult.penalty += d1 * d1
    }
    /* check corners */
    for (k = i; k !== j; k = k1) {
      k1 = mod(k + 1, segments)
      t = tangent(
        p0,
        p1,
        p2,
        p3,
        this.controlPoints[k * 3 + 2],
        this.controlPoints[k1 * 3 + 2]
      )
      if (t < -0.5) {
        return 1
      }
      let pt = bezier(t, p0, p1, p2, p3)
      let distance = distanceBetween(
        this.controlPoints[k * 3 + 2],
        this.controlPoints[k1 * 3 + 2]
      )
      if (distance === 0.0) {
        /* this should never happen */
        return 1
      }
      let d1 =
        dpara(
          this.controlPoints[k * 3 + 2],
          this.controlPoints[k1 * 3 + 2],
          pt
        ) / distance
      let d2 =
        dpara(
          this.controlPoints[k * 3 + 2],
          this.controlPoints[k1 * 3 + 2],
          vertex[k1]
        ) / distance
      d2 *= 0.75 * this.alpha[k1]
      if (d2 < 0) {
        d1 = -d1
        d2 = -d2
      }
      if (d1 < d2 - tolerance) {
        return 1
      }
      if (d1 < d2) {
        optimizationResult.penalty += (d1 - d2) * (d1 - d2)
      }
    }

    return 0
  }

  render = (
    { width, height }: { width: number; height: number } = {
      width: 1,
      height: 1
    }
  ): string => {
    const origin = this.controlPoints[(this.segments - 1) * 3 + 2]
    return this.tag.reduce((path, tag, i) => {
      const i3 = i * 3
      const p0 = this.controlPoints[i3]
      const p1 = this.controlPoints[i3 + 1]
      const p2 = this.controlPoints[i3 + 2]
      if (tag === `CURVE`) {
        const [p0x, p0y, p1x, p1y, p2x, p2y] = [
          fixed(p0.x * width),
          fixed(p0.y * height),
          fixed(p1.x * width),
          fixed(p1.y * height),
          fixed(p2.x * width),
          fixed(p2.y * height)
        ]
        return `${path} C ${p0x} ${p0y}, ${p1x} ${p1y}, ${p2x} ${p2y}`
      } else if (tag === `CORNER`) {
        const [p1x, p1y, p2x, p2y] = [
          fixed(p1.x * width),
          fixed(p1.y * height),
          fixed(p2.x * width),
          fixed(p2.y * height)
        ]
        return `${path} L ${p1x} ${p1y} ${p2x} ${p2y}`
      }
      return path
    }, `M ${fixed(origin.x * width)} ${fixed(origin.y * height)}`)
  }
}

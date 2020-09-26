import {
  bezier,
  cprod,
  ddenom,
  ddist,
  dpara,
  fixed,
  interval,
  iprod,
  iprod1,
  mod,
  sign,
  tangent
} from "../utils"
import { Opti } from "./Opti"
import { Point } from "./Point"

export class Curve {
  /** @type Represents the number of Segments in the Curve */
  n: number
  /** @type  */
  tag: ("CORNER" | "CURVE")[]
  c: Point[]
  alphaCurve: number = 0
  vertex: Point[]
  alpha: number[]
  alpha0: number[]
  beta: number[]

  constructor(n: number) {
    this.n = n
    this.tag = new Array(n)
    this.c = new Array(n * 3)
    this.vertex = new Array(n)
    this.alpha = new Array(n)
    this.alpha0 = new Array(n)
    this.beta = new Array(n)
  }

  reverse = () => {
    const { n, vertex } = this
    let y = n - 1
    for (let x = 0; x < y; x++) {
      let tmp = vertex[x]
      vertex[x] = vertex[y]
      vertex[y] = tmp
      y--
    }
    return this
  }

  smooth = (alphaMax: number) => {
    let { alpha, alpha0, beta, c, n, tag, vertex } = this

    for (let i = 0; i < n; i++) {
      const j = mod(i + 1, n)
      const k = mod(i + 2, n)
      let denom = ddenom(vertex[i], vertex[k])
      let newAlpha = 0
      if (denom === 0.0) {
        newAlpha = 4 / 3.0
      } else {
        const dd = Math.abs(dpara(vertex[i], vertex[j], vertex[k]) / denom)
        newAlpha = dd > 1 ? 1 - 1.0 / dd : 0
        newAlpha /= 0.75
      }
      alpha0[j] = newAlpha
      tag[j] = newAlpha >= alphaMax ? `CORNER` : `CURVE`
      const p4 = interval(1 / 2.0, vertex[k], vertex[j])
      if (newAlpha >= alphaMax) {
        c[3 * j + 1] = vertex[j]
        c[3 * j + 2] = p4
      } else {
        if (newAlpha < 0.55) {
          newAlpha = 0.55
        } else if (newAlpha > 1) {
          newAlpha = 1
        }
        c[3 * j + 0] = interval(0.5 + 0.5 * newAlpha, vertex[i], vertex[j])
        c[3 * j + 1] = interval(0.5 + 0.5 * newAlpha, vertex[k], vertex[j])
        c[3 * j + 2] = p4
      }
      alpha[j] = newAlpha
      beta[j] = 0.5
    }
    this.alphaCurve = 1

    return this
  }

  optiCurve = (optTolerance: number) => {
    let m = this.n
    let vert = this.vertex
    let pt = new Array(m + 1)
    let pen = new Array(m + 1)
    let len = new Array(m + 1)
    let opt = new Array(m + 1)
    let i
    let j
    let r
    let o = new Opti()
    let p0
    let idx
    let area
    let alpha

    let convc = new Array(m)
    let areac = new Array(m + 1)

    for (i = 0; i < m; i++) {
      if (this.tag[i] === `CURVE`) {
        convc[i] = sign(
          dpara(vert[mod(i - 1, m)], vert[i], vert[mod(i + 1, m)])
        )
      } else {
        convc[i] = 0
      }
    }

    area = 0.0
    areac[0] = 0.0
    p0 = this.vertex[0]
    for (i = 0; i < m; i++) {
      idx = mod(i + 1, m)
      if (this.tag[idx] === `CURVE`) {
        alpha = this.alpha[idx]
        area +=
          (0.3 *
            alpha *
            (4 - alpha) *
            dpara(this.c[i * 3 + 2], vert[idx], this.c[idx * 3 + 2])) /
          2
        area += dpara(p0, this.c[i * 3 + 2], this.c[idx * 3 + 2]) / 2
      }
      areac[i + 1] = area
    }

    pt[0] = -1
    pen[0] = 0
    len[0] = 0

    for (j = 1; j <= m; j++) {
      pt[j] = j - 1
      pen[j] = pen[j - 1]
      len[j] = len[j - 1] + 1

      for (i = j - 2; i >= 0; i--) {
        r = this.optiPenalty(i, mod(j, m), o, optTolerance, convc, areac)
        if (r) {
          break
        }
        if (
          len[j] > len[i] + 1 ||
          (len[j] === len[i] + 1 && pen[j] > pen[i] + o.pen)
        ) {
          pt[j] = i
          pen[j] = pen[i] + o.pen
          len[j] = len[i] + 1
          opt[j] = o
          o = new Opti()
        }
      }
    }
    let om = len[m]
    let ocurve = new Curve(om)
    let s = new Array(om)
    let t = new Array(om)

    j = m
    for (i = om - 1; i >= 0; i--) {
      if (pt[j] === j - 1) {
        ocurve.tag[i] = this.tag[mod(j, m)]
        ocurve.c[i * 3 + 0] = this.c[mod(j, m) * 3 + 0]
        ocurve.c[i * 3 + 1] = this.c[mod(j, m) * 3 + 1]
        ocurve.c[i * 3 + 2] = this.c[mod(j, m) * 3 + 2]
        ocurve.vertex[i] = this.vertex[mod(j, m)]
        ocurve.alpha[i] = this.alpha[mod(j, m)]
        ocurve.alpha0[i] = this.alpha0[mod(j, m)]
        ocurve.beta[i] = this.beta[mod(j, m)]
        s[i] = 1.0
        t[i] = 1.0
      } else {
        ocurve.tag[i] = `CURVE`
        ocurve.c[i * 3 + 0] = opt[j].c[0]
        ocurve.c[i * 3 + 1] = opt[j].c[1]
        ocurve.c[i * 3 + 2] = this.c[mod(j, m) * 3 + 2]
        ocurve.vertex[i] = interval(
          opt[j].s,
          this.c[mod(j, m) * 3 + 2],
          vert[mod(j, m)]
        )
        ocurve.alpha[i] = opt[j].alpha
        ocurve.alpha0[i] = opt[j].alpha
        s[i] = opt[j].s
        t[i] = opt[j].t
      }
      j = pt[j]
    }

    for (i = 0; i < om; i++) {
      idx = mod(i + 1, om)
      ocurve.beta[i] = s[i] / (s[i] + t[idx])
    }

    ocurve.alphaCurve = 1
    Object.assign(this, ocurve)

    return this
  }

  optiPenalty = (
    i: number,
    j: number,
    res: Opti,
    opttolerance: number,
    convc: number[],
    areac: number[]
  ) => {
    const { n: m, vertex } = this
    let k
    let k1
    let k2
    let conv
    let i1
    let area
    let alpha
    let d
    let d1
    let d2
    let p0
    let p1
    let p2
    let p3
    let pt
    let A
    let R
    let A1
    let A2
    let A3
    let A4
    let s
    let t

    if (i === j) return 1

    k = i
    i1 = mod(i + 1, m)
    k1 = mod(k + 1, m)
    conv = convc[k1]
    if (conv === 0) {
      return 1
    }
    d = ddist(vertex[i], vertex[i1])
    for (k = k1; k !== j; k = k1) {
      k1 = mod(k + 1, m)
      k2 = mod(k + 2, m)
      if (convc[k1] !== conv) {
        return 1
      }
      if (sign(cprod(vertex[i], vertex[i1], vertex[k1], vertex[k2])) !== conv) {
        return 1
      }
      if (
        iprod1(vertex[i], vertex[i1], vertex[k1], vertex[k2]) <
        d * ddist(vertex[k1], vertex[k2]) * -0.999847695156
      ) {
        return 1
      }
    }

    p0 = this.c[mod(i, m) * 3 + 2].copy()
    p1 = vertex[mod(i + 1, m)].copy()
    p2 = vertex[mod(j, m)].copy()
    p3 = this.c[mod(j, m) * 3 + 2].copy()

    area = areac[j] - areac[i]
    area -= dpara(vertex[0], this.c[i * 3 + 2], this.c[j * 3 + 2]) / 2
    if (i >= j) {
      area += areac[m]
    }

    A1 = dpara(p0, p1, p2)
    A2 = dpara(p0, p1, p3)
    A3 = dpara(p0, p2, p3)

    A4 = A1 + A3 - A2

    if (A2 === A1) {
      return 1
    }

    t = A3 / (A3 - A4)
    s = A2 / (A2 - A1)
    A = (A2 * t) / 2.0

    if (A === 0.0) {
      return 1
    }

    R = area / A
    alpha = 2 - Math.sqrt(4 - R / 0.3)

    res.c[0] = interval(t * alpha, p0, p1)
    res.c[1] = interval(s * alpha, p3, p2)
    res.alpha = alpha
    res.t = t
    res.s = s

    p1 = res.c[0].copy()
    p2 = res.c[1].copy()

    res.pen = 0

    for (k = mod(i + 1, m); k !== j; k = k1) {
      k1 = mod(k + 1, m)
      t = tangent(p0, p1, p2, p3, vertex[k], vertex[k1])
      if (t < -0.5) {
        return 1
      }
      pt = bezier(t, p0, p1, p2, p3)
      d = ddist(vertex[k], vertex[k1])
      if (d === 0.0) {
        return 1
      }
      d1 = dpara(vertex[k], vertex[k1], pt) / d
      if (Math.abs(d1) > opttolerance) {
        return 1
      }
      if (
        iprod(vertex[k], vertex[k1], pt) < 0 ||
        iprod(vertex[k1], vertex[k], pt) < 0
      ) {
        return 1
      }
      res.pen += d1 * d1
    }

    for (k = i; k !== j; k = k1) {
      k1 = mod(k + 1, m)
      t = tangent(p0, p1, p2, p3, this.c[k * 3 + 2], this.c[k1 * 3 + 2])
      if (t < -0.5) {
        return 1
      }
      pt = bezier(t, p0, p1, p2, p3)
      d = ddist(this.c[k * 3 + 2], this.c[k1 * 3 + 2])
      if (d === 0.0) {
        return 1
      }
      d1 = dpara(this.c[k * 3 + 2], this.c[k1 * 3 + 2], pt) / d
      d2 = dpara(this.c[k * 3 + 2], this.c[k1 * 3 + 2], vertex[k1]) / d
      d2 *= 0.75 * this.alpha[k1]
      if (d2 < 0) {
        d1 = -d1
        d2 = -d2
      }
      if (d1 < d2 - opttolerance) {
        return 1
      }
      if (d1 < d2) {
        res.pen += (d1 - d2) * (d1 - d2)
      }
    }

    return 0
  }

  renderCurve = ({ x: width, y: height }: { x: number; y: number } = { x: 1, y: 1 }): string => {
    const origin = this.c[(this.n - 1) * 3 + 2]
    return this.tag
      .reduce(
        (path, tag, i) => {
          const i3 = i * 3
          const p0 = this.c[i3]
          const p1 = this.c[i3 + 1]
          const p2 = this.c[i3 + 2]
          if (tag === `CURVE`) {
            path.push(
              `C ${fixed(p0.x * width)} ${fixed(p0.y * height)}, ${fixed(
                p1.x * width
              )} ${fixed(p1.y * height)}, ${fixed(p2.x * width)} ${fixed(
                p2.y * height
              )}`
            )
          } else if (tag === `CORNER`) {
            path.push(
              `L ${fixed(p1.x * width)} ${fixed(p1.y * height)} ${fixed(
                p2.x * width
              )} ${fixed(p2.y * height)}`
            )
          }
          return path
        },
        [
          `M ${fixed(origin.x * width)} ${fixed(
            origin.y * height
          )}`
        ]
      )
      .join(` `)
  }
}

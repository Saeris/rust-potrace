import { cyclic, mod, quadform, sign, xprod } from "../utils"
import { Curve } from "./Curve"
import { Point } from "./Point"
import { Quad } from "./Quad"
import { Sum } from "./Sum"

export class Path {
  area: number = 0
  len: number = 0
  pt: Point[] = []
  minX: number = 100000
  minY: number = 100000
  maxX: number = -1
  maxY: number = -1
  /** length of optimal polygon */
  m?: number
  /** po[m]: optimal polygon */
  po?: number[]
  /** lon[len]: (i,lon[i]) = longest straight line from i */
  lon?: number[]
  curve?: Curve
  /** Origin x coordinate */
  x0?: number
  /** Origin y coordinate */
  y0?: number
  x1?: number
  y1?: number
  /** sums[len+1]: cache for fast summing */
  sums?: Sum[]
  sign?: string

  calcSums = () => {
    this.x0 = this.pt[0].x
    this.y0 = this.pt[0].y
    this.sums = []
    this.sums.push(new Sum(0, 0, 0, 0, 0))
    for (let i = 0; i < this.len; i++) {
      const x = this.pt[i].x - this.x0!
      const y = this.pt[i].y - this.y0!
      this.sums.push(
        new Sum(
          this.sums[i].x + x,
          this.sums[i].y + y,
          this.sums[i].xy + x * y,
          this.sums[i].x2 + x * x,
          this.sums[i].y2 + y * y
        )
      )
    }
    return this
  }

  calcLon = () => {
    const n = this.len
    this.lon = new Array(n)
    const pt = this.pt
    const pivk = new Array(n)
    const nc = new Array(n)
    let cur = new Point()
    let off = new Point()
    let dk = new Point()
    let foundk = 0
    let j = 0
    let k = 0
    for (let i = n - 1; i >= 0; i--) {
      if (pt[i].x !== pt[k].x && pt[i].y !== pt[k].y) {
        k = i + 1
      }
      nc[i] = k
    }

    for (let i = n - 1; i >= 0; i--) {
      const ct = [0, 0, 0, 0]
      let dir =
        (3 +
          3 * (pt[mod(i + 1, n)].x - pt[i].x) +
          (pt[mod(i + 1, n)].y - pt[i].y)) /
        2
      ct[dir]++

      let [pointA, pointB] = [new Point(0, 0), new Point(0, 0)]

      k = nc[i]
      let k1 = i
      let searching = true
      while (searching) {
        foundk = 0
        dir = (3 + 3 * sign(pt[k].x - pt[k1].x) + sign(pt[k].y - pt[k1].y)) / 2
        ct[dir]++

        if (ct[0] && ct[1] && ct[2] && ct[3]) {
          pivk[i] = k1
          foundk = 1
          searching = false
        }

        cur.x = pt[k].x - pt[i].x
        cur.y = pt[k].y - pt[i].y

        if (xprod(pointA, cur) < 0 || xprod(pointB, cur) > 0) {
          searching = false
        }

        if (!(Math.abs(cur.x) <= 1 && Math.abs(cur.y) <= 1)) {
          off.x = cur.x + (cur.y >= 0 && (cur.y > 0 || cur.x < 0) ? 1 : -1)
          off.y = cur.y + (cur.x <= 0 && (cur.x < 0 || cur.y < 0) ? 1 : -1)
          if (xprod(pointA, off) >= 0) {
            pointA.x = off.x
            pointA.y = off.y
          }
          off.x = cur.x + (cur.y <= 0 && (cur.y < 0 || cur.x < 0) ? 1 : -1)
          off.y = cur.y + (cur.x >= 0 && (cur.x > 0 || cur.y < 0) ? 1 : -1)
          if (xprod(pointB, off) <= 0) {
            pointB.x = off.x
            pointB.y = off.y
          }
        }
        k1 = k
        k = nc[k1]
        if (!cyclic(k, i, k1)) {
          searching = false
        }
      }
      if (foundk === 0) {
        dk.x = sign(pt[k].x - pt[k1].x)
        dk.y = sign(pt[k].y - pt[k1].y)
        cur.x = pt[k1].x - pt[i].x
        cur.y = pt[k1].y - pt[i].y

        const [a, b, c, d] = [
          xprod(pointA, cur),
          xprod(pointA, dk),
          xprod(pointB, cur),
          xprod(pointB, dk)
        ]

        j = 10000000

        if (b < 0) {
          j = Math.floor(a / -b)
        }
        if (d > 0) {
          j = Math.min(j, Math.floor(-c / d))
        }

        pivk[i] = mod(k1 + j, n)
      }
    }

    j = pivk[n - 1]
    this.lon[n - 1] = j
    for (let i = n - 2; i >= 0; i--) {
      if (cyclic(i + 1, pivk[i], j)) {
        j = pivk[i]
      }
      this.lon[i] = j
    }

    for (let i = n - 1; cyclic(mod(i + 1, n), j, this.lon[i]); i--) {
      this.lon[i] = j
    }

    return this
  }

  bestPolygon = () => {
    let n = this.len
    let pen = new Array(n + 1)
    let prev = new Array(n + 1)
    let clip0 = new Array(n)
    let clip1 = new Array(n + 1)
    let seg0 = new Array(n + 1)
    let seg1 = new Array(n + 1)

    for (let i = 0; i < n; i++) {
      let c = mod(this.lon![mod(i - 1, n)] - 1, n)
      if (c === i) {
        c = mod(i + 1, n)
      }
      if (c < i) {
        clip0[i] = n
      } else {
        clip0[i] = c
      }
    }

    let j = 1
    for (let i = 0; i < n; i++) {
      while (j <= clip0[i]) {
        clip1[j] = i
        j++
      }
    }

    let i = 0
    for (j = 0; i < n; j++) {
      seg0[j] = i
      i = clip0[i]
    }
    seg0[j] = n
    let m = j

    i = n
    for (j = m; j > 0; j--) {
      seg1[j] = i
      i = clip1[i]
    }
    seg1[0] = 0

    pen[0] = 0
    for (j = 1; j <= m; j++) {
      for (i = seg1[j]; i <= seg0[j]; i++) {
        let best = -1
        for (let k = seg0[j - 1]; k >= clip1[i]; k--) {
          let thispen = this.penalty3(k, i) + pen[k]
          if (best < 0 || thispen < best) {
            prev[i] = k
            best = thispen
          }
        }
        pen[i] = best
      }
    }
    this.m = m
    this.po = new Array(m)

    for (i = n, j = m - 1; i > 0; j--) {
      i = prev[i]
      this.po[j] = i
    }

    return this
  }

  penalty3 = (i: number, j: number) => {
    const { len, pt, sums } = this as Required<Path>
    let _j = j >= len ? j - len : j
    let r = j >= len
    const x =
      r
        ? sums[_j + 1].x - sums[i].x + sums[len].x
        : sums[_j + 1].x - sums[i].x
    const y =
      r
        ? sums[_j + 1].y - sums[i].y + sums[len].y
        : sums[_j + 1].y - sums[i].y
    const xy =
      r
        ? sums[_j + 1].xy - sums[i].xy + sums[len].xy
        : sums[_j + 1].xy - sums[i].xy
    const x2 =
      r
        ? sums[_j + 1].x2 - sums[i].x2 + sums[len].x2
        : sums[_j + 1].x2 - sums[i].x2
    const y2 =
      r
        ? sums[_j + 1].y2 - sums[i].y2 + sums[len].y2
        : sums[_j + 1].y2 - sums[i].y2
    const k = r ? _j + 1 - i + len : _j + 1 - i
    const px = (pt[i].x + pt[_j].x) / 2.0 - pt[0].x
    const py = (pt[i].y + pt[_j].y) / 2.0 - pt[0].y
    const ex = pt[_j].x - pt[i].x
    const ey = -(pt[_j].y - pt[i].y)
    const a = (x2 - 2 * x * px) / k + px * px
    const b = (xy - x * py - y * px) / k + px * py
    const c = (y2 - 2 * y * py) / k + py * py
    return Math.sqrt(ex * ex * a + 2 * ex * ey * b + ey * ey * c)
  }

  adjustVertices = () => {
    const { m, po, len, pt, x0, y0 } = this as Required<Path>
    let ctr = new Array(m)
    let dir = new Array(m)
    let q = new Array(m)
    let v = new Array(3)
    let s = new Point()

    this.curve = new Curve(m)

    for (let i = 0; i < m; i++) {
      let j = po[mod(i + 1, m)]
      j = mod(j - po[i], len) + po[i]
      ctr[i] = new Point()
      dir[i] = new Point()
      this.pointslope(po[i], j, ctr[i], dir[i])
    }

    for (let i = 0; i < m; i++) {
      q[i] = new Quad()
      let d = dir[i].x * dir[i].x + dir[i].y * dir[i].y
      if (d === 0.0) {
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < 3; k++) {
            q[i].data[j * 3 + k] = 0
          }
        }
      } else {
        v[0] = dir[i].y
        v[1] = -dir[i].x
        v[2] = -v[1] * ctr[i].y - v[0] * ctr[i].x
        for (let l = 0; l < 3; l++) {
          for (let k = 0; k < 3; k++) {
            q[i].data[l * 3 + k] = (v[l] * v[k]) / d
          }
        }
      }
    }

    for (let i = 0; i < m; i++) {
      const Q = new Quad()
      const w = new Point()

      s.x = pt[po[i]].x - x0
      s.y = pt[po[i]].y - y0

      let j = mod(i - 1, m)

      for (let l = 0; l < 3; l++) {
        for (let k = 0; k < 3; k++) {
          Q.data[l * 3 + k] = q[j].at(l, k) + q[i].at(l, k)
        }
      }

      let searching = true
      while (searching) {
        const det = Q.at(0, 0) * Q.at(1, 1) - Q.at(0, 1) * Q.at(1, 0)
        if (det !== 0.0) {
          w.x = (-Q.at(0, 2) * Q.at(1, 1) + Q.at(1, 2) * Q.at(0, 1)) / det
          w.y = (Q.at(0, 2) * Q.at(1, 0) - Q.at(1, 2) * Q.at(0, 0)) / det
          searching = false
        }

        if (Q.at(0, 0) > Q.at(1, 1)) {
          v[0] = -Q.at(0, 1)
          v[1] = Q.at(0, 0)
        } else if (Q.at(1, 1)) {
          v[0] = -Q.at(1, 1)
          v[1] = Q.at(1, 0)
        } else {
          v[0] = 1
          v[1] = 0
        }
        let d = v[0] * v[0] + v[1] * v[1]
        v[2] = -v[1] * s.y - v[0] * s.x
        for (let l = 0; l < 3; l++) {
          for (let k = 0; k < 3; k++) {
            Q.data[l * 3 + k] += (v[l] * v[k]) / d
          }
        }
      }
      let dx = Math.abs(w.x - s.x)
      let dy = Math.abs(w.y - s.y)
      if (dx <= 0.5 && dy <= 0.5) {
        this.curve.vertex[i] = new Point(w.x + x0, w.y + y0)
        continue // eslint-disable-line
      }

      let min = quadform(Q, s)
      let xmin = s.x
      let ymin = s.y
      let cand = 0

      if (Q.at(0, 0) !== 0.0) {
        for (let z = 0; z < 2; z++) {
          w.y = s.y - 0.5 + z
          w.x = -(Q.at(0, 1) * w.y + Q.at(0, 2)) / Q.at(0, 0)
          dx = Math.abs(w.x - s.x)
          cand = quadform(Q, w)
          if (dx <= 0.5 && cand < min) {
            min = cand
            xmin = w.x
            ymin = w.y
          }
        }
      }

      if (Q.at(1, 1) !== 0.0) {
        for (let z = 0; z < 2; z++) {
          w.x = s.x - 0.5 + z
          w.y = -(Q.at(1, 0) * w.x + Q.at(1, 2)) / Q.at(1, 1)
          dy = Math.abs(w.y - s.y)
          cand = quadform(Q, w)
          if (dy <= 0.5 && cand < min) {
            min = cand
            xmin = w.x
            ymin = w.y
          }
        }
      }

      for (let l = 0; l < 2; l++) {
        for (let k = 0; k < 2; k++) {
          w.x = s.x - 0.5 + l
          w.y = s.y - 0.5 + k
          cand = quadform(Q, w)
          if (cand < min) {
            min = cand
            xmin = w.x
            ymin = w.y
          }
        }
      }

      this.curve.vertex[i] = new Point(xmin + x0, ymin + y0)
    }

    return this.curve
  }

  pointslope = (i: number, j: number, ctr: Point, dir: Point) => {
    const len = this.len
    const sums = this.sums!
    let _i = i
    let _j = j
    let r = 0

    while (_j >= len) {
      _j -= len
      r += 1
    }
    while (_i >= len) {
      _i -= len
      r -= 1
    }
    while (_j < 0) {
      _j += len
      r -= 1
    }
    while (_i < 0) {
      _i += len
      r += 1
    }

    const x1 = sums[_j + 1].x - sums[_i].x + r * sums[len].x
    const y1 = sums[_j + 1].y - sums[_i].y + r * sums[len].y
    const x2 = sums[_j + 1].x2 - sums[_i].x2 + r * sums[len].x2
    const xy = sums[_j + 1].xy - sums[_i].xy + r * sums[len].xy
    const y2 = sums[_j + 1].y2 - sums[_i].y2 + r * sums[len].y2
    const k = _j + 1 - _i + r * len

    ctr.x = x1 / k
    ctr.y = y1 / k

    let a = (x2 - (x1 * x1) / k) / k
    let b = (xy - (x1 * y1) / k) / k
    let c = (y2 - (y1 * y1) / k) / k

    const lambda2 = (a + c + Math.sqrt((a - c) * (a - c) + 4 * b * b)) / 2

    a -= lambda2
    c -= lambda2
    let l = 0
    if (Math.abs(a) >= Math.abs(c)) {
      l = Math.sqrt(a * a + b * b)
      if (l !== 0) {
        dir.x = -b / l
        dir.y = a / l
      }
    } else {
      l = Math.sqrt(c * c + b * b)
      if (l !== 0) {
        dir.x = -c / l
        dir.y = b / l
      }
    }
    if (l === 0) {
      dir.x = 0
      dir.y = 0
    }
  }
}

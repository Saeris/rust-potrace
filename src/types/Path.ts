// @ts-ignore
import assert from "assert" // eslint-disable-line
import { cyclic, mod, range } from "../utils"
import { Curve } from "./Curve"
import { Point, crossProduct } from "./Point"
import { Quad } from "./Quad"
import { Sum } from "./Sum"

export class Path {
  area: number = 0
  len: number = 0
  verticies: Point[] = []
  minX: number = 100000
  minY: number = 100000
  maxX: number = -1
  maxY: number = -1
  /** length of optimal polygon */
  optimalNumSegments?: number
  /** po[m]: optimal polygon */
  po?: number[]
  /** lon[len]: (i,lon[i]) = longest straight line from i */
  lon?: number[]
  curve?: Curve
  /** Origin x coordinate */
  originX?: number
  /** Origin y coordinate */
  originY?: number
  x1?: number
  y1?: number
  /** sums[len+1]: cache for fast summing */
  sums?: Sum[]
  sign?: string

  calcSums = () => {
    this.originX = this.verticies[0].x
    this.originY = this.verticies[0].y
    this.sums = new Array(this.len + 1)
    this.sums[0] = new Sum(0, 0, 0, 0, 0)
    for (const i of range(0, this.len)) {
      const x = this.verticies[i].x - this.originX!
      const y = this.verticies[i].y - this.originY!
      this.sums[i + 1] = new Sum(
        this.sums[i].x + x,
        this.sums[i].y + y,
        this.sums[i].xy + x * y,
        this.sums[i].x2 + x * x,
        this.sums[i].y2 + y * y
      )
    }

    return this
  }

  // find the longest straight segment of the given path
  calcLon = () => {
    const segments = this.len
    this.lon = new Array(segments)
    const verticies = this.verticies
    const nextCorner: number[] = new Array(segments) /* nc[n]: next corner */

    /**
     * initialize the nc data structure. Point from each point to the
     * furthest future point to which it is connected by a vertical or
     * horizontal segment. We take advantage of the fact that there is
     * always a direction change at 0 (due to the path decomposition
     * algorithm). But even if this were not so, there is no harm, as
     * in practice, correctness does not depend on the word "furthest"
     * above.
     */
    let idx = 0
    for (const seg of range(0, segments, -1)) {
      if (
        verticies[seg].x !== verticies[idx].x &&
        verticies[seg].y !== verticies[idx].y
      ) {
        idx = seg + 1
      }
      nextCorner[seg] = idx
    }

    /**
     * determine pivot points: for each i, let pivk[i] be the furthest k
     * such that all j with i<j<k lie on a line connecting i,k.
     */
    const pivk: number[] = new Array(segments)
    let j = 0
    for (const seg of range(0, segments, -1)) {
      const ct = [0, 0, 0, 0]
      let dir =
        (3 +
          3 * (verticies[mod(seg + 1, segments)].x - verticies[seg].x) +
          (verticies[mod(seg + 1, segments)].y - verticies[seg].y)) /
        2
      ct[dir] += 1

      let [constraintA, constraintB, cur, off] = [
        new Point(),
        new Point(),
        new Point(),
        new Point()
      ]
      /* find the next k such that no straight line from i to k */
      let k = nextCorner[seg] //?
      let cornerIdx = seg
      let foundk = false
      let searching = true
      while (searching) {
        dir =
          (3 +
            3 * Math.sign(verticies[k].x - verticies[cornerIdx].x) +
            Math.sign(verticies[k].y - verticies[cornerIdx].y)) /
          2
        ct[dir] += 1
        /* if all four "directions" have occurred, cut this path */
        if (ct[0] && ct[1] && ct[2] && ct[3]) {
          pivk[seg] = cornerIdx
          foundk = true
          searching = false
        }

        cur.x = verticies[k].x - verticies[seg].x
        cur.y = verticies[k].y - verticies[seg].y
        /* see if current constraint is violated */
        if (
          crossProduct(constraintA, cur) < 0 ||
          crossProduct(constraintB, cur) > 0
        ) {
          searching = false
        }
        /* else, update constraint */
        if (!(Math.abs(cur.x) <= 1 && Math.abs(cur.y) <= 1)) {
          off.x = cur.x + (cur.y >= 0 && (cur.y > 0 || cur.x < 0) ? 1 : -1)
          off.y = cur.y + (cur.x <= 0 && (cur.x < 0 || cur.y < 0) ? 1 : -1)
          if (crossProduct(constraintA, off) >= 0) {
            constraintA.x = off.x
            constraintA.y = off.y
          }
          off.x = cur.x + (cur.y <= 0 && (cur.y < 0 || cur.x < 0) ? 1 : -1)
          off.y = cur.y + (cur.x >= 0 && (cur.x > 0 || cur.y < 0) ? 1 : -1)
          if (crossProduct(constraintB, off) <= 0) {
            constraintB.x = off.x
            constraintB.y = off.y
          }
        }
        cornerIdx = k
        k = nextCorner[cornerIdx]
        if (!cyclic(k, seg, cornerIdx)) {
          searching = false
        }
      }
      /**
       * corner was the last "corner" satisfying the current constraint, and
       * k is the first one violating it. We now need to find the last
       * point along corner..k which satisfied the constraint.
       */
      if (!foundk) {
        const cornerDirection = new Point(
          Math.sign(verticies[k].x - verticies[cornerIdx].x),
          Math.sign(verticies[k].y - verticies[cornerIdx].y)
        ) /* direction of k-corner */
        cur.x = verticies[cornerIdx].x - verticies[seg].x
        cur.y = verticies[cornerIdx].y - verticies[seg].y
        /**
         * find largest integer j such that xprod(constraint[0], cur+j*dk)
         * >= 0 and xprod(constraint[1], cur+j*dk) <= 0. Use bilinearity
         * of xprod.
         */
        const [a, b, c, d] = [
          crossProduct(constraintA, cur),
          crossProduct(constraintA, cornerDirection),
          crossProduct(constraintB, cur),
          crossProduct(constraintB, cornerDirection)
        ]
        /**
         * find largest integer j such that a+j*b>=0 and c+j*d<=0. This
         * can be solved with integer arithmetic.
         */
        j = 10000000

        if (b < 0) {
          j = Math.floor(a / -b)
        }
        if (d > 0) {
          j = Math.min(j, Math.floor(-c / d))
        }

        pivk[seg] = mod(cornerIdx + j, segments)
      }
    }
    /**
     * clean up: for each i, let lon[i] be the largest k such that for
     * all i' with i<=i'<k, i'<k<=pivk[i'].
     */
    j = pivk[segments - 1]
    this.lon[segments - 1] = j
    for (const i of range(0, segments - 2, -1)) {
      if (cyclic(i + 1, pivk[i], j)) {
        j = pivk[i]
      }
      this.lon[i] = j
    }

    for (
      let i = segments - 1;
      cyclic(mod(i + 1, segments), j, this.lon[i]);
      i--
    ) {
      this.lon[i] = j
    }

    return this
  }

  bestPolygon = () => {
    let segments = this.len
    let pen = new Array(segments + 1) /* pen[n+1]: penalty vector */
    let prev: number[] = new Array(
      segments + 1
    ) /* prev[n+1]: best path pointer vector */
    let clip0 = new Array(
      segments
    ) /* clip0[n]: longest segment pointer, non-cyclic */
    let clip1 = new Array(
      segments + 1
    ) /* clip1[n+1]: backwards segment pointer, non-cyclic */
    let seg0 = new Array(
      segments + 1
    ) /* seg0[m+1]: forward segment bounds, m<=n */
    let seg1 = new Array(
      segments + 1
    ) /* seg1[m+1]: backward segment bounds, m<=n */

    /* calculate clipped paths */
    for (const i of range(0, segments)) {
      this.lon
      let c = mod(this.lon![mod(i - 1, segments)] - 1, segments)
      if (c === i) {
        c = mod(i + 1, segments)
      }
      if (c < i) {
        clip0[i] = segments
      } else {
        clip0[i] = c
      }
    }
    /**
     * calculate backwards path clipping, non-cyclic. j <= clip0[i] iff
     * clip1[j] <= i, for i,j=0..n.
     */
    let j = 1
    for (const i of range(0, segments)) {
      while (j <= clip0[i]) {
        clip1[j] = i
        j++
      }
    }

    /* calculate seg0[j] = longest path from 0 with j segments */
    let i = 0
    for (j = 0; i < segments; j++) {
      seg0[j] = i
      i = clip0[i]
    }
    seg0[j] = segments
    let m = j

    /* calculate seg1[j] = longest path to n with m-j segments */
    i = segments
    for (j = m; j > 0; j--) {
      seg1[j] = i
      i = clip1[i]
    }
    seg1[0] = 0

    /* now find the shortest path with m segments, based on penalty3 */
    /**
     * note: the outer 2 loops jointly have at most n iterations, thus
     * the worst-case behavior here is quadratic. In practice, it is
     * close to linear since the inner loop tends to be short.
     */
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
    this.optimalNumSegments = m
    this.po = new Array(m)
    this.po

    /* read off shortest path */
    for (i = segments, j = m - 1; i > 0; j--) {
      i = prev[i]
      this.po[j] = i
    }

    return this
  }

  penalty3 = (i: number, j: number) => {
    const { len, verticies, sums } = this as Required<Path>
    const _j = j >= len ? j - len : j
    const r = j >= len
    const x = r
      ? sums[_j + 1].x - sums[i].x + sums[len].x
      : sums[_j + 1].x - sums[i].x
    const y = r
      ? sums[_j + 1].y - sums[i].y + sums[len].y
      : sums[_j + 1].y - sums[i].y
    const xy = r
      ? sums[_j + 1].xy - sums[i].xy + sums[len].xy
      : sums[_j + 1].xy - sums[i].xy
    const x2 = r
      ? sums[_j + 1].x2 - sums[i].x2 + sums[len].x2
      : sums[_j + 1].x2 - sums[i].x2
    const y2 = r
      ? sums[_j + 1].y2 - sums[i].y2 + sums[len].y2
      : sums[_j + 1].y2 - sums[i].y2
    const k = r ? _j + 1 - i + len : _j + 1 - i
    const px = (verticies[i].x + verticies[_j].x) / 2.0 - verticies[0].x
    const py = (verticies[i].y + verticies[_j].y) / 2.0 - verticies[0].y
    const ex = verticies[_j].x - verticies[i].x
    const ey = -(verticies[_j].y - verticies[i].y)
    const a = (x2 - 2 * x * px) / k + px * px
    const b = (xy - x * py - y * px) / k + px * py
    const c = (y2 - 2 * y * py) / k + py * py
    return Math.sqrt(ex * ex * a + 2 * ex * ey * b + ey * ey * c)
  }

  adjustVertices = () => {
    const {
      optimalNumSegments,
      po,
      len,
      verticies,
      originX,
      originY
    } = this as Required<Path>
    let ctr: Point[] = new Array(optimalNumSegments).fill(new Point())
    let dir: Point[] = new Array(optimalNumSegments).fill(new Point())
    let quads: Quad[] = new Array(optimalNumSegments).fill(new Quad())
    let vec: number[] = new Array(3)
    let s = new Point()

    this.curve = new Curve(optimalNumSegments)
    /* calculate "optimal" point-slope representation for each line segment */
    for (let seg of range(optimalNumSegments)) {
      this.pointslope(
        po[seg],
        mod(po[mod(seg + 1, optimalNumSegments)] - po[seg], len) + po[seg],
        ctr[seg],
        dir[seg]
      )
    }

    /**
     * represent each line segment as a singular quadratic form; the distance of a point (x,y)
     * from the line segment will be (x,y,1)Q(x,y,1)^t, where Q=q[i].
     */
    for (const seg of range(optimalNumSegments)) {
      const distance = dir[seg].x ** 2 + dir[seg].y ** 2
      if (distance === 0.0) {
        Quad.scan((x, y) => {
          quads[seg].set(x, y, 0)
        })
      } else {
        vec[0] = dir[seg].y
        vec[1] = -dir[seg].x
        vec[2] = -vec[1] * ctr[seg].y - vec[0] * ctr[seg].x
        Quad.scan((x, y) => {
          quads[seg].set(x, y, (vec[x] * vec[y]) / distance)
        })
      }
    }

    /**
     * now calculate the "intersections" of consecutive segments. Instead of using the actual
     * intersection, we find the point within a given unit square which minimizes the square
     * distance to the two lines.
     */
    for (const seg of range(optimalNumSegments)) {
      const unitSq = new Quad()
      const w = new Point()

      /* let s be the vertex, in coordinates relative to x0/y0 */
      s.x = verticies[po[seg]].x - originX
      s.y = verticies[po[seg]].y - originY

      Quad.scan((x, y) => {
        unitSq.set(
          x,
          y,
          quads[mod(seg - 1, optimalNumSegments)].get(x, y) +
            quads[seg].get(x, y)
        )
      })

      /* minimize the quadratic form Q on the unit square */
      /* find intersection */
      let searching = true
      while (searching) {
        const det = unitSq.prod(0, 0, 1, 1) - unitSq.prod(0, 1, 1, 0)
        if (det !== 0.0) {
          w.x =
            (-unitSq.get(0, 2) * unitSq.get(1, 1) +
              unitSq.get(1, 2) * unitSq.get(0, 1)) /
            det
          w.y = (unitSq.prod(0, 2, 1, 0) - unitSq.prod(1, 2, 0, 0)) / det
          searching = false
        }

        /* matrix is singular - lines are parallel. Add another, orthogonal axis, through the center of the unit square */
        if (unitSq.get(0, 0) > unitSq.get(1, 1)) {
          // upper-left > center
          vec[0] = -unitSq.get(0, 1)
          vec[1] = unitSq.get(0, 0)
        } else if (unitSq.get(1, 1)) {
          // center isn't 0
          vec[0] = -unitSq.get(1, 1)
          vec[1] = unitSq.get(1, 0)
        } else {
          vec[0] = 1
          vec[1] = 0
        }
        const distance = vec[0] ** 2 + vec[1] ** 2
        vec[2] = -vec[1] * s.y - vec[0] * s.x
        Quad.scan((x, y) => {
          unitSq.set(x, y, unitSq.get(x, y) + (vec[x] * vec[y]) / distance)
        })
      }
      let dx = Math.abs(w.x - s.x)
      let dy = Math.abs(w.y - s.y)
      if (dx <= 0.5 && dy <= 0.5) {
        this.curve.vertex[seg] = new Point(w.x + originX, w.y + originY)
        continue // eslint-disable-line
      }

      /* the minimum was not in the unit square; now minimize quadratic on boundary of square */
      let min = unitSq.quadform(s)
      let xmin = s.x
      let ymin = s.y /* coordinates of minimum */
      let candidate = 0 /* minimum and candidate for minimum of quad. form */

      if (unitSq.get(0, 0) !== 0.0) {
        // upper-left
        for (const y of range(0, 2)) {
          /* value of the y-coordinate */
          w.y = s.y - 0.5 + y
          w.x = -(unitSq.get(0, 1) * w.y + unitSq.get(0, 2)) / unitSq.get(0, 0)
          dx = Math.abs(w.x - s.x)
          candidate = unitSq.quadform(w)
          if (dx <= 0.5 && candidate < min) {
            min = candidate
            xmin = w.x
            ymin = w.y
          }
        }
      }

      if (unitSq.get(1, 1) !== 0.0) {
        // center
        for (const x of range(2)) {
          /* value of the x-coordinate */
          w.x = s.x - 0.5 + x
          w.y = -(unitSq.get(1, 0) * w.x + unitSq.get(1, 2)) / unitSq.get(1, 1)
          dy = Math.abs(w.y - s.y)
          candidate = unitSq.quadform(w)
          if (dy <= 0.5 && candidate < min) {
            min = candidate
            xmin = w.x
            ymin = w.y
          }
        }
      }

      /* check four corners */
      Quad.scan((x, y) => {
        w.x = s.x - 0.5 + x
        w.y = s.y - 0.5 + y
        candidate = unitSq.quadform(w)
        if (candidate < min) {
          min = candidate
          xmin = w.x
          ymin = w.y
        }
      }, 2)

      this.curve.vertex[seg] = new Point(xmin + originX, ymin + originY)
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

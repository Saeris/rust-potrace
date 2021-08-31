export class Point {
  constructor(public x: number = 0, public y: number = 0) {
    this.x = x
    this.y = y
  }

  copy = () => new Point(this.x, this.y)
}

/* calculate p1 x p2 */
export const crossProduct = (u: Point, v: Point): number =>
  u.x * v.y - u.y * v.x

export const interval = (lambda: number, u: Point, v: Point): Point =>
  new Point(u.x + lambda * (v.x - u.x), u.y + lambda * (v.y - u.y))

// return a direction that is 90 degrees counterclockwise from p2-p0,
// but then restricted to one of the major wind directions (n, nw, w, etc)
export const dorthInfty = (u: Point, v: Point): Point =>
  new Point(-Math.sign(v.y - u.y), Math.sign(v.x - u.x)) //?. $({ x: 1, y: 1}, { x: 1.5, y: 1.5 })

/* ddenom/dpara have the property that the square of radius 1 centered
   at p1 intersects the line p0p2 iff |dpara(p0,p1,p2)| <= ddenom(p0,p2) */
export const ddenom = (u: Point, v: Point): number => {
  const { x, y } = dorthInfty(u, v) //?
  return y * (v.x - u.x) - x * (v.y - u.y)
} //?. $({ x: 1.39, y: 1.75 }, { x: 2.5, y: 2.5 })

/* return (p1-p0)x(p2-p0), the area of the parallelogram */
export const dpara = (p0: Point, p1: Point, p2: Point): number => {
  const [ux, uy, vx, vy] = [p1.x - p0.x, p1.y - p0.y, p2.x - p0.x, p2.y - p0.y] //?
  return ux * vy - vx * uy
} //?. $({ x: 1.39, y: 1.75 }, { x: 2.5, y: 2.5 } , { x: 2.63, y: 1.52 })

/* calculate (p1-p0)x(p3-p2) */
export const cubicCrossProduct = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point
): number => {
  const [ux, uy, vx, vy] = [p1.x - p0.x, p1.x - p0.x, p3.x - p2.x, p3.y - p2.y]
  return ux * vy - vx * uy
}

/** inner product calculate (p1-p0)*(p2-p0) */
export const quadraticInnerProduct = (
  p0: Point,
  p1: Point,
  p2: Point
): number => {
  const [ux, uy, vx, vy] = [p1.x - p0.x, p1.y - p0.y, p2.x - p0.x, p2.y - p0.y]
  return ux * vx + uy * vy
}

/* calculate (p1-p0)*(p3-p2) */
export const cubicInnerProduct = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point
): number => {
  const [ux, uy, vx, vy] = [p1.x - p0.x, p1.y - p0.y, p3.x - p2.x, p3.y - p2.y]
  return ux * vx + uy * vy
}

/* calculate distance between two points */
export const distanceBetween = (u: Point, v: Point): number =>
  Math.sqrt((u.x - v.x) ** 2 + (u.y - v.y) ** 2)

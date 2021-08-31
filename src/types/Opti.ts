import { Point } from "./Point"

export class Opti {
  constructor(
    public penalty: number = 0,
    public c: Point[] = [new Point(), new Point()],
    public t: number = 0,
    public s: number = 0,
    public alpha: number = 0
  ) {
    this.penalty = penalty
    this.c = c
    this.t = t
    this.s = s
    this.alpha = alpha
  }
}

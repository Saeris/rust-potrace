export class Point {
  constructor(public x: number = 0, public y: number = 0) {
    this.x = x
    this.y = y
  }

  copy = () => new Point(this.x, this.y)
}

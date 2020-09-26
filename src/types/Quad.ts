export class Quad {
  data = [0, 0, 0, 0, 0, 0, 0, 0, 0]

  at = (x: number, y: number) => this.data[x * 3 + y]
}

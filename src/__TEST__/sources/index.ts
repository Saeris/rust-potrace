import { resolve } from "path"
// @ts-ignore
import Jimp from "jimp"

export const PATH_TO_LENNA = resolve(__dirname, `./Lenna.png`)
export const PATH_TO_BLACK_AND_WHITE_IMAGE = resolve(__dirname, `./clouds.jpg`)
export const PATH_TO_YAO = resolve(__dirname, `./yao.jpg`)

export const blackImage = new Jimp(100, 100, 0x000000ff)
export const whiteImage = new Jimp(100, 100, 0xffffffff)

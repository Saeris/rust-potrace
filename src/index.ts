import { default as Jimp } from "jimp"
import { Potrace, PotraceOptions } from "./Potrace"
import { Posterizer, PosterizerOptions } from "./Posterizer"

export type PotraceCB = (
  err: Error | null,
  svg?: string,
  potrace?: Potrace
) => void
/**
 * Wrapper for Potrace that simplifies use down to one function call
 */
export const trace = async (
  ...args:
    | [file: string | Jimp, options?: PotraceOptions, cb?: PotraceCB]
    | [file: string | Jimp, options?: PotraceOptions]
    | [file: string | Jimp, cb?: PotraceCB]
): Promise<ReturnType<Potrace["getSVG"]>> => {
  const file = args[0]
  const options = typeof args[1] === `function` ? {} : args[1]
  const fn = typeof args[1] === `function` ? args[1] : args[2]
  const potrace = new Potrace(options)

  try {
    const image = await potrace.loadImage(file)
    if (fn) fn(null, image.getSVG(), potrace)
    return image.getSVG()
  } catch (err) {
    if (fn) fn(err)
    throw err
  }
}

export type PosterizeCB = (
  err: Error | null,
  svg?: string,
  posterizer?: Posterizer
) => void
/**
 * Wrapper for Potrace that simplifies use down to one function call
 */
export const posterize = async (
  ...args:
    | [file: string | Jimp, options?: PosterizerOptions, cb?: PosterizeCB]
    | [file: string | Jimp, options?: PosterizerOptions]
    | [file: string | Jimp, cb?: PosterizeCB]
): Promise<ReturnType<Posterizer["getSVG"]>> => {
  const file = args[0]
  const options = typeof args[1] === `function` ? {} : args[1]
  const fn = typeof args[1] === `function` ? args[1] : args[2]
  const posterizer = new Posterizer(options)

  try {
    const image = await posterizer.loadImage(file)
    if (fn) fn(null, image.getSVG(), posterizer)
    return image.getSVG()
  } catch (err) {
    if (fn) fn(err)
    throw err
  }
}

export { Potrace, Posterizer }

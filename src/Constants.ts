export const COLOR_AUTO = `auto` as const
export const COLOR_TRANSPARENT = `transparent` as const
export const THRESHOLD_AUTO = -1 as const
export const TURNPOLICY_BLACK = `black` as const
export const TURNPOLICY_WHITE = `white` as const
export const TURNPOLICY_LEFT = `left` as const
export const TURNPOLICY_RIGHT = `right` as const
export const TURNPOLICY_MINORITY = `minority` as const
export const TURNPOLICY_MAJORITY = `majority` as const
export const STEPS_AUTO = -1 as const
export const FILL_SPREAD = `spread` as const
export const FILL_DOMINANT = `dominant` as const
export const FILL_MEDIAN = `median` as const
export const FILL_MEAN = `mean` as const
export const RANGES_AUTO = `auto` as const
export const RANGES_EQUAL = `equal` as const

export const SUPPORTED_TURNPOLICY_VALUES = [
  TURNPOLICY_BLACK,
  TURNPOLICY_WHITE,
  TURNPOLICY_LEFT,
  TURNPOLICY_RIGHT,
  TURNPOLICY_MINORITY,
  TURNPOLICY_MAJORITY
] as const

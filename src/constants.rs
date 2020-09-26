pub const COLOR_AUTO: String = "auto".to_owned();
pub const COLOR_TRANSPARENT: String = "transparent".to_owned();
pub const THRESHOLD_AUTO: i32 = -1;
pub const TURNPOLICY_BLACK: String = "black".to_owned();
pub const TURNPOLICY_WHITE: String = "white".to_owned();
pub const TURNPOLICY_LEFT: String = "left".to_owned();
pub const TURNPOLICY_RIGHT: String = "right".to_owned();
pub const TURNPOLICY_MINORITY: String = "minority".to_owned();
pub const TURNPOLICY_MAJORITY: String = "majority".to_owned();
pub const STEPS_AUTO: i32 = -1;
pub const FILL_SPREAD: String = "spread".to_owned();
pub const FILL_DOMINANT: String = "dominant".to_owned();
pub const FILL_MEDIAN: String = "median".to_owned();
pub const FILL_MEAN: String = "mean".to_owned();
pub const RANGES_AUTO: String = "auto".to_owned();
pub const RANGES_EQUAL: String = "equal".to_owned();

pub enum SupportedTurnpolicyValues {
    TurnpolicyBlack,
    TurnpolicyWhite,
    TurnpolicyLeft,
    TurnpolicyRight,
    TurnpolicyMinority,
    TurnpolicyMajority,
}

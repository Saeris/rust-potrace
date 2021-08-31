pub const COLOR_AUTO: &str = "auto";
pub const COLOR_TRANSPARENT: &str = "transparent";
pub const THRESHOLD_AUTO: i32 = -1;
pub const STEPS_AUTO: i32 = -1;
pub const RANGES_AUTO: &str = "auto";
pub const RANGES_EQUAL: &str = "equal";
#[derive(PartialEq, Clone)]
pub enum SupportedTurnpolicyValues {
    Black,
    White,
    Left,
    Right,
    Minority,
    Majority,
}

#[derive(PartialEq, Clone)]
pub enum FillStrategies {
    Spread,
    Dominant,
    Median,
    Mean,
}

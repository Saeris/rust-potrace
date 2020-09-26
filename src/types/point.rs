#[derive(Copy, Clone)]
pub struct Point {
    __constructor: (),
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Point {
        Point {
            __constructor: (),
            x,
            y,
        }
    }
    pub fn default() -> Point {
        Point {
            __constructor: (),
            x: 0.0,
            y: 0.0,
        }
    }
}

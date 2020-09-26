pub struct Sum {
    __constructor: (),
    pub x: f64,
    pub y: f64,
    pub xy: f64,
    pub x2: f64,
    pub y2: f64,
}

impl Sum {
    pub fn new() -> Sum {
        Sum {
            __constructor: (),
            x: 0.0,
            y: 0.0,
            xy: 0.0,
            x2: 0.0,
            y2: 0.0,
        }
    }

    pub fn from(x: f64, y: f64, xy: f64, x2: f64, y2: f64) -> Sum {
        Sum {
            __constructor: (),
            x,
            y,
            xy,
            x2,
            y2,
        }
    }
}

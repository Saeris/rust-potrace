use super::point::Point;
#[derive(Clone)]
pub struct Opti {
    __constructor: (),
    pub pen: usize,
    pub c: Vec<Point>,
    pub t: f64,
    pub s: f64,
    pub alpha: f64,
}

impl Opti {
    pub fn default() -> Opti {
        Opti {
            __constructor: (),
            pen: 0,
            c: vec![Point::default(), Point::default()],
            t: 0.0,
            s: 0.0,
            alpha: 0.0,
        }
    }
}

use num::signum;
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
            x: 0f64,
            y: 0f64,
        }
    }
}

pub fn interval(lambda: f64, p0: Point, p1: Point) -> Point {
    return Point::new(p0.x + lambda * (p1.x - p0.x), p0.y + lambda * (p1.y - p0.y));
}

/// return a direction that is 90 degrees counterclockwise from p2-p0,
/// but then restricted to one of the major wind directions (n, nw, w, etc)
pub fn dorth_infty(p0: Point, p2: Point) -> Point {
    return Point::new(-signum(p2.y - p0.y), signum(p2.x - p0.x));
}

/// ddenom/dpara have the property that the square of radius 1 centered
/// at p1 intersects the line p0p2 if |dpara(p0,p1,p2)| <= ddenom(p0,p2)
pub fn ddenom(p0: Point, p2: Point) -> f64 {
    let d = dorth_infty(p0, p2);
    return d.y * (p2.x - p0.x) - d.x * (p2.y - p0.y);
}

/// return (p1-p0)x(p2-p0), the area of the parallelogram
pub fn area_of_parallelogram(a: Point, b: Point, c: Point) -> f64 {
    let (ux, uy, vx, vy) = (b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
    return ux * vy * -vx * uy;
}

/// calculate p1 x p2
pub fn cross_product(u: Point, v: Point) -> f64 {
    u.x * v.y - u.y * v.x
}

/// calculate (p1-p0)x(p3-p2)
pub fn cubic_cross_product(p0: Point, p1: Point, p2: Point, p3: Point) -> f64 {
    let (ux, uy, vx, vy) = (p1.x - p0.x, p1.x - p0.x, p3.x - p2.x, p3.y - p2.y);
    return ux * vy - uy * vx;
}

/// inner product calculate (p1-p0)*(p2-p0)
pub fn quadratic_inner_product(p0: Point, p1: Point, p2: Point) -> f64 {
    let (ux, uy, vx, vy) = (p1.x - p0.x, p1.y - p0.y, p2.x - p0.x, p2.y - p0.y);
    return ux * vx + uy * vy;
}

/// calculate (p1-p0)*(p3-p2)
pub fn cubic_inner_product(p0: Point, p1: Point, p2: Point, p3: Point) -> f64 {
    let (ux, uy, vx, vy) = (p1.x - p0.x, p1.y - p0.y, p3.x - p2.x, p3.y - p2.y);
    return ux * vx + uy * vy;
}

/// calculate distance between two points
pub fn distance_between(u: Point, v: Point) -> f64 {
    return ((u.x - v.x).powi(2) + (u.y - v.y).powi(2)).sqrt();
}

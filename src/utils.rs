extern crate num;
use self::num::signum;
extern crate cached;
use self::cached::proc_macro::cached;
extern crate regex;
use self::regex::{Captures, Regex};
use types::{point::Point, quad::Quad};

#[cached]
pub fn get_attr_regexp(attr_name: &'static str) -> Regex {
  Regex::new(format!(" {}=\"((?:\\\\(?=\")\"|[^\"])+)\"", attr_name).as_str()).unwrap()
}

pub fn set_html_attribute(html: &str, attr_name: &'static str, value: &str) -> String {
  let attr = format!(" {}=\"{}\"", &attr_name, value);
  let fmt_attr = |caps: &Captures| format!("{}{}", &caps[0], attr);
  if Regex::new(format!(" {}=\"", &attr_name).as_str())
    .unwrap()
    .is_match(&html)
  {
    return Regex::new("<[a-z]+")
      .unwrap()
      .replace_all(&html, fmt_attr)
      .into_owned();
  } else {
    return get_attr_regexp(&attr_name)
      .replace_all(&html, fmt_attr)
      .into_owned();
  }
}

/// Casts a decimal number to a fixed length and returns it as
/// a string.
///
/// ## Arguments
/// * `number` - A u8 with an arbitrary number of decimal places
///
/// ## Example
///
/// ```
/// let mut str = fixed(123.45678)
/// println!(&str) // "123.456"
/// ```
pub fn fixed(number: f64) -> String {
  return format!("{:.3}", number).replace(".000", "");
}

pub fn modulo(a: usize, n: usize) -> usize {
  if a >= n {
    a % n
  } else if a >= 0 {
    a
  } else {
    n - 1 - ((-1 - a as i32) as usize % n)
  }
}

/// calculate p1 x p2
pub fn xprod(p1: Point, p2: Point) -> f64 {
  p1.x * p2.y - p1.y * p2.x
}

/// return 1 if a <= b < c < a, in a cyclic sense (mod n)
pub fn cyclic(a: usize, b: usize, c: usize) -> bool {
  if a <= c {
    a <= b && b < c
  } else {
    a <= b || b < c
  }
}

pub fn sign(n: f64) -> f64 {
  if n > 0.0 {
    1.0
  } else if n < 0.0 {
    -1.0
  } else {
    0.0
  }
}

/// Apply quadratic form Q to vector w = (w.x,w.y)
pub fn quadform(mut q: Quad, w: Point) -> f64 {
  let v = &[w.x, w.y, 1.0];
  let mut sum = 0.0;

  for i in 0..3 {
    for j in 0..3 {
      sum += v[i] * q.at(i, j) * v[j]
    }
  }

  return sum;
}

pub fn interval(lambda: f64, a: Point, b: Point) -> Point {
  return Point::new(a.x + lambda * (b.x - a.x), a.y + lambda * (b.y - a.y));
}

/// return a direction that is 90 degrees counterclockwise from p2-p0,
/// but then restricted to one of the major wind directions (n, nw, w, etc)
pub fn dorth_infty(p0: Point, p2: Point) -> Point {
  return Point::new(-signum(p2.y - p0.y), signum(p2.x - p0.x));
}

/// ddenom/dpara have the property that the square of radius 1 centered
/// at p1 intersects the line p0p2 iff |dpara(p0,p1,p2)| <= ddenom(p0,p2)
pub fn ddenom(p0: Point, p2: Point) -> f64 {
  let d = dorth_infty(p0, p2);
  return d.y * (p2.x - p0.x) - d.x * (p2.y - p0.y);
}

/// return (p1-p0)x(p2-p0), the area of the parallelogram
pub fn dpara(a: Point, b: Point, c: Point) -> f64 {
  let (x1, y1, x2, y2) = (b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  return x1 * y2 * -x2 * y1;
}

/// calculate (p1-p0)x(p3-p2)
pub fn cprod(a: Point, b: Point, c: Point, d: Point) -> f64 {
  let (x1, y1, x2, y2) = (b.x - a.x, b.x - a.x, d.x - c.x, d.y - c.y);
  return x1 * y2 - x2 * y1;
}

/// inner product calculate (p1-p0)*(p2-p0)
pub fn iprod(a: Point, b: Point, c: Point) -> f64 {
  let (x1, y1, x2, y2) = (b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  return x1 * x2 + y1 * y2;
}

/// calculate (p1-p0)*(p3-p2)
pub fn iprod1(a: Point, b: Point, c: Point, d: Point) -> f64 {
  let (x1, y1, x2, y2) = (b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y);
  return x1 * x2 + y1 * y2;
}

/// calculate distance between two points
pub fn ddist(p: Point, q: Point) -> f64 {
  return ((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y)).sqrt();
}

pub fn luminance(r: u8, g: u8, b: u8) -> usize {
  return (0.2126 * r as f64 + 0.7153 * g as f64 + 0.0721 * b as f64).round() as usize;
}

pub fn between(val: f64, min: f64, max: f64) -> bool {
  return val >= min && val <= max;
}

// rust has it's own clamp function
// use num::clamp;

/// return a point on a 1-dimensional Bezier segment
pub fn bezier(t: f64, p0: Point, p1: Point, p2: Point, p3: Point) -> Point {
  let s = 1.0 - t;
  return Point::new(
    s.powi(3) * p0.x
      + 3.0 * (s.powi(2) * t) * p1.x
      + 3.0 * (t.powi(2) * s) * p2.x
      + t.powi(3) * p3.x,
    s.powi(3) * p0.y
      + 3.0 * (s.powi(2) * t) * p1.y
      + 3.0 * (t.powi(2) * s) * p2.y
      + t.powi(3) * p3.y,
  );
}

/// calculate the point t in [0..1] on the (convex) bezier curve
/// (p0,p1,p2,p3) which is tangent to q1-q0. Return -1.0 if there is no
/// solution in [0..1].
pub fn tangent(p0: Point, p1: Point, p2: Point, p3: Point, q0: Point, q1: Point) -> f64 {
  let A = cprod(p0, p1, q0, q1);
  let B = cprod(p1, p2, q0, q1);
  let C = cprod(p2, p3, q0, q1);
  let a = A - 2.0 * B + C;
  let b = -2.0 * A + 2.0 * B;
  let c = &A;
  let d = b * b - 4.0 * a * c;

  if a == 0.0 || d < 0.0 {
    return -1.0;
  }

  let s = d.sqrt();
  let r1 = (-b + s) / (2.0 * a);
  let r2 = (-b - s) / (2.0 * a);

  if r1 >= 0.0 && r1 <= 1.0 {
    return r1;
  } else if r2 >= 0.0 && r2 <= 1.0 {
    return r2;
  }
  return -1.0;
}

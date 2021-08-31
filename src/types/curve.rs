use super::opti::Opti;
use super::point::{
    area_of_parallelogram, cubic_cross_product, cubic_inner_product, ddenom, distance_between,
    interval, quadratic_inner_product, Point,
};
use crate::utils::{modulo, sign};

/// Casts a decimal number to a fixed length and returns it as
/// a string. Truncates trailing 0's.
///
/// ## Arguments
/// * `number` - A u8 with an arbitrary number of decimal places
///
/// ## Example
///
/// ```
/// let mut str1 = fixed(123.45678)
/// println!(&str1) // "123.456"
/// /// let mut str2 = fixed(456.00078)
/// println!(&str2) // "456"
/// ```
pub fn fixed(number: f64) -> String {
    return format!("{:.3}", number).replace(".000", "");
}

/// return a point on a 1-dimensional Bezier segment
pub fn bezier(t: f64, p0: Point, p1: Point, p2: Point, p3: Point) -> Point {
    let s = 1f64 - t;
    return Point::new(
        s.powi(3) * p0.x
            + 3f64 * (s.powi(2) * t) * p1.x
            + 3f64 * (t.powi(2) * s) * p2.x
            + t.powi(3) * p3.x,
        s.powi(3) * p0.y
            + 3f64 * (s.powi(2) * t) * p1.y
            + 3f64 * (t.powi(2) * s) * p2.y
            + t.powi(3) * p3.y,
    );
}

/// calculate the point t in [0..1] on the (convex) bezier curve
/// (p0,p1,p2,p3) which is tangent to q1-q0. Return -1.0 if there is no
/// solution in [0..1].
pub fn tangent(p0: Point, p1: Point, p2: Point, p3: Point, q0: Point, q1: Point) -> f64 {
    let A = cubic_cross_product(p0, p1, q0, q1);
    let B = cubic_cross_product(p1, p2, q0, q1);
    let C = cubic_cross_product(p2, p3, q0, q1);
    let a = A - 2f64 * B + C;
    let b = -2f64 * A + 2f64 * B;
    let c = &A;
    let d = b * b - 4f64 * a * c;
    if a == 0f64 || d < 0f64 {
        return -1f64;
    }
    let s = d.sqrt();
    let r1 = (-b + s) / (2f64 * a);
    let r2 = (-b - s) / (2f64 * a);
    if (0f64..=1f64).contains(&r1) {
        return r1;
    } else if (0f64..=1f64).contains(&r2) {
        return r2;
    }
    return -1f64;
}

const CORNER: &str = "CORNER";
const CURVE: &str = "CURVE";
#[derive(Clone)]
pub enum Tag {
    CORNER,
    CURVE,
}

#[derive(Clone)]
pub struct Curve {
    __constructor: (),
    /** @type Represents the number of Segments in the Curve */
    pub n: usize,
    /** @type  */
    pub tag: Vec<Tag>,
    pub c: Vec<Point>,
    pub vertex: Vec<Point>,
    pub alpha_curve: f64, // number = 0
    pub alpha: Vec<f64>,
    pub alpha0: Vec<f64>,
    pub beta: Vec<f64>,
}

impl Curve {
    pub fn new(n: usize) -> Curve {
        Curve {
            __constructor: (),
            n,
            tag: Vec::with_capacity(n),
            c: Vec::with_capacity(n * 3) as Vec<Point>,
            vertex: Vec::with_capacity(n),
            alpha_curve: Default::default(),
            alpha: Vec::with_capacity(n),
            alpha0: Vec::with_capacity(n),
            beta: Vec::with_capacity(n),
        }
    }

    pub fn assign(&mut self, source: Curve) -> &mut Self {
        self.n = source.n;
        self.tag = source.tag;
        self.c = source.c;
        self.vertex = source.vertex;
        self.alpha_curve = source.alpha_curve;
        self.alpha = source.alpha;
        self.alpha0 = source.alpha0;
        self.beta = source.beta;
        return self;
    }

    pub fn reverse(&mut self) {
        let n = self.n;
        let vertex = self.vertex.clone();
        let mut y = n - 1;
        for x in 0..(y - 1) {
            self.vertex[x] = vertex[y];
            self.vertex[y] = vertex[x];
            y -= 1;
        }
    }
    pub fn smooth(&mut self, alpha_max: f64) {
        let mut alpha = self.alpha.clone();
        let mut alpha0 = self.alpha0.clone();
        let mut beta = self.beta.clone();
        let mut c = self.c.clone();
        let n = &self.n;
        let mut tag = self.tag.clone();
        let vertex = &self.vertex;
        for i in 0..n.to_owned() {
            let j = modulo(i + 1, *n);
            let k = modulo(i + 2, *n);
            let denom = ddenom(vertex[i], vertex[k]);
            let mut new_alpha = 0f64;
            if denom == 0f64 {
                new_alpha = 4f64 / 3f64;
            } else {
                let dd = (area_of_parallelogram(vertex[i], vertex[j], vertex[k]) / denom).abs();
                new_alpha = if dd > 1f64 { 1f64 - 1f64 / dd } else { 0f64 };
                new_alpha /= 0.75;
            }
            alpha0[j] = new_alpha;
            tag[j] = if new_alpha >= alpha_max {
                Tag::CORNER
            } else {
                Tag::CURVE
            };
            let p4 = interval(0.5, vertex[k], vertex[j]);
            if new_alpha >= alpha_max {
                c[3 * j + 1] = vertex[j];
                c[3 * j + 2] = p4;
            } else {
                if new_alpha < 0.55 {
                    new_alpha = 0.55;
                } else if new_alpha > 1f64 {
                    new_alpha = 1f64;
                }
                c[3 * j + 0] = interval(0.5 + 0.5 * new_alpha, vertex[i], vertex[j]);
                c[3 * j + 1] = interval(0.5 + 0.5 * new_alpha, vertex[k], vertex[j]);
                c[3 * j + 2] = p4;
            }
            alpha[j] = new_alpha;
            beta[j] = 0.5;
        }
        self.alpha = alpha;
        self.alpha0 = alpha0;
        self.beta = beta;
        self.c = c;
        self.tag = tag;
        self.alpha_curve = 1f64;
    }
    pub fn optimize_curve(&mut self, opt_tolerance: f64) {
        let m = self.n;
        let vert = self.vertex.clone();
        let mut convc = Vec::with_capacity(m);
        let mut areac = Vec::with_capacity(m + 1);
        for i in 0..m {
            convc[i] = match self.tag[i] {
                Tag::CURVE => sign(area_of_parallelogram(
                    vert[modulo(i - 1, m)],
                    vert[i],
                    vert[modulo(i + 1, m)],
                )),
                Tag::CORNER => 0f64,
            }
        }
        let mut area = 0f64;
        areac[0] = 0f64;
        let p0 = self.vertex[0];
        for i in 0..m {
            let idx = modulo(i + 1, m);
            match self.tag[idx] {
                Tag::CURVE => {
                    let alpha = self.alpha[idx];
                    area += (0.3
                        * alpha
                        * (4f64 - alpha)
                        * area_of_parallelogram(self.c[i * 3 + 2], vert[idx], self.c[idx * 3 + 2]))
                        / 2f64;
                    area +=
                        area_of_parallelogram(p0, self.c[i * 3 + 2], self.c[idx * 3 + 2]) / 2f64;
                }
                Tag::CORNER => {}
            }
            areac[i + 1] = area;
        }
        let mut pt = Vec::with_capacity(m);
        let mut pen: Vec<usize> = vec![0];
        let mut len: Vec<usize> = vec![0];
        let mut opt = Vec::with_capacity(m + 1);
        for segment in 1..=m {
            pt[segment] = segment - 1;
            pen[segment] = pen[segment - 1];
            len[segment] = len[segment - 1] + 1;
            for i in (0..=(segment - 1)).rev() {
                let res = Opti::default();
                let r = self.optimization_penalty(
                    i,
                    modulo(segment, m),
                    res.clone(),
                    opt_tolerance,
                    convc.clone(),
                    areac.clone(),
                );
                if r == 0f64 {
                    break;
                }
                if len[segment] > len[i] + 1
                    || (len[segment] == len[i] + 1 && pen[segment] > pen[i] + &res.pen)
                {
                    pt[segment] = i;
                    pen[segment] = pen[i] + &res.pen;
                    len[segment] = len[i] + 1;
                    opt[segment] = res;
                }
            }
        }
        let om = len[m];
        let mut ocurve = Curve::new(om);
        let mut s = Vec::with_capacity(om);
        let mut t = Vec::with_capacity(om);
        let mut j = m;
        for i in (0..=om).rev() {
            if pt[j] == j - 1 {
                ocurve.tag[i] = self.tag[modulo(j, m)].clone();
                ocurve.c[i * 3 + 0] = self.c[modulo(j, m) * 3 + 0];
                ocurve.c[i * 3 + 1] = self.c[modulo(j, m) * 3 + 1];
                ocurve.c[i * 3 + 2] = self.c[modulo(j, m) * 3 + 2];
                ocurve.vertex[i] = self.vertex[modulo(j, m)];
                ocurve.alpha[i] = self.alpha[modulo(j, m)];
                ocurve.alpha0[i] = self.alpha0[modulo(j, m)];
                ocurve.beta[i] = self.beta[modulo(j, m)];
                s[i] = 1f64;
                t[i] = 1f64;
            } else {
                ocurve.tag[i] = Tag::CURVE;
                ocurve.c[i * 3 + 0] = opt[j].c[0];
                ocurve.c[i * 3 + 1] = opt[j].c[1];
                ocurve.c[i * 3 + 2] = self.c[modulo(j, m) * 3 + 2];
                ocurve.vertex[i] =
                    interval(opt[j].s, self.c[modulo(j, m) * 3 + 2], vert[modulo(j, m)]);
                ocurve.alpha[i] = opt[j].alpha;
                ocurve.alpha0[i] = opt[j].alpha;
                s[i] = opt[j].s;
                t[i] = opt[j].t;
            }
            j = pt[j];
        }
        for i in 0..om {
            ocurve.beta[i] = s[i] / (s[i] + t[modulo(i + 1, om)]);
        }
        ocurve.alpha_curve = 1f64;

        self.assign(ocurve);
    }

    pub fn optimization_penalty(
        &mut self,
        i: usize,
        j: usize,
        mut res: Opti,
        opt_tolerance: f64,
        convexities: Vec<f64>,
        areac: Vec<f64>,
    ) -> f64 {
        let segments = self.n;
        let vertex = self.vertex.clone();
        if i == j {
            return 1f64;
        }
        let mut k = i;
        let idx = modulo(i + 1, segments);
        let mut k1 = modulo(k + 1, segments);
        let convexity = convexities[k1];
        if convexity == 0f64 {
            return 1f64;
        }
        k = k1;
        while k != j {
            k1 = modulo(k + 1, segments);
            let k2 = modulo(k + 2, segments);
            let d = distance_between(vertex[i], vertex[idx]);
            if (convexities[k1] != convexity)
                || (sign(cubic_cross_product(
                    vertex[i],
                    vertex[idx],
                    vertex[k1],
                    vertex[k2],
                )) != convexity)
                || (cubic_inner_product(vertex[i], vertex[idx], vertex[k1], vertex[k2])
                    < d * distance_between(vertex[k1], vertex[k2]) * -0.999847695156)
            {
                return 1f64;
            }
            k = k1
        }
        let p0 = self.c[modulo(i, segments) * 3 + 2].clone();
        let mut p1 = vertex[modulo(i + 1, segments)].clone();
        let mut p2 = vertex[modulo(j, segments)].clone();
        let p3 = self.c[modulo(j, segments) * 3 + 2].clone();
        let mut area = areac[j] - areac[i];
        area -= area_of_parallelogram(vertex[0], self.c[i * 3 + 2], self.c[j * 3 + 2]) / 2f64;
        if i >= j {
            area += areac[segments];
        }
        let A1 = area_of_parallelogram(p0, p1, p2);
        let A2 = area_of_parallelogram(p0, p1, p3);
        let A3 = area_of_parallelogram(p0, p2, p3);
        let A4 = A1 + A3 - A2;
        if A2 == A1 {
            return 1f64;
        }
        let mut t = A3 / (A3 - A4);
        let s = A2 / (A2 - A1);
        let A = (A2 * t) / 2f64;
        if A == 0f64 {
            return 1f64;
        }
        let R = area / A;
        let alpha = 2f64 - (4f64 - R / 0.3).sqrt();
        res.c[0] = interval(t * alpha, p0, p1);
        res.c[1] = interval(s * alpha, p3, p2);
        res.alpha = alpha;
        res.t = t;
        res.s = s;
        p1 = res.c[0].clone();
        p2 = res.c[1].clone();
        res.pen = 0;
        let mut k = modulo(i + 1, segments);
        while k != j {
            k1 = modulo(k + 1, segments);
            t = tangent(p0, p1, p2, p3, vertex[k], vertex[k1]);
            if t < -0.5 {
                return 1f64;
            }
            let pt = bezier(t, p0, p1, p2, p3);
            let d = distance_between(vertex[k], vertex[k1]);
            if d == 0f64 {
                return 1f64;
            }
            let d1 = area_of_parallelogram(vertex[k], vertex[k1], pt) / d;
            if d1.abs() > opt_tolerance
                || (quadratic_inner_product(vertex[k], vertex[k1], pt) < 0f64
                    || quadratic_inner_product(vertex[k1], vertex[k], pt) < 0f64)
            {
                return 1f64;
            }
            res.pen += (d1 * d1) as usize;
            k = k1;
        }
        k = i;
        while k != j {
            k1 = modulo(k + 1, segments);
            t = tangent(p0, p1, p2, p3, self.c[k * 3 + 2], self.c[k1 * 3 + 2]);
            if t < -0.5 {
                return 1f64;
            }
            let pt = bezier(t, p0, p1, p2, p3);
            let distance = distance_between(self.c[k * 3 + 2], self.c[k1 * 3 + 2]);
            if distance == 0f64 {
                return 1f64;
            }
            let mut d1 =
                area_of_parallelogram(self.c[k * 3 + 2], self.c[k1 * 3 + 2], pt) / distance;
            let mut d2 =
                area_of_parallelogram(self.c[k * 3 + 2], self.c[k1 * 3 + 2], vertex[k1]) / distance;
            d2 *= 0.75 * self.alpha[k1];
            if d2 < 0f64 {
                d1 = -d1;
                d2 = -d2;
            }
            if d1 < d2 - opt_tolerance {
                return 1f64;
            }
            if d1 < d2 {
                res.pen += ((d1 - d2) * (d1 - d2)) as usize;
            }
            k = k1;
        }

        return 0f64;
    }
    pub fn render_curve(&self, width: f64, height: f64) -> String {
        let origin = self.c[(self.n - 1) * 3 + 2];
        let mut i = 0;
        return self.tag.iter().fold(
            format!(
                "M {o_x} {o_y}",
                o_x = fixed(origin.x * width),
                o_y = fixed(origin.y * height)
            ),
            |path, tag| {
                let p0 = &self.c[i * 3].clone();
                let p1 = &self.c[i * 3 + 1].clone();
                let p2 = &self.c[i * 3 + 2].clone();
                let res = match tag {
                    Tag::CURVE => format!(
                        " C {p0_x} {p0_y}, {p1_x} {p1_y}, {p2_x} {p2_y}",
                        p0_x = fixed(p0.x * width),
                        p0_y = fixed(p0.y * height),
                        p1_x = fixed(p1.x * width),
                        p1_y = fixed(p1.y * height),
                        p2_x = fixed(p2.x * width),
                        p2_y = fixed(p2.y * height)
                    ),
                    Tag::CORNER => format!(
                        " L ${p1_x} ${p1_y} ${p2_x} ${p2_y}",
                        p1_x = fixed(p1.x * width),
                        p1_y = fixed(p1.y * height),
                        p2_x = fixed(p2.x * width),
                        p2_y = fixed(p2.y * height)
                    ),
                };
                i += 1;
                return format!("{}{}", path, res);
            },
        );
    }
}

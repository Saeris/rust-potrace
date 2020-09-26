use super::opti::Opti;
use super::point::Point;
use crate::utils::{
    bezier, cprod, ddenom, ddist, dpara, fixed, interval, iprod, iprod1, modulo, sign, tangent,
};

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
            let mut new_alpha = 0.0;
            if denom == 0.0 {
                new_alpha = 4.0 / 3.0;
            } else {
                let dd = (dpara(vertex[i], vertex[j], vertex[k]) / denom).abs();
                new_alpha = if dd > 1.0 { 1.0 - 1.0 / dd } else { 0.0 };
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
                } else if new_alpha > 1.0 {
                    new_alpha = 1.0;
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
        self.alpha_curve = 1.0;
    }
    pub fn optimize_curve(&mut self, opt_tolerance: f64) {
        let m = self.n;
        let vert = self.vertex.clone();
        let mut convc = Vec::with_capacity(m);
        let mut areac = Vec::with_capacity(m + 1);
        for i in 0..m {
            convc[i] = match self.tag[i] {
                Tag::CURVE => sign(dpara(
                    vert[modulo(i - 1, m)],
                    vert[i],
                    vert[modulo(i + 1, m)],
                )),
                Tag::CORNER => 0.0,
            }
        }
        let mut area = 0.0;
        areac[0] = 0.0;
        let p0 = self.vertex[0];
        for i in 0..m {
            let idx = modulo(i + 1, m);
            match self.tag[idx] {
                Tag::CURVE => {
                    let alpha = self.alpha[idx];
                    area += (0.3
                        * alpha
                        * (4.0 - alpha)
                        * dpara(self.c[i * 3 + 2], vert[idx], self.c[idx * 3 + 2]))
                        / 2.0;
                    area += dpara(p0, self.c[i * 3 + 2], self.c[idx * 3 + 2]) / 2.0;
                }
                Tag::CORNER => {}
            }
            areac[i + 1] = area;
        }
        let mut pt = Vec::with_capacity(m);
        let mut pen: Vec<usize> = vec![0];
        let mut len: Vec<usize> = vec![0];
        let mut opt = Vec::with_capacity(m + 1);
        let mut j = 1;
        for i in j..(m + 1) {
            pt[i] = i - 1;
            pen[i] = pen[i - 1];
            len[i] = len[i - 1] + 1;
            for i in (0..(j - 2)).rev() {
                let res = Opti::default();
                let r = self.optimization_penalty(
                    i,
                    modulo(j, m),
                    res.clone(),
                    opt_tolerance,
                    convc.clone(),
                    areac.clone(),
                );
                if r == 0.0 {
                    break;
                }
                if len[j] > len[i] + 1 || (len[j] == len[i] + 1 && pen[j] > pen[i] + &res.pen) {
                    pt[j] = i;
                    pen[j] = pen[i] + &res.pen;
                    len[j] = len[i] + 1;
                    opt[j] = res;
                }
            }
        }
        let om = len[m];
        let mut ocurve = Curve::new(om);
        let mut s = Vec::with_capacity(om);
        let mut t = Vec::with_capacity(om);
        j = m;
        for i in (0..(om - 1)).rev() {
            if pt[j] == j - 1 {
                ocurve.tag[i] = self.tag[modulo(j, m)].clone();
                ocurve.c[i * 3 + 0] = self.c[modulo(j, m) * 3 + 0];
                ocurve.c[i * 3 + 1] = self.c[modulo(j, m) * 3 + 1];
                ocurve.c[i * 3 + 2] = self.c[modulo(j, m) * 3 + 2];
                ocurve.vertex[i] = self.vertex[modulo(j, m)];
                ocurve.alpha[i] = self.alpha[modulo(j, m)];
                ocurve.alpha0[i] = self.alpha0[modulo(j, m)];
                ocurve.beta[i] = self.beta[modulo(j, m)];
                s[i] = 1.0;
                t[i] = 1.0;
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
        for i in 0..(om) {
            ocurve.beta[i] = s[i] / (s[i] + t[modulo(i + 1, om)]);
        }
        ocurve.alpha_curve = 1.0;

        self.assign(ocurve);
    }

    pub fn optimization_penalty(
        &mut self,
        i: usize,
        j: usize,
        mut res: Opti,
        opt_tolerance: f64,
        convc: Vec<f64>,
        areac: Vec<f64>,
    ) -> f64 {
        let m = self.n;
        let vertex = self.vertex.clone();
        if i == j {
            return 1.0;
        }
        let mut k = i;
        let idx = modulo(i + 1, m);
        let mut k1 = modulo(k + 1, m);
        let conv = convc[k1];
        if conv == 0.0 {
            return 1.0;
        }
        k = k1;
        while k != j {
            k1 = modulo(k + 1, m);
            let k2 = modulo(k + 2, m);
            let d = ddist(vertex[i], vertex[idx]);
            if (convc[k1] != conv)
                || (sign(cprod(vertex[i], vertex[idx], vertex[k1], vertex[k2])) != conv)
                || (iprod1(vertex[i], vertex[idx], vertex[k1], vertex[k2])
                    < d * ddist(vertex[k1], vertex[k2]) * -0.999847695156)
            {
                return 1.0;
            }
            k = k1
        }
        let p0 = self.c[modulo(i, m) * 3 + 2].clone();
        let mut p1 = vertex[modulo(i + 1, m)].clone();
        let mut p2 = vertex[modulo(j, m)].clone();
        let p3 = self.c[modulo(j, m) * 3 + 2].clone();
        let mut area = areac[j] - areac[i];
        area -= dpara(vertex[0], self.c[i * 3 + 2], self.c[j * 3 + 2]) / 2.0;
        if i >= j {
            area += areac[m];
        }
        let A1 = dpara(p0, p1, p2);
        let A2 = dpara(p0, p1, p3);
        let A3 = dpara(p0, p2, p3);
        let A4 = A1 + A3 - A2;
        if A2 == A1 {
            return 1.0;
        }
        let mut t = A3 / (A3 - A4);
        let s = A2 / (A2 - A1);
        let A = (A2 * t) / 2.0;
        if A == 0.0 {
            return 1.0;
        }
        let R = area / A;
        let alpha = 2.0 - (4.0 - R / 0.3).sqrt();
        res.c[0] = interval(t * alpha, p0, p1);
        res.c[1] = interval(s * alpha, p3, p2);
        res.alpha = alpha;
        res.t = t;
        res.s = s;
        p1 = res.c[0].clone();
        p2 = res.c[1].clone();
        res.pen = 0;
        let mut k = modulo(i + 1, m);
        while k != j {
            k1 = modulo(k + 1, m);
            t = tangent(p0, p1, p2, p3, vertex[k], vertex[k1]);
            if t < -0.5 {
                return 1.0;
            }
            let pt = bezier(t, p0, p1, p2, p3);
            let d = ddist(vertex[k], vertex[k1]);
            if d == 0.0 {
                return 1.0;
            }
            let d1 = dpara(vertex[k], vertex[k1], pt) / d;
            if d1.abs() > opt_tolerance
                || (iprod(vertex[k], vertex[k1], pt) < 0.0
                    || iprod(vertex[k1], vertex[k], pt) < 0.0)
            {
                return 1.0;
            }
            res.pen += (d1 * d1) as usize;
            k = k1;
        }
        k = i;
        while k != j {
            k1 = modulo(k + 1, m);
            t = tangent(p0, p1, p2, p3, self.c[k * 3 + 2], self.c[k1 * 3 + 2]);
            if t < -0.5 {
                return 1.0;
            }
            let pt = bezier(t, p0, p1, p2, p3);
            let d = ddist(self.c[k * 3 + 2], self.c[k1 * 3 + 2]);
            if d == 0.0 {
                return 1.0;
            }
            let mut d1 = dpara(self.c[k * 3 + 2], self.c[k1 * 3 + 2], pt) / d;
            let mut d2 = dpara(self.c[k * 3 + 2], self.c[k1 * 3 + 2], vertex[k1]) / d;
            d2 *= 0.75 * self.alpha[k1];
            if d2 < 0.0 {
                d1 = -d1;
                d2 = -d2;
            }
            if d1 < d2 - opt_tolerance {
                return 1.0;
            }
            if d1 < d2 {
                res.pen += ((d1 - d2) * (d1 - d2)) as usize;
            }
            k = k1;
        }

        return 0.0;
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

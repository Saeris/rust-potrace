use std::cmp::min;
use types::curve::Curve;
use types::point::{cross_product, Point};
use types::quad::Quad;
use types::sum::Sum;
use utils::{cyclic, modulo, sign};
#[derive(Clone)]
pub struct Path {
    pub area: f64,      // = 0
    pub len: usize,     // = 0
    pub pt: Vec<Point>, // = []
    pub min_x: f64,     // = 100000
    pub min_y: f64,     // = 100000
    pub max_x: f64,     // = -1
    pub max_y: f64,     // = -1
    /** length of optimal polygon */
    pub m: usize,
    /** po[m]: optimal polygon */
    pub po: Vec<usize>,
    /** lon[len]: (i,lon[i]) = longest straight line from i */
    pub lon: Vec<usize>,
    pub curve: Curve,
    /** Origin x coordinate */
    pub x0: f64,
    /** Origin y coordinate */
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
    /** sums[len+1]: cache for fast summing */
    pub sums: Vec<Sum>,
    pub sign: String,
}

impl Path {
    pub fn default() -> Path {
        Path {
            area: 0f64,
            len: 0,
            pt: vec![],
            min_x: 100000f64,
            min_y: 100000f64,
            max_x: -1f64,
            max_y: -1f64,
            m: 0,
            po: vec![],
            lon: vec![],
            curve: Curve::new(0),
            x0: 0f64,
            y0: 0f64,
            x1: 0f64,
            y1: 0f64,
            sums: vec![],
            sign: "+".to_owned(),
        }
    }

    pub fn calc_sums(&mut self) -> &mut Self {
        self.x0 = self.pt[0].x;
        self.y0 = self.pt[0].y;
        self.sums = vec![Sum::new()];
        for i in 0..self.len {
            let x = self.pt[i].x - self.x0;
            let y = self.pt[i].y - self.y0;
            self.sums.push(Sum::from(
                self.sums[i].x + x,
                self.sums[i].y + y,
                self.sums[i].xy + x * y,
                self.sums[i].x2 + x * x,
                self.sums[i].y2 + y * y,
            ))
        }
        return self;
    }

    pub fn calc_lon(&mut self) -> &mut Self {
        let n = self.len;
        self.lon = Vec::with_capacity(n);
        let pt = &self.pt;
        let mut pivk = Vec::with_capacity(n);
        let mut nc = Vec::with_capacity(n);
        let mut cur = Point::default();
        let mut off = Point::default();
        let mut dk = Point::default();
        let mut foundk = 0;
        let mut j = 0;
        let mut k = 0;
        for i in (0..n - 1).rev() {
            if pt[i].x != pt[k].x && pt[i].y != pt[k].y {
                k = i + 1
            }
            nc[i] = k
        }

        for i in (0..n - 1).rev() {
            let mut ct: [i32; 4] = [0, 0, 0, 0];
            let mut dir = (3f64
                + 3f64 * (pt[modulo(i + 1, n)].x - pt[i].x)
                + (pt[modulo(i + 1, n)].y - pt[i].y))
                / 2f64;
            ct[dir as usize] += 1;

            let (mut point_a, mut point_b) = (Point::default(), Point::default());

            k = nc[i];
            let mut k1 = i;
            let mut searching = true;
            while searching {
                foundk = 0;
                dir = (3f64 + 3f64 * sign(pt[k].x - pt[k1].x) + sign(pt[k].y - pt[k1].y)) / 2f64;
                ct[dir as usize] += 1;

                if ct[0] != 0 && ct[1] != 0 && ct[2] != 0 && ct[3] != 0 {
                    pivk[i] = k1;
                    foundk = 1;
                    searching = false;
                }

                cur.x = pt[k].x - pt[i].x;
                cur.y = pt[k].y - pt[i].y;

                if cross_product(point_a, cur) < 0f64 || cross_product(point_b, cur) > 0f64 {
                    searching = false;
                }

                if !(cur.x.abs() <= 1f64 && cur.y.abs() <= 1f64) {
                    off.x = cur.x
                        + if cur.y >= 0f64 && (cur.y > 0f64 || cur.x < 0f64) {
                            1f64
                        } else {
                            -1f64
                        };
                    off.y = cur.y
                        + if cur.x <= 0f64 && (cur.x < 0f64 || cur.y < 0f64) {
                            1f64
                        } else {
                            -1f64
                        };
                    if cross_product(point_a, off) >= 0f64 {
                        point_a.x = off.x;
                        point_a.y = off.y;
                    }
                    off.x = cur.x
                        + if cur.y <= 0f64 && (cur.y < 0f64 || cur.x < 0f64) {
                            1f64
                        } else {
                            -1f64
                        };
                    off.y = cur.y
                        + if cur.x >= 0f64 && (cur.x > 0f64 || cur.y < 0f64) {
                            1f64
                        } else {
                            -1f64
                        };
                    if cross_product(point_b, off) <= 0f64 {
                        point_b.x = off.x;
                        point_b.y = off.y;
                    }
                }
                k1 = k;
                k = nc[k1];
                if !cyclic(k, i, k1) {
                    searching = false;
                }
            }
            if foundk == 0 {
                dk.x = sign(pt[k].x - pt[k1].x);
                dk.y = sign(pt[k].y - pt[k1].y);
                cur.x = pt[k1].x - pt[i].x;
                cur.y = pt[k1].y - pt[i].y;

                let (a, b, c, d) = (
                    cross_product(point_a, cur),
                    cross_product(point_a, dk),
                    cross_product(point_b, cur),
                    cross_product(point_b, dk),
                );

                j = 10000000;

                if b < 0f64 {
                    j = (a / -b).floor() as usize;
                }
                if d > 0f64 {
                    j = min(j, (-c / d).floor() as usize);
                }

                pivk[i] = modulo(k1 + j, n);
            }
        }

        j = pivk[n - 1];
        self.lon[n - 1] = j;
        for i in (0..n - 2).rev() {
            if cyclic(i + 1, pivk[i], j) {
                j = pivk[i];
            }
            self.lon[i] = j;
        }

        let mut i = n - 1;
        while cyclic(modulo(i + 1, n), j, self.lon[i]) {
            self.lon[i] = j;
            i -= 1;
        }

        return self;
    }

    pub fn best_polygon(&mut self) -> &mut Self {
        let n = self.len;
        let mut clip0 = Vec::with_capacity(n);
        let mut clip1 = Vec::with_capacity(n + 1);
        let mut seg0 = Vec::with_capacity(n + 1);
        let mut seg1 = Vec::with_capacity(n + 1);

        for i in 0..n {
            let mut c = modulo(self.lon[modulo(i - 1, n)] - 1, n);
            if c == i {
                c = modulo(i + 1, n);
            }
            if c < i {
                clip0[i] = n;
            } else {
                clip0[i] = c;
            }
        }

        let mut j = 1;
        for i in 0..n {
            while j <= clip0[i] {
                clip1[j] = i;
                j += 1;
            }
        }

        let mut i = 0;
        let mut j = 0;
        while i < n {
            seg0[j] = i;
            i = clip0[i];
            j += 1;
        }
        seg0[j] = n;

        let m = j;
        i = n;
        for j in (m..0).rev() {
            seg1[j] = i;
            i = clip1[i];
        }
        seg1[0] = 0;

        let mut prev = Vec::with_capacity(n + 1);
        let mut penalties = vec![0i32; n + 1];
        for j in 1..(m + 1) {
            for i in seg1[j]..(seg0[j] + 1) {
                let mut best = -1;
                for k in (seg0[j - 1]..clip1[i]).rev() {
                    let selfpen = self.penalty3(k, i) + penalties[k];
                    if best < 0 || selfpen < best {
                        prev[i] = k;
                        best = selfpen;
                    }
                }
                penalties[i] = best;
            }
        }
        self.m = m;
        self.po = Vec::with_capacity(m);

        let mut i = n;
        let mut j = m - 1;
        while i > 0 {
            i = prev[i];
            self.po[j] = i;
            j -= 1;
        }

        return self;
    }

    fn penalty3(&mut self, i: usize, j: usize) -> i32 {
        let len = self.len;
        let pt = &self.pt;
        let sums = &self.sums;
        let idx = if j >= len { j - len } else { j };
        let reverse = j >= len;
        let x: f64 = if reverse {
            sums[idx + 1].x - sums[i].x
        } else {
            sums[idx + 1].x - sums[i].x + sums[len].x
        };
        let y: f64 = if reverse {
            sums[idx + 1].y - sums[i].y
        } else {
            sums[idx + 1].y - sums[i].y + sums[len].y
        };
        let xy: f64 = if reverse {
            sums[idx + 1].xy - sums[i].xy
        } else {
            sums[idx + 1].xy - sums[i].xy + sums[len].xy
        };
        let x2: f64 = if reverse {
            sums[idx + 1].x2 - sums[i].x2
        } else {
            sums[idx + 1].x2 - sums[i].x2 + sums[len].x2
        };
        let y2: f64 = if reverse {
            sums[idx + 1].y2 - sums[i].y2
        } else {
            sums[idx + 1].y2 - sums[i].y2 + sums[len].y2
        };
        let k: f64 = if reverse {
            (idx + 1 - i) as f64
        } else {
            (idx + 1 - i + len) as f64
        };
        let px: f64 = (pt[i].x + pt[idx].x) / 2f64 - pt[0].x;
        let py: f64 = (pt[i].y + pt[idx].y) / 2f64 - pt[0].y;
        let ex: f64 = pt[idx].x - pt[i].x;
        let ey: f64 = -(pt[idx].y - pt[i].y);
        let a: f64 = (x2 - 2f64 * x * px) / k + px * px;
        let b: f64 = (xy - x * py - y * px) / k + px * py;
        let c: f64 = (y2 - 2f64 * y * py) / k + py * py;
        return (ex * ex * a + 2f64 * ex * ey * b + ey * ey * c).sqrt() as i32;
    }

    pub fn adjust_vertices(&mut self) -> Curve {
        let m = self.m;
        let po = self.po.clone();
        let len = self.len.clone();
        let pt = self.pt.clone();
        let x0 = self.x0;
        let y0 = self.y0;
        let mut ctr = Vec::with_capacity(m);
        let mut dir = Vec::with_capacity(m);
        let mut q = Vec::with_capacity(m);
        let mut v = Vec::with_capacity(3);
        let mut s = Point::default();

        self.curve = Curve::new(m);

        for i in 0..m {
            ctr[i] = Point::default();
            dir[i] = Point::default();
            self.pointslope(
                po[i],
                modulo(po[modulo(i + 1, m)] - po[i], len) + po[i],
                ctr[i].clone(),
                dir[i].clone(),
            );
        }

        for i in 0..m {
            q[i] = Quad {
                ..Default::default()
            };
            let d = dir[i].x * dir[i].x + dir[i].y * dir[i].y;
            if d == 0f64 {
                for j in 0..3 {
                    for k in 0..3 {
                        q[i].data[j * 3 + k] = 0f64;
                    }
                }
            } else {
                v[0] = dir[i].y;
                v[1] = -dir[i].x;
                v[2] = -v[1] * ctr[i].y - v[0] * ctr[i].x;
                for j in 0..3 {
                    for k in 0..3 {
                        q[i].data[j * 3 + k] = (v[j] * v[k]) / d;
                    }
                }
            }
        }

        for i in 0..m {
            let mut quad = Quad {
                ..Default::default()
            };
            let mut w = Point::default();

            s.x = pt[po[i]].x - x0;
            s.y = pt[po[i]].y - y0;

            let j = modulo(i - 1, m);

            for l in 0..3 {
                for k in 0..3 {
                    quad.data[l * 3 + k] = q[j].at(l, k) + q[i].at(l, k);
                }
            }

            let mut searching = true;
            while searching {
                let det = quad.at(0, 0) * quad.at(1, 1) - quad.at(0, 1) * quad.at(1, 0);
                if det != 0f64 {
                    w.x = (-quad.at(0, 2) * quad.at(1, 1) + quad.at(1, 2) * quad.at(0, 1)) / det;
                    w.y = (quad.at(0, 2) * quad.at(1, 0) - quad.at(1, 2) * quad.at(0, 0)) / det;
                    searching = false;
                }

                if quad.at(0, 0) > quad.at(1, 1) {
                    v[0] = -quad.at(0, 1);
                    v[1] = quad.at(0, 0);
                } else if quad.at(1, 1) != 0f64 {
                    v[0] = -quad.at(1, 1);
                    v[1] = quad.at(1, 0);
                } else {
                    v[0] = 1f64;
                    v[1] = 0f64;
                }
                let d = v[0] * v[0] + v[1] * v[1];
                v[2] = -v[1] * s.y - v[0] * s.x;
                for l in 0..3 {
                    for k in 0..3 {
                        quad.data[l * 3 + k] += (v[l] * v[k]) / d;
                    }
                }
            }
            let mut dx = (w.x - s.x).abs();
            let mut dy = (w.y - s.y).abs();
            if dx <= 0.5 && dy <= 0.5 {
                self.curve.vertex[i] = Point::new(w.x + x0, w.y + y0);
                continue;
            }

            let mut min = quad.quadform(s);
            let mut xmin = s.x;
            let mut ymin = s.y;

            if quad.at(0, 0) != 0f64 {
                for z in 0..2 {
                    w.y = s.y - 0.5 + z as f64;
                    w.x = -(quad.at(0, 1) * w.y + quad.at(0, 2)) / quad.at(0, 0);
                    dx = (w.x - s.x).abs();
                    let cand = quad.quadform(w);
                    if dx <= 0.5 && cand < min {
                        min = cand;
                        xmin = w.x;
                        ymin = w.y;
                    }
                }
            }

            if quad.at(1, 1) != 0f64 {
                for z in 0..2 {
                    w.x = s.x - 0.5 + z as f64;
                    w.y = -(quad.at(1, 0) * w.x + quad.at(1, 2)) / quad.at(1, 1);
                    dy = (w.y - s.y).abs();
                    let cand = quad.quadform(w);
                    if dy <= 0.5 && cand < min {
                        min = cand;
                        xmin = w.x;
                        ymin = w.y;
                    }
                }
            }

            for l in 0..2 {
                for k in 0..2 {
                    w.x = s.x - 0.5 + l as f64;
                    w.y = s.y - 0.5 + k as f64;
                    let cand = quad.quadform(w);
                    if cand < min {
                        min = cand;
                        xmin = w.x;
                        ymin = w.y;
                    }
                }
            }

            self.curve.vertex[i] = Point::new(xmin + x0, ymin + y0)
        }

        return self.curve.clone();
    }

    fn pointslope(&mut self, i: usize, j: usize, mut ctr: Point, mut dir: Point) {
        let len = self.len;
        let sums = &self.sums;
        let mut _i = i;
        let mut _j = j;
        let mut r = 0f64;

        while _j >= len {
            _j -= len;
            r += 1f64;
        }
        while _i >= len {
            _i -= len;
            r -= 1f64;
        }
        while _j < 0 {
            _j += len;
            r -= 1f64;
        }
        while _i < 0 {
            _i += len;
            r += 1f64;
        }

        let x1 = sums[_j + 1].x - sums[_i].x + r * sums[len].x;
        let y1 = sums[_j + 1].y - sums[_i].y + r * sums[len].y;
        let x2 = sums[_j + 1].x2 - sums[_i].x2 + r * sums[len].x2;
        let xy = sums[_j + 1].xy - sums[_i].xy + r * sums[len].xy;
        let y2 = sums[_j + 1].y2 - sums[_i].y2 + r * sums[len].y2;
        let k = _j as f64 + 1f64 - _i as f64 + r * len as f64;

        ctr.x = x1 / k;
        ctr.y = y1 / k;

        let mut a = (x2 - (x1 * x1) / k) / k;
        let b = (xy - (x1 * y1) / k) / k;
        let mut c = (y2 - (y1 * y1) / k) / k;

        let lambda2: f64 = (a + c + ((a - c) * (a - c) + 4f64 * b * b)).sqrt() / 2f64;

        a -= lambda2;
        c -= lambda2;
        let l: f64 = if a.abs() >= c.abs() {
            (a * a + b * b).sqrt()
        } else {
            (c * c + b * b).sqrt()
        };
        if a.abs() >= c.abs() {
            if l != 0f64 {
                dir.x = -b / l;
                dir.y = a / l;
            }
        } else {
            if l != 0f64 {
                dir.x = -c / l;
                dir.y = b / l;
            }
        }
        if l == 0f64 {
            dir.x = 0f64;
            dir.y = 0f64;
        }
    }
}

use super::path::Path;
use super::point::Point;
use image::{DynamicImage, ImageBuffer, Rgba};
use types::histogram::Histogram;
use utils::between;

/// Represents a bitmap where each pixel can be a number in range of 0..255
///
/// Used internally to store luminance data.
#[derive(Clone)]
pub struct Bitmap {
    histogram: Histogram,
    pub width: u32,
    pub height: u32,
    pub size: usize,
    pub data: Vec<u8>,
    pub raw: ImageBuffer<Rgba<u8>, Vec<u8>>,
}

impl Bitmap {
    pub fn new(image: DynamicImage) -> Bitmap {
        let raw = image.to_rgba();
        let width = raw.width();
        let height = raw.height();
        let flat = raw.clone().pixels_mut().map(|pixel| {
            let opacity: i32 = (pixel[3] / 255) as i32;
            let r = 255 + ((pixel[0] as i32 - 255) * opacity) as u8;
            let g = 255 + ((pixel[1] as i32 - 255) * opacity) as u8;
            let b = 255 + ((pixel[2] as i32 - 255) * opacity) as u8;
            pixel[0] = r;
            pixel[1] = g;
            pixel[2] = b;

            return pixel;
        });

        return Bitmap {
            histogram: Histogram::new(raw.clone()),
            width,
            height,
            size: (width * height) as usize,
            data: raw.to_vec(),
            raw,
        };
    }

    /// Returns pixel value
    pub fn get_value_at(&self, x: f64, y: f64) -> Option<&u8> {
        let idx = self.point_to_index(x, y);
        match idx > 0 {
            true => Some(&self.data[idx as usize]),
            false => self.data.last(),
        }
    }

    pub fn index_to_point(&self, index: usize) -> Point {
        let is_between = between(index as f64, 0.0, self.size as f64);
        let y: f64 = if is_between {
            (index as f64 / self.width as f64).floor()
        } else {
            -1.0
        };
        let x: f64 = if is_between {
            index as f64 - y * self.width as f64
        } else {
            -1.0
        };
        return Point::new(x, y);
    }

    /// Calculates index for point or coordinate pair
    pub fn point_to_index(&self, x: f64, y: f64) -> isize {
        return if !between(x, 0.0, self.width as f64) || !between(y, 0.0, self.height as f64) {
            -1
        } else {
            (self.width as f64 * y + x) as isize
        };
    }

    /// Makes a copy of current bitmap
    pub fn copy_with_cb(&self, iterator: Box<dyn Fn(u8, usize) -> u8>) -> Bitmap {
        let mut bm = self.clone();
        for i in 0..self.size as usize {
            bm.data[i] = iterator(self.data[i], i);
        }
        return bm;
    }

    pub fn get_raw_pixels(&self) -> Vec<u8> {
        self.data.clone()
    }

    /// finds next black pixel of the image
    pub fn find_next(&self, point: Point) -> Option<Box<Point>> {
        let mut i = self.point_to_index(point.x, point.y) as usize;
        while i < self.size && self.data[i] as usize != 1 {
            i += 1;
        }
        return match i < self.size {
            true => Some(Box::new(self.index_to_point(i))),
            false => None,
        };
    }

    /// compute a path in the given pixmap, separating black from white.
    ///
    /// Start path at the point (x0,x1), which must be an upper left corner
    /// of the path. Also compute the area enclosed by the path. Return a
    /// new path object, or NULL on error (note that a legitimate path
    /// cannot have length 0). Sign is required for correct interpretation
    /// of turnpolicies.
    pub fn find_path(&mut self, point: Point, turn_policy: String) -> Path {
        let mut p: Path = Path::default();
        let mut x = point.x;
        let mut y = point.y;
        let mut dirx = 0.0;
        let mut diry = 1.0;

        p.sign = match self.get_value_at(point.x, point.y) {
            Some(val) => {
                if *val > 0 {
                    "+".to_string()
                } else {
                    "-".to_string()
                }
            }
            None => "+".to_string(),
        };
        let mut searching = true;
        while searching {
            /* add point to path */
            p.pt.push(Point::new(x, y));
            if x > p.max_x {
                p.max_x = x;
            }
            if x < p.min_x {
                p.min_x = x;
            }
            if y > p.max_y {
                p.max_y = y;
            }
            if y < p.min_y {
                p.min_y = y;
            }
            p.len += 1;
            /* move to next point */
            x += dirx;
            y += diry;
            p.area -= x * diry;
            if x == point.x && y == point.y {
                searching = false;
            }

            /* determine next direction */
            let l = self
                .get_value_at(x + (dirx + diry - 1.0) / 2.0, y + (diry - dirx - 1.0) / 2.0)
                .is_some();
            let r = self
                .get_value_at(x + (dirx - diry - 1.0) / 2.0, y + (diry + dirx - 1.0) / 2.0)
                .is_some();

            if r && !l {
                /* ambiguous turn */
                if turn_policy == "right"
                    || (turn_policy == "black" && p.sign == "+".to_string())
                    || (turn_policy == "white" && p.sign == "-".to_string())
                    || (turn_policy == "majority" && self.majority(x, y))
                    || (turn_policy == "minority" && !self.majority(x, y))
                {
                    /* right turn */
                    let tmp = dirx;
                    dirx = -diry;
                    diry = tmp;
                } else {
                    /* left turn */
                    let tmp = dirx;
                    dirx = diry;
                    diry = -tmp;
                }
            } else if r {
                /* right turn */
                let tmp = dirx;
                dirx = -diry;
                diry = tmp;
            } else if !l {
                /* left turn */
                let tmp = dirx;
                dirx = diry;
                diry = -tmp;
            }
        } /* while this path */
        return p;
    }

    /// return the "majority" value of bitmap bm at intersection (x,y). We
    /// assume that the bitmap is balanced at "radius" 1.
    pub fn majority(&self, x: f64, y: f64) -> bool {
        for i in 2..5 {
            let mut ct = 0;
            for a in (-i + 1)..(i - 1) {
                ct += if self
                    .get_value_at(x + (a as f64), y + (i as f64) - 1.0)
                    .is_some()
                {
                    1
                } else {
                    -1
                };
                ct += if self
                    .get_value_at(x + (i as f64) - 1.0, y + (a as f64) - 1.0)
                    .is_some()
                {
                    1
                } else {
                    -1
                };
                ct += if self
                    .get_value_at(x + (a as f64) - 1.0, y - (i as f64))
                    .is_some()
                {
                    1
                } else {
                    -1
                };
                ct += if self.get_value_at(x - (i as f64), y + (a as f64)).is_some() {
                    1
                } else {
                    -1
                };
            }
            if ct > 0 {
                return true;
            }
            if ct < 0 {
                return false;
            }
        }
        return false;
    }

    /// xor the given pixmap with the interior of the given path. Note: the
    /// path must be within the dimensions of the pixmap.
    pub fn xor_path(&mut self, p: Path) {
        let len = p.len;
        let mut y1 = p.pt[0].y;

        for i in 1..len {
            let x = p.pt[i].x;
            let y = p.pt[i].y;

            if y != y1 {
                let min_y = if y1 < y { y1 } else { y };
                let max_x = p.max_x;
                for j in (x as usize)..(max_x as usize) {
                    let idx = self.point_to_index(j as f64, min_y);
                    self.data[idx as usize] = if self.get_value_at(j as f64, min_y).is_some() {
                        0
                    } else {
                        1
                    };
                }
                y1 = y
            }
        }
    }
}

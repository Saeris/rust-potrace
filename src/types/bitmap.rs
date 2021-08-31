use super::path::Path;
use super::point::Point;
use constants::SupportedTurnpolicyValues;
use image::{DynamicImage, ImageBuffer, Rgba};
use types::histogram::Histogram;

/// Represents a bitmap where each pixel can be a number in range of 0..255
///
/// Used internally to store luminance data.
#[derive(Clone)]
pub struct Bitmap {
    pub histogram: Histogram,
    pub width: usize,
    pub height: usize,
    pub size: usize,
    pub data: Vec<u8>,
    pub flat: Vec<u8>,
    pub raw: ImageBuffer<Rgba<u8>, Vec<u8>>,
}

impl Bitmap {
    pub fn new(image: DynamicImage) -> Bitmap {
        let raw = image.to_rgba();
        let mut flat = raw.clone();
        let width = raw.width() as usize;
        let height = raw.height() as usize;
        for pixel in flat.pixels_mut() {
            let opacity: i32 = (pixel[3] / 255) as i32;
            let r = 255 + ((pixel[0] as i32 - 255) * opacity) as u8;
            let g = 255 + ((pixel[1] as i32 - 255) * opacity) as u8;
            let b = 255 + ((pixel[2] as i32 - 255) * opacity) as u8;
            pixel[0] = r;
            pixel[1] = g;
            pixel[2] = b;
        }

        return Bitmap {
            histogram: Histogram::new(raw.clone()),
            width,
            height,
            size: (width * height) as usize,
            data: raw.to_vec(),
            flat: flat.to_vec(),
            raw,
        };
    }

    /// Returns pixel value
    pub fn get_value_at(&self, x: f64, y: f64) -> Option<&u8> {
        let idx = self.point_to_index(x, y).unwrap();
        match idx > 0 {
            true => Some(&self.data[idx]),
            false => self.data.last(),
        }
    }

    pub fn index_to_point(&self, index: usize) -> Point {
        let is_between = (0..=self.size).contains(&index);
        let y: f64 = if is_between {
            (index as f64 / self.width as f64).floor()
        } else {
            -1f64
        };
        let x: f64 = if is_between {
            index as f64 - y * self.width as f64
        } else {
            -1f64
        };
        return Point::new(x, y);
    }

    /// Calculates index for point or coordinate pair
    pub fn point_to_index(&self, x: f64, y: f64) -> Option<usize> {
        return if !(0f64..=(self.width as f64)).contains(&x)
            || !(0f64..=(self.height as f64)).contains(&y)
        {
            None
        } else {
            Some((self.width as f64 * y + x) as usize)
        };
    }

    pub fn generate_binary_bitmap(&self, blackOnWhite: bool, threshold: u8) -> Bitmap {
        let mut bm = self.clone();
        bm.data = bm
            .data
            .iter()
            .map(|pixel| {
                let pastTheThreshold = if blackOnWhite {
                    *pixel > threshold
                } else {
                    *pixel < threshold
                };
                return if pastTheThreshold { 0u8 } else { 1u8 };
            })
            .collect();
        return bm;
    }

    pub fn get_raw_pixels(&self) -> Vec<u8> {
        self.data.clone()
    }

    /// finds next black pixel of the image
    pub fn find_next(&self, point: Point) -> Option<Box<Point>> {
        let mut i = self.point_to_index(point.x, point.y).unwrap() as usize;
        while i < self.size && self.data[i] != 1 {
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
    pub fn find_path(&mut self, point: Point, turn_policy: SupportedTurnpolicyValues) -> Path {
        let mut path: Path = Path::default();
        let mut x = point.x;
        let mut y = point.y;
        let mut dirx = 0f64;
        let mut diry = 1f64;

        path.sign = match self.get_value_at(point.x, point.y) {
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
            path.pt.push(Point::new(x, y));
            if x > path.max_x {
                path.max_x = x;
            }
            if x < path.min_x {
                path.min_x = x;
            }
            if y > path.max_y {
                path.max_y = y;
            }
            if y < path.min_y {
                path.min_y = y;
            }
            path.len += 1;
            /* move to next point */
            x += dirx;
            y += diry;
            path.area -= x * diry;
            if x == point.x && y == point.y {
                searching = false;
            }

            /* determine next direction */
            let left = self
                .get_value_at(
                    x + (dirx + diry - 1f64) / 2f64,
                    y + (diry - dirx - 1f64) / 2f64,
                )
                .is_some();
            let right = self
                .get_value_at(
                    x + (dirx - diry - 1f64) / 2f64,
                    y + (diry + dirx - 1f64) / 2f64,
                )
                .is_some();

            if right && !left {
                /* ambiguous turn */
                if turn_policy == SupportedTurnpolicyValues::Right
                    || (turn_policy == SupportedTurnpolicyValues::Black
                        && path.sign == "+".to_string())
                    || (turn_policy == SupportedTurnpolicyValues::White
                        && path.sign == "-".to_string())
                    || (turn_policy == SupportedTurnpolicyValues::Majority && self.majority(x, y))
                    || (turn_policy == SupportedTurnpolicyValues::Minority && !self.majority(x, y))
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
            } else if right {
                /* right turn */
                let tmp = dirx;
                dirx = -diry;
                diry = tmp;
            } else if !left {
                /* left turn */
                let tmp = dirx;
                dirx = diry;
                diry = -tmp;
            }
        } /* while this path */
        return path;
    }

    /// return the "majority" value of bitmap bm at intersection (x,y). We
    /// assume that the bitmap is balanced at "radius" 1.
    pub fn majority(&self, x: f64, y: f64) -> bool {
        for i in 2..5 {
            let mut ct = 0;
            for a in (-i + 1)..=(i - 1) {
                ct += if self
                    .get_value_at(x + (a as f64), y + (i as f64) - 1f64)
                    .is_some()
                {
                    1
                } else {
                    -1
                };
                ct += if self
                    .get_value_at(x + (i as f64) - 1f64, y + (a as f64) - 1f64)
                    .is_some()
                {
                    1
                } else {
                    -1
                };
                ct += if self
                    .get_value_at(x + (a as f64) - 1f64, y - (i as f64))
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
    pub fn xor_path(&mut self, path: Path) {
        let len = path.len;
        let mut y1 = path.pt[0].y;

        for i in 1..len {
            let x = path.pt[i].x;
            let y = path.pt[i].y;

            if y != y1 {
                let min_y = if y1 < y { y1 } else { y };
                let max_x = path.max_x;
                for j in (x as usize)..(max_x as usize) {
                    let idx = self.point_to_index(j as f64, min_y);
                    match idx {
                        Some(val) => {
                            self.data[val] = if self.get_value_at(j as f64, min_y).is_some() {
                                0
                            } else {
                                1
                            }
                        }
                        None => {
                            if let Some(last) = self.data.last_mut() {
                                if self.get_value_at(j as f64, min_y).is_some() {
                                    *last = 0
                                } else {
                                    *last = 1
                                }
                            };
                        }
                    }
                }
                y1 = y
            }
        }
    }
}

use image::{ImageBuffer, Rgba};
use num::clamp;
use std::cmp::min;
use std::collections::HashMap;
use utils::luminance;

const COLOR_DEPTH: usize = 256;
const COLOR_RANGE_END: usize = COLOR_DEPTH - 1;

pub const R: &str = "red";
pub const G: &str = "green";
pub const B: &str = "bblue";
pub const L: &str = "luminance";

pub enum Mode {
    R,
    G,
    B,
    L,
}

/**
 * Calculates array index for pair of indexes. We multiple column (x) by 256 and then add row to it,
 * this way `(index(i, j) + 1) === index(i, j + i)` thus we can reuse `index(i, j)` we once calculated
 *
 * Note: this is different from how indexes calculated in {@link Bitmap} class, keep it in mind.
 */
fn index(column: usize, row: usize) -> usize {
    COLOR_DEPTH as usize * column + row
}

/**
 * Shared parameter normalization for methods 'multilevel_thresholding', 'autoThreshold', 'getDominantColor' and 'getStats'
 */
fn normalize_min_max(
    level_min: Option<Box<f64>>, // = 0,
    level_max: Option<Box<f64>>, // = COLOR_RANGE_END
) -> [u8; 2] {
    let lvl_min = match level_min {
        Some(val) => *val,
        None => 0.0,
    };
    let lvl_max = match level_max {
        Some(val) => *val,
        None => COLOR_RANGE_END as f64,
    };
    let min = clamp(lvl_min.round() as u8, 0, COLOR_RANGE_END as u8);
    let max = clamp(lvl_max.round() as u8, 0, COLOR_RANGE_END as u8);
    if min > max {
        panic!("Invalid range '{}..{}'", lvl_min, lvl_max)
    }
    return [min, max];
}

#[derive(Clone)]
pub struct Levels {
    pub mean: u8,
    pub median: u8,
    pub std_dev: f64,
    pub unique: u32,
}

#[derive(Clone)]
pub struct PixelsPerLevel {
    pub mean: u32,
    pub median: u32,
    pub peak: u32,
}

#[derive(Clone)]
pub struct Stats {
    pub levels: Levels,
    pub pixels_per_level: PixelsPerLevel,
    pub pixels: u32,
}

/**
 * 1D Histogram
 *
 * @param {Number|Bitmap|Jimp} imageSource - Image to collect pixel data from. Or integer to create empty histogram for image of specific size
 * @param [mode] Used only for Jimp images. {@link Bitmap} currently can only store 256 values per pixel, so it's assumed that it contains values we are looking for
 * @constructor
 * @protected
 */
#[derive(Clone)]
pub struct Histogram {
    pub red: Vec<u8>,
    red_sorted_indexes: Vec<usize>, // null
    pub green: Vec<u8>,
    green_sorted_indexes: Vec<usize>, // null
    pub blue: Vec<u8>,
    blue_sorted_indexes: Vec<usize>, // null
    pub lum: Vec<u8>,
    lum_sorted_indexes: Vec<usize>,           // null
    pub pixels: usize,                        // = 0
    pub cached_stats: HashMap<String, Stats>, // = {}
    lookup_table_h: Vec<u32>,                 // = null
}

impl Histogram {
    pub fn new(raw_image: ImageBuffer<Rgba<u8>, Vec<u8>>) -> Histogram {
        let pixel_data = raw_image.pixels();
        let pixels = (raw_image.width() * raw_image.height()) as usize;
        let mut red = Vec::with_capacity(COLOR_DEPTH);
        let mut green = Vec::with_capacity(COLOR_DEPTH);
        let mut blue = Vec::with_capacity(COLOR_DEPTH);
        let mut lum = Vec::with_capacity(COLOR_DEPTH);
        pixel_data.for_each(|pixel| {
            let r = pixel[0];
            let g = pixel[1];
            let b = pixel[2];
            red[r as usize] += 1;
            green[g as usize] += 1;
            blue[b as usize] += 1;
            lum[luminance(r, g, b)] += 1;
        });
        return Histogram {
            red: red.clone(),
            red_sorted_indexes: Histogram::sort_indexes(red),
            green: green.clone(),
            green_sorted_indexes: Histogram::sort_indexes(green),
            blue: blue.clone(),
            blue_sorted_indexes: Histogram::sort_indexes(blue),
            lum: lum.clone(),
            lum_sorted_indexes: Histogram::sort_indexes(lum),
            pixels,
            cached_stats: HashMap::new(),
            lookup_table_h: vec![],
        };
    }

    fn sort_indexes(channel: Vec<u8>) -> Vec<usize> {
        let mut indexes = Vec::with_capacity(COLOR_DEPTH);

        for i in 0..COLOR_DEPTH {
            indexes[i] = i
        }
        indexes.sort_by(|a, b| channel[a.to_owned()].cmp(&channel[b.to_owned()]));

        return indexes;
    }

    /// Returns array of color indexes in ascending order
    fn get_sorted_indexes(&mut self, refresh: bool, channel: Mode) -> &Vec<usize> {
        if !refresh {
            return match channel {
                Mode::R => &self.red_sorted_indexes,
                Mode::G => &self.green_sorted_indexes,
                Mode::B => &self.blue_sorted_indexes,
                Mode::L => &self.lum_sorted_indexes,
            };
        }

        self.red_sorted_indexes = Histogram::sort_indexes(self.red.clone());
        self.green_sorted_indexes = Histogram::sort_indexes(self.green.clone());
        self.blue_sorted_indexes = Histogram::sort_indexes(self.blue.clone());
        self.lum_sorted_indexes = Histogram::sort_indexes(self.lum.clone());

        return match channel {
            Mode::R => &self.red_sorted_indexes,
            Mode::G => &self.green_sorted_indexes,
            Mode::B => &self.blue_sorted_indexes,
            Mode::L => &self.lum_sorted_indexes,
        };
    }

    /**
     * Builds lookup table H from lookup tables P and S.
     */
    fn thresholding_build_lookup_table(&mut self) -> Vec<u32> {
        // 3 vectors with size 65,536 each
        let mut P: Vec<u32> = Vec::with_capacity(COLOR_DEPTH.pow(2));
        let mut S: Vec<u32> = Vec::with_capacity(COLOR_DEPTH.pow(2));
        let mut H: Vec<u32> = Vec::with_capacity(COLOR_DEPTH.pow(2));
        let pixels_total = self.pixels;

        // diagonal
        for col in (1..COLOR_DEPTH).skip(1) {
            let idx = index(col, col); // 256x1 + 1 = 257, 514, 771...
            P[idx] = (self.lum[col] as usize / pixels_total) as u32;
            S[idx] = col as u32 * P[idx];
        }

        // calculate first row (row 0 is all zero)
        for col in (1..(COLOR_DEPTH - 1)).skip(1) {
            let idx = index(1, col);
            let tmp = (self.lum[col + 1] as usize / pixels_total) as u32;
            P[idx + 1] = P[idx] + tmp;
            S[idx + 1] = S[idx] + (col as u32 + 1) * tmp;
        }

        // using row 1 to calculate others
        for col in 2..COLOR_DEPTH {
            for row in (col + 1)..COLOR_DEPTH {
                P[index(col, row)] = P[index(1, row)] - P[index(1, col - 1)];
                S[index(col, row)] = S[index(1, row)] - S[index(1, col - 1)];
            }
        }

        // now calculate H[col][row]
        for col in (1..COLOR_DEPTH).skip(1) {
            for row in (col + 1)..COLOR_DEPTH {
                let idx = index(col, row);
                H[idx] = if P[idx] == 0 {
                    0
                } else {
                    (S[idx] * S[idx]) / P[idx]
                }
            }
        }
        self.lookup_table_h = H;
        return self.lookup_table_h.clone();
    }

    /// Implements Algorithm For Multilevel Thresholding
    /// Receives desired number of color stops, returns array of said size. Could be limited to a range level_min..level_max
    ///
    /// Regardless of level_min and level_max values it still relies on between class variances for the entire histogram
    pub fn multilevel_thresholding(
        &mut self,
        amount: f64,
        level_min: Option<Box<f64>>,
        level_max: Option<Box<f64>>,
    ) -> Vec<u8> {
        let [lvl_min, lvl_max] = normalize_min_max(level_min, level_max);
        let amt = min(lvl_max - lvl_min - 2, amount.trunc() as u8);

        if amt < 1 {
            return vec![];
        }

        let h = if self.lookup_table_h.len() != 0 {
            self.lookup_table_h.clone()
        } else {
            self.thresholding_build_lookup_table()
        };

        let mut amount = amt;
        let mut max = lvl_max;
        let mut max_sig = 0;
        let mut color_stops = vec![];
        let mut starting_point = 0;
        let mut previous_variance = 0;
        let mut indexes = Vec::with_capacity(amt as usize);
        let mut previous_depth = 0;
        let mut depth = previous_depth + 1;
        let mut searching = true;

        while searching {
            starting_point + 1;
            let mut go_deeper = false;

            for i in starting_point..(max - amount + previous_depth) {
                let mut variance: u8 =
                    previous_variance + h[index(starting_point as usize, i as usize)] as u8;
                indexes[depth as usize - 1] = i as u8;

                if depth + 1 < amount + 1 {
                    go_deeper = true;
                    break;
                } else {
                    variance += h[index(i as usize + 1, max as usize)] as u8;
                    if max_sig < variance {
                        max_sig = variance;
                        color_stops = indexes.clone();
                    }
                }
            }

            if !go_deeper {
                searching = false
            }
        }

        fn iterate_recursive(
            amount: u8,
            max: u8,
            max_sig: u8,
            h: Vec<u32>,
            stops: Vec<u8>,
            starting_point: u8,    // = 0,
            previous_variance: u8, // = 0,
            indexes: Vec<u8>,      // = new Array(amt)
            previous_depth: u8,    // = 0
        ) -> Vec<u8> {
            let start = starting_point + 1;
            let prev_depth = previous_depth;
            let depth = prev_depth + 1;
            let mut ids = indexes;
            let prev_variance = previous_variance;
            let mut sig = max_sig;
            let mut color_stops = stops;

            for i in start..(max - amount + prev_depth) {
                let mut variance: u8 = prev_variance + h[index(start as usize, i as usize)] as u8;
                ids[depth as usize - 1] = i as u8;

                if depth + 1 < amount + 1 {
                    return iterate_recursive(
                        amount,
                        max,
                        sig,
                        h,
                        color_stops,
                        i,
                        variance,
                        ids,
                        depth,
                    );
                } else {
                    variance += h[index(i as usize + 1, max as usize)] as u8;
                    if sig < variance {
                        sig = variance;
                        color_stops = ids.clone();
                    }
                }
            }

            return color_stops;
        }

        return iterate_recursive(
            amt,
            lvl_max,
            0,
            h,
            vec![],
            lvl_min,
            0,
            Vec::with_capacity(amt as usize),
            0,
        );
    }

    /// Automatically finds threshold value using Algorithm For Multilevel Thresholding
    pub fn auto_threshold(
        &mut self,
        level_min: Option<Box<f64>>,
        level_max: Option<Box<f64>>,
    ) -> Option<Box<Vec<u8>>> {
        let value = self.multilevel_thresholding(1.0, level_min, level_max);
        return if value.len() != 0 {
            Some(Box::new(value))
        } else {
            None
        };
    }

    /// Returns dominant color in given range. Returns -1 if not a single color from the range present on the image
    pub fn get_dominant_color(
        &mut self,
        level_min: f64,
        level_max: f64,
        tolerance: Option<Box<u8>>, // = 1
    ) -> i8 {
        let [min, max] = normalize_min_max(Some(Box::new(level_min)), Some(Box::new(level_max)));
        let colors = self.lum.clone();
        let tol = match tolerance {
            Some(val) => *val,
            None => 1,
        };
        let mut dominant_index: Option<usize> = None;
        let mut dominant_value: Option<u8> = None;

        if min == max {
            return if colors[min as usize] != 0 {
                min as i8
            } else {
                -1
            };
        }

        for i in min..(max + 1) {
            let mut tmp = 0;

            for j in ((tol as i8 / -2) as u8)..tol {
                tmp += if (0.0..=(COLOR_RANGE_END as f64)).contains(&((i + j) as f64)) {
                    colors[(i + j) as usize]
                } else {
                    0
                }
            }

            let dom_val: isize = match dominant_value {
                Some(val) => val as isize,
                None => -1,
            };
            let dom_idx: isize = match dominant_value {
                Some(val) => val as isize,
                None => -1,
            };

            let sum_is_bigger = tmp as isize > dom_val;
            let sum_equal_but_main_color_is_bigger = dom_val == tmp as isize
                && (dom_idx < 0 || colors[i as usize] > colors[dom_idx as usize]);

            if sum_is_bigger || sum_equal_but_main_color_is_bigger {
                dominant_index = Some(i as usize);
                dominant_value = Some(tmp);
            }
        }

        return if dominant_value.unwrap() <= 0 {
            -1
        } else {
            match dominant_index {
                Some(val) => val as i8,
                None => -1,
            }
        };
    }

    /// Returns stats for histogram or its segment.
    ///
    /// Returned object contains median, mean and standard deviation for pixel values;
    /// peak, mean and median number of pixels per level and few other values
    ///
    /// If no pixels colors from specified range present on the image - most values will be NaN
    pub fn get_stats(&mut self, level_min: f64, level_max: f64, refresh: bool) -> Stats {
        let [min, max] = normalize_min_max(Some(Box::new(level_min)), Some(Box::new(level_max)));
        let cache_key = format!("{}-{}", min, max).to_string();

        if !refresh && self.cached_stats.contains_key(&cache_key) {
            return self.cached_stats[&cache_key].clone();
        }

        let data = self.lum.clone();
        let sorted_indexes = self.lum_sorted_indexes.clone();
        let mut pixels_total = 0u32;
        let mut median_value = 0u8;
        let mut all_pixel_values_combined = 0u32;
        let mut unique_values = 0u32; // counter for levels that's represented by at least one pixel
        let mut most_pixels_per_level = 0u32;

        // Finding number of pixels and mean
        for i in min..(max + 1) {
            pixels_total += data[i as usize] as u32;
            all_pixel_values_combined += data[i as usize] as u32 * i as u32;
            unique_values += if data[i as usize] == 0 { 0u32 } else { 1u32 };
            if most_pixels_per_level < data[i as usize] as u32 {
                most_pixels_per_level = data[i as usize] as u32
            }
        }

        let mean_value = match pixels_total != 0 {
            True => (all_pixel_values_combined / pixels_total) as u8,
            False => 0u8,
        };
        let median_pixel_index = (pixels_total as f64 / 2f64).floor();
        let mut pixels_iterated = 0;
        let mut sum_of_deviations = 0;

        // Finding median and standard deviation
        for i in 0..COLOR_DEPTH {
            let pixel_value = sorted_indexes[i];
            let pixels = data[pixel_value];
            if pixel_value < min as usize || pixel_value > max as usize {
                continue;
            }
            pixels_iterated += pixels;
            sum_of_deviations += (pixel_value - mean_value as usize).pow(2) * pixels as usize;
            if median_value == 0 && pixels_iterated >= median_pixel_index as u8 {
                median_value = pixel_value as u8
            }
        }

        self.cached_stats.insert(
            cache_key.clone(),
            Stats {
                // various pixel counts for levels (0..255)
                levels: Levels {
                    mean: mean_value,
                    median: median_value,
                    std_dev: match pixels_total != 0 {
                        True => (sum_of_deviations as f64 / pixels_total as f64).sqrt(),
                        False => 0f64,
                    },
                    unique: unique_values,
                },
                // what's visually represented as bars
                pixels_per_level: PixelsPerLevel {
                    mean: match (max - min) != 0 {
                        True => pixels_total / (max - min) as u32,
                        False => 0,
                    },
                    median: match unique_values != 0 {
                        True => pixels_total / unique_values,
                        False => 0,
                    },
                    peak: most_pixels_per_level,
                },
                pixels: pixels_total,
            },
        );
        return self.cached_stats[&cache_key].clone();
    }
}

use constants::{
    COLOR_TRANSPARENT, FillStrategies, RANGES_AUTO,
};
use num::clamp;
use potrace::{Potrace, PotraceOptions};
use std::cmp::Ordering;
use std::cmp::{max, min};
use types::histogram::Histogram;
use utils::set_html_attribute;

/**
 * Posterizer options
 *
 * @typedef {Potrace~Options} Posterizer~Options
 * @property {Number} [steps]   - Number of samples that needs to be taken (and number of layers in SVG). (default: STEPS_AUTO, which most likely will result in 3, sometimes 4)
 * @property {*} [fillStrategy] - How to select fill color for color ranges - equally spread or dominant. (default: Posterizer.FILL_DOMINANT)
 * @property {*} [rangeDistribution] - How to choose thresholds in-between - after equal intervals or automatically balanced. (default: Posterizer.RANGES_AUTO)
 */
pub struct PosterizerOptions {
    potrace: Option<Box<PotraceOptions>>,
    steps: Option<Box<Vec<u8>>>, // typeof STEPS_AUTO | number | number[]
    fillStrategy: Option<Box<FillStrategies>>, // typeof FILL_DOMINANT | string
    rangeDistribution: Option<Box<String>>, // typeof RANGES_AUTO | string
}

impl Default for PosterizerOptions {
    fn default() -> PosterizerOptions {
        PosterizerOptions {
            potrace: Some(Box::new(PotraceOptions {
                ..Default::default()
            })),
            steps: None,
            fillStrategy: Some(Box::new(FillStrategies::Dominant)),
            rangeDistribution: Some(Box::new(RANGES_AUTO.to_string())),
        }
    }
}

struct ColorStop {
    value: u8,
    colorIntensity: u8,
}

/**
 * Takes multiple samples using {@link Potrace} with different threshold
 * settings and combines output into a single file.
 */
pub struct Posterizer {
    potrace: Potrace,
    calculatedThreshold: Option<Box<u8>>,
    threshold: Option<Box<u8>>,
    blackOnWhite: bool,
    background: String,
    steps: Option<Box<Vec<u8>>>,
    fillStrategy: Option<Box<FillStrategies>>,
    rangeDistribution: String,
}

impl Posterizer {
    pub fn new(base64: &str, options: Option<Box<PosterizerOptions>>) -> Posterizer {
        match options {
            Some(val) => Posterizer {
                potrace: match val.potrace {
                    Some(potrace) => Potrace::new(base64, Some(potrace)),
                    None => Potrace::new(base64, None),
                },
                calculatedThreshold: None,
                threshold: None,
                blackOnWhite: true,
                background: COLOR_TRANSPARENT.to_string(),
                steps: match val.steps {
                    Some(steps) => Some(steps),
                    None => None,
                },
                fillStrategy: match val.fillStrategy {
                    Some(fillStrategy) => Some(fillStrategy),
                    None => Some(Box::new(FillStrategies::Dominant)),
                },
                rangeDistribution: match val.rangeDistribution {
                    Some(rangeDistribution) => *rangeDistribution,
                    None => RANGES_AUTO.to_string(),
                },
            },
            None => Posterizer {
                potrace: Potrace::new(base64, None),
                calculatedThreshold: None,
                threshold: None,
                blackOnWhite: true,
                background: COLOR_TRANSPARENT.to_string(),
                steps: None,
                fillStrategy: Some(Box::new(FillStrategies::Dominant)),
                rangeDistribution: RANGES_AUTO.to_string(),
            },
        }
    }

    /// Sets parameters. Accepts same object as {Potrace}
    pub fn set_parameters(&mut self, params: PosterizerOptions) {
        if let Some(newParams) = params.potrace {
            self.potrace.set_parameters(*newParams)
        };
        self.steps = match params.steps {
            Some(steps) => Some(steps),
            None => self.steps.clone(),
        };
        self.fillStrategy = match params.fillStrategy {
            Some(fillStrategy) => Some(fillStrategy),
            None => self.fillStrategy.clone(),
        };
        self.rangeDistribution = match params.rangeDistribution {
            Some(rangeDistribution) => *rangeDistribution,
            None => self.rangeDistribution.clone(),
        };
        self.calculatedThreshold = None;
    }

    /// Returns image as <symbol> tag. Always has viewBox specified
    pub fn get_symbol(&mut self, id: &str) -> String {
        let width = self.potrace.luminanceData.width;
        let height = self.potrace.luminanceData.height;
        let paths = self.get_path_tags(true).join("");
        return format!(
            "<symbol viewBox=\"0 0 {width} {height}\" id=\"{id}\">{paths}</symbol>",
            width = width,
            height = height,
            id = id,
            paths = paths
        );
    }

    /// Generates SVG image
    pub fn get_svg(&mut self) -> String {
        let width = self.potrace.luminanceData.width;
        let height = self.potrace.luminanceData.height;
        let bg = self.get_bg();
        let tags = self.get_path_tags(false);
        return format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} ${height}\" version=\"1.1\">{bg}{tags}</svg>",
            width=width.to_string(),
            height=height.to_string(),
            bg=bg,
            tags=tags.join("")
        );
    }

    pub fn get_bg(&self) -> String {
        let bg = self.background.clone();
        return if bg == COLOR_TRANSPARENT {
            "".to_string()
        } else {
            format!(
                "<rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"{bg}\" />",
                bg = bg
            )
        };
    }

    /// Running potrace on the image multiple times with different thresholds and returns an array
    /// of path tags
    fn get_path_tags(&mut self, noFillColor: bool) -> Vec<String> {
        let mut ranges = self.get_ranges();
        let mut potrace = self.potrace.clone();
        let blackOnWhite = self.blackOnWhite;

        if ranges.len() >= 10 {
            ranges = self.add_extra_color_stop(ranges)
        }

        potrace.set_parameters(PotraceOptions {
            blackOnWhite,
            ..Default::default()
        });

        let mut actualPrevLayersOpacity = 0;

        let mut tags: Vec<String> = Vec::with_capacity(ranges.len());

        for colorStop in ranges {
            let layar_opacity = colorStop.colorIntensity;

            if layar_opacity == 0 {
                tags.push("0".to_string());
            }

            // NOTE: With big number of layers (something like 70) there will be noticeable math error on rendering side.
            // In Chromium at least image will end up looking brighter overall compared to the same layers painted in solid colors.
            // However it works fine with sane number of layers, and it's not like we can do much about it.

            let mut calculatedOpacity = if !actualPrevLayersOpacity != 0 || layar_opacity == 1 {
                layar_opacity
            } else {
                (actualPrevLayersOpacity - layar_opacity) / (actualPrevLayersOpacity - 1)
            };

            calculatedOpacity = clamp(calculatedOpacity, 0, 1);
            actualPrevLayersOpacity += (1 - actualPrevLayersOpacity) * calculatedOpacity;

            potrace.set_parameters(PotraceOptions {
                threshold: Some(Box::new(colorStop.value)),
                ..Default::default()
            });

            let mut element = if noFillColor {
                potrace.get_path_tag(Some(Box::new("".to_string())), None, None)
            } else {
                potrace.get_path_tag(None, None, None)
            };
            element = set_html_attribute(element, "fill-opacity", calculatedOpacity.to_string());

            let canBeIgnored = calculatedOpacity == 0 || element.contains("d=\"\"");

            tags.push(if canBeIgnored {
                "".to_string()
            } else {
                element
            })
        }

        return tags;
    }

    /// Processes threshold, steps and rangeDistribution parameters and returns normalized array of color stops
    pub fn get_ranges(&mut self) -> Vec<ColorStop> {
        let steps = *(self.steps.clone().unwrap());

        if steps.len() == 1 {
            return if self.rangeDistribution == RANGES_AUTO {
                self.get_ranges_auto()
            } else {
                self.get_ranges_equally_distributed()
            };
        }

        // Steps is array of thresholds and we want to preprocess it

        let mut colorStops = Vec::with_capacity(steps.len());
        let threshold = self.get_threshold();
        let lookingForDarkPixels = self.blackOnWhite;

        for step in steps {
            if !colorStops.iter().any(|i| i == &step) && (0..=255).contains(&step) {
                colorStops.push(step)
            }
        }

        if colorStops.len() == 0 {
            colorStops.push(threshold)
        }

        colorStops.sort_by(|a, b| {
            if (a < b) == lookingForDarkPixels {
                Ordering::Greater
            } else {
                Ordering::Less
            }
        });

        if lookingForDarkPixels && colorStops[0] < threshold {
            colorStops.reverse();
            colorStops.push(threshold);
            colorStops.reverse();
        } else if !lookingForDarkPixels && colorStops[colorStops.len() - 1] < threshold {
            colorStops.push(threshold)
        }

        return self.calc_color_intensity(colorStops);
    }

    /// Calculates given (or lower) number of thresholds using automatic thresholding algorithm
    fn get_ranges_auto(&mut self) -> Vec<ColorStop> {
        let mut histogram = self.get_image_histogram();
        let steps = self.get_steps(Some(Box::new(true))) as f64;
        let blackOnWhite = self.blackOnWhite;
        let mut colorStops: Vec<u8> = vec![];

        if self.threshold.is_none() {
            colorStops = histogram.multilevel_thresholding(steps, None, None)
        } else {
            let threshold = self.get_threshold();

            colorStops = if blackOnWhite {
                histogram.multilevel_thresholding(
                    steps - 1f64,
                    Some(Box::new(0f64)),
                    Some(Box::new(threshold as f64)),
                )
            } else {
                histogram.multilevel_thresholding(
                    steps - 1f64,
                    Some(Box::new(threshold as f64)),
                    Some(Box::new(255f64)),
                )
            };

            if blackOnWhite {
                colorStops.push(threshold)
            } else {
                colorStops.reverse();
                colorStops.push(threshold);
                colorStops.reverse();
            }
        }

        if blackOnWhite {
            colorStops.reverse()
        }

        return self.calc_color_intensity(colorStops);
    }

    /// Calculates color stops and color representing each segment, returning them
    /// from least to most intense color (black or white, depending on blackOnWhite parameter)
    fn get_ranges_equally_distributed(&mut self) -> Vec<ColorStop> {
        let blackOnWhite = self.blackOnWhite;
        let colorsToThreshold = if blackOnWhite {
            self.get_threshold()
        } else {
            255 - self.get_threshold()
        };
        let steps = self.get_steps(None);
        let stepSize = colorsToThreshold / steps;
        let mut colorStops = vec![];
        let mut i = steps - 1;

        while i >= 0 {
            let mut threshold = min(colorsToThreshold, (i + 1) * stepSize);
            threshold = if blackOnWhite {
                threshold
            } else {
                255 - threshold
            };
            i -= 1;
            colorStops.push(threshold)
        }

        return self.calc_color_intensity(colorStops);
    }

    /// Returns valid threshold value
    fn get_threshold(&mut self) -> u8 {
        if self.calculatedThreshold.is_some() {
            return *self.calculatedThreshold.clone().unwrap();
        }

        if self.threshold.is_some() {
            self.calculatedThreshold = Some(self.threshold.clone().unwrap());
            return *self.calculatedThreshold.clone().unwrap();
        }

        let twoThresholds = self
            .get_image_histogram()
            .multilevel_thresholding(2f64, None, None);
        self.calculatedThreshold = if self.blackOnWhite {
            Some(Box::new(twoThresholds[1]))
        } else {
            Some(Box::new(twoThresholds[0]))
        };
        let calculatedThreshold = *self.calculatedThreshold.clone().unwrap();
        self.calculatedThreshold = Some(Box::new(if calculatedThreshold != 0 {
            calculatedThreshold
        } else {
            128
        }));

        return *self.calculatedThreshold.clone().unwrap();
    }

    /// Fine tuning to color ranges.
    ///
    /// If last range (featuring most saturated color) is larger than 10% of color space (25 units)
    /// then we want to add another color stop, that hopefully will include darkest pixels, improving presence of
    /// shadows and line art
    fn add_extra_color_stop(&mut self, mut ranges: Vec<ColorStop>) -> Vec<ColorStop> {
        let blackOnWhite = self.blackOnWhite;
        let lastColorStop = ranges.last().unwrap();
        let lastRangeFrom = if blackOnWhite { 0 } else { lastColorStop.value };
        let lastRangeTo = if blackOnWhite {
            lastColorStop.value
        } else {
            255
        };

        if lastRangeTo - lastRangeFrom > 25 && lastColorStop.colorIntensity != 1 {
            let mut histogram = self.get_image_histogram();
            let levels = histogram
                .get_stats(lastRangeFrom as f64, lastRangeTo as f64, false)
                .levels;

            let newColorStop = if levels.mean as f64 + levels.std_dev <= 25f64 {
                levels.mean as f64 + levels.std_dev
            } else if levels.mean as f64 - levels.std_dev <= 25f64 {
                levels.mean as f64 - levels.std_dev
            } else {
                25f64
            };

            let newStats = if blackOnWhite {
                histogram.get_stats(0f64, newColorStop, false)
            } else {
                histogram.get_stats(newColorStop, 255f64, false)
            };
            let color = newStats.levels.mean;

            ranges.push(ColorStop {
                value: ((if blackOnWhite { 0f64 } else { 255f64 }) - newColorStop).abs() as u8,
                colorIntensity: (if blackOnWhite { 255 - color } else { color }) / 255,
            })
        }

        return ranges;
    }

    /// Calculates color intensity for each element of numeric array
    fn calc_color_intensity(&mut self, colorStops: Vec<u8>) -> Vec<ColorStop> {
        let blackOnWhite = self.blackOnWhite;
        let colorSelectionStrat = *self.fillStrategy.clone().unwrap();
        let mut histogram = self.get_image_histogram();
        let fullRange =
            (self.get_threshold() as i8 - (if blackOnWhite { 0 } else { 255 })).abs() as u8;
        let mut index = 0;
        return colorStops
            .iter()
            .map(|threshold| {
                let nextValue: i8 = if index + 1 == colorStops.len() {
                    if blackOnWhite {
                        -1
                    } else {
                        256
                    }
                } else {
                    colorStops[index + 1] as i8
                };
                let rangeStart = if blackOnWhite {
                    nextValue + 1
                } else {
                    *threshold as i8
                };
                let rangeEnd = if blackOnWhite {
                    *threshold as i8
                } else {
                    nextValue - 1
                };
                let factor = index / (colorStops.len() - 1);
                let intervalSize = rangeEnd - rangeStart;
                let stats = histogram.get_stats(rangeStart as f64, rangeEnd as f64, false);

                if stats.pixels == 0 {
                    return ColorStop {
                        value: *threshold,
                        colorIntensity: 0,
                    };
                }

                let mut color = match colorSelectionStrat {
                    FillStrategies::Spread => 
                        ((if blackOnWhite {
                            rangeStart as f64
                        } else {
                            rangeEnd as f64
                        }) + (if blackOnWhite { 1f64 } else { -1f64 })
                            * intervalSize as f64
                            * (0.5f64).max(fullRange as f64 / 255f64)
                            * factor as f64) as i8
                    ,
                    // We want it to be 0 (255 when white on black) at the most saturated end, so...
                    FillStrategies::Dominant => histogram.get_dominant_color(rangeStart as f64, rangeEnd as f64, Some(Box::new(clamp(intervalSize, 1, 5) as u8))),
                    FillStrategies::Mean => stats.levels.mean as i8,
                    FillStrategies::Median => stats.levels.median as i8,
                    _ => -1,
                };

                // We don't want colors to be too close to each other, so we introduce some spacing in between
                if index != 0 {
                    color = if blackOnWhite {
                        clamp(
                            color,
                            rangeStart,
                            rangeEnd - (intervalSize as f64 * 0.1).round() as i8,
                        )
                    } else {
                        clamp(
                            color,
                            rangeStart + (intervalSize as f64 * 0.1).round() as i8,
                            rangeEnd,
                        )
                    }
                }

                index += 1;
                return ColorStop {
                    value: *threshold,
                    colorIntensity: if color == -1 {
                        0
                    } else {
                        ((if blackOnWhite { 255 - color } else { color }) / 255) as u8
                    },
                };
            })
            .collect();
    }

    fn get_image_histogram(&self) -> Histogram {
        self.potrace.luminanceData.histogram.clone()
    }

    /// Returns valid steps value
    fn get_steps(&mut self, stepCount: Option<Box<bool>>) -> u8 {
        let blackOnWhite = self.blackOnWhite;
        let steps = self.steps.clone();
        let threshold = self.threshold.clone();
        let count = match stepCount {
            Some(val) => *val,
            None => false,
        };

        if steps.is_some() && count {
            return (*steps.unwrap()).len() as u8;
        }

        if steps.is_none() && threshold.is_none() {
            return 4;
        }

        let colorsCount = if blackOnWhite {
            self.get_threshold()
        } else {
            255 - self.get_threshold()
        };

        return if steps.is_none() {
            if colorsCount > 200 {
                4
            } else {
                3
            }
        } else {
            min(colorsCount, max(2, (*steps.unwrap())[0]))
        };
    }
}

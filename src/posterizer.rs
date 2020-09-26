use num::clamp;
use std::cmp::{max, min};
use potrace::{Potrace, PotraceOptions};
use constants::{
  COLOR_TRANSPARENT,
  THRESHOLD_AUTO,
  STEPS_AUTO,
  FILL_SPREAD,
  FILL_DOMINANT,
  FILL_MEDIAN,
  FILL_MEAN,
  RANGES_AUTO
};
use utils::{ between, set_html_attribute };
use types::histogram::{ Histogram };

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
    fillStrategy: Option<Box<&str>>, // typeof FILL_DOMINANT | string
    rangeDistribution: &str, // typeof RANGES_AUTO | string
}

impl Default for PosterizerOptions {
    fn default() -> PosterizerOptions {
        PosterizerOptions {
            potrace: Some(PotraceOptions { ..Default::default() }),
            steps: Some(vec![STEPS_AUTO]),
            fillStrategy: Some(FILL_DOMINANT),
            rangeDistribution: RANGES_AUTO
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
    calculatedThreshold: Option<Box<i32>>,
    threshold: Option<Box<i32>>,
    blackOnWhite: bool,
    background: &str,
    steps: Option<Box<Vec<u8>>>,
    fillStrategy: Option<Box<&str>>,
    rangeDistribution: &str,
}

impl Default for Posterizer {
    fn default() -> Posterizer {
        Posterizer {
            potrace: Potrace::new(),
            calculatedThreshold: None,
            threshold: Some(THRESHOLD_AUTO),
            blackOnWhite: true,
            background: COLOR_TRANSPARENT,
            steps: Some(vec![STEPS_AUTO]),
            fillStrategy: Some(FILL_DOMINANT),
            rangeDistribution: RANGES_AUTO
        }
    }
}

impl Posterizer {
    pub fn new(options: Option<Box<PosterizerOptions>>) -> Posterizer {
        match options {
            Some(val) => Posterizer {
                potrace: match val.potrace {
                    Some(potrace) => Potrace::new(potrace),
                    None => Potrace::new()
                },
                steps: match val.steps {
                    Some(steps) => steps,
                    None => STEPS_AUTO,
                },
                fillStrategy: match val.fillStrategy {
                    Some(fillStrategy) => fillStrategy,
                    None => FILL_DOMINANT
                },
                rangeDistribution: match val.rangeDistribution {
                    Some(rangeDistribution) => rangeDistribution,
                    None => RANGES_AUTO
                },
                ..Default::default()
            },
            None => Posterizer { ..Default::default() }
        }
    }

    /// Sets parameters. Accepts same object as {Potrace}
    pub fn setParameters(&mut self, params: PosterizerOptions) {
        self.potrace = match params.potrace {
            Some(potrace) => Potrace::new(Some(*potrace)),
            None => self.potrace
        };
        self.steps = match params.steps {
            Some(steps) => steps,
            None => self.steps
        };
        self.fillStrategy = match params.fillStrategy {
            Some(fillStrategy) => fillStrategy,
            None => self.fillStrategy
        };
        self.rangeDistribution = match params.rangeDistribution {
            Some(rangeDistribution) => rangeDistribution,
            None => self.rangeDistribution
        };
        self.potrace.setParameters(params);
        self.calculatedThreshold = null
    }

    /// Loads image.
    pub fn loadImage(&mut self, base64: &str) -> &mut Self {
        self.potrace.loadImage(base64);
        self.calculatedThreshold = null;
        return self
    }

    /// Returns image as <symbol> tag. Always has viewBox specified
    pub fn getSymbol(&self, id: &str) -> String {
        let width = self.potrace.luminanceData.width;
        let height = self.potrace.luminanceData.height;
        let paths = self.pathTags(true).join("");
        return format!("<symbol viewBox=\"0 0 {width} {height}\" id=\"{id}\">{paths}</symbol>", width=width, height=height, id=id, paths=paths)
    }

    /// Generates SVG image
    pub fn getSVG(&self) -> String {
        let width = self.potrace.luminanceData.width;
        let height = self.potrace.luminanceData.height;
        let bg = self.getBG();
        let tags = self.pathTags(false);
        return format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} ${height}\" version=\"1.1\">{bg}{tags}</svg>",
            width=width,
            height=height,
            bg=bg,
            tags=tags
        )
    }

    pub fn getBG(&self) -> String {
        let bg = self.background;
        return if bg == COLOR_TRANSPARENT {
            ""
        } else {
            format!("<rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"{bg}\" />", bg=bg)
        }
    }

    /// Running potrace on the image multiple times with different thresholds and returns an array
    /// of path tags
    fn pathTags(&mut self, noFillColor: boolean) -> Vec<&str> {
        let mut ranges = self.getRanges();
        let potrace = self.potrace;
        let blackOnWhite = self.blackOnWhite;

        if ranges.length >= 10 {
            ranges = self.addExtraColorStop(ranges)
        }

        potrace.setParameters(PotraceOptions { ..Default::default(), blackOnWhite });

        let mut actualPrevLayersOpacity = 0;

        return ranges.map(|colorStop| {
            let thisLayerOpacity = colorStop.colorIntensity;

            if thisLayerOpacity == 0 {
                return "";
            }

            // NOTE: With big number of layers (something like 70) there will be noticeable math error on rendering side.
            // In Chromium at least image will end up looking brighter overall compared to the same layers painted in solid colors.
            // However it works fine with sane number of layers, and it's not like we can do much about it.

            let calculatedOpacity = if !actualPrevLayersOpacity || thisLayerOpacity == 1 {
                thisLayerOpacity
            } else {
                (actualPrevLayersOpacity - thisLayerOpacity) / (actualPrevLayersOpacity - 1)
            };

            calculatedOpacity = clamp(parseFloat(calculatedOpacity.toFixed(3)), 0, 1);
            actualPrevLayersOpacity += (1 - actualPrevLayersOpacity) * calculatedOpacity;

            potrace.setParameters(PotraceOptions { threshold: colorStop.value });

            let element = if noFillColor { potrace.getPathTag("") } else { potrace.getPathTag() };
            element = set_html_attribute(
                element,
                "fill-opacity",
                calculatedOpacity.toFixed(3)
            );

            let canBeIgnored = calculatedOpacity == 0 || element.indexOf("d=\"\"") != -1;

            return if canBeIgnored { "" } else { element }
        })
    }

    /// Processes threshold, steps and rangeDistribution parameters and returns normalized array of color stops
    pub fn getRanges(&mut self) -> Vec<ColorStop> {
        let steps = self.paramSteps();

        if !Array.isArray(steps) {
            return if self.rangeDistribution == RANGES_AUTO {
                self.getRangesAuto()
            } else {
                self.getRangesEquallyDistributed()
            }
        }

        // Steps is array of thresholds and we want to preprocess it

        let mut colorStops: Vec<u8> = vec![];
        let threshold = self.paramThreshold();
        let lookingForDarkPixels = self.blackOnWhite;

        steps.forEach(|item| {
            if colorStops.indexOf(item) == -1 && between(item, 0, 255) {
                colorStops.push(item)
            }
        });

        if colorStops.len() == 0 {
            colorStops.push(threshold)
        }

        colorStops = colorStops.sort(|a, b| { if a < b == lookingForDarkPixels { 1 } else { -1 } });

        if lookingForDarkPixels && colorStops[0] < threshold {
            colorStops.unshift(threshold)
        } else if !lookingForDarkPixels && colorStops[colorStops.length - 1] < threshold {
            colorStops.push(threshold)
        }

        return self.calcColorIntensity(colorStops)
    }

    /// Calculates given (or lower) number of thresholds using automatic thresholding algorithm
    fn getRangesAuto(&mut self) -> Vec<ColorStop> {
        let histogram = self.getImageHistogram();
        let steps = self.paramSteps(true);
        let blackOnWhite = self.blackOnWhite;
        let mut colorStops: Vec<u8> = vec![];

        if self.threshold == THRESHOLD_AUTO {
            colorStops = histogram.multilevelThresholding(steps)
        } else {
            let threshold = self.paramThreshold();

            colorStops = if blackOnWhite {
                histogram.multilevelThresholding(steps - 1, 0, threshold)
            } else {
                histogram.multilevelThresholding(steps - 1, threshold, 255)
            };

            if blackOnWhite {
                colorStops.push(threshold)
            } else {
                colorStops.unshift(threshold)
            }
        }

        if blackOnWhite {
            colorStops = colorStops.reverse()
        }

        return self.calcColorIntensity(colorStops)
    }

    /// Calculates color stops and color representing each segment, returning them
    /// from least to most intense color (black or white, depending on blackOnWhite parameter)
    fn getRangesEquallyDistributed(&mut self) -> Vec<ColorStop> {
        let blackOnWhite = self.blackOnWhite;
        let colorsToThreshold = if blackOnWhite { self.paramThreshold() } else { 255 - self.paramThreshold() };
        let steps = self.paramSteps();
        let stepSize = colorsToThreshold / steps;
        let colorStops = [];
        let mut i = steps - 1;

        while i >= 0 {
            let mut threshold = Math.min(colorsToThreshold, (i + 1) * stepSize);
            threshold = if blackOnWhite { threshold } else { 255 - threshold };
            i -= 1;
            colorStops.push(threshold)
        }

        return self.calcColorIntensity(colorStops)
    }

    /// Returns valid threshold value
    fn paramThreshold(&mut self) -> i32 {
        if self.calculatedThreshold.is_some() {
            return self.calculatedThreshold
        }

        if self.threshold != THRESHOLD_AUTO {
            self.calculatedThreshold = self.threshold;
            return self.calculatedThreshold
        }

        let twoThresholds = self.getImageHistogram().multilevelThresholding(2);
        self.calculatedThreshold = if self.blackOnWhite { twoThresholds[1] } else { twoThresholds[0] };
        self.calculatedThreshold = self.calculatedThreshold || 128;

        return self.calculatedThreshold
    }

    /// Fine tuning to color ranges.
    ///
    /// If last range (featuring most saturated color) is larger than 10% of color space (25 units)
    /// then we want to add another color stop, that hopefully will include darkest pixels, improving presence of
    /// shadows and line art
    fn addExtraColorStop(&mut self, ranges: Vec<ColorStop>) {
        let blackOnWhite = self.blackOnWhite;
        let lastColorStop = ranges[ranges.length - 1];
        let lastRangeFrom = if blackOnWhite { 0 } else { lastColorStop.value };
        let lastRangeTo = if blackOnWhite { lastColorStop.value } else { 255 };

        if lastRangeTo - lastRangeFrom > 25 && lastColorStop.colorIntensity != 1 {
            let histogram = self.getImageHistogram();
            let levels = histogram.getStats(lastRangeFrom, lastRangeTo).levels;

            let newColorStop =
                if levels.mean + levels.stdDev <= 25 {
                    levels.mean + levels.stdDev
                } else if levels.mean - levels.stdDev <= 25 {
                    levels.mean - levels.stdDev
                } else { 25 }; 

            let newStats = if blackOnWhite { histogram.getStats(0, newColorStop) } else { histogram.getStats(newColorStop, 255) };
            let color = newStats.levels.mean;

            ranges.push(ColorStop {
                value: ((if blackOnWhite { 0 } else { 255 }) - newColorStop).abs(),
                colorIntensity: if isNaN(color) { 0 } else { (if blackOnWhite { 255 - color } else { color }) / 255 }
            })
        }

        return ranges
    }

    /// Calculates color intensity for each element of numeric array
    fn calcColorIntensity(&mut self, colorStops: Vec<i32>) -> Vec<ColorStop> {
        let blackOnWhite = self.blackOnWhite;
        let colorSelectionStrat = self.fillStrategy;
        let histogram = if colorSelectionStrat == FILL_SPREAD { None } else { self.getImageHistogram() }; 
        let fullRange = (self.paramThreshold() - (if blackOnWhite { 0 } else { 255 })).abs();

        return colorStops.map(|threshold, index| {
            let nextValue =
                if index + 1 == colorStops.length {
                    if blackOnWhite {-1} else {256}
                } else {
                    colorStops[index + 1]
                };
            let rangeStart = (if blackOnWhite { nextValue + 1 } else { threshold }).round();
            let rangeEnd = (if blackOnWhite { threshold } else { nextValue - 1 }).round();
            let factor = index / (colorStops.length - 1);
            let intervalSize = rangeEnd - rangeStart;
            let stats = histogram.getStats(rangeStart, rangeEnd);

            if stats.pixels == 0 {
                return ColorStop {
                    value: threshold,
                    colorIntensity: 0
                }
            }

            let color = match colorSelectionStrat {
                FILL_SPREAD => 
                    (if blackOnWhite { rangeStart } else { rangeEnd }) + (if blackOnWhite { 1 } else { -1 }) * intervalSize * max(0.5, fullRange / 255) * factor,
                // We want it to be 0 (255 when white on black) at the most saturated end, so...
                FILL_DOMINANT => histogram.getDominantColor(rangeStart, rangeEnd, clamp(intervalSize, 1, 5)),
                FILL_MEAN => stats.levels.mean,
                FILL_MEDIAN => stats.levels.median,
                _ => -1
            };

            // We don't want colors to be too close to each other, so we introduce some spacing in between
            if index != 0 {
                color = if blackOnWhite {
                    clamp(color, rangeStart, rangeEnd - (intervalSize * 0.1).round())
                } else {
                    clamp(color, rangeStart + (intervalSize * 0.1).round(), rangeEnd)
                }
            }

            return ColorStop {
                value: threshold,
                colorIntensity: if color == -1 { 0 } else { (if blackOnWhite { 255 - color } else { color }) / 255 } 
            }
        })
    }

    fn getImageHistogram(&self) -> Histogram { self.luminanceData.histogram() }

    /// Returns valid steps value
    fn paramSteps(&mut self, stepCount: Option<Box<bool>>) -> u8 {
        let blackOnWhite = self.blackOnWhite;
        let steps = self.steps;
        let threshold = self.threshold;
        let count = match stepCount {
            Some(val) => val,
            None => false
        };

        if Array.isArray(steps) && count {
            return steps.length
        }

        if steps == STEPS_AUTO && threshold == THRESHOLD_AUTO {
            return 4
        }

        let colorsCount = if blackOnWhite {
            self.paramThreshold()
        } else {
            255 - self.paramThreshold()
        };

        return if steps == STEPS_AUTO {
            if colorsCount > 200 { 4 } else { 3 } 
        } else {
            Math.min(colorsCount, Math.max(2, steps))
        }
    }
}

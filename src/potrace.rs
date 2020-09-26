use base64::decode;
use constants::{SupportedTurnpolicyValues, COLOR_AUTO, COLOR_TRANSPARENT, THRESHOLD_AUTO};
use image::DynamicImage;
use types::{bitmap::Bitmap, path::Path, point::Point};
use utils::luminance;

pub struct PotraceOptions {
    /// how to resolve ambiguities in path decomposition. (default: "minority")
    turnPolicy: SupportedTurnpolicyValues,
    /// suppress speckles of up to this size (default: 2)
    turdSize: i32,
    /// corner threshold parameter (default: 1)
    alphaMax: i32,
    /// turn on/off curve optimization (default: true)
    optCurve: bool,
    /// curve optimization tolerance (default: 0.2)
    optTolerance: f64,
    threshold: Option<Box<u8>>,
    blackOnWhite: bool,
    color: Option<Box<String>>,
    background: Option<Box<String>>,
    width: Option<Box<usize>>,
    height: Option<Box<usize>>,
}

impl Default for PotraceOptions {
    fn default() -> PotraceOptions {
        return PotraceOptions {
            turnPolicy: SupportedTurnpolicyValues::TurnpolicyMinority,
            turdSize: 2,
            alphaMax: 1,
            optCurve: true,
            optTolerance: 0.2,
            threshold: None,
            blackOnWhite: true,
            color: Some(Box::new(COLOR_AUTO)),
            background: Some(Box::new(COLOR_TRANSPARENT)),
            width: None,
            height: None,
        };
    }
}

/// Potrace class
pub struct Potrace {
    pub luminanceData: Option<Box<Bitmap>>,
    pathlist: Vec<Path>, // []
    imageLoaded: bool,   // = false
    processed: bool,     // = false
    params: PotraceOptions,
}

impl Default for Potrace {
    fn default() -> Potrace {
        Potrace {
            luminanceData: None,
            pathlist: vec![],
            imageLoaded: false,
            processed: false,
            params: PotraceOptions {
                ..Default::default()
            },
        }
    }
}

impl Potrace {
    pub fn new(options: Option<Box<PotraceOptions>>) -> Potrace {
        match options {
            Some(val) => Potrace {
                params: *val,
                ..Default::default()
            },
            None => Potrace {
                ..Default::default()
            },
        }
    }

    /// Sets algorithm parameters
    pub fn setParameters(&mut self, newParams: PotraceOptions) -> &mut Self {
        if newParams.color.is_some() || newParams.background.is_some() {
            self.processed = false
        }
        self.params = newParams;

        return self;
    }

    /// Reads given image. Uses {@link Jimp} under the hood, so target can be whatever Jimp can take
    pub fn loadImage(&mut self, base64: &str) -> &mut Self {
        self.imageLoaded = false;
        let slice = decode(base64).unwrap().as_slice();
        let img = image::load_from_memory(slice).unwrap();
        self.process_loaded_image(img);
        self.imageLoaded = true;
        return self;
    }

    fn process_loaded_image(&self, image: DynamicImage) {
        let bitmap = Bitmap::new(image);
        let pixels = bitmap.raw;

        image.scan(0, 0, bitmap.width, bitmap.height, |i| {
            // We want background underneath non-opaque regions to be white
            let opacity = pixels[i + 3] / 255;
            bitmap.data[i / 4] = luminance(
                255 + (pixels[i + 0] - 255) * opacity,
                255 + (pixels[i + 1] - 255) * opacity,
                255 + (pixels[i + 2] - 255) * opacity,
            )
        });

        self.luminanceData = Some(Box::new(bitmap));
        self.imageLoaded = true
    }

    /// Returns <symbol> tag. Always has viewBox specified and comes with no fill color,
    /// so it could be changed with <use> tag
    pub fn get_symbol(&self, id: &str) -> String {
        let width = self.luminanceData.width;
        let height = self.luminanceData.height;
        let path = self.get_path_tag();
        return format!(
            "<symbol viewBox=\"0 0 {width} {height}\" id=\"{id}\">{path}</symbol>",
            width = width,
            height = height,
            id = id,
            path = path
        );
    }

    /// Generates SVG image
    pub fn get_svg(&self) -> String {
        let width = self.params.width || self.luminanceData.width;
        let height = self.params.height || self.luminanceData.height;
        let bg = self.get_bg();
        let path = self.get_path_tag(
            self.params.color,
            if self.params.width {
                self.params.width / self.luminanceData.width
            } else {
                1
            },
            if self.params.height {
                self.params.height / self.luminanceData.height
            } else {
                1
            },
        );
        return format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\" version=\"1.1\"> {bg}${path}</svg>",
            width=width,
            height=height,
            bg=bg,
            path=path
        );
    }

    pub fn get_bg(&self) -> String {
        let bg = self.background;
        if bg == COLOR_TRANSPARENT {
            return "";
        } else {
            format!(
                "<rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"{bg}\" />",
                bg = bg
            )
        }
    }

    /// Generates just <path> tag without rest of the SVG file
    pub fn get_path_tag(
        &self,
        fillColor: Option<Box<String>>,
        x: Option<Box<i32>>,
        y: Option<Box<i32>>,
    ) -> String {
        let color = match fillColor {
            Some(val) => *val,
            None => self.params.color,
        };
        let fill = if color == COLOR_AUTO {
            if self.params.blackOnWhite {
                "black"
            } else {
                "white"
            }
        } else {
            color
        };

        if !self.imageLoaded {
            panic!("Image must be loaded first");
        }

        if !self.processed {
            self.bmToPathlist();
            self.processPath();
            self.processed = true;
        }
        let paths = self
            .pathlist
            .map(|path| path.curve.render_curve(x, y))
            .join(" ");
        return format!(
            "<path d=\"{paths}\" stroke=\"none\" fill=\"{fill}\" fill-rule=\"evenodd\"/>",
            paths = paths,
            fill = fill
        );
    }

    /// Creating a new {@link Path} for every group of black pixels.
    fn bmToPathlist(&self) {
        let threshold = if self.params.threshold == THRESHOLD_AUTO {
            self.luminanceData.histogram().auto_threshold()
        } else {
            128
        };
        let blackOnWhite = self.params.blackOnWhite;
        let blackMap = self.luminanceData.copy_with_cb(|lum| {
            let pastTheThreshold = if blackOnWhite {
                lum > threshold
            } else {
                lum < threshold
            };
            return if pastTheThreshold { 0 } else { 1 };
        });
        let mut currentPoint: Option<Box<Point>> = Some(Point::new(0, 0));

        // Clear path list
        self.pathlist = vec![];

        while (currentPoint = blackMap.find_next(currentPoint)) {
            let path = blackMap.find_path(currentPoint, self.params.turnPolicy);
            blackMap.xor_path(path);

            if path.area > self.params.turdSize {
                self.pathlist.push(path)
            }
        }
    }

    /// Processes path list created by _bmToPathlist method creating and optimizing {@link Curve}'s
    fn processPath(&self) {
        for i in 0..self.pathlist.len() {
            let mut path = self.pathlist[i];
            let mut curve = path.calc_sums().calc_lon().best_polygon().adjust_vertices();
            if path.sign == "-" {
                curve.reverse()
            }
            curve.smooth(self.params.alphaMax as f64);
            if self.params.optCurve {
                curve.optimize_curve(self.params.optTolerance)
            }
        }
        return ();
    }
}

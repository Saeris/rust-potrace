use base64::decode;
use constants::{SupportedTurnpolicyValues, COLOR_AUTO, COLOR_TRANSPARENT};
use types::{bitmap::Bitmap, path::Path, point::Point};
#[derive(Clone)]
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
            turnPolicy: SupportedTurnpolicyValues::Minority,
            turdSize: 2,
            alphaMax: 1,
            optCurve: true,
            optTolerance: 0.2,
            threshold: None,
            blackOnWhite: true,
            color: Some(Box::new(COLOR_AUTO.to_string())),
            background: Some(Box::new(COLOR_TRANSPARENT.to_string())),
            width: None,
            height: None,
        };
    }
}
#[derive(Clone)]
pub struct Potrace {
    pub luminanceData: Bitmap,
    pathlist: Vec<Path>, // []
    processed: bool,     // = false
    params: PotraceOptions,
}

impl Potrace {
    pub fn new(base64: &str, options: Option<Box<PotraceOptions>>) -> Potrace {
        let slice = decode(base64).unwrap().as_slice();
        let img = image::load_from_memory(slice).unwrap();
        let bitmap = Bitmap::new(img);
        match options {
            Some(val) => Potrace {
                luminanceData: bitmap,
                pathlist: vec![],
                processed: false,
                params: *val,
            },
            None => Potrace {
                luminanceData: bitmap,
                pathlist: vec![],
                processed: false,
                params: PotraceOptions {
                    ..Default::default()
                },
            },
        }
    }

    /// Sets algorithm parameters
    pub fn set_parameters(&mut self, newParams: PotraceOptions) {
        if newParams.color.is_some() || newParams.background.is_some() {
            self.processed = false
        }
        self.params = newParams;
    }

    /// Returns <symbol> tag. Always has viewBox specified and comes with no fill color,
    /// so it could be changed with <use> tag
    pub fn get_symbol(&self, id: &str) -> String {
        let width = self.luminanceData.width;
        let height = self.luminanceData.height;
        let path = self.get_path_tag(None, None, None);
        return format!(
            "<symbol viewBox=\"0 0 {width} {height}\" id=\"{id}\">{path}</symbol>",
            width = width,
            height = height,
            id = id,
            path = path
        );
    }

    /// Generates SVG image
    pub fn get_svg(&mut self) -> String {
        let width = match self.params.width.clone() {
            Some(val) => *val,
            None => self.luminanceData.width,
        };
        let height = match self.params.height.clone() {
            Some(val) => *val,
            None => self.luminanceData.height,
        };
        let bg = self.get_bg();
        let path = self.get_path_tag(
            self.params.color.clone(),
            match self.params.width.clone() {
                Some(val) => Some(Box::new(*val / self.luminanceData.width)),
                None => Some(Box::new(1)),
            },
            match self.params.height.clone() {
                Some(val) => Some(Box::new(*val / self.luminanceData.height)),
                None => Some(Box::new(1)),
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
        let bg = *self.params.background.clone().unwrap();
        if bg == COLOR_TRANSPARENT {
            return "".to_string();
        } else {
            format!(
                "<rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"{bg}\" />",
                bg = bg
            )
        }
    }

    /// Generates just <path> tag without rest of the SVG file
    pub fn get_path_tag(
        &mut self,
        fillColor: Option<Box<String>>,
        x: Option<Box<usize>>,
        y: Option<Box<usize>>,
    ) -> String {
        let color = match fillColor {
            Some(val) => *val,
            None => *self.params.color.clone().unwrap(),
        };
        let fill = if color == COLOR_AUTO {
            if self.params.blackOnWhite {
                "black".to_string()
            } else {
                "white".to_string()
            }
        } else {
            color
        };

        if !self.processed {
            self.bmToPathlist();
            self.processPath();
            self.processed = true;
        }

        let mut paths = Vec::with_capacity(self.pathlist.len());
        let width = match x {
            Some(val) => *val as f64,
            None => 1f64,
        };
        let height = match y {
            Some(val) => *val as f64,
            None => 1f64,
        };
        for path in &self.pathlist {
            paths.push(path.curve.render_curve(width, height))
        }
        return format!(
            "<path d=\"{paths}\" stroke=\"none\" fill=\"{fill}\" fill-rule=\"evenodd\"/>",
            paths = paths.join(" "),
            fill = fill
        );
    }

    /// Creating a new {@link Path} for every group of black pixels.
    fn bmToPathlist(&mut self) {
        let threshold = match self.params.threshold.clone() {
            Some(_val) => *self
                .luminanceData
                .histogram
                .auto_threshold(None, None)
                .unwrap(),
            None => vec![128u8],
        };
        let blackOnWhite = self.params.blackOnWhite.clone();
        let mut blackMap = self.luminanceData.generate_binary_bitmap(blackOnWhite, threshold[0]);
        let mut currentPoint: Option<Box<Point>> = Some(Box::new(Point::new(0f64, 0f64)));

        // Clear path list
        self.pathlist = vec![];

        while currentPoint.is_some() {
            let point = *currentPoint.unwrap();
            let path = blackMap.find_path(point, self.params.turnPolicy.clone());
            blackMap.xor_path(path);

            if path.area > self.params.turdSize as f64 {
                self.pathlist.push(path)
            }
            currentPoint = blackMap.find_next(point)
        }
    }

    /// Processes path list created by _bmToPathlist method creating and optimizing {@link Curve}'s
    fn processPath(&self) {
        for i in 0..self.pathlist.len() {
            let mut path = self.pathlist[i].clone();
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

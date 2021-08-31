use super::point::Point;

#[derive(Clone)]
pub struct Quad {
    pub data: Vec<f64>,
}

impl Quad {
    pub fn at(&self, x: usize, y: usize) -> f64 {
        return self.data[x * 3 + y];
    }

    /// Apply quadratic form Q to vector w = (w.x,w.y)
    pub fn quadform(&self, w: Point) -> f64 {
        let vec: &[f64; 3] = &[w.x, w.y, 1f64];
        let mut sum = 0f64;

        for x in 0..3 {
            for y in 0..3 {
                sum += vec[x] * self.at(x, y) * vec[y]
            }
        }

        return sum;
    }
}

impl Default for Quad {
    fn default() -> Quad {
        Quad {
            data: vec![0f64; 9],
        }
    }
}

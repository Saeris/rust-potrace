#[derive(Clone)]
pub struct Quad {
    pub data: Vec<f64>,
}

impl Quad {
    pub fn at(&mut self, x: usize, y: usize) -> f64 {
        return self.data[x * 3 + y];
    }
}

impl Default for Quad {
    fn default() -> Quad {
        Quad { data: vec![0.0; 9] }
    }
}

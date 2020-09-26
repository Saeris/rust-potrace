extern crate base64;
extern crate image;
extern crate num;

pub mod constants;

pub mod types {
    pub mod bitmap;
    pub mod curve;
    pub mod histogram;
    pub mod opti;
    pub mod path;
    pub mod point;
    pub mod quad;
    pub mod sum;
}

pub mod posterizer;

pub mod potrace;

pub mod utils;

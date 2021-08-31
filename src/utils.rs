use cached::proc_macro::cached;
use regex::{Captures, Regex};

#[cached]
pub fn get_attr_regexp(attr_name: &'static str) -> Regex {
  Regex::new(format!(" {}=\"((?:\\\\(?=\")\"|[^\"])+)\"", attr_name).as_str()).unwrap()
}

pub fn set_html_attribute(html: String, attr_name: &'static str, value: String) -> String {
  let attr = format!(" {}=\"{}\"", &attr_name, value);
  let fmt_attr = |caps: &Captures| format!("{}{}", &caps[0], attr);
  if Regex::new(format!(" {}=\"", &attr_name).as_str())
    .unwrap()
    .is_match(&html)
  {
    return Regex::new("<[a-z]+")
      .unwrap()
      .replace_all(&html, fmt_attr)
      .into_owned();
  } else {
    return get_attr_regexp(&attr_name)
      .replace_all(&html, fmt_attr)
      .into_owned();
  }
}

pub fn modulo(a: usize, n: usize) -> usize {
  if a >= n {
    a % n
  } else if a >= 0 {
    a
  } else {
    n - 1 - ((-1 - a as i32) as usize % n)
  }
}

/// return 1 if a <= b < c < a, in a cyclic sense (mod n)
pub fn cyclic(a: usize, b: usize, c: usize) -> bool {
  if a <= c {
    a <= b && b < c
  } else {
    a <= b || b < c
  }
}

pub fn sign(n: f64) -> f64 {
  if n > 0.0 {
    1.0
  } else if n < 0.0 {
    -1.0
  } else {
    0.0
  }
}

pub fn luminance(r: u8, g: u8, b: u8) -> usize {
  return (0.2126 * r as f64 + 0.7153 * g as f64 + 0.0721 * b as f64).round() as usize;
}

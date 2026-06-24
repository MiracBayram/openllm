use std::collections::VecDeque;

pub struct AnomalyDetector {
    mean: f64,
    m2: f64,
    count: u64,
    window: VecDeque<f64>,
    window_size: usize,
}

impl AnomalyDetector {
    pub fn new(window_size: usize) -> Self {
        Self {
            mean: 0.0,
            m2: 0.0,
            count: 0,
            window: VecDeque::with_capacity(window_size),
            window_size,
        }
    }

    pub fn observe(&mut self, x: f64) -> f32 {
        self.count += 1;
        let delta = x - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = x - self.mean;
        self.m2 += delta * delta2;
        self.window.push_back(x);
        if self.window.len() > self.window_size { self.window.pop_front(); }
        if self.count < 30 { return 0.0; }
        let variance = self.m2 / (self.count - 1) as f64;
        let std = variance.sqrt();
        if std < 1e-9 { return 0.0; }
        let z = (x - self.mean).abs() / std;
        if z > 3.0 { ((z - 3.0) / 3.0).min(1.0) as f32 } else { 0.0 }
    }
}

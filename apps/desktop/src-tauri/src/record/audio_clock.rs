// Snapvere by Brendigo
//! Bounded asynchronous stereo resampling for the experimental Linux recorder.
use std::collections::VecDeque;

const UNIT: u64 = 1_000_000;
const MAX_PPM: i64 = 2_000;
const TARGET_QUEUE: i64 = 960;

#[derive(Default)]
pub(super) struct DriftClock {
    phase: u64,
    ppm: i64,
}

impl DriftClock {
    /// Queue error is relative to the number of samples the video clock
    /// requests now. Smooth the proportional correction to reject jitter.
    pub(super) fn observe(&mut self, queued: usize, needed: u64) {
        let error = queued as i64 - needed.min(48_000) as i64 - TARGET_QUEUE;
        let desired = (error * 4).clamp(-MAX_PPM, MAX_PPM);
        let delta = desired - self.ppm;
        self.ppm += if delta.abs() < 16 { delta } else { delta / 16 };
    }

    fn step(&self) -> u64 {
        (UNIT as i64 + self.ppm) as u64
    }

    pub(super) fn next(&mut self, queue: &mut VecDeque<[i16; 2]>) -> Option<[i16; 2]> {
        let step = self.step();
        let advance = (self.phase + step) / UNIT;
        if queue.len() < (advance as usize + 1).max(2) {
            return None;
        }
        let a = queue[0];
        let b = queue[1];
        let mut sample = [0; 2];
        for channel in 0..2 {
            let weighted = i64::from(a[channel]) * (UNIT - self.phase) as i64
                + i64::from(b[channel]) * self.phase as i64;
            sample[channel] = (weighted / UNIT as i64) as i16;
        }
        self.phase = (self.phase + step) % UNIT;
        for _ in 0..advance {
            queue.pop_front();
        }
        Some(sample)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stereo_interpolation_preserves_channels_and_never_overreads() {
        let mut clock = DriftClock {
            phase: UNIT / 2,
            ppm: 0,
        };
        let mut queue = VecDeque::from([[1000, -1000], [3000, -3000], [5000, -5000]]);
        assert_eq!(clock.next(&mut queue), Some([2000, -2000]));
        assert_eq!(clock.next(&mut queue), Some([4000, -4000]));
        assert_eq!(clock.next(&mut queue), None);
        assert_eq!(queue.len(), 1);
    }

    #[test]
    fn four_hours_of_positive_and_negative_device_drift_stay_bounded() {
        // Fast-forward the exact phase accumulator at 10 ms intervals instead
        // of synthesizing billions of individual PCM samples.
        for device_ppm in [-1000_i64, -250, 0, 250, 1000] {
            let mut clock = DriftClock::default();
            let mut queued = TARGET_QUEUE;
            let mut input_phase = 0_i64;
            for tick in 0..1_440_000 {
                input_phase += 480 * (UNIT as i64 + device_ppm);
                queued += input_phase / UNIT as i64;
                input_phase %= UNIT as i64;
                clock.observe(queued as usize, 480);
                let total = clock.phase + 480 * clock.step();
                queued -= (total / UNIT) as i64;
                clock.phase = total % UNIT;
                assert!(clock.ppm.abs() <= MAX_PPM);
                assert!(
                    (2..4800).contains(&queued),
                    "{device_ppm} at {tick}: {queued}"
                );
            }
            assert!((queued - TARGET_QUEUE).abs() <= 300);
        }
    }

    #[test]
    fn rate_limit_and_pause_reset_do_not_reuse_previous_samples() {
        let mut clock = DriftClock::default();
        for _ in 0..1000 {
            clock.observe(24_000, 480);
        }
        assert_eq!(clock.ppm, MAX_PPM);
        for _ in 0..1000 {
            clock.observe(0, 480);
        }
        assert_eq!(clock.ppm, -MAX_PPM);
        let reset = DriftClock::default();
        assert_eq!(reset.phase, 0);
        assert_eq!(reset.step(), UNIT);
    }
}

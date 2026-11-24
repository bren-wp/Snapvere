// Snapvere by Brendigo
//! Crop-local annotations: precompile bounded row spans once per edit.
use crate::models::PixelRect;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::Instant;

const MAX_MARKS: usize = 32;
const MAX_POINTS: usize = 128;
const MAX_SPANS: usize = 200_000;
type Span = (u32, u32, u32);

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MarkKind {
    Rectangle,
    Mask,
    Ellipse,
    Line,
    Arrow,
    Pen,
    Marker,
    Text,
    Step,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Point {
    pub x: u32,
    pub y: u32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Mark {
    pub kind: MarkKind,
    pub rect: PixelRect,
    #[serde(default)]
    pub points: Vec<Point>,
    #[serde(default)]
    pub glyph: Vec<u8>,
    #[serde(default)]
    pub style: Style,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Style {
    pub rgb: [u8; 3],
    pub width: u8,
    pub opacity: u8,
}

impl Default for Style {
    fn default() -> Self {
        Self {
            rgb: [9, 191, 217],
            width: 2,
            opacity: 255,
        }
    }
}

#[derive(Clone)]
pub(super) struct Layer {
    kind: MarkKind,
    spans: Vec<Span>,
    color: [u8; 4],
}

pub(super) struct History {
    layers: Vec<Layer>,
    redo: Vec<Layer>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub session: String,
    pub width: u32,
    pub height: u32,
    pub remaining: usize,
    pub undo_count: usize,
    pub redo_count: usize,
    pub frame_id: u64,
    pub timestamp_100ns: u64,
    pub revision: u64,
    pub capture_to_sample_us: u64,
    pub encoder_to_sample_us: u64,
    pub sample_age_us: u64,
}

#[derive(Clone, Copy)]
pub(super) struct FrameStamp {
    pub id: u64,
    pub timestamp_100ns: u64,
    pub capture_started: Instant,
    pub encoder_accepted: Instant,
}

#[derive(Clone, Copy)]
struct SampleTiming {
    sampled_at: Instant,
    capture_to_sample_us: u64,
    encoder_to_sample_us: u64,
}

fn micros(duration: std::time::Duration) -> u64 {
    u64::try_from(duration.as_micros()).unwrap_or(u64::MAX)
}

pub(super) struct Preview {
    session: String,
    width: u32,
    height: u32,
    small: (u32, u32),
    history: History,
    frame: Option<image::RgbaImage>,
    frame_id: u64,
    timestamp_100ns: u64,
    revision: u64,
    frame_revision: u64,
    timing: Option<SampleTiming>,
}

struct Raster {
    w: u32,
    h: u32,
    rows: BTreeMap<u32, Vec<(u32, u32)>>,
    count: usize,
}

impl Raster {
    fn new(w: u32, h: u32) -> Self {
        Self {
            w,
            h,
            rows: BTreeMap::new(),
            count: 0,
        }
    }

    fn span(&mut self, y: i64, x0: i64, x1: i64) -> Result<(), String> {
        if y < 0 || y >= i64::from(self.h) {
            return Ok(());
        }
        let a = x0.clamp(0, i64::from(self.w)) as u32;
        let b = x1.clamp(0, i64::from(self.w)) as u32;
        if a < b {
            if self.count >= MAX_SPANS {
                return Err("Annotation raster exceeds work budget".into());
            }
            self.rows.entry(y as u32).or_default().push((a, b));
            self.count += 1;
        }
        Ok(())
    }

    fn stroke(&mut self, a: Point, b: Point, radius: i64) -> Result<(), String> {
        let (mut x, mut y) = (i64::from(a.x), i64::from(a.y));
        let (tx, ty) = (i64::from(b.x), i64::from(b.y));
        let dx = (tx - x).abs();
        let dy = -(ty - y).abs();
        let sx = if x < tx { 1 } else { -1 };
        let sy = if y < ty { 1 } else { -1 };
        let mut error = dx + dy;
        loop {
            for row in y - radius..=y + radius {
                self.span(row, x - radius, x + radius + 1)?;
            }
            if x == tx && y == ty {
                break;
            }
            let e = error * 2;
            if e >= dy {
                error += dy;
                x += sx;
            }
            if e <= dx {
                error += dx;
                y += sy;
            }
        }
        Ok(())
    }

    fn finish(self) -> Vec<Span> {
        let mut spans: Vec<Span> = Vec::new();
        for (y, mut row) in self.rows {
            row.sort_unstable();
            for (start, end) in row {
                if let Some(last) = spans.last_mut() {
                    if last.0 == y && start <= last.2 {
                        last.2 = last.2.max(end);
                        continue;
                    }
                }
                spans.push((y, start, end));
            }
        }
        spans
    }
}

impl Preview {
    pub(super) fn new(width: u32, height: u32) -> Self {
        let divisor = width.div_ceil(960).max(height.div_ceil(540)).max(1);
        Self {
            session: uuid::Uuid::new_v4().to_string(),
            width,
            height,
            small: ((width / divisor).max(1), (height / divisor).max(1)),
            history: History {
                layers: Vec::new(),
                redo: Vec::new(),
            },
            frame: None,
            frame_id: 0,
            timestamp_100ns: 0,
            revision: 0,
            frame_revision: 0,
            timing: None,
        }
    }

    pub(super) fn begin_pause(&mut self) {
        self.session = uuid::Uuid::new_v4().to_string();
    }

    pub(super) fn check_session(&self, session: &str) -> Result<(), String> {
        if self.session != session {
            return Err("Recording preview session changed".into());
        }
        Ok(())
    }

    pub(super) fn snapshot(&self) -> Result<Snapshot, String> {
        let timing = self.timing.ok_or("Recording has no preview frame")?;
        Ok(Snapshot {
            session: self.session.clone(),
            width: self.small.0,
            height: self.small.1,
            remaining: MAX_MARKS - self.history.layers.len(),
            undo_count: self
                .history
                .layers
                .iter()
                .filter(|l| l.kind != MarkKind::Mask)
                .count(),
            redo_count: self.history.redo.len(),
            frame_id: self.frame_id,
            timestamp_100ns: self.timestamp_100ns,
            revision: self.frame_revision,
            capture_to_sample_us: timing.capture_to_sample_us,
            encoder_to_sample_us: timing.encoder_to_sample_us,
            sample_age_us: micros(timing.sampled_at.elapsed()),
        })
    }

    // Fixed little-endian header: dimensions, sequence, recorder PTS,
    // annotation revision. A slow reader sees the newest frame only.
    pub(super) fn packet(&self, after: u64) -> Result<Vec<u8>, String> {
        let frame = self
            .frame
            .as_ref()
            .ok_or("Recording has no preview frame")?;
        if after >= self.frame_id {
            return Ok(Vec::new());
        }
        let mut packet = Vec::with_capacity(32 + frame.as_raw().len());
        packet.extend_from_slice(&self.small.0.to_le_bytes());
        packet.extend_from_slice(&self.small.1.to_le_bytes());
        packet.extend_from_slice(&self.frame_id.to_le_bytes());
        packet.extend_from_slice(&self.timestamp_100ns.to_le_bytes());
        packet.extend_from_slice(&self.frame_revision.to_le_bytes());
        packet.extend_from_slice(frame.as_raw());
        Ok(packet)
    }

    pub(super) fn ready(&self) -> bool {
        self.frame.is_some()
    }

    fn compile(&self, mark: &Mark) -> Result<Layer, String> {
        let r = mark.rect;
        let axis = |start: u32, len: u32, small: u32, large: u32| {
            let end = start.checked_add(len)?;
            if len == 0 || end > small {
                return None;
            }
            let first = u64::from(start) * u64::from(large) / u64::from(small);
            let last = (u64::from(end) * u64::from(large)).div_ceil(u64::from(small));
            Some((first as i64, last as i64))
        };
        let (x0, x1) = axis(r.x, r.width, self.small.0, self.width)
            .ok_or("Invalid annotation horizontal bounds")?;
        let (y0, y1) = axis(r.y, r.height, self.small.1, self.height)
            .ok_or("Invalid annotation vertical bounds")?;
        if mark.points.len() > MAX_POINTS {
            return Err("Too many stroke points".into());
        }
        let glyph_kind = matches!(mark.kind, MarkKind::Text | MarkKind::Step);
        if glyph_kind {
            if r.width > 256
                || r.height > 64
                || mark.glyph.len() != (r.width * r.height) as usize
                || mark.glyph.iter().any(|&v| v > 1)
                || !mark.glyph.contains(&1)
            {
                return Err("Invalid annotation glyph coverage".into());
            }
        } else if !mark.glyph.is_empty() {
            return Err("Unexpected annotation glyph".into());
        }
        let mut raster = Raster::new(self.width, self.height);
        if !(1..=24).contains(&mark.style.width) || mark.style.opacity == 0 {
            return Err("Invalid annotation style".into());
        }
        let border = (u64::from(mark.style.width) * u64::from(self.width))
            .div_ceil(u64::from(self.small.0))
            .clamp(1, 48) as i64;
        let project = |p: Point| -> Result<Point, String> {
            if p.x >= self.small.0 || p.y >= self.small.1 {
                return Err("Stroke outside preview".into());
            }
            Ok(Point {
                x: (u64::from(p.x) * u64::from(self.width) / u64::from(self.small.0)) as u32,
                y: (u64::from(p.y) * u64::from(self.height) / u64::from(self.small.1)) as u32,
            })
        };
        match mark.kind {
            MarkKind::Mask | MarkKind::Rectangle => {
                for y in y0..y1 {
                    if mark.kind == MarkKind::Mask || y - y0 < border || y1 - y <= border {
                        raster.span(y, x0, x1)?;
                    } else {
                        raster.span(y, x0, (x0 + border).min(x1))?;
                        raster.span(y, (x1 - border).max(x0), x1)?;
                    }
                }
            }
            MarkKind::Ellipse => {
                let cx = (x0 + x1) as f64 / 2.0;
                let cy = (y0 + y1) as f64 / 2.0;
                let rx = (x1 - x0) as f64 / 2.0;
                let ry = (y1 - y0) as f64 / 2.0;
                let inner_x = (rx - border as f64).max(0.0);
                let inner_y = (ry - border as f64).max(0.0);
                for y in y0..y1 {
                    let dy = (y as f64 + 0.5 - cy).abs();
                    let extent = rx * (1.0 - (dy / ry).powi(2)).max(0.0).sqrt();
                    let left = (cx - extent).floor() as i64;
                    let right = (cx + extent).ceil() as i64;
                    if inner_x > 0.0 && dy < inner_y {
                        let inner = inner_x * (1.0 - (dy / inner_y).powi(2)).sqrt();
                        raster.span(y, left, (cx - inner).ceil() as i64)?;
                        raster.span(y, (cx + inner).floor() as i64, right)?;
                    } else {
                        raster.span(y, left, right)?;
                    }
                }
            }
            MarkKind::Line | MarkKind::Arrow | MarkKind::Pen | MarkKind::Marker => {
                let points = mark
                    .points
                    .iter()
                    .copied()
                    .map(project)
                    .collect::<Result<Vec<_>, _>>()?;
                if points.len() < 2
                    || (matches!(mark.kind, MarkKind::Line | MarkKind::Arrow) && points.len() != 2)
                {
                    return Err("Invalid stroke points".into());
                }
                let radius = if mark.kind == MarkKind::Marker {
                    border * 2
                } else {
                    border / 2
                };
                for segment in points.windows(2) {
                    raster.stroke(segment[0], segment[1], radius)?;
                }
                if mark.kind == MarkKind::Arrow {
                    let a = points[0];
                    let b = points[1];
                    let dx = f64::from(b.x) - f64::from(a.x);
                    let dy = f64::from(b.y) - f64::from(a.y);
                    let length = dx.hypot(dy);
                    if length > 0.0 {
                        let head = (length * 0.3).min((border * 8) as f64);
                        for side in [-1.0, 1.0] {
                            let x = f64::from(b.x) - head * (dx + side * dy * 0.6) / length;
                            let y = f64::from(b.y) - head * (dy - side * dx * 0.6) / length;
                            raster.stroke(
                                b,
                                Point {
                                    x: x.clamp(0.0, f64::from(self.width - 1)) as u32,
                                    y: y.clamp(0.0, f64::from(self.height - 1)) as u32,
                                },
                                radius,
                            )?;
                        }
                    }
                }
            }
            MarkKind::Text | MarkKind::Step => {
                for row in 0..r.height {
                    let (top, bottom) =
                        axis(r.y + row, 1, self.small.1, self.height).ok_or("Invalid glyph row")?;
                    for col in 0..r.width {
                        if mark.glyph[(row * r.width + col) as usize] == 0 {
                            continue;
                        }
                        let (left, right) = axis(r.x + col, 1, self.small.0, self.width)
                            .ok_or("Invalid glyph column")?;
                        for y in top..bottom {
                            raster.span(y, left, right)?;
                        }
                    }
                }
            }
        }
        let spans = raster.finish();
        if spans.is_empty() {
            return Err("Empty annotation".into());
        }
        let [r, g, b] = mark.style.rgb;
        let color = if mark.kind == MarkKind::Mask {
            [0, 0, 0, 255]
        } else {
            [b, g, r, mark.style.opacity]
        };
        Ok(Layer {
            kind: mark.kind,
            spans,
            color,
        })
    }

    // Build the complete edit transaction without mutating the live engine.
    // Committed masks never enter redo and cannot be undone by drawing history.
    pub(super) fn plan(&self, marks: &[Mark], delta: i32) -> Result<History, String> {
        if marks.len() > MAX_MARKS || delta.unsigned_abs() as usize > MAX_MARKS {
            return Err("Too many recording edits".into());
        }
        let mut layers = self.history.layers.clone();
        let mut redo = self.history.redo.clone();
        for _ in 0..delta.unsigned_abs() {
            if delta < 0 {
                let index = layers
                    .iter()
                    .rposition(|l| l.kind != MarkKind::Mask)
                    .ok_or("No drawing to undo")?;
                redo.push(layers.remove(index));
            } else {
                layers.push(redo.pop().ok_or("No drawing to redo")?);
            }
        }
        if layers.len() + marks.len() > MAX_MARKS {
            return Err("Too many recording annotations".into());
        }
        if !marks.is_empty() {
            redo.clear();
        }
        let mut span_count: usize = layers.iter().chain(&redo).map(|l| l.spans.len()).sum();
        for mark in marks {
            let layer = self.compile(mark)?;
            span_count = span_count
                .checked_add(layer.spans.len())
                .ok_or("Annotation span count overflow")?;
            if span_count > MAX_SPANS {
                return Err("Annotation coverage exceeds the recording work budget".into());
            }
            layers.push(layer);
        }
        let area: u64 = layers
            .iter()
            .flat_map(|l| &l.spans)
            .map(|&(_, a, b)| u64::from(b - a))
            .sum();
        if area > u64::from(self.width) * u64::from(self.height) * 2 || span_count > MAX_SPANS {
            return Err("Annotation coverage exceeds the recording work budget".into());
        }
        Ok(History { layers, redo })
    }

    pub(super) fn apply(&mut self, history: History) {
        self.history = history;
        self.revision = self.revision.saturating_add(1);
    }

    pub(super) fn compose(&self, bgra: &mut [u8]) -> Result<(), String> {
        if bgra.len() != super::pixels::checked_bgra_len(self.width, self.height)? {
            return Err("Invalid annotation frame dimensions".into());
        }
        let stride = self.width as usize * 4;
        for mask_pass in [false, true] {
            for layer in &self.history.layers {
                if (layer.kind == MarkKind::Mask) != mask_pass {
                    continue;
                }
                for &(y, a, b) in &layer.spans {
                    let offset = y as usize * stride;
                    let (pixels, _) =
                        bgra[offset + a as usize * 4..offset + b as usize * 4].as_chunks_mut::<4>();
                    let alpha = u16::from(layer.color[3]);
                    if alpha == 255 {
                        pixels.fill(layer.color);
                    } else {
                        for pixel in pixels {
                            for (channel, color) in pixel[..3].iter_mut().zip(layer.color) {
                                *channel = ((u16::from(*channel) * (255 - alpha)
                                    + u16::from(color) * alpha
                                    + 127)
                                    / 255) as u8;
                            }
                            pixel[3] = 255;
                        }
                    }
                }
            }
        }
        Ok(())
    }

    pub(super) fn remember(&mut self, bgra: &[u8], stamp: FrameStamp) -> Result<(), String> {
        if stamp.id <= self.frame_id
            || (self.frame_id != 0 && stamp.timestamp_100ns <= self.timestamp_100ns)
            || stamp.encoder_accepted < stamp.capture_started
            || stamp.encoder_accepted > Instant::now()
        {
            return Err("Non-monotonic recording preview frame".into());
        }
        if bgra.len() != super::pixels::checked_bgra_len(self.width, self.height)? {
            return Err("Invalid recording preview frame".into());
        }
        let (w, h) = self.small;
        let rgba = self
            .frame
            .get_or_insert_with(|| image::RgbaImage::new(w, h));
        for y in 0..h {
            for x in 0..w {
                let sx = u64::from(x) * u64::from(self.width) / u64::from(w);
                let sy = u64::from(y) * u64::from(self.height) / u64::from(h);
                let p = (sy * u64::from(self.width) + sx) as usize * 4;
                rgba.put_pixel(x, y, image::Rgba([bgra[p + 2], bgra[p + 1], bgra[p], 255]));
            }
        }
        let sampled_at = Instant::now();
        self.frame_id = stamp.id;
        self.timestamp_100ns = stamp.timestamp_100ns;
        self.frame_revision = self.revision;
        self.timing = Some(SampleTiming {
            sampled_at,
            capture_to_sample_us: micros(sampled_at.duration_since(stamp.capture_started)),
            encoder_to_sample_us: micros(sampled_at.duration_since(stamp.encoder_accepted)),
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stamp(id: u64, timestamp_100ns: u64) -> FrameStamp {
        let now = Instant::now();
        FrameStamp {
            id,
            timestamp_100ns,
            capture_started: now,
            encoder_accepted: now,
        }
    }

    fn mark(kind: MarkKind, x: u32, y: u32, w: u32, h: u32) -> Mark {
        Mark {
            kind,
            rect: PixelRect {
                x,
                y,
                width: w,
                height: h,
            },
            points: Vec::new(),
            glyph: Vec::new(),
            style: Style::default(),
        }
    }

    fn fixture() -> Preview {
        let mut preview = Preview::new(128, 96);
        let mut marks = vec![
            mark(MarkKind::Mask, 32, 24, 64, 48),
            mark(MarkKind::Rectangle, 4, 4, 120, 88),
            mark(MarkKind::Ellipse, 8, 8, 112, 80),
        ];
        for kind in [
            MarkKind::Line,
            MarkKind::Arrow,
            MarkKind::Pen,
            MarkKind::Marker,
        ] {
            let mut stroke = mark(kind, 1, 1, 126, 94);
            stroke.points = vec![Point { x: 4, y: 4 }, Point { x: 120, y: 88 }];
            if kind == MarkKind::Marker {
                stroke.style = Style {
                    rgb: [255, 220, 0],
                    width: 2,
                    opacity: 128,
                };
            }
            marks.push(stroke);
        }
        for kind in [MarkKind::Text, MarkKind::Step] {
            let mut text = mark(kind, 16, 4, 4, 4);
            text.glyph = vec![1; 16];
            marks.push(text);
        }
        let plan = preview.plan(&marks, 0).unwrap();
        preview.apply(plan);
        preview
    }

    fn assert_pixels(frame: &[u8]) {
        for y in 24..72 {
            for x in 32..96 {
                let p = (y * 128 + x) * 4;
                assert_eq!(&frame[p..p + 4], &[0, 0, 0, 255]);
            }
        }
    }

    #[test]
    fn every_tool_composites_and_undo_redo_never_removes_masks() {
        let mut preview = fixture();
        assert_eq!(preview.history.layers.len(), 9);
        let mut frame = vec![255; 128 * 96 * 4];
        preview.compose(&mut frame).unwrap();
        assert_pixels(&frame);
        assert_ne!(
            &frame[(4 * 128 + 16) * 4..(4 * 128 + 16) * 4 + 4],
            &[255; 4]
        );
        let plan = preview.plan(&[], -8).unwrap();
        preview.apply(plan);
        assert_eq!(preview.history.layers.len(), 1);
        frame.fill(255);
        preview.compose(&mut frame).unwrap();
        assert_pixels(&frame);
        assert!(preview.plan(&[], -1).is_err());
        let plan = preview.plan(&[], 8).unwrap();
        preview.apply(plan);
        assert_eq!(preview.history.layers.len(), 9);
        preview.remember(&frame, stamp(1, 0)).unwrap();
        assert_eq!(
            preview.frame.as_ref().unwrap().get_pixel(64, 48).0,
            [0, 0, 0, 255]
        );
        assert!(preview.compose(&mut frame[..8]).is_err());
    }

    #[test]
    fn rejects_stale_and_invalid_edits_without_changing_history() {
        let mut preview = fixture();
        let old = preview.session.clone();
        preview.begin_pause();
        assert!(preview.check_session(&old).is_err());
        assert!(preview
            .plan(&[mark(MarkKind::Mask, u32::MAX, 0, 2, 2)], 0)
            .is_err());
        assert!(preview
            .plan(&[mark(MarkKind::Text, 0, 0, 4, 4)], 0)
            .is_err());
        assert_eq!(preview.history.layers.len(), 9);
    }

    #[test]
    fn latest_packet_keeps_encoder_sequence_timestamp_and_revision() {
        let mut preview = Preview::new(32, 32);
        let mut mask = mark(MarkKind::Mask, 8, 8, 8, 8);
        mask.style.opacity = 1;
        mask.style.rgb = [255, 0, 0];
        let plan = preview.plan(&[mask], 0).unwrap();
        preview.apply(plan);
        let mut frame = vec![255; 32 * 32 * 4];
        preview.compose(&mut frame).unwrap();
        preview.remember(&frame, stamp(2, 100)).unwrap();
        preview.remember(&frame, stamp(5, 400)).unwrap();
        assert!(preview.remember(&frame, stamp(4, 500)).is_err());
        assert!(preview.remember(&frame, stamp(6, 400)).is_err());
        let packet = preview.packet(2).unwrap();
        assert_eq!(packet.len(), 32 + frame.len());
        assert_eq!(&packet[8..16], &5_u64.to_le_bytes());
        assert_eq!(&packet[16..24], &400_u64.to_le_bytes());
        assert_eq!(&packet[24..32], &1_u64.to_le_bytes());
        let center = 32 + (10 * 32 + 10) * 4;
        assert_eq!(&packet[center..center + 4], &[0, 0, 0, 255]);
        assert!(preview.packet(5).unwrap().is_empty());
        let snapshot = preview.snapshot().unwrap();
        assert!(snapshot.capture_to_sample_us >= snapshot.encoder_to_sample_us);
    }

    // Distinct source-frame markers survive lossy H.264 and GIF palettes.
    // Match the actual packet bytes to decoded frame identity and media PTS.
    #[test]
    fn preview_timing_encoder_fixtures() {
        use super::super::gifenc::GifEncoder;

        let mut preview = Preview::new(128, 96);
        let plan = preview
            .plan(&[mark(MarkKind::Mask, 32, 24, 64, 48)], 0)
            .unwrap();
        preview.apply(plan);
        let dir = tempfile::tempdir().unwrap();
        let gif = dir.path().join("timing.gif");
        let mut encoder = GifEncoder::new(&gif, 128, 96, 10, 100).unwrap();
        #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
        let mp4 = dir.path().join("timing.mp4");
        #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
        let mut video =
            super::super::linux_mp4::LinuxMp4::new(&mp4, 128, 96, 10, 90, false).unwrap();
        let mut manifest = String::from(
            "frame_id,pts_100ns,revision,marker,capture_to_sample_us,encoder_to_sample_us\n",
        );
        let mut after = 0;
        for id in 1_u64..=12 {
            let started = Instant::now();
            let mut frame = vec![255; 128 * 96 * 4];
            for bit in 0..4 {
                let value = if id & (1 << bit) == 0 { 0 } else { 255 };
                for y in 4..20 {
                    for x in 8 + bit * 24..24 + bit * 24 {
                        let p = (y * 128 + x) * 4;
                        frame[p..p + 4].copy_from_slice(&[value, value, value, 255]);
                    }
                }
            }
            preview.compose(&mut frame).unwrap();
            let pts = (id - 1) * 1_000_000;
            encoder.write(&frame).unwrap();
            #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
            video.write(&frame, pts as i64, 1_000_000).unwrap();
            preview
                .remember(
                    &frame,
                    FrameStamp {
                        id,
                        timestamp_100ns: pts,
                        capture_started: started,
                        encoder_accepted: Instant::now(),
                    },
                )
                .unwrap();
            let packet = preview.packet(after).unwrap();
            let snapshot = preview.snapshot().unwrap();
            assert_eq!(packet.len(), 32 + frame.len());
            let mut marker = 0;
            for bit in 0..4 {
                let p = 32 + (12 * 128 + 16 + bit * 24) * 4;
                if packet[p] > 128 {
                    marker |= 1 << bit;
                }
            }
            assert_eq!(marker, id);
            assert_eq!(&packet[8..16], &id.to_le_bytes());
            assert_eq!(&packet[16..24], &pts.to_le_bytes());
            assert_eq!(&packet[24..32], &snapshot.revision.to_le_bytes());
            assert!(preview.packet(id).unwrap().is_empty());
            assert!(snapshot.capture_to_sample_us >= snapshot.encoder_to_sample_us);
            manifest.push_str(&format!(
                "{id},{pts},{},{marker},{},{}\n",
                snapshot.revision, snapshot.capture_to_sample_us, snapshot.encoder_to_sample_us
            ));
            after = id;
        }
        encoder.finish().unwrap();
        drop(encoder);
        if let Some(path) = std::env::var_os("SNAPVERE_TIMING_GIF") {
            std::fs::copy(&gif, path).unwrap();
        }
        #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
        {
            video.finish().unwrap();
            drop(video);
            if let Some(path) = std::env::var_os("SNAPVERE_TIMING_MP4") {
                std::fs::copy(&mp4, path).unwrap();
            }
        }
        if let Some(path) = std::env::var_os("SNAPVERE_TIMING_MANIFEST") {
            std::fs::write(path, manifest).unwrap();
        }
    }

    #[test]
    fn annotated_gif_and_mp4_encoder_fixtures() {
        let preview = fixture();
        let dir = tempfile::tempdir().unwrap();
        let gif = dir.path().join("annotated.gif");
        let mut encoder = super::super::gifenc::GifEncoder::new(&gif, 128, 96, 10, 100).unwrap();
        #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
        let mp4 = dir.path().join("annotated.mp4");
        #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
        let mut video =
            super::super::linux_mp4::LinuxMp4::new(&mp4, 128, 96, 10, 90, false).unwrap();
        for tick in 0..12 {
            let mut frame = vec![255; 128 * 96 * 4];
            frame[..4].copy_from_slice(&[tick as u8 * 10, 100, 180, 255]);
            preview.compose(&mut frame).unwrap();
            assert_pixels(&frame);
            encoder.write(&frame).unwrap();
            #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
            video.write(&frame, tick * 1_000_000, 1_000_000).unwrap();
        }
        encoder.finish().unwrap();
        drop(encoder);
        let decoded = image::open(&gif).unwrap().to_rgb8();
        let center = decoded.get_pixel(64, 48).0;
        assert!(center.iter().all(|&v| v < 16));
        if let Some(path) = std::env::var_os("SNAPVERE_ANNOTATED_GIF") {
            std::fs::copy(&gif, path).unwrap();
        }
        #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
        {
            video.finish().unwrap();
            drop(video);
            if let Some(path) = std::env::var_os("SNAPVERE_ANNOTATED_MP4") {
                std::fs::copy(&mp4, path).unwrap();
            }
        }
    }
}

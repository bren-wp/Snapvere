// Snapvere by Brendigo
//! Bounded crop-local annotation composition and last encoded-frame preview.
use crate::models::PixelRect;
use serde::{Deserialize, Serialize};

const MAX_MARKS: usize = 32;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MarkKind {
    Rectangle,
    Mask,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Mark {
    pub kind: MarkKind,
    pub rect: PixelRect,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub session: String,
    pub width: u32,
    pub height: u32,
    pub remaining: usize,
    pub image: String,
}

pub(super) struct Preview {
    session: String,
    width: u32,
    height: u32,
    small: (u32, u32),
    marks: Vec<Mark>,
    frame: Option<image::RgbaImage>,
}

impl Preview {
    pub(super) fn new(width: u32, height: u32) -> Self {
        let divisor = width.div_ceil(960).max(height.div_ceil(540)).max(1);
        Self {
            session: uuid::Uuid::new_v4().to_string(),
            width,
            height,
            small: ((width / divisor).max(1), (height / divisor).max(1)),
            marks: Vec::new(),
            frame: None,
        }
    }

    pub(super) fn check_session(&self, session: &str) -> Result<(), String> {
        if self.session != session {
            return Err("Recording preview session changed".into());
        }
        Ok(())
    }

    pub(super) fn snapshot(&self) -> Result<Snapshot, String> {
        let frame = self.frame.as_ref().ok_or("Recording has no preview frame")?;
        Ok(Snapshot {
            session: self.session.clone(),
            width: self.small.0,
            height: self.small.1,
            remaining: MAX_MARKS - self.marks.len(),
            image: crate::capture::to_png_data_url(frame).map_err(|e| e.to_string())?,
        })
    }

    pub(super) fn ready(&self) -> bool {
        self.frame.is_some()
    }

    // Validate the entire edit before applying any part of it. Coordinates
    // are integer preview pixels, not desktop or window coordinates.
    pub(super) fn map_marks(&self, marks: &[Mark]) -> Result<Vec<Mark>, String> {
        if marks.len() > MAX_MARKS - self.marks.len() {
            return Err("Too many recording annotations".into());
        }
        let axis = |start: u32, len: u32, small: u32, large: u32| {
            let end = start.checked_add(len)?;
            if len == 0 || end > small {
                return None;
            }
            let first = u64::from(start) * u64::from(large) / u64::from(small);
            let last = (u64::from(end) * u64::from(large)).div_ceil(u64::from(small));
            Some((first as u32, (last - first) as u32))
        };
        let mapped: Vec<_> = marks
            .iter()
            .map(|mark| {
                let r = mark.rect;
                let (x, width) = axis(r.x, r.width, self.small.0, self.width)
                    .ok_or("Invalid annotation horizontal bounds")?;
                let (y, height) = axis(r.y, r.height, self.small.1, self.height)
                    .ok_or("Invalid annotation vertical bounds")?;
                Ok(Mark {
                    kind: mark.kind,
                    rect: PixelRect {
                        x,
                        y,
                        width,
                        height,
                    },
                })
            })
            .collect::<Result<_, String>>()?;
        // Bound aggregate coverage, not just the number of rectangles.
        // Even dozens of overlapping full-frame masks must not stall capture.
        let area: u64 = self
            .marks
            .iter()
            .chain(&mapped)
            .map(|mark| u64::from(mark.rect.width) * u64::from(mark.rect.height))
            .sum();
        if area > u64::from(self.width) * u64::from(self.height) * 2 {
            return Err("Annotation coverage exceeds the recording work budget".into());
        }
        Ok(mapped)
    }

    pub(super) fn append(&mut self, marks: Vec<Mark>) {
        self.marks.extend(marks);
    }

    pub(super) fn compose(&self, bgra: &mut [u8]) -> Result<(), String> {
        if bgra.len() != super::pixels::checked_bgra_len(self.width, self.height)? {
            return Err("Invalid annotation frame dimensions".into());
        }
        let stride = self.width as usize * 4;
        // Masks always win, even over an intersecting drawing.
        for mask_pass in [false, true] {
            for mark in &self.marks {
                let mask = matches!(mark.kind, MarkKind::Mask);
                if mask != mask_pass {
                    continue;
                }
                let r = mark.rect;
                let x0 = r.x as usize;
                let y0 = r.y as usize;
                let x1 = (r.x + r.width) as usize;
                let y1 = (r.y + r.height) as usize;
                let border = (self.width / 320).clamp(2, 12) as usize;
                let color = if mask {
                    [0, 0, 0, 255]
                } else {
                    [217, 191, 9, 255]
                };
                let paint = |row: &mut [u8], start: usize, end: usize| {
                    for pixel in row[start * 4..end * 4].as_chunks_mut::<4>().0 {
                        *pixel = color;
                    }
                };
                for y in y0..y1 {
                    let row = &mut bgra[y * stride..(y + 1) * stride];
                    if mask || y - y0 < border || y1 - y <= border {
                        paint(row, x0, x1);
                    } else {
                        let left = (x0 + border).min(x1);
                        paint(row, x0, left);
                        paint(row, x1.saturating_sub(border).max(left), x1);
                    }
                }
            }
        }
        Ok(())
    }

    // Only frames accepted by the encoder are retained; never retain a
    // separate full-size unredacted preview. Sampling has a fixed upper bound.
    pub(super) fn remember(&mut self, bgra: &[u8]) -> Result<(), String> {
        if bgra.len() != super::pixels::checked_bgra_len(self.width, self.height)? {
            return Err("Invalid recording preview frame".into());
        }
        let (w, h) = self.small;
        let mut rgba = image::RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let sx = u64::from(x) * u64::from(self.width) / u64::from(w);
                let sy = u64::from(y) * u64::from(self.height) / u64::from(h);
                let p = (sy * u64::from(self.width) + sx) as usize * 4;
                rgba.put_pixel(x, y, image::Rgba([bgra[p + 2], bgra[p + 1], bgra[p], 255]));
            }
        }
        self.frame = Some(rgba);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mark(kind: MarkKind) -> Mark {
        Mark {
            kind,
            rect: PixelRect {
                x: 1,
                y: 1,
                width: 3,
                height: 3,
            },
        }
    }

    #[test]
    fn masks_win_over_drawings_and_preview_contains_composited_pixels() {
        let mut preview = Preview::new(16, 16);
        let marks = preview
            .map_marks(&[mark(MarkKind::Mask), mark(MarkKind::Rectangle)])
            .unwrap();
        preview.append(marks);
        let mut frame = vec![255; 16 * 16 * 4];
        preview.compose(&mut frame).unwrap();
        assert_eq!(&frame[68..72], &[0, 0, 0, 255]);
        assert_eq!(&frame[..4], &[255, 255, 255, 255]);
        preview.remember(&frame).unwrap();
        assert_eq!(
            preview.frame.as_ref().unwrap().get_pixel(1, 1).0,
            [0, 0, 0, 255]
        );
        assert!(preview.compose(&mut frame[..8]).is_err());
    }

    #[test]
    fn fractional_preview_scaling_masks_outward_and_rejects_stale_or_invalid_edits() {
        let mut preview = Preview::new(1920, 1080);
        let mapped = preview.map_marks(&[mark(MarkKind::Mask)]).unwrap();
        assert_eq!((mapped[0].rect.x, mapped[0].rect.width), (2, 6));
        preview.append(mapped);
        assert!(preview.check_session("old").is_err());
        let mut invalid = mark(MarkKind::Mask);
        invalid.rect.x = u32::MAX;
        assert!(preview.map_marks(&[invalid]).is_err());
        assert!(preview.map_marks(&[mark(MarkKind::Mask); 32]).is_err());
        assert_eq!(preview.marks.len(), 1);
        let full = Mark {
            kind: MarkKind::Mask,
            rect: PixelRect {
                x: 0,
                y: 0,
                width: 960,
                height: 540,
            },
        };
        assert!(preview.map_marks(&[full, full]).is_err());
        let odd = Preview::new(1918, 1078);
        assert_eq!(odd.small, (959, 539));
    }
}

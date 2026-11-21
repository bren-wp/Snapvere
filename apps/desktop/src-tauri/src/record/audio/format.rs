// Snapvere by Brendigo
//! Validated WASAPI mix formats, independent of device initialization.
//! Unknown formats must never be decoded as silence or reach the resampler
//! with a zero rate. All memory returned by GetMixFormat belongs to the caller.

use std::mem::size_of;

use windows::Win32::Media::Audio::{WAVEFORMATEX, WAVEFORMATEXTENSIBLE, WAVE_FORMAT_PCM};
use windows::Win32::Media::KernelStreaming::{KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE};
use windows::Win32::Media::Multimedia::{KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT};

pub(super) struct SourceFormat {
    pub(super) rate: u32,
    pub(super) channels: usize,
    pub(super) float: bool,
    pub(super) bits: u16,
    /// WAVEFORMATEXTENSIBLE speaker mask (zero for legacy or unspecified layouts).
    pub(super) channel_mask: u32,
}

fn validate_layout(fmt: &SourceFormat, valid_bits: u16, block_align: u16) -> Result<(), String> {
    if !(8_000..=384_000).contains(&fmt.rate) {
        return Err(format!("Unsupported WASAPI sample rate: {} Hz", fmt.rate));
    }
    if !(1..=32).contains(&fmt.channels) {
        return Err(format!(
            "Unsupported WASAPI channel count: {}",
            fmt.channels
        ));
    }
    let supported = matches!(
        (fmt.float, fmt.bits),
        (true, 32) | (false, 8 | 16 | 24 | 32)
    );
    if !supported {
        return Err(format!(
            "Unsupported WASAPI sample encoding: float={}, container={} bits",
            fmt.float, fmt.bits
        ));
    }
    if valid_bits == 0 || valid_bits > fmt.bits || (fmt.float && valid_bits != 32) {
        return Err(format!(
            "Unsupported WASAPI precision: {valid_bits} valid bits in {}-bit container",
            fmt.bits
        ));
    }
    let expected_align = fmt.channels * usize::from(fmt.bits / 8);
    if usize::from(block_align) != expected_align {
        return Err(format!(
            "Invalid WASAPI block alignment: {block_align}, expected {expected_align}"
        ));
    }
    Ok(())
}

/// # Safety
/// The pointer must refer to an allocated WAVEFORMATEX supplied by Windows.
/// The caller is responsible for releasing it via CoTaskMemFree.
pub(super) unsafe fn read_format(ptr: *const WAVEFORMATEX) -> Result<SourceFormat, String> {
    if ptr.is_null() {
        return Err("WASAPI returned a null mix-format pointer".into());
    }
    let base = &*ptr;
    let tag = u32::from(base.wFormatTag);
    let (float, valid_bits, channel_mask) = if tag == WAVE_FORMAT_EXTENSIBLE {
        let required = size_of::<WAVEFORMATEXTENSIBLE>() - size_of::<WAVEFORMATEX>();
        if usize::from(base.cbSize) < required {
            return Err("Truncated WASAPI extensible format".into());
        }
        // WAVEFORMATEXTENSIBLE is packed(1); copy instead of borrowing fields.
        let ext = std::ptr::read_unaligned(ptr.cast::<WAVEFORMATEXTENSIBLE>());
        let subtype = ext.SubFormat;
        let float = if subtype == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT {
            true
        } else if subtype == KSDATAFORMAT_SUBTYPE_PCM {
            false
        } else {
            return Err("Unsupported WASAPI subtype (expected PCM or IEEE float)".into());
        };
        (float, ext.Samples.wValidBitsPerSample, ext.dwChannelMask)
    } else if tag == WAVE_FORMAT_IEEE_FLOAT {
        (true, base.wBitsPerSample, 0)
    } else if tag == WAVE_FORMAT_PCM {
        (false, base.wBitsPerSample, 0)
    } else {
        return Err(format!("Unsupported WASAPI format tag: {tag}"));
    };
    let fmt = SourceFormat {
        rate: base.nSamplesPerSec,
        channels: usize::from(base.nChannels),
        float,
        bits: base.wBitsPerSample,
        channel_mask,
    };
    validate_layout(&fmt, valid_bits, base.nBlockAlign)?;
    if channel_mask != 0 && channel_mask.count_ones() as usize != fmt.channels {
        return Err(format!(
            "WASAPI speaker mask declares {} channels but source has {}",
            channel_mask.count_ones(),
            fmt.channels
        ));
    }
    Ok(fmt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE_0;

    fn pcm16() -> WAVEFORMATEX {
        WAVEFORMATEX {
            wFormatTag: WAVE_FORMAT_PCM as u16,
            nChannels: 2,
            nSamplesPerSec: 48_000,
            nAvgBytesPerSec: 192_000,
            nBlockAlign: 4,
            wBitsPerSample: 16,
            cbSize: 0,
        }
    }

    #[test]
    fn accepts_pcm16_and_extensible_float32() {
        let pcm = pcm16();
        let fmt = unsafe { read_format(&pcm) }.expect("valid PCM16");
        assert_eq!((fmt.rate, fmt.channels, fmt.bits), (48_000, 2, 16));
        assert!(!fmt.float);

        let ext = WAVEFORMATEXTENSIBLE {
            Format: WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_EXTENSIBLE as u16,
                nChannels: 2,
                nSamplesPerSec: 48_000,
                nAvgBytesPerSec: 384_000,
                nBlockAlign: 8,
                wBitsPerSample: 32,
                cbSize: 22,
            },
            Samples: WAVEFORMATEXTENSIBLE_0 {
                wValidBitsPerSample: 32,
            },
            dwChannelMask: 3,
            SubFormat: KSDATAFORMAT_SUBTYPE_IEEE_FLOAT,
        };
        let p = (&ext as *const WAVEFORMATEXTENSIBLE).cast::<WAVEFORMATEX>();
        let fmt = unsafe { read_format(p) }.expect("valid float32");
        assert_eq!(fmt.bits, 32);
        assert!(fmt.float);
        assert_eq!(fmt.channel_mask, 3);
    }

    #[test]
    fn rejects_mismatched_speaker_masks() {
        let ext = WAVEFORMATEXTENSIBLE {
            Format: WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_EXTENSIBLE as u16,
                nChannels: 6,
                nSamplesPerSec: 48_000,
                nAvgBytesPerSec: 576_000,
                nBlockAlign: 12,
                wBitsPerSample: 16,
                cbSize: 22,
            },
            Samples: WAVEFORMATEXTENSIBLE_0 {
                wValidBitsPerSample: 16,
            },
            dwChannelMask: 3,
            SubFormat: KSDATAFORMAT_SUBTYPE_PCM,
        };
        let p = (&ext as *const WAVEFORMATEXTENSIBLE).cast::<WAVEFORMATEX>();
        assert!(unsafe { read_format(p) }.is_err());
    }

    #[test]
    fn rejects_malformed_rate_channels_alignment_and_encodings() {
        let mut w = pcm16();
        w.nSamplesPerSec = 0;
        assert!(unsafe { read_format(&w) }.is_err());
        w = pcm16();
        w.nChannels = 0;
        assert!(unsafe { read_format(&w) }.is_err());
        w = pcm16();
        w.nBlockAlign = 2;
        assert!(unsafe { read_format(&w) }.is_err());
        w = pcm16();
        w.wBitsPerSample = 12;
        assert!(unsafe { read_format(&w) }.is_err());
        w = pcm16();
        w.wFormatTag = 0x55;
        assert!(unsafe { read_format(&w) }.is_err());
    }

    #[test]
    fn rejects_null_and_truncated_extensible_formats() {
        assert!(unsafe { read_format(std::ptr::null()) }.is_err());
        let mut w = pcm16();
        w.wFormatTag = WAVE_FORMAT_EXTENSIBLE as u16;
        w.cbSize = 0;
        assert!(unsafe { read_format(&w) }.is_err());
    }
}

// Snapvere by Brendigo
//! Windows DXGI Desktop Duplication — brzo hvatanje frameova za snimanje.
//!
//! Zašto ne xcap u petlji: `Monitor::capture_image()` radi puni GDI BitBlt cijelog
//! ekrana po pozivu (~30-60 ms na 1080p) i alocira novi buffer svaki put. Desktop
//! Duplication isporuči frame tek kad se ekran promijeni, kopira ga na GPU-u i mapira
//! jednom — realno drži 30 fps na 1080p uz nekoliko posto CPU-a.
//!
//! `xcap::VideoRecorder` autor je označio kao WIP i ima dvije mane koje ovdje ne
//! smijemo naslijediti: ignorira `RowPitch` (frame se iskosi kad stride != width*4)
//! i duplicira SVAKI output prije provjere poklapa li se monitor.

#![cfg(windows)]

use windows::core::Interface;
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIAdapter1, IDXGIDevice, IDXGIFactory1, IDXGIOutput1,
    IDXGIOutputDuplication, IDXGIResource, DXGI_ERROR_ACCESS_LOST, DXGI_ERROR_NOT_FOUND,
    DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO,
};

use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM;

use crate::logging::log;

/// Pair each successful acquisition with one release, including early exits.
struct AcquiredFrame {
    duplication: IDXGIOutputDuplication,
    active: bool,
}

impl AcquiredFrame {
    fn release(mut self) -> Result<(), String> {
        self.active = false;
        // SAFETY: this guard owns the acquisition on the recorder thread.
        unsafe { self.duplication.ReleaseFrame() }.map_err(|e| format!("ReleaseFrame: {e}"))
    }
}

impl Drop for AcquiredFrame {
    fn drop(&mut self) {
        if self.active {
            // SAFETY: release the acquired frame during unwinding.
            let _ = unsafe { self.duplication.ReleaseFrame() };
        }
    }
}

struct MappedFrame<'a> {
    context: &'a ID3D11DeviceContext,
    resource: &'a ID3D11Resource,
}

impl Drop for MappedFrame<'_> {
    fn drop(&mut self) {
        // SAFETY: the guard owns a successful Map of subresource zero.
        unsafe { self.context.Unmap(Some(self.resource), 0) };
    }
}

/// Duplikacija jednog monitora. Sve metode se MORAJU zvati s iste dretve —
/// D3D uređaj je vezan uz dretvu koja ga je stvorila.
pub struct DxgiGrabber {
    device: ID3D11Device,
    ctx: ID3D11DeviceContext,
    dupl: IDXGIOutputDuplication,
    staging: Option<(ID3D11Texture2D, u32, u32)>,
    /// Zadnji uspješno pročitan frame (BGRA, gusto pakiran width*height*4).
    /// Kad se ekran ne mijenja DXGI ne isporuči novi frame — vraćamo ovaj.
    buf: Vec<u8>,
    have_frame: bool,
    pub width: u32,
    pub height: u32,
}

impl DxgiGrabber {
    /// Otvori duplikaciju za monitor čiji desktop pravokutnik počinje u (x, y).
    ///
    /// Prolazi kroz SVE adaptere: na hibridnim laptopima (iGPU + dGPU) output je vezan
    /// uz jedan adapter, a duplikacija s krivog vraća `DXGI_ERROR_UNSUPPORTED`.
    pub fn new(x: i32, y: i32) -> Result<Self, String> {
        unsafe {
            let factory: IDXGIFactory1 =
                CreateDXGIFactory1().map_err(|e| format!("CreateDXGIFactory1: {e}"))?;

            let mut ai = 0u32;
            loop {
                let adapter: IDXGIAdapter1 = match factory.EnumAdapters1(ai) {
                    Ok(a) => a,
                    Err(e) if e.code() == DXGI_ERROR_NOT_FOUND => break,
                    Err(e) => return Err(format!("EnumAdapters1: {e}")),
                };
                ai += 1;

                let mut oi = 0u32;
                loop {
                    let Ok(output) = adapter.EnumOutputs(oi) else {
                        break; // nema vise outputa na ovom adapteru
                    };
                    oi += 1;

                    let Ok(desc) = output.GetDesc() else { continue };
                    let r = desc.DesktopCoordinates;
                    if r.left != x || r.top != y {
                        continue;
                    }

                    // Uređaj MORA biti na adapteru koji posjeduje output.
                    let base: IDXGIAdapter = adapter.cast().map_err(|e| e.to_string())?;
                    let mut device: Option<ID3D11Device> = None;
                    let mut ctx: Option<ID3D11DeviceContext> = None;
                    D3D11CreateDevice(
                        &base,
                        D3D_DRIVER_TYPE_UNKNOWN, // obavezno UNKNOWN kad se predaje adapter
                        HMODULE::default(),
                        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                        None::<&[D3D_FEATURE_LEVEL]>,
                        D3D11_SDK_VERSION,
                        Some(&mut device),
                        None,
                        Some(&mut ctx),
                    )
                    .map_err(|e| format!("D3D11CreateDevice: {e}"))?;

                    let device = device.ok_or("D3D11CreateDevice nije vratio uređaj")?;
                    let ctx = ctx.ok_or("D3D11CreateDevice nije vratio kontekst")?;
                    let dxgi_device: IDXGIDevice = device.cast().map_err(|e| e.to_string())?;
                    let output1: IDXGIOutput1 = output.cast().map_err(|e| e.to_string())?;
                    let dupl = output1
                        .DuplicateOutput(&dxgi_device)
                        .map_err(|e| format!("DuplicateOutput: {e}"))?;

                    let width = (r.right - r.left).max(0) as u32;
                    let height = (r.bottom - r.top).max(0) as u32;

                    let grabber = Self {
                        device,
                        ctx,
                        dupl,
                        staging: None,
                        buf: super::pixels::allocate_bgra(width, height)?,
                        have_frame: false,
                        width,
                        height,
                    };

                    log(&format!("DXGI duplikacija: {width}x{height} @ ({x},{y})"));

                    return Ok(grabber);
                }
            }
            Err(format!("nema DXGI outputa na poziciji ({x},{y})"))
        }
    }

    /// Je li stigao barem jedan pravi frame (do tada je buffer crn).
    pub fn has_frame(&self) -> bool {
        self.have_frame
    }

    /// Sljedeći frame kao BGRA (gusto pakiran). Kad se ekran nije promijenio unutar
    /// `timeout_ms`, vraća zadnji poznati frame — snimka time ostaje kontinuirana.
    pub fn grab(&mut self, timeout_ms: u32) -> Result<&[u8], String> {
        unsafe {
            let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut resource: Option<IDXGIResource> = None;

            match self
                .dupl
                .AcquireNextFrame(timeout_ms, &mut info, &mut resource)
            {
                Ok(()) => {
                    let acquired = AcquiredFrame {
                        duplication: self.dupl.clone(),
                        active: true,
                    };
                    // LastPresentTime == 0 obično znači "pomaknuo se samo kursor", ALI prvi
                    // frame nakon DuplicateOutput nosi cijeli desktop i često ima 0 —
                    // bez ovog `|| !have_frame` snimka bi počela crnim kadrovima.
                    let has_pixels = info.LastPresentTime != 0 || !self.have_frame;
                    let copied = if has_pixels {
                        match resource
                            .as_ref()
                            .and_then(|r| r.cast::<ID3D11Texture2D>().ok())
                        {
                            Some(tex) => self.copy_texture(&tex),
                            None => Err("DXGI frame has no readable texture".into()),
                        }
                    } else {
                        Ok(())
                    };

                    let released = acquired.release();
                    if let Err(error) = copied.and(released) {
                        self.have_frame = false;
                        self.buf.fill(0);
                        return Err(error);
                    }
                    if has_pixels {
                        self.have_frame = true;
                    }
                }
                Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => {
                    // Statična slika — nije greška.
                }
                Err(e) if e.code() == DXGI_ERROR_ACCESS_LOST => {
                    // The old output identity is no longer valid. Do not reconnect by
                    // screen coordinates alone or reuse pixels from a revoked duplication.
                    self.have_frame = false;
                    self.buf.fill(0);
                    return Err("DXGI access lost; restart capture with a new selection".into());
                }
                Err(e) => {
                    self.have_frame = false;
                    self.buf.fill(0);
                    return Err(format!("AcquireNextFrame: {e}"));
                }
            }

            // I prije prvog framea vraćamo buffer (crn) — bolje nego prekinuti snimanje.
            Ok(&self.buf)
        }
    }

    /// Kopiraj GPU teksturu u `self.buf`, poštujući `RowPitch`.
    unsafe fn copy_texture(&mut self, src: &ID3D11Texture2D) -> Result<(), String> {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        src.GetDesc(&mut desc);
        if desc.Width != self.width
            || desc.Height != self.height
            || desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM
            || desc.SampleDesc.Count != 1
        {
            return Err("DXGI frame geometry or pixel format changed".into());
        }

        let stale =
            !matches!(&self.staging, Some((_, w, h)) if *w == desc.Width && *h == desc.Height);
        if stale {
            let mut sdesc = desc;
            sdesc.BindFlags = 0;
            sdesc.MiscFlags = 0;
            sdesc.Usage = D3D11_USAGE_STAGING;
            sdesc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
            let mut tex: Option<ID3D11Texture2D> = None;
            self.device
                .CreateTexture2D(&sdesc, None, Some(&mut tex))
                .map_err(|e| format!("CreateTexture2D(staging): {e}"))?;
            self.staging = Some((
                tex.ok_or("CreateTexture2D nije vratio teksturu")?,
                desc.Width,
                desc.Height,
            ));
        }
        let Some((staging, _, _)) = self.staging.as_ref() else {
            return Err("staging tekstura nedostupna".into());
        };

        let dst: ID3D11Resource = staging.cast().map_err(|e| e.to_string())?;
        let src_res: ID3D11Resource = src.cast().map_err(|e| e.to_string())?;
        self.ctx.CopyResource(Some(&dst), Some(&src_res));

        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        self.ctx
            .Map(Some(&dst), 0, D3D11_MAP_READ, 0, Some(&mut mapped))
            .map_err(|e| format!("Map(staging): {e}"))?;
        let _mapped = MappedFrame {
            context: &self.ctx,
            resource: &dst,
        };

        let h = self.height as usize;
        let row_bytes = self.width as usize * 4;
        let pitch = mapped.RowPitch as usize;
        let dst_pitch = row_bytes;
        let base = mapped.pData as *const u8;
        if base.is_null()
            || pitch < row_bytes
            || pitch
                .checked_mul(h)
                .is_none_or(|bytes| bytes > isize::MAX as usize)
        {
            return Err("Invalid DXGI mapped frame layout".into());
        }

        for y in 0..h {
            let src_row = std::slice::from_raw_parts(base.add(y * pitch), row_bytes);
            self.buf[y * dst_pitch..y * dst_pitch + row_bytes].copy_from_slice(src_row);
        }

        Ok(())
    }
}

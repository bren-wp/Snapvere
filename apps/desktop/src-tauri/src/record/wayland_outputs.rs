// Snapvere by Brendigo
//! Per-output compositor geometry, independent of Xwayland's common DPI.
use std::collections::BTreeMap;
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use wayland_client::protocol::{wl_callback, wl_output, wl_registry};
use wayland_client::{Connection, Dispatch, EventQueue, QueueHandle, WEnum};
use wayland_protocols::xdg::xdg_output::zv1::client::{zxdg_output_manager_v1, zxdg_output_v1};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct OutputGeometry {
    pub name: String,
    pub origin: (i32, i32),
    pub logical: (u32, u32),
    pub physical: (u32, u32),
    pub transform: u32,
}

impl OutputGeometry {
    /// Output-local logical rectangle to physical pixels. Round inward so
    /// fractional edges never record pixels outside the requested selection.
    pub(super) fn inward_crop(
        &self,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
    ) -> Result<(u32, u32, u32, u32), String> {
        // Rotation/mirroring needs separate compositor frame orientation QA.
        if self.transform != 0 {
            return Err("Transformed Wayland capture requires orientation verification".into());
        }
        let axis = |start: i32, len: u32, logical: u32, physical: u32| {
            if start < 0 || len == 0 || logical == 0 || physical == 0 {
                return None;
            }
            let start = u64::try_from(start).ok()?;
            let end = start.checked_add(u64::from(len))?;
            let logical = u64::from(logical);
            let physical = u64::from(physical);
            if end > logical {
                return None;
            }
            let first = start.checked_mul(physical)?.div_ceil(logical);
            let last = end.checked_mul(physical)? / logical;
            if last <= first {
                return None;
            }
            Some((
                u32::try_from(first).ok()?,
                u32::try_from(last - first).ok()?,
            ))
        };
        let (x, w) =
            axis(x, w, self.logical.0, self.physical.0).ok_or("Invalid Wayland horizontal region")?;
        let (y, h) =
            axis(y, h, self.logical.1, self.physical.1).ok_or("Invalid Wayland vertical region")?;
        Ok((x, y, w, h))
    }
}

pub(super) fn select(
    outputs: &[OutputGeometry],
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<&OutputGeometry, String> {
    let mut matches = outputs
        .iter()
        .filter(|output| output.origin == (x, y) && output.logical == (w, h));
    let selected = matches.next().ok_or("No matching native Wayland output")?;
    if matches.next().is_some() || selected.transform != 0 {
        return Err("Ambiguous or transformed native Wayland output".into());
    }
    Ok(selected)
}

#[derive(Default)]
struct RawOutput {
    name: Option<String>,
    origin: Option<(i32, i32)>,
    logical: Option<(i32, i32)>,
    mode: Option<(i32, i32)>,
    transform: Option<u32>,
    output_done: bool,
    logical_done: bool,
}

#[derive(Default)]
struct Inventory {
    globals: BTreeMap<u32, u32>,
    manager: Option<(u32, u32)>,
    outputs: BTreeMap<u32, RawOutput>,
    done: u8,
    changed: bool,
    bound: bool,
}

impl Dispatch<wl_registry::WlRegistry, ()> for Inventory {
    fn event(
        state: &mut Self,
        _: &wl_registry::WlRegistry,
        event: wl_registry::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        match event {
            wl_registry::Event::Global {
                name,
                interface,
                version,
            } => {
                if interface == "wl_output" {
                    if state.bound || state.globals.len() >= 64 || version < 2 {
                        state.changed = true;
                    } else {
                        state.globals.insert(name, version);
                    }
                } else if interface == "zxdg_output_manager_v1" {
                    if state.manager.is_some() || version < 2 {
                        state.changed = true;
                    } else {
                        state.manager = Some((name, version));
                    }
                }
            }
            wl_registry::Event::GlobalRemove { name } => {
                if state.globals.contains_key(&name)
                    || state.manager.is_some_and(|(id, _)| id == name)
                {
                    state.changed = true;
                }
            }
            _ => {}
        }
    }
}

impl Dispatch<wl_callback::WlCallback, u8> for Inventory {
    fn event(
        state: &mut Self,
        _: &wl_callback::WlCallback,
        _: wl_callback::Event,
        stage: &u8,
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        state.done = *stage;
    }
}

impl Dispatch<wl_output::WlOutput, u32> for Inventory {
    fn event(
        state: &mut Self,
        _: &wl_output::WlOutput,
        event: wl_output::Event,
        id: &u32,
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        let Some(output) = state.outputs.get_mut(id) else {
            state.changed = true;
            return;
        };
        match event {
            wl_output::Event::Geometry { transform, .. } => {
                output.transform = match transform {
                    WEnum::Value(value) => Some(value as u32),
                    WEnum::Unknown(_) => None,
                };
            }
            wl_output::Event::Mode {
                flags,
                width,
                height,
                ..
            } => {
                if matches!(flags, WEnum::Value(value) if value.contains(wl_output::Mode::Current))
                {
                    output.mode = Some((width, height));
                }
            }
            wl_output::Event::Done => output.output_done = true,
            _ => {}
        }
    }
}

impl Dispatch<zxdg_output_manager_v1::ZxdgOutputManagerV1, ()> for Inventory {
    fn event(
        _: &mut Self,
        _: &zxdg_output_manager_v1::ZxdgOutputManagerV1,
        _: zxdg_output_manager_v1::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
    }
}

impl Dispatch<zxdg_output_v1::ZxdgOutputV1, u32> for Inventory {
    fn event(
        state: &mut Self,
        _: &zxdg_output_v1::ZxdgOutputV1,
        event: zxdg_output_v1::Event,
        id: &u32,
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        let Some(output) = state.outputs.get_mut(id) else {
            state.changed = true;
            return;
        };
        match event {
            zxdg_output_v1::Event::LogicalPosition { x, y } => output.origin = Some((x, y)),
            zxdg_output_v1::Event::LogicalSize { width, height } => {
                output.logical = Some((width, height));
            }
            zxdg_output_v1::Event::Name { name } => output.name = Some(name),
            zxdg_output_v1::Event::Done => output.logical_done = true,
            _ => {}
        }
    }
}

fn wait(
    queue: &mut EventQueue<Inventory>,
    state: &mut Inventory,
    stage: u8,
    deadline: Instant,
) -> Result<(), String> {
    while state.done != stage {
        if Instant::now() >= deadline || state.changed {
            return Err("Wayland output inventory timed out or changed".into());
        }
        queue.dispatch_pending(state).map_err(|e| e.to_string())?;
        if state.done == stage {
            break;
        }
        queue.flush().map_err(|e| e.to_string())?;
        let Some(guard) = queue.prepare_read() else {
            continue;
        };
        let mut poll = libc::pollfd {
            fd: guard.connection_fd().as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        // SAFETY: one initialized pollfd, valid until poll returns.
        let ready = unsafe { libc::poll(&mut poll, 1, 50) };
        if ready < 0 {
            return Err("Wayland output polling failed".into());
        }
        if ready == 0 {
            continue;
        }
        if poll.revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL) != 0 {
            return Err("Wayland compositor disconnected".into());
        }
        guard.read().map_err(|e| e.to_string())?;
    }
    if state.changed {
        return Err("Wayland output topology changed during enumeration".into());
    }
    Ok(())
}

fn finish(raw: RawOutput) -> Result<OutputGeometry, String> {
    let dimensions = |size: (i32, i32)| -> Option<(u32, u32)> {
        let w = u32::try_from(size.0).ok()?;
        let h = u32::try_from(size.1).ok()?;
        (w > 0 && h > 0 && w <= 16384 && h <= 16384).then_some((w, h))
    };
    if !raw.output_done || !raw.logical_done {
        return Err("Incomplete Wayland output snapshot".into());
    }
    let name = raw
        .name
        .filter(|name| !name.is_empty() && name.len() <= 256 && !name.chars().any(char::is_control))
        .ok_or("Missing Wayland output name")?;
    let origin = raw.origin.ok_or("Missing Wayland logical origin")?;
    let logical = raw
        .logical
        .and_then(dimensions)
        .ok_or("Invalid Wayland logical size")?;
    let mut physical = raw
        .mode
        .and_then(dimensions)
        .ok_or("Invalid Wayland physical mode")?;
    let transform = raw
        .transform
        .filter(|value| *value <= 7)
        .ok_or("Invalid Wayland transform")?;
    if matches!(transform, 1 | 3 | 5 | 7) {
        physical = (physical.1, physical.0);
    }
    Ok(OutputGeometry {
        name,
        origin,
        logical,
        physical,
        transform,
    })
}

pub(super) fn snapshot() -> Result<Vec<OutputGeometry>, String> {
    // Never consume an inherited WAYLAND_SOCKET fd or mutate process env.
    // Open only the current local compositor's Unix socket.
    let display = std::env::var_os("WAYLAND_DISPLAY").ok_or("Wayland display is unavailable")?;
    let path = PathBuf::from(display);
    let path = if path.is_absolute() {
        path
    } else {
        let runtime = std::env::var_os("XDG_RUNTIME_DIR")
            .ok_or("Wayland runtime directory is unavailable")?;
        PathBuf::from(runtime).join(path)
    };
    let stream = UnixStream::connect(path).map_err(|e| e.to_string())?;
    let conn = Connection::from_socket(stream).map_err(|e| e.to_string())?;
    let mut queue = conn.new_event_queue();
    let qh = queue.handle();
    let display = conn.display();
    let registry = display.get_registry(&qh, ());
    let mut state = Inventory::default();
    let deadline = Instant::now() + Duration::from_secs(2);
    let _first = display.sync(&qh, 1_u8);
    wait(&mut queue, &mut state, 1, deadline)?;
    let (id, _) = state
        .manager
        .ok_or("Compositor has no xdg-output v2 support")?;
    if state.globals.is_empty() {
        return Err("Compositor has no active outputs".into());
    }
    let manager: zxdg_output_manager_v1::ZxdgOutputManagerV1 = registry.bind(id, 2, &qh, ());
    state.bound = true;
    let mut proxies = Vec::new();
    for &id in state.globals.keys() {
        state.outputs.insert(id, RawOutput::default());
        let output: wl_output::WlOutput = registry.bind(id, 2, &qh, id);
        let logical = manager.get_xdg_output(&output, &qh, id);
        proxies.push((output, logical));
    }
    let _second = display.sync(&qh, 2_u8);
    wait(&mut queue, &mut state, 2, deadline)?;
    let outputs: Vec<_> = state
        .outputs
        .into_values()
        .map(finish)
        .collect::<Result<_, _>>()?;
    // Connection and protocol objects live until the entire snapshot is complete.
    drop(proxies);
    for (index, output) in outputs.iter().enumerate() {
        if outputs[..index]
            .iter()
            .any(|other| other.name == output.name)
        {
            return Err("Duplicate Wayland output identities".into());
        }
    }
    Ok(outputs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn output(name: &str, origin: (i32, i32), physical: (u32, u32)) -> OutputGeometry {
        OutputGeometry {
            name: name.into(),
            origin,
            logical: (1920, 1080),
            physical,
            transform: 0,
        }
    }

    #[test]
    fn mixed_dpi_outputs_keep_independent_ratios_and_negative_origins() {
        let outputs = [
            output("DP-1", (-1920, 0), (2400, 1350)),
            output("DP-2", (0, 0), (2880, 1620)),
            output("HDMI-1", (1920, 0), (3840, 2160)),
        ];
        let left = select(&outputs, -1920, 0, 1920, 1080).unwrap();
        assert_eq!(left.inward_crop(1, 1, 101, 101).unwrap(), (2, 2, 125, 125));
        let center = select(&outputs, 0, 0, 1920, 1080).unwrap();
        assert_eq!(
            center.inward_crop(1, 1, 101, 101).unwrap(),
            (2, 2, 151, 151)
        );
        let right = select(&outputs, 1920, 0, 1920, 1080).unwrap();
        assert_eq!(right.inward_crop(1, 1, 101, 101).unwrap(), (2, 2, 202, 202));
    }

    #[test]
    fn rejects_ambiguous_outside_and_unverified_rotation() {
        let mut a = output("DP-1", (-1920, 0), (2400, 1350));
        let b = output("DP-2", (-1920, 0), (2880, 1620));
        assert!(select(&[a.clone(), b], -1920, 0, 1920, 1080).is_err());
        let mut replacement = a.clone();
        replacement.name = "DP-3".into();
        assert_ne!(a, replacement);
        assert!(a.inward_crop(-1, 0, 100, 100).is_err());
        assert!(a.inward_crop(1919, 0, 2, 100).is_err());
        assert!(a.inward_crop(1, 1, u32::MAX, 100).is_err());
        a.transform = 1;
        assert!(a.inward_crop(0, 0, 100, 100).is_err());
    }

    #[test]
    fn incomplete_inventory_is_rejected() {
        assert!(finish(RawOutput::default()).is_err());
        let raw = RawOutput {
            name: Some("DP-1".into()),
            origin: Some((-1920, 0)),
            logical: Some((1920, 1080)),
            mode: Some((2400, 1350)),
            transform: Some(0),
            output_done: true,
            logical_done: true,
        };
        let result = finish(raw).unwrap();
        assert_eq!(result.physical, (2400, 1350));
        assert_eq!(result.logical, (1920, 1080));
    }
}

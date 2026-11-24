// Snapvere by Brendigo
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
        && std::env::var_os("CARGO_FEATURE_LINUX_NATIVE_MEDIA").is_some()
    {
        println!("cargo:rerun-if-changed=native/linux_mp4.c");
        println!("cargo:rerun-if-changed=native/linux_audio.c");
        println!("cargo:rerun-if-changed=native/linux_audio_identity.c");
        println!("cargo:rerun-if-changed=native/linux_media.h");
        println!("cargo:rerun-if-changed=native/linux_wayland.c");
        let library = pkg_config::Config::new()
            .cargo_metadata(false)
            .atleast_version("1.20")
            .probe("gstreamer-app-1.0")
            .expect("GStreamer development libraries required for linux-native-media");
        let pipewire = pkg_config::Config::new()
            .cargo_metadata(false)
            .probe("libpipewire-0.3")
            .expect("PipeWire development libraries required for linux-native-media");
        let video = pkg_config::Config::new()
            .cargo_metadata(false)
            .probe("gstreamer-video-1.0")
            .expect("GStreamer video development libraries");
        let gio = pkg_config::Config::new()
            .cargo_metadata(false)
            .probe("gio-unix-2.0")
            .expect("GIO Unix development libraries");
        cc::Build::new()
            .file("native/linux_mp4.c")
            .file("native/linux_audio.c")
            .file("native/linux_audio_identity.c")
            .file("native/linux_wayland.c")
            .includes(&library.include_paths)
            .includes(&pipewire.include_paths)
            .includes(&video.include_paths)
            .includes(&gio.include_paths)
            .warnings_into_errors(true)
            .compile("snapvere_linux_mp4");
        pkg_config::Config::new()
            .probe("gstreamer-app-1.0")
            .expect("GStreamer link metadata");
        pkg_config::Config::new()
            .probe("libpipewire-0.3")
            .expect("PipeWire link metadata");
        pkg_config::Config::new()
            .probe("gstreamer-video-1.0")
            .expect("GStreamer video link metadata");
        pkg_config::Config::new()
            .probe("gio-unix-2.0")
            .expect("GIO Unix link metadata");
    }
    tauri_build::build();
}

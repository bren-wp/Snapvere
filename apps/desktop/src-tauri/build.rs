// Snapvere by Brendigo
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
        && std::env::var_os("CARGO_FEATURE_LINUX_NATIVE_MEDIA").is_some()
    {
        println!("cargo:rerun-if-changed=native/linux_mp4.c");
        let library = pkg_config::Config::new()
            .cargo_metadata(false)
            .atleast_version("1.20")
            .probe("gstreamer-app-1.0")
            .expect("GStreamer development libraries required for linux-native-media");
        cc::Build::new()
            .file("native/linux_mp4.c")
            .includes(&library.include_paths)
            .warnings_into_errors(true)
            .compile("snapvere_linux_mp4");
        pkg_config::Config::new()
            .probe("gstreamer-app-1.0")
            .expect("GStreamer link metadata");
    }
    tauri_build::build();
}

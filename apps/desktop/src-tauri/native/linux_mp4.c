// Snapvere by Brendigo
// Native GStreamer adapter. All buffers and objects have explicit ownership.
#include "linux_media.h"
#include <gst/app/gstappsrc.h>

typedef struct {
    GstElement *pipeline;
    GstAppSrc *source;
    GstAppSrc *audio;
    GstBus *bus;
    gsize frame_bytes;
    guint64 audio_frames;
    guint64 video_end;
    guint64 last_video_pts;
    gboolean failed;
} SnapvereMp4;

void snapvere_mp4_free(void *handle) {
    SnapvereMp4 *ctx = handle;
    if (!ctx) return;
    if (ctx->pipeline) gst_element_set_state(ctx->pipeline, GST_STATE_NULL);
    if (ctx->source) gst_object_unref(ctx->source);
    if (ctx->audio) gst_object_unref(ctx->audio);
    if (ctx->bus) gst_object_unref(ctx->bus);
    if (ctx->pipeline) gst_object_unref(ctx->pipeline);
    g_free(ctx);
}

static gboolean has_error(SnapvereMp4 *ctx) {
    GstMessage *message = gst_bus_pop_filtered(ctx->bus, GST_MESSAGE_ERROR);
    if (!message) return FALSE;
    gst_message_unref(message);
    return TRUE;
}

void *snapvere_mp4_open_av(int fd, guint w, guint h, guint fps, guint bitrate,
                            gboolean with_audio) {
    GError *error = NULL;
    if (!gst_init_check(NULL, NULL, &error)) {
        g_clear_error(&error);
        return NULL;
    }
    SnapvereMp4 *ctx = g_new0(SnapvereMp4, 1);
    ctx->frame_bytes = (gsize)w * h * 4;
    // No user strings, executable arguments or file paths enter the pipeline.
    const gchar *video_only =
        "appsrc name=frames is-live=true format=time block=false "
        "! videoconvert ! video/x-raw,format=I420 "
        "! openh264enc name=codec rate-control=bitrate enable-frame-skip=false "
        "! h264parse ! mp4mux fragment-duration=1000 streamable=true "
        "! fdsink name=output sync=false async=false";
    const gchar *audio_video =
        "mp4mux name=mux fragment-duration=1000 streamable=true "
        "! fdsink name=output sync=false async=false "
        "appsrc name=frames is-live=true format=time block=false "
        "! videoconvert ! video/x-raw,format=I420 "
        "! openh264enc name=codec rate-control=bitrate enable-frame-skip=false "
        "! h264parse ! queue max-size-buffers=120 max-size-bytes=16777216 "
        "max-size-time=2000000000 ! mux.video_0 "
        "appsrc name=audio is-live=true format=time block=false "
        "! audioconvert ! voaacenc bitrate=128000 ! aacparse "
        "! queue max-size-buffers=120 max-size-bytes=1048576 "
        "max-size-time=2000000000 ! mux.audio_0";
    ctx->pipeline = gst_parse_launch(with_audio ? audio_video : video_only, &error);
    if (error || !ctx->pipeline) {
        g_clear_error(&error);
        snapvere_mp4_free(ctx);
        return NULL;
    }
    ctx->source = GST_APP_SRC(gst_bin_get_by_name(GST_BIN(ctx->pipeline), "frames"));
    GstElement *codec = gst_bin_get_by_name(GST_BIN(ctx->pipeline), "codec");
    GstElement *output = gst_bin_get_by_name(GST_BIN(ctx->pipeline), "output");
    ctx->bus = gst_element_get_bus(ctx->pipeline);
    if (with_audio)
        ctx->audio = GST_APP_SRC(gst_bin_get_by_name(GST_BIN(ctx->pipeline), "audio"));
    if (!ctx->source || !codec || !output || !ctx->bus || (with_audio && !ctx->audio)) {
        if (codec) gst_object_unref(codec);
        if (output) gst_object_unref(output);
        snapvere_mp4_free(ctx);
        return NULL;
    }
    GstCaps *caps = gst_caps_new_simple(
        "video/x-raw", "format", G_TYPE_STRING, "BGRA",
        "width", G_TYPE_INT, (gint)w, "height", G_TYPE_INT, (gint)h,
        "framerate", GST_TYPE_FRACTION, (gint)fps, 1, NULL);
    gst_app_src_set_caps(ctx->source, caps);
    gst_caps_unref(caps);
    gst_app_src_set_max_bytes(ctx->source, (guint64)ctx->frame_bytes * 2);
    if (ctx->audio) {
        GstCaps *pcm = gst_caps_new_simple(
            "audio/x-raw", "format", G_TYPE_STRING, "S16LE",
            "rate", G_TYPE_INT, 48000, "channels", G_TYPE_INT, 2,
            "layout", G_TYPE_STRING, "interleaved", NULL);
        gst_app_src_set_caps(ctx->audio, pcm);
        gst_caps_unref(pcm);
        gst_app_src_set_max_bytes(ctx->audio, 48000 * 4);
    }
    g_object_set(codec, "bitrate", bitrate, "gop-size", fps, NULL);
    g_object_set(output, "fd", fd, NULL);
    gst_object_unref(codec);
    gst_object_unref(output);
    GstStateChangeReturn state = gst_element_set_state(ctx->pipeline, GST_STATE_PLAYING);
    if (state == GST_STATE_CHANGE_FAILURE ||
        gst_element_get_state(ctx->pipeline, NULL, NULL, 5 * GST_SECOND) == GST_STATE_CHANGE_FAILURE ||
        has_error(ctx)) {
        snapvere_mp4_free(ctx);
        return NULL;
    }
    return ctx;
}

static int push_bytes(SnapvereMp4 *ctx, GstAppSrc *source, const guint8 *data,
                      gsize len, guint64 pts_ns, guint64 duration_ns, guint64 limit) {
    if (!ctx || ctx->failed || !source || !data || !len || len > limit || !duration_ns)
        return 1;
    // Only one producer owns the encoder. Check prospective queue size before
    // enqueueing; never block indefinitely or silently discard captured data.
    gint64 deadline = g_get_monotonic_time() + 2 * G_USEC_PER_SEC;
    while (gst_app_src_get_current_level_bytes(source) > limit - len) {
        if (has_error(ctx) || g_get_monotonic_time() >= deadline) return 2;
        g_usleep(2000);
    }
    if (has_error(ctx)) return 3;
    GstBuffer *buffer = gst_buffer_new_allocate(NULL, len, NULL);
    if (!buffer) return 4;
    if (gst_buffer_fill(buffer, 0, data, len) != len) {
        gst_buffer_unref(buffer);
        return 5;
    }
    GST_BUFFER_PTS(buffer) = pts_ns;
    GST_BUFFER_DURATION(buffer) = duration_ns;
    if (gst_app_src_push_buffer(source, buffer) != GST_FLOW_OK) return 6;
    return 0;
}

int snapvere_mp4_push(void *handle, const guint8 *data, gsize len,
                      guint64 pts_ns, guint64 duration_ns) {
    SnapvereMp4 *ctx = handle;
    if (!ctx) return 1;
    if (len != ctx->frame_bytes || pts_ns > G_MAXUINT64 - duration_ns ||
        (ctx->video_end && pts_ns <= ctx->last_video_pts)) {
        ctx->failed = TRUE;
        return 1;
    }
    int status = push_bytes(ctx, ctx->source, data, len, pts_ns, duration_ns,
                            (guint64)ctx->frame_bytes * 2);
    if (status) ctx->failed = TRUE;
    else {
        ctx->last_video_pts = pts_ns;
        ctx->video_end = pts_ns + duration_ns;
    }
    return status;
}

// The PCM clock is derived from the exact number of accepted stereo samples.
// Paused audio is never submitted, so no wall-clock pause is added to the file.
int snapvere_mp4_push_pcm(void *handle, const guint8 *data, gsize len) {
    SnapvereMp4 *ctx = handle;
    if (!ctx) return 1;
    if (!ctx->audio || !len || len % 4 || len > 4800 * 4 ||
        ctx->audio_frames > 48000ULL * 24 * 3600 - len / 4) {
        ctx->failed = TRUE;
        return 1;
    }
    guint64 next = ctx->audio_frames + len / 4;
    guint64 pts = gst_util_uint64_scale(ctx->audio_frames, GST_SECOND, 48000);
    guint64 end = gst_util_uint64_scale(next, GST_SECOND, 48000);
    int status = push_bytes(ctx, ctx->audio, data, len, pts, end - pts, 48000 * 4);
    if (status) ctx->failed = TRUE;
    else ctx->audio_frames = next;
    return status;
}

int snapvere_mp4_finish(void *handle) {
    SnapvereMp4 *ctx = handle;
    if (!ctx || ctx->failed || has_error(ctx) || !ctx->video_end) return 1;
    if (ctx->audio) {
        guint64 audio_end = gst_util_uint64_scale(ctx->audio_frames, GST_SECOND, 48000);
        guint64 skew = audio_end > ctx->video_end
            ? audio_end - ctx->video_end : ctx->video_end - audio_end;
        if (!ctx->audio_frames || skew > 250 * GST_MSECOND) return 1;
        if (gst_app_src_end_of_stream(ctx->audio) != GST_FLOW_OK) return 2;
    }
    if (gst_app_src_end_of_stream(ctx->source) != GST_FLOW_OK) return 2;
    GstMessage *message = gst_bus_timed_pop_filtered(
        ctx->bus, 30 * GST_SECOND, GST_MESSAGE_ERROR | GST_MESSAGE_EOS);
    gboolean success = message && GST_MESSAGE_TYPE(message) == GST_MESSAGE_EOS;
    if (message) gst_message_unref(message);
    GstStateChangeReturn state = gst_element_set_state(ctx->pipeline, GST_STATE_NULL);
    return success && state != GST_STATE_CHANGE_FAILURE ? 0 : 3;
}

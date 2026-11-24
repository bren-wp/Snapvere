// Snapvere by Brendigo
// Native GStreamer adapter. All buffers and objects have explicit ownership.
#include <gst/gst.h>
#include <gst/app/gstappsrc.h>

typedef struct {
    GstElement *pipeline;
    GstAppSrc *source;
    GstBus *bus;
    gsize frame_bytes;
} SnapvereMp4;

void snapvere_mp4_free(void *handle) {
    SnapvereMp4 *ctx = handle;
    if (!ctx) return;
    if (ctx->pipeline) gst_element_set_state(ctx->pipeline, GST_STATE_NULL);
    if (ctx->source) gst_object_unref(ctx->source);
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

void *snapvere_mp4_open(int fd, guint w, guint h, guint fps, guint bitrate) {
    GError *error = NULL;
    if (!gst_init_check(NULL, NULL, &error)) {
        g_clear_error(&error);
        return NULL;
    }
    SnapvereMp4 *ctx = g_new0(SnapvereMp4, 1);
    ctx->frame_bytes = (gsize)w * h * 4;
    // No user strings, executable arguments or file paths enter the pipeline.
    ctx->pipeline = gst_parse_launch(
        "appsrc name=frames is-live=true format=time block=false "
        "! videoconvert ! video/x-raw,format=I420 "
        "! openh264enc name=codec rate-control=bitrate enable-frame-skip=false "
        "! h264parse ! mp4mux fragment-duration=1000 streamable=true "
        "! fdsink name=output sync=false async=false", &error);
    if (error || !ctx->pipeline) {
        g_clear_error(&error);
        snapvere_mp4_free(ctx);
        return NULL;
    }
    ctx->source = GST_APP_SRC(gst_bin_get_by_name(GST_BIN(ctx->pipeline), "frames"));
    GstElement *codec = gst_bin_get_by_name(GST_BIN(ctx->pipeline), "codec");
    GstElement *output = gst_bin_get_by_name(GST_BIN(ctx->pipeline), "output");
    ctx->bus = gst_element_get_bus(ctx->pipeline);
    if (!ctx->source || !codec || !output || !ctx->bus) {
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

int snapvere_mp4_push(void *handle, const guint8 *data, gsize len,
                       guint64 pts_ns, guint64 duration_ns) {
    SnapvereMp4 *ctx = handle;
    if (!ctx || !data || len != ctx->frame_bytes || !duration_ns) return 1;
    // Bound the queued raw frames and reject sustained stalls; no unbounded
    // memory growth, silent frame dropping or blocking appsrc push.
    gint64 deadline = g_get_monotonic_time() + 2 * G_USEC_PER_SEC;
    while (gst_app_src_get_current_level_bytes(ctx->source) >= ctx->frame_bytes * 2) {
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
    // push_buffer takes ownership regardless of the flow status.
    if (gst_app_src_push_buffer(ctx->source, buffer) != GST_FLOW_OK) return 6;
    return 0;
}

int snapvere_mp4_finish(void *handle) {
    SnapvereMp4 *ctx = handle;
    if (!ctx || has_error(ctx)) return 1;
    if (gst_app_src_end_of_stream(ctx->source) != GST_FLOW_OK) return 2;
    GstMessage *message = gst_bus_timed_pop_filtered(
        ctx->bus, 30 * GST_SECOND, GST_MESSAGE_ERROR | GST_MESSAGE_EOS);
    gboolean success = message && GST_MESSAGE_TYPE(message) == GST_MESSAGE_EOS;
    if (message) gst_message_unref(message);
    GstStateChangeReturn state = gst_element_set_state(ctx->pipeline, GST_STATE_NULL);
    return success && state != GST_STATE_CHANGE_FAILURE ? 0 : 3;
}

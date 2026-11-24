// Snapvere by Brendigo
// Private native PipeWire graph. The requested inputs share one mixer clock.
#include "linux_media.h"
#include <gst/app/gstappsink.h>
#include <string.h>

typedef struct {
    GMutex lock;
    gint64 seen;
    gboolean discontinuity;
} InputHealth;

typedef struct {
    GstElement *pipeline;
    GstAppSink *sink;
    GstBus *bus;
    InputHealth health[2];
    gboolean selected[2];
    GstClockTime last_end;
    gboolean terminal_error;
} SnapvereAudio;

static GstPadProbeReturn observe_input(GstPad *pad, GstPadProbeInfo *info, gpointer user) {
    (void)pad;
    InputHealth *health = user;
    GstBuffer *buffer = GST_PAD_PROBE_INFO_BUFFER(info);
    if (!buffer) return GST_PAD_PROBE_OK;
    g_mutex_lock(&health->lock);
    if (health->seen && GST_BUFFER_FLAG_IS_SET(buffer, GST_BUFFER_FLAG_DISCONT))
        health->discontinuity = TRUE;
    health->seen = g_get_monotonic_time();
    g_mutex_unlock(&health->lock);
    return GST_PAD_PROBE_OK;
}

static gboolean healthy(SnapvereAudio *ctx) {
    if (ctx->terminal_error) return FALSE;
    GstMessage *message = gst_bus_pop_filtered(ctx->bus, GST_MESSAGE_ERROR | GST_MESSAGE_EOS);
    if (message) {
        gst_message_unref(message);
        ctx->terminal_error = TRUE;
        return FALSE;
    }
    for (guint i = 0; i < 2; i++) {
        if (!ctx->selected[i]) continue;
        InputHealth *health = &ctx->health[i];
        g_mutex_lock(&health->lock);
        gboolean ok = health->seen && !health->discontinuity &&
            g_get_monotonic_time() - health->seen < 750 * G_TIME_SPAN_MILLISECOND;
        g_mutex_unlock(&health->lock);
        if (!ok) return FALSE;
    }
    return TRUE;
}

void snapvere_audio_free(void *handle) {
    SnapvereAudio *ctx = handle;
    if (!ctx) return;
    if (ctx->pipeline) gst_element_set_state(ctx->pipeline, GST_STATE_NULL);
    if (ctx->sink) gst_object_unref(ctx->sink);
    if (ctx->bus) gst_object_unref(ctx->bus);
    if (ctx->pipeline) gst_object_unref(ctx->pipeline);
    for (guint i = 0; i < 2; i++) g_mutex_clear(&ctx->health[i].lock);
    g_free(ctx);
}

static gboolean configure_input(SnapvereAudio *ctx, guint index, guint64 serial) {
    if (!serial) return TRUE;
    const gchar *name = index ? "monitor" : "mic";
    GstElement *source = gst_bin_get_by_name(GST_BIN(ctx->pipeline), name);
    if (!source) return FALSE;
    if (!g_object_class_find_property(G_OBJECT_GET_CLASS(source), "target-object")) {
        gst_object_unref(source);
        return FALSE;
    }
    gchar *target = g_strdup_printf("%" G_GUINT64_FORMAT, serial);
    GstStructure *props = gst_structure_new(
        "props", "media.type", G_TYPE_STRING, "Audio",
        "media.category", G_TYPE_STRING, "Capture",
        "node.dont-fallback", G_TYPE_STRING, "true",
        "node.dont-reconnect", G_TYPE_STRING, "true",
        "node.dont-move", G_TYPE_STRING, "true",
        "stream.capture.sink", G_TYPE_STRING, index ? "true" : "false", NULL);
    g_object_set(source, "target-object", target, "stream-properties", props, NULL);
    gst_structure_free(props);
    g_free(target);
    GstPad *pad = gst_element_get_static_pad(source, "src");
    gboolean ok = pad && gst_pad_add_probe(pad, GST_PAD_PROBE_TYPE_BUFFER,
                                         observe_input, &ctx->health[index], NULL);
    if (pad) gst_object_unref(pad);
    gst_object_unref(source);
    return ok;
}

void *snapvere_audio_open(guint64 mic, guint64 monitor, guint32 cookie) {
    if (!cookie || snapvere_audio_validate(mic, monitor, cookie, NULL) != 0)
        return NULL;
    GError *error = NULL;
    if (!gst_init_check(NULL, NULL, &error)) {
        g_clear_error(&error);
        return NULL;
    }
    SnapvereAudio *ctx = g_new0(SnapvereAudio, 1);
    for (guint i = 0; i < 2; i++) g_mutex_init(&ctx->health[i].lock);
    ctx->selected[0] = mic != 0;
    ctx->selected[1] = monitor != 0;
    ctx->last_end = GST_CLOCK_TIME_NONE;
    const gchar *base =
        "audiomixer name=mix ! audioconvert ! "
        "audio/x-raw,format=S16LE,rate=48000,channels=2,layout=interleaved "
        "! appsink name=pcm sync=false max-buffers=8 drop=false ";
    const gchar *mic_branch =
        "pipewiresrc name=mic ! audioconvert ! audioresample ! "
        "audio/x-raw,format=S16LE,rate=48000,channels=2,layout=interleaved "
        "! queue max-size-buffers=8 max-size-bytes=192000 max-size-time=200000000 ! mix. ";
    const gchar *monitor_branch =
        "pipewiresrc name=monitor ! audioconvert ! audioresample ! "
        "audio/x-raw,format=S16LE,rate=48000,channels=2,layout=interleaved "
        "! queue max-size-buffers=8 max-size-bytes=192000 max-size-time=200000000 ! mix. ";
    gchar *description = g_strconcat(base, mic ? mic_branch : "",
                                    monitor ? monitor_branch : "", NULL);
    ctx->pipeline = gst_parse_launch(description, &error);
    g_free(description);
    if (error || !ctx->pipeline) {
        g_clear_error(&error);
        goto fail;
    }
    ctx->sink = GST_APP_SINK(gst_bin_get_by_name(GST_BIN(ctx->pipeline), "pcm"));
    ctx->bus = gst_element_get_bus(ctx->pipeline);
    if (!ctx->sink || !ctx->bus ||
        !configure_input(ctx, 0, mic) || !configure_input(ctx, 1, monitor) ||
        gst_element_set_state(ctx->pipeline, GST_STATE_PLAYING) == GST_STATE_CHANGE_FAILURE)
        goto fail;
    // Wait only for actual buffers from every selected source, not an
    // audiomixer-generated silence buffer. Discard startup backlog.
    gint64 deadline = g_get_monotonic_time() + 2500 * G_TIME_SPAN_MILLISECOND;
    while (g_get_monotonic_time() < deadline) {
        GstSample *sample = gst_app_sink_try_pull_sample(ctx->sink, 20 * GST_MSECOND);
        if (sample) gst_sample_unref(sample);
        if (healthy(ctx)) {
            // Detect a server restart or device removal during graph startup.
            if (snapvere_audio_validate(mic, monitor, cookie, NULL) == 0)
                return ctx;
            break;
        }
        if (ctx->terminal_error) break;
    }
fail:
    snapvere_audio_free(ctx);
    return NULL;
}

int snapvere_audio_pull(void *handle, guint8 *data, gsize capacity) {
    SnapvereAudio *ctx = handle;
    if (!ctx || !data || !healthy(ctx)) return -1;
    GstSample *sample = gst_app_sink_try_pull_sample(ctx->sink, 0);
    if (!sample) return gst_app_sink_is_eos(ctx->sink) ? -1 : 0;
    GstBuffer *buffer = gst_sample_get_buffer(sample);
    GstCaps *caps = gst_sample_get_caps(sample);
    const GstStructure *format = caps ? gst_caps_get_structure(caps, 0) : NULL;
    gint rate = 0, channels = 0;
    GstMapInfo map;
    int result = -1;
    if (!buffer || !format ||
        g_strcmp0(gst_structure_get_string(format, "format"), "S16LE") ||
        !gst_structure_get_int(format, "rate", &rate) || rate != 48000 ||
        !gst_structure_get_int(format, "channels", &channels) || channels != 2 ||
        !GST_BUFFER_PTS_IS_VALID(buffer) || !gst_buffer_map(buffer, &map, GST_MAP_READ))
        goto done;
    GstClockTime pts = GST_BUFFER_PTS(buffer);
    if (map.size && map.size % 4 == 0 && map.size <= capacity &&
        map.size <= 19200 &&
        (!GST_CLOCK_TIME_IS_VALID(ctx->last_end) ||
         (pts >= ctx->last_end && pts - ctx->last_end <= 100 * GST_MSECOND))) {
        GstClockTime duration = gst_util_uint64_scale(map.size / 4, GST_SECOND, 48000);
        if (pts <= G_MAXUINT64 - duration) {
            ctx->last_end = pts + duration;
            memcpy(data, map.data, map.size);
            result = (int)map.size;
        }
    }
    gst_buffer_unmap(buffer, &map);
done:
    gst_sample_unref(sample);
    return result;
}

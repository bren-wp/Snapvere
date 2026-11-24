// Snapvere by Brendigo
// ScreenCast portal negotiation and continuous, restricted PipeWire video.
#include "linux_media.h"
#include <gst/app/gstappsink.h>
#include <gst/video/video.h>
#include <gio/gio.h>
#include <gio/gunixfdlist.h>
#include <unistd.h>
#include <string.h>

#define PORTAL "org.freedesktop.portal.Desktop"
#define ROOT "/org/freedesktop/portal/desktop"
#define SCREEN "org.freedesktop.portal.ScreenCast"
#define REQUEST "org.freedesktop.portal.Request"
#define SESSION "org.freedesktop.portal.Session"

typedef struct {
    GDBusConnection *bus;
    GMainContext *context;
    gchar *session;
    guint closed_subscription;
    gboolean closed;
    GstElement *pipeline;
    GstAppSink *sink;
    GstBus *video_bus;
    int fd;
    guint width, height;
    gint64 last_frame;
} PortalVideo;

typedef struct {
    GVariant *results;
    gboolean done;
} Response;

static gchar *token(void) {
    gchar *value = g_uuid_string_random();
    for (gchar *p = value; *p; p++) if (*p == '-') *p = '_';
    return value;
}

static gchar *handle_path(GDBusConnection *bus, const gchar *kind, const gchar *id) {
    const gchar *unique = g_dbus_connection_get_unique_name(bus);
    if (!unique || unique[0] != ':') return NULL;
    gchar *sender = g_strdup(unique + 1);
    for (gchar *p = sender; *p; p++) if (*p == '.') *p = '_';
    gchar *path = g_strdup_printf(ROOT "/%s/%s/%s", kind, sender, id);
    g_free(sender);
    return path;
}

static void close_handle(PortalVideo *ctx, const gchar *path, const gchar *iface) {
    if (!ctx->bus || !path) return;
    GVariant *reply = g_dbus_connection_call_sync(
        ctx->bus, PORTAL, path, iface, "Close", NULL, G_VARIANT_TYPE_UNIT,
        G_DBUS_CALL_FLAGS_NO_AUTO_START, 1000, NULL, NULL);
    if (reply) g_variant_unref(reply);
}

static void response_signal(GDBusConnection *bus, const gchar *sender,
                            const gchar *path, const gchar *iface, const gchar *signal,
                            GVariant *parameters, gpointer data) {
    (void)bus; (void)sender; (void)path; (void)iface; (void)signal;
    Response *response = data;
    if (response->done) return;
    response->done = TRUE;
    if (!g_variant_is_of_type(parameters, G_VARIANT_TYPE("(ua{sv})"))) return;
    guint status;
    GVariant *results;
    g_variant_get(parameters, "(u@a{sv})", &status, &results);
    if (status == 0) response->results = results;
    else g_variant_unref(results);
}

static void session_closed(GDBusConnection *bus, const gchar *sender,
                           const gchar *path, const gchar *iface, const gchar *signal,
                           GVariant *parameters, gpointer data) {
    (void)bus; (void)sender; (void)path; (void)iface; (void)signal; (void)parameters;
    ((PortalVideo *)data)->closed = TRUE;
}

// Subscribe before calling the method to avoid losing an immediate Response.
// All waits share one finite startup deadline; a timed-out request is closed.
static GVariant *request(PortalVideo *ctx, const gchar *method, const gchar *id,
                         GVariant *arguments, gint64 deadline) {
    gchar *expected = handle_path(ctx->bus, "request", id);
    if (!expected) {
        g_variant_unref(g_variant_ref_sink(arguments));
        return NULL;
    }
    Response response = {0};
    guint subscription = g_dbus_connection_signal_subscribe(
        ctx->bus, PORTAL, REQUEST, "Response", expected, NULL,
        G_DBUS_SIGNAL_FLAGS_NONE, response_signal, &response, NULL);
    GVariant *reply = g_dbus_connection_call_sync(
        ctx->bus, PORTAL, ROOT, SCREEN, method, arguments, G_VARIANT_TYPE("(o)"),
        G_DBUS_CALL_FLAGS_NONE, 3000, NULL, NULL);
    const gchar *returned = NULL;
    if (reply) g_variant_get(reply, "(&o)", &returned);
    if (returned && !strcmp(returned, expected)) {
        while (!response.done && !ctx->closed && g_get_monotonic_time() < deadline) {
            while (g_main_context_iteration(ctx->context, FALSE)) {}
            if (!response.done) g_usleep(10000);
        }
    }
    g_dbus_connection_signal_unsubscribe(ctx->bus, subscription);
    if (!response.done) close_handle(ctx, returned ? returned : expected, REQUEST);
    if (reply) g_variant_unref(reply);
    g_free(expected);
    return response.results;
}

static gboolean negotiate(PortalVideo *ctx, guint32 *node) {
    gint64 deadline = g_get_monotonic_time() + 75 * G_TIME_SPAN_SECOND;
    gchar *id = token();
    gchar *session_id = token();
    ctx->session = handle_path(ctx->bus, "session", session_id);
    GVariantBuilder options;
    g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&options, "{sv}", "handle_token", g_variant_new_string(id));
    g_variant_builder_add(&options, "{sv}", "session_handle_token", g_variant_new_string(session_id));
    GVariant *result = request(ctx, "CreateSession", id, g_variant_new("(a{sv})", &options), deadline);
    g_free(id);
    g_free(session_id);
    if (!result || !ctx->session) {
        if (result) g_variant_unref(result);
        return FALSE;
    }
    const gchar *session = NULL;
    gboolean matches = (g_variant_lookup(result, "session_handle", "&s", &session) ||
                        g_variant_lookup(result, "session_handle", "&o", &session)) &&
                       !strcmp(session, ctx->session);
    g_variant_unref(result);
    if (!matches) return FALSE;
    ctx->closed_subscription = g_dbus_connection_signal_subscribe(
        ctx->bus, PORTAL, SESSION, "Closed", ctx->session, NULL,
        G_DBUS_SIGNAL_FLAGS_NONE, session_closed, ctx, NULL);

    id = token();
    g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&options, "{sv}", "handle_token", g_variant_new_string(id));
    g_variant_builder_add(&options, "{sv}", "types", g_variant_new_uint32(1));
    g_variant_builder_add(&options, "{sv}", "multiple", g_variant_new_boolean(FALSE));
    g_variant_builder_add(&options, "{sv}", "cursor_mode", g_variant_new_uint32(1));
    g_variant_builder_add(&options, "{sv}", "persist_mode", g_variant_new_uint32(0));
    result = request(ctx, "SelectSources", id,
                     g_variant_new("(oa{sv})", ctx->session, &options), deadline);
    g_free(id);
    if (!result) return FALSE;
    g_variant_unref(result);

    id = token();
    g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&options, "{sv}", "handle_token", g_variant_new_string(id));
    result = request(ctx, "Start", id,
                     g_variant_new("(osa{sv})", ctx->session, "", &options), deadline);
    g_free(id);
    if (!result) return FALSE;
    GVariant *streams = g_variant_lookup_value(result, "streams", G_VARIANT_TYPE("a(ua{sv})"));
    gboolean valid = streams && g_variant_n_children(streams) == 1;
    if (valid) {
        GVariant *props = NULL;
        guint32 type = 1;
        g_variant_get_child(streams, 0, "(u@a{sv})", node, &props);
        (void)g_variant_lookup(props, "source_type", "u", &type);
        valid = *node != 0 && type == 1;
        g_variant_unref(props);
    }
    if (streams) g_variant_unref(streams);
    g_variant_unref(result);
    if (!valid || ctx->closed) return FALSE;

    GUnixFDList *fds = NULL;
    g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
    GVariant *reply = g_dbus_connection_call_with_unix_fd_list_sync(
        ctx->bus, PORTAL, ROOT, SCREEN, "OpenPipeWireRemote",
        g_variant_new("(oa{sv})", ctx->session, &options), G_VARIANT_TYPE("(h)"),
        G_DBUS_CALL_FLAGS_NONE, 3000, NULL, &fds, NULL, NULL);
    if (reply && fds) {
        gint index;
        g_variant_get(reply, "(h)", &index);
        if (index >= 0 && index < g_unix_fd_list_get_length(fds))
            ctx->fd = g_unix_fd_list_get(fds, index, NULL);
    }
    if (reply) g_variant_unref(reply);
    if (fds) g_object_unref(fds);
    return ctx->fd >= 0;
}

// Validate exact negotiated physical dimensions and per-row bounds before
// copying any pixels. No scaling, arbitrary crop or DMA buffer assumptions.
static gboolean copy_frame(GstSample *sample, guint w, guint h, guint8 *data, gsize capacity) {
    if (!sample || !data || !w || !h || w > 8192 || h > 8192 ||
        (guint64)w * h * 4 != capacity) return FALSE;
    GstCaps *caps = gst_sample_get_caps(sample);
    GstBuffer *buffer = gst_sample_get_buffer(sample);
    GstVideoInfo info;
    if (!caps || !buffer || !gst_video_info_from_caps(&info, caps) ||
        GST_VIDEO_INFO_FORMAT(&info) != GST_VIDEO_FORMAT_BGRA ||
        (guint)GST_VIDEO_INFO_WIDTH(&info) != w ||
        (guint)GST_VIDEO_INFO_HEIGHT(&info) != h) return FALSE;
    GstVideoMeta *meta = gst_buffer_get_video_meta(buffer);
    if (meta && (meta->format != GST_VIDEO_FORMAT_BGRA || meta->n_planes != 1 ||
                 meta->width != w || meta->height != h)) return FALSE;
    gint stride = meta ? meta->stride[0] : GST_VIDEO_INFO_PLANE_STRIDE(&info, 0);
    gsize offset = meta ? meta->offset[0] : GST_VIDEO_INFO_PLANE_OFFSET(&info, 0);
    gsize row = (gsize)w * 4;
    if (stride < 0 || (gsize)stride < row) return FALSE;
    GstMapInfo map;
    if (!gst_buffer_map(buffer, &map, GST_MAP_READ)) return FALSE;
    gboolean valid = offset <= map.size && row <= map.size - offset &&
        (gsize)(h - 1) <= (map.size - offset - row) / (gsize)stride;
    if (valid) {
        for (guint y = 0; y < h; y++) {
            memcpy(data + y * row, map.data + offset + (gsize)y * stride, row);
            for (guint x = 0; x < w; x++) data[y * row + x * 4 + 3] = 255;
        }
    }
    gst_buffer_unmap(buffer, &map);
    return valid;
}

void snapvere_wayland_free(void *handle) {
    PortalVideo *ctx = handle;
    if (!ctx) return;
    if (ctx->pipeline) gst_element_set_state(ctx->pipeline, GST_STATE_NULL);
    if (ctx->sink) gst_object_unref(ctx->sink);
    if (ctx->video_bus) gst_object_unref(ctx->video_bus);
    if (ctx->pipeline) gst_object_unref(ctx->pipeline);
    if (ctx->fd >= 0) close(ctx->fd);
    if (ctx->closed_subscription)
        g_dbus_connection_signal_unsubscribe(ctx->bus, ctx->closed_subscription);
    close_handle(ctx, ctx->session, SESSION);
    g_free(ctx->session);
    if (ctx->bus) g_object_unref(ctx->bus);
    if (ctx->context) g_main_context_unref(ctx->context);
    g_free(ctx);
}

void *snapvere_wayland_open(guint width, guint height) {
    if (!width || !height || width > 8192 || height > 8192 ||
        (guint64)width * height > 28000000) return NULL;
    if (!gst_init_check(NULL, NULL, NULL)) return NULL;
    PortalVideo *ctx = g_new0(PortalVideo, 1);
    ctx->fd = -1;
    ctx->width = width;
    ctx->height = height;
    ctx->context = g_main_context_new();
    g_main_context_push_thread_default(ctx->context);
    ctx->bus = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, NULL);
    guint32 node = 0;
    gboolean ok = ctx->bus && negotiate(ctx, &node);
    g_main_context_pop_thread_default(ctx->context);
    if (!ok) goto fail;
    GError *error = NULL;
    ctx->pipeline = gst_parse_launch(
        "pipewiresrc name=video ! videoconvert ! video/x-raw,format=BGRA "
        "! appsink name=frames sync=false max-buffers=2 drop=true", &error);
    if (error || !ctx->pipeline) {
        g_clear_error(&error);
        goto fail;
    }
    GstElement *input = gst_bin_get_by_name(GST_BIN(ctx->pipeline), "video");
    ctx->sink = GST_APP_SINK(gst_bin_get_by_name(GST_BIN(ctx->pipeline), "frames"));
    ctx->video_bus = gst_element_get_bus(ctx->pipeline);
    if (!input || !ctx->sink || !ctx->video_bus) {
        if (input) gst_object_unref(input);
        goto fail;
    }
    if (!g_object_class_find_property(G_OBJECT_GET_CLASS(input), "fd") ||
        !g_object_class_find_property(G_OBJECT_GET_CLASS(input), "path")) {
        gst_object_unref(input);
        goto fail;
    }
    gchar *path = g_strdup_printf("%u", node);
    GstStructure *props = gst_structure_new(
        "props", "media.type", G_TYPE_STRING, "Video",
        "media.category", G_TYPE_STRING, "Capture",
        "node.dont-fallback", G_TYPE_STRING, "true",
        "node.dont-reconnect", G_TYPE_STRING, "true",
        "node.dont-move", G_TYPE_STRING, "true", NULL);
    g_object_set(input, "fd", ctx->fd, "path", path, "stream-properties", props, NULL);
    gst_structure_free(props);
    g_free(path);
    gst_object_unref(input);
    if (gst_element_set_state(ctx->pipeline, GST_STATE_PLAYING) == GST_STATE_CHANGE_FAILURE)
        goto fail;
    ctx->last_frame = g_get_monotonic_time();
    return ctx;
fail:
    snapvere_wayland_free(ctx);
    return NULL;
}

int snapvere_wayland_pull(void *handle, guint8 *data, gsize capacity, guint timeout_ms) {
    PortalVideo *ctx = handle;
    if (!ctx) return -1;
    while (g_main_context_iteration(ctx->context, FALSE)) {}
    if (ctx->closed || g_dbus_connection_is_closed(ctx->bus)) return -1;
    GstMessage *message = gst_bus_pop_filtered(ctx->video_bus, GST_MESSAGE_ERROR | GST_MESSAGE_EOS);
    if (message) {
        gst_message_unref(message);
        return -1;
    }
    GstSample *sample = gst_app_sink_try_pull_sample(ctx->sink,
                            MIN(timeout_ms, 2000) * GST_MSECOND);
    if (!sample) {
        if (gst_app_sink_is_eos(ctx->sink) ||
            g_get_monotonic_time() - ctx->last_frame > 3 * G_TIME_SPAN_SECOND) return -1;
        return 0;
    }
    gboolean ok = copy_frame(sample, ctx->width, ctx->height, data, capacity);
    gst_sample_unref(sample);
    if (!ok) return -1;
    ctx->last_frame = g_get_monotonic_time();
    return 1;
}

// Native buffer regression; no fake portal or claim of compositor consent.
int snapvere_wayland_test_frame(void) {
    if (!gst_init_check(NULL, NULL, NULL)) return 1;
    GstCaps *caps = gst_caps_from_string("video/x-raw,format=BGRA,width=2,height=2");
    GstBuffer *buffer = gst_buffer_new_allocate(NULL, 24, NULL);
    if (!caps || !buffer) {
        if (caps) gst_caps_unref(caps);
        if (buffer) gst_buffer_unref(buffer);
        return 1;
    }
    guint8 bytes[24] = {1,2,3,0,4,5,6,0,99,99,99,99,7,8,9,0,10,11,12,0,99,99,99,99};
    gst_buffer_fill(buffer, 0, bytes, sizeof(bytes));
    gsize offsets[GST_VIDEO_MAX_PLANES] = {0};
    gint strides[GST_VIDEO_MAX_PLANES] = {12};
    gst_buffer_add_video_meta_full(buffer, GST_VIDEO_FRAME_FLAG_NONE,
        GST_VIDEO_FORMAT_BGRA, 2, 2, 1, offsets, strides);
    GstSample *sample = gst_sample_new(buffer, caps, NULL, NULL);
    guint8 output[16] = {0};
    const guint8 expected[16] = {1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255};
    gboolean valid = copy_frame(sample, 2, 2, output, sizeof(output)) &&
        !memcmp(output, expected, sizeof(output)) &&
        !copy_frame(sample, 2, 2, output, sizeof(output) - 1) &&
        !copy_frame(sample, 1, 4, output, sizeof(output));
    gst_sample_unref(sample);
    gst_buffer_unref(buffer);
    gst_caps_unref(caps);
    return valid ? 0 : 1;
}

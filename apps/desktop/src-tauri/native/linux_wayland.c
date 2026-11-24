// Snapvere by Brendigo
// ScreenCast portal negotiation and continuous, restricted PipeWire video.
#include "linux_media.h"
#include <gst/app/gstappsink.h>
#include <gst/video/video.h>
#include <gio/gio.h>
#include <gio/gunixfdlist.h>
#include <unistd.h>
#include <sys/stat.h>
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
    gchar *owner;
    guint closed_subscription;
    guint owner_subscription;
    gboolean closed;
    GstElement *pipeline;
    GstAppSink *sink;
    GstBus *video_bus;
    int fd;
    guint width, height;
    gint x, y;
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
    if (!ctx->bus || !ctx->owner || !path) return;
    GVariant *reply = g_dbus_connection_call_sync(
        ctx->bus, ctx->owner, path, iface, "Close", NULL, G_VARIANT_TYPE_UNIT,
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

static void owner_changed(GDBusConnection *bus, const gchar *sender,
                          const gchar *path, const gchar *iface, const gchar *signal,
                          GVariant *parameters, gpointer data) {
    (void)bus; (void)sender; (void)path; (void)iface; (void)signal;
    PortalVideo *ctx = data;
    if (!g_variant_is_of_type(parameters, G_VARIANT_TYPE("(sss)"))) {
        ctx->closed = TRUE;
        return;
    }
    const gchar *name, *previous, *next;
    g_variant_get(parameters, "(&s&s&s)", &name, &previous, &next);
    if (!strcmp(name, PORTAL) && !strcmp(previous, ctx->owner) &&
        strcmp(next, ctx->owner)) ctx->closed = TRUE;
}

static gchar *get_owner(GDBusConnection *bus) {
    GVariant *reply = g_dbus_connection_call_sync(
        bus, "org.freedesktop.DBus", "/org/freedesktop/DBus",
        "org.freedesktop.DBus", "GetNameOwner", g_variant_new("(s)", PORTAL),
        G_VARIANT_TYPE("(s)"), G_DBUS_CALL_FLAGS_NONE, 2000, NULL, NULL);
    if (!reply) return NULL;
    const gchar *name;
    g_variant_get(reply, "(&s)", &name);
    gchar *owner = g_dbus_is_unique_name(name) ? g_strdup(name) : NULL;
    g_variant_unref(reply);
    return owner;
}

// A dedicated connection owns only this recording's requests and sessions.
// Disconnecting therefore releases orphaned portal objects without touching
// other components' D-Bus subscriptions or connections.
static gboolean open_bus(PortalVideo *ctx) {
    gchar *address = g_dbus_address_get_for_bus_sync(G_BUS_TYPE_SESSION, NULL, NULL);
    if (!address) return FALSE;
    ctx->bus = g_dbus_connection_new_for_address_sync(
        address, G_DBUS_CONNECTION_FLAGS_AUTHENTICATION_CLIENT |
        G_DBUS_CONNECTION_FLAGS_MESSAGE_BUS_CONNECTION, NULL, NULL, NULL);
    g_free(address);
    if (!ctx->bus) return FALSE;
    g_dbus_connection_set_exit_on_close(ctx->bus, FALSE);
    ctx->owner = get_owner(ctx->bus);
    if (!ctx->owner) {
        GVariant *reply = g_dbus_connection_call_sync(
            ctx->bus, "org.freedesktop.DBus", "/org/freedesktop/DBus",
            "org.freedesktop.DBus", "StartServiceByName", g_variant_new("(su)", PORTAL, 0u),
            G_VARIANT_TYPE("(u)"), G_DBUS_CALL_FLAGS_NONE, 3000, NULL, NULL);
        if (reply) g_variant_unref(reply);
        ctx->owner = get_owner(ctx->bus);
    }
    if (!ctx->owner) return FALSE;
    ctx->owner_subscription = g_dbus_connection_signal_subscribe(
        ctx->bus, "org.freedesktop.DBus", "org.freedesktop.DBus", "NameOwnerChanged",
        "/org/freedesktop/DBus", PORTAL, G_DBUS_SIGNAL_FLAGS_NONE, owner_changed, ctx, NULL);
    gchar *confirmed = get_owner(ctx->bus);
    gboolean ok = confirmed && !strcmp(confirmed, ctx->owner);
    g_free(confirmed);
    return ok;
}

static gboolean session_alive(PortalVideo *ctx) {
    for (guint i = 0; i < 64; i++)
        if (!g_main_context_iteration(ctx->context, FALSE)) break;
    return !ctx->closed && !g_dbus_connection_is_closed(ctx->bus);
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
        ctx->bus, ctx->owner, REQUEST, "Response", expected, NULL,
        G_DBUS_SIGNAL_FLAGS_NONE, response_signal, &response, NULL);
    GVariant *reply = g_dbus_connection_call_sync(
        ctx->bus, ctx->owner, ROOT, SCREEN, method, arguments, G_VARIANT_TYPE("(o)"),
        G_DBUS_CALL_FLAGS_NO_AUTO_START, 3000, NULL, NULL);
    const gchar *returned = NULL;
    if (reply) g_variant_get(reply, "(&o)", &returned);
    if (returned && !strcmp(returned, expected)) {
        while (!response.done && g_get_monotonic_time() < deadline) {
            if (!session_alive(ctx)) break;
            if (!response.done) g_usleep(10000);
        }
    }
    g_dbus_connection_signal_unsubscribe(ctx->bus, subscription);
    // Never close an arbitrary object path returned by an unexpected reply.
    if (!response.done) close_handle(ctx, expected, REQUEST);
    if (!returned || strcmp(returned, expected) || !session_alive(ctx)) {
        if (response.results) g_variant_unref(response.results);
        response.results = NULL;
    }
    if (reply) g_variant_unref(reply);
    g_free(expected);
    return response.results;
}

static gboolean matches_geometry(GVariant *props, gint x, gint y, guint w, guint h) {
    gint px, py, pw, ph;
    return g_variant_lookup(props, "position", "(ii)", &px, &py) &&
        g_variant_lookup(props, "size", "(ii)", &pw, &ph) &&
        pw > 0 && ph > 0 && px == x && py == y &&
        (guint)pw == w && (guint)ph == h;
}

static gboolean parse_stream(GVariant *result, guint32 *node, guint64 *serial,
                             gint x, gint y, guint w, guint h) {
    *node = 0;
    *serial = 0;
    GVariant *streams = g_variant_lookup_value(result, "streams", G_VARIANT_TYPE("a(ua{sv})"));
    gboolean valid = streams && g_variant_n_children(streams) == 1;
    if (valid) {
        GVariant *props = NULL;
        g_variant_get_child(streams, 0, "(u@a{sv})", node, &props);
        GVariant *type = g_variant_lookup_value(props, "source_type", NULL);
        GVariant *identity = g_variant_lookup_value(props, "pipewire-serial", NULL);
        // Optional metadata is allowed on old portals; malformed or wrong
        // metadata must never be interpreted as consent for a monitor.
        valid = !type || (g_variant_is_of_type(type, G_VARIANT_TYPE_UINT32) &&
                          g_variant_get_uint32(type) == 1);
        if (identity) {
            if (!g_variant_is_of_type(identity, G_VARIANT_TYPE_UINT64)) valid = FALSE;
            else {
                *serial = g_variant_get_uint64(identity);
                if (!*serial) valid = FALSE;
            }
        }
        valid = valid && (*node != 0 || *serial != 0) &&
            matches_geometry(props, x, y, w, h);
        if (type) g_variant_unref(type);
        if (identity) g_variant_unref(identity);
        g_variant_unref(props);
    }
    if (streams) g_variant_unref(streams);
    return valid;
}

static gboolean negotiate(PortalVideo *ctx, guint32 *node, guint64 *serial) {
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
        ctx->bus, ctx->owner, SESSION, "Closed", ctx->session, NULL,
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
    // Portal positions and sizes are compositor-logical. This first safe
    // integration accepts only a separately verified unit-scale layout.
    gboolean valid = parse_stream(result, node, serial,
                                  ctx->x, ctx->y, ctx->width, ctx->height);
    g_variant_unref(result);
    if (!valid || !session_alive(ctx)) return FALSE;

    GUnixFDList *fds = NULL;
    g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
    GVariant *reply = g_dbus_connection_call_with_unix_fd_list_sync(
        ctx->bus, ctx->owner, ROOT, SCREEN, "OpenPipeWireRemote",
        g_variant_new("(oa{sv})", ctx->session, &options), G_VARIANT_TYPE("(h)"),
        G_DBUS_CALL_FLAGS_NO_AUTO_START, 3000, NULL, &fds, NULL, NULL);
    if (reply && fds) {
        gint index;
        g_variant_get(reply, "(h)", &index);
        if (index >= 0 && index < g_unix_fd_list_get_length(fds))
            ctx->fd = g_unix_fd_list_get(fds, index, NULL);
    }
    if (reply) g_variant_unref(reply);
    if (fds) g_object_unref(fds);
    struct stat info;
    return ctx->fd >= 0 && fstat(ctx->fd, &info) == 0 &&
        S_ISSOCK(info.st_mode) && session_alive(ctx);
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
    // The supported PipeWire GStreamer core duplicates the supplied fd
    // (F_DUPFD_CLOEXEC) before connecting; this descriptor remains ours.
    if (ctx->fd >= 0) close(ctx->fd);
    if (ctx->closed_subscription)
        g_dbus_connection_signal_unsubscribe(ctx->bus, ctx->closed_subscription);
    if (ctx->owner_subscription)
        g_dbus_connection_signal_unsubscribe(ctx->bus, ctx->owner_subscription);
    close_handle(ctx, ctx->session, SESSION);
    g_free(ctx->session);
    g_free(ctx->owner);
    if (ctx->bus) {
        g_dbus_connection_close_sync(ctx->bus, NULL, NULL);
        g_object_unref(ctx->bus);
    }
    if (ctx->context) g_main_context_unref(ctx->context);
    g_free(ctx);
}

void *snapvere_wayland_open(gint x, gint y, guint width, guint height) {
    if (!width || !height || width > 8192 || height > 8192 ||
        (guint64)width * height > 28000000) return NULL;
    if (!gst_init_check(NULL, NULL, NULL)) return NULL;
    PortalVideo *ctx = g_new0(PortalVideo, 1);
    ctx->fd = -1;
    ctx->width = width;
    ctx->height = height;
    ctx->x = x;
    ctx->y = y;
    ctx->context = g_main_context_new();
    g_main_context_push_thread_default(ctx->context);
    guint32 node = 0;
    guint64 serial = 0;
    gboolean ok = open_bus(ctx) && negotiate(ctx, &node, &serial);
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
    GstCaps *expected = gst_caps_new_simple("video/x-raw",
        "format", G_TYPE_STRING, "BGRA", "width", G_TYPE_INT, (gint)width,
        "height", G_TYPE_INT, (gint)height, NULL);
    gst_app_sink_set_caps(ctx->sink, expected);
    gst_caps_unref(expected);
    const gchar *target_property = serial ? "target-object" : "path";
    if (!g_object_class_find_property(G_OBJECT_GET_CLASS(input), "fd") ||
        !g_object_class_find_property(G_OBJECT_GET_CLASS(input), target_property)) {
        gst_object_unref(input);
        goto fail;
    }
    // Portal v6 serials cannot be confused with reused numeric node IDs.
    // Older portals only expose the ID in their restricted remote.
    gchar *path = serial ? g_strdup_printf("%" G_GUINT64_FORMAT, serial)
                         : g_strdup_printf("%u", node);
    GstStructure *props = gst_structure_new(
        "props", "media.type", G_TYPE_STRING, "Video",
        "media.category", G_TYPE_STRING, "Capture",
        "node.dont-fallback", G_TYPE_STRING, "true",
        "node.dont-reconnect", G_TYPE_STRING, "true",
        "node.dont-move", G_TYPE_STRING, "true", NULL);
    g_object_set(input, "fd", ctx->fd, target_property, path, "stream-properties", props, NULL);
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

static gboolean video_alive(PortalVideo *ctx) {
    if (!ctx || !session_alive(ctx) || gst_app_sink_is_eos(ctx->sink)) return FALSE;
    GstMessage *message = gst_bus_pop_filtered(ctx->video_bus, GST_MESSAGE_ERROR | GST_MESSAGE_EOS);
    if (message) {
        gst_message_unref(message);
        ctx->closed = TRUE;
        return FALSE;
    }
    return TRUE;
}

int snapvere_wayland_discard(void *handle) {
    PortalVideo *ctx = handle;
    if (!video_alive(ctx)) return -1;
    // Bound work even with a producer faster than the recorder. No paused
    // sample is copied into Rust or passed to the encoder.
    for (guint i = 0; i < 4; i++) {
        GstSample *sample = gst_app_sink_try_pull_sample(ctx->sink, 0);
        if (!sample) break;
        gst_sample_unref(sample);
        ctx->last_frame = g_get_monotonic_time();
    }
    return video_alive(ctx) ? 0 : -1;
}

int snapvere_wayland_pull(void *handle, guint8 *data, gsize capacity, guint timeout_ms) {
    PortalVideo *ctx = handle;
    if (!video_alive(ctx)) return -1;
    GstSample *sample = gst_app_sink_try_pull_sample(ctx->sink,
                            MIN(timeout_ms, 2000) * GST_MSECOND);
    if (!sample) {
        if (gst_app_sink_is_eos(ctx->sink) ||
            g_get_monotonic_time() - ctx->last_frame > 3 * G_TIME_SPAN_SECOND) return -1;
        return 0;
    }
    gboolean ok = video_alive(ctx) &&
        copy_frame(sample, ctx->width, ctx->height, data, capacity);
    gst_sample_unref(sample);
    if (!ok) return -1;
    ctx->last_frame = g_get_monotonic_time();
    return 1;
}

// Native buffer regression; no fake portal or claim of compositor consent.
#ifdef SNAPVERE_WAYLAND_TEST
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

    // Metadata with a stride larger than the actual backing buffer must
    // fail before changing any destination byte.
    buffer = gst_buffer_new_allocate(NULL, 12, NULL);
    gst_buffer_add_video_meta_full(buffer, GST_VIDEO_FRAME_FLAG_NONE,
        GST_VIDEO_FORMAT_BGRA, 2, 2, 1, offsets, strides);
    sample = gst_sample_new(buffer, caps, NULL, NULL);
    memset(output, 0xA5, sizeof(output));
    valid = valid && !copy_frame(sample, 2, 2, output, sizeof(output));
    for (guint i = 0; i < sizeof(output); i++) valid = valid && output[i] == 0xA5;
    gst_sample_unref(sample);
    gst_buffer_unref(buffer);
    gst_caps_unref(caps);

    const gchar *fixtures[] = {
        "{'streams': <[(uint32 42, {'source_type': <uint32 1>, 'position': <(-1920, 0)>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'source_type': <uint32 2>, 'position': <(-1920, 0)>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'source_type': <'monitor'>, 'position': <(-1920, 0)>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'pipewire-serial': <uint64 777>, 'position': <(-1920, 0)>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'pipewire-serial': <uint64 0>, 'position': <(-1920, 0)>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'pipewire-serial': <'777'>, 'position': <(-1920, 0)>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'position': <(0, 0)>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'position': <(-1920, 0)>, 'size': <(1280, 720)>})]>}",
        "{'streams': <[(uint32 42, {'position': <(-1920, 0)>})]>}",
        "{'streams': <[(uint32 42, {'position': <(-1920, 0)>, 'size': <(-1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'position': <'wrong'>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 0, {'position': <(-1920, 0)>, 'size': <(1920, 1080)>})]>}",
        "{'streams': <[(uint32 42, {'position': <(-1920, 0)>, 'size': <(1920, 1080)>}), (uint32 43, @a{sv} {})]>}"
    };
    for (guint i = 0; i < G_N_ELEMENTS(fixtures); i++) {
        GVariant *result = g_variant_parse(G_VARIANT_TYPE_VARDICT, fixtures[i], NULL, NULL, NULL);
        if (!result) return 1;
        guint32 node;
        guint64 serial;
        gboolean accepted = parse_stream(result, &node, &serial, -1920, 0, 1920, 1080);
        valid = valid && accepted == (i == 0 || i == 3);
        if (i == 3) valid = valid && serial == 777;
        g_variant_unref(result);
    }
    return valid ? 0 : 1;
}

#endif

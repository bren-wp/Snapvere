// Snapvere by Brendigo
// Query the live local PipeWire registry, without recording or starting a stream.
#include <gst/gst.h>
#include <pipewire/pipewire.h>
#include <errno.h>
#include <string.h>

typedef struct {
    guint64 serial;
    guint32 role;
    char name[256];
} AudioNode;

typedef struct {
    guint64 mic, monitor;
    AudioNode *nodes;
    guint capacity, length;
    guint32 cookie;
    guint32 ids[2];
    guint count[2];
    int seq;
    gboolean done, error, info;
} Identity;

static void on_info(void *data, const struct pw_core_info *info) {
    Identity *ctx = data;
    ctx->cookie = info->cookie;
    ctx->info = TRUE;
}

static void on_done(void *data, uint32_t id, int seq) {
    Identity *ctx = data;
    if (id == PW_ID_CORE && seq == ctx->seq) ctx->done = TRUE;
}

static void on_error(void *data, uint32_t id, int seq, int res, const char *message) {
    (void)id; (void)seq; (void)res; (void)message;
    ((Identity *)data)->error = TRUE;
}

static void on_global(void *data, uint32_t id, uint32_t permissions,
                      const char *type, uint32_t version, const struct spa_dict *props) {
    (void)permissions; (void)version;
    Identity *ctx = data;
    if (!props || strcmp(type, PW_TYPE_INTERFACE_Node)) return;
    const char *serial = spa_dict_lookup(props, "object.serial");
    const char *kind = spa_dict_lookup(props, "media.class");
    const char *name = spa_dict_lookup(props, "node.name");
    if (!serial || !kind || !name || !*name) return;
    char *end = NULL;
    errno = 0;
    guint64 number = g_ascii_strtoull(serial, &end, 10);
    if (errno || end == serial || *end || !number) return;
    guint role = !strcmp(kind, "Audio/Source") ? 1 : !strcmp(kind, "Audio/Sink") ? 2 : 0;
    if (ctx->nodes && role) {
        if (ctx->length >= ctx->capacity) {
            ctx->error = TRUE;
            return;
        }
        const char *description = spa_dict_lookup(props, "node.description");
        AudioNode *node = &ctx->nodes[ctx->length++];
        node->serial = number;
        node->role = role;
        g_strlcpy(node->name, description && *description ? description : name,
                  sizeof(node->name));
    }
    if (number == ctx->mic && !strcmp(kind, "Audio/Source")) {
        ctx->ids[0] = id;
        ctx->count[0]++;
    }
    if (number == ctx->monitor && !strcmp(kind, "Audio/Sink")) {
        ctx->ids[1] = id;
        ctx->count[1]++;
    }
}

static void on_remove(void *data, uint32_t id) {
    Identity *ctx = data;
    if (ctx->nodes) ctx->error = TRUE;
    for (guint i = 0; i < 2; i++)
        if (ctx->count[i] && ctx->ids[i] == id) ctx->error = TRUE;
}

static const struct pw_core_events core_events = {
    PW_VERSION_CORE_EVENTS,
    .info = on_info, .done = on_done, .error = on_error,
};

static const struct pw_registry_events registry_events = {
    PW_VERSION_REGISTRY_EVENTS,
    .global = on_global, .global_remove = on_remove,
};

// A cookie identifies the current PipeWire server instance. Serial numbers
// alone may be reused after a restart. A zero expected cookie is enumeration
// mode for the isolated test; recorder calls always require a nonzero cookie.
static int query_registry(guint64 mic, guint64 monitor, guint32 expected_cookie,
                          guint32 *actual_cookie, AudioNode *nodes, guint capacity) {
    if ((!nodes && !mic && !monitor) || (mic && mic == monitor)) return -1;
    if (actual_cookie) *actual_cookie = 0;
    static gsize initialized = 0;
    if (g_once_init_enter(&initialized)) {
        pw_init(NULL, NULL);
        g_once_init_leave(&initialized, 1);
    }

    int result = -1;
    Identity identity = {
        .mic = mic, .monitor = monitor, .nodes = nodes, .capacity = capacity,
    };
    struct pw_main_loop *main_loop = pw_main_loop_new(NULL);
    if (!main_loop) return -1;
    struct pw_loop *loop = pw_main_loop_get_loop(main_loop);
    struct pw_context *context = pw_context_new(loop, NULL, 0);
    struct pw_core *core = NULL;
    struct pw_registry *registry = NULL;
    struct spa_hook core_listener, registry_listener;
    gboolean core_listening = FALSE, registry_listening = FALSE;
    if (!context) goto done;
    core = pw_context_connect(context, NULL, 0);
    if (!core) goto done;
    pw_core_add_listener(core, &core_listener, &core_events, &identity);
    core_listening = TRUE;
    registry = pw_core_get_registry(core, PW_VERSION_REGISTRY, 0);
    if (!registry) goto done;
    pw_registry_add_listener(registry, &registry_listener, &registry_events, &identity);
    registry_listening = TRUE;
    identity.seq = pw_core_sync(core, PW_ID_CORE, 0);
    if (identity.seq < 0) goto done;

    gint64 deadline = g_get_monotonic_time() + 1000 * G_TIME_SPAN_MILLISECOND;
    pw_loop_enter(loop);
    while (!identity.done && !identity.error && g_get_monotonic_time() < deadline) {
        int status = pw_loop_iterate(loop, 50);
        if (status < 0 && status != -EINTR) break;
    }
    pw_loop_leave(loop);
    if (identity.done && !identity.error && identity.info && identity.cookie &&
        (!expected_cookie || expected_cookie == identity.cookie) &&
        (!mic || identity.count[0] == 1) &&
        (!monitor || identity.count[1] == 1)) {
        if (actual_cookie) *actual_cookie = identity.cookie;
        result = nodes ? (int)identity.length : 0;
    }
done:
    if (registry_listening) spa_hook_remove(&registry_listener);
    if (registry) pw_proxy_destroy((struct pw_proxy *)registry);
    if (core_listening) spa_hook_remove(&core_listener);
    if (core) pw_core_disconnect(core);
    if (context) pw_context_destroy(context);
    pw_main_loop_destroy(main_loop);
    return result;
}

int snapvere_audio_validate(guint64 mic, guint64 monitor, guint32 expected_cookie,
                            guint32 *actual_cookie) {
    return query_registry(mic, monitor, expected_cookie, actual_cookie, NULL, 0);
}

int snapvere_audio_list(AudioNode *nodes, guint capacity, guint32 *cookie) {
    if (!nodes || !capacity || capacity > 128 || !cookie) return -1;
    return query_registry(0, 0, 0, cookie, nodes, capacity);
}

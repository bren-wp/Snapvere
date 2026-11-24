// Snapvere by Brendigo
// Test-only native PCM capture probe. Never shipped in desktop packages.
// Requires an explicitly selected node in the isolated CI PipeWire graph.
#include <gst/gst.h>
#include <gst/app/gstappsink.h>
#include <string.h>

static gboolean check_bus(GstBus *bus) {
    GstMessage *message = gst_bus_pop_filtered(bus, GST_MESSAGE_ERROR | GST_MESSAGE_EOS);
    if (!message) return TRUE;
    if (GST_MESSAGE_TYPE(message) == GST_MESSAGE_ERROR) {
        GError *error = NULL;
        gst_message_parse_error(message, &error, NULL);
        if (error) g_printerr("Audio stream failed: %s\n", error->message);
        g_clear_error(&error);
    }
    gst_message_unref(message);
    return FALSE;
}

int main(int argc, char **argv) {
    if (argc != 3 || !argv[1][0] ||
        (strcmp(argv[2], "source") && strcmp(argv[2], "monitor"))) return 2;
    gst_init(NULL, NULL);
    GError *error = NULL;
    GstElement *pipeline = gst_parse_launch(
        "pipewiresrc name=input ! audioconvert ! audioresample "
        "! audio/x-raw,format=S16LE,rate=48000,channels=2,layout=interleaved "
        "! appsink name=pcm sync=false max-buffers=8 drop=false", &error);
    GstElement *input = NULL;
    GstAppSink *sink = NULL;
    GstBus *bus = NULL;
    int result = 1;
    if (error || !pipeline) {
        g_clear_error(&error);
        goto done;
    }
    input = gst_bin_get_by_name(GST_BIN(pipeline), "input");
    sink = GST_APP_SINK(gst_bin_get_by_name(GST_BIN(pipeline), "pcm"));
    bus = gst_element_get_bus(pipeline);
    if (!input || !sink || !bus ||
        !g_object_class_find_property(G_OBJECT_GET_CLASS(input), "target-object"))
        goto done;
    // A numeric object.serial or exact node.name is a property, never pipeline syntax.
    // Request no fallback/reconnect and distinguish source from sink monitoring.
    GstStructure *props = gst_structure_new(
        "props", "media.type", G_TYPE_STRING, "Audio",
        "media.category", G_TYPE_STRING, "Capture",
        "node.dont-fallback", G_TYPE_STRING, "true",
        "node.dont-reconnect", G_TYPE_STRING, "true",
        "node.dont-move", G_TYPE_STRING, "true",
        "stream.capture.sink", G_TYPE_STRING,
        !strcmp(argv[2], "monitor") ? "true" : "false", NULL);
    g_object_set(input, "target-object", argv[1], "stream-properties", props, NULL);
    gst_structure_free(props);
    if (gst_element_set_state(pipeline, GST_STATE_PLAYING) == GST_STATE_CHANGE_FAILURE)
        goto done;

    guint64 frames = 0;
    guint64 audible = 0;
    GstClockTime previous = GST_CLOCK_TIME_NONE;
    gint64 deadline = g_get_monotonic_time() + 8 * G_USEC_PER_SEC;
    while (g_get_monotonic_time() < deadline && frames < 96000) {
        if (!check_bus(bus)) goto done;
        GstSample *sample = gst_app_sink_try_pull_sample(sink, 200 * GST_MSECOND);
        if (!sample) continue;
        GstBuffer *buffer = gst_sample_get_buffer(sample);
        GstCaps *caps = gst_sample_get_caps(sample);
        const GstStructure *format = caps ? gst_caps_get_structure(caps, 0) : NULL;
        gint rate = 0, channels = 0;
        GstMapInfo map;
        if (!buffer || !format ||
            g_strcmp0(gst_structure_get_string(format, "format"), "S16LE") ||
            !gst_structure_get_int(format, "rate", &rate) || rate != 48000 ||
            !gst_structure_get_int(format, "channels", &channels) || channels != 2 ||
            !GST_BUFFER_PTS_IS_VALID(buffer) ||
            (GST_CLOCK_TIME_IS_VALID(previous) && GST_BUFFER_PTS(buffer) < previous) ||
            !gst_buffer_map(buffer, &map, GST_MAP_READ)) {
            gst_sample_unref(sample);
            goto done;
        }
        if (!map.size || map.size % 4 || map.size > 48000 * 4) {
            gst_buffer_unmap(buffer, &map);
            gst_sample_unref(sample);
            goto done;
        }
        previous = GST_BUFFER_PTS(buffer);
        frames += map.size / 4;
        for (gsize i = 0; i < map.size; i += 2) {
            gint16 value = (gint16)GST_READ_UINT16_LE(map.data + i);
            if (value > 512 || value < -512) audible++;
        }
        gst_buffer_unmap(buffer, &map);
        gst_sample_unref(sample);
        if (frames >= 24000 && audible >= 4800) {
            g_print("Verified %s: %" G_GUINT64_FORMAT
                    " frames, %" G_GUINT64_FORMAT " audible samples at 48000 Hz stereo\n",
                    argv[2], frames, audible);
            result = 0;
            break;
        }
    }
done:
    if (pipeline) gst_element_set_state(pipeline, GST_STATE_NULL);
    if (bus) gst_object_unref(bus);
    if (sink) gst_object_unref(sink);
    if (input) gst_object_unref(input);
    if (pipeline) gst_object_unref(pipeline);
    return result;
}

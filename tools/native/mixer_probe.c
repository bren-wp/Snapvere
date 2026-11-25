// Snapvere by Brendigo
// Exercise the same mixed audio adapter linked into the experimental recorder.
#include "linux_media.h"
#include <stdlib.h>

int main(int argc, char **argv) {
    if (argc != 3) return 2;
    guint64 mic = g_ascii_strtoull(argv[1], NULL, 10);
    guint64 monitor = g_ascii_strtoull(argv[2], NULL, 10);
    if (!mic || !monitor || mic == monitor) return 2;
    guint32 cookie = 0;
    AudioNode nodes[128] = {0};
    int count = snapvere_audio_list(nodes, 128, &cookie);
    if (count < 2 || count > 128 || !cookie) {
        g_printerr("Mixer registry enumeration failed (count=%d)\n", count);
        return 1;
    }
    gboolean found_mic = FALSE, found_monitor = FALSE;
    for (int i = 0; i < count; i++) {
        if (nodes[i].serial == mic && nodes[i].role == 1) found_mic = TRUE;
        if (nodes[i].serial == monitor && nodes[i].role == 2) found_monitor = TRUE;
    }
    if (!found_mic || !found_monitor) {
        g_printerr("Mixer selected role missing (mic=%d monitor=%d)\n", found_mic, found_monitor);
        return 1;
    }
    if (snapvere_audio_validate(mic, monitor, 0, &cookie) || !cookie) {
        g_printerr("Mixer selected identity validation failed\n");
        return 1;
    }
    // Reject reversed roles and an identity from a different server instance.
    if (!snapvere_audio_validate(monitor, mic, cookie, NULL)) return 3;
    guint32 wrong_cookie = cookie == 1 ? 2 : cookie - 1;
    if (!snapvere_audio_validate(mic, monitor, wrong_cookie, NULL)) return 3;
    void *capture = snapvere_audio_open(mic, monitor, cookie);
    if (!capture) {
        g_printerr("Mixer could not open selected inputs\n");
        return 1;
    }
    guint8 pcm[19200];
    guint64 frames = 0, audible = 0;
    gint64 deadline = g_get_monotonic_time() + 4 * G_TIME_SPAN_SECOND;
    int result = 1;
    while (g_get_monotonic_time() < deadline) {
        int bytes = snapvere_audio_pull(capture, pcm, sizeof(pcm));
        if (bytes < 0) {
            g_printerr("Mixer rejected PCM or input health\n");
            break;
        }
        if (!bytes) {
            g_usleep(2000);
            continue;
        }
        frames += (guint64)bytes / 4;
        for (int i = 0; i < bytes; i += 2) {
            gint16 value = (gint16)GST_READ_UINT16_LE(pcm + i);
            if (value > 512 || value < -512) audible++;
        }
        if (frames >= 24000 && audible >= 4800) {
            g_print("Mixed selected PipeWire inputs: %" G_GUINT64_FORMAT " frames\n", frames);
            result = 0;
            break;
        }
    }
    if (result != 0)
        g_printerr("Mixer acceptance failed: %" G_GUINT64_FORMAT " frames, %" G_GUINT64_FORMAT " audible samples\n", frames, audible);
    snapvere_audio_free(capture);
    return result;
}

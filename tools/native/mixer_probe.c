// Snapvere by Brendigo
// Exercise the same mixed audio adapter linked into the experimental recorder.
#include <gst/gst.h>
#include <stdlib.h>

void *snapvere_audio_open(guint64 mic, guint64 monitor);
int snapvere_audio_pull(void *handle, guint8 *data, gsize capacity);
void snapvere_audio_free(void *handle);

int main(int argc, char **argv) {
    if (argc != 3) return 2;
    guint64 mic = g_ascii_strtoull(argv[1], NULL, 10);
    guint64 monitor = g_ascii_strtoull(argv[2], NULL, 10);
    if (!mic || !monitor || mic == monitor) return 2;
    void *capture = snapvere_audio_open(mic, monitor);
    if (!capture) return 1;
    guint8 pcm[19200];
    guint64 frames = 0, audible = 0;
    gint64 deadline = g_get_monotonic_time() + 4 * G_TIME_SPAN_SECOND;
    int result = 1;
    while (g_get_monotonic_time() < deadline) {
        int bytes = snapvere_audio_pull(capture, pcm, sizeof(pcm));
        if (bytes < 0) break;
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
    snapvere_audio_free(capture);
    return result;
}

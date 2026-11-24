// Snapvere by Brendigo
// Capture a synthetic ordinary Wayland window through the production portal
// adapter. No screenshots of the host session and no permission bypass.
#include "linux_media.h"
#include <glib.h>
#include <stdio.h>

#define WIDTH 640u
#define HEIGHT 480u
#define BYTES ((gsize)WIDTH * HEIGHT * 4)

static gboolean marker_present(const guint8 *frame) {
    guint count = 0;
    for (gsize i = 0; i < BYTES; i += 4) {
        if (frame[i] > 220 && frame[i + 1] < 35 && frame[i + 2] > 220)
            count++;
    }
    return count > WIDTH * HEIGHT / 10;
}

int main(void) {
    void *portal = snapvere_wayland_open(0, 0, WIDTH, HEIGHT, WIDTH, HEIGHT);
    if (!portal) {
        fputs("Portal refused the exact authorized output geometry\n", stderr);
        return 1;
    }
    guint8 *frame = g_malloc(BYTES);
    int status = 1;
    gboolean baseline = FALSE;
    gint64 deadline = g_get_monotonic_time() + 12 * G_TIME_SPAN_SECOND;
    while (g_get_monotonic_time() < deadline) {
        int result = snapvere_wayland_pull(portal, frame, BYTES, 250);
        if (result < 0) {
            fputs("Authorized video stream failed\n", stderr);
            break;
        }
        if (result == 0) continue;
        gboolean present = marker_present(frame);
        if (!baseline) {
            if (present) {
                fputs("Marker unexpectedly present on separate output\n", stderr);
                break;
            }
            // Reject blank, unrelated or uninitialized streams. The harness
            // verifies the selected output's known background independently.
            gsize center = ((gsize)(HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
            if (ABS((int)frame[center] - 86) > 12 ||
                ABS((int)frame[center + 1] - 52) > 12 ||
                ABS((int)frame[center + 2] - 18) > 12) {
                fputs("Selected output background does not match fixture\n", stderr);
                break;
            }
            baseline = TRUE;
            puts("SEPARATE_OUTPUT_MARKER_ABSENT");
            fflush(stdout);
        } else if (present) {
            printf("SAME_OUTPUT_MARKER_PRESENT %" G_GINT64_FORMAT "\n", g_get_monotonic_time());
            fflush(stdout);
            status = 0;
            break;
        }
    }
    g_free(frame);
    snapvere_wayland_free(portal);
    return status;
}

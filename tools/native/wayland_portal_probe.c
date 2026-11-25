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
    guint baseline_phases = 0;
    guint samples = 0;
    guint marker_samples = 0;
    gint64 first_marker_at = 0;
    gint64 start = g_get_monotonic_time();
    gint64 deadline = start + 12 * G_TIME_SPAN_SECOND;
    guint startup_mismatches = 0;
    while (g_get_monotonic_time() < deadline) {
        int result = snapvere_wayland_pull(portal, frame, BYTES, 250);
        if (result < 0) {
            fprintf(stderr, "Authorized video stream failed after %u valid samples\n", samples);
            break;
        }
        if (result == 0) continue;
        samples++;
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
                // Allow only a bounded startup interval to establish the
                // independently checked baseline. Never accept a mismatched
                // frame as evidence or move the marker before verification.
                startup_mismatches++;
                if (startup_mismatches == 1)
                    fprintf(stderr, "Initial fixture mismatch: BGR=%u,%u,%u\n",
                            (unsigned)frame[center], (unsigned)frame[center + 1],
                            (unsigned)frame[center + 2]);
                if (g_get_monotonic_time() - start < 2 * G_TIME_SPAN_SECOND)
                    continue;
                fputs("Selected output background does not match fixture\n", stderr);
                break;
            }
            // A static wallpaper cannot satisfy both measured repaint phases.
            if (ABS((int)frame[center + 1] - 52) <= 2 &&
                ABS((int)frame[center + 2] - 18) <= 2) {
                if (ABS((int)frame[center] - 80) <= 2) baseline_phases |= 1u;
                if (ABS((int)frame[center] - 92) <= 2) baseline_phases |= 2u;
            }
            if (baseline_phases != 3u) continue;
            baseline = TRUE;
            puts("BASELINE_REPAINT_PHASES 2");
            puts("SEPARATE_OUTPUT_MARKER_ABSENT");
            fflush(stdout);
        } else if (present) {
            if (marker_samples == 0) first_marker_at = g_get_monotonic_time();
            marker_samples++;
            // A single frame is insufficient evidence of a functioning stream.
            if (marker_samples == 3) {
                printf("SAME_OUTPUT_MARKER_PRESENT %" G_GINT64_FORMAT "\n", first_marker_at);
                printf("SUSTAINED_MARKER_SAMPLES %u\n", marker_samples);
                fflush(stdout);
                status = 0;
                break;
            }
        } else {
            marker_samples = 0;
        }
    }
    if (status != 0)
        fprintf(stderr, "Portal acceptance failed: %u valid samples, %u startup mismatches, %u marker samples\n",
                samples, startup_mismatches, marker_samples);
    g_free(frame);
    snapvere_wayland_free(portal);
    return status;
}

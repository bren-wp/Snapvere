// Snapvere by Brendigo
// Shared native media ABI used by the recorder and its isolated CI probes.
#ifndef SNAPVERE_LINUX_MEDIA_H
#define SNAPVERE_LINUX_MEDIA_H

#include <gst/gst.h>

typedef struct {
    guint64 serial;
    guint32 role;
    char name[256];
} AudioNode;

int snapvere_audio_list(AudioNode *nodes, guint capacity, guint32 *cookie);
int snapvere_audio_validate(guint64 mic, guint64 monitor, guint32 expected_cookie,
                            guint32 *actual_cookie);
void *snapvere_audio_open(guint64 mic, guint64 monitor, guint32 cookie);
int snapvere_audio_pull(void *handle, guint8 *data, gsize capacity);
void snapvere_audio_free(void *handle);

void *snapvere_mp4_open_av(int fd, guint w, guint h, guint fps, guint bitrate,
                          gboolean with_audio);
int snapvere_mp4_push(void *handle, const guint8 *data, gsize len,
                      guint64 pts_ns, guint64 duration_ns);
int snapvere_mp4_push_pcm(void *handle, const guint8 *data, gsize len);
int snapvere_mp4_finish(void *handle);
void snapvere_mp4_free(void *handle);

void *snapvere_wayland_open(gint x, gint y, guint width, guint height);
int snapvere_wayland_pull(void *handle, guint8 *data, gsize capacity, guint timeout_ms);
int snapvere_wayland_discard(void *handle);
void snapvere_wayland_free(void *handle);
#ifdef SNAPVERE_WAYLAND_TEST
int snapvere_wayland_test_frame(void);
#endif

#endif

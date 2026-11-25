// Snapvere by Brendigo
type PreviewRequest = (isCurrent: () => boolean) => Promise<void>;

/** One in-flight IPC request and at most one coalesced pending request.
 * Invalidating a generation cannot cancel an existing native invocation,
 * but it prevents that invocation from committing or starting further IPC.
 */
export class LatestPreviewRequest {
  private generation = 0;
  private running = false;
  private pending: { generation: number; work: PreviewRequest; onError: () => void } | null = null;

  invalidate(): void {
    this.generation++;
    this.pending = null;
  }

  request(work: PreviewRequest, onError: () => void): void {
    this.invalidate();
    this.pending = { generation: this.generation, work, onError };
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.pending) {
        const job = this.pending;
        this.pending = null;
        const isCurrent = () => job.generation === this.generation;
        try {
          await job.work(isCurrent);
        } catch {
          if (isCurrent()) job.onError();
        }
      }
    } finally {
      this.running = false;
    }
  }
}

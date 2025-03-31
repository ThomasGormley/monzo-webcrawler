export type Job = ({ retryCount }: { retryCount: number }) => Promise<void>;

type QueuedJob = { job: Job; retryCount: number };

export class JobProcessor {
  #maxConcurrentJobs = 5;
  #queue: QueuedJob[] = [];
  #maxRetries = 5;
  #dlq: QueuedJob[] = [];
  #activeJobs = 0;
  #shouldProcess = true;

  constructor({
    maxConcurrentJobs,
  }: {
    maxConcurrentJobs?: number;
  } = {}) {
    if (maxConcurrentJobs) {
      this.#maxConcurrentJobs = maxConcurrentJobs;
    }
  }

  process() {
    this.#processLoop();
  }

  stop() {
    this.#shouldProcess = false;
  }

  enqueue(job: Job) {
    this.#queue.push({ job, retryCount: 0 });
  }

  queueSize() {
    return this.#queue.length;
  }

  processing() {
    return this.#shouldProcess;
  }

  #enqueueWithRetries(
    job: Job,
    { retryCount, delay }: { retryCount: number; delay?: number },
  ) {
    if (delay) {
      setTimeout(() => this.#queue.push({ job, retryCount }), delay);
      return;
    }
    this.#queue.push({ job, retryCount });
  }

  async #processLoop() {
    while (this.#shouldProcess) {
      const canTakeTask =
        this.#activeJobs < this.#maxConcurrentJobs && this.#queue.length > 0;

      if (canTakeTask) {
        const next = this.#queue.shift();
        if (!next) {
          continue;
        }

        const { job, retryCount } = next;
        if (retryCount === this.#maxRetries) {
          this.#dlq.push({ job, retryCount: 0 });
          continue;
        }

        this.#activeJobs++;
        try {
          await job({ retryCount });
        } catch {
          setTimeout(() =>
            this.#enqueueWithRetries(job, {
              retryCount: retryCount + 1,
              delay: 100 * retryCount + Math.random() * 50, // exponential delay with jitter
            }),
          );
        } finally {
          this.#activeJobs--;
        }
      }

      await yieldEventLoop();
    }
  }
}

const yieldEventLoop = async () => new Promise((r) => setImmediate(r));

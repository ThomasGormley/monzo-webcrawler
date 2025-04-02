export type Job = ({ retryCount }: { retryCount: number }) => Promise<void>;

type QueuedJob = { job: Job; retryCount: number };

type DelayFn = (retryCount: number) => number;
const exponentialDelayWithJitter = (retryCount: number) =>
  100 * retryCount + Math.random() * 50;

export class JobProcessor {
  #maxConcurrentJobs = 5;
  #interval = 10;
  #lastJobProcessedAt: number | null = null;
  #queue: QueuedJob[] = [];
  #maxRetries = 5;
  #dlq: QueuedJob[] = [];
  #activeJobs = 0;
  #shouldProcess = true;
  #delayFn: DelayFn = exponentialDelayWithJitter;

  constructor({
    maxConcurrentJobs,
    maxRps,
    delayFn,
  }: {
    maxConcurrentJobs?: number;
    maxRps?: number;
    delayFn?: DelayFn;
  } = {}) {
    if (maxConcurrentJobs) {
      this.#maxConcurrentJobs = maxConcurrentJobs;
    }
    if (maxRps) {
      this.#interval = maxRps / 1000;
    }

    if (delayFn) {
      this.#delayFn = delayFn;
    }
  }

  process() {
    this.#processLoop();
  }

  stop() {
    if (this.#dlq.length > 0) {
      console.warn(`${this.#dlq.length} messages in the deadletter queue`);
    }
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

  deadletterQueue() {
    return this.#dlq;
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

  async #ratelimit() {
    if (!this.#lastJobProcessedAt) {
      return;
    }
    const timeSinceLastJob = Date.now() - this.#lastJobProcessedAt;
    if (timeSinceLastJob < this.#interval) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.#interval - timeSinceLastJob),
      );
    }
  }

  async #processLoop() {
    while (this.#shouldProcess) {
      await this.#ratelimit();

      const canTakeTask =
        this.#activeJobs < this.#maxConcurrentJobs && this.#queue.length > 0;

      if (canTakeTask) {
        const next = this.#queue.shift();
        if (!next) {
          continue;
        }

        const { job, retryCount } = next;
        if (retryCount === this.#maxRetries) {
          this.#dlq.push({ job, retryCount });
          continue;
        }

        this.#activeJobs++;
        try {
          await job({ retryCount });
        } catch {
          setTimeout(() =>
            this.#enqueueWithRetries(job, {
              retryCount: retryCount + 1,
              delay: this.#delayFn(retryCount),
            }),
          );
        } finally {
          this.#activeJobs--;
          this.#lastJobProcessedAt = Date.now();
        }
      }

      await yieldEventLoop();
    }
  }
}

const yieldEventLoop = async () => new Promise((r) => setImmediate(r));

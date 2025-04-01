import { load } from "cheerio/slim";
import { JobProcessor } from "./job-processor";
import { EventEmitter } from "events";
import { URLManager } from "./url-manager";

type CrawlerOptions = {
  timeoutMs: number;
  abortController: AbortController;
  jobProcessor?: JobProcessor;
  onVisited?: (args: CrawlerEvents["visited"][number]) => void;
  maxDepth: number;
};

type CrawlerEvents = {
  visited: { url: string; urls: string[] }[];
};

export class Crawler {
  urlManager: URLManager = new URLManager();
  #processor;
  #timedout = false;
  #options: Omit<CrawlerOptions, "jobProcessor">;
  #emitter = new EventEmitter<CrawlerEvents>();

  constructor(opts: Partial<CrawlerOptions> = {}) {
    this.#options = {
      timeoutMs: 5000,
      abortController: new AbortController(),
      maxDepth: 5,
      ...opts,
    } satisfies CrawlerOptions;

    this.#processor = opts.jobProcessor ?? new JobProcessor();
    if (this.#options.onVisited) {
      this.#emitter.on("visited", this.#options.onVisited);
    }
  }

  crawl(url: string) {
    this.#processor.process();
    this.#timeout();
    this.#crawlUrl(url, {
      abortSignal: this.#options.abortController.signal,
      depth: 0,
    });
  }

  stop() {
    this.#options.abortController.abort();
    this.#processor.stop();
  }

  crawling() {
    return this.#processor.queueSize() > 0 && this.#processor.processing();
  }

  timedout() {
    return this.#timedout;
  }

  #timeout() {
    setTimeout(() => {
      this.#timedout = true;
      this.stop();
    }, this.#options.timeoutMs);
  }

  #crawlUrl(
    url: string,
    opts: {
      abortSignal: AbortSignal;
      depth: number;
    },
  ) {
    if (opts.depth > this.#options.maxDepth) {
      return;
    }

    const shouldCrawl =
      !this.urlManager.hasVisited(url) && !this.urlManager.inQueue(url);

    if (!shouldCrawl) {
      return;
    }

    this.urlManager.queued(url);
    this.#processor.enqueue(async () => {
      try {
        if (this.#timedout) {
          return;
        }

        // Intentionally lookup the visited state again for resiliency against
        // race condition where a URL is visited while the duplicate job is enqueued
        const visitedWhileQueued = !this.urlManager.hasVisited(url);
        if (!visitedWhileQueued) {
          return;
        }

        const reqUrl = new URL(url);
        const res = await fetch(url, {
          headers: { "user-agent": "Mz-Webcrawler/1.0 (testing)" },
          signal: opts.abortSignal,
        });

        switch (res.status % 100) {
          case 4:
            this.urlManager.error(url, res.status);
            // Client error, don’t retry
            return;
          case 5:
            this.urlManager.error(url, res.status);
            // server error, throw to retry
            throw new Error(
              `Failed to fetch ${url}, status: ${res.statusText}`,
            );
          default: // fallthrough
        }

        this.urlManager.persistVisited(url);
        const resUrl = new URL(res.url);

        const redirected = resUrl.host !== reqUrl.host;
        if (redirected) {
          this.#emitter.emit("visited", { url, urls: [] });
          return;
        }

        const contentType = res.headers.get("content-type");
        if (!contentType?.includes("text/html")) {
          this.#emitter.emit("visited", { url, urls: [] });
          return;
        }

        const body = await res.text();
        const nextCrawlUrls = extractNextCrawlUrls(body, reqUrl);

        this.#emitter.emit("visited", {
          url,
          urls: nextCrawlUrls,
        });

        this.#crawlUrls(nextCrawlUrls, { ...opts, depth: opts.depth + 1 });
      } finally {
        this.urlManager.dequeued(url);
      }
    });
  }

  #crawlUrls(
    urls: string[],
    opts: {
      abortSignal: AbortSignal;
      depth: number;
    },
  ) {
    for (const url of urls) {
      this.#crawlUrl(url, opts);
    }
  }
}

function extractNextCrawlUrls(body: string, reqUrl: URL) {
  const $ = load(body);
  const toCrawl: string[] = [];
  for (const element of $("a[href]")) {
    const href = $(element).attr("href");
    if (!href) {
      continue;
    }

    try {
      const resolvedUrl = new URL(href, reqUrl);
      const isMatchingDomain = resolvedUrl.host === reqUrl.host;
      if (isMatchingDomain) {
        toCrawl.push(resolvedUrl.href);
      }
    } catch {
      // skip invalid URLs
    }
  }

  const dedupedToCrawl = [...new Set(toCrawl)];
  return dedupedToCrawl;
}

import { JobProcessor } from "./job-processor";
import { EventEmitter } from "events";
import { URLManager } from "./url-manager";
import { load } from "cheerio";

export type CrawlerOptions = {
  maxConcurrentRequests?: number;
  maxRps?: number;
  timeoutMs: number;
  abortController: AbortController;
  jobProcessor?: JobProcessor;
  onVisited?: (args: CrawlerEvents["visited"][number]) => void;
  onError?: (args: CrawlerEvents["error"][number]) => void;
  maxDepth: number;
};

type CrawlerEvents = {
  visited: { url: string; urls: string[] }[];
  error: { url: string; error: unknown }[];
};

export class Crawler {
  urlManager: URLManager = new URLManager();
  #processor;
  #timedout = false;
  #options: Omit<CrawlerOptions, "jobProcessor">;
  #emitter = new EventEmitter<CrawlerEvents>();

  constructor(opts: Partial<CrawlerOptions> = {}) {
    this.#options = {
      timeoutMs: 0,
      abortController: new AbortController(),
      maxDepth: 3,
      maxConcurrentRequests: 1,
      maxRps: 2,
      ...opts,
    } satisfies CrawlerOptions;

    this.#processor =
      opts.jobProcessor ??
      new JobProcessor({
        maxConcurrentJobs: opts.maxConcurrentRequests,
        maxRps: opts.maxRps,
      });

    if (this.#options.onVisited) {
      this.#emitter.on("visited", this.#options.onVisited);
    }
    if (this.#options.onError) {
      this.#emitter.on("error", this.#options.onError);
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
    if (this.#options.timeoutMs <= 0) {
      return;
    }

    setTimeout(() => {
      console.info("Timeout limit reached, cancelling inflight requests");
      this.#timedout = true;
      this.stop();
    }, this.#options.timeoutMs);
  }

  #crawlUrl(
    urlToCrawl: string,
    opts: {
      abortSignal: AbortSignal;
      depth: number;
    },
  ) {
    if (opts.depth > this.#options.maxDepth) {
      return;
    }

    const url = normaliseUrl(urlToCrawl);
    if (url.trim() === "") {
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
          headers: { "user-agent": "Mz-Webcrawler/1.0" },
          signal: opts.abortSignal,
        });

        switch (res.status % 100) {
          case 4:
          case 5:
            this.urlManager.error(url, res.status);
            if (isTransientError(res.status)) {
              // if its transient, throw to retry
              throw new Error(
                `Failed to fetch ${url} due to ${res.statusText}`,
              );
            }
            // Otherwise client error thats unlikely to change, don’t retry
            return;
          default: // fallthrough
        }

        this.urlManager.persistVisited(url);
        const resUrl = new URL(res.url);

        const redirectedExternally = resUrl.host !== reqUrl.host;
        if (redirectedExternally) {
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
      } catch (e) {
        this.#emitter.emit("error", { url, error: e });
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

function isTransientError(status: number) {
  return [408, 429, 500, 502, 503, 504].includes(status);
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

function normaliseUrl(u: string) {
  try {
    const url = new URL(u);

    // strip the hash e.g.
    // `/page_1.html#header` & `/page_1.html#body` should be equal
    url.hash = "";

    // sort query parameters e.g.
    // `?b=2&a=1` & `?a=1&b=2` should be equal
    url.searchParams.sort();
    return url.toString();
  } catch {
    return "";
  }
}

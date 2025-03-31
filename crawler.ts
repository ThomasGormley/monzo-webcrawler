import { load } from "cheerio/slim";
import { JobProcessor } from "./job-processor";
import { EventEmitter } from "events";
import { URLManager } from "./url-manager";

type CrawlerOptions = {
  timeoutMs: number;
  abortController: AbortController;
  urlManager?: URLManager;
  onVisited?: (args: CrawlerEvents["visited"][number]) => void;
};

type CrawlerEvents = {
  visited: { url: string; status: number; urls: string[] }[];
};

export class Crawler {
  urlManager: URLManager = new URLManager();
  #processor = new JobProcessor();
  #timedout = false;
  #options: CrawlerOptions;
  #emitter = new EventEmitter<CrawlerEvents>();

  constructor(opts: Partial<CrawlerOptions> = {}) {
    this.#options = {
      timeoutMs: 5000,
      abortController: new AbortController(),
      ...opts,
    } satisfies CrawlerOptions;

    if (this.#options.onVisited) {
      this.#emitter.on("visited", this.#options.onVisited);
    }
  }

  crawl(url: string) {
    this.#processor.process();
    this.#timeout();
    this.#crawlUrl(url, { abortSignal: this.#options.abortController.signal });
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
    },
  ) {
    const shouldCrawl = !this.urlManager.hasVisited(url);

    if (!shouldCrawl) {
      return;
    }

    this.#processor.enqueue(async () => {
      if (this.#timedout) {
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
          throw new Error(`Failed to fetch ${url}, status: ${res.statusText}`);
        default: // fallthrough
      }

      this.urlManager.persistVisited(url);
      const resUrl = new URL(res.url);

      const redirected = resUrl.host !== reqUrl.host;
      if (redirected) {
        this.#emitter.emit("visited", { url, status: res.status, urls: [] });
        return;
      }

      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("text/html")) {
        this.#emitter.emit("visited", { url, status: res.status, urls: [] });
        return;
      }

      const body = await res.text();
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

      this.#emitter.emit("visited", {
        url,
        status: res.status,
        urls: dedupedToCrawl,
      });

      this.#crawlUrls(dedupedToCrawl, opts);
    });
  }

  #crawlUrls(
    urls: string[],
    opts: {
      abortSignal: AbortSignal;
    },
  ) {
    for (const url of urls) {
      this.#crawlUrl(url, {
        abortSignal: opts.abortSignal,
      });
    }
  }
}

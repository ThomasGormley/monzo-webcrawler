import { load } from "cheerio/slim";
import { JobProcessor } from "./job-processor";

type CrawlerOptions = {
  timeoutMs?: number;
  abortController?: AbortController;
};

const defaultCrawlerOptions = {
  timeoutMs: 5000,
  abortController: new AbortController(),
} satisfies CrawlerOptions;

export class Crawler {
  visited = new Set<string>();
  #processor = new JobProcessor();
  #timedout = false;
  #options = defaultCrawlerOptions satisfies CrawlerOptions;

  constructor(opts: CrawlerOptions = {}) {
    this.#options = {
      ...defaultCrawlerOptions,
      abortController: new AbortController(),
      ...opts,
    } satisfies CrawlerOptions;
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
    const shouldCrawl = !this.visited.has(url);

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

      this.visited.add(url);

      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("text/html")) {
        return;
      }

      const resUrl = new URL(res.url);

      const isSameDomain = resUrl.host === reqUrl.host;
      if (!isSameDomain) {
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

      console.log(`${url}`);

      for (const u of dedupedToCrawl) {
        console.log(` - ${u}`);
      }

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

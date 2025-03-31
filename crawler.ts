import { load } from "cheerio/slim";
import { JobProcessor } from "./job-processor";

export class Crawler {
  visited = new Set<string>();
  #processor = new JobProcessor();

  constructor() {}

  crawl(url: string) {
    this.#processor.process();
    this.#crawlUrl(url);
  }

  stop() {
    this.#processor.stop();
  }

  crawling() {
    return this.#processor.queueSize() > 0;
  }

  #crawlUrl(url: string) {
    console.log("crawling: " + url);
    const shouldCrawl = !this.visited.has(url);

    if (!shouldCrawl) {
      return;
    }

    this.#processor.enqueue(async () => {
      const reqUrl = new URL(url);
      const res = await fetch(url, {
        headers: { "user-agent": "Mz-Webcrawler/1.0 (testing)" },
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
          return;
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

      this.#crawlUrls(dedupedToCrawl);
    });
  }

  #crawlUrls(urls: string[]) {
    for (const url of urls) {
      this.#crawlUrl(url);
    }
  }
}

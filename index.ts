export class Crawler {
  visited = new Set<string>();
  #maxConcurrent: number = 5;

  constructor() {}

  async crawl(url: string) {
    return this.#crawlUrl(url);
  }

  async #crawlUrl(url: string) {
    const shouldCrawl = !this.visited.has(url);

    if (!shouldCrawl) {
      return;
    }

    const reqUrl = new URL(url);
    const res = await fetch(url, {
      headers: { "user-agent": "Mz-Webcrawler/1.0 (testing)" },
    });

    this.visited.add(url);

    const body = res.text();

    return body;
  }
}

async function main() {
  const args = Bun.argv;

  const url = args[2];

  const crawler = new Crawler();

  const body = await crawler.crawl(url);
  console.log({ body });
}

main();

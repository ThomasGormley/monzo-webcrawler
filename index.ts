import { Crawler } from "./crawler";

async function main() {
  const args = Bun.argv;

  const url = args[2];
  if (!url) {
    return;
  }
  const crawler = new Crawler({
    onVisited: ({ url, urls }) => {
      console.log(`- ${url}`);
      for (const u of urls) {
        console.log(` - ${u}`);
      }
    },
  });

  crawler.crawl(url);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

main();

// TODO
// 1. Depth limit
// 2. Rate limiting
// 3. error handling
// 4. CLI

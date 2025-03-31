import { Crawler } from "./crawler";

async function main() {
  const args = Bun.argv;

  const url = args[2];
  if (!url) {
    return;
  }
  const crawler = new Crawler();

  const body = await crawler.crawl(url);
  console.log({ body });
}

main();

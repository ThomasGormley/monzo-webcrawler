# monzo-webcrawler

## Task

We'd like you to write a simple web crawler in a programming language you're familiar with. Given a starting URL, the crawler should visit each URL it finds on the same domain. It should print each URL visited, and a list of links found on that page. The crawler should be limited to one subdomain - so when you start with *https://monzo.com/*, it would crawl all pages on the monzo.com website, but not follow external links, for example to facebook.com or community.monzo.com.

Ideally, write it as you would a production piece of code. This exercise is not meant to show us whether you can write code – we are more interested in how you design software. This means that we care less about a fancy UI or sitemap format, and more about how your program is structured: the trade-offs you've made, what behaviour the program exhibits, and your use of concurrency, test coverage, and so on.

## Getting Started

This project uses the [Bun](https://bun.sh) runtime. It is required for building and development.

### To build the `crawl` executable:

```bash
bun run build
```

This will build an executable at `./bin/crawl` that can be used to run the web crawler

### To install dependencies:

```bash
bun install
```

### To develop:

```bash
bun run dev
```

This will build an executable at `./bin/crawl-dev` that can be used to run the web crawler during development. The `dev` script will watch the filesystem for changes, and rebuild on save

## Usage

Use `crawl --help` for full CLI help.

**Example**

```bash
crawl --concurrency 5 --maxRequestsPerSecond 10 --followDepth 3 --timeout 5000 https://example.com
```

## Limitations

- Websites that rely on JavaScript for content rendering cannot be crawled, as the CLI requires the HTML DOM to be fully available on initial load.
- Does not respect robots.txt
- Does not respect `Retry-After` HTTP response header
- Crawler state is not persisted

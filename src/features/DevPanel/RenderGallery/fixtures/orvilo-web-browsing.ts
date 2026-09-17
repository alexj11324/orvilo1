'use client';

import { defineFixtures, single, variants } from './_helpers';

export default defineFixtures({
  identifier: 'orvilo-web-browsing',
  fixtures: {
    crawlMultiPages: single({
      args: {
        urls: ['https://orvilo.aspectlylabs.com', 'https://docs.aspectlylabs.com'],
      },
      pluginState: {
        results: [
          {
            crawler: 'firecrawl',
            data: {
              content: 'Orvilo ships desktop and web experiences for AI collaboration.',
              description: 'Product homepage',
              title: 'Orvilo',
              url: 'https://orvilo.aspectlylabs.com',
            },
            originalUrl: 'https://orvilo.aspectlylabs.com',
          },
          {
            crawler: 'firecrawl',
            data: {
              content: 'Developer documentation for routing, tooling, and local testing.',
              description: 'Docs homepage',
              title: 'Orvilo Docs',
              url: 'https://docs.aspectlylabs.com',
            },
            originalUrl: 'https://docs.aspectlylabs.com',
          },
        ],
      },
    }),
    crawlSinglePage: single({
      args: { url: 'https://orvilo.aspectlylabs.com/blog' },
      pluginState: {
        results: [
          {
            crawler: 'firecrawl',
            data: {
              content: 'Recent product updates and engineering notes.',
              description: 'Blog landing page',
              title: 'Orvilo Blog',
              url: 'https://orvilo.aspectlylabs.com/blog',
            },
            originalUrl: 'https://orvilo.aspectlylabs.com/blog',
          },
        ],
      },
    }),
    search: variants([
      {
        args: {
          query: 'Orvilo devtools preview route',
          searchEngines: ['google', 'bing'],
        },
        label: 'With results',
        pluginState: {
          query: 'Orvilo devtools preview route',
          results: [
            {
              content: 'Documentation and implementation notes about local preview tooling.',
              engines: ['google'],
              title: 'Preview tooling guide',
              url: 'https://docs.example.com/preview-tooling',
            },
            {
              content: 'Issue thread describing the /devtools route rollout.',
              engines: ['bing'],
              title: 'Builtin render devtools issue',
              url: 'https://linear.example.com/issue/',
            },
          ],
        },
      },
      {
        args: {
          query: 'undocumented internal preview snapshot harness',
          searchEngines: ['google'],
        },
        label: 'No results',
        pluginState: {
          query: 'undocumented internal preview snapshot harness',
          results: [],
        },
      },
    ]),
  },
});

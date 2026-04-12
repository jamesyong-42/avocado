import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Avocado',
  description: 'Terminal session sync for the web stack — one session model, pluggable transports',
  base: '/avocado/',
  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['link', { rel: 'icon', href: '/avocado/favicon.ico' }],
  ],

  themeConfig: {
    siteTitle: 'Avocado',

    nav: [
      { text: 'Guide',   link: '/guide/introduction' },
      { text: 'API',     link: '/api/sdk' },
      { text: 'GitHub',  link: 'https://github.com/jamesyong-42/avocado' },
      { text: 'npm',     link: 'https://www.npmjs.com/package/@vibecook/avocado-sdk' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction',     link: '/guide/introduction' },
            { text: 'Install',          link: '/guide/install' },
            { text: 'Quick Start',      link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Concepts',
          items: [
            { text: 'Sessions & Transports', link: '/guide/concepts' },
            { text: 'Local PTY',             link: '/guide/local-pty' },
            { text: 'IPC Transport',         link: '/guide/transport-ipc' },
            { text: 'Mesh (Truffle)',        link: '/guide/transport-truffle' },
          ],
        },
        {
          text: 'React',
          items: [
            { text: 'AvocadoProvider',  link: '/guide/react-provider' },
            { text: 'Terminal Grid',    link: '/guide/react-grid' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Reference',
          items: [
            { text: 'SDK',                    link: '/api/sdk' },
            { text: 'Types',                  link: '/api/types' },
            { text: 'Node PTY',               link: '/api/node-pty' },
            { text: 'Transport IPC',          link: '/api/transport-ipc' },
            { text: 'Transport Truffle',      link: '/api/transport-truffle' },
            { text: 'React',                  link: '/api/react' },
            { text: 'CLI (`avo`)',            link: '/api/cli' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/jamesyong-42/avocado' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 James Yong',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/jamesyong-42/avocado/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});

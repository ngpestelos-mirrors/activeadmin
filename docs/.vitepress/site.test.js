import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { URL, fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { generateLegacyRedirects } from './redirects.js'

const dist = fileURLToPath(new URL('./dist/', import.meta.url))
const read = (path) => readFileSync(join(dist, path), 'utf8')

test('every archived v3 page has a legacy redirect that preserves queries and anchors', () => {
  const pages = readdirSync(join(dist, 'docs/v3'), { recursive: true }).filter((path) => path.endsWith('.html'))
  for (const file of pages) {
    const path = file.replace(/\.html$/, '')
    const html = read(`${path}.html`)
    const destination = path === 'index' ? '/docs/v3/' : `/docs/v3/${path}.html`
    assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${destination}">`))
    assert.ok(html.includes(`<a href="${destination}">`))
    assert.ok(html.includes(`href="https://activeadmin.info${destination}"`))
    assert.ok(existsSync(join(dist, destination, path === 'index' ? 'index.html' : '')))

    let redirected
    runInNewContext(html.match(/<script>(.*?)<\/script>/s)[1], {
      window: { location: {
        search: '?from=old-link',
        hash: '#index-filters',
        replace: (url) => { redirected = url },
      } },
    })
    assert.equal(redirected, `${destination}?from=old-link#index-filters`)
  }
})

test('legacy redirects exist for archived pages even when v4 has no corresponding page', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'activeadmin-redirects-'))
  try {
    const page = 'v3/3-index-pages/index-as-grid.md'
    await generateLegacyRedirects({
      outDir,
      pages: ['index.md', page],
      rewrites: { map: { 'index.md': 'docs/index.md', [page]: `docs/${page}` } },
    })
    const html = await readFile(join(outDir, '3-index-pages/index-as-grid.html'), 'utf8')
    assert.ok(html.includes('content="0; url=/docs/v3/3-index-pages/index-as-grid.html"'))
    assert.ok(!existsSync(join(outDir, 'index.html')), 'A v4-only page must not create a legacy redirect')
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('versions switch to the corresponding page and keep their own sidebar', () => {
  const current = read('docs/5-forms.html')
  const legacy = read('docs/v3/5-forms.html')
  assert.ok(current.includes('href="/docs/v3/5-forms.html"'))
  assert.ok(legacy.includes('href="/docs/5-forms.html"'))
  assert.ok(current.includes('Documentation version'))
  assert.ok(current.includes('href="/docs/0-installation.html"'))
  assert.ok(legacy.includes('href="/docs/v3/0-installation.html"'))
  assert.ok(legacy.includes('href="/docs/v3/3-index-pages/index-as-grid.html"'))
  assert.ok(!current.includes('href="/docs/3-index-pages/index-as-grid.html"'))
})

test('every published docs link and asset exists in the deployment artifact', () => {
  for (const path of readdirSync(join(dist, 'docs'), { recursive: true }).filter((path) => path.endsWith('.html'))) {
    const page = new URL(`docs/${path}`, 'https://activeadmin.info/')
    for (const [, href] of read(`docs/${path}`).matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (!href || href.startsWith('#')) continue
      const url = new URL(href, page)
      if (url.origin !== page.origin) continue
      const file = decodeURIComponent(url.pathname).replace(/\/$/, '/index.html')
      assert.ok(existsSync(join(dist, file)), `${page.pathname}: missing ${href}`)
    }
  }
})

test('edit links point to Markdown sources and the upgrade guide is included', () => {
  for (const path of ['5-forms', 'v3/5-forms']) {
    assert.ok(read(`docs/${path}.html`).includes(`https://github.com/activeadmin/activeadmin/edit/master/docs/${path}.md`))
  }
  assert.ok(read('docs/upgrading.html').includes('Breaking Changes'))
})

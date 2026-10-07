import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { URL, fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const dist = fileURLToPath(new URL('./dist/', import.meta.url))
const read = (path) => readFileSync(join(dist, path), 'utf8')

test('legacy root URLs redirect to real docs pages and preserve queries and anchors', () => {
  for (const path of ['index', '3-index-pages', '3-index-pages/index-as-table', '3-index-pages/index-as-grid', 'documentation']) {
    const html = read(`${path}.html`)
    const destination = path === 'index' ? '/docs/' : `/docs/${path}.html`
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

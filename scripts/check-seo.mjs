import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

const origin = 'https://adorbs.fun';
const routes = [
  ['index.html', '/', false],
  ['slack-backup/index.html', '/slack-backup/', false],
  ['lab/tag-cloud/index.html', '/lab/tag-cloud/', true],
];
const descriptions = new Set();
for (const [file, path, noindex] of routes) {
  const { document } = new JSDOM(await readFile(`dist/${file}`, 'utf8')).window;
  const meta = name => document.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.content;
  assert.ok(document.title.includes('Adorbs.fun'), `${path}: branded title`);
  assert.ok(meta('description')?.length > 0, `${path}: useful description`);
  assert.ok(!descriptions.has(meta('description')), `${path}: unique description`);
  descriptions.add(meta('description'));
  assert.equal(document.querySelector('link[rel="canonical"]')?.href, origin + path);
  assert.equal(meta('og:url'), origin + path);
  assert.equal(meta('og:site_name'), 'Adorbs.fun');
  assert.equal(meta('og:image'), `${origin}/social-card.png`);
  assert.equal(meta('twitter:image'), meta('og:image'));
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('robots').includes('noindex'), noindex);
  const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
  assert.ok(graph.some(node => node['@type'] === 'WebPage' && node.url === origin + path));
  if (path === '/') {
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(graph.find(node => node['@type'] === 'WebSite').name, 'Adorbs.fun');
    const questions = graph.find(node => node['@type'] === 'FAQPage').mainEntity;
    const visible = [...document.querySelectorAll('.collection-answers details')];
    assert.equal(questions.length, visible.length);
    questions.forEach((question, index) => {
      assert.equal(question.name, visible[index].querySelector('summary').textContent);
      assert.equal(question.acceptedAnswer.text, visible[index].querySelector('p').textContent);
    });
    assert.ok(document.querySelectorAll('[role="gridcell"] img').length > 100, 'SSR catalog images remain crawlable');
  }
  if (path === '/slack-backup/') {
    assert.equal(document.querySelectorAll('main').length, 1);
    assert.equal(document.querySelectorAll('h1').length, 1);
  }
  console.log(`SEO validated: ${path}`);
}
const xml = new JSDOM(await readFile('dist/sitemap.xml', 'utf8'), { contentType: 'text/xml' }).window.document;
assert.deepEqual([...xml.querySelectorAll('loc')].map(node => node.textContent), [origin + '/', origin + '/slack-backup/']);
assert.match(await readFile('dist/robots.txt', 'utf8'), /Sitemap: https:\/\/adorbs\.fun\/sitemap\.xml/);
const card = await sharp('dist/social-card.png').metadata();
assert.equal(card.width, 1200);
assert.equal(card.height, 630);
console.log('SEO validated: sitemap, robots, and 1200×630 social image');

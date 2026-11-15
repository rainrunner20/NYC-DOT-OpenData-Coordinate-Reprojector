const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

test('health and file uploads respond predictably', async () => {
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    const health = await fetch(origin + '/health');
    assert.equal(health.status, 200);
    const details = await health.json();
    assert.deepEqual(details.formats, ['csv', 'xlsx']);

    const bad = new FormData();
    bad.append('file', new Blob(['not supported']), 'input.txt');
    assert.equal((await fetch(origin + '/upload', { method: 'POST', body: bad })).status, 400);

    const input = new FormData();
    input.append('file', new Blob(['latitude,longitude,name\n40.7484,-73.9857,Midtown\n']), 'sample.csv');
    const result = await fetch(origin + '/upload', { method: 'POST', body: input });
    assert.equal(result.status, 200);
    const body = await result.text();
    assert.match(body, /x_epsg2263_ft,y_epsg2263_ft/);
    assert.match(body, /Midtown/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

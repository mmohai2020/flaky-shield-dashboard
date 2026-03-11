const http = require('http');
// ID extracted from registry
const id = "Demo-Client:D:\\flaky-test-dashboard\\tests\\healing-demo.spec.ts:Demo: Broken Selector:8";
const path = `/api/heal/${encodeURIComponent(id)}`;

console.log(`Triggering POST to http://localhost:3001${path}`);

const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
}, res => {
    console.log(`StatusCode: ${res.statusCode}`);
    res.on('data', d => process.stdout.write(d));
});

req.on('error', e => console.error('Request Error:', e));
req.write(JSON.stringify({ reason: 'Agent Triggered Manual Heal' }));
req.end();

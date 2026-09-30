import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Advisory,JobOutcome} from '../app/workbook/review';
test('review advisory strings escape HTML and keep markdown as literal text',()=>{
 const html=renderToStaticMarkup(createElement(Advisory,{text:'<img src=x onerror=alert(1)> [click](https://example.com)'}));
 assert.ok(html.includes('&lt;img'));assert.ok(html.includes('[click](https://example.com)'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<a'));
});

test('stored job advisory column names reach escaped rendered review text',()=>{
 const row={id:'synthetic-job',status:'complete',drop_counts:{unsupported_field:2},advisory_unknowns:['Currency unknown <img src=x onerror=alert(1)>'],advisory_conflicts:['Two deadlines [details](https://example.com)']};
 const html=renderToStaticMarkup(createElement(JobOutcome,{job:row}));assert.ok(html.includes('2 terms not recognised'));assert.ok(html.includes('Currency unknown &lt;img'));assert.ok(html.includes('Two deadlines [details](https://example.com)'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<a'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Advisory} from '../app/workbook/review';
test('review advisory strings escape HTML and keep markdown as literal text',()=>{
 const html=renderToStaticMarkup(createElement(Advisory,{text:'<img src=x onerror=alert(1)> [click](https://example.com)'}));
 assert.ok(html.includes('&lt;img'));assert.ok(html.includes('[click](https://example.com)'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<a'));
});

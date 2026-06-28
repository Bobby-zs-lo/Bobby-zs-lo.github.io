import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureText, GLYPHS } from '../js/pixelfont.js';

test('glyphs are 7 rows of 5 cols', () => {
  for (const k of Object.keys(GLYPHS)){
    assert.equal(GLYPHS[k].length, 7, `glyph ${k} rows`);
    for (const row of GLYPHS[k]) assert.equal(row.length, 5, `glyph ${k} cols`);
  }
});

test('measureText accounts for spacing and scale', () => {
  // each char = 5px + 1px gap; last char no trailing gap; scaled
  assert.equal(measureText('12', 1), 5 + 1 + 5);      // 11
  assert.equal(measureText('1', 3), 15);
  assert.equal(measureText('12:34', 2), (5*5 + 4*1) * 2); // 58
});

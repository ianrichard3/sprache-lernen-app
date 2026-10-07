import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync('App.html', 'utf8');
const start = html.indexOf('  function phrasesToText(items) {');
const end = html.indexOf('\n\n  function fallbackCopyText', start);

assert.notEqual(start, -1, 'phrasesToText is missing');
assert.notEqual(end, -1, 'phrasesToText boundary is missing');

const phrasesToText = Function(html.slice(start, end) + '\nreturn phrasesToText;')();
const sessionStart = html.indexOf('  function sessionToSsmlText_(items, reps, pause) {');

assert.notEqual(sessionStart, -1, 'sessionToSsmlText_ is missing');

const escapeSource = html.slice(html.indexOf('  function esc(text)'), html.indexOf('  function say('));
const sessionToSsmlText = Function(escapeSource + html.slice(sessionStart, end) + '\nreturn sessionToSsmlText_;')();

const originalRandom = Math.random;
Math.random = () => 0.99;
assert.equal(
  phrasesToText([{ de: 'Guten Morgen' }, { de: 'Wie geht es?' }]),
  'Guten Morgen.\n\nWie geht es?'
);
assert.equal(phrasesToText([{ de: ' Hör\nbitte zu! ' }, { de: '   ' }]), 'Hör bitte zu!');

Math.random = () => 0;
const phrases = [{ de: 'Uno' }, { de: 'Dos' }, { de: 'Tres' }];
assert.equal(phrasesToText(phrases), 'Dos.\n\nTres.\n\nUno.');
assert.deepEqual(phrases, [{ de: 'Uno' }, { de: 'Dos' }, { de: 'Tres' }]);
Math.random = originalRandom;

assert.equal(
  sessionToSsmlText([{ de: 'Ich bin Ian' }], 3, 3000),
  'Ich bin Ian\n\n<break time="3s" />\n\nIch bin Ian\n\n<break time="3s" />\n\nIch bin Ian\n\n<break time="3s" />'
);
assert.equal(
  sessionToSsmlText([{ de: 'Erste' }, { de: 'Zweite' }], 1, 5000),
  'Erste\n\n<break time="5s" />\n\nZweite\n\n<break time="5s" />'
);
assert.equal(sessionToSsmlText([{de:'Brot & Butter < 5 "Euro"'}], 1, 1000), 'Brot &amp; Butter &lt; 5 &quot;Euro&quot;\n\n<break time="1s" />');
assert.equal(phrasesToText([{de:'Brot & Butter < 5 "Euro"'}]), 'Brot & Butter < 5 "Euro".', 'Plain text copy stays plain text');
assert.match(html, /ssmlOptionsHtml_\(\[1000, 2000, 3000, 5000\], state\.ssmlSettings\.pause, ' s'\)/);
assert.ok(html.includes('data-act="copy-session-ssml"'));

const settingsSource = html.slice(html.indexOf('  function ssmlSettings_()'), html.indexOf('  function shuffledItems_('));
const settings = storage => Function('localStorage', settingsSource + '\nreturn ssmlSettings_();')(storage);
assert.deepEqual(settings({getItem: key => key === 'sprache-lernen-player-settings' ? '{"pause":3000,"reps":4,"rate":1.25}' : null}), {pause:3000, reps:4});
assert.deepEqual(settings({getItem: () => '{"pause":0,"reps":9}'}), {pause:1000, reps:1});
assert.deepEqual(settings({getItem: () => 'invalid JSON'}), {pause:1000, reps:1});

console.log('Copied phrase formatting: OK');

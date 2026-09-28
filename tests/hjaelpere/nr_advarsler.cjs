// Henter nrAdvarsler() direkte fra site/dashboard.html, så enhedstestene altid tester den kode, der udgives.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'dashboard.html'), 'utf8');
const a = html.indexOf('const NR_AFVIG');
const b = html.indexOf('\n}\n', html.indexOf('function nrAdvarsler')) + 3;
if (a < 0 || b < 3) throw new Error('nrAdvarsler blev ikke fundet i site/dashboard.html');
module.exports = new Function(html.slice(a, b) + '\nreturn nrAdvarsler;')();

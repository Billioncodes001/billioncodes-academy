// Read-only discovery. Metadata is not proof of redistribution rights.
const query = (process.argv[2] || '').toLowerCase().slice(0,100);
const url = 'https://open.umn.edu/opentextbooks/subjects/3.json';
const rows = [], visited = new Set();
let next = url, totalCharacters = 0;
while (next && visited.size < 20) {
  const target = new URL(next);
  if (target.origin !== 'https://open.umn.edu' || target.pathname !== '/opentextbooks/subjects/3.json' || visited.has(next)) throw new Error('Unexpected provider pagination address.');
  visited.add(next);
  const response = await fetch(next,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if (!response.ok) throw new Error(`Open Textbook Library returned ${response.status}`);
  const text = await response.text(); totalCharacters += text.length;
  if (totalCharacters > 5_000_000) throw new Error('Discovery response exceeded the review budget.');
  const page = JSON.parse(text);
  if (!Array.isArray(page.data)) throw new Error('The provider schema changed. Review before importing.');
  rows.push(...page.data);
  next = page.links?.next || null;
}
const candidates = rows.filter(row => ['Attribution','Attribution-ShareAlike','CC0'].includes(row.license))
  .filter(row => String(row.title).toLowerCase().includes(query)).slice(0,20)
  .map(row => ({title:row.title,catalogue:`https://open.umn.edu/opentextbooks/textbooks/${row.id}`,licenceReportedByCatalogue:row.license,
    formats:(row.formats || []).filter(format => typeof format.url === 'string' && format.url.startsWith('https://')).map(format => ({type:format.type,url:format.url})),
    status:'Review original edition, exceptions, attribution and licence before downloading or publishing.'}));
console.log(JSON.stringify({source:url,checkedAt:new Date().toISOString(),pages:visited.size,partial:!!next,automaticImport:false,candidates},null,2));

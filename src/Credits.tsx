const photos = [
  { image: 'hero-learner', name: 'Learner photograph', by: 'Christina @ wocintechchat.com', url: 'https://unsplash.com/photos/woman-using-laptop-YPcnjFweo40' },
  { image: 'learning-together', name: 'Collaboration photograph', by: 'Christina @ wocintechchat.com', url: 'https://unsplash.com/photos/three-women-sitting-beside-wooden-table-c6wbSBaYxkY' },
  { image: 'code-detail', name: 'Code and workspace photograph', by: 'Christopher Gower', url: 'https://unsplash.com/photos/a-macbook-with-lines-of-code-on-its-screen-on-a-busy-desk-m_HRfLhgABo' },
];
export function Credits() {
  return <div className="wrap page-section"><div className="page-heading"><p className="eyebrow">THE PEOPLE BEHIND THE PICTURES</p><h1>Made with care.<br />Credited with respect.</h1><p>Our learner and collaboration photographs are illustrative stock. They do not depict Billion Codes students, staff, events or testimonials.</p></div><div className="credits-grid">{photos.map(photo => <article key={photo.image}><img src={`/images/${photo.image}.webp`} alt={photo.name} width="600" height="400" loading="lazy" /><h2>{photo.name}</h2><p>Photo by {photo.by} on Unsplash.</p><a href={photo.url} target="_blank" rel="noreferrer">View original photograph <span className="sr-only">(opens in a new tab)</span></a></article>)}</div><div className="catalog-tail"><p>Used under the <a href="https://unsplash.com/license" target="_blank" rel="noreferrer">Unsplash License</a>. The founder portrait is owner-provided. Billion Codes branding and course illustrations are original designs.</p></div></div>;
}

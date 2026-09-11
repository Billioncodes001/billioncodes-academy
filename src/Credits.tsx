const photos = [
  { image: 'hero-learner', name: 'A moment of focus', description: 'An imagined learner finding her next line of code.', alt: 'AI-generated scene of a woman focused on a laptop' },
  { image: 'learning-together', name: 'Better, together', description: 'An imagined study session, built around shared curiosity.', alt: 'AI-generated scene of three adults learning together at a laptop' },
  { image: 'code-detail', name: 'Room for an idea', description: 'An imagined coding desk, ready for a small beginning.', alt: 'AI-generated coding workspace with a laptop and notebook' },
];
export function Credits() {
  return <div className="wrap page-section">
    <div className="page-heading"><p className="eyebrow">BEHIND THE VISUALS</p><h1>Imagined with purpose.<br />Made for Billion Codes.</h1><p>Our learning scenes are AI-generated illustrations, created for this site. The people and settings are fictional, not actual students, staff, events or testimonials.</p></div>
    <div className="credits-grid">{photos.map(photo => <article key={photo.image}><img src={`/images/${photo.image}.webp`} alt={photo.alt} width="600" height="400" loading="lazy" /><h2>{photo.name}</h2><p>{photo.description}</p><span className="eyebrow">AI-GENERATED SCENE</span></article>)}</div>
    <div className="catalog-tail"><p>The founder portrait is a real, owner-provided photograph of Josiah Adeyemo and has not been replaced by AI. Billion Codes branding and course illustrations are original vector designs.</p></div>
  </div>;
}

import type { Course } from './api';

// Original launch lesson bundled with the site, not a substitute API response.
export const intro: Course = {
  id: 'first-web-page',
  title: 'Your first web page',
  level: 'Beginner',
  format: 'Text introduction',
  summary: 'Understand what HTML does, give your content a clear structure, and choose the right element for the job.',
  lessons: [
    {
      id: 'structure-before-style',
      title: 'Structure before style',
      body: [
        'A web page begins with meaning. Before choosing colours or animations, decide what the page is for and what someone should be able to do. For a school page, that might be reading an introduction and finding a link to a lesson.',
        'HTML describes the structure of that content. An element usually has an opening tag, some content, and a closing tag. In <h1>My first project</h1>, h1 identifies the main heading. The browser uses that structure to display the page, and assistive technology uses it to help people navigate.',
        'Use one clear main heading for this simple page, paragraphs for explanations, and a main element around the primary content. Headings should describe their sections; do not choose a heading level just to make text larger. CSS is the separate language that controls appearance.',
        'An anchor, such as <a href="/lessons">Read a lesson</a>, takes someone to a destination. A button performs an action, such as checking an answer or opening a menu. These elements have built-in keyboard behaviour. A clickable div does not provide the same meaning or behaviour on its own.',
        'Read the small example below from the outside in: main contains the page content, h1 names it, p explains it, and a provides a next step. This is displayed as text, not executed code. You do not need an editor to complete this introduction.',
      ],
    },
    {
      id: 'make-a-page-usable',
      title: 'Make a page usable',
      body: [
        'A page is not finished when it looks right on your own screen. Someone may use a small phone, zoom in, navigate with a keyboard, or listen with a screen reader. Clear structure is the starting point, not the entire accessibility check.',
        'Write links that explain their destination. "Read the HTML introduction" gives more information than "Click here". Give every form input a visible label. Placeholder text disappears when someone types and is not a replacement for a label.',
        'Use flexible layouts instead of assuming a fixed screen width. Long text should wrap, controls should be easy to tap, and important information should not depend only on colour. When testing a page, try navigating it with Tab and activating links with Enter.',
        'A useful first project is a one-page reading list: a main heading, a short explanation, and three descriptive links. First sketch the content on paper. Then write the HTML. Only after the structure is clear should you add styles. This separates two different problems and makes mistakes easier to find.',
        'Your next step is to explain your choices: which content is a heading, which content is a paragraph, and which elements lead to another destination? Being able to explain a small working page is more valuable than copying a complicated one you do not yet understand.',
      ],
    },
  ],
};

import { primer, challenges } from "@billioncodes/learning";
import { catalog } from "./catalog.js";

// Search and AI-crawler support. Every page address gets its own title, description,
// canonical URL and structured data, injected into the app shell by the Worker. Free public
// lesson text is included in <noscript> for crawlers that do not run JavaScript. Course
// Studio lesson text stays private to enrolled learners: only titles and summaries appear.

export const SITE = "https://learnatbillioncodes.com";
const NAME = "Billion Codes";
const LOGO = `${SITE}/brand/billioncodes-official-v1.jpeg`;
const IMAGE = `${SITE}/brand/debug-defender-share-v1.jpg`;

const escape = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
// Data blocks are not executed, but "</script" must never close the element early.
const ldJson = data => JSON.stringify(data).replace(/</g, "\\u003c");
const provider = { "@type": "Organization", name: NAME, url: SITE };

const freeCourses = () => [primer, ...catalog.courses];
const organization = { "@context": "https://schema.org", "@type": "EducationalOrganization", name: NAME, url: SITE, logo: LOGO, slogan: "Learn. Build. Grow.", description: "Free introductory coding lessons, hands-on HTML practice, training and expert software help." };

function courseLd(course, url, free) {
  return { "@context": "https://schema.org", "@type": "Course", name: course.title, description: course.summary, url, provider, inLanguage: "en", educationalLevel: course.level || "Beginner", isAccessibleForFree: free,
    ...(free ? { offers: { "@type": "Offer", price: 0, priceCurrency: "NGN", category: "Free" } } : {}),
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", courseWorkload: `PT${Math.max(1, course.lessons?.length || 1) * 10}M` } };
}
const practiceLd = (item, url) => ({ "@context": "https://schema.org", "@type": "LearningResource", name: item.title, description: item.brief, url, provider, learningResourceType: "Exercise", educationalLevel: "Beginner", teaches: "HTML", inLanguage: "en", isAccessibleForFree: true, timeRequired: `PT${item.minutes}M` });
const list = (name, items) => ({ "@context": "https://schema.org", "@type": "ItemList", name, itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, url: item.url, name: item.name })) });

const lessonText = course => course.lessons.map(lesson => `<section><h2>${escape(lesson.title)}</h2>${(lesson.body || []).map(text => `<p>${escape(text)}</p>`).join("")}</section>`).join("");
const links = items => `<ul>${items.map(item => `<li><a href="${escape(item.url.replace(SITE, ""))}">${escape(item.name)}</a></li>`).join("")}</ul>`;

const PAGES = {
  "/": { title: `${NAME} | Learn to code. Build real projects.`, description: "Start free: short coding introductions, hands-on HTML practice with instant feedback, training applications and expert software help from Billion Codes." },
  "/training": { title: `Apply for training | ${NAME}`, description: "Tell Billion Codes what you want to learn and where you are starting. Training is by application; dates, availability and any fees are agreed separately." },
  "/services": { title: `Software and mentorship enquiries | ${NAME}`, description: "Bring a software idea, a project you are stuck on, or code you want reviewed. Start with the problem, not a feature list." },
  "/about": { title: `About Billion Codes and Josiah Adeyemo`, description: "Billion Codes brings practical software learning and development support together, founded by software engineer Josiah Adeyemo." },
  "/policies": { title: `Privacy and launch terms | ${NAME}`, description: "Plain-language privacy notice and launch terms: what is stored, why, anonymous learning statistics and how to ask for deletion." },
  "/resources": { title: `Open learning resources | ${NAME}`, description: "Hand-picked, openly licensed resources for learning web development, linked to their original publishers." },
  "/credits": { title: `About the imagery | ${NAME}`, description: "How the images on Billion Codes were made, including which are AI-generated." },
  "/workspace": { title: `Your learning desk | ${NAME}`, description: "Your reading record, practice drafts and offline download, stored on your own device." },
};
const PRIVATE = /^\/(account|library|training-dashboard|apply\/[^/]+)$/;

// Returns head and noscript content for a page address, or null for an unknown address (404).
export async function seoFor(path, publishedCourses = async () => []) {
  const url = `${SITE}${path === "/" ? "/" : path}`;
  if (PRIVATE.test(path)) return { title: `${NAME}`, description: PAGES["/"].description, url, robots: "noindex, nofollow", ld: [], body: "" };
  if (PAGES[path]) {
    const ld = path === "/" ? [organization, { "@context": "https://schema.org", "@type": "WebSite", name: NAME, url: SITE }] : [];
    const start = path === "/" ? `<h2>Start here</h2>${links([{ url: `${SITE}/learn/first-web-page`, name: "Your first web page (free)" }, { url: `${SITE}/practice`, name: "The practice lab" }, { url: `${SITE}/courses`, name: "All free introductions" }, { url: `${SITE}/training`, name: "Training and expert help" }])}` : "";
    return { ...PAGES[path], url, ld, body: `<h1>${escape(PAGES[path].title)}</h1><p>${escape(PAGES[path].description)}</p>${start}` };
  }
  if (path === "/courses" || path === "/course-library") {
    const items = [...freeCourses().map(course => ({ url: `${SITE}/learn/${course.id}`, name: course.title })), ...(await publishedCourses()).map(course => ({ url: `${SITE}/course/${course.id}`, name: course.title }))];
    return { title: `Free coding introductions | ${NAME}`, description: "Short, free introductions to HTML and web development, written for complete beginners. Read online, then practise.", url: `${SITE}/courses`, ld: [list("Billion Codes courses", items)], body: `<h1>Free coding introductions</h1>${links(items)}` };
  }
  const learn = /^\/learn\/([a-z0-9-]+)$/.exec(path);
  if (learn) {
    const course = freeCourses().find(item => item.id === learn[1]);
    if (!course) return null;
    return { title: `${course.title} | Free introduction | ${NAME}`, description: course.summary, url, ld: [courseLd(course, url, true)], body: `<h1>${escape(course.title)}</h1><p>${escape(course.summary)}</p>${lessonText(course)}` };
  }
  const studio = /^\/course\/([a-z0-9-]+)$/.exec(path);
  if (studio) {
    const free = freeCourses().find(item => item.id === studio[1]);
    const course = free || (await publishedCourses()).find(item => item.id === studio[1]);
    if (!course) return null;
    const titles = (course.lessons || []).map(lesson => `<li>${escape(lesson.title)}</li>`).join("");
    return { title: `${course.title} | ${NAME}`, description: course.summary, url, ld: [courseLd(course, url, course.priceMinor === 0 || !!free)], body: `<h1>${escape(course.title)}</h1><p>${escape(course.summary)}</p>${titles ? `<h2>Lessons</h2><ol>${titles}</ol>` : ""}` };
  }
  if (path === "/practice") {
    const items = challenges.map(item => ({ url: `${SITE}/practice/${item.id}`, name: item.title }));
    return { title: `HTML practice lab | ${NAME}`, description: "Four small HTML builds with instant feedback as you type. Free, in your browser, no account needed.", url, ld: [list("HTML practice builds", items)], body: `<h1>HTML practice lab</h1>${links(items)}` };
  }
  const build = /^\/practice\/([a-z0-9-]+)$/.exec(path);
  if (build) {
    const item = challenges.find(challenge => challenge.id === build[1]);
    if (!item) return null;
    return { title: `${item.title} | HTML practice | ${NAME}`, description: item.brief, url, ld: [practiceLd(item, url)], body: `<h1>${escape(item.title)}</h1><p>${escape(item.brief)}</p><h2>Goals</h2><ul>${item.goals.map(goal => `<li>${escape(goal)}</li>`).join("")}</ul>` };
  }
  return null;
}

// Rewrites the app shell's head and noscript fallback for one page.
export function injectSeo(html, seo) {
  const head = [
    `<title>${escape(seo.title)}</title>`,
    `<meta name="description" content="${escape(seo.description)}" />`,
    `<link rel="canonical" href="${escape(seo.url)}" />`,
    `<meta property="og:title" content="${escape(seo.title)}" />`,
    `<meta property="og:description" content="${escape(seo.description)}" />`,
    `<meta property="og:url" content="${escape(seo.url)}" />`,
    `<meta property="og:image" content="${IMAGE}" />`,
    ...(seo.robots ? [`<meta name="robots" content="${seo.robots}" />`] : []),
    ...seo.ld.map(data => `<script type="application/ld+json">${ldJson(data)}</script>`),
  ].join("\n    ");
  let out = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "")
    .replace(/<meta\s+property="og:(title|description|url|image)"[^>]*>\s*/gi, "");
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `    ${head}\n  </head>`)
    : /<!doctype html>/i.test(out) ? out.replace(/<!doctype html>/i, match => `${match}\n${head}`) : `${head}\n${out}`;
  const fallback = `<noscript><main>${seo.body}<p>Enable JavaScript for interactive practice, progress and forms.</p></main></noscript>`;
  if (/<noscript>[\s\S]*?<\/noscript>/i.test(out)) return out.replace(/<noscript>[\s\S]*?<\/noscript>/i, fallback);
  return /<body[^>]*>/i.test(out) ? out.replace(/<body([^>]*)>/i, `<body$1>${fallback}`) : `${out}\n${fallback}`;
}

export function sitemap(publishedList) {
  const paths = ["/", "/courses", "/practice", "/training", "/services", "/about", "/resources", "/policies",
    ...freeCourses().map(course => `/learn/${course.id}`), ...challenges.map(item => `/practice/${item.id}`), ...publishedList.map(course => `/course/${course.id}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(paths)].map(path => `  <url><loc>${SITE}${path}</loc></url>`).join("\n")}\n</urlset>\n`;
}

// A plain-language map of the site for AI assistants (llmstxt.org).
export function llmsTxt(publishedList) {
  const line = (path, title, note) => `- [${title}](${SITE}${path}): ${note}`;
  return [`# ${NAME}`, "", "> Free introductory coding lessons for complete beginners, hands-on HTML practice with instant feedback in the browser, training applications and expert software help. Lessons are in English.", "",
    "## Free lessons", ...freeCourses().map(course => line(`/learn/${course.id}`, course.title, course.summary)), "",
    "## Practice", line("/practice", "HTML practice lab", "Four small builds checked as you type; no account needed."), ...challenges.map(item => line(`/practice/${item.id}`, item.title, item.brief)), "",
    ...(publishedList.length ? ["## Courses", ...publishedList.map(course => line(`/course/${course.id}`, course.title, course.summary)), ""] : []),
    "## Help and training", line("/training", "Apply for training", "Training by application; dates and any fees agreed separately."), line("/services", "Software and mentorship enquiries", "Project help, mentorship and code review by enquiry."), line("/about", "About", "Who runs Billion Codes."), ""].join("\n");
}

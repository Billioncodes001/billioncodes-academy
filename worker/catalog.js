export const catalog = {
  courses: [{
    id: "web-foundations-intro",
    title: "Your first steps in web development",
    level: "Beginner",
    format: "Free text lessons",
    summary: "A short, self-paced introduction to how websites work, your first accessible page, and a small JavaScript exercise. No account, payment or prior coding experience required.",
    lessons: [{
      id: "how-the-web-works",
      title: "1. Understand a web page",
      body: [
        "A browser is a program that requests resources and displays web pages. When you open a website, the browser asks a server for a document. HTML describes the content and structure, CSS controls its appearance, and JavaScript can respond to actions or update the page. Not every page needs JavaScript.",
        "Think of a recipe page: HTML identifies the recipe title, ingredient list and instructions. CSS can make the title larger and separate the ingredients from the steps. JavaScript might let you change the number of servings. Keeping these responsibilities separate makes your work easier to understand and test.",
        "Try it: choose a simple page you already trust. Find its main heading, a paragraph and a link. If you have a desktop browser, open its developer tools and inspect the heading. Notice the HTML element, such as h1. Inspecting a page locally does not change the website for other visitors.",
        "A URL identifies a resource. In https://example.com/learn, https is the scheme, example.com is the host, and /learn is the path. HTTPS protects data in transit; it does not prove a website's claims are true. Never put passwords or private information into a URL.",
        "Check your understanding: which technology identifies a heading, which changes its colour, and which can update a counter after a click? Answer: HTML, CSS and JavaScript respectively. Next, you will create a tiny page of your own."
      ]
    }, {
      id: "first-accessible-page",
      title: "2. Build a clear, accessible page",
      body: [
        "You need a plain-text editor and a browser on a computer for this exercise. On a phone, read and sketch the structure now; no paid tool or installation is required to follow the concepts. Create a file named index.html in a practice folder. Use an editor that saves plain text rather than a word-processing document.",
        "Type this complete example:\n<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>My learning plan</title>\n</head>\n<body>\n  <main>\n    <h1>My learning plan</h1>\n    <p>I am learning to build useful websites.</p>\n    <h2>This week's practice</h2>\n    <ul>\n      <li>Read a web page's structure</li>\n      <li>Build and test my first page</li>\n    </ul>\n  </main>\n</body>\n</html>",
        "Open the file in your browser. Change the paragraph, save the file, and refresh the browser. The document title labels the browser tab, while h1 is the main heading inside the page. The language and viewport metadata help browsers and assistive tools interpret the document.",
        "Use headings in a meaningful order rather than choosing them only for their size. Use a button for an action and a link for navigation. When you later add an informative image, describe its purpose in alt text; an image that is only decoration can have empty alt text. Colour should not be the only way you communicate a result.",
        "Try it: add a second h2 titled My next step and one paragraph below it. Read the headings alone: do they describe the page? Enlarge the browser text and narrow the window. Everything should remain readable without cutting off words. You have made a page, not published a live website; the file is still on your device."
      ]
    }, {
      id: "javascript-small-steps",
      title: "3. Reason through a JavaScript program",
      body: [
        "A program is a sequence of instructions. A variable names a value, and a function groups a useful operation. Start with a small problem you can check by hand: how many minutes will you practise in a week?",
        "Read this example before running it:\nconst minutesPerDay = 20;\nconst days = 5;\nfunction weeklyMinutes(minutes, count) {\n  return minutes * count;\n}\nconst total = weeklyMinutes(minutesPerDay, days);\nconsole.log(total);\nThe result is 100 because 20 multiplied by 5 is 100. The function returns a number; console.log displays that result in a developer console.",
        "Try it in a local practice file: add a script element just before the closing body tag of the previous lesson and place the example inside it. Open your browser's developer console and refresh. Change days to 3, predict 60, then test. Do not paste unfamiliar code into the console of a signed-in website: code there can act with your session.",
        "Now change days to 0. The result should be 0. What if a value comes from a form? Form values are usually strings, so real applications must convert and validate them instead of trusting the browser. Validation on the server is still necessary because a caller can bypass a web form.",
        "When something fails, read the error message, identify the smallest failing example and change one thing at a time. Misspelled variable names, missing quotes and missing brackets are common first errors. Record what you expected and what actually happened. That habit is more valuable than memorising every command.",
        "Next step: add your own weekly plan to the page and explain each line to someone else. These introductory lessons do not enrol you in a paid course or issue a certificate. If you want to discuss structured training, submit an application; dates, availability and any future fees require a separate confirmed response."
      ]
    }]
  }],
  training: { status: "applications-open" },
  payments: { enabled: false }
};

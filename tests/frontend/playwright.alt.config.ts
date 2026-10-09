import base from './playwright.config';
export default { ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:5181' }, webServer: { ...base.webServer, command: 'npx vite --host 127.0.0.1 --port 5181 --strictPort', url: 'http://127.0.0.1:5181', reuseExistingServer: true } };

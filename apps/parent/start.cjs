const { execSync } = require('child_process');
const port = process.env.PORT || 3000;
console.log(`Starting server on port ${port}`);
execSync(`npx serve -s dist -l tcp://0.0.0.0:${port}`, { stdio: 'inherit' });

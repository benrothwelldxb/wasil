const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;
const distPath = path.join(__dirname, 'dist');

if (!fs.existsSync(distPath)) {
  console.error('ERROR: dist folder not found at', distPath);
  process.exit(1);
}

app.use(express.static(distPath));

// SPA routing — serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Provider portal running at http://0.0.0.0:${port}`);
});

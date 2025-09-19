
const express = require('express');
const path = require('path');

// Import fetch for node-fetch v3 (ES module)
import('node-fetch').then(({ default: fetch }) => {
  global.fetch = fetch;
});

// Alternative: Use the built-in fetch if available (Node.js 18+)
const fetch = globalThis.fetch || (async (...args) => {
  const { default: fetch } = await import('node-fetch');
  return fetch(...args);
});

const app = express();
const PORT = 5000;

// Middleware to parse JSON
app.use(express.json());

// Serve static files from the current directory
app.use(express.static('.'));

// Username validation endpoint
app.post('/validate-username', async (req, res) => {
  const { username } = req.body;
  
  if (!username || username.length < 3 || username.length > 20) {
    return res.json({ valid: false, error: 'Invalid username length' });
  }

  // Check for invalid characters
  const validUsernamePattern = /^[a-zA-Z0-9_]+$/;
  if (!validUsernamePattern.test(username)) {
    return res.json({ valid: false, error: 'Invalid characters in username' });
  }

  try {
    // Use fetch to validate username with Roblox API
    const response = await fetch(`https://users.roblox.com/v1/usernames/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: true
      })
    });

    if (!response.ok) {
      return res.json({ valid: false, error: 'API request failed' });
    }

    const data = await response.json();

    // Check if the API returned a valid user
    if (data && data.data && data.data.length > 0) {
      const userData = data.data[0];
      if (userData.id && userData.requestedUsername && 
          userData.requestedUsername.toLowerCase() === username.toLowerCase()) {
        return res.json({ valid: true });
      }
    }

    return res.json({ valid: false, error: 'Username not found' });
    
  } catch (error) {
    console.error('Error validating username:', error);
    return res.json({ valid: false, error: 'Validation service unavailable' });
  }
});

// Route for the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}/`);
  console.log('Press Ctrl+C to stop the server');
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
const PORT = process.env.PORT || 5000;

// File-based storage for user websites
const STORAGE_FILE = 'websites.json';

// Load existing websites from storage
function loadWebsites() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf8');
      const websiteArray = JSON.parse(data);
      return new Map(websiteArray.map(item => [item.id, item.config]));
    }
  } catch (error) {
    console.error('Error loading websites:', error);
  }
  return new Map();
}

// Save websites to storage
function saveWebsites(websites) {
  try {
    const websiteArray = [...websites.entries()].map(([id, config]) => ({
      id: id,
      config: config
    }));
    const data = JSON.stringify(websiteArray, null, 2);
    fs.writeFileSync(STORAGE_FILE, data, 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving websites:', error);
    return false;
  }
}

// Generate unique ID that doesn't exist in storage
function generateUniqueId(existingIds) {
  let uniqueId;
  do {
    uniqueId = crypto.randomBytes(6).toString('hex');
  } while (existingIds.has(uniqueId));
  return uniqueId;
}

// Initialize storage
const userWebsites = loadWebsites();

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

// Multi-tenant route for creating a website
app.post('/u/create', (req, res) => {
  const { redirectUrl } = req.body;

  if (!redirectUrl) {
    return res.status(400).json({ error: 'redirectUrl is required' });
  }

  // Validate URL format
  try {
    new URL(redirectUrl);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Generate a unique ID (each submit gets its own ID, even if URL is repeated)
  const uniqueId = generateUniqueId(userWebsites);

  // Store the website configuration with metadata
  const websiteConfig = {
    redirectUrl: redirectUrl,
    createdAt: new Date().toISOString(),
    accessCount: 0
  };

  userWebsites.set(uniqueId, websiteConfig);

  // Save to persistent storage
  const saved = saveWebsites(userWebsites);
  if (!saved) {
    return res.status(500).json({ error: 'Failed to save website' });
  }

  // Construct the website URL
  const websiteUrl = `${req.protocol}://${req.get('host')}/${uniqueId}`;

  res.json({
    message: 'Website created successfully!',
    websiteId: uniqueId,
    websiteUrl: websiteUrl,
    redirectUrl: redirectUrl
  });
});

// Route to serve the user's generated website
app.get('/:id', (req, res) => {
  const { id } = req.params;
  
  // Skip if this is a request for static files or favicon
  if (id.includes('.') || id === 'favicon.ico') {
    return res.status(404).send('Not found');
  }
  
  const websiteConfig = userWebsites.get(id);

  if (websiteConfig) {
    // Track access count and update last accessed time
    websiteConfig.accessCount = (websiteConfig.accessCount || 0) + 1;
    websiteConfig.lastAccessed = new Date().toISOString();
    
    // Save updated analytics to persistent storage
    saveWebsites(userWebsites);
    
    // Instead of redirecting immediately, serve the main page with custom redirect URL
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    // If website not found, serve main page instead
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// New endpoint to get redirect URL for a specific website ID
app.get('/api/redirect/:id', (req, res) => {
  const { id } = req.params;
  const websiteConfig = userWebsites.get(id);
  
  if (websiteConfig) {
    res.json({ redirectUrl: websiteConfig.redirectUrl });
  } else {
    res.json({ redirectUrl: "http://short-urls.zeabur.app/b70b31" }); // Default redirect
  }
});


// Route for the create interface
app.get('/u/create', (req, res) => {
  res.sendFile(path.join(__dirname, 'create.html'));
});

// Route for the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}/`);
  console.log('Press Ctrl+C to stop the server');
});
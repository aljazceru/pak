#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const chalk = require('chalk');

// Pubky imports - install with: npm install @synonymdev/pubky
let PubkyClient, Keypair, PublicKey;
try {
  const pubky = require('@synonymdev/pubky');
  PubkyClient = pubky.Client;
  Keypair = pubky.Keypair;
  PublicKey = pubky.PublicKey;
} catch (error) {
  console.error(chalk.red('Error: @synonymdev/pubky not found. Install with: npm install @synonymdev/pubky'));
  process.exit(1);
}

const program = new Command();
const configPath = path.join(os.homedir(), '.pak-config.json');

// Default configuration
const defaultConfig = {
  homeserver: '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo',
  nexusEndpoint: 'https://nexus.pubky.app',
  testnet: false,
  httpRelay: 'https://httprelay.pubky.app/link',
  keypair: null // Store keypair in config
};

// Global state
let config = { ...defaultConfig };
let client = null;
let currentKeypair = null;
let isAuthenticated = false;
let debugMode = false;

// Utility functions
function debug(...args) {
  if (debugMode) {
    console.log(chalk.gray('[DEBUG]'), ...args);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      debug('Loading config from:', configPath);
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...defaultConfig, ...savedConfig };
      
      // Load keypair if it exists
      if (config.keypair) {
        debug('Loading saved keypair');
        const secretBytes = new Uint8Array(config.keypair);
        currentKeypair = Keypair.fromSecretKey(secretBytes);
        debug('Keypair loaded, public key:', currentKeypair.publicKey().z32());
      }
      
      // Load auth state
      if (config.authenticated) {
        isAuthenticated = true;
        debug('Authentication state restored');
      }
    } else {
      debug('No config file found, using defaults');
    }
  } catch (error) {
    console.warn(chalk.yellow('Warning: Could not load config, using defaults'));
    debug('Config load error:', error);
  }
}

function saveConfig() {
  try {
    // Save keypair as array of bytes
    if (currentKeypair) {
      config.keypair = Array.from(currentKeypair.secretKey());
      debug('Saving keypair to config');
    }
    
    // Save auth state
    config.authenticated = isAuthenticated;
    
    debug('Saving config to:', configPath);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green('Configuration saved'));
  } catch (error) {
    console.error(chalk.red('Error saving configuration:', error.message));
    debug('Save config error:', error);
  }
}

function initializeClient() {
  try {
    debug('Initializing Pubky client, testnet:', config.testnet);
    
    // Add some debugging around client creation
    if (config.testnet) {
      debug('Creating testnet client...');
      client = PubkyClient.testnet();
    } else {
      debug('Creating mainnet client...');
      client = new PubkyClient();
    }
    
    console.log(chalk.green('Pubky client initialized'));
    debug('Client created successfully');
    
    // Try to debug client configuration if possible
    debug('Client type:', typeof client);
    debug('Client methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
    
  } catch (error) {
    console.error(chalk.red('Failed to initialize client:', error.message));
    debug('Client initialization error:', error);
    process.exit(1);
  }
}

function cleanup() {
  try {
    if (client && typeof client.free === 'function') {
      debug('Cleaning up client...');
      client.free();
    }
  } catch (error) {
    debug('Cleanup error:', error);
  }
}

function exitGracefully(code = 0) {
  cleanup();
  setTimeout(() => {
    process.exit(code);
  }, 100); // Small delay to ensure cleanup completes
}

function formatJson(obj) {
  return JSON.stringify(obj, null, 2);
}

// Configuration commands
program
  .command('config')
  .description('Manage configuration')
  .option('-s, --show', 'Show current configuration')
  .option('-r, --reset', 'Reset to defaults')
  .option('--homeserver <key>', 'Set homeserver public key')
  .option('--nexus <url>', 'Set Nexus endpoint URL')
  .option('--testnet [bool]', 'Enable/disable testnet')
  .option('--relay <url>', 'Set HTTP relay URL')
  .option('--list-homeservers', 'List known working homeservers')
  .action((options) => {
    loadConfig();
    
    if (options.listHomeservers) {
      console.log(chalk.blue('Known Homeservers:'));
      console.log(chalk.green('Testnet:'));
      console.log('  8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo (default testnet)');
      console.log(chalk.green('Mainnet:'));
      console.log('  8um71us3fyw6h8wbcxb5ar3rwusy1a6u49956ikzojg3gcwd1dty (production)');
      console.log(chalk.yellow('\nTry different homeservers if current one is unresponsive'));
      return;
    }
    
    if (options.show) {
      console.log(chalk.blue('Current Configuration:'));
      console.log(formatJson(config));
      return;
    }
    
    if (options.reset) {
      config = { ...defaultConfig };
      saveConfig();
      console.log(chalk.green('Configuration reset to defaults'));
      return;
    }
    
    let changed = false;
    
    if (options.homeserver) {
      config.homeserver = options.homeserver;
      changed = true;
    }
    
    if (options.nexus) {
      config.nexusEndpoint = options.nexus;
      changed = true;
    }
    
    if (options.testnet !== undefined) {
      config.testnet = options.testnet === 'true' || options.testnet === true;
      changed = true;
    }
    
    if (options.relay) {
      config.httpRelay = options.relay;
      changed = true;
    }
    
    if (changed) {
      saveConfig();
    } else {
      console.log(chalk.blue('Current Configuration:'));
      console.log(formatJson(config));
    }
  });

// Authentication commands
program
  .command('auth')
  .description('Authentication management')
  .option('-g, --generate', 'Generate new keypair')
  .option('-i, --import <secretkey>', 'Import keypair from secret key (comma-separated bytes)')
  .option('-l, --login', 'Sign in with current keypair')
  .option('-u, --signup', 'Sign up with current keypair')
  .option('-t, --token <token>', 'Signup token (invite code)')
  .option('-s, --status', 'Show authentication status')
  .option('--export', 'Export current public key')
  .action(async (options) => {
    loadConfig();
    initializeClient();
    
    if (options.generate) {
      try {
        currentKeypair = Keypair.random();
        const publicKey = currentKeypair.publicKey();
        const secretKey = Array.from(currentKeypair.secretKey());
        
        // Save keypair
        saveConfig();
        
        console.log(chalk.green('Generated new keypair:'));
        console.log(chalk.blue('Public Key:'), publicKey.z32());
        console.log(chalk.yellow('Secret Key:'), secretKey.join(','));
        console.log(chalk.red('SAVE THE SECRET KEY SECURELY!'));
      } catch (error) {
        console.error(chalk.red('Keypair generation failed:', error.message));
      }
      return;
    }
    
    if (options.import) {
      try {
        const secretBytes = new Uint8Array(options.import.split(',').map(Number));
        currentKeypair = Keypair.fromSecretKey(secretBytes);
        
        // Save keypair
        saveConfig();
        
        console.log(chalk.green('Keypair imported successfully'));
        console.log(chalk.blue('Public Key:'), currentKeypair.publicKey().z32());
      } catch (error) {
        console.error(chalk.red('Keypair import failed:', error.message));
      }
      return;
    }
    
    if (options.login || options.signup) {
      if (!currentKeypair) {
        console.error(chalk.red('No keypair available. Generate or import one first.'));
        return;
      }
      
      try {
        const homeserver = PublicKey.from(config.homeserver);
        debug('Homeserver public key:', config.homeserver);
        debug('User public key:', currentKeypair.publicKey().z32());
        
        if (options.login) {
          debug('Attempting to sign in...');
          debug('This will try to connect to the homeserver...');
          
          try {
            await client.signin(currentKeypair);
            console.log(chalk.green('Signed in successfully'));
          } catch (signinError) {
            debug('Signin failed, error type:', typeof signinError);
            debug('Signin error message:', signinError.message);
            debug('Signin error name:', signinError.name);
            console.log(chalk.yellow('Signin failed, this might be normal if not registered yet'));
            
            // Try signup instead
            debug('Attempting signup as fallback...');
            await client.signup(currentKeypair, homeserver, null);
            console.log(chalk.green('Signed up successfully'));
          }
        } else {
          debug('Attempting to sign up with homeserver...');
          debug('This will resolve homeserver HTTP endpoint and POST signup data...');
          
          const signupToken = options.token || null;
          debug('Using signup token:', signupToken ? 'provided' : 'null');
          
          try {
            await client.signup(currentKeypair, homeserver, signupToken);
            console.log(chalk.green('Signed up successfully'));
          } catch (signupError) {
            debug('Signup error details:');
            debug('- Error type:', typeof signupError);
            debug('- Error message:', signupError.message);
            debug('- Error name:', signupError.name);
            debug('- Error toString:', signupError.toString());
            
            if (signupError.toString().includes('signup_token required')) {
              console.log(chalk.yellow('Signup requires an invite token.'));
              console.log(chalk.yellow('Use: pak auth -u --token YOUR_INVITE_TOKEN'));
            }
            
            throw signupError;
          }
        }
        
        debug('Checking session...');
        const session = await client.session(currentKeypair.publicKey());
        if (session) {
          isAuthenticated = true;
          const pubky = session.pubky().z32();
          console.log(chalk.green('Session established for:'), pubky);
          debug('Session capabilities:', session.capabilities ? session.capabilities() : 'none');
          
          // Save authentication state
          saveConfig();
        } else {
          throw new Error('Session not created after authentication');
        }
      } catch (error) {
        console.error(chalk.red('Authentication failed:'), error.message || 'Unknown error');
        debug('Full error object:', error);
        debug('Error stack:', error.stack);
        
        if (error.message && error.message.includes('fetch')) {
          debug('This appears to be a network/fetch error');
          console.log(chalk.yellow('Hint: Check if the homeserver is accessible and your network connection'));
        }
      }
      return;
    }
    
    if (options.export && currentKeypair) {
      console.log(chalk.blue('Public Key:'), currentKeypair.publicKey().z32());
      return;
    }
    
    // Default: show status
    console.log(chalk.blue('Authentication Status:'));
    console.log('Authenticated:', isAuthenticated ? chalk.green('Yes') : chalk.red('No'));
    console.log('Has Keypair:', currentKeypair ? chalk.green('Yes') : chalk.red('No'));
    if (currentKeypair) {
      console.log('Public Key:', currentKeypair.publicKey().z32());
    }
  });

// Homeserver operations
program
  .command('homeserver')
  .alias('hs')
  .description('Homeserver operations')
  .argument('<method>', 'HTTP method (GET, PUT, DELETE)')
  .argument('<path>', 'Path on homeserver')
  .option('-d, --data <data>', 'Request body data (for PUT)')
  .action(async (method, path, options) => {
    loadConfig();
    initializeClient();
    
    if (!currentKeypair) {
      console.error(chalk.red('No keypair available. Run: pak auth --import or --generate'));
      return;
    }
    
    try {
      // Re-establish session for each homeserver operation
      debug('Re-establishing session...');
      await client.signin(currentKeypair);
      const session = await client.session(currentKeypair.publicKey());
      if (!session) {
        throw new Error('Could not establish session');
      }
      debug('Session active with capabilities:', session.capabilities ? session.capabilities() : 'none');
      
      const userPubky = currentKeypair.publicKey().z32();
      const url = `pubky://${userPubky}${path.startsWith('/') ? path : '/' + path}`;
      
      const fetchOptions = {
        method: method.toUpperCase(),
        credentials: 'include'
      };
      
      if (method.toUpperCase() === 'PUT' && options.data) {
        fetchOptions.body = options.data;
      }
      
      console.log(chalk.blue(`${method.toUpperCase()} ${url}`));
      debug('Fetch options:', fetchOptions);
      
      const response = await client.fetch(url, fetchOptions);
      
      if (response.ok) {
        const responseText = await response.text();
        console.log(chalk.green(`Success (${response.status}):`));
        
        try {
          const jsonData = JSON.parse(responseText);
          console.log(formatJson(jsonData));
        } catch {
          console.log(responseText);
        }
        exitGracefully(0);
      } else {
        const errorText = await response.text();
        console.error(chalk.red(`Error ${response.status}:`), errorText);
        debug('Response headers:', response.headers);
        exitGracefully(1);
      }
    } catch (error) {
      console.error(chalk.red('Homeserver operation failed:', error.message));
      debug('Full error:', error);
      exitGracefully(1);
    }
  });

// Nexus API operations
program
  .command('nexus')
  .description('Nexus API operations')
  .argument('<endpoint>', 'API endpoint (e.g., /v0/user/ID, /v0/stream/posts)')
  .option('-p, --params <params>', 'Query parameters (key=value&key2=value2)')
  .action(async (endpoint, options) => {
    loadConfig();
    
    try {
      let url = `${config.nexusEndpoint}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
      
      if (options.params) {
        url += `?${options.params}`;
      }
      
      console.log(chalk.blue(`GET ${url}`));
      
      const response = await axios.get(url);
      
      console.log(chalk.green(`Success (${response.status}):`));
      console.log(formatJson(response.data));
    } catch (error) {
      if (error.response) {
        console.error(chalk.red(`Error ${error.response.status}:`), error.response.data);
      } else {
        console.error(chalk.red('Nexus query failed:', error.message));
      }
    }
  });

// File operations
program
  .command('files')
  .alias('ls')
  .description('File operations')
  .argument('[path]', 'Path to list', '/pub/')
  .action(async (path = '/pub/') => {
    loadConfig();
    initializeClient();
    
    if (!currentKeypair) {
      console.error(chalk.red('No keypair available. Run: pak auth --import or --generate'));
      return;
    }
    
    try {
      // Re-establish session
      debug('Re-establishing session...');
      await client.signin(currentKeypair);
      const session = await client.session(currentKeypair.publicKey());
      if (!session) {
        throw new Error('Could not establish session');
      }
      debug('Session active');
      
      const userPubky = currentKeypair.publicKey().z32();
      const dirUrl = `pubky://${userPubky}${path.startsWith('/') ? path : '/' + path}`;
      
      console.log(chalk.blue(`Listing: ${dirUrl}`));
      
      const files = await client.list(dirUrl);
      
      if (files.length === 0) {
        console.log(chalk.yellow('Directory is empty'));
        return;
      }
      
      console.log(chalk.green(`Found ${files.length} items:`));
      files.forEach(file => {
        const icon = file.endsWith('/') ? '📁' : '📄';
        console.log(`${icon} ${file}`);
      });
      exitGracefully(0);
    } catch (error) {
      console.error(chalk.red('File listing failed:'), error.message || error.toString());
      debug('Full error:', error);
      
      if (error.message && error.message.includes('404')) {
        console.log(chalk.yellow('Directory may not exist or is empty'));
      }
      exitGracefully(1);
    }
  });

// Social operations
program
  .command('social')
  .description('Social operations')
  .argument('<action>', 'Action: follow, unfollow, mute, unmute, bookmark, tag')
  .argument('<target>', 'Target user/content')
  .option('-l, --label <label>', 'Tag label (for tag action)')
  .action(async (action, target, options) => {
    loadConfig();
    initializeClient();
    
    if (!currentKeypair) {
      console.error(chalk.red('No keypair available. Run: pak auth --import or --generate'));
      return;
    }
    
    try {
      // Re-establish session for each social operation
      debug('Re-establishing session...');
      await client.signin(currentKeypair);
      const session = await client.session(currentKeypair.publicKey());
      if (!session) {
        throw new Error('Could not establish session');
      }
      debug('Session active with capabilities:', session.capabilities ? session.capabilities() : 'none');
      
      const userPubky = currentKeypair.publicKey().z32();
      let url, data, method;
      
      debug(`Executing social operation: ${action} on target: ${target}`);
      
      switch (action.toLowerCase()) {
        case 'follow':
          url = `pubky://${userPubky}/pub/pubky.app/follows/${target}`;
          data = JSON.stringify({ target, created_at: Date.now() });
          method = 'PUT';
          break;
          
        case 'unfollow':
          url = `pubky://${userPubky}/pub/pubky.app/follows/${target}`;
          method = 'DELETE';
          break;
          
        case 'mute':
          url = `pubky://${userPubky}/pub/pubky.app/mutes/${target}`;
          data = JSON.stringify({ target, created_at: Date.now() });
          method = 'PUT';
          break;
          
        case 'unmute':
          url = `pubky://${userPubky}/pub/pubky.app/mutes/${target}`;
          method = 'DELETE';
          break;
          
        case 'bookmark':
          const bookmarkId = Date.now().toString();
          url = `pubky://${userPubky}/pub/pubky.app/bookmarks/${bookmarkId}`;
          data = JSON.stringify({ target, created_at: Date.now() });
          method = 'PUT';
          break;
          
        case 'tag':
          if (!options.label) {
            console.error(chalk.red('Tag label required. Use --label option'));
            return;
          }
          const tagId = Date.now().toString();
          url = `pubky://${userPubky}/pub/pubky.app/tags/${tagId}`;
          data = JSON.stringify({ target, label: options.label, created_at: Date.now() });
          method = 'PUT';
          break;
          
        default:
          console.error(chalk.red('Invalid action. Use: follow, unfollow, mute, unmute, bookmark, tag'));
          return;
      }
      
      const fetchOptions = { method, credentials: 'include' };
      if (data) fetchOptions.body = data;
      
      console.log(chalk.blue(`${method} ${url}`));
      debug('Fetch options:', fetchOptions);
      
      const response = await client.fetch(url, fetchOptions);
      
      if (response.ok) {
        console.log(chalk.green(`${action} successful`));
        const responseText = await response.text();
        if (responseText) {
          debug('Response:', responseText);
        }
        exitGracefully(0);
      } else {
        const errorText = await response.text();
        console.error(chalk.red(`${action} failed (${response.status}):`), errorText);
        debug('Response headers:', response.headers);
        exitGracefully(1);
      }
    } catch (error) {
      console.error(chalk.red('Social operation failed:'), error.message || error.toString());
      debug('Full error:', error);
      debug('Error type:', typeof error);
      debug('Error stack:', error.stack);
      exitGracefully(1);
    }
  });

// Test connectivity
program
  .command('test')
  .description('Test connectivity')
  .option('-h, --homeserver', 'Test homeserver connectivity')
  .option('-n, --nexus', 'Test Nexus API connectivity')
  .option('-a, --all', 'Test all connections')
  .action(async (options) => {
    loadConfig();
    
    if (options.homeserver || options.all) {
      try {
        console.log(chalk.blue('Testing homeserver connectivity...'));
        const response = await axios.get(`https://pkarr.pubky.org/${config.homeserver}`);
        console.log(chalk.green('✅ Homeserver Pkarr record found'));
      } catch (error) {
        console.error(chalk.red('❌ Homeserver test failed:', error.message));
      }
    }
    
    if (options.nexus || options.all) {
      try {
        console.log(chalk.blue('Testing Nexus API connectivity...'));
        const response = await axios.get(`${config.nexusEndpoint}/v0/stream/posts?limit=1`);
        console.log(chalk.green('✅ Nexus API accessible'));
        console.log('Sample data:', formatJson(response.data.slice(0, 1)));
      } catch (error) {
        console.error(chalk.red('❌ Nexus API test failed:', error.message));
      }
    }
    
    if (!options.homeserver && !options.nexus && !options.all) {
      console.log(chalk.yellow('Specify --homeserver, --nexus, or --all'));
    }
  });

// Add republish command
program
  .command('republish')
  .description('Republish homeserver record (alternative to signup)')
  .action(async () => {
    if (!currentKeypair) {
      console.error(chalk.red('No keypair available. Generate or import one first.'));
      return;
    }
    
    loadConfig();
    initializeClient();
    
    try {
      const homeserver = PublicKey.from(config.homeserver);
      debug('Attempting to republish homeserver record...');
      
      await client.republishHomeserver(currentKeypair, homeserver);
      console.log(chalk.green('Homeserver record republished successfully'));
      
      // Try to establish session
      const session = await client.session(currentKeypair.publicKey());
      if (session) {
        isAuthenticated = true;
        console.log(chalk.green('Session established for:'), session.pubky().z32());
      }
      exitGracefully(0);
    } catch (error) {
      console.error(chalk.red('Republish failed:', error.message || error));
      debug('Full republish error:', error);
      exitGracefully(1);
    }
  });
// Main program setup
program
  .name('pak')
  .description('Pak - Swiss Army Knife for Pubky ecosystem')
  .version('1.0.0')
  .option('--debug', 'Enable debug output');

// Global hook for debug flag
program.hook('preAction', (thisCommand, actionCommand) => {
  if (program.opts().debug) {
    debugMode = true;
    debug('Debug mode enabled');
  }
});

// Load config on startup
loadConfig();

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, cleaning up...');
  exitGracefully(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, cleaning up...');
  exitGracefully(0);
});

program.parse();
# pak

A Swiss Army Knife CLI for the Pubky ecosystem. This tool provides a comprehensive set of commands for interacting with Pubky homeservers, managing authentication, and performing social operations.

## Installation

```bash
npm install -g pak
```

## Usage

```bash
pak [command] [options]
```

## Commands

### Configuration

```bash
# Show current configuration
pak config --show

# Set homeserver
pak config --homeserver 8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo

# List known homeservers
pak config --list-homeservers

# Enable testnet
pak config --testnet true

# Reset configuration to defaults
pak config --reset
```

### Authentication

```bash
# Generate new keypair
pak auth --generate

# Import existing keypair
pak auth --import <secret-key>

# Sign in with current keypair
pak auth --login

# Sign up with current keypair
pak auth --signup

# Sign up with invite token
pak auth --signup --token YOUR_INVITE_TOKEN

# Show authentication status
pak auth --status

# Export public key
pak auth --export
```

### Homeserver Operations

```bash
# GET request
pak homeserver GET /path

# PUT request with data
pak homeserver PUT /path --data '{"key": "value"}'

# DELETE request
pak homeserver DELETE /path
```

### File Operations

```bash
# List files in default directory
pak files

# List files in specific directory
pak files /pub/images/

# Short alias for files command
pak ls /pub/data/
```

### Social Operations

```bash
# Follow a user
pak social follow <pubkey>

# Unfollow a user
pak social unfollow <pubkey>

# Mute a user
pak social mute <pubkey>

# Unmute a user
pak social unmute <pubkey>

# Bookmark content
pak social bookmark <content-id>

# Tag content
pak social tag <content-id> --label "favorite"
```

### Nexus API Operations

```bash
# Query user profile
pak nexus /v0/user/<pubkey>

# Get post stream
pak nexus /v0/stream/posts --params "limit=10&before=timestamp"
```

### Test Connectivity

```bash
# Test all connections
pak test --all

# Test homeserver only
pak test --homeserver

# Test Nexus API only
pak test --nexus
```

### Debug Mode

Add `--debug` to any command for verbose output:

```bash
pak --debug auth --status
```

## Configuration File

The configuration file is stored at `~/.pubky-debug-config.json` and contains:

- Homeserver public key
- Nexus endpoint URL
- Testnet flag
- HTTP relay URL
- Keypair (if saved)

## Error Handling

The CLI provides detailed error messages and debug output when using `--debug`. Common issues include:

- Network connectivity problems
- Invalid keypair or authentication
- Missing invite tokens for signup
- Invalid request parameters

## License

MIT

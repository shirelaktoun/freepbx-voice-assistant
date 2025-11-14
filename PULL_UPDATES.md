# How to Pull Updates

## If you're already in the project directory:

```bash
cd /home/user/freepbx-voice-assistant

# Check current branch
git branch

# Fetch latest changes
git fetch origin

# Pull updates
git pull origin claude/test-client-setup-017zRPcauCXvUzCznKozm1cC
```

## If this is a fresh server or new clone:

```bash
# Clone the repository
git clone https://github.com/shirelaktoun/freepbx-voice-assistant.git
cd freepbx-voice-assistant

# Checkout the branch with updates
git checkout claude/test-client-setup-017zRPcauCXvUzCznKozm1cC

# Pull latest changes
git pull
```

## Verify you have the new files:

```bash
ls -la

# You should see:
# - SETUP_GUIDE.md (new)
# - diagnose.sh (new)
# - .env (you created this locally)
```

## After pulling:

1. **Run diagnostics:**
   ```bash
   ./diagnose.sh
   ```

2. **Edit .env if needed:**
   ```bash
   nano .env
   ```

3. **Install/update dependencies:**
   ```bash
   npm install
   ```

4. **Start the application:**
   ```bash
   node index.js
   ```

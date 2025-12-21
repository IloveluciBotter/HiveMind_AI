# Enable AI Services

## Quick Setup

To enable AI chat services, you need to set two environment variables:

### Option 1: Set Environment Variables (Current Session)

**PowerShell:**
```powershell
$env:LMSTUDIO_BASE_URL="http://127.0.0.1:1234/v1"
$env:LMSTUDIO_MODEL="mistralai/mistral-7b-instruct-v0.3"
```

**Command Prompt:**
```cmd
set LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
set LMSTUDIO_MODEL=mistralai/mistral-7b-instruct-v0.3
```

### Option 2: Create .env File (Persistent)

Create a `.env` file in the `Repl-GPT` directory with:

```
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL=mistralai/mistral-7b-instruct-v0.3
```

## Requirements

1. **LM Studio must be running** locally on `http://127.0.0.1:1234`
2. **The model must be loaded** in LM Studio (the model name in `LMSTUDIO_MODEL` must match)
3. **API server must be enabled** in LM Studio:
   - Open LM Studio
   - Go to Settings → Server
   - Enable "Server" and set port to `1234`
   - Make sure "Use /v1 endpoint" is enabled

## Verify AI Services Are Working

1. **Check health endpoint:**
   ```bash
   curl http://localhost:5000/api/health/ollama
   ```
   Should return: `{"ok":true,"baseUrl":"http://127.0.0.1:1234/v1","model":"mistralai/mistral-7b-instruct-v0.3"}`

2. **Test chat:**
   - Go to `/chat` page in your app
   - Send a message
   - Should get AI response (not fallback message)

## Common Models

You can use any model that's compatible with LM Studio's API. Common options:

- `mistralai/mistral-7b-instruct-v0.3` (recommended)
- `mistralai/mistral-7b-instruct-v0.2`
- `meta-llama/Llama-3.1-8B-Instruct`
- `Qwen/Qwen2.5-7B-Instruct`

## Troubleshooting

**Error: "LM Studio not configured"**
- Make sure environment variables are set
- Restart your dev server after setting variables

**Error: "Connection timeout" or "Connection refused"**
- Make sure LM Studio is running
- Check that LM Studio's API server is enabled on port 1234
- Verify the URL is correct: `http://127.0.0.1:1234/v1`

**Error: "Model not found"**
- Make sure the model is downloaded and loaded in LM Studio
- Check that `LMSTUDIO_MODEL` matches the exact model name in LM Studio

**Chat returns fallback responses**
- Check `/api/health/ollama` endpoint
- Verify LM Studio is running and accessible
- Check server logs for error messages


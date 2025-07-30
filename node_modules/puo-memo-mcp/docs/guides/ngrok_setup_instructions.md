# ngrok Setup Instructions

## 1. Find Your Authtoken

Go to: https://dashboard.ngrok.com/get-started/your-authtoken

Your authtoken will look something like:
```
2abcdefghijklmnopqrstuvwxyz1234567890ABCD_efghijklmnopqrstuvwxyz
```

## 2. Configure ngrok

Copy your authtoken and run this command (replace with YOUR actual token):

```bash
ngrok config add-authtoken 2abcdefghijklmnopqrstuvwxyz1234567890ABCD_efghijklmnopqrstuvwxyz
```

## 3. Start the Tunnel

Once configured, start ngrok:

```bash
cd "/Users/wivak/puo-jects/active/puo memo mcp"
ngrok http 8001
```

## 4. Look for Your Public URL

After starting ngrok, you'll see something like:

```
Session Status                online
Account                       your-email@example.com (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       50ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.ngrok-free.app -> http://localhost:8001
```

Copy the HTTPS forwarding URL (e.g., `https://abc123def456.ngrok-free.app`)

## 5. Use in ChatGPT

When creating your Custom GPT:
1. Replace the server URL in the OpenAPI schema with your ngrok URL
2. Keep the API key: `gx3ZaY7QQCkf4NepTeZ4IR2MGejOURiM-ZBgZMaGa44`

That's it! Your PUO Memo will be accessible from ChatGPT.
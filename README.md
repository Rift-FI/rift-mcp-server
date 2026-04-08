# Rift Finance MCP Server

MCP (Model Context Protocol) server that gives AI assistants full access to the Rift Finance platform. Users can send crypto, check balances, offramp to M-Pesa, bridge across chains, and more — just by chatting.

**64 tools** covering every Rift API endpoint plus documentation search.

## Quick Setup

### 1. Install

```bash
cd rift-mcp-server
npm install
npm run build
```

### 2. Add to Claude Desktop

Edit `~/.claude/claude_desktop_config.json` (Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rift-finance": {
      "command": "node",
      "args": ["/absolute/path/to/rift-mcp-server/dist/index.js"],
      "env": {
        "RIFT_API_KEY": "sk_your_project_api_key"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see the Rift tools available.

> **Note:** `RIFT_API_KEY` is optional in the config — users can also set it at runtime by telling Claude "my Rift API key is sk_..." which calls `rift_set_api_key`.

### 3. Add to Claude Code

Edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "rift-finance": {
      "command": "node",
      "args": ["/absolute/path/to/rift-mcp-server/dist/index.js"],
      "env": {
        "RIFT_API_KEY": "sk_your_project_api_key"
      }
    }
  }
}
```

### 4. Add to Cursor

Go to **Settings > MCP Servers > Add Server**:

- **Name:** `rift-finance`
- **Command:** `node /absolute/path/to/rift-mcp-server/dist/index.js`
- **Environment Variables:**
  - `RIFT_API_KEY`: `sk_your_project_api_key`

### 5. Add to Any MCP-Compatible Agent

The server uses **stdio transport** (stdin/stdout JSON-RPC). Any MCP client can connect:

```bash
# Run directly
RIFT_API_KEY=sk_your_key node /path/to/rift-mcp-server/dist/index.js

# Or with npx (if published)
RIFT_API_KEY=sk_your_key npx @rift-finance/mcp-server
```

**MCP client config (generic):**

```json
{
  "command": "node",
  "args": ["/path/to/rift-mcp-server/dist/index.js"],
  "transport": "stdio",
  "env": {
    "RIFT_API_URL": "https://rift-sdk-wrapper-j9qe.onrender.com",
    "RIFT_API_KEY": "sk_your_key"
  }
}
```

### 6. Using with the OpenAI Agents SDK / LangChain / Vercel AI SDK

Any framework that supports MCP can use this server. Example with the official MCP client:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/path/to/rift-mcp-server/dist/index.js"],
  env: {
    RIFT_API_KEY: "sk_your_key",
    RIFT_API_URL: "https://rift-sdk-wrapper-j9qe.onrender.com",
  },
});

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool({
  name: "rift_get_balance",
  arguments: { chain: "BASE", token: "USDC" },
});
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RIFT_API_URL` | No | `https://rift-sdk-wrapper-j9qe.onrender.com` | Rift API Wrapper URL |
| `RIFT_API_KEY` | No | (empty) | Project API key. Can be set at runtime via `rift_set_api_key` tool |

## User Flow

When a user chats with an AI that has this MCP server connected, here's the typical flow:

```
User: "I want to send some USDC"

AI: I'll need your Rift API key first. Do you have one?

User: "Yeah it's sk_abc123..."

AI: [calls rift_set_api_key] → Got it, key set.
    Now let's log you in. What's your email?

User: "user@example.com"

AI: [calls rift_send_otp] → OTP sent to your email. What's the code?

User: "482910"

AI: [calls rift_login] → You're logged in!
    [calls rift_get_balance] → You have 150.25 USDC on Base.
    How much do you want to send and to what address?

User: "Send 50 USDC to 0xABC... on Base"

AI: You want to send 50 USDC to 0xABC... on Base (gasless).
    I'll need an OTP to authorize. Check your email.
    [calls rift_send_otp]

User: "Code is 193847"

AI: [calls rift_send_crypto] → Done! Tx hash: 0xdef...
```

## All 64 Tools

### Setup & Docs (6)
| Tool | Description |
|------|-------------|
| `rift_set_api_key` | Set API key at runtime |
| `rift_set_api_url` | Override API URL |
| `rift_status` | Check connection status |
| `rift_search_docs` | Search SDK/API docs |
| `rift_get_api_endpoints` | Get REST endpoints for a service |
| `rift_get_supported_chains` | List chains, tokens, fiat currencies |

### Auth & User (12)
| Tool | Description |
|------|-------------|
| `rift_signup` | Create account |
| `rift_send_otp` | Send OTP |
| `rift_verify_otp` | Verify OTP |
| `rift_login` | Login (stores session) |
| `rift_logout` | Logout |
| `rift_get_user` | Get profile |
| `rift_update_user` | Update profile / auto-swap config |
| `rift_delete_user` | Delete account |
| `rift_create_recovery` | Setup recovery methods |
| `rift_get_recovery_options` | Get recovery options |
| `rift_request_password_reset` | Request password reset |
| `rift_reset_password` | Reset password with OTP |

### Wallet & Transactions (4)
| Tool | Description |
|------|-------------|
| `rift_get_balance` | Check balance (by chain/token) |
| `rift_send_crypto` | Send crypto (gasless) |
| `rift_get_transaction_history` | Transaction history |
| `rift_get_transaction_fee` | Calculate fees |

### Offramp — Crypto to Fiat (6)
| Tool | Description |
|------|-------------|
| `rift_preview_exchange_rate` | Preview FX rate |
| `rift_get_payment_methods` | Banks/mobile money by currency |
| `rift_offramp` | Cash out to M-Pesa/bank |
| `rift_get_withdrawal_fee` | Get withdrawal fee |
| `rift_poll_offramp_status` | Track offramp order |
| `rift_get_offramp_orders` | List offramp orders |

### Onramp — Fiat to Crypto (3)
| Tool | Description |
|------|-------------|
| `rift_buy_crypto` | Buy crypto with mobile money |
| `rift_get_onramp_status` | Track purchase |
| `rift_get_onramp_orders` | List purchases |

### Bridge (3)
| Tool | Description |
|------|-------------|
| `rift_get_bridge_routes` | Available routes |
| `rift_bridge_quote` | Get quote |
| `rift_bridge_execute` | Execute bridge |

### KYC (6)
| Tool | Description |
|------|-------------|
| `rift_kyc_get_token` | Get KYC verification URL |
| `rift_kyc_check_user_exists` | Check if user exists |
| `rift_kyc_status` | KYC status |
| `rift_kyc_verify` | Verify KYC job |
| `rift_kyc_is_verified` | Am I verified? |
| `rift_kyc_job_status` | Poll job status |

### WalletConnect (6)
| Tool | Description |
|------|-------------|
| `rift_wc_pair` | Pair with DApp |
| `rift_wc_get_requests` | Pending requests |
| `rift_wc_approve` | Approve request |
| `rift_wc_reject` | Reject request |
| `rift_wc_sessions` | List sessions |
| `rift_wc_disconnect` | Disconnect session |

### Merchant (3)
| Tool | Description |
|------|-------------|
| `rift_create_invoice` | Create invoice |
| `rift_get_invoices` | List invoices |
| `rift_merchant_status` | KYB status |

### Notifications (3)
| Tool | Description |
|------|-------------|
| `rift_notifications_register` | Register device |
| `rift_notifications_send` | Send notification |
| `rift_notifications_subscriptions` | Get/delete subscriptions |

### Signer / Proxy Wallet (4)
| Tool | Description |
|------|-------------|
| `rift_get_wallet_instance` | Get wallet for chain |
| `rift_sign_transaction` | Sign without broadcast |
| `rift_send_transaction` | Sign + broadcast |
| `rift_sign_message` | Sign message |

### Assets (3)
| Tool | Description |
|------|-------------|
| `rift_get_tokens` | List tokens |
| `rift_get_user_tokens` | User's tokens |
| `rift_get_chains` | List chains |

### User Management (4)
| Tool | Description |
|------|-------------|
| `rift_suspend_user` | Suspend user |
| `rift_unsuspend_user` | Unsuspend user |
| `rift_get_suspended_users` | List suspended |
| `rift_get_user_status` | Check suspension status |

### Deposits (1)
| Tool | Description |
|------|-------------|
| `rift_get_deposits` | Get USDC deposits |

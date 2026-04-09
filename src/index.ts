#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SDK_SERVICES, API_ENDPOINTS, SUPPORTED_CHAINS, SUPPORTED_CURRENCIES } from "./docs";
import { RiftApiClient } from "./api-client";

const client = new RiftApiClient(
  process.env.RIFT_API_URL || "https://rift-sdk-wrapper-j9qe.onrender.com",
  process.env.RIFT_API_KEY || ""
);

const server = new McpServer({
  name: "rift-finance",
  version: "1.0.0",
});

// ── Helpers ──────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(e: any) {
  const msg = e.message || String(e);

  // Add recovery hints based on common errors
  let hint = "";
  if (msg.includes("No API key")) hint = "\n\nNext step: ask the user for their Rift API key and call rift_set_api_key.";
  else if (msg.includes("Unauthorized") || msg.includes("Bearer token")) hint = "\n\nNext step: user needs to login first. Call rift_send_otp then rift_login.";
  else if (msg.includes("OTP") || msg.includes("Password is required")) hint = "\n\nNext step: this operation requires OTP or password verification. For email/phone users, call rift_send_otp first, then retry with the otpCode. For externalId users, ask for their password.";
  else if (msg.includes("KYC") || msg.includes("kyc")) hint = "\n\nNext step: user needs KYC verification. Call rift_kyc_get_token to start KYC flow.";
  else if (msg.includes("Merchant") || msg.includes("merchant") || msg.includes("KYB")) hint = "\n\nNext step: user's account needs merchant approval (KYB verification). This is done by the project admin.";
  else if (msg.includes("Insufficient") || msg.includes("balance")) hint = "\n\nNext step: user doesn't have enough funds. Call rift_get_balance to check their current balance.";
  else if (msg.includes("Server error") || msg.includes("502") || msg.includes("503")) hint = "\n\nNext step: the API server may be temporarily down. Wait a moment and retry.";

  return { content: [{ type: "text" as const, text: `Error: ${msg}${hint}` }] };
}

function json(data: any, prefix?: string) {
  const text = prefix ? `${prefix}\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2);
  return ok(text);
}

// Check auth state and return helpful message
function requireAuth(): string | null {
  if (!client.hasApiKey()) return "No API key set. Ask the user for their Rift API key (starts with sk_) and call rift_set_api_key first.";
  if (!client.isAuthenticated()) return "User not logged in. Call rift_send_otp to send an OTP to their email/phone, then call rift_login with the OTP code.";
  return null;
}

// ============================================
// GUIDE — The most important tool for the agent
// ============================================

server.tool(
  "rift_guide",
  "START HERE. Get step-by-step instructions for any Rift operation. Call this FIRST when a user asks to do something and you're not sure of the exact flow. Covers: send crypto, withdraw to M-Pesa, buy crypto, bridge, vault, check balance, login, KYC, invoices, WalletConnect, auto-swap, and more.",
  { task: z.string().describe("What the user wants to do, e.g. 'send USDC', 'withdraw to M-Pesa', 'check balance', 'bridge tokens', 'deposit to vault', 'create invoice', 'sign up'") },
  async ({ task }) => {
    const t = task.toLowerCase();

    const flows: Record<string, string> = {
      setup: `## Setup Flow
1. Call rift_set_api_key with the user's API key (starts with sk_)
2. Call rift_send_otp with the user's email or phone
3. Ask user for the OTP code they received
4. Call rift_login with email/phone + otpCode (or externalId + password)
5. Done — all authenticated tools now work

If user doesn't have an API key, they need to create a project first.`,

      send: `## Send Crypto Flow
Prerequisites: user must be logged in (rift_login)

1. Call rift_get_balance to check user has enough funds
2. Confirm with user: recipient address, amount, token, chain
3. Call rift_send_otp to send a fresh OTP for transaction auth
4. Ask user for the OTP code
5. Call rift_send_crypto with:
   - to, value, token, chain, type: "gasless"
   - email + otpCode (for email users) OR externalId + password (for password users)
6. Return the transaction hash to the user

Common tokens: USDC, USDT. Common chains: BASE, POLYGON, ARBITRUM.
Gasless = no gas fees for the user.`,

      offramp: `## Withdraw to Fiat (Offramp) Flow
Prerequisites: user must be logged in, merchant-approved, KYC verified (for >$20)

1. Ask user: how much to withdraw, which currency (KES, NGN, UGX, GHS, ETB, CDF, TZS, MWK, BRL)
2. Call rift_preview_exchange_rate with type: "offramp" AND the amount — shows rate + feeBreakdown
3. Call rift_get_payment_methods with currency — returns valid bankCode and institution values
4. Ask user for recipient details. The recipient JSON structure depends on the currency:

   KES M-Pesa: {"type":"MOBILE","accountIdentifier":"+254...","institution":"Safaricom"}
   KES Paybill: {"type":"PAYBILL","accountIdentifier":"shortcode","accountNumber":"acct","institution":"Safaricom"}
   NGN Bank: {"bankCode":"GTBINGLA","accountIdentifier":"0123456789","accountName":"Name","institution":"GTBank"}
   UGX Mobile: {"bankCode":"MOMOUGPC","accountIdentifier":"+256...","accountName":"Name","institution":"MTN"}
   GHS Mobile: {"bankCode":"MOMOGHPC","accountIdentifier":"+233...","accountName":"Name","institution":"MTN"}
   ETB Mobile: {"bankCode":"TELEBPC","accountIdentifier":"+251...","accountName":"Name","institution":"Telebirr"}
   TZS Mobile: {"bankCode":"TIGOTZPC","accountIdentifier":"+255...","accountName":"Name","institution":"Vodacom"}
   BRL PIX: {"bankCode":"PIXKBRPC","accountIdentifier":"pix_key","accountName":"Name","institution":"pix"}

5. Confirm everything with user (amount, fee, what they'll receive in fiat)
6. Call rift_send_otp to send OTP for transaction auth
7. Ask user for OTP code
8. Call rift_offramp with: token, amount (or localAmount for exact fiat payout), currency, chain, recipient (JSON string), otpCode
9. Return transaction code, poll with rift_poll_offramp_status

Providers: KES uses Pretium (supports M-Pesa/Paybill/BuyGoods). NGN/UGX/GHS/ETB/CDF/TZS/MWK/BRL use Paycrest.
Supported chains: BASE, ARBITRUM, POLYGON, ETHEREUM, CELO. Tokens: USDC, USDT.
Use localAmount instead of amount to guarantee exact fiat payout.
IMPORTANT: Do NOT use an onramp rate for offramp.`,

      onramp: `## Buy Crypto (Onramp) Flow
Prerequisites: user must be logged in, merchant-approved, KYC verified (for >$20)

1. Ask user: how much local currency to spend, which crypto/chain
2. Call rift_preview_exchange_rate with type: "onramp" — show the rate
3. Confirm with user
4. Call rift_buy_crypto with shortcode, amount, chain, asset, mobile_network, country_code
5. Return the result — user will receive a mobile money prompt
6. Poll with rift_get_onramp_status

No OTP required for onramp.
IMPORTANT: Do NOT use an offramp rate for onramp. Always set type="onramp".`,

      bridge: `## Bridge Tokens Cross-Chain Flow
Prerequisites: user must be logged in

1. Call rift_get_bridge_routes to see available routes
2. Call rift_bridge_quote to get fee and output amount — show to user
3. Confirm with user
4. Call rift_bridge_execute with sourceChain, destinationChain, token, amount
5. Return transaction hash — tokens arrive in 1-5 minutes

No OTP required for bridge.
Supported tokens: USDC, USDT.`,

      vault: `## Vault (Yield) Flow
Prerequisites: user must be logged in, smart wallet must be whitelisted

1. Check stats: call rift_search_docs with query "vault" for SDK methods
2. For vault operations, use the Rift SDK directly (vault is accessed through the SDK, not the API wrapper)
3. User can deposit USDC, withdraw, claim rewards, check balance

The vault is on Base network. Deposits are gasless. Withdrawals and claims are queued and batch-processed daily.`,

      balance: `## Check Balance Flow
Prerequisites: user must be logged in

1. Call rift_get_balance — returns all balances across all chains
2. Or call rift_get_balance with chain: "BASE" for a specific chain
3. Or call rift_get_balance with token: "USDC" for a specific token across chains
4. Show the balances to the user in a readable format`,

      invoice: `## Create Invoice Flow
Prerequisites: user must be logged in, KYC verified (for >$20)

1. Ask user: description, amount, token, chain, recipient email
2. Call rift_create_invoice with details
3. Return the invoice URL to the user — they can share it for payment

No OTP required for invoice creation.`,

      kyc: `## KYC Verification Flow
1. Call rift_kyc_status with email/phone to check current status
2. If not verified, call rift_kyc_get_token with country_code and identifier
3. Return the verificationUrl to the user — they complete verification there
4. Poll with rift_kyc_job_status or rift_kyc_is_verified to check when done

KYC is required for: offramp/onramp above $20, vault deposits/withdrawals.
Providers: SmileID (Africa), Sumsub (global).`,

      walletconnect: `## WalletConnect Flow
Prerequisites: user must be logged in

1. User provides a WalletConnect URI (starts with wc:)
2. Call rift_wc_pair with uri and chain
3. When DApp sends a request, call rift_wc_get_requests to see pending ones
4. Show request details to user and ask to approve or reject
5. Call rift_wc_approve or rift_wc_reject with the request ID
6. To disconnect: call rift_wc_disconnect with the session topic`,

      autoswap: `## Auto-Swap Configuration
Prerequisites: user must be logged in

Auto-swap automatically bridges incoming USDC/USDT to a preferred chain.

To enable:
1. Call rift_update_user with autoSwapEnabled: true, autoSwapTargetChain: "BASE" (or ARBITRUM/POLYGON/ETHEREUM)

To check current config:
1. Call rift_get_user — look at autoSwapEnabled and autoSwapTargetChain fields

To disable:
1. Call rift_update_user with autoSwapEnabled: false

Only USDC and USDT are auto-swapped. Other tokens stay on the receiving chain.`,

      signup: `## Create Account Flow
1. Call rift_set_api_key if not already set
2. Call rift_signup with externalId, password, email (optional), displayName
3. Account created — smart wallets deployed on all chains
4. Then login with rift_send_otp + rift_login (or externalId + password via rift_login)`,

      recovery: `## Account Recovery Flow
1. Call rift_get_recovery_options with the user's externalId
2. Shows available recovery methods (masked email/phone)
3. Call rift_request_password_reset with externalId and method ("emailRecovery" or "phoneRecovery")
4. User receives OTP on recovery email/phone
5. Call rift_reset_password with username, newPassword, email/phoneNumber, otpCode`,

      signer: `## Sign Transactions Flow
Prerequisites: user must be logged in

For signing raw transactions or messages:
1. Call rift_get_wallet_instance with chain to get wallet address and info
2. Call rift_sign_transaction to sign without broadcasting
3. Call rift_send_transaction to sign AND broadcast
4. Call rift_sign_message for arbitrary message signing (e.g. for DApp authentication)`,

      suspend: `## User Management Flow
For project admins to manage users:

1. Call rift_suspend_user with email/phone/externalId and reason
2. Call rift_get_suspended_users to list all suspended users
3. Call rift_get_user_status to check a specific user
4. Call rift_unsuspend_user to restore access`,
    };

    // Match the task to a flow
    let matched: string | undefined;
    if (t.includes("send") || t.includes("transfer") || t.includes("pay someone")) matched = flows.send;
    else if (t.includes("withdraw") || t.includes("offramp") || t.includes("cash out") || t.includes("mpesa") || t.includes("m-pesa") || t.includes("bank") || t.includes("fiat")) matched = flows.offramp;
    else if (t.includes("buy") || t.includes("onramp") || t.includes("purchase") || t.includes("deposit fiat") || t.includes("top up")) matched = flows.onramp;
    else if (t.includes("bridge") || t.includes("cross-chain") || t.includes("move") || t.includes("cross chain")) matched = flows.bridge;
    else if (t.includes("vault") || t.includes("yield") || t.includes("deposit usdc") || t.includes("earn")) matched = flows.vault;
    else if (t.includes("balance") || t.includes("check") || t.includes("how much") || t.includes("wallet")) matched = flows.balance;
    else if (t.includes("invoice") || t.includes("bill") || t.includes("merchant")) matched = flows.invoice;
    else if (t.includes("kyc") || t.includes("verify") || t.includes("identity")) matched = flows.kyc;
    else if (t.includes("walletconnect") || t.includes("dapp") || t.includes("connect")) matched = flows.walletconnect;
    else if (t.includes("auto-swap") || t.includes("autoswap") || t.includes("auto swap") || t.includes("consolidate")) matched = flows.autoswap;
    else if (t.includes("sign up") || t.includes("signup") || t.includes("register") || t.includes("create account")) matched = flows.signup;
    else if (t.includes("login") || t.includes("log in") || t.includes("authenticate") || t.includes("setup") || t.includes("get started")) matched = flows.setup;
    else if (t.includes("recover") || t.includes("forgot") || t.includes("reset password")) matched = flows.recovery;
    else if (t.includes("sign") || t.includes("signer") || t.includes("raw transaction")) matched = flows.signer;
    else if (t.includes("suspend") || t.includes("ban") || t.includes("block user") || t.includes("manage user")) matched = flows.suspend;

    if (matched) {
      return ok(matched);
    }

    // Fallback: return all flows as a summary
    return ok(`## Available Rift Operations

I can help with any of these. Tell me what you need:

- **Send crypto** — send USDC/USDT to any address (gasless)
- **Withdraw to fiat** — cash out to M-Pesa, bank transfer (KES, NGN, UGX, GHS, ETB, CDF)
- **Buy crypto** — purchase USDC with mobile money
- **Bridge** — move tokens cross-chain (Arbitrum, Base, Polygon, Ethereum, etc.)
- **Vault** — deposit USDC for yield on Base
- **Check balance** — see all token balances across chains
- **Create invoice** — invoice customers for crypto payment
- **KYC verification** — identity verification for compliance
- **WalletConnect** — connect to DApps
- **Auto-swap** — automatically bridge incoming tokens to preferred chain
- **Sign up / Login** — create account or authenticate
- **Account recovery** — reset password via recovery methods
- **Sign transactions** — sign or send raw blockchain transactions
- **User management** — suspend/unsuspend users (admin)

Current status:
- API Key: ${client.hasApiKey() ? "set" : "NOT SET — need to call rift_set_api_key"}
- Logged in: ${client.isAuthenticated() ? "yes" : "no — need to call rift_login"}`);
  }
);

// ============================================
// DOCS
// ============================================

server.tool(
  "rift_search_docs",
  "Search Rift Finance SDK/API documentation. Returns method signatures, code examples, and auth requirements.",
  { query: z.string().describe("What you want to look up (e.g. 'send USDC', 'offramp', 'vault deposit')") },
  async ({ query }) => {
    const words = query.toLowerCase().split(/\s+/);
    const results: string[] = [];
    for (const service of SDK_SERVICES) {
      const svcText = `${service.name} ${service.description}`.toLowerCase();
      for (const method of service.methods) {
        const fullText = `${svcText} ${method.name} ${method.description} ${method.example}`.toLowerCase();
        if (words.filter(w => fullText.includes(w)).length > 0) {
          results.push(`## ${service.sdkAccessor}.${method.name}()\n**${method.description}**\nAuth: ${method.auth === "none" ? "API key only" : "JWT required"}\n\`\`\`typescript\n${method.example}\n\`\`\``);
        }
      }
    }
    return results.length ? ok(results.slice(0, 8).join("\n\n---\n\n")) : ok(`No results for "${query}". Try: auth, wallet, transactions, offramp, onramp, bridge, vault, kyc, walletconnect, merchant, notifications, signer, assets`);
  }
);

server.tool(
  "rift_get_api_endpoints",
  "Get REST API endpoint details for a service group. Returns methods, paths, auth requirements, and request body schemas.",
  { service: z.string().describe("Service: auth, wallet, transaction, offramp, onramp, bridge, kyc, walletconnect, merchant, notifications, signer, assets, users, deposits") },
  async ({ service }) => {
    const endpoints = API_ENDPOINTS[service.toLowerCase()];
    if (!endpoints) return ok(`Unknown. Available: ${Object.keys(API_ENDPOINTS).join(", ")}`);
    const lines = endpoints.map(ep => {
      let info = `**${ep.method} ${ep.path}** — ${ep.description} (Auth: ${ep.auth})\n`;
      if (ep.requestBody) info += `Body: \`${JSON.stringify(ep.requestBody)}\`\n`;
      if (ep.queryParams) info += `Query: \`${JSON.stringify(ep.queryParams)}\`\n`;
      return info;
    });
    return ok(lines.join("\n"));
  }
);

server.tool(
  "rift_get_supported_chains",
  "Get all supported blockchains (with chain IDs), tokens, and fiat currencies with payment methods.",
  {},
  async () => {
    const chains = SUPPORTED_CHAINS.map(c => `${c.name} (ID:${c.id}) — ${c.native}, ${c.stablecoins.join("/")}`).join("\n");
    const currencies = SUPPORTED_CURRENCIES.map(c => `${c.code} (${c.country}) — ${c.methods.join(", ")}`).join("\n");
    return ok(`Chains:\n${chains}\n\nFiat:\n${currencies}\n\nChainName values: ARBITRUM, BASE, OPTIMISM, ETHEREUM, LISK, BNB, POLYGON, BERACHAIN, CELO\nTokenSymbol values: USDC, USDT, ETH, BTC, WBERA, LSK, BNB, MATIC, SAIL, cUSD`);
  }
);

// ============================================
// SETUP & CONFIG
// ============================================

server.tool(
  "rift_set_api_key",
  "Set the Rift project API key. MUST be called before any other live tool if no key is configured. The key starts with 'sk_'. Ask the user for it if you don't have it.",
  { apiKey: z.string().describe("Rift API key starting with sk_") },
  async ({ apiKey }) => {
    if (!apiKey.startsWith("sk_")) return ok("Warning: Rift API keys typically start with 'sk_'. Setting it anyway, but double-check with the user.");
    client.setApiKey(apiKey);
    return ok(`API key set (${apiKey.slice(0, 8)}...). Next: call rift_send_otp to send an OTP for login, or rift_login if user has externalId+password.`);
  }
);

server.tool(
  "rift_set_api_url",
  "Override the Rift API URL. Only needed if using a custom deployment (not the default).",
  { url: z.string().describe("API base URL") },
  async ({ url }) => {
    client.setBaseUrl(url);
    return ok(`API URL set to ${url}`);
  }
);

server.tool(
  "rift_status",
  "Check current connection and auth status. Call this if you're unsure whether the user is logged in or the API key is set.",
  {},
  async () => {
    return ok(`API URL: ${client.getBaseUrl()}\nAPI Key: ${client.hasApiKey() ? `${client.getApiKey().slice(0, 8)}...` : "NOT SET — call rift_set_api_key"}\nLogged in: ${client.isAuthenticated() ? "yes" : "no — call rift_send_otp then rift_login"}`);
  }
);

// ============================================
// AUTH — Signup, OTP, Login, Logout
// ============================================

server.tool(
  "rift_signup",
  "Create a new Rift user account. After signup, the user needs to login separately via rift_login.",
  {
    externalId: z.string().describe("Unique user ID in your system"),
    password: z.string().describe("User password"),
    email: z.string().optional().describe("User email — enables email OTP login"),
    phoneNumber: z.string().optional().describe("User phone — enables phone OTP login"),
    displayName: z.string().describe("Display name"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/auth/signup", { body: args }), "User created! Next: call rift_send_otp and rift_login to authenticate."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_send_otp",
  "Send a one-time password to user's email or phone. Call this BEFORE: (1) rift_login — to authenticate, (2) rift_send_crypto — to authorize a transaction, (3) rift_offramp — to authorize a withdrawal. The user receives the code via SMS or email and must tell you the code.",
  {
    email: z.string().optional().describe("Send OTP to this email"),
    phone: z.string().optional().describe("Send OTP to this phone number (with country code e.g. +254...)"),
  },
  async (args) => {
    try {
      const body = args.email ? { email: args.email } : { phone: args.phone };
      const result = await client.request("POST", "/api/v1/auth/otp/send", { body });
      const target = args.email || args.phone;
      return ok(`OTP sent to ${target}! Ask the user for the code they received.`);
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_verify_otp",
  "Verify an OTP code WITHOUT logging in. Rarely needed — for login, use rift_login directly (it verifies OTP internally). For transactions/offramp, pass otpCode directly to rift_send_crypto/rift_offramp. Only use this for standalone OTP checks.",
  {
    email: z.string().optional().describe("Email the OTP was sent to"),
    phone: z.string().optional().describe("Phone the OTP was sent to"),
    code: z.string().describe("The OTP code from the user"),
  },
  async (args) => {
    try {
      const body = args.email ? { email: args.email, code: args.code } : { phone: args.phone, code: args.code };
      return json(await client.request("POST", "/api/v1/auth/otp/verify", { body }), "OTP verified!");
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_login",
  "Login to Rift. Stores the session so all authenticated tools work. Three methods: (1) email + otpCode — call rift_send_otp first, (2) phoneNumber + otpCode — call rift_send_otp first, (3) externalId + password — no OTP needed. After login, you do NOT need to login again for subsequent tool calls in this session.",
  {
    email: z.string().optional().describe("Email (pair with otpCode)"),
    phoneNumber: z.string().optional().describe("Phone (pair with otpCode)"),
    externalId: z.string().optional().describe("External ID (pair with password)"),
    otpCode: z.string().optional().describe("OTP code from rift_send_otp"),
    password: z.string().optional().describe("Password (pair with externalId)"),
  },
  async (args) => {
    try {
      const body: any = {};
      if (args.email) { body.email = args.email; body.otpCode = args.otpCode; }
      else if (args.phoneNumber) { body.phoneNumber = args.phoneNumber; body.otpCode = args.otpCode; }
      else if (args.externalId) { body.externalId = args.externalId; body.password = args.password; }
      const result = await client.request<any>("POST", "/api/v1/auth/login", { body });
      client.setBearerToken(result.accessToken);
      return ok(`Logged in! Address: ${result.address}\nAll authenticated tools now work. You do NOT need to login again this session.`);
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_logout",
  "Logout and clear the session. After this, user must login again to use authenticated tools.",
  {},
  async () => {
    try { await client.request("POST", "/api/v1/auth/logout").catch(() => {}); } catch {}
    client.clearBearerToken();
    return ok("Logged out. Session cleared.");
  }
);

server.tool(
  "rift_get_user",
  "Get the logged-in user's profile. Returns: email, phone, displayName, address (smart wallet), autoSwapEnabled, autoSwapTargetChain, and more. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/auth/user/me")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_update_user",
  "Update user profile. Can change display name, email, notification email, and auto-swap settings. Requires login.",
  {
    displayName: z.string().optional().describe("New display name"),
    email: z.string().optional().describe("New email"),
    phoneNumber: z.string().optional().describe("New phone"),
    notificationEmail: z.string().optional().describe("Email for notifications (separate from login email)"),
    autoSwapEnabled: z.boolean().optional().describe("Enable/disable auto-swap (auto-bridge incoming USDC/USDT to target chain)"),
    autoSwapTargetChain: z.string().optional().describe("Target chain for auto-swap: BASE, ARBITRUM, POLYGON, or ETHEREUM"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      const body: any = {};
      Object.entries(args).forEach(([k, v]) => { if (v !== undefined) body[k] = v; });
      return json(await client.request("PUT", "/api/v1/auth/user/update", { body }), "User updated!");
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_delete_user",
  "PERMANENTLY delete user account and all data. DESTRUCTIVE — confirm with user TWICE before calling.",
  {
    externalId: z.string().optional(),
    password: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    otpCode: z.string().optional(),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("DELETE", "/api/v1/auth/user/delete", { body: args }), "User deleted."); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// ACCOUNT RECOVERY
// ============================================

server.tool(
  "rift_create_recovery",
  "Set up account recovery methods (email and/or phone). User can later reset their password via these methods. Requires login + OTP.",
  {
    externalId: z.string(),
    password: z.string(),
    emailRecovery: z.string().optional().describe("Recovery email address"),
    phoneRecovery: z.string().optional().describe("Recovery phone number"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/auth/recovery/create", { body: args }), "Recovery methods created!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_recovery_options",
  "Get available recovery options for a user. Shows masked email/phone. Does NOT require login — for users who are locked out.",
  { externalId: z.string().describe("The user's external ID") },
  async ({ externalId }) => {
    try { return json(await client.request("GET", `/api/v1/auth/recovery/options/${externalId}`)); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_request_password_reset",
  "Start password reset flow. Sends OTP to recovery email or phone. Does NOT require login.",
  {
    externalId: z.string(),
    method: z.enum(["emailRecovery", "phoneRecovery"]).describe("Which recovery method to use"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/auth/recovery/request-reset", { body: args }), "Reset OTP sent to recovery contact. Ask user for the code, then call rift_reset_password."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_reset_password",
  "Complete password reset with OTP from recovery method. Does NOT require login.",
  {
    username: z.string().describe("External ID"),
    newPassword: z.string().describe("New password"),
    email: z.string().optional().describe("Recovery email (if using email recovery)"),
    phoneNumber: z.string().optional().describe("Recovery phone (if using phone recovery)"),
    otpCode: z.string().describe("OTP code from recovery email/phone"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/auth/recovery/reset-password", { body: args }), "Password reset! User can now login with their new password via rift_login."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_update_recovery",
  "Update existing recovery methods. Requires login + externalId/password for verification (verifyOtp middleware).",
  {
    externalId: z.string().describe("User external ID"),
    password: z.string().describe("User password (required by verifyOtp middleware)"),
    emailRecovery: z.string().optional().describe("New recovery email"),
    phoneRecovery: z.string().optional().describe("New recovery phone"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("PUT", "/api/v1/auth/recovery/update", { body: args }), "Recovery methods updated!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_add_recovery_method",
  "Add a new recovery method (email or phone). Requires login + externalId/password for verification.",
  {
    externalId: z.string().describe("User external ID"),
    password: z.string().describe("User password (required by verifyOtp middleware)"),
    method: z.enum(["emailRecovery", "phoneRecovery"]).describe("Type of recovery method to add"),
    value: z.string().describe("Email address or phone number"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/auth/recovery/add-method", { body: args }), "Recovery method added!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_remove_recovery_method",
  "Remove a recovery method. Requires login + externalId/password for verification.",
  {
    externalId: z.string().describe("User external ID"),
    password: z.string().describe("User password (required by verifyOtp middleware)"),
    method: z.enum(["emailRecovery", "phoneRecovery"]).describe("Type of recovery method to remove"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("DELETE", "/api/v1/auth/recovery/remove-method", { body: args }), "Recovery method removed."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_update_recovery_method",
  "Update the value of an existing recovery method. Requires login + externalId/password.",
  {
    externalId: z.string().describe("User external ID"),
    password: z.string().describe("User password (required by verifyOtp middleware)"),
    method: z.enum(["emailRecovery", "phoneRecovery"]).describe("Which method to update"),
    value: z.string().describe("New email or phone number"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("PUT", "/api/v1/auth/recovery/update-method", { body: args }), "Recovery method updated!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_my_recovery_methods",
  "Get the current user's recovery methods. Requires login + externalId/password for verification.",
  {
    externalId: z.string().describe("User external ID"),
    password: z.string().describe("User password (required by verifyOtp middleware)"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/auth/recovery/my-methods", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_delete_all_recovery",
  "Delete ALL recovery methods. DESTRUCTIVE — confirm with user. Requires login + externalId/password.",
  {
    externalId: z.string().describe("User external ID"),
    password: z.string().describe("User password (required by verifyOtp middleware)"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("DELETE", "/api/v1/auth/recovery/delete-all", { body: args }), "All recovery methods deleted."); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// WALLET & BALANCE
// ============================================

server.tool(
  "rift_get_balance",
  "Get wallet balance. Returns crypto balances (USDC, USDT, ETH, etc), NOT fiat amounts. Call with no params for all balances across all chains. To display in local fiat: call rift_preview_exchange_rate with type='offramp', then multiply USDC balance × buying_rate. Requires login.",
  {
    chain: z.string().optional().describe("Filter by chain: BASE, POLYGON, ARBITRUM, ETHEREUM, LISK, BNB, BERACHAIN, CELO"),
    token: z.string().optional().describe("Filter by token: USDC, USDT, ETH, BTC, etc"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      if (args.token) {
        const params: Record<string, string> = { token: args.token };
        if (args.chain) params.chain = args.chain;
        return json(await client.request("GET", "/api/v1/wallet/token-balance", { params }));
      } else {
        const params: Record<string, string> = {};
        if (args.chain) params.chain = args.chain;
        return json(await client.request("GET", "/api/v1/wallet/chain-balance", { params }));
      }
    } catch (e: any) { return err(e); }
  }
);

// ============================================
// TRANSACTIONS
// ============================================

server.tool(
  "rift_send_crypto",
  "Send crypto to an address. REAL TRANSACTION — always confirm with user first. Requires OTP or password: for email/phone users, call rift_send_otp FIRST to get a fresh OTP. For externalId users, ask for password. Requires login.",
  {
    to: z.string().describe("Recipient wallet address (0x...)"),
    value: z.string().describe("Amount to send (e.g. '10' for 10 USDC)"),
    token: z.string().describe("Token: USDC, USDT, ETH, etc"),
    chain: z.string().describe("Chain: BASE, POLYGON, ARBITRUM, etc"),
    type: z.enum(["gasless", "normal"]).default("gasless").describe("gasless = no gas fee for user (recommended)"),
    email: z.string().optional().describe("Sender's email — for email-signup users (with otpCode)"),
    phoneNumber: z.string().optional().describe("Sender's phone — for phone-signup users (with otpCode)"),
    externalId: z.string().optional().describe("Sender's external ID — for externalId-signup users (with password)"),
    otpCode: z.string().optional().describe("Fresh OTP code from rift_send_otp — required for email/phone users"),
    password: z.string().optional().describe("Password — required for externalId users"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/transaction/send", { body: args }), "Transaction sent!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_transaction_history",
  "Get on-chain transaction history (sends/receives). For offramp order history, use rift_get_offramp_orders. For onramp order history, use rift_get_onramp_orders. Requires login.",
  {
    limit: z.number().optional().describe("Number of transactions (default 10)"),
    page: z.number().optional().describe("Page number"),
    token: z.string().optional().describe("Filter by token"),
    chain: z.string().optional().describe("Filter by chain"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      const params: Record<string, string> = {};
      if (args.limit) params.limit = String(args.limit);
      if (args.page) params.page = String(args.page);
      if (args.token) params.token = args.token;
      if (args.chain) params.chain = args.chain;
      return json(await client.request("GET", "/api/v1/transaction/history", { params }));
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_transaction_fee",
  "Calculate the gas/network fee for sending crypto (rift_send_crypto). This is the on-chain transaction fee, NOT the offramp/exchange fee. For offramp fees, use rift_preview_exchange_rate with amount and type='offramp'. Requires login.",
  {
    recipient: z.string().describe("Recipient address"),
    amount: z.string().describe("Amount to send"),
    chain: z.string().describe("Chain"),
    token: z.string().describe("Token"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/transaction/fee", { params: args })); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// OFFRAMP (Crypto → Fiat)
// ============================================

server.tool(
  "rift_preview_exchange_rate",
  `Preview exchange rate. IMPORTANT: offramp and onramp rates are DIFFERENT — always set type correctly.

Rate fields explained:
- buying_rate = OFFRAMP/withdrawal rate — fiat per USDC when cashing out. Multiply USDC × buying_rate to get fiat the user receives.
- selling_rate = ONRAMP/deposit rate — fiat per USDC when buying crypto. User pays this much fiat per USDC.

To show a user's balance in local fiat: USDC balance × buying_rate.
To show how much USDC they get for fiat: fiat amount / selling_rate.

Pass an amount to get feeBreakdown with exact fee, feePercentage, userReceivesFiat, and totalUsdcNeeded.`,
  {
    currency: z.string().describe("Fiat currency: KES, NGN, UGX, GHS, ETB, CDF, TZS, MWK, BRL"),
    amount: z.number().optional().describe("Amount in USDC to preview"),
    type: z.enum(["offramp", "onramp"]).describe("MUST match operation: 'offramp' = selling crypto, 'onramp' = buying crypto"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/offramp/preview_exchange_rate", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_payment_methods",
  "Get supported banks and mobile money providers for a currency. Use the bankCode values from here in rift_offramp. E.g. for Kenya: MPESA for M-Pesa. Requires login.",
  { currency: z.string().describe("Currency code: KES, NGN, UGX, GHS, ETB, CDF, TZS, MWK, BRL") },
  async ({ currency }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", `/api/v1/offramp/payment_methods/${currency}`)); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_offramp",
  `Withdraw crypto to fiat. REAL PAYMENT — confirm with user. Requires: login + merchant approval + KYC (>$20) + OTP/password.

WARNING: This call can take 30-60+ seconds (on-chain tx + fiat settlement). A timeout does NOT mean failure — always check rift_poll_offramp_status with the transactionCode to confirm the actual status.

The 'recipient' field is a JSON string whose structure depends on the currency:

KES (Kenya Mobile — Pretium): {"type":"MOBILE","accountIdentifier":"+254...","institution":"Safaricom"} — accountName is NOT required for KES/M-Pesa
KES (Kenya Paybill): {"type":"PAYBILL","accountIdentifier":"shortcode","accountNumber":"acct_num","institution":"Safaricom"}
NGN (Nigeria Bank — Paycrest): {"bankCode":"GTBINGLA","accountIdentifier":"0123456789","accountName":"John Doe","institution":"GTBank"}
UGX (Uganda Mobile): {"bankCode":"MOMOUGPC","accountIdentifier":"+256...","accountName":"Name","institution":"MTN"}
GHS (Ghana Mobile): {"bankCode":"MOMOGHPC","accountIdentifier":"+233...","accountName":"Name","institution":"MTN"}
ETB (Ethiopia Mobile): {"bankCode":"TELEBPC","accountIdentifier":"+251...","accountName":"Name","institution":"Telebirr"}
CDF (Congo Mobile): {"bankCode":"OMONDFPC","accountIdentifier":"+243...","accountName":"Name","institution":"Orange Money"}
TZS (Tanzania Mobile): {"bankCode":"TIGOTZPC","accountIdentifier":"+255...","accountName":"Name","institution":"Vodacom"}
MWK (Malawi Mobile): {"bankCode":"AIRTMWPC","accountIdentifier":"+265...","accountName":"Name","institution":"Airtel"}
BRL (Brazil PIX): {"bankCode":"PIXKBRPC","accountIdentifier":"pix_key","accountName":"Name","institution":"pix"}

Call rift_get_payment_methods first to get valid bankCode and institution values for the user's currency.
Use amount (USDC) or localAmount (exact fiat payout). Use rift_preview_exchange_rate with type='offramp' to show rates/fees first.`,
  {
    token: z.string().default("USDC").describe("USDC or USDT"),
    amount: z.number().optional().describe("Amount in USDC to sell. Omit if using localAmount"),
    localAmount: z.number().optional().describe("Exact fiat amount user wants to RECEIVE (guarantees payout). Omit if using amount"),
    currency: z.string().describe("KES, NGN, UGX, GHS, ETB, CDF, TZS, MWK, BRL"),
    chain: z.string().default("BASE").describe("BASE, ARBITRUM, POLYGON, ETHEREUM, CELO"),
    recipient: z.string().describe("JSON string — structure depends on currency. See tool description for formats. Call rift_get_payment_methods to find valid bankCode/institution values"),
    otpCode: z.string().optional().describe("Fresh OTP — call rift_send_otp first. Required for email/phone users"),
    password: z.string().optional().describe("Password — required for externalId users"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      const body: any = {
        token: args.token, currency: args.currency, chain: args.chain,
        recipient: args.recipient,
      };
      if (args.amount) body.amount = args.amount;
      if (args.localAmount) body.localAmount = args.localAmount;
      if (args.otpCode) body.otpCode = args.otpCode;
      if (args.password) body.password = args.password;
      if (!args.amount && !args.localAmount) return ok("Error: provide either 'amount' (USDC) or 'localAmount' (fiat to receive). Use rift_preview_exchange_rate to check rates.");
      return json(await client.request("POST", "/api/v1/offramp/pay", { body }), "Offramp submitted! Use rift_poll_offramp_status to track the order.");
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_offramp_create_order",
  "DO NOT USE — use rift_offramp instead. This is a legacy endpoint that does the same thing. REAL PAYMENT — confirm with user.",
  {
    token: z.string().default("USDC").describe("USDC or USDT"),
    amount: z.number().optional().describe("Amount in USDC"),
    localAmount: z.number().optional().describe("Exact fiat payout amount"),
    currency: z.string().describe("KES, NGN, UGX, GHS, ETB, CDF, TZS, MWK, BRL"),
    chain: z.string().default("BASE").describe("BASE, ARBITRUM, POLYGON, ETHEREUM, CELO"),
    recipient: z.string().describe("JSON string — same format as rift_offramp. See rift_offramp description for per-currency structure"),
    otpCode: z.string().optional().describe("OTP code — required for email/phone users"),
    password: z.string().optional().describe("Password — required for externalId users"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/offramp/", { body: args }), "Offramp order created!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_send_payment_link",
  "Send an existing payment link URL to someone via SMS and/or email. This does NOT create a payment — it just delivers an existing URL. You need to have a payment link URL already (e.g. from an invoice). At least one of recipientPhone or recipientEmail is required. Requires login.",
  {
    paymentLink: z.string().describe("The payment URL to send"),
    message: z.string().describe("Message to include with the link"),
    recipientPhone: z.string().optional().describe("Phone number to send SMS to"),
    recipientEmail: z.string().optional().describe("Email to send to"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/offramp/send-payment-link", { body: args }), "Payment link sent!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_withdrawal_fee",
  "DO NOT USE THIS to show users their withdrawal fee — it only returns the raw KES buy/sell spread, not the actual fee on a withdrawal. Instead, use rift_preview_exchange_rate with an amount and type='offramp' — that returns feeBreakdown with the real fee, feePercentage, userReceivesFiat, and totalUsdcNeeded. This tool exists only for internal diagnostics.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      const result = await client.request("POST", "/api/v1/offramp/get-withdrawal-fee", { body: { amount: 0 } });
      return ok(`Raw KES spread: ${JSON.stringify(result, null, 2)}\n\nThis is NOT the user's withdrawal fee. To get the real fee for a specific withdrawal, call rift_preview_exchange_rate with amount and type="offramp" — it returns feeBreakdown.fee, feeBreakdown.feePercentage, feeBreakdown.userReceivesFiat.`);
    }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_poll_offramp_status",
  "Check the status of an offramp order. Call after rift_offramp. Status: PENDING → COMPLETED or FAILED. Requires login.",
  {
    transactionCode: z.string().describe("Transaction code from the offramp order"),
    currency: z.string().describe("Currency of the order"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/offramp/poll_order_status", { params: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_offramp_orders",
  "Get all past offramp orders for the user. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/offramp/get_orders")); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// ONRAMP (Fiat → Crypto)
// ============================================

server.tool(
  "rift_buy_crypto",
  "Buy crypto with mobile money (M-Pesa, etc). REAL PAYMENT — confirm with user. The 'amount' here is in LOCAL FIAT currency (e.g. 1000 = 1000 KES), NOT in USDC. Use rift_preview_exchange_rate with type='onramp' first to show how much USDC they'll get. Requires: login + merchant approval + KYC (for >$20). Does NOT require OTP. User receives a mobile money prompt on their phone.",
  {
    shortcode: z.string().describe("Payment shortcode e.g. MPESA_KE"),
    amount: z.number().describe("Amount in LOCAL FIAT currency (e.g. 1000 for 1000 KES) — NOT in USDC"),
    chain: z.string().default("BASE").describe("Destination chain for crypto"),
    asset: z.string().default("USDC").describe("Crypto to buy"),
    mobile_network: z.string().describe("Network: Safaricom, Airtel, MTN, Vodacom, Orange Money, Telebirr, TNM, etc"),
    country_code: z.string().describe("Country: KE, NG, UG, GH, ET, CD, TZ, MW, BR"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/onramp/", { body: args }), "Onramp initiated! User should receive a mobile money prompt. Track with rift_get_onramp_status."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_onramp_status",
  "Check status of a crypto purchase. Requires login.",
  { transactionCode: z.string().describe("Transaction code from rift_buy_crypto") },
  async ({ transactionCode }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/onramp/status", { body: { transactionCode } })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_onramp_orders",
  "Get onramp purchase history. Requires login.",
  { userId: z.string().describe("User ID") },
  async ({ userId }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", `/api/v1/onramp/orders/${userId}`)); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// BRIDGE
// ============================================

server.tool(
  "rift_get_bridge_routes",
  "Get available cross-chain bridge routes and supported tokens. No auth required.",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/bridge/routes")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_bridge_quote",
  "Get fee and output amount for a bridge transfer. Call before rift_bridge_execute to show user what they'll receive. No auth required.",
  {
    sourceChain: z.string().describe("Source chain: ARBITRUM, BASE, POLYGON, etc"),
    destinationChain: z.string().describe("Destination chain"),
    token: z.string().describe("USDC or USDT"),
    amount: z.string().describe("Amount to bridge"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/bridge/quote", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_bridge_execute",
  "Execute cross-chain bridge. MOVES REAL FUNDS — confirm with user. Does NOT require OTP. Tokens arrive in 1-5 minutes. Call rift_bridge_quote first to show fees. Requires login.",
  {
    sourceChain: z.string().describe("Source chain"),
    destinationChain: z.string().describe("Destination chain"),
    token: z.string().describe("USDC or USDT"),
    amount: z.string().describe("Amount to bridge"),
    recipient: z.string().optional().describe("Destination address (defaults to user's wallet on dest chain)"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/bridge/execute", { body: args }), "Bridge executed! Tokens arrive in 1-5 minutes."); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// KYC
// ============================================

server.tool(
  "rift_kyc_get_token",
  "Start KYC verification — returns a verification URL the user must visit. No auth required.",
  {
    country_code: z.string().describe("ISO country code: KE, NG, UG, GH, ET, etc"),
    identifier: z.string().describe("User's email, phone, or externalId"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/kyc/token", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_kyc_check_user_exists",
  "Check if a user exists and their KYC status. No auth required.",
  {
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    externalId: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/kyc/user-exists", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_kyc_status",
  "Check KYC verification status. Returns: verified, pending, failed, or provisional. No auth required.",
  {
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    externalId: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/kyc/status", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_kyc_verify",
  "Verify a specific KYC job by ID. Requires login.",
  { jobId: z.string() },
  async ({ jobId }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/kyc/verify", { body: { jobId } })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_kyc_is_verified",
  "Check if the currently logged-in user is KYC verified. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/kyc/verified")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_kyc_job_status",
  "Poll the status of a KYC verification job. Requires login.",
  { jobId: z.string() },
  async ({ jobId }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", `/api/v1/kyc/job/${jobId}`)); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// WALLETCONNECT
// ============================================

server.tool(
  "rift_wc_pair",
  "Pair with a DApp via WalletConnect. User provides a wc: URI (usually from a QR code). Requires login.",
  {
    uri: z.string().describe("WalletConnect URI starting with wc:"),
    chain: z.string().describe("Chain: BASE, ETHEREUM, POLYGON, ARBITRUM, CELO, etc"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/walletconnect/pair", { body: args }), "Paired with DApp!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_get_requests",
  "Get pending transaction requests from connected DApps. Show these to the user for approval. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/walletconnect/requests")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_approve",
  "Approve a pending DApp request. Always show the request details to user first. Requires login.",
  { id: z.string().describe("Request ID from rift_wc_get_requests") },
  async ({ id }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", `/api/v1/walletconnect/requests/${id}/approve`), "Request approved!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_reject",
  "Reject a pending DApp request. Requires login.",
  { id: z.string().describe("Request ID") },
  async ({ id }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", `/api/v1/walletconnect/requests/${id}/reject`), "Request rejected."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_sessions",
  "List active WalletConnect sessions. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/walletconnect/sessions")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_disconnect",
  "Disconnect from a DApp session. Requires login.",
  { topic: z.string().describe("Session topic from rift_wc_sessions") },
  async ({ topic }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("DELETE", `/api/v1/walletconnect/sessions/${topic}`), "Disconnected."); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// MERCHANT
// ============================================

server.tool(
  "rift_create_invoice",
  "Create a payment invoice and get a payment URL. No OTP required. KYC required for >$20. Requires login.",
  {
    description: z.string().describe("Invoice description (shown to payer)"),
    chain: z.string().describe("Chain: BASE, POLYGON, ARBITRUM, ETHEREUM, CELO, etc"),
    token: z.string().describe("Token: USDC, USDT"),
    amount: z.number().describe("Amount to invoice"),
    recipientEmail: z.string().optional().describe("Customer's email — sends invoice link"),
    recipientPhone: z.string().optional().describe("Customer's phone — sends invoice link via SMS"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/merchant/invoices", { body: args }), "Invoice created! Share the URL with the customer."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_invoices",
  "List invoices. Filter by status, date range, and sort order. Requires login.",
  {
    status: z.string().optional().describe("PENDING, COMPLETED, or EXPIRED"),
    sortBy: z.string().optional().describe("createdAt, updatedAt, or paidAt"),
    sortOrder: z.string().optional().describe("asc or desc"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      const params: Record<string, string> = {};
      if (args.status) params.status = args.status;
      if (args.sortBy) params.sortBy = args.sortBy;
      if (args.sortOrder) params.sortOrder = args.sortOrder;
      return json(await client.request("GET", "/api/v1/merchant/invoices", { params }));
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_merchant_status",
  "Check if the user's account has merchant (KYB) approval. Required for offramp/onramp operations. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/merchant/status")); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// NOTIFICATIONS
// ============================================

server.tool(
  "rift_notifications_register",
  "Register a device for push notifications. Requires login.",
  {
    subscriberId: z.string().describe("Unique device/subscriber ID"),
    platform: z.string().optional().describe("web or mobile"),
    deviceInfo: z.string().optional().describe("Device description"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/notifications/register", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_notifications_send",
  "Send a push notification to all of the user's registered devices. Requires login.",
  {
    message: z.string().describe("Notification body"),
    title: z.string().optional().describe("Notification title"),
    targetUrl: z.string().optional().describe("URL to open when tapped"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/notifications/send", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_notifications_subscriptions",
  "Get or delete all notification subscriptions. Requires login.",
  { action: z.enum(["get", "delete"]).default("get").describe("'get' to list, 'delete' to remove all") },
  async ({ action }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      if (action === "delete") return json(await client.request("DELETE", "/api/v1/notifications/subscriptions"), "All subscriptions deleted.");
      return json(await client.request("GET", "/api/v1/notifications/subscriptions"));
    } catch (e: any) { return err(e); }
  }
);

// ============================================
// SIGNER / PROXY WALLET
// ============================================

server.tool(
  "rift_get_wallet_instance",
  "Get wallet address and details for a specific chain. Requires login.",
  { chain: z.string().describe("Chain: BASE, POLYGON, ARBITRUM, ETHEREUM, etc") },
  async ({ chain }) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/signer/get-wallet-instance", { body: { chain } })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_sign_transaction",
  "Sign a raw blockchain transaction WITHOUT broadcasting it (low-level). This is NOT for sending tokens — use rift_send_crypto for that. Returns signed tx data for manual submission. Requires login.",
  {
    chain: z.string().describe("Chain"),
    to: z.string().optional().describe("Contract/recipient address"),
    value: z.string().optional().describe("Value in wei"),
    data: z.string().optional().describe("Encoded contract call data (hex)"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      const { chain, ...txData } = args;
      return json(await client.request("POST", "/api/v1/signer/sign-transaction", { body: { chain, transactionData: txData } }));
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_send_transaction",
  "Sign AND broadcast a raw blockchain transaction (low-level). This is NOT for sending tokens to someone — use rift_send_crypto for that. This is for advanced use: calling smart contracts, sending ETH, etc. REAL TX — confirm with user. Requires login.",
  {
    chain: z.string().describe("Chain"),
    to: z.string().optional().describe("Contract/recipient address"),
    value: z.string().optional().describe("Value in wei"),
    data: z.string().optional().describe("Encoded contract call data (hex)"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try {
      const { chain, ...txData } = args;
      return json(await client.request("POST", "/api/v1/signer/send-transaction", { body: { chain, transactionData: txData } }), "Transaction broadcast!");
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_sign_message",
  "Sign an arbitrary message with the user's private key. Used for DApp authentication, off-chain signatures, etc. Requires login.",
  {
    chain: z.string().describe("Chain to use for signing"),
    message: z.string().describe("Message to sign"),
  },
  async (args) => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("POST", "/api/v1/signer/sign-message", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// ASSETS
// ============================================

server.tool(
  "rift_get_tokens",
  "Get the list of supported token TYPES (metadata: name, contract address, chain). This is NOT balances — use rift_get_balance for balances. No auth required.",
  { chainId: z.string().optional().describe("Chain ID to filter (e.g. '8453' for Base, '137' for Polygon)") },
  async ({ chainId }) => {
    try {
      const path = chainId ? `/api/v1/assets/tokens/chain/${chainId}` : "/api/v1/assets/tokens";
      return json(await client.request("GET", path));
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_user_tokens",
  "Get the list of token TYPES the user has interacted with (metadata, not balances). For actual balances, use rift_get_balance. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/assets/tokens/user")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_chains",
  "Get supported chains or details for a specific chain. No auth required.",
  { chainId: z.string().optional().describe("Specific chain ID, or omit for all chains") },
  async ({ chainId }) => {
    try {
      const path = chainId ? `/api/v1/assets/chains/${chainId}` : "/api/v1/assets/supported-chains";
      return json(await client.request("GET", path));
    } catch (e: any) { return err(e); }
  }
);

// ============================================
// USER MANAGEMENT (Admin)
// ============================================

server.tool(
  "rift_suspend_user",
  "Suspend a user from the platform. Admin operation. Requires API key.",
  {
    email: z.string().optional().describe("User email"),
    phoneNumber: z.string().optional().describe("User phone"),
    externalId: z.string().optional().describe("User external ID"),
    userId: z.string().optional().describe("User database ID"),
    reason: z.string().optional().describe("Reason for suspension"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/users/suspend", { body: args }), "User suspended."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_unsuspend_user",
  "Unsuspend a previously suspended user. Admin operation.",
  {
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    externalId: z.string().optional(),
    userId: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/users/unsuspend", { body: args }), "User unsuspended."); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_suspended_users",
  "List all suspended users. Admin operation.",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/users/suspended")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_user_status",
  "Check if a specific user is suspended. Admin operation.",
  {
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    externalId: z.string().optional(),
    userId: z.string().optional(),
  },
  async (args) => {
    try {
      const params: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { if (v) params[k] = v; });
      return json(await client.request("GET", "/api/v1/users/status", { params }));
    } catch (e: any) { return err(e); }
  }
);

// ============================================
// DEPOSITS
// ============================================

server.tool(
  "rift_get_deposits",
  "Get onchain deposit history for the user (queried live from The Graph). Shows inbound transfers to the user's smart wallets with USDC amounts, KES conversion, sender address, tx hash, and timestamp. This is NOT a balance check — use rift_get_balance for current balances. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/deposits/")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_deposit_stats",
  "Get deposit statistics: totalDeposits (count), totalUsdcAmount, totalKesAmount, plus the full deposits list. Summary of all onchain deposits to the user's wallets. Requires login.",
  {},
  async () => {
    const authErr = requireAuth();
    if (authErr) return ok(authErr);
    try { return json(await client.request("GET", "/api/v1/deposits/stats")); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// START
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

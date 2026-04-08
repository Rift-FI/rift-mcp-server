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

// Helper to format JSON results
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function err(e: any) {
  return { content: [{ type: "text" as const, text: `Error: ${e.message}` }] };
}
function json(data: any, prefix?: string) {
  const text = prefix ? `${prefix}\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2);
  return ok(text);
}

// ============================================
// DOCS TOOLS
// ============================================

server.tool(
  "rift_search_docs",
  "Search Rift Finance SDK/API docs. Use to find how to do something (e.g. 'send USDC', 'offramp M-Pesa', 'vault deposit')",
  { query: z.string().describe("What you want to do or look up") },
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
    return results.length ? ok(results.slice(0, 8).join("\n\n---\n\n")) : ok(`No results for "${query}". Services: ${SDK_SERVICES.map(s => s.name).join(", ")}`);
  }
);

server.tool(
  "rift_get_api_endpoints",
  "Get REST API endpoints for a service (auth, wallet, transaction, offramp, onramp, bridge, kyc, walletconnect, merchant, notifications, signer, assets, users, deposits)",
  { service: z.string().describe("Service name") },
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
  "Get all supported blockchains, tokens, and fiat currencies",
  {},
  async () => {
    const chains = SUPPORTED_CHAINS.map(c => `${c.name} (ID:${c.id}) — ${c.native}, ${c.stablecoins.join("/")}`).join("\n");
    const currencies = SUPPORTED_CURRENCIES.map(c => `${c.code} (${c.country}) — ${c.methods.join(", ")}`).join("\n");
    return ok(`Chains:\n${chains}\n\nFiat:\n${currencies}\n\nChainName: ARBITRUM, BASE, OPTIMISM, ETHEREUM, LISK, BNB, POLYGON, BERACHAIN, CELO\nTokenSymbol: USDC, USDT, ETH, BTC, WBERA, LSK, BNB, MATIC, SAIL, cUSD`);
  }
);

// ============================================
// SETUP & CONFIG
// ============================================

server.tool(
  "rift_set_api_key",
  "Set the Rift project API key. Required before using any tools. The key starts with 'sk_'",
  { apiKey: z.string().describe("Your Rift API key (sk_...)") },
  async ({ apiKey }) => {
    client.setApiKey(apiKey);
    return ok(`API key set (${apiKey.slice(0, 6)}...). You can now use all Rift tools.`);
  }
);

server.tool(
  "rift_set_api_url",
  "Set the Rift API base URL (only needed if not using default)",
  { url: z.string().describe("API base URL (e.g. https://your-api.railway.app)") },
  async ({ url }) => {
    client.setBaseUrl(url);
    return ok(`API URL set to ${url}`);
  }
);

server.tool(
  "rift_status",
  "Check current connection status — API key, auth state, API URL",
  {},
  async () => {
    return ok(`API URL: ${client.getBaseUrl()}\nAPI Key: ${client.hasApiKey() ? `${client.getApiKey().slice(0, 6)}...` : "NOT SET"}\nAuthenticated: ${client.isAuthenticated()}`);
  }
);

// ============================================
// AUTH
// ============================================

server.tool(
  "rift_signup",
  "Create a new Rift user account",
  {
    externalId: z.string().describe("Unique user ID"),
    password: z.string().describe("Password"),
    email: z.string().optional().describe("Email"),
    phoneNumber: z.string().optional().describe("Phone number"),
    displayName: z.string().describe("Display name"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/auth/signup", { body: args }), "User created!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_send_otp",
  "Send OTP to email or phone for login/verification",
  {
    email: z.string().optional().describe("Email"),
    phone: z.string().optional().describe("Phone number"),
  },
  async (args) => {
    try {
      const body = args.email ? { email: args.email } : { phone: args.phone };
      return json(await client.request("POST", "/api/v1/auth/otp/send", { body }), "OTP sent!");
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_verify_otp",
  "Verify an OTP code",
  {
    email: z.string().optional().describe("Email"),
    phone: z.string().optional().describe("Phone"),
    code: z.string().describe("OTP code"),
  },
  async (args) => {
    try {
      const body = args.email ? { email: args.email, code: args.code } : { phone: args.phone, code: args.code };
      return json(await client.request("POST", "/api/v1/auth/otp/verify", { body }));
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_login",
  "Login to Rift. After login, all user-specific tools work. Supports email+OTP, phone+OTP, or externalId+password",
  {
    email: z.string().optional().describe("Email (with otpCode)"),
    phoneNumber: z.string().optional().describe("Phone (with otpCode)"),
    externalId: z.string().optional().describe("External ID (with password)"),
    otpCode: z.string().optional().describe("OTP code"),
    password: z.string().optional().describe("Password"),
  },
  async (args) => {
    try {
      const body: any = {};
      if (args.email) { body.email = args.email; body.otpCode = args.otpCode; }
      else if (args.phoneNumber) { body.phoneNumber = args.phoneNumber; body.otpCode = args.otpCode; }
      else if (args.externalId) { body.externalId = args.externalId; body.password = args.password; }
      const result = await client.request<any>("POST", "/api/v1/auth/login", { body });
      client.setBearerToken(result.accessToken);
      return ok(`Logged in! Address: ${result.address}\nSession active — all authenticated tools now work.`);
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_logout",
  "Logout and clear the session",
  {},
  async () => {
    try {
      await client.request("POST", "/api/v1/auth/logout").catch(() => {});
      client.clearBearerToken();
      return ok("Logged out. Session cleared.");
    } catch (e: any) { client.clearBearerToken(); return ok("Session cleared."); }
  }
);

server.tool(
  "rift_get_user",
  "Get current user's profile (includes autoSwapEnabled, autoSwapTargetChain)",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/auth/user/me")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_update_user",
  "Update user profile — display name, email, phone, auto-swap settings, etc",
  {
    displayName: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    notificationEmail: z.string().optional(),
    autoSwapEnabled: z.boolean().optional().describe("Enable/disable auto-swap"),
    autoSwapTargetChain: z.string().optional().describe("BASE, ARBITRUM, POLYGON, or ETHEREUM"),
  },
  async (args) => {
    try {
      const body: any = {};
      Object.entries(args).forEach(([k, v]) => { if (v !== undefined) body[k] = v; });
      return json(await client.request("PUT", "/api/v1/auth/user/update", { body }), "User updated!");
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_delete_user",
  "Delete user account. DESTRUCTIVE — confirm with user first",
  {
    externalId: z.string().optional(),
    password: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    otpCode: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("DELETE", "/api/v1/auth/user/delete", { body: args }), "User deleted."); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// ACCOUNT RECOVERY
// ============================================

server.tool(
  "rift_create_recovery",
  "Set up account recovery methods (email and/or phone)",
  {
    externalId: z.string(),
    password: z.string(),
    emailRecovery: z.string().optional(),
    phoneRecovery: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/auth/recovery/create", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_recovery_options",
  "Get available recovery options for a user (no auth needed)",
  { externalId: z.string() },
  async ({ externalId }) => {
    try { return json(await client.request("GET", `/api/v1/auth/recovery/options/${externalId}`)); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_request_password_reset",
  "Request a password reset via recovery email or phone",
  {
    externalId: z.string(),
    method: z.enum(["emailRecovery", "phoneRecovery"]),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/auth/recovery/request-reset", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_reset_password",
  "Reset password using OTP from recovery method",
  {
    username: z.string().describe("External ID"),
    newPassword: z.string(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    otpCode: z.string(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/auth/recovery/reset-password", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// WALLET & BALANCE
// ============================================

server.tool(
  "rift_get_balance",
  "Get wallet balance. Optionally filter by chain and/or token",
  {
    chain: z.string().optional().describe("Chain: BASE, POLYGON, ARBITRUM, etc"),
    token: z.string().optional().describe("Token: USDC, USDT, ETH, etc"),
  },
  async (args) => {
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
  "Send cryptocurrency. REAL TRANSACTION — confirm with user before calling",
  {
    to: z.string().describe("Recipient address"),
    value: z.string().describe("Amount (e.g. '10')"),
    token: z.string().describe("Token: USDC, USDT, etc"),
    chain: z.string().describe("Chain: BASE, POLYGON, etc"),
    type: z.enum(["gasless", "normal"]).default("gasless"),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    externalId: z.string().optional(),
    otpCode: z.string().optional(),
    password: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/transaction/send", { body: args }), "Transaction sent!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_transaction_history",
  "Get transaction history",
  {
    limit: z.number().optional(),
    page: z.number().optional(),
    token: z.string().optional(),
    chain: z.string().optional(),
  },
  async (args) => {
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
  "Calculate fee before sending",
  {
    recipient: z.string(),
    amount: z.string(),
    chain: z.string(),
    token: z.string(),
  },
  async (args) => {
    try { return json(await client.request("GET", "/api/v1/transaction/fee", { params: args })); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// OFFRAMP (Crypto → Fiat)
// ============================================

server.tool(
  "rift_preview_exchange_rate",
  "Preview crypto-to-fiat exchange rate",
  {
    currency: z.string().describe("KES, NGN, UGX, GHS, ETB, CDF"),
    amount: z.number().optional(),
    type: z.enum(["offramp", "onramp"]).default("offramp"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/offramp/preview_exchange_rate", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_payment_methods",
  "Get supported payment methods (banks, mobile money) for a fiat currency",
  { currency: z.string().describe("KES, NGN, etc") },
  async ({ currency }) => {
    try { return json(await client.request("GET", `/api/v1/offramp/payment_methods/${currency}`)); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_offramp",
  "Cash out crypto to fiat (M-Pesa, bank, etc). REAL PAYMENT — confirm with user",
  {
    token: z.string().default("USDC"),
    amount: z.number().describe("Amount in token"),
    currency: z.string().describe("KES, NGN, etc"),
    chain: z.string().default("BASE"),
    recipientName: z.string().describe("Recipient name"),
    bankCode: z.string().describe("Bank code or MPESA"),
    accountNumber: z.string().describe("Account or phone number"),
  },
  async (args) => {
    try {
      return json(await client.request("POST", "/api/v1/offramp/pay", {
        body: {
          token: args.token, amount: args.amount, currency: args.currency, chain: args.chain,
          recipient: JSON.stringify({ name: args.recipientName, bankCode: args.bankCode, accountNumber: args.accountNumber }),
        },
      }), "Offramp submitted!");
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_withdrawal_fee",
  "Get withdrawal fee for an amount",
  { amount: z.number() },
  async ({ amount }) => {
    try { return json(await client.request("POST", "/api/v1/offramp/get-withdrawal-fee", { body: { amount } })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_poll_offramp_status",
  "Poll the status of an offramp order",
  {
    transactionCode: z.string(),
    currency: z.string(),
  },
  async (args) => {
    try { return json(await client.request("GET", "/api/v1/offramp/poll_order_status", { params: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_offramp_orders",
  "Get all offramp orders",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/offramp/get_orders")); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// ONRAMP (Fiat → Crypto)
// ============================================

server.tool(
  "rift_buy_crypto",
  "Buy crypto with mobile money (fiat to crypto). REAL PAYMENT — confirm with user",
  {
    shortcode: z.string().describe("Payment shortcode e.g. MPESA_KE"),
    amount: z.number().describe("Amount in local currency"),
    chain: z.string().default("BASE"),
    asset: z.string().default("USDC"),
    mobile_network: z.string().describe("e.g. Safaricom"),
    country_code: z.string().describe("e.g. KE"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/onramp/", { body: args }), "Onramp initiated!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_onramp_status",
  "Check status of an onramp purchase",
  { transactionCode: z.string() },
  async ({ transactionCode }) => {
    try { return json(await client.request("POST", "/api/v1/onramp/status", { body: { transactionCode } })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_onramp_orders",
  "Get onramp order history",
  { userId: z.string().describe("User ID") },
  async ({ userId }) => {
    try { return json(await client.request("GET", `/api/v1/onramp/orders/${userId}`)); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// BRIDGE
// ============================================

server.tool(
  "rift_get_bridge_routes",
  "Get available cross-chain bridge routes",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/bridge/routes")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_bridge_quote",
  "Get a quote for a bridge transfer",
  {
    sourceChain: z.string(),
    destinationChain: z.string(),
    token: z.string().describe("USDC or USDT"),
    amount: z.string(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/bridge/quote", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_bridge_execute",
  "Execute cross-chain bridge. MOVES REAL FUNDS — confirm with user",
  {
    sourceChain: z.string(),
    destinationChain: z.string(),
    token: z.string(),
    amount: z.string(),
    recipient: z.string().optional().describe("Defaults to user's wallet on dest chain"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/bridge/execute", { body: args }), "Bridge executed!"); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// KYC
// ============================================

server.tool(
  "rift_kyc_get_token",
  "Generate a KYC verification token/URL",
  {
    country_code: z.string().describe("ISO country code e.g. KE"),
    identifier: z.string().describe("Email, phone, or externalId"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/kyc/token", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_kyc_check_user_exists",
  "Check if a user exists and their KYC status",
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
  "Check KYC verification status",
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
  "Verify a KYC job (requires auth)",
  { jobId: z.string() },
  async ({ jobId }) => {
    try { return json(await client.request("POST", "/api/v1/kyc/verify", { body: { jobId } })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_kyc_is_verified",
  "Check if the current user is KYC verified",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/kyc/verified")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_kyc_job_status",
  "Get status of a KYC verification job",
  { jobId: z.string() },
  async ({ jobId }) => {
    try { return json(await client.request("GET", `/api/v1/kyc/job/${jobId}`)); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// WALLETCONNECT
// ============================================

server.tool(
  "rift_wc_pair",
  "Pair with a DApp via WalletConnect",
  {
    uri: z.string().describe("WalletConnect URI (wc:...)"),
    chain: z.string().describe("Chain to connect on"),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/walletconnect/pair", { body: args }), "Paired!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_get_requests",
  "Get pending WalletConnect requests from DApps",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/walletconnect/requests")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_approve",
  "Approve a WalletConnect request",
  { id: z.string().describe("Request ID") },
  async ({ id }) => {
    try { return json(await client.request("POST", `/api/v1/walletconnect/requests/${id}/approve`)); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_reject",
  "Reject a WalletConnect request",
  { id: z.string().describe("Request ID") },
  async ({ id }) => {
    try { return json(await client.request("POST", `/api/v1/walletconnect/requests/${id}/reject`)); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_sessions",
  "List active WalletConnect sessions",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/walletconnect/sessions")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_wc_disconnect",
  "Disconnect a WalletConnect session",
  { topic: z.string().describe("Session topic") },
  async ({ topic }) => {
    try { return json(await client.request("DELETE", `/api/v1/walletconnect/sessions/${topic}`)); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// MERCHANT
// ============================================

server.tool(
  "rift_create_invoice",
  "Create a payment invoice",
  {
    description: z.string(),
    chain: z.string(),
    token: z.string(),
    amount: z.number(),
    recipientEmail: z.string().optional(),
    recipientPhone: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/merchant/invoices", { body: args }), "Invoice created!"); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_invoices",
  "List invoices with optional filters",
  {
    status: z.string().optional().describe("PENDING, COMPLETED, or EXPIRED"),
    sortBy: z.string().optional(),
    sortOrder: z.string().optional(),
  },
  async (args) => {
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
  "Check merchant KYB approval status",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/merchant/status")); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// NOTIFICATIONS
// ============================================

server.tool(
  "rift_notifications_register",
  "Register a device for push notifications",
  {
    subscriberId: z.string(),
    platform: z.string().optional().describe("web or mobile"),
    deviceInfo: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/notifications/register", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_notifications_send",
  "Send a notification to all user's devices",
  {
    message: z.string(),
    title: z.string().optional(),
    targetUrl: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/notifications/send", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_notifications_subscriptions",
  "Get or delete notification subscriptions",
  { action: z.enum(["get", "delete"]).default("get") },
  async ({ action }) => {
    try {
      if (action === "delete") return json(await client.request("DELETE", "/api/v1/notifications/subscriptions"));
      return json(await client.request("GET", "/api/v1/notifications/subscriptions"));
    } catch (e: any) { return err(e); }
  }
);

// ============================================
// SIGNER / PROXY WALLET
// ============================================

server.tool(
  "rift_get_wallet_instance",
  "Get wallet instance for a chain (address, public key, provider info)",
  { chain: z.string().describe("Chain: BASE, POLYGON, etc") },
  async ({ chain }) => {
    try { return json(await client.request("POST", "/api/v1/signer/get-wallet-instance", { body: { chain } })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_sign_transaction",
  "Sign a transaction without broadcasting",
  {
    chain: z.string(),
    to: z.string().optional(),
    value: z.string().optional(),
    data: z.string().optional().describe("Encoded contract call data"),
  },
  async (args) => {
    try {
      const { chain, ...txData } = args;
      return json(await client.request("POST", "/api/v1/signer/sign-transaction", { body: { chain, transactionData: txData } }));
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_send_transaction",
  "Sign and broadcast a raw transaction. REAL TX — confirm with user",
  {
    chain: z.string(),
    to: z.string().optional(),
    value: z.string().optional(),
    data: z.string().optional(),
  },
  async (args) => {
    try {
      const { chain, ...txData } = args;
      return json(await client.request("POST", "/api/v1/signer/send-transaction", { body: { chain, transactionData: txData } }), "Transaction sent!");
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_sign_message",
  "Sign an arbitrary message with the user's key",
  {
    chain: z.string(),
    message: z.string(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/signer/sign-message", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

// ============================================
// ASSETS
// ============================================

server.tool(
  "rift_get_tokens",
  "Get all supported tokens, optionally by chain",
  { chainId: z.string().optional().describe("Chain ID e.g. '8453' for Base") },
  async ({ chainId }) => {
    try {
      const path = chainId ? `/api/v1/assets/tokens/chain/${chainId}` : "/api/v1/assets/tokens";
      return json(await client.request("GET", path));
    } catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_user_tokens",
  "Get tokens the authenticated user holds",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/assets/tokens/user")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_chains",
  "Get supported chains or a specific chain by ID",
  { chainId: z.string().optional() },
  async ({ chainId }) => {
    try {
      const path = chainId ? `/api/v1/assets/chains/${chainId}` : "/api/v1/assets/supported-chains";
      return json(await client.request("GET", path));
    } catch (e: any) { return err(e); }
  }
);

// ============================================
// USER MANAGEMENT
// ============================================

server.tool(
  "rift_suspend_user",
  "Suspend a user from the platform",
  {
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    externalId: z.string().optional(),
    userId: z.string().optional(),
    reason: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/users/suspend", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_unsuspend_user",
  "Unsuspend a user",
  {
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    externalId: z.string().optional(),
    userId: z.string().optional(),
  },
  async (args) => {
    try { return json(await client.request("POST", "/api/v1/users/unsuspend", { body: args })); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_suspended_users",
  "List all suspended users",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/users/suspended")); }
    catch (e: any) { return err(e); }
  }
);

server.tool(
  "rift_get_user_status",
  "Check if a specific user is suspended",
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
  "Get all USDC deposits on Base network",
  {},
  async () => {
    try { return json(await client.request("GET", "/api/v1/deposits/")); }
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

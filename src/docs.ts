// Rift Finance documentation content for MCP server

export interface Endpoint {
  method: string;
  path: string;
  auth: "none" | "api_key" | "jwt" | "jwt+otp" | "jwt+kyc";
  description: string;
  requestBody?: Record<string, string>;
  queryParams?: Record<string, string>;
  urlParams?: Record<string, string>;
  responseExample?: string;
}

export interface ServiceDoc {
  name: string;
  sdkAccessor: string;
  description: string;
  methods: {
    name: string;
    description: string;
    signature: string;
    example: string;
    auth: "none" | "jwt";
  }[];
}

export const SDK_SERVICES: ServiceDoc[] = [
  {
    name: "Auth",
    sdkAccessor: "rift.auth",
    description: "User registration, login, OTP, profile management, account recovery, and auto-swap configuration",
    methods: [
      { name: "signup", description: "Create a new user account. Email/phone sign-up: call sendOtp first and pass otpCode (required when the server enforces REQUIRE_SIGNUP_OTP, always accepted), then login with the SAME otpCode. externalId + password sign-up needs no OTP.", signature: "signup(request: SignupRequest): Promise<SignupResponse>", example: `await rift.auth.sendOtp({ email: 'user@example.com' });
await rift.auth.signup({ email: 'user@example.com', displayName: 'John', otpCode: '123456' });
await rift.auth.login({ email: 'user@example.com', otpCode: '123456' }); // same code
// or: await rift.auth.signup({ externalId: 'user_123', password: 'pass', displayName: 'John' });`, auth: "none" },
      { name: "login", description: "Authenticate and get access token. Supports email+OTP, phone+OTP, or externalId+password. The response includes walletStatus; when walletStatus.needsPasskeySetup is true the user must register a passkey before anything can be signed (409 PASSKEY_SETUP_REQUIRED).", signature: "login(request: LoginRequest): Promise<LoginResponse>", example: `const { accessToken, walletStatus } = await rift.auth.login({ email: 'user@example.com', otpCode: '123456' });\nif (walletStatus?.needsPasskeySetup) await rift.passkeys.setup();`, auth: "none" },
      { name: "loginWithGoogle", description: "Sign in (or sign up on first use) with a Google ID token. Frontend obtains the idToken from Google One-Tap or `useGoogleLogin({ flow: 'implicit' })`. Backend verifies it with Google. Once an account is bound to Google, password/OTP login is rejected for that account.", signature: "loginWithGoogle(request: GoogleLoginRequest): Promise<GoogleLoginResponse>", example: `const { accessToken, address } = await rift.auth.loginWithGoogle({ idToken: googleIdToken, referrer: 'optional_referral_code' });`, auth: "none" },
      { name: "loginWithApple", description: "Sign in (or sign up on first use) with an Apple identity token. Frontend obtains the idToken from `AppleID.auth.signIn()` (web) or `ASAuthorizationAppleIDProvider` (iOS). Apple only delivers email/name on the FIRST sign-in — pass displayName then. Apple-bound accounts are NOT locked to Apple (email/OTP login still works).", signature: "loginWithApple(request: AppleLoginRequest): Promise<AppleLoginResponse>", example: `const { accessToken, address } = await rift.auth.loginWithApple({ idToken: appleIdToken, displayName: 'Jane Doe' });`, auth: "none" },
      { name: "sendOtp", description: "Send OTP via SMS or email", signature: "sendOtp(request: OtpRequest): Promise<OtpResponse>", example: `await rift.auth.sendOtp({ email: 'user@example.com' });`, auth: "none" },
      { name: "verifyOtp", description: "Verify an OTP code", signature: "verifyOtp(request: OtpVerifyRequest): Promise<OtpResponse>", example: `await rift.auth.verifyOtp({ email: 'user@example.com', code: '123456' });`, auth: "none" },
      { name: "getUser", description: "Get authenticated user profile (includes autoSwapEnabled, autoSwapTargetChain)", signature: "getUser(): Promise<UserResponse>", example: `const { user } = await rift.auth.getUser();`, auth: "jwt" },
      { name: "updateUser", description: "Update user profile. Use this to enable/disable auto-swap. Changing email/phone needs an OTP sent to the NEW value: otpCode when changing one, emailOtpCode + phoneOtpCode when changing both", signature: "updateUser(request: UpdateUserRequest): Promise<UpdateUserResponse>", example: `await rift.auth.updateUser({ autoSwapEnabled: true, autoSwapTargetChain: 'BASE' });
await rift.auth.sendOtp({ email: 'new@example.com' });
await rift.auth.updateUser({ email: 'new@example.com', otpCode: '123456' });`, auth: "jwt" },
      { name: "deleteUser", description: "Delete user account", signature: "deleteUser(request: DeleteUserRequest): Promise<DeleteUserResponse>", example: `await rift.auth.deleteUser({ externalId: 'user_123', password: 'pass' });`, auth: "jwt" },
      { name: "createRecoveryMethods", description: "Set up account recovery via email or phone", signature: "createRecoveryMethods(request: CreateRecoveryRequest): Promise<CreateRecoveryResponse>", example: `await rift.auth.createRecoveryMethods({ externalId: 'user_123', password: 'pass', emailRecovery: 'recovery@example.com' });`, auth: "jwt" },
      { name: "getRecoveryOptions", description: "Get available recovery options for a user", signature: "getRecoveryOptions(externalId: string): Promise<RecoveryOptionsResponse>", example: `const options = await rift.auth.getRecoveryOptions('user_123');`, auth: "none" },
      { name: "requestPasswordReset", description: "Request password reset via recovery method", signature: "requestPasswordReset(request: RequestPasswordResetRequest): Promise<RequestPasswordResetResponse>", example: `await rift.auth.requestPasswordReset({ externalId: 'user_123', method: 'emailRecovery' });`, auth: "none" },
      { name: "resetPassword", description: "Reset password with OTP", signature: "resetPassword(request: ResetPasswordRequest): Promise<ResetPasswordResponse>", example: `await rift.auth.resetPassword({ username: 'user_123', newPassword: 'new_pass', email: 'recovery@example.com', otpCode: '123456' });`, auth: "none" },
      { name: "migrateToV3", description: "REMOVED (SDK v4). The backend answers 410 REPLACED_BY_PASSKEY_WALLETS. v3 enclave envelopes were replaced by passkey-owned Safe wallets: register a passkey with rift.passkeys.setup() instead; legacy wallets keep their address.", signature: "migrateToV3(request): Promise<never> // deprecated", example: `// Use instead:\nawait rift.passkeys.setup({ label: 'iPhone' });`, auth: "jwt" },
    ],
  },
  {
    name: "Passkeys",
    sdkAccessor: "rift.passkeys",
    description: "SDK v4.0.0+. Passkeys own the user's Safe wallet (no server-held key). The first passkey creates the wallet (new user) or takes over the SAME address (legacy wallet). More passkeys are recovery devices: adding/removing one is an on-chain owner change signed by an EXISTING passkey. Keep at least two. WebAuthn ceremonies run on the user's device (browser).",
    methods: [
      { name: "setup", description: "Browser: options → WebAuthn create (ES256 / alg -7 only, resident key + UV required) → register. Result status: active (new wallet), migrated/migrating (legacy wallet, same address), new_wallet (legacy key unrecoverable; previousAddress shown as legacy), or pending_signature for an additional passkey — pass signWithExisting to sign those tickets with an existing passkey and confirm.", signature: "setup(opts?: { label?: string; signWithExisting?: (ticket) => Promise<PasskeyAuthProof>; authenticatorAttachment? }): Promise<RegisterPasskeyResponse | ConfirmPasskeyResponse>", example: `// First passkey\nawait rift.passkeys.setup({ label: 'iPhone' });\n// Recovery passkey on another device, consented by an existing one\nawait rift.passkeys.setup({\n  label: 'YubiKey',\n  signWithExisting: (t) => createPasskeyAuthProof(t.hashToSign, { rpId, allowCredentials: t.allowCredentials }),\n});`, auth: "jwt" },
      { name: "getRegistrationOptions / register / confirm", description: "Low-level registration: POST /v1/wallet/passkeys/options, POST /v1/wallet/passkeys { attestation, label }, POST /v1/wallet/passkeys/confirm { credentialId, signatures }.", signature: "getRegistrationOptions(): Promise<PasskeyRegistrationOptions>; register(req): Promise<RegisterPasskeyResponse>; confirm(req): Promise<ConfirmPasskeyResponse>", example: `const options = await rift.passkeys.getRegistrationOptions();\nconst attestation = await registerPasskey(options);\nconst res = await rift.passkeys.register({ attestation, label: 'Laptop' });`, auth: "jwt" },
      { name: "list", description: "List passkeys: id, credentialId, label, signerAddress, signerKind (shared|proxy), createdAt, lastUsedAt, status.", signature: "list(): Promise<PasskeyCredential[]>", example: `const passkeys = await rift.passkeys.list();`, auth: "jwt" },
      { name: "remove / removeWithPasskey", description: "Remove a passkey: returns tickets to sign with a remaining passkey, then confirmRemoval. The last passkey cannot be removed (409 LAST_PASSKEY).", signature: "removeWithPasskey(id: string, sign: (ticket) => Promise<PasskeyAuthProof>): Promise<ConfirmPasskeyResponse>", example: `await rift.passkeys.removeWithPasskey(id, (t) => createPasskeyAuthProof(t.hashToSign, { rpId, allowCredentials: t.allowCredentials }));`, auth: "jwt" },
    ],
  },
  {
    name: "Approvals",
    sdkAccessor: "rift.approvals",
    description: "SDK v4.0.0+. Approval requests are created by any fund-moving call made without a passkey proof (server SDK, API wrapper, MCP agents, auto-swap). The call returns HTTP 202 { status: 'APPROVAL_REQUIRED', approvalId, approvalUrl, expiresAt, summary }. The user opens approvalUrl (https://app.riftfi.com/approve/<id>) and approves with a passkey. TTL 30 min, single use.",
    methods: [
      { name: "get", description: "Status (pending | approved | rejected | expired | failed) + result { transactionHash, userOpHash }. Works with the creating project's API key alone.", signature: "get(id: string): Promise<Approval>", example: `const a = await rift.approvals.get(approvalId);`, auth: "none" },
      { name: "list", description: "The user's approvals, e.g. pending ones for an inbox.", signature: "list(request?: { status?: ApprovalStatus }): Promise<Approval[]>", example: `const pending = await rift.approvals.list({ status: 'pending' });`, auth: "jwt" },
      { name: "approveWithPasskey", description: "Browser: preview (fresh ticket from the stored intent) → passkey-sign hashToSign → approve. Also preview / approve / reject individually.", signature: "approveWithPasskey(id: string, sign: (preview) => Promise<PasskeyAuthProof>): Promise<Approval>", example: `await rift.approvals.approveWithPasskey(id, (p) => createPasskeyAuthProof(p.hashToSign, { rpId, allowCredentials: p.allowCredentials }));`, auth: "jwt" },
      { name: "isApprovalRequired / assertNoApproval", description: "Named imports. isApprovalRequired(res) narrows a one-phase result to the 202 approval shape; assertNoApproval(res) throws ApprovalRequiredError instead.", signature: "isApprovalRequired(value): value is ApprovalRequiredResponse", example: `const res = await rift.transactions.send({ to, value: '10', token: 'USDC', chain: 'BASE' });\nif (isApprovalRequired(res)) console.log(res.approvalUrl);`, auth: "none" },
    ],
  },
  {
    name: "Passkey ceremony helpers (browser-only)",
    sdkAccessor: "(named imports — not on the rift instance)",
    description: "SDK v4.0.0+. createPasskeyAuthProof signs a hashToSign (from any preview / approval / passkey ticket) with navigator.credentials.get; registerPasskey runs navigator.credentials.create. Google / Apple are LOGIN ONLY and cannot authorise transactions (kind 'oidc' proofs → 400 PASSKEY_REQUIRED); OidcHelper was removed.",
    methods: [
      { name: "createPasskeyAuthProof", description: "WebAuthn assertion whose challenge is the 32 raw bytes of hashToSign, userVerification required. Returns { kind: 'passkey', cred_id_b64, client_data_json_b64, authenticator_data_b64, signature_b64 }.", signature: "createPasskeyAuthProof(hashToSign: string, opts?: { rpId?: string; allowCredentials?: string[]; timeout?: number }): Promise<PasskeyAuthProof>", example: `const preview = await rift.transactions.previewSpend({ token: 'USDC', chain: 'BASE', recipient, amount: '10' });\nconst authProof = await createPasskeyAuthProof(getHashToSign(preview), { rpId: 'riftfi.com', allowCredentials: preview.allowCredentials });\nawait rift.signer.submitPreparedUserOp({ ticketId: preview.ticketId, authProof });`, auth: "none" },
      { name: "registerPasskey", description: "Registration ceremony from server options. Always ES256 (-7) only, resident key + user verification required. Returns { cred_id_b64, client_data_json_b64, attestation_object_b64 } for rift.passkeys.register.", signature: "registerPasskey(options: PasskeyRegistrationOptions, opts?: { authenticatorAttachment?; timeout? }): Promise<PasskeyAttestation>", example: `const attestation = await registerPasskey(await rift.passkeys.getRegistrationOptions());`, auth: "none" },
      { name: "isPasskeySupported", description: "Sync capability check — returns true if WebAuthn API is available. Use to gate showing a Passkey UI.", signature: "isPasskeySupported(): boolean", example: `if (isPasskeySupported()) { /* show passkey button */ }`, auth: "none" },
      { name: "isPlatformPasskeySupported", description: "Async check — returns true if the device has a built-in authenticator (Touch ID / Face ID / Windows Hello).", signature: "isPlatformPasskeySupported(): Promise<boolean>", example: `if (await isPlatformPasskeySupported()) { /* offer this device */ }`, auth: "none" },
    ],
  },
  {
    name: "Wallet",
    sdkAccessor: "rift.wallet",
    description: "Check token and chain balances across all supported chains",
    methods: [
      { name: "getTokenBalance", description: "Get balance of a specific token, optionally filtered by chain", signature: "getTokenBalance(request: TokenBalanceRequest): Promise<ApiResponse<Balance[]>>", example: `const result = await rift.wallet.getTokenBalance({ token: 'USDC', chain: 'BASE' });`, auth: "jwt" },
      { name: "getChainBalance", description: "Get all token balances on a chain or across all chains", signature: "getChainBalance(request?: ChainBalanceRequest): Promise<ApiResponse<Balance[]>>", example: `const result = await rift.wallet.getChainBalance({ chain: 'BASE' });`, auth: "jwt" },
      { name: "status", description: "SDK v4.0.0+. Passkey wallet state: { mode: none|legacy|passkey, walletAddress, previousAddress?, passkeyCount, chains: [{ chainId, deployed, ownerMode }], needsPasskeySetup }.", signature: "status(): Promise<WalletStatus>", example: `const s = await rift.wallet.status();\nif (s.needsPasskeySetup) await rift.passkeys.setup();`, auth: "jwt" },
    ],
  },
  {
    name: "Transactions",
    sdkAccessor: "rift.transactions",
    description: "Send crypto, view transaction history, calculate fees",
    methods: [
      { name: "send", description: "Send cryptocurrency from the user's passkey-owned Safe. Without ticketId + authProof it returns (not throws) HTTP 202 { status: 'APPROVAL_REQUIRED', approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user, who approves with a passkey. Never retried. To submit directly from a browser, preview first (previewSpend), passkey-sign hashToSign, then send({ ...request, ticketId, authProof }) or signer.submitPreparedUserOp.", signature: "send(request: TransactionRequest): Promise<MaybeApproval<TransactionResponse>>", example: `// Server / agent: approval request\nconst res = await rift.transactions.send({ to: '0xRecipient', value: '10', token: 'USDC', chain: 'BASE', type: 'gasless' });\nif (isApprovalRequired(res)) notifyUser(res.approvalUrl);\n// Browser: two-phase\nconst p = await rift.transactions.previewSpend({ token: 'USDC', chain: 'BASE', recipient: '0xRecipient', amount: '10' });\nconst authProof = await createPasskeyAuthProof(getHashToSign(p), { rpId, allowCredentials: p.allowCredentials });\nawait rift.signer.submitPreparedUserOp({ ticketId: p.ticketId, authProof });`, auth: "jwt" },
      { name: "getHistory", description: "Get transaction history with pagination and filters", signature: "getHistory(request?: TransactionHistoryRequest): Promise<TransactionHistoryResponse>", example: `const history = await rift.transactions.getHistory({ limit: 20, page: 1, token: 'USDC' });`, auth: "jwt" },
      { name: "getFee", description: "Calculate transaction fee", signature: "getFee(request: TransactionFeeRequest): Promise<TransactionFeeResponse>", example: `const fee = await rift.transactions.getFee({ recipient: '0x...', amount: '100', chain: 'BASE', token: 'USDC' });`, auth: "jwt" },
    ],
  },
  {
    name: "Offramp",
    sdkAccessor: "rift.offramp",
    description: "Convert crypto to fiat (KES, NGN, UGX, GHS, ETB, CDF)",
    methods: [
      { name: "previewExchangeRate", description: "Preview exchange rate for offramp", signature: "previewExchangeRate(request: PreviewExchangeRateRequest): Promise<PreviewExchangeRateResponse>", example: `const rate = await rift.offramp.previewExchangeRate({ currency: 'KES', amount: 100, type: 'offramp' });`, auth: "jwt" },
      { name: "getSupportedInstitutions", description: "Get supported payment methods for a currency", signature: "getSupportedInstitutions(currency: OfframpCurrency): Promise<GetSupportedInstitutionsResponse>", example: `const methods = await rift.offramp.getSupportedInstitutions('KES');`, auth: "jwt" },
      { name: "pay", description: "Execute offramp payment to bank or mobile money. Without ticketId + authProof it returns (not throws) HTTP 202 { status: 'APPROVAL_REQUIRED', approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user, who approves with a passkey. Never retried. Two-phase: previewOrder → passkey → signer.submitPreparedUserOp.", signature: "pay(request: PayRequest): Promise<MaybeApproval<PayResponse>>", example: `const res = await rift.offramp.pay({\n  token: 'USDC', amount: 100, currency: 'KES', chain: 'BASE',\n  recipient: JSON.stringify({ type: 'MOBILE', accountIdentifier: '+254712345678', institution: 'Safaricom' })\n});\nif (isApprovalRequired(res)) notifyUser(res.approvalUrl);`, auth: "jwt" },
      { name: "createOrder", description: "Create an offramp order (legacy twin of pay). Without ticketId + authProof it returns (not throws) HTTP 202 { status: 'APPROVAL_REQUIRED', approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user, who approves with a passkey. Never retried.", signature: "createOrder(request: CreateOfframpOrderRequest): Promise<MaybeApproval<CreateOfframpOrderResponse>>", example: `const res = await rift.offramp.createOrder({ ... });`, auth: "jwt" },
      { name: "getWithdrawalFee", description: "Get withdrawal fee for an amount", signature: "getWithdrawalFee(amount: number): Promise<GetWithdrawalFeeResponse>", example: `const { fee } = await rift.offramp.getWithdrawalFee(100);`, auth: "jwt" },
      { name: "pollOrderStatus", description: "Poll offramp order status", signature: "pollOrderStatus(request: PollOfframpOrderRequest): Promise<PollOfframpOrderResponse>", example: `const status = await rift.offramp.pollOrderStatus({ transactionCode: 'tx_abc', currency: 'KES' });`, auth: "jwt" },
      { name: "getOrders", description: "Get all offramp orders", signature: "getOrders(): Promise<GetOfframpOrdersResponse>", example: `const { orders } = await rift.offramp.getOrders();`, auth: "jwt" },
    ],
  },
  {
    name: "OnrampV2",
    sdkAccessor: "rift.onrampV2",
    description: "Buy crypto with mobile money (fiat to crypto)",
    methods: [
      { name: "buy", description: "Buy crypto via mobile money", signature: "buy(request: BuyRequest): Promise<BuyResponse>", example: `const purchase = await rift.onrampV2.buy({\n  shortcode: 'MPESA_KE', amount: 1000, chain: 'BASE', asset: 'USDC',\n  mobile_network: 'Safaricom', country_code: 'KE'\n});`, auth: "jwt" },
      { name: "getOnrampStatus", description: "Get onramp purchase status", signature: "getOnrampStatus(request): Promise<OnrampStatusResponse>", example: `const status = await rift.onrampV2.getOnrampStatus({ transactionCode: 'tx_abc' });`, auth: "jwt" },
      { name: "getOnrampOrders", description: "Get onramp order history", signature: "getOnrampOrders(): Promise<any>", example: `const orders = await rift.onrampV2.getOnrampOrders();`, auth: "jwt" },
    ],
  },
  {
    name: "DeFi",
    sdkAccessor: "rift.defi",
    description: "On-chain token swaps via the user's smart wallet",
    methods: [
      { name: "swap", description: "DEPRECATED (SDK v4): /v1/defi/swap is no longer served. Build the swap calls (e.g. a LiFi quote) and send them via signer.sendTransaction (approval request) or previewUserOp + submitPreparedUserOp.", signature: "swap(request: SwapRequest): Promise<MaybeApproval<SwapResponse>> // deprecated", example: `// Instead:\nconst res = await rift.signer.sendTransaction({ chain: 'BASE', transactionData: { to: router, data: swapCalldata } });`, auth: "jwt" },
    ],
  },
  {
    name: "Bridge",
    sdkAccessor: "rift.bridge",
    description: "Cross-chain asset transfers between supported chains",
    methods: [
      { name: "getRoutes", description: "Get available bridge routes and supported tokens", signature: "getRoutes(): Promise<BridgeRoutesResponse>", example: `const { routes, supportedTokens } = await rift.bridge.getRoutes();`, auth: "none" },
      { name: "getQuote", description: "Get quote for a bridge transfer", signature: "getQuote(request: BridgeQuoteRequest): Promise<BridgeQuoteResponse>", example: `const quote = await rift.bridge.getQuote({ sourceChain: 'ARBITRUM', destinationChain: 'BASE', token: 'USDC', amount: '100' });`, auth: "none" },
      { name: "execute", description: "Execute a cross-chain bridge transfer. Without ticketId + authProof it returns (not throws) HTTP 202 { status: 'APPROVAL_REQUIRED', approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user, who approves with a passkey. Never retried. Two-phase: previewTransfer → passkey → signer.submitPreparedUserOp.", signature: "execute(request: BridgeExecuteRequest): Promise<MaybeApproval<BridgeExecuteResponse>>", example: `const res = await rift.bridge.execute({ sourceChain: 'ARBITRUM', destinationChain: 'BASE', token: 'USDC', amount: '100' });`, auth: "jwt" },
    ],
  },
  {
    name: "KYC",
    sdkAccessor: "rift.kyc",
    description: "Identity verification via SmileID and Sumsub",
    methods: [
      { name: "getToken", description: "Generate KYC verification token/URL", signature: "getToken(request: KYCTokenRequest): Promise<KYCTokenResponse>", example: `const result = await rift.kyc.getToken({ country_code: 'KE', identifier: 'user@example.com' });`, auth: "none" },
      { name: "checkUserExists", description: "Check if user exists and their KYC status", signature: "checkUserExists(request: KYCUserExistsRequest): Promise<KYCUserExistsResponse>", example: `const result = await rift.kyc.checkUserExists({ email: 'user@example.com' });`, auth: "none" },
      { name: "getStatus", description: "Check KYC verification status", signature: "getStatus(request: KYCStatusRequest): Promise<KYCStatusResponse>", example: `const result = await rift.kyc.getStatus({ email: 'user@example.com' });`, auth: "none" },
      { name: "isVerified", description: "Check if current user is KYC verified", signature: "isVerified(): Promise<KYCVerifiedResponse>", example: `const { kycVerified } = await rift.kyc.isVerified();`, auth: "jwt" },
      { name: "verify", description: "Verify a KYC job by jobId", signature: "verify(request: KYCVerifyRequest): Promise<KYCVerifyResponse>", example: `const result = await rift.kyc.verify({ jobId: 'job_abc123' });`, auth: "jwt" },
      { name: "getJobStatus", description: "Poll KYC job status", signature: "getJobStatus(jobId: string): Promise<KYCJobStatusResponse>", example: `const status = await rift.kyc.getJobStatus('job_abc123');`, auth: "jwt" },
    ],
  },
  {
    name: "WalletConnect",
    sdkAccessor: "rift.walletConnect",
    description: "Connect to DApps via WalletConnect protocol",
    methods: [
      { name: "pair", description: "Pair with a DApp using WalletConnect URI", signature: "pair(request: WalletConnectPairRequest): Promise<WalletConnectPairResponse>", example: `const result = await rift.walletConnect.pair({ uri: 'wc:abc@2?...', chain: 'BASE' });`, auth: "jwt" },
      { name: "getRequests", description: "List pending DApp requests", signature: "getRequests(): Promise<ApiResponse<WalletConnectRequest[]>>", example: `const result = await rift.walletConnect.getRequests();`, auth: "jwt" },
      { name: "approveRequest", description: "Approve a DApp request. With { ticketId, authProof } from previewRequest(id) it signs and answers the DApp; without it returns an approval request (HTTP 202, approvalUrl for the user).", signature: "approveRequest(id: string, proof?: { ticketId?: string; authProof?: PasskeyAuthProof }): Promise<MaybeApproval<ApiResponse>>", example: `const p = await rift.walletConnect.previewRequest(id);\nawait rift.walletConnect.approveRequest(id, { ticketId: p.ticketId, authProof: await createPasskeyAuthProof(getHashToSign(p), { rpId }) });`, auth: "jwt" },
      { name: "rejectRequest", description: "Reject a DApp request", signature: "rejectRequest(id: string): Promise<ApiResponse>", example: `await rift.walletConnect.rejectRequest('request_id');`, auth: "jwt" },
      { name: "getSessions", description: "List active WalletConnect sessions", signature: "getSessions(): Promise<ApiResponse<WalletConnectSession[]>>", example: `const result = await rift.walletConnect.getSessions();`, auth: "jwt" },
      { name: "disconnectSession", description: "Disconnect from a DApp session", signature: "disconnectSession(topic: string): Promise<ApiResponse>", example: `await rift.walletConnect.disconnectSession('topic');`, auth: "jwt" },
    ],
  },
  {
    name: "Merchant",
    sdkAccessor: "rift.merchant",
    description: "Invoice creation and merchant KYB status",
    methods: [
      { name: "createInvoice", description: "Create a payment invoice", signature: "createInvoice(request: CreateInvoiceRequest): Promise<CreateInvoiceResponse>", example: `const { invoice } = await rift.merchant.createInvoice({\n  description: 'Pro Plan', chain: 'BASE', token: 'USDC', amount: 29.99,\n  recipientEmail: 'customer@example.com'\n});`, auth: "jwt" },
      { name: "getInvoices", description: "List invoices with filters", signature: "getInvoices(request?: GetInvoicesRequest): Promise<GetInvoicesResponse>", example: `const { invoices } = await rift.merchant.getInvoices({ status: 'PENDING' });`, auth: "jwt" },
      { name: "getMerchantStatus", description: "Check merchant KYB approval status", signature: "getMerchantStatus(): Promise<GetMerchantStatusResponse>", example: `const status = await rift.merchant.getMerchantStatus();`, auth: "jwt" },
    ],
  },
  {
    name: "Notifications",
    sdkAccessor: "rift.notifications",
    description: "Push notification management",
    methods: [
      { name: "registerSubscription", description: "Register device for push notifications", signature: "registerSubscription(request: NotificationSubscriptionRequest): Promise<any>", example: `await rift.notifications.registerSubscription({ subscriberId: 'device_id', platform: 'mobile' });`, auth: "jwt" },
      { name: "unsubscribe", description: "Unsubscribe from notifications", signature: "unsubscribe(request): Promise<any>", example: `await rift.notifications.unsubscribe({ subscriberId: 'device_id' });`, auth: "jwt" },
      { name: "getUserSubscriptions", description: "Get user's notification subscriptions", signature: "getUserSubscriptions(): Promise<any>", example: `const subs = await rift.notifications.getUserSubscriptions();`, auth: "jwt" },
      { name: "sendToAllUserSubscribers", description: "Send notification to all user's devices", signature: "sendToAllUserSubscribers(request: NotificationSendRequest): Promise<NotificationSendResponse>", example: `await rift.notifications.sendToAllUserSubscribers({ message: 'Payment received!', title: 'Rift' });`, auth: "jwt" },
      { name: "deleteAllSubscriptions", description: "Delete all notification subscriptions", signature: "deleteAllSubscriptions(): Promise<any>", example: `await rift.notifications.deleteAllSubscriptions();`, auth: "jwt" },
    ],
  },
  {
    name: "Signer",
    sdkAccessor: "rift.signer",
    description: "Sign and send transactions via proxy wallet",
    methods: [
      { name: "getWalletInstance", description: "Get wallet instance for a chain", signature: "getWalletInstance(request: GetWalletInstanceRequest): Promise<WalletInstanceResponse>", example: `const wallet = await rift.signer.getWalletInstance({ chain: 'BASE' });`, auth: "jwt" },
      { name: "signTransaction", description: "REMOVED: raw EOA transaction signing. Rift wallets are passkey-owned Safe smart accounts with no EOA key; the backend answers 410 EOA_SIGNING_REMOVED. Use sendTransaction (UserOperation) instead.", signature: "signTransaction(request): Promise<never> // throws 410 EOA_SIGNING_REMOVED", example: `// Use instead:\nawait rift.signer.sendTransaction({ chain: 'BASE', transactionData: { to, data } });`, auth: "jwt" },
      { name: "sendTransaction", description: "Execute a call through the user's passkey-owned Safe as an ERC-4337 UserOperation. Without ticketId + authProof it returns (not throws) HTTP 202 { status: 'APPROVAL_REQUIRED', approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user, who approves with a passkey. Never retried. Two-phase: previewUserOp → createPasskeyAuthProof(hashToSign) → submitPreparedUserOp({ ticketId, authProof }). The hash returned is a userOperationHash, not a classic tx hash.", signature: "sendTransaction(request: SendTransactionRequest): Promise<MaybeApproval<SendTransactionResponse>>", example: `const p = await rift.signer.previewUserOp({ chain: 'BASE', transactionData: { to, data } });\nconst authProof = await createPasskeyAuthProof(getHashToSign(p), { rpId, allowCredentials: p.allowCredentials });\nconst r = await rift.signer.submitPreparedUserOp({ ticketId: p.ticketId, authProof });`, auth: "jwt" },
      { name: "signMessage", description: "Sign a message with the user's Safe (ERC-1271; ERC-6492 when undeployed on that chain). Without ticketId + authProof it returns (not throws) HTTP 202 { status: 'APPROVAL_REQUIRED', approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user, who approves with a passkey. Never retried. Two-phase: previewMessage → passkey → submitMessage.", signature: "signMessage(request: SignMessageRequest): Promise<MaybeApproval<SignMessageResponse>>", example: `const m = await rift.signer.previewMessage({ chain: 'BASE', message: 'Hello' });\nconst { signature } = await rift.signer.submitMessage({ ticketId: m.ticketId, authProof: await createPasskeyAuthProof(m.hashToSign, { rpId }) });`, auth: "jwt" },
    ],
  },
  {
    name: "Assets",
    sdkAccessor: "rift.assets",
    description: "Query supported chains and tokens",
    methods: [
      { name: "getSupportedChains", description: "Get all supported blockchains", signature: "getSupportedChains(active?: boolean): Promise<ChainsResponse>", example: `const chains = await rift.assets.getSupportedChains();`, auth: "none" },
      { name: "getAllTokens", description: "Get all supported tokens", signature: "getAllTokens(): Promise<TokensResponse>", example: `const { data } = await rift.assets.getAllTokens();`, auth: "none" },
      { name: "getUserTokens", description: "Get tokens the user holds", signature: "getUserTokens(): Promise<TokensResponse>", example: `const { data } = await rift.assets.getUserTokens();`, auth: "jwt" },
      { name: "getTokensByChainId", description: "Get tokens on a specific chain", signature: "getTokensByChainId(chainId: string): Promise<TokensResponse>", example: `const { data } = await rift.assets.getTokensByChainId('8453');`, auth: "none" },
      { name: "getChainById", description: "Get chain info by ID", signature: "getChainById(chainId: string): Promise<any>", example: `const chain = await rift.assets.getChainById('8453');`, auth: "none" },
    ],
  },
  {
    name: "UserManagement",
    sdkAccessor: "rift.userManagement",
    description: "Suspend and manage users within your project. PROJECT OWNER only: authorised by the project owner's bearer token (log in as the owner first). projectOwnerEmail/projectOwnerPhone are deprecated and ignored.",
    methods: [
      { name: "suspendUser", description: "Suspend a user", signature: "suspendUser(request: SuspendUserRequest): Promise<SuspendUserResponse>", example: `await rift.userManagement.suspendUser({ email: 'user@example.com', reason: 'Suspicious activity' });`, auth: "jwt" },
      { name: "unsuspendUser", description: "Unsuspend a user", signature: "unsuspendUser(request: UnsuspendUserRequest): Promise<UnsuspendUserResponse>", example: `await rift.userManagement.unsuspendUser({ email: 'user@example.com' });`, auth: "jwt" },
      { name: "getSuspendedUsers", description: "List suspended users", signature: "getSuspendedUsers(request?: GetSuspendedUsersRequest): Promise<GetSuspendedUsersResponse>", example: `const result = await rift.userManagement.getSuspendedUsers();`, auth: "jwt" },
      { name: "getUserStatus", description: "Check if a user is suspended", signature: "getUserStatus(request: GetUserStatusRequest): Promise<GetUserStatusResponse>", example: `const result = await rift.userManagement.getUserStatus({ email: 'user@example.com' });`, auth: "jwt" },
    ],
  },
  {
    name: "Deposits",
    sdkAccessor: "rift.deposits",
    description: "Track USDC deposits on Base network",
    methods: [
      { name: "getAllDeposits", description: "Get all deposits for the user", signature: "getAllDeposits(): Promise<GetAllDepositsResponse>", example: `const { deposits } = await rift.deposits.getAllDeposits();`, auth: "jwt" },
    ],
  },
];

export const API_ENDPOINTS: Record<string, Endpoint[]> = {
  auth: [
    { method: "POST", path: "/api/v1/auth/signup", auth: "api_key", description: "Create user account. Email/phone sign-up: send /auth/otp/send first and include otpCode, then login with the SAME code", requestBody: { "externalId+password | email | phoneNumber": "string", displayName: "string", otpCode: "string? (required for email/phone when the server enforces it)" } },
    { method: "POST", path: "/api/v1/auth/login", auth: "api_key", description: "Login and get access token", requestBody: { "email|phoneNumber|externalId": "string", "otpCode|password": "string" } },
    { method: "POST", path: "/api/v1/auth/google", auth: "api_key", description: "Sign in (or sign up) with a Google ID token. Frontend gets idToken from Google's identity flow.", requestBody: { idToken: "string (Google ID token)", referrer: "string?" } },
    { method: "POST", path: "/api/v1/auth/apple", auth: "api_key", description: "Sign in (or sign up) with an Apple identity token. Pass displayName on first sign-in (Apple won't send it again).", requestBody: { idToken: "string (Apple identity token)", displayName: "string?", referrer: "string?" } },
    { method: "PUT", path: "/api/v1/auth/user/update", auth: "jwt", description: "Update user profile (including autoSwapEnabled, autoSwapTargetChain). Email/phone changes need an OTP for the NEW value", requestBody: { displayName: "string?", email: "string?", phoneNumber: "string?", otpCode: "string? (changing one of email/phone)", emailOtpCode: "string? (changing both)", phoneOtpCode: "string? (changing both)", autoSwapEnabled: "boolean?", autoSwapTargetChain: "BASE|ARBITRUM|POLYGON|ETHEREUM?" } },
    { method: "GET", path: "/api/v1/auth/user/me", auth: "jwt", description: "Get current user profile" },
    { method: "DELETE", path: "/api/v1/auth/user/delete", auth: "jwt", description: "Delete user account" },
    { method: "POST", path: "/api/v1/auth/otp/send", auth: "api_key", description: "Send OTP", requestBody: { "email|phone": "string" } },
    { method: "POST", path: "/api/v1/auth/otp/verify", auth: "api_key", description: "Verify OTP", requestBody: { "email|phone": "string", code: "string" } },
    { method: "POST", path: "/api/v2/auth/migrate-to-v3", auth: "jwt", description: "REMOVED: answers 410 REPLACED_BY_PASSKEY_WALLETS. Register a passkey instead (/api/v1/passkeys)." },
  ],
  wallet: [
    { method: "GET", path: "/api/v1/wallet/token-balance", auth: "jwt", description: "Get token balance", queryParams: { token: "USDC|USDT|ETH|...", chain: "BASE|POLYGON|...?" } },
    { method: "GET", path: "/api/v1/wallet/chain-balance", auth: "jwt", description: "Get all balances on a chain", queryParams: { chain: "BASE|POLYGON|...?" } },
  ],
  transaction: [
    { method: "POST", path: "/api/v1/transaction/send", auth: "jwt", description: "Send crypto. Without a passkey proof → 202 APPROVAL_REQUIRED { approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user.", requestBody: { ticketId: "string? (from preview)", authProof: "PasskeyAuthProof? (from preview)", to: "string", value: "string", token: "USDC|USDT|...", chain: "BASE|POLYGON|...", type: "gasless|normal?", "email|phoneNumber|externalId": "string", "otpCode|password": "string" } },
    { method: "POST", path: "/api/v1/transaction/preview", auth: "jwt", description: "Two-phase transfer preview → { ticketId, hashToSign, allowCredentials, expiresAt }. Submit via /api/v1/signer/submit-prepared.", requestBody: { token: "string", chain: "string", recipient: "string", amount: "string" } },
    { method: "GET", path: "/api/v1/transaction/history", auth: "jwt", description: "Get transaction history", queryParams: { limit: "number?", page: "number?", token: "string?", chain: "string?" } },
    { method: "GET", path: "/api/v1/transaction/fee", auth: "jwt", description: "Calculate fee", queryParams: { recipient: "string", amount: "string", chain: "string", token: "string" } },
  ],
  offramp: [
    { method: "POST", path: "/api/v1/offramp/preview_exchange_rate", auth: "jwt", description: "Preview exchange rate", requestBody: { currency: "KES|NGN|UGX|GHS|ETB|CDF", amount: "number?", type: "offramp|onramp?" } },
    { method: "GET", path: "/api/v1/offramp/payment_methods/:currency", auth: "jwt", description: "Get payment methods", urlParams: { currency: "KES|NGN|..." } },
    { method: "POST", path: "/api/v1/offramp/pay", auth: "jwt", description: "Execute offramp payment. Without a passkey proof → 202 APPROVAL_REQUIRED { approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user.", requestBody: { ticketId: "string? (from preview)", authProof: "PasskeyAuthProof? (from preview)", token: "USDC", amount: "number", currency: "KES|NGN|...", chain: "BASE|POLYGON", recipient: "JSON string {name, bankCode, accountNumber}" } },
    { method: "POST", path: "/api/v1/offramp/preview", auth: "jwt", description: "Two-phase offramp transfer preview. Submit via /api/v1/signer/submit-prepared.", requestBody: { token: "string", chain: "string", amount: "string", lpAddress: "string" } },
    { method: "POST", path: "/api/v1/offramp/get-withdrawal-fee", auth: "jwt", description: "Get withdrawal fee", requestBody: { amount: "number" } },
    { method: "GET", path: "/api/v1/offramp/poll_order_status", auth: "jwt", description: "Poll order status", queryParams: { transactionCode: "string", currency: "string" } },
    { method: "GET", path: "/api/v1/offramp/get_orders", auth: "jwt", description: "Get all offramp orders" },
  ],
  onramp: [
    { method: "POST", path: "/api/v1/onramp/", auth: "jwt", description: "Buy crypto with mobile money", requestBody: { shortcode: "string", amount: "number", chain: "BASE|POLYGON", asset: "USDC", mobile_network: "string", country_code: "string" } },
    { method: "POST", path: "/api/v1/onramp/status", auth: "jwt", description: "Get onramp status", requestBody: { transactionCode: "string" } },
    { method: "GET", path: "/api/v1/onramp/orders/:userId", auth: "jwt", description: "Get onramp orders" },
  ],
  defi: [
    { method: "POST", path: "/api/v1/defi/swap", auth: "jwt", description: "On-chain token swap on a single chain (DEPRECATED: upstream endpoint removed). Without a passkey proof → 202 APPROVAL_REQUIRED { approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user.", requestBody: { chain: "BASE|POLYGON|ARBITRUM|...", flow: "gasless|normal", token_to_sell: "USDC|USDT|...", token_to_buy: "WETH|USDC|...", value: "string (amount of token_to_sell)", token_to_sell_address: "string? (for arbitrary ERC-20)", token_to_buy_address: "string?", amountOut: "string?", isEth: "boolean?", isBuyingEth: "boolean?" } },
  ],
  bridge: [
    { method: "GET", path: "/api/v1/bridge/routes", auth: "api_key", description: "Get available bridge routes" },
    { method: "POST", path: "/api/v1/bridge/quote", auth: "api_key", description: "Get bridge quote", requestBody: { sourceChain: "string", destinationChain: "string", token: "USDC|USDT", amount: "string" } },
    { method: "POST", path: "/api/v1/bridge/execute", auth: "jwt", description: "Execute bridge transfer. Without a passkey proof → 202 APPROVAL_REQUIRED { approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user.", requestBody: { ticketId: "string? (from preview)", authProof: "PasskeyAuthProof? (from preview)", sourceChain: "string", destinationChain: "string", token: "string", amount: "string", recipient: "string?" } },
    { method: "POST", path: "/api/v1/bridge/preview", auth: "jwt", description: "Two-phase bridge preview. Submit via /api/v1/signer/submit-prepared.", requestBody: { sourceChain: "string", destChain: "string", token: "string", amount: "string", recipient: "string?" } },
  ],
  kyc: [
    { method: "POST", path: "/api/v1/kyc/token", auth: "api_key", description: "Get KYC verification token", requestBody: { country_code: "string", identifier: "string" } },
    { method: "POST", path: "/api/v1/kyc/user-exists", auth: "api_key", description: "Check if user exists", requestBody: { "email|phoneNumber|externalId": "string" } },
    { method: "POST", path: "/api/v1/kyc/status", auth: "api_key", description: "Get KYC status", requestBody: { "email|phoneNumber|externalId": "string" } },
    { method: "POST", path: "/api/v1/kyc/verify", auth: "jwt", description: "Verify KYC job", requestBody: { jobId: "string" } },
    { method: "GET", path: "/api/v1/kyc/verified", auth: "jwt", description: "Check if user is KYC verified" },
    { method: "GET", path: "/api/v1/kyc/job/:jobId", auth: "jwt", description: "Get KYC job status", urlParams: { jobId: "string" } },
  ],
  walletconnect: [
    { method: "POST", path: "/api/v1/walletconnect/pair", auth: "jwt", description: "Pair with DApp", requestBody: { uri: "string (wc:...)", chain: "string" } },
    { method: "GET", path: "/api/v1/walletconnect/requests", auth: "jwt", description: "Get pending requests" },
    { method: "POST", path: "/api/v1/walletconnect/requests/:id/approve", auth: "jwt", description: "Approve request. Optional { ticketId, authProof } from /preview. Without a passkey proof → 202 APPROVAL_REQUIRED { approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user.", urlParams: { id: "string" }, requestBody: { ticketId: "string?", authProof: "PasskeyAuthProof?" } },
    { method: "POST", path: "/api/v1/walletconnect/requests/:id/preview", auth: "jwt", description: "Two-phase preview for a pending DApp request", urlParams: { id: "string" } },
    { method: "POST", path: "/api/v1/walletconnect/requests/:id/reject", auth: "jwt", description: "Reject request", urlParams: { id: "string" } },
    { method: "GET", path: "/api/v1/walletconnect/sessions", auth: "jwt", description: "List active sessions" },
    { method: "DELETE", path: "/api/v1/walletconnect/sessions/:topic", auth: "jwt", description: "Disconnect session", urlParams: { topic: "string" } },
  ],
  merchant: [
    { method: "POST", path: "/api/v1/merchant/invoices", auth: "jwt", description: "Create invoice", requestBody: { description: "string", chain: "string", token: "string", amount: "number", recipientEmail: "string?", recipientPhone: "string?" } },
    { method: "GET", path: "/api/v1/merchant/invoices", auth: "jwt", description: "List invoices", queryParams: { status: "PENDING|COMPLETED|EXPIRED?", sortBy: "createdAt|updatedAt?", sortOrder: "asc|desc?" } },
    { method: "GET", path: "/api/v1/merchant/status", auth: "jwt", description: "Get merchant KYB status" },
  ],
  notifications: [
    { method: "POST", path: "/api/v1/notifications/register", auth: "jwt", description: "Register for push notifications", requestBody: { subscriberId: "string", platform: "web|mobile?" } },
    { method: "POST", path: "/api/v1/notifications/unsubscribe", auth: "jwt", description: "Unsubscribe" },
    { method: "GET", path: "/api/v1/notifications/subscriptions", auth: "jwt", description: "Get subscriptions" },
    { method: "POST", path: "/api/v1/notifications/send", auth: "jwt", description: "Send to all devices", requestBody: { message: "string", title: "string?", targetUrl: "string?" } },
    { method: "DELETE", path: "/api/v1/notifications/subscriptions", auth: "jwt", description: "Delete all subscriptions" },
  ],
  signer: [
    { method: "POST", path: "/api/v1/signer/get-wallet-instance", auth: "jwt", description: "Get wallet instance", requestBody: { chain: "string" } },
    { method: "POST", path: "/api/v1/signer/sign-transaction", auth: "jwt", description: "REMOVED: raw EOA signing. Answers 410 EOA_SIGNING_REMOVED. Use /api/v1/signer/send-transaction." },
    { method: "POST", path: "/api/v1/signer/send-transaction", auth: "jwt", description: "Execute call via user's smart wallet as ERC-4337 UserOp. Returns userOperationHash (NOT a classic tx hash). Without a passkey proof → 202 APPROVAL_REQUIRED { approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user.", requestBody: { chain: "string", transactionData: "{ to: string (REQUIRED), value?: string, data?: string }", paymasterToken: "string? (ERC-20 contract to pay gas in a token; omit for sponsored gas)" } },
    { method: "POST", path: "/api/v1/signer/sign-message", auth: "jwt", description: "Sign message (ERC-1271 by the Safe). Without a passkey proof → 202 APPROVAL_REQUIRED { approvalId, approvalUrl, expiresAt, summary }: give approvalUrl to the user.", requestBody: { chain: "string", message: "string" } },
    { method: "POST", path: "/api/v1/signer/preview-user-op", auth: "jwt", description: "Two-phase UserOperation preview → { ticketId, hashToSign, allowCredentials }", requestBody: { chain: "string", transactionData: "{ to, value?, data? }" } },
    { method: "POST", path: "/api/v1/signer/submit-prepared", auth: "jwt", description: "Submit any previewed operation (transfer, user op, bridge, offramp). Single use, never retried.", requestBody: { ticketId: "string", authProof: "PasskeyAuthProof" } },
    { method: "POST", path: "/api/v1/signer/preview-message", auth: "jwt", description: "Two-phase message signature preview (Safe SafeMessage hash)", requestBody: { chain: "string", "message|typedData": "string | object" } },
    { method: "POST", path: "/api/v1/signer/submit-message", auth: "jwt", description: "Submit a message signature → { signature } (ERC-1271 / ERC-6492)", requestBody: { ticketId: "string", authProof: "PasskeyAuthProof" } },
  ],
  assets: [
    { method: "GET", path: "/api/v1/assets/tokens", auth: "api_key", description: "Get all tokens" },
    { method: "GET", path: "/api/v1/assets/tokens/chain/:chainId", auth: "api_key", description: "Get tokens by chain" },
    { method: "GET", path: "/api/v1/assets/tokens/user", auth: "jwt", description: "Get user's tokens" },
    { method: "GET", path: "/api/v1/assets/tokens/:tokenId", auth: "api_key", description: "Get token by ID" },
    { method: "GET", path: "/api/v1/assets/chains/:chainId", auth: "api_key", description: "Get chain info" },
    { method: "GET", path: "/api/v1/assets/supported-chains", auth: "api_key", description: "Get supported chains" },
  ],
  users: [
    { method: "POST", path: "/api/v1/users/suspend", auth: "jwt", description: "Suspend user (project owner's bearer token required)", requestBody: { "email|phoneNumber|externalId|userId": "string", reason: "string?" } },
    { method: "POST", path: "/api/v1/users/unsuspend", auth: "jwt", description: "Unsuspend user (project owner's bearer token required)", requestBody: { "email|phoneNumber|externalId|userId": "string" } },
    { method: "GET", path: "/api/v1/users/suspended", auth: "jwt", description: "List suspended users (project owner's bearer token required)" },
    { method: "GET", path: "/api/v1/users/status", auth: "jwt", description: "Check user suspension status (project owner's bearer token required)", queryParams: { "email|phoneNumber|externalId|userId": "string" } },
  ],
  passkeys: [
    { method: "GET", path: "/api/v1/wallet/status", auth: "jwt", description: "Passkey wallet status: { mode: none|legacy|passkey, walletAddress, passkeyCount, chains, needsPasskeySetup }" },
    { method: "POST", path: "/api/v1/passkeys/options", auth: "jwt", description: "WebAuthn registration options (ES256 / alg -7 only). The ceremony runs on the user's device." },
    { method: "POST", path: "/api/v1/passkeys", auth: "jwt", description: "Register a passkey → active | migrated | migrating | new_wallet | pending_signature (tickets for an EXISTING passkey)", requestBody: { attestation: "{ cred_id_b64, client_data_json_b64, attestation_object_b64 }", label: "string?" } },
    { method: "POST", path: "/api/v1/passkeys/confirm", auth: "jwt", description: "Confirm an added passkey", requestBody: { credentialId: "string", signatures: "[{ ticketId, authProof }]" } },
    { method: "GET", path: "/api/v1/passkeys", auth: "jwt", description: "List passkeys" },
    { method: "DELETE", path: "/api/v1/passkeys/:id", auth: "jwt", description: "Start removing a passkey → { tickets } (409 LAST_PASSKEY for the last one)", urlParams: { id: "string" } },
    { method: "POST", path: "/api/v1/passkeys/:id/confirm-removal", auth: "jwt", description: "Confirm passkey removal", urlParams: { id: "string" }, requestBody: { signatures: "[{ ticketId, authProof }]" } },
  ],
  approvals: [
    { method: "GET", path: "/api/v1/approvals", auth: "jwt", description: "List the user's approval requests", queryParams: { status: "pending|approved|rejected|expired|failed?" } },
    { method: "GET", path: "/api/v1/approvals/:id", auth: "api_key", description: "Approval status + result { transactionHash, userOpHash }. API key alone is enough for the creating project.", urlParams: { id: "string" } },
    { method: "POST", path: "/api/v1/approvals/:id/preview", auth: "jwt", description: "Fresh ticket + hashToSign from the stored intent", urlParams: { id: "string" } },
    { method: "POST", path: "/api/v1/approvals/:id/approve", auth: "jwt", description: "Approve with a passkey", urlParams: { id: "string" }, requestBody: { ticketId: "string", authProof: "PasskeyAuthProof" } },
    { method: "POST", path: "/api/v1/approvals/:id/reject", auth: "jwt", description: "Reject", urlParams: { id: "string" } },
  ],
  deposits: [
    { method: "GET", path: "/api/v1/deposits/", auth: "jwt", description: "Get all USDC deposits" },
  ],
};

export const SUPPORTED_CHAINS = [
  { name: "Ethereum", id: 1, native: "ETH", stablecoins: ["USDC", "USDT"] },
  { name: "Polygon", id: 137, native: "MATIC", stablecoins: ["USDC", "USDT"] },
  { name: "Base", id: 8453, native: "ETH", stablecoins: ["USDC", "USDT"] },
  { name: "Arbitrum", id: 42161, native: "ETH", stablecoins: ["USDC", "USDT"] },
  { name: "Optimism", id: 10, native: "ETH", stablecoins: ["USDC", "USDT"] },
  { name: "Celo", id: 42220, native: "CELO", stablecoins: ["cUSD", "USDC"] },
  { name: "Lisk", id: 1135, native: "LSK", stablecoins: ["USDC"] },
  { name: "BNB Smart Chain", id: 56, native: "BNB", stablecoins: ["USDC", "USDT"] },
  { name: "Berachain", id: 80094, native: "BERA", stablecoins: ["USDC"] },
];

export const SUPPORTED_CURRENCIES = [
  { code: "KES", country: "Kenya", methods: ["M-Pesa (Safaricom)", "Airtel", "Paybill", "Buy Goods", "Bank Transfer"] },
  { code: "NGN", country: "Nigeria", methods: ["Bank Transfer (GTBank, Access, UBA, Zenith, First Bank, etc.)"] },
  { code: "UGX", country: "Uganda", methods: ["MTN Mobile Money", "Airtel Money"] },
  { code: "GHS", country: "Ghana", methods: ["MTN Mobile Money", "Vodafone Cash", "AirtelTigo", "Bank Transfer"] },
  { code: "ETB", country: "Ethiopia", methods: ["Telebirr", "CBE Birr"] },
  { code: "CDF", country: "DR Congo", methods: ["Orange Money", "Airtel Money"] },
  { code: "TZS", country: "Tanzania", methods: ["Vodacom M-Pesa", "Airtel Money", "Halopesa", "Bank Transfer"] },
  { code: "MWK", country: "Malawi", methods: ["Airtel Money", "TNM Mpamba", "Bank Transfer"] },
  { code: "BRL", country: "Brazil", methods: ["PIX"] },
];

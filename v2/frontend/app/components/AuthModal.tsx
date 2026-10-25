"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, useConnect, type Connector } from "wagmi";
import { useSession } from "../session";
import { errorText } from "@/lib/backend";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

/**
 * How the dialog opens. "login" starts at the sign-in method picker,
 * "signup" goes straight to the email sign-up form, and "link" adds an email
 * login to the signed-in account (email form only).
 */
export type AuthMode = "login" | "signup" | "link";

interface AuthModalProps {
    isOpen: boolean;
    initialMode?: AuthMode;
    onClose: () => void;
    onDone?: (mode: AuthMode) => void;
}

type Step = "methods" | "wallet" | "email";
type MethodId = "wallet" | "email";

/** Sign-in methods, in default order. Add new ones (Google, Telegram...) here. */
const METHODS: { id: MethodId; label: string; hint: string; icon: ReactNode }[] = [
    {
        id: "wallet",
        label: "Crypto wallet",
        hint: "MetaMask, Rabby, Coinbase Wallet",
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h13a1 1 0 011 1v2M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-3M3 7h16a1 1 0 011 1v3m0 0h-4a2 2 0 000 4h4m0-4v4" />
            </svg>
        ),
    },
    {
        id: "email",
        label: "Email",
        hint: "Email and password",
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l8.89 5.26a2 2 0 002.22 0L23 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
        ),
    },
];

const LAST_METHOD_KEY = "tactiball:lastSignInMethod";

function readLastMethod(): MethodId | null {
    try {
        const v = window.localStorage.getItem(LAST_METHOD_KEY);
        return METHODS.some((m) => m.id === v) ? (v as MethodId) : null;
    } catch {
        return null;
    }
}

function saveLastMethod(id: MethodId) {
    try {
        window.localStorage.setItem(LAST_METHOD_KEY, id);
    } catch {
        // Storage blocked: the picker just keeps its default order.
    }
}

/**
 * One button per wallet: EIP-6963 discovery can list the same wallet twice,
 * and the generic "Injected" connector is the same extension as a named one
 * (MetaMask, Rabby) whenever one is detected.
 */
function uniqueConnectors(connectors: readonly Connector[]): Connector[] {
    const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
    const seen = new Set<string>();
    return connectors.filter((c) => {
        if (named && c.id === "injected") return false;
        const name = c.name.toLowerCase();
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
    });
}

/** The wallet said no, or its popup was closed. */
function isRejection(err: unknown): boolean {
    const e = err as { code?: number; name?: string; message?: string; cause?: { code?: number } } | null;
    return e?.code === 4001 || e?.cause?.code === 4001 || e?.name === "UserRejectedRequestError" || /reject|denied|cancel/i.test(e?.message ?? "");
}

const CANCELLED = "Wallet request cancelled.";

export function AuthModal({ isOpen, initialMode = "login", onClose, onDone }: AuthModalProps) {
    const { signInWithEmail, linkEmail, ensureSignedIn, cancelSignIn, session } = useSession();
    const { address, isConnected } = useAccount();
    const { connectors, connectAsync } = useConnect();
    const [step, setStep] = useState<Step>("methods");
    // Email step only: sign in to an existing account, or create one.
    const [signUp, setSignUp] = useState(false);
    const [lastMethod, setLastMethod] = useState<MethodId | null>(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    // "email", or "wallet:<connector uid>" / "wallet:connected" while that wallet is asked.
    const [busy, setBusy] = useState<string | null>(null);
    // Bumped on every wallet attempt and on cancel; a wallet promise that
    // settles after its attempt was cancelled is ignored.
    const walletAttempt = useRef(0);
    // Set after a wallet connects from this dialog: the session picks up the
    // new address on the next render, then we ask for the sign-in signature.
    const walletPending = useRef(false);
    const pendingKey = useRef("wallet:connected");

    const linking = initialMode === "link";

    useEffect(() => {
        if (isOpen) {
            setStep(initialMode === "login" ? "methods" : "email");
            setSignUp(initialMode === "signup");
            setLastMethod(readLastMethod());
            setPassword("");
            setConfirm("");
            setError(null);
        }
    }, [isOpen, initialMode]);

    const finish = (method: MethodId, mode: AuthMode) => {
        saveLastMethod(method);
        onDone?.(mode);
        onClose();
    };

    const walletError = (err: unknown) => {
        console.warn("Wallet sign-in failed:", err);
        setError(isRejection(err) ? CANCELLED : errorText(err));
    };

    const signWithWallet = async (key = "wallet:connected") => {
        const attempt = ++walletAttempt.current;
        setBusy(key);
        setError(null);
        try {
            await ensureSignedIn();
            if (attempt === walletAttempt.current) finish("wallet", "login");
        } catch (err) {
            if (attempt === walletAttempt.current) walletError(err);
        } finally {
            if (attempt === walletAttempt.current) setBusy(null);
        }
    };

    useEffect(() => {
        if (walletPending.current && address && !session) {
            walletPending.current = false;
            signWithWallet(pendingKey.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, session]);

    const handleConnector = async (connector: Connector) => {
        const key = `wallet:${connector.uid}`;
        const attempt = ++walletAttempt.current;
        setBusy(key);
        setError(null);
        walletPending.current = true;
        pendingKey.current = key;
        try {
            await connectAsync({ connector });
        } catch (err) {
            if (attempt !== walletAttempt.current) return;
            walletPending.current = false;
            walletError(err);
            setBusy(null);
        }
    };

    /** Stops waiting for the wallet; the dialog is usable again right away. */
    const cancelWallet = () => {
        walletAttempt.current++;
        walletPending.current = false;
        cancelSignIn();
        setBusy(null);
        setError(CANCELLED);
    };

    const newPassword = linking || signUp;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword && password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
            return;
        }
        if (newPassword && password !== confirm) {
            setError("Passwords don't match");
            return;
        }
        setBusy("email");
        setError(null);
        try {
            if (linking) {
                await linkEmail(email, password);
                finish("email", "link");
            } else {
                await signInWithEmail(signUp ? "signup" : "login", email, password);
                finish("email", signUp ? "signup" : "login");
            }
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(null);
        }
    };

    const walletBusy = busy?.startsWith("wallet:") ?? false;
    const emailBusy = busy === "email";

    const handleClose = () => {
        if (emailBusy) return;
        if (walletBusy) cancelWallet();
        walletPending.current = false;
        onClose();
    };

    const goTo = (next: Step) => {
        if (walletBusy) cancelWallet();
        setStep(next);
        setError(null);
    };

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    if (!isOpen) return null;

    const input = "w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
    const spinner = <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>;
    const methods = [...METHODS].sort((a, b) => Number(b.id === lastMethod) - Number(a.id === lastMethod));
    const title = linking ? "Add email login" : step === "wallet" ? "Crypto wallet" : step === "email" ? (signUp ? "Create an account" : "Sign in with email") : "Sign in to TactiBall";
    const canGoBack = step !== "methods" && !linking;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleClose} />

            <div className="modal relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center gap-3 p-6 border-b border-gray-200">
                    {canGoBack && (
                        <button onClick={() => goTo("methods")} disabled={emailBusy} aria-label="Back" className="text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                    <h2 className="flex-1 text-xl font-semibold text-gray-900">{title}</h2>
                    <button onClick={handleClose} disabled={emailBusy} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {step === "methods" && (
                        <div className="space-y-3">
                            {methods.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => goTo(m.id)}
                                    className="w-full flex items-center gap-4 px-4 py-3 border border-gray-200 rounded-lg text-left text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                                >
                                    <span className="text-gray-700">{m.icon}</span>
                                    <span className="flex-1">
                                        <span className="block font-semibold">{m.label}</span>
                                        <span className="block text-xs text-gray-500">{m.hint}</span>
                                    </span>
                                    {m.id === lastMethod && <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Last used</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    {step === "wallet" && (
                        <div className="space-y-2">
                            {isConnected && address ? (
                                <button type="button" onClick={() => signWithWallet()} disabled={Boolean(busy)} className="w-full flex items-center justify-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                                    {busy === "wallet:connected" && spinner}
                                    Continue with {address.slice(0, 6)}…{address.slice(-4)}
                                </button>
                            ) : (
                                uniqueConnectors(connectors).map((c) => (
                                    <button key={c.uid} type="button" onClick={() => handleConnector(c)} disabled={Boolean(busy)} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                                        {busy === `wallet:${c.uid}` ? spinner : c.icon && <img src={c.icon} alt="" className="w-5 h-5" />}
                                        {c.name === "Injected" ? "Browser wallet" : c.name}
                                    </button>
                                ))
                            )}
                            {walletBusy ? (
                                <p className="text-xs text-center text-gray-600">
                                    Check your wallet to continue.{" "}
                                    <button type="button" onClick={cancelWallet} className="text-blue-600 hover:underline">Cancel</button>
                                </p>
                            ) : (
                                <p className="text-xs text-center text-gray-500">New wallets get an account automatically. Signing is free: no transaction or gas.</p>
                            )}
                            {error && <p className="text-sm text-center text-red-600">{error}</p>}
                        </div>
                    )}

                    {step === "email" && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {linking && (
                                <p className="text-sm text-gray-600">You&apos;ll be able to log in with this email and password as well as your wallet.</p>
                            )}
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} disabled={emailBusy} />
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                                <input id="password" type="password" autoComplete={newPassword ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} className={input} disabled={emailBusy} />
                            </div>
                            {newPassword && (
                                <div>
                                    <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">Repeat password</label>
                                    <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} disabled={emailBusy} />
                                </div>
                            )}

                            {error && <p className="text-sm text-red-600">{error}</p>}

                            <button type="submit" disabled={emailBusy} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                                {emailBusy ? (
                                    <span className="flex items-center justify-center">
                                        {spinner}
                                        {linking ? "Adding email..." : signUp ? "Creating account..." : "Signing in..."}
                                    </span>
                                ) : linking ? "Add email" : signUp ? "Create account" : "Continue"}
                            </button>

                            {!linking && (
                                <p className="text-sm text-center text-gray-600">
                                    {signUp ? "Have an account? " : "New here? "}
                                    <button type="button" disabled={emailBusy} onClick={() => { setSignUp(!signUp); setError(null); }} className="text-blue-600 hover:underline">
                                        {signUp ? "Sign in" : "Create an account"}
                                    </button>
                                </p>
                            )}
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

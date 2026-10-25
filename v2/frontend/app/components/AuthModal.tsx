"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, type Connector } from "wagmi";
import { useSession } from "../session";
import { errorText } from "@/lib/backend";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

/**
 * "login" and "signup" are the two tabs of the sign-in dialog, where the
 * player picks a wallet or email. "link" adds an email login to the
 * signed-in account (email form only).
 */
export type AuthMode = "login" | "signup" | "link";

interface AuthModalProps {
    isOpen: boolean;
    initialMode?: AuthMode;
    onClose: () => void;
    onDone?: (mode: AuthMode) => void;
}

const SUBMIT: Record<AuthMode, [string, string]> = {
    login: ["Sign in with email", "Signing in..."],
    signup: ["Create account", "Creating account..."],
    link: ["Add email", "Adding email..."],
};

/** One button per wallet: EIP-6963 discovery can list the same wallet twice. */
function uniqueConnectors(connectors: readonly Connector[]): Connector[] {
    const seen = new Set<string>();
    return connectors.filter((c) => {
        const name = c.name.toLowerCase();
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
    });
}

export function AuthModal({ isOpen, initialMode = "login", onClose, onDone }: AuthModalProps) {
    const { signInWithEmail, linkEmail, ensureSignedIn, session } = useSession();
    const { address, isConnected } = useAccount();
    const { connectors, connectAsync } = useConnect();
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    // Set after a wallet connects from this dialog: the session picks up the
    // new address on the next render, then we ask for the sign-in signature.
    const walletPending = useRef(false);

    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
            setPassword("");
            setConfirm("");
            setError(null);
        }
    }, [isOpen, initialMode]);

    const finish = (m: AuthMode) => {
        onDone?.(m);
        onClose();
    };

    const signWithWallet = async () => {
        setBusy("wallet");
        setError(null);
        try {
            await ensureSignedIn();
            finish(mode);
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(null);
        }
    };

    useEffect(() => {
        if (walletPending.current && address && !session) {
            walletPending.current = false;
            signWithWallet();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, session]);

    const handleConnector = async (connector: Connector) => {
        setBusy("wallet");
        setError(null);
        try {
            walletPending.current = true;
            await connectAsync({ connector });
        } catch (err) {
            walletPending.current = false;
            setError(errorText(err));
            setBusy(null);
        }
    };

    const newPassword = mode !== "login";

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
            if (mode === "link") {
                await linkEmail(email, password);
            } else {
                await signInWithEmail(mode, email, password);
            }
            finish(mode);
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(null);
        }
    };

    const handleClose = () => {
        if (busy) return;
        walletPending.current = false;
        onClose();
    };

    if (!isOpen) return null;

    const input = "w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
    const tab = (m: AuthMode, label: string) => (
        <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => { setMode(m); setError(null); }}
            className={`flex-1 pb-3 text-base font-semibold border-b-2 transition-colors ${mode === m ? "border-black text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
            {label}
        </button>
    );
    const spinner = (white: boolean) => <span className={`animate-spin rounded-full h-4 w-4 border-b-2 mr-2 ${white ? "border-white" : "border-gray-800"}`}></span>;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleClose} />

            <div className="modal relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between px-6 pt-6 border-b border-gray-200">
                    {mode === "link" ? (
                        <h2 className="text-xl font-semibold text-gray-900 pb-4">Add email login</h2>
                    ) : (
                        <div className="flex flex-1 gap-4 mr-4">
                            {tab("login", "Sign in")}
                            {tab("signup", "Sign up")}
                        </div>
                    )}
                    <button onClick={handleClose} disabled={Boolean(busy)} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {mode !== "link" && (
                        <>
                            <div className="space-y-2">
                                {isConnected && address ? (
                                    <button type="button" onClick={signWithWallet} disabled={Boolean(busy)} className="w-full flex items-center justify-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                                        {busy === "wallet" && spinner(true)}
                                        Continue with {address.slice(0, 6)}…{address.slice(-4)}
                                    </button>
                                ) : (
                                    uniqueConnectors(connectors).map((c) => (
                                        <button key={c.uid} type="button" onClick={() => handleConnector(c)} disabled={Boolean(busy)} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                                            {busy === "wallet" ? spinner(true) : c.icon && <img src={c.icon} alt="" className="w-5 h-5" />}
                                            Continue with {c.name === "Injected" ? "browser wallet" : c.name}
                                        </button>
                                    ))
                                )}
                                <p className="text-xs text-center text-gray-500">
                                    {mode === "signup" ? "A new wallet gets an account on its first sign-in. " : ""}
                                    Your wallet signs one message; no transaction or gas.
                                </p>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-400 uppercase">
                                <div className="flex-1 border-t border-gray-200" />
                                or with email
                                <div className="flex-1 border-t border-gray-200" />
                            </div>
                        </>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === "link" && (
                            <p className="text-sm text-gray-600">You&apos;ll be able to log in with this email and password as well as your wallet.</p>
                        )}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} disabled={Boolean(busy)} />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                            <input id="password" type="password" autoComplete={newPassword ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} className={input} disabled={Boolean(busy)} />
                        </div>
                        {newPassword && (
                            <div>
                                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">Repeat password</label>
                                <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} disabled={Boolean(busy)} />
                            </div>
                        )}

                        {error && <p className="text-sm text-red-600">{error}</p>}

                        <button type="submit" disabled={Boolean(busy)} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                            {busy === "email" ? (
                                <span className="flex items-center justify-center">
                                    {spinner(true)}
                                    {SUBMIT[mode][1]}
                                </span>
                            ) : SUBMIT[mode][0]}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { useSession } from "../session";
import { errorText } from "@/lib/backend";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

/** "login" and "signup" sign in; "link" adds an email login to the signed-in account. */
export type EmailAuthMode = "login" | "signup" | "link";

interface EmailAuthModalProps {
    isOpen: boolean;
    initialMode?: EmailAuthMode;
    onClose: () => void;
    onDone?: (mode: EmailAuthMode) => void;
}

const TITLES: Record<EmailAuthMode, string> = {
    login: "Log in with email",
    signup: "Sign up with email",
    link: "Add email login",
};

const SUBMIT: Record<EmailAuthMode, [string, string]> = {
    login: ["Log in", "Logging in..."],
    signup: ["Create account", "Creating account..."],
    link: ["Add email", "Adding email..."],
};

export function EmailAuthModal({ isOpen, initialMode = "login", onClose, onDone }: EmailAuthModalProps) {
    const { signInWithEmail, linkEmail } = useSession();
    const [mode, setMode] = useState<EmailAuthMode>(initialMode);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
            setPassword("");
            setConfirm("");
            setError(null);
        }
    }, [isOpen, initialMode]);

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
        setBusy(true);
        setError(null);
        try {
            if (mode === "link") {
                await linkEmail(email, password);
            } else {
                await signInWithEmail(mode, email, password);
            }
            onDone?.(mode);
            onClose();
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(false);
        }
    };

    const handleClose = () => {
        if (!busy) onClose();
    };

    if (!isOpen) return null;

    const input = "w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleClose} />

            <div className="modal relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">{TITLES[mode]}</h2>
                    <button onClick={handleClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {mode === "link" && (
                        <p className="text-sm text-gray-600">You&apos;ll be able to log in with this email and password as well as your wallet.</p>
                    )}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} disabled={busy} />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                        <input id="password" type="password" autoComplete={newPassword ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} className={input} disabled={busy} />
                    </div>
                    {newPassword && (
                        <div>
                            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">Repeat password</label>
                            <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} disabled={busy} />
                        </div>
                    )}

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <button type="submit" disabled={busy} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                        {busy ? (
                            <span className="flex items-center justify-center">
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                                {SUBMIT[mode][1]}
                            </span>
                        ) : SUBMIT[mode][0]}
                    </button>

                    {mode !== "link" && (
                        <p className="text-sm text-center text-gray-600">
                            {mode === "login" ? "New to TactiBall? " : "Already have an account? "}
                            <button type="button" disabled={busy} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }} className="text-blue-600 hover:underline">
                                {mode === "login" ? "Sign up" : "Log in"}
                            </button>
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
}

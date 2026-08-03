import React, { useState } from 'react';
import API from '../../api';
import { Link, useNavigate } from 'react-router-dom';
import { getStaffLandingPath } from '../../utils/permissions';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [forgotMode, setForgotMode] = useState(false);
    const navigate = useNavigate();

    const validEmail = () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(String(email || '').trim());
    };

    const handleLogin = async () => {
        setError('');
        setMessage('');
        if (!email || !password) {
            setError('Email and password must be filled.');
            return;
        }

        if (!validEmail()) {
            setError('Please enter a valid email address.');
            return;
        }
        setLoading(true);

        try {
          await API.get('/healthz', { params: { t: Date.now() } });
        } catch {
            setError('Server is waking up… try login now.');
        }

        try {
            const { data } = await API.post('/admin/login', { email, password });
            localStorage.setItem('adminToken', data.token);
            if (data.admin) {
                localStorage.setItem('adminUser', JSON.stringify(data.admin));
            }
            navigate(getStaffLandingPath());
        } catch (err) {
            const status = err?.response?.status;
            if (status === 401) {
                setError('Invalid email or password.');
            } else if (status === 403) {
                setError(err?.response?.data?.error || 'This staff account cannot log in.');
            } else {
                setError('Unexpected error. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const requestReset = async () => {
        setError('');
        setMessage('');
        if (!validEmail()) {
            setError('Enter your staff email first.');
            return;
        }
        setLoading(true);
        try {
            const { data } = await API.post('/admin/login/request-password-reset', { email });
            setMessage(data?.message || 'If a staff account exists for this email, a password reset link has been sent.');
        } catch {
            setMessage('If a staff account exists for this email, a password reset link has been sent.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-1">Staff Login</h2>
            <p className="mb-4 text-sm text-gray-600">Owners, admins, front desk, and stylists use the same login. Access is controlled by role permissions.</p>
            {error && <p className="mb-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            {message && <p className="mb-2 rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">{message}</p>}
            <input
                type="email"
                placeholder="Email / username"
                className="w-full border px-2 py-1 mb-2"
                value={email}
                onChange={e => setEmail(e.target.value)}
            />
            {!forgotMode && (
                <input
                    type="password"
                    placeholder="Password"
                    className="w-full border px-2 py-1 mb-3"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                />
            )}
            <div className="flex flex-wrap items-center gap-2">
                {!forgotMode ? (
                    <button
                        onClick={handleLogin}
                        disabled={loading}
                        className={`px-4 py-2 rounded text-white ${loading ? 'bg-gray-400' : 'bg-blue-600'}`}
                    >
                        {loading ? 'Processing…' : 'Login'}
                    </button>
                ) : (
                    <button
                        onClick={requestReset}
                        disabled={loading}
                        className={`px-4 py-2 rounded text-white ${loading ? 'bg-gray-400' : 'bg-blue-600'}`}
                    >
                        {loading ? 'Sending…' : 'Send Reset Link'}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => { setForgotMode((v) => !v); setError(''); setMessage(''); }}
                    className="text-sm text-blue-600 underline"
                >
                    {forgotMode ? 'Back to login' : 'Forgot password?'}
                </button>
            </div>
            <p className="mt-4 text-xs text-gray-500">
                New staff member? Ask an owner/admin to send an invite from Staff / Workers. The username will be your email.
            </p>
            <p className="mt-2 text-xs text-gray-400">
                Invite link page: <Link to="/admin/set-password" className="underline">create password</Link>
            </p>
        </div>
    );
}

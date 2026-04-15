import React, { useState } from 'react';
import API from '../../api';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async () => {
        setError('');
        if (!email || !password) {
            setError('Email and password must be filled.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError('Please enter a valid email address.');
            return;
        }
        setLoading(true);

        try {
          await API.get('/healthz', { params: { t: Date.now() } });
        } catch {
            // Optional: show a softer preflight message, but don't spin for minutes.
            setError('Server is waking up… try login now.');
        }

        try {
            const { data } = await API.post('/admin/login', { email, password });
            localStorage.setItem('adminToken', data.token);
            navigate('/admin/appointments');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 401) {
                setError('Invalid email or password.');
            } else {
                setError('Unexpected error. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4">Admin Login</h2>
            {error && <p className="text-red-600">{error}</p>}
            <input
                type="email"
                placeholder="Email"
                className="w-full border px-2 py-1 mb-2"
                value={email}
                onChange={e => setEmail(e.target.value)}
            />
            <input
                type="password"
                placeholder="Password"
                className="w-full border px-2 py-1 mb-4"
                value={password}
                onChange={e => setPassword(e.target.value)}
            />
            <button
                onClick={handleLogin}
                disabled={loading}
                className={`px-4 py-2 rounded text-white ${loading ? 'bg-gray-400' : 'bg-blue-600'}`}
            >
                {loading ? (
                    <div className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                            />
                        </svg>
                        Processing...
                    </div>
                ) : (
                    'Login'
                )}
            </button>
        </div>
    );
}

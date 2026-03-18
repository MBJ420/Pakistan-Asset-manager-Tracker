import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import { Lock, User } from 'lucide-react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const params = new URLSearchParams();
            params.append('username', username);
            params.append('password', password);

            const response = await client.post('/token', params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            console.log("Login Response:", response.data); // Debugging
            localStorage.setItem('token', response.data.access_token);
            // Also store username for future use
            localStorage.setItem('username', username);

            navigate('/');
        } catch (err: any) {
            const errorMessage = err.response?.data?.detail || err.message || 'Login failed';
            setError(errorMessage);
            console.error(err);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-midnight text-text-primary">
            <div className="absolute top-0 left-0 w-full h-96 bg-neon-purple/5 blur-[120px] pointer-events-none" />
            <div className="w-full max-w-md p-8 space-y-6 bg-surface border border-white/5 rounded-2xl shadow-2xl relative z-10">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-purple to-electric-blue flex items-center justify-center shadow-lg shadow-neon-purple/20 mb-4 text-white">
                        <Lock size={24} />
                    </div>
                    <h2 className="text-3xl font-bold text-center tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">FundTracker</h2>
                    <h3 className="text-sm text-center text-text-secondary mt-1">Access your portfolio intelligence</h3>
                </div>

                {error && <div className="p-3 text-danger bg-danger/10 border border-danger/20 rounded-xl text-center text-sm">{error}</div>}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="relative">
                        <User className="absolute top-3.5 left-3.5 text-text-secondary" size={18} />
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 pl-10 bg-midnight rounded-xl border border-white/5 focus:outline-none focus:border-neon-purple transition-colors text-white placeholder-text-secondary/50"
                            required
                        />
                    </div>
                    <div className="relative">
                        <Lock className="absolute top-3.5 left-3.5 text-text-secondary" size={18} />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 pl-10 bg-midnight rounded-xl border border-white/5 focus:outline-none focus:border-neon-purple transition-colors text-white placeholder-text-secondary/50"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full p-3 font-bold text-white bg-neon-purple rounded-xl hover:bg-electric-blue transition-colors shadow-lg shadow-neon-purple/20 mt-2"
                    >
                        Initialize Session
                    </button>
                </form>
                <p className="text-center text-sm text-text-secondary">
                    Don't have an account? <Link to="/register" className="text-neon-purple hover:text-electric-blue transition-colors font-medium">Create Terminal</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;

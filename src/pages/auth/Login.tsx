import { useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { Bot, Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (error: any) {
      if (error.code === 'auth/operation-not-allowed') {
        setError('O login por E-mail/Senha não está habilitado. Por favor, ative os provedores de autenticação no Console Firebase.');
      } else {
        setError(error.message);
      }
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      
      const userRef = doc(db, 'users', userCredential.user.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(userRef, { is_admin: false, email: userCredential.user.email });
      }
      
      navigate('/dashboard');
    } catch (error: any) {
       if (error.code === 'auth/operation-not-allowed') {
        setError('O login por Google não está habilitado. Por favor, ative os provedores de autenticação no Console Firebase.');
      } else {
        setError(error.message);
      }
    }
    setGoogleLoading(false);
  };

  return (
    <div className="min-h-screen bg-tertiary flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-primary p-8 rounded-xl border border-subtle shadow-sm">
        <div className="flex flex-col items-center mb-8">
          <Bot className="h-10 w-10 text-accent-primary mb-4" />
          <h2 className="text-2xl font-bold tracking-tight text-primary">Bem-vindo de volta</h2>
          <p className="text-secondary text-sm mt-1">Acesse seu painel ZapBot</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-primary border border-subtle rounded-md text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-colors"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-primary border border-subtle rounded-md text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-colors"
              placeholder="••••••••"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full flex items-center justify-center gap-2 bg-accent text-accent-fg py-2.5 rounded-md font-medium hover:bg-accent-hover transition-colors disabled:opacity-70 mt-6"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Entrar
          </button>
        </form>

        <div className="mt-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-subtle"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-primary text-secondary">ou continue com</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-primary border text-primary border-subtle py-2.5 rounded-md font-medium hover:bg-secondary transition-colors disabled:opacity-70"
          >
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Google
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-secondary">
          Não tem uma conta?{' '}
          <Link to="/auth/register" className="text-accent-primary font-medium hover:underline">
            Criar conta
          </Link>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { UserIcon, LockIcon, ChevronLeftIcon, MailIcon, PhoneIcon, FingerprintIcon } from './icons';

interface RegisterScreenProps {
  onRegister: (name: string, username: string, email: string, phone: string, password: string, createPasskey: boolean) => Promise<string | null>;
  onBack: () => void;
  onRegistrationComplete: (userId: string) => void;
  isPasskeySupported: boolean;
}

const InputField = ({ icon, ...props }: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <motion.div
    className="relative"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400">
      {icon}
    </div>
    <input 
      {...props}
      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
    />
  </motion.div>
);

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onRegister, onBack, onRegistrationComplete, isPasskeySupported }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wantsPasskey, setWantsPasskey] = useState(true);
  
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !username || !email || !phone || !password) {
        setError(t('registerError'));
        return;
    }
    
    setIsSubmitting(true);
    const newUserId = await onRegister(name, username, email, phone, password, isPasskeySupported && wantsPasskey);
    if (newUserId) {
      onRegistrationComplete(newUserId);
    } else {
      setError(t('registerErrorUsernameTaken'));
      setIsSubmitting(false);
    }
  };

  const formVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1, duration: 0.5 } },
    exit: { opacity: 0, y: -50 },
  };

  return (
    <div className="min-h-screen w-full animated-bubble-bg">
      <div className="bubbles-wrapper" aria-hidden="true">
        <div className="bubble b1"></div>
        <div className="bubble b2"></div>
        <div className="bubble b3"></div>
        <div className="bubble b4"></div>
      </div>
      <div className="content-wrapper min-h-screen w-full text-white flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <button onClick={onBack} className="absolute top-16 left-6 text-slate-300 hover:text-white transition-colors">
              <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <div className="text-center mb-8">
            <motion.img 
              initial={{ opacity: 0, y: -20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.7, ease: 'easeOut' }}
              src="https://i.ibb.co/PGQV6Z6W/4a5ed823-ab85-47ea-ac90-818fe3ed761f.png" 
              alt="Nova Bank Logo" 
              className="h-12 w-40 mx-auto" 
            />
          </div>
          
          <motion.div
            variants={formVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-slate-900/50 p-8 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden border border-slate-700/50"
          >
            <form onSubmit={handleRegister} className="space-y-5">
              <h2 className="text-2xl font-bold text-center mb-2 text-white">{t('createAccount')}</h2>
              <InputField icon={<UserIcon />} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fullNamePlaceholder')} disabled={isSubmitting} />
              <InputField icon={<UserIcon />} type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} disabled={isSubmitting} />
              <InputField icon={<MailIcon />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} disabled={isSubmitting} />
              <InputField icon={<PhoneIcon />} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('phonePlaceholder')} disabled={isSubmitting} />
              <InputField icon={<LockIcon />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('password')} disabled={isSubmitting} />
              
              {isPasskeySupported && (
                 <div className="flex items-center justify-center gap-3 !mt-6 text-slate-300">
                    <input 
                        type="checkbox" 
                        id="createPasskey" 
                        checked={wantsPasskey}
                        onChange={(e) => setWantsPasskey(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-600 focus:ring-offset-slate-900"
                    />
                    <label htmlFor="createPasskey" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                        <FingerprintIcon className="w-4 h-4" />
                        {t('createPasskeyForFasterSignIn')}
                    </label>
                </div>
              )}

              {error && <p className="text-red-400 text-sm text-center !mt-4">{error}</p>}
              <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all text-lg" disabled={isSubmitting}>
                {isSubmitting ? t('submitting') : t('getStarted')}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

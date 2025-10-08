import React, { useState, createContext, useEffect, useCallback } from 'react';
import { generateMockCard, generateMockLoan, generateAccountNumber } from './constants';
import { User, Transaction, Card, Loan, InsightsData } from './types';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { AnimatePresence, motion } from 'framer-motion';
import { WelcomeScreen } from './components/OnboardingScreen'; // Repurposed as WelcomeScreen
import { RegisterScreen } from './components/DataScreen'; // Repurposed as RegisterScreen
import { CheckCircleIcon, XCircleIcon } from './components/icons';
import { auth, db } from './services/firebase';
import { getComprehensiveInsights, ai as geminiAi } from './services/geminiService';
import { useTranslation } from './hooks/useTranslation';
import { GoogleGenAI } from '@google/genai';
import { KYCScreen } from './components/KYCScreen';


const base64url = {
    encode: (buffer: ArrayBuffer): string => {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    },
    decode: (str: string): ArrayBuffer => {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = str.length % 4;
        if (pad) {
            if (pad === 1) throw new Error('InvalidLengthError: Input base64url string is the wrong length to determine padding');
            str += new Array(5 - pad).join('=');
        }
        const binary_string = window.atob(str);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
};


const ToastNotification = ({ message, type }: { message: string, type: 'success' | 'error' }) => {
    const isSuccess = type === 'success';
    const Icon = isSuccess ? CheckCircleIcon : XCircleIcon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className={`fixed bottom-28 inset-x-0 mx-auto z-50 flex items-center gap-3 p-4 rounded-2xl shadow-lg text-white ${isSuccess ? 'bg-green-600' : 'bg-red-600'} w-11/12 max-w-sm`}
        >
            <Icon className="w-6 h-6 flex-shrink-0" />
            <p className="font-semibold text-sm">{message}</p>
        </motion.div>
    );
};

export interface CardApplicationDetails {
    fullName: string;
    address: string;
    dateOfBirth: string;
    employmentStatus: string;
    employer: string;
    annualIncome: number;
    cardType: 'Visa' | 'Mastercard';
}

export interface LoanApplicationDetails extends Omit<CardApplicationDetails, 'cardType'> {
    loanAmount: number;
    loanTerm: number;
}

export interface Passkey {
    id: string; // The passkey credential ID, used as Firestore document ID
    created: string;
}

export interface CachedInsight {
    data: Record<string, InsightsData>;
    lastUpdated: string;
}

interface BankContextType {
    currentUser: User | null;
    users: User[]; // Will be empty now, but kept for type safety in components that might use it
    transactions: Transaction[];
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    registerUser: (name: string, username: string, email: string, phone: string, password: string, createPasskey: boolean) => Promise<string | null>;
    transferMoney: (recipientIdentifier: string, amount: number) => Promise<{ success: boolean; message: string }>;
    addCardToUser: (details: CardApplicationDetails) => Promise<{ success: boolean; message: string; newCard?: Card }>;
    addLoanToUser: (details: LoanApplicationDetails) => Promise<{ success: boolean; message: string; newLoan?: Loan }>;
    requestPaymentExtension: (accountId: string, type: 'card' | 'loan') => Promise<{ success: boolean; message: string; newDueDate?: string }>;
    makeAccountPayment: (accountId: string, accountType: 'card' | 'loan', paymentType: 'minimum' | 'statement' | 'full' | 'custom', customAmount?: number) => Promise<{ success: boolean; message: string }>;
    showToast: (message: string, type: 'success' | 'error') => void;
    isPasskeySupported: boolean;
    passkeys: Passkey[];
    registerPasskey: (userParam?: User) => Promise<boolean>;
    loginWithPasskey: () => Promise<boolean>;
    removePasskey: (passkeyId: string) => Promise<void>;
    verifyCurrentUserWithPasskey: () => Promise<boolean>;
    insightsData: CachedInsight | null;
    loadOrGenerateInsights: () => Promise<CachedInsight | null>;
    refreshInsights: () => Promise<void>;
    isInsightsLoading: boolean;
    refreshUserData: () => Promise<void>;
    isRefreshing: boolean;
    updateUserKycStatus: (userId: string, isVerified: boolean, passportData: any) => Promise<void>;
    ai: GoogleGenAI;
}

export const BankContext = createContext<BankContextType>(null!);

type AuthScreen = 'welcome' | 'login' | 'register';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function App() {
    const { language, t } = useTranslation();
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [authScreen, setAuthScreen] = useState<AuthScreen>('welcome');
    const [kycUserId, setKycUserId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isPasskeySupported, setIsPasskeySupported] = useState(false);
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [insightsData, setInsightsData] = useState<CachedInsight | null>(null);
    const [isInsightsLoading, setIsInsightsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    const loadUserAndData = async (uid: string) => {
        // FIX: Switched to Firebase v8 syntax.
        const userDocRef = db.collection("users").doc(uid);
        const userDocSnap = await userDocRef.get();

        if (userDocSnap.exists) {
            const userData = userDocSnap.data() as Omit<User, 'uid' | 'cards' | 'loans'>;
            
            // FIX: Switched to Firebase v8 syntax.
            const cardsQuery = db.collection(`users/${uid}/cards`);
            const loansQuery = db.collection(`users/${uid}/loans`);
            const passkeysQuery = db.collection(`users/${uid}/passkeys`);
            const transactionsQuery = db.collection("transactions").where("uid", "==", uid).orderBy("timestamp", "desc").limit(50);

            const [cardDocs, loanDocs, passkeyDocs, transactionDocs] = await Promise.all([
                cardsQuery.get(),
                loansQuery.get(),
                passkeysQuery.get(),
                // FIX: Corrected a "used before declaration" error by using the `transactionsQuery` object instead of `transactionDocs`.
                transactionsQuery.get(),
            ]);

            const cards = cardDocs.docs.map(d => d.data() as Card);
            const loans = loanDocs.docs.map(d => d.data() as Loan);
            const passkeys = passkeyDocs.docs.map(d => ({ id: d.id, ...d.data() } as Passkey));
            const transactions = transactionDocs.docs.map(d => d.data() as Transaction);

            setCurrentUser({ uid, ...userData, cards, loans });
            setPasskeys(passkeys);
            setTransactions(transactions);
        } else {
            // FIX: Switched to Firebase v8 syntax.
            auth.signOut();
        }
    };


    useEffect(() => {
        const supported = !!(navigator.credentials && navigator.credentials.create && window.PublicKeyCredential);
        setIsPasskeySupported(supported);

        // FIX: Switched to Firebase v8 syntax.
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            setIsLoading(true);
            setInsightsData(null); // Reset insights on auth change
            if (firebaseUser) {
                await loadUserAndData(firebaseUser.uid);
            } else {
                setCurrentUser(null);
                setTransactions([]);
                setPasskeys([]);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 4000);
    };
    
    const loadOrGenerateInsights = useCallback(async (): Promise<CachedInsight | null> => {
        if (isInsightsLoading || !currentUser) return null;
    
        setIsInsightsLoading(true);
    
        try {
            const insightsRef = db.collection(`users/${currentUser.uid}/insights`).doc('latest');
            const insightsDoc = await insightsRef.get();
    
            if (insightsDoc.exists) {
                const cachedData = insightsDoc.data() as CachedInsight;
                setInsightsData(cachedData);
                return cachedData;
            } else {
                const allUserTransactions = [
                    ...transactions.filter(tx => tx.uid === currentUser.uid),
                    ...currentUser.cards.flatMap(c => c.transactions)
                ];
                const sixtyDaysAgo = new Date();
                sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
                const recentTransactions = allUserTransactions.filter(tx => new Date(tx.timestamp) >= sixtyDaysAgo);
                
                const newInsightsData = await getComprehensiveInsights(recentTransactions);
    
                if (newInsightsData) {
                    const now = new Date().toISOString();
                    const newCachedInsights: CachedInsight = { data: newInsightsData, lastUpdated: now };
                    await insightsRef.set(newCachedInsights);
                    setInsightsData(newCachedInsights);
                    return newCachedInsights;
                } else {
                    setInsightsData(null);
                    return null;
                }
            }
        } catch (error) {
            console.error("Failed to load or generate insights:", error);
            showToast(t('notEnoughData'), 'error');
            return null;
        } finally {
            setIsInsightsLoading(false);
        }
    }, [currentUser, transactions, isInsightsLoading, showToast, t]);

    const refreshInsights = useCallback(async () => {
        if (isInsightsLoading || !currentUser) return;
    
        try {
            // Clear all cached insights to force regeneration
            const insightsCollectionRef = db.collection(`users/${currentUser.uid}/insights`);
            const snapshot = await insightsCollectionRef.get();
            if (!snapshot.empty) {
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
    
            setInsightsData(null); // Clear local data immediately
            await loadOrGenerateInsights();
            showToast("Insights are being refreshed.", 'success');
    
        } catch (error) {        
            console.error("Failed to refresh insights:", error);
            showToast("Could not refresh AI insights.", 'error');
            setIsInsightsLoading(false); 
        }
    }, [currentUser, isInsightsLoading, loadOrGenerateInsights, showToast]);

    const refreshUserData = async () => {
        if (!currentUser || isRefreshing) return;
        setIsRefreshing(true);
        try {
            await loadUserAndData(currentUser.uid);
            showToast("Your data has been refreshed.", 'success');
        } catch (error) {
            console.error("Failed to refresh user data:", error);
            showToast("Could not refresh your data.", 'error');
        } finally {
            setIsRefreshing(false);
        }
    };

    const login = async (username: string, password: string): Promise<boolean> => {
        // FIX: Switched to Firebase v8 syntax.
        const usersRef = db.collection("users");
        const q = usersRef.where("username", "==", username.toLowerCase());
        const querySnapshot = await q.get();

        if (querySnapshot.empty) {
            return false;
        }
        
        const userDoc = querySnapshot.docs[0].data();

        if (!userDoc.kycVerified) {
            showToast("Please complete identity verification first.", 'error');
            setKycUserId(querySnapshot.docs[0].id);
            return false;
        }

        const email = userDoc.email;

        try {
            // FIX: Switched to Firebase v8 syntax.
            await auth.signInWithEmailAndPassword(email, password);
            return true;
        } catch (error) {
            console.error("Firebase login error:", error);
            return false;
        }
    };

    const logout = async () => {
        try {
            // For email/password users, this triggers onAuthStateChanged which clears state.
            await auth.signOut();
            // For passkey-only users, there's no auth state, so signOut does nothing.
            // We manually clear all user-related state to ensure logout happens for all login methods.
            setCurrentUser(null);
            setTransactions([]);
            setPasskeys([]);
            setInsightsData(null);
            setAuthScreen('welcome');
        } catch (error) {
            console.error("Sign out error:", error);
            showToast("Failed to sign out. Please try again.", 'error');
        }
    };

    const registerUser = async (name: string, username: string, email: string, phone: string, password: string, createPasskey: boolean): Promise<string | null> => {
        // FIX: Switched to Firebase v8 syntax.
        const usernameQuery = db.collection("users").where("username", "==", username.toLowerCase());
        const usernameSnap = await usernameQuery.get();
        if (!usernameSnap.empty) {
            return null;
        }

        try {
            // FIX: Switched to Firebase v8 syntax.
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const firebaseUser = userCredential.user;
            if (!firebaseUser) {
              throw new Error("User creation failed.");
            }
            
            const newUser: Omit<User, 'uid' | 'cards' | 'loans'> = {
                name,
                username: username.toLowerCase(),
                email,
                phone,
                balance: 1000,
                savingsAccountNumber: generateAccountNumber(),
                avatarUrl: `https://picsum.photos/seed/${username}/100`,
                kycVerified: false,
            };

            // FIX: Switched to Firebase v8 syntax.
            await db.collection("users").doc(firebaseUser.uid).set(newUser);
            
            const newCard = generateMockCard();
            // FIX: Switched to Firebase v8 syntax.
            await db.collection(`users/${firebaseUser.uid}/cards`).doc(newCard.cardNumber).set(newCard);

            if (createPasskey) {
                const fullNewUser: User = {
                    uid: firebaseUser.uid,
                    ...newUser,
                    cards: [newCard],
                    loans: []
                };
                // This will show its own toasts for success/failure
                await registerPasskey(fullNewUser);
            }
            
            // FIX: Switched to Firebase v8 syntax.
            await auth.signOut();
            
            return firebaseUser.uid;
        } catch (error) {
            console.error("Firebase registration error:", error);
            showToast("Registration failed. " + (error as Error).message, 'error');
            return null;
        }
    };

    const updateUserKycStatus = async (userId: string, isVerified: boolean, passportData: any) => {
        const userRef = db.collection("users").doc(userId);
        await userRef.update({
            kycVerified: isVerified,
            passportData: passportData,
        });
    };

    const transferMoney = async (recipientIdentifier: string, amount: number): Promise<{ success: boolean; message: string }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };
        if (amount <= 0) return { success: false, message: 'Error: Payment amount must be positive.' };
        if (currentUser.balance < amount) return { success: false, message: `Error: Insufficient funds.` };
    
        // FIX: Switched to Firebase v8 syntax.
        const usersRef = db.collection("users");
        const q1 = usersRef.where("name", "==", recipientIdentifier);
        const q2 = usersRef.where("savingsAccountNumber", "==", recipientIdentifier);
        const q3 = usersRef.where("email", "==", recipientIdentifier);
        const q4 = usersRef.where("phone", "==", recipientIdentifier);
        const q5 = usersRef.where("username", "==", recipientIdentifier.toLowerCase());
    
        const results = await Promise.all([q1.get(), q2.get(), q3.get(), q4.get(), q5.get()]);
        const recipientDoc = results.flatMap(snap => snap.docs)[0];
    
        if (!recipientDoc) return { success: false, message: `Error: Contact or account "${recipientIdentifier}" not found.` };
        
        const recipient = { uid: recipientDoc.id, ...recipientDoc.data() } as User;
        if (recipient.uid === currentUser.uid) return { success: false, message: 'Error: Cannot send money to yourself.' };
    
        // FIX: Switched to Firebase v8 syntax.
        const senderRef = db.collection("users").doc(currentUser.uid);
        const recipientRef = db.collection("users").doc(recipient.uid);
    
        try {
            // FIX: Switched to Firebase v8 syntax.
            await db.runTransaction(async (transaction) => {
                const senderDoc = await transaction.get(senderRef);
                if (!senderDoc.exists || (senderDoc.data()?.balance ?? 0) < amount) {
                    throw new Error("Insufficient funds.");
                }
    
                transaction.update(senderRef, { balance: (senderDoc.data()?.balance ?? 0) - amount });
                transaction.update(recipientRef, { balance: recipient.balance + amount });
            });
    
            const timestamp = new Date().toISOString();
            // FIX: Switched to Firebase v8 syntax.
            const transactionsRef = db.collection("transactions");
    
            await transactionsRef.add({
                uid: currentUser.uid, type: 'debit', amount, description: `Payment to ${recipient.name}`, timestamp, partyName: recipient.name, category: 'Transfers',
            });
            await transactionsRef.add({
                uid: recipient.uid, type: 'credit', amount, description: `Payment from ${currentUser.name}`, timestamp, partyName: currentUser.name, category: 'Transfers',
            });
            
            setCurrentUser(prev => prev ? ({ ...prev, balance: prev.balance - amount }) : null);
    
            return { success: true, message: `Success! You sent ${formatCurrency(amount)} to ${recipient.name}.` };
        } catch (e) {
            console.error("Transaction failed: ", e);
            return { success: false, message: (e as Error).message };
        }
    };
    
    const addCardToUser = async (details: CardApplicationDetails): Promise<{ success: boolean; message: string; newCard?: Card }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };

        if (Math.random() < 0.2) { // 20% rejection rate
             return { success: false, message: `We're sorry, ${details.fullName}, but we were unable to approve your credit card application at this time.` };
        }

        const newCard = generateMockCard(details.cardType);
        // FIX: Switched to Firebase v8 syntax.
        await db.collection(`users/${currentUser.uid}/cards`).doc(newCard.cardNumber).set(newCard);
        
        setCurrentUser(prev => prev ? ({ ...prev, cards: [...prev.cards, newCard] }) : null);

        return { success: true, message: `Congratulations, ${details.fullName}! Your new ${newCard.cardType} card has been approved.`, newCard };
    };

    const addLoanToUser = async (details: LoanApplicationDetails): Promise<{ success: boolean; message: string; newLoan?: Loan }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };
        
        if (Math.random() < 0.3) { // 30% rejection rate
            return { success: false, message: `We're sorry, ${details.fullName}, but we were unable to approve your loan application for ${formatCurrency(details.loanAmount)} at this time.` };
        }

        const { loanAmount, loanTerm } = details;
        const interestRate = parseFloat((Math.random() * 10 + 3).toFixed(2));
        const monthlyInterestRate = interestRate / 100 / 12;
        const monthlyPayment = (loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, loanTerm)) / (Math.pow(1 + monthlyInterestRate, loanTerm) - 1);
        
        const newLoan: Loan = {
            id: `loan-${currentUser.uid}-${Date.now()}`, uid: currentUser.uid, loanAmount, interestRate, termMonths: loanTerm,
            monthlyPayment: parseFloat(monthlyPayment.toFixed(2)), remainingBalance: loanAmount, status: 'Active',
            startDate: new Date().toISOString(), paymentDueDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
        };

        // FIX: Switched to Firebase v8 syntax.
        const userRef = db.collection("users").doc(currentUser.uid);
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw "User not found!";
            const newBalance = (userDoc.data()?.balance ?? 0) + loanAmount;
            transaction.update(userRef, { balance: newBalance });
        });
        // FIX: Switched to Firebase v8 syntax.
        await db.collection(`users/${currentUser.uid}/loans`).doc(newLoan.id).set(newLoan);
        
        setCurrentUser(prev => prev ? ({ ...prev, balance: prev.balance + loanAmount, loans: [...prev.loans, newLoan] }) : null);

        return { success: true, message: `Congratulations! Your loan for ${formatCurrency(loanAmount)} has been approved.`, newLoan };
    };

    const requestPaymentExtension = async (accountId: string, type: 'card' | 'loan'): Promise<{ success: boolean; message: string; newDueDate?: string }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };
        
        if (Math.random() < 0.1) {
             return { success: false, message: `We're sorry, but we were unable to process a payment extension for this account.` };
        }
        
        let docRef;
        let originalDueDate: Date;
        if (type === 'card') {
            const card = currentUser.cards.find(c => c.cardNumber.slice(-4) === accountId);
            if (!card) return { success: false, message: `Error: Card ending in ${accountId} not found.`};
            // FIX: Switched to Firebase v8 syntax.
            docRef = db.collection(`users/${currentUser.uid}/cards`).doc(card.cardNumber);
            originalDueDate = new Date(card.paymentDueDate);
        } else {
            const loan = currentUser.loans.find(l => l.id === accountId);
            if (!loan) return { success: false, message: `Error: Loan with ID ${accountId} not found.`};
            // FIX: Switched to Firebase v8 syntax.
            docRef = db.collection(`users/${currentUser.uid}/loans`).doc(loan.id);
            originalDueDate = new Date(loan.paymentDueDate);
        }

        const newDueDate = new Date(originalDueDate.setDate(originalDueDate.getDate() + 14));
        // FIX: Switched to Firebase v8 syntax.
        await docRef.update({ paymentDueDate: newDueDate.toISOString() });
        
        const formattedDate = newDueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return { success: true, message: `Success! Your payment due date has been extended to ${formattedDate}.`, newDueDate: newDueDate.toISOString() };
    };

    const makeAccountPayment = async (accountId: string, accountType: 'card' | 'loan', paymentType: 'minimum' | 'statement' | 'full' | 'custom', customAmount?: number): Promise<{ success: boolean; message: string }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };

        let paymentAmount = 0;
        let message = '';

        // FIX: Switched to Firebase v8 syntax.
        const userRef = db.collection("users").doc(currentUser.uid);

        try {
            // FIX: Switched to Firebase v8 syntax.
            await db.runTransaction(async (t) => {
                const userDoc = await t.get(userRef);
                if (!userDoc.exists) throw new Error("User not found.");
                const userData = userDoc.data()!;
                
                if (accountType === 'card') {
                    const card = currentUser.cards.find(c => c.cardNumber.slice(-4) === accountId);
                    if (!card) throw new Error(`Card ending in ${accountId} not found.`);
                    
                    switch(paymentType) {
                        case 'minimum': paymentAmount = card.minimumPayment; break;
                        case 'statement': paymentAmount = card.statementBalance; break;
                        case 'full': paymentAmount = card.creditBalance; break;
                        case 'custom': paymentAmount = customAmount || 0; break;
                    }
                    if (paymentAmount <= 0) throw new Error("A valid payment amount is required.");
                    if (userData.balance < paymentAmount) throw new Error("Insufficient funds.");

                    // FIX: Switched to Firebase v8 syntax.
                    const cardRef = db.collection(`users/${currentUser.uid}/cards`).doc(card.cardNumber);
                    t.update(userRef, { balance: userData.balance - paymentAmount });
                    t.update(cardRef, { 
                        creditBalance: Math.max(0, card.creditBalance - paymentAmount),
                        statementBalance: Math.max(0, card.statementBalance - paymentAmount)
                    });
                    message = `Successfully paid ${formatCurrency(paymentAmount)} towards your card ending in ${accountId}.`;

                } else { // Loan
                    const loan = currentUser.loans.find(l => l.id === accountId);
                    if (!loan) throw new Error(`Loan with ID ${accountId} not found.`);

                    switch(paymentType) {
                        case 'minimum': paymentAmount = loan.monthlyPayment; break;
                        case 'full': paymentAmount = loan.remainingBalance; break;
                        case 'custom': paymentAmount = customAmount || 0; break;
                        default: paymentAmount = loan.monthlyPayment; break;
                    }
                    if (paymentAmount <= 0) throw new Error("A valid payment amount is required.");
                    if (paymentAmount > loan.remainingBalance) paymentAmount = loan.remainingBalance;
                    if (userData.balance < paymentAmount) throw new Error("Insufficient funds.");

                    // FIX: Switched to Firebase v8 syntax.
                    const loanRef = db.collection(`users/${currentUser.uid}/loans`).doc(loan.id);
                    const newRemainingBalance = loan.remainingBalance - paymentAmount;

                    t.update(userRef, { balance: userData.balance - paymentAmount });
                    t.update(loanRef, { remainingBalance: newRemainingBalance });

                    if (newRemainingBalance <= 0) {
                        t.update(loanRef, { status: 'Paid Off' });
                        message = `Successfully paid off your loan (${accountId}). Congratulations!`;
                    } else {
                        message = `Successfully paid ${formatCurrency(paymentAmount)} towards your loan (${accountId}).`;
                    }
                }
            });

            return { success: true, message };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    };
    
    const registerPasskey = async (userParam?: User): Promise<boolean> => {
        const userForPasskey = userParam || currentUser;
        if (!userForPasskey || !isPasskeySupported) return false;

        try {
            const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
            const userHandle = new TextEncoder().encode(userForPasskey.username);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge, rp: { name: "Nova Bank", id: window.location.hostname },
                    user: { id: userHandle, name: userForPasskey.email, displayName: userForPasskey.name },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                    authenticatorSelection: { residentKey: "required", userVerification: "required" },
                    timeout: 60000,
                },
            });

            if (credential && 'rawId' in credential) {
                const newPasskeyId = base64url.encode((credential as any).rawId);
                const newPasskey: Omit<Passkey, 'id'> = { created: new Date().toISOString() };
                
                // FIX: Switched to Firebase v8 syntax.
                await db.collection(`users/${userForPasskey.uid}/passkeys`).doc(newPasskeyId).set(newPasskey);
                
                // Only update state if called from settings for an existing logged-in user
                if (!userParam) {
                    setPasskeys(prev => [...prev, {id: newPasskeyId, ...newPasskey}]);
                }
                showToast("Passkey created successfully!", 'success');
                return true;
            }
            return false;
        } catch (err) {
            console.error(err);
            if ((err as Error).name !== 'NotAllowedError') {
              showToast("Failed to create passkey.", 'error');
            }
            return false;
        }
    };
    
    const loginWithPasskey = async (): Promise<boolean> => {
        if (!isPasskeySupported) return false;

        setIsLoading(true);
        try {
            const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
            const assertion = await navigator.credentials.get({
                publicKey: { challenge, userVerification: 'required', timeout: 60000 },
            });

            if (assertion && (assertion as any).response.userHandle) {
                const username = new TextDecoder().decode((assertion as any).response.userHandle);
                // FIX: Switched to Firebase v8 syntax.
                const usersRef = db.collection("users");
                const q = usersRef.where("username", "==", username.toLowerCase());
                const querySnapshot = await q.get();

                if (querySnapshot.empty) { showToast("Passkey not recognized.", 'error'); return false; }
                
                const userDoc = querySnapshot.docs[0];
                const uid = userDoc.id;
                const credentialId = base64url.encode((assertion as any).rawId);

                // FIX: Switched to Firebase v8 syntax.
                const passkeyDoc = await db.collection(`users/${uid}/passkeys`).doc(credentialId).get();
                if (passkeyDoc.exists) {
                    await loadUserAndData(uid);
                    return true;
                }
            }
            showToast("Passkey not recognized.", 'error');
            return false;
        } catch (err) {
            if ((err as Error).name !== 'NotAllowedError' && (err as Error).name !== 'AbortError') {
                showToast("Passkey login failed.", 'error');
            }
            return false;
        } finally {
            setIsLoading(false);
        }
    };
    
    const verifyCurrentUserWithPasskey = async (): Promise<boolean> => {
        if (!currentUser || !isPasskeySupported || passkeys.length === 0) return false;

        try {
            const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    allowCredentials: passkeys.map(pk => ({ id: base64url.decode(pk.id), type: 'public-key' })),
                    userVerification: 'required', timeout: 60000,
                },
            });
            return !!assertion;
        // FIX: Corrected a syntax error in the catch block where an arrow function was used instead of standard syntax. This was causing a cascade of scope-related errors.
        } catch (err) {
            if ((err as Error).name !== 'NotAllowedError' && (err as Error).name !== 'AbortError') {
                showToast("Passkey verification failed.", 'error');
            }
            return false;
        }
    };
    
    const removePasskey = async (passkeyId: string) => {
        if (!currentUser) return;
        // FIX: Switched to Firebase v8 syntax.
        await db.collection(`users/${currentUser.uid}/passkeys`).doc(passkeyId).delete();
        setPasskeys(prev => prev.filter(p => p.id !== passkeyId));
        showToast("Passkey removed.", 'success');
    };

    const contextValue = { currentUser, users: [], transactions, login, logout, registerUser, transferMoney, addCardToUser, addLoanToUser, requestPaymentExtension, makeAccountPayment, showToast, isPasskeySupported, passkeys, registerPasskey, loginWithPasskey, removePasskey, verifyCurrentUserWithPasskey, insightsData, loadOrGenerateInsights, refreshInsights, isInsightsLoading, refreshUserData, isRefreshing, updateUserKycStatus, ai: geminiAi };

    let screenKey = 'auth';
    let screenContent = null;

    if (isLoading) {
        return <div className="min-h-screen w-full bg-slate-900" />;
    }

    if (currentUser) {
        screenKey = 'dashboard';
        screenContent = <Dashboard />;
    } else if (kycUserId) {
        screenKey = 'kyc';
        screenContent = <KYCScreen userId={kycUserId} onVerificationComplete={() => {
            setKycUserId(null);
            setAuthScreen('login');
            showToast("Verification successful! Please log in.", 'success');
        }} />;
    } else {
        switch(authScreen) {
            case 'login':
                screenKey = 'login';
                screenContent = <LoginScreen onLogin={login} onBack={() => setAuthScreen('welcome')} />;
                break;
            case 'register':
                screenKey = 'register';
                screenContent = <RegisterScreen 
                    onRegister={registerUser} 
                    onBack={() => setAuthScreen('welcome')}
                    onRegistrationComplete={(userId) => {
                        showToast("Account created! Let's verify your identity.", 'success');
                        setKycUserId(userId);
                    }}
                    isPasskeySupported={isPasskeySupported}
                />;
                break;
            case 'welcome':
            default:
                screenKey = 'welcome';
                screenContent = <WelcomeScreen onNavigateToLogin={() => setAuthScreen('login')} onNavigateToRegister={() => setAuthScreen('register')} />;
                break;
        }
    }

    return (
        <BankContext.Provider value={contextValue}>
            <AnimatePresence>
                {toast && <ToastNotification message={toast.message} type={toast.type} />}
            </AnimatePresence>
            <AnimatePresence mode="wait">
                <motion.div
                    key={screenKey}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                >
                    {screenContent}
                </motion.div>
            </AnimatePresence>
        </BankContext.Provider>
    );
}

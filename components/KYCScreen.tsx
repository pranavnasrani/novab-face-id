import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BankContext } from '../App';
import { extractPassportDetails, performLivenessCheck } from '../services/geminiService';
import { PassportIcon, VideoIcon, CheckCircleIcon, XCircleIcon, SparklesIcon, ChevronLeftIcon } from './icons';

type KYCStep = 'start' | 'passport' | 'liveness' | 'verifying' | 'success' | 'failure';

interface KYCScreenProps {
    userId: string;
    onVerificationComplete: () => void;
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.2 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' } },
};

const stepContentVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? '100%' : '-100%',
        opacity: 0,
    }),
    center: {
        zIndex: 1,
        x: 0,
        opacity: 1,
    },
    exit: (direction: number) => ({
        zIndex: 0,
        x: direction < 0 ? '100%' : '-100%',
        opacity: 0,
    }),
};

// Utility to extract frames from a video blob
const extractFramesFromVideo = (videoBlob: Blob, frameCount: number = 5): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.muted = true;
        video.src = URL.createObjectURL(videoBlob);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const frames: string[] = [];

        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const duration = video.duration;
            const interval = duration / frameCount;
            let currentTime = 0;
            let capturedFrames = 0;

            video.onseeked = () => {
                if (!context) return reject('Canvas context not found');
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                frames.push(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]); // Get base64
                capturedFrames++;
                
                if (capturedFrames < frameCount) {
                    currentTime += interval;
                    video.currentTime = Math.min(currentTime, duration);
                } else {
                    URL.revokeObjectURL(video.src);
                    resolve(frames);
                }
            };
            
            video.currentTime = 0;
            video.play().then(() => video.pause()).catch(reject);
        };
        video.onerror = (e) => {
            URL.revokeObjectURL(video.src);
            reject(e);
        }
    });
};


export const KYCScreen: React.FC<KYCScreenProps> = ({ userId, onVerificationComplete }) => {
    const { updateUserKycStatus } = useContext(BankContext);
    const [[step, direction], setStep] = useState<[KYCStep, number]>(['start', 0]);

    const [passportData, setPassportData] = useState<any>(null);
    const [livenessResult, setLivenessResult] = useState<{ isLive: boolean; reason: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCameraReady, setIsCameraReady] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    const cleanupCamera = () => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
    };
    
    const setupCamera = async (constraints: MediaStreamConstraints) => {
        try {
            cleanupCamera(); // Ensure previous stream is stopped
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            mediaStreamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("Camera error:", err);
            setError("Could not access camera. Please check permissions and try again.");
            navigateToStep('failure');
        }
    };

    useEffect(() => {
        // This effect handles camera setup and cleanup based on the current step.
        // It follows the Rules of Hooks by being at the top level.
        if (step === 'passport') {
            setupCamera({ video: { facingMode: "environment" } });
        } else if (step === 'liveness') {
            setupCamera({ video: { facingMode: "user" } });
        } else {
            // Cleanup camera when not in a camera-related step
            cleanupCamera();
        }

        // Final cleanup on component unmount
        return () => cleanupCamera();
    }, [step]);

    const navigateToStep = (newStep: KYCStep) => {
        if (newStep === 'passport' || newStep === 'liveness') {
            setIsCameraReady(false);
        }
        const steps: KYCStep[] = ['start', 'passport', 'liveness', 'verifying', 'success', 'failure'];
        const currentIndex = steps.indexOf(step);
        const newIndex = steps.indexOf(newStep);
        setStep([newStep, newIndex > currentIndex ? 1 : -1]);
    };

    const handleStartVerification = () => {
        navigateToStep('passport');
    };

    const handleScanPassport = async () => {
        if (!videoRef.current || !canvasRef.current || !isCameraReady) return;
        navigateToStep('verifying');

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        
        const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
        
        try {
            const data = await extractPassportDetails(base64Image);
            if (!data.fullName || !data.passportNumber) {
                throw new Error("Could not read passport details clearly.");
            }
            setPassportData(data);
            navigateToStep('liveness');
        } catch (err) {
            setError((err as Error).message || "Failed to process passport.");
            navigateToStep('failure');
        }
    };
    
    const handleStartLivenessCheck = async () => {
        if (!mediaStreamRef.current || !isCameraReady) return;
        navigateToStep('verifying');

        const recordedChunks: Blob[] = [];
        mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current);
        mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorderRef.current.onstop = async () => {
            const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
            try {
                const frames = await extractFramesFromVideo(videoBlob, 5);
                const result = await performLivenessCheck(frames);
                setLivenessResult(result);
                // Final verification logic is now centralized
                await finalVerification(passportData, result);
            } catch (err) {
                setError((err as Error).message || "Failed during liveness analysis.");
                navigateToStep('failure');
            }
        };

        mediaRecorderRef.current.start();
        setTimeout(() => {
            mediaRecorderRef.current?.stop();
        }, 3000); // Record for 3 seconds
    };
    
    const finalVerification = async (passport: any, liveness: { isLive: boolean, reason: string }) => {
        if (!passport || !liveness) return;

        try {
            if (!liveness.isLive) {
                throw new Error(`Liveness check failed: ${liveness.reason}`);
            }
            // In a real app, you'd fetch the registered user's name to compare.
            // Here, we just assume it passes and store the passport data.
            await updateUserKycStatus(userId, true, passport);
            navigateToStep('success');
        } catch(err) {
            setError((err as Error).message);
            navigateToStep('failure');
        }
    }


    const renderStepContent = () => {
        switch (step) {
            case 'start':
                return (
                    <motion.div key="start" variants={itemVariants} className="text-center">
                        <h2 className="text-2xl font-bold mb-4">Identity Verification</h2>
                        <p className="text-slate-400 mb-6">To protect your account, we need to verify your identity. This only takes a minute.</p>
                        <div className="space-y-4 text-left bg-slate-800/50 p-6 rounded-2xl mb-8">
                            <div className="flex items-start gap-4">
                                <PassportIcon className="w-8 h-8 text-indigo-400 flex-shrink-0 mt-1" />
                                <div>
                                    <h3 className="font-semibold">Scan your Passport</h3>
                                    <p className="text-sm text-slate-400">Have your official government-issued passport ready.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <VideoIcon className="w-8 h-8 text-indigo-400 flex-shrink-0 mt-1" />
                                <div>
                                    <h3 className="font-semibold">Liveness Check</h3>
                                    <p className="text-sm text-slate-400">We'll ask you to take a short video to prove you're real.</p>
                                </div>
                            </div>
                        </div>
                        <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={handleStartVerification} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all text-lg">Begin Verification</motion.button>
                    </motion.div>
                );
            case 'passport':
                return (
                    <motion.div key="passport" variants={itemVariants} className="text-center">
                        <h2 className="text-2xl font-bold mb-2">Scan Your Passport</h2>
                        <p className="text-slate-400 mb-4">Position the photo page of your passport inside the frame.</p>
                        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-700 mb-6">
                            <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setIsCameraReady(true)} className="w-full h-full object-cover"></video>
                            <canvas ref={canvasRef} className="hidden"></canvas>
                        </div>
                        <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={handleScanPassport} disabled={!isCameraReady} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all text-lg disabled:opacity-50">
                            {isCameraReady ? 'Scan Passport' : 'Initializing Camera...'}
                        </motion.button>
                    </motion.div>
                );
            case 'liveness':
                 return (
                     <motion.div key="liveness" variants={itemVariants} className="text-center">
                         <h2 className="text-2xl font-bold mb-2">Liveness Check</h2>
                         <p className="text-slate-400 mb-4">Position your face in the oval and slowly turn your head to the right when you press record.</p>
                         <div className="relative w-full aspect-square rounded-full mx-auto max-w-xs overflow-hidden bg-slate-900 border-2 border-slate-700 mb-6">
                             <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setIsCameraReady(true)} className="w-full h-full object-cover scale-x-[-1]"></video>
                         </div>
                         <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={handleStartLivenessCheck} disabled={!isCameraReady} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all text-lg disabled:opacity-50">
                             {isCameraReady ? 'Record 3s Video' : 'Initializing Camera...'}
                         </motion.button>
                     </motion.div>
                 );
            case 'verifying':
                return (
                     <motion.div key="verifying" variants={itemVariants} className="text-center flex flex-col items-center justify-center h-full">
                         <SparklesIcon className="w-16 h-16 text-indigo-400 animate-pulse mb-6" />
                         <h2 className="text-2xl font-bold mb-2">Verifying...</h2>
                         <p className="text-slate-400">Our AI is securely analyzing your documents. Please wait a moment.</p>
                     </motion.div>
                );
            case 'success':
                return (
                    <motion.div key="success" variants={itemVariants} className="text-center flex flex-col items-center justify-center h-full">
                        <CheckCircleIcon className="w-16 h-16 text-green-500 mb-6" />
                        <h2 className="text-2xl font-bold mb-2">Verification Complete!</h2>
                        <p className="text-slate-400 mb-8">Your identity has been successfully verified. Welcome to Nova Bank!</p>
                        <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={onVerificationComplete} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all text-lg">Proceed to Login</motion.button>
                    </motion.div>
                );
            case 'failure':
                return (
                     <motion.div key="failure" variants={itemVariants} className="text-center flex flex-col items-center justify-center h-full">
                        <XCircleIcon className="w-16 h-16 text-red-500 mb-6" />
                        <h2 className="text-2xl font-bold mb-2">Verification Failed</h2>
                        <p className="text-slate-400 mb-8">{error || "An unknown error occurred. Please try again."}</p>
                        <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => navigateToStep('start')} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all text-lg">Try Again</motion.button>
                    </motion.div>
                );
        }
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
                    {step !== 'start' && (
                        <button onClick={() => navigateToStep('start')} className="absolute top-16 left-6 text-slate-300 hover:text-white transition-colors">
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>
                    )}
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="bg-slate-900/50 p-8 rounded-3xl shadow-2xl backdrop-blur-md border border-slate-700/50 min-h-[500px] flex flex-col justify-center"
                    >
                        <AnimatePresence mode="wait" custom={direction}>
                             <motion.div
                                key={step}
                                custom={direction}
                                variants={stepContentVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{
                                    x: { type: "spring", stiffness: 300, damping: 30 },
                                    opacity: { duration: 0.2 }
                                }}
                             >
                                {renderStepContent()}
                             </motion.div>
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            </div>
        </div>
    );
};
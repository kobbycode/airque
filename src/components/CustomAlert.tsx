'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

type AlertType = 'info' | 'success' | 'warning' | 'error';

interface AlertOptions {
  title: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface CustomAlertContextType {
  showAlert: (options: Omit<AlertOptions, 'onCancel' | 'cancelText'>) => void;
  showConfirm: (options: AlertOptions) => void;
  closeAlert: () => void;
}

const CustomAlertContext = createContext<CustomAlertContextType | undefined>(undefined);

export function useAlert() {
  const context = useContext(CustomAlertContext);
  if (!context) {
    throw new Error('useAlert must be used within a CustomAlertProvider');
  }
  return context;
}

// Map alert types to Icons and Glow/Accent styling
const TYPE_MAP = {
  info: {
    icon: 'info',
    accentColor: 'text-cyan-400',
    glowColor: 'shadow-[0_0_50px_rgba(6,182,212,0.25)] border-cyan-500/30',
    buttonBg: 'bg-cyan-400 hover:bg-cyan-500 text-black',
  },
  success: {
    icon: 'check_circle',
    accentColor: 'text-emerald-400',
    glowColor: 'shadow-[0_0_50px_rgba(16,185,129,0.25)] border-emerald-500/30',
    buttonBg: 'bg-emerald-400 hover:bg-emerald-500 text-black',
  },
  warning: {
    icon: 'warning',
    accentColor: 'text-amber-400',
    glowColor: 'shadow-[0_0_50px_rgba(245,158,11,0.25)] border-amber-500/30',
    buttonBg: 'bg-amber-400 hover:bg-amber-500 text-black',
  },
  error: {
    icon: 'error',
    accentColor: 'text-red-400',
    glowColor: 'shadow-[0_0_50px_rgba(239,68,68,0.3)] border-red-500/30',
    buttonBg: 'bg-red-500 hover:bg-red-600 text-white',
  },
};

export function CustomAlertProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirm, setIsConfirm] = useState(false);
  const [options, setOptions] = useState<AlertOptions | null>(null);
  const [animateState, setAnimateState] = useState<'closed' | 'opening' | 'open' | 'closing'>('closed');

  const showAlert = useCallback((opts: Omit<AlertOptions, 'onCancel' | 'cancelText'>) => {
    setOptions({ ...opts, type: opts.type || 'info' });
    setIsConfirm(false);
    setIsOpen(true);
  }, []);

  const showConfirm = useCallback((opts: AlertOptions) => {
    setOptions({ ...opts, type: opts.type || 'warning' });
    setIsConfirm(true);
    setIsOpen(true);
  }, []);

  const closeAlert = useCallback(() => {
    setAnimateState('closing');
  }, []);

  // Handle animation states cleanly
  useEffect(() => {
    if (isOpen) {
      setAnimateState('opening');
      const t = setTimeout(() => setAnimateState('open'), 50);
      return () => clearTimeout(t);
    } else {
      setAnimateState('closed');
    }
  }, [isOpen]);

  useEffect(() => {
    if (animateState === 'closing') {
      const t = setTimeout(() => {
        setIsOpen(false);
        setOptions(null);
        setAnimateState('closed');
      }, 200); // match exit transition duration
      return () => clearTimeout(t);
    }
  }, [animateState]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeAlert();
        if (options?.onCancel) options.onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, options, closeAlert]);

  const handleConfirm = () => {
    if (options?.onConfirm) options.onConfirm();
    closeAlert();
  };

  const handleCancel = () => {
    if (options?.onCancel) options.onCancel();
    closeAlert();
  };

  const activeType = options?.type || 'info';
  const typeStyle = TYPE_MAP[activeType];

  // Button style overrides for dangerous confirms
  const confirmBtnCls = options?.isDangerous
    ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]'
    : typeStyle.buttonBg;

  return (
    <CustomAlertContext.Provider value={{ showAlert, showConfirm, closeAlert }}>
      {children}

      {isOpen && options && (
        <div 
          className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${
            animateState === 'opening' || animateState === 'open' 
              ? 'bg-black/75 backdrop-blur-md opacity-100' 
              : 'bg-black/0 backdrop-blur-none opacity-0'
          }`}
          onClick={handleCancel}
        >
          {/* Main Card */}
          <div 
            className={`relative w-full max-w-md overflow-hidden rounded-2xl border bg-gradient-to-br from-white/10 to-white/[0.02] p-6 text-white backdrop-blur-2xl transition-all duration-300 ${typeStyle.glowColor} ${
              animateState === 'open' 
                ? 'scale-100 translate-y-0 opacity-100' 
                : 'scale-90 translate-y-4 opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Glow Accent Bar */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
              activeType === 'info' ? 'from-cyan-400 to-blue-500' :
              activeType === 'success' ? 'from-emerald-400 to-green-500' :
              activeType === 'warning' ? 'from-amber-400 to-orange-500' :
              'from-red-500 to-rose-600'
            }`} />

            {/* Header Icon + Title */}
            <div className="flex gap-4 items-start">
              <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10 ${typeStyle.accentColor} shadow-inner`}>
                <span className="material-symbols-outlined text-[28px]">{typeStyle.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display-lg text-lg font-bold tracking-tight text-white leading-snug">
                  {options.title}
                </h3>
                <p className="mt-2 text-sm text-white/70 leading-relaxed font-body-md">
                  {options.message}
                </p>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-4">
              {isConfirm && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-all text-xs font-semibold select-none cursor-pointer"
                >
                  {options.cancelText || 'Cancel'}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-98 select-none cursor-pointer ${confirmBtnCls}`}
              >
                {options.confirmText || (isConfirm ? 'Confirm' : 'Okay')}
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomAlertContext.Provider>
  );
}

import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, Lightbulb, BookOpen } from 'lucide-react';

interface HelpTip {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

interface FloatingHelpProps {
  title: string;
  subtitle?: string;
  tips: HelpTip[];
}

export function FloatingHelp({ title, subtitle, tips }: FloatingHelpProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-[9999] flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:scale-105 transition-all"
      >
        {open ? <X className="h-6 w-6" /> : <HelpCircle className="h-6 w-6" />}
        {!open && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-5 w-5 bg-blue-500 items-center justify-center text-[10px] font-bold">?</span>
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-[9999] sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        >
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4">
            <div className="flex items-center gap-2 text-white">
              <Lightbulb className="h-5 w-5" />
              <h3 className="font-semibold text-sm">{title}</h3>
            </div>
            {subtitle && <p className="text-blue-100 text-xs mt-1">{subtitle}</p>}
          </div>
          <div className="p-4 space-y-3 max-h-60 sm:max-h-72 overflow-y-auto">
            {tips.map((tip) => (
              <div key={tip.title} className="flex gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex-shrink-0 mt-0.5">{tip.icon}</div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{tip.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{tip.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t px-5 py-3 bg-gray-50">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-blue-600 font-medium hover:text-blue-700"
              onClick={() => setOpen(false)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Fermer l'aide
            </button>
          </div>
        </div>
      )}
    </>
  );
}

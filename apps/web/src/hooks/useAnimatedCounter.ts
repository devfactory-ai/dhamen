import { useState, useEffect, useRef } from 'react';

interface UseAnimatedCounterOptions {
  duration?: number;
  delay?: number;
  easing?: 'linear' | 'easeOut' | 'easeInOut' | 'spring';
  decimals?: number;
  enabled?: boolean;
}

/**
 * Hook for animating number values with smooth transitions
 * Great for dashboard stats and metrics
 */
export function useAnimatedCounter(
  endValue: number,
  options: UseAnimatedCounterOptions = {}
): number {
  const {
    duration = 1000,
    delay = 0,
    easing = 'easeOut',
    decimals = 0,
    enabled = true,
  } = options;

  const [displayValue, setDisplayValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(0);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      setDisplayValue(endValue);
      return;
    }

    // Delay start if specified
    const timeoutId = setTimeout(() => {
      startValueRef.current = displayValue;
      startTimeRef.current = null;

      const easingFunctions = {
        linear: (t: number) => t,
        easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
        easeInOut: (t: number) =>
          t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        spring: (t: number) => {
          const c4 = (2 * Math.PI) / 3;
          return t === 0
            ? 0
            : t === 1
            ? 1
            : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        },
      };

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) {
          startTimeRef.current = timestamp;
        }

        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easingFunctions[easing](progress);

        const currentValue =
          startValueRef.current + (endValue - startValueRef.current) * easedProgress;

        setDisplayValue(
          decimals > 0
            ? Number(currentValue.toFixed(decimals))
            : Math.round(currentValue)
        );

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [endValue, duration, delay, easing, decimals, enabled]);

  return displayValue;
}

/**
 * Hook for animating currency values
 */
export function useAnimatedCurrency(
  value: number,
  options: UseAnimatedCounterOptions = {}
): string {
  const animatedValue = useAnimatedCounter(value, { decimals: 2, ...options });

  return new Intl.NumberFormat('fr-TN', {
    style: 'currency',
    currency: 'TND',
    minimumFractionDigits: 2,
  }).format(animatedValue);
}

/**
 * Hook for animating percentage values
 */
export function useAnimatedPercentage(
  value: number,
  options: UseAnimatedCounterOptions = {}
): string {
  const animatedValue = useAnimatedCounter(value, { decimals: 1, ...options });
  return `${animatedValue}%`;
}

/**
 * Hook for animating large numbers with abbreviations (K, M, B)
 */
export function useAnimatedAbbreviation(
  value: number,
  options: UseAnimatedCounterOptions = {}
): string {
  const animatedValue = useAnimatedCounter(value, options);

  if (animatedValue >= 1_000_000_000) {
    return `${(animatedValue / 1_000_000_000).toFixed(1)}B`;
  }
  if (animatedValue >= 1_000_000) {
    return `${(animatedValue / 1_000_000).toFixed(1)}M`;
  }
  if (animatedValue >= 1_000) {
    return `${(animatedValue / 1_000).toFixed(1)}K`;
  }
  return animatedValue.toLocaleString('fr-TN');
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { writeText } from '../lib/storage.js';

const CurrencyContext = createContext();

const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const STORAGE_KEY = 'shopstream_currency';
const CACHE_KEY = 'shopstream_rates';
const CACHE_TTL = 6 * 60 * 60 * 1000; // six hours

/* Prices in DummyJSON are USD, so USD is always rate 1. */
export const CURRENCIES = [
    { code: 'USD', label: 'US Dollar', symbol: '$', locale: 'en-US' },
    { code: 'EGP', label: 'Egyptian Pound', symbol: 'E£', locale: 'en-EG' },
    { code: 'SAR', label: 'Saudi Riyal', symbol: 'SR', locale: 'en-SA' },
    { code: 'AED', label: 'UAE Dirham', symbol: 'AED', locale: 'en-AE' },
    { code: 'EUR', label: 'Euro', symbol: '€', locale: 'de-DE' },
    { code: 'GBP', label: 'British Pound', symbol: '£', locale: 'en-GB' },
];

const FALLBACK_RATES = { USD: 1, EGP: 51.3, SAR: 3.75, AED: 3.67, EUR: 0.92, GBP: 0.79 };

const readCachedRates = () => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;

        const cached = JSON.parse(raw);
        if (Date.now() - cached.savedAt > CACHE_TTL) return null;

        return cached.rates;
    } catch (error) {
        console.error('Failed to read cached rates:', error);
        return null;
    }
};

export const CurrencyProvider = ({ children }) => {
    const [currency, setCurrencyState] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return CURRENCIES.some((item) => item.code === saved) ? saved : 'USD';
    });

    const [rates, setRates] = useState(() => readCachedRates() || FALLBACK_RATES);
    const [ratesLoading, setRatesLoading] = useState(false);

    /* Fetch live rates once per session unless a fresh cache exists. */
    useEffect(() => {
        if (readCachedRates()) return undefined;

        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setRatesLoading(true);

            try {
                const { data } = await axios.get(RATES_URL, { signal: controller.signal });
                if (cancelled || data.result !== 'success') return;

                const next = {};
                CURRENCIES.forEach((item) => {
                    next[item.code] = data.rates[item.code] ?? FALLBACK_RATES[item.code] ?? 1;
                });

                setRates(next);
                localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rates: next }));
            } catch (error) {
                if (!axios.isCancel(error)) console.error('Failed to load exchange rates:', error);
            } finally {
                if (!cancelled) setRatesLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, []);

    const setCurrency = useCallback((code) => {
        if (!CURRENCIES.some((item) => item.code === code)) return;
        setCurrencyState(code);
        writeText(STORAGE_KEY, code);
    }, []);

    const active = CURRENCIES.find((item) => item.code === currency) || CURRENCIES[0];
    const rate = rates[currency] ?? 1;

    /* Convert a USD amount and format it for the active locale. */
    const format = useCallback(
        (usdAmount) => {
            const value = Number(usdAmount || 0) * rate;

            try {
                return new Intl.NumberFormat(active.locale, {
                    style: 'currency',
                    currency: active.code,
                    maximumFractionDigits: value >= 1000 ? 0 : 2,
                }).format(value);
            } catch (error) {
                /* Some environments miss a locale — fall back to a plain symbol. */
                return `${active.symbol}${value.toFixed(2)}`;
            }
        },
        [rate, active]
    );

    const convert = useCallback((usdAmount) => Number(usdAmount || 0) * rate, [rate]);

    const value = useMemo(
        () => ({
            currency,
            setCurrency,
            currencies: CURRENCIES,
            symbol: active.symbol,
            rate,
            format,
            convert,
            ratesLoading,
            isConverted: currency !== 'USD',
        }),
        [currency, setCurrency, active, rate, format, convert, ratesLoading]
    );

    return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = () => {
    const context = useContext(CurrencyContext);

    if (!context) {
        throw new Error('useCurrency must be used inside <CurrencyProvider>.');
    }

    return context;
};

export default CurrencyContext;

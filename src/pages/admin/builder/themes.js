/* ----------------------------------------------------------------
   Seasonal themes.

   A theme is a palette plus an optional ambient effect. It is applied
   by writing CSS custom properties onto <html>, which means every
   existing stylesheet can opt in by reading a variable, and nothing
   breaks if a theme is missing.

   Each theme carries a separate light and dark palette because a
   winter theme in dark mode should read as a cold night, not as the
   light palette dimmed.
   ---------------------------------------------------------------- */

export const EFFECTS = [
    { id: 'none', label: 'None' },
    { id: 'snow', label: 'Snowfall' },
    { id: 'leaves', label: 'Falling leaves' },
    { id: 'petals', label: 'Cherry petals' },
    { id: 'bubbles', label: 'Rising bubbles' },
    { id: 'sparkle', label: 'Sparkles' },
];

export const THEMES = [
    {
        id: 'default',
        label: 'Default',
        icon: 'bi-circle-half',
        desc: 'The original ShopStream palette.',
        effect: 'none',
        light: {
            accent: '#4c1fd7',
            accentSoft: '#ede9fe',
            accentText: '#ffffff',
            surface: '#ffffff',
            canvas: '#f4f6fb',
            ink: '#141c33',
            muted: '#8b95ab',
            line: '#e4e8f2',
        },
        dark: {
            accent: '#7c5cff',
            accentSoft: 'rgba(124,58,237,.22)',
            accentText: '#ffffff',
            surface: '#111828',
            canvas: '#0b1120',
            ink: '#f4f7ff',
            muted: '#8b95ab',
            line: '#1e2740',
        },
    },
    {
        id: 'winter',
        label: 'Winter',
        icon: 'bi-snow',
        desc: 'Cold blues with drifting snow.',
        effect: 'snow',
        light: {
            accent: '#0369a1',
            accentSoft: '#e0f2fe',
            accentText: '#ffffff',
            surface: '#ffffff',
            canvas: '#eef6fc',
            ink: '#0c2436',
            muted: '#6b8299',
            line: '#d5e6f2',
        },
        dark: {
            accent: '#38bdf8',
            accentSoft: 'rgba(56,189,248,.18)',
            accentText: '#052132',
            surface: '#0d1b2a',
            canvas: '#07121d',
            ink: '#e8f4ff',
            muted: '#7d95ab',
            line: '#16293c',
        },
    },
    {
        id: 'spring',
        label: 'Spring',
        icon: 'bi-flower1',
        desc: 'Fresh greens and drifting petals.',
        effect: 'petals',
        light: {
            accent: '#059669',
            accentSoft: '#d1fae5',
            accentText: '#ffffff',
            surface: '#ffffff',
            canvas: '#f1faf4',
            ink: '#0f2a1d',
            muted: '#6f8a7c',
            line: '#d7ebe0',
        },
        dark: {
            accent: '#34d399',
            accentSoft: 'rgba(52,211,153,.16)',
            accentText: '#052e20',
            surface: '#101f19',
            canvas: '#08150f',
            ink: '#e9fbf2',
            muted: '#7ea394',
            line: '#1b3229',
        },
    },
    {
        id: 'summer',
        label: 'Summer',
        icon: 'bi-sun',
        desc: 'Warm coral and bright light.',
        effect: 'bubbles',
        light: {
            accent: '#ea580c',
            accentSoft: '#ffedd5',
            accentText: '#ffffff',
            surface: '#ffffff',
            canvas: '#fff8f1',
            ink: '#3a1c07',
            muted: '#9a7a63',
            line: '#f6e2d1',
        },
        dark: {
            accent: '#fb923c',
            accentSoft: 'rgba(251,146,60,.18)',
            accentText: '#301202',
            surface: '#1f1410',
            canvas: '#150c08',
            ink: '#fff2e6',
            muted: '#b0907c',
            line: '#33211a',
        },
    },
    {
        id: 'autumn',
        label: 'Autumn',
        icon: 'bi-tree',
        desc: 'Amber tones with falling leaves.',
        effect: 'leaves',
        light: {
            accent: '#b45309',
            accentSoft: '#fef3c7',
            accentText: '#ffffff',
            surface: '#ffffff',
            canvas: '#fdf7ec',
            ink: '#33230c',
            muted: '#93805f',
            line: '#efe1c8',
        },
        dark: {
            accent: '#fbbf24',
            accentSoft: 'rgba(251,191,36,.16)',
            accentText: '#2b1d02',
            surface: '#1d1710',
            canvas: '#130e08',
            ink: '#fdf3e0',
            muted: '#a8916d',
            line: '#302518',
        },
    },
    {
        id: 'midnight',
        label: 'Midnight',
        icon: 'bi-stars',
        desc: 'Deep violet with quiet sparkles.',
        effect: 'sparkle',
        light: {
            accent: '#6d28d9',
            accentSoft: '#ede9fe',
            accentText: '#ffffff',
            surface: '#ffffff',
            canvas: '#f6f4ff',
            ink: '#1d1436',
            muted: '#8479a8',
            line: '#e4dcf7',
        },
        dark: {
            accent: '#a78bfa',
            accentSoft: 'rgba(167,139,250,.18)',
            accentText: '#1a0f33',
            surface: '#150f26',
            canvas: '#0c0818',
            ink: '#f2ecff',
            muted: '#9287b3',
            line: '#241a3d',
        },
    },
];

export const THEME_MAP = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/* accentSoft -> --ss-accent-soft */
const cssVarName = (key) => `--ss-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;

/* ------------------------------------------------------------------
   Write the palette as custom properties.

   `target` defaults to <html> — that is the storefront's palette and
   it belongs to LayoutProvider alone. Anything that only wants a
   *preview* (the builder canvas) must pass its own element instead.

   That distinction is not cosmetic. When the builder also painted
   <html>, its cleanup ran on unmount and removed the very variables
   LayoutProvider had written. LayoutProvider's effect did not re-run,
   because the active theme had not changed, so every page after that
   fell back to the hard-coded hex values baked into the stylesheets —
   which is plain dark mode, not the published theme. Scoping the
   preview means the two can never fight over the same element.
   ------------------------------------------------------------------ */
export const applyTheme = (themeId, isDark, target = null) => {
    const theme = THEME_MAP[themeId] || THEME_MAP.default;
    const palette = isDark ? theme.dark : theme.light;

    const root = target || (typeof document === 'undefined' ? null : document.documentElement);
    if (!root?.style) return () => { };

    Object.entries(palette).forEach(([key, value]) => {
        root.style.setProperty(cssVarName(key), value);
    });

    /* `dataset` exists on every element, so a scoped preview gets the
       same attribute hooks the storefront has. */
    root.dataset.ssTheme = theme.id;
    root.dataset.ssEffect = theme.effect;

    return () => {
        Object.keys(palette).forEach((key) => {
            root.style.removeProperty(cssVarName(key));
        });
        delete root.dataset.ssTheme;
        delete root.dataset.ssEffect;
    };
};

/* Pick a theme from today's date, for the "follow the season" option.
   Northern hemisphere months; the user can always override. */
export const seasonForDate = (date = new Date()) => {
    const month = date.getMonth();
    if (month <= 1 || month === 11) return 'winter';
    if (month <= 4) return 'spring';
    if (month <= 7) return 'summer';
    return 'autumn';
};

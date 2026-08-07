import { createBlock } from './blockTypes.js';

/* ----------------------------------------------------------------
   Ready-made arrangements.

   Building a seasonal landing page from an empty canvas is a lot of
   clicks, and most of them are the same clicks every time. A preset
   is a starting point, not a lock-in: everything stays editable.

   Each entry is a factory rather than a frozen object, because
   createBlock() mints fresh ids — reusing one object across two
   applications would produce duplicate keys.
   ---------------------------------------------------------------- */

/* Small helper: build a block and override parts of it in one go. */
const make = (type, { props = {}, style = {}, background = {}, animation = {} } = {}) => {
    const block = createBlock(type);

    return {
        ...block,
        props: { ...block.props, ...props },
        style: {
            ...block.style,
            ...style,
            background: { ...block.style.background, ...background },
        },
        animation: { ...block.animation, ...animation },
    };
};

export const PRESETS = [
    {
        id: 'default',
        label: 'Classic storefront',
        desc: 'The arrangement the store ships with.',
        icon: 'bi-house',
        theme: 'default',
        swatch: 'linear-gradient(135deg,#4c1fd7,#7c5cff)',
        /* Deliberately plain: this preset must reproduce the built-in home
           page exactly, so no block gets an invented background. Each
           section keeps whatever colour its own stylesheet gives it, which
           is what makes the result indistinguishable from the default. */
        blocks: () => [
            make('hero'),
            make('featured', { props: { heading: 'Featured Products' } }),
            /* The mosaic below the heading is left-anchored, so the copy
               above it reads correctly aligned left too. */
            make('categories', { style: { align: 'left' } }),
            make('deals'),
            make('topRated'),
            make('recent'),
            make('testimonials'),
            make('benefits'),
            make('newsletter'),
        ],
    },

    {
        id: 'black-friday',
        label: 'Black Friday',
        desc: 'High contrast, urgency first.',
        icon: 'bi-lightning-charge-fill',
        theme: 'midnight',
        swatch: 'linear-gradient(135deg,#111827,#4c1fd7)',
        blocks: () => [
            make('marquee', {
                props: {
                    text: 'BLACK FRIDAY\nUP TO 70% OFF\nENDS SUNDAY\nFREE SHIPPING',
                    speed: 18,
                },
                style: { padding: 'none' },
                background: { kind: 'color', color: '#0b0b12' },
            }),
            make('banner', {
                props: {
                    heading: 'Black Friday',
                    body: 'Our biggest markdowns of the year. While stock lasts.',
                    buttonLabel: 'Shop the sale',
                    buttonTo: '/products?sort=discount',
                    height: 420,
                },
                style: { textColor: 'light' },
                background: { kind: 'gradient', from: '#0b0b12', to: '#4c1fd7', angle: 160 },
                animation: { preset: 'zoom', duration: 800 },
            }),
            make('countdown', {
                props: { heading: 'Deal ends in' },
                style: { padding: 'md', textColor: 'light' },
                background: { kind: 'color', color: '#14141f' },
            }),
            make('productRail', {
                props: { heading: 'Biggest discounts', source: 'discount', limit: 8, layout: 'grid' },
                animation: { preset: 'fade-up', stagger: 60 },
            }),
            make('deals'),
            make('cards', {
                props: {
                    heading: 'Why shop with us',
                    columns: 3,
                    cardStyle: 'bordered',
                    items: [
                        { icon: 'bi-truck', title: 'Free delivery', body: 'On every Black Friday order.', to: '', image: '' },
                        { icon: 'bi-shield-check', title: 'Price promise', body: 'We match any lower price.', to: '', image: '' },
                        { icon: 'bi-arrow-repeat', title: '60 day returns', body: 'Extended over the holidays.', to: '', image: '' },
                    ],
                },
                background: { kind: 'color', color: '#0f0f18' },
                style: { textColor: 'light' },
            }),
            make('newsletter'),
        ],
    },

    {
        id: 'ramadan',
        label: 'Ramadan',
        desc: 'Warm, calm, family-oriented.',
        icon: 'bi-moon-stars-fill',
        theme: 'midnight',
        swatch: 'linear-gradient(135deg,#1e1b4b,#c39b3f)',
        blocks: () => [
            make('banner', {
                props: {
                    heading: 'Ramadan Kareem',
                    body: 'Gifts, gatherings and everything for the table.',
                    buttonLabel: 'Explore the collection',
                    buttonTo: '/categories',
                    height: 400,
                },
                style: { textColor: 'light' },
                background: { kind: 'gradient', from: '#1e1b4b', to: '#7c3aed', angle: 145 },
                animation: { preset: 'fade', duration: 900 },
            }),
            make('text', {
                props: {
                    eyebrow: 'THIS SEASON',
                    heading: 'Made for gathering',
                    body: 'Curated pieces for iftar tables, gifts for family, and the small things that make the month feel different.',
                    size: 'lg',
                    buttons: [{ label: 'Shop gifts', to: '/products', variant: 'solid' }],
                },
                style: { padding: 'lg' },
            }),
            /* The mosaic below the heading is left-anchored, so the copy
               above it reads correctly aligned left too. */
            make('categories', { style: { align: 'left' } }),
            make('productRail', {
                props: { heading: 'Popular right now', source: 'topRated', limit: 8, layout: 'scroll' },
            }),
            make('cards', {
                props: {
                    heading: 'Delivered before iftar',
                    columns: 3,
                    cardStyle: 'glass',
                    items: [
                        { icon: 'bi-clock-history', title: 'Same-day slots', body: 'Order before 2pm.', to: '', image: '' },
                        { icon: 'bi-gift', title: 'Gift wrapping', body: 'Free on request.', to: '', image: '' },
                        { icon: 'bi-people', title: 'Family bundles', body: 'Save when you buy together.', to: '', image: '' },
                    ],
                },
                background: { kind: 'gradient', from: '#2a1f5c', to: '#4c1fd7', angle: 120 },
                style: { textColor: 'light' },
            }),
            make('testimonials'),
            make('newsletter'),
        ],
    },

    {
        id: 'minimal',
        label: 'Minimal',
        desc: 'Products first, nothing else.',
        icon: 'bi-dash-square',
        theme: 'default',
        swatch: 'linear-gradient(135deg,#e5e7eb,#9ca3af)',
        blocks: () => [
            make('text', {
                props: {
                    eyebrow: '',
                    heading: 'Everything, simply',
                    body: 'No banners. No noise. Just the catalogue.',
                    size: 'xl',
                    buttons: [{ label: 'Browse all', to: '/products', variant: 'outline' }],
                },
                style: { padding: 'xl' },
                animation: { preset: 'fade', duration: 700 },
            }),
            make('spacer', { props: { height: 16, divider: true } }),
            make('productRail', {
                props: { heading: '', source: 'topRated', limit: 12, layout: 'grid' },
                animation: { preset: 'fade-up', stagger: 40 },
            }),
            make('spacer', { props: { height: 40, divider: false } }),
            make('benefits'),
        ],
    },

    {
        id: 'summer-sale',
        label: 'Summer sale',
        desc: 'Bright, warm, holiday energy.',
        icon: 'bi-sun-fill',
        theme: 'summer',
        swatch: 'linear-gradient(135deg,#fb923c,#f43f5e)',
        blocks: () => [
            make('hero'),
            make('marquee', {
                props: { text: 'SUMMER SALE\n30% OFF SWIMWEAR\nFREE RETURNS', speed: 22 },
                style: { padding: 'none' },
                background: { kind: 'gradient', from: '#fb923c', to: '#f43f5e', angle: 90 },
            }),
            make('productRail', {
                props: { heading: 'Summer picks', source: 'discount', limit: 8, layout: 'grid' },
            }),
            make('banner', {
                props: {
                    heading: 'Made for the sun',
                    body: 'Light layers, sandals and everything for the beach.',
                    buttonLabel: 'Shop summer',
                    buttonTo: '/products',
                    height: 340,
                },
                style: { textColor: 'light' },
                background: { kind: 'gradient', from: '#f59e0b', to: '#ef4444', angle: 135 },
                animation: { preset: 'slide-left' },
            }),
            /* The mosaic below the heading is left-anchored, so the copy
               above it reads correctly aligned left too. */
            make('categories', { style: { align: 'left' } }),
            make('newsletter'),
        ],
    },

    {
        id: 'winter-holiday',
        label: 'Winter holiday',
        desc: 'Cold blues with falling snow.',
        icon: 'bi-snow2',
        theme: 'winter',
        swatch: 'linear-gradient(135deg,#0369a1,#38bdf8)',
        blocks: () => [
            make('banner', {
                props: {
                    heading: 'Winter collection',
                    body: 'Warm layers and gifts that arrive on time.',
                    buttonLabel: 'Shop winter',
                    buttonTo: '/products',
                    height: 400,
                },
                style: { textColor: 'light' },
                background: { kind: 'gradient', from: '#0c4a6e', to: '#0ea5e9', angle: 160 },
                animation: { preset: 'fade-down', duration: 800 },
            }),
            make('countdown', {
                props: { heading: 'Order by for holiday delivery' },
                style: { padding: 'md' },
                background: { kind: 'color', color: '#e0f2fe' },
            }),
            make('featured'),
            make('cards', {
                props: {
                    heading: 'Gifting made easy',
                    columns: 3,
                    cardStyle: 'elevated',
                    items: [
                        { icon: 'bi-box-seam', title: 'Gift wrapping', body: 'Free on every order.', to: '', image: '' },
                        { icon: 'bi-truck', title: 'Guaranteed by the 24th', body: 'Order before the 18th.', to: '', image: '' },
                        { icon: 'bi-arrow-repeat', title: 'Extended returns', body: 'Until the end of January.', to: '', image: '' },
                    ],
                },
            }),
            make('topRated'),
            make('newsletter'),
        ],
    },
];

/* ------------------------------------------------------------------
   What the palette renders.

   This used to be `PRESETS.map((p) => ({ ...p, blocks: p.blocks() }))`,
   which froze one set of blocks at module load and handed the SAME
   objects out on every apply. That is precisely the trap the comment at
   the top of this file warns about: applying a preset twice produced
   duplicate block ids, and — worse — the admin's edits mutated the
   cached preset, so re-applying "Classic storefront" restored their
   last edit instead of the original.

   The factory is kept intact here. Only the metadata the palette needs
   is exposed, so nothing can hold a stale block. */
export const PRESET_LIST = PRESETS;

/* How many sections a preset lays down.

   `blocks` is a factory, not an array — deliberately, so each
   application mints fresh block ids. That means `preset.blocks.length`
   is a function's arity, which is always 0: the palette was quietly
   advertising "0 blocks" under every preset. */
export const presetBlockCount = (preset) =>
    (typeof preset?.blocks === 'function' ? preset.blocks() : preset?.blocks || []).length;

export const applyPreset = (preset) => ({
    theme: preset.theme,
    blocks: typeof preset.blocks === 'function' ? preset.blocks() : preset.blocks,
});

export default PRESETS;

/* ----------------------------------------------------------------
   Block registry.

   One entry describes everything the system needs to know about a
   block type: what it is called, what it stores, and which controls
   the inspector should draw for it. The builder UI, the renderer and
   the validator all read from here, so adding a new block type is a
   single edit in one file rather than three.

   `fields` is a tiny schema language. Keeping it declarative means the
   inspector never needs a switch statement per block type.
   ---------------------------------------------------------------- */

/* ---------------------------- field kinds -------------------------
   text     — single line
   textarea — multi line
   number   — numeric with min/max
   select   — fixed list of options
   toggle   — boolean
   color    — colour picker + hex
   image    — upload, stored in IndexedDB as a Blob
   link     — { label, to }
   list     — repeating group of sub-fields
   ------------------------------------------------------------------ */

export const ANIMATIONS = [
    { id: 'none', label: 'None', hint: 'Appears immediately' },
    { id: 'fade', label: 'Fade in', hint: 'Opacity only' },
    { id: 'fade-up', label: 'Fade up', hint: 'Rises as it fades in' },
    { id: 'fade-down', label: 'Fade down', hint: 'Drops as it fades in' },
    { id: 'slide-left', label: 'Slide from left', hint: 'Enters from the left edge' },
    { id: 'slide-right', label: 'Slide from right', hint: 'Enters from the right edge' },
    { id: 'zoom', label: 'Zoom in', hint: 'Scales up from 92%' },
    { id: 'flip', label: 'Flip up', hint: 'Rotates on the X axis' },
    { id: 'blur', label: 'Blur in', hint: 'Sharpens as it arrives' },
];

export const PADDINGS = [
    { id: 'none', label: 'None' },
    { id: 'sm', label: 'Small' },
    { id: 'md', label: 'Medium' },
    { id: 'lg', label: 'Large' },
    { id: 'xl', label: 'Extra large' },
];

export const WIDTHS = [
    { id: 'full', label: 'Full bleed' },
    { id: 'wide', label: 'Wide' },
    { id: 'normal', label: 'Normal' },
    { id: 'narrow', label: 'Narrow' },
    /* Unlocks the pixel slider in the inspector. */
    { id: 'custom', label: 'Custom' },
];

export const BUTTON_STYLES = [
    { id: 'solid', label: 'Solid' },
    { id: 'outline', label: 'Outline' },
    { id: 'ghost', label: 'Text only' },
    { id: 'soft', label: 'Soft tint' },
    { id: 'gradient', label: 'Gradient' },
    { id: 'glow', label: 'Glow' },
    { id: 'underline', label: 'Underline' },
    { id: 'pill-3d', label: 'Raised' },
];

export const BUTTON_SHAPES = [
    { id: 'pill', label: 'Pill' },
    { id: 'rounded', label: 'Rounded' },
    { id: 'square', label: 'Square' },
];

export const BUTTON_SIZES = [
    { id: 'sm', label: 'Small' },
    { id: 'md', label: 'Medium' },
    { id: 'lg', label: 'Large' },
];

export const ALIGNMENTS = [
    { id: 'left', label: 'Left' },
    { id: 'center', label: 'Centre' },
    { id: 'right', label: 'Right' },
];

/* Every block carries these, so they live in one place instead of
   being repeated in ten definitions. */
export const defaultStyle = () => ({
    background: {
        /* 'none'   — inherit the page colour (theme-aware)
           'theme'  — the app's own light/dark surface, ignoring the season
           'color' | 'gradient' | 'image' — an explicit choice */
        kind: 'none',
        color: '#f8f9fd',
        from: '#4c1fd7',
        to: '#7c5cff',
        angle: 135,
        image: '', // an idb: reference or a URL
        overlay: 0.35,
        fixed: false,
    },
    padding: 'lg',
    width: 'wide',
    align: 'center',
    /* 'auto' picks black or white from the background luminance, so a
       dark background never ends up with unreadable dark text. */
    textColor: 'auto',
    radius: 0,
    /* Minimum height of the whole section, in pixels. 0 means "as tall as
       the content needs", which is the sensible default for every block —
       a forced height is opt-in. */
    minHeight: 0,
    /* Only read when `width` is 'custom'. Kept separate from the preset
       so switching to Custom and back never loses either choice. */
    maxWidth: 1100,
    /* How the content sits inside that height once it is taller than the
       content: start | center | end. */
    verticalAlign: 'center',
});

export const defaultAnimation = () => ({
    preset: 'fade-up',
    duration: 600,
    delay: 0,
    stagger: 80,
    once: true,
});

/* ------------------------------------------------------------------
   Blocks that wrap what the storefront already renders. They own no
   content of their own — the existing HomePage code draws them — so
   their fields are limited to presentation.
   ------------------------------------------------------------------ */
/* `count` is the section's natural size — the number the hand-built
   storefront was designed around. A single shared default of 8 made
   Top Categories render a lopsided mosaic and Testimonials ask for
   eight quotes in a three-column grid, so each one carries its own. */
const NATIVE = [
    { type: 'featured', label: 'Featured products', icon: 'bi-stars', desc: 'Curated product carousel.', count: 8 },
    { type: 'categories', label: 'Top categories', icon: 'bi-grid', desc: 'Category tiles.', count: 4 },
    { type: 'deals', label: 'Deals of the day', icon: 'bi-lightning-charge', desc: 'Discounted picks with a timer.', count: 4 },
    { type: 'topRated', label: 'Top rated', icon: 'bi-award', desc: 'Highest rated products.', count: 4 },
    { type: 'recent', label: 'Recently viewed', icon: 'bi-clock-history', desc: 'Personal browsing history.', count: 8 },
    { type: 'testimonials', label: 'Testimonials', icon: 'bi-chat-quote', desc: 'Real customer reviews.', count: 3 },
    { type: 'benefits', label: 'Benefits strip', icon: 'bi-shield-check', desc: 'Shipping, returns, support.', count: 4 },
    { type: 'newsletter', label: 'Newsletter', icon: 'bi-envelope-heart', desc: 'Email capture form.', count: 1 },
];

const nativeBlocks = NATIVE.map(({ type, label, icon, desc, count }) => ({
    type,
    label,
    icon,
    desc,
    group: 'storefront',
    native: true,
    /* Presentation plus which products appear. The section still draws
       its own markup from live data — these fields decide what goes in
       it. Sections that are not product lists ignore the picker. */
    fields: [
        { key: 'heading', kind: 'text', label: 'Override heading', placeholder: 'Leave blank to keep the default' },
        { key: 'limit', kind: 'number', label: 'Items to show', min: 2, max: 24, step: 1 },
        {
            key: 'pickIds',
            kind: 'text',
            label: 'Show only these products',
            placeholder: 'e.g. 12, 4, 77 — leave blank for automatic',
            help: 'Product IDs, comma separated. They appear in the order you type them and every other filter is skipped.',
        },
        {
            key: 'excludeIds',
            kind: 'text',
            label: 'Never show these',
            placeholder: 'e.g. 3, 19',
            help: 'Product IDs to keep out of this section.',
        },
        {
            key: 'minRating',
            kind: 'number',
            label: 'Minimum rating',
            min: 0,
            max: 5,
            step: 0.1,
            help: '0 shows everything.',
        },
        { key: 'inStockOnly', kind: 'toggle', label: 'In stock only' },
    ],
    defaults: () => ({
        heading: '',
        limit: count,
        pickIds: '',
        excludeIds: '',
        minRating: 0,
        inStockOnly: false,
    }),
}));

/* ------------------------------------------------------------------
   Blocks the admin fills in themselves.
   ------------------------------------------------------------------ */
/* Declared above so every block can share one vocabulary. */
const BUTTON_STYLES_REF = BUTTON_STYLES;
const BUTTON_SHAPES_REF = BUTTON_SHAPES;
const BUTTON_SIZES_REF = BUTTON_SIZES;

const customBlocks = [
    {
        type: 'hero',
        label: 'Hero slider',
        icon: 'bi-easel2',
        desc: 'A rotating headline with a product beside it.',
        group: 'content',
        fields: [
            {
                key: 'slides',
                kind: 'list',
                label: 'Slides',
                max: 6,
                item: [
                    { key: 'eyebrow', kind: 'text', label: 'Eyebrow', placeholder: 'NEW SEASON ARRIVAL' },
                    { key: 'title', kind: 'text', label: 'Headline' },
                    { key: 'subtitle', kind: 'textarea', label: 'Supporting copy' },
                    { key: 'primaryLabel', kind: 'text', label: 'Primary button' },
                    { key: 'primaryTo', kind: 'text', label: 'Primary link', placeholder: '/products' },
                    { key: 'secondaryLabel', kind: 'text', label: 'Secondary button' },
                    { key: 'secondaryTo', kind: 'text', label: 'Secondary link', placeholder: '/categories' },
                    { key: 'image', kind: 'image', label: 'Slide image (optional)' },
                ],
                newItem: () => ({
                    eyebrow: 'NEW THIS WEEK',
                    title: 'A headline that sells',
                    subtitle: 'One or two lines explaining why this matters.',
                    primaryLabel: 'Shop now',
                    primaryTo: '/products',
                    secondaryLabel: 'Browse all',
                    secondaryTo: '/categories',
                    image: '',
                }),
            },
            {
                key: 'mediaSide',
                kind: 'select',
                label: 'Image position',
                options: [
                    { id: 'right', label: 'Right of the text' },
                    { id: 'left', label: 'Left of the text' },
                    { id: 'behind', label: 'Behind the text' },
                    { id: 'below', label: 'Below the text' },
                    { id: 'none', label: 'No image' },
                ],
            },
            {
                key: 'mediaSource',
                kind: 'select',
                label: 'What to show',
                options: [
                    { id: 'product', label: 'A live product' },
                    { id: 'custom', label: 'The slide image' },
                ],
            },
            {
                key: 'mediaShape',
                kind: 'select',
                label: 'Image frame',
                options: [
                    { id: 'card', label: 'Card' },
                    { id: 'circle', label: 'Circle' },
                    { id: 'plain', label: 'No frame' },
                    { id: 'blob', label: 'Soft blob' },
                ],
            },
            {
                key: 'buttonStyle',
                kind: 'select',
                label: 'Primary button style',
                options: BUTTON_STYLES_REF,
            },
            {
                key: 'buttonShape',
                kind: 'select',
                label: 'Button shape',
                options: BUTTON_SHAPES_REF,
            },
            {
                key: 'buttonSize',
                kind: 'select',
                label: 'Button size',
                options: BUTTON_SIZES_REF,
            },
            { key: 'autoplay', kind: 'toggle', label: 'Rotate automatically' },
            { key: 'interval', kind: 'number', label: 'Seconds per slide', min: 2, max: 15, step: 1 },
            { key: 'showDots', kind: 'toggle', label: 'Show slide dots' },
            { key: 'showArrows', kind: 'toggle', label: 'Show arrows' },
            { key: 'minHeight', kind: 'number', label: 'Minimum height (px)', min: 260, max: 800, step: 20 },
        ],
        defaults: () => ({
            slides: [
                {
                    eyebrow: 'NEW SEASON ARRIVAL',
                    title: 'Experience the Future of Innovation.',
                    subtitle:
                        'Explore our curated selection of premium electronics designed to elevate your daily stream of life.',
                    primaryLabel: 'Shop Electronics',
                    primaryTo: '/products',
                    secondaryLabel: 'View Collections',
                    secondaryTo: '/categories',
                    image: '',
                },
                {
                    eyebrow: 'LIMITED TIME OFFER',
                    title: 'Summer Sale — Up to 50% Off',
                    subtitle: "Our biggest sale of the year. Shop now and save on selected items.",
                    primaryLabel: 'Shop the Sale',
                    primaryTo: '/products?sort=discount',
                    secondaryLabel: 'View Collections',
                    secondaryTo: '/categories',
                    image: '',
                },
            ],
            mediaSide: 'right',
            mediaSource: 'product',
            mediaShape: 'card',
            buttonStyle: 'solid',
            buttonShape: 'pill',
            buttonSize: 'md',
            autoplay: true,
            interval: 6,
            showDots: true,
            showArrows: true,
            minHeight: 460,
        }),
    },

    {
        type: 'text',
        label: 'Text',
        icon: 'bi-type',
        desc: 'A heading with body copy and optional buttons.',
        group: 'content',
        fields: [
            { key: 'eyebrow', kind: 'text', label: 'Eyebrow', placeholder: 'NEW THIS WEEK' },
            { key: 'heading', kind: 'text', label: 'Heading', placeholder: 'Say something' },
            { key: 'body', kind: 'textarea', label: 'Body', placeholder: 'Supporting copy…' },
            { key: 'buttonShape', kind: 'select', label: 'Button shape', options: BUTTON_SHAPES_REF },
            { key: 'buttonSize', kind: 'select', label: 'Button size', options: BUTTON_SIZES_REF },
            {
                key: 'size',
                kind: 'select',
                label: 'Heading size',
                options: [
                    { id: 'sm', label: 'Small' },
                    { id: 'md', label: 'Medium' },
                    { id: 'lg', label: 'Large' },
                    { id: 'xl', label: 'Display' },
                ],
            },
            {
                key: 'buttons',
                kind: 'list',
                label: 'Buttons',
                max: 3,
                item: [
                    { key: 'label', kind: 'text', label: 'Label', placeholder: 'Shop now' },
                    { key: 'to', kind: 'text', label: 'Links to', placeholder: '/products' },
                    { key: 'variant', kind: 'select', label: 'Style', options: BUTTON_STYLES_REF },
                    { key: 'icon', kind: 'text', label: 'Icon (optional)', placeholder: 'bi-arrow-right' },
                ],
                newItem: () => ({ label: 'Shop now', to: '/products', variant: 'solid', icon: '' }),
            },
        ],
        defaults: () => ({
            eyebrow: '',
            heading: 'A new section',
            body: 'Describe what makes this worth reading.',
            size: 'lg',
            buttonShape: 'pill',
            buttonSize: 'md',
            buttons: [],
        }),
    },

    {
        type: 'cards',
        label: 'Cards',
        icon: 'bi-collection',
        desc: 'A grid of cards you design yourself.',
        group: 'content',
        fields: [
            { key: 'heading', kind: 'text', label: 'Section heading', placeholder: 'Optional' },
            { key: 'columns', kind: 'number', label: 'Columns', min: 1, max: 4, step: 1 },
            {
                key: 'cardStyle',
                kind: 'select',
                label: 'Card style',
                options: [
                    { id: 'plain', label: 'Plain' },
                    { id: 'bordered', label: 'Bordered' },
                    { id: 'elevated', label: 'Elevated' },
                    { id: 'glass', label: 'Glass' },
                    { id: 'overlay', label: 'Image overlay' },
                ],
            },
            { key: 'cardRadius', kind: 'number', label: 'Corner radius', min: 0, max: 32, step: 2 },
            {
                key: 'mediaPosition',
                kind: 'select',
                label: 'Where the image sits',
                options: [
                    { id: 'top', label: 'Above the text' },
                    { id: 'left', label: 'Left of the text' },
                    { id: 'right', label: 'Right of the text' },
                    { id: 'background', label: 'Behind the text' },
                    { id: 'bottom', label: 'Below the text' },
                ],
            },
            {
                key: 'mediaRatio',
                kind: 'select',
                label: 'Image shape',
                options: [
                    { id: 'wide', label: 'Wide 16:10' },
                    { id: 'square', label: 'Square' },
                    { id: 'tall', label: 'Portrait 3:4' },
                    { id: 'circle', label: 'Circle' },
                ],
            },
            {
                key: 'cardAlign',
                kind: 'select',
                label: 'Text alignment',
                options: [
                    { id: 'inherit', label: 'Match section' },
                    { id: 'left', label: 'Left' },
                    { id: 'center', label: 'Centre' },
                ],
            },
            { key: 'hoverLift', kind: 'toggle', label: 'Lift on hover' },
            {
                key: 'items',
                kind: 'list',
                label: 'Cards',
                max: 12,
                item: [
                    { key: 'image', kind: 'image', label: 'Image' },
                    { key: 'icon', kind: 'text', label: 'Icon class', placeholder: 'bi-truck' },
                    { key: 'title', kind: 'text', label: 'Title' },
                    { key: 'body', kind: 'textarea', label: 'Body' },
                    { key: 'to', kind: 'text', label: 'Links to', placeholder: '/products' },
                ],
                newItem: () => ({ image: '', icon: 'bi-star', title: 'Card title', body: 'Short description.', to: '' }),
            },
        ],
        defaults: () => ({
            heading: '',
            columns: 3,
            cardStyle: 'elevated',
            cardRadius: 16,
            mediaPosition: 'top',
            mediaRatio: 'wide',
            cardAlign: 'inherit',
            hoverLift: true,
            items: [
                { image: '', icon: 'bi-truck', title: 'Free delivery', body: 'On every order over $50.', to: '' },
                { image: '', icon: 'bi-arrow-repeat', title: 'Easy returns', body: '30 days, no questions.', to: '' },
                { image: '', icon: 'bi-headset', title: 'Real support', body: 'Humans, not scripts.', to: '' },
            ],
        }),
    },

    {
        type: 'banner',
        label: 'Banner',
        icon: 'bi-image',
        desc: 'A full-width image with text on top.',
        group: 'content',
        fields: [
            { key: 'image', kind: 'image', label: 'Background image' },
            { key: 'heading', kind: 'text', label: 'Heading' },
            { key: 'body', kind: 'textarea', label: 'Body' },
            { key: 'buttonLabel', kind: 'text', label: 'Button label' },
            { key: 'buttonTo', kind: 'text', label: 'Button links to', placeholder: '/products' },
            { key: 'buttonStyle', kind: 'select', label: 'Button style', options: BUTTON_STYLES_REF },
            { key: 'buttonShape', kind: 'select', label: 'Button shape', options: BUTTON_SHAPES_REF },
            { key: 'height', kind: 'number', label: 'Minimum height (px)', min: 160, max: 720, step: 20 },
        ],
        defaults: () => ({
            image: '',
            heading: 'Season sale',
            body: 'Up to 40% off selected lines.',
            buttonLabel: 'Shop the sale',
            buttonTo: '/products',
            buttonStyle: 'solid',
            buttonShape: 'pill',
            height: 360,
        }),
    },

    {
        type: 'productRail',
        label: 'Product rail',
        icon: 'bi-bag',
        desc: 'Live products filtered how you like.',
        group: 'content',
        fields: [
            { key: 'heading', kind: 'text', label: 'Heading' },
            {
                key: 'source',
                kind: 'select',
                label: 'Pick products by',
                options: [
                    { id: 'category', label: 'Category' },
                    { id: 'topRated', label: 'Highest rated' },
                    { id: 'discount', label: 'Biggest discount' },
                    { id: 'newest', label: 'Newest' },
                    { id: 'manual', label: 'Specific IDs' },
                ],
            },
            { key: 'category', kind: 'text', label: 'Category slug', placeholder: 'smartphones' },
            { key: 'ids', kind: 'text', label: 'Product IDs', placeholder: '1, 5, 12' },
            { key: 'limit', kind: 'number', label: 'How many', min: 2, max: 20, step: 1 },
            {
                key: 'layout',
                kind: 'select',
                label: 'Layout',
                options: [
                    { id: 'grid', label: 'Grid' },
                    { id: 'scroll', label: 'Horizontal scroll' },
                    { id: 'marquee', label: 'Auto-scrolling carousel' },
                ],
            },
            { key: 'speed', kind: 'number', label: 'Carousel seconds per loop', min: 10, max: 90, step: 5 },
            { key: 'columns', kind: 'number', label: 'Cards per row', min: 2, max: 6, step: 1 },
            { key: 'showArrows', kind: 'toggle', label: 'Show scroll arrows' },
            {
                key: 'exclude',
                kind: 'text',
                label: 'Skip these IDs',
                placeholder: '3, 17',
            },
            {
                key: 'minRating',
                kind: 'number',
                label: 'Minimum rating',
                min: 0,
                max: 5,
                step: 0.5,
            },
            { key: 'inStockOnly', kind: 'toggle', label: 'In stock only' },
            { key: 'showPrice', kind: 'toggle', label: 'Show the price' },
            { key: 'showRating', kind: 'toggle', label: 'Show the rating' },
        ],
        defaults: () => ({
            heading: 'Picked for you',
            source: 'topRated',
            category: '',
            ids: '',
            exclude: '',
            limit: 8,
            layout: 'grid',
            speed: 40,
            columns: 4,
            showArrows: true,
            minRating: 0,
            inStockOnly: false,
            showPrice: true,
            showRating: false,
        }),
    },

    {
        type: 'countdown',
        label: 'Countdown',
        icon: 'bi-hourglass-split',
        desc: 'A deadline with a live timer.',
        group: 'content',
        fields: [
            { key: 'heading', kind: 'text', label: 'Heading' },
            { key: 'endsAt', kind: 'text', label: 'Ends at (ISO date)', placeholder: '2026-12-31T23:59' },
            { key: 'expiredText', kind: 'text', label: 'Text once expired', placeholder: 'This offer has ended' },
        ],
        defaults: () => ({
            heading: 'Ends soon',
            endsAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
            expiredText: 'This offer has ended.',
        }),
    },

    {
        type: 'spacer',
        label: 'Spacer',
        icon: 'bi-distribute-vertical',
        desc: 'Empty breathing room, optionally with a divider.',
        group: 'layout',
        fields: [
            { key: 'height', kind: 'number', label: 'Height (px)', min: 8, max: 240, step: 8 },
            { key: 'divider', kind: 'toggle', label: 'Show a divider line' },
        ],
        defaults: () => ({ height: 48, divider: false }),
    },

    {
        type: 'marquee',
        label: 'Marquee',
        icon: 'bi-signpost-split',
        desc: 'A scrolling strip of short phrases.',
        group: 'layout',
        fields: [
            { key: 'text', kind: 'textarea', label: 'Phrases', placeholder: 'One per line' },
            { key: 'speed', kind: 'number', label: 'Seconds per loop', min: 5, max: 90, step: 5 },
            {
                key: 'direction',
                kind: 'select',
                label: 'Direction',
                options: [
                    { id: 'left', label: 'Right to left' },
                    { id: 'right', label: 'Left to right' },
                ],
            },
        ],
        defaults: () => ({
            text: 'Free shipping over $50\nReal 30 day returns\nSupport that answers',
            speed: 25,
            direction: 'left',
        }),
    },
];

export const BLOCK_TYPES = [...nativeBlocks, ...customBlocks];

export const BLOCK_MAP = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b]));

export const BLOCK_GROUPS = [
    { id: 'storefront', label: 'Storefront sections', hint: 'Powered by live data' },
    { id: 'content', label: 'Content blocks', hint: 'You supply the content' },
    { id: 'layout', label: 'Layout', hint: 'Spacing and decoration' },
];

let counter = 0;

/* A block id has to survive a reload and stay unique inside one tick,
   so the timestamp alone is not enough. */
export const makeBlockId = (type) => {
    counter += 1;
    return `${type}-${Date.now().toString(36)}-${counter.toString(36)}`;
};

export const createBlock = (type) => {
    const def = BLOCK_MAP[type];
    if (!def) throw new Error(`Unknown block type: ${type}`);

    return {
        id: makeBlockId(type),
        type,
        hidden: false,
        props: def.defaults(),
        style: defaultStyle(),
        animation: defaultAnimation(),
    };
};

/* Deep-ish clone that also re-keys the block, used by Duplicate. */
export const cloneBlock = (block) => ({
    ...structuredClone(block),
    id: makeBlockId(block.type),
});

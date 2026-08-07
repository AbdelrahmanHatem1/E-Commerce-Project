/* ----------------------------------------------------------------
   Turns a block's saved style object into real CSS.

   One resolver serves both the live storefront and the builder canvas,
   which is the whole point: what the admin drags around is the same
   component the shopper sees, so there is no second implementation to
   drift out of sync.
   ---------------------------------------------------------------- */

const PADDING_MAP = {
    none: '0',
    sm: 'clamp(1rem, 2vw, 1.75rem)',
    md: 'clamp(1.75rem, 4vw, 3rem)',
    lg: 'clamp(2.5rem, 6vw, 4.5rem)',
    xl: 'clamp(4rem, 9vw, 7rem)',
};

/* `wide` matches Bootstrap's .container at the xxl breakpoint (1320px).
   The two have to agree or a custom block sits visibly narrower than
   the hand-built sections above and below it. */
const WIDTH_MAP = {
    full: '100%',
    wide: '1320px',
    normal: '1100px',
    narrow: '760px',
};

/* ------------------------------------------------------------------
   Relative luminance, per WCAG 2.1. Used twice: to pick readable text
   automatically, and to warn the admin when their own colour choice
   fails the contrast requirement.
   ------------------------------------------------------------------ */
export const hexToRgb = (hex) => {
    if (typeof hex !== 'string') return null;

    let value = hex.trim().replace('#', '');
    if (value.length === 3) value = value.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;

    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    };
};

export const luminance = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 1; // unknown reads as light, so text defaults to dark

    const channel = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
};

/* WCAG contrast ratio between two hex colours: 1 (identical) to 21. */
export const contrastRatio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    const light = Math.max(la, lb);
    const dark = Math.min(la, lb);
    return (light + 0.05) / (dark + 0.05);
};

/* AA wants 4.5 for body text, 3 for large text. */
export const contrastVerdict = (fg, bg) => {
    const ratio = contrastRatio(fg, bg);

    if (ratio >= 7) return { ratio, level: 'AAA', tone: 'ok', label: 'Excellent contrast' };
    if (ratio >= 4.5) return { ratio, level: 'AA', tone: 'ok', label: 'Passes AA' };
    if (ratio >= 3) return { ratio, level: 'AA Large', tone: 'warn', label: 'Large text only' };
    return { ratio, level: 'Fail', tone: 'bad', label: 'Hard to read' };
};

/* The colour actually sitting behind the text, so contrast can be
   judged. A gradient is averaged; an image is unknowable, so the
   overlay strength decides. */
export const effectiveBackdrop = (background, fallback = '#ffffff') => {
    if (!background) return fallback;

    switch (background.kind) {
        case 'theme':
            /* Resolved by sectionStyle at render time; for contrast purposes
               the light surface is the safe assumption. */
            return '#ffffff';

        case 'color':
            return background.color || fallback;

        case 'gradient': {
            const from = hexToRgb(background.from);
            const to = hexToRgb(background.to);
            if (!from || !to) return fallback;

            const mix = (a, b) => Math.round((a + b) / 2).toString(16).padStart(2, '0');
            return `#${mix(from.r, to.r)}${mix(from.g, to.g)}${mix(from.b, to.b)}`;
        }

        case 'image':
            /* A heavy overlay makes it reliably dark; a light one leaves the
               photo in charge and we cannot know. */
            return background.overlay >= 0.4 ? '#2a2a2a' : fallback;

        default:
            return fallback;
    }
};

/* 'auto' resolves against the real backdrop rather than guessing. */
export const resolveTextColor = (style, isDark = false) => {
    if (style?.textColor === 'light') return '#ffffff';
    if (style?.textColor === 'dark') return '#141c33';

    const fallback = isDark ? '#0b1120' : '#ffffff';
    const backdrop = effectiveBackdrop(style?.background, fallback);

    return luminance(backdrop) > 0.45 ? '#141c33' : '#ffffff';
};

/* Does this block paint a background of its own? Used to decide
   whether a native storefront section underneath has to be made
   transparent so the admin's choice is actually visible. */
export const hasCustomBackground = (block) => {
    const kind = block?.style?.background?.kind;
    return kind === 'color' || kind === 'gradient' || kind === 'image' || kind === 'theme';
};

/* ------------------------------------------------------------------
   The section wrapper's inline style.
   ------------------------------------------------------------------ */
export const sectionStyle = (block, { isDark = false, imageUrl = '', native = false } = {}) => {
    const style = block?.style;
    if (!style) return {};

    const bg = style.background || {};
    const out = {
        borderRadius: style.radius ? `${style.radius}px` : undefined,
        textAlign: style.align || 'center',
    };

    /* An explicit section height. Left at 0 the section is as tall as its
       content, which is what every block did before this existed.
  
       `minHeight` rather than `height` so content can always overflow
       gracefully instead of being clipped — a hard height would cut text
       off on a narrow screen where it wraps to more lines. */
    /* Native sections size themselves, and the control is hidden for
       them — but a layout saved before that change can still carry a
       height, so it is ignored here too. Otherwise an old profile would
       keep its dead space with no way to clear it. */
    const minHeight = native ? 0 : Number(style.minHeight) || 0;
    if (minHeight > 0) {
        /* Capped against the viewport as well as the pixel value. A section
           set to 900px would otherwise fill more than a phone screen and
           push everything below it out of sight — the admin picks a height
           for a desktop layout without thinking about a 640px-tall handset.
           `min()` keeps their number on a big screen and quietly relaxes it
           on a small one. */
        out.minHeight = `min(${minHeight}px, 90vh)`;
        /* Flex is what actually distributes the spare space; without it the
           content just sits at the top of a taller box. */
        out.display = 'flex';
        out.flexDirection = 'column';
        out.justifyContent =
            { start: 'flex-start', center: 'center', end: 'flex-end' }[style.verticalAlign] || 'center';
    }

    /* A native section brings its own vertical rhythm. Adding ours on top
       doubled the gap between every stock section. */
    if (!native) {
        out.paddingTop = PADDING_MAP[style.padding] ?? PADDING_MAP.lg;
        out.paddingBottom = PADDING_MAP[style.padding] ?? PADDING_MAP.lg;
    }

    /* Text colour.
  
       `auto` defers to the section's own stylesheet when there is no
       custom background — those sheets already pick a readable colour for
       light and dark mode, and overriding it would break that.
  
       An EXPLICIT choice of Light or Dark is the admin overruling that on
       purpose, so it always wins. Previously any native section with the
       default background was skipped entirely, which is why the Text
       colour control looked dead on every storefront block. */
    const explicitInk = style.textColor === 'light' || style.textColor === 'dark';

    if (!native || explicitInk || style.background?.kind !== 'none') {
        out.color = resolveTextColor(style, isDark);
    }

    switch (bg.kind) {
        /* The app's own surface colour rather than the season's. Lets a
           block opt out of a loud seasonal palette and stay neutral, and
           still flips correctly with the light/dark switch. */
        case 'theme':
            out.background = isDark ? '#111828' : '#ffffff';
            out.color = isDark ? '#f4f7ff' : '#141c33';
            break;

        case 'color':
            out.background = bg.color;
            break;

        case 'gradient':
            out.background = `linear-gradient(${bg.angle ?? 135}deg, ${bg.from}, ${bg.to})`;
            break;

        case 'image':
            if (imageUrl) {
                /* The overlay is baked into the same declaration so it can
                   never separate from the photo it is darkening. */
                const shade = `rgba(0,0,0,${bg.overlay ?? 0.35})`;
                out.backgroundImage = `linear-gradient(${shade}, ${shade}), url("${imageUrl}")`;
                out.backgroundSize = 'cover';
                out.backgroundPosition = 'center';
                out.backgroundAttachment = bg.fixed ? 'fixed' : 'scroll';
            } else {
                out.background = 'var(--ss-canvas, #f4f6fb)';
            }
            break;

        default:
            /* `none` paints the page colour so a block reads as part of the
               page rather than a slab floating on top of it.
      
               Native sections are the exception: they already carry their own
               background from the original stylesheets, and overpainting them
               would flatten the alternating bands the home page relies on. */
            if (!native) out.background = 'var(--ss-canvas, transparent)';
            break;
    }

    return out;
};

export const innerStyle = (block) => {
    const style = block?.style;
    const width = style?.width;

    /* A custom width is a CEILING, never a fixed size.
  
       `min(1100px, 100%)` is the whole trick: on a wide screen the pixel
       value wins, and on a phone narrower than that value the 100% wins,
       so the section shrinks to fit instead of forcing a horizontal
       scrollbar. Writing the raw pixel value here would break every
       custom-width section on mobile — which is why the UX warning in the
       inspector is not needed: the geometry cannot go wrong. */
    const custom = Math.max(280, Number(style?.maxWidth) || 1100);

    const maxWidth =
        width === 'custom'
            ? `min(${custom}px, 100%)`
            : WIDTH_MAP[width] ?? WIDTH_MAP.wide;

    return {
        maxWidth,
        marginInline: 'auto',
        paddingInline: width === 'full' ? 0 : 'var(--bs-gutter-x, .75rem)',
    };
};

/* ------------------------------------------------------------------
   Animation.

   Returns the props a rendered block needs. The class does the work in
   CSS; the custom properties carry the admin's timing choices so no
   inline keyframes are generated per block.
   ------------------------------------------------------------------ */
/* `base` is folded in rather than left to the caller: spreading the
   result after a className attribute silently replaced the element's
   own classes, which stripped the styling off every animated heading,
   button row and card. Passing the base class through here makes that
   mistake impossible. */
export const animationProps = (block, visible, index = 0, base = '') => {
    const anim = block?.animation;

    if (!anim || anim.preset === 'none') {
        return { className: base, style: {} };
    }

    const classes = [base, 'ss-anim', `is-${anim.preset}`, visible ? 'is-in' : '']
        .filter(Boolean)
        .join(' ');

    return {
        className: classes,
        style: {
            '--ss-anim-duration': `${anim.duration ?? 600}ms`,
            '--ss-anim-delay': `${(anim.delay ?? 0) + index * (anim.stagger ?? 0)}ms`,
        },
    };
};

/* Blocks can opt out of a breakpoint entirely. */
export const visibilityClass = (block) => {
    const v = block?.visibility;
    if (!v) return '';

    const classes = [];
    if (v.mobile === false) classes.push('ss-hide-mobile');
    if (v.tablet === false) classes.push('ss-hide-tablet');
    if (v.desktop === false) classes.push('ss-hide-desktop');
    return classes.join(' ');
};

export { PADDING_MAP, WIDTH_MAP };

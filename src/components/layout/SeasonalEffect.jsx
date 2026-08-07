import React, { useEffect, useRef } from 'react';
import './seasonalEffect.css';

/* ----------------------------------------------------------------
   Ambient seasonal particles: snow, leaves, petals, bubbles, sparkles.

   Drawn on a single <canvas> rather than as DOM nodes. Two hundred
   animated elements would each get their own layer, style recalc and
   paint; one canvas is a single composite regardless of how many
   particles are on screen.

   The effect is decorative, so it is skipped entirely when the visitor
   asks for reduced motion, and it never intercepts pointer events.
   ---------------------------------------------------------------- */

const CONFIG = {
    snow: {
        count: 70,
        /* White on a white page is invisible; a cool grey-blue keeps the
           flakes readable in light mode without looking dirty. */
        ink: { light: '#8fb4d9', dark: '#ffffff' },
        make: (w, h) => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 1 + Math.random() * 2.6,
            speed: 0.25 + Math.random() * 0.7,
            drift: (Math.random() - 0.5) * 0.45,
            wobble: Math.random() * Math.PI * 2,
            alpha: 0.35 + Math.random() * 0.5,
        }),
        draw: (ctx, p, ink) => {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = ink;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        },
    },

    leaves: {
        count: 26,
        palette: ['#b45309', '#d97706', '#92400e', '#c2410c', '#a16207'],
        make: (w, h, palette) => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 4 + Math.random() * 5,
            speed: 0.4 + Math.random() * 0.8,
            drift: (Math.random() - 0.5) * 1.1,
            wobble: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.06,
            angle: Math.random() * Math.PI * 2,
            alpha: 0.5 + Math.random() * 0.4,
            color: palette[Math.floor(Math.random() * palette.length)],
        }),
        draw: (ctx, p, _ink) => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            /* A leaf is two arcs meeting at a point — cheaper than a path
               with bezier control points and reads correctly at this size. */
            ctx.beginPath();
            ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
    },

    petals: {
        count: 34,
        palette: ['#fbcfe8', '#f9a8d4', '#fecdd3', '#fda4af'],
        make: (w, h, palette) => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 3 + Math.random() * 4,
            speed: 0.3 + Math.random() * 0.6,
            drift: (Math.random() - 0.5) * 1.4,
            wobble: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.05,
            angle: Math.random() * Math.PI * 2,
            alpha: 0.45 + Math.random() * 0.45,
            color: palette[Math.floor(Math.random() * palette.length)],
        }),
        draw: (ctx, p, _ink) => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
    },

    bubbles: {
        count: 30,
        ink: { light: '#f0a878', dark: '#ffffff' },
        make: (w, h) => ({
            x: Math.random() * w,
            y: h + Math.random() * h,
            r: 3 + Math.random() * 9,
            speed: -(0.3 + Math.random() * 0.8), // negative: rises
            drift: (Math.random() - 0.5) * 0.4,
            wobble: Math.random() * Math.PI * 2,
            alpha: 0.12 + Math.random() * 0.22,
        }),
        draw: (ctx, p, ink) => {
            ctx.globalAlpha = p.alpha;
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.stroke();
        },
    },

    sparkle: {
        count: 45,
        ink: { light: '#a78bfa', dark: '#ffffff' },
        make: (w, h) => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 0.7 + Math.random() * 1.8,
            speed: 0.05 + Math.random() * 0.18,
            drift: (Math.random() - 0.5) * 0.12,
            wobble: Math.random() * Math.PI * 2,
            alpha: Math.random(),
            twinkle: 0.01 + Math.random() * 0.03,
            rising: Math.random() > 0.5,
        }),
        draw: (ctx, p, ink) => {
            ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha)) * 0.85;
            ctx.fillStyle = ink;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        },
    },
};

const SeasonalEffect = ({ effect = 'none', isDark = true }) => {
    const canvasRef = useRef(null);
    const frameRef = useRef(0);

    useEffect(() => {
        const config = CONFIG[effect];
        if (!config) return undefined;

        /* Resolved once per theme change rather than per particle per frame. */
        const ink = config.ink ? (isDark ? config.ink.dark : config.ink.light) : '#ffffff';

        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const ctx = canvas.getContext('2d');
        let particles = [];
        let width = 0;
        let height = 0;
        let running = true;

        const resize = () => {
            /* Cap the device pixel ratio: on a 3x phone a full-screen canvas
               is nine times the pixels for no visible gain. */
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;

            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            /* Fewer particles on a narrow screen — the density should feel
               the same, not the raw count. */
            const scale = Math.min(1, width / 1200);
            const count = Math.max(8, Math.round(config.count * scale));

            particles = Array.from({ length: count }, () =>
                config.make(width, height, config.palette)
            );
        };

        const step = () => {
            if (!running) return;

            ctx.clearRect(0, 0, width, height);

            particles.forEach((p) => {
                p.wobble += 0.012;
                p.x += p.drift + Math.sin(p.wobble) * 0.4;
                p.y += p.speed;

                if (p.spin !== undefined) p.angle += p.spin;

                if (p.twinkle !== undefined) {
                    p.alpha += p.rising ? p.twinkle : -p.twinkle;
                    if (p.alpha <= 0.05) p.rising = true;
                    if (p.alpha >= 1) p.rising = false;
                }

                /* Wrap rather than respawn, so density never dips. */
                if (p.speed > 0 && p.y - p.r > height) {
                    p.y = -p.r;
                    p.x = Math.random() * width;
                } else if (p.speed < 0 && p.y + p.r < 0) {
                    p.y = height + p.r;
                    p.x = Math.random() * width;
                }

                if (p.x > width + 20) p.x = -20;
                if (p.x < -20) p.x = width + 20;

                config.draw(ctx, p, ink);
            });

            ctx.globalAlpha = 1;
            frameRef.current = requestAnimationFrame(step);
        };

        /* A hidden tab still fires rAF in some browsers; pausing saves a
           laptop battery when the shop is left open in a background tab. */
        const onVisibility = () => {
            if (document.hidden) {
                running = false;
                cancelAnimationFrame(frameRef.current);
            } else if (!running) {
                running = true;
                frameRef.current = requestAnimationFrame(step);
            }
        };

        resize();
        frameRef.current = requestAnimationFrame(step);

        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            running = false;
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [effect, isDark]);

    if (!CONFIG[effect]) return null;

    return <canvas ref={canvasRef} className="ss-effect" aria-hidden="true" />;
};

export default SeasonalEffect;

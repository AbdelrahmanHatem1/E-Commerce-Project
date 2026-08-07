import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { useOptionalLayout } from '../contexts/LayoutContext.jsx';
import { useCurrency } from '../contexts/CurrencyContext.jsx';
import { useAdmin } from '../contexts/AdminContext.jsx';
import { ThemeContext } from '../contexts/ThemeContext.jsx';
import LayoutRenderer from '../components/layout/LayoutRenderer.jsx';
import './CustomPage.css';

const API = 'https://dummyjson.com';

/* ----------------------------------------------------------------
   A page the admin built and gave a slug.

   Routed as /p/:slug rather than /:slug on purpose: a bare wildcard
   would let a page named "cart" or "products" shadow a real route and
   quietly break the store. The prefix keeps the two namespaces apart.
   ---------------------------------------------------------------- */
const CustomPage = () => {
    const { slug } = useParams();
    const { livePages, loading } = useOptionalLayout();
    const { format } = useCurrency();
    const { applyOverrides } = useAdmin();
    const { isDarkMode } = React.useContext(ThemeContext);

    const [products, setProducts] = useState([]);

    const page = useMemo(
        () => livePages.find((p) => p.slug === slug) || null,
        [livePages, slug]
    );

    /* Product rails need real data. Only fetched when the page actually
       contains one — most custom pages will not. */
    const needsProducts = useMemo(
        () => Boolean(page?.blocks?.some((b) => b.type === 'productRail')),
        [page]
    );

    useEffect(() => {
        if (!needsProducts) return undefined;

        let cancelled = false;
        const controller = new AbortController();

        axios
            .get(`${API}/products`, { params: { limit: 0 }, signal: controller.signal })
            .then(({ data }) => {
                if (!cancelled) setProducts(applyOverrides(data.products || [], 'store'));
            })
            .catch((error) => {
                const aborted =
                    axios.isCancel?.(error) ||
                    error.code === 'ERR_CANCELED' ||
                    error.name === 'CanceledError';
                if (!aborted) console.error('Failed to load products for a custom page:', error);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsProducts]);

    useEffect(() => {
        if (!page) return undefined;

        const previous = document.title;
        document.title = `${page.seo?.title?.trim() || page.name} · ShopStream`;

        /* Description is set here rather than in a head manager because
           the app has no SSR — a client-side write is all a crawler that
           executes JS will see either way. */
        let meta = document.querySelector('meta[name="description"]');
        const hadMeta = Boolean(meta);
        const previousDesc = meta?.getAttribute('content') || '';

        if (page.seo?.description?.trim()) {
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute('name', 'description');
                document.head.appendChild(meta);
            }
            meta.setAttribute('content', page.seo.description.trim());
        }

        return () => {
            document.title = previous;
            if (meta) {
                if (hadMeta) meta.setAttribute('content', previousDesc);
                else meta.remove();
            }
        };
    }, [page]);

    if (loading) {
        return (
            <main className="cp-page">
                <div className="cp-loading">
                    <span className="cp-spinner" aria-hidden="true" />
                    <p>Loading…</p>
                </div>
            </main>
        );
    }

    /* An unpublished, expired or deleted page has to read as a genuine
       404 rather than a blank screen. */
    if (!page) {
        return (
            <main className="cp-page">
                <div className="cp-missing">
                    <span className="cp-missing-icon" aria-hidden="true">
                        <i className="bi bi-signpost-split" />
                    </span>
                    <h1>Page not found</h1>
                    <p>
                        This page may have been unpublished, or its scheduled window has closed.
                    </p>
                    <div className="cp-missing-actions">
                        <Link to="/">Back to the store</Link>
                        <Link to="/products" className="is-ghost">
                            Browse products
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="cp-page">
            <LayoutRenderer
                blocks={page.blocks}
                isDark={isDarkMode}
                products={products}
                format={format}
            />
        </main>
    );
};

export default CustomPage;

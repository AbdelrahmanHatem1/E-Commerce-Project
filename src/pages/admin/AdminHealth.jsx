import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAdmin } from '../../contexts/AdminContext.jsx';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { useNotification } from '../../components/Notification.jsx';
import { RULES, SEVERITY, scanCatalogue, scoreBand } from './dataHealth.js';
import { ConfirmDialog } from './AdminModal.jsx';
import './AdminHealth.css';

const API = 'https://dummyjson.com';

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const AdminHealth = () => {
    const { applyOverrides, updateProduct } = useAdmin();
    const { format } = useCurrency();
    const { notify } = useNotification();

    const [raw, setRaw] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [openRule, setOpenRule] = useState(null);
    const [severityFilter, setSeverityFilter] = useState('all');
    const [fixingAll, setFixingAll] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const { data } = await axios.get(`${API}/products`, {
                    params: { limit: 0 },
                    signal: controller.signal,
                });
                if (!cancelled) setRaw(data.products || []);
            } catch (err) {
                const aborted =
                    axios.isCancel(err) || err.code === 'ERR_CANCELED' || err.name === 'CanceledError';
                if (!aborted && !cancelled) {
                    console.error('Health scan failed to load:', err);
                    setError('We could not load the catalogue to scan it.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [reloadKey]);

    /* Scan the merged catalogue, not the raw API response — a product an
       admin already fixed locally must stop being reported. */
    const products = useMemo(() => applyOverrides(raw), [raw, applyOverrides]);
    const report = useMemo(() => scanCatalogue(products), [products]);

    const band = scoreBand(report.score);

    const visibleRules = useMemo(
        () =>
            RULES.filter(
                (rule) =>
                    report.byRule[rule.id].length > 0 &&
                    (severityFilter === 'all' || rule.severity === severityFilter)
            ).sort(
                (a, b) =>
                    SEVERITY[b.severity].weight - SEVERITY[a.severity].weight ||
                    report.byRule[b.id].length - report.byRule[a.id].length
            ),
        [report, severityFilter]
    );

    /* --------------------------- fixing ---------------------------- */
    const applyFix = async (rule, product) => {
        const fix = rule.fix?.(product);
        if (!fix) return;

        setBusy(true);
        await updateProduct(product.id, fix.patch);
        setBusy(false);
    };

    const fixAll = async () => {
        const rule = fixingAll;
        const targets = report.byRule[rule.id];

        setBusy(true);

        /* Sequential: each write reads and rewrites the same localStorage
           key, so firing them in parallel would let later writes clobber
           earlier ones. */
        for (const product of targets) {
            const fix = rule.fix?.(product);
            // eslint-disable-next-line no-await-in-loop
            if (fix) await updateProduct(product.id, fix.patch);
        }

        setBusy(false);
        setFixingAll(null);
        notify.success(`Fixed ${targets.length} product${targets.length === 1 ? '' : 's'}.`);
    };

    const exportCsv = () => {
        const rows = [];

        RULES.forEach((rule) => {
            report.byRule[rule.id].forEach((product) => {
                rows.push([
                    product.id,
                    product.sku || '',
                    product.title,
                    product.category,
                    rule.label,
                    SEVERITY[rule.severity].label,
                    rule.detail(product),
                ]);
            });
        });

        if (!rows.length) {
            notify.success('Nothing to export', 'The catalogue is clean.');
            return;
        }

        const header = ['ID', 'SKU', 'Title', 'Category', 'Issue', 'Severity', 'Detail'];
        const csv = `\uFEFF${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `data-health-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify.success('Export ready', `${rows.length} findings written to CSV.`);
    };

    /* Circumference for the score ring: r = 52. */
    const ring = 2 * Math.PI * 52;

    return (
        <div className="dh-page">
            <header className="dh-header">
                <div>
                    <h1>Data Health</h1>
                    <p>Automated checks across every product in the catalogue.</p>
                </div>

                <div className="dh-header-tools">
                    <button type="button" className="dh-tool" onClick={exportCsv} disabled={loading}>
                        <i className="bi bi-download" aria-hidden="true" />
                        Export findings
                    </button>
                    <button
                        type="button"
                        className="dh-tool"
                        onClick={() => setReloadKey((k) => k + 1)}
                        disabled={loading}
                    >
                        <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                        Rescan
                    </button>
                </div>
            </header>

            {error ? (
                <div className="dh-error" role="alert">
                    <i className="bi bi-wifi-off" aria-hidden="true" />
                    <p>{error}</p>
                    <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
                        Retry
                    </button>
                </div>
            ) : loading ? (
                <div className="dh-loading">
                    <span className="dh-spinner" aria-hidden="true" />
                    <p>Scanning {raw.length || ''} products…</p>
                </div>
            ) : (
                <>
                    {/* --------------------------- score --------------------------- */}
                    <section className={`dh-score is-${band.tone}`}>
                        <div className="dh-ring-wrap">
                            <svg viewBox="0 0 120 120" className="dh-ring" role="img" aria-label={`Health score ${report.score} out of 100`}>
                                <circle cx="60" cy="60" r="52" className="dh-ring-track" />
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="52"
                                    className="dh-ring-fill"
                                    style={{
                                        strokeDasharray: ring,
                                        strokeDashoffset: ring - (ring * report.score) / 100,
                                    }}
                                />
                            </svg>
                            <div className="dh-ring-text">
                                <strong>{report.score}</strong>
                                <span>/ 100</span>
                            </div>
                        </div>

                        <div className="dh-score-body">
                            <span className={`dh-band is-${band.tone}`}>{band.label}</span>
                            <h2>
                                {report.issues.toLocaleString()} finding
                                {report.issues === 1 ? '' : 's'} across{' '}
                                {report.affected.toLocaleString()} product
                                {report.affected === 1 ? '' : 's'}
                            </h2>
                            <p>
                                Scanned {report.total.toLocaleString()} products against {RULES.length} rules.{' '}
                                {report.critical > 0 ? (
                                    <strong className="is-bad">
                                        {report.critical} critical issue{report.critical === 1 ? '' : 's'} block sales
                                        right now.
                                    </strong>
                                ) : (
                                    <strong className="is-ok">No critical issues.</strong>
                                )}
                            </p>

                            <div className="dh-legend">
                                {Object.entries(SEVERITY).map(([key, meta]) => {
                                    const count = RULES.filter((r) => r.severity === key).reduce(
                                        (sum, r) => sum + report.byRule[r.id].length,
                                        0
                                    );

                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`dh-legend-item is-${meta.tone} ${severityFilter === key ? 'is-on' : ''
                                                }`}
                                            onClick={() => setSeverityFilter(severityFilter === key ? 'all' : key)}
                                            aria-pressed={severityFilter === key}
                                        >
                                            <span className="dh-legend-dot" aria-hidden="true" />
                                            {meta.label}
                                            <strong>{count}</strong>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* --------------------------- findings ------------------------ */}
                    {visibleRules.length === 0 ? (
                        <div className="dh-clean">
                            <i className="bi bi-patch-check" aria-hidden="true" />
                            <p>
                                {severityFilter === 'all'
                                    ? 'Every check passed. The catalogue is clean.'
                                    : 'Nothing at this severity.'}
                            </p>
                            {severityFilter !== 'all' && (
                                <button type="button" onClick={() => setSeverityFilter('all')}>
                                    Show all findings
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="dh-rules">
                            {visibleRules.map((rule) => {
                                const hits = report.byRule[rule.id];
                                const isOpen = openRule === rule.id;
                                const fixable = Boolean(rule.fix);
                                const meta = SEVERITY[rule.severity];

                                return (
                                    <section className={`dh-rule is-${meta.tone}`} key={rule.id}>
                                        <header>
                                            <button
                                                type="button"
                                                className="dh-rule-toggle"
                                                onClick={() => setOpenRule(isOpen ? null : rule.id)}
                                                aria-expanded={isOpen}
                                            >
                                                <span className="dh-rule-icon" aria-hidden="true">
                                                    <i className={`bi ${rule.icon}`} />
                                                </span>

                                                <span className="dh-rule-text">
                                                    <strong>
                                                        {rule.label}
                                                        <span className={`dh-sev is-${meta.tone}`}>{meta.label}</span>
                                                    </strong>
                                                    <small>{rule.explain}</small>
                                                </span>

                                                <span className="dh-rule-count">{hits.length}</span>

                                                <i
                                                    className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'} dh-rule-chev`}
                                                    aria-hidden="true"
                                                />
                                            </button>

                                            {fixable && hits.length > 1 && (
                                                <button
                                                    type="button"
                                                    className="dh-fixall"
                                                    onClick={() => setFixingAll(rule)}
                                                    disabled={busy}
                                                >
                                                    <i className="bi bi-magic" aria-hidden="true" />
                                                    Fix all {hits.length}
                                                </button>
                                            )}
                                        </header>

                                        {isOpen && (
                                            <ul className="dh-hits">
                                                {hits.slice(0, 50).map((product) => {
                                                    const fix = rule.fix?.(product);

                                                    return (
                                                        <li key={product.id}>
                                                            <span className="dh-hit-thumb">
                                                                <img src={product.thumbnail} alt="" loading="lazy" />
                                                            </span>

                                                            <div className="dh-hit-info">
                                                                <Link to={`/product/${product.id}`}>{product.title}</Link>
                                                                <span>
                                                                    {product.sku || `#${product.id}`} · {rule.detail(product)}
                                                                </span>
                                                            </div>

                                                            <span className="dh-hit-price">{format(product.price)}</span>

                                                            <div className="dh-hit-actions">
                                                                {fix ? (
                                                                    <button
                                                                        type="button"
                                                                        className="dh-fix"
                                                                        onClick={() => applyFix(rule, product)}
                                                                        disabled={busy}
                                                                        title={fix.label}
                                                                    >
                                                                        <i className="bi bi-magic" aria-hidden="true" />
                                                                        {fix.label}
                                                                    </button>
                                                                ) : (
                                                                    <Link
                                                                        to={`/admin/inventory?q=${encodeURIComponent(product.title)}`}
                                                                        className="dh-edit"
                                                                    >
                                                                        <i className="bi bi-pencil" aria-hidden="true" />
                                                                        Edit
                                                                    </Link>
                                                                )}
                                                            </div>
                                                        </li>
                                                    );
                                                })}

                                                {hits.length > 50 && (
                                                    <li className="dh-hits-more">
                                                        +{hits.length - 50} more — use Export findings for the full list.
                                                    </li>
                                                )}
                                            </ul>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ------------------------- bulk confirmation ------------------- */}
            <ConfirmDialog
                open={Boolean(fixingAll)}
                onClose={() => setFixingAll(null)}
                onConfirm={fixAll}
                busy={busy}
                title={`Fix all ${fixingAll ? report.byRule[fixingAll.id].length : 0} products?`}
                message={
                    fixingAll
                        ? `Every affected product will be updated: ${fixingAll.explain}`
                        : ''
                }
                confirmLabel="Apply all fixes"
                cancelLabel="Review individually"
                footnote="Stored on this device — reversible from Reset"
            >
                {fixingAll && (
                    <ul className="dh-preview">
                        {report.byRule[fixingAll.id].slice(0, 4).map((product) => {
                            const fix = fixingAll.fix?.(product);
                            return (
                                <li key={product.id}>
                                    <strong>{product.title}</strong>
                                    <span>{fix?.label}</span>
                                </li>
                            );
                        })}
                        {report.byRule[fixingAll.id].length > 4 && (
                            <li className="is-more">
                                +{report.byRule[fixingAll.id].length - 4} more
                            </li>
                        )}
                    </ul>
                )}
            </ConfirmDialog>
        </div>
    );
};

export default AdminHealth;

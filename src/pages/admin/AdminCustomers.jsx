import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { cartStatus } from '../../contexts/AdminContext.jsx';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { useNotification } from '../../components/Notification.jsx';
import AdminModal, { ConfirmDialog } from './AdminModal.jsx';
import AdminPager from './AdminPager.jsx';
import './AdminCustomers.css';
import { writeJson } from '../../lib/storage.js';

const API = 'https://dummyjson.com';
const USER_OVERRIDES_KEY = 'shopstream_admin_users';

const ROLES = ['admin', 'moderator', 'user'];

/* The API has no join date, so one is derived from the id. Sequential
   ids mean an older account genuinely shows an earlier date. */
const joinedOn = (id) => {
    const base = new Date('2023-01-01').getTime();
    return new Date(base + (id % 900) * 86_400_000);
};

const readOverrides = () => {
    try {
        const raw = localStorage.getItem(USER_OVERRIDES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.error('Failed to read user overrides:', error);
        return {};
    }
};

const AdminCustomers = () => {
    const { format } = useCurrency();
    const { notify } = useNotification();
    const [searchParams, setSearchParams] = useSearchParams();

    const [users, setUsers] = useState([]);
    const [carts, setCarts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    /* Writes are simulated by the API, so they live here too. */
    const [overrides, setOverrides] = useState(() => readOverrides());
    const [localUsers, setLocalUsers] = useState([]);
    const [removed, setRemoved] = useState([]);

    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);
    const [confirming, setConfirming] = useState(null);
    const [busy, setBusy] = useState(false);

    const emptyDraft = { firstName: '', lastName: '', username: '', email: '', role: 'user', password: '' };
    const [draft, setDraft] = useState(emptyDraft);

    const focused = searchParams.get('user');

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const [userRes, cartRes] = await Promise.all([
                    axios.get(`${API}/users`, {
                        params: { limit: 0, select: 'firstName,lastName,email,image,role,phone,address,company' },
                        signal: controller.signal,
                    }),
                    axios.get(`${API}/carts`, { params: { limit: 0 }, signal: controller.signal }),
                ]);

                if (cancelled) return;
                setUsers(userRes.data.users || []);
                setCarts(cartRes.data.carts || []);
            } catch (err) {
                const aborted =
                    axios.isCancel(err) || err.code === 'ERR_CANCELED' || err.name === 'CanceledError';
                if (!aborted && !cancelled) {
                    console.error('Customers load failed:', err);
                    setError('We could not load customers right now.');
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

    /* Spend and cart counts come from the cart list, not a fake number. */
    const enriched = useMemo(() => {
        const byUser = {};

        carts.forEach((cart) => {
            const entry = byUser[cart.userId] || { count: 0, spend: 0, completed: 0 };
            entry.count += 1;
            entry.spend += cart.discountedTotal ?? cart.total ?? 0;
            if (cartStatus(cart).tone === 'done') entry.completed += 1;
            byUser[cart.userId] = entry;
        });

        const gone = new Set(removed);

        return [...localUsers, ...users]
            .filter((user) => !gone.has(user.id))
            .map((user) => ({
                ...user,
                ...(overrides[user.id] || {}),
                carts: byUser[user.id]?.count ?? 0,
                spend: byUser[user.id]?.spend ?? 0,
                completed: byUser[user.id]?.completed ?? 0,
                joined: joinedOn(typeof user.id === 'number' ? user.id : 1),
                active: (overrides[user.id]?.active ?? user.active) !== false,
            }));
    }, [users, carts, overrides, localUsers, removed]);

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();

        let list = enriched.filter((user) => {
            if (roleFilter !== 'all' && user.role !== roleFilter) return false;
            if (!term) return true;
            return (
                `${user.firstName} ${user.lastName}`.toLowerCase().includes(term) ||
                (user.email || '').toLowerCase().includes(term)
            );
        });

        /* A row linked from the orders table jumps to the top. */
        if (focused) {
            list = [...list].sort((a, b) =>
                String(a.id) === focused ? -1 : String(b.id) === focused ? 1 : 0
            );
        }

        return list;
    }, [enriched, query, roleFilter, focused]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    useEffect(() => setPage(1), [query, roleFilter]);

    const persistOverrides = (next) => {
        setOverrides(next);
        writeJson(USER_OVERRIDES_KEY, next);
    };

    const saveUser = async () => {
        if (!editing.firstName.trim() || !editing.email.trim()) {
            notify.error('Missing details', 'A name and an email address are required.');
            return;
        }

        setBusy(true);

        persistOverrides({
            ...overrides,
            [editing.id]: {
                firstName: editing.firstName,
                lastName: editing.lastName,
                username: editing.username,
                email: editing.email,
                role: editing.role,
                active: editing.active,
            },
        });

        try {
            await axios.put(`${API}/users/${editing.id}`, {
                firstName: editing.firstName,
                lastName: editing.lastName,
                email: editing.email,
            });
            notify.success(`${editing.firstName}'s profile was updated.`);
        } catch (error) {
            console.error('User update failed:', error);
            notify.warning('Saved locally — the demo API did not confirm the change.');
        }

        setBusy(false);
        setEditing(null);
    };

    const submitDraft = async (event) => {
        event.preventDefault();

        if (!draft.firstName.trim() || !draft.email.trim()) {
            notify.error('Missing details', 'A full name and an email address are required.');
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
            notify.error('Invalid email', 'Enter a valid email address.');
            return;
        }

        setBusy(true);

        const created = {
            id: `local-${Date.now()}`,
            firstName: draft.firstName,
            lastName: draft.lastName,
            username: draft.username || draft.firstName.toLowerCase(),
            email: draft.email,
            role: draft.role,
            image: '',
            active: true,
            isLocal: true,
        };

        setLocalUsers((prev) => [created, ...prev]);

        try {
            await axios.post(`${API}/users/add`, {
                firstName: created.firstName,
                lastName: created.lastName,
                email: created.email,
            });
        } catch (error) {
            console.error('User create failed:', error);
        }

        notify.success(`${created.firstName} was added. A verification email would be sent.`);
        setBusy(false);
        setDraft(emptyDraft);
        setCreating(false);
    };

    const confirmDelete = async () => {
        setBusy(true);
        setRemoved((prev) => [...prev, confirming.id]);

        if (!String(confirming.id).startsWith('local-')) {
            try {
                await axios.delete(`${API}/users/${confirming.id}`);
            } catch (error) {
                console.error('User delete failed:', error);
            }
        }

        notify.info(`${confirming.firstName} was removed. API keys would be revoked.`);
        setBusy(false);
        setConfirming(null);
    };

    const summary = useMemo(() => {
        const spenders = enriched.filter((user) => user.spend > 0);
        return {
            total: enriched.length,
            active: spenders.length,
            admins: enriched.filter((user) => user.role === 'admin').length,
            avgSpend: spenders.length
                ? spenders.reduce((sum, user) => sum + user.spend, 0) / spenders.length
                : 0,
        };
    }, [enriched]);

    return (
        <div className="cu-page">
            <header className="cu-header">
                <div>
                    <h1>User Directory</h1>
                    <nav className="cu-crumbs" aria-label="Breadcrumb">
                        <span>Home</span>
                        <i className="bi bi-chevron-right" aria-hidden="true" />
                        <span>Users</span>
                        <i className="bi bi-chevron-right" aria-hidden="true" />
                        <strong>Directory</strong>
                    </nav>
                </div>

                <div className="cu-tools">
                    <div className="cu-search">
                        <i className="bi bi-search" aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search customers..."
                            aria-label="Search customers"
                        />
                    </div>

                    <select
                        value={roleFilter}
                        onChange={(event) => setRoleFilter(event.target.value)}
                        aria-label="Filter by role"
                    >
                        <option value="all">All roles</option>
                        <option value="admin">Admin</option>
                        <option value="moderator">Moderator</option>
                        <option value="user">User</option>
                    </select>

                    <button type="button" className="cu-add" onClick={() => setCreating(true)}>
                        <i className="bi bi-person-plus" aria-hidden="true" />
                        Add New User
                    </button>
                </div>
            </header>

            <div className="cu-summary">
                {[
                    { label: 'Total', value: summary.total.toLocaleString(), icon: 'bi-people', tone: 'violet' },
                    { label: 'With orders', value: summary.active.toLocaleString(), icon: 'bi-bag-check', tone: 'green' },
                    { label: 'Admins', value: summary.admins, icon: 'bi-shield-check', tone: 'amber' },
                    { label: 'Avg. spend', value: format(summary.avgSpend), icon: 'bi-cash', tone: 'blue' },
                ].map((card) => (
                    <article className="cu-summary-card" key={card.label}>
                        <span className={`cu-summary-icon is-${card.tone}`} aria-hidden="true">
                            <i className={`bi ${card.icon}`} />
                        </span>
                        <div>
                            <span>{card.label}</span>
                            <strong>{card.value}</strong>
                        </div>
                    </article>
                ))}
            </div>

            <section className="cu-card">
                {error ? (
                    <div className="cu-empty" role="alert">
                        <i className="bi bi-wifi-off" aria-hidden="true" />
                        <p>{error}</p>
                        <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
                            Retry
                        </button>
                    </div>
                ) : loading ? (
                    <div className="cu-skeletons">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <span className="cu-skeleton" key={i} />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="cu-empty">
                        <i className="bi bi-search" aria-hidden="true" />
                        <p>No customers match.</p>
                    </div>
                ) : (
                    <div className="cu-table-wrap">
                        <table className="cu-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Email address</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Spend</th>
                                    <th aria-label="Actions" />
                                </tr>
                            </thead>

                            <tbody>
                                {rows.map((user) => (
                                    <tr key={user.id} className={String(user.id) === focused ? 'is-focused' : ''}>
                                        <td>
                                            <div className="cu-user">
                                                <span className="cu-avatar">
                                                    {user.image ? (
                                                        <img src={user.image} alt="" loading="lazy" />
                                                    ) : (
                                                        user.firstName.charAt(0)
                                                    )}
                                                </span>
                                                <div>
                                                    <strong>
                                                        {user.firstName} {user.lastName}
                                                    </strong>
                                                    <span>
                                                        Joined{' '}
                                                        {user.joined.toLocaleDateString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            year: 'numeric',
                                                        })}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="cu-email" data-label="Email">{user.email}</td>

                                        <td data-label="Role">
                                            <span className={`cu-role is-${user.role}`}>{user.role}</span>
                                        </td>

                                        <td data-label="Status">
                                            <span className={`cu-state ${user.active ? 'is-active' : 'is-inactive'}`}>
                                                <span className="cu-state-dot" aria-hidden="true" />
                                                {user.active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>

                                        <td data-label="Spend">
                                            <strong className="cu-spend">{format(user.spend)}</strong>
                                        </td>

                                        <td className="cu-actions">
                                            <div className="cu-actions-inner">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setEditing({
                                                            id: user.id,
                                                            firstName: user.firstName,
                                                            lastName: user.lastName,
                                                            username: user.username || '',
                                                            email: user.email,
                                                            role: user.role,
                                                            active: user.active,
                                                            image: user.image,
                                                        })
                                                    }
                                                    title="Edit user"
                                                >
                                                    <i className="bi bi-pencil" aria-hidden="true" />
                                                </button>

                                                <button
                                                    type="button"
                                                    className="is-danger"
                                                    onClick={() => setConfirming(user)}
                                                    title="Delete user"
                                                >
                                                    <i className="bi bi-trash3" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && rows.length > 0 && (
                    <AdminPager
                        page={safePage}
                        totalPages={totalPages}
                        totalItems={filtered.length}
                        pageSize={pageSize}
                        onPage={setPage}
                        onPageSize={setPageSize}
                        label="users"
                    />
                )}
            </section>

            {/* -------------------------- add user --------------------------- */}
            <AdminModal
                open={creating}
                onClose={() => setCreating(false)}
                title="Add New User"
                subtitle="Create a new account for your store management team."
                icon="bi-person-plus"
                footer={
                    <>
                        <button type="button" className="am-btn is-plain" onClick={() => setCreating(false)}>
                            Cancel
                        </button>
                        <button type="submit" form="cu-create-form" className="am-btn" disabled={busy}>
                            {busy ? (
                                <>
                                    <span className="am-spinner" aria-hidden="true" />
                                    Creating…
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-person-plus" aria-hidden="true" />
                                    Create User
                                </>
                            )}
                        </button>
                    </>
                }
            >
                <form id="cu-create-form" onSubmit={submitDraft} noValidate>
                    <div className="am-grid">
                        <div className="am-field">
                            <label htmlFor="nu-first">Full Name</label>
                            <input
                                id="nu-first"
                                value={draft.firstName}
                                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                                placeholder="Johnathan"
                            />
                        </div>

                        <div className="am-field">
                            <label htmlFor="nu-last">Last Name</label>
                            <input
                                id="nu-last"
                                value={draft.lastName}
                                onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                                placeholder="Doe"
                            />
                        </div>

                        <div className="am-field">
                            <label htmlFor="nu-username">Username</label>
                            <input
                                id="nu-username"
                                value={draft.username}
                                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                                placeholder="@johndoe"
                            />
                        </div>

                        <div className="am-field">
                            <label htmlFor="nu-role">Role</label>
                            <select
                                id="nu-role"
                                value={draft.role}
                                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                            >
                                {ROLES.map((role) => (
                                    <option key={role} value={role}>
                                        {role}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="am-field is-full">
                            <label htmlFor="nu-email">Email Address</label>
                            <input
                                id="nu-email"
                                type="email"
                                value={draft.email}
                                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                                placeholder="john@shopstream.com"
                            />
                        </div>

                        <div className="am-field is-full">
                            <label htmlFor="nu-pass">Temporary password</label>
                            <input
                                id="nu-pass"
                                type="password"
                                value={draft.password}
                                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <div className="am-notice is-info">
                        <i className="bi bi-info-circle" aria-hidden="true" />
                        A verification email would be sent automatically so the new user can set up
                        multi-factor authentication.
                    </div>
                </form>
            </AdminModal>

            {/* -------------------------- edit user -------------------------- */}
            <AdminModal
                open={Boolean(editing)}
                onClose={() => setEditing(null)}
                title="Edit User"
                subtitle={editing ? `Update ${editing.firstName}'s profile details` : ''}
                icon="bi-person-gear"
                footer={
                    <>
                        <button type="button" className="am-btn is-plain" onClick={() => setEditing(null)}>
                            Cancel
                        </button>
                        <button type="button" className="am-btn" onClick={saveUser} disabled={busy}>
                            {busy ? (
                                <>
                                    <span className="am-spinner" aria-hidden="true" />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-save" aria-hidden="true" />
                                    Update User
                                </>
                            )}
                        </button>
                    </>
                }
            >
                {editing && (
                    <>
                        <div className="cu-edit-avatar">
                            <span className="cu-edit-photo">
                                {editing.image ? (
                                    <img src={editing.image} alt="" />
                                ) : (
                                    editing.firstName.charAt(0)
                                )}
                            </span>

                            <div>
                                <strong>Profile picture</strong>
                                <small>Served by the accounts API</small>
                            </div>
                        </div>

                        <div className="am-grid">
                            <div className="am-field">
                                <label htmlFor="eu-first">First name</label>
                                <input
                                    id="eu-first"
                                    value={editing.firstName}
                                    onChange={(e) => setEditing({ ...editing, firstName: e.target.value })}
                                />
                            </div>

                            <div className="am-field">
                                <label htmlFor="eu-last">Last name</label>
                                <input
                                    id="eu-last"
                                    value={editing.lastName}
                                    onChange={(e) => setEditing({ ...editing, lastName: e.target.value })}
                                />
                            </div>

                            <div className="am-field">
                                <label htmlFor="eu-username">Username</label>
                                <input
                                    id="eu-username"
                                    value={editing.username}
                                    onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                                />
                            </div>

                            <div className="am-field">
                                <label htmlFor="eu-role">Role</label>
                                <select
                                    id="eu-role"
                                    value={editing.role}
                                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                                >
                                    {ROLES.map((role) => (
                                        <option key={role} value={role}>
                                            {role}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="am-field is-full">
                                <label htmlFor="eu-email">Email address</label>
                                <input
                                    id="eu-email"
                                    type="email"
                                    value={editing.email}
                                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                                />
                            </div>

                            <div className="am-field is-full">
                                <div className="am-toggle-row">
                                    <div>
                                        <strong>Account status</strong>
                                        <small>{editing.active ? 'Active — can sign in' : 'Inactive — sign-in blocked'}</small>
                                    </div>
                                    <button
                                        type="button"
                                        className={`am-switch is-green ${editing.active ? 'is-on' : ''}`}
                                        onClick={() => setEditing({ ...editing, active: !editing.active })}
                                        role="switch"
                                        aria-checked={editing.active}
                                        aria-label="Account status"
                                    >
                                        <span />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="am-notice is-info">
                            <i className="bi bi-info-circle" aria-hidden="true" />
                            Changing a role affects access to store departments and financial reports. Make sure
                            this follows your security policy.
                        </div>
                    </>
                )}
            </AdminModal>

            {/* ------------------------- delete user ------------------------- */}
            <ConfirmDialog
                open={Boolean(confirming)}
                onClose={() => setConfirming(null)}
                onConfirm={confirmDelete}
                busy={busy}
                title="Delete User Account?"
                message="This action cannot be undone. All data associated with this user will be permanently removed from the ShopStream systems."
                confirmLabel="Delete User"
                cancelLabel="Go Back"
                footnote="Deleting a user also revokes all API access keys"
            >
                {confirming && (
                    <div className="am-preview">
                        <span className="am-preview-thumb is-round">
                            {confirming.image ? (
                                <img src={confirming.image} alt="" />
                            ) : (
                                confirming.firstName.charAt(0)
                            )}
                        </span>

                        <span className="am-preview-info">
                            <strong>
                                {confirming.firstName} {confirming.lastName}
                            </strong>
                            <span className="am-preview-meta">{confirming.email}</span>
                            <span className="am-preview-role">
                                <i className="bi bi-shield-check" aria-hidden="true" />
                                {confirming.role}
                            </span>
                        </span>
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
};

export default AdminCustomers;

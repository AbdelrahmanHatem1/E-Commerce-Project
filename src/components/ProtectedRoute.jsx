import React, { useContext, useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext.jsx';
import { useNotification } from './Notification.jsx';
import './ProtectedRoute.css';

/* ----------------------------------------------------------------
   ProtectedRoute
   ----------------------------------------------------------------
   Solves the auth race condition once, for every private page.

   AuthContext restores the session inside a useEffect, so on the very
   first render `user` is still null even for a signed-in visitor.
   Any page that checked `!user` immediately used to bounce that
   visitor to /login on every refresh. This component waits for
   `loading` to finish before deciding.

   It also remembers where the visitor was heading, so Login can send
   them straight back after a successful sign-in.
   ---------------------------------------------------------------- */
const ProtectedRoute = ({ redirectTo = '/login' }) => {
    const { user, loading } = useContext(AuthContext);
    const { notify } = useNotification();
    const location = useLocation();

    /* StrictMode mounts effects twice in development — this keeps the
       "please sign in" notification from appearing two times. */
    const warnedRef = useRef(false);

    useEffect(() => {
        if (loading) return;
        if (user) return;
        if (warnedRef.current) return;

        warnedRef.current = true;
        notify.warning('Please sign in to continue.');
    }, [loading, user, notify]);

    /* 1) Session is still being restored — show a skeleton, decide nothing. */
    if (loading) {
        return (
            <div className="route-loading" role="status" aria-live="polite">
                <span className="route-loading-spinner" aria-hidden="true" />
                <p>Checking your session…</p>
            </div>
        );
    }

    /* 2) Definitely signed out — redirect and remember the target. */
    if (!user) {
        return <Navigate to={redirectTo} replace state={{ from: location }} />;
    }

    /* 3) Signed in — render the private page. */
    return <Outlet />;
};

/* ----------------------------------------------------------------
   GuestRoute — the mirror image, for /login and /register.
   A signed-in visitor should never see the login form again.
   ---------------------------------------------------------------- */
export const GuestRoute = ({ redirectTo = '/' }) => {
    const { user, loading } = useContext(AuthContext);

    if (loading) {
        return (
            <div className="route-loading" role="status" aria-live="polite">
                <span className="route-loading-spinner" aria-hidden="true" />
                <p>Checking your session…</p>
            </div>
        );
    }

    if (user) {
        return <Navigate to={redirectTo} replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;

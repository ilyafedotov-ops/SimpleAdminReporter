# Clear Stale Logout Marker on Cookie Login

## Problem

Cookie-auth logout stores an `auth:logout` marker in `localStorage` so other
tabs can react to the logout. A later successful cookie-only login restores the
user in `sessionStorage`, but leaves that marker behind. Because cookie sessions
normally do not store `localStorage.user` or `localStorage.accessToken`, the next
auth-state initialization treats the stale marker as a current cross-tab logout
and clears the newly authenticated session.

## Design

After `/auth/login` returns a successful response with auth data, the cookie auth
service will remove `auth:logout` before persisting the newly authenticated user.
A successful login establishes a newer authentication state, so any previously
persisted logout signal is no longer applicable.

The existing logout flow and storage-event listener will remain unchanged. A
logout will continue to write the marker and notify other tabs. Failed login
responses will not clear it.

## Testing

Add a focused unit regression test that:

1. Seeds `localStorage.auth:logout` without legacy user or token data.
2. Completes a successful cookie-only login.
3. Confirms the marker is removed.
4. Reads the current auth state and confirms the logged-in user remains
   authenticated.

Run the focused test first to observe the failure, then apply the production
change and rerun it. Finally, run the relevant frontend unit tests and type
checking.

## Scope

Only the successful login path changes. Other server responses that may restore
user data (`verify`, refresh, and profile requests) are outside this focused fix.

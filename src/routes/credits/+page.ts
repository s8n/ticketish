// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

// The app itself is client-side only, but this page is a static document with
// attribution on it, and attribution that needs JavaScript to appear is worse
// attribution. Rendering it at build time puts the notices in the HTML.
export const ssr = true;

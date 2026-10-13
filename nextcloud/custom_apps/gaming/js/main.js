/**
 * Deeplinks: keeps the Nextcloud URL (/apps/gaming/<path>) in sync with the
 * page shown in the games iframe, so reloading or sharing the URL reopens the
 * same game. The games app posts { type: 'gaming:navigate', path, search } on
 * every navigation (app/hooks/useNextcloudFrameSync.ts in the games repo).
 */
(function () {
	'use strict'

	const MESSAGE_TYPE = 'gaming:navigate'
	const SAFE_PATH = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/

	function init() {
		const container = document.getElementById('gaming-app')
		const frame = document.getElementById('gaming-frame')
		if (!container || !frame) {
			return
		}

		const appBase = container.dataset.appBase
		const gamesOrigin = new URL(frame.src).origin

		window.addEventListener('message', function (event) {
			// Only trust our own iframe showing the games app.
			if (event.origin !== gamesOrigin || event.source !== frame.contentWindow) {
				return
			}
			const data = event.data
			if (!data || data.type !== MESSAGE_TYPE || typeof data.path !== 'string') {
				return
			}

			const path = data.path.replace(/^\/+|\/+$/g, '')
			if (path !== '' && !SAFE_PATH.test(path)) {
				return
			}
			const search = typeof data.search === 'string' && data.search.startsWith('?') ? data.search : ''

			// replaceState, not pushState: the iframe navigation already added
			// its own history entry, so Back keeps working inside the games.
			const url = appBase + path + search
			if (url !== window.location.pathname + window.location.search) {
				window.history.replaceState(window.history.state, '', url)
			}
		})
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init)
	} else {
		init()
	}
})()

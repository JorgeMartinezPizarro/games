<?php

namespace OCA\Gaming\Service;

use OCA\Gaming\AppInfo\Application;
use OCP\IAppConfig;
use OCP\IURLGenerator;

/**
 * URLs between Nextcloud and the games web app.
 *
 * A deeplink path is a route of the games app without its base path, e.g.
 * "pages/games/tetris": Nextcloud shows it as /apps/gaming/pages/games/tetris
 * and the iframe loads <games_url>/pages/games/tetris.
 */
class GamesUrlService {
	public const CONFIG_GAMES_URL = 'games_url';

	public function __construct(
		private IAppConfig $appConfig,
		private IURLGenerator $urlGenerator,
	) {
	}

	/**
	 * Configured base URL of the games app (e.g. https://games.example.com/bookmarks)
	 * without trailing slash, or null when it is missing or not an http(s) URL.
	 */
	public function getGamesUrl(): ?string {
		$url = rtrim(trim($this->appConfig->getValueString(Application::APP_ID, self::CONFIG_GAMES_URL)), '/');
		$scheme = parse_url($url, PHP_URL_SCHEME);
		$host = parse_url($url, PHP_URL_HOST);
		if (!in_array($scheme, ['http', 'https'], true) || !is_string($host) || $host === '') {
			return null;
		}
		return $url;
	}

	public function getGamesOrigin(string $gamesUrl): string {
		$parts = parse_url($gamesUrl);
		$port = isset($parts['port']) ? ':' . $parts['port'] : '';
		return $parts['scheme'] . '://' . $parts['host'] . $port;
	}

	/**
	 * Path without leading/trailing slashes, or '' when it is empty or anything
	 * other than plain segments (no "..", no encoded characters, no scheme).
	 */
	public static function normalizePath(mixed $path): string {
		if (!is_string($path)) {
			return '';
		}
		$path = trim($path, '/');
		return preg_match('#^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$#', $path) === 1 ? $path : '';
	}

	public function getFrameUrl(string $gamesUrl, string $path, string $query = ''): string {
		$path = self::normalizePath($path);
		$url = $path === '' ? $gamesUrl : $gamesUrl . '/' . $path;
		return $query === '' ? $url : $url . '?' . $query;
	}

	/**
	 * Relative Nextcloud URL of the app root, always ending with '/'.
	 */
	public function getAppBase(): string {
		return rtrim($this->urlGenerator->linkToRoute('gaming.page.index'), '/') . '/';
	}

	/**
	 * Absolute Nextcloud URL that opens $path of the games app inside Nextcloud.
	 */
	public function getAppLink(mixed $path): string {
		return $this->urlGenerator->getAbsoluteURL($this->getAppBase() . self::normalizePath($path));
	}
}

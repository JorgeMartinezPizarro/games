<?php

namespace OCA\Gaming\Controller;

use OCA\Gaming\AppInfo\Application;
use OCA\Gaming\Service\GamesUrlService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\Util;

class PageController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private GamesUrlService $games,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * Shows the games app in an iframe. Any path below the app root is a
	 * deeplink to the same path of the games app, query string included.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(string $path = ''): TemplateResponse {
		$gamesUrl = $this->games->getGamesUrl();
		if ($gamesUrl === null) {
			return new TemplateResponse(Application::APP_ID, 'unconfigured');
		}

		Util::addStyle(Application::APP_ID, 'main');
		Util::addScript(Application::APP_ID, 'main');

		$response = new TemplateResponse(Application::APP_ID, 'main', [
			'frameUrl' => $this->games->getFrameUrl($gamesUrl, $path, $this->getQueryString()),
			'appBase' => $this->games->getAppBase(),
		]);

		$csp = new ContentSecurityPolicy();
		$csp->addAllowedFrameDomain($this->games->getGamesOrigin($gamesUrl));
		$response->setContentSecurityPolicy($csp);

		return $response;
	}

	private function getQueryString(): string {
		$query = parse_url($this->request->getRequestUri(), PHP_URL_QUERY);
		if (!is_string($query) || $query === '') {
			return '';
		}
		parse_str($query, $params);
		return http_build_query($params, '', '&', PHP_QUERY_RFC3986);
	}
}

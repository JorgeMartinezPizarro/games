<?php

namespace OCA\Gaming\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;

class PageController extends Controller {
    public function __construct(string $AppName, IRequest $request) {
        parent::__construct($AppName, $request);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): TemplateResponse {
        $response = new TemplateResponse('gaming', 'main');

        // Permitir el iframe externo
        $csp = new \OCP\AppFramework\Http\ContentSecurityPolicy();
        $csp->addAllowedFrameDomain('https://games.ideniox.com');
        $response->setContentSecurityPolicy($csp);

        return $response;
    }
}
<?php

namespace OCA\HelloWorld\Controller;

use OCP\AppFramework\Controller;
use OCP\IRequest;
use OCP\AppFramework\Http\TemplateResponse;

class PageController extends Controller {
    public function __construct(IRequest $request) {
        parent::__construct('helloworld', $request);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index() {
        return new TemplateResponse('helloworld', 'main');
    }
}

<?php

namespace OCA\Gaming\Controller;

use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Activity\IManager;

class ScoreController extends OCSController {

    public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private IManager $activityManager,
	) {
		parent::__construct($appName, $request);
	}

    /**
     * @NoAdminRequired
     */
    public function publish(): DataResponse {

		error_log("Gaming ScoreController::publish");

		$user = $this->userSession->getUser();

        if ($user === null) {
            return new DataResponse([
                'success' => false,
                'error' => 'Not authenticated'
            ], 401);
        }

        $body = json_decode($this->request->getContent(), true);

		$event->setApp('gaming')
			->setType('score')
			->setAuthor($user->getUID())
			->setAffectedUser($user->getUID())
			->setSubject('score_saved', [
				'game' => $body['game'],
				'score' => $body['score'],
			]);

		$this->activityManager->publish($event);
        return new DataResponse([
            'success' => true,
            'user' => $user->getUID(),
            'body' => $body,
        ]);
    }
}